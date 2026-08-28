const Notification = require("../models/Notification");

const createNotification = ({ userId, type, title, body, data = {} }) =>
  Notification.create({ userId, type, title, body, data });

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
