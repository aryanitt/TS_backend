const express = require("express");

const router = express.Router();

const {
  getIncentiveDashboard,
  getLeaderboard,
  getCalculatorData
} = require("../controllers/incentivesController");

router.get("/dashboard", getIncentiveDashboard);

router.get("/leaderboard", getLeaderboard);

router.get("/calculator", getCalculatorData);

module.exports = router;