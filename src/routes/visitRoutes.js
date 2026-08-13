const express = require("express");
const { createVisit, listVisits, updateVisit } = require("../controllers/visitController");
const { authenticate } = require("../middleware/auth");
const feature = require("../middleware/feature");

const router = express.Router();
router.use(authenticate, feature("visitBooking"));
router.get("/", listVisits);
router.post("/properties/:propertyId", createVisit);
router.patch("/:id", updateVisit);

module.exports = router;
