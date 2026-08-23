/*
 * Register this repository's local modules in the generated src/modules.js.
 *
 * `npm run load-config` (modules-config.js) regenerates src/modules.js from
 * openimis.json on every build, and while doing so it deletes every
 * `@openimis/*` entry from package.json and re-adds them from that file. A local,
 * unpublished module therefore cannot be listed in openimis.json -- npm would try
 * to resolve it from the registry and fail.
 *
 * So these live in src/ as ordinary application code and are appended to the
 * generated loader here, after load-config and before the build.
 *
 * Idempotent, and fails loudly: a silent miss would ship an image missing a
 * feature, with a green build and no error anywhere.
 */
const fs = require("fs");
const path = require("path");

const MODULES = path.join(__dirname, "..", "src", "modules.js");

/*
 * `config` is the key each module is handed out of the module configuration.
 * "language" is what the language module has always been given; keeping it means
 * an existing deployment's configuration still reaches it.
 */
const LOCAL_MODULES = [
  { require: "./lao-language", config: "language", what: "language switcher" },
  { require: "./cbhi", config: "cbhi", what: "CBHI customisations" },
];

if (!fs.existsSync(MODULES)) {
  console.error(`src/modules.js not found at ${MODULES} - did 'npm run load-config' run?`);
  process.exit(1);
}

let source = fs.readFileSync(MODULES, "utf-8");

const RETURN = "  return loadedModules;";
if (!source.includes(RETURN)) {
  console.error("could not find the 'return loadedModules;' anchor in src/modules.js");
  console.error("modules-config.js has changed shape - update this script.");
  process.exit(1);
}

let added = 0;
LOCAL_MODULES.forEach((module) => {
  if (source.includes(`"${module.require}"`)) {
    console.log(`  ${module.what} already registered, nothing to do`);
    return;
  }

  /*
   * Each is wrapped on its own so that one module failing to load cannot take
   * the others down with it -- a broken CBHI page should not cost the
   * deployment its language switcher.
   */
  const snippet = `
  try {
    loadedModules.push(require("${module.require}").default(cfg["${module.config}"] || {}));
  } catch (error) {
    console.error("Failed to load the local ${module.what} module", error);
  }

`;

  source = source.replace(RETURN, snippet + RETURN);
  added += 1;
  console.log(`  ${module.what} registered in src/modules.js`);
});

if (added) fs.writeFileSync(MODULES, source, "utf-8");

const written = fs.readFileSync(MODULES, "utf-8");
const missing = LOCAL_MODULES.filter((module) => !written.includes(`"${module.require}"`));
if (missing.length) {
  console.error(`injection silently failed for: ${missing.map((m) => m.require).join(", ")}`);
  process.exit(1);
}
