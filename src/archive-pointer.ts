// Pointer, wheel and drag handling for the archive plane.
//
// This is the only module that turns browser input into plane state: the drag
// gesture, the coasting hand-off, hover sampling, the inspection rotation and
// the relay tap. The scene keeps the plane tracks, the selection and picking
// (they need the renderer) and reaches them through ArchivePointerHost, while
// the interaction state lives here so the frame loop only has to read it.
import {
  ArchiveDrag,
  ArchivePlaneMomentum,
  type DragAxis,
  type DragProjection,
  type DragPosition,
} from "./archive-drag";
import {
  COLUMN_SPACING,
  ROW_SPACING,
  cellKey,
  sameCell,
  type ArchiveCell,
} from "./archive-loop";

type PointerSample = Pick<PointerEvent, "clientX" | "clientY" | "pointerType">;

export interface ArchivePointerHost {
  /** The array may be browsed: presence, looping, reveal and loading all allow it. */
  canBrowse(): boolean;
  /** The extracted file may be rotated sideways. */
  canInspect(): boolean;
  /** Cell under a client point, or null. */
  pickCell(x: number, y: number): ArchiveCell | null;
  /** Cell the plane currently shows. */
  selectedCell(): ArchiveCell;
  /** Plane track positions, in world units. */
  tracks(): DragPosition;
  /** Plane track positions in cell coordinates, for the coasting hand-off. */
  coordinates(): DragPosition;
  /** Projected screen displacement of one lane and one row step. */
  projection(): DragProjection;
  /** Frame clock in seconds, so an interaction ages with the animation. */
  now(): number;
  hover(cell: ArchiveCell | null): void;
  pointed(x: number, y: number): void;
  /** Selection along a travelled segment; no cancellation and no sound. */
  emitSelect(cell: ArchiveCell): void;
  navigate(axis: DragAxis, direction: number): void;
  relayPick(key: string | null): void;
  /** Add a sideways rotation to the extracted file, in radians. */
  rotate(delta: number): void;
  clearVelocity(): void;
  relayActive(): boolean;
}

export class ArchivePointer {
  private readonly canvas: HTMLCanvasElement;
  private readonly host: ArchivePointerHost;
  private readonly events = new AbortController();
  private readonly drag = new ArchiveDrag();
  private readonly pointers = new Set<number>();
  private target: DragPosition | null = null;
  private coast: { motion: ArchivePlaneMomentum; time: number } | null = null;
  private holding = false;
  private rotating = false;
  private navigating = false;
  private pending: PointerSample | null = null;
  private lastInteraction = 0;
  // Gesture state, promoted from the listener closures so cancel() and the
  // handlers share exactly one copy.
  private activePointer: number | null = null;
  private previousX = 0;
  private startX = 0;
  private startY = 0;
  private moved = false;
  private browse = false;
  private cancelled = false;
  private startTrack: DragPosition = { lane: 0, row: 0 };
  private wheelTotal = 0;
  private wheelTime = 0;
  constructor(canvas: HTMLCanvasElement, host: ArchivePointerHost) {
    this.canvas = canvas;
    this.host = host;
    this.bind();
  }
  get dragTarget() {
    return this.target;
  }
  /** The coasting motion, or null while the plane is at rest. */
  get coasting() {
    return this.coast;
  }
  get holdingArchive() {
    return this.holding;
  }
  get navigatingDrag() {
    return this.navigating;
  }
  get dragActive() {
    return this.drag.active;
  }
  /** Frame time of the last interaction, for the idle motion. */
  get lastActive() {
    return this.lastInteraction;
  }
  /** Mark an interaction that happens outside the pointer, such as a selection. */
  touch() {
    this.lastInteraction = this.host.now();
  }
  /** Drop the coasting motion without touching the track velocity. */
  clearCoasting() {
    this.coast = null;
  }
  flushHover() {
    const sample = this.pending;
    this.pending = null;
    if (sample) this.hover(sample);
  }
  /**
   * Select every physical cell along a travelled segment, one update per cell.
   * Column memory is updated by the selection itself, but a held plane is never
   * pulled away from the pointer.
   */
  navigatePlane(coordinate: DragPosition) {
    const goal = { lane: Math.round(coordinate.lane), row: Math.round(coordinate.row) };
    if (sameCell(goal, this.host.selectedCell())) return;
    const from = { ...this.host.selectedCell() };
    const steps = Math.min(64, Math.max(Math.abs(goal.lane - from.lane), Math.abs(goal.row - from.row)));
    this.navigating = true;
    try {
      for (let i = 1; i <= steps; i++) {
        const cell = {
          lane: Math.round(from.lane + (goal.lane - from.lane) * i / steps),
          row: Math.round(from.row + (goal.row - from.row) * i / steps),
        };
        if (!sameCell(cell, this.host.selectedCell())) this.host.emitSelect(cell);
      }
    } finally {
      this.navigating = false;
    }
  }
  stopMomentum() {
    if (this.coast) this.host.clearVelocity();
    this.coast = null;
  }
  /** Cancel the active gesture and stop coasting. */
  cancel() {
    this.cancelled = true;
    this.stopMomentum();
    this.pointers.clear();
    this.wheelTotal = 0;
    this.reset();
  }
  dispose() {
    this.events.abort();
    this.cancel();
  }
  private hover = (e: PointerSample) => {
    if (
      e.pointerType !== "mouse" ||
      !this.host.canBrowse() ||
      this.coast
    )
      return;
    const r = this.canvas.getBoundingClientRect();
    this.host.pointed(
      (e.clientX - r.left) / r.width - 0.5,
      (e.clientY - r.top) / r.height - 0.5,
    );
    const cell = this.host.pickCell(e.clientX, e.clientY);
    this.host.hover(cell);
    this.canvas.style.cursor = cell ? "pointer" : "grab";
  };
  private reset = () => {
    this.pending = null;
    const id = this.activePointer;
    this.activePointer = null;
    this.rotating = false;
    this.target = null;
    this.holding = false;
    this.browse = false;
    this.host.hover(null);
    this.canvas.style.cursor = this.host.canBrowse() ? "grab" : "default";
    if (id !== null && this.canvas.hasPointerCapture(id))
      this.canvas.releasePointerCapture(id);
  };
  private moveArchive = (e: PointerEvent) => {
    const pending = !this.drag.active;
    for (const sample of e.getCoalescedEvents?.() ?? []) {
      this.drag.move(sample.clientX, sample.clientY, sample.timeStamp);
    }
    this.drag.move(e.clientX, e.clientY, e.timeStamp);
    this.moved ||= this.drag.moved;
    if (!this.drag.active) return;
    if (pending) this.startTrack = this.host.tracks();
    this.host.hover(null);
    this.lastInteraction = this.host.now();
    this.canvas.style.cursor = "grabbing";
    // The pointer only names the destination; the frame loop advances the plane
    // toward it under the shared speed limit.
    this.target = {
      lane: this.startTrack.lane + this.drag.value.lane * COLUMN_SPACING,
      row: this.startTrack.row - this.drag.value.row * ROW_SPACING,
    };
  };
  private bind() {
    const canvas = this.canvas;
    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!this.host.canBrowse() && !this.host.canInspect()) return;
      this.pending = null;
      this.pointers.add(e.pointerId);
      if (this.pointers.size > 1) {
        this.cancelled = true;
        this.reset();
        return;
      }
      this.activePointer = e.pointerId;
      this.cancelled = false;
      this.moved = this.coast !== null;
      this.startX = this.previousX = e.clientX;
      this.startY = e.clientY;
      this.browse = this.host.canBrowse();
      this.stopMomentum();
      if (this.browse) this.host.clearVelocity();
      this.holding = this.browse;
      this.rotating = !this.browse && this.host.canInspect();
      this.startTrack = this.host.tracks();
      this.drag.start(e.clientX, e.clientY, this.host.projection(), e.timeStamp);
      this.host.hover(null);
      canvas.setPointerCapture(e.pointerId);
      if (this.host.relayActive()) {
        this.holding = false;
        this.rotating = false;
      }
    }, { signal: this.events.signal });
    canvas.addEventListener("pointermove", (e) => {
      if (this.host.relayActive()) {
        if (e.pointerId === this.activePointer)
          this.moved ||= Math.hypot(e.clientX - this.startX, e.clientY - this.startY) > 7;
        return;
      }
      if (this.activePointer !== null && e.pointerId !== this.activePointer) return;
      if (this.activePointer === null) {
        // Coalesce uncaptured hover only; dragging and release velocity stay immediate.
        this.pending = { clientX: e.clientX, clientY: e.clientY, pointerType: e.pointerType };
        return;
      }
      if (this.cancelled) return;
      this.moved ||= Math.hypot(e.clientX - this.startX, e.clientY - this.startY) > 7;
      if (this.browse) {
        if (!this.host.canBrowse()) {
          this.cancel();
          return;
        }
        this.moveArchive(e);
        return;
      }
      if (this.rotating && this.host.canInspect()) {
        this.host.rotate((e.clientX - this.previousX) * 0.004);
        this.previousX = e.clientX;
      }
    }, { signal: this.events.signal });
    canvas.addEventListener("pointerup", (e) => {
      this.pointers.delete(e.pointerId);
      if (e.pointerId !== this.activePointer) return;
      if (this.host.relayActive()) {
        if (!this.cancelled && !this.moved) {
          const cell = this.host.pickCell(e.clientX, e.clientY);
          this.host.relayPick(cell ? cellKey(cell) : null);
        }
        this.reset();
        return;
      }
      if (!this.cancelled && this.browse && this.host.canBrowse()) {
        this.moveArchive(e);
        if (this.drag.active) {
          this.coast = {
            time: performance.now() / 1000,
            motion: new ArchivePlaneMomentum(
              this.host.coordinates(),
              this.drag.releaseVelocity(e.timeStamp),
            ),
          };
        } else if (!this.moved) {
          const cell = this.host.pickCell(e.clientX, e.clientY);
          if (cell) this.host.emitSelect(cell);
        }
      }
      this.reset();
    }, { signal: this.events.signal });
    canvas.addEventListener("pointercancel", (e) => {
      this.pointers.delete(e.pointerId);
      if (e.pointerId === this.activePointer) {
        this.cancelled = true;
        this.reset();
      }
    }, { signal: this.events.signal });
    canvas.addEventListener("lostpointercapture", (e) => {
      this.pointers.delete(e.pointerId);
      if (e.pointerId === this.activePointer) {
        this.cancelled = true;
        this.reset();
      }
    }, { signal: this.events.signal });
    canvas.addEventListener("pointerleave", () => {
      this.pending = null;
      this.host.pointed(0, 0);
      this.host.hover(null);
    }, { signal: this.events.signal });
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (this.host.relayActive()) {
          e.preventDefault();
          return;
        }
        if (
          !this.host.canBrowse() ||
          this.activePointer !== null ||
          e.ctrlKey ||
          Math.abs(e.deltaX) > Math.abs(e.deltaY)
        )
          return;
        e.preventDefault();
        if (this.coast) this.stopMomentum();
        const now = performance.now();
        const delta = Math.max(
          -300,
          Math.min(
            300,
            e.deltaY *
              (e.deltaMode === 1
                ? 40
                : e.deltaMode === 2
                  ? canvas.clientHeight
                  : 1),
          ),
        );
        if (now - this.wheelTime > 180 || Math.sign(delta) !== Math.sign(this.wheelTotal))
          this.wheelTotal = 0;
        this.wheelTime = now;
        this.wheelTotal += delta;
        const steps = Math.min(3, Math.floor(Math.abs(this.wheelTotal) / 100));
        if (!steps) return;
        const direction = Math.sign(this.wheelTotal);
        this.wheelTotal -= direction * steps * 100;
        this.navigating = true;
        try {
          for (let i = 0; i < steps; i++) this.host.navigate("row", direction);
        } finally {
          this.navigating = false;
        }
      },
      { ...{ passive: false }, signal: this.events.signal },
    );
    window.addEventListener("blur", () => this.cancel(), { signal: this.events.signal });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.cancel();
    }, { signal: this.events.signal });
    window.addEventListener("resize", () => this.cancel(), { signal: this.events.signal });
    // After multi-touch cancels capture, a finger can finish outside the canvas.
    window.addEventListener("pointerup", (e) => this.pointers.delete(e.pointerId), { signal: this.events.signal });
    window.addEventListener("pointercancel", (e) =>
      this.pointers.delete(e.pointerId), { signal: this.events.signal }
    );
  }
}
