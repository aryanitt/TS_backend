const { z } = require("zod");

const entityId = z.union([
  z.coerce.number().int().positive(),
  z.string().min(1),
]);

const objectId = entityId;

const createLeadSchema = z.object({
  leadName: z.string().optional(),
  lead_name: z.string().optional(),
  name: z.string().optional(),
  companyName: z.string().optional(),
  company_name: z.string().optional(),
  company: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  city: z.string().optional(),
  source: z.string().optional(),
  channel: z.string().optional(),
  formName: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  temperature: z.string().optional(),
  pipelineStage: z.string().optional(),
  pipeline_stage: z.string().optional(),
  expectedRevenue: z.coerce.number().optional(),
  expected_revenue: z.coerce.number().optional(),
  revenue: z.coerce.number().optional(),
  winProbability: z.coerce.number().min(0).max(100).optional(),
  win_probability: z.coerce.number().min(0).max(100).optional(),
  requirements: z.string().optional(),
  notes: z.string().optional(),
  insights: z.string().optional(),
  sourceMeta: z.record(z.any()).optional(),
  rawPayload: z.any().optional(),
}).passthrough();

const assignSchema = z.object({
  leadId: objectId,
  employeeId: objectId,
  method: z.enum(["manual", "bulk", "bulk_reassign", "reassign", "workload", "round_robin"]).optional(),
  reason: z.string().optional(),
});

const bulkAssignSchema = z.object({
  leadIds: z.array(objectId).min(1),
  employeeId: objectId,
  method: z.enum(["bulk", "bulk_reassign"]).optional(),
});

const stageSchema = z.object({
  stage: z.string().min(1),
  status: z.string().optional(),
});

const noteSchema = z.object({
  body: z.string().min(1),
});

const callSchema = z.object({
  leadId: objectId,
  employeeId: objectId,
  direction: z.enum(["inbound", "outbound"]).optional(),
  outcome: z.string().optional(),
  durationSec: z.coerce.number().optional(),
  startedAt: z.coerce.date().optional(),
  endedAt: z.coerce.date().optional(),
  notes: z.string().optional(),
  aiSummary: z.string().optional(),
  checklistProgress: z.array(z.object({
    stepId: z.string(),
    done: z.boolean(),
    at: z.coerce.date().optional(),
  })).optional(),
});

const followupSchema = z.object({
  leadId: objectId,
  employeeId: objectId,
  scheduledAt: z.coerce.date(),
  note: z.string().optional(),
  title: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
});

const taskSchema = z.object({
  assigneeId: objectId,
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  dueAt: z.coerce.date().optional(),
  status: z.string().optional(),
  leadId: objectId.optional(),
});

const meetingSchema = z.object({
  leadId: objectId,
  employeeId: objectId,
  title: z.string().optional(),
  scheduledAt: z.coerce.date(),
  durationMin: z.coerce.number().optional(),
  meetLink: z.string().optional(),
  location: z.string().optional(),
});

const momSchema = z.object({
  agenda: z.string().optional(),
  discussion: z.string().optional(),
  decisions: z.array(z.string()).optional(),
  actionItems: z.array(z.string()).optional(),
});

function validate(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }
    req.body = parsed.data;
    return next();
  };
}

module.exports = {
  validate,
  createLeadSchema,
  assignSchema,
  bulkAssignSchema,
  stageSchema,
  noteSchema,
  callSchema,
  followupSchema,
  taskSchema,
  meetingSchema,
  momSchema,
};
