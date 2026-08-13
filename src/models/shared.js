const mongoose = require("mongoose");
const { DISTRICT_VALUES } = require("../constants/districts");

const localizedContentSchema = new mongoose.Schema(
  {
    en: {
      title: { type: String, trim: true, maxlength: 5000, required: true },
      description: { type: String, trim: true, maxlength: 5000, default: "" },
    },
    bn: {
      title: { type: String, trim: true, maxlength: 5000, default: "" },
      description: { type: String, trim: true, maxlength: 5000, default: "" },
    },
  },
  { _id: false }
);

const locationSchema = new mongoose.Schema(
  {
    division: { type: String, trim: true, maxlength: 80 },
    district: { type: String, enum: DISTRICT_VALUES, required: true, index: true },
    city: { type: String, trim: true, maxlength: 80, required: true },
    area: { type: String, trim: true, maxlength: 120, required: true },
    address: { type: String, trim: true, maxlength: 300, required: true },
    exactPublic: { type: Boolean, default: false },
    point: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: (value) => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite),
          message: "Location coordinates must be [longitude, latitude]",
        },
      },
    },
  },
  { _id: false }
);

const mediaSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["IMAGE", "VIDEO", "TOUR_360", "MODEL_3D"], default: "IMAGE" },
    url: { type: String, required: true, trim: true, maxlength: 1000 },
    order: { type: Number, default: 0, min: 0, max: 100 },
    alt: { en: { type: String, maxlength: 200 }, bn: { type: String, maxlength: 200 } },
  },
  { _id: true }
);

module.exports = { localizedContentSchema, locationSchema, mediaSchema };
