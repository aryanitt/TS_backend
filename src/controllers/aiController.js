const dataService = require("../services/dataService");

const getInsights = async (req, res) => {
  const context = req.query.context || "dashboard";
  const dbInsights = await dataService.getAiInsightsFromDb(dataService.TENANT, context);
  if (dbInsights.length) {
    res.json({ success: true, source: "database", insights: dbInsights });
    return;
  }
  const generated = await dataService.generateAiInsights(dataService.TENANT, context);
  res.json(generated);
};

const generateInsights = async (req, res) => {
  const context = req.body?.context || "dashboard";
  const result = await dataService.generateAiInsights(dataService.TENANT, context);
  res.json(result);
};

const createInsight = async (req, res) => {
  try {
    await dataService.saveAiInsight(dataService.TENANT, req.body);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getInsights, generateInsights, createInsight };
