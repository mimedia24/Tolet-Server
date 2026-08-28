const test = require("node:test");
const assert = require("node:assert/strict");
const Property = require("../src/models/Property");
const MarketListing = require("../src/models/MarketListing");
const User = require("../src/models/User");
const WorkerProfile = require("../src/models/WorkerProfile");
const { buildDemoDataset } = require("../src/services/demoSeedService");

const objectId = "64b000000000000000000001";
const without = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));

test("demo dataset contains 100 users, properties, work profiles and marketplace products", () => {
  const dataset = buildDemoDataset({ now: new Date("2026-08-13T00:00:00.000Z") });
  assert.equal(dataset.users.length, 100);
  assert.equal(new Set(dataset.users.map((user) => user.phone)).size, 100);
  assert.equal(dataset.properties.length, 100);
  assert.equal(dataset.properties.filter((property) => property.category === "ROOM").length, 50);
  assert.equal(dataset.properties.filter((property) => property.category === "SHOP").length, 50);
  assert.equal(dataset.workers.length, 100);
  assert.equal(dataset.marketListings.length, 100);
  assert.equal(new Set(dataset.marketListings.map((listing) => listing.category)).size, 8);
  assert.equal(new Set(dataset.workers.flatMap((worker) => worker.categories)).size, 17);
  assert.equal(new Set(dataset.properties.map((property) => property.location.district)).size, 64);
  assert.equal(new Set(dataset.workers.map((worker) => worker.serviceAreas[0].district)).size, 64);
});

test("every generated demo document satisfies the Mongoose model schema", () => {
  const dataset = buildDemoDataset({ now: new Date("2026-08-13T00:00:00.000Z") });
  for (const raw of dataset.users) {
    assert.equal(new User(without(raw, ["demoIndex"])).validateSync(), undefined);
  }
  for (const raw of dataset.properties) {
    assert.equal(new Property({ ...without(raw, ["demoIndex", "ownerPhone"]), ownerId: objectId }).validateSync(), undefined);
  }
  for (const raw of dataset.workers) {
    assert.equal(new WorkerProfile({ ...without(raw, ["demoIndex", "userPhone"]), userId: objectId }).validateSync(), undefined);
  }
  for (const raw of dataset.marketListings) {
    assert.equal(new MarketListing({...without(raw, ["demoIndex", "sellerPhone"]), sellerId: objectId}).validateSync(), undefined);
  }
});
