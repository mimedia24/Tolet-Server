const test = require("node:test");
const assert = require("node:assert/strict");
const Property = require("../src/models/Property");
const Job = require("../src/models/Job");
const MarketListing = require("../src/models/MarketListing");
const DeviceRegistration = require("../src/models/DeviceRegistration");
const Message = require("../src/models/Message");
const Notification = require("../src/models/Notification");
const PushDelivery = require("../src/models/PushDelivery");
const PropertyLike = require("../src/models/PropertyLike");
const PropertyComment = require("../src/models/PropertyComment");
const CommentLike = require("../src/models/CommentLike");

const location = { district: "Dhaka", city: "Dhaka", area: "Mohammadpur", address: "Road 3", exactPublic: false, point: { type: "Point", coordinates: [90.36, 23.76] } };
const translations = { en: { title: "Three bedroom apartment", description: "A bright and comfortable apartment ready for a verified tenant." }, bn: { title: "তিন বেডরুমের ফ্ল্যাট", description: "ভেরিফাইড ভাড়াটিয়ার জন্য আরামদায়ক ফ্ল্যাট।" } };

test("valid residential property passes schema validation", () => {
  const property = new Property({ ownerId: "64b000000000000000000001", kind: "RESIDENTIAL", category: "APARTMENT", translations, rent: 25000, attributes: { sizeSqft: 1350, bedrooms: 3, bathrooms: 2 }, location, availableFrom: new Date(Date.now() + 86400000) });
  assert.equal(property.validateSync(), undefined);
});

test("invalid property category is rejected for kind", async () => {
  const property = new Property({ ownerId: "64b000000000000000000001", kind: "RESIDENTIAL", category: "SHOP", translations, rent: 25000, attributes: { sizeSqft: 800 }, location, availableFrom: new Date() });
  await assert.rejects(property.validate(), /invalid for RESIDENTIAL/);
});

test("job schema accepts only the fixed property-related categories", () => {
  const job = new Job({ employerId: "64b000000000000000000001", employerName: "Green Valley Residence", category: "CARETAKER", translations: { en: { title: "Caretaker needed", description: "Full-time caretaker needed for a residential building in Dhaka." } }, salary: { type: "FIXED", amount: 18000 }, location, jobType: "FULL_TIME", personsNeeded: 1, workingHours: "8 AM - 6 PM", applicationDeadline: new Date(Date.now() + 86400000) });
  assert.equal(job.validateSync(), undefined);
  job.category = "SOFTWARE_ENGINEER";
  assert.ok(job.validateSync().errors.category);
});

test("marketplace listing stores a global-header district and clean product facts", () => {
  const listing = new MarketListing({
    sellerId: "64b000000000000000000001",
    translations: {
      en: {
        title: "Samsung Galaxy S23 Ultra",
        description: "Used carefully and sold with the original box and charger.",
      },
    },
    category: "MOBILE_TABLET",
    condition: "USED",
    price: 35555,
    district: "Dhaka",
    media: [{ type: "IMAGE", url: "https://example.com/phone.jpg", order: 0 }],
    attributes: { brand: "Samsung", model: "S23 Ultra", warranty: "NONE" },
  });
  assert.equal(listing.validateSync(), undefined);
});

test("chat push records validate without storing a plaintext device token", () => {
  const userId = "64b000000000000000000001";
  const conversationId = "64b000000000000000000002";
  const messageId = "64b000000000000000000003";
  const notificationId = "64b000000000000000000004";
  const deviceId = "64b000000000000000000005";
  const message = new Message({
    _id: messageId,
    conversationId,
    senderId: userId,
    clientMessageId: "msg-client-123456",
    contentHash: "a".repeat(64),
    text: "Hello",
    notificationRequired: true,
  });
  const notification = new Notification({
    _id: notificationId,
    userId,
    sourceKey: `MESSAGE:${messageId}`,
    type: "MESSAGE",
    title: {en: "New message"},
    body: {en: "Hello"},
  });
  const device = new DeviceRegistration({
    _id: deviceId,
    userId,
    installationId: "android-installation-123",
    tokenCiphertext: "encrypted",
    tokenIv: "iv",
    tokenTag: "tag",
    tokenHash: "b".repeat(64),
    platform: "ANDROID",
  });
  const delivery = new PushDelivery({
    notificationId,
    deviceRegistrationId: deviceId,
    expiresAt: new Date(Date.now() + 60000),
  });
  assert.equal(message.validateSync(), undefined);
  assert.equal(notification.validateSync(), undefined);
  assert.equal(device.validateSync(), undefined);
  assert.equal(delivery.validateSync(), undefined);
  assert.equal(device.toObject().token, undefined);
});

test("property social records validate and property has safe counters", () => {
  const propertyId = "64b000000000000000000010";
  const userId = "64b000000000000000000011";
  const commentId = "64b000000000000000000012";
  const like = new PropertyLike({propertyId, userId});
  const comment = new PropertyComment({_id: commentId, propertyId, authorId: userId, body: "Is this apartment still available?"});
  const commentLike = new CommentLike({commentId, userId});
  assert.equal(like.validateSync(), undefined);
  assert.equal(comment.validateSync(), undefined);
  assert.equal(commentLike.validateSync(), undefined);
  assert.equal(comment.likeCount, 0);
  assert.equal(comment.replyCount, 0);
});
