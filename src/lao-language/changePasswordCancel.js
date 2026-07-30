/*
 * Adds a Cancel button to Profile > Change Password.
 *
 * The page ships with only Submit, so a user who opens it has no way back except
 * the browser control or the sidebar -- on a form where they may have typed a
 * password, that reads like a trap.
 *
 * fe-core owns that page and offers no contribution point for it, so the button
 * is injected. Scoped to the route rather than to page content: matching on the
 * heading text would break the moment the menu labels are translated, and
 * matching on "a form with password inputs" would also hit the sign-in screen.
 *
 * Plain DOM for the same reason as headerSwitcher: this lives outside the
 * module's render tree, so it has no theme, store or router context.
 */

const ROUTE = "/profile/changePassword";
const BUTTON_ID = "lao-change-password-cancel";

function submitButton() {
  // The page's only submit control. Not keyed on its label, which is translated.
  return document.querySelector("main button[type='submit'], main form button");
}

function inject() {
  if (!window.location.pathname.endsWith(ROUTE)) {
    // Left the page: drop the button so it cannot reappear elsewhere.
    const stale = document.getElementById(BUTTON_ID);
    if (stale) stale.remove();
    return;
  }
  if (document.getElementById(BUTTON_ID)) return;

  const submit = submitButton();
  if (!submit) return;

  const cancel = document.createElement("button");
  cancel.id = BUTTON_ID;
  cancel.type = "button";
  cancel.textContent = "ຍົກເລີກ / Cancel";
  Object.assign(cancel.style, {
    marginLeft: "12px",
    padding: "6px 16px",
    minHeight: "36px",
    border: "1px solid #c3d0da",
    borderRadius: "6px",
    background: "transparent",
    color: "#123b63",
    font: "inherit",
    fontSize: "0.875rem",
    fontWeight: "500",
    cursor: "pointer",
  });
  cancel.addEventListener("mouseenter", () => (cancel.style.background = "#eef2f6"));
  cancel.addEventListener("mouseleave", () => (cancel.style.background = "transparent"));
  cancel.addEventListener("click", (e) => {
    e.preventDefault();
    // history.back() would return to whatever preceded this page; the profile
    // page is the predictable destination regardless of how they arrived.
    window.location.assign("/front/profile/myProfile");
  });

  submit.insertAdjacentElement("afterend", cancel);
}

export default function mountChangePasswordCancel() {
  if (typeof document === "undefined") return;
  const run = () => inject();
  run();
  // The app is a SPA: no page load happens on navigation, so watch the DOM
  // rather than binding to load events.
  const observer = new MutationObserver(run);
  const start = () => observer.observe(document.body, { childList: true, subtree: true });
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
}
