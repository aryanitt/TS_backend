require("dotenv").config();

const http = require("http");
const app = require("./src/app");
const { initDatabase } = require("./database/init");
const { checkPgConnection } = require("./src/middleware/pgReady");
const { initSocket } = require("./src/realtime/socket");
const { logger } = require("./src/config/logger");
const { startSchedulers } = require("./src/jobs/schedulers");

const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || "0.0.0.0";
const server = http.createServer(app);
const corsOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(",").map((s) => s.trim())
  : true;

function startServer() {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, HOST, () => {
      server.removeListener("error", reject);
      logger.info(`Server running on http://${HOST}:${PORT}`);
      resolve();
    });
  });
}

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

async function bootstrap() {
  initSocket(server, corsOrigins);

  // Start listening immediately so Hostinger/reverse-proxy health checks pass.
  await startServer();

  // DB init runs after the server is live (avoids 503 while PG connects).
  initDatabaseLayer().catch((error) => {
    logger.error(`Database layer init failed: ${error.message || String(error)}`);
  });
}

bootstrap().catch((error) => {
  logger.error(`Fatal startup error: ${error.message || String(error)}`);
  process.exit(1);
});
