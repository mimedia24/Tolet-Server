const express = require("express");
const { listNotifications, markAllRead, markRead } = require("../controllers/notificationController");
const { authenticate } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);
router.get("/", listNotifications);
router.patch("/read-all", markAllRead);
router.patch("/:id/read", markRead);

module.exports = router;
