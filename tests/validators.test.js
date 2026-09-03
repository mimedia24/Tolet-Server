const test = require("node:test");
const assert = require("node:assert/strict");
const { authSchemas, chatSchemas, deviceSchemas, housingRequestSchemas, jobSchemas, marketListingSchemas, profileSchemas, propertySchemas, propertySocialSchemas, workerProfileSchemas } = require("../src/validators/schemas");
const { parseSmartQuery } = require("../src/services/smartSearchService");
const { assertTransition, employerJobTransitions, ownerPropertyTransitions } = require("../src/utils/status");
const { BANGLADESH_DISTRICTS } = require("../src/constants/districts");

const location = { district: "Dhaka", city: "Dhaka", area: "Banani", address: "Road 11, Banani", latitude: 23.7937, longitude: 90.4066, exactPublic: false };
const translations = { en: { title: "Modern apartment in Banani", description: "A clean and modern apartment with good natural light and security." }, bn: { title: "বনানীতে আধুনিক ফ্ল্যাট", description: "নিরাপত্তাসহ আলো-বাতাসপূর্ণ একটি আধুনিক ফ্ল্যাট।" } };

test("property request schema accepts bilingual residential input", () => {
  const result = propertySchemas.create.safeParse({
    body: { kind: "RESIDENTIAL", category: "APARTMENT", translations, rent: 30000, attributes: { sizeSqft: 1400, bedrooms: 3, bathrooms: 2, kitchens: 1 }, costs: {waterBill: 700, gasBill: 1080}, location, availableFrom: new Date(Date.now() + 86400000).toISOString() },
    query: {},
    params: {},
  });
  assert.equal(result.success, true);
  assert.equal(result.data.body.costs.waterBill, 700);
  assert.equal(result.data.body.costs.gasBill, 1080);
});

test("property request schema blocks commercial category on residential kind", () => {
  const result = propertySchemas.create.safeParse({
    body: { kind: "RESIDENTIAL", category: "SHOP", translations, rent: 30000, attributes: { sizeSqft: 700 }, location, availableFrom: "2026-09-01" },
    query: {},
    params: {},
  });
  assert.equal(result.success, false);
});

test("all 64 Bangladesh districts are available and property district is required", () => {
  assert.equal(BANGLADESH_DISTRICTS.length, 64);
  const withoutDistrict = propertySchemas.create.safeParse({
    body: { kind: "RESIDENTIAL", category: "APARTMENT", translations, rent: 30000, attributes: { sizeSqft: 900 }, location: { ...location, district: undefined }, availableFrom: "2026-09-01" },
    query: {}, params: {},
  });
  assert.equal(withoutDistrict.success, false);
});

test("job request schema enforces the approved property job list", () => {
  const valid = jobSchemas.create.safeParse({
    body: { employerName: "Green Valley", category: "SECURITY_GUARD", translations, salary: { type: "FIXED", amount: 22000 }, location, jobType: "FULL_TIME", personsNeeded: 2, workingHours: "Night shift", applicationDeadline: "2026-09-30" },
    query: {},
    params: {},
  });
  const invalid = jobSchemas.create.safeParse({
    body: { employerName: "Green Valley", category: "SOFTWARE_ENGINEER", translations, salary: { type: "FIXED", amount: 22000 }, location, jobType: "FULL_TIME", personsNeeded: 2, workingHours: "Night shift", applicationDeadline: "2026-09-30" },
    query: {},
    params: {},
  });
  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});

test("Facebook-style property caption supports long title without description", () => {
  const caption = "Family apartment near school and market. ".repeat(20);
  const result = propertySchemas.create.safeParse({
    body: { kind: "RESIDENTIAL", category: "APARTMENT", translations: { en: { title: caption, description: "" } }, rent: 28000, tenantTypes: ["FAMILY"], attributes: { sizeSqft: 1200, bedrooms: 3, bathrooms: 2, kitchens: 1 }, location, availableFrom: "2026-09-01" },
    query: {}, params: {},
  });
  assert.equal(result.success, true);
});

test("job pay may be undisclosed and job location requires only district plus address", () => {
  const result = jobSchemas.create.safeParse({
    body: { employerName: "Green Valley", category: "CARETAKER", translations, salary: { disclosed: false, type: "FIXED", period: "DAY" }, location: { district: "Dhaka", address: "House 12, Mirpur 10" }, jobType: "DAILY", personsNeeded: 1, workingHours: "8 hours", applicationDeadline: "2026-09-30" },
    query: {}, params: {},
  });
  assert.equal(result.success, true);
});

test("KYC submission requires NID front, NID back and live camera filename", () => {
  const valid = profileSchemas.submitKyc.safeParse({ body: { nidFrontFile: "front.jpg", nidBackFile: "back.jpg", selfieFile: "live.jpg" }, query: {}, params: {} });
  const invalid = profileSchemas.submitKyc.safeParse({ body: { nidFrontFile: "front.jpg", nidBackFile: "back.jpg" }, query: {}, params: {} });
  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});

test("owner and employer lifecycle transitions reject forbidden state changes", () => {
  assert.doesNotThrow(() => assertTransition("ACTIVE", "RESERVED", ownerPropertyTransitions));
  assert.throws(() => assertTransition("RENTED", "ACTIVE", ownerPropertyTransitions));
  assert.doesNotThrow(() => assertTransition("ACTIVE", "FILLED", employerJobTransitions));
  assert.throws(() => assertTransition("DRAFT", "FILLED", employerJobTransitions));
});

test("password registration accepts four characters, rejects three and requires six digit OTP", () => {
  const registration = authSchemas.registerStart.safeParse({ body: { name: "Rahim", phone: "01712345678", password: "1234" }, query: {}, params: {} });
  const shortPassword = authSchemas.registerStart.safeParse({ body: { name: "Rahim", phone: "01712345678", password: "123" }, query: {}, params: {} });
  const badOtp = authSchemas.registerVerify.safeParse({ body: { phone: "01712345678", otp: "123" }, query: {}, params: {} });
  assert.equal(registration.success, true);
  assert.equal(shortPassword.success, false);
  assert.equal(badOtp.success, false);
});

test("work profile schema accepts required district data", () => {
  const requestResult = housingRequestSchemas.create.safeParse({
    body: { kind: "RESIDENTIAL", category: "APARTMENT", translations, budget: { min: 20000, max: 30000 }, tenantType: "FAMILY", occupants: 4, preferredLocations: [{ city: "Dhaka", area: "Banani" }], moveInDate: "2026-09-01" }, query: {}, params: {},
  });
  const workerResult = workerProfileSchemas.save.safeParse({
    body: { categories: ["CARETAKER"], title: "Experienced caretaker", bio: "Experienced residential caretaker with verified references.", serviceAreas: [{ district: "Dhaka", city: "Dhaka", area: "Banani" }] }, query: {}, params: {},
  });
  assert.equal(requestResult.success, true);
  assert.equal(workerResult.success, true);
});

test("marketplace request uses the selected global district and requires an image", () => {
  const valid = marketListingSchemas.create.safeParse({
    body: {
      translations: {
        en: {
          title: "Dining table with four chairs",
          description: "Solid wooden dining table in good condition with four matching chairs.",
        },
      },
      category: "HOME_FURNITURE",
      condition: "USED",
      price: 18000,
      district: "Dhaka",
      media: [{ type: "IMAGE", url: "https://example.com/table.jpg", order: 0 }],
    },
    query: {},
    params: {},
  });
  const invalid = marketListingSchemas.create.safeParse({
    body: {
      translations: {
        en: {
          title: "Dining table with four chairs",
          description: "Solid wooden dining table in good condition with four matching chairs.",
        },
      },
      category: "HOME_FURNITURE",
      condition: "USED",
      price: 18000,
      district: "ALL",
      media: [],
    },
    query: {},
    params: {},
  });
  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});

test("smart search understands Bangla tenant, bedrooms, area and budget", () => {
  const result = parseSmartQuery("মিরপুরে ফ্যামিলির জন্য ৩ রুমের বাসা ৩০ হাজারের মধ্যে");
  assert.equal(result.area, "Mirpur");
  assert.equal(result.tenantType, "FAMILY");
  assert.equal(result.bedrooms, 3);
  assert.equal(result.maxRent, 30000);
});

test("smart search understands Banglish occupant count", () => {
  const result = parseSmartQuery("3 joner room lagbe");
  assert.equal(result.intent, "PROPERTY");
  assert.equal(result.kind, "RESIDENTIAL");
  assert.equal(result.occupants, 3);
});

test("chat idempotency and push device payloads are validated", () => {
  const message = chatSchemas.message.safeParse({
    body: {text: "Hello", clientMessageId: "msg-client-123456"},
    query: {},
    params: {id: "64b000000000000000000001"},
  });
  const device = deviceSchemas.registerPush.safeParse({
    body: {installationId: "android-installation-123", token: "fcm-token-value-long-enough", platform: "ANDROID"},
    query: {},
    params: {},
  });
  assert.equal(message.success, true);
  assert.equal(device.success, true);
  assert.equal(deviceSchemas.registerPush.safeParse({body: {...device.data.body, platform: "WEB"}, query: {}, params: {}}).success, false);
});

test("property comments allow one valid parent and reject empty or oversized text", () => {
  const params = {id: "64b000000000000000000001"};
  const parentId = "64b000000000000000000002";
  assert.equal(propertySocialSchemas.create.safeParse({body: {body: "Interested", parentId}, query: {}, params}).success, true);
  assert.equal(propertySocialSchemas.create.safeParse({body: {body: ""}, query: {}, params}).success, false);
  assert.equal(propertySocialSchemas.create.safeParse({body: {body: "x".repeat(1001)}, query: {}, params}).success, false);
});
