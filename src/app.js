const fs = require("fs");
const path = require("path");
const compression = require("compression");
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const hpp = require("hpp");
const pinoHttp = require("pino-http");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const { config } = require("./config/env");
const logger = require("./config/logger");
const { errorHandler, notFound } = require("./middleware/errors");
const { globalLimiter } = require("./middleware/rateLimits");
const language = require("./middleware/language");
const requestContext = require("./middleware/requestContext");
const routes = require("./routes");
const ApiError = require("./utils/ApiError");

const app = express();

if (config.trustProxy) app.set("trust proxy", config.trustProxy);
app.disable("x-powered-by");

const allowedOrigins = config.corsOrigins.length
  ? config.corsOrigins
  : ["http://localhost:3000", "http://localhost:5173"];
const isDevelopmentLanOrigin = (origin) => {
  if (config.isProduction || !origin) return false;
  try {
    const hostname = new URL(origin).hostname;
    if (["localhost", "127.0.0.1"].includes(hostname)) return true;
    if (/^(10\.|192\.168\.)/.test(hostname)) return true;
    const match = hostname.match(/^172\.(\d+)\./);
    return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
  } catch { return false; }
};

app.use(requestContext);
app.use(language);
app.use(pinoHttp({ logger, genReqId: (req) => req.id }));
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" }, contentSecurityPolicy: false }));
// Public media uses content-addressed-style unique filenames. Serve it before
// API CORS so WebView/model-viewer origins (including `null`) can reuse models.
app.use(
  "/uploads",
  cors({origin: "*", methods: ["GET", "HEAD"], credentials: false}),
  express.static(config.uploadDir, {
    index: false,
    etag: true,
    immutable: config.isProduction,
    maxAge: config.isProduction ? "365d" : 0,
  })
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin) || isDevelopmentLanOrigin(origin)) return callback(null, true);
      return callback(new ApiError(403, "FORBIDDEN", "Origin is not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Accept-Language", "X-Language", "X-Request-Id"],
  })
);
app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(hpp());
app.use(globalLimiter);
app.get("/health", (_req, res) =>
  res.json({
    success: true,
    service: "tolet-platform-server",
    version: "2.2.0",
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
  })
);

app.get("/", (_req, res) => res.json({ name: "To-Let Platform API", version: "v1", docs: "/api/docs" }));

const openApiPath = path.resolve(process.cwd(), "docs/openapi.yaml");
if (fs.existsSync(openApiPath)) {
  const openApi = YAML.load(openApiPath);
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApi, { explorer: true }));
}

app.use(config.apiPrefix, routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
