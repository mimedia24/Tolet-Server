const DeviceRegistration = require("../models/DeviceRegistration");
const asyncHandler = require("../utils/asyncHandler");
const {encryptPushToken} = require("../utils/pushTokenCrypto");
const {success} = require("../utils/response");

const registerPushDevice = asyncHandler(async (req, res) => {
  const {installationId, token, platform} = req.validated.body;
  const encrypted = encryptPushToken(token);
  const device = await DeviceRegistration.findOneAndUpdate(
    {installationId},
    {
      $set: {
        userId: req.user._id,
        platform,
        enabled: true,
        disabledAt: null,
        disabledReason: "",
        lastSeenAt: new Date(),
        ...encrypted,
      },
    },
    {new: true, upsert: true, setDefaultsOnInsert: true},
  );
  return success(res, {
    code: "UPDATED",
    data: {installationId: device.installationId, platform: device.platform, enabled: device.enabled},
  });
});

const unregisterPushDevice = asyncHandler(async (req, res) => {
  await DeviceRegistration.updateOne(
    {installationId: req.params.installationId, userId: req.user._id},
    {$set: {enabled: false, disabledAt: new Date(), disabledReason: "LOGOUT"}},
  );
  return success(res, {code: "UPDATED"});
});

module.exports = {registerPushDevice, unregisterPushDevice};
