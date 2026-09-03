const crypto = require("crypto");
const {config} = require("../config/env");

const keyMaterial = () => config.push.tokenEncryptionKey || config.jwtAccessSecret;
const encryptionKey = () => crypto.createHash("sha256").update(keyMaterial()).digest();

const encryptPushToken = (token) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(token), "utf8"), cipher.final()]);
  return {
    tokenCiphertext: ciphertext.toString("base64"),
    tokenIv: iv.toString("base64"),
    tokenTag: cipher.getAuthTag().toString("base64"),
    tokenHash: crypto.createHash("sha256").update(String(token)).digest("hex"),
  };
};

const decryptPushToken = ({tokenCiphertext, tokenIv, tokenTag}) => {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(tokenIv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tokenTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(tokenCiphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
};

module.exports = {decryptPushToken, encryptPushToken};
