import { Router } from "express";
import { registerController, keyRotationController, deleteMerchantController } from "../controllers/auth.controller.js";
import { strictApiMiddleware } from "../middlewares/auth.middleware.js";
import { validateRequest } from "../middlewares/validate.middleware.js";
import { registerMerchantSchema } from "../validators/auth.validator.js";


const router = Router();

router.route("/register").post(validateRequest(registerMerchantSchema), registerController);
router.route("/rotate").post(strictApiMiddleware, keyRotationController);
router.route("/").delete(strictApiMiddleware, deleteMerchantController);


export default router;