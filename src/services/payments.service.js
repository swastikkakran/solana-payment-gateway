import { Keypair } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { encodeURL } from "@solana/pay";
import BigNumber from "bignumber.js";
import { ApiError } from "../utils/api-error.js";
import { merchantModel } from "../models/merchant.model.js";
import { paymentModel } from "../models/payment-request.model.js";


const createPaymentService = async function (merchant, amount, currency, label, message) {
    
    const referenceKeyPair = Keypair.generate();
    const reference = referenceKeyPair.publicKey;

    //creating pay url
    const url = encodeURL({
        recipient: new PublicKey(merchant.payoutWallet),
        amount: new BigNumber(amount),
        splToken: currency === "USDC" ? new PublicKey(process.env.USDC_MINT_ADDRESS) : undefined,
        reference: reference,
        label,
        message
    });

    const solanaPayUrl = url.toString();

    const paymentRequestData = await paymentModel.create({
        merchant: merchant._id,
        reference: reference.toBase58(),
        amount: amount,
        currency: currency,
        label: label,
        message: message,
        expiresAt: new Date(Date.now() + (1000*60*15))
    })

    return { solanaPayUrl, paymentRequestData };
}


const fetchSinglePaymentService = async function (merchant, paymentId) {
    
    const payment = await paymentModel.findOne({ _id: paymentId, merchant: merchant._id })
    if (!payment) throw new ApiError(404, "No payment found!")

    return payment
}


const fetchAllPaymentsService = async function (merchant, status, page = 1, limit = 20) {

    const filter = { merchant: merchant._id };

    if (status) {
        if (!["pending", "confirmed", "expired", "failed"].includes(status)) {
            throw new ApiError(400, "Invalid status filter");
        }
        filter.status = status;
    }

    const skip = (page - 1) * limit;

    const [payments, totalCount] = await Promise.all([
        paymentModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
        paymentModel.countDocuments(filter)
    ]);

    return {
        payments,
        pagination: {
            page: Number(page),
            limit: Number(limit),
            totalCount,
            totalPages: Math.ceil(totalCount / limit)
        }
    };
};


export { createPaymentService, fetchSinglePaymentService, fetchAllPaymentsService }