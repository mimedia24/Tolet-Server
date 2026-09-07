const fs = require("fs/promises");
const path = require("path");
const AdminLog = require("../models/AdminLog");
const CommentLike = require("../models/CommentLike");
const Conversation = require("../models/Conversation");
const DeviceRegistration = require("../models/DeviceRegistration");
const Favorite = require("../models/Favorite");
const HireInvitation = require("../models/HireInvitation");
const HousingOffer = require("../models/HousingOffer");
const HousingRequest = require("../models/HousingRequest");
const Job = require("../models/Job");
const JobApplication = require("../models/JobApplication");
const MarketListing = require("../models/MarketListing");
const Message = require("../models/Message");
const Notification = require("../models/Notification");
const OtpRequest = require("../models/OtpRequest");
const PanoramaSession = require("../models/PanoramaSession");
const Property = require("../models/Property");
const PropertyComment = require("../models/PropertyComment");
const PropertyLike = require("../models/PropertyLike");
const PushDelivery = require("../models/PushDelivery");
const Report = require("../models/Report");
const Session = require("../models/Session");
const User = require("../models/User");
const VisitBooking = require("../models/VisitBooking");
const WorkerProfile = require("../models/WorkerProfile");
const {config} = require("../config/env");

const inside = (root, target) => target === root || target.startsWith(`${root}${path.sep}`);

const collectUploadPaths = (value, paths = new Set()) => {
  if (Array.isArray(value)) value.forEach((item) => collectUploadPaths(item, paths));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectUploadPaths(item, paths));
  else if (typeof value === "string") {
    let pathname = value;
    try { pathname = new URL(value, config.publicBaseUrl).pathname; } catch {}
    const marker = "/uploads/";
    const index = pathname.indexOf(marker);
    if (index >= 0) {
      const relative = decodeURIComponent(pathname.slice(index + marker.length));
      const target = path.resolve(config.uploadDir, relative);
      if (inside(config.uploadDir, target)) paths.add(target);
    }
  }
  return paths;
};

const unlinkSafe = (target) => fs.rm(target, {recursive: true, force: true});

const scheduleDeletion = async (user) => {
  const now = new Date();
  user.accountStatus = "DELETION_PENDING";
  user.deletionRequestedAt = now;
  user.deletionScheduledFor = new Date(now.getTime() + config.accountDeletionGraceDays * 86400000);
  user.tokenVersion = Number(user.tokenVersion || 0) + 1;
  await user.save();
  await Promise.all([
    Session.updateMany({userId: user._id, revokedAt: null}, {$set: {revokedAt: now}}),
    DeviceRegistration.updateMany({userId: user._id, enabled: true}, {$set: {enabled: false, disabledAt: now, disabledReason: "ACCOUNT_DELETION"}}),
    Property.updateMany({ownerId: user._id, status: "ACTIVE"}, {$set: {status: "SUSPENDED", "moderation.reason": "ACCOUNT_DELETION_PENDING"}}),
    Job.updateMany({employerId: user._id, status: "ACTIVE"}, {$set: {status: "SUSPENDED", "moderation.reason": "ACCOUNT_DELETION_PENDING"}}),
    HousingRequest.updateMany({requesterId: user._id, status: "ACTIVE"}, {$set: {status: "SUSPENDED", "moderation.reason": "ACCOUNT_DELETION_PENDING"}}),
    MarketListing.updateMany({sellerId: user._id, status: "ACTIVE"}, {$set: {status: "SUSPENDED", "moderation.reason": "ACCOUNT_DELETION_PENDING"}}),
    WorkerProfile.updateMany({userId: user._id, status: "ACTIVE"}, {$set: {status: "SUSPENDED", "moderation.reason": "ACCOUNT_DELETION_PENDING"}}),
  ]);
  return user;
};

const cancelDeletion = async (user) => {
  user.accountStatus = "ACTIVE";
  user.deletionRequestedAt = null;
  user.deletionScheduledFor = null;
  await user.save();
  await Promise.all([
    Property.updateMany({ownerId: user._id, status: "SUSPENDED", "moderation.reason": "ACCOUNT_DELETION_PENDING"}, {$set: {status: "ACTIVE", "moderation.reason": ""}}),
    Job.updateMany({employerId: user._id, status: "SUSPENDED", "moderation.reason": "ACCOUNT_DELETION_PENDING"}, {$set: {status: "ACTIVE", "moderation.reason": ""}}),
    HousingRequest.updateMany({requesterId: user._id, status: "SUSPENDED", "moderation.reason": "ACCOUNT_DELETION_PENDING"}, {$set: {status: "ACTIVE", "moderation.reason": ""}}),
    MarketListing.updateMany({sellerId: user._id, status: "SUSPENDED", "moderation.reason": "ACCOUNT_DELETION_PENDING"}, {$set: {status: "ACTIVE", "moderation.reason": ""}}),
    WorkerProfile.updateMany({userId: user._id, status: "SUSPENDED", "moderation.reason": "ACCOUNT_DELETION_PENDING"}, {$set: {status: "ACTIVE", "moderation.reason": ""}}),
  ]);
  return user;
};

const purgeUser = async (user) => {
  const userId = user._id;
  const [properties, jobs, requests, market, worker, panoramas, conversations, comments, notifications, devices] = await Promise.all([
    Property.find({ownerId: userId}).lean(),
    Job.find({employerId: userId}).lean(),
    HousingRequest.find({requesterId: userId}).lean(),
    MarketListing.find({sellerId: userId}).lean(),
    WorkerProfile.findOne({userId}).lean(),
    PanoramaSession.find({userId}).lean(),
    Conversation.find({participants: userId}).lean(),
    PropertyComment.find({authorId: userId}).lean(),
    Notification.find({userId}).select("_id").lean(),
    DeviceRegistration.find({userId}).select("_id").lean(),
  ]);
  const propertyIds = properties.map((item) => item._id);
  const jobIds = jobs.map((item) => item._id);
  const requestIds = requests.map((item) => item._id);
  const marketIds = market.map((item) => item._id);
  const conversationIds = conversations.map((item) => item._id);
  const commentIds = comments.map((item) => item._id);
  const notificationIds = notifications.map((item) => item._id);
  const deviceIds = devices.map((item) => item._id);
  const [applications, messages] = await Promise.all([
    JobApplication.find({$or: [{applicantId: userId}, {employerId: userId}, {jobId: {$in: jobIds}}]}).lean(),
    Message.find({$or: [{senderId: userId}, {conversationId: {$in: conversationIds}}]}).lean(),
  ]);
  const filePaths = collectUploadPaths([user.toObject(), properties, jobs, requests, market, worker, panoramas, applications, messages]);
  for (const filename of [user.verification?.nidFrontFile, user.verification?.nidBackFile, user.verification?.selfieFile]) {
    if (!filename) continue;
    const root = filename === user.verification?.selfieFile ? config.uploadDir : config.kycUploadDir;
    const target = path.resolve(root, path.basename(filename));
    if (inside(root, target)) filePaths.add(target);
  }

  await Promise.all([
    PushDelivery.deleteMany({$or: [{notificationId: {$in: notificationIds}}, {deviceRegistrationId: {$in: deviceIds}}]}),
    CommentLike.deleteMany({$or: [{userId}, {commentId: {$in: commentIds}}]}),
    PropertyLike.deleteMany({$or: [{userId}, {propertyId: {$in: propertyIds}}]}),
    PropertyComment.deleteMany({$or: [{authorId: userId}, {propertyId: {$in: propertyIds}}]}),
    Favorite.deleteMany({$or: [{userId}, {entityId: {$in: [...propertyIds, ...jobIds, ...marketIds]}}]}),
    JobApplication.deleteMany({$or: [{applicantId: userId}, {employerId: userId}, {jobId: {$in: jobIds}}]}),
    HireInvitation.deleteMany({$or: [{workerId: userId}, {employerId: userId}, {jobId: {$in: jobIds}}]}),
    HousingOffer.deleteMany({$or: [{ownerId: userId}, {requestId: {$in: requestIds}}, {propertyId: {$in: propertyIds}}]}),
    VisitBooking.deleteMany({$or: [{visitorId: userId}, {ownerId: userId}, {propertyId: {$in: propertyIds}}]}),
    Message.deleteMany({$or: [{senderId: userId}, {conversationId: {$in: conversationIds}}]}),
    Conversation.deleteMany({_id: {$in: conversationIds}}),
    Report.deleteMany({$or: [{reporterId: userId}, {entityId: {$in: [userId, ...propertyIds, ...jobIds, ...marketIds]}}]}),
    Notification.deleteMany({userId}),
    DeviceRegistration.deleteMany({userId}),
    Session.deleteMany({userId}),
    OtpRequest.deleteMany({phone: user.phone}),
    PanoramaSession.deleteMany({userId}),
    WorkerProfile.deleteMany({userId}),
    Property.deleteMany({ownerId: userId}),
    Job.deleteMany({employerId: userId}),
    HousingRequest.deleteMany({requesterId: userId}),
    MarketListing.deleteMany({sellerId: userId}),
    AdminLog.deleteMany({$or: [{adminId: userId}, {entityId: {$in: [userId, ...propertyIds, ...jobIds, ...marketIds]}}]}),
  ]);
  await Promise.all([...filePaths].map(unlinkSafe));
  await Promise.all(panoramas.map((item) => unlinkSafe(path.resolve(config.panorama.sessionDir, String(item._id)))));
  await User.deleteOne({_id: userId, accountStatus: "DELETION_PENDING"});
};

const processDueAccountDeletions = async () => {
  const users = await User.find({accountStatus: "DELETION_PENDING", deletionScheduledFor: {$lte: new Date()}}).select("+tokenVersion");
  let deleted = 0;
  for (const user of users) {
    await purgeUser(user);
    deleted += 1;
  }
  return {deleted};
};

module.exports = {cancelDeletion, processDueAccountDeletions, purgeUser, scheduleDeletion};
