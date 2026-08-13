const mongoose = require("mongoose");
const { ACCOUNT_STATUSES, CAPABILITIES, USER_ROLES } = require("../constants/platform");

const userSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, index: true, trim: true },
    phoneVerified: { type: Boolean, default: false },
    passwordHash: { type: String, select: false },
    name: { type: String, trim: true, maxlength: 100, default: "" },
    avatarUrl: { type: String, trim: true, maxlength: 1000, default: "" },
    preferredLanguage: { type: String, enum: ["en", "bn"], default: "en" },
    preferredLocation: {
      city: { type: String, trim: true, maxlength: 80 },
      area: { type: String, trim: true, maxlength: 120 },
    },
    capabilities: { type: [{ type: String, enum: CAPABILITIES }], default: ["TENANT", "JOB_SEEKER"] },
    role: { type: String, enum: USER_ROLES, default: "USER", index: true },
    accountStatus: { type: String, enum: ACCOUNT_STATUSES, default: "PENDING_VERIFICATION", index: true },
    verification: {
      identityStatus: { type: String, enum: ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"], default: "UNVERIFIED" },
      nidFrontFile: { type: String, trim: true, maxlength: 300, default: "" },
      nidBackFile: { type: String, trim: true, maxlength: 300, default: "" },
      selfieFile: { type: String, trim: true, maxlength: 300, default: "" },
      submittedAt: Date,
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reviewedAt: Date,
      rejectionReason: { type: String, trim: true, maxlength: 1000, default: "" },
    },
    lastLoginAt: Date,
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, select: false },
    passwordChangedAt: Date,
    tokenVersion: { type: Number, default: 0, select: false },
  },
  { timestamps: true, versionKey: false }
);

userSchema.index({ name: "text", phone: "text" });

module.exports = mongoose.model("User", userSchema);
