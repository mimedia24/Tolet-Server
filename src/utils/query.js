const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getPagination = (query) => {
  const page = clamp(Number.parseInt(query.page, 10) || 1, 1, 100000);
  const limit = clamp(Number.parseInt(query.limit, 10) || 20, 1, 100);
  return { page, limit, skip: (page - 1) * limit };
};

const paginationMeta = ({ page, limit, total }) => ({
  page,
  limit,
  total,
  pages: total === null ? null : Math.ceil(total / limit),
  hasNext: total === null ? null : page * limit < total,
  hasPrevious: page > 1,
});

const dateFromDays = (days) => new Date(Date.now() + Number(days) * 24 * 60 * 60 * 1000);

module.exports = { dateFromDays, getPagination, paginationMeta };
