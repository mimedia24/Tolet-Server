const express = require("express");
const {
  dashboard,
  getPlatformSettings,
  getUserKycDocument,
  listAuditLogs,
  listJobs,
  listMarketListings,
  listHousingRequests,
  listProperties,
  listReports,
  listUsers,
  listWorkerProfiles,
  moderateJob,
  moderateMarketListing,
  moderateHousingRequest,
  moderateProperty,
  moderateWorkerProfile,
  resolveReport,
  updatePlatformSettings,
  updateUserRole,
  updateUserStatus,
  updateUserVerification,
} = require("../controllers/adminController");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/authorize");
const validate = require("../middleware/validate");
const { moderationSchemas } = require("../validators/schemas");
const {deleteComment} = require("../controllers/propertySocialController");

const router = express.Router();
router.use(authenticate, requireRole("MODERATOR", "ADMIN", "SUPER_ADMIN"));
router.get("/dashboard", dashboard);
router.get("/properties", listProperties);
router.post("/properties/:id/moderate", validate(moderationSchemas.property), moderateProperty);
router.get("/jobs", listJobs);
router.post("/jobs/:id/moderate", validate(moderationSchemas.job), moderateJob);
router.get("/market-listings", listMarketListings);
router.post("/market-listings/:id/moderate", validate(moderationSchemas.job), moderateMarketListing);
router.get("/housing-requests", listHousingRequests);
router.post("/housing-requests/:id/moderate", validate(moderationSchemas.job), moderateHousingRequest);
router.get("/worker-profiles", listWorkerProfiles);
router.post("/worker-profiles/:id/moderate", validate(moderationSchemas.job), moderateWorkerProfile);
router.get("/users", listUsers);
router.patch("/users/:id/status", validate(moderationSchemas.userStatus), updateUserStatus);
router.patch("/users/:id/verification", validate(moderationSchemas.userVerification), updateUserVerification);
router.get("/users/:id/kyc/:side", getUserKycDocument);
router.patch("/users/:id/role", updateUserRole);
router.get("/reports", listReports);
router.patch("/reports/:id", resolveReport);
router.delete("/comments/:id", deleteComment);
router.get("/settings", getPlatformSettings);
router.patch("/settings", requireRole("ADMIN", "SUPER_ADMIN"), updatePlatformSettings);
router.get("/audit-logs", requireRole("ADMIN", "SUPER_ADMIN"), listAuditLogs);

module.exports = router;
