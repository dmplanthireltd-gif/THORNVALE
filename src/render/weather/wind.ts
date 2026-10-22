import * as THREE from 'three';

/**
 * Wind for vegetation and cloth: one set of uniforms shared by every swaying
 * material (trees, bushes, grass, crops, ferns, flowers, banners). The weather
 * view sets the strength and direction each frame; the vertex shaders bend
 * each instance by its height, with a per-tile phase so a forest ripples
 * instead of moving as one block. Nothing is allocated per frame.
 */
export const WIND = {
  time: { value: 0 },
  /** 0 = still air, 1 = blizzard / sandstorm. */
  strength: { value: 0.2 },
  /** Unit vector (x, z) the wind blows towards. */
  dir: { value: new THREE.Vector2(1, 0) },
  /** Weather effects off: everything stands still. */
  enabled: { value: 1 },
};

/** How a material bends: `amp` = sway at the reference height `ref` in still air and in a full gale. */
export interface WindProfile {
  calm: number;
  gale: number;
  ref: number;
  /** Extra quick flutter (leaves, grass). */
  flutter: number;
}

export const WIND_TREE: WindProfile = { calm: 0.012, gale: 0.16, ref: 2.2, flutter: 0.015 };
export const WIND_PALM: WindProfile = { calm: 0.02, gale: 0.22, ref: 2.2, flutter: 0.03 };
export const WIND_BUSH: WindProfile = { calm: 0.008, gale: 0.07, ref: 0.8, flutter: 0.01 };
export const WIND_GRASS: WindProfile = { calm: 0.02, gale: 0.11, ref: 0.22, flutter: 0.02 };
export const WIND_CROP: WindProfile = { calm: 0.025, gale: 0.13, ref: 0.55, flutter: 0.02 };
export const WIND_CLOTH: WindProfile = { calm: 0.03, gale: 0.16, ref: 1.2, flutter: 0.05 };

const f = (n: number) => n.toFixed(4);

/** GLSL that bends `p` (instance-space position, y = height above its floor) at world position `w`. */
function swayCode(pr: WindProfile, height: string): string {
  return /* glsl */ `
  {
    float wH = clamp(${height} / ${f(pr.ref)}, 0.0, 1.6);
    float wK = wH * wH * uWindOn;
    float wPh = wWorld.x * 0.71 + wWorld.z * 0.43;
    float wGust = 0.65 + 0.35 * sin(uWindTime * 0.9 + wWorld.x * 0.13 - wWorld.z * 0.09);
    float wAmp = mix(${f(pr.calm)}, ${f(pr.gale)}, uWindStrength) * wGust;
    float wS = sin(uWindTime * (1.3 + uWindStrength * 1.6) + wPh) * 0.55 + 0.45 * uWindStrength + 0.25;
    float wF = sin(uWindTime * 7.3 + wPh * 3.1) * ${f(pr.flutter)} * (0.4 + uWindStrength);
    vec2 wD = uWindDir * (wAmp * wS) + vec2(-uWindDir.y, uWindDir.x) * wF;
    wOffset = vec3(wD.x, -abs(wS) * wAmp * 0.12, wD.y) * wK;
  }`;
}

/**
 * Makes an instanced (or plain) material sway in the wind. `height` is the GLSL
 * expression for the height used to weight the bend (default: the
 * instance-space y, i.e. height above the floor).
 */
export function applyWind(material: THREE.Material, pr: WindProfile, height = 'wLocal.y'): void {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    shader.uniforms.uWindTime = WIND.time;
    shader.uniforms.uWindStrength = WIND.strength;
    shader.uniforms.uWindDir = WIND.dir;
    shader.uniforms.uWindOn = WIND.enabled;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;\nuniform float uWindStrength;\nuniform vec2 uWindDir;\nuniform float uWindOn;')
      .replace('#include <project_vertex>', /* glsl */ `
  vec4 wLocal = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    wLocal = batchingMatrix * wLocal;
  #endif
  #ifdef USE_INSTANCING
    wLocal = instanceMatrix * wLocal;
  #endif
  vec3 wWorld = (modelMatrix * wLocal).xyz;
  vec3 wOffset = vec3(0.0);
  ${swayCode(pr, height)}
  wLocal.xyz += wOffset;
  vec4 mvPosition = modelViewMatrix * wLocal;
  gl_Position = projectionMatrix * mvPosition;`);
  };
  // the wind code differs per profile, so programs must not be shared across profiles
  const key = `wind:${pr.calm}:${pr.gale}:${pr.ref}:${pr.flutter}:${height}`;
  const prevKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => prevKey() + key;
  material.needsUpdate = true;
}

/** Called once a frame by the weather view. */
export function setWind(time: number, strength: number, dirX: number, dirZ: number, enabled: boolean): void {
  WIND.time.value = time;
  WIND.strength.value = strength;
  const l = Math.hypot(dirX, dirZ) || 1;
  WIND.dir.value.set(dirX / l, dirZ / l);
  WIND.enabled.value = enabled ? 1 : 0;
}
