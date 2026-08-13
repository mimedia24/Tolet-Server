const ApiError = require("./ApiError");

const normalizeBangladeshPhone = (input) => {
  let phone = String(input || "").replace(/[\s()-]/g, "");
  if (phone.startsWith("+")) phone = phone.slice(1);
  if (phone.startsWith("00880")) phone = phone.slice(2);
  if (phone.startsWith("01")) phone = `88${phone}`;
  if (phone.startsWith("8801") && /^8801[3-9]\d{8}$/.test(phone)) return `+${phone}`;
  throw new ApiError(400, "PHONE_INVALID");
};

const maskPhone = (phone) => `${phone.slice(0, 6)}***${phone.slice(-3)}`;

module.exports = { maskPhone, normalizeBangladeshPhone };
