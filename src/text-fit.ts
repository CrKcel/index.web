/** Calibrated single-line boxes were authored against fixed glyph widths. The
 *  platform font now decides those widths, so each box keeps its authored line
 *  geometry and only its type shrinks:
 *  `font-size: calc(var(--font-base) * var(--text-fit, 1))`.
 *  Both sizes come from the reference stage, so fitting never depends on the
 *  current layout or on whether the opening is on screen. */
const measurement = { context: undefined as CanvasRenderingContext2D | undefined };
/** Created on first use so this module stays importable by Node-side tooling. */
function measure() {
  return (measurement.context ??= document.createElement("canvas").getContext("2d")!);
}
/** Floor that still absorbs a platform font roughly 40% wider than the reference. */
const minimumTextFit = 0.7;
const refits = new Set<() => void>();

/** Width of one text line in the element's computed font, tracking included. */
export function measureLine(text: string, style: CSSStyleDeclaration) {
  const context = measure();
  // Every revealing cell holds one character, so the DOM never kerns across
  // glyphs; measuring the same way keeps fitted sizes true to the rendered line.
  context.fontKerning = "none";
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const tracking = style.letterSpacing.endsWith("px")
    ? Number.parseFloat(style.letterSpacing)
    : 0;
  // Each revealed letter is its own cell, so tracking trails every character.
  return context.measureText(text).width + Math.max(0, tracking) * text.length;
}

/** Shrink `element` until `natural` fits the width authored as `--fit-width`. */
export function fitElement(element: HTMLElement, natural: number) {
  if (!(natural > 0)) return;
  const style = getComputedStyle(element);
  const available = Number.parseFloat(style.getPropertyValue("--fit-width"));
  if (!(available > 0)) return;
  const current = Number.parseFloat(style.getPropertyValue("--text-fit")) || 1;
  // Glyph width is proportional to font size, so one measured step converges.
  const fit = Math.min(1, Math.max(minimumTextFit, (current * available) / natural));
  if (fit >= 1) {
    if (element.style.getPropertyValue("--text-fit"))
      element.style.removeProperty("--text-fit");
    return;
  }
  const next = fit.toFixed(4);
  if (element.style.getPropertyValue("--text-fit") !== next)
    element.style.setProperty("--text-fit", next);
}

/** Fit a plain single-line element from its own text. */
export function fitOwnLine(element: HTMLElement) {
  const refit = () =>
    fitElement(
      element,
      measureLine(element.textContent ?? "", getComputedStyle(element)),
    );
  refit();
  return onTextFitRefit(refit);
}

/** Recalculate registered fits: breakpoints change `--font-base`, and restoring
 *  shared corner branding clears the inline styles that hold the fit. */
export function onTextFitRefit(refit: () => void) {
  refits.add(refit);
  return () => refits.delete(refit);
}

export function refitText() {
  for (const refit of refits) refit();
}
