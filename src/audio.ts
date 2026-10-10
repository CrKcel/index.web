// Terminal audio facade. Owns the device lifetime and the gesture gate, routes
// effects through the shared graph, and schedules the opening cues. The effect
// recipes live in audio-synth, the score in audio-music, the vocabulary in
// audio-types.
import { hasTypingBetween } from "./typing-rhythm";
import { BOOT_START, FOOTAGE_OFFSET } from "./boot-motion";
import {
  BOOT_CUES,
  clamp,
  rampLevel,
  type AudioPreferences,
  type Sound,
  type SoundScene,
} from "./audio-types";
import { synthesizeSound } from "./audio-synth";
import { MusicEngine, createStemGains, type MusicBus } from "./audio-music";
export type { AudioPreferences, Sound, SoundScene } from "./audio-types";
export { BOOT_CUES, rampLevel } from "./audio-types";
export { synthesizeSound } from "./audio-synth";

export class TerminalAudio {
  private prefs: AudioPreferences = {
    sound: false,
    music: false,
    soundVolume: 0.55,
    musicVolume: 0.5,
  };
  private context?: AudioContext;
  private effects?: GainNode;
  private duck?: GainNode;
  private bus: MusicBus = { stemGains: [] };
  private music = new MusicEngine(this.bus);
  private voices: ReturnType<typeof synthesizeSound>[] = [];
  private lastSound = new Map<Sound, number>();
  private scene: SoundScene = "boot";
  private unlocked = false;
  private disposed = false;
  private bootTime: number | null = null;
  private error = "";
  private requestId = 0;
  private suspension: Promise<void> = Promise.resolve();
  private bootMix = -1;
  private playedKeys = 0;
  private hostPaused = false;
  setHostPaused(paused: boolean) {
    this.hostPaused = paused;
    if (paused) this.hide();
    else this.visibility();
  }
  constructor() {
    document.addEventListener("pointerdown", this.gesture, { capture: true });
    document.addEventListener("keydown", this.gesture, { capture: true });
    document.addEventListener("visibilitychange", this.visibility);
    window.addEventListener("pagehide", this.hide);
    window.addEventListener("pageshow", this.visibility);
  }
  private gesture = () => {
    this.unlocked = true;
    void this.activate();
  };
  async unlock() {
    this.unlocked = true;
    await this.activate();
    return this.context?.state === "running" && (!this.prefs.music || this.music.loaded);
  }
  // Fetch compressed tracks during the opening so the score is ready by the
  // time a real activation creates the device.
  prepareMusic() {
    return this.music.prepare();
  }
  restartBoot() {
    this.stopEffects();
    this.bootTime = BOOT_START + FOOTAGE_OFFSET;
    this.bootMix = -1;
  }
  private hide = () => {
    this.requestId++;
    this.stopMusic();
    this.stopEffects();
    this.suspension =
      this.context?.suspend().catch(() => {}) ?? Promise.resolve();
  };
  private visibility = () => {
    this.bootTime = null;
    if (document.hidden) this.hide();
    else if (this.unlocked) void this.activate();
  };
  configure(prefs: AudioPreferences) {
    this.prefs = {
      sound: !!prefs.sound,
      music: !!prefs.music,
      soundVolume: clamp(prefs.soundVolume),
      musicVolume: clamp(prefs.musicVolume),
    };
    if (this.context) {
      rampLevel(
        this.effects!.gain,
        this.prefs.sound ? this.prefs.soundVolume : 0,
        this.context.currentTime,
      );
      rampLevel(
        this.bus.musicBus!.gain,
        this.prefs.music ? this.prefs.musicVolume : 0,
        this.context.currentTime,
        0.2,
      );
    }
    if (!this.prefs.sound) this.stopEffects();
    if (!this.prefs.music) this.stopMusic();
    if (!this.prefs.sound && !this.prefs.music) this.hide();
    else if (this.unlocked) void this.activate();
  }
  private createContext() {
    const c = (this.context = new AudioContext()),
      master = c.createGain(),
      limiter = c.createDynamicsCompressor();
    this.bus.context = c;
    master.gain.value = 0.8;
    limiter.threshold.value = -8;
    limiter.knee.value = 8;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;
    this.effects = c.createGain();
    const musicBus = (this.bus.musicBus = c.createGain());
    this.duck = c.createGain();
    this.effects.gain.value = this.prefs.sound ? this.prefs.soundVolume : 0;
    musicBus.gain.value = this.prefs.music ? this.prefs.musicVolume : 0;
    this.effects.connect(master);
    musicBus.connect(this.duck);
    this.duck.connect(master);
    master.connect(limiter);
    limiter.connect(c.destination);
    this.bus.stemGains = createStemGains(c, musicBus);
    this.mixScene();
    return c;
  }
  private async activate() {
    if (
      this.disposed ||
      this.hostPaused ||
      document.hidden ||
      !this.unlocked ||
      (!this.prefs.sound && !this.prefs.music)
    )
      return;
    const id = ++this.requestId;
    try {
      const c = this.context ?? this.createContext();
      // Call resume before awaiting network or an earlier suspension so the
      // browser observes this call in the user's activation handler.
      const resume = c.state === "running" ? Promise.resolve() : c.resume();
      await Promise.all([this.suspension, resume]);
      if (id !== this.requestId || this.disposed || document.hidden) return;
      if (c.state !== "running") return;
      if (id !== this.requestId || document.hidden || this.disposed) return;
      if (this.prefs.music) {
        await this.music.decode(c);
        this.error = "";
        if (id === this.requestId) this.startMusic();
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : "Audio unavailable";
    }
  }
  private startMusic() {
    // The transport guards device and buffer readiness; everything that is a
    // property of the facade is decided here.
    this.music.start(
      this.prefs.musicVolume,
      this.hostPaused || this.disposed || document.hidden || !this.prefs.music,
    );
  }
  private stopMusic() {
    this.music.stop();
  }
  private mixScene() {
    this.music.mix(this.scene);
  }
  private stopEffects() {
    if (this.context)
      this.voices.forEach((v) => v.stop(this.context!.currentTime));
    this.voices = [];
    this.lastSound.clear();
  }
  setScene(scene: SoundScene) {
    if (this.scene === scene) return;
    this.scene = scene;
    this.bootTime = null;
    this.bootMix = -1;
    this.stopEffects();
    this.mixScene();
  }
  play(type: Sound = "tick", pan = 0) {
    const c = this.context;
    if (
      !this.prefs.sound ||
      this.hostPaused ||
      !c ||
      c.state !== "running" ||
      document.hidden ||
      this.disposed
    )
      return;
    const now = c.currentTime,
      interval =
        type === "key"
          ? 0.024
          : type === "tick" || type === "column"
            ? 0.055
            : 0.12;
    if (now - (this.lastSound.get(type) ?? -Infinity) < interval) return;
    this.lastSound.set(type, now);
    this.voices = this.voices.filter((v) => v.end > now);
    if (this.voices.length >= 10) this.voices.shift()!.stop(now);
    const voice = synthesizeSound(c, this.effects!, type, now + 0.004, pan);
    this.voices.push(voice);
    if (this.prefs.soundVolume > 0) window.dispatchEvent(new CustomEvent("rhine-local-sound", {
      detail: { until: performance.now() / 1000 + Math.max(0, voice.end - now) + .2 },
    }));
    if (type === "key") this.playedKeys++;
    if (
      ["open", "brand", "welcome", "array", "explode", "assemble"].includes(
        type,
      )
    ) {
      rampLevel(this.duck!.gain, 0.65, now, 0.035);
      this.duck!.gain.linearRampToValueAtTime(1, now + 0.9);
    }
  }
  updateBoot(appTime: number, frozen = false) {
    const time = appTime + FOOTAGE_OFFSET;
    const previous = this.bootTime;
    this.bootTime = time;
    const phase = time < 22.76 ? 0 : time < 26.92 ? 1 : time < 34.3 ? 2 : 3;
    if (phase !== this.bootMix && this.context) {
      this.bootMix = phase;
      const gains = [
        [0.48, 0.32, 0.18],
        [0.68, 0.55, 0.32],
        [0.9, 0.72, 0.65],
        [0.72, 0.36, 0.12],
      ][phase];
      this.music.rampStems(gains, 0.9);
    }
    if (
      frozen ||
      previous === null ||
      time < previous ||
      time - previous > 0.3
    ) {
      this.stopEffects();
      return;
    }
    for (const cue of BOOT_CUES)
      if (cue.time > previous && cue.time <= time) this.play(cue.sound);
    if (hasTypingBetween(previous, time)) this.play("key");
  }
  stats() {
    return {
      state: this.context?.state ?? "locked",
      scene: this.scene,
      tracks: this.music.playing,
      voices: this.voices.filter(
        (v) => v.end > (this.context?.currentTime ?? 0),
      ).length,
      loaded: this.music.loaded,
      playedKeys: this.playedKeys,
      error: this.error,
      preferences: { ...this.prefs },
    };
  }
  dispose() {
    this.disposed = true;
    this.requestId++;
    this.stopMusic();
    this.stopEffects();
    document.removeEventListener("pointerdown", this.gesture, true);
    document.removeEventListener("keydown", this.gesture, true);
    document.removeEventListener("visibilitychange", this.visibility);
    window.removeEventListener("pagehide", this.hide);
    window.removeEventListener("pageshow", this.visibility);
    void this.context?.close();
  }
}
