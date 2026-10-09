// The browser checks drive Chromium. A system Chrome is used when the reviewer
// has one -- it runs the scene in real time headlessly, and the GPU flags only
// mean something on a real Windows Chrome. Without it the checks fall back to
// the Chromium that `npx playwright install chromium` provides, which has to run
// windowed: its headless build renders this WebGL scene in software, several
// times slower than real time, which starves every animation-dependent wait.
// REVIEW_CHANNEL picks the browser ("chromium" forces the bundled build) and
// REVIEW_HEADED=1 always runs windowed.
const gpuArgs =
  process.platform === "win32"
    ? ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"]
    : [];

export const browserChannel = () => process.env.REVIEW_CHANNEL || "chrome";

export async function launchChromium(chromium, options = {}) {
  const channel = browserChannel();
  const named = channel !== "chromium";
  const launch = (headless, useChannel) =>
    chromium.launch({
      ...options,
      headless,
      args: gpuArgs,
      ...(useChannel ? { channel } : {}),
    });
  if (process.env.REVIEW_HEADED === "1") return launch(false, named);
  if (!named) return launch(true, false);
  try {
    return await launch(true, true);
  } catch (error) {
    if (process.env.REVIEW_CHANNEL) throw error;
    console.warn(
      `No "${channel}" browser found; using Playwright's Chromium windowed so the scene keeps real time.`,
    );
    try {
      return await launch(false, false);
    } catch {
      console.warn("Windowed launch failed; continuing headless and slow.");
      return launch(true, false);
    }
  }
}

// Checks that do not exercise startup audio seed silent preferences so no
// gesture is needed to unlock a device. Motion stays on, because a silent
// preference alone never switches the opening off.
export async function seedPreferences(context, preferences) {
  await context.addInitScript((value) => {
    if (!localStorage.getItem("rhine-settings"))
      localStorage.setItem("rhine-settings", JSON.stringify(value));
  }, preferences);
}
