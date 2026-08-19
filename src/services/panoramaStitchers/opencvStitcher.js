const { spawn } = require("child_process");
const path = require("path");
const { config } = require("../../config/env");
const logger = require("../../config/logger");

/**
 * Runs scripts/stitch_panorama.py against a prepared session directory.
 * Resolves with the parsed JSON result the script prints to stdout, or a
 * `{ success: false, reason }` shape on any failure (never rejects on a
 * classifiable stitching failure — only on infrastructure problems like the
 * interpreter itself being unavailable).
 */
const stitch = (sessionDir) =>
  new Promise((resolve) => {
    const script = path.resolve(__dirname, "../../../scripts/stitch_panorama.py");
    const child = spawn(config.panorama.pythonBin, [script, sessionDir], { timeout: config.panorama.stitchTimeoutMs });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });

    child.on("error", (error) => {
      logger.error({ err: error, sessionDir }, "Panorama stitcher process could not start");
      resolve({ success: false, reason: "STITCHER_UNAVAILABLE", message: error.message });
    });

    child.on("close", (exitCode, signal) => {
      if (signal === "SIGTERM" || signal === "SIGKILL") {
        resolve({ success: false, reason: "TIMEOUT", message: "Stitching process timed out" });
        return;
      }
      const lastLine = stdout.trim().split("\n").filter(Boolean).pop();
      if (!lastLine) {
        logger.error({ exitCode, stderr, sessionDir }, "Panorama stitcher produced no output");
        resolve({ success: false, reason: "UNKNOWN", message: stderr.slice(0, 500) || "No output from stitcher" });
        return;
      }
      try {
        resolve(JSON.parse(lastLine));
      } catch (error) {
        logger.error({ err: error, stdout, sessionDir }, "Panorama stitcher output was not valid JSON");
        resolve({ success: false, reason: "UNKNOWN", message: "Stitcher output could not be parsed" });
      }
    });
  });

module.exports = { stitch };
