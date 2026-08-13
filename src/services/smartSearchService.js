const BANGLA_DIGITS = { "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4", "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9" };

const AREA_ALIASES = {
  dhanmondi: "Dhanmondi", ধানমন্ডি: "Dhanmondi", mirpur: "Mirpur", মিরপুর: "Mirpur", uttara: "Uttara", উত্তরা: "Uttara",
  mohammadpur: "Mohammadpur", মোহাম্মদপুর: "Mohammadpur", banani: "Banani", বনানী: "Banani", gulshan: "Gulshan", গুলশান: "Gulshan",
  bashundhara: "Bashundhara", বসুন্ধরা: "Bashundhara", badda: "Badda", বাড্ডা: "Badda", rampura: "Rampura", রামপুরা: "Rampura",
  khilgaon: "Khilgaon", খিলগাঁও: "Khilgaon", motijheel: "Motijheel", মতিঝিল: "Motijheel", savar: "Savar", সাভার: "Savar",
  chattogram: "Chattogram", চট্টগ্রাম: "Chattogram", sylhet: "Sylhet", সিলেট: "Sylhet", rajshahi: "Rajshahi", রাজশাহী: "Rajshahi",
};

const normalize = (value) => String(value || "").replace(/[০-৯]/g, (digit) => BANGLA_DIGITS[digit]).toLowerCase().replace(/\s+/g, " ").trim();
const includesAny = (text, values) => values.some((value) => text.includes(value));

const parseAmount = (text) => {
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(k|হাজার|thousand|লাখ|lac|lakh)?/gi)];
  const amounts = matches.map((match) => {
    let amount = Number(match[1]);
    const unit = String(match[2] || "").toLowerCase();
    if (["k", "হাজার", "thousand"].includes(unit)) amount *= 1000;
    if (["লাখ", "lac", "lakh"].includes(unit)) amount *= 100000;
    return amount >= 1000 ? amount : undefined;
  }).filter(Number.isFinite);
  return amounts.length ? Math.max(...amounts) : undefined;
};

const parseSmartQuery = (raw) => {
  const text = normalize(raw);
  const interpretation = { raw: String(raw || "").trim(), q: text };
  const people = text.match(/(\d+)\s*(?:জনের|জন|joner|jon|people|persons?|members?)/i);
  if (people) interpretation.occupants = Number(people[1]);
  const bed = text.match(/(\d+)\s*(?:bed|bedroom|বেড|বেডরুম|রুম)/);
  if (bed) interpretation.bedrooms = Number(bed[1]);

  const amount = parseAmount(text);
  if (amount) interpretation.maxRent = amount;

  if (includesAny(text, ["family", "পরিবার", "ফ্যামিলি"])) interpretation.tenantType = "FAMILY";
  else if (includesAny(text, ["female bachelor", "মহিলা ব্যাচেলর", "নারী ব্যাচেলর", "ছাত্রী"])) interpretation.tenantType = "BACHELOR_FEMALE";
  else if (includesAny(text, ["bachelor", "ব্যাচেলর", "ছাত্র"])) interpretation.tenantType = "BACHELOR_MALE";
  else if (includesAny(text, ["professional", "চাকরিজীবী"])) interpretation.tenantType = "WORKING_PROFESSIONAL";

  if (includesAny(text, ["shop", "office", "দোকান", "অফিস", "commercial", "কমার্শিয়াল"])) interpretation.kind = "COMMERCIAL";
  else interpretation.kind = "RESIDENTIAL";

  if (includesAny(text, ["job", "work", "hire", "চাকরি", "কাজ", "নিয়োগ"])) interpretation.intent = "JOB";
  else if (includesAny(text, ["need a house", "wanted", "বাসা চাই", "বাসা প্রয়োজন", "ঘর চাই", "প্রয়োজন"])) interpretation.intent = "HOUSING_REQUEST";
  else interpretation.intent = "PROPERTY";

  for (const [alias, canonical] of Object.entries(AREA_ALIASES)) {
    if (text.includes(alias)) { interpretation.area = canonical; break; }
  }

  const amenityMap = {
    lift: ["lift", "লিফট"], parking: ["parking", "পার্কিং"], generator: ["generator", "জেনারেটর"],
    gas: ["gas", "গ্যাস"], furnished: ["furnished", "ফার্নিশড"], internet: ["internet", "ইন্টারনেট"], ac: ["ac", "এসি"],
  };
  interpretation.amenities = Object.entries(amenityMap).filter(([, aliases]) => includesAny(text, aliases)).map(([key]) => key.toUpperCase());
  return interpretation;
};

const freshnessScore = (createdAt) => Math.max(0, 20 - Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000));
const textScore = (item, query) => {
  const haystack = normalize([item.title, item.description, item.location?.area, item.location?.city, item.employerName].filter(Boolean).join(" "));
  return normalize(query).split(" ").filter((token) => token.length > 1 && haystack.includes(token)).length * 8;
};

const rankResult = (item, query) => {
  let score = 40 + freshnessScore(item.createdAt) + textScore(item, query);
  if (item.verificationStatus === "VERIFIED" || item.ownerVerification === "VERIFIED") score += 15;
  if (Number.isFinite(item.distanceKm)) score += Math.max(0, 25 - item.distanceKm);
  return Math.round(score * 100) / 100;
};

module.exports = { normalize, parseSmartQuery, rankResult };
