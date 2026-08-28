const { connectDatabase, disconnectDatabase } = require("../src/config/database");
const { config, validateProductionConfig } = require("../src/config/env");
const { buildDemoDataset, clearDemoData, seedDemoData } = require("../src/services/demoSeedService");

const args = new Set(process.argv.slice(2));
const preview = args.has("--preview");
const clear = args.has("--clear");

const run = async () => {
  if (preview) {
    const dataset = buildDemoDataset();
    console.log(JSON.stringify({ mode: "preview", users: dataset.users.length, properties: dataset.properties.length, roomRent: dataset.properties.filter((item) => item.category === "ROOM").length, shopRent: dataset.properties.filter((item) => item.category === "SHOP").length, workProfiles: dataset.workers.length, marketplaceProducts: dataset.marketListings.length, marketplaceCategoriesCovered: new Set(dataset.marketListings.map((item) => item.category)).size, workCategoriesCovered: new Set(dataset.workers.flatMap((item) => item.categories)).size, districtsCoveredByProperties: new Set(dataset.properties.map((item) => item.location.district)).size, districtsCoveredByWork: new Set(dataset.workers.flatMap((item) => item.serviceAreas.map((area) => area.district))).size, sampleUser: { phone: dataset.users[0].phone, name: dataset.users[0].name }, sampleProperty: dataset.properties[0].translations.en.title, sampleWork: dataset.workers[0].title, sampleMarketplaceProduct: dataset.marketListings[0].translations.en.title }, null, 2));
    return;
  }

  if (config.isProduction && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Production demo seeding is blocked. Set ALLOW_DEMO_SEED=true only if this is intentionally a demo/staging database.");
  }
  validateProductionConfig();
  await connectDatabase();
  if (clear) {
    const result = await clearDemoData();
    console.log(JSON.stringify({ mode: "clear", ...result }, null, 2));
    return;
  }
  const password = process.env.DEMO_SEED_PASSWORD || (config.isProduction ? "" : "Demo@12345");
  const result = await seedDemoData({ password });
  console.log(JSON.stringify({ mode: "seed", ...result, password: config.isProduction ? "Set by DEMO_SEED_PASSWORD" : password, note: "These credentials are demo-only. Never reuse the password for real accounts." }, null, 2));
};

run().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
}).finally(disconnectDatabase);
