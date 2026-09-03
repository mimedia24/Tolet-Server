const CommentLike = require("../models/CommentLike");
const Notification = require("../models/Notification");
const Property = require("../models/Property");
const PropertyComment = require("../models/PropertyComment");
const PropertyLike = require("../models/PropertyLike");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const {cleanText} = require("../utils/content");
const {success} = require("../utils/response");
const {enqueueNotificationDeliveries, kickPushWorker} = require("../services/pushService");
const {audit} = require("../services/auditService");

const PUBLIC_STATUSES = ["ACTIVE", "RESERVED", "RENTED"];
const roleCanModerate = (user) => ["MODERATOR", "ADMIN", "SUPER_ADMIN"].includes(user?.role);
const id = (value) => String(value?._id || value || "");
const actorName = (user) => String(user?.name || "Rentize User").trim().slice(0, 100);

const findPublicProperty = async (propertyId) => {
  const property = await Property.findOne({_id: propertyId, status: {$in: PUBLIC_STATUSES}, deletedAt: null})
    .select("ownerId stats translations");
  if (!property) throw new ApiError(404, "NOT_FOUND");
  return property;
};

const emitSocial = (req, propertyId, event, data) => {
  const io = req.app.get("io");
  io?.to(`property:${propertyId}`).emit(event, data);
};

const upsertLikeNotification = async ({recipientId, actor, targetType, targetId, propertyId, likeCount, req}) => {
  if (!recipientId || id(recipientId) === id(actor)) return;
  const sourceKey = `${targetType}_LIKES:${targetId}`;
  const count = Math.max(1, Number(likeCount || 1));
  const name = actorName(actor);
  const title = targetType === "PROPERTY_LIKES"
    ? {en: "New likes on your rental post", bn: "আপনার ভাড়ার পোস্টে নতুন লাইক"}
    : {en: "New likes on your comment", bn: "আপনার কমেন্টে নতুন লাইক"};
  const body = count === 1
    ? {en: `${name} liked it.`, bn: `${name} লাইক দিয়েছেন।`}
    : {en: `${name} and ${count - 1} others liked it.`, bn: `${name} এবং আরও ${count - 1} জন লাইক দিয়েছেন।`};
  const notification = await Notification.findOneAndUpdate(
    {sourceKey},
    {$set: {userId: recipientId, type: targetType, title, body, readAt: null, data: {type: targetType, propertyId: id(propertyId), commentId: targetType === "COMMENT_LIKES" ? id(targetId) : "", latestActorId: id(actor), likeCount: count}}},
    {new: true, upsert: true, setDefaultsOnInsert: true},
  );
  req.app.get("io")?.to(`user:${recipientId}`).emit("notification:new", notification);
};

const createCommentNotification = async ({recipientId, actor, propertyId, comment, type, req}) => {
  if (!recipientId || id(recipientId) === id(actor)) return null;
  const name = actorName(actor);
  const notification = await Notification.findOneAndUpdate(
    {sourceKey: `${type}:${comment._id}:${recipientId}`},
    {$setOnInsert: {
      userId: recipientId,
      sourceKey: `${type}:${comment._id}:${recipientId}`,
      type,
      title: type === "PROPERTY_REPLY"
        ? {en: `${name} replied to a comment`, bn: `${name} একটি কমেন্টের উত্তর দিয়েছেন`}
        : {en: `${name} commented on your rental post`, bn: `${name} আপনার ভাড়ার পোস্টে কমেন্ট করেছেন`},
      body: {en: comment.body.slice(0, 160), bn: comment.body.slice(0, 160)},
      data: {type, propertyId: id(propertyId), commentId: id(comment._id), actorId: id(actor)},
    }},
    {new: true, upsert: true, setDefaultsOnInsert: true},
  );
  await enqueueNotificationDeliveries(notification);
  kickPushWorker();
  req.app.get("io")?.to(`user:${recipientId}`).emit("notification:new", notification);
  return notification;
};

const serializeComment = (comment, {user, propertyOwnerId, likedIds = new Set()} = {}) => {
  const value = comment.toObject ? comment.toObject() : comment;
  const deleted = Boolean(value.deletedAt);
  return {
    _id: value._id,
    propertyId: value.propertyId,
    parentId: value.parentId,
    body: deleted ? "" : value.body,
    deleted,
    editedAt: value.editedAt,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    likeCount: value.likeCount || 0,
    replyCount: value.replyCount || 0,
    isLiked: likedIds.has(id(value._id)),
    author: deleted ? null : value.authorId,
    permissions: {
      canEdit: !deleted && id(value.authorId) === id(user),
      canDelete: !deleted && Boolean(user) && (id(value.authorId) === id(user) || id(propertyOwnerId) === id(user) || roleCanModerate(user)),
      canReport: !deleted && Boolean(user) && id(value.authorId) !== id(user),
    },
  };
};

const likeProperty = asyncHandler(async (req, res) => {
  const property = await findPublicProperty(req.validated.params.id);
  let created = false;
  try {
    await PropertyLike.create({propertyId: property._id, userId: req.user._id});
    created = true;
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }
  if (created) {
    const likes = await PropertyLike.countDocuments({propertyId: property._id});
    await Property.updateOne({_id: property._id}, {$set: {"stats.likes": likes}});
    await upsertLikeNotification({recipientId: property.ownerId, actor: req.user, targetType: "PROPERTY_LIKES", targetId: property._id, propertyId: property._id, likeCount: likes, req});
  }
  const likes = await PropertyLike.countDocuments({propertyId: property._id});
  emitSocial(req, property._id, "property:social:update", {propertyId: id(property._id), likes, liked: true});
  return success(res, {code: "LIKED", data: {liked: true, likes}});
});

const unlikeProperty = asyncHandler(async (req, res) => {
  const property = await findPublicProperty(req.validated.params.id);
  const result = await PropertyLike.deleteOne({propertyId: property._id, userId: req.user._id});
  const likes = await PropertyLike.countDocuments({propertyId: property._id});
  if (result.deletedCount) await Property.updateOne({_id: property._id}, {$set: {"stats.likes": likes}});
  emitSocial(req, property._id, "property:social:update", {propertyId: id(property._id), likes, liked: false});
  return success(res, {code: "UNLIKED", data: {liked: false, likes}});
});

const listComments = asyncHandler(async (req, res) => {
  const property = await findPublicProperty(req.validated.params.id);
  const limit = Math.min(Number(req.validated.query.limit || 20), 50);
  const filter = {propertyId: property._id, parentId: null, $or: [{deletedAt: null}, {replyCount: {$gt: 0}}]};
  if (req.validated.query.cursor) {
    const cursor = await PropertyComment.findOne({_id: req.validated.query.cursor, propertyId: property._id}).select("createdAt");
    if (cursor) filter.$and = [{$or: [{createdAt: {$lt: cursor.createdAt}}, {createdAt: cursor.createdAt, _id: {$lt: cursor._id}}]}];
  }
  const comments = await PropertyComment.find(filter).populate("authorId", "name avatarUrl verification.identityStatus").sort({createdAt: -1, _id: -1}).limit(limit + 1);
  const hasMore = comments.length > limit;
  const page = comments.slice(0, limit);
  const liked = req.user ? await CommentLike.find({userId: req.user._id, commentId: {$in: page.map((x) => x._id)}}).select("commentId") : [];
  const likedIds = new Set(liked.map((x) => id(x.commentId)));
  return success(res, {data: page.map((x) => serializeComment(x, {user: req.user, propertyOwnerId: property.ownerId, likedIds})), meta: {hasMore, nextCursor: hasMore ? id(page.at(-1)?._id) : null}});
});

const listReplies = asyncHandler(async (req, res) => {
  const parent = await PropertyComment.findById(req.validated.params.id);
  if (!parent || parent.parentId) throw new ApiError(404, "NOT_FOUND");
  const property = await findPublicProperty(parent.propertyId);
  const limit = Math.min(Number(req.validated.query.limit || 20), 50);
  const filter = {propertyId: property._id, parentId: parent._id, deletedAt: null};
  if (req.validated.query.cursor) filter._id = {$gt: req.validated.query.cursor};
  const replies = await PropertyComment.find(filter).populate("authorId", "name avatarUrl verification.identityStatus").sort({_id: 1}).limit(limit + 1);
  const hasMore = replies.length > limit;
  const page = replies.slice(0, limit);
  const liked = req.user ? await CommentLike.find({userId: req.user._id, commentId: {$in: page.map((x) => x._id)}}).select("commentId") : [];
  const likedIds = new Set(liked.map((x) => id(x.commentId)));
  return success(res, {data: page.map((x) => serializeComment(x, {user: req.user, propertyOwnerId: property.ownerId, likedIds})), meta: {hasMore, nextCursor: hasMore ? id(page.at(-1)?._id) : null}});
});

const createComment = asyncHandler(async (req, res) => {
  const property = await findPublicProperty(req.validated.params.id);
  let parent = null;
  if (req.validated.body.parentId) {
    parent = await PropertyComment.findOne({_id: req.validated.body.parentId, propertyId: property._id, parentId: null});
    if (!parent || parent.deletedAt) throw new ApiError(400, "VALIDATION_ERROR", "Replies can only target an active top-level comment");
  }
  const comment = await PropertyComment.create({propertyId: property._id, authorId: req.user._id, parentId: parent?._id || null, body: cleanText(req.validated.body.body)});
  const [commentCount, replyCount] = await Promise.all([
    PropertyComment.countDocuments({propertyId: property._id, deletedAt: null}),
    parent ? PropertyComment.countDocuments({parentId: parent._id, deletedAt: null}) : Promise.resolve(0),
  ]);
  await Promise.all([
    Property.updateOne({_id: property._id}, {$set: {"stats.comments": commentCount}}),
    parent ? PropertyComment.updateOne({_id: parent._id}, {$set: {replyCount}}) : Promise.resolve(),
  ]);
  await comment.populate("authorId", "name avatarUrl verification.identityStatus");
  const recipients = new Set([id(property.ownerId)]);
  if (parent) recipients.add(id(parent.authorId));
  recipients.delete(id(req.user));
  for (const recipientId of recipients) {
    await createCommentNotification({recipientId, actor: req.user, propertyId: property._id, comment, type: parent ? "PROPERTY_REPLY" : "PROPERTY_COMMENT", req});
  }
  const data = serializeComment(comment, {user: req.user, propertyOwnerId: property.ownerId});
  emitSocial(req, property._id, parent ? "property:reply:new" : "property:comment:new", data);
  return success(res, {status: 201, code: "COMMENT_CREATED", data});
});

const updateComment = asyncHandler(async (req, res) => {
  const comment = await PropertyComment.findOne({_id: req.validated.params.id, deletedAt: null});
  if (!comment) throw new ApiError(404, "NOT_FOUND");
  if (id(comment.authorId) !== id(req.user)) throw new ApiError(403, "FORBIDDEN");
  comment.body = cleanText(req.validated.body.body);
  comment.editedAt = new Date();
  await comment.save();
  await comment.populate("authorId", "name avatarUrl verification.identityStatus");
  const property = await findPublicProperty(comment.propertyId);
  const data = serializeComment(comment, {user: req.user, propertyOwnerId: property.ownerId});
  emitSocial(req, property._id, "property:comment:update", data);
  return success(res, {code: "COMMENT_UPDATED", data});
});

const deleteComment = asyncHandler(async (req, res) => {
  const comment = await PropertyComment.findOne({_id: req.params.id, deletedAt: null});
  if (!comment) return success(res, {code: "COMMENT_DELETED"});
  const property = await Property.findById(comment.propertyId).select("ownerId");
  if (!property) throw new ApiError(404, "NOT_FOUND");
  if (id(comment.authorId) !== id(req.user) && id(property.ownerId) !== id(req.user) && !roleCanModerate(req.user)) throw new ApiError(403, "FORBIDDEN");
  const before = comment.toObject();
  comment.deletedAt = new Date();
  comment.deletedBy = req.user._id;
  comment.body = "[deleted]";
  await comment.save();
  if (roleCanModerate(req.user) && id(comment.authorId) !== id(req.user) && id(property.ownerId) !== id(req.user)) {
    await audit({req, action: "COMMENT_DELETED", entityType: "COMMENT", entityId: comment._id, before, after: comment.toObject()});
  }
  const [commentCount, replyCount] = await Promise.all([
    PropertyComment.countDocuments({propertyId: property._id, deletedAt: null}),
    comment.parentId ? PropertyComment.countDocuments({parentId: comment.parentId, deletedAt: null}) : Promise.resolve(0),
  ]);
  await Promise.all([
    Property.updateOne({_id: property._id}, {$set: {"stats.comments": commentCount}}),
    comment.parentId ? PropertyComment.updateOne({_id: comment.parentId}, {$set: {replyCount}}) : Promise.resolve(),
  ]);
  emitSocial(req, property._id, "property:comment:delete", {propertyId: id(property._id), commentId: id(comment._id), parentId: id(comment.parentId)});
  return success(res, {code: "COMMENT_DELETED"});
});

const likeComment = asyncHandler(async (req, res) => {
  const comment = await PropertyComment.findOne({_id: req.validated.params.id, deletedAt: null});
  if (!comment) throw new ApiError(404, "NOT_FOUND");
  await findPublicProperty(comment.propertyId);
  let created = false;
  try { await CommentLike.create({commentId: comment._id, userId: req.user._id}); created = true; } catch (error) { if (error?.code !== 11000) throw error; }
  if (created) {
    const likes = await CommentLike.countDocuments({commentId: comment._id});
    await PropertyComment.updateOne({_id: comment._id}, {$set: {likeCount: likes}});
    await upsertLikeNotification({recipientId: comment.authorId, actor: req.user, targetType: "COMMENT_LIKES", targetId: comment._id, propertyId: comment.propertyId, likeCount: likes, req});
  }
  const likes = await CommentLike.countDocuments({commentId: comment._id});
  emitSocial(req, comment.propertyId, "property:comment:like", {commentId: id(comment._id), likes, liked: true});
  return success(res, {code: "LIKED", data: {liked: true, likes}});
});

const unlikeComment = asyncHandler(async (req, res) => {
  const comment = await PropertyComment.findById(req.validated.params.id);
  if (!comment) throw new ApiError(404, "NOT_FOUND");
  const result = await CommentLike.deleteOne({commentId: comment._id, userId: req.user._id});
  const likes = await CommentLike.countDocuments({commentId: comment._id});
  if (result.deletedCount) await PropertyComment.updateOne({_id: comment._id}, {$set: {likeCount: likes}});
  emitSocial(req, comment.propertyId, "property:comment:like", {commentId: id(comment._id), likes, liked: false});
  return success(res, {code: "UNLIKED", data: {liked: false, likes}});
});

module.exports = {createComment, deleteComment, likeComment, likeProperty, listComments, listReplies, unlikeComment, unlikeProperty, updateComment};
