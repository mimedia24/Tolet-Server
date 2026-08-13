const mongoose = require("mongoose");
const { OTP_PURPOSES } = require("../constants/platform");

const otpRequestSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, index: true },
    otpHash: { type: String, required: true, select: false },
    purpose: { type: String, enum: OTP_PURPOSES, default: "LOGIN", index: true },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    consumedAt: Date,
    requestIp: String,
    userAgent: { type: String, maxlength: 500 },
  },
  { timestamps: true, versionKey: false }
);

otpRequestSchema.index({ phone: 1, purpose: 1, createdAt: -1 });

module.exports = mongoose.model("OtpRequest", otpRequestSchema);
