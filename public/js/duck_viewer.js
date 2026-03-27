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

const POND_RADIUS = 2.0;
const SWIM_RADIUS = 0.85;
const SWIM_SPEED  = 0.28; // multiplied by _clock

export class DuckViewer {
  constructor(containerEl, modelBaseUrl = "/models/") {
    this.containerEl = containerEl;
    this.modelBaseUrl = modelBaseUrl;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 12, 22);

    const w = containerEl.clientWidth;
    const h = containerEl.clientHeight || 400;

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.01, 100);
    this.camera.position.set(0, 0.8, 3.2);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    containerEl.appendChild(this.renderer.domElement);

    // Lighting
    this.scene.add(new THREE.AmbientLight(0xfff8e7, 0.8));
    const sun = new THREE.DirectionalLight(0xfff0c0, 1.6);
    sun.position.set(5, 9, 4);
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0x87ceeb, 0x4caf50, 0.55));

    this._buildScene();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0.2, 0);
    this.controls.minDistance = 1.0;
    this.controls.maxDistance = 8;
    this.controls.maxPolarAngle = Math.PI / 2.05;

    this.duckGroup = new THREE.Group();
    this.scene.add(this.duckGroup);
    this._duckObject = null;
    this._animHandle = null;
    this._clock = 0;

    this._startRenderLoop();
    this._listenResize();
  }

  _buildScene() {
    // ── Ground ───────────────────────────────────────────────
    const groundGeom = new THREE.PlaneGeometry(30, 30, 18, 18);
    const pos = groundGeom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      if (Math.sqrt(x * x + y * y) > POND_RADIUS + 0.8) {
        pos.setZ(i, (Math.random() - 0.5) * 0.5);
      }
    }
    groundGeom.computeVertexNormals();
    const ground = new THREE.Mesh(
      groundGeom,
      new THREE.MeshStandardMaterial({ color: 0x5aad5a, flatShading: true, roughness: 1.0 })
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    // ── Pond water ───────────────────────────────────────────
    const pond = new THREE.Mesh(
      new THREE.CircleGeometry(POND_RADIUS, 8),
      new THREE.MeshStandardMaterial({
        color: 0x29b6f6, roughness: 0.05, metalness: 0.15,
        transparent: true, opacity: 0.88,
      })
    );
    pond.rotation.x = -Math.PI / 2;
    pond.position.y = 0.02;
    this.scene.add(pond);

    // ── Rocks around pond edge ───────────────────────────────
    const rockColors = [0x78909c, 0x607d8b, 0x8d6e63, 0x795548, 0x90a4ae];
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const r     = POND_RADIUS + 0.1 + Math.random() * 0.35;
      const scale = 0.09 + Math.random() * 0.14;
      const rock  = new THREE.Mesh(
        new THREE.DodecahedronGeometry(scale, 0),
        new THREE.MeshStandardMaterial({ color: rockColors[i % rockColors.length], flatShading: true, roughness: 1.0 })
      );
      rock.position.set(Math.cos(angle) * r, scale * 0.5, Math.sin(angle) * r);
      rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      this.scene.add(rock);
    }

    // ── Lily pads ────────────────────────────────────────────
    const lilySpots = [
      { x:  0.30, z:  0.38 }, { x: -0.42, z:  0.18 },
      { x:  0.12, z: -0.50 }, { x:  1.30, z:  0.50 },
      { x: -1.40, z: -0.30 }, { x:  0.80, z: -1.30 },
      { x: -0.90, z:  1.20 }, { x:  1.50, z: -0.70 },
    ];
    for (const lp of lilySpots) {
      const r   = 0.16 + Math.random() * 0.09;
      const pad = new THREE.Mesh(
        new THREE.CircleGeometry(r, 7, 0.25, Math.PI * 1.75),
        new THREE.MeshStandardMaterial({ color: 0x388e3c, flatShading: true, roughness: 1.0, side: THREE.DoubleSide })
      );
      pad.rotation.x = -Math.PI / 2;
      pad.rotation.z = Math.random() * Math.PI * 2;
      pad.position.set(lp.x, 0.025, lp.z);
      this.scene.add(pad);

      if (Math.random() > 0.45) {
        const flower = new THREE.Mesh(
          new THREE.ConeGeometry(0.045, 0.07, 5),
          new THREE.MeshStandardMaterial({ color: Math.random() > 0.5 ? 0xf48fb1 : 0xfff176, flatShading: true })
        );
        flower.position.set(lp.x, 0.06, lp.z);
        this.scene.add(flower);
      }
    }

    // ── Reed / cattail clusters around pond ──────────────────
    const reedSpots = [
      { x: -2.1, z:  0.3 }, { x:  2.0, z: -0.8 },
      { x:  0.5, z:  2.2 }, { x: -0.8, z: -2.1 },
      { x:  2.4, z:  0.1 }, { x: -2.3, z: -0.5 },
      { x:  1.4, z:  1.8 }, { x: -1.6, z:  1.6 },
    ];
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x5d8a2e, flatShading: true });
    const headMat = new THREE.MeshStandardMaterial({ color: 0x5d3a1a, flatShading: true });
    for (const rp of reedSpots) {
      const count = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        const height = 0.35 + Math.random() * 0.25;
        const ox = (Math.random() - 0.5) * 0.28;
        const oz = (Math.random() - 0.5) * 0.28;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, height, 4), stemMat);
        stem.position.set(rp.x + ox, height / 2, rp.z + oz);
        this.scene.add(stem);
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.09, 5), headMat);
        head.position.set(rp.x + ox, height + 0.03, rp.z + oz);
        this.scene.add(head);
      }
    }

    // ── Background mountains ─────────────────────────────────
    const mountains = [
      { x: -8,   z: -11, h: 5.5, r: 3.8, c: 0x78909c },
      { x: -3.5, z: -10, h: 3.8, r: 2.6, c: 0x8d9ea8 },
      { x:  1,   z: -12, h: 6.5, r: 4.5, c: 0x607d8b },
      { x:  5,   z: -10, h: 4.2, r: 3.0, c: 0x8d9ea8 },
      { x:  9,   z: -11, h: 3.5, r: 2.8, c: 0x78909c },
    ];
    for (const m of mountains) {
      const mesh = new THREE.Mesh(
        new THREE.ConeGeometry(m.r, m.h, 6),
        new THREE.MeshStandardMaterial({ color: m.c, flatShading: true, roughness: 1.0 })
      );
      mesh.position.set(m.x, m.h / 2 - 0.6, m.z);
      this.scene.add(mesh);
    }

    // ── Pine trees ────────────────────────────────────────────
    const treePlots = [
      { x: -4.5, z: -2.2 }, { x:  4.5, z: -2.2 },
      { x: -5.5, z:  0.8 }, { x:  5.5, z:  0.8 },
      { x: -3.8, z: -4.5 }, { x:  3.8, z: -4.5 },
      { x: -6.5, z: -1.5 }, { x:  6.5, z: -1.5 },
      { x: -7.0, z:  0.2 }, { x:  7.0, z:  0.2 },
      { x: -4.0, z:  2.5 }, { x:  4.0, z:  2.5 },
      { x: -5.8, z: -3.5 }, { x:  5.8, z: -3.5 },
      { x: -2.8, z: -5.5 }, { x:  2.8, z: -5.5 },
      { x: -8.0, z: -2.0 }, { x:  8.0, z: -2.0 },
      { x: -7.5, z:  2.0 }, { x:  7.5, z:  2.0 },
      { x: -6.0, z:  3.5 }, { x:  6.0, z:  3.5 },
      { x: -3.2, z:  3.5 }, { x:  3.2, z:  3.5 },
      { x: -1.5, z: -6.0 }, { x:  1.5, z: -6.0 },
      { x: -4.8, z: -6.5 }, { x:  4.8, z: -6.5 },
    ];
    for (const t of treePlots) {
      this.scene.add(this._makeTree(t.x, t.z, 0.5 + Math.random() * 0.5));
    }
  }

  _makeTree(x, z, scale = 1) {
    const group = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6d4c41, flatShading: true });
    const pineColors = [0x2e7d32, 0x1b5e20, 0x33691e, 0x388e3c];
    const pineColor = pineColors[Math.floor(Math.random() * pineColors.length)];
    const pineMat = new THREE.MeshStandardMaterial({ color: pineColor, flatShading: true });

    // Trunk
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04 * scale, 0.07 * scale, 0.5 * scale, 5),
      trunkMat
    );
    trunk.position.set(0, 0.25 * scale, 0);
    group.add(trunk);

    // Three stacked cones for pine silhouette
    const layers = [
      { r: 0.42, h: 0.70, y: 0.50 },
      { r: 0.32, h: 0.60, y: 0.85 },
      { r: 0.20, h: 0.50, y: 1.12 },
    ];
    for (const l of layers) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(l.r * scale, l.h * scale, 6),
        pineMat
      );
      cone.position.set(0, l.y * scale, 0);
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
        const swimAngle = this._clock * SWIM_SPEED;

        // Swim around the pond
        this.duckGroup.position.x = Math.cos(swimAngle) * SWIM_RADIUS;
        this.duckGroup.position.z = Math.sin(swimAngle) * SWIM_RADIUS;

        // Face direction of travel (tangent to circle)
        const dx = -Math.sin(swimAngle);
        const dz =  Math.cos(swimAngle);
        this.duckGroup.rotation.y = Math.atan2(dx, dz);

        // Gentle bob
        this._duckObject.position.y = Math.sin(this._clock * 2.2) * 0.02;

        // Subtle side-to-side rock, like paddling
        this.duckGroup.rotation.z = Math.sin(this._clock * 4.0) * 0.035;
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
    const materials = await new Promise((res, rej) =>
      mtlLoader.load("duck.mtl", res, undefined, rej));
    materials.preload();

    const objLoader = new OBJLoader();
    objLoader.setMaterials(materials);
    objLoader.setPath(this.modelBaseUrl);
    const obj = await new Promise((res, rej) =>
      objLoader.load("duck.obj", res, undefined, rej));

    const b1 = new THREE.Box3().setFromObject(obj);
    const s1 = new THREE.Vector3();
    b1.getSize(s1);
    obj.scale.setScalar(0.45 / (Math.max(s1.x, s1.y, s1.z) || 1));

    const b2 = new THREE.Box3().setFromObject(obj);
    const c  = new THREE.Vector3();
    b2.getCenter(c);
    obj.position.sub(c);

    const b3 = new THREE.Box3().setFromObject(obj);
    obj.position.y -= b3.min.y;

    obj.traverse(child => {
      if (!child.isMesh) return;
      child.material = Array.isArray(child.material)
        ? child.material.map(m => m.clone())
        : child.material.clone();
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
      const set = (m, k) => {
        if (!m) return;
        if (m.color) m.color.set(cols[k] ?? cols[m.name] ?? "yellow");
        m.roughness = 1.0;
        m.metalness = 0.0;
      };
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
