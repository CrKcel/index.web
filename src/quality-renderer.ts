import * as THREE from "three";
import type { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { renderDimensions, type RenderQuality } from "./render-quality";

export function applyTextureQuality(
  root: THREE.Object3D,
  renderer: THREE.WebGLRenderer,
  quality: RenderQuality,
) {
  const maximum = Math.min(
    quality.anisotropy,
    renderer.capabilities.getMaxAnisotropy(),
  );
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture && !value.isRenderTargetTexture)
          textures.add(value);
      }
    }
  });
  for (const texture of textures) {
    if (texture.anisotropy === maximum) continue;
    texture.anisotropy = maximum;
    texture.needsUpdate = true;
  }
}

export function resizeQuality(
  renderer: THREE.WebGLRenderer,
  host: HTMLElement,
  quality: RenderQuality,
  composer?: EffectComposer,
) {
  const width = Math.max(1, host.clientWidth),
    height = Math.max(1, host.clientHeight);
  const dimensions = renderDimensions(
    quality,
    width,
    height,
    host.getBoundingClientRect().width / width,
    devicePixelRatio,
    renderer.capabilities.maxTextureSize,
  );
  renderer.setPixelRatio(dimensions.ratio);
  renderer.setSize(width, height);
  composer?.setPixelRatio(dimensions.ratio);
  composer?.setSize(width, height);
  renderer.transmissionResolutionScale = quality.transmission;
  host.dataset.renderQuality = JSON.stringify({
    ...dimensions,
    transmission: quality.transmission,
    anisotropy: Math.min(
      quality.anisotropy,
      renderer.capabilities.getMaxAnisotropy(),
    ),
  });
  return dimensions;
}
