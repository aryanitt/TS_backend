const express = require("express");

const router = express.Router();

const {
  getDashboard,
  getRevenue,
  getPipeline,
  getRecentLeads,
  getLeadById
} = require("../controllers/dashboardController");


// MAIN DASHBOARD
router.get("/", getDashboard);


// REVENUE CHART
router.get("/revenue", getRevenue);


// PIPELINE + SERVICE BREAKDOWN
router.get("/pipeline", getPipeline);


// RECENT LEADS
router.get("/leads/recent", getRecentLeads);


// SINGLE LEAD DETAILS
router.get("/leads/:id", getLeadById);


module.exports = router;