import mongoose from "mongoose";

const connectDB = async function () {

    try {
        await mongoose.connect(process.env.MONGO_URI)
        console.log("DB connected successfully...");
        
    } catch (error) {
        console.error("Couldn't connect to db...", error);
        process.exit(1)        
    }
}

export { connectDB }