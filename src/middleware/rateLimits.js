const { rateLimit } = require("express-rate-limit");
const { t } = require("../utils/i18n");

const handler = (_req, res) => res.status(429).json({ success: false, code: "RATE_LIMITED", message: t("RATE_LIMITED", res.locals.language) });

const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 500, standardHeaders: "draft-8", legacyHeaders: false, handler });
const otpRequestLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, handler });
const otpVerifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false, handler });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 25, standardHeaders: "draft-8", legacyHeaders: false, handler });
const writeLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false, handler });

module.exports = { globalLimiter, loginLimiter, otpRequestLimiter, otpVerifyLimiter, writeLimiter };
