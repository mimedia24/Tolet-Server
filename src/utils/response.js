const { t } = require("./i18n");

const success = (res, { status = 200, code = "OK", data = null, meta = undefined } = {}) => {
  const body = {
    success: true,
    code,
    message: t(code, res.locals.language),
    data,
  };
  if (meta !== undefined) body.meta = meta;
  return res.status(status).json(body);
};

module.exports = { success };
