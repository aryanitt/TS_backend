require("dotenv").config();

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

const http = require("http");
const app = require("./src/app");
const { initDatabase } = require("./database/init");
const { checkPgConnection } = require("./src/middleware/pgReady");
const { initSocket } = require("./src/realtime/socket");
const { logger } = require("./src/config/logger");
const { startSchedulers } = require("./src/jobs/schedulers");

const PORT = Number(process.env.PORT || 5000);
const corsOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(",").map((s) => s.trim())
  : true;

async function initDatabaseLayer() {
  await initDatabase().catch((error) => {
    logger.warn(`MySQL initialization skipped: ${error.message || String(error)}`);
  });

  const connected = await checkPgConnection();
  if (connected) {
    logger.info("MySQL connected");
  } else {
    logger.warn("MySQL not available — /api/v1 will return 503 until DB is configured");
  }

  startSchedulers();
}

function onListening() {
  logger.info(isPassenger ? "Server listening on Passenger" : `Server running on port ${PORT}`);
  initDatabaseLayer().catch((error) => {
    logger.error(`Database layer init failed: ${error.message || String(error)}`);
  });
}

const server = http.createServer(app);
initSocket(server, corsOrigins);

server.on("error", (error) => {
  logger.error(`Server listen error: ${error.message || String(error)}`);
  process.exit(1);
});

if (isPassenger) {
  server.listen("passenger", onListening);
} else {
  const host = process.env.HOST || "0.0.0.0";
  server.listen(PORT, host, onListening);
}

module.exports = app;
