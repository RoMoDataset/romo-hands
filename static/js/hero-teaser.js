import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

const SVGNS = "http://www.w3.org/2000/svg";
const HAND_JOINT_RE = /thumb|index|middle|ring|pinky|wrist/i;
const TAXONOMY_URL = "static/data/taxonomy-romo-hands.json";

const CORNERS = [
  {
    id: "tl",
    slot: "top-left",
    cat: "Cooking",
    sub: "Stovetop Cooking",
    act: "Stir food in pot",
    tag: "stirring pot with spoon",
    short: "Stirs a mixture in a clay pot with a wooden spoon.",
    src: "static/gallery/hand-teaser-cooking.glb",
    color: "#ff5a36",
    cam: { dist: 0.78, lift: 0.72, yaw: 0.15 },
  },
  {
    id: "bl",
    slot: "bottom-left",
    cat: "Gestures",
    sub: "Emblematic Gesture",
    act: "Make thumbs up",
    tag: "thumbs up then thumbs down",
    short: "Gestures a thumbs up, then switches to a thumbs down.",
    src: "static/gallery/hand-teaser-gestures.glb",
    color: "#ff3370",
    cam: { dist: 0.82, lift: 0.36, yaw: -0.1 },
  },
  {
    id: "tr",
    slot: "top-right",
    cat: "Music",
    sub: "Keyboard Instruments",
    act: "Play piano",
    tag: "playing piano keys",
    short: "Sits at a piano and presses the keys with both hands.",
    src: "static/gallery/hand-example-02.glb",
    color: "#6d7cff",
    cam: { dist: 0.80, lift: 0.68, yaw: -0.15 },
  },
  {
    id: "br",
    slot: "bottom-right",
    cat: "Shopping",
    sub: "Checkout Process",
    act: "Handle money",
    tag: "counting change coins",
    short: "Counts coins on the counter with a precision grip.",
    src: "static/gallery/hand-example-03.glb",
    color: "#14b8a6",
    cam: { dist: 0.78, lift: 0.88, yaw: 0.1 },
  },
];

const rad = (deg) => (deg * Math.PI) / 180;
const polar = (cx, cy, r, deg) => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))];
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function sector(cx, cy, r0, r1, a0, a1) {
  const span = Math.max(0.05, a1 - a0);
  const large = span > 180 ? 1 : 0;
  const [x0, y0] = polar(cx, cy, r1, a0);
  const [x1, y1] = polar(cx, cy, r1, a0 + span);
  const [x2, y2] = polar(cx, cy, r0, a0 + span);
  const [x3, y3] = polar(cx, cy, r0, a0);
  return `M${x0.toFixed(2)},${y0.toFixed(2)}A${r1},${r1} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}L${x2.toFixed(2)},${y2.toFixed(2)}A${r0},${r0} 0 ${large} 0 ${x3.toFixed(2)},${y3.toFixed(2)}Z`;
}

function arcLine(cx, cy, r, a0, a1) {
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  return `M${x0.toFixed(2)},${y0.toFixed(2)}A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

const svgEl = (tag, attrs = {}, parent = null) => {
  const el = document.createElementNS(SVGNS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  parent?.appendChild(el);
  return el;
};

const slicePalette = (i, n = 54) => {
  const hue = lerp(248, 198, i / Math.max(1, n - 1));
  const sat = 24 + (i % 3) * 7;
  const light = 22 + (i % 2) * 6 + (i % 3) * 2;
  return `hsl(${hue.toFixed(1)} ${sat}% ${light}%)`;
};

let sharedRenderer = null;
const OFFSCREEN_W = 640;
const OFFSCREEN_H = 440;

function getSharedRenderer() {
  if (!sharedRenderer) {
    sharedRenderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    sharedRenderer.setPixelRatio(1);
    sharedRenderer.outputColorSpace = THREE.SRGBColorSpace;
    sharedRenderer.setClearColor(0x000000, 0);
    sharedRenderer.setSize(OFFSCREEN_W, OFFSCREEN_H, false);
  }
  return sharedRenderer;
}

const gltfCache = new Map();
function loadGLB(src) {
  if (!gltfCache.has(src)) {
    gltfCache.set(src, new GLTFLoader().loadAsync(src));
  }
  return gltfCache.get(src);
}

function frameFromBones(model, bones, clip, mixer, samples = 20) {
  const box = new THREE.Box3();
  const p = new THREE.Vector3();
  for (let s = 0; s <= samples; s += 1) {
    mixer.setTime((s / samples) * clip.duration * 0.999);
    model.updateMatrixWorld(true);
    bones.forEach((b) => box.expandByPoint(b.getWorldPosition(p)));
  }
  const size = box.getSize(new THREE.Vector3());
  return {
    center: box.getCenter(new THREE.Vector3()),
    radius: Math.max(size.x, size.y, size.z) * 0.54 + 0.06,
  };
}

class CornerHandView {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.config = config;
    this.ready = false;
    this.userYaw = 0;
    this.userPitch = 0;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.bindInteraction();
  }

  bindInteraction() {
    this.canvas.addEventListener("pointerdown", (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.userYaw += dx * 0.012;
      this.userPitch = clamp(this.userPitch + dy * 0.008, -0.6, 0.6);
    });
    const endDrag = () => {
      this.dragging = false;
    };
    this.canvas.addEventListener("pointerup", endDrag);
    this.canvas.addEventListener("pointercancel", endDrag);
  }

  async init() {
    const gltf = await loadGLB(this.config.src);
    const model = cloneSkinned(gltf.scene);
    this.model = model;

    const handColor = new THREE.Color(this.config.color);
    this.handMat = new THREE.MeshPhongMaterial({
      color: handColor,
      shininess: 48,
      specular: 0x382834,
      side: THREE.DoubleSide,
    });

    const bones = [];
    model.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.computeVertexNormals();
        o.material = this.handMat;
        o.frustumCulled = false;
      }
      if (o.isBone) bones.push(o);
    });

    this.bones = Object.fromEntries(bones.map((b) => [b.name, b]));
    this.handBones = bones.filter((b) => HAND_JOINT_RE.test(b.name));
    this.clip = gltf.animations[0];
    this.mixer = new THREE.AnimationMixer(model);
    this.mixer.clipAction(this.clip).play();

    this.handFrame = frameFromBones(
      model,
      this.handBones.length ? this.handBones : bones,
      this.clip,
      this.mixer,
    );
    model.position.x -= this.handFrame.center.x;
    model.position.z -= this.handFrame.center.z;
    this.handFrame.center.set(0, this.handFrame.center.y, 0);

    this.baseYaw = this.config.cam.yaw ?? 0;
    if (this.bones.left_hip && this.bones.right_hip) {
      this.mixer.setTime(this.clip.duration * 0.5);
      model.updateMatrixWorld(true);
      const lateral = this.bones.left_hip
        .getWorldPosition(new THREE.Vector3())
        .sub(this.bones.right_hip.getWorldPosition(new THREE.Vector3()));
      const forward = new THREE.Vector3().crossVectors(lateral, new THREE.Vector3(0, 1, 0));
      this.baseYaw += Math.atan2(-forward.x, -forward.z);
    }

    this.scene = new THREE.Scene();
    this.scene.add(model);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.85);
    key.position.set(-3, 6, -5);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xdbe4ff, 0.65);
    fill.position.set(5, 3, -2);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.9);
    rim.position.set(0, 4, 6);
    this.scene.add(rim);

    this.camera = new THREE.PerspectiveCamera(30, OFFSCREEN_W / OFFSCREEN_H, 0.01, 30);
    this.ready = true;
  }

  render(t) {
    if (!this.ready) return;
    const d = this.clip.duration;
    let tt = ((t % (2 * d)) + 2 * d) % (2 * d);
    if (tt > d) tt = 2 * d - tt;
    this.mixer.setTime(Math.min(tt, d - 1e-3));
    this.model.updateMatrixWorld(true);

    const fovRad = 30 * (Math.PI / 180);
    const fitDist = (this.handFrame.radius / Math.sin(fovRad / 2)) * 0.88;
    const dist = fitDist * (this.config.cam.dist ?? 0.8);
    const lift = this.config.cam.lift ?? 0.65;
    const orbit = this.baseYaw + this.userYaw + Math.sin(t * 0.55) * 0.22;
    const pitch = this.userPitch;

    const target = this.handFrame.center;
    this.camera.position.set(
      target.x + Math.sin(orbit) * dist * Math.cos(pitch),
      target.y + this.handFrame.radius * lift + Math.sin(pitch) * dist * 0.6,
      target.z - Math.cos(orbit) * dist * Math.cos(pitch),
    );
    this.camera.lookAt(target);

    const r = getSharedRenderer();
    r.render(this.scene, this.camera);

    const cw = this.canvas.width;
    const ch = this.canvas.height;
    this.ctx.clearRect(0, 0, cw, ch);
    this.ctx.drawImage(r.domElement, 0, 0, OFFSCREEN_W, OFFSCREEN_H, 0, 0, cw, ch);
  }
}

async function initHeroTeaser() {
  const container = document.getElementById("hero-interactive-teaser");
  if (!container) return;

  let taxData;
  try {
    const res = await fetch(TAXONOMY_URL);
    taxData = await res.json();
  } catch (err) {
    console.error("Failed to load taxonomy data for hero teaser:", err);
    return;
  }

  const categories = taxData.categories;
  const totalClips = categories.reduce((acc, c) => acc + c.clips, 0);

  container.innerHTML = `
    <div class="ht-stage">
      <div class="ht-col ht-col-left">
        ${CORNERS.slice(0, 2)
          .map(
            (c, idx) => `
          <article class="ht-card" data-corner="${idx}" style="--accent:${c.color}">
            <div class="ht-crumbs">
              <span class="ht-c0">${c.cat}</span>
              <i>›</i>
              <span class="ht-c1">${c.sub}</span>
              <i>›</i>
              <span class="ht-c2">${c.act}</span>
            </div>
            <div class="ht-canvas-wrap">
              <canvas width="520" height="340" aria-label="${c.act} 3D hand animation"></canvas>
              <span class="ht-orbit-hint">Drag to orbit</span>
            </div>
            <div class="ht-caption">
              <span class="ht-tag">L0 · “${c.tag}”</span>
              <p>${c.short}</p>
            </div>
          </article>
        `,
          )
          .join("")}
      </div>

      <div class="ht-center">
        <svg class="ht-wheel-svg" viewBox="0 0 500 604" aria-label="RoMo Hands 54-category action taxonomy wheel"></svg>
        <div class="ht-wheel-footer" aria-label="Three-level taxonomy rings">
          <div class="ht-ring-line"><b>Ring 1</b> · Category <span>(54 domains)</span></div>
          <div class="ht-ring-line"><b>Ring 2</b> · Sub-Category <span>(2,050 sub-categories)</span></div>
          <div class="ht-ring-line"><b>Ring 3</b> · Atomic Action <span>(156,220 actions)</span></div>
        </div>
      </div>

      <div class="ht-col ht-col-right">
        ${CORNERS.slice(2, 4)
          .map(
            (c, idx) => `
          <article class="ht-card" data-corner="${idx + 2}" style="--accent:${c.color}">
            <div class="ht-crumbs">
              <span class="ht-c0">${c.cat}</span>
              <i>›</i>
              <span class="ht-c1">${c.sub}</span>
              <i>›</i>
              <span class="ht-c2">${c.act}</span>
            </div>
            <div class="ht-canvas-wrap">
              <canvas width="520" height="340" aria-label="${c.act} 3D hand animation"></canvas>
              <span class="ht-orbit-hint">Drag to orbit</span>
            </div>
            <div class="ht-caption">
              <span class="ht-tag">L0 · “${c.tag}”</span>
              <p>${c.short}</p>
            </div>
          </article>
        `,
          )
          .join("")}
      </div>
    </div>
  `;

  const svg = container.querySelector(".ht-wheel-svg");
  const cards = [...container.querySelectorAll(".ht-card")];

  const CX = 250;
  const CY = 356;
  const R0 = 132;
  const R1 = 236;
  const SUB_R = [R1 + 12, R1 + 56];
  const ACT_R = [R1 + 64, R1 + 106];
  const SPOT_SPAN = 62;

  const defs = svgEl("defs", {}, svg);
  const radGrad = svgEl("radialGradient", { id: "ht-hub-grad", cx: "50%", cy: "50%", r: "50%" }, defs);
  svgEl("stop", { offset: "0%", "stop-color": "#181a28" }, radGrad);
  svgEl("stop", { offset: "100%", "stop-color": "#0d0f18" }, radGrad);

  const gSlices = svgEl("g", {}, svg);
  const gSpots = svgEl("g", {}, svg);
  const gHub = svgEl("g", { class: "ht-svg-hub" }, svg);

  svgEl(
    "circle",
    {
      cx: CX,
      cy: CY,
      r: R0 - 5,
      fill: "url(#ht-hub-grad)",
      stroke: "rgba(255, 255, 255, 0.14)",
      "stroke-width": 1.8,
    },
    gHub,
  );
  const hubTopNum = svgEl(
    "text",
    {
      x: CX,
      y: CY - 36,
      "text-anchor": "middle",
      "dominant-baseline": "central",
      class: "ht-svg-num-big",
    },
    gHub,
  );
  const hubTopLab = svgEl(
    "text",
    {
      x: CX,
      y: CY - 1,
      "text-anchor": "middle",
      "dominant-baseline": "central",
      class: "ht-svg-lab",
    },
    gHub,
  );
  const hubBotNum = svgEl(
    "text",
    {
      x: CX,
      y: CY + 36,
      "text-anchor": "middle",
      "dominant-baseline": "central",
      class: "ht-svg-num-sm",
    },
    gHub,
  );
  const hubBotLab = svgEl(
    "text",
    {
      x: CX,
      y: CY + 66,
      "text-anchor": "middle",
      "dominant-baseline": "central",
      class: "ht-svg-lab",
    },
    gHub,
  );

  function setDefaultHub(accentColor = "#ff3370") {
    hubTopNum.textContent = "54";
    hubTopNum.setAttribute("fill", accentColor);
    hubTopLab.textContent = "CATEGORIES";
    hubBotNum.textContent = "2,050";
    hubBotLab.textContent = "SUB-CATEGORIES";
  }

  let baseAcc = 0;
  const slices = categories.map((c, i) => {
    const baseSpan = (c.clips / totalClips) * 360;
    const baseStart = baseAcc;
    baseAcc += baseSpan;
    return {
      name: c.name,
      clips: c.clips,
      baseSpan,
      baseStart,
      baseMid: baseStart + baseSpan / 2,
      color: slicePalette(i, categories.length),
    };
  });

  const byName = Object.fromEntries(slices.map((s, i) => [s.name, i]));
  const cornerBySliceIdx = {};
  CORNERS.forEach((c, ci) => {
    const idx = byName[c.cat];
    if (idx !== undefined) {
      slices[idx].cornerIndex = ci;
      cornerBySliceIdx[idx] = ci;
    }
  });

  let activeCorner = 0;
  let displayedCorner = 0;
  let expandLevel = 1;
  let rotating = false;
  let rotStart = -90 - slices[byName[CORNERS[0].cat]].baseMid;
  let rotDelta = 0;
  let rotDuration = 0.42;
  let rotProgress = 1;
  let currentRot = rotStart;
  let hoveredSlice = null;
  let userPausedUntil = 0;
  let lastCycleSwitch = performance.now();

  function requestCorner(ci, pauseMs = 10000) {
    activeCorner = ci;
    userPausedUntil = performance.now() + pauseMs;
    lastCycleSwitch = performance.now();
  }

  slices.forEach((s, i) => {
    s.path = svgEl(
      "path",
      {
        fill: s.color,
        stroke: "#0b0c12",
        "stroke-width": 1.4,
        class: "ht-slice",
      },
      gSlices,
    );
    s.label = svgEl(
      "text",
      {
        class: "ht-slice-label",
        "text-anchor": "middle",
        "dominant-baseline": "middle",
      },
      gSlices,
    );
    s.label.textContent = s.name;

    s.path.addEventListener("pointerenter", () => {
      hoveredSlice = i;
      if (cornerBySliceIdx[i] !== undefined) {
        requestCorner(cornerBySliceIdx[i], 10000);
      }
      const cColor = cornerBySliceIdx[i] !== undefined ? CORNERS[cornerBySliceIdx[i]].color : "#6d7cff";
      hubTopNum.textContent = s.clips >= 10000 ? `${(s.clips / 1000).toFixed(1)}K` : s.clips.toLocaleString("en-US");
      hubTopNum.setAttribute("fill", cColor);
      hubTopLab.textContent = s.name.toUpperCase();
      hubBotNum.textContent = `${((s.clips / totalClips) * 100).toFixed(1)}%`;
      hubBotLab.textContent = "OF 542K CLIPS";
    });

    s.path.addEventListener("pointerleave", () => {
      hoveredSlice = null;
      setDefaultHub(CORNERS[displayedCorner].color);
    });

    s.path.addEventListener("click", () => {
      if (cornerBySliceIdx[i] !== undefined) {
        requestCorner(cornerBySliceIdx[i], 14000);
      }
    });
  });

  const spotEls = CORNERS.map((c, ci) => {
    const idx = byName[c.cat];
    const g = svgEl("g", {}, gSpots);
    const subPath = svgEl(
      "path",
      {
        fill: c.color,
        "fill-opacity": 0.46,
        stroke: "#0b0c12",
        "stroke-width": 1.5,
      },
      g,
    );
    const actPath = svgEl(
      "path",
      {
        fill: c.color,
        "fill-opacity": 0.26,
        stroke: "#0b0c12",
        "stroke-width": 1.5,
      },
      g,
    );
    const subArcId = `ht-sub-arc-${ci}`;
    const actArcId = `ht-act-arc-${ci}`;
    const subLine = svgEl("path", { id: subArcId, fill: "none" }, defs);
    const actLine = svgEl("path", { id: actArcId, fill: "none" }, defs);

    const mkArcText = (arcId, text, cls) => {
      const t = svgEl("text", { class: cls, "dominant-baseline": "middle" }, g);
      const tp = svgEl(
        "textPath",
        { href: `#${arcId}`, startOffset: "50%", "text-anchor": "middle" },
        t,
      );
      tp.textContent = text;
      return t;
    };

    const subText = mkArcText(subArcId, c.sub, "ht-arc-label ht-arc-sub");
    const actText = mkArcText(actArcId, c.act, "ht-arc-label ht-arc-act");

    return { ...c, idx, g, subPath, actPath, subLine, actLine, subText, actText };
  });

  cards.forEach((card, ci) => {
    card.addEventListener("pointerenter", () => {
      requestCorner(ci, 10000);
    });
    card.addEventListener("click", () => {
      requestCorner(ci, 14000);
    });
  });

  setDefaultHub(CORNERS[0].color);

  const measureCtx = document.createElement("canvas").getContext("2d");
  function fitSliceLabel(name, fontSize) {
    measureCtx.font = `700 ${fontSize}px Inter, sans-serif`;
    const w = measureCtx.measureText(name).width;
    return Math.min(1, (R1 - R0 - 18) / Math.max(1, w));
  }

  const canvases = cards.map((card) => card.querySelector("canvas"));
  const views = canvases.map((canvas, i) => new CornerHandView(canvas, CORNERS[i]));
  Promise.all(views.map((v) => v.init())).catch((err) =>
    console.error("Error loading corner GLBs:", err),
  );

  let visible = true;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        visible = e.isIntersecting;
      });
    },
    { rootMargin: "200px", threshold: 0.01 },
  );
  observer.observe(container);

  let lastFrameTime = performance.now();

  function startRotationTo(nextCorner) {
    displayedCorner = nextCorner;
    if (hoveredSlice === null) setDefaultHub(CORNERS[displayedCorner].color);
    const targetSlice = slices[spotEls[displayedCorner].idx];
    const desiredBaseRot = -90 - targetSlice.baseMid;
    rotStart = currentRot;
    rotDelta = wrap180(desiredBaseRot - currentRot);
    rotDuration = clamp(0.28 + (Math.abs(rotDelta) / 180) * 0.26, 0.30, 0.54);
    rotProgress = 0;
    rotating = true;
  }

  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameTime) / 1000));
    lastFrameTime = now;
    if (!visible) return;

    // Auto-cycle every 5.4s when idle and fully expanded
    if (
      !rotating &&
      displayedCorner === activeCorner &&
      expandLevel > 0.98 &&
      now > userPausedUntil &&
      now - lastCycleSwitch > 5400
    ) {
      activeCorner = (activeCorner + 1) % CORNERS.length;
      lastCycleSwitch = now;
    }

    // 3-phase choreography:
    // Phase 1: Collapse Ring 3 & Ring 2 at 12 o'clock before rotating
    // Phase 2: Rotate the compact 1-ring wheel to bring the next category to 12 o'clock
    // Phase 3: Expand Ring 2 & Ring 3 outward at 12 o'clock
    if (!rotating) {
      if (displayedCorner !== activeCorner) {
        expandLevel = Math.max(0, expandLevel - dt * 3.6);
        if (expandLevel <= 0.001) {
          expandLevel = 0;
          startRotationTo(activeCorner);
        }
      } else {
        expandLevel = Math.min(1, expandLevel + dt * 2.7);
      }
    } else {
      // If user picked a different corner mid-rotation (while rings are already collapsed), retarget smoothly
      if (displayedCorner !== activeCorner) {
        startRotationTo(activeCorner);
      }
      rotProgress = Math.min(1, rotProgress + dt / rotDuration);
      currentRot = rotStart + rotDelta * easeInOutCubic(rotProgress);
      if (rotProgress >= 1) {
        rotating = false;
        lastCycleSwitch = now;
      }
    }

    cards.forEach((card, i) => {
      card.classList.toggle("is-active", i === activeCorner);
    });

    const eSpan = easeInOutCubic(expandLevel);
    const spans = slices.map((s) => s.baseSpan);
    const dispSpot = spotEls[displayedCorner];
    spans[dispSpot.idx] = lerp(spans[dispSpot.idx], SPOT_SPAN, eSpan);

    const norm = 360 / spans.reduce((a, b) => a + b, 0);
    let acc = 0;
    const starts = spans.map((sp, i) => {
      spans[i] = sp * norm;
      const start = acc;
      acc += spans[i];
      return start;
    });

    // While stationary (collapsing or expanding at 12 o'clock), lock currentRot so the
    // active category stays pinned dead-center at -90 deg as it swells or shrinks.
    if (!rotating) {
      const dispMid = starts[dispSpot.idx] + spans[dispSpot.idx] / 2;
      currentRot = -90 - dispMid;
    }

    const spinDim = rotating ? Math.sin(rotProgress * Math.PI) * 0.35 : 0;

    slices.forEach((s, i) => {
      const isDisplayedSpot = i === dispSpot.idx;
      const sw = isDisplayedSpot ? eSpan : 0;
      const isTargetHighlight = cornerBySliceIdx[i] === displayedCorner;
      const isHovered = hoveredSlice === i;
      const a0 = starts[i] + currentRot;
      const a1 = a0 + spans[i];
      const mid = (a0 + a1) / 2;

      const pushOut = sw * 9 + (isHovered ? 4 : 0);
      const ox = Math.cos(rad(mid)) * pushOut;
      const oy = Math.sin(rad(mid)) * pushOut;
      const rOuter = R1 + sw * 7 + (isHovered ? 3 : 0);

      s.path.setAttribute("d", sector(CX + ox, CY + oy, R0, rOuter, a0, a1));
      if (isTargetHighlight) {
        s.path.setAttribute("fill", CORNERS[displayedCorner].color);
      } else if (isHovered) {
        s.path.setAttribute("fill", "#6d7cff");
      } else {
        s.path.setAttribute("fill", s.color);
      }
      s.path.setAttribute(
        "opacity",
        (0.72 + 0.28 * Math.max(isTargetHighlight ? 1 : 0, isHovered ? 1 : 0)).toFixed(3),
      );

      const showLabel = clamp((spans[i] - 6.0) / 1.8);
      const fc = Math.cos(rad(mid));
      const flipFade = clamp(Math.abs(fc + 0.32) / 0.18);
      const labelOpacity = Math.max(showLabel * (0.86 - spinDim) * flipFade, isTargetHighlight ? 1 : 0);
      s.label.setAttribute("opacity", labelOpacity.toFixed(3));
      if (labelOpacity > 0.02) {
        const [lx, ly] = polar(CX + ox, CY + oy, (R0 + rOuter) / 2 + 2, mid);
        const flip = isTargetHighlight && !rotating ? 0 : fc < -0.32 ? 180 : 0;
        const baseFont = 12.5 + sw * 5.0;
        const fitted = baseFont * fitSliceLabel(s.name, baseFont);
        s.label.setAttribute(
          "transform",
          `translate(${lx.toFixed(1)},${ly.toFixed(1)}) rotate(${(mid + flip).toFixed(2)})`,
        );
        s.label.setAttribute("font-size", fitted.toFixed(1));
      }
    });

    // Update outer Ring 2 (Sub-Category) & Ring 3 (Atomic Action):
    // They only appear for displayedCorner when !rotating and expandLevel > 0
    spotEls.forEach((sp, j) => {
      if (j !== displayedCorner || rotating || expandLevel <= 0.01) {
        sp.g.style.display = "none";
        return;
      }
      sp.g.style.display = "";

      // Ring 2 expands first (and collapses second); Ring 3 expands second (and collapses first)
      const g1 = easeOutCubic(clamp((expandLevel - 0.06) / 0.64));
      const g2 = easeOutCubic(clamp((expandLevel - 0.32) / 0.68));

      const cAngle = -90;
      const pushOut = eSpan * 9;
      const ex = CX + Math.cos(rad(cAngle)) * pushOut;
      const ey = CY + Math.sin(rad(cAngle)) * pushOut;

      const subHalf = Math.max(28, spans[sp.idx] * 0.58) * g1;
      const actHalf = Math.max(25, spans[sp.idx] * 0.50) * g2;

      const subR1 = lerp(SUB_R[0], SUB_R[1], g1);
      const actR1 = lerp(ACT_R[0], ACT_R[1], g2);

      sp.subPath.setAttribute(
        "d",
        g1 > 0.01 ? sector(ex, ey, SUB_R[0], subR1, cAngle - subHalf, cAngle + subHalf) : "",
      );
      sp.actPath.setAttribute(
        "d",
        g2 > 0.01 ? sector(ex, ey, ACT_R[0], actR1, cAngle - actHalf, cAngle + actHalf) : "",
      );

      sp.subLine.setAttribute(
        "d",
        arcLine(ex, ey, (SUB_R[0] + subR1) / 2, cAngle - 52, cAngle + 52),
      );
      sp.actLine.setAttribute(
        "d",
        arcLine(ex, ey, (ACT_R[0] + actR1) / 2, cAngle - 52, cAngle + 52),
      );
      sp.subText.setAttribute("opacity", clamp((g1 - 0.45) / 0.45).toFixed(3));
      sp.actText.setAttribute("opacity", clamp((g2 - 0.45) / 0.45).toFixed(3));
    });

    const tSec = now * 0.001;
    views.forEach((v, i) => v.render(tSec + i * 0.7));
  }

  requestAnimationFrame(tick);
}

initHeroTeaser();
