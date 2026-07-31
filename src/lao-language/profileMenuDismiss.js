/*
 * Makes the Profile dropdown dismiss like a menu.
 *
 * It is not a menu. It is the Profile sidebar group, an MUI Accordion, moved
 * into the toolbar with CSS. An accordion toggles and stays open until it is
 * toggled again -- correct in a sidebar, wrong for something that hangs over
 * the page. So it sat there after the pointer left, and after choosing an item.
 *
 * Three ways out, which is what a menu is expected to offer:
 *   - a click anywhere outside it
 *   - Escape
 *   - choosing one of its entries
 *
 * Not mouse-out. A menu that vanishes when the pointer strays is hard to use --
 * anyone moving diagonally toward the last row loses it -- which is why MUI's
 * own Menu, and every desktop menu, closes on outside click rather than on
 * leave. This matches the language switcher next to it.
 *
 * Closing is done by clicking the accordion's summary, i.e. the same thing the
 * user would click. Nothing here touches React state; fe-core stays in charge
 * of the accordion, so its own expanded flag can never disagree with the DOM.
 *
 * Listeners are attached once to the document, so unlike the other widgets in
 * this module no MutationObserver is needed -- events find the element whenever
 * it happens to exist.
 */

const PANEL =
  '.MuiDrawer-paperAnchorDockedLeft .MuiAccordion-root:has(> [data-menu-id="ProfileMainMenu"])';

const panel = () => document.querySelector(PANEL);

/*
 * MUI marks the expanded accordion with Mui-expanded, and the finished
 * transition with MuiCollapse-entered. Either is enough, and taking both means
 * a click during the opening animation still counts as open.
 */
function isOpen(el) {
  if (!el) return false;
  return (
    el.classList.contains("Mui-expanded") ||
    !!el.querySelector(".MuiCollapse-entered, .MuiCollapse-root.Mui-expanded")
  );
}

function close(el) {
  const summary = el && el.querySelector(".MuiAccordionSummary-root");
  if (summary) summary.click();
}

export default function mountProfileMenuDismiss() {
  if (typeof document === "undefined") return;

  document.addEventListener("click", (e) => {
    const el = panel();
    if (!isOpen(el)) return;
    // closest() below needs an Element; a click can land on an SVG node inside
    // a row, which is one, but be explicit rather than assume.
    if (!(e.target instanceof Element)) return;

    if (!el.contains(e.target)) {
      close(el);
      return;
    }

    // Inside: close after choosing an entry, but not when clicking the avatar
    // itself -- that is fe-core's own toggle and would be undone here.
    const entry = e.target.closest(".MuiListItem-root");
    if (entry && el.contains(entry)) {
      // Let the entry's own handler run first; navigation is what closes it.
      window.setTimeout(() => {
        const still = panel();
        if (isOpen(still)) close(still);
      }, 0);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const el = panel();
    if (isOpen(el)) close(el);
  });
}
