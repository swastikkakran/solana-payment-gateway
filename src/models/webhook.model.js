import mongoose from "mongoose";

const webhookSchema = new mongoose.Schema({
    paymentRequest: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "payment",
            required: true,
            index: true
        },
    merchant: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "merchant",
            required: true,
            index: true
        },
    payload: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    status: {
        type: String,
        required: true,
        enum: ["pending", "delivered", "failed"],
        default: "pending"
    },
    attempts: {
        type: Number,
        default: 0
    },
    lastAttemptAt: Date,
    nextRetryAt: Date,
}, { timestamps: true })

export const webhookModel = mongoose.model("webhook", webhookSchema)