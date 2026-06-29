const normalize = (value) => String(value || "").toLowerCase().trim();

function leadStage(lead) {
  return normalize(lead.pipeline_stage || lead.pipelineStage || lead.stage);
}

function leadStatus(lead) {
  return normalize(lead.status);
}

function isStillNewAssigned(lead) {
  if (lead.accepted_at || lead.acceptedAt) return false;
  const assignStatus = normalize(lead.assignment_status || lead.assignmentStatus);
  if (assignStatus === "accepted" || assignStatus === "in_progress") return false;
  const stage = leadStage(lead);
  if (!["new", "new lead"].includes(stage)) return false;
  return assignStatus === "assigned" || assignStatus === "pending" || assignStatus === "unassigned";
}

function isUnworked(lead) {
  const stage = leadStage(lead);
  const status = leadStatus(lead);
  if (isStillNewAssigned(lead)) return true;
  if (stage.includes("not pick") || status.includes("not pick") || status === "notpick") return true;
  if (["new", "new lead"].includes(stage) || ["new", "new lead"].includes(status)) return true;
  return false;
}

function isConverted(lead) {
  const stage = leadStage(lead);
  const status = leadStatus(lead);
  return stage === "converted" || status === "converted" || stage.includes("won");
}

function isContacted(lead) {
  if (isUnworked(lead)) return false;
  if (isConverted(lead)) return true;
  const stage = leadStage(lead);
  const status = leadStatus(lead);
  const contactedKeys = [
    "attempted", "contacted", "booked", "call booked", "qualified",
    "proposal", "proposal sent", "negotiation", "meeting",
  ];
  return contactedKeys.some((k) => stage.includes(k) || status.includes(k));
}

function isQualified(lead) {
  if (!isContacted(lead)) return false;
  const stage = leadStage(lead);
  const status = leadStatus(lead);
  const temp = normalize(lead.temperature);
  const stageKeys = ["qualified", "contacted", "proposal", "proposal sent", "negotiation", "converted", "booked"];
  if (stageKeys.some((k) => stage.includes(k) || status.includes(k))) return true;
  return ["warm", "hot", "warm lead", "hot lead"].includes(temp) || ["warm", "hot"].includes(status);
}

function isMeeting(lead) {
  if (!isContacted(lead)) return false;
  const stage = leadStage(lead);
  const status = leadStatus(lead);
  const meetingKeys = ["booked", "call booked", "meeting", "proposal", "proposal sent", "negotiation"];
  return meetingKeys.some((k) => stage.includes(k) || status.includes(k)) || isConverted(lead);
}

function computeLeadStats(leads = []) {
  const list = Array.isArray(leads) ? leads : [];
  const convertedLeads = list.filter(isConverted);
  return {
    totalLeads: list.length,
    qualified: list.filter(isQualified).length,
    totalMeetings: list.filter(isMeeting).length,
    converted: convertedLeads.length,
    revenue: convertedLeads.reduce(
      (sum, l) => sum + (Number(l.expected_revenue ?? l.revenue) || 0),
      0,
    ),
    contacted: list.filter(isContacted).length,
    followUps: list.filter((l) =>
      ["not interested", "not attending", "call back later", "ni"].includes(leadStatus(l)),
    ).length,
  };
}

function mapLeadKanbanStage(lead) {
  if (isStillNewAssigned(lead)) return "new_lead";
  const stage = leadStage(lead);
  const status = leadStatus(lead);
  if (stage.includes("not pick") || status === "notpick" || status.includes("not pick")) return "not_pick";
  if (stage.includes("negotiation") || status.includes("negotiation")) return "negotiation";
  if (stage.includes("proposal") || status.includes("proposal")) return "proposal";
  if (stage === "converted" || status === "converted" || stage.includes("won")) return "converted";
  if (stage.includes("booked") || stage.includes("call booked")) return "booked";
  if (stage.includes("contacted") || stage.includes("qualified")) return "contacted";
  if (stage.includes("attempted") || status.includes("attempted")) return "attempted";
  return "attempted";
}

const STAGE_BREAKDOWN = [
  { id: "new_lead", label: "New Lead" },
  { id: "not_pick", label: "Not Pick" },
  { id: "attempted", label: "Attempted" },
  { id: "contacted", label: "Contacted" },
  { id: "booked", label: "Booked" },
  { id: "proposal", label: "Proposal" },
  { id: "negotiation", label: "Negotiation" },
  { id: "converted", label: "Converted" },
];

function buildStageBreakdown(leads = []) {
  const counts = Object.fromEntries(STAGE_BREAKDOWN.map((s) => [s.id, 0]));
  for (const lead of leads) {
    const id = mapLeadKanbanStage(lead);
    if (counts[id] != null) counts[id] += 1;
  }
  const max = Math.max(1, ...Object.values(counts));
  return STAGE_BREAKDOWN.map((s) => ({
    label: s.label,
    count: counts[s.id] || 0,
    pct: Math.round(((counts[s.id] || 0) / max) * 100),
  }));
}

function buildLeadFunnel(stats) {
  return [
    { name: "Assigned", value: stats.totalLeads || 0 },
    { name: "Contacted", value: stats.contacted || 0 },
    { name: "Qualified", value: stats.qualified || 0 },
    { name: "Meeting", value: stats.totalMeetings || 0 },
    { name: "Converted", value: stats.converted || 0 },
  ];
}

/** SQL fragment: lead has been contacted (matches computeLeadStats). */
const CONTACTED_LEAD_SQL = `
  (
    LOWER(COALESCE(l.pipeline_stage, '')) IN (
      'attempted', 'contacted', 'booked', 'call booked', 'qualified',
      'proposal', 'proposal sent', 'negotiation', 'converted', 'meeting'
    )
    OR LOWER(COALESCE(l.status, '')) IN (
      'attempted', 'contacted', 'converted', 'warm', 'hot', 'qualified', 'negotiation', 'proposal sent'
    )
  )
  AND LOWER(COALESCE(l.pipeline_stage, '')) NOT IN ('new', 'new lead', 'not pick')
  AND LOWER(COALESCE(l.status, '')) NOT IN ('new', 'new lead', 'notpick', 'not pick')
  AND NOT (
    l.assignment_status = 'assigned'
    AND l.accepted_at IS NULL
    AND LOWER(COALESCE(l.pipeline_stage, '')) IN ('new lead', 'new')
  )
`;

module.exports = {
  computeLeadStats,
  buildLeadFunnel,
  buildStageBreakdown,
  CONTACTED_LEAD_SQL,
  isContacted,
  isQualified,
  isMeeting,
  isConverted,
};
