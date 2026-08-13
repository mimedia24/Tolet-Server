const pino = require("pino");
const { config } = require("./env");

module.exports = pino({
  level: config.logLevel,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.body.otp",
      "req.body.refreshToken",
      "phone",
      "otpHash",
      "tokenHash",
    ],
    censor: "[REDACTED]",
  },
});
