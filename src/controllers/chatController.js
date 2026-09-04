const crypto = require("crypto");
const Conversation = require("../models/Conversation");
const HousingRequest = require("../models/HousingRequest");
const Job = require("../models/Job");
const Message = require("../models/Message");
const MarketListing = require("../models/MarketListing");
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
const {sha256} = require("../utils/security");
const {kickPushWorker} = require("../services/pushService");

const keyFor = (a, b, contextType, contextId = "") => [String(a), String(b)].sort().join(":") + `:${contextType}:${contextId || ""}`;

const validateContextRecipient = async ({ contextType, contextId, recipientId }) => {
  if (contextType === "GENERAL") return;
  const models = {
    PROPERTY: { Model: Property, ownerField: "ownerId" },
    JOB: { Model: Job, ownerField: "employerId" },
    HOUSING_REQUEST: { Model: HousingRequest, ownerField: "requesterId" },
    WORKER_PROFILE: { Model: WorkerProfile, ownerField: "userId" },
    MARKET_LISTING: { Model: MarketListing, ownerField: "sellerId" },
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
  const limit = Math.min(Number(req.validated?.query?.limit || 30), 100);
  const filter = { conversationId: req.params.id, deletedAt: null };
  if (req.validated?.query?.cursor) filter._id = {$lt: req.validated.query.cursor};
  const items = await Message.find(filter).sort({_id: -1}).limit(limit + 1);
  const hasMore = items.length > limit;
  const page = items.slice(0, limit);
  const readAt = new Date();
  await Message.updateMany(
    { conversationId: req.params.id, senderId: { $ne: req.user._id }, readBy: { $ne: req.user._id } },
    { $addToSet: { readBy: req.user._id }, $set: {readAt, deliveredAt: readAt} },
  );
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
    readAt,
  });
  return success(res, {
    data: page.reverse(),
    meta: {hasMore, nextCursor: hasMore ? String(page[0]?._id || "") : null},
  });
});

const sendMessage = asyncHandler(async (req, res) => {
  const conversation = await ensureParticipant(req.params.id, req.user._id, true);
  const text = cleanText(req.validated.body.text || "");
  if (!text || text.length > 4000) throw new ApiError(400, "VALIDATION_ERROR");
  const attachments = Array.isArray(req.validated.body.attachments) ? req.validated.body.attachments.slice(0, 5) : [];
  if (attachments.some((item) => !["IMAGE", "FILE"].includes(item?.type) || typeof item?.url !== "string" || item.url.length > 1000 || !/^(https?:\/\/|\/uploads\/)/i.test(item.url))) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid message attachment");
  }
  const clientMessageId = req.validated.body.clientMessageId || crypto.randomUUID();
  const contentHash = sha256(JSON.stringify({conversationId: String(conversation._id), text, attachments}));
  let message = await Message.findOne({senderId: req.user._id, clientMessageId}).select("+contentHash");
  let created = false;
  if (message && message.contentHash !== contentHash) {
    throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "This client message id was already used for different content");
  }
  if (!message) {
    try {
      message = await Message.create({
        conversationId: conversation._id,
        senderId: req.user._id,
        clientMessageId,
        contentHash,
        text,
        attachments,
        readBy: [req.user._id],
        notificationRequired: true,
        notificationState: "PENDING",
      });
      created = true;
    } catch (error) {
      if (error?.code !== 11000) throw error;
      message = await Message.findOne({senderId: req.user._id, clientMessageId}).select("+contentHash");
      if (!message || message.contentHash !== contentHash) {
        throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "This client message id was already used for different content");
      }
    }
  }
  if (created) {
    conversation.lastMessageAt = message.createdAt;
    conversation.lastMessagePreview = text.slice(0, 200);
    await conversation.save();
  }

  const recipientId = conversation.participants.find((id) => String(id) !== String(req.user._id));
  const notification = await createNotification({
    userId: recipientId,
    type: "MESSAGE",
    title: { en: "New message", bn: "নতুন মেসেজ" },
    body: { en: text.slice(0, 160), bn: text.slice(0, 160) },
    data: { type: "MESSAGE", conversationId: conversation._id, messageId: message._id, senderId: req.user._id, senderName: req.user.name || "Rentize User" },
  });
  kickPushWorker();
  const io = req.app.get("io");
  if (created) {
    io?.to("user:" + recipientId).to("conversation:" + conversation._id).emit("message:new", message);
    io?.to("user:" + recipientId).emit("notification:new", notification);
  }
  const data = message.toObject();
  delete data.contentHash;
  delete data.notificationRequired;
  delete data.notificationState;
  delete data.notificationLastAttemptAt;
  return success(res, { status: created ? 201 : 200, code: "MESSAGE_SENT", data });
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
