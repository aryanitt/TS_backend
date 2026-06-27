require("dotenv").config();

const express = require("express");

const isPassenger = typeof PhusionPassenger !== "undefined";

console.log("[startup] booting", {
  node: process.version,
  passenger: isPassenger,
  port: process.env.PORT || "(default 5000)",
  dbHost: process.env.DB_HOST || "(unset)",
  dbName: process.env.DB_NAME || "(unset)",
});

if (isPassenger) {
  PhusionPassenger.configure({ autoInstall: false });
}

const boot = express();
const PORT = Number(process.env.PORT || 5000);

boot.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "ts-publications-crm-api",
    status: global.__appReady ? "ready" : "booting",
    database: global.__dbReady ? "connected" : "pending",
    timestamp: new Date().toISOString(),
  });
});

function mountApp() {
  try {
    const main = require("./src/app");
    boot.use(main);
    global.__appReady = true;
    console.log("[startup] app mounted");
  } catch (error) {
    console.error("[startup] app mount failed:", error);
  }
}

function startBackgroundTasks() {
  const { initDatabase } = require("./database/init");
  const { checkPgConnection } = require("./src/middleware/pgReady");
  const { startSchedulers } = require("./src/jobs/schedulers");
  const { logger } = require("./src/config/logger");

  async function initDatabaseLayer() {
    await initDatabase().catch((error) => {
      logger.warn(`MySQL initialization skipped: ${error.message || String(error)}`);
    });

    const connected = await checkPgConnection();
    global.__dbReady = connected;
    if (connected) {
      logger.info("MySQL connected");
    } else {
      logger.warn("MySQL not available — /api/v1 will return 503 until DB is configured");
    }

    startSchedulers();
  }

  initDatabaseLayer().catch((error) => {
    logger.error(`Database layer init failed: ${error.message || String(error)}`);
  });
}

function onListening() {
  console.log("[startup] listening", isPassenger ? "on Passenger" : `on port ${PORT}`);
  mountApp();
  setImmediate(startBackgroundTasks);
}

if (isPassenger) {
  boot.listen("passenger", onListening);
} else {
  boot.listen(PORT, "0.0.0.0", onListening);
}

module.exports = boot;
