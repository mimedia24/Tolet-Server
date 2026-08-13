const bcrypt = require("bcryptjs");
const Conversation = require("../models/Conversation");
const Favorite = require("../models/Favorite");
const HireInvitation = require("../models/HireInvitation");
const Message = require("../models/Message");
const Notification = require("../models/Notification");
const Property = require("../models/Property");
const Session = require("../models/Session");
const User = require("../models/User");
const VisitBooking = require("../models/VisitBooking");
const WorkerProfile = require("../models/WorkerProfile");
const { BANGLADESH_DISTRICTS } = require("../constants/districts");
const { JOB_CATEGORIES } = require("../constants/platform");

const DEMO_USER_COUNT = 100;
const DEMO_PHONE_PREFIX = "+8801999";
const DEMO_PHONE_REGEX = /^\+8801999\d{6}$/;

const firstNames = [
  "Arif", "Rahim", "Karim", "Hasan", "Rafiq", "Sabbir", "Nayeem", "Tanvir", "Sakib", "Imran",
  "Nusrat", "Jannat", "Sumaiya", "Mim", "Sadia", "Tania", "Rima", "Farzana", "Sharmin", "Nadia",
];
const lastNames = ["Ahmed", "Hossain", "Islam", "Rahman", "Khan", "Akter", "Sultana", "Chowdhury", "Mia", "Das"];
const jobTitles = {
  CARETAKER: ["Experienced Building Caretaker", "অভিজ্ঞ বিল্ডিং কেয়ারটেকার"],
  SECURITY_GUARD: ["Trained Security Guard", "প্রশিক্ষিত নিরাপত্তাকর্মী"],
  CLEANER: ["Home and Office Cleaner", "বাসা ও অফিস পরিচ্ছন্নতাকর্মী"],
  DRIVER: ["Professional Driver", "পেশাদার ড্রাইভার"],
  ELECTRICIAN: ["Residential Electrician", "বাসাবাড়ির ইলেকট্রিশিয়ান"],
  PLUMBER: ["Emergency Plumbing Specialist", "জরুরি প্লাম্বিং বিশেষজ্ঞ"],
  PAINTER: ["House Painting Professional", "বাসা রং করার দক্ষ কর্মী"],
  AC_TECHNICIAN: ["AC Service Technician", "এসি সার্ভিস টেকনিশিয়ান"],
  CARPENTER: ["Furniture and Door Carpenter", "ফার্নিচার ও দরজার কাঠমিস্ত্রি"],
  COOK: ["Family and Event Cook", "পরিবার ও অনুষ্ঠানের বাবুর্চি"],
  HOUSEKEEPER: ["Reliable Housekeeper", "বিশ্বস্ত গৃহপরিচারক"],
  MOVING_HELPER: ["Home Moving Helper", "বাসা বদলের সহকারী"],
  PROPERTY_MANAGER: ["Property Management Professional", "প্রপার্টি ম্যানেজমেন্ট কর্মী"],
  SALES_AGENT: ["Property Sales Agent", "প্রপার্টি সেলস এজেন্ট"],
  HOME_ASSISTANT: ["Trusted Home Assistant", "বিশ্বস্ত গৃহ সহকারী"],
  PEST_CONTROL: ["Pest Control Technician", "পেস্ট কন্ট্রোল টেকনিশিয়ান"],
  APPLIANCE_TECHNICIAN: ["Home Appliance Technician", "গৃহস্থালি যন্ত্রপাতি টেকনিশিয়ান"],
};

const divisionCenters = {
  Barishal: [90.36, 22.70], Chattogram: [91.78, 22.35], Dhaka: [90.41, 23.81], Khulna: [89.54, 22.85],
  Mymensingh: [90.40, 24.75], Rajshahi: [88.60, 24.37], Rangpur: [89.25, 25.74], Sylhet: [91.87, 24.89],
};

const demoPhone = (index) => `${DEMO_PHONE_PREFIX}${String(index + 1).padStart(6, "0")}`;
const demoName = (index) => `${firstNames[index % firstNames.length]} ${lastNames[Math.floor(index / firstNames.length) % lastNames.length]}`;
const districtPoint = (district, index) => {
  const [baseLng, baseLat] = divisionCenters[district.division] || divisionCenters.Dhaka;
  const lng = baseLng + (((index * 17) % 11) - 5) * 0.018;
  const lat = baseLat + (((index * 13) % 9) - 4) * 0.016;
  return [Number(lng.toFixed(6)), Number(lat.toFixed(6))];
};

const buildDemoDataset = ({ count = DEMO_USER_COUNT, now = new Date() } = {}) => {
  const users = [];
  const properties = [];
  const workers = [];
  for (let index = 0; index < count; index += 1) {
    const number = index + 1;
    const name = demoName(index);
    const propertyDistrict = BANGLADESH_DISTRICTS[index % BANGLADESH_DISTRICTS.length];
    const workDistrict = BANGLADESH_DISTRICTS[(index * 7) % BANGLADESH_DISTRICTS.length];
    const propertyPoint = districtPoint(propertyDistrict, index);
    const workPoint = districtPoint(workDistrict, index + 31);
    const room = index % 2 === 0;
    const category = room ? "ROOM" : "SHOP";
    const categoryEn = room ? "Room Rent" : "Shop Rent";
    const categoryBn = room ? "রুম ভাড়া" : "দোকান ভাড়া";
    const jobCategory = JOB_CATEGORIES[index % JOB_CATEGORIES.length];
    const [workTitleEn, workTitleBn] = jobTitles[jobCategory] || ["Skilled Home Worker", "দক্ষ গৃহকর্মী"];
    const createdAt = new Date(now.getTime() - index * 60 * 60 * 1000);

    users.push({
      demoIndex: number,
      phone: demoPhone(index),
      name,
      phoneVerified: true,
      preferredLanguage: index % 3 === 0 ? "bn" : "en",
      preferredLocation: { city: propertyDistrict.value, area: "Sadar" },
      capabilities: ["TENANT", "PROPERTY_OWNER", "JOB_SEEKER"],
      role: "USER",
      accountStatus: "ACTIVE",
      verification: { identityStatus: index % 3 === 0 ? "UNVERIFIED" : "VERIFIED", reviewedAt: index % 3 === 0 ? undefined : createdAt },
      createdAt,
    });

    properties.push({
      demoIndex: number,
      ownerPhone: demoPhone(index),
      kind: room ? "RESIDENTIAL" : "COMMERCIAL",
      category,
      translations: {
        en: { title: `[DEMO] ${categoryEn} in ${propertyDistrict.value} #${number}`, description: `Demo ${categoryEn.toLowerCase()} listing in ${propertyDistrict.value} Sadar. Contact ${name} through ToLet chat for testing.` },
        bn: { title: `[ডেমো] ${propertyDistrict.bn} জেলায় ${categoryBn} #${number}`, description: `${propertyDistrict.bn} সদর এলাকায় পরীক্ষামূলক ${categoryBn} পোস্ট। যোগাযোগ ও চ্যাট ফিচার টেস্ট করার জন্য তৈরি।` },
      },
      rent: room ? 3000 + (index % 20) * 500 : 8000 + (index % 25) * 1000,
      negotiable: index % 3 === 0,
      tenantTypes: room ? [index % 4 === 0 ? "FAMILY" : index % 4 === 2 ? "BACHELOR_FEMALE" : "BACHELOR_MALE"] : ["ANY"],
      listingParty: "OWNER",
      costs: { advance: room ? 3000 : 10000, serviceCharge: index % 4 === 0 ? 1000 : 0 },
      attributes: room
        ? { bedrooms: 1 + (index % 3), bathrooms: 1, kitchens: index % 2, balconies: index % 2, sizeSqft: 250 + (index % 8) * 75, floor: 1 + (index % 8), totalFloors: 8 }
        : { bathrooms: 1, sizeSqft: 300 + (index % 12) * 100, floor: index % 3, totalFloors: 5, roadFacing: index % 2 === 0, roadType: index % 2 === 0 ? "MAIN_ROAD" : "INSIDE_ROAD", suitableFor: ["Retail", "Office"] },
      amenities: room ? ["WATER", "ELECTRICITY", ...(index % 2 === 0 ? ["INTERNET"] : [])] : ["ELECTRICITY", "WASHROOM", ...(index % 2 === 0 ? ["PARKING"] : [])],
      location: { division: propertyDistrict.division, district: propertyDistrict.value, city: propertyDistrict.value, area: "Sadar", address: `${number} Demo Road, ${propertyDistrict.value} Sadar`, exactPublic: false, point: { type: "Point", coordinates: propertyPoint } },
      media: [],
      contact: { ownerName: name, phoneVisibility: "IN_APP_ONLY" },
      availableFrom: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      status: "ACTIVE",
      moderation: { reason: "Demo seed data", reviewedAt: createdAt },
      verificationStatus: index % 3 === 0 ? "UNVERIFIED" : "VERIFIED",
      expiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
      stats: { views: 20 + index * 3, saves: index % 15, enquiries: index % 9 },
      createdAt,
    });

    workers.push({
      demoIndex: number,
      userPhone: demoPhone(index),
      categories: [jobCategory],
      title: index % 2 === 0 ? workTitleBn : workTitleEn,
      bio: index % 2 === 0 ? `${name} একজন ডেমো ${workTitleBn}, ${workDistrict.bn} জেলায় কাজের জন্য উপলব্ধ। Hire ও chat flow টেস্ট করার জন্য এই প্রোফাইল তৈরি।` : `${name} is a demo ${workTitleEn.toLowerCase()} available in ${workDistrict.value}. This profile is for testing direct hire and chat flows.`,
      experienceYears: index % 16,
      skills: [workTitleEn, "Customer communication", "Home service"],
      expectedSalary: { min: 700 + (index % 8) * 100, max: 15000 + (index % 12) * 1000, period: index % 4 === 3 ? "DAY" : "MONTH" },
      workMode: ["LIVE_IN", "LIVE_OUT", "BOTH"][index % 3],
      jobType: ["FULL_TIME", "PART_TIME", "CONTRACT", "DAILY"][index % 4],
      availability: "AVAILABLE_NOW",
      serviceAreas: [{ district: workDistrict.value, city: workDistrict.value, area: "Sadar" }],
      location: { type: "Point", coordinates: workPoint },
      status: "ACTIVE",
      moderation: { reason: "Demo seed data", reviewedAt: createdAt },
      stats: { views: 10 + index * 2, invitations: index % 8, hires: index % 4 },
      createdAt,
    });
  }
  return { users, properties, workers };
};

const seedDemoData = async ({ password, count = DEMO_USER_COUNT } = {}) => {
  if (!password || password.length < 8) throw new Error("DEMO_SEED_PASSWORD must be at least 8 characters");
  const dataset = buildDemoDataset({ count });
  const passwordHash = await bcrypt.hash(password, 12);

  const userOperations = dataset.users.map(({ demoIndex: _demoIndex, createdAt, ...user }) => ({
    updateOne: {
      filter: { phone: user.phone },
      update: { $set: { ...user, passwordHash, passwordChangedAt: new Date() }, $setOnInsert: { createdAt } },
      upsert: true,
    },
  }));
  await User.bulkWrite(userOperations, { ordered: true });
  const demoUsers = await User.find({ phone: { $in: dataset.users.map((user) => user.phone) } }).select("_id phone").lean();
  const usersByPhone = new Map(demoUsers.map((user) => [user.phone, user._id]));

  const propertyOperations = dataset.properties.map(({ demoIndex: _demoIndex, ownerPhone, createdAt, ...property }) => ({
    updateOne: {
      filter: { ownerId: usersByPhone.get(ownerPhone), "translations.en.title": property.translations.en.title },
      update: { $set: property, $setOnInsert: { createdAt } },
      upsert: true,
    },
  }));
  const workerOperations = dataset.workers.map(({ demoIndex: _demoIndex, userPhone, createdAt, ...worker }) => ({
    updateOne: {
      filter: { userId: usersByPhone.get(userPhone) },
      update: { $set: worker, $setOnInsert: { createdAt } },
      upsert: true,
    },
  }));
  await Property.bulkWrite(propertyOperations, { ordered: true });
  await WorkerProfile.bulkWrite(workerOperations, { ordered: true });

  return {
    users: await User.countDocuments({ phone: { $in: dataset.users.map((user) => user.phone) } }),
    properties: await Property.countDocuments({ ownerId: { $in: demoUsers.map((user) => user._id) }, "translations.en.title": /^\[DEMO\]/ }),
    workers: await WorkerProfile.countDocuments({ userId: { $in: demoUsers.map((user) => user._id) } }),
    firstPhone: dataset.users[0]?.phone,
    lastPhone: dataset.users.at(-1)?.phone,
  };
};

const clearDemoData = async () => {
  const demoUsers = await User.find({ phone: DEMO_PHONE_REGEX }).select("_id").lean();
  const userIds = demoUsers.map((user) => user._id);
  const demoProperties = await Property.find({ ownerId: { $in: userIds } }).select("_id").lean();
  const propertyIds = demoProperties.map((property) => property._id);
  const conversations = await Conversation.find({ participants: { $in: userIds } }).select("_id").lean();
  const conversationIds = conversations.map((item) => item._id);
  const [messages, conversationsResult, favorites, invitations, notifications, properties, sessions, visits, workers, users] = await Promise.all([
    Message.deleteMany({ conversationId: { $in: conversationIds } }),
    Conversation.deleteMany({ _id: { $in: conversationIds } }),
    Favorite.deleteMany({ $or: [{ userId: { $in: userIds } }, { entityType: "PROPERTY", entityId: { $in: propertyIds } }] }),
    HireInvitation.deleteMany({ $or: [{ workerId: { $in: userIds } }, { employerId: { $in: userIds } }] }),
    Notification.deleteMany({ userId: { $in: userIds } }),
    Property.deleteMany({ ownerId: { $in: userIds } }),
    Session.deleteMany({ userId: { $in: userIds } }),
    VisitBooking.deleteMany({ $or: [{ visitorId: { $in: userIds } }, { ownerId: { $in: userIds } }, { propertyId: { $in: propertyIds } }] }),
    WorkerProfile.deleteMany({ userId: { $in: userIds } }),
    User.deleteMany({ _id: { $in: userIds }, phone: DEMO_PHONE_REGEX }),
  ]);
  return { users: users.deletedCount, properties: properties.deletedCount, workers: workers.deletedCount, conversations: conversationsResult.deletedCount, messages: messages.deletedCount, favorites: favorites.deletedCount, invitations: invitations.deletedCount, notifications: notifications.deletedCount, sessions: sessions.deletedCount, visits: visits.deletedCount };
};

module.exports = { DEMO_PHONE_REGEX, DEMO_USER_COUNT, buildDemoDataset, clearDemoData, seedDemoData };
