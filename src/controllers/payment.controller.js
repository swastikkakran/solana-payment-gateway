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


const fetchSinglePaymentController = asyncHandler(async function (req, res) {
    
    const merchant = req.merchant;
    const paymentId = req.params.paymentId;

    const payment = await fetchSinglePaymentService(merchant, paymentId)

    res
        .status(200)
        .json(new ApiResponse(200, payment, "payment fetched successfully."))
})


const fetchAllPaymentsController = asyncHandler(async function (req, res) {
    
    const merchant = req.merchant;
    const { status, page, limit } = req.query;

    const payments = await fetchAllPaymentsService(merchant, status, page, limit);

    res
        .status(200)
        .json(new ApiResponse(200, payments, "payments fetched successfully!"))
})


export { createPaymentController, fetchSinglePaymentController, fetchAllPaymentsController }