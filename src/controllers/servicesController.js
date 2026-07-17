const dataService = require("../services/dataService");
const { distributeServiceLeads } = require("../services/operationalServices");

const listServices = async (req, res) => {
  const result = await dataService.listServices();
  res.json(result);
};

const createService = async (req, res) => {
  try {
    const result = await dataService.createService(dataService.TENANT, req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const distributeServiceLeadsNow = async (req, res) => {
  try {
    const result = await distributeServiceLeads(dataService.TENANT, {
      serviceId: req.params.serviceId,
      actor: {
        actorId: req.headers["x-user-id"] || "admin",
        actorName: req.headers["x-user-name"] || "Admin",
        actorRole: req.headers["x-user-role"] || "admin",
      },
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { listServices, createService, distributeServiceLeadsNow };
