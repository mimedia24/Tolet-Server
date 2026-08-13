const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { verifyAccessToken } = require("../utils/security");

const readBearer = (req) => {
  const [scheme, token] = String(req.headers.authorization || "").split(" ");
  return scheme === "Bearer" ? token : null;
};

const authenticate = asyncHandler(async (req, _res, next) => {
  const token = readBearer(req);
  if (!token) throw new ApiError(401, "UNAUTHORIZED");

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (_error) {
    throw new ApiError(401, "TOKEN_INVALID");
  }

  const user = await User.findById(payload.sub).select("+tokenVersion");
  if (!user) throw new ApiError(401, "TOKEN_INVALID");
  if (user.accountStatus === "SUSPENDED") throw new ApiError(403, "ACCOUNT_SUSPENDED");
  if (user.accountStatus !== "ACTIVE" || !user.phoneVerified) throw new ApiError(403, "PHONE_VERIFICATION_REQUIRED");
  if (Number(payload.v || 0) !== Number(user.tokenVersion || 0)) throw new ApiError(401, "TOKEN_INVALID");
  req.user = user;
  next();
});

const optionalAuthenticate = asyncHandler(async (req, _res, next) => {
  const token = readBearer(req);
  if (!token) return next();
  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);
    if (user?.accountStatus === "ACTIVE") req.user = user;
  } catch (_error) {
    // Public route: an invalid optional token is ignored.
  }
  return next();
});

module.exports = { authenticate, optionalAuthenticate };
