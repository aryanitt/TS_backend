const express = require("express");

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
   getTeamKPIs, 
    getChartData,
} = require("../controllers/teamController");

router.get("/dashboard", getTeamDashboard);
router.get("/performance", getTeamPerformance);
router.get("/employees", getEmployees);
router.get("/employees/details/:id", getEmployeeDetails);
router.get("/employees/leads", getEmployeeLeads);  
router.post("/employees/create", createEmployee);
router.post("/employees/update", updateEmployee);
router.delete("/employees/:id", deleteEmployee);
router.get("/kpis", getTeamKPIs);
router.get("/chart-data", getChartData);
module.exports = router;