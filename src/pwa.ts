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
let tell: (message: string) => void = () => {};
let inOpening: () => boolean = () => false;
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
 *  page through `controllerchange`. Only the opening or a hidden tab reaches
 *  this point, so a session in use keeps the release it started with. */
function applyWorker(worker: ServiceWorker) {
  if (applying === worker || (!document.hidden && !inOpening())) return;
  applying = worker;
  worker.postMessage({ type: "RHINE_APPLY_UPDATE" });
}

/** Called when the terminal re-enters its opening, which is an apply moment. */
export function applyPendingUpdate() {
  const worker = registration?.waiting;
  if (pending && worker) applyWorker(worker);
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
          if (pending) applyWorker(worker);
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
  if (applying) location.reload();
  else refresh();
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
