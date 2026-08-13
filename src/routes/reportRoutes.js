const express = require("express");
const { createReport, myReports } = require("../controllers/reportController");
const { authenticate } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { reportSchema } = require("../validators/schemas");

const router = express.Router();
router.use(authenticate);
router.get("/me", myReports);
router.post("/", validate(reportSchema), createReport);

module.exports = router;
