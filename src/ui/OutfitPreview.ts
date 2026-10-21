import * as THREE from 'three';
import type { Outfit } from '../game/player/outfits';
import { buildOutfitRig } from '../render/models/humanoid';
import type { BipedRig } from '../render/models/rigs';

/** A small turning 3D preview of an outfit, drawn at low resolution like the game. */
export class OutfitPreview {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-0.9, 0.9, 1.15, -1.15, 0.1, 20);
  private rig: BipedRig | null = null;
  private raf = 0;
  private angle = 0.5;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'outfit-preview';
    this.canvas.width = 56;
    this.canvas.height = 72;
    parent.appendChild(this.canvas);
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: true });
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(56, 72, false);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    } catch {
      this.renderer = null;
    }
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445533, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(-2, 4, 3);
    this.scene.add(sun);
    this.camera.position.set(0, 1.2, 6);
    this.camera.lookAt(0, 1.0, 0);
    const tick = () => {
      this.angle += 0.02;
      if (this.rig) this.rig.root.rotation.y = Math.sin(this.angle) * 0.9;
      this.renderer?.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  set(o: Outfit): void {
    if (this.rig) this.scene.remove(this.rig.root);
    this.rig = buildOutfitRig(o);
    this.rig.root.position.y = -0.1;
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
