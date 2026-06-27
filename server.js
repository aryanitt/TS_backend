require("dotenv").config({ quiet: true });

process.on("uncaughtException", (error) => {
  console.error("[startup] uncaughtException:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[startup] unhandledRejection:", reason);
});

const http = require("http");
const express = require("express");

const isPassenger = typeof PhusionPassenger !== "undefined";
const PORT = Number(process.env.PORT || 3000);

console.error("[startup] booting", JSON.stringify({
  node: process.version,
  passenger: isPassenger,
  port: PORT,
  dbHost: process.env.DB_HOST || "(unset)",
  dbUser: process.env.DB_USER ? "(set)" : "(unset)",
  dbName: process.env.DB_NAME || "(unset)",
  cwd: process.cwd(),
}));

if (isPassenger) {
  PhusionPassenger.configure({ autoInstall: false });
}

const app = express();

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "ts-publications-crm-api",
    status: global.__appReady ? "ready" : "booting",
    database: global.__dbReady ? "connected" : "pending",
    timestamp: new Date().toISOString(),
  });
});

function mountFullApp() {
  try {
    console.error("[startup] loading routes...");
    const main = require("./src/app");
    app.use(main);
    global.__appReady = true;
    console.error("[startup] app mounted");
  } catch (error) {
    console.error("[startup] app mount failed:", error);
  }
}

function startBackgroundTasks() {
  try {
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
  } catch (error) {
    console.error("[startup] background init failed:", error);
  }
}

function onListening() {
  console.error("[startup] listening", isPassenger ? "on Passenger" : `on port ${PORT}`);
  mountFullApp();
  setImmediate(startBackgroundTasks);
}

const server = http.createServer(app);

server.on("error", (error) => {
  console.error("[startup] server error:", error.code || error.message, error);
  process.exit(1);
});

console.error("[startup] calling listen...");

if (isPassenger) {
  server.listen("passenger", onListening);
} else {
  server.listen(PORT, onListening);
}

module.exports = app;
