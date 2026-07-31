import { Connection, PublicKey } from "@solana/web3.js";
import { verifyTransaction, reconcilePendingPayments } from "../services/solana.service.js";
import { confirmAndNotify } from "../services/webhook.service.js";
import { paymentModel } from "../models/payment-request.model.js";
import { logger } from "../utils/logger.js";


const connection = new Connection(process.env.SOLANA_RPC_URL, "confirmed");
const activeSubscriptions = new Map();


const handleLog = async function (logs, merchant) {
    
    try {
        const result = await verifyTransaction(logs.signature, merchant);
        logger.info({ signature: logs.signature }, "handleLog fired");
        

        if (result.verified) {
            await confirmAndNotify(result, merchant)
        }
    } catch (err) {
        logger.error({ err }, "handleLog crashed");
    }
};


const connectMerchant = async function (merchant) {

    const hasPending = await paymentModel.exists({
        merchant: merchant._id,
        status: "pending",
        expiresAt: { $gt: new Date() }
    });

    if (hasPending) {
        await reconcilePendingPayments(merchant);
    }

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


const isConnected = function (merchantId) {
    return activeSubscriptions.has(merchantId.toString());
};


export { connectMerchant, disconnectMerchant, isConnected };