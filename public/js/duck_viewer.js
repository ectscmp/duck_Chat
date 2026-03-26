// If Using with raw html must include this
/*        <script type="importmap">
            {
                "imports": {
                    "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
                    "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
                }
            }
        </script>
*/

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";

export class DuckViewer {
  constructor(containerEl, modelBaseUrl = "../models/") {
    this.containerEl = containerEl;
    this.modelBaseUrl = modelBaseUrl;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 12, 22);

    const w = containerEl.clientWidth;
    const h = containerEl.clientHeight || 400;

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.01, 100);
    this.camera.position.set(0, 1.3, 3.0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    containerEl.appendChild(this.renderer.domElement);

    // Warm sunlight
    this.scene.add(new THREE.AmbientLight(0xfff8e7, 0.75));
    const sun = new THREE.DirectionalLight(0xfff0c0, 1.6);
    sun.position.set(5, 9, 4);
    this.scene.add(sun);
    // Sky/ground hemisphere for colour bounce
    this.scene.add(new THREE.HemisphereLight(0x87ceeb, 0x4caf50, 0.55));

    this._buildScene();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0.8, 0);
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.8;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 8;
    this.controls.maxPolarAngle = Math.PI / 2.05;

    this.controls.addEventListener("start", () => { this.controls.autoRotate = false; });
    this.controls.addEventListener("end", () => {
      setTimeout(() => { this.controls.autoRotate = true; }, 3000);
    });

    this.duckGroup = new THREE.Group();
    this.scene.add(this.duckGroup);
    this._duckObject = null;
    this._animHandle = null;
    this._clock = 0;

    this._startRenderLoop();
    this._listenResize();
  }

  _buildScene() {
    // ── Low-poly ground ──────────────────────────────────────
    const groundGeom = new THREE.PlaneGeometry(28, 28, 16, 16);
    const pos = groundGeom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const dist = Math.sqrt(x * x + y * y);
      if (dist > 2.2) {
        pos.setZ(i, (Math.random() - 0.5) * 0.55);
      }
    }
    groundGeom.computeVertexNormals();
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x56a856,
      flatShading: true,
      roughness: 1.0,
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    // ── Background mountains ─────────────────────────────────
    const mountains = [
      { x: -8,  z: -11, h: 5.5, r: 3.8, c: 0x4a7a5a },
      { x: -3.5,z: -10, h: 3.8, r: 2.6, c: 0x5d8a6b },
      { x:  1,  z: -12, h: 6.5, r: 4.5, c: 0x3d6b4f },
      { x:  5,  z: -10, h: 4.2, r: 3.0, c: 0x5d8a6b },
      { x:  9,  z: -11, h: 3.5, r: 2.8, c: 0x4a7a5a },
    ];
    for (const m of mountains) {
      const geom = new THREE.ConeGeometry(m.r, m.h, 6);
      const mat  = new THREE.MeshStandardMaterial({ color: m.c, flatShading: true, roughness: 1.0 });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(m.x, m.h / 2 - 0.6, m.z);
      this.scene.add(mesh);
    }

    // ── Trees ────────────────────────────────────────────────
    const treePlots = [
      { x: -3.8, z: -1.5 }, { x:  3.8, z: -1.5 },
      { x: -4.8, z:  0.3 }, { x:  4.8, z:  0.3 },
      { x: -3.0, z: -3.5 }, { x:  3.0, z: -3.5 },
      { x: -6.2, z: -0.8 }, { x:  6.2, z: -0.8 },
      { x: -5.0, z: -4.0 }, { x:  5.0, z: -4.0 },
    ];
    for (const t of treePlots) {
      this.scene.add(this._makeTree(t.x, t.z, 0.75 + Math.random() * 0.55));
    }
  }

  _makeTree(x, z, scale = 1) {
    const group = new THREE.Group();

    // Trunk
    const trunkGeom = new THREE.CylinderGeometry(0.06 * scale, 0.10 * scale, 0.48 * scale, 5);
    const trunkMat  = new THREE.MeshStandardMaterial({ color: 0x6d4c41, flatShading: true });
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.y = 0.24 * scale;
    group.add(trunk);

    // Three stacked cone layers for a low-poly pine look
    const layers = [
      { r: 0.44, h: 0.58, y: 0.48, color: 0x2e7d32 },
      { r: 0.34, h: 0.52, y: 0.82, color: 0x388e3c },
      { r: 0.22, h: 0.46, y: 1.10, color: 0x43a047 },
    ];
    for (const l of layers) {
      const coneGeom = new THREE.ConeGeometry(l.r * scale, l.h * scale, 5);
      const coneMat  = new THREE.MeshStandardMaterial({ color: l.color, flatShading: true });
      const cone = new THREE.Mesh(coneGeom, coneMat);
      cone.position.y = l.y * scale;
      group.add(cone);
    }

    group.position.set(x, 0, z);
    return group;
  }

  _listenResize() {
    const fn = () => {
      const w = this.containerEl.clientWidth;
      const h = this.containerEl.clientHeight;
      if (!w || !h) return;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener("resize", fn);
    this._cleanupResize = () => window.removeEventListener("resize", fn);
  }

  _startRenderLoop() {
    const tick = () => {
      this._clock += 0.012;
      if (this._duckObject) {
        this._duckObject.position.y = Math.sin(this._clock) * 0.06;
      }
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this._animHandle = requestAnimationFrame(tick);
    };
    tick();
  }

  async loadModelOnce() {
    if (this._duckObject) return;

    const mtlLoader = new MTLLoader();
    mtlLoader.setPath(this.modelBaseUrl);
    const materials = await new Promise((res, rej) => mtlLoader.load("duck.mtl", res, undefined, rej));
    materials.preload();

    const objLoader = new OBJLoader();
    objLoader.setMaterials(materials);
    objLoader.setPath(this.modelBaseUrl);
    const obj = await new Promise((res, rej) => objLoader.load("duck.obj", res, undefined, rej));

    const b1 = new THREE.Box3().setFromObject(obj), s1 = new THREE.Vector3();
    b1.getSize(s1);
    obj.scale.setScalar(1.5 / (Math.max(s1.x, s1.y, s1.z) || 1));

    const b2 = new THREE.Box3().setFromObject(obj), c = new THREE.Vector3();
    b2.getCenter(c);
    obj.position.sub(c);

    const b3 = new THREE.Box3().setFromObject(obj);
    obj.position.y -= b3.min.y;

    obj.traverse(child => {
      if (!child.isMesh) return;
      child.material = Array.isArray(child.material)
        ? child.material.map(m => m.clone()) : child.material.clone();
    });

    this._duckObject = obj;
    this.duckGroup.add(this._duckObject);
  }

  setDuckColors(duck) {
    if (!this._duckObject) return;
    const isDerpy = !!duck.derpy;
    const cols = {
      head:         duck.body?.head       ?? "yellow",
      front_left:   duck.body?.frontLeft  ?? duck.body?.front1 ?? "yellow",
      front_right:  duck.body?.frontRight ?? duck.body?.front2 ?? "yellow",
      rear_left:    duck.body?.rearLeft   ?? duck.body?.back1  ?? "yellow",
      rear_right:   duck.body?.rearRight  ?? duck.body?.back2  ?? "yellow",
      eyes:         isDerpy ? "white" : "black",
      normal_pupil: "white", derpy_eyes: "black", beak: "orange",
    };
    this._duckObject.traverse(child => {
      if (!child.isMesh) return;
      const set = (m, k) => { if (m?.color) m.color.set(cols[k] ?? cols[m.name] ?? "yellow"); };
      const mat = child.material;
      if (Array.isArray(mat)) { for (const m of mat) { console.log(m); set(m, m.name); } }
      else set(mat, child.name);
    });
  }

  async showDuck(duck) {
    await this.loadModelOnce();
    this._duckObject.visible = true;
    this.setDuckColors(duck);
  }

  clearDuck() { if (this._duckObject) this._duckObject.visible = false; }

  destroy() {
    if (this._animHandle) cancelAnimationFrame(this._animHandle);
    if (this._cleanupResize) this._cleanupResize();
    this.renderer.dispose();
    this.containerEl.innerHTML = "";
  }
}
