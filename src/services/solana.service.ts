import { address, createSolanaRpc, signature } from "@solana/kit";
import { paymentModel } from "../models/payment-request.model.js";
import { confirmAndNotify } from "../services/webhook.service.js";
import { ApiError } from "../utils/api-error.js";
import { IMerchant } from "../models/merchant.model.js";


if (!process.env.SOLANA_RPC_URL) throw new ApiError(404, "solana devnet rpc not found!")
const rpc = createSolanaRpc(process.env.SOLANA_RPC_URL);


const verifyTransaction = async function (merchant: IMerchant, sign: string) {
    
    const tx = await rpc.getTransaction(signature(sign),  {
        commitment: 'confirmed',
        encoding: 'jsonParsed',
        maxSupportedTransactionVersion: 0,
    }).send();

    if (!tx) return { verified: false, reason: "tx failed or not found!"};

    const accountKeys = tx?.transaction.message.accountKeys.map(k => k.pubkey);

    //check for if payment exist in db
    const payment = await paymentModel.findOne({
        merchant: merchant._id,
        status: "pending",
        reference: { $in: accountKeys }
    });

    if (!payment) return { verified: false, reason: "no pending payment found!"};

    //check if recipient's address is in transaction
    const recipientIndex = accountKeys.indexOf(address(merchant.payoutWallet));
    if (recipientIndex === -1) {
        return { verified: false, payment, reason: "Recipient not found in transaction" };
    }

    let amountReceived;
    let payerWallet: string | undefined;

    if (payment.currency == "SOL") {
        const preBalance = tx.meta?.preBalances[recipientIndex];
        const postBalance = tx.meta?.postBalances[recipientIndex];

        if (preBalance === undefined || postBalance === undefined) {
        return { verified: false, payment, reason: "Unable to retrieve balance information" };
        }
        amountReceived = Number(postBalance - preBalance) / 1e9;
        
        const senderIndex = tx.meta?.preBalances?.findIndex(
            (bal, i) => bal > (tx.meta?.postBalances?.[i] ?? 0) && i !== recipientIndex
        ) ?? -1;
        
        payerWallet = accountKeys[senderIndex];
    } else {
        const preTokenBalance = tx.meta?.preTokenBalances?.find(
            b => accountKeys[b.accountIndex] === merchant.payoutWallet
        );
        const postTokenBalance = tx.meta?.postTokenBalances?.find(
            b => accountKeys[b.accountIndex] === merchant.payoutWallet
        );

        if (!preTokenBalance || !postTokenBalance) {
            return { verified: false, payment, reason: "Token balance entries not found" };
        }

        // Ensure uiAmount values exist before performing arithmetic
        const postAmount = parseFloat(postTokenBalance.uiTokenAmount.uiAmountString);
        const preAmount = parseFloat(preTokenBalance.uiTokenAmount.uiAmountString);

        if (postAmount == null || preAmount == null) {
            return { verified: false, payment, reason: "Invalid or missing token amount values" };
        }

        amountReceived = postAmount - preAmount;

        const preTokenBalances = tx.meta?.preTokenBalances ?? [];

        const senderTokenBalance = preTokenBalances.find(
            b => b.mint === preTokenBalance.mint && accountKeys[b.accountIndex] !== merchant.payoutWallet
        );

        payerWallet = senderTokenBalance ? accountKeys[senderTokenBalance.accountIndex] : undefined;
    }

    if (amountReceived !== payment.amount) {
        return { verified: false, payment, reason: "Amount mismatch" };
    }

    return { verified: true, payment, payerWallet, transactionSignature: sign}
}


const reconcilePendingPayments = async function (merchant: IMerchant) {
    
    const recipientPubkey = address(merchant.payoutWallet);
    const paymentSignatures = await rpc.getSignaturesForAddress(recipientPubkey, { limit: 50 }).send();

    for (const signObj of paymentSignatures) {
        if (!signObj.signature) continue;
        const result = await verifyTransaction(merchant, signObj.signature)

        if (result.verified && result.payment) {
            await confirmAndNotify(result, merchant)
        }
    }

    //all the timeout-ed tx will be declared expired.
    await paymentModel.updateMany(
        { merchant: merchant._id, status: "pending", expiresAt: { $lte: new Date() } },
        { status: "expired" }
    );
}

export { verifyTransaction, reconcilePendingPayments };