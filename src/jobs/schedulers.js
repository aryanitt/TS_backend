const { logger } = require("../config/logger");
const { isPgReady } = require("../middleware/pgReady");
const { DEFAULT_TENANT_ID } = require("../repositories/operationalRepo");
const { processAssignmentQueue, notify, processDueScheduledAssignments } = require("../services/operationalServices");
const repo = require("../repositories/operationalRepo");

let started = false;

async function processQueueTick() {
  if (!isPgReady()) return;
  try {
    await processAssignmentQueue(DEFAULT_TENANT_ID, { limit: 25 });
  } catch (err) {
    logger.warn(`assignment queue tick failed: ${err.message}`);
  }
}

async function followupReminderTick() {
  if (!isPgReady()) return;
  try {
    const due = await repo.listDueFollowups(DEFAULT_TENANT_ID, 50);

    for (const item of due) {
      const exists = await repo.notificationExists(DEFAULT_TENANT_ID, "followup_due", item.id);
      if (exists) continue;
      await notify({
        tenantId: DEFAULT_TENANT_ID,
        employeeId: item.employeeId,
        type: "followup_due",
        title: "Follow-up due",
        body: item.note || "A scheduled follow-up is due now.",
        entityType: "followup",
        entityId: item.id,
      });
    }
  } catch (err) {
    logger.warn(`follow-up reminder tick failed: ${err.message}`);
  }
}

async function scheduledAssignmentsTick() {
  if (!isPgReady()) return;
  try {
    const { processed, failures } = await processDueScheduledAssignments(DEFAULT_TENANT_ID);
    if (processed.length > 0) {
      logger.info(`Processed ${processed.length} scheduled lead assignments successfully.`);
    }
    if (failures.length > 0) {
      logger.warn(`Failed to process ${failures.length} scheduled lead assignments.`);
    }
  } catch (err) {
    logger.warn(`Scheduled assignments tick failed: ${err.message}`);
  }
}

function startSchedulers() {
  if (started) return;
  started = true;

  const assignmentMs = Number(process.env.ASSIGNMENT_QUEUE_INTERVAL_MS || 30000);
  const reminderMs = Number(process.env.FOLLOWUP_REMINDER_INTERVAL_MS || 300000);
  const scheduleMs = Number(process.env.SCHEDULED_ASSIGNMENT_INTERVAL_MS || 60000);

  setInterval(processQueueTick, assignmentMs).unref();
  setInterval(followupReminderTick, reminderMs).unref();
  setInterval(scheduledAssignmentsTick, scheduleMs).unref();

  processQueueTick();
  followupReminderTick();
  scheduledAssignmentsTick();
  logger.info("Operational schedulers started");
}

module.exports = { startSchedulers };
