import { Connection, PublicKey } from "@solana/web3.js";
import { verifyTransaction } from "./solana.service.js";
import { reconcilePendingPayments } from "./solana.service.js";
import { deliverWebhook } from "./webhook.service.js";


const connection = new Connection(process.env.SOLANA_RPC_URL, "confirmed");
const activeSubscriptions = new Map();


const handleLog = async function (logs, merchant) {
    const signature = logs.signature;

    const result = await verifyTransaction(signature, merchant);

    if (result.verified) {
        result.payment.status = "confirmed";
        result.payment.transactionSignature = result.transactionSignature;
        result.payment.payerWallet = result.payerWallet;
        result.payment.confirmedAt = new Date();
        await result.payment.save();

        await deliverWebhook(result.payment, merchant);
    }
};


const connectMerchant = async function (merchant) {

    await reconcilePendingPayments(merchant);

    const subscriptionId = connection.onLogs(
        new PublicKey(merchant.payoutWallet),
        (logs) => handleLog(logs, merchant),
        "confirmed"
    );

    activeSubscriptions.set(merchant._id.toString(), subscriptionId);

    connection._rpcWebSocket.on("close", () => {
        activeSubscriptions.delete(merchant._id.toString());
        connectMerchant(merchant);
    });
};


const disconnectMerchant = async function (merchantId) {
    const subscriptionId = activeSubscriptions.get(merchantId.toString());
    if (subscriptionId !== undefined) {
        await connection.removeOnLogsListener(subscriptionId);
        activeSubscriptions.delete(merchantId.toString());
    }
};


export { connectMerchant, disconnectMerchant };