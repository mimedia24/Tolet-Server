const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeLanguage, t } = require("../src/utils/i18n");
const { normalizeBangladeshPhone } = require("../src/utils/phone");
const { generateOpaqueToken, hashOtp, signAccessToken, verifyAccessToken } = require("../src/utils/security");
const { normalizeMediaUrl } = require("../src/utils/mediaUrl");

test("Bangladesh phone numbers are normalized to E.164", () => {
  assert.equal(normalizeBangladeshPhone("01712-345678"), "+8801712345678");
  assert.equal(normalizeBangladeshPhone("8801712345678"), "+8801712345678");
  assert.equal(normalizeBangladeshPhone("+8801712345678"), "+8801712345678");
  assert.throws(() => normalizeBangladeshPhone("12345"));
});

test("English is default and Bangla is supported", () => {
  assert.equal(normalizeLanguage(undefined), "en");
  assert.equal(normalizeLanguage("bn-BD,bn;q=0.9"), "bn");
  assert.equal(t("OTP_SENT", "en"), "A verification code has been sent");
  assert.match(t("OTP_SENT", "bn"), /কোড/);
});

test("security helpers generate stable hashes and verifiable access tokens", () => {
  assert.equal(hashOtp("+8801712345678", "123456"), hashOtp("+8801712345678", "123456"));
  assert.notEqual(hashOtp("+8801712345678", "123456"), hashOtp("+8801712345678", "654321"));
  assert.ok(generateOpaqueToken().length >= 64);
  const user = { _id: "64b000000000000000000001", role: "USER", capabilities: ["TENANT"] };
  const token = signAccessToken(user);
  assert.equal(verifyAccessToken(token).sub, String(user._id));
});

test("stale private-LAN upload URLs are rewritten to the configured public server", () => {
  const normalized = normalizeMediaUrl("http://192.168.1.107:5000/uploads/property.jpg");
  assert.match(normalized, /\/uploads\/property\.jpg$/);
  assert.doesNotMatch(normalized, /192\.168\.1\.107/);
});
