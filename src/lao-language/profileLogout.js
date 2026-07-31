/*
 * Adds Log out to the Profile dropdown, beneath Change Password.
 *
 * Logout is a toolbar IconButton in fe-core, nowhere near the Profile menu. It
 * was previously pinned to the foot of the sidebar with CSS; it now belongs
 * with the other account actions.
 *
 * The real button is NOT moved into the list. Relocating a node that React
 * rendered leaves it in the fiber tree at its old position, so the next render
 * of the toolbar can put it back, remove it, or update around a child that is
 * no longer there. Instead the real button is hidden (src/index.css) and this
 * adds an ordinary DOM row that forwards the click to it. Nothing React owns is
 * moved, and the logout handler stays exactly the one fe-core installed --
 * including its redirect and store cleanup.
 *
 * The label is read from the button's own title attribute, which fe-core fills
 * with formatMessage("core.tooltip.logout"), so it follows the interface
 * language instead of hardcoding a string that Lao and French would not match.
 *
 * MUI's own class names are reused so the row inherits the dropdown styling
 * already written for My Profile and Change Password.
 */

const ROW_ID = "lao-profile-logout";
const PROFILE = '.MuiAccordion-root:has(> [data-menu-id="ProfileMainMenu"])';
const LOGOUT = 'header .MuiToolbar-root [data-toolbar-action="logout"]';

// Same glyph fe-core uses for logout (@material-ui/icons ExitToApp), so the row
// matches the button it stands in for.
const ICON =
  '<svg class="MuiSvgIcon-root" focusable="false" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59z' +
  'M19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 ' +
  '2-2V5c0-1.1-.9-2-2-2z"></path></svg>';

function build(label, onClick) {
  const row = document.createElement("div");
  row.id = ROW_ID;
  row.className = "MuiListItem-root MuiListItem-gutters MuiListItem-button";
  row.setAttribute("role", "button");
  row.setAttribute("tabindex", "0");
  row.innerHTML =
    `<div class="MuiListItemIcon-root">${ICON}</div>` +
    `<div class="MuiListItemText-root">` +
    `<span class="MuiTypography-root MuiListItemText-primary MuiTypography-body1">${label}</span>` +
    `</div>`;

  const fire = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  };
  row.addEventListener("click", fire);
  // Keyboard parity with a real MUI list item, which is a button.
  row.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") fire(e);
  });
  return row;
}

function inject() {
  const button = document.querySelector(LOGOUT);
  if (!button) return;

  const list = document.querySelector(`${PROFILE} .MuiAccordionDetails-root .MuiList-root`);
  if (!list) return;

  const existing = document.getElementById(ROW_ID);
  // Re-label rather than rebuild: the language can change without a remount.
  const label = button.getAttribute("title") || "ອອກຈາກລະບົບ / Log out";
  if (existing) {
    if (existing.parentNode !== list) list.appendChild(existing);
    const text = existing.querySelector(".MuiListItemText-primary");
    if (text && text.textContent !== label) text.textContent = label;
    return;
  }

  // Appended, so it lands after Change Password -- the last entry the module
  // contributes.
  list.appendChild(build(label, () => button.click()));
}

export default function mountProfileLogout() {
  if (typeof document === "undefined") return;
  inject();
  // The dropdown mounts after sign-in and re-renders on navigation, so this
  // watches rather than running once.
  const observer = new MutationObserver(() => inject());
  const start = () => observer.observe(document.body, { childList: true, subtree: true });
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
}
