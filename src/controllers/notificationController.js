const Notification = require("../models/Notification");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { getPagination, paginationMeta } = require("../utils/query");
const { success } = require("../utils/response");

const localizeNotification = (item, language) => {
  const value = item.toObject();
  value.titleText = value.title[language] || value.title.en;
  value.bodyText = value.body[language] || value.body.en;
  return value;
};

const listNotifications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { userId: req.user._id };
  if (req.query.unread === "true") filter.readAt = null;
  const [items, total, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId: req.user._id, readAt: null }),
  ]);
  return success(res, { data: items.map((item) => localizeNotification(item, res.locals.language)), meta: { ...paginationMeta({ page, limit, total }), unread } });
});

const markRead = asyncHandler(async (req, res) => {
  const item = await Notification.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { $set: { readAt: new Date() } }, { new: true });
  if (!item) throw new ApiError(404, "NOT_FOUND");
  return success(res, { code: "UPDATED", data: localizeNotification(item, res.locals.language) });
});

const markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ userId: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
  return success(res, { code: "UPDATED" });
});

module.exports = { listNotifications, markAllRead, markRead };
