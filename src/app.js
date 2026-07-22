import express from "express";
import cors from "cors";
//route imports
import authRouter from "./routes/auth.route.js";
import paymentRouter from "./routes/payment.route.js";

const app = express()
app.use(express.json({ limit: "16kb" }))
app.use(express.urlencoded({ extended: true, limit: "16kb" }))
app.use(cors())

//auth router
app.use("/api/v1/auth", authRouter)
//payment router
app.use("api/v1/payments", paymentRouter)


app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500
    res.status(statusCode).json({
        success: false,
        statusCode,
        message: err.message || "something went wrong",
        errors: err.errors || []
    })
})

export { app }