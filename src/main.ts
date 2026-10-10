import { InspectionOverlay } from "./inspection-overlay";
import { DocumentDecryption } from "./document-decryption";
import "./document-decryption.css";
import "./decryption.css";
import { normalizeQuality, qualityPresets, type QualityPreset, type RenderQuality } from "./render-quality";
import { syncQualityUI } from "./quality-settings";
import "@kitlangton/rolling-number/styles.css";
import "./style.css";
import "./quality-settings.css";
import "./responsive.css";
import { initPwa } from "./pwa";
import { ArchiveScene } from "./scene";
import { ModelViewer } from "./model-viewer";
import { ContentTransition, SurfaceTransition } from "./ui-transitions";
import { BootSequence } from "./boot";
import { BOOT_START } from "./boot-motion";
import { wrap, type ArchiveNavigation } from "./archive-loop";
import {
  records,
  categories,
  archiveColumns,
  columnFiles,
  fileLocation,
} from "./data";
import { archiveText } from "./archive-text";
import { TerminalAudio } from "./audio";
import {
  loadPreferences,
  loadSaved,
  storePreferences,
  storeSaved,
  type TerminalPreferences,
} from "./prefs-store";
import "./startup.css";
import { isColorTheme, resolveDarkTheme } from "./color-theme";
import { paintTheme } from "./theme-ui";
import { stageMarkup } from "./stage-markup";
import { createArchiveWidgets } from "./rolling-widgets";
import { fitLayout } from "./layout-fit";
import { settingsMarkup } from "./settings-markup";
import { bindControls, type ControlsHost, type ModalKind } from "./controls";
import {
  OPENING_END,
  bootCinematic,
  bootEntryOpacity,
  bootRuleScale,
  bootStep,
  bootTitle,
} from "./boot-frame";
import {
  detailMarkup,
  tabPanelMarkup,
} from "./detail-markup";
import {
  directoryBodyMarkup,
  emptyResultsMarkup,
  modalMarkup,
  resultCountMarkup,
  resultRowMarkup,
} from "./directory-markup";

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;

$("#stage").innerHTML = stageMarkup;
// The stage is a calibrated 1920 x 1080 box scaled to the window, so anything
// that has to stay legible on a phone lives beside it in the real viewport.
$("#viewport").append($("#boot-error"));

$("#boot-background").insertAdjacentHTML(
  "beforeend",
  '<div class="boot-white"></div>',
);
const bootSequence = new BootSequence($("#stage"));

type Mode = "boot" | "archive" | "detail";
let mode: Mode = "boot",
  selected = 0,
  bootStart = 0,
  lastStep = "",
  ready = false;
let modal: ModalKind | null = null,
  searchQuery = "",
  filter = "全部档案";
let activeTab = "overview";
// `?scene=` is the only local shortcut: it hands the terminal straight to the
// archive or the detail view instead of playing the opening first.
const sceneParams = new URLSearchParams(location.search);
let toastTimer: ReturnType<typeof setTimeout>;
let previousFocus: HTMLElement | null = null;
const detailTransition = new SurfaceTransition($("#detail-ui"), undefined, 180, 180);
const tabTransition = new ContentTransition();
let modalTransition: SurfaceTransition | undefined;
let modalClosing = false;
let modalSiblings: { node: HTMLElement; inert: boolean }[] = [];
let pendingDetailFocus = false;
let bookmarkFeedback: Animation | undefined;
const saved = loadSaved();
const prefs: TerminalPreferences = loadPreferences();
const darkTheme = () => resolveDarkTheme(prefs.colorTheme);
paintTheme(darkTheme() ? 1 : 0);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (prefs.colorTheme !== "system") return;
  if (scene) scene.setTheme(darkTheme());
  else paintTheme(darkTheme() ? 1 : 0);
});
const {
  updateFooterClock,
  fileCounter,
  columnCounter,
  selectedCode,
  hoverCode,
  selectionTitle,
  columnTitle,
  hoverTitle,
  categoryTitle,
  clearanceTitle,
  rollingTitles,
} = createArchiveWidgets();
const audio = new TerminalAudio();
let musicSuppressed = false;
function configureAudio() { audio.configure({ ...prefs, music: prefs.music && !musicSuppressed }); }
configureAudio();
// The opening holds on its composed welcome card until the archive exists.
const WELCOME_HOLD = 16.48;
let bootHeld = false;
let scene: ArchiveScene | undefined;
let viewer: ModelViewer | undefined;
const accessLog: { id: string; time: string }[] = [];
const columnMemory = archiveColumns.map((_, lane) => columnFiles(lane)[0]);
function recordAccess() {
  accessLog.unshift({
    id: records[selected].id,
    time: new Date().toLocaleTimeString("en-GB"),
  });
}
function saveAudioPrefs() {
  storePreferences(prefs);
  configureAudio();
}
function savePrefs() {
  saveAudioPrefs();
  scene?.setTheme(darkTheme());
  document.querySelectorAll<HTMLElement>("[data-color-theme]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.colorTheme === prefs.colorTheme)));
  scene?.setQuality(prefs.rendering);
  viewer?.setQuality(prefs.rendering);
  syncQualityUI(prefs.rendering);
  fileCounter.update({ animated: mode === "archive" });
  rollingTitles.forEach(title => title.update({ animated: mode === "archive" }));
  columnCounter.update({ animated: mode === "archive" });
  selectedCode.update({ animated: mode === "archive" });
  hoverCode.update({ animated: mode === "archive" });
  updateFooterClock(new Date());
}
function fit() {
  fitLayout({
    stage: $("#stage"),
    viewport: $("#viewport"),
    mode,
    coarse: matchMedia("(pointer: coarse)").matches,
    composed: () => {
      scene?.resize();
      viewer?.resize();
    },
    remeasure: () => {
      documentDecryption.refresh();
      const tab = document.querySelector<HTMLElement>(".detail-tabs button.active");
      const indicator = document.querySelector<HTMLElement>(".tab-indicator");
      if (tab && indicator) indicator.style.transform = `translateX(${tab.offsetLeft}px) scaleX(${tab.offsetWidth})`;
    },
  });
}
window.addEventListener("resize", fit);
window.visualViewport?.addEventListener("resize", fit);
window.visualViewport?.addEventListener("scroll", fit);
matchMedia("(pointer: coarse)").addEventListener("change", fit);
fit();
$("#file-ticks").innerHTML = columnFiles(fileLocation(selected).lane)
  .map(
    (index) => `<button data-select="${index}"></button>`,
  )
  .join("");
const fileTicks = [...$("#file-ticks").querySelectorAll<HTMLButtonElement>("button")];

function setMode(next: Mode) {
  const previousMode = mode;
  rollingTitles.forEach(title => title.update({ animated: next === "archive" }));
  if (next !== "archive") {
    rollingTitles.forEach(title => title.finish());
    hoverCode.finish();
    $("#hover-label").hidden = true;
  }
  if (next === "detail" && mode !== "detail") recordAccess();
  mode = next;
  audio.setScene(next);
  $("#stage").dataset.mode = next;
  if (previousMode !== next) fit();
  $("#boot").inert = next !== "boot";
  $("#boot").setAttribute("aria-hidden", String(next !== "boot"));
  $("#archive-ui").inert = next !== "archive" || Boolean(modal);
  $("#archive-ui").setAttribute("aria-hidden", String(next !== "archive" || Boolean(modal)));
  $(".system-nav").inert = next === "boot" || Boolean(modal);
  $(".system-footer").inert = next === "boot" || Boolean(modal);
  if (next === "detail") {
    if (previousMode !== "detail") detailTransition.show();
  } else if (previousMode === "detail" || (next === "boot" && !$("#detail-ui").hidden)) {
    pendingDetailFocus = false;
    tabTransition.cancel();
    detailTransition.hide();
    if (!modal && next === "archive") $(".read-file").focus({ preventScroll: true });
  }
  $("#detail-ui").inert = next !== "detail" || Boolean(modal);
  scene?.setMode(next === "boot" ? "hidden" : next);
  if (next !== "boot") {
    bootSequence.reset();
    $(".file-title").firstChild!.textContent = "FILE NUMBER: ";
    $("#stage").dataset.boot = "done";
  }
  if (next === "detail" && previousMode !== "detail") {
    renderDetail();
    pendingDetailFocus = true;
    if (!scene) {
      $("#detail-content").style.opacity = "1";
      $("#detail-content").style.translate = "0 0";
      $("#detail-content").inert = false;
    }
  }
}
function select(index: number, navigation?: ArchiveNavigation) {
  selected = (index + records.length) % records.length;
  columnMemory[fileLocation(selected).lane] = selected;
  if (mode === "detail") setMode("archive");
  activeTab = "overview";
  scene?.select(selected, navigation);
  updateSelection(navigation);
  const columnMove = navigation && "axis" in navigation && navigation.axis === "lane";
  audio.play(columnMove ? "column" : "tick", columnMove ? navigation.direction * .45 : 0);
}
function stepFile(direction: number) {
  const files = columnFiles(fileLocation(selected).lane);
  if (files.length < 2) return;
  select(
    files[(files.indexOf(selected) + direction + files.length) % files.length],
    { axis: "row", direction },
  );
}
function stepColumn(direction: number) {
  const lane = fileLocation(selected).lane;
  const next = wrap(lane + direction, archiveColumns.length);
  select(columnMemory[next], { axis: "lane", direction });
}
function updateSelection(navigation?: ArchiveNavigation) {
  const r = records[selected];
  const { lane } = fileLocation(selected);
  const files = columnFiles(lane);
  selectionTitle.update({ text: r.title, animated: mode === "archive" });
  clearanceTitle.update({ text: r.clearance, animated: mode === "archive" });
  categoryTitle.update({ text: r.category, animated: mode === "archive" });
  const direction =
    navigation && "axis" in navigation
      ? navigation.direction > 0
        ? "up"
        : "down"
      : "auto";
  selectedCode.update({
    value: Number(r.id.slice(2)),
    animated: mode === "archive",
    direction,
  });
  fileCounter.update({
    value: files.indexOf(selected) + 1,
    animated: mode === "archive",
    direction:
      navigation && "axis" in navigation && navigation.axis === "row"
        ? direction
        : "auto",
  });
  $(".count-total").textContent = String(files.length).padStart(2, "0");
  columnCounter.update({
    value: lane + 1,
    animated: mode === "archive",
    direction:
      navigation && "axis" in navigation && navigation.axis === "lane"
        ? direction
        : "auto",
  });
  columnTitle.update({ text: archiveColumns[lane], animated: mode === "archive" });
  $<HTMLButtonElement>('[data-action="column-prev"]').disabled = false;
  $<HTMLButtonElement>('[data-action="column-next"]').disabled = false;
  fileTicks.forEach((button, slot) => {
    const index = files[slot], record = records[index];
    button.dataset.select = String(index);
    button.setAttribute("aria-label", `选择档案 ${record.id} ${record.title}`);
    button.title = `${record.id} · ${record.title}`;
    button.classList.toggle("selected", index === selected);
    button.setAttribute("aria-pressed", String(index === selected));
  });
  $("#saved-count").textContent = String(saved.size).padStart(2, "0");
}
function replayBoot() {
  if (!ready) return;
  closeModal(() => replayBootAfterModal());
}
function replayBootAfterModal() {
  bootStart = performance.now() / 1000 - BOOT_START;
  lastStep = "";
  setMode("boot");
  audio.restartBoot();
  scene?.select(0);
  selected = 0;
  updateSelection();
  audio.play("ui-tick");
}
function openFile() {
  if (!ready) return;
  closeModal(() => {
    setMode("detail");
    audio.play("open");
  });
}
function toggleSaved() {
  const id = records[selected].id;
  if (saved.has(id)) saved.delete(id);
  else saved.add(id);
  storeSaved(saved);
  $("#saved-count").textContent = String(saved.size).padStart(2, "0");
  const button = $<HTMLButtonElement>('[data-action="bookmark"]');
  const added = saved.has(id);
  button.firstChild!.textContent = added ? "− REMOVE FROM SAVED" : "＋ SAVE ARCHIVE";
  button.querySelector("span")!.textContent = added ? "已收藏" : "收藏档案";
  button.setAttribute("aria-pressed", String(added));
  bookmarkFeedback?.cancel();
  bookmarkFeedback = button.animate(
    [{ backgroundColor: "#67634c" }, { backgroundColor: "#252820" }],
    { duration: 220, easing: "ease-out" },
  );
  audio.play("confirm");
  notify(saved.has(id) ? "档案已加入收藏" : "已取消收藏");
}
function downloadArchive() {
  const record = records[selected];
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([archiveText(record)], { type: "text/plain;charset=utf-8" }),
  );
  link.download = `RHINE-LAB-${record.id}.txt`;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel an in-flight download in some browsers.
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
function renderDetail() {
  tabTransition.cancel();
  const r = records[selected];
  $("#object-id").textContent = "NO." + String(selected + 1).padStart(3, "0");
  $("#detail-content").innerHTML = detailMarkup(r, {
    saved: saved.has(r.id),
    index: selected,
    total: records.length,
  });
  $("#detail-content").setAttribute("tabindex", "-1");
  $('[data-action="bookmark"]').setAttribute("aria-pressed", String(saved.has(r.id)));
  documentDecryption.reset($("#detail-content"), !scene || scene.decryptionFrame.phase === "clear");
  setTab(activeTab, false);
}
function setTab(tab: string, sound = true) {
  if (sound && tab === activeTab) return;
  activeTab = tab;
  document.querySelectorAll("[data-tab]").forEach((b) => {
    const active = (b as HTMLElement).dataset.tab === tab;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", String(active));
    b.setAttribute("tabindex", active ? "0" : "-1");
  });
  const r = records[selected];
  const tabButton = $<HTMLButtonElement>(`[data-tab="${tab}"]`);
  const indicator = $(".tab-indicator");
  indicator.style.transition = sound ? "" : "none";
  indicator.style.transform = `translateX(${tabButton.offsetLeft}px) scaleX(${tabButton.offsetWidth})`;
  $("#tab-panel").setAttribute("aria-labelledby", tabButton.id);
  $("#tab-panel").innerHTML = tabPanelMarkup(tab, records[selected], accessLog);
  $("#tab-panel").scrollTop = 0;
  documentDecryption.refresh();
  if (sound) {
    tabTransition.reveal($("#tab-panel"));
    audio.play("ui-tick");
  }
}
function notify(message: string) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 2600);
}

function openModal(kind: NonNullable<typeof modal>) {
  if (!ready) return;
  if (!modal) {
    previousFocus = document.activeElement as HTMLElement;
    modalSiblings = [...$("#stage").children]
      .filter((node): node is HTMLElement => node instanceof HTMLElement && node.id !== "modal-root")
      .map((node) => ({ node, inert: node.inert }));
    modalSiblings.forEach(({ node }) => (node.inert = true));
  }
  modalClosing = false;
  modal = kind;
  searchQuery = "";
  filter = "全部档案";
  audio.play("page-open");
  renderModal();
}
function closeModal(afterClose?: () => void) {
  if (!modal) {
    afterClose?.();
    return;
  }
  if (modalClosing) return;
  modalClosing = true;
  audio.play("page-close");
  modalTransition!.hide(() => {
    modal = null;
    modalClosing = false;
    $("#modal-root").replaceChildren();
    modalTransition = undefined;
    modalSiblings.forEach(({ node, inert }) => (node.inert = inert));
    modalSiblings = [];
    $("#archive-ui").inert = mode !== "archive";
    $("#detail-ui").inert = mode !== "detail";
    previousFocus?.focus({ preventScroll: true });
    afterClose?.();
  });
}
function renderModal() {
  if (!modal) return;
  modalTransition?.dispose();
  $("#modal-root").innerHTML = modalMarkup(
    modal,
    modal === "settings" ? settingsMarkup(prefs) : directoryBodyMarkup(modal, categories),
  );
  const backdrop = $(".modal-backdrop");
  backdrop.hidden = true;
  modalTransition = new SurfaceTransition(backdrop, $(".terminal-modal"));
  modalTransition.show();
  if (modal !== "settings") {
    renderResults();
    requestAnimationFrame(() => {
      if (backdrop.isConnected && !modalClosing) $("#archive-search").focus();
    });
  } else
    requestAnimationFrame(() => {
      if (backdrop.isConnected && !modalClosing) $('[data-action="close-modal"]').focus();
    });
  $("#modal-root")
    .querySelector(".modal-backdrop")
    ?.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closeModal();
    });
}
function renderResults() {
  const results = records
    .map((r, i) => ({ r, i }))
    .filter(
      ({ r }) =>
        (modal !== "saved" || saved.has(r.id)) &&
        (filter === "全部档案" || r.category === filter) &&
        `${r.id} ${r.title} ${r.en} ${r.department} ${r.lead}`
          .toLowerCase()
          .includes(searchQuery.toLowerCase()),
    );
  $("#search-results").innerHTML = results.length
    ? results.map(({ r, i }) => resultRowMarkup(r, i, saved.has(r.id))).join("")
    : emptyResultsMarkup(modal === "saved" ? "saved" : "search", Boolean(searchQuery));
  $("#result-count").textContent = resultCountMarkup(results.length);
}

// The event layer routes DOM events to these actions; see src/controls.ts.
const controlsHost: ControlsHost = {
  started: () => true,
  ready: () => ready,
  mode: () => mode,
  modal: () => modal,
  modalClosing: () => modalClosing,
  activeTab: () => activeTab,
  viewerOpen: () => Boolean(viewer?.isOpen),
  select: (index) => select(index),
  setMode: (next) => setMode(next),
  stepFile: (direction) => stepFile(direction),
  stepColumn: (direction) => stepColumn(direction),
  openFile: () => openFile(),
  openModal: (kind) => openModal(kind),
  closeModal: (afterClose) => closeModal(afterClose),
  renderModal: () => renderModal(),
  renderResults: () => renderResults(),
  resetSearch: () => {
    modal = "search";
    searchQuery = "";
    filter = "全部档案";
    renderModal();
  },
  setTab: (tab) => setTab(tab),
  setQuery: (query) => {
    searchQuery = query;
    renderResults();
  },
  setFilter: (value) => {
    filter = value;
  },
  setColorTheme: (theme) => {
    if (isColorTheme(theme)) prefs.colorTheme = theme;
    savePrefs();
  },
  setQualityPreset: (value) => {
    if (!Object.hasOwn(qualityPresets, value)) return;
    prefs.rendering = { ...qualityPresets[value as QualityPreset] };
    savePrefs();
  },
  setQualityValue: (key, value) => {
    const qualityKey = key as keyof RenderQuality;
    prefs.rendering = normalizeQuality({ ...prefs.rendering, [qualityKey]: qualityKey === "antialias" ? value : Number(value) });
    savePrefs();
  },
  setToggle: (key, enabled) => {
    if (key === "sound" || key === "music" || key === "quality") prefs[key] = enabled;
    if (key === "sound" || key === "music") saveAudioPrefs();
    else savePrefs();
  },
  setVolume: (key, value) => {
    prefs[key] = value;
    saveAudioPrefs();
  },
  notify: (message) => notify(message),
  play: (sound) => audio.play(sound),
  replayBoot: () => replayBoot(),
  toggleSaved: () => toggleSaved(),
  downloadArchive: () => downloadArchive(),
  openModelViewer: (opener) => {
    if (!scene || mode !== "detail") return;
    const activeScene = scene;
    // Safari does not always focus a button when it is tapped. Capture the
    // actual opener so closing the modal reliably restores the right control.
    opener.focus({ preventScroll: true });
    viewer ??= new ModelViewer($("#stage"), () => { audio.setScene(mode); audio.play("page-close"); }, (sound) => audio.play(sound === "tick" ? "ui-tick" : sound));
    audio.setScene("viewer");
    viewer.setQuality(prefs.rendering);
    scene.finishDecryption();
    viewer.open(
      records[selected].id,
      records[selected].title,
      () => activeScene.createAssemblyModel(),
    );
    audio.play("page-open");
  },
};
bindControls(controlsHost);

/** Pins or releases the welcome hold and publishes the state for the styles and
 *  the entry button; the terminal must not look interactive before the array
 *  it would enter actually exists. */
function setBootHold(held: boolean) {
  if (held === bootHeld) return;
  bootHeld = held;
  $("#viewport").dataset.bootHold = String(held);
  const skip = $("#skip");
  skip.setAttribute("aria-disabled", String(held));
  skip.inert = held;
}

/** The opening clock in app seconds. While the archive streams in, the clock
 *  stops on the composed welcome card instead of running past it, so the rest
 *  of the opening resumes from there once the scene is ready. */
function bootClock(time: number) {
  const elapsed = time - bootStart;
  if (ready || elapsed <= WELCOME_HOLD) {
    setBootHold(false);
    return elapsed;
  }
  bootStart = time - WELCOME_HOLD;
  setBootHold(true);
  return WELCOME_HOLD;
}

function bootFrame(t: number) {
  audio.updateBoot(t, bootHeld);
  const step = bootStep(t, bootSequence.update(t).step);
  if (step !== lastStep) {
    $("#stage").dataset.boot = step;
    lastStep = step;
  }
  $(".file-title").firstChild!.textContent = bootTitle(t, step);
  $("#stage").style.setProperty("--entry-opacity", String(bootEntryOpacity(t)));
  $(".callout-rule").style.transform = `scaleX(${bootRuleScale(t)})`;
  if (t >= OPENING_END && scene) {
    setMode("detail");
    return undefined;
  }
  return bootCinematic(t);
}

const inspectionOverlay = new InspectionOverlay();
const documentDecryption = new DocumentDecryption();

/** The page and the scene publish one read-only snapshot as JSON on the stage,
 *  the way the model viewer publishes its own on `.model-viewer`. The browser
 *  regressions read it; nothing else depends on it. Written every frame because
 *  a gesture check has to observe the state its own pointer move just produced. */
function publishSnapshot() {
  $("#stage").dataset.stats = JSON.stringify({
    ...scene?.getStats(),
    fps: Math.round(fps),
    mode,
    ready,
    hold: bootHeld,
    bootTime: mode === "boot" ? performance.now() / 1000 - bootStart : null,
    selected: records[selected].id,
    audio: audio.stats(),
  });
}

let lastTime = 0,
  frameCount = 0,
  frameStart = performance.now(),
  fps = 0;
function frame(ms: number) {
  if (document.hidden) { requestAnimationFrame(frame); return; }
  const time = ms / 1000;
  const theme = scene?.themeAmount ?? (darkTheme() ? 1 : 0);
  paintTheme(theme);
  viewer?.setTheme(theme);
  const cinema = mode === "boot" ? bootFrame(bootClock(time)) : undefined;
  // The calibrated 2D opening fully covers the scene until array entry.
  if (!viewer?.isOpen && (!cinema || cinema.time >= 17.78)) scene?.update(time, cinema);
  viewer?.update(time);
  if (scene && mode === "detail") {
    documentDecryption.update(time, scene.decryptionFrame);
    $("#detail-content").style.opacity = String(scene.detailVisibility);
    $("#detail-content").style.translate =
      `0 ${(1 - scene.detailVisibility) * 18}px`;
    $("#detail-content").inert = scene.detailVisibility < 0.1;
    if (pendingDetailFocus && scene.detailVisibility >= 0.1 && !modal && !viewer?.isOpen) {
      $("#detail-content").focus({ preventScroll: true });
      pendingDetailFocus = false;
    }
  }
  $("#stage").style.setProperty("--detail-shade", String(mode === "boot" ? 0 : scene?.detailVisibility ?? 0));
  const currentScene = scene;
  if (currentScene) inspectionOverlay.render(currentScene.decryptionFrame,
    (x, y) => currentScene.projectCard(x, y), Boolean(cinema));
  if (Math.floor(time) !== lastTime) {
    lastTime = Math.floor(time);
    updateFooterClock(new Date());
  }
  frameCount++;
  if (ms - frameStart > 1000) {
    fps = (frameCount * 1000) / (ms - frameStart);
    frameStart = ms;
    frameCount = 0;
    $("#three-scene").dataset.fps = String(Math.round(fps));
  }
  publishSnapshot();
  requestAnimationFrame(frame);
}
function bindScene(scene: ArchiveScene) {
    scene.select(selected);
    scene.onSelect = (i, cell) => {
      if (mode !== "archive" || modal || viewer?.isOpen) return;
      select(i, cell ? { cell } : undefined);
    };
    scene.onNavigate = (axis, direction) => {
      if (mode !== "archive" || modal || viewer?.isOpen) return;
      if (axis === "lane") stepColumn(direction);
      else stepFile(direction);
    };
    scene.onHover = (i) => {
      const label = $("#hover-label");
      if (i === null) {
        label.hidden = true;
        hoverCode.finish();
        hoverTitle.finish();
        return;
      }
      const animated = mode === "archive";
      hoverCode.update({
        value: Number(records[i].id.slice(2)),
        animated: !label.hidden && animated,
      });
      hoverTitle.update({ text: records[i].title, animated: !label.hidden && animated });
      label.hidden = false;
      // Prepare the first visible value so the next hover can animate immediately.
      hoverCode.update({ animated });
      hoverTitle.update({ animated });
    };
}
async function start() {
  try {
    scene = new ArchiveScene($("#three-scene"));
    scene.setTheme(darkTheme(), true);
    await scene?.load();
    if (scene) bindScene(scene);
    scene?.setMode("hidden");
    savePrefs();
    ready = true;
    select(0);
    // The `?scene=` shortcuts hand the terminal straight to their mode; the
    // normal path only leaves the opening when the reader asks for the array.
    if (sceneParams.get("scene") === "archive") setMode("archive");
    if (sceneParams.get("scene") === "detail") setMode("detail");
  } catch (error) {
    console.error(error);
    setBootHold(false);
    $("#boot-error").hidden = false;
  } finally {
    // Do not compete with the archive download the opening is waiting on. The
    // full offline installation starts once the terminal has its resources.
    setTimeout(() => void initPwa(notify), 1500);
  }
}
updateSelection();
// The page opens itself: the calibrated opening starts on the first frame while
// the archive model and the score stream in behind it. Nothing here waits for
// audio, and the opening clock only waits for the scene.
bootStart = performance.now() / 1000 - BOOT_START;
audio.restartBoot();
setMode("boot");
$("#boot-error").querySelector("button")!.addEventListener("click", () => location.reload());
if (prefs.music) void audio.prepareMusic().catch(() => { /* Playback retries on the next activation. */ });
requestAnimationFrame(frame);
void start();
if (import.meta.hot) import.meta.hot.dispose(() => audio.dispose());
