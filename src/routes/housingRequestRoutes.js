const express = require("express");
const controller = require("../controllers/housingRequestController");
const { authenticate, optionalAuthenticate } = require("../middleware/auth");
const { requireCapability } = require("../middleware/authorize");
const feature = require("../middleware/feature");
const validate = require("../middleware/validate");
const { housingRequestSchemas } = require("../validators/schemas");

const router = express.Router();
router.use(feature("housingRequests"));
router.get("/", controller.list);
router.get("/me", authenticate, controller.mine);
router.post("/", authenticate, requireCapability("TENANT"), validate(housingRequestSchemas.create), controller.create);
router.patch("/offers/:offerId", authenticate, validate(housingRequestSchemas.offerStatus), controller.updateOffer);
router.get("/:id", optionalAuthenticate, validate(housingRequestSchemas.byId), controller.getOne);
router.patch("/:id", authenticate, validate(housingRequestSchemas.update), controller.update);
router.delete("/:id", authenticate, validate(housingRequestSchemas.byId), controller.remove);
router.post("/:id/submit", authenticate, validate(housingRequestSchemas.byId), controller.submit);
router.patch("/:id/status", authenticate, validate(housingRequestSchemas.ownerStatus), controller.setStatus);
router.post("/:id/offers", authenticate, requireCapability("PROPERTY_OWNER"), validate(housingRequestSchemas.offer), controller.createOffer);
router.get("/:id/offers", authenticate, controller.listOffers);

module.exports = router;
