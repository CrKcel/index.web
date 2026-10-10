import * as THREE from "three";
import { ArchiveVisibility } from "./archive-visibility";
import { disposeThreeTree } from "./three-resources";
import { ThemeWave } from "./theme-motion";
import { themeEnvironment } from "./theme-material";
import { RhythmMotion, quietBands, type MusicBands, type RhythmStyle } from "./archive-play-motion";
import { createArchiveLighting, type LightingLook } from "./archive-lighting";
import { normalizeQuality, type RenderQuality } from "./render-quality";
import { CardAppearance } from "./appearance";
import { DecryptionController } from "./decryption";
import { fileAtSlot, fileLocation } from "./data";
import {
  cellKey,
  sameCell,
  selectionCell,
  fileAtCell,
  poolCell,
  LOOP_COLUMNS,
  LOOP_ROWS,
  COLUMN_SPACING,
  ROW_SPACING,
  type ArchiveCell,
  type ArchiveNavigation,
} from "./archive-loop";
import { archiveFraming } from "./viewport-layout";
import { type DragAxis, type DragProjection } from "./archive-drag";
import { assetUrl as publicAsset } from "./asset-url";
import { fullMotion, reducedMotion, type MotionPreferences } from "./motion-preferences";
import {
  extraction,
  baselineSelectionWave,
  settlingWave,
  damp,
  smooth,
  INSPECTION_LIFT,
  returnStep,
  type Spring,
} from "./motion";
import { planArchiveCamera } from "./archive-camera";
import { ArchiveField, type FieldInputs } from "./archive-field";
import { ArchivePointer, type ArchivePointerHost } from "./archive-pointer";
import { ArchiveRenderGraph } from "./archive-render";
import { ArchiveCassette } from "./archive-cassette";
import {
  glassClarityOf,
  indexDimOf,
  poolBounds,
  projectPoint,
  rounded,
  roundedVector,
  selectionPhase,
} from "./archive-stats";

/**
 * Upper bound on how fast the archive plane may travel, in world units per
 * second. Keyboard steps and pointer drags share this bound so neither input
 * can move the array faster than the authored browsing pace.
 */
const MAX_PLANE_SPEED = 4.5;
export class ArchiveScene {
  private presence = 1;
  private presenceTarget = 1;
  setPresentationVisible(visible: boolean, immediate = false) {
    this.presenceTarget = Number(visible);
    if (immediate) this.presence = this.presenceTarget;
    if (!visible) this.pointerControl.cancel();
  }
  get presentationHidden() { return this.presenceTarget === 0 && this.presence === 0; }
  private presentationDrop(cell: ArchiveCell) {
    const delay = .15 * (1 + Math.tanh((cell.row - this.selectedCell.row) * .1 + (cell.lane - this.selectedCell.lane) * .25));
    return 35 * Math.pow(THREE.MathUtils.clamp((1 - this.presence - delay) / .7, 0, 1), 2);
  }
  revealImmediately() { this.reveal = this.targetReveal; }
  dispose() {
    this.pointerControl.dispose();
    this.cassette.releaseTargets();
    disposeThreeTree(this.scene);
    this.appearance.disposeSources();
    this.cassette.dispose();
    this.outgoing = [];
    this.light.shadow.map?.dispose();
    this.render.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.loaded = false;
  }
  uiOnlyParallax = false;
  private theme = new ThemeWave();
  private selectedIndexOnly = false;
  /**
   * Interactive browsing draws the baked proxy; only the reference opening
   * turns its camera, so only that segment draws the modelled surfaces.
   */
  setSelectedIndexAccent(onlySelected: boolean) { this.selectedIndexOnly = onlySelected; }
  get themeAmount() { return this.theme.background(performance.now() / 1000); }
  setTheme(dark: boolean, immediate = false) { this.theme.set(dark, performance.now() / 1000, this.selectedCell, immediate); }
  private playfield = { enabled: false, bands: quietBands(), strength: 1, flatten: 0, target: null as string | null, breathing: true };
  private flatMix = 0;
  private rhythm = new RhythmMotion();
  private archiveField = new ArchiveField();
  private rhythmStyle: RhythmStyle = "legacy";
  setRhythmStyle(style: RhythmStyle) { this.rhythmStyle = style; }
  private relayLifts = new Map<string, number>();
  private relayActive = false;
  onRelayPick?: (key: string | null) => void;
  setPlayfield(enabled: boolean, bands: MusicBands, strength: number, flatten: number, target: string | null, breathing = true) {
    this.playfield = { enabled, bands, strength, flatten, target, breathing };
  }
  setRelayActive(active: boolean) {
    if (active === this.relayActive) return;
    this.pointerControl.cancel(); this.setHover(null); this.relayActive = active;
    this.pointer.set(0, 0);
  }
  relayPulse(key: string) {
    const cell = this.cassette.relayPoints.get(key)?.cell;
    if (cell && !this.reduced) this.emitPulse(cell);
  }
  projectRelay(key: string) {
    const item = this.cassette.relayPoints.get(key);
    if (!item) return null;
    const point = item.point.clone().project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
  }
  relayCandidates() {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.scene.updateMatrixWorld(true);
    return [...this.cassette.relayPoints.keys()].filter(key => {
      const p = this.projectRelay(key)!;
      const x = (p.x - rect.left) / rect.width, y = (p.y - rect.top) / rect.height;
      if (x < .18 || x > .82 || y < .32 || y > .76) return false;
      const hit = this.pickCell(p.x, p.y);
      return hit && cellKey(hit) === key;
    });
  }
  readonly renderer: THREE.WebGLRenderer;
  private render: ArchiveRenderGraph;
  readonly scene = new THREE.Scene();
  // The reference uses a long lens 72–140 units from the cassette. A 0.1 near
  // plane quantizes adjacent optical layers to the same depth (visible shimmer).
  // All visible foreground geometry is beyond 5; retain the framing and lens.
  readonly camera = new THREE.PerspectiveCamera(34, 16 / 9, 5, 300);
  // Interactive browsing draws one baked projection per card; the cinematic
  // keeps the modelled surfaces. Both share one transform and theme buffer.
  private visibility = new ArchiveVisibility();
  private extraCoverage = false;
  setArchiveCoverage(extra: boolean) { this.extraCoverage = extra; }
  private model = new THREE.Group();
  private appearance = new CardAppearance();
  private decryption = new DecryptionController();
  private cursor = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private cells: ArchiveCell[] = [];
  private selectedCell: ArchiveCell = { lane: 2, row: 12 };
  private looping = false;
  private coordinateOrigin: ArchiveCell = { lane: 0, row: 0 };
  private lift = { value: 0, velocity: 0 };
  private rail = { value: 0, velocity: 0 };
  private shoulder = { value: 12, velocity: 0 };
  private laneFocus = { value: 2, velocity: 0 };
  private columnCamera = { value: 0, velocity: 0 };
  private returnY: number | null = null;
  private canInspect = false;
  private clearance = 0;
  private pulseGain = 1;
  private idleGain = 0;
  private scanTime = 29.1;
  private scanBlend = 0;
  private cameraAim = new THREE.Vector3();
  private outgoing: {
    group: THREE.Group;
    slot: number;
    cell: ArchiveCell;
    lift: { value: number; velocity: number };
    returnY: number | null;
    clarity: number;
  }[] = [];
  private pulses: { row: number; lane: number; time: number }[] = [];
  private pendingPulse: ArchiveCell | null = null;
  private selectedSlot = 76;
  private detail = 0;
  private targetDetail = 0;
  private reveal = 0;
  private targetReveal = 0;
  private last = 0;
  private pointer = new THREE.Vector2();
  private hoverCell: ArchiveCell | null = null;
  private hoverLifts = new Map<string, number>();
  private cassette: ArchiveCassette;
  private pointerControl: ArchivePointer;
  private readonly pointerHost: ArchivePointerHost = {
    canBrowse: () => this.canBrowse(),
    canInspect: () => this.canInspect,
    pickCell: (x, y) => this.pickCell(x, y),
    selectedCell: () => this.selectedCell,
    tracks: () => ({ lane: this.columnCamera.value, row: this.rail.value }),
    coordinates: () => ({
      lane: this.trackCoordinate("lane", this.columnCamera.value),
      row: this.trackCoordinate("row", this.rail.value),
    }),
    projection: () => this.dragProjection(),
    now: () => this.clock,
    hover: (cell) => this.setHover(cell),
    pointed: (x, y) => this.pointer.set(x, y),
    emitSelect: (cell) => this.onSelect?.(fileAtCell(cell), cell),
    navigate: (axis, direction) => this.onNavigate?.(axis, direction),
    relayPick: (key) => this.onRelayPick?.(key),
    rotate: (delta) => {
      this.targetRotation = THREE.MathUtils.clamp(this.targetRotation + delta, -0.8, 0.8);
    },
    clearVelocity: () => this.clearVelocity(),
    momentumEnabled: () => this.motion.dragMomentum,
    relayActive: () => this.relayActive,
  };
  private clearVelocity() {
    this.columnCamera.velocity = 0;
    this.rail.velocity = 0;
  }
  private rotation = 0;
  private targetRotation = 0;
  private light: THREE.DirectionalLight;
  private clock = 0;
  private loaded = false;
  private motion: MotionPreferences = fullMotion();
  private quality = normalizeQuality(undefined);
  private displayHeight = 0;
  private layoutKind = "";
  onSelect?: (index: number, cell?: ArchiveCell) => void;
  onHover?: (index: number | null) => void;
  onNavigate?: (axis: "row" | "lane", direction: number) => void;
  constructor(
    private container: HTMLElement,
    private readonly selectionPulse = baselineSelectionWave,
    private readonly deferSelectionPulse = false,
    private readonly lightingLook: LightingLook = "baseline",
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, 1.5) *
        Math.min(innerWidth / 1920, innerHeight / 1080),
    );
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true;
    // All composer passes see the same geometry within one application frame.
    // Generate the shadow map in the beauty pass and reuse it in depth/normal passes.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "三维研究档案阵列，点击选择，左右拖动切列，上下拖动或滚轮切换列内档案",
    );
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color("#eae5e1");
    // The frame updates world matrices once after simulation; subsequent
    // beauty, normal, depth and transmission renders reuse those same matrices.
    this.scene.matrixWorldAutoUpdate = false;
    this.scene.fog = new THREE.Fog("#eae5e1", 22, 47);
    this.light = createArchiveLighting(this.renderer, this.scene, lightingLook);
    this.light.castShadow = true;
    Object.assign(this.light.shadow.camera, {
      left: -16,
      right: 16,
      top: 15,
      bottom: -15,
      near: 0.1,
      far: 45,
    });
    this.light.shadow.mapSize.set(2048, 2048);
    this.light.shadow.normalBias = lightingLook === "refined" ? 0.018 : 0.035;
    this.light.shadow.bias = lightingLook === "refined" ? -0.00012 : -0.0003;
    this.light.shadow.radius = 4;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: "#d8c9b9", roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.name = "archive-floor";
    floor.position.y = -4.63;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.cassette = new ArchiveCassette({
      renderer: this.renderer,
      scene: this.scene,
      appearance: this.appearance,
      floor,
      look: lightingLook,
    });
    this.camera.position.set(-62.26, 35.98, 43.28);
    this.cameraAim.set(-0.5, 1.1, 0.4);
    this.camera.fov = 6.15;
    this.camera.lookAt(this.cameraAim);
    this.render = new ArchiveRenderGraph({
      container,
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      light: this.light,
      look: lightingLook,
    });
    this.pointerControl = new ArchivePointer(this.renderer.domElement, this.pointerHost);
  }
  async load(assetUrl = publicAsset("assets/archive-cassette.glb")) {
    const count = LOOP_COLUMNS * LOOP_ROWS;
    for (let index = 0; index < count; index++) {
      const cell = poolCell(index);
      this.cells.push(cell);
    }
    await this.cassette.load(assetUrl, this.quality, this.themeAmount);
    this.cassette.group.position.copy(this.cellPosition(poolCell(this.selectedSlot)));
    this.loaded = true;
  }
  /**
   * Interactive cards are a card-shaped proxy carrying one baked projection.
   * The card is rendered once per theme endpoint from the settled camera
   * direction, so every instance shares the result and no array card entangles
   * a frame in the extra transmission, depth and normal passes the five
   * modelled surfaces produced. The reference opening orbits its camera, so the
   * cinematic keeps the modelled surfaces.
   */
  private assemblyTemplate?: Promise<THREE.Group>;
  createAssemblyModel() {
    return this.cassette.createAssembly(this.themeAmount, this.modelClarity());
  }
  setMode(mode: "hidden" | "archive" | "detail") {
    this.pointerControl.cancel();
    this.setHover(null);
    if (mode === "detail") this.decryption.enter(this.scanBlend > .9 && this.decryption.clarity > .999);
    else this.decryption.leave();
    if (mode === "hidden") this.decryption.select();
    if (mode !== "archive") this.pendingPulse = null;
    this.looping = mode !== "hidden";
    if (!this.looping) {
      const canonical = fileLocation(fileAtSlot(this.selectedSlot));
      this.selectedCell = { lane: canonical.lane, row: canonical.row };
      this.coordinateOrigin = { lane: 0, row: 0 };
      for (const old of this.outgoing) {
        this.scene.remove(old.group);
        this.appearance.dispose(old.group);
      }
      this.outgoing = [];
    }
    this.pointerControl.touch();
    this.targetReveal = mode === "hidden" ? 0 : 1;
    this.targetDetail = mode === "detail" ? 1 : 0;
    if (mode !== "detail") {
      this.targetRotation = 0;
      if (this.rotation !== 0) this.returnY = this.cassette.group.position.y;
    } else this.returnY = null;
  }
  // Legacy review pages use the old whole-scene toggle.
  setReduced(value: boolean) { this.setMotion(value ? reducedMotion() : fullMotion()); }
  setMotion(value: MotionPreferences) {
    if ((!value.pointerParallax || !value.dragMomentum) && (this.motion.pointerParallax || this.motion.dragMomentum)) this.pointerControl.cancel();
    if (!value.dragMomentum) {
      this.pointerControl.stopMomentum();
      this.clearVelocity();
    }
    if (!value.pointerParallax) this.pointer.set(0, 0);
    if (!value.selectionWave) this.pulses = [];
    if (!value.idleWave) this.idleGain = 0;
    this.motion = { ...value };
    if (!value.modelDecryption) {
      this.appearance.setClarity(this.cassette.group, this.modelClarity());
      for (const old of this.outgoing) {
        old.clarity = 0;
        this.appearance.setClarity(old.group, 0);
      }
    }
  }
  private get reduced() { return Object.values(this.motion).every(value => !value); }
  private modelClarity() {
    // Disabling the reveal animation preserves the material state of each mode.
    return this.motion.modelDecryption ? this.decryption.clarity : this.targetDetail;
  }
  setQuality(value: RenderQuality | boolean) {
    const quality =
      typeof value === "boolean"
        ? normalizeQuality(undefined, value)
        : normalizeQuality(value);
    this.quality = quality;
    if (this.render.applyQuality(quality)) this.resize();
  }
  private cellPosition(cell: ArchiveCell) {
    return new THREE.Vector3(
      (cell.lane - 2) * COLUMN_SPACING,
      -4.6,
      (cell.row - 15.5) * ROW_SPACING,
    );
  }
  private rebaseCoordinates() {
    // Periodically reduce the logical coordinates while preserving every
    // relative position, spring velocity, ripple and idle phase.
    const shift = {
      lane:
        Math.abs(this.selectedCell.lane) > 2048
          ? Math.round((this.selectedCell.lane - 2) / 5) * 5
          : 0,
      row:
        Math.abs(this.selectedCell.row) > 2048
          ? Math.floor((this.selectedCell.row - 12) / 8) * 8
          : 0,
    };
    if (!shift.lane && !shift.row) return;
    this.setHover(null);
    this.hoverLifts.clear();
    this.selectedCell.lane -= shift.lane;
    this.selectedCell.row -= shift.row;
    this.coordinateOrigin.lane += shift.lane;
    this.coordinateOrigin.row += shift.row;
    this.laneFocus.value -= shift.lane;
    this.shoulder.value -= shift.row;
    this.columnCamera.value -= shift.lane * COLUMN_SPACING;
    this.rail.value += shift.row * ROW_SPACING;
    for (const old of this.outgoing) {
      old.cell.lane -= shift.lane;
      old.cell.row -= shift.row;
    }
    for (const pulse of this.pulses) {
      pulse.lane -= shift.lane;
      pulse.row -= shift.row;
    }
    if (this.pendingPulse) {
      this.pendingPulse.lane -= shift.lane;
      this.pendingPulse.row -= shift.row;
    }
  }
  select(index: number, navigation?: ArchiveNavigation) {
    if (!this.pointerControl.navigatingDrag) this.pointerControl.cancel();
    this.setHover(null);
    this.pointerControl.touch();
    const next = fileLocation(index).slot;
    const canonical = fileLocation(index);
    const cell = this.looping
      ? selectionCell(index, this.selectedCell, navigation)
      : { lane: canonical.lane, row: canonical.row };
    const changed = !sameCell(cell, this.selectedCell);
    if (this.looping && changed && this.loaded && this.lift.value > 0.0001) {
      const group = this.cassette.group.clone(true);
      const label = group.children[group.children.length - 1] as THREE.Mesh;
      const map = new THREE.CanvasTexture(this.cassette.copyLabel());
      map.colorSpace = THREE.SRGBColorSpace;
      label.material = new THREE.MeshBasicMaterial({
        map,
        toneMapped: false,
        transparent: true,
        depthWrite: false,
      });
      // Clone carries the selected label material by reference. Replace it
      // before installing appearance shaders, so theme hooks are not appended
      // to the original label a second time on every selection.
      this.appearance.prepare(group);
      this.appearance.apply(group, smooth(this.lift.value / 0.4));
      this.appearance.setClarity(group, this.modelClarity());
      this.scene.add(group);
      this.outgoing.push({
        group,
        slot: this.selectedSlot,
        cell: { ...this.selectedCell },
        lift: { ...this.lift },
        returnY: group.rotation.y !== 0 ? group.position.y : null,
        clarity: this.modelClarity(),
      });
      this.lift.value = 0;
      this.lift.velocity = 0;
    }
    this.selectedSlot = next;
    this.selectedCell = cell;
    if (changed) {
      this.decryption.select();
      this.rotation = 0;
      this.returnY = null;
    }
    const returning = this.outgoing.findIndex((o) => sameCell(o.cell, cell));
    if (returning >= 0) {
      const o = this.outgoing[returning];
      this.lift = { ...o.lift };
      this.rotation = o.group.rotation.y;
      this.returnY = o.returnY;
      this.decryption.select(o.clarity);
      this.scene.remove(o.group);
      this.appearance.dispose(o.group);
      this.outgoing.splice(returning, 1);
    }
    if (this.deferSelectionPulse) {
      this.pendingPulse = this.looping ? { ...cell } : null;
    } else this.emitPulse(cell);
    this.targetRotation = 0;
    this.cassette.drawLabel(index);
  }
  private emitPulse(cell: ArchiveCell) {
    this.pulses.push({ ...cell, time: this.clock });
    this.pulses = this.pulses.slice(-6);
  }
  resize() {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    const kind = this.container.closest<HTMLElement>("[data-layout]")?.dataset.layout ?? "";
    const displayHeight = this.container.getBoundingClientRect().height;
    if (this.layoutKind === "cinematic" && kind !== "cinematic" && this.displayHeight > 0) {
      // Removing letterboxing starts from the same apparent model size. The
      // existing camera interpolation then carries it to the responsive anchor.
      this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(
        Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * displayHeight / this.displayHeight,
      ));
    }
    this.displayHeight = displayHeight;
    this.layoutKind = kind;
    this.render.resize(this.quality);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  private canBrowse() {
    return (
      this.presenceTarget === 1 &&
      this.looping &&
      !this.targetDetail &&
      this.detail < 0.2 &&
      this.reveal >= 0.8 &&
      this.loaded &&
      !this.container.closest("[inert]")
    );
  }
  private setHover(cell: ArchiveCell | null) {
    if (
      (!cell && !this.hoverCell) ||
      (cell && this.hoverCell && sameCell(cell, this.hoverCell))
    )
      return;
    this.hoverCell = cell ? { ...cell } : null;
    this.onHover?.(cell ? fileAtCell(cell) : null);
  }
  private pickCell(x: number, y: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.cursor.set(
      ((x - r.left) / r.width) * 2 - 1,
      (-(y - r.top) / r.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.cursor, this.camera);
    const cards: THREE.Object3D[] = this.cassette.pickTargets;
    const hit = this.raycaster.intersectObjects(
      [...cards, this.cassette.group, ...this.outgoing.map((o) => o.group)],
      true,
    )[0];
    if (!hit) return null;
    if (hit.instanceId !== undefined) return { ...this.cassette.drawnCells[hit.instanceId] };
    let object: THREE.Object3D | null = hit.object;
    while (object) {
      const copy = this.outgoing.find((o) => o.group === object);
      if (copy) return { ...copy.cell };
      object = object.parent;
    }
    return { ...this.selectedCell };
  }
  private trackCoordinate(axis: DragAxis, value: number) {
    return axis === "lane"
      ? value / COLUMN_SPACING + 2
      : (-value - 2.17) / ROW_SPACING + 15.5;
  }
  private dragProjection(): DragProjection {
    this.cassette.group.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    const center = this.cassette.group.localToWorld(new THREE.Vector3(0, 1.85, 0));
    const rect = this.renderer.domElement.getBoundingClientRect();
    const project = (motion: THREE.Vector3) => {
      const from = center
        .clone()
        .addScaledVector(motion, -0.5)
        .project(this.camera);
      const to = center
        .clone()
        .addScaledVector(motion, 0.5)
        .project(this.camera);
      return {
        x: ((to.x - from.x) * rect.width) / 2,
        y: (-(to.y - from.y) * rect.height) / 2,
      };
    };
    // Positive navigation moves the array along -X for columns and -Z for rows.
    return {
      lane: project(new THREE.Vector3(-COLUMN_SPACING, 0, 0)),
      row: project(new THREE.Vector3(0, 0, -ROW_SPACING)),
    };
  }
  private trackPosition(axis: DragAxis, coordinate: number) {
    return axis === "lane"
      ? (coordinate - 2) * COLUMN_SPACING
      : -2.17 - (coordinate - 15.5) * ROW_SPACING;
  }
  /**
   * Ease a keyboard or selection track toward its target under the plane speed
   * limit. Frames that would exceed the limit advance the spring in slowed
   * time, so the motion keeps its easing shape instead of being clipped.
   */
  private glide(track: Spring, target: number, dt: number) {
    const limit = MAX_PLANE_SPEED * dt;
    const probe = { value: track.value, velocity: track.velocity };
    damp(probe, target, 3.7, dt);
    const step = Math.abs(probe.value - track.value);
    damp(track, target, 3.7, step <= limit ? dt : dt * (limit / step));
  }
  /** Follow a pointer-driven target exactly until the speed limit binds. */
  private follow(track: Spring, target: number, dt: number) {
    const previous = track.value;
    track.value = previous + THREE.MathUtils.clamp(target - previous, -MAX_PLANE_SPEED * dt, MAX_PLANE_SPEED * dt);
    if (dt > 0) track.velocity = (track.value - previous) / dt;
  }
  update(
    time: number,
    cinematic?: { reveal: number; lift: number; zoom: number; time: number },
  ) {
    const elapsed = Math.max(0, time - this.last || 0.016);
    const dt = Math.min(elapsed, 0.05);
    this.last = time;
    this.clock = time;
    if (!this.loaded) return;
    this.pointerControl.flushHover();
    const step = !this.motion.surfaceTransitions ? 1 : Math.min(elapsed, .25) / 1.1;
    this.presence += Math.sign(this.presenceTarget - this.presence) * Math.min(step, Math.abs(this.presenceTarget - this.presence));
    this.renderer.domElement.style.opacity = String(THREE.MathUtils.clamp(this.presence / .16, 0, 1));
    this.theme.beginFrame();
    themeEnvironment(this.scene, this.renderer, this.themeAmount);
    const blend = 1 - Math.exp(-dt * (this.motion.selectionTransition ? 2.8 : 35));
    const detailBlend = 1 - Math.exp(-dt * (this.motion.detailTransition ? 2.8 : 35));
    this.reveal = cinematic
      ? cinematic.reveal
      : THREE.MathUtils.lerp(this.reveal, this.targetReveal, blend);
    this.rotation = this.targetDetail
      ? THREE.MathUtils.lerp(this.rotation, this.targetRotation, detailBlend)
      : returnStep(this.rotation, dt, !this.motion.detailTransition);
    const shot = cinematic?.time ?? 29.1;
    if (cinematic) {
      this.scanTime = shot;
      this.scanBlend = 1;
    } else {
      this.scanTime += dt;
      this.scanBlend *= Math.exp(-dt * 3);
    }
    if (!this.canBrowse()) {
      this.setHover(null);
      if (this.pointerControl.holdingArchive || this.pointerControl.coasting) this.pointerControl.cancel();
    }
    if (this.looping && !cinematic && !this.pointerControl.holdingArchive && !this.pointerControl.coasting) this.rebaseCoordinates();
    const momentum = !cinematic ? this.pointerControl.coasting : null;
    if (momentum) {
      momentum.motion.step(Math.min(Math.max(time - momentum.time, 0), 0.25));
      momentum.time = time;
      this.pointerControl.navigatePlane(momentum.motion.value);
      this.pointerControl.touch();
    }
    const hoverKey = !cinematic && this.hoverCell ? cellKey(this.hoverCell) : null;
    if (hoverKey && !this.hoverLifts.has(hoverKey)) this.hoverLifts.set(hoverKey, 0);
    for (const [key, value] of this.hoverLifts) {
      const target = key === hoverKey ? 0.28 : 0;
      const next = cinematic ? 0 : !this.motion.selectionTransition ? target : THREE.MathUtils.lerp(value, target, 1 - Math.exp(-dt * 14));
      if (target === 0 && next < 0.0001) this.hoverLifts.delete(key);
      else this.hoverLifts.set(key, next);
    }
    const hoverLift = (cell: ArchiveCell) => this.hoverLifts.get(cellKey(cell)) ?? 0;
    const chosen = this.cellPosition(this.selectedCell);
    const selectedRow = this.selectedCell.row;
    const selectedLane = this.selectedCell.lane;
    damp(this.shoulder, selectedRow, this.motion.selectionTransition ? 5 : 35, dt);
    damp(this.laneFocus, selectedLane, this.motion.selectionTransition ? 4 : 35, dt);
    // A held or freely coasting plane owns both tracks; selection cannot pull it.
    if (!this.pointerControl.holdingArchive && !momentum) {
      const row = cinematic ? 0 : -2.17 - chosen.z;
      if (this.motion.selectionTransition) {
        this.glide(this.columnCamera, chosen.x, dt);
        this.glide(this.rail, row, dt);
      } else {
        damp(this.columnCamera, chosen.x, 35, dt);
        damp(this.rail, row, 35, dt);
      }
    }
    if (momentum) {
      this.columnCamera.value = this.trackPosition("lane", momentum.motion.lane.value);
      this.rail.value = this.trackPosition("row", momentum.motion.row.value);
      this.columnCamera.velocity = momentum.motion.lane.velocity * COLUMN_SPACING;
      this.rail.velocity = -momentum.motion.row.velocity * ROW_SPACING;
      if (momentum.motion.phase === "idle") this.pointerControl.clearCoasting();
    }
    const dragTarget = this.pointerControl.dragTarget;
    if (dragTarget && !cinematic) {
      this.follow(this.columnCamera, dragTarget.lane, dt);
      this.follow(this.rail, dragTarget.row, dt);
      this.pointerControl.navigatePlane({
        lane: this.trackCoordinate("lane", this.columnCamera.value),
        row: this.trackCoordinate("row", this.rail.value),
      });
    }
    if (cinematic) {
      this.rail.value = 0;
      this.rail.velocity = 0;
      this.lift.value = extraction(shot);
      this.lift.velocity = 0;
      this.shoulder.value = selectedRow;
      this.laneFocus.value = selectedLane;
      this.laneFocus.velocity = 0;
      this.columnCamera.value = chosen.x;
      this.columnCamera.velocity = 0;
    }
    // Keep the illuminated set near the origin. Lateral navigation is a track
    // movement of the whole array, just like the existing front/back rail.
    const trackX = cinematic ? 0 : this.columnCamera.value;
    this.pulses = this.pulses.filter((p) => time - p.time < 3.2);
    const aligningCopy = this.outgoing.some((o) => o.returnY !== null);
    const idle =
      !cinematic &&
      this.motion.idleWave &&
      this.targetReveal > 0 &&
      !this.targetDetail &&
      this.detail < 0.01 &&
      this.returnY === null &&
      !aligningCopy &&
      time - this.pointerControl.lastActive > 2.5;
    this.idleGain = cinematic
      ? 0
      : THREE.MathUtils.lerp(
          this.idleGain,
          idle ? (this.playfield.enabled ? (this.playfield.breathing && !this.relayActive ? 1 - this.playfield.bands.activity : 0) : 1) : 0,
          1 - Math.exp(-dt * (idle ? 0.8 : 4)),
        );
    this.pulseGain = THREE.MathUtils.lerp(
      this.pulseGain,
      this.targetDetail || this.returnY !== null || aligningCopy ? 0 : 1,
      1 - Math.exp(-dt * 8),
    );
    const play = this.playfield;
    const activePlay = !cinematic && !this.targetDetail && play.enabled;
    const rhythm = this.rhythm.update(activePlay && !this.reduced ? play.bands : quietBands(), time, dt, this.rhythmStyle);
    this.flatMix += ((activePlay ? play.flatten : 0) - this.flatMix) * (this.reduced ? 1 : 1 - Math.exp(-dt * 4));
    this.cassette.subduedIndex.value = Math.max(Number(this.selectedIndexOnly), this.flatMix);
    const indexDim = (lift: number) => this.selectedIndexOnly
      ? 1 - smooth(lift / .4) * (1 - this.flatMix)
      : this.flatMix;
    const gameTarget = activePlay ? play.target : null;
    if (gameTarget && !this.relayLifts.has(gameTarget)) this.relayLifts.set(gameTarget, 0);
    for (const [key, height] of this.relayLifts) {
      const next = height + ((key === gameTarget ? .95 : 0) - height) * (this.reduced ? 1 : 1 - Math.exp(-dt * 8));
      if (next < .001 && key !== gameTarget) this.relayLifts.delete(key); else this.relayLifts.set(key, next);
    }
    const spectrumPoint = new THREE.Vector3();
    const screenX = (row: number, lane: number) => {
      spectrumPoint.set((lane - 2) * COLUMN_SPACING - trackX, -4.6, (row - 15.5) * ROW_SPACING + this.rail.value).project(this.camera);
      return (spectrumPoint.x + 1) / 2;
    };
    this.archiveField.clear();
    const fieldInput: FieldInputs = {
      cinematic: Boolean(cinematic),
      shot,
      now: time,
      shoulder: this.shoulder.value,
      laneFocus: this.laneFocus.value,
      origin: this.coordinateOrigin,
      scanTime: this.scanTime,
      scanBlend: this.scanBlend,
      idleGain: this.idleGain,
      flatMix: this.flatMix,
      selectionWave: this.motion.selectionWave,
      pulses: this.pulses,
      selectionPulse: this.selectionPulse,
      deferSelectionPulse: this.deferSelectionPulse,
      pulseGain: this.pulseGain,
      playfield: play,
      rhythm: activePlay && !this.reduced ? rhythm : null,
      relayLift: (row, lane) => this.relayLifts.get(cellKey({ row, lane })) ?? 0,
      screenX,
    };
    const field = (row: number, lane: number): number =>
      this.archiveField.sample(fieldInput, row, lane);
    const selectedBase = chosen.y + field(selectedRow, selectedLane);
    if (!cinematic) {
      if (this.returnY !== null && this.rotation !== 0) {
        this.lift.value = this.returnY - selectedBase;
        this.lift.velocity = 0;
      } else {
        this.returnY = null;
        damp(
          this.lift,
          this.targetDetail
            ? INSPECTION_LIFT
            : this.outgoing.some(
                  (o) =>
                    o.returnY !== null &&
                    o.cell.lane === selectedLane &&
                    Math.abs(o.cell.row - selectedRow) < 5,
                )
              ? 0
              : 0.4 * this.targetReveal * (1 - this.flatMix),
          !this.motion.detailTransition
            ? 35
            : this.deferSelectionPulse &&
                !this.targetDetail &&
                this.lift.value < 0.4
              ? 7.6
              : 4.2,
          dt,
        );
      }
    }
    const cameraTarget = this.targetDetail
      ? smooth((this.lift.value - 0.8) / 2.4)
      : this.returnY !== null
        ? this.detail
        : smooth((this.lift.value - 0.4) / (INSPECTION_LIFT - 0.4));
    this.detail = cinematic
      ? cinematic.zoom
      : THREE.MathUtils.lerp(this.detail, cameraTarget, detailBlend);
    const detail = this.detail;
    // The physical decryption timeline runs alongside the lift and the camera
    // move instead of waiting for them to settle, so the archive is already
    // unsealing while it travels into the reading framing. It stays alive even
    // when the model visuals are disabled; the document mask uses the same
    // timeline independently.
    this.decryption.update(dt, false, cinematic ? shot + 5 : undefined);
    this.appearance.apply(this.cassette.group, smooth(this.lift.value / 0.4));
    this.appearance.setClarity(this.cassette.group, this.modelClarity());
    // Reference 26.92–27.76: the array travels horizontally into a white field.
    const entry = cinematic ? smooth((shot - 21.9) / 0.86) : this.reveal;
    const entranceTime = THREE.MathUtils.clamp((shot - 21.92) / 0.75, 0, 1);
    const entryZ = cinematic
      ? -23 * (1 - entranceTime) ** 2
      : -28 * (1 - entry);
    for (let i = this.outgoing.length - 1; i >= 0; i--) {
      const o = this.outgoing[i];
      const p = this.cellPosition(o.cell);
      const baseY = p.y + field(o.cell.row, o.cell.lane);
      o.group.rotation.y = returnStep(o.group.rotation.y, dt, !this.motion.detailTransition);
      if (o.returnY !== null) {
        o.lift.value = o.returnY - baseY;
        o.lift.velocity = 0;
        if (o.group.rotation.y === 0) o.returnY = null;
      } else damp(o.lift, 0, this.motion.detailTransition ? 4.5 : 35, dt);
      o.group.position.set(
        p.x - trackX,
        baseY + o.lift.value + hoverLift(o.cell) - this.presentationDrop(o.cell),
        p.z + entryZ + this.rail.value,
      );
      const quality = smooth(o.lift.value / 0.4);
      this.appearance.apply(o.group, quality);
      this.appearance.setTheme(o.group, this.theme.sample(o.cell, time), indexDim(o.lift.value));
      o.clarity = this.motion.modelDecryption ? o.clarity * Math.exp(-dt * 9) : 0;
      this.appearance.setClarity(o.group, o.clarity);
      const { row, lane } = o.cell;
      o.group.rotation.x =
        (field(row + 0.5, lane) - field(row - 0.5, lane)) *
        0.024 *
        (1 - detail) *
        (1 - quality);
      if (o.lift.value < 0.0001 && Math.abs(o.group.rotation.y) < 0.0001) {
        this.scene.remove(o.group);
        this.appearance.dispose(o.group);
        this.outgoing.splice(i, 1);
      }
    }
    if (
      this.pendingPulse &&
      !cinematic &&
      !this.targetDetail &&
      this.targetReveal
    ) {
      const selectedY = selectedBase + this.lift.value;
      const oldCardsLower = this.outgoing.every(
        (old) =>
          old.cell.lane !== selectedLane ||
          Math.abs(old.cell.row - selectedRow) > 4 ||
          old.group.position.y + 0.015 < selectedY,
      );
      // The new file causes the wave: finish most of its rise and let nearby
      // outgoing files get below it before starting the outward pulse.
      if (this.lift.value >= 0.35 && this.returnY === null && oldCardsLower) {
        if (this.motion.selectionWave) this.emitPulse(this.pendingPulse);
        this.pendingPulse = null;
      }
    }
    this.appearance.setTheme(this.cassette.group, this.theme.sample(this.selectedCell, time), indexDim(this.lift.value));
    this.cassette.group.position.set(
      chosen.x - trackX,
      chosen.y + field(selectedRow, selectedLane) + this.lift.value + hoverLift(this.selectedCell) - this.presentationDrop(this.selectedCell),
      chosen.z + entryZ + this.rail.value,
    );
    // Extraction only changes elevation. Reframing belongs to the camera.
    this.cassette.group.rotation.set(
      (field(selectedRow + 0.5, selectedLane) -
        field(selectedRow - 0.5, selectedLane)) *
        0.024 *
        (1 - detail) *
        (1 - smooth(this.lift.value / 0.4)),
      cinematic ? 0 : this.rotation,
      0,
    );
    const camera = planArchiveCamera({
      cinematic,
      detail,
      width: this.container.clientWidth,
      height: this.container.clientHeight,
      layout: this.container.closest<HTMLElement>("[data-layout]")?.dataset.layout ?? "",
      position: this.camera.position,
      aim: this.cameraAim,
      fov: this.camera.fov,
      modelPosition: this.cassette.group.position,
      pointer: this.pointer,
      pointerParallax: this.motion.pointerParallax,
      uiOnlyParallax: this.uiOnlyParallax,
      transition: this.targetDetail || this.detail > 0.01
        ? this.motion.detailTransition
        : this.motion.selectionTransition,
      themeAmount: this.themeAmount,
      dt,
    });
    this.camera.position.copy(camera.position);
    this.cameraAim.copy(camera.aim);
    this.camera.lookAt(this.cameraAim);
    this.camera.fov = camera.fov;
    const fog = this.scene.fog as THREE.Fog;
    fog.near = camera.fogNear;
    fog.far = camera.fogFar;
    const responsiveOpening = camera.responsiveOpening;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    // Music can depend on projected X; invalidate after the camera advances.
    if (activePlay && !this.reduced) this.archiveField.clear();
    // Build and compact the instance set only after the actual damped camera
    // is final for this frame. Picking uses the same packed index-to-cell map.
    const fixed = (Boolean(cinematic) || !this.looping) && !responsiveOpening;
    this.cassette.setCinematic(Boolean(cinematic));
    this.cells = fixed ? Array.from({ length: 160 }, (_, i) => poolCell(i))
      : this.visibility.update(this.camera, fog.far, trackX, entryZ + this.rail.value, this.extraCoverage);
    const hidden = new Set(this.outgoing.map(o => cellKey(o.cell)));
    hidden.add(cellKey(this.selectedCell));
    const matricesChanged = this.cassette.pack({
      cells: this.cells,
      hidden,
      field,
      hoverLift,
      drop: (cell) => this.presentationDrop(cell),
      theme: (cell) => this.theme.sample(cell, time),
      intersects: (x, y, z) => this.visibility.intersects(x, y, z),
      refine: !fixed,
      trackX,
      entryZ,
      rail: this.rail.value,
      detail,
      relay: play.enabled,
      camera: this.camera,
    });
    let neighborTop = -Infinity;
    const lane = selectedLane,
      row = selectedRow;
    for (let r = row - 5; r <= row + 5; r++) {
      if (r !== row)
        neighborTop = Math.max(neighborTop, -4.6 + field(r, lane) + 3.76);
    }
    for (const o of this.outgoing) {
      if (o.cell.lane === lane && Math.abs(o.cell.row - row) <= 5) {
        neighborTop = Math.max(neighborTop, o.group.position.y + 3.76);
      }
    }
    this.clearance = this.cassette.group.position.y - neighborTop;
    this.canInspect =
      !cinematic &&
      Boolean(this.targetDetail) &&
      detail > 0.9 &&
      this.pulseGain < 0.01 &&
      this.clearance > 0.3;
    this.container.dataset.inspection =
      this.returnY !== null
        ? "aligning"
        : this.canInspect
          ? "ready"
          : this.targetDetail
            ? "lifting"
            : "preview";
    const { focus, aperture } = this.render.focus(
      this.cassette.group.position,
      detail,
      this.quality.depthOfField,
    );
    // A reused frame stops here: nothing after this changes the canvas.
    if (!this.render.render({
      matricesChanged,
      cinematic: Boolean(cinematic),
      themeAmount: this.themeAmount,
      subduedIndex: this.cassette.subduedIndex.value,
      fogNear: fog.near,
      fogFar: fog.far,
      focus,
      aperture,
      themeVersion: this.cassette.themeVersion,
    })) return;
  }
  projectCard(x: number, y: number) {
    this.cassette.group.updateMatrixWorld(true);
    const p = this.cassette.group
      .localToWorld(new THREE.Vector3(x, y, 0.255))
      .project(this.camera);
    return [(p.x + 1) * this.container.clientWidth / 2, (1 - p.y) * this.container.clientHeight / 2];
  }
  get decryptionFrame() { return this.decryption.frame; }
  finishDecryption() { this.decryption.finish(); }
  get detailVisibility() {
    return smooth((this.detail - 0.25) / 0.55);
  }
  getStats() {
    this.cassette.group.updateMatrixWorld(true);
    const project = (x: number, y: number, z: number) =>
      projectPoint(this.cassette.group, this.camera, this.container.clientWidth, this.container.clientHeight, x, y, z);
    const dragTarget = this.pointerControl.dragTarget;
    const coasting = this.pointerControl.coasting;
    return {
      decryption: { ...this.decryption.frame, clarity: this.decryption.clarity, modelClarity: this.modelClarity() },
      topLeft: project(-2.5, 3.7, 0),
      topRight: project(2.5, 3.7, 0),
      labelTopLeft: project(-1.855, 3.27, 0.255),
      labelBottomLeft: project(-1.855, 2.81, 0.255),
      modelPosition: roundedVector(this.cassette.group.position),
      cameraPosition: roundedVector(this.camera.position),
      fieldOfView: this.camera.fov,
      loaded: this.loaded,
      drawCalls: this.renderer.info.render.calls,
      renderedFrames: this.render.frames.rendered,
      reusedFrames: this.render.frames.reused,
      presentation: this.presence,
      triangles: this.renderer.info.render.triangles,
      archiveCount: this.cassette.drawnCells.length,
      archiveCandidates: this.cells.length,
      archiveCulled: this.cells.length - this.cassette.drawnCells.length,
      archiveCapacity: this.cassette.instanceCapacity,
      archiveCoverage: this.extraCoverage ? "extra" : "standard",
      returningFiles: this.outgoing.length,
      selectionPhase: selectionPhase(this.pendingPulse, this.pulses),
      pendingPulse: this.pendingPulse ? { ...this.pendingPulse } : null,
      pulses: this.pulses.map((pulse) => ({ ...pulse })),
      referenceTime: rounded(this.scanTime + 5, 2),
      selectedSlot: this.selectedSlot,
      selectedLane: Math.floor(this.selectedSlot / 32),
      selectedCell: { ...this.selectedCell },
      hoverCell: this.hoverCell ? { ...this.hoverCell } : null,
      hoverLifts: Object.fromEntries(this.hoverLifts),
      dragTarget: dragTarget ? { ...dragTarget } : null,
      archiveMomentum: coasting ? {
        phase: coasting.motion.phase,
        value: coasting.motion.value,
        velocity: coasting.motion.velocity,
      } : null,
      holdingArchive: this.pointerControl.holdingArchive,
      dragProjection: this.dragProjection(),
      dragMapping: this.pointerControl.dragActive ? "free" : null,
      coordinateOrigin: { ...this.coordinateOrigin },
      poolBounds: poolBounds(this.cells),
      laneFocus: this.laneFocus.value,
      columnCamera: this.columnCamera.value,
      rotation: this.rotation,
      clearance: this.clearance,
      canInspect: this.canInspect,
      returnPhase: this.returnY !== null ? "aligning" : "lowering",
      extraction: rounded(this.lift.value, 3),
      appearance: rounded(smooth(this.lift.value / 0.4), 3),
      cameraDetail: rounded(this.detail, 3),
      idleGain: this.idleGain,
      flatten: this.flatMix,
      spectrumActivity: this.playfield.bands.activity,
      selectedIndexDim: indexDimOf(this.cassette.group),
      returningIndexDims: this.outgoing.map(o => ({ cell: o.cell, dim: indexDimOf(o.group) })),
      cameraDistance: this.camera.position.distanceTo(this.cameraAim),
      cameraNear: this.camera.near,
      cameraFar: this.camera.far,
      fogNear: (this.scene.fog as THREE.Fog).near,
      fogFar: (this.scene.fog as THREE.Fog).far,
      returningAppearance: this.outgoing.map((o) => ({
        slot: o.slot,
        clarity: glassClarityOf(o.group),
        cell: { ...o.cell },
        lift: o.lift.value,
        quality: smooth(o.lift.value / 0.4),
        rotation: o.group.rotation.y,
        worldY: o.group.position.y,
        phase: o.returnY !== null ? "aligning" : "lowering",
      })),
      rail: rounded(this.rail.value, 3),
    };
  }
}
