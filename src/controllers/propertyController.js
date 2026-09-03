const Property = require("../models/Property");
const Favorite = require("../models/Favorite");
const PropertyLike = require("../models/PropertyLike");
const { getSettings } = require("../services/settingsService");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { cleanLocalized, cleanText, localize } = require("../utils/content");
const { dateFromDays, getPagination, paginationMeta } = require("../utils/query");
const { success } = require("../utils/response");
const { normalizeEntityMedia } = require("../utils/mediaUrl");

const FRESHNESS_DAYS = 7;
const freshnessDate = () => new Date(Date.now() + FRESHNESS_DAYS * 86400000);
const pushHistory = (property, { status = property.status, availabilityStatus = property.availabilityStatus, action, note = "", changedBy }) => {
  property.statusHistory.push({ status, availabilityStatus, action, note: cleanText(note), changedBy, changedAt: new Date() });
};
const confirmAvailability = (property, { changedBy, republish = false, action = "AVAILABILITY_CONFIRMED", note = "" } = {}) => {
  const now = new Date();
  property.availabilityStatus = "AVAILABLE";
  property.lastAvailabilityConfirmedAt = now;
  property.freshnessDueAt = freshnessDate();
  property.freshnessReminderSentAt = undefined;
  if (republish || !property.publishedAt) property.publishedAt = now;
  pushHistory(property, { status: property.status, availabilityStatus: "AVAILABLE", action, note, changedBy });
};

const toLocation = (location) => ({
  division: cleanText(location.division),
  district: cleanText(location.district),
  city: cleanText(location.city),
  area: cleanText(location.area),
  address: cleanText(location.address),
  exactPublic: location.exactPublic,
  point: { type: "Point", coordinates: [location.longitude, location.latitude] },
});

const preparePayload = (body) => {
  const payload = { ...body };
  if (body.translations) payload.translations = cleanLocalized(body.translations);
  if (body.location) payload.location = toLocation(body.location);
  if (body.availableFrom) payload.availableFrom = new Date(body.availableFrom);
  if (body.amenities) payload.amenities = [...new Set(body.amenities)];
  if (body.tenantTypes) payload.tenantTypes = [...new Set(body.tenantTypes)];
  if (body.attributes?.suitableFor) payload.attributes.suitableFor = body.attributes.suitableFor.map(cleanText);
  if (body.contact?.ownerName) payload.contact.ownerName = cleanText(body.contact.ownerName);
  return payload;
};

const serialize = (property, req, { ownerView = false } = {}) => {
  const result = localize(property, resLanguage(req), { includeTranslations: ownerView || req.query.includeTranslations === "true" });
  result.displayDate = result.publishedAt || result.createdAt;
  if (result.ownerId?.verification) result.ownerId.verification = { identityStatus: result.ownerId.verification.identityStatus || "UNVERIFIED" };
  if (!ownerView && !result.location?.exactPublic) {
    result.location.address = `${result.location.area}, ${result.location.city}`;
    if (result.location.point?.coordinates) {
      result.location.point.coordinates = result.location.point.coordinates.map((coordinate) => Number(coordinate.toFixed(3)));
    }
  }
  if (!ownerView) delete result.deletedAt;
  return normalizeEntityMedia(result);
};

const resLanguage = (req) => req.res?.locals?.language || "en";

const findOwned = async (id, userId) => {
  const property = await Property.findOne({ _id: id, ownerId: userId, deletedAt: null });
  if (!property) throw new ApiError(404, "NOT_FOUND");
  return property;
};

const createProperty = asyncHandler(async (req, res) => {
  const property = await Property.create({ ...preparePayload(req.validated.body), ownerId: req.user._id, status: "DRAFT" });
  pushHistory(property, { action: "CREATED", changedBy: req.user._id });
  await property.save();
  return success(res, { status: 201, code: "PROPERTY_CREATED", data: serialize(property, req, { ownerView: true }) });
});

const buildPublicFilter = (query) => {
  const filter = { status: { $in: ["ACTIVE", "RESERVED", "RENTED"] }, deletedAt: null, $and: [{ $or: [{ status: { $in: ["RESERVED", "RENTED"] } }, { expiresAt: { $gt: new Date() } }] }] };
  if (query.kind) filter.kind = query.kind;
  if (query.category) filter.category = { $in: String(query.category).split(",") };
  if (query.city) filter["location.city"] = new RegExp(`^${escapeRegex(query.city)}$`, "i");
  if (query.district) filter["location.district"] = new RegExp(`^${escapeRegex(query.district)}$`, "i");
  if (query.area) filter["location.area"] = new RegExp(escapeRegex(query.area), "i");
  if (query.minRent || query.maxRent) filter.rent = { ...(query.minRent ? { $gte: Number(query.minRent) } : {}), ...(query.maxRent ? { $lte: Number(query.maxRent) } : {}) };
  if (query.bedrooms) filter["attributes.bedrooms"] = { $gte: Number(query.bedrooms) };
  if (query.bathrooms) filter["attributes.bathrooms"] = { $gte: Number(query.bathrooms) };
  if (query.minSize || query.maxSize) filter["attributes.sizeSqft"] = { ...(query.minSize ? { $gte: Number(query.minSize) } : {}), ...(query.maxSize ? { $lte: Number(query.maxSize) } : {}) };
  if (query.amenities) filter.amenities = { $all: String(query.amenities).split(",") };
  if (query.verified === "true") filter.verificationStatus = "VERIFIED";
  if (query.has360 === "true") filter.tour360Url = { $nin: ["", null] };
  if (query.tenantType) filter.tenantTypes = { $in: [query.tenantType, "ANY"] };
  if (query.tenantGroup === "FAMILY") filter.tenantTypes = { $in: ["FAMILY", "ANY"] };
  if (query.tenantGroup === "BACHELOR") filter.tenantTypes = { $in: ["BACHELOR_MALE", "BACHELOR_FEMALE", "STUDENT_MALE", "STUDENT_FEMALE", "WORKING_PROFESSIONAL", "HOSTEL_MESS", "SHARED_ROOM", "ANY"] };
  if (query.listingParty) filter.listingParty = query.listingParty;
  if (query.availableFrom) filter.availableFrom = { $lte: new Date(query.availableFrom) };
  if (query.q) {
    const regex = new RegExp(escapeRegex(query.q), "i");
    filter.$and.push({ $or: [
      { "translations.en.title": regex }, { "translations.bn.title": regex },
      { "translations.en.description": regex }, { "translations.bn.description": regex },
      { "location.address": regex }, { "location.area": regex }, { "location.city": regex }, { "location.district": regex },
    ] });
  }
  if (query.lat && query.lng) {
    filter["location.point"] = {
      $near: {
        $geometry: { type: "Point", coordinates: [Number(query.lng), Number(query.lat)] },
        $maxDistance: Math.min(Number(query.radiusKm || 10), 100) * 1000,
      },
    };
  }
  return filter;
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const listProperties = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = buildPublicFilter(req.query);
  const sortMap = { newest: { publishedAt: -1, createdAt: -1, _id: -1 }, low_price: { rent: 1, _id: -1 }, high_price: { rent: -1, _id: -1 } };
  const sort = filter["location.point"] ? undefined : sortMap[req.query.sort] || sortMap.newest;
  const itemsPromise = Property.find(filter).populate("ownerId", "name avatarUrl verification.identityStatus").sort(sort).skip(skip).limit(limit);
  const [items, total] = filter["location.point"]
    ? [await itemsPromise, null]
    : await Promise.all([itemsPromise, Property.countDocuments(filter)]);
  const [favorites, likes] = req.user
    ? await Promise.all([Favorite.find({
        userId: req.user._id,
        entityType: "PROPERTY",
        entityId: {$in: items.map((item) => item._id)},
      }).select("entityId"), PropertyLike.find({userId: req.user._id, propertyId: {$in: items.map((item) => item._id)}}).select("propertyId")])
    : [[], []];
  const favoriteIds = new Set(favorites.map((item) => String(item.entityId)));
  const likedIds = new Set(likes.map((item) => String(item.propertyId)));
  return success(res, {
    data: items.map((item) => ({
      ...serialize(item, req),
      isFavorite: favoriteIds.has(String(item._id)),
      isLiked: likedIds.has(String(item._id)),
    })),
    meta: paginationMeta({ page, limit, total }),
  });
});

const listMapProperties = asyncHandler(async (req, res) => {
  const filter = buildPublicFilter(req.query);
  const items = await Property.find(filter).select("rent kind category translations location verificationStatus media").limit(500);
  return success(res, { data: items.map((item) => serialize(item, req)) });
});

const getProperty = asyncHandler(async (req, res) => {
  const filter = { _id: req.validated.params.id, deletedAt: null };
  const canSeePrivate = req.user && ["ADMIN", "MODERATOR", "SUPER_ADMIN"].includes(req.user.role);
  if (!canSeePrivate) filter.$or = [{ status: { $in: ["ACTIVE", "RESERVED", "RENTED"] } }, ...(req.user ? [{ ownerId: req.user._id }] : [])];
  const property = await Property.findOne(filter).populate("ownerId", "name avatarUrl verification.identityStatus");
  if (!property) throw new ApiError(404, "NOT_FOUND");
  if (!req.user || String(property.ownerId._id || property.ownerId) !== String(req.user._id)) {
    await Property.updateOne({ _id: property._id }, { $inc: { "stats.views": 1 } });
  }
  const ownerView = req.user && String(property.ownerId._id || property.ownerId) === String(req.user._id);
  const isLiked = req.user ? Boolean(await PropertyLike.exists({propertyId: property._id, userId: req.user._id})) : false;
  return success(res, { data: {...serialize(property, req, { ownerView }), isLiked} });
});

const updateProperty = asyncHandler(async (req, res) => {
  const property = await findOwned(req.validated.params.id, req.user._id);
  if (property.status === "SUSPENDED") throw new ApiError(409, "CONFLICT");
  const payload = preparePayload(req.validated.body);
  Object.assign(property, payload);
  property.moderation.reason = "";
  pushHistory(property, { action: "DETAILS_UPDATED", changedBy: req.user._id });
  await property.save();
  return success(res, { code: "UPDATED", data: serialize(property, req, { ownerView: true }) });
});

const deleteProperty = asyncHandler(async (req, res) => {
  const property = await findOwned(req.validated.params.id, req.user._id);
  property.deletedAt = new Date();
  pushHistory(property, { action: "DELETED", changedBy: req.user._id });
  await property.save();
  return success(res, { code: "DELETED" });
});

const submitProperty = asyncHandler(async (req, res) => {
  const property = await findOwned(req.validated.params.id, req.user._id);
  if (property.status === "ACTIVE") {
    return success(res, { code: "PROPERTY_PUBLISHED", data: serialize(property, req, { ownerView: true }) });
  }
  if (!["DRAFT", "CHANGES_REQUIRED", "REJECTED", "EXPIRED"].includes(property.status)) throw new ApiError(409, "CONFLICT");
  if (!property.media.length) throw new ApiError(400, "VALIDATION_ERROR", "At least one property image is required before submission");
  await approveExpiry(property);
  property.moderation.reason = "";
  await property.save();
  return success(res, { code: "PROPERTY_PUBLISHED", data: serialize(property, req, { ownerView: true }) });
});

const updateOwnerStatus = asyncHandler(async (req, res) => {
  const property = await findOwned(req.validated.params.id, req.user._id);
  const next = req.validated.body.status;
  if (!["ACTIVE", "RESERVED", "RENTED"].includes(property.status)) throw new ApiError(409, "CONFLICT", "Only a published listing can change availability");
  const previous = property.status;
  property.status = next;
  if (next === "ACTIVE") {
    confirmAvailability(property, { changedBy: req.user._id, republish: previous === "RENTED", action: previous === "RENTED" ? "RELISTED_AS_AVAILABLE" : "AVAILABILITY_CONFIRMED", note: req.validated.body.note });
  } else {
    property.availabilityStatus = next;
    property.freshnessDueAt = undefined;
    property.freshnessReminderSentAt = undefined;
    pushHistory(property, { status: next, availabilityStatus: next, action: next === "RENTED" ? "MARKED_RENTED" : "MARKED_RESERVED", note: req.validated.body.note, changedBy: req.user._id });
  }
  await property.save();
  return success(res, { code: "PROPERTY_STATUS_UPDATED", data: serialize(property, req, { ownerView: true }) });
});

const getMyProperties = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { ownerId: req.user._id, deletedAt: null };
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([Property.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit), Property.countDocuments(filter)]);
  return success(res, { data: items.map((item) => serialize(item, req, { ownerView: true })), meta: paginationMeta({ page, limit, total }) });
});

const getContact = asyncHandler(async (req, res) => {
  const property = await Property.findOne({ _id: req.params.id, status: "ACTIVE", deletedAt: null }).populate("ownerId", "name phone avatarUrl verification.identityStatus");
  if (!property) throw new ApiError(404, "NOT_FOUND");
  await Property.updateOne({ _id: property._id }, { $inc: { "stats.enquiries": 1 } });
  const visibility = property.contact.phoneVisibility;
  const phone = visibility === "IN_APP_ONLY" ? null : property.ownerId.phone;
  return success(res, { data: { owner: { id: property.ownerId._id, name: property.contact.ownerName || property.ownerId.name, avatarUrl: property.ownerId.avatarUrl, verification: property.ownerId.verification, phone }, contactMethod: visibility === "IN_APP_ONLY" ? "IN_APP" : "PHONE_OR_IN_APP" } });
});

const approveExpiry = async (property) => {
  const settings = await getSettings();
  property.expiresAt = dateFromDays(settings.listingExpiryDays);
  property.status = "ACTIVE";
  confirmAvailability(property, { changedBy: property.moderation?.reviewedBy, republish: !property.publishedAt, action: "PUBLISHED" });
};

module.exports = {
  approveExpiry,
  createProperty,
  deleteProperty,
  getContact,
  getMyProperties,
  getProperty,
  listMapProperties,
  listProperties,
  serialize,
  submitProperty,
  updateOwnerStatus,
  updateProperty,
};
