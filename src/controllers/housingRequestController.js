const HousingOffer = require("../models/HousingOffer");
const HousingRequest = require("../models/HousingRequest");
const Property = require("../models/Property");
const { getSettings } = require("../services/settingsService");
const { createNotification } = require("../services/notificationService");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { cleanLocalized, cleanText, localize } = require("../utils/content");
const { dateFromDays, getPagination, paginationMeta } = require("../utils/query");
const { success } = require("../utils/response");

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const language = (req) => req.res?.locals?.language || "en";

const prepare = (body) => {
  const payload = { ...body };
  if (body.translations) payload.translations = cleanLocalized(body.translations);
  if (body.preferredLocations) payload.preferredLocations = body.preferredLocations.map((item) => ({ city: cleanText(item.city), area: cleanText(item.area) }));
  if (body.searchCenter?.latitude !== undefined && body.searchCenter?.longitude !== undefined) {
    payload.searchCenter = { type: "Point", coordinates: [body.searchCenter.longitude, body.searchCenter.latitude] };
  } else if (body.searchCenter === null) {
    payload.searchCenter = undefined;
  }
  if (body.moveInDate) payload.moveInDate = new Date(body.moveInDate);
  if (body.amenities) payload.amenities = [...new Set(body.amenities)];
  return payload;
};

const serialize = (item, req, ownerView = false) => localize(item, language(req), { includeTranslations: ownerView || req.query.includeTranslations === "true" });

const owned = async (id, userId) => {
  const item = await HousingRequest.findOne({ _id: id, requesterId: userId, deletedAt: null });
  if (!item) throw new ApiError(404, "NOT_FOUND");
  return item;
};

const create = asyncHandler(async (req, res) => {
  const item = await HousingRequest.create({ ...prepare(req.validated.body), requesterId: req.user._id, status: "DRAFT" });
  return success(res, { status: 201, code: "HOUSING_REQUEST_CREATED", data: serialize(item, req, true) });
});

const update = asyncHandler(async (req, res) => {
  const item = await owned(req.validated.params.id, req.user._id);
  if (["FULFILLED", "SUSPENDED"].includes(item.status)) throw new ApiError(409, "CONFLICT");
  Object.assign(item, prepare(req.validated.body));
  if (["ACTIVE", "MATCHED"].includes(item.status)) {
    item.status = "PENDING_REVIEW";
    item.moderation.reason = "Updated by requester; re-review required";
  }
  await item.save();
  return success(res, { code: "UPDATED", data: serialize(item, req, true) });
});

const submit = asyncHandler(async (req, res) => {
  const item = await owned(req.validated.params.id, req.user._id);
  if (!["DRAFT", "CHANGES_REQUIRED", "REJECTED", "EXPIRED"].includes(item.status)) throw new ApiError(409, "CONFLICT");
  if (item.moveInDate < new Date(Date.now() - 86400000)) throw new ApiError(400, "VALIDATION_ERROR", "Move-in date cannot be in the past");
  item.status = "PENDING_REVIEW";
  item.moderation.reason = "";
  await item.save();
  return success(res, { code: "HOUSING_REQUEST_SUBMITTED", data: serialize(item, req, true) });
});

const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { status: "ACTIVE", deletedAt: null, expiresAt: { $gt: new Date() } };
  if (req.query.kind) filter.kind = req.query.kind;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.tenantType) filter.tenantType = req.query.tenantType;
  if (req.query.city) filter["preferredLocations.city"] = new RegExp(`^${escapeRegex(req.query.city)}$`, "i");
  if (req.query.area) filter["preferredLocations.area"] = new RegExp(escapeRegex(req.query.area), "i");
  if (req.query.maxBudget) filter["budget.max"] = { $lte: Number(req.query.maxBudget) };
  if (req.query.q) {
    const regex = new RegExp(escapeRegex(req.query.q), "i");
    filter.$or = [{ "translations.en.title": regex }, { "translations.bn.title": regex }, { "translations.en.description": regex }, { "translations.bn.description": regex }, { "preferredLocations.area": regex }, { "preferredLocations.city": regex }];
  }
  if (req.query.lat && req.query.lng) {
    filter.searchCenter = { $near: { $geometry: { type: "Point", coordinates: [Number(req.query.lng), Number(req.query.lat)] }, $maxDistance: Math.min(Number(req.query.radiusKm || 20), 100) * 1000 } };
  }
  const query = HousingRequest.find(filter).populate("requesterId", "name avatarUrl verification.identityStatus").skip(skip).limit(limit);
  if (!filter.searchCenter) query.sort({ createdAt: -1 });
  const [items, total] = filter.searchCenter ? [await query, null] : await Promise.all([query, HousingRequest.countDocuments(filter)]);
  return success(res, { data: items.map((item) => serialize(item, req)), meta: paginationMeta({ page, limit, total }) });
});

const getOne = asyncHandler(async (req, res) => {
  const filter = { _id: req.validated.params.id, deletedAt: null };
  const privileged = req.user && ["MODERATOR", "ADMIN", "SUPER_ADMIN"].includes(req.user.role);
  if (!privileged) filter.$or = [{ status: "ACTIVE" }, ...(req.user ? [{ requesterId: req.user._id }] : [])];
  const item = await HousingRequest.findOne(filter).populate("requesterId", "name avatarUrl verification.identityStatus");
  if (!item) throw new ApiError(404, "NOT_FOUND");
  if (!req.user || String(item.requesterId?._id || item.requesterId) !== String(req.user._id)) await HousingRequest.updateOne({ _id: item._id }, { $inc: { "stats.views": 1 } });
  return success(res, { data: serialize(item, req, req.user && String(item.requesterId?._id || item.requesterId) === String(req.user._id)) });
});

const mine = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { requesterId: req.user._id, deletedAt: null };
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([HousingRequest.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit), HousingRequest.countDocuments(filter)]);
  return success(res, { data: items.map((item) => serialize(item, req, true)), meta: paginationMeta({ page, limit, total }) });
});

const remove = asyncHandler(async (req, res) => {
  const item = await owned(req.validated.params.id, req.user._id);
  item.deletedAt = new Date();
  await item.save();
  return success(res, { code: "DELETED" });
});

const setStatus = asyncHandler(async (req, res) => {
  const item = await owned(req.validated.params.id, req.user._id);
  if (!["MATCHED", "FULFILLED"].includes(req.validated.body.status) || !["ACTIVE", "MATCHED"].includes(item.status)) throw new ApiError(409, "CONFLICT");
  item.status = req.validated.body.status;
  await item.save();
  return success(res, { code: "UPDATED", data: serialize(item, req, true) });
});

const createOffer = asyncHandler(async (req, res) => {
  const request = await HousingRequest.findOne({ _id: req.validated.params.id, status: "ACTIVE", deletedAt: null, expiresAt: { $gt: new Date() } });
  if (!request) throw new ApiError(404, "NOT_FOUND");
  if (String(request.requesterId) === String(req.user._id)) throw new ApiError(409, "CONFLICT");
  const property = await Property.findOne({ _id: req.validated.body.propertyId, ownerId: req.user._id, status: "ACTIVE", deletedAt: null });
  if (!property) throw new ApiError(404, "NOT_FOUND", "Active property not found");
  const offer = await HousingOffer.create({ requestId: request._id, propertyId: property._id, ownerId: req.user._id, requesterId: request.requesterId, message: cleanText(req.validated.body.message || "") }).catch((error) => {
    if (error.code === 11000) throw new ApiError(409, "CONFLICT", "This property has already been offered");
    throw error;
  });
  await HousingRequest.updateOne({ _id: request._id }, { $inc: { "stats.offers": 1 } });
  await createNotification({ userId: request.requesterId, type: "HOUSING_OFFER", title: { en: "New property offer", bn: "নতুন প্রপার্টি অফার" }, body: { en: "A property owner responded to your housing request.", bn: "একজন প্রপার্টি মালিক আপনার বাসার অনুরোধে সাড়া দিয়েছেন।" }, data: { requestId: request._id, propertyId: property._id, offerId: offer._id } });
  return success(res, { status: 201, code: "OFFER_SENT", data: offer });
});

const listOffers = asyncHandler(async (req, res) => {
  const request = await owned(req.params.id, req.user._id);
  const items = await HousingOffer.find({ requestId: request._id }).populate("propertyId", "translations rent media location tenantTypes status").populate("ownerId", "name avatarUrl verification.identityStatus").sort({ createdAt: -1 });
  await HousingOffer.updateMany({ requestId: request._id, status: "SENT" }, { $set: { status: "VIEWED" } });
  return success(res, { data: items });
});

const updateOffer = asyncHandler(async (req, res) => {
  const offer = await HousingOffer.findById(req.validated.params.offerId);
  if (!offer) throw new ApiError(404, "NOT_FOUND");
  const next = req.validated.body.status;
  const requesterAction = String(offer.requesterId) === String(req.user._id) && ["ACCEPTED", "DECLINED"].includes(next);
  const ownerAction = String(offer.ownerId) === String(req.user._id) && next === "WITHDRAWN";
  if (!requesterAction && !ownerAction) throw new ApiError(403, "FORBIDDEN");
  if (["ACCEPTED", "DECLINED", "WITHDRAWN"].includes(offer.status)) throw new ApiError(409, "CONFLICT");
  offer.status = next;
  await offer.save();
  if (next === "ACCEPTED") await HousingRequest.updateOne({ _id: offer.requestId, status: "ACTIVE" }, { $set: { status: "MATCHED" } });
  await createNotification({ userId: requesterAction ? offer.ownerId : offer.requesterId, type: "HOUSING_OFFER_STATUS", title: { en: "Housing offer updated", bn: "বাসার অফার হালনাগাদ" }, body: { en: `Offer status is now ${next}.`, bn: `অফারের অবস্থা এখন ${next}।` }, data: { requestId: offer.requestId, offerId: offer._id, status: next } });
  return success(res, { code: "UPDATED", data: offer });
});

const setApprovalExpiry = async (item) => {
  const settings = await getSettings();
  item.expiresAt = dateFromDays(settings.requestExpiryDays || settings.listingExpiryDays);
};

module.exports = { create, createOffer, getOne, list, listOffers, mine, remove, setApprovalExpiry, setStatus, submit, update, updateOffer };
