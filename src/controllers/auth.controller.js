import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { registerService, keyRotationService, deleteMerchantService } from "../services/auth.service.js";


const registerController = asyncHandler(async function (req, res) {
    
    const { email, webhookUrl, payoutWallet } = req.body;
    const registerPayload = registerService(email, webhookUrl, payoutWallet)

    res
        .status(201)
        .json(new ApiResponse(201, registerPayload, "merchant registered successfully!"))
})

