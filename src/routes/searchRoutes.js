const express = require("express");
const { smartSearch } = require("../controllers/smartSearchController");
const feature = require("../middleware/feature");

const router = express.Router();
router.get("/smart", feature("aiSearch"), smartSearch);

module.exports = router;
