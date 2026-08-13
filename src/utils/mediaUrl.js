const { config } = require("../config/env");

const normalizeMediaUrl = (value) => {
  if (!value || typeof value !== "string") return value;
  try {
    const target = new URL(value, config.publicBaseUrl);
    if (!target.pathname.startsWith("/uploads/") && !target.pathname.startsWith("/kyc/")) return value;
    const base = new URL(config.publicBaseUrl);
    target.protocol = base.protocol;
    target.hostname = base.hostname;
    target.port = base.port;
    return target.toString();
  } catch {
    return value.startsWith("/") ? `${config.publicBaseUrl.replace(/\/$/, "")}${value}` : value;
  }
};

const normalizeEntityMedia = (result) => {
  if (!result || typeof result !== "object") return result;
  if (Array.isArray(result.media)) result.media = result.media.map((item) => ({ ...item, url: normalizeMediaUrl(item.url) }));
  for (const key of ["videoUrl", "tour360Url", "model3dUrl", "avatarUrl"]) if (result[key]) result[key] = normalizeMediaUrl(result[key]);
  if (result.ownerId?.avatarUrl) result.ownerId.avatarUrl = normalizeMediaUrl(result.ownerId.avatarUrl);
  return result;
};

module.exports = { normalizeEntityMedia, normalizeMediaUrl };
