const express = require("express");
const {registerPushDevice, unregisterPushDevice} = require("../controllers/deviceController");
const {authenticate} = require("../middleware/auth");
const validate = require("../middleware/validate");
const {deviceSchemas} = require("../validators/schemas");

const router = express.Router();
router.use(authenticate);
router.post("/push", validate(deviceSchemas.registerPush), registerPushDevice);
router.delete("/push/:installationId", validate(deviceSchemas.unregisterPush), unregisterPushDevice);

module.exports = router;
