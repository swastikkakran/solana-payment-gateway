import "./src/utils/env.js";
import { app } from "./src/app.js";
import { connectDB } from "./src/db/db.js";
import { startWatcher } from "./src/watcher/watcher.js";


const port = process.env.PORT || 3000

connectDB()
.then(() => {
    app.listen(port, () => {
        console.log(`app is live on http://localhost:${port}`);
    })
    startWatcher();
})

.catch((err) => {
    console.error("error running the app. check db connection", err)
    process.exit(1)
})