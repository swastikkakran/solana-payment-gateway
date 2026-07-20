import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";
import { merchantModel } from "../models/merchant.model.js";
import bcrypt from "bcrypt";


const checkCredentials = async function (apiKey) {
    
    const existingMerchant = await merchantModel.findOne({ apiKey: apiKey })
    return existingMerchant;
}

const normalApiMiddleware = asyncHandler(async function (req, res, next) {
    
    const { 'x-api-key': apiKey, 'x-api-secret': apiSecret } = req.headers;

    const existingMerchant = checkCredentials(apiKey)
    if (!existingMerchant) {
        const tryPreviousCredentials = await merchantModel.findOne({ "previousCredentials.apiKey": apiKey })
        if (!tryPreviousCredentials) throw new ApiError(401, "Unauthorized access!")
    }
    const isApiSecretValid = await bcrypt.compare(apiSecret, existingMerchant.apiSecretHash)
    if (!isApiSecretValid) {
        const tryPreviousSecret = await bcrypt.compare(apiSecret, existingMerchant.previousCredentials.apiSecret)
        if (!tryPreviousSecret) throw new ApiError(401, "Unauthorized access!")
    }

    req.user = apiKey
    next()


})