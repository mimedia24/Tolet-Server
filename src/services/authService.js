const { config } = require("../config/env");
const Session = require("../models/Session");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const { dateFromDays } = require("../utils/query");
const { generateOpaqueToken, sha256, signAccessToken } = require("../utils/security");

const publicUser = (user) => ({
  id: user._id,
  phone: user.phone,
  phoneVerified: user.phoneVerified,
  name: user.name,
  avatarUrl: user.avatarUrl,
  preferredLanguage: user.preferredLanguage,
  preferredLocation: user.preferredLocation,
  capabilities: user.capabilities,
  role: user.role,
  accountStatus: user.accountStatus,
  verification: {
    identityStatus: user.verification?.identityStatus || "UNVERIFIED",
    submittedAt: user.verification?.submittedAt,
    reviewedAt: user.verification?.reviewedAt,
    rejectionReason: user.verification?.rejectionReason || "",
    documentsSubmitted: Boolean(user.verification?.nidFrontFile && user.verification?.nidBackFile && user.verification?.selfieFile),
  },
  createdAt: user.createdAt,
});

const createSession = async (user, req) => {
  const refreshToken = generateOpaqueToken();
  await Session.create({
    userId: user._id,
    tokenHash: sha256(refreshToken),
    expiresAt: dateFromDays(config.refreshTokenDays),
    ip: req.ip,
    userAgent: String(req.headers["user-agent"] || "").slice(0, 500),
  });

  return {
    accessToken: signAccessToken(user),
    refreshToken,
    tokenType: "Bearer",
    expiresIn: config.jwtAccessExpiresIn,
  };
};

const rotateSession = async (refreshToken, req) => {
  const current = await Session.findOneAndUpdate(
    { tokenHash: sha256(refreshToken), revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { revokedAt: new Date() } },
    { new: false }
  ).select("+tokenHash");
  if (!current || current.expiresAt <= new Date()) throw new ApiError(401, "TOKEN_INVALID");
  const user = await User.findById(current.userId);
  if (!user || user.accountStatus !== "ACTIVE") throw new ApiError(401, "TOKEN_INVALID");

  return { user, tokens: await createSession(user, req) };
};

module.exports = { createSession, publicUser, rotateSession };
