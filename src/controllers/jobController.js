const Job = require("../models/Job");
const JobApplication = require("../models/JobApplication");
const User = require("../models/User");
const { getSettings } = require("../services/settingsService");
const { createNotification } = require("../services/notificationService");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { cleanLocalized, cleanText, localize } = require("../utils/content");
const { normalizeBangladeshPhone } = require("../utils/phone");
const { dateFromDays, getPagination, paginationMeta } = require("../utils/query");
const { success } = require("../utils/response");
const { assertTransition, employerJobTransitions } = require("../utils/status");

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const language = (req) => req.res?.locals?.language || "en";

const preparePayload = (body) => {
  const payload = { ...body };
  if (body.translations) payload.translations = cleanLocalized(body.translations);
  if (body.location) {
    payload.location = {
      district: cleanText(body.location.district),
      address: cleanText(body.location.address),
      city: "",
      area: "",
      exactPublic: true,
      ...(Number.isFinite(body.location.longitude) && Number.isFinite(body.location.latitude)
        ? { point: { type: "Point", coordinates: [body.location.longitude, body.location.latitude] } }
        : {}),
    };
  }
  if (body.applicationDeadline) payload.applicationDeadline = new Date(body.applicationDeadline);
  if (body.employerName) payload.employerName = cleanText(body.employerName);
  if (body.workingHours) payload.workingHours = cleanText(body.workingHours);
  if (body.benefits) payload.benefits = [...new Set(body.benefits.map(cleanText))];
  return payload;
};

const serialize = (job, req, { ownerView = false } = {}) => {
  const result = localize(job, language(req), { includeTranslations: ownerView || req.query.includeTranslations === "true" });
  if (result.employerId?.verification) result.employerId.verification = { identityStatus: result.employerId.verification.identityStatus || "UNVERIFIED" };
  if (!ownerView) delete result.deletedAt;
  return result;
};

const findOwned = async (id, userId) => {
  const job = await Job.findOne({ _id: id, employerId: userId, deletedAt: null });
  if (!job) throw new ApiError(404, "NOT_FOUND");
  return job;
};

const createJob = asyncHandler(async (req, res) => {
  const job = await Job.create({ ...preparePayload(req.validated.body), employerId: req.user._id, status: "DRAFT" });
  return success(res, { status: 201, code: "JOB_CREATED", data: serialize(job, req, { ownerView: true }) });
});

const buildPublicFilter = (query) => {
  const filter = { status: "ACTIVE", deletedAt: null, expiresAt: { $gt: new Date() }, applicationDeadline: { $gte: new Date() } };
  if (query.category) filter.category = { $in: String(query.category).split(",") };
  if (query.jobType) filter.jobType = { $in: String(query.jobType).split(",") };
  if (query.district) filter["location.district"] = new RegExp(`^${escapeRegex(query.district)}$`, "i");
  if (query.lat && query.lng) {
    const latitude = Number(query.lat);
    const longitude = Number(query.lng);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      filter["location.point"] = {
        $near: {
          $geometry: { type: "Point", coordinates: [longitude, latitude] },
          $maxDistance: Math.min(Number(query.radiusKm || 25), 100) * 1000,
        },
      };
    }
  }
  if (query.minSalary || query.maxSalary) {
    filter["salary.disclosed"] = true;
    const values = [];
    if (query.minSalary) values.push({ "salary.amount": { $gte: Number(query.minSalary) } }, { "salary.max": { $gte: Number(query.minSalary) } });
    if (query.maxSalary) values.push({ "salary.amount": { $lte: Number(query.maxSalary) } }, { "salary.min": { $lte: Number(query.maxSalary) } });
    if (values.length) filter.$and = values.map((value) => ({ $or: [value] }));
  }
  if (query.q) {
    const regex = new RegExp(escapeRegex(query.q), "i");
    filter.$or = [
      { "translations.en.title": regex }, { "translations.bn.title": regex },
      { "translations.en.description": regex }, { "translations.bn.description": regex },
      { employerName: regex }, { "location.address": regex }, { "location.district": regex },
    ];
  }
  return filter;
};

const listJobs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = buildPublicFilter(req.query);
  if (req.query.verifiedEmployer === "true") {
    const verifiedEmployerIds = await User.distinct("_id", { "verification.identityStatus": "VERIFIED", accountStatus: "ACTIVE" });
    filter.employerId = { $in: verifiedEmployerIds };
  }
  const sortMap = { newest: { createdAt: -1 }, salary_low: { "salary.amount": 1, "salary.min": 1 }, salary_high: { "salary.amount": -1, "salary.max": -1 } };
  const nearby = Boolean(filter["location.point"]?.$near);
  const query = Job.find(filter).populate("employerId", "name avatarUrl verification.identityStatus").skip(skip).limit(limit);
  if (!nearby) query.sort(sortMap[req.query.sort] || sortMap.newest);
  const [items, total] = nearby ? [await query, null] : await Promise.all([query, Job.countDocuments(filter)]);
  return success(res, { data: items.map((item) => serialize(item, req)), meta: total === null ? { page, limit, total: null } : paginationMeta({ page, limit, total }) });
});

const getJob = asyncHandler(async (req, res) => {
  const filter = { _id: req.validated.params.id, deletedAt: null };
  const canSeePrivate = req.user && ["ADMIN", "MODERATOR", "SUPER_ADMIN"].includes(req.user.role);
  if (!canSeePrivate) filter.$or = [{ status: "ACTIVE" }, ...(req.user ? [{ employerId: req.user._id }] : [])];
  const job = await Job.findOne(filter).populate("employerId", "name avatarUrl verification.identityStatus");
  if (!job) throw new ApiError(404, "NOT_FOUND");
  if (!req.user || String(job.employerId._id || job.employerId) !== String(req.user._id)) await Job.updateOne({ _id: job._id }, { $inc: { "stats.views": 1 } });
  const ownerView = req.user && String(job.employerId._id || job.employerId) === String(req.user._id);
  return success(res, { data: serialize(job, req, { ownerView }) });
});

const updateJob = asyncHandler(async (req, res) => {
  const job = await findOwned(req.validated.params.id, req.user._id);
  if (["FILLED", "CLOSED", "SUSPENDED"].includes(job.status)) throw new ApiError(409, "CONFLICT");
  Object.assign(job, preparePayload(req.validated.body));
  if (job.status === "ACTIVE") {
    job.status = "PENDING_REVIEW";
    job.moderation.reason = "Updated by employer; re-review required";
  }
  await job.save();
  return success(res, { code: "UPDATED", data: serialize(job, req, { ownerView: true }) });
});

const deleteJob = asyncHandler(async (req, res) => {
  const job = await findOwned(req.validated.params.id, req.user._id);
  job.deletedAt = new Date();
  await job.save();
  return success(res, { code: "DELETED" });
});

const submitJob = asyncHandler(async (req, res) => {
  const job = await findOwned(req.validated.params.id, req.user._id);
  if (!["DRAFT", "CHANGES_REQUIRED", "REJECTED", "EXPIRED"].includes(job.status)) throw new ApiError(409, "CONFLICT");
  if (job.applicationDeadline <= new Date()) throw new ApiError(400, "VALIDATION_ERROR", "Application deadline must be in the future");
  job.status = "PENDING_REVIEW";
  job.moderation.reason = "";
  await job.save();
  return success(res, { code: "JOB_SUBMITTED", data: serialize(job, req, { ownerView: true }) });
});

const updateOwnerStatus = asyncHandler(async (req, res) => {
  const job = await findOwned(req.validated.params.id, req.user._id);
  assertTransition(job.status, req.validated.body.status, employerJobTransitions);
  job.status = req.validated.body.status;
  await job.save();
  return success(res, { code: "UPDATED", data: serialize(job, req, { ownerView: true }) });
});

const getMyJobs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { employerId: req.user._id, deletedAt: null };
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([Job.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit), Job.countDocuments(filter)]);
  return success(res, { data: items.map((item) => serialize(item, req, { ownerView: true })), meta: paginationMeta({ page, limit, total }) });
});

const apply = asyncHandler(async (req, res) => {
  const job = await Job.findOne({ _id: req.validated.params.id, status: "ACTIVE", deletedAt: null, applicationDeadline: { $gte: new Date() } });
  if (!job) throw new ApiError(404, "NOT_FOUND");
  if (String(job.employerId) === String(req.user._id)) throw new ApiError(409, "CONFLICT", "Employers cannot apply to their own job");
  const body = req.validated.body;
  const application = await JobApplication.create({
    jobId: job._id,
    applicantId: req.user._id,
    employerId: job.employerId,
    applicantName: cleanText(body.applicantName),
    phone: normalizeBangladeshPhone(body.phone),
    experienceSummary: cleanText(body.experienceSummary || ""),
    expectedAvailability: new Date(body.expectedAvailability),
    cvUrl: body.cvUrl || "",
    statusHistory: [{ status: "APPLIED", changedBy: req.user._id }],
  }).catch((error) => {
    if (error.code === 11000) throw new ApiError(409, "APPLICATION_DUPLICATE");
    throw error;
  });
  await Job.updateOne({ _id: job._id }, { $inc: { "stats.applications": 1 } });
  await createNotification({
    userId: job.employerId,
    type: "JOB_APPLICATION",
    title: { en: "New job application", bn: "নতুন চাকরির আবেদন" },
    body: { en: `${application.applicantName} applied to your job.`, bn: `${application.applicantName} আপনার চাকরিতে আবেদন করেছেন।` },
    data: { jobId: job._id, applicationId: application._id },
  });
  return success(res, { status: 201, code: "APPLICATION_SUBMITTED", data: application });
});

const getApplicants = asyncHandler(async (req, res) => {
  const job = await findOwned(req.params.id, req.user._id);
  const { page, limit, skip } = getPagination(req.query);
  const filter = { jobId: job._id };
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([JobApplication.find(filter).populate("applicantId", "name avatarUrl verification.identityStatus").sort({ createdAt: -1 }).skip(skip).limit(limit), JobApplication.countDocuments(filter)]);
  return success(res, { data: items, meta: paginationMeta({ page, limit, total }) });
});

const updateApplicationStatus = asyncHandler(async (req, res) => {
  const application = await JobApplication.findOne({ _id: req.validated.params.applicationId, employerId: req.user._id });
  if (!application) throw new ApiError(404, "NOT_FOUND");
  const allowed = ["VIEWED", "SHORTLISTED", "HIRED", "REJECTED"];
  if (!allowed.includes(req.validated.body.status)) throw new ApiError(400, "VALIDATION_ERROR");
  application.status = req.validated.body.status;
  application.statusHistory.push({ status: application.status, changedBy: req.user._id });
  await application.save();
  await createNotification({
    userId: application.applicantId,
    type: "APPLICATION_STATUS",
    title: { en: "Application status updated", bn: "আবেদনের অবস্থা হালনাগাদ হয়েছে" },
    body: { en: `Your application is now ${application.status}.`, bn: `আপনার আবেদনের অবস্থা এখন ${application.status}।` },
    data: { jobId: application.jobId, applicationId: application._id, status: application.status },
  });
  return success(res, { code: "UPDATED", data: application });
});

const getMyApplications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { applicantId: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([JobApplication.find(filter).populate("jobId", "translations category employerName status").sort({ createdAt: -1 }).skip(skip).limit(limit), JobApplication.countDocuments(filter)]);
  return success(res, { data: items, meta: paginationMeta({ page, limit, total }) });
});

const withdrawApplication = asyncHandler(async (req, res) => {
  const application = await JobApplication.findOne({ _id: req.params.applicationId, applicantId: req.user._id });
  if (!application) throw new ApiError(404, "NOT_FOUND");
  if (["HIRED", "REJECTED", "WITHDRAWN"].includes(application.status)) throw new ApiError(409, "CONFLICT");
  application.status = "WITHDRAWN";
  application.statusHistory.push({ status: "WITHDRAWN", changedBy: req.user._id });
  await application.save();
  return success(res, { code: "UPDATED", data: application });
});

const getContact = asyncHandler(async (req, res) => {
  const job = await Job.findOne({ _id: req.params.id, status: "ACTIVE", deletedAt: null }).populate("employerId", "name phone avatarUrl verification.identityStatus");
  if (!job) throw new ApiError(404, "NOT_FOUND");
  return success(res, { data: { employer: { id: job.employerId._id, name: job.employerName, avatarUrl: job.employerId.avatarUrl, verification: job.employerId.verification, phone: job.contactMethod === "IN_APP" ? null : job.employerId.phone }, contactMethod: job.contactMethod } });
});

const setApprovalExpiry = async (job) => {
  const settings = await getSettings();
  job.expiresAt = dateFromDays(settings.jobExpiryDays);
};

module.exports = {
  apply,
  createJob,
  deleteJob,
  getApplicants,
  getContact,
  getJob,
  getMyApplications,
  getMyJobs,
  listJobs,
  serialize,
  setApprovalExpiry,
  submitJob,
  updateApplicationStatus,
  updateJob,
  updateOwnerStatus,
  withdrawApplication,
};
