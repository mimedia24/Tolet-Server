const Notification = require("../models/Notification");
const Message = require("../models/Message");
const {enqueueNotificationDeliveries} = require("./pushService");

const createNotification = async ({ userId, type, title, body, data = {} }) => {
  const messageId = type === "MESSAGE" ? data?.messageId : null;
  const senderName = String(data?.senderName || "").trim().slice(0, 100);
  const normalizedTitle = messageId && senderName
    ? {en: `New message from ${senderName}`, bn: `${senderName}-এর নতুন মেসেজ`}
    : title;
  const notification = messageId
    ? await Notification.findOneAndUpdate(
        {sourceKey: `MESSAGE:${messageId}`},
        {$setOnInsert: {userId, type, title: normalizedTitle, body, data, sourceKey: `MESSAGE:${messageId}`}},
        {new: true, upsert: true, setDefaultsOnInsert: true},
      )
    : await Notification.create({userId, type, title: normalizedTitle, body, data});
  if (messageId) {
    await enqueueNotificationDeliveries(notification);
    await Message.updateOne(
      {_id: messageId},
      {$set: {notificationState: "READY", notificationLastAttemptAt: new Date()}},
    );
  }
  return notification;
};

const moderationNotification = ({ userId, entityType, entityId, action, reason = "" }) => {
  const labels = {
    PROPERTY: { en: "Property", bn: "প্রপার্টি" },
    JOB: { en: "Job", bn: "চাকরি" },
    HOUSING_REQUEST: { en: "Housing request", bn: "বাসা চাই পোস্ট" },
    WORKER_PROFILE: { en: "Worker profile", bn: "কর্মী প্রোফাইল" },
    MARKET_LISTING: { en: "Marketplace listing", bn: "মার্কেটপ্লেস বিজ্ঞাপন" },
  };
  const label = labels[entityType] || { en: "Post", bn: "পোস্ট" };
  return createNotification({
    userId,
    type: `${entityType}_${action}`,
    title: {
      en: `${label.en} review update`,
      bn: `${label.bn} পর্যালোচনার আপডেট`,
    },
    body: {
      en: `Your ${entityType.toLowerCase()} status is now ${action}.${reason ? ` Reason: ${reason}` : ""}`,
      bn: `আপনার ${label.bn}-এর অবস্থা এখন ${action}.${reason ? ` কারণ: ${reason}` : ""}`,
    },
    data: { entityType, entityId, action },
  });
};

module.exports = { createNotification, moderationNotification };
