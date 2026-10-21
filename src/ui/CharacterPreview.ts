import * as THREE from 'three';
import type { Appearance } from '../game/player/appearance';
import { applyGear, type GearLook } from '../render/models/humanoid';
import { buildPlayerRig } from '../render/models/playerModel';
import type { BipedRig } from '../render/models/rigs';

/**
 * A turning 3D preview of a player character (the character designer), drawn at low
 * resolution like the game. Drag to turn it; it keeps turning slowly on its own.
 */
export class CharacterPreview {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-0.72, 0.72, 0.96, -0.96, 0.1, 30);
  private rig: BipedRig | null = null;
  private gear: GearLook | null = null;
  private raf = 0;
  private yaw = 0.4;
  private spin = 0.012;
  private drag: { x: number; yaw: number } | null = null;

  constructor(parent: HTMLElement, w = 84, h = 112) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'char-preview';
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.title = 'Drag to turn';
    parent.appendChild(this.canvas);
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: true, preserveDrawingBuffer: true });
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(w, h, false);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    } catch {
      this.renderer = null;
    }
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445533, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(-2, 4, 3);
    this.scene.add(sun);
    // a little from above, like the game camera
    this.camera.position.set(0, 2.9, 6);
    this.camera.lookAt(0, 0.86, 0);
    this.canvas.addEventListener('pointerdown', (e) => {
      this.drag = { x: e.clientX, yaw: this.yaw };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.drag) this.yaw = this.drag.yaw + (e.clientX - this.drag.x) * 0.02;
    });
    const up = () => (this.drag = null);
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);
    const tick = () => {
      if (!this.drag) this.yaw += this.spin;
      if (this.rig) this.rig.root.rotation.y = this.yaw;
      this.renderer?.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Turns the model by a step (the ⟲ ⟳ buttons). */
  turn(by: number): void {
    this.yaw += by;
  }

  /** Stops or restarts the slow turning. */
  setSpin(on: boolean): void {
    this.spin = on ? 0.012 : 0;
  }

  /** Worn equipment to show on the preview (null = plain clothes). */
  setGear(g: GearLook | null): void {
    this.gear = g;
    if (this.rig) applyGear(this.rig, g ?? { weapon: null, shield: null, armor: null, head: null, legs: null, feet: null });
  }

  set(a: Appearance): void {
    if (this.rig) this.scene.remove(this.rig.root);
    this.rig = buildPlayerRig(a);
    this.rig.root.position.y = -0.12;
    if (this.gear) applyGear(this.rig, this.gear);
    this.scene.add(this.rig.root);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
    this.canvas.remove();
  }
}
