const dataService = require("../services/dataService");

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

module.exports = { listServices, createService };
