import crypto from "crypto";
import { decrypt } from "../utils/crypto.js";
import { webhookModel } from "../models/webhook.model.js";
import { logger } from "../utils/logger.js";


const deliverWebhook = async function (payment, merchant) {

    const payload = {
        event: "payment.confirmed",
        data: {
            paymentId: payment._id,
            reference: payment.reference,
            amount: payment.amount,
            currency: payment.currency,
            transactionSignature: payment.transactionSignature,
            payerWallet: payment.payerWallet,
            confirmedAt: payment.confirmedAt
        }
    };

    const payloadString = JSON.stringify(payload);

    const webhookRecord = await webhookModel.create({
        paymentRequest: payment._id,
        merchant: merchant._id,
        payload,
        status: "pending",
        attempts: 0
    });

    await attemptDelivery(webhookRecord, merchant, payloadString);
};


const attemptDelivery = async function (webhookRecord, merchant, payloadString) {

    const rawWebhookSecret = decrypt(
        merchant.webhookEncryption.iv,
        merchant.webhookEncryption.authTag,
        merchant.webhookEncryption.encryptedWebhookSecret
    );

    const signature = crypto
        .createHmac("sha256", rawWebhookSecret)
        .update(payloadString)
        .digest("hex");

    let delivered = false;

    try {
        const response = await fetch(merchant.webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-webhook-signature": signature
            },
            body: payloadString
        });
        logger.info({ status: response.status }, "webhook status");
        delivered = response.ok;
    } catch (err) {
        logger.error({ err }, "webhook error");
        delivered = false;
    }

    webhookRecord.attempts += 1;
    webhookRecord.lastAttemptAt = new Date();

    if (delivered) {
        webhookRecord.status = "delivered";
        webhookRecord.nextRetryAt = undefined;
    } else {
        const backoffSchedule = [60, 300, 1800, 7200]; // seconds: 1m, 5m, 30m, 2h
        if (webhookRecord.attempts >= backoffSchedule.length) {
            webhookRecord.status = "failed"; // permanent give-up
            webhookRecord.nextRetryAt = undefined;
        } else {
            webhookRecord.status = "failed";
            const delaySeconds = backoffSchedule[webhookRecord.attempts - 1];
            webhookRecord.nextRetryAt = new Date(Date.now() + delaySeconds * 1000);
        }
    }

    await webhookRecord.save();
};


const retryFailedWebhooks = async function () {

    const dueWebhooks = await webhookModel
        .find({ status: "failed", nextRetryAt: { $lte: new Date() } })
        .populate("merchant");

    for (const webhookRecord of dueWebhooks) {
        const payloadString = JSON.stringify(webhookRecord.payload);
        await attemptDelivery(webhookRecord, webhookRecord.merchant, payloadString);
    }
};

setInterval(retryFailedWebhooks, 60 * 1000); // check every minute


const confirmAndNotify = async function (result, merchant) {
    result.payment.status = "confirmed";
    result.payment.transactionSignature = result.transactionSignature;
    result.payment.payerWallet = result.payerWallet;
    result.payment.confirmedAt = new Date();
    await result.payment.save();

    await deliverWebhook(result.payment, merchant);
};


export { deliverWebhook, retryFailedWebhooks, confirmAndNotify };