const Favorite = require("../models/Favorite");
const Job = require("../models/Job");
const Property = require("../models/Property");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { getPagination, paginationMeta } = require("../utils/query");
const { success } = require("../utils/response");
const { localize } = require("../utils/content");

const getModel = (type) => (type === "PROPERTY" ? Property : type === "JOB" ? Job : null);

const addFavorite = asyncHandler(async (req, res) => {
  const type = String(req.params.entityType).toUpperCase();
  const Model = getModel(type);
  if (!Model) throw new ApiError(400, "VALIDATION_ERROR");
  const entity = await Model.findOne({ _id: req.params.entityId, status: "ACTIVE", deletedAt: null });
  if (!entity) throw new ApiError(404, "NOT_FOUND");
  let favorite = await Favorite.findOne({ userId: req.user._id, entityType: type, entityId: entity._id });
  if (!favorite) {
    favorite = await Favorite.create({ userId: req.user._id, entityType: type, entityId: entity._id });
    await Model.updateOne({ _id: entity._id }, { $inc: { "stats.saves": 1 } });
  }
  return success(res, { status: 201, code: "FAVORITE_ADDED", data: favorite });
});

const removeFavorite = asyncHandler(async (req, res) => {
  const type = String(req.params.entityType).toUpperCase();
  const Model = getModel(type);
  if (!Model) throw new ApiError(400, "VALIDATION_ERROR");
  const result = await Favorite.deleteOne({ userId: req.user._id, entityType: type, entityId: req.params.entityId });
  if (result.deletedCount) await Model.updateOne({ _id: req.params.entityId, "stats.saves": { $gt: 0 } }, { $inc: { "stats.saves": -1 } });
  return success(res, { code: "FAVORITE_REMOVED" });
});

const listFavorites = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { userId: req.user._id };
  if (req.query.type) filter.entityType = String(req.query.type).toUpperCase();
  const [favorites, total] = await Promise.all([Favorite.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit), Favorite.countDocuments(filter)]);

  const propertyIds = favorites.filter((item) => item.entityType === "PROPERTY").map((item) => item.entityId);
  const jobIds = favorites.filter((item) => item.entityType === "JOB").map((item) => item.entityId);
  const [properties, jobs] = await Promise.all([Property.find({ _id: { $in: propertyIds }, status: "ACTIVE" }), Job.find({ _id: { $in: jobIds }, status: "ACTIVE" })]);
  const entities = new Map([...properties, ...jobs].map((item) => [String(item._id), item]));
  const data = favorites.map((favorite) => {
    const entity = entities.get(String(favorite.entityId));
    return { ...favorite.toObject(), entity: entity ? localize(entity, res.locals.language) : null };
  });
  return success(res, { data, meta: paginationMeta({ page, limit, total }) });
});

module.exports = { addFavorite, listFavorites, removeFavorite };
