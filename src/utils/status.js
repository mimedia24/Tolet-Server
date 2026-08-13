const ApiError = require("./ApiError");

const ownerPropertyTransitions = {
  ACTIVE: ["RESERVED", "RENTED"],
  RESERVED: ["ACTIVE", "RENTED"],
};

const employerJobTransitions = {
  ACTIVE: ["FILLED", "CLOSED"],
};

const assertTransition = (current, next, map) => {
  if (!map[current]?.includes(next)) throw new ApiError(409, "CONFLICT", undefined, { current, next });
};

module.exports = { assertTransition, employerJobTransitions, ownerPropertyTransitions };
