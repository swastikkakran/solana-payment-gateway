import { Connection, PublicKey } from "@solana/web3.js";
import { paymentModel } from "../models/payment-request.model.js";

const connection = new Connection(process.env.SOLANA_RPC_URL, "confirmed");

const verifyTransaction = async function (signature, merchant) {

    const tx = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0
    });

    if (!tx || tx.meta.err) {
        return { verified: false, reason: "Transaction failed or not found" };
    }

    const accountKeys = tx.transaction.message.accountKeys.map(k => k.toBase58());

    const payment = await paymentModel.findOne({
        merchant: merchant._id,
        status: "pending",
        reference: { $in: accountKeys }
    });

    if (!payment) {
        return { verified: false, reason: "No matching pending payment found" };
    }

    const recipientIndex = accountKeys.indexOf(merchant.payoutWallet);
    if (recipientIndex === -1) {
        return { verified: false, payment, reason: "Recipient not found in transaction" };
    }

    let amountReceived;
    let payerWallet;

    if (payment.currency === "SOL") {
        const preBalance = tx.meta.preBalances[recipientIndex];
        const postBalance = tx.meta.postBalances[recipientIndex];
        amountReceived = (postBalance - preBalance) / 1e9;

        const senderIndex = tx.meta.preBalances.findIndex(
            (bal, i) => bal > tx.meta.postBalances[i] && i !== recipientIndex
        );
        payerWallet = accountKeys[senderIndex];
    } else {
        const preTokenBalance = tx.meta.preTokenBalances.find(
            b => accountKeys[b.accountIndex] === merchant.payoutWallet
        );
        const postTokenBalance = tx.meta.postTokenBalances.find(
            b => accountKeys[b.accountIndex] === merchant.payoutWallet
        );

        if (!preTokenBalance || !postTokenBalance) {
            return { verified: false, payment, reason: "Token balance entries not found" };
        }

        amountReceived = postTokenBalance.uiTokenAmount.uiAmount - preTokenBalance.uiTokenAmount.uiAmount;

        const senderTokenBalance = tx.meta.preTokenBalances.find(
            b => b.mint === preTokenBalance.mint && accountKeys[b.accountIndex] !== merchant.payoutWallet
        );
        payerWallet = senderTokenBalance ? accountKeys[senderTokenBalance.accountIndex] : null;
    }

    if (amountReceived !== payment.amount) {
        return { verified: false, payment, reason: "Amount mismatch" };
    }

    return { verified: true, payment, payerWallet, transactionSignature: signature };
};


const reconcilePendingPayments = async function (merchant) {

    const recipientPubkey = new PublicKey(merchant.payoutWallet);
    const signatures = await connection.getSignaturesForAddress(recipientPubkey, { limit: 50 });

    for (const sigInfo of signatures) {
        const result = await verifyTransaction(sigInfo.signature, merchant);

        if (result.verified) {
            result.payment.status = "confirmed";
            result.payment.transactionSignature = result.transactionSignature;
            result.payment.payerWallet = result.payerWallet;
            result.payment.confirmedAt = new Date();
            await result.payment.save();
        }
        // if not verified, either it's an unrelated tx (no matching payment)
        // or a real mismatch — either way, nothing to update, just move on
    }

    // separately sweep anything that's simply timed out with no tx ever found
    await paymentModel.updateMany(
        { merchant: merchant._id, status: "pending", expiresAt: { $lte: new Date() } },
        { status: "expired" }
    );
};

export { verifyTransaction, reconcilePendingPayments };