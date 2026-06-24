require("dotenv").config();

const http = require("http");
const app = require("./src/app");
const { initDatabase } = require("./database/init");
const { checkPgConnection } = require("./src/middleware/pgReady");
const { initSocket } = require("./src/realtime/socket");
const { logger } = require("./src/config/logger");
const { startSchedulers } = require("./src/jobs/schedulers");

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
const corsOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(",").map((s) => s.trim())
  : true;

async function bootstrap() {
  await initDatabase().catch((error) => {
    logger.warn(`PostgreSQL initialization skipped: ${error.message || String(error)}`);
  });

  const connected = await checkPgConnection();
  if (connected) {
    logger.info("PostgreSQL connected");
  } else {
    logger.warn("PostgreSQL not available — /api/v1 will return 503 until DB is configured");
  }

  initSocket(server, corsOrigins);
  startSchedulers();

  server.listen(PORT, (err) => {
    if (err) {
      logger.error(`Failed to start server: ${err.message}`);
      return;
    }
    logger.info(`Server running on port ${PORT}`);
  });
}

bootstrap();
