import { Router } from "express";
import { registerController, keyRotationController, deleteMerchantController } from "../controllers/auth.controller.js";
import { strictApiMiddleware } from "../middlewares/auth.middleware.js";


const router = Router();

router.route("/register").post(registerController);
router.route("/rotate").post(strictApiMiddleware, keyRotationController);
router.route("/").delete(strictApiMiddleware, deleteMerchantController);


export default router;