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
    targetAngle: -146,
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
    targetAngle: 146,
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
    targetAngle: -34,
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
    targetAngle: 34,
    cam: { dist: 0.78, lift: 0.88, yaw: 0.1 },
  },
];

const rad = (deg) => (deg * Math.PI) / 180;
const polar = (cx, cy, r, deg) => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))];
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

function sector(cx, cy, r0, r1, a0, a1) {
  const span = Math.max(0.05, a1 - a0);
  const large = span > 180 ? 1 : 0;
  const [x0, y0] = polar(cx, cy, r1, a0);
  const [x1, y1] = polar(cx, cy, r1, a0 + span);
  const [x2, y2] = polar(cx, cy, r0, a0 + span);
  const [x3, y3] = polar(cx, cy, r0, a0);
  return `M${x0.toFixed(2)},${y0.toFixed(2)}A${r1},${r1} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}L${x2.toFixed(2)},${y2.toFixed(2)}A${r0},${r0} 0 ${large} 0 ${x3.toFixed(2)},${y3.toFixed(2)}Z`;
}

function arcLine(cx, cy, r, a0, a1, reverse = false) {
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  if (!reverse) {
    const [x0, y0] = polar(cx, cy, r, a0);
    const [x1, y1] = polar(cx, cy, r, a1);
    return `M${x0.toFixed(2)},${y0.toFixed(2)}A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
  }
  const [x0, y0] = polar(cx, cy, r, a1);
  const [x1, y1] = polar(cx, cy, r, a0);
  return `M${x0.toFixed(2)},${y0.toFixed(2)}A${r},${r} 0 ${large} 0 ${x1.toFixed(2)},${y1.toFixed(2)}`;
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

// Shared offscreen WebGLRenderer so all 4 corner views use only 1 WebGL context
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

    // Compute front-facing yaw from hips or wrists
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

  // Build DOM structure inside container
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
        <svg class="ht-wheel-svg" viewBox="0 0 620 620" aria-label="RoMo Hands 54-category action taxonomy wheel"></svg>
        <div class="ht-wheel-hub">
          <span class="ht-hub-kicker" id="ht-hub-kicker">3-Level Taxonomy</span>
          <strong class="ht-hub-title" id="ht-hub-title">54 Categories</strong>
          <span class="ht-hub-sub" id="ht-hub-sub">2,050 Sub-Categories</span>
          <span class="ht-hub-pill" id="ht-hub-pill">541,929 Bimanual Clips</span>
        </div>
        <div class="ht-wheel-footer">
          <span><b>Ring 1</b> Category (54)</span>
          <span>·</span>
          <span><b>Ring 2</b> Sub-Category (2,050)</span>
          <span>·</span>
          <span><b>Ring 3</b> Atomic Action (156K)</span>
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
  const hubKicker = container.querySelector("#ht-hub-kicker");
  const hubTitle = container.querySelector("#ht-hub-title");
  const hubSub = container.querySelector("#ht-hub-sub");
  const hubPill = container.querySelector("#ht-hub-pill");
  const cards = [...container.querySelectorAll(".ht-card")];

  const CX = 310;
  const CY = 310;
  const R0 = 104;
  const R1 = 198;
  const SUB_R = [R1 + 10, R1 + 46];
  const ACT_R = [R1 + 54, R1 + 88];
  const SPOT_SPAN = 54;

  const defs = svgEl("defs", {}, svg);
  const gSlices = svgEl("g", {}, svg);
  const gSpots = svgEl("g", {}, svg);

  const slices = categories.map((c, i) => ({
    name: c.name,
    clips: c.clips,
    baseSpan: (c.clips / totalClips) * 360,
    color: slicePalette(i, categories.length),
  }));

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
  let hoveredSlice = null;
  let userPausedUntil = 0;

  slices.forEach((s, i) => {
    s.path = svgEl(
      "path",
      {
        fill: s.color,
        stroke: "#0b0c12",
        "stroke-width": 1.3,
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
        activeCorner = cornerBySliceIdx[i];
        userPausedUntil = performance.now() + 9000;
      }
      hubKicker.textContent = "Category";
      hubTitle.textContent = s.name;
      hubSub.textContent = `${s.clips.toLocaleString("en-US")} clips`;
      hubPill.textContent = `${((s.clips / totalClips) * 100).toFixed(1)}% of dataset`;
    });

    s.path.addEventListener("pointerleave", () => {
      hoveredSlice = null;
      updateHubForCorner(activeCorner);
    });

    s.path.addEventListener("click", () => {
      if (cornerBySliceIdx[i] !== undefined) {
        activeCorner = cornerBySliceIdx[i];
        userPausedUntil = performance.now() + 12000;
        updateHubForCorner(activeCorner);
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
        "fill-opacity": 0.44,
        stroke: "#0b0c12",
        "stroke-width": 1.4,
      },
      g,
    );
    const actPath = svgEl(
      "path",
      {
        fill: c.color,
        "fill-opacity": 0.24,
        stroke: "#0b0c12",
        "stroke-width": 1.4,
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

  function updateHubForCorner(ci) {
    if (hoveredSlice !== null) return;
    const c = CORNERS[ci];
    const s = slices[byName[c.cat]];
    hubKicker.textContent = `${c.cat} · ${s ? s.clips.toLocaleString("en-US") : ""} clips`;
    hubTitle.textContent = c.sub;
    hubSub.textContent = `Action: ${c.act}`;
    hubPill.textContent = `54 Categories · 2,050 Sub-Categories`;
  }

  cards.forEach((card, ci) => {
    card.addEventListener("pointerenter", () => {
      activeCorner = ci;
      userPausedUntil = performance.now() + 10000;
      updateHubForCorner(ci);
    });
    card.addEventListener("click", () => {
      activeCorner = ci;
      userPausedUntil = performance.now() + 14000;
      updateHubForCorner(ci);
    });
  });

  updateHubForCorner(0);

  // Measure text helper for fitting radial labels
  const measureCtx = document.createElement("canvas").getContext("2d");
  function fitSliceLabel(name, fontSize) {
    measureCtx.font = `700 ${fontSize}px Inter, sans-serif`;
    const w = measureCtx.measureText(name).width;
    return Math.min(1, (R1 - R0 - 16) / Math.max(1, w));
  }

  // Initialize 4 CornerHandViews
  const canvases = cards.map((card) => card.querySelector("canvas"));
  const views = canvases.map((canvas, i) => new CornerHandView(canvas, CORNERS[i]));
  Promise.all(views.map((v) => v.init())).catch((err) =>
    console.error("Error loading corner GLBs:", err),
  );

  // Smoothly animated weights and rotation angle
  const weights = [1, 0, 0, 0];
  let currentRot = 0;
  let initializedRot = false;
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

  let lastCycleSwitch = performance.now();

  function tick(now) {
    requestAnimationFrame(tick);
    if (!visible) return;

    // Auto-advance spotlight corner every 4.8s unless user hovered/clicked recently
    if (now > userPausedUntil && now - lastCycleSwitch > 4800) {
      activeCorner = (activeCorner + 1) % CORNERS.length;
      lastCycleSwitch = now;
      updateHubForCorner(activeCorner);
    }

    // Smoothly interpolate weights toward activeCorner
    for (let i = 0; i < CORNERS.length; i += 1) {
      const target = i === activeCorner ? 1 : 0;
      weights[i] += (target - weights[i]) * 0.09;
    }

    cards.forEach((card, i) => {
      card.classList.toggle("is-active", i === activeCorner);
    });

    // Compute fisheye spans
    const spans = slices.map((s) => s.baseSpan);
    spotEls.forEach((sp, j) => {
      spans[sp.idx] = lerp(spans[sp.idx], SPOT_SPAN, weights[j]);
    });
    const norm = 360 / spans.reduce((a, b) => a + b, 0);
    let acc = 0;
    const starts = spans.map((sp, i) => {
      spans[i] = sp * norm;
      const start = acc;
      acc += spans[i];
      return start;
    });

    // Compute target wheel rotation so active corner's slice points toward its corner card
    const activeSpot = spotEls[activeCorner];
    const activeMid = starts[activeSpot.idx] + spans[activeSpot.idx] / 2;
    const desiredRot = activeSpot.targetAngle - activeMid;

    if (!initializedRot) {
      currentRot = desiredRot;
      initializedRot = true;
    } else {
      currentRot += wrap180(desiredRot - currentRot) * 0.085;
    }

    // Update all 54 slices
    slices.forEach((s, i) => {
      const cornerIdx = cornerBySliceIdx[i];
      const sw = cornerIdx !== undefined ? weights[cornerIdx] : 0;
      const isHovered = hoveredSlice === i;
      const a0 = starts[i] + currentRot;
      const a1 = a0 + spans[i];
      const mid = (a0 + a1) / 2;

      const pushOut = sw * 8 + (isHovered ? 4 : 0);
      const ox = Math.cos(rad(mid)) * pushOut;
      const oy = Math.sin(rad(mid)) * pushOut;
      const rOuter = R1 + sw * 6 + (isHovered ? 3 : 0);

      s.path.setAttribute("d", sector(CX + ox, CY + oy, R0, rOuter, a0, a1));
      if (cornerIdx !== undefined && sw > 0.03) {
        s.path.setAttribute("fill", CORNERS[cornerIdx].color);
      } else if (isHovered) {
        s.path.setAttribute("fill", "#6d7cff");
      } else {
        s.path.setAttribute("fill", s.color);
      }
      s.path.setAttribute("opacity", (0.72 + 0.28 * Math.max(sw, isHovered ? 1 : 0)).toFixed(3));

      const showLabel = clamp((spans[i] - 6.2) / 1.8);
      const fc = Math.cos(rad(mid));
      const labelOpacity = Math.max(showLabel * 0.85, sw) * clamp(Math.abs(fc) / 0.16);
      s.label.setAttribute("opacity", labelOpacity.toFixed(3));
      if (labelOpacity > 0.02) {
        const [lx, ly] = polar(CX + ox, CY + oy, (R0 + rOuter) / 2 + 2, mid);
        const flip = fc < 0 ? 180 : 0;
        const baseFont = 10.5 + sw * 4.5;
        const fitted = baseFont * fitSliceLabel(s.name, baseFont);
        s.label.setAttribute(
          "transform",
          `translate(${lx.toFixed(1)},${ly.toFixed(1)}) rotate(${(mid + flip).toFixed(2)})`,
        );
        s.label.setAttribute("font-size", fitted.toFixed(1));
      }
    });

    // Update outer Ring 2 (Sub-Category) & Ring 3 (Atomic Action) arcs for the 4 spotlights
    spotEls.forEach((sp, j) => {
      const w = weights[j];
      if (w < 0.02) {
        sp.g.style.display = "none";
        return;
      }
      sp.g.style.display = "";
      const cAngle = starts[sp.idx] + currentRot + spans[sp.idx] / 2;
      const pushOut = w * 8;
      const ex = CX + Math.cos(rad(cAngle)) * pushOut;
      const ey = CY + Math.sin(rad(cAngle)) * pushOut;

      const subHalf = Math.max(24, spans[sp.idx] * 0.56) * w;
      const actHalf = Math.max(21, spans[sp.idx] * 0.48) * w;

      sp.subPath.setAttribute(
        "d",
        sector(ex, ey, SUB_R[0], SUB_R[1], cAngle - subHalf, cAngle + subHalf),
      );
      sp.actPath.setAttribute(
        "d",
        sector(ex, ey, ACT_R[0], ACT_R[1], cAngle - actHalf, cAngle + actHalf),
      );

      // Keep curved text upright on bottom half of wheel
      const reverseArc = Math.sin(rad(cAngle)) > 0.15;
      sp.subLine.setAttribute(
        "d",
        arcLine(ex, ey, (SUB_R[0] + SUB_R[1]) / 2, cAngle - 45, cAngle + 45, reverseArc),
      );
      sp.actLine.setAttribute(
        "d",
        arcLine(ex, ey, (ACT_R[0] + ACT_R[1]) / 2, cAngle - 45, cAngle + 45, reverseArc),
      );
      sp.subText.setAttribute("opacity", clamp((w - 0.35) / 0.5).toFixed(3));
      sp.actText.setAttribute("opacity", clamp((w - 0.5) / 0.45).toFixed(3));
    });

    // Render all 4 3D hand animations
    const tSec = now * 0.001;
    views.forEach((v, i) => v.render(tSec + i * 0.7));
  }

  requestAnimationFrame(tick);
}

initHeroTeaser();
