const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");

test("health endpoint is available without database", async () => {
  const response = await request(app).get("/health").expect(200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.service, "tolet-platform-server");
  assert.equal(response.body.version, "2.2.0");
});

test("English is the default API language", async () => {
  const response = await request(app).get("/missing-route").expect(404);
  assert.equal(response.body.message, "The requested resource was not found");
  assert.equal(response.headers["content-language"], "en");
});

test("Bangla API messages are selected by header", async () => {
  const response = await request(app).get("/missing-route").set("X-Language", "bn").expect(404);
  assert.match(response.body.message, /পাওয়া যায়নি/);
  assert.equal(response.headers["content-language"], "bn");
});

test("OTP route rejects malformed input before using database", async () => {
  const response = await request(app).post("/api/v1/auth/otp/request").send({ phone: "123" }).expect(400);
  assert.equal(response.body.code, "VALIDATION_ERROR");
});

test("housing-wanted routes are registered", () => {
  const routes = require("../src/routes");
  assert.equal(routes.stack.some((layer) => String(layer.regexp).includes("housing-requests")), true);
});

test("development CORS accepts a private-LAN phone origin", async () => {
  const response = await request(app).get("/health").set("Origin", "http://192.168.1.102:5173").expect(200);
  assert.equal(response.headers["access-control-allow-origin"], "http://192.168.1.102:5173");
});
