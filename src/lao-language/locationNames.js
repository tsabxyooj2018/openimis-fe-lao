import { fileNamesByLang } from "../locales";
import NAMES from "./locationNames.json";

/*
 * Show province and district names in the language the interface is in.
 *
 * openIMIS stores ONE name per location -- location_Location.name -- and it
 * holds the Lao name. There is no second column and no translation table, so
 * an English interface showed ອັດຕະປື and ໄຊເຊດຖາ on every screen that names a
 * place: the location tree, both pickers, the insuree summary, the claim
 * screens and the Excel exports.
 *
 * WHY A MIDDLEWARE AND NOT A RENDER PATCH
 *
 * There is no single place that renders a location name. fe-location has
 * locationLabel for the pickers, and then builds `code - name` inline in half a
 * dozen more places; fe-insuree has formatLocationString; fe-claim has its own.
 * Patching each one means finding them all again after every upgrade, and the
 * ones that were missed would be invisible until somebody noticed a screen in
 * the wrong language.
 *
 * The data, though, arrives through exactly one door. Every location reaches
 * the application as part of an API response, and src/index.js already passes
 * module `middlewares` contributions into the store, applied after
 * redux-api-middleware -- so this sees each response before any reducer does.
 * Translate once there and every consumer is right, including the ones nobody
 * remembered to look for.
 *
 * WHY THE ORIGINAL IS KEPT
 *
 * This rewrites the name that the whole application then treats as the name --
 * including the Locations screen's own edit dialog, which would offer
 * "Attapeu" in the Name box and write it into the database on Save, quietly
 * replacing the Lao name with an English one. The Lao name is therefore kept
 * beside it as `nameLo`, and lao/apply-overrides.js points that dialog at it.
 * A translation must never become the record.
 */

/*
 * Identical to seed-locations.py's _FOLD, plus sign AM. See
 * lao/locations/build-location-names.js for why AM has to be folded by hand:
 * Unicode does not do it, because Lao AM has no canonical decomposition.
 */
const FOLD = [
  ["ຫລ", "ຫຼ"],
  ["ຫນ", "ໜ"],
  ["ຫມ", "ໝ"],
  ["ໍາ", "ຳ"],
];

const norm = (value) => {
  let text = (value || "").normalize("NFC").trim();
  for (const [from, to] of FOLD) text = text.split(from).join(to);
  return text.replace(/\s+/g, "");
};

// code -> { en, lo } with the Lao pre-folded, so no work happens per response.
const BY_CODE = Object.entries(NAMES).reduce((acc, [code, entry]) => {
  acc[code] = { en: entry.en, lo: norm(entry.lo) };
  return acc;
}, {});

/*
 * The language the dictionaries are in, read the way fe-core reads it, so a
 * place name can never disagree with the label above it. The REST payload for
 * the current user nests the code under i_user; fe-core reads a flat one. Take
 * whichever is present rather than depending on which.
 */
const activeLanguage = (state) => {
  const user = state && state.core && state.core.user;
  if (!user) return null;
  const code = user.language || (user.i_user && user.i_user.language);
  return code ? fileNamesByLang[code] || null : null;
};

/*
 * Guards against a payload that is not the shape we assume. JSON from an API is
 * a tree, so there is no cycle to worry about, but a depth limit costs nothing
 * and means a surprising payload cannot hang the interface.
 */
const MAX_DEPTH = 12;

/*
 * A location is translated only when BOTH its code is one we know AND its
 * stored name is still the Lao name we recorded for that code.
 *
 * The second half is the point. Codes get reused and places get renamed, and
 * without that check this would confidently relabel a district that had been
 * edited in the admin screen -- showing an English name for somewhere that is
 * no longer that place. Matching the name as well means the worst case is that
 * a renamed district stays in Lao, which is visibly incomplete rather than
 * quietly wrong.
 */
const translate = (node, depth) => {
  if (!node || typeof node !== "object" || depth > MAX_DEPTH) return;

  if (Array.isArray(node)) {
    for (const item of node) translate(item, depth + 1);
    return;
  }

  const entry = typeof node.code === "string" ? BY_CODE[node.code] : undefined;
  if (entry && typeof node.name === "string" && node.name !== entry.en && norm(node.name) === entry.lo) {
    node.nameLo = node.name;
    node.name = entry.en;
  }

  for (const key of Object.keys(node)) translate(node[key], depth + 1);
};

/*
 * Mutates the payload rather than copying it. The object was just parsed from
 * this response and nothing else holds a reference yet, so there is nothing to
 * surprise; deep-copying every API response to change two strings would not be.
 */
const locationNamesMiddleware = (store) => (next) => (action) => {
  const payload = action && action.payload;
  if (payload && typeof payload === "object") {
    const lang = activeLanguage(store.getState());
    // Lao is what is stored, so there is nothing to do. An unknown or
    // not-yet-loaded language is left alone too: better the stored name than a
    // guess at what the interface is about to become.
    if (lang && lang !== "lo") translate(payload, 0);
  }
  return next(action);
};

export default locationNamesMiddleware;
export { locationNamesMiddleware, norm, BY_CODE };
