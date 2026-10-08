import { assetUrl } from "./asset-url";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
let installPrompt: InstallPrompt | undefined;
let registration: ServiceWorkerRegistration | undefined;
let ready = false, failed = false, reloading = false, started = false;
let tell: (message: string) => void = () => {};
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
  return `<section id="pwa-settings" class="pwa-settings" aria-label="主屏幕与离线使用"><h3>APP / 主屏幕与离线</h3><div class="pwa-actions">${installPrompt && !installed() ? '<button data-pwa-action="install">安装到设备 ↗</button>' : ""}${registration?.waiting ? '<span>新版本已准备好</span><button data-pwa-action="update">更新并重启 ↻</button>' : ""}${failed ? '<button data-pwa-action="retry">重试保存离线资源 ↻</button>' : ""}</div></section>`;
}
function refresh() {
  const current = document.querySelector("#pwa-settings");
  if (current) current.outerHTML = pwaSettingsMarkup();
  document.documentElement.dataset.offlineReady = String(ready);
  const notice = document.querySelector<HTMLElement>("#pwa-update-notice");
  const waiting = Boolean(registration?.waiting);
  if (notice) notice.hidden = !waiting;
  const stage = document.querySelector<HTMLElement>("#stage");
  if (stage) stage.dataset.pwaUpdate = String(waiting);
}

export async function initPwa(notify: (message: string) => void) {
  tell = notify;
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
          refresh();
        } else if (worker.state === "redundant" && !registration?.active) {
          failed = true; refresh();
        }
      });
    };
    registration.addEventListener("updatefound", watch);
    watch();
    refresh();
    void navigator.serviceWorker.ready.then(() => { ready = true; failed = false; refresh(); });
    let lastCheck = Date.now();
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && Date.now() - lastCheck > 3_600_000) {
        lastCheck = Date.now(); void registration?.update().catch(() => {});
      }
    });
  } catch { failed = true; }
  refresh();
}

if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("controllerchange", () => {
  if (reloading) location.reload();
  else refresh();
});
document.addEventListener("click", async event => {
  const button = (event.target as Element).closest<HTMLButtonElement>("[data-pwa-action]");
  if (!button) return;
  if (button.dataset.pwaAction === "install" && installPrompt) {
    const prompt = installPrompt; installPrompt = undefined;
    try { await prompt.prompt(); await prompt.userChoice; } catch { tell("请通过浏览器菜单添加到主屏幕"); }
    refresh();
  }
  if (button.dataset.pwaAction === "update" && registration?.waiting) {
    reloading = true;
    button.disabled = true;
    registration.waiting.postMessage({ type: "RHINE_APPLY_UPDATE" });
  }
  if (button.dataset.pwaAction === "retry") {
    failed = false;
    refresh();
    if (registration) {
      try { await registration.update(); } catch { failed = true; refresh(); }
    } else { started = false; void initPwa(tell); }
  }
});
