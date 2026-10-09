// The three-stem score: compressed stems are fetched while the opening plays,
// decoded only once a real activation created the audio device, and then
// looped in lockstep. Everything here is Web Audio; the device lifetime, the
// gesture gate and the effect bus stay in TerminalAudio, which owns the graph
// this module connects into through MusicBus.
import { assetUrl } from "./asset-url";
import { rampLevel, type SoundScene } from "./audio-types";
const STEMS = ["atmosphere", "motif", "pulse"] as const;
const LOOP_SECONDS = 160 / 3;
const SCENE_GAINS: Record<SoundScene, readonly number[]> = {
  boot: [0.48, 0.32, 0.18],
  archive: [0.9, 0.72, 0.65],
  detail: [0.72, 0.36, 0.12],
  viewer: [0.8, 0.24, 0.28],
};
/**
 * The live music side of the shared graph. `TerminalAudio` fills this in when it
 * creates the context, so the transport can keep running across a context that
 * is created later than the transport itself.
 */
export type MusicBus = {
  context?: AudioContext;
  musicBus?: GainNode;
  stemGains: GainNode[];
};
/** One silent gain per stem, wired to the music bus, in stem order. */
export function createStemGains(c: AudioContext, musicBus: GainNode) {
  return STEMS.map(() => {
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.connect(musicBus);
    return gain;
  });
}

export class MusicEngine {
  // Declared explicitly: the behavior checks load src/ with Node's strip-only
  // type stripping, which rejects TypeScript parameter properties.
  private readonly bus: MusicBus;
  private musicData?: ArrayBuffer[];
  private fetching?: Promise<ArrayBuffer[]>;
  private buffers?: AudioBuffer[];
  private loading?: Promise<void>;
  private tracks: AudioBufferSourceNode[] = [];
  private offset = 0;
  private startedAt = 0;
  constructor(bus: MusicBus) {
    this.bus = bus;
  }
  /** Fetch the compressed stems; safe to call before any audio device exists. */
  prepare() {
    if (this.musicData) return Promise.resolve(this.musicData);
    this.fetching ??= Promise.all(
      STEMS.map(async (name) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
          const response = await fetch(assetUrl(`audio/${name}.ogg`), {
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`Music ${name}: ${response.status}`);
          return await response.arrayBuffer();
        } finally {
          clearTimeout(timeout);
        }
      }),
    )
      .then((data) => (this.musicData = data))
      .finally(() => {
        this.fetching = undefined;
      });
    return this.fetching;
  }
  decode(c: AudioContext) {
    if (this.buffers) return Promise.resolve();
    this.loading ??= this.prepare()
      .then((data) =>
        Promise.all(data.map((bytes) => c.decodeAudioData(bytes.slice(0)))),
      )
      .then((buffers) => {
        this.buffers = buffers;
      })
      .finally(() => {
        this.loading = undefined;
      });
    return this.loading;
  }
  /**
   * Adopt already-decoded stems. Live playback reaches this state through
   * decode(); the offline audio check installs its own buffers so the transport
   * can be verified without a network fetch or a real device.
   */
  adopt(buffers: AudioBuffer[]) {
    this.buffers = buffers;
  }
  /**
   * Restart the loop from the stored offset. The facade decides whether music
   * may play at all and passes that verdict in `blocked`; the transport only
   * checks device and buffer readiness.
   */
  start(volume: number, blocked: boolean) {
    const c = this.bus.context;
    if (
      !c ||
      c.state !== "running" ||
      !this.buffers ||
      blocked ||
      this.tracks.length
    )
      return;
    this.startedAt = c.currentTime + 0.04;
    this.tracks = this.buffers.map((buffer, i) => {
      const src = c.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.loopStart = 0;
      src.loopEnd = Math.min(LOOP_SECONDS, buffer.duration);
      src.connect(this.bus.stemGains[i]);
      src.start(this.startedAt, this.offset % src.loopEnd);
      return src;
    });
    const musicBus = this.bus.musicBus!;
    musicBus.gain.cancelScheduledValues(c.currentTime);
    musicBus.gain.setValueAtTime(0, c.currentTime);
    musicBus.gain.linearRampToValueAtTime(volume, c.currentTime + 1.2);
  }
  stop() {
    const c = this.bus.context;
    if (!c || !this.tracks.length) return;
    this.offset =
      (this.offset + Math.max(0, c.currentTime - this.startedAt)) %
      LOOP_SECONDS;
    this.tracks.forEach((track, i) => {
      const fade = c.createGain();
      track.disconnect();
      track.connect(fade);
      fade.connect(this.bus.stemGains[i]);
      fade.gain.setValueAtTime(1, c.currentTime);
      fade.gain.linearRampToValueAtTime(0, c.currentTime + 0.06);
      track.stop(c.currentTime + 0.07);
      track.onended = () => {
        track.disconnect();
        fade.disconnect();
      };
    });
    this.tracks = [];
  }
  /** Cross-fade the stems to one authored scene balance. */
  mix(scene: SoundScene) {
    this.rampStems(SCENE_GAINS[scene], 1.1);
  }
  /** Boot phases rebalance the same stems faster than a scene change does. */
  rampStems(gains: readonly number[], seconds: number) {
    const c = this.bus.context;
    if (!c) return;
    this.bus.stemGains.forEach((g, i) =>
      rampLevel(g.gain, gains[i], c.currentTime, seconds),
    );
  }
  get playing() {
    return this.tracks.length;
  }
  get loaded() {
    return !!this.buffers;
  }
}
