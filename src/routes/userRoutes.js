const express = require("express");
const { getMe, getPublicUser, submitKyc, updateAvatar, updateCapabilities, updateMe } = require("../controllers/userController");
const { authenticate } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { profileSchemas } = require("../validators/schemas");

const router = express.Router();

router.get("/me", authenticate, getMe);
router.patch("/me", authenticate, validate(profileSchemas.update), updateMe);
router.patch("/me/capabilities", authenticate, validate(profileSchemas.capabilities), updateCapabilities);
router.post("/me/kyc", authenticate, validate(profileSchemas.submitKyc), submitKyc);
router.patch("/me/avatar", authenticate, validate(profileSchemas.updateAvatar), updateAvatar);
router.get("/users/:id/public", getPublicUser);

module.exports = router;
