import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const HAND_JOINT_RE = /thumb|index|middle|ring|pinky|wrist/i;
const BODY_COLOR = 0x7895c8;
const HAND_COLOR = 0xff7fa8;

function buildLights(scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.58));

  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(4, 8, 5);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xdde5ff, 0.72);
  fill.position.set(-5, 5, -4);
  scene.add(fill);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9bfd0, 0.42));
}

function bodyMaterial() {
  return new THREE.MeshPhongMaterial({
    color: BODY_COLOR,
    shininess: 24,
    specular: 0x202535,
    side: THREE.DoubleSide,
  });
}

function extractHandMesh(bodyMesh) {
  if (!bodyMesh?.isSkinnedMesh || !bodyMesh.skeleton) return null;

  const handBones = new Set();
  bodyMesh.skeleton.bones.forEach((bone, index) => {
    if (HAND_JOINT_RE.test(bone.name)) handBones.add(index);
  });
  if (!handBones.size) return null;

  const { skinIndex, skinWeight, position } = bodyMesh.geometry.attributes;
  const index = bodyMesh.geometry.index;
  if (!skinIndex || !skinWeight || !position || !index) return null;

  const handWeights = new Float32Array(position.count);
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    for (let influence = 0; influence < 4; influence += 1) {
      if (handBones.has(skinIndex.getComponent(vertex, influence))) {
        handWeights[vertex] += skinWeight.getComponent(vertex, influence);
      }
    }
  }

  const handIndices = [];
  for (let triangle = 0; triangle < index.count; triangle += 3) {
    const a = index.getX(triangle);
    const b = index.getX(triangle + 1);
    const c = index.getX(triangle + 2);
    if (Math.max(handWeights[a], handWeights[b], handWeights[c]) >= 0.25) {
      handIndices.push(a, b, c);
    }
  }
  if (!handIndices.length) return null;

  const geometry = bodyMesh.geometry.clone();
  geometry.setIndex(handIndices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshPhongMaterial({
    color: HAND_COLOR,
    shininess: 34,
    specular: 0x333333,
    side: THREE.DoubleSide,
    depthTest: true,
  });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.bind(bodyMesh.skeleton, bodyMesh.bindMatrix);
  mesh.renderOrder = 2;
  bodyMesh.parent?.add(mesh);
  return mesh;
}

function prepareModel(gltf) {
  const model = gltf.scene;
  const handBones = [];
  const skinnedMeshes = [];

  model.traverse((object) => {
    if (object.isMesh) {
      object.geometry?.computeVertexNormals();
      object.material = bodyMaterial();
      if (object.isSkinnedMesh) skinnedMeshes.push(object);
    }
    if (object.isBone && HAND_JOINT_RE.test(object.name)) handBones.push(object);
  });

  skinnedMeshes.forEach(extractHandMesh);
  return { model, handBones };
}

function computeHandFrame(model, handBones, clip, samples = 20) {
  const box = new THREE.Box3();
  const point = new THREE.Vector3();

  if (clip && handBones.length) {
    const mixer = new THREE.AnimationMixer(model);
    const action = mixer.clipAction(clip);
    action.play();

    for (let sample = 0; sample <= samples; sample += 1) {
      mixer.setTime((sample / samples) * clip.duration);
      model.updateMatrixWorld(true);
      handBones.forEach((bone) => {
        bone.getWorldPosition(point);
        box.expandByPoint(point);
      });
    }

    action.stop();
    mixer.uncacheClip(clip);
  } else {
    box.setFromObject(model);
  }

  if (box.isEmpty()) {
    return { center: new THREE.Vector3(0, 0.8, 0), radius: 0.5 };
  }

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.55 + 0.1;
  return { center, radius };
}

class MotionCard {
  constructor(clip, index) {
    this.clip = clip;
    this.index = index;
    this.loaded = false;
    this.visible = false;
    this.clock = new THREE.Clock();
    this.element = this.buildElement();
    this.observe();
  }

  buildElement() {
    const article = document.createElement("article");
    article.className = "motion-card";

    const viewport = document.createElement("div");
    viewport.className = "motion-viewport";
    viewport.innerHTML = `
      <div class="motion-loading">
        <span></span>
        Loading motion
      </div>
      <div class="motion-hint">Drag to orbit · scroll to zoom</div>`;
    article.appendChild(viewport);
    this.viewport = viewport;
    this.loading = viewport.querySelector(".motion-loading");

    const copy = document.createElement("div");
    copy.className = "motion-copy";
    copy.innerHTML = `
      <div class="motion-meta">
        <span>Example ${String(this.index + 1).padStart(2, "0")}</span>
        <span>${this.clip.duration_s.toFixed(1)} sec · 30 fps</span>
      </div>
      <h3>${this.clip.label}</h3>
      <p>${this.clip.short}</p>
      <button class="motion-details-toggle" type="button" aria-expanded="false">
        Show detailed caption
      </button>
      <p class="motion-details" hidden>${this.clip.medium}</p>`;
    article.appendChild(copy);

    const toggle = copy.querySelector(".motion-details-toggle");
    const details = copy.querySelector(".motion-details");
    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      toggle.textContent = expanded ? "Show detailed caption" : "Hide detailed caption";
      details.hidden = expanded;
    });

    return article;
  }

  observe() {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          this.visible = entry.isIntersecting;
          if (entry.isIntersecting && !this.loaded) this.load();
          if (entry.isIntersecting) this.start();
          else this.stop();
        });
      },
      { rootMargin: "220px", threshold: 0.02 },
    );
    observer.observe(this.element);
  }

  setupRenderer() {
    const width = Math.max(this.viewport.clientWidth, 260);
    const height = Math.max(this.viewport.clientHeight, 260);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf7f8fb);
    buildLights(this.scene);

    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.01, 100);
    this.camera.position.set(0, 1, -2);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.viewport.prepend(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = false;
    this.controls.minDistance = 0.35;
    this.controls.maxDistance = 5;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.viewport);
  }

  async load() {
    this.loaded = true;
    this.setupRenderer();

    try {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(this.clip.src);
      const { model, handBones } = prepareModel(gltf);
      const clip = gltf.animations?.[0] ?? null;
      const { center, radius } = computeHandFrame(model, handBones, clip);

      model.position.x -= center.x;
      model.position.z -= center.z;
      this.scene.add(model);

      const distance = Math.max(0.72, radius * 2.8);
      this.camera.position.set(0, center.y + radius * 0.28, -distance);
      this.controls.target.set(0, center.y, 0);
      this.controls.update();

      if (clip) {
        this.mixer = new THREE.AnimationMixer(model);
        const action = this.mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.play();
      }

      this.loading.remove();
      this.resize();
      if (this.visible) this.start();
    } catch (error) {
      console.error(`Could not load ${this.clip.src}`, error);
      this.loading.textContent = "Motion unavailable";
      this.loading.classList.add("is-error");
    }
  }

  resize() {
    if (!this.renderer) return;
    const width = this.viewport.clientWidth;
    const height = this.viewport.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (!this.renderer || this.frame) return;
    this.clock.start();
    const tick = () => {
      this.frame = requestAnimationFrame(tick);
      const delta = Math.min(this.clock.getDelta(), 0.05);
      this.mixer?.update(delta);
      this.controls?.update();
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  stop() {
    if (!this.frame) return;
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }
}

async function initializeGallery() {
  const gallery = document.querySelector("#motion-gallery");
  try {
    const response = await fetch("static/data/gallery.json");
    if (!response.ok) throw new Error(`Gallery manifest request failed: ${response.status}`);
    const clips = await response.json();
    gallery.replaceChildren();
    clips.forEach((clip, index) => {
      const card = new MotionCard(clip, index);
      gallery.appendChild(card.element);
    });
  } catch (error) {
    console.error(error);
    gallery.innerHTML =
      '<div class="gallery-loading is-error">Hand animations could not be loaded.</div>';
  }
}

initializeGallery();
