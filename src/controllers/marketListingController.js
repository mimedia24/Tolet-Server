const Favorite = require("../models/Favorite");
const MarketListing = require("../models/MarketListing");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { cleanLocalized, cleanText, localize } = require("../utils/content");
const { getPagination, paginationMeta } = require("../utils/query");
const { normalizeEntityMedia } = require("../utils/mediaUrl");
const { success } = require("../utils/response");

const resLanguage = (req) => req.res?.locals?.language || "en";
const escapeRegex = (value) => String(value).replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");

const preparePayload = (body) => {
  const payload = { ...body };
  if (body.translations) payload.translations = cleanLocalized(body.translations);
  if (body.district) payload.district = cleanText(body.district);
  if (body.attributes) {
    payload.attributes = {
      ...body.attributes,
      brand: cleanText(body.attributes.brand || ""),
      model: cleanText(body.attributes.model || ""),
      physicalCondition: cleanText(body.attributes.physicalCondition || ""),
      features: [...new Set((body.attributes.features || []).map(cleanText).filter(Boolean))],
    };
  }
  return payload;
};

const serialize = (listing, req, { ownerView = false, isFavorite = false } = {}) => {
  const result = localize(listing, resLanguage(req), {
    includeTranslations: ownerView || req.query.includeTranslations === "true",
  });
  result.displayDate = result.publishedAt || result.createdAt;
  result.isFavorite = isFavorite;
  if (result.sellerId?.verification) {
    result.sellerId.verification = {
      identityStatus: result.sellerId.verification.identityStatus || "UNVERIFIED",
    };
  }
  if (!ownerView) delete result.deletedAt;
  return normalizeEntityMedia(result);
};

const findOwned = async (id, sellerId) => {
  const listing = await MarketListing.findOne({ _id: id, sellerId, deletedAt: null });
  if (!listing) throw new ApiError(404, "NOT_FOUND");
  return listing;
};

const createMarketListing = asyncHandler(async (req, res) => {
  const listing = await MarketListing.create({
    ...preparePayload(req.validated.body),
    sellerId: req.user._id,
    status: "DRAFT",
    statusHistory: [{
      status: "DRAFT",
      action: "CREATED",
      changedBy: req.user._id,
      changedAt: new Date(),
    }],
  });
  return success(res, {
    status: 201,
    code: "MARKET_LISTING_CREATED",
    data: serialize(listing, req, { ownerView: true }),
  });
});

const buildPublicFilter = (query) => {
  const filter = {
    status: "ACTIVE",
    expiresAt: { $gt: new Date() },
    deletedAt: null,
  };
  if (query.district && String(query.district).toUpperCase() !== "ALL") {
    filter.district = new RegExp("^" + escapeRegex(query.district) + "$", "i");
  }
  if (query.category) filter.category = { $in: String(query.category).split(",") };
  if (query.condition) filter.condition = { $in: String(query.condition).split(",") };
  if (query.sellerId) filter.sellerId = query.sellerId;
  if (query.minPrice || query.maxPrice) {
    filter.price = {
      ...(query.minPrice ? { $gte: Number(query.minPrice) } : {}),
      ...(query.maxPrice ? { $lte: Number(query.maxPrice) } : {}),
    };
  }
  if (query.q) {
    const regex = new RegExp(escapeRegex(query.q), "i");
    filter.$or = [
      { "translations.en.title": regex },
      { "translations.bn.title": regex },
      { "translations.en.description": regex },
      { "translations.bn.description": regex },
      { "attributes.brand": regex },
      { "attributes.model": regex },
    ];
  }
  return filter;
};

const listMarketListings = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = buildPublicFilter(req.query);
  const sorts = {
    newest: { publishedAt: -1, createdAt: -1, _id: -1 },
    low_price: { price: 1, _id: -1 },
    high_price: { price: -1, _id: -1 },
    popular: { "stats.views": -1, "stats.saves": -1, publishedAt: -1 },
  };
  const [items, total] = await Promise.all([
    MarketListing.find(filter)
      .populate("sellerId", "name avatarUrl verification.identityStatus createdAt")
      .sort(sorts[req.query.sort] || sorts.newest)
      .skip(skip)
      .limit(limit),
    MarketListing.countDocuments(filter),
  ]);
  const favorites = req.user
    ? await Favorite.find({
        userId: req.user._id,
        entityType: "MARKET_LISTING",
        entityId: { $in: items.map((item) => item._id) },
      }).select("entityId")
    : [];
  const favoriteIds = new Set(favorites.map((item) => String(item.entityId)));
  return success(res, {
    data: items.map((item) =>
      serialize(item, req, { isFavorite: favoriteIds.has(String(item._id)) })
    ),
    meta: paginationMeta({ page, limit, total }),
  });
});

const getMarketListing = asyncHandler(async (req, res) => {
  const filter = { _id: req.validated.params.id, deletedAt: null };
  const canSeePrivate = req.user && ["ADMIN", "MODERATOR", "SUPER_ADMIN"].includes(req.user.role);
  if (!canSeePrivate) {
    filter.$or = [
      { status: "ACTIVE", expiresAt: { $gt: new Date() } },
      ...(req.user ? [{ sellerId: req.user._id }] : []),
    ];
  }
  const listing = await MarketListing.findOne(filter).populate(
    "sellerId",
    "name avatarUrl verification.identityStatus createdAt"
  );
  if (!listing) throw new ApiError(404, "NOT_FOUND");
  const ownerView = req.user && String(listing.sellerId?._id || listing.sellerId) === String(req.user._id);
  if (!ownerView) {
    await MarketListing.updateOne({ _id: listing._id }, { $inc: { "stats.views": 1 } });
  }
  const isFavorite = req.user
    ? Boolean(await Favorite.exists({
        userId: req.user._id,
        entityType: "MARKET_LISTING",
        entityId: listing._id,
      }))
    : false;
  return success(res, {
    data: serialize(listing, req, { ownerView, isFavorite }),
  });
});

const getMyMarketListings = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { sellerId: req.user._id, deletedAt: null };
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([
    MarketListing.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
    MarketListing.countDocuments(filter),
  ]);
  return success(res, {
    data: items.map((item) => serialize(item, req, { ownerView: true })),
    meta: paginationMeta({ page, limit, total }),
  });
});

const updateMarketListing = asyncHandler(async (req, res) => {
  const listing = await findOwned(req.validated.params.id, req.user._id);
  if (listing.status === "SUSPENDED") throw new ApiError(409, "CONFLICT");
  Object.assign(listing, preparePayload(req.validated.body));
  if (listing.status === "ACTIVE") {
    listing.status = "PENDING_REVIEW";
    listing.moderation.reason = "Updated by seller; re-review required";
  }
  listing.statusHistory.push({
    status: listing.status,
    action: "DETAILS_UPDATED",
    changedBy: req.user._id,
    changedAt: new Date(),
  });
  await listing.save();
  return success(res, {
    code: "UPDATED",
    data: serialize(listing, req, { ownerView: true }),
  });
});

const deleteMarketListing = asyncHandler(async (req, res) => {
  const listing = await findOwned(req.validated.params.id, req.user._id);
  listing.deletedAt = new Date();
  listing.statusHistory.push({
    status: listing.status,
    action: "DELETED",
    changedBy: req.user._id,
    changedAt: new Date(),
  });
  await listing.save();
  return success(res, { code: "DELETED" });
});

const submitMarketListing = asyncHandler(async (req, res) => {
  const listing = await findOwned(req.validated.params.id, req.user._id);
  if (!["DRAFT", "CHANGES_REQUIRED", "REJECTED", "EXPIRED", "SOLD"].includes(listing.status)) {
    throw new ApiError(409, "CONFLICT");
  }
  if (!listing.media.length) {
    throw new ApiError(400, "VALIDATION_ERROR", "At least one marketplace image is required");
  }
  listing.status = "PENDING_REVIEW";
  listing.moderation.reason = "";
  listing.statusHistory.push({
    status: "PENDING_REVIEW",
    action: "SUBMITTED",
    changedBy: req.user._id,
    changedAt: new Date(),
  });
  await listing.save();
  return success(res, {
    code: "MARKET_LISTING_SUBMITTED",
    data: serialize(listing, req, { ownerView: true }),
  });
});

const markMarketListingSold = asyncHandler(async (req, res) => {
  const listing = await findOwned(req.validated.params.id, req.user._id);
  if (listing.status !== "ACTIVE") {
    throw new ApiError(409, "CONFLICT", "Only an active listing can be marked sold");
  }
  listing.status = "SOLD";
  listing.statusHistory.push({
    status: "SOLD",
    action: "MARKED_SOLD",
    note: cleanText(req.validated.body.note || ""),
    changedBy: req.user._id,
    changedAt: new Date(),
  });
  await listing.save();
  return success(res, {
    code: "MARKET_LISTING_SOLD",
    data: serialize(listing, req, { ownerView: true }),
  });
});

const getMarketContact = asyncHandler(async (req, res) => {
  const listing = await MarketListing.findOne({
    _id: req.params.id,
    status: "ACTIVE",
    expiresAt: { $gt: new Date() },
    deletedAt: null,
  }).populate("sellerId", "name phone avatarUrl verification.identityStatus");
  if (!listing) throw new ApiError(404, "NOT_FOUND");
  await MarketListing.updateOne({ _id: listing._id }, { $inc: { "stats.enquiries": 1 } });
  const phone = listing.contact.phoneVisibility === "AFTER_LOGIN"
    ? listing.sellerId.phone
    : null;
  return success(res, {
    data: {
      seller: {
        id: listing.sellerId._id,
        name: listing.sellerId.name,
        avatarUrl: listing.sellerId.avatarUrl,
        verification: listing.sellerId.verification,
        phone,
      },
      contactMethod: phone ? "PHONE_OR_IN_APP" : "IN_APP",
    },
  });
});

module.exports = {
  createMarketListing,
  deleteMarketListing,
  getMarketContact,
  getMarketListing,
  getMyMarketListings,
  listMarketListings,
  markMarketListingSold,
  serialize,
  submitMarketListing,
  updateMarketListing,
};
