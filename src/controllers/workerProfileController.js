const HireInvitation = require("../models/HireInvitation");
const Job = require("../models/Job");
const WorkerProfile = require("../models/WorkerProfile");
const User = require("../models/User");
const { createNotification } = require("../services/notificationService");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { cleanText } = require("../utils/content");
const { getPagination, paginationMeta } = require("../utils/query");
const { success } = require("../utils/response");

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const prepare = (body) => ({
  ...body,
  title: cleanText(body.title),
  bio: cleanText(body.bio),
  skills: [...new Set((body.skills || []).map(cleanText).filter(Boolean))],
  serviceAreas: body.serviceAreas.map((item) => ({ district: cleanText(item.district), city: cleanText(item.city || item.district), area: cleanText(item.area) })),
  availableFrom: body.availableFrom ? new Date(body.availableFrom) : undefined,
  location: body.location ? { type: "Point", coordinates: [body.location.longitude, body.location.latitude] } : undefined,
});

const saveMine = asyncHandler(async (req, res) => {
  const payload = prepare(req.validated.body);
  const existing = await WorkerProfile.findOne({ userId: req.user._id, deletedAt: null });
  payload.status = "ACTIVE";
  payload.moderation = {reason: ""};
  const item = await WorkerProfile.findOneAndUpdate(
    { userId: req.user._id, deletedAt: null },
    { $set: payload, $setOnInsert: { userId: req.user._id } },
    { new: true, upsert: true, runValidators: true }
  );
  return success(res, { status: existing ? 200 : 201, code: existing ? "UPDATED" : "CREATED", data: item });
});

const getMine = asyncHandler(async (req, res) => {
  const item = await WorkerProfile.findOne({ userId: req.user._id, deletedAt: null });
  return success(res, { data: item });
});

const submitMine = asyncHandler(async (req, res) => {
  const item = await WorkerProfile.findOne({ userId: req.user._id, deletedAt: null });
  if (!item) throw new ApiError(404, "NOT_FOUND");
  if (item.status === "ACTIVE")
    return success(res, { code: "PUBLISHED", data: item });
  if (!["DRAFT", "PENDING_REVIEW", "CHANGES_REQUIRED", "REJECTED", "PAUSED"].includes(item.status)) throw new ApiError(409, "CONFLICT");
  item.status = "ACTIVE";
  item.moderation.reason = "";
  await item.save();
  return success(res, { code: "PUBLISHED", data: item });
});

const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { status: "ACTIVE", deletedAt: null };
  if (req.query.category) filter.categories = req.query.category;
  if (req.query.district) filter["serviceAreas.district"] = new RegExp(`^${escapeRegex(req.query.district)}$`, "i");
  if (req.query.city) filter["serviceAreas.city"] = new RegExp(`^${escapeRegex(req.query.city)}$`, "i");
  if (req.query.area) filter["serviceAreas.area"] = new RegExp(escapeRegex(req.query.area), "i");
  if (req.query.workMode) filter.workMode = req.query.workMode;
  if (req.query.jobType) filter.jobType = req.query.jobType;
  if (req.query.verified === "true") {
    const verifiedUserIds = await User.distinct("_id", { "verification.identityStatus": "VERIFIED", accountStatus: "ACTIVE" });
    filter.userId = { $in: verifiedUserIds };
  }
  if (req.query.q) {
    const regex = new RegExp(escapeRegex(req.query.q), "i");
    filter.$or = [{ title: regex }, { bio: regex }, { skills: regex }, { "serviceAreas.area": regex }, { "serviceAreas.district": regex }];
  }
  if (req.query.lat && req.query.lng) filter.location = { $near: { $geometry: { type: "Point", coordinates: [Number(req.query.lng), Number(req.query.lat)] }, $maxDistance: Math.min(Number(req.query.radiusKm || 25), 100) * 1000 } };
  const query = WorkerProfile.find(filter).populate("userId", "name avatarUrl verification.identityStatus").skip(skip).limit(limit);
  if (!(req.query.lat && req.query.lng)) query.sort({ createdAt: -1 });
  const [items, total] = req.query.lat && req.query.lng ? [await query, null] : await Promise.all([query, WorkerProfile.countDocuments(filter)]);
  return success(res, { data: items, meta: total === null ? { page, limit, total: null } : paginationMeta({ page, limit, total }) });
});

const getOne = asyncHandler(async (req, res) => {
  const item = await WorkerProfile.findOne({ _id: req.validated.params.id, status: "ACTIVE", deletedAt: null }).populate("userId", "name avatarUrl verification.identityStatus");
  if (!item) throw new ApiError(404, "NOT_FOUND");
  await WorkerProfile.updateOne({ _id: item._id }, { $inc: { "stats.views": 1 } });
  return success(res, { data: item });
});

const invite = asyncHandler(async (req, res) => {
  const profile = await WorkerProfile.findOne({ _id: req.validated.params.id, status: "ACTIVE", deletedAt: null });
  if (!profile) throw new ApiError(404, "NOT_FOUND");
  if (String(profile.userId) === String(req.user._id)) throw new ApiError(409, "CONFLICT");
  const { jobId, message = "", proposedSalary } = req.validated.body;
  if (jobId && !(await Job.exists({ _id: jobId, employerId: req.user._id, status: "ACTIVE", deletedAt: null }))) throw new ApiError(404, "NOT_FOUND", "Active job not found");
  const item = await HireInvitation.create({ workerProfileId: profile._id, workerId: profile.userId, employerId: req.user._id, jobId, message: cleanText(message), proposedSalary, statusHistory: [{ status: "SENT", changedBy: req.user._id }] }).catch((error) => {
    if (error.code === 11000) throw new ApiError(409, "CONFLICT", "Hire invitation already sent");
    throw error;
  });
  await WorkerProfile.updateOne({ _id: profile._id }, { $inc: { "stats.invitations": 1 } });
  const notification = await createNotification({ userId: profile.userId, type: "HIRE_INVITATION", title: { en: "New hire invitation", bn: "নতুন নিয়োগ আমন্ত্রণ" }, body: { en: "An employer wants to hire you.", bn: "একজন নিয়োগকর্তা আপনাকে নিয়োগ দিতে চান।" }, data: { invitationId: item._id, workerProfileId: profile._id, jobId } });
  req.app.get("io")?.to(`user:${profile.userId}`).emit("notification:new", notification);
  return success(res, { status: 201, code: "HIRE_INVITATION_SENT", data: item });
});

const listInvitations = asyncHandler(async (req, res) => {
  const role = req.query.role === "employer" ? "employer" : "worker";
  const filter = role === "employer" ? { employerId: req.user._id } : { workerId: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  if (role === "worker") {
    await HireInvitation.updateMany(
      { ...filter, status: "SENT" },
      { $set: { status: "VIEWED" }, $push: { statusHistory: { status: "VIEWED", changedBy: req.user._id, changedAt: new Date() } } }
    );
  }
  const items = await HireInvitation.find(filter)
    .populate("workerProfileId", "title categories")
    .populate("jobId", "translations employerName status")
    .populate("employerId", "name avatarUrl verification.identityStatus phone")
    .populate("workerId", "name avatarUrl verification.identityStatus phone")
    .sort({ updatedAt: -1 })
    .limit(100);
  const summaryRows = await HireInvitation.aggregate([{ $match: role === "employer" ? { employerId: req.user._id } : { workerId: req.user._id } }, { $group: { _id: "$status", count: { $sum: 1 } } }]);
  return success(res, { data: items, meta: { role, counts: Object.fromEntries(summaryRows.map((row) => [row._id, row.count])) } });
});

const updateInvitation = asyncHandler(async (req, res) => {
  const item = await HireInvitation.findById(req.validated.params.invitationId);
  if (!item) throw new ApiError(404, "NOT_FOUND");
  const next = req.validated.body.status;
  const isWorkerAction = ["ACCEPTED", "DECLINED"].includes(next) && String(item.workerId) === String(req.user._id);
  const isEmployerAction = next === "WITHDRAWN" && String(item.employerId) === String(req.user._id);
  if (!isWorkerAction && !isEmployerAction) throw new ApiError(403, "FORBIDDEN");
  if (!["SENT", "VIEWED"].includes(item.status)) throw new ApiError(409, "CONFLICT");
  item.status = next;
  item.statusHistory.push({ status: next, changedBy: req.user._id });
  await item.save();
  if (next === "ACCEPTED") await WorkerProfile.updateOne({ _id: item.workerProfileId }, { $inc: { "stats.hires": 1 } });
  const recipient = isWorkerAction ? item.employerId : item.workerId;
  const notification = await createNotification({ userId: recipient, type: "HIRE_INVITATION", title: { en: "Hire invitation updated", bn: "নিয়োগ আমন্ত্রণ হালনাগাদ" }, body: { en: `Invitation is ${next.toLowerCase()}.`, bn: `আমন্ত্রণের অবস্থা: ${next}` }, data: { invitationId: item._id, status: next } });
  req.app.get("io")?.to(`user:${recipient}`).emit("notification:new", notification);
  return success(res, { code: "UPDATED", data: item });
});

module.exports = { getMine, getOne, invite, list, listInvitations, saveMine, submitMine, updateInvitation };
