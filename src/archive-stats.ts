// Derived readings for the review surface (`window.rhine.stats()`).
//
// The stats object itself stays in the scene, where the state is: it is the
// contract the browser regressions read, so every key and value shape is
// deliberate. The projections and per-copy lookups that the dump needs are pure
// and live here, where they can be checked without a renderer.
import * as THREE from "three";
import type { ArchiveCell } from "./archive-loop";

/** Rounded reading, so two builds compare equal despite float noise. */
export const rounded = (value: number, digits = 4) =>
  Math.round(value * 10 ** digits) / 10 ** digits;

/** Rounded copy of a vector, for stable review comparisons. */
export const roundedVector = (value: THREE.Vector3, digits = 4) =>
  value.toArray().map((component) => rounded(component, digits));

/** Project a model-space point into container pixels. */
export function projectPoint(
  model: THREE.Object3D,
  camera: THREE.Camera,
  width: number,
  height: number,
  x: number,
  y: number,
  z: number,
): [number, number] {
  const point = model.localToWorld(new THREE.Vector3(x, y, z)).project(camera);
  return [
    Math.round((point.x + 1) * width / 2),
    Math.round((1 - point.y) * height / 2),
  ];
}

/** Lane and row bounds of the candidate pool. */
export function poolBounds(cells: readonly ArchiveCell[]) {
  return {
    minLane: Math.min(...cells.map((cell) => cell.lane)),
    maxLane: Math.max(...cells.map((cell) => cell.lane)),
    minRow: Math.min(...cells.map((cell) => cell.row)),
    maxRow: Math.max(...cells.map((cell) => cell.row)),
  };
}

/** Which stage of the selection animation the array is showing. */
export const selectionPhase = (
  pending: ArchiveCell | null,
  pulses: readonly unknown[],
) => (pending ? "lifting" : pulses.length ? "wave" : "settled");

/** Dim applied to one file's index inlay, read back from its material hooks. */
export const indexDimOf = (group: THREE.Object3D) =>
  group.children.find((child) => child.userData.surface === "Index_Inlay")
    ?.userData.subduedIndex?.value;

/** Glass clarity of one file, read back from its material hooks. */
export const glassClarityOf = (group: THREE.Object3D) =>
  group.children.find((child) => child.userData.surface === "Frosted_Polymer")
    ?.userData.glassClarity?.value;
