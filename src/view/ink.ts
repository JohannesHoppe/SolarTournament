/** A box on screen (px), as getBoundingClientRect gives it. */
export type Box = { left: number; top: number; right: number; bottom: number };

/** The box around two boxes, either of which may be missing. */
export function join(a: Box | null, b: Box | null): Box | null {
  return !a ? b : !b ? a : { left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) };
}

let range: Range | null = null;

/**
 * What an element of the page shows on screen: its whole box where it draws one (a plate, a
 * canvas, a button), else the text and children inside it; null for what does not show. The
 * HUD keeps the ships' names at the screen's edge clear of it, and the layout test measures the
 * HUD's pieces by it.
 */
export function ink(element: Element): Box | null {
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  const drawn = element.matches('canvas, button') || !/rgba\(0, 0, 0, 0\)|transparent/.test(style.backgroundColor) || parseFloat(style.borderTopWidth) + parseFloat(style.borderLeftWidth) > 0;
  if (drawn) return rect;
  range ??= document.createRange();
  let box: Box | null = null;
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent!.trim()) {
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      if (r.width > 0) box = join(box, r);
    } else if (node instanceof Element) box = join(box, ink(node));
  }
  return box;
}
