import * as THREE from 'three';
import { TILE_PX } from './PixelPass';

/** Degrees the view is tilted away from straight down, looking north from the south. */
export const CAMERA_TILT_DEG = 32;
const DISTANCE = 60;
/** Screen pixels per art pixel, from far to close. */
const PIXEL_LEVELS = [1.5, 2, 2.5, 3, 3.5, 4, 5];

/**
 * Orthographic, near-top-down camera. North (−Z) is always screen-up; the view
 * never rotates. It eases toward the player and zooms with the mouse wheel.
 *
 * In pixel-art mode the frustum is sized so one tile is exactly 32 art pixels,
 * zoom steps between whole pixel scales, and the camera snaps to the art-pixel
 * grid so the scene never shimmers while scrolling.
 */
export class CameraController {
  readonly camera: THREE.OrthographicCamera;
  private target = new THREE.Vector3();
  private snapped = new THREE.Vector3();
  private offset: THREE.Vector3;
  private tiltCos: number;
  /** Smooth mode: half of the visible height in tiles. */
  private zoom = 5.6;
  private zoomTarget = 5.6;
  private screenW = 1;
  private screenH = 1;
  pixelMode = true;
  private pixelLevel = 3;
  /** Graphics setting Low: the farthest zoom-out steps are left out (graphics.ts). */
  private zoomOutCut = 0;

  constructor(x: number, z: number) {
    const tilt = THREE.MathUtils.degToRad(CAMERA_TILT_DEG);
    this.tiltCos = Math.cos(tilt);
    // camera sits slightly south of the target, looking down and a little north
    this.offset = new THREE.Vector3(0, Math.cos(tilt) * DISTANCE, Math.sin(tilt) * DISTANCE);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.target.set(x, 0, z);
    this.apply();
  }

  /** Picks the pixel scale that shows roughly 12 tiles of height. */
  private defaultPixelLevel(): number {
    const ideal = this.screenH / (12 * TILE_PX);
    let best = 0;
    PIXEL_LEVELS.forEach((p, i) => {
      if (Math.abs(p - ideal) < Math.abs(PIXEL_LEVELS[best] - ideal)) best = i;
    });
    return best;
  }

  resize(width: number, height: number): void {
    const first = this.screenH === 1;
    this.screenW = Math.max(1, width);
    this.screenH = Math.max(1, height);
    if (first) this.pixelLevel = this.defaultPixelLevel();
    this.applyProjection();
  }

  get pixelSize(): number {
    return PIXEL_LEVELS[this.pixelLevel];
  }

  /** Size of the low-resolution art buffer for pixel mode. */
  artSize(): { w: number; h: number } {
    return { w: Math.ceil(this.screenW / this.pixelSize), h: Math.ceil(this.screenH / this.pixelSize) };
  }

  /** Positive delta zooms out. */
  zoomBy(delta: number): void {
    if (this.pixelMode) {
      const step = delta > 0 ? -1 : 1;
      this.pixelLevel = THREE.MathUtils.clamp(this.pixelLevel + step, this.zoomOutCut, PIXEL_LEVELS.length - 1);
      this.applyProjection();
      return;
    }
    const factor = Math.pow(1.12, Math.sign(delta));
    this.zoomTarget = THREE.MathUtils.clamp(this.zoomTarget * factor, 3.5, this.maxZoom);
  }

  private get maxZoom(): number {
    return 12 * Math.pow(0.85, this.zoomOutCut);
  }

  /** Leaves out the `n` farthest zoom-out steps (a shorter view distance on Low graphics). */
  setZoomOutCut(n: number): void {
    this.zoomOutCut = Math.max(0, Math.min(n, PIXEL_LEVELS.length - 1));
    if (this.pixelLevel < this.zoomOutCut) this.pixelLevel = this.zoomOutCut;
    this.zoomTarget = Math.min(this.zoomTarget, this.maxZoom);
    this.applyProjection();
  }

  setPixelMode(on: boolean): void {
    this.pixelMode = on;
    if (!on) this.zoom = this.zoomTarget = this.camera.top;
    this.apply();
  }

  snapTo(x: number, z: number): void {
    this.target.set(x, 0, z);
    this.apply();
  }

  update(dt: number, x: number, z: number): void {
    const k = 1 - Math.exp(-dt * 9);
    this.target.x += (x - this.target.x) * k;
    this.target.z += (z - this.target.z) * k;
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-dt * 10));
    this.apply();
  }

  get focus(): THREE.Vector3 {
    return this.target;
  }

  private apply(): void {
    const t = this.snapped.copy(this.target);
    if (this.pixelMode) {
      const px = 1 / TILE_PX;
      t.x = Math.round(t.x / px) * px;
      const pz = px / this.tiltCos;
      t.z = Math.round(t.z / pz) * pz;
    }
    this.camera.position.copy(t).add(this.offset);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(t);
    this.applyProjection();
  }

  private applyProjection(): void {
    let h: number;
    let w: number;
    if (this.pixelMode) {
      const a = this.artSize();
      h = a.h / (2 * TILE_PX);
      w = a.w / (2 * TILE_PX);
    } else {
      h = this.zoom;
      w = h * (this.screenW / this.screenH);
    }
    const c = this.camera;
    if (c.top !== h || c.right !== w) {
      c.left = -w;
      c.right = w;
      c.top = h;
      c.bottom = -h;
      c.updateProjectionMatrix();
    }
  }
}
