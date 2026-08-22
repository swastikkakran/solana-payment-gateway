import { address, createSolanaRpcSubscriptions } from "@solana/kit";
import { verifyTransaction, reconcilePendingPayments } from "../services/solana.service.js";
import { confirmAndNotify } from "../services/webhook.service.js";
import { paymentModel } from "../models/payment-request.model.js";
import { logger } from "../utils/logger.js";
import { ApiError } from "../utils/api-error.js";
import { IMerchant } from "../models/merchant.model.js";
import { Types } from "mongoose";


if (!process.env.SOLANA_RPC_WSS_URL) throw new ApiError(404, "solana rpc url not found!");
const rpcSubscription = createSolanaRpcSubscriptions(process.env.SOLANA_RPC_WSS_URL);
const activeSubscriptions = new Map();

const handleLog = async function (merchant: IMerchant, logSignature: string) {

    try {
        const result = await verifyTransaction(merchant, logSignature);
        logger.info({ signature: logSignature }, "handleLog fired!")

        if (result.verified && result.payment) {
            await confirmAndNotify(result, merchant)
        }
    } catch (error) {
        logger.error({error}, "handleLog crashed!")
    }
}

const connectMerchant = async function (merchant: IMerchant) {
    
    const hasPending = await paymentModel.exists({
        merchant: merchant._id,
        status: "pending",
        expiresAt: { $gt: new Date() }
    });

    if (hasPending) {
        await reconcilePendingPayments(merchant);
    }

    const controller = new AbortController();
    activeSubscriptions.set(merchant._id.toString(), controller);

    const subscription = await rpcSubscription.logsNotifications(
        { mentions: [address(merchant.payoutWallet)] },
        { commitment: "confirmed" }).subscribe({ abortSignal: controller.signal }
        );

    (async () => {
    try {
        for await (const log of subscription) {
            await handleLog(merchant, log.value.signature);
        }
    } catch (err) {
        if (!controller.signal.aborted) {
            activeSubscriptions.delete(merchant._id.toString());
            await connectMerchant(merchant);
        }
    }
    })();
}

const disconnectMerchant = async function (merchantId: Types.ObjectId) {

    const subscriptionController = activeSubscriptions.get(merchantId.toString());
    if (subscriptionController) {
        subscriptionController.abort();
        activeSubscriptions.delete(merchantId.toString());
    }
}

const isConnected = function (merchantId: Types.ObjectId) {

    return activeSubscriptions.has(merchantId.toString());
};


export { connectMerchant, disconnectMerchant, isConnected };