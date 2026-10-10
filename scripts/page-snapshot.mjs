// The browser regressions read the read-only snapshot the application publishes
// as JSON on the stage (`#stage[data-stats]`). The reader is injected into the
// page by the checks rather than exported by the application, so the
// application keeps no JavaScript test surface of its own.
export const installSnapshot = (context) =>
  context.addInitScript(() => {
    window.readSnapshot = () =>
      JSON.parse(document.querySelector("#stage")?.dataset.stats || "{}");
  });

/** The current snapshot, resolved after one more rendered frame. The
 *  application publishes on its own animation frame, so a read taken right
 *  after an interaction has to let that frame run before it observes it. */
export const snapshot = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve(window.readSnapshot())),
        ),
      ),
  );
