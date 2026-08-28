const express = require("express");
const {
  createMarketListing,
  deleteMarketListing,
  getMarketContact,
  getMarketListing,
  getMyMarketListings,
  listMarketListings,
  markMarketListingSold,
  submitMarketListing,
  updateMarketListing,
} = require("../controllers/marketListingController");
const { authenticate, optionalAuthenticate } = require("../middleware/auth");
const { requireCapability } = require("../middleware/authorize");
const validate = require("../middleware/validate");
const { marketListingSchemas } = require("../validators/schemas");

const router = express.Router();

router.get("/", optionalAuthenticate, listMarketListings);
router.get("/me", authenticate, requireCapability("MARKET_SELLER"), getMyMarketListings);
router.post(
  "/",
  authenticate,
  requireCapability("MARKET_SELLER"),
  validate(marketListingSchemas.create),
  createMarketListing
);
router.get("/:id", optionalAuthenticate, validate(marketListingSchemas.byId), getMarketListing);
router.patch(
  "/:id",
  authenticate,
  requireCapability("MARKET_SELLER"),
  validate(marketListingSchemas.update),
  updateMarketListing
);
router.delete(
  "/:id",
  authenticate,
  requireCapability("MARKET_SELLER"),
  validate(marketListingSchemas.byId),
  deleteMarketListing
);
router.post(
  "/:id/submit",
  authenticate,
  requireCapability("MARKET_SELLER"),
  validate(marketListingSchemas.byId),
  submitMarketListing
);
router.patch(
  "/:id/status",
  authenticate,
  requireCapability("MARKET_SELLER"),
  validate(marketListingSchemas.ownerStatus),
  markMarketListingSold
);
router.post(
  "/:id/contact",
  authenticate,
  validate(marketListingSchemas.byId),
  getMarketContact
);

module.exports = router;
