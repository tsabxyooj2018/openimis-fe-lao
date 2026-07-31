/*
 * Reports the outcome of a save as a transient toast.
 *
 * openIMIS reports mutation results in one place only: the journal, a permanent
 * right-hand drawer. Hiding it -- which is what this deployment wants -- removes
 * every confirmation and every error, for every record in the system. "Did that
 * save?" then has no answer, which is not acceptable in an insurance system.
 *
 * So the journal is kept MOUNTED and hidden with CSS rather than switched off.
 * It goes on polling each submitted mutation, and this mirrors what it learns
 * into a toast that appears for a few seconds and leaves nothing behind. Display
 * is the part that was unwanted; the tracking is worth keeping.
 *
 * Reading the drawer's DOM rather than querying the mutation log again avoids a
 * second poller on the same data, and cannot disagree with what openIMIS itself
 * believes happened.
 *
 * Row shape, from fe-core's JournalDrawer:
 *
 *   status 0  -> a CircularProgress, still processing
 *   status 1  -> ErrorOutline icon, and text in theme.palette.error.main
 *   otherwise -> CheckCircleOutline
 *
 * Failure is detected by that colour, not by a class name or an icon path: the
 * classes are JSS hashes that change between builds, both icons are
 * circle-outlines whose paths are easy to confuse, and the colour is set by this
 * deployment's own theme (errorColor in src/helpers/theme.js).
 */

const DRAWER = ".MuiDrawer-paperAnchorDockedRight";
const HOST_ID = "lao-mutation-toasts";
const ERROR_RGB = "rgb(193, 39, 45)"; // errorColor #C1272D, theme.palette.error.main
const LIFETIME = 6000;

// key -> "pending" | "done", so a row is announced once, when it settles.
const seen = new Map();

function host() {
  let el = document.getElementById(HOST_ID);
  if (el) return el;
  el = document.createElement("div");
  el.id = HOST_ID;
  Object.assign(el.style, {
    position: "fixed",
    right: "1.25rem",
    bottom: "1.25rem",
    zIndex: "1500",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    alignItems: "flex-end",
    pointerEvents: "none",
  });
  document.body.appendChild(el);
  return el;
}

function toast(label, failed) {
  const box = document.createElement("div");
  Object.assign(box.style, {
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    maxWidth: "min(26rem, 80vw)",
    padding: "0.7rem 1rem",
    borderRadius: "8px",
    color: "#fff",
    background: failed ? "#C1272D" : "#1f6b45",
    boxShadow: "0 8px 24px -8px rgba(0,0,0,.45)",
    font: "inherit",
    fontSize: "0.875rem",
    lineHeight: "1.4",
    pointerEvents: "auto",
    opacity: "0",
    transform: "translateY(6px)",
    transition: "opacity .18s ease, transform .18s ease",
  });

  const mark = document.createElement("span");
  mark.textContent = failed ? "✕" : "✓";
  mark.style.fontWeight = "700";

  const text = document.createElement("span");
  text.textContent = label;

  box.append(mark, text);
  box.addEventListener("click", () => box.remove());
  host().appendChild(box);

  // Next frame, so the transition runs rather than being skipped.
  window.requestAnimationFrame(() => {
    box.style.opacity = "1";
    box.style.transform = "translateY(0)";
  });

  window.setTimeout(() => {
    box.style.opacity = "0";
    box.style.transform = "translateY(6px)";
    window.setTimeout(() => box.remove(), 220);
  }, LIFETIME);
}

const isError = (row) => {
  const icon = row.querySelector("svg");
  if (icon && window.getComputedStyle(icon).color === ERROR_RGB) return true;
  const text = row.querySelector(".MuiListItemText-primary");
  return !!text && window.getComputedStyle(text).color === ERROR_RGB;
};

const isPending = (row) => !!row.querySelector(".MuiCircularProgress-root");

/*
 * The journal stamps each row with moment().format("YYYY-MM-DD HH:mm"), local
 * time. Parsed by hand rather than with Date.parse, whose handling of that
 * shape is not consistent between browsers -- some read it as UTC.
 */
const STAMP = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/;
function stampToTime(text) {
  const m = STAMP.exec(text.trim());
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
}

/*
 * Anything stamped before this minute happened in an earlier visit.
 *
 * A "first scan primes, later scans announce" rule looked right and was not:
 * the first scan runs before the drawer has rendered anything, so it primed
 * against an empty list, and every row that arrived afterwards counted as new.
 * Reloading the home page therefore replayed the last few mutations as toasts.
 *
 * The timestamp is the honest test, and it does not depend on when this code
 * happens to look. Truncated to the minute because that is all the journal
 * prints; a save made in the same minute as the reload can still be announced,
 * which is the harmless direction to err in.
 */
const OPENED_AT = (() => {
  const d = new Date();
  d.setSeconds(0, 0);
  return d.getTime();
})();

function scan() {
  const drawer = document.querySelector(DRAWER);
  if (!drawer) return;

  const rows = drawer.querySelectorAll(".MuiListItem-root");
  const present = new Set();

  rows.forEach((row) => {
    const primary = row.querySelector(".MuiListItemText-primary");
    const secondary = row.querySelector(".MuiListItemText-secondary");
    if (!secondary) return; // not a mutation row

    const label = (primary && primary.textContent.trim()) || "";
    // No label means an internal mutation -- changeUserLanguage and getCsrfToken
    // are logged without one. Confirming those to the user is noise: they did
    // not ask for anything to be saved.
    if (!label) return;

    const stamped = stampToTime(secondary.textContent);
    const key = `${label}|${secondary.textContent.trim()}`;
    present.add(key);

    if (stamped !== null && stamped < OPENED_AT) {
      seen.set(key, "done"); // history: remember it, never announce it
      return;
    }

    if (seen.get(key) === "done") return;
    if (isPending(row)) {
      seen.set(key, "pending");
      return;
    }

    seen.set(key, "done");
    const failed = isError(row);
    toast(failed ? `${label} — ບໍ່ສຳເລັດ / failed` : label, failed);
  });

  // Rows fall off the end of the journal; forget them so the map cannot grow
  // without bound in a long session.
  [...seen.keys()].forEach((k) => {
    if (!present.has(k)) seen.delete(k);
  });
}

export default function mountMutationToasts() {
  if (typeof document === "undefined") return;

  const observer = new MutationObserver(() => scan());
  const start = () => {
    scan();
    observer.observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
}
