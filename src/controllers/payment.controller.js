import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { createPaymentService, fetchSinglePaymentService, fetchAllPaymentsService } from "../services/payments.service.js";


const createPaymentController = asyncHandler(async function (req, res) {
    
    const merchant = req.merchant;
    const { amount, currency, label, message } = req.body;

    const { solanaPayUrl, paymentRequestData } = await createPaymentService(merchant, amount, currency, label, message);

    res
        .status(201)
        .json(new ApiResponse(201, { solanaPayUrl, paymentRequestData }, "payment created successfully!"))
})


