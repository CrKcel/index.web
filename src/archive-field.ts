// The archive surface height at one cell.
//
// Four authored motions sum here: the resting wave, the idle breathing, the
// selection ripple and the live score displacement. Keeping them in one pure
// function lets the scene own all of the animation state while the surface math
// stays reviewable and testable.
//
// The field is sampled several times per cell each frame -- height, slope and
// neighbours -- so callers go through ArchiveField, which caches one frame of
// samples and can drop them again when the camera advances (the score's pan
// depends on projected X, which the camera owns).
import {
  archiveWave,
  cinematicField,
  columnStrength,
  idleWave,
  rippleEnvelope,
  settlingWave,
} from "./motion";
import {
  rhythmDisplacement,
  type MusicBands,
  type RhythmFrame,
} from "./archive-play-motion";

export type FieldPulse = { row: number; lane: number; time: number };

export type FieldInputs = {
  /** The reference opening replaces every live motion with its own field. */
  cinematic: boolean;
  /** Reference shot time; only read while `cinematic` is set. */
  shot: number;
  /** Application time in seconds, shared by every animated term. */
  now: number;
  shoulder: number;
  laneFocus: number;
  /** Rebase offset that keeps the looping coordinates small. */
  origin: { row: number; lane: number };
  scanTime: number;
  scanBlend: number;
  idleGain: number;
  flatMix: number;
  pulses: readonly FieldPulse[];
  /** Authored selection ripple, so the caller can swap the envelope. */
  selectionPulse: (distance: number, age: number) => number;
  deferSelectionPulse: boolean;
  pulseGain: number;
  playfield: { bands: MusicBands; strength: number };
  /** Present only while the score may displace the surface. */
  rhythm: RhythmFrame | null;
  /** Height authored for a relay target, resolved by the caller. */
  relayLift: (row: number, lane: number) => number;
  /** Projected X of a cell in 0..1; the score pans itself across the array. */
  screenX: (row: number, lane: number) => number;
};

export function fieldHeight(input: FieldInputs, row: number, lane: number) {
  if (input.cinematic)
    return cinematicField(row, lane, input.shot, input.shoulder, input.laneFocus);
  const height =
    archiveWave(
      row + input.origin.row,
      lane + input.origin.lane,
      input.scanTime,
    ) *
    input.scanBlend;
  const breathing =
    idleWave(
      row + input.origin.row,
      lane + input.origin.lane,
      input.now,
    ) *
    input.idleGain;
  let pulseHeight = 0;
  if (!input.cinematic) {
    let ripple = 0;
    for (const p of input.pulses) {
      const distance = Math.hypot(row - p.row, (lane - p.lane) * 2.2);
      const age = input.now - p.time;
      ripple += input.selectionPulse(distance, age) * (input.deferSelectionPulse ? rippleEnvelope(distance, age) : 1);
    }
    pulseHeight = Math.max(-0.6, Math.min(0.6, ripple)) * input.pulseGain;
  }
  const distance = row - input.shoulder;
  return (
    (height +
    settlingWave(distance, 19.68) *
      columnStrength(lane, input.laneFocus)) * (1 - input.flatMix) + breathing + pulseHeight +
    (input.rhythm ? rhythmDisplacement(row, lane, input.now, input.playfield.bands, input.playfield.strength, input.rhythm, input.screenX(row, lane)) : 0) +
    input.relayLift(row, lane)
  );
}

export class ArchiveField {
  private cache = new Map<number, Map<number, number>>();
  /**
   * Drop the cached samples. Called when a frame starts and again whenever the
   * camera advances mid-frame, because the sampled projection depends on it.
   */
  clear() {
    this.cache.clear();
  }
  sample(input: FieldInputs, row: number, lane: number) {
    let values = this.cache.get(lane);
    if (!values) {
      values = new Map();
      this.cache.set(lane, values);
    }
    const previous = values.get(row);
    if (previous !== undefined) return previous;
    const value = fieldHeight(input, row, lane);
    values.set(row, value);
    return value;
  }
}
