// Audio has no rendering surface a screenshot check can pin, so this check
// drives the synth, the facade and the music transport against a recording
// AudioContext and asserts on what was handed to the audio clock: sources
// started, ramps scheduled, and the order in which the facade gates them.
import assert from "node:assert/strict";
import { BOOT_CUES, SOUND_TYPES, rampLevel } from "../src/audio-types.ts";
import { synthesizeSound } from "../src/audio-synth.ts";
import { MusicEngine, createStemGains } from "../src/audio-music.ts";
import { TerminalAudio } from "../src/audio.ts";

// ---- Recording AudioContext ------------------------------------------------
// Values arrive through the same calls the browser receives, so the check can
// assert on the scheduled timeline instead of on internal state.
function createAudio() {
  const sources = [];
  const stops = [];
  const pans = [];
  const connections = [];
  const instances = [];
  const param = (value = 0) => {
    const p = { _v: value, events: [] };
    Object.defineProperty(p, "value", {
      get: () => p._v,
      set: (v) => {
        p._v = v;
        p.events.push(["value", v]);
      },
    });
    p.setValueAtTime = (v, t) => p.events.push(["set", v, t]);
    p.linearRampToValueAtTime = (v, t) => p.events.push(["linear", v, t]);
    p.exponentialRampToValueAtTime = (v, t) => p.events.push(["exp", v, t]);
    p.cancelScheduledValues = (t) => p.events.push(["cancel", t]);
    p.cancelAndHoldAtTime = (t) => p.events.push(["hold", t]);
    return p;
  };
  const wire = (node) => {
    node.connect = (target) => connections.push([node, target]);
    node.disconnect = () => {};
    return node;
  };
  class RecordingAudioContext {
    sampleRate = 48000;
    currentTime = 0;
    state = "running";
    destination = wire({});
    constructor() {
      instances.push(this);
    }
    createGain() {
      return wire({ gain: param() });
    }
    createStereoPanner() {
      const node = wire({ pan: param() });
      pans.push(node.pan);
      return node;
    }
    createOscillator() {
      const node = wire({
        frequency: param(440),
        detune: param(0),
        type: "sine",
        onended: null,
      });
      node.start = (t) => sources.push({ kind: "osc", start: t, node });
      node.stop = (t) => stops.push(t);
      return node;
    }
    createBufferSource() {
      const node = wire({
        buffer: null,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        onended: null,
      });
      node.start = (t, offset) => sources.push({ kind: "buffer", start: t, offset, node });
      node.stop = (t) => stops.push(t);
      return node;
    }
    createBiquadFilter() {
      return wire({ frequency: param(350), Q: param(1), type: "lowpass" });
    }
    createDynamicsCompressor() {
      return wire({
        threshold: param(),
        knee: param(),
        ratio: param(),
        attack: param(),
        release: param(),
      });
    }
    createBuffer(_channels, length, rate) {
      return { duration: length / rate, getChannelData: () => new Float32Array(length) };
    }
    decodeAudioData() {
      return Promise.resolve({ duration: 60 });
    }
    resume() {
      this.state = "running";
      return Promise.resolve();
    }
    suspend() {
      this.state = "suspended";
      return Promise.resolve();
    }
    close() {
      this.state = "closed";
      return Promise.resolve();
    }
  }
  return { AudioContext: RecordingAudioContext, instances, sources, stops, pans, connections };
}

const contextOf = (audio) => audio.instances[0] ?? new audio.AudioContext();
const silence = () => ({ connect() {}, disconnect() {} });

function installDom() {
  const listeners = new Map();
  const dispatched = [];
  globalThis.document = {
    hidden: false,
    addEventListener: (type, fn) => listeners.set(`document:${type}`, fn),
    removeEventListener: (type) => listeners.delete(`document:${type}`),
  };
  globalThis.window = {
    addEventListener: (type, fn) => listeners.set(`window:${type}`, fn),
    removeEventListener: (type) => listeners.delete(`window:${type}`),
    dispatchEvent: (event) => {
      dispatched.push(event.type);
      return true;
    },
  };
  return { listeners, dispatched };
}

// ---- Effect recipes --------------------------------------------------------
for (const sound of SOUND_TYPES) {
  const audio = createAudio();
  const voice = synthesizeSound(contextOf(audio), silence(), sound, 1.25, 0.3);
  assert.ok(audio.sources.length > 0, `${sound} schedules at least one source`);
  for (const source of audio.sources)
    assert.ok(source.start >= 1.25, `${sound} never starts a source before its cue time`);
  assert.ok(voice.end > 1.25, `${sound} reports a tail after its cue time`);
  const scheduled = audio.sources.length;
  assert.equal(audio.stops.length, scheduled, `${sound} gives every source an authored end`);
  voice.stop(4.5);
  assert.equal(
    audio.stops.length - scheduled,
    scheduled,
    `${sound} silences every source it started`,
  );
  assert.ok(
    audio.stops.slice(scheduled).every((time) => Math.abs(time - 4.52) < 1e-9),
    `${sound} silences its sources at the requested time`,
  );
}
{
  const audio = createAudio();
  const voice = synthesizeSound(contextOf(audio), silence(), "tick", 1, 5);
  assert.equal(audio.pans[0].value, 0.65, "Stereo pans clamp to the authored field");
  voice.stop(2);
  const hard = createAudio();
  synthesizeSound(contextOf(hard), silence(), "tick", 1, -5);
  assert.equal(hard.pans[0].value, -0.65, "The negative pan limit is symmetric");
}

// ---- Level ramps, including the Firefox fallback ---------------------------
{
  const audio = createAudio();
  const gain = contextOf(audio).createGain().gain;
  rampLevel(gain, 0.8, 5, 0.2);
  assert.deepEqual(gain.events[0], ["hold", 5], "Chrome holds the current value before ramping");
  assert.deepEqual(gain.events.at(-1), ["linear", 0.8, 5.2], "The ramp lands on the requested time");
}
{
  const audio = createAudio();
  const gain = contextOf(audio).createGain().gain;
  gain.cancelAndHoldAtTime = undefined;
  gain.value = 0.3;
  rampLevel(gain, 0.8, 5, 0.2);
  assert.deepEqual(
    gain.events.at(-2),
    ["set", 0.3, 5],
    "Without cancelAndHoldAtTime the held value is written explicitly",
  );
  assert.deepEqual(gain.events.at(-1), ["linear", 0.8, 5.2]);
}

// ---- Opening cue table -----------------------------------------------------
let previousCue = -Infinity;
const authored = new Set(SOUND_TYPES);
for (const cue of BOOT_CUES) {
  assert.ok(authored.has(cue.sound), `Boot cue ${cue.sound} names an authored sound`);
  assert.ok(cue.time > previousCue, "Boot cues stay in ascending time order");
  assert.ok(cue.time > 0 && cue.time < 35, "Boot cues stay inside the opening timeline");
  previousCue = cue.time;
}

// ---- Facade lifecycle ------------------------------------------------------
const dom = installDom();
const audio = createAudio();
globalThis.AudioContext = audio.AudioContext;
const terminal = new TerminalAudio();
terminal.configure({ sound: true, music: false, soundVolume: 0.6, musicVolume: 0.4 });
dom.listeners.get("document:pointerdown")(); // the authored gesture wiring, not a private call
assert.equal(await terminal.unlock(), true, "A gesture unlocks a running device");
const context = audio.instances[0];
assert.equal(context.state, "running");
const voices = () => terminal.stats().voices;
terminal.play("tick");
assert.equal(voices(), 1, "One tick schedules one voice");
terminal.play("tick");
assert.equal(voices(), 1, "A repeat inside the throttle interval stays silent");
context.currentTime += 1;
terminal.play("tick");
assert.equal(voices(), 1, "A finished voice is pruned before the new one is kept");
assert.ok(dom.dispatched.length > 0, "A local-sound window event announces the effect");
terminal.play("column", 0.25);
assert.equal(voices(), 2, "A different sound is not throttled by the previous one");
terminal.updateBoot(4); // first sample only seeds the previous boot time
assert.equal(voices(), 0, "The first boot sample stops the pending effects");
const scheduled = audio.sources.length;
terminal.updateBoot(4.28); // crosses the 9.16s brand cue
assert.equal(voices(), 1, "Boot crosses its first authored cue");
assert.ok(audio.sources.length > scheduled, "The crossed cue schedules its sources");
terminal.updateBoot(4.28, true); // a frozen review frame stops instead of replaying
assert.equal(voices(), 0, "A frozen boot time clears the effect voices");
assert.equal(terminal.stats().loaded, false, "No stems were fetched in this check");
assert.deepEqual(terminal.stats().preferences, {
  sound: true,
  music: false,
  soundVolume: 0.6,
  musicVolume: 0.4,
});
terminal.configure({ sound: true, music: false, soundVolume: 5, musicVolume: -1 });
assert.deepEqual(
  terminal.stats().preferences,
  { sound: true, music: false, soundVolume: 1, musicVolume: 0 },
  "Preferences clamp to the audible range",
);
terminal.configure({ sound: false, music: false, soundVolume: 0.6, musicVolume: 0.4 });
assert.equal(context.state, "suspended", "Silencing both buses parks the device");
const silenced = audio.sources.length;
terminal.play("tick");
assert.equal(audio.sources.length, silenced, "A parked device schedules nothing");
terminal.configure({ sound: true, music: false, soundVolume: 0.6, musicVolume: 0.4 });
terminal.setHostPaused(true);
assert.equal(context.state, "suspended", "A paused host parks the device");
terminal.setHostPaused(false);
assert.equal(await terminal.unlock(), true, "The host resumes the device");
assert.equal(context.state, "running");
terminal.dispose();
assert.equal(context.state, "closed", "Dispose closes the device");
assert.equal(dom.listeners.size, 0, "Dispose detaches every document and window listener");

// ---- Music transport -------------------------------------------------------
{
  const music = createAudio();
  const context = contextOf(music);
  const musicBus = context.createGain();
  const stems = createStemGains(context, musicBus);
  assert.equal(stems.length, 3, "One gain per authored stem");
  for (const stem of stems)
    assert.ok(
      music.connections.some(([, target]) => target === musicBus),
      "Every stem feeds the music bus",
    );
  const engine = new MusicEngine({ context, musicBus, stemGains: stems });
  engine.adopt([{ duration: 90 }, { duration: 90 }, { duration: 90 }]);
  assert.equal(engine.loaded, true);
  engine.start(0.45, true); // a scene that may not play music stays silent
  assert.equal(engine.playing, 0);
  engine.start(0.45, false);
  const started = music.sources.filter((source) => source.kind === "buffer");
  assert.equal(engine.playing, 3, "The score loops one source per stem");
  assert.equal(started.length, 3);
  assert.ok(
    started.every((source) => source.node.loop),
    "Stems loop",
  );
  assert.ok(
    started.every((source) => Math.abs(source.node.loopEnd - 160 / 3) < 1e-9),
    "The loop length is the authored 160/3 seconds",
  );
  assert.ok(
    musicBus.gain.events.some((event) => event[0] === "linear" && Math.abs(event[1] - 0.45) < 1e-9),
    "The music bus fades in to the configured volume",
  );
  context.currentTime = 7.5;
  engine.stop();
  assert.equal(engine.playing, 0, "Stopping clears the track list");
  context.currentTime = 8.5;
  engine.start(0.45, false);
  const resumed = music.sources.filter((source) => source.kind === "buffer").at(-1);
  assert.ok(
    Math.abs(resumed.offset - (7.5 - 0.04)) < 1e-9,
    "The loop resumes from the elapsed wall-clock offset",
  );
  assert.ok(
    Math.abs(resumed.start - (8.5 + 0.04)) < 1e-12,
    "The restarted loop begins just ahead of the clock",
  );
  engine.mix("archive");
  [0.9, 0.72, 0.65].forEach((target, i) =>
    assert.ok(
      stems[i].gain.events.some((event) => event[0] === "linear" && Math.abs(event[1] - target) < 1e-9),
      `The archive balance ramps stem ${i} to ${target}`,
    ),
  );
  engine.mix("boot");
  assert.ok(
    stems[0].gain.events.some((event) => event[0] === "linear" && Math.abs(event[1] - 0.48) < 1e-9),
    "The boot balance is lower in the atmosphere stem",
  );
}

console.log(
  `${SOUND_TYPES.length} effect recipes, the opening cue table (first: ${BOOT_CUES[0].sound}), facade gating and the stem transport passed.`,
);
