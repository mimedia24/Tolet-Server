const { config } = require("../config/env");
const logger = require("../config/logger");
const ApiError = require("../utils/ApiError");

const buildMessage = (otp, language, purpose) => {
  const action = purpose === "PASSWORD_RESET" ? "password reset" : purpose === "SIGNUP" ? "account verification" : "sign in";
  return language === "bn"
    ? `আপনার To-Let ${action === "password reset" ? "পাসওয়ার্ড রিসেট" : action === "account verification" ? "অ্যাকাউন্ট ভেরিফিকেশন" : "লগইন"} কোড ${otp}। কোডটি ${config.otpExpiresMinutes} মিনিটের মধ্যে ব্যবহার করুন। কারও সাথে শেয়ার করবেন না।`
    : `Your To-Let ${action} code is ${otp}. It expires in ${config.otpExpiresMinutes} minutes. Do not share it.`;
};

const sendOtp = async ({ phone, otp, language = "en", purpose = "LOGIN" }) => {
  const message = buildMessage(otp, language, purpose);

  if (config.sms.mode === "console") {
    if (config.isProduction) throw new ApiError(500, "OTP_SEND_FAILED", "Console SMS mode is disabled in production");
    logger.info({ phone, developmentOtp: otp }, "Development OTP");
    return { provider: "console" };
  }

  if (config.sms.mode !== "http" || !config.sms.url || !config.sms.apiKey) {
    throw new ApiError(500, "OTP_SEND_FAILED", "SMS provider is not configured");
  }

  const target = new URL(config.sms.url);
  target.searchParams.set(config.sms.apiKeyParam, config.sms.apiKey);
  target.searchParams.set(config.sms.phoneParam, phone.replace("+", ""));
  target.searchParams.set(config.sms.messageParam, message);
  if (config.sms.senderId) target.searchParams.set(config.sms.senderParam, config.sms.senderId);

  const response = await fetch(target, { method: "GET", signal: AbortSignal.timeout(10000) });
  const responseText = await response.text();
  if (!response.ok) {
    logger.warn({ status: response.status, response: responseText.slice(0, 300) }, "SMS provider rejected request");
    throw new ApiError(502, "OTP_SEND_FAILED");
  }
  try {
    const payload = JSON.parse(responseText);
    if (payload?.response_code !== undefined && Number(payload.response_code) !== 202) {
      logger.warn({ status: response.status, providerCode: payload.response_code }, "SMS provider rejected request");
      throw new ApiError(502, "OTP_SEND_FAILED");
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // Some providers return plain text on success; HTTP status remains authoritative.
  }
  return { provider: "http", status: response.status };
};

module.exports = { sendOtp };
