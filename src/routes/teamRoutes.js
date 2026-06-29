const express = require("express");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

const {
  getTeamDashboard,
  getTeamPerformance,
  getEmployees,
  getEmployeeDetails,
  getEmployeeLeads,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  resetEmployeeCredentials,
  getTeamKPIs,
  getChartData,
} = require("../controllers/teamController");

router.get("/dashboard", getTeamDashboard);
router.get("/performance", getTeamPerformance);
router.get("/employees", getEmployees);
router.get("/employees/details/:id", getEmployeeDetails);
router.get("/employees/leads", getEmployeeLeads);
router.post("/employees/create", requireAdmin, createEmployee);
router.post("/employees/update", updateEmployee);
router.delete("/employees/:id", requireAdmin, deleteEmployee);
router.post("/employees/:id/reset-password", requireAdmin, resetEmployeeCredentials);
router.get("/kpis", getTeamKPIs);
router.get("/chart-data", getChartData);

module.exports = router;
