// Camera framing and the cinematic choreography of the archive array.
//
// Every endpoint here was measured against a reference frame, so this module
// stays a pure function: it maps the current camera state plus one frame of
// inputs to the next camera state, and the scene only copies the result across.
// That keeps the authored numbers reviewable and lets an offline check hold the
// calibrated endpoints without a renderer.
import * as THREE from "three";
import { archiveFraming } from "./viewport-layout";
import { settlingWave, smooth } from "./motion";

/** Lens distance of the settled interactive framing. */
export const ARCHIVE_CAMERA_DISTANCE = 140;
/**
 * Direction of the settled interactive framing. `smooth` saturates before the
 * reference move ends, so the settle values are the authored endpoints.
 */
export function interactiveViewDirection() {
  const yaw = THREE.MathUtils.degToRad(89 - 22 - 8);
  const elevation = THREE.MathUtils.degToRad(3 + 40 - 8 - 16);
  return new THREE.Vector3(
    -Math.sin(yaw) * Math.cos(elevation),
    Math.sin(elevation),
    Math.cos(yaw) * Math.cos(elevation),
  ).normalize();
}

export type ArchiveCinematic = {
  reveal: number;
  lift: number;
  zoom: number;
  time: number;
};

export type ArchiveCameraInput = {
  /** Present while the reference opening drives the shot. */
  cinematic?: ArchiveCinematic;
  /** Current damped detail, already blended for this frame. */
  detail: number;
  width: number;
  height: number;
  /** `data-layout` of the stage; drives the opening and compact framings. */
  layout: string;
  /** Current camera state. The plan damps from it toward the authored targets. */
  position: THREE.Vector3;
  aim: THREE.Vector3;
  fov: number;
  /** Settled position of the selected file. */
  modelPosition: THREE.Vector3;
  pointer: { x: number; y: number };
  pointerParallax: boolean;
  uiOnlyParallax: boolean;
  /** Whether the active detail or selection transition is animated. */
  transition: boolean;
  themeAmount: number;
  dt: number;
};

export type ArchiveCameraPlan = {
  position: THREE.Vector3;
  aim: THREE.Vector3;
  fov: number;
  fogNear: number;
  fogFar: number;
  /** The reference opening letterboxes a responsive layout instead of cropping. */
  responsiveOpening: boolean;
  viewDirection: THREE.Vector3;
  distance: number;
  span: number;
};

export function planArchiveCamera(input: ArchiveCameraInput): ArchiveCameraPlan {
  const { cinematic, detail, width, height, layout } = input;
  const shot = cinematic?.time ?? 24.98;
  // Measured at 22.36 s: X edge (382,-204), adjacent row (78,38).
  // The label vertical edge constrains height; the file base is occluded.
  // Do not calibrate field of view from the visible fragment of a file.
  const orbit = smooth((shot - 18.48) / 1.6);
  const settle = smooth((shot - 20.13) / 2.25);
  const yaw = THREE.MathUtils.degToRad(89 - 22 * orbit - 8 * settle);
  const elevation = THREE.MathUtils.degToRad(
    3 + 40 * smooth((shot - 17.84) / 0.22) - 8 * orbit - 16 * settle,
  );
  const span = THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(10.8, 10.3, orbit),
    7.33,
    settle,
  );
  const responsiveOpening = Boolean(cinematic) && layout === "opening";
  const openingAspect = responsiveOpening ? width / height / (16 / 9) : 1;
  const openingSpan = (value: number) => value / Math.min(1, openingAspect);
  const distance = THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(28 + 7 * orbit, ARCHIVE_CAMERA_DISTANCE, settle),
    72,
    detail,
  );
  const arrayAim = new THREE.Vector3(
    -1.091,
    THREE.MathUtils.lerp(-2.55 + 0.4 * orbit, -0.045, settle),
    THREE.MathUtils.lerp(2.48, 0.481, settle),
  );
  const aimTarget = arrayAim.clone();
  const viewDirection = new THREE.Vector3(
    -Math.sin(yaw) * Math.cos(elevation),
    Math.sin(elevation),
    Math.cos(yaw) * Math.cos(elevation),
  );
  if (cinematic) {
    const earlyTurn = smooth((shot - 23.18) / 1.3);
    const finalTurn = smooth((shot - 24.48) / 5.4);
    const shotYaw =
      yaw - THREE.MathUtils.degToRad(9 * earlyTurn + 32 * finalTurn);
    const shotElevation =
      elevation - THREE.MathUtils.degToRad(1.5 * earlyTurn + 3.7 * finalTurn);
    viewDirection.set(
      -Math.sin(shotYaw) * Math.cos(shotElevation),
      Math.sin(shotElevation),
      Math.cos(shotYaw) * Math.cos(shotElevation),
    );
  } else {
    viewDirection
      .lerp(new THREE.Vector3(-0.277, 0.238, 0.931), detail)
      .normalize();
  }
  if (cinematic) {
    const pan = smooth((shot - 21.28) / 0.95);
    const right = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), viewDirection)
      .normalize();
    aimTarget.addScaledVector(
      right,
      -2.05 * (1 - pan) * smooth((shot - 24.2) / 0.8),
    );
  }
  if (cinematic && shot >= 20.93 && shot <= 23.18) {
    // 21.28–22.28 s: the camera carries the same physical column from the
    // right into the selected position while the neighboring crests subside.
    const pan = smooth((shot - 21.28) / 1.05);
    const right = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), viewDirection)
      .normalize();
    const up = new THREE.Vector3()
      .crossVectors(viewDirection, right)
      .normalize();
    const pixelScale = 1080 / openingSpan(span);
    const anchorAim = input.modelPosition
      .clone()
      .add(new THREE.Vector3(-2.5, 3.7, 0));
    anchorAim.addScaledVector(
      right,
      -(THREE.MathUtils.lerp(840, 518, pan) - 960) * openingAspect / pixelScale,
    );
    anchorAim.addScaledVector(
      up,
      -(540 - THREE.MathUtils.lerp(340, 288, pan)) / pixelScale,
    );
    aimTarget.lerp(anchorAim, smooth((shot - 20.93) / 0.35));
  }
  if (cinematic && shot > 23.18) {
    const close = smooth((shot - 23.18) / 6.7);
    const extractionCamera = smooth((shot - 23.18) / 1.25);
    const screenX = THREE.MathUtils.lerp(
      518 - 98 * extractionCamera,
      618,
      close,
    );
    const screenY = THREE.MathUtils.lerp(
      296 + 34 * extractionCamera,
      287,
      close,
    );
    const pixelScale = 1080 / openingSpan(THREE.MathUtils.lerp(span, 5.9, detail));
    const right = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), viewDirection)
      .normalize();
    const up = new THREE.Vector3()
      .crossVectors(viewDirection, right)
      .normalize();
    const anchorAim = input.modelPosition
      .clone()
      .add(new THREE.Vector3(-2.5, 3.7, 0));
    anchorAim.addScaledVector(right, -(screenX - 960) * openingAspect / pixelScale);
    anchorAim.addScaledVector(up, -(540 - screenY) / pixelScale);
    aimTarget.lerp(anchorAim, smooth((shot - 23.18) / 0.5));
  }
  const framing = archiveFraming(width, height, span, detail, layout === "compact");
  if (!cinematic) {
    const right = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), viewDirection)
      .normalize();
    const up = new THREE.Vector3()
      .crossVectors(viewDirection, right)
      .normalize();
    const pixelScale = height / framing.span;
    if (framing.portrait) {
      // Keep the preview camera independent of the live lift, wave and rail.
      // Following model.position here would visually cancel those motions.
      const previewAim = new THREE.Vector3(0, -4.6 + settlingWave(0, 22.44) + 0.4 + 1.85, -2.17);
      previewAim.addScaledVector(up, (framing.previewY - 0.5) * height / pixelScale);
      aimTarget.copy(previewAim);
    }
    const detailAim = input.modelPosition
      .clone()
      .add(new THREE.Vector3(0, 1.85, 0));
    detailAim.addScaledVector(right, (0.5 - framing.detailX) * width / pixelScale);
    detailAim.addScaledVector(up, (framing.detailY - 0.5) * height / pixelScale);
    aimTarget.lerp(detailAim, detail);
  }
  const positionTarget = aimTarget
    .clone()
    .addScaledVector(viewDirection, distance);
  if (!cinematic && input.pointerParallax && !input.uiOnlyParallax) {
    positionTarget.x += input.pointer.x * 0.12;
    positionTarget.y -= input.pointer.y * 0.12;
  }
  const blend = cinematic ? 1 : input.transition ? 1 - Math.exp(-input.dt * 5) : 1;
  const position = input.position.clone().lerp(positionTarget, blend);
  const aim = input.aim.clone().lerp(aimTarget, blend);
  const fov = THREE.MathUtils.lerp(
    input.fov,
    THREE.MathUtils.radToDeg(
      2 * Math.atan((cinematic ? openingSpan(THREE.MathUtils.lerp(span, 5.9, detail)) : framing.span) / (2 * distance)),
    ),
    blend,
  );
  // The camera position is damped after its target distance changes. Anchor
  // fog to the rendered camera, or entry puts the array behind the far plane
  // until the camera catches up (a brief white wash that exit never showed).
  const renderedDistance = position.distanceTo(aim);
  const fogTheme = input.themeAmount;
  return {
    position,
    aim,
    fov,
    fogNear: renderedDistance + THREE.MathUtils.lerp(5 - 4 * fogTheme, -1, detail),
    fogFar: renderedDistance + THREE.MathUtils.lerp(25 - 9 * fogTheme, 12, detail),
    responsiveOpening,
    viewDirection,
    distance,
    span,
  };
}
