const express = require("express");
const controller = require("../controllers/propertySocialController");
const {authenticate, optionalAuthenticate} = require("../middleware/auth");
const {writeLimiter} = require("../middleware/rateLimits");
const validate = require("../middleware/validate");
const {propertySocialSchemas} = require("../validators/schemas");

const router = express.Router();
router.get("/properties/:id/comments", optionalAuthenticate, validate(propertySocialSchemas.list), controller.listComments);
router.post("/properties/:id/comments", authenticate, writeLimiter, validate(propertySocialSchemas.create), controller.createComment);
router.post("/properties/:id/likes", authenticate, writeLimiter, validate(propertySocialSchemas.propertyId), controller.likeProperty);
router.delete("/properties/:id/likes", authenticate, writeLimiter, validate(propertySocialSchemas.propertyId), controller.unlikeProperty);
router.get("/property-comments/:id/replies", optionalAuthenticate, validate(propertySocialSchemas.listReplies), controller.listReplies);
router.patch("/property-comments/:id", authenticate, writeLimiter, validate(propertySocialSchemas.update), controller.updateComment);
router.delete("/property-comments/:id", authenticate, writeLimiter, validate(propertySocialSchemas.commentId), controller.deleteComment);
router.post("/property-comments/:id/likes", authenticate, writeLimiter, validate(propertySocialSchemas.commentId), controller.likeComment);
router.delete("/property-comments/:id/likes", authenticate, writeLimiter, validate(propertySocialSchemas.commentId), controller.unlikeComment);

module.exports = router;
