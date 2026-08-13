const test = require("node:test");
const assert = require("node:assert/strict");
const Property = require("../src/models/Property");
const Job = require("../src/models/Job");

const location = { district: "Dhaka", city: "Dhaka", area: "Mohammadpur", address: "Road 3", exactPublic: false, point: { type: "Point", coordinates: [90.36, 23.76] } };
const translations = { en: { title: "Three bedroom apartment", description: "A bright and comfortable apartment ready for a verified tenant." }, bn: { title: "তিন বেডরুমের ফ্ল্যাট", description: "ভেরিফাইড ভাড়াটিয়ার জন্য আরামদায়ক ফ্ল্যাট।" } };

test("valid residential property passes schema validation", () => {
  const property = new Property({ ownerId: "64b000000000000000000001", kind: "RESIDENTIAL", category: "APARTMENT", translations, rent: 25000, attributes: { sizeSqft: 1350, bedrooms: 3, bathrooms: 2 }, location, availableFrom: new Date(Date.now() + 86400000) });
  assert.equal(property.validateSync(), undefined);
});

test("invalid property category is rejected for kind", async () => {
  const property = new Property({ ownerId: "64b000000000000000000001", kind: "RESIDENTIAL", category: "SHOP", translations, rent: 25000, attributes: { sizeSqft: 800 }, location, availableFrom: new Date() });
  await assert.rejects(property.validate(), /invalid for RESIDENTIAL/);
});

test("job schema accepts only the fixed property-related categories", () => {
  const job = new Job({ employerId: "64b000000000000000000001", employerName: "Green Valley Residence", category: "CARETAKER", translations: { en: { title: "Caretaker needed", description: "Full-time caretaker needed for a residential building in Dhaka." } }, salary: { type: "FIXED", amount: 18000 }, location, jobType: "FULL_TIME", personsNeeded: 1, workingHours: "8 AM - 6 PM", applicationDeadline: new Date(Date.now() + 86400000) });
  assert.equal(job.validateSync(), undefined);
  job.category = "SOFTWARE_ENGINEER";
  assert.ok(job.validateSync().errors.category);
});
