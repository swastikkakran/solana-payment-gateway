import dotenv from "dotenv";
import { app } from "./src/app.js";
import { connectDB } from "./src/db/db.js";

dotenv.config({})

const port = process.env.PORT || 3000

connectDB()
.then(() => {
    app.listen(port, () => {
        console.log(`app is live on http://localhost:${port}`);
    })
})

.catch((err) => {
    console.error("error running the app. check db connection", err)
    process.exit(1)
})