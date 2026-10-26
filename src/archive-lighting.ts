import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// The archive and its independent viewer use the same studio illumination.
// Each renderer needs its own PMREM render target / WebGL texture.
export function createArchiveLighting(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  renderer.toneMappingExposure = 1.0;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environmentIntensity = 0.52;
  scene.add(new THREE.HemisphereLight("#fffaf5", "#b49b80", 0.5));
  const key = new THREE.DirectionalLight("#fff4e5", 1.7);
  key.position.set(-8, 14, 4);
  const fill = new THREE.DirectionalLight("#ffffff", 0.3);
  fill.position.set(7, 8, -10);
  scene.add(key, fill);
  return key;
}
