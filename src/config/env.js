const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || path.resolve(process.cwd(), ".env") });

const number = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const bool = (value, fallback = false) => {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

const list = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const isTest = process.env.NODE_ENV === "test";
const isProduction = process.env.NODE_ENV === "production";

const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  isTest,
  isProduction,
  port: number(process.env.PORT, 5000),
  apiPrefix: process.env.API_PREFIX || "/api/v1",
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/tolet_platform",
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "development-access-secret-change-me-please",
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  refreshTokenDays: number(process.env.REFRESH_TOKEN_DAYS, 30),
  otpHashSecret: process.env.OTP_HASH_SECRET || "development-otp-secret-change-me-please",
  otpExpiresMinutes: number(process.env.OTP_EXPIRES_MINUTES, 5),
  otpResendSeconds: number(process.env.OTP_RESEND_SECONDS, 45),
  otpMaxAttempts: number(process.env.OTP_MAX_ATTEMPTS, 5),
  passwordMinLength: number(process.env.PASSWORD_MIN_LENGTH, 8),
  loginMaxAttempts: number(process.env.LOGIN_MAX_ATTEMPTS, 5),
  loginLockMinutes: number(process.env.LOGIN_LOCK_MINUTES, 15),
  sms: {
    mode: process.env.SMS_MODE || "console",
    url: process.env.SMS_API_URL || "",
    apiKey: process.env.SMS_API_KEY || "",
    senderId: process.env.SMS_SENDER_ID || "",
    apiKeyParam: process.env.SMS_API_KEY_PARAM || "api_key",
    phoneParam: process.env.SMS_PHONE_PARAM || "number",
    messageParam: process.env.SMS_MESSAGE_PARAM || "message",
    senderParam: process.env.SMS_SENDER_PARAM || "senderid",
  },
  corsOrigins: list(process.env.CORS_ORIGINS),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:5000",
  trustProxy: number(process.env.TRUST_PROXY, 0),
  logLevel: process.env.LOG_LEVEL || (isTest ? "silent" : "info"),
  uploadDir: path.resolve(process.cwd(), process.env.UPLOAD_DIR || "uploads"),
  kycUploadDir: path.resolve(process.cwd(), process.env.KYC_UPLOAD_DIR || "kyc_uploads"),
  maxFileSizeBytes: number(process.env.MAX_FILE_SIZE_MB, 8) * 1024 * 1024,
  maxFilesPerRequest: number(process.env.MAX_FILES_PER_REQUEST, 10),
  defaultListingExpiryDays: number(process.env.DEFAULT_LISTING_EXPIRY_DAYS, 30),
  defaultJobExpiryDays: number(process.env.DEFAULT_JOB_EXPIRY_DAYS, 30),
  defaultRequestExpiryDays: number(process.env.DEFAULT_REQUEST_EXPIRY_DAYS, 30),
  features: {
    chat: bool(process.env.ENABLE_CHAT, true),
    visitBooking: bool(process.env.ENABLE_VISIT_BOOKING, true),
    tour360: bool(process.env.ENABLE_360_TOUR, true),
    aiSearch: bool(process.env.ENABLE_AI_SEARCH, true),
    housingRequests: false,
    workerProfiles: bool(process.env.ENABLE_WORKER_PROFILES, true),
  },
  ai: {
    providerUrl: process.env.AI_PROVIDER_URL || "",
    apiKey: process.env.AI_PROVIDER_API_KEY || "",
    model: process.env.AI_PROVIDER_MODEL || "",
  },
  superAdminPhone: process.env.SUPER_ADMIN_PHONE || "+8801700000000",
  superAdminName: process.env.SUPER_ADMIN_NAME || "Platform Super Admin",
};

const validateProductionConfig = () => {
  if (!config.isProduction) return;

  const errors = [];
  if (config.jwtAccessSecret.includes("development") || config.jwtAccessSecret.length < 32) {
    errors.push("JWT_ACCESS_SECRET must be a random value of at least 32 characters");
  }
  if (config.otpHashSecret.includes("development") || config.otpHashSecret.length < 32) {
    errors.push("OTP_HASH_SECRET must be a random value of at least 32 characters");
  }
  if (config.sms.mode === "console") errors.push("SMS_MODE=console is forbidden in production");
  if (config.sms.mode === "http" && (!config.sms.url || !config.sms.apiKey)) {
    errors.push("SMS_API_URL and SMS_API_KEY are required for SMS_MODE=http");
  }
  if (!config.corsOrigins.length) errors.push("CORS_ORIGINS must be configured in production");

  if (errors.length) throw new Error(`Invalid production configuration: ${errors.join("; ")}`);
};

module.exports = { config, validateProductionConfig };
