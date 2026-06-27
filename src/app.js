const express = require("express");
const cors = require("cors");
const path = require("path");

const dashboardRoutes = require("./routes/dashboardRoutes");
const sopRoutes = require("./routes/soprouter");
const salesRoutes = require("./routes/salesrouter");
const reportsRoutes = require("./routes/reportsRoutes");
const incentivesRoutes = require("./routes/incentivesrouter");
const teamRoutes = require("./routes/teamRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const activityRoutes = require("./routes/activityRoutes");
const operationalRoutes = require("./routes/operationalRoutes");
const servicesRoutes = require("./routes/servicesRoutes");
const formsRoutes = require("./routes/formsRoutes");
const aiRoutes = require("./routes/aiRoutes");
const { mountSwagger } = require("./docs/swagger");
const { logger } = require("./config/logger");
const { isPgReady } = require("./middleware/pgReady");
const app = express();

const corsOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(",").map((s) => s.trim())
  : true;

app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json());
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use("/api/dashboard", dashboardRoutes);
app.use("/api/sop", sopRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/incentives", incentivesRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/services", servicesRoutes);
app.use("/api/forms", formsRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/v1", operationalRoutes);
mountSwagger(app);

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "ts-publications-crm-api",
    database: isPgReady() ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (req, res) => {
  res.json({
    message: "Backend is running successfully",
    health: "/health",
    operationalApi: "/api/v1",
    n8nWebhook: "/api/v1/webhooks/n8n",
    docs: "/api/docs",
    database: isPgReady() ? "connected" : "disconnected",
  });
});

app.use((err, req, res, next) => {
  logger.error(err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

module.exports = app;