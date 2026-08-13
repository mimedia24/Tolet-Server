const bcrypt = require("bcryptjs");
const { config } = require("../config/env");
const OtpRequest = require("../models/OtpRequest");
const Session = require("../models/Session");
const User = require("../models/User");
const { createSession, publicUser, rotateSession } = require("../services/authService");
const { sendOtp } = require("../services/smsService");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { normalizeBangladeshPhone } = require("../utils/phone");
const { success } = require("../utils/response");
const { generateOtp, hashOtp, sha256 } = require("../utils/security");

const otpContext = (req) => ({
  requestIp: req.ip,
  userAgent: String(req.headers["user-agent"] || "").slice(0, 500),
});

const issueOtp = async ({ phone, purpose, req, language }) => {
  const latest = await OtpRequest.findOne({ phone, purpose, consumedAt: null }).sort({ createdAt: -1 });
  if (latest && Date.now() - latest.createdAt.getTime() < config.otpResendSeconds * 1000) {
    throw new ApiError(429, "OTP_TOO_SOON", undefined, {
      retryAfterSeconds: Math.ceil(config.otpResendSeconds - (Date.now() - latest.createdAt.getTime()) / 1000),
    });
  }

  const otp = generateOtp();
  await sendOtp({ phone, otp, language, purpose });
  await OtpRequest.create({
    phone,
    purpose,
    otpHash: hashOtp(phone, `${purpose}:${otp}`),
    maxAttempts: config.otpMaxAttempts,
    expiresAt: new Date(Date.now() + config.otpExpiresMinutes * 60 * 1000),
    ...otpContext(req),
  });
};

const consumeOtp = async ({ phone, purpose, otp }) => {
  const record = await OtpRequest.findOne({ phone, purpose, consumedAt: null }).sort({ createdAt: -1 }).select("+otpHash");
  if (!record || record.expiresAt <= new Date()) throw new ApiError(401, "OTP_INVALID");
  if (record.attempts >= record.maxAttempts) throw new ApiError(429, "OTP_ATTEMPTS_EXCEEDED");

  if (record.otpHash !== hashOtp(phone, `${purpose}:${otp}`)) {
    record.attempts += 1;
    await record.save();
    throw new ApiError(
      record.attempts >= record.maxAttempts ? 429 : 401,
      record.attempts >= record.maxAttempts ? "OTP_ATTEMPTS_EXCEEDED" : "OTP_INVALID"
    );
  }

  record.consumedAt = new Date();
  await record.save();
  return record;
};

const registerStart = asyncHandler(async (req, res) => {
  const { name, password, preferredLanguage } = req.validated.body;
  const phone = normalizeBangladeshPhone(req.validated.body.phone);
  let user = await User.findOne({ phone }).select("+passwordHash");

  if (user?.accountStatus === "ACTIVE" && user.passwordHash) {
    throw new ApiError(409, "CONFLICT", "An active account already exists for this phone number");
  }
  if (user?.accountStatus === "SUSPENDED") throw new ApiError(403, "ACCOUNT_SUSPENDED");

  const passwordHash = await bcrypt.hash(password, 12);
  if (!user) {
    user = await User.create({
      phone,
      name,
      passwordHash,
      phoneVerified: false,
      accountStatus: "PENDING_VERIFICATION",
      preferredLanguage: preferredLanguage || res.locals.language,
    });
  } else {
    user.name = name;
    user.passwordHash = passwordHash;
    user.phoneVerified = false;
    user.accountStatus = "PENDING_VERIFICATION";
    if (preferredLanguage) user.preferredLanguage = preferredLanguage;
    await user.save();
  }

  await issueOtp({ phone, purpose: "SIGNUP", req, language: res.locals.language });
  return success(res, {
    status: 201,
    code: "REGISTRATION_OTP_SENT",
    data: { phone, expiresInSeconds: config.otpExpiresMinutes * 60, resendAfterSeconds: config.otpResendSeconds },
  });
});

const registerVerify = asyncHandler(async (req, res) => {
  const phone = normalizeBangladeshPhone(req.validated.body.phone);
  await consumeOtp({ phone, purpose: "SIGNUP", otp: req.validated.body.otp });
  const user = await User.findOne({ phone });
  if (!user || user.accountStatus !== "PENDING_VERIFICATION") throw new ApiError(409, "CONFLICT");

  user.phoneVerified = true;
  user.accountStatus = "ACTIVE";
  user.lastLoginAt = new Date();
  await user.save();
  const tokens = await createSession(user, req);
  return success(res, { code: "REGISTRATION_COMPLETED", data: { user: publicUser(user), tokens, isNewUser: true } });
});

const resendRegistrationOtp = asyncHandler(async (req, res) => {
  const phone = normalizeBangladeshPhone(req.validated.body.phone);
  const user = await User.findOne({ phone });
  if (!user || user.accountStatus !== "PENDING_VERIFICATION") throw new ApiError(404, "NOT_FOUND");
  await issueOtp({ phone, purpose: "SIGNUP", req, language: res.locals.language });
  return success(res, { code: "OTP_SENT", data: { phone, expiresInSeconds: config.otpExpiresMinutes * 60 } });
});

const login = asyncHandler(async (req, res) => {
  const phone = normalizeBangladeshPhone(req.validated.body.phone);
  const user = await User.findOne({ phone }).select("+passwordHash +failedLoginAttempts +lockedUntil +tokenVersion");
  if (!user) throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid phone number or password");
  if (user.accountStatus === "SUSPENDED") throw new ApiError(403, "ACCOUNT_SUSPENDED");
  if (!user.phoneVerified || user.accountStatus === "PENDING_VERIFICATION") {
    throw new ApiError(403, "PHONE_VERIFICATION_REQUIRED", "Verify your phone number before signing in");
  }
  if (!user.passwordHash) throw new ApiError(403, "PASSWORD_SETUP_REQUIRED", "Set a password using the password reset flow");
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new ApiError(429, "ACCOUNT_TEMPORARILY_LOCKED", "Too many failed attempts. Try again later.", { lockedUntil: user.lockedUntil });
  }

  const matches = await bcrypt.compare(req.validated.body.password, user.passwordHash);
  if (!matches) {
    user.failedLoginAttempts = Number(user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= config.loginMaxAttempts) {
      user.lockedUntil = new Date(Date.now() + config.loginLockMinutes * 60 * 1000);
      user.failedLoginAttempts = 0;
    }
    await user.save();
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid phone number or password");
  }

  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();
  const tokens = await createSession(user, req);
  return success(res, { code: "LOGIN_SUCCESS", data: { user: publicUser(user), tokens, isNewUser: false } });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const phone = normalizeBangladeshPhone(req.validated.body.phone);
  const user = await User.findOne({ phone, accountStatus: "ACTIVE", phoneVerified: true });
  if (user) await issueOtp({ phone, purpose: "PASSWORD_RESET", req, language: res.locals.language });
  return success(res, {
    code: "PASSWORD_RESET_OTP_SENT",
    data: { phone, expiresInSeconds: config.otpExpiresMinutes * 60, resendAfterSeconds: config.otpResendSeconds },
  });
});

const resetPassword = asyncHandler(async (req, res) => {
  const phone = normalizeBangladeshPhone(req.validated.body.phone);
  await consumeOtp({ phone, purpose: "PASSWORD_RESET", otp: req.validated.body.otp });
  const user = await User.findOne({ phone, accountStatus: "ACTIVE", phoneVerified: true }).select("+passwordHash +tokenVersion");
  if (!user) throw new ApiError(404, "NOT_FOUND");
  user.passwordHash = await bcrypt.hash(req.validated.body.newPassword, 12);
  user.passwordChangedAt = new Date();
  user.tokenVersion = Number(user.tokenVersion || 0) + 1;
  await user.save();
  await Session.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  return success(res, { code: "PASSWORD_RESET_COMPLETED" });
});

// Compatibility OTP login is limited to already verified accounts. New accounts must use register/start.
const requestOtp = asyncHandler(async (req, res) => {
  const phone = normalizeBangladeshPhone(req.validated.body.phone);
  const user = await User.findOne({ phone, phoneVerified: true, accountStatus: "ACTIVE" });
  if (!user) throw new ApiError(404, "REGISTRATION_REQUIRED", "Create and verify an account first");
  await issueOtp({ phone, purpose: "LOGIN", req, language: res.locals.language });
  return success(res, { code: "OTP_SENT", data: { phone, expiresInSeconds: config.otpExpiresMinutes * 60 } });
});

const verifyOtp = asyncHandler(async (req, res) => {
  const phone = normalizeBangladeshPhone(req.validated.body.phone);
  await consumeOtp({ phone, purpose: "LOGIN", otp: req.validated.body.otp });
  const user = await User.findOne({ phone, phoneVerified: true, accountStatus: "ACTIVE" });
  if (!user) throw new ApiError(404, "REGISTRATION_REQUIRED");
  user.lastLoginAt = new Date();
  await user.save();
  const tokens = await createSession(user, req);
  return success(res, { code: "LOGIN_SUCCESS", data: { user: publicUser(user), tokens, isNewUser: false } });
});

const refresh = asyncHandler(async (req, res) => {
  const { user, tokens } = await rotateSession(req.validated.body.refreshToken, req);
  return success(res, { code: "OK", data: { user: publicUser(user), tokens } });
});

const logout = asyncHandler(async (req, res) => {
  await Session.updateOne({ tokenHash: sha256(req.validated.body.refreshToken), revokedAt: null }, { $set: { revokedAt: new Date() } });
  return success(res, { code: "LOGOUT_SUCCESS" });
});

const logoutAll = asyncHandler(async (req, res) => {
  await Session.updateMany({ userId: req.user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  return success(res, { code: "LOGOUT_SUCCESS" });
});

module.exports = {
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
};
