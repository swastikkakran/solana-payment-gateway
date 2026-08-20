import mongoose from "mongoose";
import { ApiError } from "../utils/api-error.js";

const connectDB = async function () {

    try {
        if (!process.env.MONGO_URI) throw new ApiError(404, "mongo uri not found!")
        await mongoose.connect(process.env.MONGO_URI)
        console.log("DB connected successfully...");
        
    } catch (error) {
        console.error("Couldn't connect to db...", error);
        process.exit(1)        
    }
}

export { connectDB }