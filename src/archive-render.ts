// The archive render graph: the composited pass chain, the quality knobs that
// reshape it, and the frame-identity check that lets an unchanged image keep the
// previous canvas contents.
//
// The scene keeps the renderer itself (picking, relay projection and the impostor
// bake all read it) and the camera; everything that describes *how a frame is
// composited* lives here.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import type { LightingLook } from "./archive-lighting";
import { applyTextureQuality, resizeQuality } from "./quality-renderer";
import { RenderState } from "./render-state";
import { SharedDepthAO, SharedDepthBokeh } from "./shared-depth";
import type { RenderQuality } from "./render-quality";

export type RenderGraphOptions = {
  container: HTMLElement;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  light: THREE.DirectionalLight;
  look: LightingLook;
};

export type RenderFrame = {
  /** A changed instance buffer already proves the image changed. */
  matricesChanged: boolean;
  /** The reference opening always draws. */
  cinematic: boolean;
  themeAmount: number;
  subduedIndex: number;
  fogNear: number;
  fogFar: number;
  focus: number;
  aperture: number;
  /** Version of the instanced theme buffer; part of a baked card's identity. */
  themeVersion: number;
};

export class ArchiveRenderGraph {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly light: THREE.DirectionalLight;
  private readonly events = new AbortController();
  private readonly composer: EffectComposer;
  private ao: SharedDepthAO;
  private readonly bokeh: SharedDepthBokeh;
  private readonly smaa = new SMAAPass();
  private readonly renderState = new RenderState();
  private readonly shadowState = new RenderState();
  private renderedFrames = 0;
  private reusedFrames = 0;
  private aoKernelSize = 32;
  private appliedQuality = "";
  constructor(options: RenderGraphOptions) {
    this.container = options.container;
    this.renderer = options.renderer;
    this.scene = options.scene;
    this.camera = options.camera;
    this.light = options.light;
    // All composer passes see the same geometry within one application frame.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new SharedDepthAO(
      this.scene,
      this.camera,
      this.container.clientWidth,
      this.container.clientHeight,
    );
    this.ao.kernelRadius = options.look === "refined" ? 0.44 : 0.38;
    this.ao.minDistance = 0.001;
    this.ao.maxDistance = 0.09;
    this.composer.addPass(this.ao);
    this.bokeh = new SharedDepthBokeh(
      this.scene,
      this.camera,
      { focus: 25, aperture: 0.0018, maxblur: 0.011 },
      () => this.ao,
    );
    this.composer.addPass(this.bokeh);
    this.smaa.enabled = false;
    this.composer.addPass(this.smaa);
    this.composer.addPass(new OutputPass());
    // A lost context invalidates both snapshots: nothing may be reused.
    this.renderer.domElement.addEventListener(
      "webglcontextrestored",
      () => this.invalidate(),
      { signal: this.events.signal },
    );
  }
  get frames() {
    return { rendered: this.renderedFrames, reused: this.reusedFrames };
  }
  invalidate() {
    this.renderState.invalidate();
    this.shadowState.invalidate();
  }
  /** Depth-of-field inputs for the selected file at the current detail. */
  focus(modelPosition: THREE.Vector3, detail: number, depthOfField: number) {
    const focalPoint = modelPosition
      .clone()
      .add(new THREE.Vector3(0, 2, 0))
      .applyMatrix4(this.camera.matrixWorldInverse);
    return {
      focus: -focalPoint.z,
      aperture: (THREE.MathUtils.lerp(0.0003, 0.0008, detail) * depthOfField) / 100,
    };
  }
  /** Returns false when this quality is already applied. */
  applyQuality(quality: RenderQuality) {
    const key = JSON.stringify(quality);
    if (this.appliedQuality === key) return false;
    this.appliedQuality = key;
    if (quality.aoSamples && quality.aoSamples !== this.aoKernelSize) {
      const old = this.ao;
      this.ao = new SharedDepthAO(this.scene, this.camera, 1, 1, quality.aoSamples);
      this.ao.kernelRadius = old.kernelRadius;
      this.ao.minDistance = old.minDistance;
      this.ao.maxDistance = old.maxDistance;
      const index = this.composer.passes.indexOf(old);
      this.composer.removePass(old);
      this.composer.insertPass(this.ao, index);
      old.dispose();
      this.aoKernelSize = quality.aoSamples;
    }
    this.ao.enabled = quality.aoSamples > 0;
    this.bokeh.enabled = quality.depthOfField > 0;
    this.smaa.enabled = quality.antialias === "smaa";
    this.renderer.shadowMap.enabled = quality.shadows > 0;
    const size = Math.min(
      quality.shadows || 1024,
      this.renderer.capabilities.maxTextureSize,
    );
    if (this.light.shadow.mapSize.x !== size) {
      this.light.shadow.map?.dispose();
      this.light.shadow.map = null;
      this.light.shadow.mapSize.set(size, size);
    }
    this.light.shadow.needsUpdate = true;
    applyTextureQuality(this.scene, this.renderer, quality);
    return true;
  }
  /** Re-size the render targets for the current container and quality. */
  resize(quality: RenderQuality) {
    this.renderState.invalidate();
    const dimensions = resizeQuality(
      this.renderer,
      this.composer,
      this.container,
      quality,
    );
    this.ao.setSize(
      Math.max(1, Math.floor(dimensions.width * quality.aoResolution)),
      Math.max(1, Math.floor(dimensions.height * quality.aoResolution)),
    );
    this.ao.setSharing(this.ao.enabled && this.bokeh.enabled && quality.aoResolution === 1);
    this.container.dataset.renderQuality = JSON.stringify({
      ...JSON.parse(this.container.dataset.renderQuality!),
      aoSamples: this.ao.enabled ? this.aoKernelSize : 0,
      aoWidth: this.ao.width,
      aoHeight: this.ao.height,
      shadows: this.renderer.shadowMap.enabled
        ? this.light.shadow.mapSize.x
        : 0,
      depthOfField: this.bokeh.enabled ? quality.depthOfField : 0,
    });
  }
  /**
   * Composite one frame. Returns false when the composited canvas was reused
   * because every input that can change the image is identical.
   */
  render(frame: RenderFrame) {
    const uniforms = this.bokeh.uniforms as Record<string, { value: number }>;
    uniforms.focus.value = frame.focus;
    uniforms.aperture.value = frame.aperture;
    this.renderer.info.reset();
    // Keep all simulation and picking current. Reuse the composited canvas only
    // when its actual inputs are identical, including late textures and materials.
    const state = this.renderState;
    this.scene.updateMatrixWorld();
    if (frame.matricesChanged || frame.cinematic) {
      state.invalidate();
    } else {
      state.begin();
      state.floats(...this.camera.projectionMatrix.elements, ...this.camera.matrixWorldInverse.elements,
        ...this.camera.position.toArray(),
        frame.fogNear, frame.fogFar, frame.themeAmount, frame.subduedIndex,
        frame.focus, frame.aperture);
      this.scene.traverse(object => {
        state.add(object.id, Number(object.visible));
        if (!(object instanceof THREE.Mesh)) return;
        object.modelViewMatrix.multiplyMatrices(this.camera.matrixWorldInverse, object.matrixWorld);
        object.normalMatrix.getNormalMatrix(object.modelViewMatrix);
        state.floats(...object.modelViewMatrix.elements, ...object.normalMatrix.elements, ...object.matrixWorld.elements);
        // Baked cards carry their whole response in the projected map pair;
        // the instanced theme buffer below is their only animated input.
        if ((object.material as THREE.ShaderMaterial).isShaderMaterial) {
          state.add(object.geometry.id, object.material.uuid);
          if (object instanceof THREE.InstancedMesh)
            state.add(object.count, object.instanceMatrix.version, frame.themeVersion);
          return;
        }
        const mat = object.material as THREE.MeshPhysicalMaterial;
        // Three increments material.version for its own double-sided transmission
        // passes. Track application-controlled inputs, not that render-side counter.
        state.add(object.geometry.id, mat.uuid, mat.map?.uuid, mat.map?.version ?? 0);
        state.floats(
          mat.opacity, mat.roughness, mat.metalness, mat.transmission, mat.thickness,
          mat.attenuationDistance, mat.clearcoat, mat.clearcoatRoughness,
          mat.color.r, mat.color.g, mat.color.b,
          mat.attenuationColor?.r ?? 0, mat.attenuationColor?.g ?? 0, mat.attenuationColor?.b ?? 0);
        for (const name of ['appearance', 'glassClarity', 'themeAmount', 'subduedIndex'])
          state.floats(object.userData[name]?.value ?? 0);
        if (object instanceof THREE.InstancedMesh)
          state.add(object.count, object.instanceMatrix.version, frame.themeVersion);
      });
      if (!state.end()) {
        this.reusedFrames++;
        return false;
      }
    }
    this.renderedFrames++;
    const shadow = this.shadowState;
    shadow.begin();
    shadow.add(this.light.shadow.mapSize.x, Number(this.renderer.shadowMap.enabled));
    shadow.floats(...this.light.matrixWorld.elements, ...this.light.target.matrixWorld.elements);
    this.scene.traverseVisible(object => {
      if (!(object instanceof THREE.Mesh) || !object.castShadow) return;
      shadow.add(object.id, object.geometry.id);
      shadow.floats(...object.matrixWorld.elements);
      if (object instanceof THREE.InstancedMesh) shadow.add(object.count, object.instanceMatrix.version);
    });
    this.renderer.shadowMap.needsUpdate = shadow.end() || this.light.shadow.needsUpdate;
    this.composer.render();
    return true;
  }
  dispose() {
    this.events.abort();
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose();
  }
}
