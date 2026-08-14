const express = require("express");
const {
  createProperty,
  deleteProperty,
  getContact,
  getMyProperties,
  getProperty,
  listMapProperties,
  listProperties,
  submitProperty,
  updateOwnerStatus,
  updateProperty,
} = require("../controllers/propertyController");
const { authenticate, optionalAuthenticate } = require("../middleware/auth");
const { requireCapability } = require("../middleware/authorize");
const validate = require("../middleware/validate");
const { propertySchemas } = require("../validators/schemas");

const router = express.Router();

router.get("/", optionalAuthenticate, listProperties);
router.get("/map", listMapProperties);
router.get("/me", authenticate, requireCapability("PROPERTY_OWNER"), getMyProperties);
router.post("/", authenticate, requireCapability("PROPERTY_OWNER"), validate(propertySchemas.create), createProperty);
router.get("/:id", optionalAuthenticate, validate(propertySchemas.byId), getProperty);
router.patch("/:id", authenticate, requireCapability("PROPERTY_OWNER"), validate(propertySchemas.update), updateProperty);
router.delete("/:id", authenticate, requireCapability("PROPERTY_OWNER"), validate(propertySchemas.byId), deleteProperty);
router.post("/:id/submit", authenticate, requireCapability("PROPERTY_OWNER"), validate(propertySchemas.byId), submitProperty);
router.patch("/:id/status", authenticate, requireCapability("PROPERTY_OWNER"), validate(propertySchemas.ownerStatus), updateOwnerStatus);
router.post("/:id/contact", authenticate, getContact);

module.exports = router;
