#!/usr/bin/env node
/*
 * Consistency checks over lao/translations/lo.json.
 *
 * These are the three mistakes that are easy to make by hand and impossible to
 * see by reading, so they are worth a script rather than a careful eye:
 *
 *   1. Placeholder drift. react-intl substitutes {code}, {count} and friends at
 *      render time. Dropping one leaves a blank where a claim number should be;
 *      inventing one throws at render. Whitespace inside the braces is ignored
 *      when comparing, because upstream has at least one "{ code}".
 *
 *   2. Thai characters. Lao and Thai are separate Unicode blocks that look
 *      similar at a glance, and a Thai codepoint pasted into Lao text renders as
 *      a wrong-but-plausible letter that a reviewer will read straight past.
 *
 *   3. One English string rendered two different ways. openIMIS repeats the
 *      same label across modules -- "Delivered" is both a review status and a
 *      feedback status -- and translating each occurrence independently makes
 *      one interface look like two.
 *
 * Usage:  node lao/translations/check-lo.js
 */
const fs = require("fs");
const path = require("path");

const SRC = path.join("lao", "translations", "lo.json");

/*
 * Genuine homographs: one English string that means two different things, where
 * rendering both the same way would be the actual error. Each needs a reason,
 * because the default answer to a collision is to harmonise it, not to list it
 * here.
 */
const ALLOWED_HOMOGRAPHS = {
  Schema:
    "The benefit plan's data schema (ໂຄງສ້າງຂໍ້ມູນ) versus product.ItemsOrServicesGrid" +
    ".priceOrigin.PRICELIST, where upstream labels the price-list price origin " +
    "'Schema'. It sits beside PROVIDER and RELATIVE and nothing about a price list " +
    "is a schema, so Lao says ບັນຊີລາຄາ rather than carrying the mislabel over.",
  Number:
    "ລຳດັບ as core's ordinal column heading, ຈຳນວນ in the product ceilings table " +
    "where it is a maximum count rather than a position in a sequence.",
  State:
    "ສະຖານະ for a contract's position in its lifecycle, ລັດ for the government as " +
    "the authority confirming a family (insuree.ConfirmationType.C, which sits " +
    "beside 'Local council'). Two unrelated senses of the same English word.",

  // The three below are upstream labelling bugs, not homographs. Lao says what
  // the control does; English still says the wrong thing.
  "Policy Status":
    "ສະຖານະສັນຍາປະກັນໄພ where it filters insurance policies. " +
    "tasksManagement.taskGroup.completionPolicy carries the same English but has " +
    "nothing to do with insurance -- it selects whether ALL members of a task " +
    "group must act or only N of them, so Lao says ນະໂຍບາຍການສຳເລັດ.",
  "Show Passowrd":
    "core.SetPasswordPage assigns this same string -- typo included -- to BOTH " +
    "showPassword and hidePassword, so the toggle reads identically in either " +
    "state and tells the user nothing. Lao says ສະແດງ and ເຊື່ອງ.",
  "Beneficiary Tasks":
    "socialProtection.rejectSelected carries the tab title by copy-paste. It is " +
    "the button that rejects the selected records, sitting beside Accept Selected " +
    "and Reject All, so Lao labels it ປະຕິເສດລາຍການທີ່ເລືອກ rather than leaving a " +
    "destructive action looking like navigation.",
};

const source = JSON.parse(fs.readFileSync(SRC, "utf8"));
const entries = Object.entries(source).filter(([, v]) => v && v.lo && v.lo.trim() !== "");

const PLACEHOLDER = /\{\s*[a-zA-Z0-9_]+\s*\}/g;
const names = (s) => new Set((s.match(PLACEHOLDER) || []).map((p) => p.replace(/[{}\s]/g, "")));
const eq = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

let failures = 0;

const drifted = entries.filter(([, v]) => !eq(names(v.en), names(v.lo)));
if (drifted.length) {
  failures += 1;
  console.error(`\n${drifted.length} entr(ies) whose placeholders do not match the English:`);
  drifted.forEach(([k, v]) => console.error(`  ${k}\n    en: ${v.en}\n    lo: ${v.lo}`));
}

// U+0E00-U+0E7F is Thai; Lao is U+0E80-U+0EFF.
const thai = entries.filter(([, v]) => /[฀-๿]/.test(v.lo));
if (thai.length) {
  failures += 1;
  console.error(`\n${thai.length} entr(ies) containing Thai characters:`);
  thai.forEach(([k, v]) => console.error(`  ${k}: ${v.lo}`));
}

const byEnglish = new Map();
entries
  .filter(([, v]) => v.en && v.en.trim() !== "")
  .forEach(([k, v]) => {
    if (!byEnglish.has(v.en)) byEnglish.set(v.en, new Map());
    byEnglish.get(v.en).set(v.lo, k);
  });

const split = [...byEnglish].filter(([en, los]) => los.size > 1 && !(en in ALLOWED_HOMOGRAPHS));
if (split.length) {
  failures += 1;
  console.error(`\n${split.length} English string(s) rendered more than one way in Lao:`);
  split.forEach(([en, los]) => {
    console.error(`  "${en}"`);
    [...los].forEach(([lo, k]) => console.error(`    ${lo}  (${k})`));
  });
}

const allowed = [...byEnglish].filter(([en, los]) => los.size > 1 && en in ALLOWED_HOMOGRAPHS);
console.log(
  `${SRC}: ${entries.length} translated, ${failures} check(s) failed` +
    (allowed.length ? `, ${allowed.length} documented homograph(s) allowed` : "")
);
process.exit(failures ? 1 : 0);
