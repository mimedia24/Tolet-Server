const sanitizeHtml = require("sanitize-html");

const cleanText = (value) =>
  typeof value === "string"
    ? sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim()
    : value;

const cleanLocalized = (value = {}) => ({
  en: cleanText(value.en || ""),
  bn: cleanText(value.bn || ""),
});

const localize = (document, language = "en", { includeTranslations = false } = {}) => {
  const object = document?.toObject ? document.toObject() : { ...document };
  if (!object.translations) return object;
  const fallback = object.translations.en || {};
  const selected = object.translations[language] || fallback;
  object.title = selected.title || fallback.title || "";
  object.description = selected.description || fallback.description || "";
  if (!includeTranslations) delete object.translations;
  return object;
};

module.exports = { cleanLocalized, cleanText, localize };
