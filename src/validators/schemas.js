const { z } = require("zod");
const { DISTRICT_VALUES } = require("../constants/districts");
const {
  APPLICATION_STATUSES,
  CAPABILITIES,
  COMMERCIAL_CATEGORIES,
  JOB_CATEGORIES,
  JOB_TYPES,
  MARKET_CATEGORIES,
  MARKET_CONDITIONS,
  PROPERTY_AMENITIES,
  PROPERTY_KINDS,
  REPORT_REASONS,
  RESIDENTIAL_CATEGORIES,
  TENANT_TYPES,
} = require("../constants/platform");

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid object id");
const language = z.enum(["en", "bn"]);
const dateString = z.string().datetime({ offset: true }).or(z.string().date());
const url = z.string().url().max(1000);

const request = ({ body = z.object({}), query = z.object({}).passthrough(), params = z.object({}) } = {}) =>
  z.object({ body, query, params });

const localizedContent = z.object({
  en: z.object({ title: z.string().trim().min(5).max(120), description: z.string().trim().min(20).max(5000) }),
  bn: z.object({ title: z.string().trim().max(120).default(""), description: z.string().trim().max(5000).default("") }).optional(),
});

const propertyContent = z.object({
  en: z.object({ title: z.string().trim().min(5).max(5000), description: z.string().trim().max(5000).default("") }),
  bn: z.object({ title: z.string().trim().max(5000).default(""), description: z.string().trim().max(5000).default("") }).optional(),
});

const location = z.object({
  division: z.string().trim().max(80).optional(),
  district: z.enum(DISTRICT_VALUES),
  city: z.string().trim().min(2).max(80),
  area: z.string().trim().min(2).max(120),
  address: z.string().trim().min(5).max(300),
  exactPublic: z.boolean().default(false),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const media = z.object({
  type: z.enum(["IMAGE", "VIDEO", "TOUR_360", "MODEL_3D"]).default("IMAGE"),
  url,
  order: z.number().int().min(0).max(100).default(0),
  alt: z.object({ en: z.string().max(200).optional(), bn: z.string().max(200).optional() }).optional(),
});

const authSchemas = {
  registerStart: request({
    body: z.object({
      name: z.string().trim().min(2).max(100),
      phone: z.string().min(10).max(20),
      password: z.string().min(4).max(128),
      preferredLanguage: language.optional(),
    }),
  }),
  registerVerify: request({ body: z.object({ phone: z.string().min(10).max(20), otp: z.string().regex(/^\d{6}$/) }) }),
  phoneOnly: request({ body: z.object({ phone: z.string().min(10).max(20) }) }),
  login: request({ body: z.object({ phone: z.string().min(10).max(20), password: z.string().min(1).max(128) }) }),
  resetPassword: request({
    body: z.object({ phone: z.string().min(10).max(20), otp: z.string().regex(/^\d{6}$/), newPassword: z.string().min(4).max(128) }),
  }),
  requestOtp: request({ body: z.object({ phone: z.string().min(10).max(20) }) }),
  verifyOtp: request({
    body: z.object({
      phone: z.string().min(10).max(20),
      otp: z.string().regex(/^\d{6}$/),
      name: z.string().trim().min(2).max(100).optional(),
      preferredLanguage: language.optional(),
    }),
  }),
  refresh: request({ body: z.object({ refreshToken: z.string().min(40).max(500) }) }),
  logout: request({ body: z.object({ refreshToken: z.string().min(40).max(500) }) }),
};

const profileSchemas = {
  update: request({
    body: z
      .object({
        name: z.string().trim().min(2).max(100).optional(),
        preferredLanguage: language.optional(),
        preferredLocation: z.object({ city: z.string().trim().max(80).optional(), area: z.string().trim().max(120).optional() }).optional(),
      })
      .refine((value) => Object.keys(value).length > 0, "At least one field is required"),
  }),
  capabilities: request({ body: z.object({ capabilities: z.array(z.enum(CAPABILITIES)).min(1) }) }),
  submitKyc: request({
    body: z.object({
      nidFrontFile: z.string().trim().min(1).max(300),
      nidBackFile: z.string().trim().min(1).max(300),
      selfieFile: z.string().trim().min(1).max(300),
    }),
  }),
  updateAvatar: request({ body: z.object({ cameraFile: z.string().trim().min(1).max(300) }) }),
};

const propertyBase = {
  kind: z.enum(PROPERTY_KINDS),
  category: z.enum([...RESIDENTIAL_CATEGORIES, ...COMMERCIAL_CATEGORIES]),
  translations: propertyContent,
  rent: z.number().min(0).max(100000000),
  negotiable: z.boolean().optional(),
  tenantTypes: z.array(z.enum(TENANT_TYPES)).min(1).max(TENANT_TYPES.length).optional(),
  listingParty: z.enum(["OWNER", "AGENT"]).optional(),
  brokerageFee: z.number().min(0).max(10000000).optional(),
  costs: z
    .object({
      advance: z.number().min(0).optional(),
      serviceCharge: z.number().min(0).optional(),
      parkingCharge: z.number().min(0).optional(),
      waterBill: z.number().min(0).optional(),
      gasBill: z.number().min(0).optional(),
      otherCharge: z.number().min(0).optional(),
    })
    .optional(),
  attributes: z.object({
    bedrooms: z.number().int().min(0).max(100).optional(),
    bathrooms: z.number().int().min(0).max(100).optional(),
    kitchens: z.number().int().min(0).max(20).optional(),
    balconies: z.number().int().min(0).max(50).optional(),
    sizeSqft: z.number().min(1).max(10000000),
    floor: z.number().int().min(-10).max(300).optional(),
    totalFloors: z.number().int().min(0).max(300).optional(),
    minimumStayMonths: z.number().int().min(0).max(120).optional(),
    roadFacing: z.boolean().optional(),
    roadType: z.enum(["MAIN_ROAD", "INSIDE_ROAD", "OTHER"]).optional(),
    suitableFor: z.array(z.string().trim().max(60)).max(30).optional(),
    gasType: z.enum(["PIPELINE", "LPG", "NONE"]).optional(),
    electricityMeter: z.enum(["PREPAID", "POSTPAID", "SHARED"]).optional(),
    waterSource: z.enum(["WASA", "DEEP_TUBEWELL", "OTHER"]).optional(),
  }),
  amenities: z.array(z.enum(PROPERTY_AMENITIES)).max(30).optional(),
  location,
  media: z.array(media).max(10).optional(),
  videoUrl: url.or(z.literal("")).optional(),
  tour360Url: url.or(z.literal("")).optional(),
  model3dUrl: url.or(z.literal("")).optional(),
  contact: z.object({ ownerName: z.string().trim().max(100).optional(), phoneVisibility: z.enum(["PUBLIC", "AFTER_LOGIN", "IN_APP_ONLY"]).optional() }).optional(),
  availableFrom: dateString,
};

const propertySchemas = {
  create: request({
    body: z.object(propertyBase).superRefine((value, context) => {
      const valid = value.kind === "RESIDENTIAL" ? RESIDENTIAL_CATEGORIES.includes(value.category) : COMMERCIAL_CATEGORIES.includes(value.category);
      if (!valid) context.addIssue({ code: "custom", path: ["category"], message: "Category does not match property kind" });
      if (value.kind === "RESIDENTIAL" && value.attributes.kitchens === undefined) context.addIssue({ code: "custom", path: ["attributes", "kitchens"], message: "Kitchen count is required for residential listings" });
    }),
  }),
  update: request({ body: z.object(Object.fromEntries(Object.entries(propertyBase).map(([key, value]) => [key, value.optional()]))) , params: z.object({ id: objectId }) }),
  byId: request({ params: z.object({ id: objectId }) }),
  ownerStatus: request({ body: z.object({ status: z.enum(["ACTIVE", "RESERVED", "RENTED"]), note: z.string().trim().max(500).optional() }), params: z.object({ id: objectId }) }),
};

const marketBase = {
  translations: localizedContent,
  category: z.enum(MARKET_CATEGORIES),
  condition: z.enum(MARKET_CONDITIONS),
  price: z.number().min(0).max(1000000000),
  negotiable: z.boolean().optional(),
  district: z.enum(DISTRICT_VALUES),
  media: z.array(media).min(1).max(8),
  attributes: z.object({
    brand: z.string().trim().max(80).optional(),
    model: z.string().trim().max(120).optional(),
    physicalCondition: z.string().trim().max(300).optional(),
    warranty: z.enum(["NONE", "SHOP", "MANUFACTURER"]).optional(),
    features: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  }).optional(),
  contact: z.object({
    phoneVisibility: z.enum(["AFTER_LOGIN", "IN_APP_ONLY"]).optional(),
  }).optional(),
};

const marketListingSchemas = {
  create: request({ body: z.object(marketBase) }),
  update: request({
    body: z
      .object(Object.fromEntries(Object.entries(marketBase).map(([key, value]) => [key, value.optional()])))
      .refine((value) => Object.keys(value).length > 0, "At least one field is required"),
    params: z.object({ id: objectId }),
  }),
  byId: request({ params: z.object({ id: objectId }) }),
  ownerStatus: request({
    body: z.object({ status: z.literal("SOLD"), note: z.string().trim().max(500).optional() }),
    params: z.object({ id: objectId }),
  }),
};

const salary = z.object({
  disclosed: z.boolean().default(false),
  type: z.enum(["FIXED", "RANGE"]),
  amount: z.number().min(0).optional(),
  min: z.number().min(0).optional(),
  max: z.number().min(0).optional(),
  period: z.enum(["HOUR", "DAY", "MONTH", "CONTRACT"]).default("MONTH"),
  negotiable: z.boolean().optional(),
}).superRefine((value, context) => {
  if (!value.disclosed) return;
  if (value.type === "FIXED" && value.amount === undefined) context.addIssue({ code: "custom", path: ["amount"], message: "Pay amount is required when disclosed" });
  if (value.type === "RANGE" && (value.min === undefined || value.max === undefined || value.min > value.max)) context.addIssue({ code: "custom", path: ["max"], message: "A valid pay range is required when disclosed" });
});

const jobLocation = z.object({
  district: z.enum(DISTRICT_VALUES),
  address: z.string().trim().min(5).max(300),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

const jobBase = {
  employerName: z.string().trim().min(2).max(160),
  category: z.enum(JOB_CATEGORIES),
  translations: localizedContent,
  salary,
  location: jobLocation,
  jobType: z.enum(JOB_TYPES),
  personsNeeded: z.number().int().min(1).max(1000),
  experience: z.object({ minimumYears: z.number().min(0).max(80).optional(), summary: z.string().trim().max(1000).optional() }).optional(),
  workingHours: z.string().trim().min(2).max(300),
  benefits: z.array(z.string().trim().max(100)).max(30).optional(),
  applicationDeadline: dateString,
  contactMethod: z.enum(["IN_APP", "PHONE", "BOTH"]).optional(),
};

const jobSchemas = {
  create: request({ body: z.object(jobBase) }),
  update: request({ body: z.object(Object.fromEntries(Object.entries(jobBase).map(([key, value]) => [key, value.optional()]))), params: z.object({ id: objectId }) }),
  byId: request({ params: z.object({ id: objectId }) }),
  ownerStatus: request({ body: z.object({ status: z.enum(["FILLED", "CLOSED"]) }), params: z.object({ id: objectId }) }),
  apply: request({
    params: z.object({ id: objectId }),
    body: z.object({
      applicantName: z.string().trim().min(2).max(100),
      phone: z.string().min(10).max(20),
      experienceSummary: z.string().trim().max(2000).optional(),
      expectedAvailability: dateString,
      cvUrl: url.or(z.literal("")).optional(),
    }),
  }),
  applicationStatus: request({ body: z.object({ status: z.enum(APPLICATION_STATUSES) }), params: z.object({ applicationId: objectId }) }),
};

const housingRequestBase = {
  kind: z.enum(PROPERTY_KINDS),
  category: z.enum([...RESIDENTIAL_CATEGORIES, ...COMMERCIAL_CATEGORIES]),
  translations: localizedContent,
  budget: z.object({ min: z.number().min(0).max(100000000).optional(), max: z.number().min(0).max(100000000), negotiable: z.boolean().optional() }),
  tenantType: z.enum(TENANT_TYPES).optional(),
  occupants: z.number().int().min(1).max(100).optional(),
  requirements: z.object({
    bedrooms: z.number().int().min(0).max(100).optional(),
    bathrooms: z.number().int().min(0).max(100).optional(),
    minSizeSqft: z.number().min(0).max(10000000).optional(),
    furnished: z.enum(["ANY", "YES", "NO"]).optional(),
    minimumStayMonths: z.number().int().min(0).max(120).optional(),
  }).optional(),
  amenities: z.array(z.enum(PROPERTY_AMENITIES)).max(30).optional(),
  preferredLocations: z.array(z.object({ city: z.string().trim().min(2).max(80), area: z.string().trim().min(2).max(120) })).min(1).max(10),
  searchCenter: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).nullable().optional(),
  radiusKm: z.number().min(1).max(100).optional(),
  moveInDate: dateString,
  contact: z.object({ phoneVisibility: z.enum(["AFTER_LOGIN", "IN_APP_ONLY"]).optional() }).optional(),
};

const housingRequestSchemas = {
  create: request({ body: z.object(housingRequestBase).superRefine((value, context) => {
    const valid = value.kind === "RESIDENTIAL" ? RESIDENTIAL_CATEGORIES.includes(value.category) : COMMERCIAL_CATEGORIES.includes(value.category);
    if (!valid) context.addIssue({ code: "custom", path: ["category"], message: "Category does not match request kind" });
    if (Number(value.budget.min || 0) > value.budget.max) context.addIssue({ code: "custom", path: ["budget"], message: "Minimum budget cannot exceed maximum" });
  }) }),
  update: request({ body: z.object(Object.fromEntries(Object.entries(housingRequestBase).map(([key, value]) => [key, value.optional()]))), params: z.object({ id: objectId }) }),
  byId: request({ params: z.object({ id: objectId }) }),
  ownerStatus: request({ body: z.object({ status: z.enum(["MATCHED", "FULFILLED"]) }), params: z.object({ id: objectId }) }),
  offer: request({ body: z.object({ propertyId: objectId, message: z.string().trim().max(1000).optional() }), params: z.object({ id: objectId }) }),
  offerStatus: request({ body: z.object({ status: z.enum(["ACCEPTED", "DECLINED", "WITHDRAWN"]) }), params: z.object({ offerId: objectId }) }),
};

const moderationSchemas = {
  property: request({
    body: z.object({
      action: z.enum(["APPROVE", "CHANGES_REQUIRED", "REJECT", "SUSPEND", "RESTORE", "MARK_DUPLICATE"]),
      reason: z.string().trim().max(1000).optional(),
      duplicateOf: objectId.optional(),
      verified: z.boolean().optional(),
    }),
    params: z.object({ id: objectId }),
  }),
  job: request({ body: z.object({ action: z.enum(["APPROVE", "CHANGES_REQUIRED", "REJECT", "SUSPEND", "RESTORE"]), reason: z.string().trim().max(1000).optional() }), params: z.object({ id: objectId }) }),
  userStatus: request({ body: z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]), reason: z.string().trim().max(1000).optional() }), params: z.object({ id: objectId }) }),
  userVerification: request({ body: z.object({ status: z.enum(["VERIFIED", "REJECTED"]), reason: z.string().trim().max(1000).optional() }), params: z.object({ id: objectId }) }),
};

const chatSchemas = {
  create: request({
    body: z.object({
      recipientId: objectId,
      contextType: z.enum(["PROPERTY", "JOB", "HOUSING_REQUEST", "WORKER_PROFILE", "MARKET_LISTING", "GENERAL"]).default("GENERAL"),
      contextId: objectId.optional(),
    }).superRefine((value, context) => {
      if (value.contextType !== "GENERAL" && !value.contextId) context.addIssue({ code: "custom", path: ["contextId"], message: "Context id is required" });
    }),
  }),
  byId: request({ params: z.object({ id: objectId }) }),
  message: request({
    params: z.object({ id: objectId }),
    body: z.object({
      text: z.string().trim().min(1).max(4000),
      clientMessageId: z.string().trim().min(8).max(100).optional(),
      attachments: z.array(z.object({ type: z.enum(["IMAGE", "FILE"]), url: z.string().max(1000) })).max(5).optional(),
    }),
  }),
};

const deviceSchemas = {
  registerPush: request({
    body: z.object({
      installationId: z.string().trim().min(8).max(200),
      token: z.string().trim().min(20).max(4096),
      platform: z.enum(["ANDROID", "IOS"]),
    }),
  }),
  unregisterPush: request({
    params: z.object({installationId: z.string().trim().min(8).max(200)}),
  }),
};

const workerProfileBody = z.object({
  categories: z.array(z.enum(JOB_CATEGORIES)).min(1).max(8),
  title: z.string().trim().min(3).max(120),
  bio: z.string().trim().min(20).max(2000),
  experienceYears: z.number().min(0).max(80).optional(),
  skills: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  expectedSalary: z.object({ min: z.number().min(0).optional(), max: z.number().min(0).optional(), period: z.enum(["DAY", "MONTH", "CONTRACT"]).optional() }).optional(),
  workMode: z.enum(["LIVE_IN", "LIVE_OUT", "BOTH"]).optional(),
  jobType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "DAILY"]).optional(),
  availability: z.enum(["AVAILABLE_NOW", "AVAILABLE_FROM_DATE", "NOT_AVAILABLE"]).optional(),
  availableFrom: dateString.optional(),
  serviceAreas: z.array(z.object({ district: z.enum(DISTRICT_VALUES), city: z.string().trim().min(2).max(80).optional(), area: z.string().trim().min(2).max(120) })).min(1).max(12),
  location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).optional(),
});

const workerProfileSchemas = {
  save: request({ body: workerProfileBody }),
  byId: request({ params: z.object({ id: objectId }) }),
  invite: request({
    params: z.object({ id: objectId }),
    body: z.object({ jobId: objectId.optional(), message: z.string().trim().max(1500).optional(), proposedSalary: z.number().min(0).optional() }),
  }),
  invitationStatus: request({ params: z.object({ invitationId: objectId }), body: z.object({ status: z.enum(["ACCEPTED", "DECLINED", "WITHDRAWN"]) }) }),
};

const panoramaSchemas = {
  create: request({ body: z.object({ deviceMode: z.enum(["AR_DEPTH", "AR_TRACKING", "GYROSCOPE", "MANUAL"]).optional(), captureMode: z.enum(["AUTO", "MANUAL"]).optional() }) }),
  byId: request({ params: z.object({ id: objectId }) }),
  frame: request({
    params: z.object({ id: objectId }),
    body: z.object({
      frameId: z.string().trim().min(1).max(80),
      yaw: z.coerce.number().min(-360).max(360),
      pitch: z.coerce.number().min(-90).max(90),
      quality: z.coerce.number().min(0).max(1).optional(),
    }),
  }),
  finalize: request({
    params: z.object({ id: objectId }),
    body: z.object({
      coverage: z.object({
        overall: z.number().min(0).max(100),
        horizontal: z.number().min(0).max(100),
        upper: z.number().min(0).max(100),
        lower: z.number().min(0).max(100),
      }),
      quality: z.object({
        sharpness: z.number().min(0).max(1).optional(),
        lighting: z.number().min(0).max(1).optional(),
        overallGrade: z.enum(["POOR", "FAIR", "GOOD", "EXCELLENT"]).optional(),
      }).optional(),
    }),
  }),
  attach: request({ params: z.object({ id: objectId }), body: z.object({ propertyId: objectId }) }),
};

const propertySocialSchemas = {
  propertyId: request({params: z.object({id: objectId})}),
  commentId: request({params: z.object({id: objectId})}),
  list: request({
    params: z.object({id: objectId}),
    query: z.object({cursor: objectId.optional(), limit: z.coerce.number().int().min(1).max(50).optional()}).passthrough(),
  }),
  listReplies: request({
    params: z.object({id: objectId}),
    query: z.object({cursor: objectId.optional(), limit: z.coerce.number().int().min(1).max(50).optional()}).passthrough(),
  }),
  create: request({
    params: z.object({id: objectId}),
    body: z.object({body: z.string().trim().min(1).max(1000), parentId: objectId.optional()}),
  }),
  update: request({
    params: z.object({id: objectId}),
    body: z.object({body: z.string().trim().min(1).max(1000)}),
  }),
};

const reportSchema = request({
  body: z.object({
    entityType: z.enum(["PROPERTY", "JOB", "MARKET_LISTING", "USER", "MESSAGE", "COMMENT"]),
    entityId: objectId,
    reason: z.enum(REPORT_REASONS),
    details: z.string().trim().max(2000).optional(),
  }),
});

module.exports = {
  authSchemas,
  chatSchemas,
  deviceSchemas,
  housingRequestSchemas,
  jobSchemas,
  marketListingSchemas,
  moderationSchemas,
  objectId,
  panoramaSchemas,
  profileSchemas,
  propertySchemas,
  propertySocialSchemas,
  reportSchema,
  request,
  workerProfileSchemas,
};
