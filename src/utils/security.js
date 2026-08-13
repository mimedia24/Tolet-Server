const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { config } = require("../config/env");

const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const hashOtp = (phone, otp) => crypto.createHmac("sha256", config.otpHashSecret).update(`${phone}:${otp}`).digest("hex");
const generateOtp = () => String(crypto.randomInt(100000, 1000000));
const generateOpaqueToken = () => crypto.randomBytes(48).toString("base64url");

const signAccessToken = (user) =>
  jwt.sign(
    { sub: String(user._id), role: user.role, capabilities: user.capabilities, v: Number(user.tokenVersion || 0) },
    config.jwtAccessSecret,
    { expiresIn: config.jwtAccessExpiresIn, issuer: "tolet-platform", audience: "tolet-clients" }
  );

const verifyAccessToken = (token) =>
  jwt.verify(token, config.jwtAccessSecret, { issuer: "tolet-platform", audience: "tolet-clients" });

module.exports = { generateOpaqueToken, generateOtp, hashOtp, sha256, signAccessToken, verifyAccessToken };
