// The archive cassette: the modelled file, its instanced array, the baked
// impostor proxy and the packed draw set.
//
// Everything that describes how the array *geometry* is built and packed lives
// here: the GLB materials, the two theme-endpoint bakes, the label canvas, the
// per-frame instance buffers and the draw-coverage refinement. The scene keeps
// the culling policy (visibility window, coverage option), the selection and the
// outgoing copies, and feeds this module one frame of inputs.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ArchiveDrawCoverage, ArchiveShadowCoverage } from "./archive-draw-coverage";
import { InstanceUpdates } from "./instance-updates";
import { disposeThreeTree } from "./three-resources";
import { themeMaterial, themeEnvironment } from "./theme-material";
import type { LightingLook } from "./archive-lighting";
import { configureInternalOptics } from "./internal-optics";
import { CardAppearance } from "./appearance";
import { systemFontStack } from "./fonts";
import { labelMarkSvg } from "./brand";
import { assetUrl as publicAsset } from "./asset-url";
import { createCardImpostorMaterial, fitCardImpostor } from "./archive-card-bake";
import { ARCHIVE_CAMERA_DISTANCE, interactiveViewDirection } from "./archive-camera";
import type { RenderQuality } from "./render-quality";
import {
  COLUMN_SPACING,
  LOOP_COLUMNS,
  LOOP_ROWS,
  ROW_SPACING,
  cellKey,
  poolCell,
  type ArchiveCell,
} from "./archive-loop";

/** One frame of plane placement and surface height, resolved by the scene. */
export type PackFrame = {
  /** Candidate cells for this camera and plane placement. */
  cells: readonly ArchiveCell[];
  /** Cells drawn by the selected file or an outgoing copy. */
  hidden: ReadonlySet<string>;
  field(row: number, lane: number): number;
  hoverLift(cell: ArchiveCell): number;
  drop(cell: ArchiveCell): number;
  theme(cell: ArchiveCell): number;
  /** Refines the culling window once the surface height is known. */
  intersects(x: number, y: number, z: number): boolean;
  /** The settled framings skip the refinement. */
  refine: boolean;
  trackX: number;
  entryZ: number;
  rail: number;
  detail: number;
  /** Whether the score may raise relay targets. */
  relay: boolean;
  camera: THREE.PerspectiveCamera;
};

export type AssemblyModel = {
  model: THREE.Group;
  setClarity(value: number): void;
  dispose(): void;
};

export type CassetteOptions = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  appearance: CardAppearance;
  floor: THREE.Mesh;
  look: LightingLook;
};

export class ArchiveCassette {
  /** The selected file: modelled surfaces plus the printed label. */
  readonly group = new THREE.Group();
  /** Theme dimming shared with the registered array materials. */
  readonly subduedIndex = { value: 0 };
  /** Cells packed into the instanced buffers for the current frame. */
  drawnCells: ArchiveCell[] = [];
  /** Projected relay targets, rebuilt while the score drives the array. */
  readonly relayPoints = new Map<string, { cell: ArchiveCell; point: THREE.Vector3 }>();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly appearance: CardAppearance;
  private readonly floor: THREE.Mesh;
  private readonly look: LightingLook;
  private instances: THREE.InstancedMesh[] = [];
  private surfaceInstances: THREE.InstancedMesh[] = [];
  private impostor?: THREE.InstancedMesh;
  private impostorTargets: THREE.WebGLRenderTarget[] = [];
  private themeAttribute?: THREE.InstancedBufferAttribute;
  private shadowCoverage?: ArchiveShadowCoverage;
  private drawCoverage = new ArchiveDrawCoverage();
  private matrices?: InstanceUpdates;
  private themes?: InstanceUpdates;
  private dummy = new THREE.Object3D();
  private capacity = LOOP_COLUMNS * LOOP_ROWS;
  private labelCanvas = document.createElement("canvas");
  private labelTexture?: THREE.CanvasTexture;
  private labelMark = new Image();
  private assemblyTemplate?: Promise<THREE.Group>;
  constructor(options: CassetteOptions) {
    this.renderer = options.renderer;
    this.scene = options.scene;
    this.appearance = options.appearance;
    this.floor = options.floor;
    this.look = options.look;
  }
  /** Version of the instanced theme buffer; part of the frame identity. */
  get themeVersion() {
    return this.themeAttribute?.version ?? 0;
  }
  /** Instance slots allocated for the packed set. */
  get instanceCapacity() {
    return this.capacity;
  }
  /** Instanced batches to raycast: the baked proxy when it is drawn. */
  get pickTargets(): THREE.Object3D[] {
    return this.impostor && this.impostor.visible
      ? [this.impostor]
      : this.surfaceInstances;
  }
  /** Build the modelled file, the instanced array and the baked proxy. */
  async load(assetUrl: string, quality: RenderQuality, themeAmount: number) {
    this.labelMark.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(labelMarkSvg)}`;
    await this.labelMark.decode();
    const gltf = await new GLTFLoader().loadAsync(
      assetUrl,
    );
    gltf.scene.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    gltf.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    const count = LOOP_COLUMNS * LOOP_ROWS;
    for (const mesh of meshes) {
      const geom = mesh.geometry
        .clone()
        .applyMatrix4(mesh.matrixWorld)
        .scale(1, 1, 1);
      const source = mesh.material as THREE.MeshStandardMaterial;
      const name = source.name.replace(/\.\d+$/, "");
      const mat = source.clone() as THREE.MeshPhysicalMaterial;
      mat.envMapIntensity = 0.6;
      if (name === "Frosted_Polymer") {
        mat.color.set("#fffdfa");
        mat.transmission = 0.9;
        mat.thickness = 0.12;
        mat.roughness = 0.21;
        mat.ior = 1.46;
        mat.attenuationColor = new THREE.Color("#eee6df");
        mat.attenuationDistance = 2;
      }
      if (name === "Internal_Ceramic") {
        mat.color.set(this.look === "refined" ? "#c4baae" : "#c7beb6");
        mat.roughness = 0.6;
      }
      if (name === "Printed_Label") mat.color.set("#eae5dc");
      if (name === "Ivory_Edges") {
        mat.color.set("#f0e7df");
        mat.roughness = 0.31;
        mat.transmission = 0.65;
        mat.thickness = 0.04;
      }
      if (name === "Optical_Diffuser") {
        mat.color.set("#e2dad4");
        mat.transmission = 0;
        mat.roughness = 0.7;
      }
      if (name === "Subsurface_Optics") {
        mat.color.set(this.look === "refined" ? "#b9a796" : "#b9aba1");
        mat.roughness = 0.48;
        mat.metalness = 0.05;
      }
      if (name === "Optical_Edges") {
        // Internal refractive shoulders must be in the opaque capture: WebGL's
        // screen-space transmission cannot recursively sample another glass mesh.
        mat.transmission = 0;
        mat.color.set(this.look === "refined" ? "#d8c7b5" : "#d4c7be");
        mat.roughness = 0.26;
        mat.metalness = 0.08;
      }
      configureInternalOptics(name, mat);
      if (name === "Carbon_Ink") continue;
      const selectedMesh = new THREE.Mesh(geom, mat);
      selectedMesh.userData.surface = name;
      selectedMesh.castShadow = name === "Optical_Diffuser";
      selectedMesh.receiveShadow = true;
      this.group.add(selectedMesh);
      // Only the shell, edge and fasteners remain visible within tightly packed rows.
      // Keep sub-millimetre optical/typographic geometry on the extracted cassette.
      if (
        ![
          "Frosted_Polymer",
          "Ivory_Edges",
          "Titanium_Fasteners",
          "Index_Inlay",
          "Optical_Diffuser",
        ].includes(name)
      ) {
        this.appearance.register(name, mat);
        continue;
      }
      const arrayMat = mat.clone();
      if (name === "Frosted_Polymer") {
        arrayMat.transmission = 0.78;
        if (this.look === "refined") {
          // Longer oblique paths pick up the warm body tint, while the thin
          // edges and the extracted clear cover retain a brighter response.
          arrayMat.thickness = 0.28;
          arrayMat.attenuationColor.set("#d4c7b4");
          arrayMat.attenuationDistance = 1.2;
        }
        arrayMat.transparent = false;
        arrayMat.color.set("#fff7ed");
        arrayMat.onBeforeCompile = (shader) => {
          shader.vertexShader =
            "varying float vPanelHeight;\n" + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nvPanelHeight = position.y / 3.7;",
          );
          shader.fragmentShader =
            "varying float vPanelHeight;\n" + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <color_fragment>",
            "#include <color_fragment>\ndiffuseColor.rgb *= mix(vec3(0.40, 0.30, 0.20), vec3(1.0, 0.98, 0.94), smoothstep(0.1, 1.0, vPanelHeight));",
          );
        };
        arrayMat.roughness = 0.28;
        arrayMat.clearcoat = 0.3;
        arrayMat.clearcoatRoughness = 0.25;
      }
      if (name === "Optical_Diffuser") arrayMat.color.set("#806447");
      if (name === "Ivory_Edges") {
        arrayMat.transmission = 0;
        arrayMat.color.set(
          this.look === "refined" ? "#dcc9b0" : "#fff5e9",
        );
        arrayMat.roughness = 0.38;
      }
      if (name === "Index_Inlay") {
        arrayMat.color.set("#e4d6c5");
        arrayMat.metalness = 0.05;
      }
      this.appearance.register(name, mat, arrayMat);
      this.themeAttribute ??= new THREE.InstancedBufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage);
      geom.setAttribute("archiveTheme", this.themeAttribute);
      themeMaterial(arrayMat, name, true, this.subduedIndex);
      const inst = new THREE.InstancedMesh(geom, arrayMat, count);
      // All surfaces move rigidly together; share the transform buffer on the GPU.
      inst.instanceMatrix = this.surfaceInstances[0]?.instanceMatrix ?? inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      inst.castShadow = name === "Optical_Diffuser";
      inst.receiveShadow = true;
      inst.frustumCulled = false;
      this.surfaceInstances.push(inst);
      this.scene.add(inst);
    }
    this.shadowCoverage = new ArchiveShadowCoverage(this.surfaceInstances.find(mesh => mesh.castShadow)!);
    this.scene.add(this.shadowCoverage.mesh);
    this.buildCardImpostor(quality, themeAmount);
    this.labelCanvas.width = 1024;
    this.labelCanvas.height = 440;
    this.labelTexture = new THREE.CanvasTexture(this.labelCanvas);
    this.labelTexture.colorSpace = THREE.SRGBColorSpace;
    this.labelTexture.anisotropy =
      this.renderer.capabilities.getMaxAnisotropy();
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.99, 0.46),
      new THREE.MeshBasicMaterial({
        map: this.labelTexture,
        toneMapped: false,
        transparent: true,
        depthWrite: false,
      }),
    );
    label.position.set(-1.36, 3.04, 0.255);
    this.group.add(label);
    this.appearance.prepare(this.group);
    this.appearance.apply(this.group, 0);
    this.drawLabel(0);
    this.scene.add(this.group);
  }

  private buildCardImpostor(quality: RenderQuality, themeAmount: number) {
    const themeAttribute = this.themeAttribute;
    const source = this.surfaceInstances[0];
    if (!themeAttribute || !source) return;
    const box = new THREE.Box3();
    for (const inst of this.surfaceInstances) {
      inst.geometry.computeBoundingBox();
      if (inst.geometry.boundingBox) box.union(inst.geometry.boundingBox);
    }
    if (box.isEmpty()) return;
    const fit = fitCardImpostor({
      box,
      viewDirection: interactiveViewDirection(),
      distance: ARCHIVE_CAMERA_DISTANCE,
    });
    const targets = [0, 1].map(
      () =>
        new THREE.WebGLRenderTarget(fit.width, fit.height, {
          type: THREE.HalfFloatType,
          samples: 4,
          // Cards are minified once the array is seen as a whole.
          generateMipmaps: true,
          minFilter: THREE.LinearMipmapLinearFilter,
          // Render targets keep the parameters set at creation.
          anisotropy: Math.min(
            quality.anisotropy,
            this.renderer.capabilities.getMaxAnisotropy(),
          ),
        }),
    );
    const matrix = source.instanceMatrix;
    const savedMatrix = matrix.array.slice(0, 16);
    const savedTheme = themeAttribute.array[0];
    const savedCounts = this.surfaceInstances.map((inst) => inst.count);
    const savedFog = this.scene.fog;
    const savedTarget = this.renderer.getRenderTarget();
    const floorVisible = this.floor?.visible;
    const identity = new THREE.Matrix4().elements;
    // The modelled surfaces cast through ArchiveShadowCoverage only; give the
    // bake the same single caster so a card keeps the shadow of its own body.
    const shadow = this.shadowCoverage?.mesh;
    const savedShadowCount = shadow?.count ?? 0;
    const savedShadowMatrix = shadow?.instanceMatrix.array.slice(0, 16);

    // Cache the light baseline before the bake removes the scene fog.
    themeEnvironment(this.scene, this.renderer, themeAmount);
    matrix.array.set(identity, 0);
    matrix.needsUpdate = true;
    for (const inst of this.surfaceInstances) {
      inst.count = 1;
      inst.visible = true;
    }
    if (this.floor) this.floor.visible = false;
    if (shadow) {
      shadow.instanceMatrix.array.set(identity, 0);
      shadow.instanceMatrix.needsUpdate = true;
      shadow.count = 1;
    }
    // The array fog is anchored to the live camera, which sits far behind the
    // bake camera; a card inside its own projection must not be fogged.
    this.scene.fog = null;
    this.scene.updateMatrixWorld(true);
    for (const theme of [0, 1]) {
      themeEnvironment(this.scene, this.renderer, theme);
      themeAttribute.array[0] = theme;
      themeAttribute.needsUpdate = true;
      // onAfterRender restores the coverage counter, which is empty here.
      if (shadow) shadow.count = 1;
      this.renderer.shadowMap.needsUpdate = true;
      this.renderer.setRenderTarget(targets[theme]);
      this.renderer.render(this.scene, fit.camera);
    }
    this.renderer.setRenderTarget(savedTarget);
    themeEnvironment(this.scene, this.renderer, themeAmount);
    this.scene.fog = savedFog;
    if (this.floor && floorVisible !== undefined) this.floor.visible = floorVisible;
    if (shadow && savedShadowMatrix) {
      shadow.count = savedShadowCount;
      shadow.instanceMatrix.array.set(savedShadowMatrix, 0);
      shadow.instanceMatrix.needsUpdate = true;
    }
    this.renderer.shadowMap.needsUpdate = true;
    matrix.array.set(savedMatrix, 0);
    matrix.needsUpdate = true;
    themeAttribute.array[0] = savedTheme;
    themeAttribute.needsUpdate = true;
    this.surfaceInstances.forEach((inst, index) => {
      inst.count = savedCounts[index];
    });

    const material = createCardImpostorMaterial(
      targets[0].texture,
      targets[1].texture,
      fit.projector,
    );
    fit.geometry.setAttribute("archiveTheme", themeAttribute);
    const impostor = new THREE.InstancedMesh(
      fit.geometry,
      material,
      this.capacity,
    );
    impostor.instanceMatrix = matrix;
    impostor.name = "archive-impostor";
    impostor.castShadow = false;
    impostor.receiveShadow = false;
    impostor.frustumCulled = false;
    impostor.visible = false;
    this.scene.add(impostor);
    this.impostor = impostor;
    this.impostorTargets = targets;
    this.instances = [impostor, ...this.surfaceInstances];
  }

  /** Hand a fresh, theme-dressed assembly model to the viewer. */
  async createAssembly(themeAmount: number, clarity: number): Promise<AssemblyModel> {
    this.assemblyTemplate ??= new GLTFLoader()
      .loadAsync(publicAsset("assets/archive-assembly.glb"))
      .then((gltf) => {
        gltf.scene.updateMatrixWorld(true);
        return gltf.scene;
      })
      .catch((error) => {
        this.assemblyTemplate = undefined;
        throw error;
      });
    const template = await this.assemblyTemplate;
    const model = new THREE.Group();
    const meshes: THREE.Mesh[] = [];
    template.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const name = (object.material as THREE.Material).name.replace(
        /\.\d+$/,
        "",
      );
      const mesh = new THREE.Mesh(
        object.geometry.clone().applyMatrix4(object.matrixWorld),
        object.material,
      );
      mesh.userData.surface = name;
      mesh.userData.assemblyPart = object.userData.assemblyPart;
      model.add(mesh);
      meshes.push(mesh);
    });
    this.appearance.prepare(model);
    this.appearance.apply(model, 1);
    this.appearance.setClarity(model, clarity);
    this.appearance.setTheme(model, themeAmount);
    const canvas = document.createElement("canvas");
    canvas.width = this.labelCanvas.width;
    canvas.height = this.labelCanvas.height;
    canvas.getContext("2d")!.drawImage(this.labelCanvas, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.99, 0.46),
      new THREE.MeshBasicMaterial({
        map: texture,
        toneMapped: false,
        transparent: true,
        depthWrite: false,
      }),
    );
    label.position.set(-1.36, 3.04, 0.255);
    label.userData.assemblyPart = "cover";
    label.userData.themeAmount = themeMaterial(label.material, "Printed_Canvas");
    label.userData.themeAmount.value = themeAmount;
    model.add(label);
    meshes.push(label);
    return {
      model,
      setClarity: (value: number) => this.appearance.setClarity(model, value),
      dispose: () => {
        for (const mesh of meshes) {
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
        }
        texture.dispose();
      },
    };
  }

  /** Redraw the printed label of the selected file. */
  drawLabel(index: number) {
    if (!this.labelTexture) return;
    const c = this.labelCanvas.getContext("2d")!;
    c.fillStyle = "#e6e2d9";
    c.fillRect(0, 0, 1024, 440);
    c.fillStyle = "#171713";
    c.fillRect(12, 12, 1000, 6);
    c.fillRect(12, 419, 1000, 3);
    c.font = `bold 81px ${systemFontStack}`;
    c.fillText("RHINE LAB, LLC.", 22, 116);
    c.font = `32px ${systemFontStack}`;
    c.fillStyle = "#878476";
    c.fillText("INTERNAL DATABASE", 25, 174);
    c.fillStyle = "#171713";
    c.font = `bold 130px ${systemFontStack}`;
    c.fillText("NO." + String(index + 1).padStart(3, "0"), 22, 360);
    c.fillRect(782, 32, 221, 39);
    c.fillStyle = "#eee9de";
    c.font = `24px ${systemFontStack}`;
    c.fillText("R L / I S", 809, 61);
    c.fillStyle = "#171713";
    c.font = `bold 64px ${systemFontStack}`;
    c.fillText("INFO", 830, 143);
    c.drawImage(this.labelMark, 790, 242, 210, 98);
    this.labelTexture.needsUpdate = true;
  }

  private ensureInstanceCapacity(required: number) {
    if (required <= this.capacity) return;
    const capacity = Math.max(required, this.capacity * 2);
    const matrix = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 16), 16).setUsage(THREE.DynamicDrawUsage);
    matrix.array.set(this.instances[0].instanceMatrix.array);
    for (const inst of this.instances) {
      inst.dispose();
      inst.instanceMatrix = matrix;
    }
    const previousTheme = this.themeAttribute;
    this.themeAttribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    if (previousTheme) this.themeAttribute.array.set(previousTheme.array);
    for (const inst of this.instances) inst.geometry.setAttribute("archiveTheme", this.themeAttribute);
    this.matrices = new InstanceUpdates(matrix);
    this.themes = new InstanceUpdates(this.themeAttribute);
    this.capacity = capacity;
  }

  /** Interactive browsing draws the baked proxy; only the reference opening
   * turns its camera, so only that segment draws the modelled surfaces. */
  setCinematic(cinematic: boolean) {
    if (this.impostor) this.impostor.visible = !cinematic;
    for (const inst of this.surfaceInstances)
      inst.visible = cinematic;
  }
  /**
   * Pack the visible cells into the instanced buffers. Returns whether anything
   * that can change the image moved.
   */
  pack(frame: PackFrame): boolean {
    this.drawnCells = [];
    this.relayPoints.clear();
    this.drawCoverage.update(frame.camera);
    this.shadowCoverage?.begin();
    this.matrices ??= new InstanceUpdates(this.instances[0].instanceMatrix);
    if (this.themeAttribute) this.themes ??= new InstanceUpdates(this.themeAttribute);
    for (const cell of frame.cells) {
      const { row, lane } = cell;
      if (frame.hidden.has(cellKey(cell))) continue;
      const x = (lane - 2) * COLUMN_SPACING - frame.trackX;
      const y = -4.6 + frame.field(row, lane) + frame.hoverLift(cell) - frame.drop(cell);
      const z = (row - 15.5) * ROW_SPACING + frame.entryZ + frame.rail;
      if (frame.refine && !frame.intersects(x, y, z)) continue;

      const slope = frame.field(row + .5, lane) - frame.field(row - .5, lane);
      this.dummy.position.set(x, y, z);
      this.dummy.rotation.set(slope * .024 * (1 - frame.detail), 0, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      if (frame.relay) this.relayPoints.set(cellKey(cell), { cell: { ...cell }, point: new THREE.Vector3(0, 3.5, 0).applyMatrix4(this.dummy.matrix) });
      this.shadowCoverage?.add(this.dummy.matrix);
      if (!this.drawCoverage.contains(x, y, z)) continue;
      const i = this.drawnCells.length;
      this.ensureInstanceCapacity(i + 1);
      this.drawnCells.push(cell);
      this.themes?.scalar(i, frame.theme(cell));
      this.matrices!.set(i * 16, this.dummy.matrix.elements);
    }
    const countChanged = this.instances[0].count !== this.drawnCells.length;
    const visibleMatricesChanged = this.matrices!.commit();
    const shadowMatricesChanged = this.shadowCoverage?.commit() ?? false;
    const matricesChanged = visibleMatricesChanged || shadowMatricesChanged;
    for (const inst of this.instances) inst.count = this.drawnCells.length;
    // Picking uses only the first instanced surface. The other batches disable
    // renderer culling and do not need an O(n) bound recomputation each frame.
    if (matricesChanged || countChanged || !this.instances[0].boundingSphere) this.instances[0].computeBoundingSphere();
    this.themes?.commit();
    return matricesChanged;
  }
  /** A copy of the label canvas, for an outgoing copy's own texture. */
  copyLabel() {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 440;
    canvas.getContext("2d")!.drawImage(this.labelCanvas, 0, 0);
    return canvas;
  }
  /**
   * Drop the baked targets and the instance lists. Called before the scene
   * disposes its tree, which still owns every geometry and material.
   */
  releaseTargets() {
    for (const target of this.impostorTargets) target.dispose();
    this.impostorTargets = [];
    this.impostor = undefined;
    this.instances = [];
    this.surfaceInstances = [];
  }
  /** Forget the model and the shared assembly template after the tree teardown. */
  dispose() {
    this.group.clear();
    this.assemblyTemplate?.then(disposeThreeTree).catch(() => {});
    this.assemblyTemplate = undefined;
    this.shadowCoverage = undefined;
  }
}
