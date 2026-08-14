const Conversation = require("../models/Conversation");
const HousingRequest = require("../models/HousingRequest");
const Job = require("../models/Job");
const Message = require("../models/Message");
const Notification = require("../models/Notification");
const Property = require("../models/Property");
const User = require("../models/User");
const WorkerProfile = require("../models/WorkerProfile");
const { createNotification } = require("../services/notificationService");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { cleanText } = require("../utils/content");
const { getPagination, paginationMeta } = require("../utils/query");
const { success } = require("../utils/response");
const { normalizeMediaUrl } = require("../utils/mediaUrl");

const keyFor = (a, b, contextType, contextId = "") => [String(a), String(b)].sort().join(":") + `:${contextType}:${contextId || ""}`;

const validateContextRecipient = async ({ contextType, contextId, recipientId }) => {
  if (contextType === "GENERAL") return;
  const models = {
    PROPERTY: { Model: Property, ownerField: "ownerId" },
    JOB: { Model: Job, ownerField: "employerId" },
    HOUSING_REQUEST: { Model: HousingRequest, ownerField: "requesterId" },
    WORKER_PROFILE: { Model: WorkerProfile, ownerField: "userId" },
  };
  const target = models[contextType];
  if (!target) throw new ApiError(400, "VALIDATION_ERROR", "Unsupported conversation context");
  const item = await target.Model.findOne({ _id: contextId, deletedAt: null }).select(target.ownerField);
  if (!item) throw new ApiError(404, "NOT_FOUND");
  if (String(item[target.ownerField]) !== String(recipientId)) throw new ApiError(400, "VALIDATION_ERROR", "Recipient does not own this context");
};

const createConversation = asyncHandler(async (req, res) => {
  const { recipientId, contextType = "GENERAL", contextId } = req.validated.body;
  if (!recipientId || String(recipientId) === String(req.user._id)) throw new ApiError(400, "VALIDATION_ERROR");
  if (!(await User.exists({ _id: recipientId, accountStatus: "ACTIVE" }))) throw new ApiError(404, "NOT_FOUND");
  await validateContextRecipient({ contextType, contextId, recipientId });
  const participantKey = keyFor(req.user._id, recipientId, contextType, contextId);
  const conversation = await Conversation.findOneAndUpdate(
    { participantKey },
    { $setOnInsert: { participants: [req.user._id, recipientId], participantKey, contextType, contextId } },
    { new: true, upsert: true }
  );
  return success(res, { status: 201, code: "CREATED", data: conversation });
});

const listConversations = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { participants: req.user._id };
  const [items, total] = await Promise.all([
    Conversation.find(filter).populate("participants", "name avatarUrl verification.identityStatus").sort({ lastMessageAt: -1 }).skip(skip).limit(limit),
    Conversation.countDocuments(filter),
  ]);
  const conversationIds = items.map((item) => item._id);
  const unread = conversationIds.length
    ? await Message.aggregate([
        { $match: { conversationId: { $in: conversationIds }, senderId: { $ne: req.user._id }, readBy: { $ne: req.user._id }, deletedAt: null } },
        { $group: { _id: "$conversationId", count: { $sum: 1 } } },
      ])
    : [];
  const unreadMap = new Map(unread.map((entry) => [String(entry._id), entry.count]));
  const data = items.map((item) => {
    const value = item.toObject();
    value.participants = (value.participants || []).map((person) => ({ ...person, avatarUrl: normalizeMediaUrl(person.avatarUrl) }));
    return { ...value, unreadCount: unreadMap.get(String(item._id)) || 0 };
  });
  const allConversationIds = await Conversation.distinct("_id", filter);
  const totalUnread = allConversationIds.length
    ? await Message.countDocuments({ conversationId: { $in: allConversationIds }, senderId: { $ne: req.user._id }, readBy: { $ne: req.user._id }, deletedAt: null })
    : 0;
  return success(res, { data, meta: { ...paginationMeta({ page, limit, total }), totalUnread } });
});

const ensureParticipant = async (conversationId, userId, requireUnblocked = false) => {
  const conversation = await Conversation.findOne({ _id: conversationId, participants: userId });
  if (!conversation) throw new ApiError(404, "NOT_FOUND");
  if (requireUnblocked && conversation.blockedBy.length) throw new ApiError(403, "FORBIDDEN", "This conversation is blocked");
  return conversation;
};

const listMessages = asyncHandler(async (req, res) => {
  const conversation = await ensureParticipant(req.params.id, req.user._id);
  const { page, limit, skip } = getPagination(req.query);
  const filter = { conversationId: req.params.id, deletedAt: null };
  const [items, total] = await Promise.all([Message.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit), Message.countDocuments(filter)]);
  await Message.updateMany({ conversationId: req.params.id, senderId: { $ne: req.user._id }, readBy: { $ne: req.user._id } }, { $addToSet: { readBy: req.user._id } });
  await Notification.updateMany(
    {
      userId: req.user._id,
      type: "MESSAGE",
      "data.conversationId": conversation._id,
      readAt: null,
    },
    {$set: {readAt: new Date()}},
  );
  req.app.get("io")?.to(`conversation:${req.params.id}`).emit("message:read", {
    conversationId: req.params.id,
    userId: req.user._id,
    readAt: new Date(),
  });
  return success(res, { data: items.reverse(), meta: paginationMeta({ page, limit, total }) });
});

const sendMessage = asyncHandler(async (req, res) => {
  const conversation = await ensureParticipant(req.params.id, req.user._id, true);
  const text = cleanText(req.validated.body.text || "");
  if (!text || text.length > 4000) throw new ApiError(400, "VALIDATION_ERROR");
  const attachments = Array.isArray(req.validated.body.attachments) ? req.validated.body.attachments.slice(0, 5) : [];
  if (attachments.some((item) => !["IMAGE", "FILE"].includes(item?.type) || typeof item?.url !== "string" || item.url.length > 1000 || !/^(https?:\/\/|\/uploads\/)/i.test(item.url))) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid message attachment");
  }
  const message = await Message.create({ conversationId: conversation._id, senderId: req.user._id, text, attachments, readBy: [req.user._id] });
  conversation.lastMessageAt = message.createdAt;
  conversation.lastMessagePreview = text.slice(0, 200);
  await conversation.save();

  const recipientId = conversation.participants.find((id) => String(id) !== String(req.user._id));
  const notification = await createNotification({
    userId: recipientId,
    type: "MESSAGE",
    title: { en: "New message", bn: "নতুন মেসেজ" },
    body: { en: text.slice(0, 160), bn: text.slice(0, 160) },
    data: { conversationId: conversation._id, messageId: message._id },
  });
  req.app.get("io")?.to(`user:${recipientId}`).emit("message:new", message);
  req.app.get("io")?.to(`user:${recipientId}`).emit("notification:new", notification);
  req.app.get("io")?.to(`conversation:${conversation._id}`).emit("message:new", message);
  return success(res, { status: 201, code: "MESSAGE_SENT", data: message });
});

const blockConversation = asyncHandler(async (req, res) => {
  const conversation = await ensureParticipant(req.params.id, req.user._id);
  const isBlocked = conversation.blockedBy.some((id) => String(id) === String(req.user._id));
  if (isBlocked) conversation.blockedBy.pull(req.user._id);
  else conversation.blockedBy.addToSet(req.user._id);
  await conversation.save();
  return success(res, { code: isBlocked ? "CONVERSATION_UNBLOCKED" : "CONVERSATION_BLOCKED", data: conversation });
});

module.exports = { blockConversation, createConversation, listConversations, listMessages, sendMessage };
