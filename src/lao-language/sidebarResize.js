/*
 * Makes the sidebar's right edge draggable.
 *
 * The width is fixed at theme.menu.drawer.width (288), and Lao labels are
 * longer than the English ones the number was chosen for -- "ຜູ້ຖືສັນຍາປະກັນໄພ"
 * does not fit, so the drawer grew a horizontal scrollbar. Rather than pick a
 * new number that is wrong for a different language, let it be dragged.
 *
 * fe-core bakes that width into three generated classes -- the nav, the paper,
 * and the app bar's offset -- and those class names are JSS hashes that change
 * between builds. So this overrides the stable MUI class names instead, through
 * a single custom property, and dragging only updates that property.
 *
 * The app bar is handled conditionally. Its offset exists only when the bar is
 * shifted for a docked drawer, which depends on the menu variant; forcing a
 * margin on a bar that has none would push it off screen. So it is measured
 * first and only overridden if it is already offset.
 */

const VAR = "--lao-sidebar-width";
const STORAGE_KEY = "lao.sidebarWidth";
const STYLE_ID = "lao-sidebar-resize-style";
const HANDLE_ID = "lao-sidebar-resize-handle";
const DEFAULT = 288;
const MIN = 220;
const MAX = 560;

const clamp = (n) => Math.min(MAX, Math.max(MIN, Math.round(n)));

const read = () => {
  try {
    const v = parseInt(window.localStorage.getItem(STORAGE_KEY), 10);
    return Number.isFinite(v) ? clamp(v) : DEFAULT;
  } catch (e) {
    return DEFAULT;
  }
};

const save = (w) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(w));
  } catch (e) {
    /* private mode */
  }
};

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .MuiDrawer-docked { width: var(${VAR}, ${DEFAULT}px) !important; }
    .MuiDrawer-paperAnchorDockedLeft { width: var(${VAR}, ${DEFAULT}px) !important; }
    body.lao-resizing { cursor: col-resize; user-select: none; }
    /* Suppressed while dragging: MUI animates width, which lags the pointer. */
    body.lao-resizing .MuiDrawer-docked,
    body.lao-resizing .MuiDrawer-paperAnchorDockedLeft { transition: none !important; }
  `;
  document.head.appendChild(style);
}

/*
 * Only written if the app bar is already offset for the drawer. Measured rather
 * than assumed, because whether it is depends on the menu variant.
 */
let appBarRule = null;
function ensureAppBarRule() {
  if (appBarRule !== null) return;
  const bar = document.querySelector("header.MuiAppBar-root");
  if (!bar) return;
  const margin = parseFloat(window.getComputedStyle(bar).marginLeft) || 0;
  if (margin < 1) {
    appBarRule = false; // full-width bar: leave it alone
    return;
  }
  const style = document.createElement("style");
  style.textContent = `
    header.MuiAppBar-root {
      margin-left: var(${VAR}, ${DEFAULT}px) !important;
      width: calc(100% - var(${VAR}, ${DEFAULT}px)) !important;
    }
  `;
  document.head.appendChild(style);
  appBarRule = true;
}

const apply = (w) => document.documentElement.style.setProperty(VAR, `${w}px`);

function buildHandle() {
  const handle = document.createElement("div");
  handle.id = HANDLE_ID;
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "vertical");
  handle.setAttribute("aria-label", "ປັບຄວາມກວ້າງແຖບເມນູ / Resize the menu");
  handle.tabIndex = 0;
  Object.assign(handle.style, {
    position: "fixed",
    top: "0",
    bottom: "0",
    left: `calc(var(${VAR}, ${DEFAULT}px) - 3px)`,
    width: "6px",
    zIndex: "1250",
    cursor: "col-resize",
    background: "transparent",
  });

  const highlight = (on) => {
    handle.style.background = on ? "rgba(255,255,255,0.28)" : "transparent";
  };
  handle.addEventListener("mouseenter", () => highlight(true));
  handle.addEventListener("mouseleave", () => highlight(false));
  handle.addEventListener("focus", () => highlight(true));
  handle.addEventListener("blur", () => highlight(false));

  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    document.body.classList.add("lao-resizing");

    const move = (ev) => apply(clamp(ev.clientX));
    const up = (ev) => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.classList.remove("lao-resizing");
      save(clamp(ev.clientX));
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  });

  // Keyboard equivalent, so the control is not mouse-only.
  handle.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 32 : 8;
    let w = null;
    if (e.key === "ArrowLeft") w = read() - step;
    else if (e.key === "ArrowRight") w = read() + step;
    else if (e.key === "Home") w = DEFAULT;
    if (w === null) return;
    e.preventDefault();
    const next = clamp(w);
    apply(next);
    save(next);
  });

  // Back to the default, for anyone who drags it somewhere unusable.
  handle.addEventListener("dblclick", () => {
    apply(DEFAULT);
    save(DEFAULT);
  });

  return handle;
}

export default function mountSidebarResize() {
  if (typeof document === "undefined") return;

  ensureStyle();
  apply(read());

  const place = () => {
    // The drawer only exists after sign-in; the handle must not float over the
    // login page.
    const drawer = document.querySelector(".MuiDrawer-paperAnchorDockedLeft");
    const handle = document.getElementById(HANDLE_ID);
    if (!drawer) {
      if (handle) handle.remove();
      return;
    }
    ensureAppBarRule();
    if (!handle) document.body.appendChild(buildHandle());
  };

  place();
  const observer = new MutationObserver(place);
  const start = () => observer.observe(document.body, { childList: true, subtree: true });
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
}
