const express = require("express");
const {cancelAccountDeletion, getDeletionStatus, getMe, getPublicUser, requestAccountDeletion, submitKyc, updateAvatar, updateCapabilities, updateMe} = require("../controllers/userController");
const { authenticate } = require("../middleware/auth");
const feature = require("../middleware/feature");
const validate = require("../middleware/validate");
const { profileSchemas } = require("../validators/schemas");

const router = express.Router();

router.get("/me", authenticate, getMe);
router.patch("/me", authenticate, validate(profileSchemas.update), updateMe);
router.patch("/me/capabilities", authenticate, validate(profileSchemas.capabilities), updateCapabilities);
router.post("/me/kyc", authenticate, feature("kyc"), validate(profileSchemas.submitKyc), submitKyc);
router.patch("/me/avatar", authenticate, validate(profileSchemas.updateAvatar), updateAvatar);
router.get("/me/deletion", authenticate, getDeletionStatus);
router.post("/me/deletion/request", authenticate, validate(profileSchemas.requestDeletion), requestAccountDeletion);
router.post("/me/deletion/cancel", authenticate, cancelAccountDeletion);
router.get("/users/:id/public", getPublicUser);

module.exports = router;
