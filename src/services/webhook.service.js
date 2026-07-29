import crypto from "crypto";
import { decrypt } from "../utils/crypto.js";
import { webhookModel } from "../models/webhook.model.js";


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

    const rawWebhookSecret = decrypt(
        merchant.webhookEncryption.iv,
        merchant.webhookEncryption.authTag,
        merchant.webhookEncryption.encryptedWebhookSecret
    );

    const signature = crypto
        .createHmac("sha256", rawWebhookSecret)
        .update(payloadString)
        .digest("hex");

    const webhookRecord = await webhookModel.create({
        paymentRequest: payment._id,
        merchant: merchant._id,
        payload,
        status: "pending"
    });

    try {
        const response = await fetch(merchant.webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-webhook-signature": signature
            },
            body: payloadString
        });

        if (response.ok) {
            webhookRecord.status = "delivered";
            webhookRecord.lastAttemptAt = new Date();
            webhookRecord.attempts += 1;
        } else {
            webhookRecord.status = "failed";
            webhookRecord.attempts += 1;
            webhookRecord.lastAttemptAt = new Date();
            webhookRecord.nextRetryAt = new Date(Date.now() + 60 * 1000);
        }
    } catch (err) {
        webhookRecord.status = "failed";
        webhookRecord.attempts += 1;
        webhookRecord.lastAttemptAt = new Date();
        webhookRecord.nextRetryAt = new Date(Date.now() + 60 * 1000);
    }

    await webhookRecord.save();
};


export { deliverWebhook };