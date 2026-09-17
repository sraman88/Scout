import { useEffect, useRef } from "react";

/* Everything a modal owes a keyboard user, in one hook — the app had none of
   it: Escape closed nothing, Tab walked out of the dialog into the page behind
   it, and focus never came back to the control that opened the dialog.
   Attach the returned ref to the dialog element. */
export function useDialog(open, onClose) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  // Kept in a ref so a caller passing an inline arrow doesn't re-arm the trap
  // on every render — written in an effect, never during render.
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    const restoreTo = document.activeElement;

    const focusable = () => Array.from(
      node?.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || []
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    // Focus the first control, so the dialog is usable without a mouse.
    focusable()[0]?.focus();

    function onKeyDown(e) {
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current?.(); return; }
      if (e.key !== "Tab") return;
      // Trap: wrap at both ends rather than letting Tab escape to the page.
      const items = focusable();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    document.addEventListener("keydown", onKeyDown, true);
    // The page behind a sheet must not scroll under it.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      if (restoreTo instanceof HTMLElement) restoreTo.focus();
    };
  }, [open]);

  return ref;
}
