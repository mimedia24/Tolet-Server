const Property = require("../models/Property");
const VisitBooking = require("../models/VisitBooking");
const { createNotification } = require("../services/notificationService");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { cleanText } = require("../utils/content");
const { getPagination, paginationMeta } = require("../utils/query");
const { success } = require("../utils/response");

const createVisit = asyncHandler(async (req, res) => {
  const property = await Property.findOne({ _id: req.params.propertyId, status: "ACTIVE", deletedAt: null });
  if (!property) throw new ApiError(404, "NOT_FOUND");
  if (String(property.ownerId) === String(req.user._id)) throw new ApiError(409, "CONFLICT");
  const requestedAt = new Date(req.body.requestedAt);
  if (!Number.isFinite(requestedAt.getTime()) || requestedAt <= new Date()) throw new ApiError(400, "VALIDATION_ERROR");
  const booking = await VisitBooking.create({ propertyId: property._id, visitorId: req.user._id, ownerId: property.ownerId, requestedAt, note: cleanText(req.body.note || "") });
  await createNotification({
    userId: property.ownerId,
    type: "VISIT_REQUEST",
    title: { en: "New property visit request", bn: "নতুন প্রপার্টি ভিজিটের অনুরোধ" },
    body: { en: "A user requested a property visit.", bn: "একজন ব্যবহারকারী প্রপার্টি ভিজিটের অনুরোধ করেছেন।" },
    data: { propertyId: property._id, bookingId: booking._id },
  });
  return success(res, { status: 201, code: "VISIT_BOOKED", data: booking });
});

const listVisits = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = req.query.as === "owner" ? { ownerId: req.user._id } : { visitorId: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([VisitBooking.find(filter).populate("propertyId", "translations media location status").sort({ requestedAt: -1 }).skip(skip).limit(limit), VisitBooking.countDocuments(filter)]);
  return success(res, { data: items, meta: paginationMeta({ page, limit, total }) });
});

const updateVisit = asyncHandler(async (req, res) => {
  const booking = await VisitBooking.findById(req.params.id);
  if (!booking) throw new ApiError(404, "NOT_FOUND");
  const isOwner = String(booking.ownerId) === String(req.user._id);
  const isVisitor = String(booking.visitorId) === String(req.user._id);
  if (!isOwner && !isVisitor) throw new ApiError(403, "FORBIDDEN");
  const allowed = isOwner ? ["CONFIRMED", "RESCHEDULED", "COMPLETED", "REJECTED", "CANCELLED"] : ["CANCELLED"];
  if (!allowed.includes(req.body.status)) throw new ApiError(400, "VALIDATION_ERROR");
  booking.status = req.body.status;
  if (req.body.requestedAt && isOwner) {
    const requestedAt = new Date(req.body.requestedAt);
    if (!Number.isFinite(requestedAt.getTime()) || requestedAt <= new Date()) throw new ApiError(400, "VALIDATION_ERROR");
    booking.requestedAt = requestedAt;
  }
  if (req.body.ownerNote && isOwner) booking.ownerNote = cleanText(req.body.ownerNote);
  await booking.save();
  return success(res, { code: "UPDATED", data: booking });
});

module.exports = { createVisit, listVisits, updateVisit };
