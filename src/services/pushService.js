const fs = require("fs");
const path = require("path");
const {applicationDefault, cert, getApps, initializeApp} = require("firebase-admin/app");
const {getMessaging} = require("firebase-admin/messaging");
const {config} = require("../config/env");
const logger = require("../config/logger");
const Conversation = require("../models/Conversation");
const DeviceRegistration = require("../models/DeviceRegistration");
const Message = require("../models/Message");
const Notification = require("../models/Notification");
const PushDelivery = require("../models/PushDelivery");
const {decryptPushToken} = require("../utils/pushTokenCrypto");

const RETRY_DELAYS_MS = [5000, 30000, 120000, 600000, 3600000, 21600000];
const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

let messagingClient;
let workerRunning = false;
let kickScheduled = false;

const firebaseMessaging = () => {
  if (messagingClient) return messagingClient;
  if (!config.features.pushNotifications) return null;
  if (!getApps().length) {
    const configuredPath = config.push.firebaseServiceAccountPath;
    const credential = configuredPath
      ? cert(JSON.parse(fs.readFileSync(path.resolve(configuredPath), "utf8")))
      : applicationDefault();
    initializeApp({credential});
  }
  messagingClient = getMessaging();
  return messagingClient;
};

const deliveryExpiry = (createdAt = new Date()) =>
  new Date(new Date(createdAt).getTime() + config.push.deliveryTtlHours * 60 * 60 * 1000);

const enqueueNotificationDeliveries = async (notification) => {
  if (!config.features.pushNotifications) return 0;
  const devices = await DeviceRegistration.find({
    userId: notification.userId,
    enabled: true,
  }).select("_id");
  if (!devices.length) return 0;
  const expiresAt = deliveryExpiry(notification.createdAt);
  await PushDelivery.bulkWrite(
    devices.map((device) => ({
      updateOne: {
        filter: {notificationId: notification._id, deviceRegistrationId: device._id},
        update: {
          $setOnInsert: {
            status: "PENDING",
            attemptCount: 0,
            nextAttemptAt: new Date(),
            expiresAt,
          },
        },
        upsert: true,
      },
    })),
    {ordered: false},
  );
  return devices.length;
};

const ensureMessageNotification = async ({message, sender, recipientId}) => {
  const senderName = String(sender?.name || "Rentize User").trim().slice(0, 100) || "Rentize User";
  const sourceKey = `MESSAGE:${message._id}`;
  const notification = await Notification.findOneAndUpdate(
    {sourceKey},
    {
      $setOnInsert: {
        userId: recipientId,
        sourceKey,
        type: "MESSAGE",
        title: {
          en: `New message from ${senderName}`,
          bn: `${senderName}-এর নতুন মেসেজ`,
        },
        body: {en: message.text.slice(0, 160), bn: message.text.slice(0, 160)},
        data: {
          type: "MESSAGE",
          conversationId: String(message.conversationId),
          messageId: String(message._id),
          senderId: String(message.senderId?._id || message.senderId),
          senderName,
        },
      },
    },
    {new: true, upsert: true, setDefaultsOnInsert: true},
  );
  await enqueueNotificationDeliveries(notification);
  await Message.updateOne(
    {_id: message._id},
    {$set: {notificationState: "READY", notificationLastAttemptAt: new Date()}},
  );
  return notification;
};

const reconcileMessageNotifications = async (limit = 100) => {
  const pending = await Message.find({
    notificationRequired: true,
    notificationState: {$ne: "READY"},
    deletedAt: null,
  })
    .sort({createdAt: 1})
    .limit(limit)
    .populate("senderId", "name");
  let repaired = 0;
  for (const message of pending) {
    try {
      await Message.updateOne({_id: message._id}, {$set: {notificationLastAttemptAt: new Date()}});
      const conversation = await Conversation.findById(message.conversationId).select("participants");
      const recipientId = conversation?.participants.find(
        (participant) => String(participant) !== String(message.senderId?._id || message.senderId),
      );
      if (!recipientId) continue;
      await ensureMessageNotification({message, sender: message.senderId, recipientId});
      repaired += 1;
    } catch (error) {
      logger.error({err: error, messageId: String(message._id)}, "Message notification reconciliation failed");
    }
  }
  return repaired;
};

const claimNextDelivery = () => {
  const now = new Date();
  return PushDelivery.findOneAndUpdate(
    {
      expiresAt: {$gt: now},
      $or: [
        {status: {$in: ["PENDING", "RETRY"]}, nextAttemptAt: {$lte: now}},
        {status: "PROCESSING", leaseUntil: {$lte: now}},
      ],
    },
    {
      $set: {status: "PROCESSING", leaseUntil: new Date(now.getTime() + 30000)},
      $inc: {attemptCount: 1},
    },
    {new: true, sort: {nextAttemptAt: 1}},
  );
};

const markDeliveryFailure = async (delivery, errorCode, {invalidToken = false, permanent = false} = {}) => {
  if (invalidToken) {
    await DeviceRegistration.updateOne(
      {_id: delivery.deviceRegistrationId},
      {$set: {enabled: false, disabledAt: new Date(), disabledReason: "INVALID_TOKEN"}},
    );
  }
  const retryDelay = RETRY_DELAYS_MS[delivery.attemptCount - 1];
  const expired = delivery.expiresAt <= new Date();
  const canRetry = !invalidToken && !permanent && !expired && retryDelay !== undefined;
  await PushDelivery.updateOne(
    {_id: delivery._id},
    {
      $set: {
        status: canRetry ? "RETRY" : "FAILED",
        nextAttemptAt: canRetry ? new Date(Date.now() + retryDelay) : delivery.nextAttemptAt,
        leaseUntil: null,
        lastErrorCode: String(errorCode || "PUSH_SEND_FAILED").slice(0, 160),
      },
    },
  );
};

const sendClaimedDelivery = async (delivery) => {
  const [notification, device] = await Promise.all([
    Notification.findById(delivery.notificationId),
    DeviceRegistration.findById(delivery.deviceRegistrationId).select(
      "+tokenCiphertext +tokenIv +tokenTag +tokenHash",
    ),
  ]);
  if (!notification || !device?.enabled) {
    await markDeliveryFailure(
      delivery,
      !notification ? "NOTIFICATION_MISSING" : "DEVICE_DISABLED",
      {permanent: true},
    );
    return false;
  }
  try {
    const token = decryptPushToken(device);
    const data = Object.fromEntries(
      Object.entries(notification.data || {}).map(([key, value]) => [key, String(value ?? "")]),
    );
    data.notificationId = String(notification._id);
    const threadId = data.conversationId || data.propertyId || String(notification._id);
    await firebaseMessaging().send({
      token,
      notification: {
        title: notification.title?.en || "New message",
        body: notification.body?.en || "You have a new message",
      },
      data,
      android: {
        priority: "high",
        ttl: Math.max(0, delivery.expiresAt.getTime() - Date.now()),
        notification: {channelId: "messages", sound: "default", tag: threadId},
      },
      apns: {
        headers: {"apns-priority": "10"},
        payload: {aps: {sound: "default", "thread-id": threadId}},
      },
    });
    await PushDelivery.updateOne(
      {_id: delivery._id},
      {$set: {status: "SENT", sentAt: new Date(), leaseUntil: null, lastErrorCode: ""}},
    );
    logger.info(
      {deliveryId: String(delivery._id), notificationId: String(notification._id), attemptCount: delivery.attemptCount},
      "Push delivery accepted by FCM",
    );
    return true;
  } catch (error) {
    const errorCode = error?.code || "PUSH_SEND_FAILED";
    const invalidToken = INVALID_TOKEN_CODES.has(errorCode);
    await markDeliveryFailure(delivery, errorCode, {invalidToken});
    logger.warn(
      {deliveryId: String(delivery._id), errorCode, attemptCount: delivery.attemptCount},
      "Push delivery attempt failed",
    );
    return false;
  }
};

const processPendingPushDeliveries = async (limit = 50) => {
  if (!config.features.pushNotifications || workerRunning) return {processed: 0};
  workerRunning = true;
  let processed = 0;
  try {
    for (; processed < limit; processed += 1) {
      const delivery = await claimNextDelivery();
      if (!delivery) break;
      await sendClaimedDelivery(delivery);
    }
    return {processed};
  } finally {
    workerRunning = false;
  }
};

const kickPushWorker = () => {
  if (!config.features.pushNotifications || kickScheduled) return;
  kickScheduled = true;
  Promise.resolve().then(async () => {
    kickScheduled = false;
    try {
      await processPendingPushDeliveries();
    } catch (error) {
      logger.error({err: error}, "Immediate push worker failed");
    }
  });
};

const pruneStaleDeviceRegistrations = () => {
  const cutoff = new Date(Date.now() - config.push.staleDeviceDays * 24 * 60 * 60 * 1000);
  return DeviceRegistration.updateMany(
    {enabled: true, lastSeenAt: {$lt: cutoff}},
    {$set: {enabled: false, disabledAt: new Date(), disabledReason: "STALE"}},
  );
};

module.exports = {
  enqueueNotificationDeliveries,
  ensureMessageNotification,
  kickPushWorker,
  processPendingPushDeliveries,
  pruneStaleDeviceRegistrations,
  reconcileMessageNotifications,
  sendClaimedDelivery,
  setMessagingClientForTests: (client) => {
    messagingClient = client;
  },
};
