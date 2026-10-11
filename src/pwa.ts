import { assetUrl } from "./asset-url";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
let installPrompt: InstallPrompt | undefined;
let registration: ServiceWorkerRegistration | undefined;
let ready = false, failed = false, started = false, pending = false;
// The worker already handed over: the reload follows its activation, and a
// later release can ask again.
let applying: ServiceWorker | undefined;
// The release the opening holds until its welcome pause, whether this load is
// already the far side of such a restart, and where the handover in flight
// sends the next load.
let armed: ServiceWorker | undefined, continuing = false, restartTo: Restart | undefined;
let tell: (message: string) => void = () => {};
let inOpening: () => boolean = () => false;
/** Where a restart out of the opening sends the next load: on the same welcome
 *  card, in the array the reader asked for, or in the detail view the opening
 *  was handing over to. */
export type Restart = "opening" | "archive" | "detail";
const RESTART_KEY = "rhine-restart";
const installed = () => matchMedia("(display-mode: standalone)").matches ||
  Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event as InstallPrompt;
  refresh();
});
window.addEventListener("appinstalled", () => { installPrompt = undefined; refresh(); });
matchMedia("(display-mode: standalone)").addEventListener("change", refresh);

export function pwaSettingsMarkup() {
  const actions = `${installPrompt && !installed() ? '<button data-pwa-action="install">安装到设备 ↗</button>' : ""}${failed ? '<button data-pwa-action="retry">重试保存离线资源 ↻</button>' : ""}`;
  return `<section id="pwa-settings" class="pwa-settings" aria-label="主屏幕与离线使用"${actions ? "" : " hidden"}><h3>APP / 主屏幕与离线</h3><div class="pwa-actions">${actions}</div></section>`;
}
function refresh() {
  const current = document.querySelector("#pwa-settings");
  if (current) current.outerHTML = pwaSettingsMarkup();
  document.documentElement.dataset.offlineReady = String(ready);
}

/** Hand the waiting release to the worker, which activates it and reloads the
 *  page through `controllerchange`, which continues at `restart`. */
function applyWorker(worker: ServiceWorker, restart?: Restart) {
  if (applying === worker || (!document.hidden && !inOpening())) return false;
  applying = worker;
  restartTo = restart;
  worker.postMessage({ type: "RHINE_APPLY_UPDATE" });
  return true;
}

/** Offer a finished release at an apply moment. A hidden tab restarts at once,
 *  because its opening is not on screen; the opening instead arms the release
 *  until its welcome pause, where the restart interrupts nothing. A session in
 *  use keeps the release it started with. */
function offerWorker(worker: ServiceWorker) {
  if (document.hidden) applyWorker(worker);
  else if (inOpening() && !continuing) armed = worker;
}

/** Called when the terminal re-enters its opening, which is an apply moment. */
export function applyPendingUpdate() {
  const worker = registration?.waiting;
  if (pending && worker) offerWorker(worker);
}

/** Called from the opening once its clock reaches the welcome pause. The next
 *  load continues the opening from that reading instead of restarting it. */
export function applyOpeningUpdate() {
  const worker = armed;
  armed = undefined;
  // The opening that this load continued is past its pause now, so a later
  // release may be armed for the next one.
  continuing = false;
  if (worker) applyWorker(worker, "opening");
}

/** Called when the opening leaves the screen without reaching its pause, which
 *  is what the entry button and the handover to the detail view both do. A
 *  finished release applies here and the next load opens at `destination`, so
 *  leaving the opening early never strands the reader in the release that is
 *  waiting. Returns whether that restart takes the terminal over. */
export function applyLeavingOpening(destination: "archive" | "detail") {
  const worker = armed ?? (pending ? registration?.waiting : undefined);
  armed = undefined;
  continuing = false;
  if (!worker) return false;
  return applyWorker(worker, destination);
}

/** Called once per load. Reports where a restart out of the opening left the
 *  reader, or null when this load opens on its own. */
export function consumeRestart(): Restart | null {
  let restart: Restart | null = null;
  try {
    const value = sessionStorage.getItem(RESTART_KEY);
    if (value !== null) sessionStorage.removeItem(RESTART_KEY);
    if (value === "opening" || value === "archive" || value === "detail") restart = value;
  } catch { /* Storage can be unavailable; the opening then restarts. */ }
  continuing = restart === "opening";
  return restart;
}

/** Adopt what the origin already has, without a network check, so a release an
 *  earlier session finished installing is known before the opening can be left.
 *  The installation itself stays out of the archive download's way. */
export function adoptWaitingRelease(opening: () => boolean) {
  inOpening = opening;
  if (started || !import.meta.env.PROD || !window.isSecureContext || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL).then(found => {
    if (started || !found) return;
    registration ??= found;
    pending = pending || Boolean(found.waiting && navigator.serviceWorker.controller);
    refresh();
    applyPendingUpdate();
  }).catch(() => {});
}

export async function initPwa(notify: (message: string) => void, opening: () => boolean) {
  tell = notify;
  inOpening = opening;
  if (started || !import.meta.env.PROD || !window.isSecureContext || !("serviceWorker" in navigator)) return;
  started = true;
  try {
    registration = await navigator.serviceWorker.register(assetUrl("sw.js"), {
      scope: import.meta.env.BASE_URL, updateViaCache: "none",
    });
    const watch = () => {
      const worker = registration?.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed") {
          failed = false;
          // A first release takes control without waiting; only an update has
          // to be handed over by the page.
          pending = Boolean(navigator.serviceWorker.controller);
          refresh();
          if (pending) offerWorker(worker);
        } else if (worker.state === "redundant" && !registration?.active) {
          failed = true; refresh();
        }
      });
    };
    registration.addEventListener("updatefound", watch);
    watch();
    // A release left waiting by an earlier session is an update as well.
    pending = Boolean(registration.waiting && navigator.serviceWorker.controller);
    refresh();
    void navigator.serviceWorker.ready.then(() => { ready = true; failed = false; refresh(); });
    // One network check per launch, while the opening covers the terminal.
    void registration.update().catch(() => {});
    applyPendingUpdate();
  } catch { failed = true; }
  refresh();
}

if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("controllerchange", () => {
  if (!applying) { refresh(); return; }
  // The next load continues where the restart landed: the same welcome card,
  // the array, or the detail view.
  if (restartTo) try { sessionStorage.setItem(RESTART_KEY, restartTo); } catch { /* The opening restarts. */ }
  location.reload();
});
document.addEventListener("visibilitychange", applyPendingUpdate);
document.addEventListener("click", async event => {
  const button = (event.target as Element).closest<HTMLButtonElement>("[data-pwa-action]");
  if (!button) return;
  if (button.dataset.pwaAction === "install" && installPrompt) {
    const prompt = installPrompt; installPrompt = undefined;
    try { await prompt.prompt(); await prompt.userChoice; } catch { tell("请通过浏览器菜单添加到主屏幕"); }
    refresh();
  }
  if (button.dataset.pwaAction === "retry") {
    failed = false;
    refresh();
    if (registration) {
      try { await registration.update(); } catch { failed = true; refresh(); }
    } else { started = false; void initPwa(tell, inOpening); }
  }
});
