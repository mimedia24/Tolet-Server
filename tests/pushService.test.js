const test = require("node:test");
const assert = require("node:assert/strict");
const DeviceRegistration = require("../src/models/DeviceRegistration");
const Notification = require("../src/models/Notification");
const PushDelivery = require("../src/models/PushDelivery");
const {encryptPushToken} = require("../src/utils/pushTokenCrypto");
const {sendClaimedDelivery, setMessagingClientForTests} = require("../src/services/pushService");

test("push worker sends an encrypted token through the mocked FCM client", async () => {
  const originals = {
    findNotification: Notification.findById,
    findDevice: DeviceRegistration.findById,
    updateDelivery: PushDelivery.updateOne,
  };
  const sent = [];
  const updates = [];
  const encrypted = encryptPushToken("firebase-device-token-secret-value");
  try {
    Notification.findById = async () => ({
      _id: "64b000000000000000000004",
      title: {en: "New message from Rahim"},
      body: {en: "Hello"},
      data: {
        type: "MESSAGE",
        conversationId: "64b000000000000000000002",
        messageId: "64b000000000000000000003",
        senderId: "64b000000000000000000001",
      },
    });
    DeviceRegistration.findById = () => ({
      select: async () => ({enabled: true, ...encrypted}),
    });
    PushDelivery.updateOne = async (_filter, update) => updates.push(update);
    setMessagingClientForTests({send: async (payload) => sent.push(payload)});
    const delivered = await sendClaimedDelivery({
      _id: "64b000000000000000000006",
      notificationId: "64b000000000000000000004",
      deviceRegistrationId: "64b000000000000000000005",
      attemptCount: 1,
      nextAttemptAt: new Date(),
      expiresAt: new Date(Date.now() + 60000),
    });
    assert.equal(delivered, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].token, "firebase-device-token-secret-value");
    assert.equal(sent[0].data.conversationId, "64b000000000000000000002");
    assert.equal(updates.at(-1).$set.status, "SENT");
  } finally {
    Notification.findById = originals.findNotification;
    DeviceRegistration.findById = originals.findDevice;
    PushDelivery.updateOne = originals.updateDelivery;
    setMessagingClientForTests(null);
  }
});

test("push worker schedules a durable retry after a transient FCM failure", async () => {
  const originals = {
    findNotification: Notification.findById,
    findDevice: DeviceRegistration.findById,
    updateDelivery: PushDelivery.updateOne,
  };
  const updates = [];
  const encrypted = encryptPushToken("firebase-device-token-secret-value");
  try {
    Notification.findById = async () => ({
      _id: "64b000000000000000000004",
      title: {en: "New message"},
      body: {en: "Hello"},
      data: {conversationId: "64b000000000000000000002"},
    });
    DeviceRegistration.findById = () => ({select: async () => ({enabled: true, ...encrypted})});
    PushDelivery.updateOne = async (_filter, update) => updates.push(update);
    setMessagingClientForTests({send: async () => {
      const error = new Error("temporarily unavailable");
      error.code = "messaging/server-unavailable";
      throw error;
    }});
    const delivered = await sendClaimedDelivery({
      _id: "64b000000000000000000006",
      notificationId: "64b000000000000000000004",
      deviceRegistrationId: "64b000000000000000000005",
      attemptCount: 1,
      nextAttemptAt: new Date(),
      expiresAt: new Date(Date.now() + 60000),
    });
    assert.equal(delivered, false);
    assert.equal(updates.at(-1).$set.status, "RETRY");
    assert.ok(updates.at(-1).$set.nextAttemptAt > new Date());
  } finally {
    Notification.findById = originals.findNotification;
    DeviceRegistration.findById = originals.findDevice;
    PushDelivery.updateOne = originals.updateDelivery;
    setMessagingClientForTests(null);
  }
});
