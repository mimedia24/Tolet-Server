const path = require("path");
const AdminLog = require("../models/AdminLog");
const HousingRequest = require("../models/HousingRequest");
const Job = require("../models/Job");
const Property = require("../models/Property");
const Report = require("../models/Report");
const Setting = require("../models/Setting");
const User = require("../models/User");
const WorkerProfile = require("../models/WorkerProfile");
const { audit } = require("../services/auditService");
const { moderationNotification } = require("../services/notificationService");
const { getSettings } = require("../services/settingsService");
const { config } = require("../config/env");
const { createNotification } = require("../services/notificationService");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { dateFromDays, getPagination, paginationMeta } = require("../utils/query");
const { success } = require("../utils/response");

const dashboard = asyncHandler(async (_req, res) => {
  const [users, kyc, properties, jobs, housingRequests, workerProfiles, reports] = await Promise.all([
    User.aggregate([{ $group: { _id: "$accountStatus", count: { $sum: 1 } } }]),
    User.aggregate([{ $group: { _id: "$verification.identityStatus", count: { $sum: 1 } } }]),
    Property.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Job.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    HousingRequest.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    WorkerProfile.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Report.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);
  const toObject = (rows) => Object.fromEntries(rows.map((row) => [row._id, row.count]));
  return success(res, { data: { users: toObject(users), kyc: toObject(kyc), properties: toObject(properties), jobs: toObject(jobs), housingRequests: toObject(housingRequests), workerProfiles: toObject(workerProfiles), reports: toObject(reports) } });
});

const listCollection = (Model, populate = "", ownerField = "") =>
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { deletedAt: null };
    if (req.query.status) filter.status = req.query.status;
    else if (req.query.pending === "true") filter.status = "PENDING_REVIEW";
    if (req.query.kind) filter.kind = req.query.kind;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.ownerId && ownerField) filter[ownerField] = req.query.ownerId;
    const query = Model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);
    if (populate) query.populate(populate);
    const [items, total] = await Promise.all([query, Model.countDocuments(filter)]);
    return success(res, { data: items, meta: paginationMeta({ page, limit, total }) });
  });

const listProperties = listCollection(Property, "ownerId", "ownerId");
const listJobs = listCollection(Job, "employerId", "employerId");
const listHousingRequests = listCollection(HousingRequest, "requesterId", "requesterId");
const listWorkerProfiles = listCollection(WorkerProfile, "userId", "userId");

const propertyActionMap = {
  APPROVE: "ACTIVE",
  CHANGES_REQUIRED: "CHANGES_REQUIRED",
  REJECT: "REJECTED",
  SUSPEND: "SUSPENDED",
  RESTORE: "ACTIVE",
  MARK_DUPLICATE: "REJECTED",
};
const jobActionMap = { APPROVE: "ACTIVE", CHANGES_REQUIRED: "CHANGES_REQUIRED", REJECT: "REJECTED", SUSPEND: "SUSPENDED", RESTORE: "ACTIVE" };
const requestActionMap = { APPROVE: "ACTIVE", CHANGES_REQUIRED: "CHANGES_REQUIRED", REJECT: "REJECTED", SUSPEND: "SUSPENDED", RESTORE: "ACTIVE" };

const requireReason = (action, reason) => {
  if (["CHANGES_REQUIRED", "REJECT", "SUSPEND", "MARK_DUPLICATE"].includes(action) && !reason) throw new ApiError(400, "VALIDATION_ERROR", "A reason is required for this moderation action");
};

const moderateProperty = asyncHandler(async (req, res) => {
  const property = await Property.findOne({ _id: req.validated.params.id, deletedAt: null });
  if (!property) throw new ApiError(404, "NOT_FOUND");
  const { action, reason = "", duplicateOf, verified } = req.validated.body;
  requireReason(action, reason);
  if (action === "MARK_DUPLICATE" && !duplicateOf) throw new ApiError(400, "VALIDATION_ERROR", "duplicateOf is required");
  if (action === "APPROVE" && !["PENDING_REVIEW", "CHANGES_REQUIRED", "REJECTED", "SUSPENDED"].includes(property.status)) throw new ApiError(409, "CONFLICT");
  const before = property.toObject();
  property.status = propertyActionMap[action];
  property.moderation = { reason, reviewedBy: req.user._id, reviewedAt: new Date(), duplicateOf };
  if (["APPROVE", "RESTORE"].includes(action)) {
    const settings = await getSettings();
    const now = new Date();
    property.expiresAt = dateFromDays(settings.listingExpiryDays);
    property.availabilityStatus = "AVAILABLE";
    property.publishedAt = property.publishedAt || now;
    property.lastAvailabilityConfirmedAt = now;
    property.freshnessDueAt = new Date(now.getTime() + 7 * 86400000);
    property.freshnessReminderSentAt = undefined;
    property.statusHistory.push({ status: "ACTIVE", availabilityStatus: "AVAILABLE", action: action === "RESTORE" ? "RESTORED" : "PUBLISHED", changedBy: req.user._id, changedAt: now });
  }
  if (verified !== undefined) property.verificationStatus = verified ? "VERIFIED" : "UNVERIFIED";
  await property.save();
  await Promise.all([
    audit({ req, action: `PROPERTY_${action}`, entityType: "PROPERTY", entityId: property._id, before, after: property.toObject() }),
    moderationNotification({ userId: property.ownerId, entityType: "PROPERTY", entityId: property._id, action: property.status, reason }),
  ]);
  return success(res, { code: "MODERATION_COMPLETED", data: property });
});

const moderateJob = asyncHandler(async (req, res) => {
  const job = await Job.findOne({ _id: req.validated.params.id, deletedAt: null });
  if (!job) throw new ApiError(404, "NOT_FOUND");
  const { action, reason = "" } = req.validated.body;
  requireReason(action, reason);
  if (action === "APPROVE" && !["PENDING_REVIEW", "CHANGES_REQUIRED", "REJECTED", "SUSPENDED"].includes(job.status)) throw new ApiError(409, "CONFLICT");
  const before = job.toObject();
  job.status = jobActionMap[action];
  job.moderation = { reason, reviewedBy: req.user._id, reviewedAt: new Date() };
  if (["APPROVE", "RESTORE"].includes(action)) {
    const settings = await getSettings();
    job.expiresAt = dateFromDays(settings.jobExpiryDays);
  }
  await job.save();
  await Promise.all([
    audit({ req, action: `JOB_${action}`, entityType: "JOB", entityId: job._id, before, after: job.toObject() }),
    moderationNotification({ userId: job.employerId, entityType: "JOB", entityId: job._id, action: job.status, reason }),
  ]);
  return success(res, { code: "MODERATION_COMPLETED", data: job });
});

const moderateHousingRequest = asyncHandler(async (req, res) => {
  const item = await HousingRequest.findOne({ _id: req.validated.params.id, deletedAt: null });
  if (!item) throw new ApiError(404, "NOT_FOUND");
  const { action, reason = "" } = req.validated.body;
  requireReason(action, reason);
  if (action === "APPROVE" && !["PENDING_REVIEW", "CHANGES_REQUIRED", "REJECTED", "SUSPENDED"].includes(item.status)) throw new ApiError(409, "CONFLICT");
  const before = item.toObject();
  item.status = requestActionMap[action];
  item.moderation = { reason, reviewedBy: req.user._id, reviewedAt: new Date() };
  if (["APPROVE", "RESTORE"].includes(action)) {
    const settings = await getSettings();
    item.expiresAt = dateFromDays(settings.requestExpiryDays);
  }
  await item.save();
  await Promise.all([
    audit({ req, action: `HOUSING_REQUEST_${action}`, entityType: "HOUSING_REQUEST", entityId: item._id, before, after: item.toObject() }),
    moderationNotification({ userId: item.requesterId, entityType: "HOUSING_REQUEST", entityId: item._id, action: item.status, reason }),
  ]);
  return success(res, { code: "MODERATION_COMPLETED", data: item });
});

const moderateWorkerProfile = asyncHandler(async (req, res) => {
  const item = await WorkerProfile.findOne({ _id: req.validated.params.id, deletedAt: null });
  if (!item) throw new ApiError(404, "NOT_FOUND");
  const { action, reason = "" } = req.validated.body;
  requireReason(action, reason);
  const actionMap = { APPROVE: "ACTIVE", CHANGES_REQUIRED: "CHANGES_REQUIRED", REJECT: "REJECTED", SUSPEND: "SUSPENDED", RESTORE: "ACTIVE" };
  const before = item.toObject();
  item.status = actionMap[action];
  item.moderation = { reason, reviewedBy: req.user._id, reviewedAt: new Date() };
  await item.save();
  await Promise.all([
    audit({ req, action: `WORKER_PROFILE_${action}`, entityType: "WORKER_PROFILE", entityId: item._id, before, after: item.toObject() }),
    moderationNotification({ userId: item.userId, entityType: "WORKER_PROFILE", entityId: item._id, action: item.status, reason }),
  ]);
  return success(res, { code: "MODERATION_COMPLETED", data: item });
});

const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.status) filter.accountStatus = req.query.status;
  if (req.query.role) filter.role = req.query.role;
  if (req.query.verification) filter["verification.identityStatus"] = req.query.verification;
  if (req.query.q) {
    const regex = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: regex }, { phone: regex }];
  }
  const [items, total] = await Promise.all([User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit), User.countDocuments(filter)]);
  const data = items.map((item) => {
    const value = item.toObject();
    value.verification = {
      identityStatus: value.verification?.identityStatus || "UNVERIFIED",
      submittedAt: value.verification?.submittedAt,
      reviewedAt: value.verification?.reviewedAt,
      rejectionReason: value.verification?.rejectionReason || "",
      documentsSubmitted: Boolean(value.verification?.nidFrontFile && value.verification?.nidBackFile && value.verification?.selfieFile),
    };
    return value;
  });
  return success(res, { data, meta: paginationMeta({ page, limit, total }) });
});

const updateUserStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.validated.params.id);
  if (!user) throw new ApiError(404, "NOT_FOUND");
  if (user.role === "SUPER_ADMIN" && req.user.role !== "SUPER_ADMIN") throw new ApiError(403, "FORBIDDEN");
  if (String(user._id) === String(req.user._id) && req.validated.body.status === "SUSPENDED") throw new ApiError(409, "CONFLICT");
  const before = user.toObject();
  user.accountStatus = req.validated.body.status;
  await user.save();
  await audit({ req, action: `USER_${user.accountStatus}`, entityType: "USER", entityId: user._id, before, after: user.toObject(), metadata: { reason: req.validated.body.reason } });
  return success(res, { code: "UPDATED", data: user });
});

const updateUserRole = asyncHandler(async (req, res) => {
  if (req.user.role !== "SUPER_ADMIN") throw new ApiError(403, "FORBIDDEN");
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, "NOT_FOUND");
  if (!req.body.role || !["USER", "MODERATOR", "ADMIN", "SUPER_ADMIN"].includes(req.body.role)) throw new ApiError(400, "VALIDATION_ERROR");
  if (String(user._id) === String(req.user._id) && req.body.role !== "SUPER_ADMIN") throw new ApiError(409, "CONFLICT");
  const before = user.toObject();
  user.role = req.body.role;
  await user.save();
  await audit({ req, action: "USER_ROLE_UPDATED", entityType: "USER", entityId: user._id, before, after: user.toObject() });
  return success(res, { code: "UPDATED", data: user });
});

const updateUserVerification = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, "NOT_FOUND");
  const { status, reason = "" } = req.validated.body;
  if (user.verification?.identityStatus !== "PENDING") throw new ApiError(409, "CONFLICT", "Only a pending KYC submission can be reviewed");
  if (!user.verification.nidFrontFile || !user.verification.nidBackFile || !user.verification.selfieFile) throw new ApiError(400, "VALIDATION_ERROR", "NID front, NID back and live photo are required");
  if (status === "REJECTED" && !reason) throw new ApiError(400, "VALIDATION_ERROR", "A rejection reason is required");
  const before = user.toObject();
  user.verification.identityStatus = status;
  user.verification.reviewedBy = req.user._id;
  user.verification.reviewedAt = new Date();
  user.verification.rejectionReason = status === "REJECTED" ? reason : "";
  await user.save();
  await Promise.all([
    audit({ req, action: `USER_VERIFICATION_${status}`, entityType: "USER", entityId: user._id, before, after: user.toObject(), metadata: { reason } }),
    createNotification({ userId: user._id, type: "KYC_REVIEWED", title: { en: `KYC ${status.toLowerCase()}`, bn: status === "VERIFIED" ? "KYC ভেরিফাই হয়েছে" : "KYC প্রত্যাখ্যাত হয়েছে" }, body: { en: status === "VERIFIED" ? "Your identity is now verified." : `Please resubmit your KYC. Reason: ${reason}`, bn: status === "VERIFIED" ? "আপনার পরিচয় এখন ভেরিফাইড।" : `আবার KYC জমা দিন। কারণ: ${reason}` }, data: { status, reason } }),
  ]);
  return success(res, { code: "UPDATED", data: user });
});

const getUserKycDocument = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select("verification");
  if (!user) throw new ApiError(404, "NOT_FOUND");
  const key = req.params.side === "front" ? "nidFrontFile" : req.params.side === "back" ? "nidBackFile" : req.params.side === "selfie" ? "selfieFile" : null;
  if (!key || !user.verification?.[key]) throw new ApiError(404, "NOT_FOUND");
  const filename = path.basename(user.verification[key]);
  if (filename !== user.verification[key]) throw new ApiError(404, "NOT_FOUND");
  return res.sendFile(filename, { root: key === "selfieFile" ? config.uploadDir : config.kycUploadDir, dotfiles: "deny" });
});

const listReports = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.entityType) filter.entityType = req.query.entityType;
  const [items, total] = await Promise.all([Report.find(filter).populate("reporterId", "name phone verification").sort({ createdAt: -1 }).skip(skip).limit(limit), Report.countDocuments(filter)]);
  return success(res, { data: items, meta: paginationMeta({ page, limit, total }) });
});

const resolveReport = asyncHandler(async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) throw new ApiError(404, "NOT_FOUND");
  if (!req.body.status || !["IN_REVIEW", "RESOLVED", "DISMISSED"].includes(req.body.status)) throw new ApiError(400, "VALIDATION_ERROR");
  const before = report.toObject();
  report.status = req.body.status;
  report.resolution = req.body.resolution || "";
  if (["RESOLVED", "DISMISSED"].includes(report.status)) {
    report.resolvedBy = req.user._id;
    report.resolvedAt = new Date();
  }
  await report.save();
  await audit({ req, action: `REPORT_${report.status}`, entityType: "REPORT", entityId: report._id, before, after: report.toObject() });
  return success(res, { code: "UPDATED", data: report });
});

const getPlatformSettings = asyncHandler(async (_req, res) => success(res, { data: await getSettings() }));

const updatePlatformSettings = asyncHandler(async (req, res) => {
  const allowed = ["listingExpiryDays", "jobExpiryDays", "requestExpiryDays", "maxPropertyImages", "jobCategories", "amenities", "featureFlags"];
  const patch = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
  if (!Object.keys(patch).length) throw new ApiError(400, "VALIDATION_ERROR");
  const before = await getSettings();
  const settings = await Setting.findOneAndUpdate({ key: "platform" }, { $set: patch }, { new: true, runValidators: true, upsert: true });
  await audit({ req, action: "SETTINGS_UPDATED", entityType: "SETTING", entityId: settings._id, before: before.toObject(), after: settings.toObject() });
  return success(res, { code: "UPDATED", data: settings });
});

const listAuditLogs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.action) filter.action = req.query.action;
  if (req.query.adminId) filter.adminId = req.query.adminId;
  const [items, total] = await Promise.all([AdminLog.find(filter).populate("adminId", "name phone role").sort({ createdAt: -1 }).skip(skip).limit(limit), AdminLog.countDocuments(filter)]);
  return success(res, { data: items, meta: paginationMeta({ page, limit, total }) });
});

module.exports = {
  dashboard,
  getPlatformSettings,
  getUserKycDocument,
  listAuditLogs,
  listJobs,
  listHousingRequests,
  listProperties,
  listReports,
  listUsers,
  listWorkerProfiles,
  moderateJob,
  moderateHousingRequest,
  moderateProperty,
  moderateWorkerProfile,
  resolveReport,
  updatePlatformSettings,
  updateUserRole,
  updateUserStatus,
  updateUserVerification,
};
