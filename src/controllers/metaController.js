const { config } = require("../config/env");
const { BANGLADESH_DISTRICTS } = require("../constants/districts");
const {
  COMMERCIAL_CATEGORIES,
  JOB_CATEGORIES,
  JOB_TYPES,
  MARKET_CATEGORIES,
  PROPERTY_AMENITIES,
  RESIDENTIAL_CATEGORIES,
  TENANT_TYPES,
} = require("../constants/platform");
const { getSettings } = require("../services/settingsService");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/response");

const labels = {
  CARETAKER: { en: "Caretaker", bn: "কেয়ারটেকার" }, SECURITY_GUARD: { en: "Security Guard", bn: "নিরাপত্তাকর্মী" },
  CLEANER: { en: "Cleaner", bn: "পরিচ্ছন্নতাকর্মী" }, DRIVER: { en: "Driver", bn: "ড্রাইভার" },
  ELECTRICIAN: { en: "Electrician", bn: "ইলেকট্রিশিয়ান" }, PLUMBER: { en: "Plumber", bn: "প্লাম্বার" },
  PAINTER: { en: "Painter", bn: "রংমিস্ত্রি" }, AC_TECHNICIAN: { en: "AC Technician", bn: "এসি টেকনিশিয়ান" },
  CARPENTER: { en: "Carpenter", bn: "কাঠমিস্ত্রি" }, COOK: { en: "Cook", bn: "রাঁধুনি" },
  HOUSEKEEPER: { en: "Housekeeper", bn: "হাউসকিপার" }, MOVING_HELPER: { en: "Moving Helper", bn: "বাসা বদল সহকারী" },
  PROPERTY_MANAGER: { en: "Property Manager", bn: "প্রপার্টি ম্যানেজার" }, SALES_AGENT: { en: "Sales Agent", bn: "সেলস এজেন্ট" },
  HOME_ASSISTANT: { en: "Home Assistant", bn: "গৃহসহায়ক" }, PEST_CONTROL: { en: "Pest Control", bn: "পেস্ট কন্ট্রোল" },
  APPLIANCE_TECHNICIAN: { en: "Appliance Technician", bn: "গৃহস্থালি যন্ত্র টেকনিশিয়ান" },
  MOBILE_TABLET: { en: "Mobile & Tablet", bn: "মোবাইল ও ট্যাবলেট" },
  ELECTRONICS_APPLIANCES: { en: "Electronics & Appliances", bn: "ইলেকট্রনিক্স ও যন্ত্রপাতি" },
  HOME_FURNITURE: { en: "Home & Furniture", bn: "ঘর ও আসবাবপত্র" },
  VEHICLES_PARTS: { en: "Vehicles & Parts", bn: "যানবাহন ও যন্ত্রাংশ" },
  FASHION_PERSONAL: { en: "Fashion & Personal", bn: "ফ্যাশন ও ব্যক্তিগত পণ্য" },
  SPORTS_HOBBIES: { en: "Sports & Hobbies", bn: "খেলাধুলা ও শখ" },
  BUSINESS_EQUIPMENT: { en: "Business Equipment", bn: "ব্যবসার সরঞ্জাম" },
  OTHER: { en: "Other", bn: "অন্যান্য" },
  FAMILY: { en: "Family", bn: "পরিবার" }, BACHELOR_MALE: { en: "Bachelor Male", bn: "পুরুষ ব্যাচেলর" },
  BACHELOR_FEMALE: { en: "Bachelor Female", bn: "নারী ব্যাচেলর" }, STUDENT_MALE: { en: "Male Student", bn: "ছাত্র" },
  STUDENT_FEMALE: { en: "Female Student", bn: "ছাত্রী" }, WORKING_PROFESSIONAL: { en: "Working Professional", bn: "চাকরিজীবী" },
  CORPORATE: { en: "Corporate", bn: "কর্পোরেট" }, SUBLET: { en: "Sublet", bn: "সাবলেট" }, SHARED_ROOM: { en: "Shared Room", bn: "শেয়ার্ড রুম" },
  HOSTEL_MESS: { en: "Hostel/Mess", bn: "হোস্টেল/মেস" }, ANY: { en: "Any", bn: "যেকোনো" },
};

const withLabels = (items) => items.map((value) => ({ value, label: labels[value] || { en: value.replaceAll("_", " "), bn: value.replaceAll("_", " ") } }));

const getMetadata = asyncHandler(async (_req, res) => {
  const settings = await getSettings();
  const featureFlags = settings.featureFlags.toObject();
  for (const feature of ["chat", "visitBooking", "tour360", "aiSearch", "housingRequests", "workerProfiles"]) featureFlags[feature] = Boolean(featureFlags[feature] && config.features[feature]);
  featureFlags.housingRequests = false;
  return success(res, {
    data: {
      defaultLanguage: "en",
      supportedLanguages: ["en", "bn"],
      districts: BANGLADESH_DISTRICTS.map((district) => ({ value: district.value, division: district.division, label: { en: district.value, bn: district.bn } })),
      residentialCategories: withLabels(RESIDENTIAL_CATEGORIES),
      commercialCategories: withLabels(COMMERCIAL_CATEGORIES),
      jobCategories: withLabels(settings.jobCategories.length ? settings.jobCategories : JOB_CATEGORIES),
      marketCategories: withLabels(settings.marketCategories.length ? settings.marketCategories : MARKET_CATEGORIES),
      jobTypes: withLabels(JOB_TYPES),
      amenities: withLabels(settings.amenities.length ? settings.amenities : PROPERTY_AMENITIES),
      tenantTypes: withLabels(TENANT_TYPES),
      featureFlags,
      limits: {
        maxPropertyImages: settings.maxPropertyImages,
        maxMarketImages: settings.maxMarketImages,
      },
    },
  });
});

module.exports = { getMetadata };
