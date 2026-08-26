/*
 * Let the sidebar get out of the way on a phone.
 *
 * With menuLeft set -- which this deployment sets -- fe-core takes a branch that
 * renders the main menu as a PERMANENT drawer:
 *
 *   if (menuLeft) { ... <Drawer variant="permanent" anchor="left"> ... }
 *
 * A permanent drawer has no open state and no toggle. The hamburger button in
 * fe-core belongs to the other branch, the app-bar menu, which this deployment
 * does not use. So on a wide screen the menu is simply always there, which is
 * what was wanted, and on a phone it is always there too -- covering the page,
 * with no way to dismiss it. Choosing an entry navigates the page underneath and
 * leaves the menu sitting on top of the result.
 *
 * The alternative was setting menuLeft false, which would give a toggle and take
 * away the sidebar on the desktop where it works well. menuLeft is read once, at
 * render, from the module configuration; it cannot be responsive.
 *
 * So the drawer is made off-canvas below the breakpoint, with a button to bring
 * it in and every ordinary way of dismissing it: choosing an entry, tapping the
 * page behind, or pressing Escape. The CSS lives in src/index.css; this owns the
 * button, the state, and the closing.
 *
 * Nothing here runs on a wide screen, and nothing runs on the sign-in page --
 * which has no header, the same test index.css uses to tell them apart.
 */

const OPEN_CLASS = "lao-menu-open";
const BUTTON_ID = "lao-menu-toggle";
const DRAWER = ".MuiDrawer-paperAnchorDockedLeft";
const BREAKPOINT = "(max-width: 60rem)";

const isNarrow = () => window.matchMedia(BREAKPOINT).matches;
const isSignedIn = () => !!document.querySelector("header");

const close = () => document.body.classList.remove(OPEN_CLASS);
const toggle = () => document.body.classList.toggle(OPEN_CLASS);

function button() {
  let el = document.getElementById(BUTTON_ID);
  if (el) return el;

  el = document.createElement("button");
  el.id = BUTTON_ID;
  el.type = "button";
  // Named for a screen reader; the glyph alone says nothing.
  el.setAttribute("aria-label", "ເມນູ / Menu");
  el.innerHTML =
    '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">' +
    '<path fill="currentColor" d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/></svg>';
  el.addEventListener("click", (event) => {
    event.stopPropagation();
    toggle();
  });
  document.body.appendChild(el);
  return el;
}

/*
 * Closing on the way out.
 *
 * A tap inside the drawer closes it UNLESS it landed on a group header, because
 * those expand an accordion rather than navigating -- closing there would make
 * the menu impossible to use, since opening a group is how you reach an entry.
 *
 * Everything else inside the drawer either navigates or is the title button,
 * and both are finished with the menu.
 */
const onDocumentClick = (event) => {
  if (!document.body.classList.contains(OPEN_CLASS)) return;

  const drawer = document.querySelector(DRAWER);
  const toggleButton = document.getElementById(BUTTON_ID);
  if (toggleButton && toggleButton.contains(event.target)) return;

  if (!drawer || !drawer.contains(event.target)) {
    close(); // the page behind, which is the scrim
    return;
  }
  if (event.target.closest && event.target.closest(".MuiAccordionSummary-root")) return;
  close();
};

const onKeyDown = (event) => {
  if (event.key === "Escape") close();
};

export default function mountSidebarMobile() {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const apply = () => {
    if (!isNarrow() || !isSignedIn()) {
      close();
      const existing = document.getElementById(BUTTON_ID);
      if (existing) existing.remove();
      return;
    }
    button();
  };

  document.addEventListener("click", onDocumentClick, true);
  document.addEventListener("keydown", onKeyDown);

  /*
   * The header arrives after sign-in, and the drawer after that, so this cannot
   * run once at load. A single observer on the body re-checks cheaply -- apply()
   * does nothing but a media query and a lookup when there is nothing to change.
   */
  const observer = new MutationObserver(apply);
  const start = () => {
    apply();
    observer.observe(document.body, { childList: true, subtree: true });
  };

  window.matchMedia(BREAKPOINT).addEventListener?.("change", apply);
  window.addEventListener("resize", apply);

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
}
