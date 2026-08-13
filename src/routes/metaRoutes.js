const express = require("express");
const { getMetadata } = require("../controllers/metaController");

const router = express.Router();
router.get("/", getMetadata);

module.exports = router;
