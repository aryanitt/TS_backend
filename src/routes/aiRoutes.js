const express = require("express");
const router = express.Router();
const { getInsights, generateInsights, createInsight } = require("../controllers/aiController");

router.get("/insights", getInsights);
router.post("/generate", generateInsights);
router.post("/insights", createInsight);

module.exports = router;
