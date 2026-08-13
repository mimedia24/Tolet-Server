const { normalizeLanguage } = require("../utils/i18n");

module.exports = (req, res, next) => {
  res.locals.language = normalizeLanguage(req.headers["x-language"] || req.headers["accept-language"]);
  res.setHeader("Content-Language", res.locals.language);
  next();
};
