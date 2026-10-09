// Stage sizing. The authored 1920x1080 layout is scaled to the viewport, and the
// same procedure publishes the variables the stylesheets need, so the reader
// only has to say which mode is showing.
import { openingLayout, viewportLayout } from "./viewport-layout";
import { refitText } from "./text-fit";

export type FitMode = "boot" | "archive" | "detail";

export type FitHost = {
  stage: HTMLElement;
  viewport: HTMLElement;
  mode: FitMode;
  /** Review pages pin the reference timeline instead of the opening layout. */
  reference: boolean;
  /** Coarse pointers get the touch layout. */
  coarse: boolean;
  /** Called with the layout key when the composition actually changed. */
  composed(key: string): void;
  /** Re-measures the document reveal covers after wrapping changes. */
  remeasure(): void;
};

let previousLayout = "";

export function fitLayout(host: FitHost) {
  const { stage, viewport, mode } = host;
  const { width, height, scale, kind } =
    mode === "boot" && !host.reference
      ? openingLayout(viewport.clientWidth, viewport.clientHeight)
      : viewportLayout(viewport.clientWidth, viewport.clientHeight, host.coarse, mode === "boot");
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  stage.dataset.layout = kind;
  stage.dataset.touch = String(host.coarse);
  viewport.dataset.mobileBoot = String(mode === "boot" && (host.coarse || viewport.clientWidth < 1100));
  stage.style.setProperty("--stage-scale", String(scale));
  // Real-pixel controls inside the scaled stage multiply by this instead of
  // dividing by --stage-scale: engines disagree about calc() division by a
  // custom property, while multiplication is already used across the styles.
  stage.style.setProperty(
    "--stage-inverse-scale",
    String(scale > 0 ? 1 / scale : 1),
  );
  stage.style.setProperty("--opening-width", `${width}px`);
  stage.style.setProperty("--opening-height", `${height}px`);
  stage.style.setProperty("--opening-scan-scale", String(Math.min(1, width / 1920)));
  stage.dataset.openingPortrait = String(width < height);
  // The software keyboard resizes dialogs without recomposing the 3D scene.
  const visible = window.visualViewport;
  const stageTop = (viewport.clientHeight - height * scale) / 2;
  stage.style.setProperty("--modal-top", `${Math.max(0, (visible?.offsetTop ?? 0) - stageTop) / scale}px`);
  stage.style.setProperty("--modal-height", `${Math.min(height, (visible?.height ?? viewport.clientHeight) / scale)}px`);
  viewport.style.setProperty("--scale", String(scale));
  const marks = document.querySelector("#inspection-marks");
  marks?.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const layoutKey = JSON.stringify([width, height, scale, kind, devicePixelRatio]);
  if (layoutKey !== previousLayout) {
    previousLayout = layoutKey;
    host.composed(layoutKey);
  }
  // Breakpoints change the authored sizes, so calibrated lines are refitted.
  refitText();
  // Re-measure line covers and tab underline after wrapping changes.
  requestAnimationFrame(host.remeasure);
}
