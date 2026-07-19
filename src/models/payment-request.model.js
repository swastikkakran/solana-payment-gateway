import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
    merchant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "merchant",
        required: true,
    },
    reference: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        required: true,
        enum: ["SOL", "USDC"]
    },
    label: {
        type: String
    },
    message: {
        type: String
    },
    status: {
        type: String,
        required: true,
        enum: ["pending", "confirmed", "expired", "failed"],
        default: "pending"
    },
    transactionSignature: String,
    payerWallet: String,
    expiresAt: Date,
    confirmedAt: Date,
}, { timestamps: true })

export const paymentModel = mongoose.model("payment", paymentSchema) 