const { connectDatabase, disconnectDatabase } = require("../src/config/database");
const { expireListings } = require("../src/services/expiryService");

const run = async () => {
  await connectDatabase();
  const result = await expireListings();
  console.log(JSON.stringify(result));
  await disconnectDatabase();
};

run().catch(async (error) => {
  console.error(error);
  await disconnectDatabase();
  process.exitCode = 1;
});
