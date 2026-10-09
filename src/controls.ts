// The event layer: which DOM element maps to which action.
//
// This module owns the four delegated listeners and the interaction routing --
// settings controls, directory buttons, keyboard shortcuts and the modal focus
// trap. What each action *means* (clamping a volume, normalising a quality
// edit, persisting, applying to the scene) stays with the page, which receives
// one call per intent through ControlsHost.
import type { Sound } from "./audio-types";

export type ModalKind = "search" | "saved" | "settings";
export type AppMode = "boot" | "archive" | "detail";

export type ControlsHost = {
  /** The terminal is running and accepts input; the opening is not a gate. */
  started(): boolean;
  /** The scene is loaded; the opening and every shortcut wait for it. */
  ready(): boolean;
  mode(): AppMode;
  modal(): ModalKind | null;
  modalClosing(): boolean;
  activeTab(): string;
  viewerOpen(): boolean;
  select(index: number): void;
  setMode(mode: AppMode): void;
  stepFile(direction: number): void;
  stepColumn(direction: number): void;
  openFile(): void;
  openModal(kind: ModalKind): void;
  closeModal(afterClose?: () => void): void;
  renderModal(): void;
  renderResults(): void;
  resetSearch(): void;
  setTab(tab: string): void;
  setQuery(query: string): void;
  setFilter(filter: string): void;
  setColorTheme(theme: string): void;
  setMotionPreset(preset: "full" | "reduced"): void;
  setMotion(key: string, enabled: boolean): void;
  setQualityPreset(value: string): void;
  setQualityValue(key: string, value: string): void;
  setToggle(key: string, enabled: boolean): void;
  setVolume(key: "soundVolume" | "musicVolume", value: number): void;
  notify(message: string): void;
  play(sound: Sound): void;
  replayBoot(): void;
  toggleSaved(): void;
  downloadArchive(): void;
  /** Opens the 360-degree viewer over the current file. */
  openModelViewer(opener: HTMLElement): void;
};

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;

/** Registers the delegated listeners. Returns nothing; the page owns the DOM. */
export function bindControls(host: ControlsHost) {
  document.addEventListener("input", (e) => {
    const slider = e.target as HTMLInputElement;
    if (slider.dataset.quality) {
      const output = document.querySelector<HTMLOutputElement>(`[data-quality-output="${slider.dataset.quality}"]`);
      if (output) output.value = `${slider.value}%`;
    }
    const volume = e.target as HTMLInputElement;
    if (volume.dataset.volume === "musicVolume" || volume.dataset.volume === "soundVolume") {
      host.setVolume(volume.dataset.volume, Number(volume.value) / 100);
      volume.closest("label")?.querySelector("output")?.replaceChildren(`${volume.value}%`);
    }
    if ((e.target as HTMLElement).id === "archive-search")
      host.setQuery((e.target as HTMLInputElement).value);
  });

  document.addEventListener("change", (e) => {
    const el = e.target as HTMLInputElement;
    if (el.id === "quality-preset") {
      host.setQualityPreset(el.value);
    } else if (el.dataset.quality) {
      host.setQualityValue(el.dataset.quality, el.value);
    }
    if (el.dataset.pref) {
      host.setToggle(el.dataset.pref, el.checked);
      host.play("confirm");
    }
    if (el.dataset.motion) {
      host.setMotion(el.dataset.motion, el.checked);
      host.play("confirm");
    }
  });

  document.addEventListener("click", (e) => {
    const themeButton = (e.target as Element).closest<HTMLElement>("[data-color-theme]");
    if (themeButton) {
      const theme = themeButton.dataset.colorTheme;
      if (theme) host.setColorTheme(theme);
      return;
    }
    if (!host.started()) return;
    if (host.modalClosing()) return;
    const el = (e.target as Element).closest<HTMLElement>("button");
    if (!el) return;
    if (el.dataset.action === "motion-preset") {
      const preset = el.dataset.preset;
      if (preset !== "full" && preset !== "reduced") return;
      host.setMotionPreset(preset);
      host.renderModal();
      requestAnimationFrame(() =>
        document.querySelector<HTMLButtonElement>(`[data-action="motion-preset"][data-preset="${preset}"]`)?.focus({ preventScroll: true }),
      );
      host.play("confirm");
      return;
    }
    if (el.dataset.select) {
      host.select(Number(el.dataset.select));
      return;
    }
    if (el.dataset.result) {
      const index = Number(el.dataset.result);
      host.closeModal(() => {
        host.select(index);
        host.openFile();
      });
      return;
    }
    if (el.dataset.filter) {
      host.setFilter(el.dataset.filter);
      document
        .querySelectorAll("[data-filter]")
        .forEach((b) =>
          b.classList.toggle(
            "active",
            (b as HTMLElement).dataset.filter === el.dataset.filter,
          ),
        );
      host.renderResults();
      return;
    }
    if (el.dataset.tab) {
      host.setTab(el.dataset.tab);
      return;
    }
    const action = el.dataset.action;
    if (action === "sound-preview") host.play("confirm");
    if (action === "skip") {
      // The opening holds on its welcome card until the array exists; entering
      // it earlier would show an archive with nothing in it.
      if (!host.ready()) return;
      host.setMode("archive");
      host.play("confirm");
    }
    if (action === "prev") host.stepFile(-1);
    if (action === "next") host.stepFile(1);
    if (action === "export") host.downloadArchive();
    if (action === "column-prev") host.stepColumn(-1);
    if (action === "column-next") host.stepColumn(1);
    if (action === "open") host.openFile();
    if (action === "model-viewer" && host.mode() === "detail") host.openModelViewer(el);
    if (action === "back") {
      host.setMode("archive");
      host.play("back");
    }
    if (action === "search" || action === "saved" || action === "settings") {
      el.focus({ preventScroll: true });
      host.openModal(action);
    }
    if (action === "close-modal") host.closeModal();
    if (action === "bookmark") host.toggleSaved();
    if (action === "reset-search") host.resetSearch();
    if (action === "replay" || action === "restart") host.replayBoot();
    if (action === "fullscreen" && document.fullscreenEnabled) {
      if (document.fullscreenElement) void document.exitFullscreen();
      else
        void document.documentElement
          .requestFullscreen()
          .catch(() => host.notify("请使用浏览器的全屏快捷键 F11"));
    }
  });

  document.addEventListener("keydown", (e) => {
    if (!host.started()) return;
    if (host.viewerOpen()) return;
    if (host.modalClosing()) {
      e.preventDefault();
      return;
    }
    const typing = e.target instanceof HTMLInputElement;
    if (e.key === "Escape") {
      if (host.modal()) host.closeModal();
      else if (host.mode() === "detail" || (host.mode() === "boot" && host.ready())) {
        const sound: Sound = host.mode() === "detail" ? "back" : "ui-tick";
        host.setMode("archive");
        host.play(sound);
      }
      return;
    }
    if (host.modal() && e.key === "Tab") {
      const focusables = [
        ...$("#modal-root").querySelectorAll<HTMLElement>(
          'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]',
        ),
      ];
      const visible = focusables.filter(el => el.tabIndex >= 0 && !el.matches(":disabled") && el.getClientRects().length > 0);
      const first = visible[0],
        last = visible.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
      return;
    }
    if (typing || host.modal() || !host.ready()) return;
    if (
      (e.target as HTMLElement).dataset.tab &&
      ["ArrowLeft", "ArrowRight"].includes(e.key)
    ) {
      e.preventDefault();
      const tabs = ["overview", "notes", "history"];
      host.setTab(
        tabs[(tabs.indexOf(host.activeTab()) + (e.key === "ArrowRight" ? 1 : 2)) % 3],
      );
      $<HTMLButtonElement>(`[data-tab="${host.activeTab()}"]`).focus();
      return;
    }
    if (e.key === "/") {
      e.preventDefault();
      if (host.mode() === "boot") host.setMode("archive");
      host.openModal("search");
    }
    if (e.key === "ArrowLeft" && host.mode() !== "boot") {
      e.preventDefault();
      host.stepColumn(-1);
    }
    if (e.key === "ArrowRight" && host.mode() !== "boot") {
      e.preventDefault();
      host.stepColumn(1);
    }
    if (["ArrowUp", "ArrowDown"].includes(e.key) && host.mode() !== "boot") {
      e.preventDefault();
      host.stepFile(e.key === "ArrowUp" ? -1 : 1);
    }
    if (
      e.key === "Enter" &&
      (document.activeElement === document.body ||
        document.activeElement?.id === "detail-content" ||
        ["prev", "next", "column-prev", "column-next"].includes(
          (document.activeElement as HTMLElement)?.dataset.action ?? "",
        ) ||
        (document.activeElement as HTMLElement)?.dataset.select)
    ) {
      e.preventDefault();
      if (host.mode() === "boot") host.setMode("archive");
      else if (host.mode() === "archive") host.openFile();
    }
  });
}
