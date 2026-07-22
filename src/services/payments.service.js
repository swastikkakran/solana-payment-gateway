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
