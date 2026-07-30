/*
 * Register the local language-switcher module in the generated src/modules.js.
 *
 * `npm run load-config` (modules-config.js) regenerates src/modules.js from
 * openimis.json on every build, and while doing so it deletes every
 * `@openimis/*` entry from package.json and re-adds them from that file. A local,
 * unpublished module therefore cannot be listed in openimis.json -- npm would try
 * to resolve it from the registry and fail.
 *
 * So the module lives in src/ as ordinary application code and is appended to the
 * generated loader here, after load-config and before the build.
 *
 * Idempotent, and fails loudly: a silent miss would ship an image with no
 * language switcher and no error.
 */
const fs = require("fs");
const path = require("path");

const MODULES = path.join(__dirname, "..", "src", "modules.js");
const MARKER = "./lao-language";

if (!fs.existsSync(MODULES)) {
  console.error(`src/modules.js not found at ${MODULES} - did 'npm run load-config' run?`);
  process.exit(1);
}

let source = fs.readFileSync(MODULES, "utf-8");

if (source.includes(MARKER)) {
  console.log("  language module already registered, nothing to do");
  process.exit(0);
}

const RETURN = "  return loadedModules;";
if (!source.includes(RETURN)) {
  console.error("could not find the 'return loadedModules;' anchor in src/modules.js");
  console.error("modules-config.js has changed shape - update this script.");
  process.exit(1);
}

const snippet = `
  try {
    loadedModules.push(require("${MARKER}").default(cfg["language"] || {}));
  } catch (error) {
    console.error("Failed to load the local language module", error);
  }

`;

source = source.replace(RETURN, snippet + RETURN);
fs.writeFileSync(MODULES, source, "utf-8");

if (!fs.readFileSync(MODULES, "utf-8").includes(MARKER)) {
  console.error("injection silently failed");
  process.exit(1);
}

console.log("  language module registered in src/modules.js");
