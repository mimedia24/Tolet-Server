const express = require("express");
const {
  forgotPassword,
  login,
  logout,
  logoutAll,
  refresh,
  registerStart,
  registerVerify,
  requestOtp,
  resendRegistrationOtp,
  resetPassword,
  verifyOtp,
} = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");
const { loginLimiter, otpRequestLimiter, otpVerifyLimiter } = require("../middleware/rateLimits");
const validate = require("../middleware/validate");
const { authSchemas } = require("../validators/schemas");

const router = express.Router();

router.post("/register/start", otpRequestLimiter, validate(authSchemas.registerStart), registerStart);
router.post("/register/verify", otpVerifyLimiter, validate(authSchemas.registerVerify), registerVerify);
router.post("/register/resend", otpRequestLimiter, validate(authSchemas.phoneOnly), resendRegistrationOtp);
router.post("/login", loginLimiter, validate(authSchemas.login), login);
router.post("/password/forgot", otpRequestLimiter, validate(authSchemas.phoneOnly), forgotPassword);
router.post("/password/reset", otpVerifyLimiter, validate(authSchemas.resetPassword), resetPassword);
router.post("/otp/request", otpRequestLimiter, validate(authSchemas.requestOtp), requestOtp);
router.post("/otp/verify", otpVerifyLimiter, validate(authSchemas.verifyOtp), verifyOtp);
router.post("/refresh", validate(authSchemas.refresh), refresh);
router.post("/logout", validate(authSchemas.logout), logout);
router.post("/logout-all", authenticate, logoutAll);

module.exports = router;
