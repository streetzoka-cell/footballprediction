// debug.js
console.log("Step 1: Starting...");

try {
  console.log("Step 2: Loading config/env...");
  const env = require("./config/env");
  console.log("Step 3: env loaded");
} catch (e) {
  console.error("FAILED at env:", e.message);
}

try {
  console.log("Step 4: Loading utils/logger...");
  const logger = require("./utils/logger");
  console.log("Step 5: logger loaded");
} catch (e) {
  console.error("FAILED at logger:", e.message);
}

// Continue for each require...
console.log("All requires passed!");