const express = require("express");
const { blockConversation, createConversation, listConversations, listMessages, sendMessage } = require("../controllers/chatController");
const { authenticate } = require("../middleware/auth");
const feature = require("../middleware/feature");
const validate = require("../middleware/validate");
const { chatSchemas } = require("../validators/schemas");

const router = express.Router();
router.use(authenticate, feature("chat"));
router.get("/conversations", listConversations);
router.post("/conversations", validate(chatSchemas.create), createConversation);
router.get("/conversations/:id/messages", validate(chatSchemas.byId), listMessages);
router.post("/conversations/:id/messages", validate(chatSchemas.message), sendMessage);
router.patch("/conversations/:id/block", validate(chatSchemas.byId), blockConversation);

module.exports = router;
