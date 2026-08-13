const AdminLog = require("../models/AdminLog");

const audit = ({ req, action, entityType, entityId, before, after, metadata }) =>
  AdminLog.create({
    adminId: req.user._id,
    action,
    entityType,
    entityId,
    before,
    after,
    metadata,
    ip: req.ip,
  });

module.exports = { audit };
