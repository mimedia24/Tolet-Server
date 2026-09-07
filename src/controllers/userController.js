const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const Job = require("../models/Job");
const JobApplication = require("../models/JobApplication");
const MarketListing = require("../models/MarketListing");
const Property = require("../models/Property");
const User = require("../models/User");
const { publicUser } = require("../services/authService");
const { config } = require("../config/env");
const { createNotification } = require("../services/notificationService");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/response");
const {cancelDeletion, scheduleDeletion} = require("../services/accountDeletionService");

const getMe = asyncHandler(async (req, res) => {
  const [properties, jobs, applications, marketListings] = await Promise.all([
    Property.countDocuments({ ownerId: req.user._id, deletedAt: null }),
    Job.countDocuments({ employerId: req.user._id, deletedAt: null }),
    JobApplication.countDocuments({ applicantId: req.user._id }),
    MarketListing.countDocuments({ sellerId: req.user._id, deletedAt: null }),
  ]);
  return success(res, { data: { ...publicUser(req.user), counts: { properties, jobs, applications, marketListings } } });
});

const updateMe = asyncHandler(async (req, res) => {
  Object.assign(req.user, req.validated.body);
  await req.user.save();
  return success(res, { code: "UPDATED", data: publicUser(req.user) });
});

const updateCapabilities = asyncHandler(async (req, res) => {
  req.user.capabilities = [...new Set(req.validated.body.capabilities)];
  await req.user.save();
  return success(res, { code: "UPDATED", data: publicUser(req.user) });
});

const assertOwnedUpload = (directory, filename, userId, camera = false) => {
  const safe = path.basename(filename);
  const prefix = camera ? `${userId}-camera-` : `${userId}-`;
  if (safe !== filename || !safe.startsWith(prefix) || !fs.existsSync(path.join(directory, safe))) {
    throw new ApiError(400, "VALIDATION_ERROR", "The uploaded verification file is invalid");
  }
  return safe;
};

const submitKyc = asyncHandler(async (req, res) => {
  if (req.user.verification?.identityStatus === "VERIFIED") throw new ApiError(409, "CONFLICT", "This account is already KYC verified");
  const { nidFrontFile, nidBackFile, selfieFile } = req.validated.body;
  const front = assertOwnedUpload(config.kycUploadDir, nidFrontFile, req.user._id);
  const back = assertOwnedUpload(config.kycUploadDir, nidBackFile, req.user._id);
  const selfie = assertOwnedUpload(config.uploadDir, selfieFile, req.user._id, true);
  req.user.verification = {
    identityStatus: "PENDING",
    nidFrontFile: front,
    nidBackFile: back,
    selfieFile: selfie,
    submittedAt: new Date(),
    reviewedBy: undefined,
    reviewedAt: undefined,
    rejectionReason: "",
  };
  req.user.avatarUrl = `${config.publicBaseUrl}/uploads/${encodeURIComponent(selfie)}`;
  await req.user.save();
  await createNotification({ userId: req.user._id, type: "KYC_SUBMITTED", title: { en: "KYC submitted", bn: "KYC জমা হয়েছে" }, body: { en: "Your NID and live photo are waiting for admin review.", bn: "আপনার NID ও লাইভ ছবি অ্যাডমিন পর্যালোচনার অপেক্ষায় আছে।" }, data: { status: "PENDING" } });
  return success(res, { code: "KYC_SUBMITTED", data: publicUser(req.user) });
});

const updateAvatar = asyncHandler(async (req, res) => {
  const filename = assertOwnedUpload(config.uploadDir, req.validated.body.cameraFile, req.user._id, true);
  req.user.avatarUrl = `${config.publicBaseUrl}/uploads/${encodeURIComponent(filename)}`;
  await req.user.save();
  return success(res, { code: "AVATAR_UPDATED", data: publicUser(req.user) });
});

const getDeletionStatus = asyncHandler(async (req, res) => success(res, {
  data: {
    status: req.user.accountStatus,
    deletionRequestedAt: req.user.deletionRequestedAt,
    deletionScheduledFor: req.user.deletionScheduledFor,
  },
}));

const requestAccountDeletion = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("+passwordHash +tokenVersion");
  if (!user?.passwordHash || !(await bcrypt.compare(req.validated.body.password, user.passwordHash))) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Password confirmation failed");
  }
  await scheduleDeletion(user);
  return success(res, {
    code: "ACCOUNT_DELETION_SCHEDULED",
    data: {deletionScheduledFor: user.deletionScheduledFor},
  });
});

const cancelAccountDeletion = asyncHandler(async (req, res) => {
  await cancelDeletion(req.user);
  return success(res, {code: "ACCOUNT_DELETION_CANCELLED", data: publicUser(req.user)});
});

const getPublicUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select("name avatarUrl role verification.identityStatus createdAt accountStatus");
  if (!user || user.accountStatus !== "ACTIVE") throw new ApiError(404, "NOT_FOUND");
  return success(res, { data: user });
});

module.exports = {cancelAccountDeletion, getDeletionStatus, getMe, getPublicUser, requestAccountDeletion, submitKyc, updateAvatar, updateCapabilities, updateMe};
