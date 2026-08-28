const Job = require("../models/Job");
const Message = require("../models/Message");
const MarketListing = require("../models/MarketListing");
const Property = require("../models/Property");
const Report = require("../models/Report");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { cleanText } = require("../utils/content");
const { getPagination, paginationMeta } = require("../utils/query");
const { success } = require("../utils/response");

const models = {
  PROPERTY: Property,
  JOB: Job,
  MARKET_LISTING: MarketListing,
  USER: User,
  MESSAGE: Message,
};

const createReport = asyncHandler(async (req, res) => {
  const body = req.validated.body;
  const Model = models[body.entityType];
  if (!Model || !(await Model.exists({ _id: body.entityId }))) throw new ApiError(404, "NOT_FOUND");
  const report = await Report.create({ reporterId: req.user._id, entityType: body.entityType, entityId: body.entityId, reason: body.reason, details: cleanText(body.details || "") });
  return success(res, { status: 201, code: "REPORT_SUBMITTED", data: report });
});

const myReports = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { reporterId: req.user._id };
  const [items, total] = await Promise.all([Report.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit), Report.countDocuments(filter)]);
  return success(res, { data: items, meta: paginationMeta({ page, limit, total }) });
});

module.exports = { createReport, myReports };
