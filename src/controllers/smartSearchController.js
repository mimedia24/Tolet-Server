const HousingRequest = require("../models/HousingRequest");
const Job = require("../models/Job");
const Property = require("../models/Property");
const WorkerProfile = require("../models/WorkerProfile");
const User = require("../models/User");
const logger = require("../config/logger");
const { config } = require("../config/env");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/response");
const { parseSmartQuery, rankResult } = require("../services/smartSearchService");

const localized = (item, language) => {
  const preferred = item.translations?.[language];
  const fallback = item.translations?.en || item.translations?.bn || {};
  return { ...item, title: preferred?.title || fallback.title || "", description: preferred?.description || fallback.description || "" };
};

const geoPipeline = ({ field, query, lat, lng, limit }) => {
  const pipeline = [];
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const geoQuery = { ...query };
    if (["location", "searchCenter"].includes(field)) {
      geoQuery[`${field}.coordinates.0`] = { $exists: true };
    }
    pipeline.push({ $geoNear: { near: { type: "Point", coordinates: [lng, lat] }, distanceField: "distanceMeters", maxDistance: 20 * 1000, spherical: true, key: field, query: geoQuery } });
  } else {
    pipeline.push({ $match: query }, { $sort: { createdAt: -1 } });
  }
  pipeline.push({ $limit: limit });
  return pipeline;
};

const runSearch = async (Model, options) => {
  try {
    return await Model.aggregate(geoPipeline(options));
  } catch (error) {
    if (!Number.isFinite(options.lat) || !Number.isFinite(options.lng)) throw error;
    logger.warn({ collection: Model.collection.collectionName, err: error }, "Geo smart search failed; using non-geo fallback");
    return Model.aggregate(geoPipeline({ ...options, lat: NaN, lng: NaN }));
  }
};

const smartSearch = asyncHandler(async (req, res) => {
  const interpretation = parseSmartQuery(req.query.q);
  const propertyOnly = req.query.scope === "PROPERTY";
  const language = res.locals.language || "en";
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 50);
  const lat = req.query.lat !== undefined ? Number(req.query.lat) : NaN;
  const lng = req.query.lng !== undefined ? Number(req.query.lng) : NaN;
  const now = new Date();
  const results = [];

  if (propertyOnly || interpretation.intent === "PROPERTY" || req.query.includeAll === "true") {
    const filter = { status: "ACTIVE", deletedAt: null, expiresAt: { $gt: now }, kind: interpretation.kind };
    if (interpretation.area) filter["location.area"] = new RegExp(interpretation.area, "i");
    if (req.query.district) filter["location.district"] = new RegExp(`^${String(req.query.district).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    if (interpretation.maxRent) filter.rent = { $lte: interpretation.maxRent };
    if (interpretation.bedrooms) filter["attributes.bedrooms"] = { $gte: interpretation.bedrooms };
    if (interpretation.tenantType) filter.tenantTypes = { $in: [interpretation.tenantType, "ANY"] };
    if (interpretation.amenities.length) filter.amenities = { $all: interpretation.amenities };
    const items = await runSearch(Property, { field: "location.point", query: filter, lat, lng, limit });
    const owners = await User.find({ _id: { $in: items.map((item) => item.ownerId).filter(Boolean) } }).select("name avatarUrl verification.identityStatus").lean();
    const ownersById = new Map(owners.map((owner) => [String(owner._id), owner]));
    results.push(...items.map((raw) => {
      const item = localized(raw, language);
      return { type: "PROPERTY", id: item._id, ownerId: ownersById.get(String(item.ownerId)) || item.ownerId, title: item.title, description: item.description, rent: item.rent, location: item.location, media: item.media, attributes: item.attributes, tenantTypes: item.tenantTypes, verificationStatus: item.verificationStatus, tour360Url: item.tour360Url, distanceKm: Number.isFinite(item.distanceMeters) ? Math.round(item.distanceMeters / 10) / 100 : undefined, createdAt: item.createdAt };
    }));
  }

  if (!propertyOnly && (interpretation.intent === "JOB" || req.query.includeAll === "true")) {
    const filter = { status: "ACTIVE", deletedAt: null, expiresAt: { $gt: now }, applicationDeadline: { $gte: now } };
    if (interpretation.area) filter["location.area"] = new RegExp(interpretation.area, "i");
    const items = await runSearch(Job, { field: "location.point", query: filter, lat, lng, limit });
    results.push(...items.map((raw) => {
      const item = localized(raw, language);
      return { type: "JOB", id: item._id, title: item.title, description: item.description, salary: item.salary, category: item.category, employerName: item.employerName, location: item.location, distanceKm: Number.isFinite(item.distanceMeters) ? Math.round(item.distanceMeters / 10) / 100 : undefined, createdAt: item.createdAt };
    }));
  }

  if (!propertyOnly && (interpretation.intent === "JOB" || req.query.includeAll === "true")) {
    const filter = { status: "ACTIVE", deletedAt: null };
    if (interpretation.area) filter["serviceAreas.area"] = new RegExp(interpretation.area, "i");
    const items = await runSearch(WorkerProfile, { field: "location", query: filter, lat, lng, limit });
    results.push(...items.map((item) => ({
      type: "WORKER_PROFILE", id: item._id, title: item.title, description: item.bio, category: item.categories?.[0], serviceAreas: item.serviceAreas,
      distanceKm: Number.isFinite(item.distanceMeters) ? Math.round(item.distanceMeters / 10) / 100 : undefined, createdAt: item.createdAt,
    })));
  }

  if (!propertyOnly && config.features.housingRequests && (interpretation.intent === "HOUSING_REQUEST" || req.query.includeAll === "true")) {
    const filter = { status: "ACTIVE", deletedAt: null, expiresAt: { $gt: now }, kind: interpretation.kind };
    if (interpretation.area) filter["preferredLocations.area"] = new RegExp(interpretation.area, "i");
    if (interpretation.tenantType) filter.tenantType = interpretation.tenantType;
    const items = await runSearch(HousingRequest, { field: "searchCenter", query: filter, lat, lng, limit });
    results.push(...items.map((raw) => {
      const item = localized(raw, language);
      return { type: "HOUSING_REQUEST", id: item._id, title: item.title, description: item.description, budget: item.budget, preferredLocations: item.preferredLocations, tenantType: item.tenantType, distanceKm: Number.isFinite(item.distanceMeters) ? Math.round(item.distanceMeters / 10) / 100 : undefined, createdAt: item.createdAt };
    }));
  }

  const ranked = results.map((item) => ({ ...item, relevanceScore: rankResult(item, interpretation.raw) })).sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, limit);
  const labels = { PROPERTY: language === "bn" ? "প্রপার্টি" : "properties", JOB: language === "bn" ? "কাজ ও কর্মী" : "work and workers", HOUSING_REQUEST: language === "bn" ? "বাসার অনুরোধ" : "housing requests" };
  const answer = language === "bn"
    ? `${ranked.length}টি মিল পাওয়া গেছে${interpretation.area ? ` — ${interpretation.area} এলাকায়` : ""}। সবচেয়ে প্রাসঙ্গিক ও কাছাকাছি ফল আগে দেখানো হয়েছে।`
    : `${ranked.length} matching ${propertyOnly ? labels.PROPERTY : labels[interpretation.intent]} found${interpretation.area ? ` around ${interpretation.area}` : ""}. The most relevant and nearby results are shown first.`;
  return success(res, { data: { interpretation, answer, results: ranked } });
});

module.exports = { smartSearch };
