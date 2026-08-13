const express = require("express");
const { addFavorite, listFavorites, removeFavorite } = require("../controllers/favoriteController");
const { authenticate } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);
router.get("/", listFavorites);
router.post("/:entityType/:entityId", addFavorite);
router.delete("/:entityType/:entityId", removeFavorite);

module.exports = router;
