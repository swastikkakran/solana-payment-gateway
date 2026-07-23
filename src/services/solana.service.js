import { Connection, PublicKey } from "@solana/web3.js";
import { paymentModel } from "../models/payment-request.model.js";

const connection = new Connection(process.env.SOLANA_RPC_URL, "confirmed");

const verifyTransaction = async function (signature, payment) {

    const tx = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0
    });

    if (!tx || tx.meta.err) {
        return { verified: false, reason: "Transaction failed or not found" };
    }

    const accountKeys = tx.transaction.message.accountKeys.map(k => k.toBase58());

    const referenceIncluded = accountKeys.includes(payment.reference);
    if (!referenceIncluded) {
        return { verified: false, reason: "Reference not found in transaction" };
    }

    const recipientIndex = accountKeys.indexOf(payment.payoutWallet);
    if (recipientIndex === -1) {
        return { verified: false, reason: "Recipient not found in transaction" };
    }

    let amountReceived;
    let payerWallet;

    if (payment.currency === "SOL") {
        const preBalance = tx.meta.preBalances[recipientIndex];
        const postBalance = tx.meta.postBalances[recipientIndex];
        amountReceived = (postBalance - preBalance) / 1e9; // lamports -> SOL

        // sender = first account key that lost SOL balance
        const senderIndex = tx.meta.preBalances.findIndex(
            (bal, i) => bal > tx.meta.postBalances[i] && i !== recipientIndex
        );
        payerWallet = accountKeys[senderIndex];
    } else {
        const preTokenBalance = tx.meta.preTokenBalances.find(
            b => accountKeys[b.accountIndex] === payment.payoutWallet
        );
        const postTokenBalance = tx.meta.postTokenBalances.find(
            b => accountKeys[b.accountIndex] === payment.payoutWallet
        );

        if (!preTokenBalance || !postTokenBalance) {
            return { verified: false, reason: "Token balance entries not found" };
        }

        amountReceived = postTokenBalance.uiTokenAmount.uiAmount - preTokenBalance.uiTokenAmount.uiAmount;

        const senderTokenBalance = tx.meta.preTokenBalances.find(
            b => b.mint === preTokenBalance.mint && accountKeys[b.accountIndex] !== payment.payoutWallet
        );
        payerWallet = senderTokenBalance ? accountKeys[senderTokenBalance.accountIndex] : null;
    }

    if (amountReceived !== payment.amount) {
        return { verified: false, reason: "Amount mismatch" };
    }

    return { verified: true, payerWallet, transactionSignature: signature };
};


const reconcilePendingPayments = async function (merchant) {

    const pendingPayments = await paymentModel.find({
        merchant: merchant._id,
        status: "pending",
        expiresAt: { $gt: new Date() }
    });

    for (const payment of pendingPayments) {
        const referencePubkey = new PublicKey(payment.reference);
        const signatures = await connection.getSignaturesForAddress(referencePubkey);

        if (signatures.length === 0) continue;

        const result = await verifyTransaction(signatures[0].signature, {
            ...payment.toObject(),
            payoutWallet: merchant.payoutWallet
        });

        if (result.verified) {
            payment.status = "confirmed";
            payment.transactionSignature = result.transactionSignature;
            payment.payerWallet = result.payerWallet;
            payment.confirmedAt = new Date();
        } else {
            payment.status = "failed";
        }

        await payment.save();
    }

    // sweep expired ones too
    await paymentModel.updateMany(
        { merchant: merchant._id, status: "pending", expiresAt: { $lte: new Date() } },
        { status: "expired" }
    );
};

export { verifyTransaction, reconcilePendingPayments };