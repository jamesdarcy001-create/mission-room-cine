import * as THREE from "https://esm.sh/three@0.186.1";
import { RectAreaLightUniformsLib } from "https://esm.sh/three@0.186.1/addons/lights/RectAreaLightUniformsLib.js";
import { RoundedBoxGeometry } from "https://esm.sh/three@0.186.1/addons/geometries/RoundedBoxGeometry.js";
import { TDSLoader } from "https://esm.sh/three@0.186.1/addons/loaders/TDSLoader.js";
import { mergeGeometries, mergeVertices } from "https://esm.sh/three@0.186.1/addons/utils/BufferGeometryUtils.js";
import { CONFIG } from "./config.js";
import { createStoryState, ease, sampleStory } from "./story.js";
import { createSurfaces, editCanvasPoint, paintSurfaces, surfaceKeys } from "./screens.js";

const PERSON_URL = new URL("./models/lowpolyman.3ds", import.meta.url).href;
const params = new URLSearchParams(window.location.search);
const POSTER_MODE = params.has("poster");
const DEBUG_MODE = params.has("debug");
const QUALITY_LOCK = params.get("quality");

const UP = new THREE.Vector3(0, 1, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);

export function mountAll() {
  document.querySelectorAll(".mrc-cine").forEach((el) => {
    if (el.dataset.mrcMounted === "1") return;
    el.dataset.mrcMounted = "1";
    mount(el);
  });
}

// Auto-play timeline. The full story (power on, populate, select, edit,
// propagate, confirm) plays once. After a hold on the confirmed state, the
// screens crossfade back to the unedited, populated state (story.reset) and
// the change sequence replays from `loop.from`, forever. The populated state
// at `loop.from` is what the fade lands on, so the restart is seamless.
function storyClock(elapsed) {
  const end = CONFIG.storyEnd;
  const { from, hold, fade } = CONFIG.loop;
  if (elapsed <= end + hold) return { t: Math.min(elapsed, end), reset: 0 };
  const length = fade + (end - from) + hold;
  const p = (elapsed - end - hold) % length;
  if (p < fade) return { t: end, reset: ease.soft(p / fade) };
  return { t: Math.min(end, from + (p - fade)), reset: 0 };
}

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch (error) {
    return false;
  }
}

function mount(el) {
  const label = el.getAttribute("aria-label") || CONFIG.ariaLabel;
  if (el.getAttribute("role") === "img") el.removeAttribute("role");
  // The segment is a transparent box that sizes to its container (see
  // cine.css); the scene fits itself inside whatever size that is.
  const stage = document.createElement("div");
  stage.className = "mrc-cine__stage";
  stage.setAttribute("role", "img");
  stage.setAttribute("aria-label", label);
  el.append(stage);

  const ui = { el, stage, onScreen: false, started: false, destroyed: false };
  if (!hasWebGL()) return;

  const io = new IntersectionObserver((entries) => {
    ui.onScreen = entries.some((entry) => entry.isIntersecting);
    if (ui.onScreen && !ui.started) {
      ui.started = true;
      boot(ui).catch((error) => {
        console.error(error);
      });
    }
    if (ui.sync) ui.sync();
  }, { rootMargin: "200px" });
  io.observe(el);
  ui.io = io;
}

async function boot(ui) {
  await Promise.race([
    Promise.all([
      document.fonts.load('500 84px "MRC Cine Inter"'),
      document.fonts.load('400 34px "MRC Cine Inter"'),
      document.fonts.load('600 36px "MRC Cine Mono"'),
      document.fonts.load('400 24px "MRC Cine Mono"'),
    ]),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ]);
  if (!ui.el.isConnected || ui.destroyed) return;

  RectAreaLightUniformsLib.init();
  const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reduce = reduceQuery.matches && !POSTER_MODE;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const world = createWorld(ui.stage, coarse);
  const story = createStoryState();
  // Auto-play clock (seconds since the scene started running). Reduced motion
  // shows the confirmed end state, still.
  let elapsed = POSTER_MODE ? CONFIG.posterTime : reduce ? CONFIG.storyEnd : 0;
  // Debug only: ?debug&at=9 starts the clock at story second 9.
  if (DEBUG_MODE && params.has("at")) elapsed = parseFloat(params.get("at")) || 0;
  let t = elapsed;
  let tierIndex = Math.max(0, CONFIG.quality.tiers.findIndex((tier) => tier.id === QUALITY_LOCK));
  let raf = 0;
  let last = performance.now();
  let paintAcc = 1;
  let paintKeys = surfaceKeys(story);
  let lightAcc = 0;
  let destroyed = false;
  let posterFrames = 0;
  let posterSent = false;
  const bootAt = performance.now();
  let adaptLock = bootAt;
  const samples = [];
  const disposables = world.disposables;

  sampleStory(t, t, story);
  const startPoint = editCanvasPoint(story, false);
  story.cursorU = startPoint.u;
  story.cursorV = startPoint.v;
  paintSurfaces(world.surfaces, story);
  paintKeys = surfaceKeys(story);
  world.markTextures();
  applyTier(world, tierIndex, coarse);

  let debug;
  if (DEBUG_MODE) {
    window.__mrcWorld = world;
    debug = document.createElement("div");
    debug.className = "mrc-cine__debug";
    const read = document.createElement("p");
    debug.append(read);
    ui.stage.appendChild(debug);
    debug.read = read;
  }

  const resize = () => {
    const rect = ui.stage.getBoundingClientRect();
    const cssW = Math.max(2, rect.width);
    const cssH = Math.max(2, rect.height);
    const tier = CONFIG.quality.tiers[tierIndex];
    const cap = Math.min(tier.dprCap, coarse ? CONFIG.quality.touchDpr : CONFIG.quality.desktopDpr);
    const dpr = POSTER_MODE ? 1 : Math.min(window.devicePixelRatio || 1, cap);
    const bufW = POSTER_MODE ? 1920 : Math.round(cssW * dpr);
    const bufH = POSTER_MODE ? 1080 : Math.round(cssH * dpr);
    world.renderer.setPixelRatio(1);
    world.renderer.setSize(bufW, bufH, false);
    const aspect = POSTER_MODE ? 16 / 9 : cssW / cssH;
    world.camera.aspect = aspect;
    world.view = { cssW, cssH, aspect };
    world.camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(ui.stage);
  resize();

  const onLost = (event) => {
    event.preventDefault();
  };
  const onRestored = () => {
    if (destroyed) return;
    resize();
    world.markTextures();
    paintKeys = { left: "", right: "", overlay: "" };
  };
  world.renderer.domElement.addEventListener("webglcontextlost", onLost);
  world.renderer.domElement.addEventListener("webglcontextrestored", onRestored);
  const onVis = () => sync();
  document.addEventListener("visibilitychange", onVis);

  function sync() {
    const run = ui.onScreen && document.visibilityState !== "hidden" && !destroyed;
    if (run && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
    if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }
  ui.sync = sync;

  function loop(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    world.time += dt;
    // The intro (power on, populate) plays at its own pace; the looping change
    // sequence after it runs at `speed`.
    if (!POSTER_MODE && !reduce) elapsed += dt * (elapsed < CONFIG.loop.from ? CONFIG.introSpeed : CONFIG.speed);
    const clock = storyClock(elapsed);
    t = clock.t;
    sampleStory(t, t, story);
    story.reset = clock.reset;
    const point = editCanvasPoint(story, false);
    story.cursorU = point.u;
    story.cursorV = point.v;
    paintAcc += dt;
    const keys = surfaceKeys(story);
    const dirty = Object.keys(keys).filter((name) => keys[name] !== paintKeys[name]);
    if (dirty.length && paintAcc >= 1 / CONFIG.screen.maxFps) {
      paintAcc = 0;
      paintKeys = keys;
      paintSurfaces(world.surfaces, story, dirty);
      world.markTextures(dirty);
    }
    lightAcc += dt;
    if (lightAcc > 0.25) {
      lightAcc = 0;
      world.sampleLights(story);
    }
    const lightBlend = 1 - Math.exp(-dt * 5);
    // Each screen warms up with a slight swell past full, then settles.
    const warm = (b) => b * (1 + CONFIG.intro.warmSwell * Math.sin(Math.PI * b));
    world.lights.forEach((light, index) => {
      const bg = story.bgEach[index];
      light.intensity = CONFIG.room.rectIntensity * warm(bg) * Math.max(story.powerEach[index], bg);
      light.color.lerp(world.lightTargets[index], lightBlend);
    });
    world.screenMats.forEach((mat, i) => {
      mat.emissiveIntensity = 1.15 * warm(story.bgEach[i === 0 ? 0 : 2]);
    });
    world.centreMat.opacity = story.bgEach[1];
    world.overlayMat.opacity = story.bgEach[1];
    updateFrames(world, story);
    updateBeams(world, story);
    updateModel(world, story);
    updatePulse(world, story);
    updateCamera(world, story);
    renderModel(world);
    world.renderer.render(world.scene, world.camera);
    if (!ui.live) {
      ui.live = true;
      ui.stage.classList.add("is-live");
    }
    if (POSTER_MODE) capturePoster(world);
    if (debug) {
      const fps = dt > 0 ? Math.round(1 / dt) : 0;
      const pct = Math.round((t / CONFIG.storyEnd) * 100);
      debug.read.textContent = `${story.beat}  ${pct}%  ${fps} fps  ${CONFIG.quality.tiers[tierIndex].id}`;
    }
    adapt(now, dt);
    if (!ui.el.isConnected) destroy();
  }

  function capturePoster(target) {
    posterFrames += 1;
    if (posterSent || posterFrames < 8) return;
    posterSent = true;
    target.renderer.domElement.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = "poster.webp";
      link.click();
      const reader = new FileReader();
      reader.onload = () => {
        window.__mrcPosterData = reader.result;
      };
      reader.readAsDataURL(blob);
    }, "image/webp", 0.92);
  }

  function adapt(now, dt) {
    if (POSTER_MODE || QUALITY_LOCK || now - bootAt < CONFIG.quality.warmupMs || now < adaptLock) return;
    samples.push({ now, dt });
    while (samples.length && now - samples[0].now > CONFIG.quality.slowWindowMs) samples.shift();
    if (!samples.length || now - samples[0].now < CONFIG.quality.slowWindowMs - 80) return;
    const avg = samples.reduce((sum, sample) => sum + sample.dt, 0) / samples.length;
    if (avg > CONFIG.quality.slowFrameMs / 1000 && tierIndex < CONFIG.quality.tiers.length - 1) {
      tierIndex += 1;
      applyTier(world, tierIndex, coarse);
      resize();
      samples.length = 0;
      adaptLock = now + CONFIG.quality.slowWindowMs;
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    ui.destroyed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    ui.io.disconnect();
    document.removeEventListener("visibilitychange", onVis);
    world.renderer.domElement.removeEventListener("webglcontextlost", onLost);
    world.renderer.domElement.removeEventListener("webglcontextrestored", onRestored);
    world.presenter.dispose();
    disposables.geo.forEach((geo) => geo.dispose());
    disposables.mat.forEach((mat) => mat.dispose());
    disposables.tex.forEach((tex) => tex.dispose());
    world.modelTarget.dispose();
    world.renderer.dispose();
    world.renderer.forceContextLoss();
    world.renderer.domElement.remove();
    debug?.remove();
  }

  ui.stage.appendChild(world.renderer.domElement);
  sync();
}

function createWorld(stage, coarse) {
  const disposables = { geo: [], mat: [], tex: [] };
  const trackG = (geo) => {
    disposables.geo.push(geo);
    return geo;
  };
  const trackM = (mat) => {
    disposables.mat.push(mat);
    return mat;
  };
  const trackT = (tex) => {
    disposables.tex.push(tex);
    return tex;
  };
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "default",
    stencil: false,
    failIfMajorPerformanceCaveat: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = CONFIG.room.exposure;
  // Transparent: the host page shows through; there is no backdrop or floor.
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.08, 80);
  scene.add(new THREE.AmbientLight(CONFIG.color.graphite800, CONFIG.room.ambient));
  const hemi = new THREE.HemisphereLight(CONFIG.color.graphite700, CONFIG.color.stoneFloor, CONFIG.room.hemi);
  scene.add(hemi);


  const panelW = CONFIG.room.panelWidth;
  const panelH = CONFIG.room.panelHeight;
  const centerY = CONFIG.room.plinthHeight + panelH / 2;
  const angle = THREE.MathUtils.degToRad(CONFIG.room.wingAngleDeg);
  const surfaces = createSurfaces();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const makeCanvasTexture = (canvas) => {
    const tex = trackT(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    return tex;
  };
  const leftTex = makeCanvasTexture(surfaces.left.canvas);
  const rightTex = makeCanvasTexture(surfaces.right.canvas);
  const overlayTex = makeCanvasTexture(surfaces.overlay.canvas);

  const modelTarget = new THREE.WebGLRenderTarget(CONFIG.screen.modelTargetWidth, CONFIG.screen.modelTargetHeight);
  modelTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;
  modelTarget.texture.minFilter = THREE.LinearFilter;
  modelTarget.texture.magFilter = THREE.LinearFilter;
  modelTarget.texture.generateMipmaps = false;

  const screenMat = (tex) => trackM(new THREE.MeshStandardMaterial({
    color: 0x000000,
    roughness: 1,
    metalness: 0,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: 0,
  }));
  const leftMat = screenMat(leftTex);
  const rightMat = screenMat(rightTex);
  const centreMat = trackM(new THREE.MeshBasicMaterial({
    map: modelTarget.texture,
    toneMapped: true,
    transparent: true,
  }));
  const overlayMat = trackM(new THREE.MeshBasicMaterial({
    map: overlayTex,
    transparent: true,
    depthWrite: false,
    toneMapped: true,
  }));

  const backingMat = trackM(new THREE.MeshBasicMaterial({ color: 0x000000 }));
  const frameMat = trackM(new THREE.MeshStandardMaterial({
    color: CONFIG.color.graphite700,
    roughness: 0.46,
    metalness: 0.16,
  }));
  const plinthMat = trackM(new THREE.MeshStandardMaterial({
    color: CONFIG.color.graphite950,
    roughness: 0.94,
    metalness: 0,
  }));
  const mountMat = trackM(new THREE.MeshStandardMaterial({
    color: CONFIG.color.graphite800,
    roughness: 0.32,
    metalness: 0.45,
  }));

  const screens = {
    left: makeScreen("left"),
    centre: makeScreen("centre"),
    right: makeScreen("right"),
  };
  const lights = [screens.left, screens.centre, screens.right].map((entry) => entry.light);
  const frames = [screens.left, screens.centre, screens.right].flatMap((entry) => entry.frames);

  function makeScreen(side) {
    const group = new THREE.Group();
    const geo = trackG(new THREE.PlaneGeometry(panelW, panelH));
    const mat = side === "centre" ? centreMat : side === "left" ? leftMat : rightMat;
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);
    if (side === "left") {
      group.position.set(-panelW / 2, centerY, 0);
      group.rotation.y = angle;
      mesh.position.x = -panelW / 2;
    } else if (side === "right") {
      group.position.set(panelW / 2, centerY, 0);
      group.rotation.y = -angle;
      mesh.position.x = panelW / 2;
    } else {
      group.position.set(0, centerY, 0);
    }
    const x0 = mesh.position.x - panelW / 2;
    const x1 = mesh.position.x + panelW / 2;
    const y0 = -panelH / 2;
    const y1 = panelH / 2;
    const built = [];
    const addEdge = (axis, length, x, y) => {
      const edgeGeo = axis === "x"
        ? trackG(new THREE.BoxGeometry(length, 0.012, 0.012))
        : trackG(new THREE.BoxGeometry(0.012, length, 0.012));
      const edge = new THREE.Mesh(edgeGeo, frameMat);
      edge.position.set(x, y, 0.012);
      edge.userData = { axis, length, x, y, x0, y0 };
      group.add(edge);
      built.push(edge);
    };
    addEdge("x", panelW, (x0 + x1) / 2, y1);
    addEdge("y", panelH, x1, 0);
    addEdge("x", panelW, (x0 + x1) / 2, y0);
    addEdge("y", panelH, x0, 0);
    if (side === "centre") {
      // Opaque backing: the model texture fades in from transparent, and on a
      // transparent canvas the page would otherwise show through the screen.
      const backing = new THREE.Mesh(trackG(new THREE.PlaneGeometry(panelW, panelH)), backingMat);
      backing.position.z = -0.004;
      group.add(backing);
      const overlay = new THREE.Mesh(trackG(new THREE.PlaneGeometry(panelW, panelH)), overlayMat);
      overlay.position.z = 0.02;
      group.add(overlay);
    }
    scene.add(group);
    const light = new THREE.RectAreaLight("#faf9f5", 0, panelW * 0.92, panelH * 0.92);
    scene.add(light);
    addArchitecture(group, mesh);
    return { group, mesh, light, frames: built, side };
  }

  function addArchitecture(group, mesh) {
    const plinth = new THREE.Mesh(trackG(new THREE.BoxGeometry(panelW, CONFIG.room.plinthHeight, CONFIG.room.plinthDepth)), plinthMat);
    const fascia = new THREE.Mesh(trackG(new THREE.BoxGeometry(panelW, CONFIG.room.fasciaHeight, 0.14)), plinthMat);
    const mount = new THREE.Mesh(trackG(new RoundedBoxGeometry(0.3, 0.075, 0.26, 4, 0.03)), mountMat);
    const stem = new THREE.Mesh(trackG(new THREE.CylinderGeometry(0.008, 0.008, 0.6, 12)), mountMat);
    scene.add(plinth, fascia, mount, stem);
    group.userData.arch = { plinth, fascia, mount, stem, mesh };
  }

  // Projection beams: a soft pyramid from each lens to its screen's corners.
  // `along` runs 0 at the lens to 1 at the screen; `side` runs 0..1 across a face
  // so the pyramid's hard edges fade out.
  const beamMat = trackM(new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uOpacity: { value: 0 },
      uColor: { value: new THREE.Color(CONFIG.color.sand200) },
    },
    vertexShader: [
      "attribute float along; attribute float side;",
      "varying float vAlong; varying float vSide; varying vec3 vNormal; varying vec3 vView;",
      "void main(){",
      "  vAlong = along; vSide = side;",
      "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
      "  vView = normalize(-mv.xyz); vNormal = normalize(normalMatrix * normal);",
      "  gl_Position = projectionMatrix * mv;",
      "}",
    ].join("\n"),
    fragmentShader: [
      "varying float vAlong; varying float vSide; varying vec3 vNormal; varying vec3 vView;",
      "uniform float uOpacity; uniform vec3 uColor;",
      "void main(){",
      "  float facing = pow(abs(dot(vNormal, vView)), 0.8);",
      "  float edges = sin(3.14159 * clamp(vSide, 0.0, 1.0));",
      "  float falloff = mix(1.0, 0.18, pow(vAlong, 0.7)) * smoothstep(0.0, 0.025, vAlong);",
      "  gl_FragColor = vec4(uColor, facing * edges * falloff * uOpacity);",
      "}",
    ].join("\n"),
  }));
  const beams = [];
  [screens.left, screens.centre, screens.right].forEach(() => {
    const mesh = new THREE.Mesh(trackG(new THREE.BufferGeometry()), beamMat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    beams.push(mesh);
  });

  // Projector lenses and their glow.
  const lensMat = trackM(new THREE.MeshBasicMaterial({ color: CONFIG.color.sand200, toneMapped: false }));
  const glowTex = trackT(new THREE.CanvasTexture(glowCanvas()));
  glowTex.colorSpace = THREE.SRGBColorSpace;
  const glowMat = trackM(new THREE.SpriteMaterial({
    map: glowTex,
    color: CONFIG.color.sand200,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    opacity: 0,
  }));
  const lensGeo = trackG(new THREE.CylinderGeometry(0.026, 0.03, 0.012, 32));
  const glows = [];
  // One of each per projector, so they can power on in turn.
  const lensMats = [];
  const glowMats = [];

  const moteCount = 42;
  const motePositions = new Float32Array(moteCount * 3);
  const moteGeo = trackG(new THREE.BufferGeometry());
  moteGeo.setAttribute("position", new THREE.BufferAttribute(motePositions, 3));
  const moteMat = trackM(new THREE.PointsMaterial({
    color: CONFIG.color.ivory,
    size: 0.018,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  }));
  const motes = new THREE.Points(moteGeo, moteMat);
  scene.add(motes);
  const moteSeeds = Array.from({ length: moteCount }, (_, i) => ({
    beam: i % 3,
    along: Math.random(),
    ang: Math.random() * Math.PI * 2,
    rad: 0.1 + Math.random() * 0.7,
    phase: Math.random(),
  }));

  const shadowTex = trackT(new THREE.CanvasTexture(shadowCanvas()));
  shadowTex.colorSpace = THREE.SRGBColorSpace;
  const shadowMat = trackM(new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  }));
  const presenter = createPerson(CONFIG.figures.presenter.height, trackG, trackM);
  scene.add(presenter.root);
  const shadow = new THREE.Mesh(trackG(new THREE.CircleGeometry(0.28, 16)), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  presenter.root.add(shadow);

  const audience = createAudience(trackG, trackM);
  scene.add(audience.root);

  const pulseMat = trackM(new THREE.MeshBasicMaterial({
    color: CONFIG.color.accent,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  const pulse = new THREE.Mesh(trackG(new THREE.PlaneGeometry(0.24, 0.016)), pulseMat);
  scene.add(pulse);
  const trails = [0, 1, 2].map((i) => {
    const mat = trackM(pulseMat.clone());
    const mesh = new THREE.Mesh(trackG(new THREE.PlaneGeometry(0.16 - i * 0.03, 0.01)), mat);
    scene.add(mesh);
    return mesh;
  });

  const model = buildModel(trackG, trackM);
  const modelCamera = new THREE.PerspectiveCamera(26, 16 / 9, 0.1, 40);
  modelCamera.position.set(0.2, 1.62, 4.85);
  modelCamera.lookAt(0, 0.78, 0);


  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = 32;
  sampleCanvas.height = 18;
  const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
  const scratch = new THREE.Color();

  function placeArchitecture() {
    updateMatrices();
    [screens.left, screens.centre, screens.right].forEach((entry, index) => {
      const { mesh, light, group } = entry;
      const arch = group.userData.arch;
      const center = mesh.getWorldPosition(new THREE.Vector3());
      const normal = new THREE.Vector3(0, 0, 1).transformDirection(mesh.matrixWorld);
      light.position.copy(center);
      light.lookAt(center.clone().add(normal));
      const bottom = screenPoint(mesh, 0.5, 0, 0, new THREE.Vector3());
      arch.plinth.position.set(bottom.x + normal.x * 0.08, CONFIG.room.plinthHeight / 2, bottom.z + normal.z * 0.08);
      arch.plinth.rotation.y = group.rotation.y;
      const top = screenPoint(mesh, 0.5, 1, 0, new THREE.Vector3());
      arch.fascia.position.set(top.x, CONFIG.room.plinthHeight + panelH + CONFIG.room.fasciaHeight / 2, top.z);
      arch.fascia.rotation.y = group.rotation.y;
      arch.mount.position.copy(center).addScaledVector(normal, 1.15);
      arch.mount.position.y = CONFIG.room.plinthHeight + panelH + CONFIG.room.projectorRise;
      arch.mount.lookAt(center);
      arch.stem.position.copy(arch.mount.position);
      // The rod reaches the same ceiling line however low the projector hangs.
      arch.stem.scale.y = (CONFIG.room.ceilingRise - CONFIG.room.projectorRise) / 0.6;
      arch.stem.position.y += (CONFIG.room.ceilingRise - CONFIG.room.projectorRise) / 2 + 0.03;
      arch.mount.updateMatrixWorld(true);

      const lens = new THREE.Mesh(lensGeo, (lensMats[index] = trackM(lensMat.clone())));
      lens.rotation.x = Math.PI / 2;
      lens.position.z = 0.131;
      arch.mount.add(lens);
      const start = arch.mount.localToWorld(new THREE.Vector3(0, 0, 0.14));
      const glow = new THREE.Sprite((glowMats[index] = trackM(glowMat.clone())));
      glow.position.copy(start);
      glow.scale.setScalar(CONFIG.room.glowSize);
      scene.add(glow);
      glows.push(glow);

      const inset = 0.015;
      const corners = [[inset, inset], [1 - inset, inset], [1 - inset, 1 - inset], [inset, 1 - inset]]
        .map(([u, v]) => screenPoint(mesh, u, v, 0.03, new THREE.Vector3()));
      beams[index].geometry.dispose();
      beams[index].geometry = trackG(beamGeometry(start, corners));
      beams[index].material = trackM(beamMat.clone());
      const end = screenPoint(mesh, 0.5, 0.5, 0.03, new THREE.Vector3());
      const dir = end.clone().sub(start);
      const len = dir.length();
      beams[index].userData = { start, dir: dir.normalize(), len };
    });
  }

  function updateMatrices() {
    scene.updateMatrixWorld(true);
  }

  // Sampled a few times a second into targets; the loop eases each light's
  // colour toward its target so the spill never snaps.
  const lightTargets = [new THREE.Color(CONFIG.color.ivory), new THREE.Color(CONFIG.color.ivory), new THREE.Color(CONFIG.color.ivory)];
  function sampleLights(story) {
    averageInto(surfaces.left.canvas, lightTargets[0]);
    lightTargets[1].set(CONFIG.color.ivory).lerp(scratch.set(CONFIG.color.accent), story.resequence * 0.55);
    averageInto(surfaces.right.canvas, lightTargets[2]);
  }

  function averageInto(canvas, color) {
    sampleCtx.drawImage(canvas, 0, 0, 32, 18);
    const data = sampleCtx.getImageData(0, 0, 32, 18).data;
    let r = 0;
    let g = 0;
    let b = 0;
    const count = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    color.setRGB(r / count / 255, g / count / 255, b / count / 255);
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    color.setHSL(hsl.h, Math.min(0.45, hsl.s * 1.2), Math.max(0.42, Math.min(0.7, hsl.l + 0.28)));
  }

  placeArchitecture();
  placePerson(presenter, screens.left.mesh);
  updateMatrices();

  // World-space points the camera must keep in frame, rods included.
  const boxPoints = (object) => {
    // Precise: from the vertices, so the angled wings do not pad the frame.
    const box = new THREE.Box3().setFromObject(object, true);
    const out = [];
    [box.min.x, box.max.x].forEach((x) => [box.min.y, box.max.y].forEach((y) => [box.min.z, box.max.z].forEach((z) => {
      out.push(new THREE.Vector3(x, y, z));
    })));
    return out;
  };
  const screenFit = (entry) => {
    const arch = entry.group.userData.arch;
    return [entry.mesh, arch.plinth, arch.fascia, arch.mount, arch.stem].flatMap(boxPoints);
  };
  const personFit = boxPoints(presenter.root);
  const fitSets = {
    left: [...screenFit(screens.left), ...personFit],
    centre: screenFit(screens.centre),
    right: screenFit(screens.right),
    audience: audience.fit.flatMap(boxPoints),
  };
  fitSets.all = [...fitSets.left, ...fitSets.centre, ...fitSets.right, ...fitSets.audience];
  fitSets.each = [screens.left, screens.centre, screens.right].map((entry) => boxPoints(entry.mesh));

  const clockVectors = {
    tip: new THREE.Vector3(),
    dir: new THREE.Vector3(),
    hit: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    plane: new THREE.Vector3(),
    local: new THREE.Vector3(),
    aim: new THREE.Vector3(),
    shoulder: new THREE.Vector3(),
    elbow: new THREE.Vector3(),
    pole: new THREE.Vector3(),
    axis: new THREE.Vector3(),
    binormal: new THREE.Vector3(),
    q1: new THREE.Quaternion(),
    q2: new THREE.Quaternion(),
    parentQ: new THREE.Quaternion(),
    camPos: new THREE.Vector3(),
    look: new THREE.Vector3(),
    offset: new THREE.Vector3(),
    mote: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    bitangent: new THREE.Vector3(),
    lens: new THREE.Color(),
    fitA: new THREE.Vector3(),
    fitB: new THREE.Vector3(),
    fitC: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),
    forward: new THREE.Vector3(),
  };

  return {
    renderer,
    scene,
    camera,
    presenter,
    audience,
    screens,
    lights,
    frames,
    beams,
    beamMat,
    lensMats,
    glows,
    glowMats,
    fitSets,
    motes,
    motePositions,
    moteSeeds,
    pulse,
    trails,
    model,
    modelCamera,
    modelTarget,
    surfaces,
    centreMat,
    overlayMat,
    screenMats: [leftMat, rightMat],
    disposables,
    view: { cssW: 16, cssH: 9, aspect: 16 / 9, portrait: false },
    tmp: clockVectors,
    updateMatrices,
    sampleLights,
    lightTargets,
    time: 0,
    markTextures(only) {
      const textures = { left: leftTex, right: rightTex, overlay: overlayTex };
      Object.keys(textures).forEach((name) => {
        if (!only || only.includes(name)) textures[name].needsUpdate = true;
      });
    },
  };
}

function screenPoint(mesh, u, v, z, out) {
  out.set((u - 0.5) * CONFIG.room.panelWidth, (v - 0.5) * CONFIG.room.panelHeight, z);
  mesh.localToWorld(out);
  return out;
}

// The person is there for scale only. They stand right beside the left screen's
// outer edge, in line with it, and face the way that screen faces, so their
// shoulders run parallel to it.
function placePerson(figure, mesh) {
  const edge = screenPoint(mesh, 0, 0, 0, new THREE.Vector3());
  const along = screenPoint(mesh, 1, 0, 0, new THREE.Vector3()).sub(edge).setY(0).normalize();
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(mesh.matrixWorld).setY(0).normalize();
  const { outset, forward } = CONFIG.figures.presenter;
  figure.root.position.copy(edge).addScaledVector(along, -outset).addScaledVector(normal, forward);
  figure.root.position.y = 0;
  figure.root.lookAt(figure.root.position.clone().add(normal));
}

function updateFrames(world, story) {
  world.frames.forEach((edge, index) => {
    const order = index % 4;
    const p = ease.expo(Math.min(1, Math.max(0, (story.frameLinear - order * 0.12) / 0.55)));
    const data = edge.userData;
    if (data.axis === "x") {
      edge.scale.x = Math.max(p, 0.001);
      edge.position.x = data.x0 + (data.length * p) / 2;
      if (data.y < 0) edge.position.x = data.x0 + data.length - (data.length * p) / 2;
    } else {
      edge.scale.y = Math.max(p, 0.001);
      const fromBottom = data.x > 0;
      edge.position.y = fromBottom
        ? data.y0 + (data.length * p) / 2
        : data.y0 + data.length - (data.length * p) / 2;
    }
    edge.visible = story.frameLinear > 0.01;
  });
}

function updateBeams(world, story) {
  const tier = world.tier || CONFIG.quality.tiers[0];
  // Beams are a few additive triangles, so they stay on at every tier; only the motes drop.
  // Each projector powers on in turn: the lens flashes as it strikes, then
  // the beam fills in with its screen.
  let anyOn = 0;
  world.beams.forEach((beam, i) => {
    const power = story.powerEach[i];
    const on = power * Math.max(story.bgEach[i], 0.35 * power);
    const flash = 1 + CONFIG.intro.lensFlash * Math.sin(Math.PI * power) * (1 - story.bgEach[i]);
    const opacity = CONFIG.room.beamOpacity * on;
    beam.material.uniforms.uOpacity.value = opacity;
    beam.visible = opacity > 0.001;
    world.lensMats[i].color.set(CONFIG.color.graphite700).lerp(world.tmp.lens.set(CONFIG.color.sand200).multiplyScalar(CONFIG.room.lensBoost), Math.min(1, power * 1.4));
    world.glowMats[i].opacity = CONFIG.room.glowOpacity * Math.max(on, power * 0.6) * flash;
    world.glows[i].visible = power > 0.01;
    anyOn = Math.max(anyOn, opacity);
  });
  world.motes.visible = tier.motes && anyOn > 0.001;
  if (!world.motes.visible) return;
  const attr = world.motes.geometry.attributes.position;
  world.moteSeeds.forEach((seed, i) => {
    const beam = world.beams[seed.beam];
    const data = beam.userData;
    if (!data?.dir) return;
    const along = (seed.phase + world.time * CONFIG.room.moteSpeed) % 1;
    world.tmp.mote.copy(data.start).addScaledVector(data.dir, along * data.len);
    world.tmp.tangent.crossVectors(Math.abs(data.dir.y) > 0.85 ? AXIS_X : UP, data.dir).normalize();
    world.tmp.bitangent.crossVectors(data.dir, world.tmp.tangent);
    const radius = seed.rad * along;
    world.tmp.mote.addScaledVector(world.tmp.tangent, Math.cos(seed.ang) * radius);
    world.tmp.mote.addScaledVector(world.tmp.bitangent, Math.sin(seed.ang) * radius);
    attr.setXYZ(i, world.tmp.mote.x, world.tmp.mote.y, world.tmp.mote.z);
  });
  attr.needsUpdate = true;
}

function updateModel(world, story) {
  // Continuous turn on the clock, so the loop restart never jumps it.
  world.model.root.rotation.y = world.time * CONFIG.model.yawRate;
  world.model.levels.forEach((level, index) => {
    const shown = story.modelLevel[index];
    const active = index === CONFIG.model.activeLevel;
    const blue = active ? story.resequence * (1 - story.reset) : 0;
    level.ivory.material.opacity = shown * (active ? 1 - blue : 1);
    level.ivory.position.y = level.baseY + (1 - shown) * 0.08;
    if (level.blue) {
      level.blue.material.opacity = blue;
      level.blue.position.y = level.baseY + (1 - Math.max(shown, blue)) * 0.08;
    }
  });
  world.model.columns.material.opacity = story.modelLevel[0];
}

function updatePulse(world, story) {
  const visible = story.pulseOpacity > 0.02;
  world.pulse.visible = visible;
  world.trails.forEach((trail) => {
    trail.visible = visible;
  });
  if (!visible) return;
  const point = editCanvasPoint(story, false);
  const v = point.v;
  placePulse(world, world.pulse, story.pulse, v);
  world.pulse.material.opacity = story.pulseOpacity;
  world.pulse.lookAt(world.camera.position);
  world.trails.forEach((trail, index) => {
    placePulse(world, trail, Math.max(0, story.pulse - (index + 1) * 0.045), v);
    trail.material.opacity = story.pulseOpacity * (0.4 - index * 0.1);
    trail.lookAt(world.camera.position);
  });
}

function placePulse(world, mesh, along, v) {
  const startU = 0.66;
  const endU = 0.78;
  const span = (1 - startU) + 1 + endU;
  let d = along * span;
  let screen = world.screens.left.mesh;
  let u = startU;
  if (d <= 1 - startU) u = startU + d;
  else {
    d -= 1 - startU;
    if (d <= 1) {
      screen = world.screens.centre.mesh;
      u = d;
    } else {
      screen = world.screens.right.mesh;
      u = Math.min(endU, d - 1);
    }
  }
  screenPoint(screen, u, v, 0.045, world.tmp.hit);
  mesh.position.copy(world.tmp.hit);
}

// Place the camera so a set of world points fills the frame exactly, minus a
// margin, for a fixed view direction. Solved per axis: for points in camera
// basis (x, y, depth z), the nearest camera that keeps |x - cx| <= t (z - cz)
// for every point is cz = (A + B) / 2, cx = t (B - A) / 2, where
// A = min(z - x / t) and B = min(z + x / t).
//
// With `centre` given (camera-basis x, y), the frame is held on that point and
// only the distance is solved: cz = min(z - |x - cx| / tH, z - |y - cy| / tV).
function fitCamera(points, forward, fovDeg, aspect, margin, out, tmp, centre) {
  tmp.right.crossVectors(forward, UP).normalize();
  tmp.up.crossVectors(tmp.right, forward).normalize();
  const tV = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2) * (1 - margin.y);
  const tH = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2) * aspect * (1 - margin.x);
  let ax = Infinity;
  let bx = Infinity;
  let ay = Infinity;
  let by = Infinity;
  let held = Infinity;
  points.forEach((p) => {
    const x = p.dot(tmp.right);
    const y = p.dot(tmp.up);
    const z = p.dot(forward);
    ax = Math.min(ax, z - x / tH);
    bx = Math.min(bx, z + x / tH);
    ay = Math.min(ay, z - y / tV);
    by = Math.min(by, z + y / tV);
    if (centre) held = Math.min(held, z - Math.abs(x - centre.x) / tH, z - Math.abs(y - centre.y) / tV);
  });
  const cx = centre ? centre.x : (tH * (bx - ax)) / 2;
  const cy = centre ? centre.y : (tV * (by - ay)) / 2;
  const cz = centre ? held : Math.min((ax + bx) / 2, (ay + by) / 2);
  return out.copy(tmp.right).multiplyScalar(cx).addScaledVector(tmp.up, cy).addScaledVector(forward, cz);
}

function updateCamera(world, story) {
  const cam = CONFIG.camera;
  const { aspect } = world.view;
  // Auto-play: a slow sideways sway on the clock, and a gentle push-in over the
  // intro that then holds. The frame is re-fitted every frame, so it always fits.
  const u = Math.min(1, world.time / CONFIG.storyEnd);
  const yaw = Math.sin((world.time / cam.swayPeriod) * Math.PI * 2) * THREE.MathUtils.degToRad(cam.yawDeg) * 0.5;
  const forward = world.tmp.forward.set(cam.direction[0], cam.direction[1], cam.direction[2])
    .normalize()
    .applyAxisAngle(UP, yaw);
  // Fit the whole setup (person, rods and projectors included) tightly to the
  // box, so it fills the space instead of centring on the middle screen.
  // A slow push-in: a little extra margin at the start that settles out by the end.
  const push = cam.pushIn * (1 - ease.sine(u));
  const margin = { x: cam.margin.x + push, y: cam.margin.y + push };
  fitCamera(world.fitSets.all, forward, cam.fov, aspect, margin, world.tmp.camPos, world.tmp);
  world.camera.position.copy(world.tmp.camPos);
  world.camera.lookAt(world.tmp.look.copy(world.tmp.camPos).add(forward));
  if (world.camera.fov !== cam.fov) {
    world.camera.fov = cam.fov;
    world.camera.updateProjectionMatrix();
  }
}

function renderModel(world) {
  const previous = world.renderer.toneMapping;
  world.renderer.toneMapping = THREE.NoToneMapping;
  world.renderer.setRenderTarget(world.modelTarget);
  world.renderer.setClearColor(CONFIG.color.graphite850, 1);
  world.renderer.clear(true, true, true);
  world.renderer.render(world.model.scene, world.modelCamera);
  world.renderer.setRenderTarget(null);
  world.renderer.setClearColor(0x000000, 0);
  world.renderer.toneMapping = previous;
}

function applyTier(world, index, coarse) {
  const tier = CONFIG.quality.tiers[index];
  world.tier = tier;
  world.motes.visible = tier.motes;
  void coarse;
}

// The scale figure: a low-poly man (models/lowpolyman.3ds). The file is
// Z-up in centimetres, so it is stood upright, its feet put on the floor and
// it is scaled to `height`, arms lowered and shaded with a light gradient. It loads
// after the scene is up; until then an invisible proxy of the same size keeps
// the camera fit stable, so the frame does not jump when it arrives.
// Faces +Z, feet on y = 0.
function createPerson(height, trackG, trackM) {
  const root = new THREE.Group();
  const proxy = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.6, height, 0.36)), trackM(new THREE.MeshBasicMaterial()));
  proxy.position.y = height / 2;
  proxy.visible = false;
  root.add(proxy);
  // A light vertical gradient (vertex colours), part lit and part glow, so the
  // figure reads against the dark room without competing with the screens.
  const { glow } = CONFIG.figures.presenter.shade;
  const body = trackM(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    emissive: 0xffffff,
    emissiveIntensity: glow,
    roughness: 0.7,
    metalness: 0.05,
  }));
  body.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vColor.rgb;",
    );
  };
  const person = { root, height, loaded: [] };
  person.dispose = () => {
    person.loaded.forEach((geo) => geo.dispose());
  };
  new TDSLoader().load(PERSON_URL, (model) => {
    model.traverse((node) => {
      if (!node.isMesh) return;
      node.material.dispose?.();
      node.material = body;
      node.geometry = shadePerson(smoothPerson(smoothHead(narrowShoulders(straightenForearms(lowerArms(node.geometry))))));
      person.loaded.push(node.geometry);
    });
    const upright = new THREE.Group();
    model.rotation.x = -Math.PI / 2;
    upright.add(model);
    const box = new THREE.Box3().setFromObject(upright);
    const scale = height / Math.max(0.01, box.max.y - box.min.y);
    upright.scale.setScalar(scale);
    upright.position.set(
      -((box.min.x + box.max.x) / 2) * scale,
      -box.min.y * scale,
      -((box.min.z + box.max.z) / 2) * scale,
    );
    root.add(upright);
  }, undefined, (error) => {
    console.warn("Mission Room CINE: person model did not load.", error);
  });
  return person;
}

// The supplied man is a single unrigged mesh in an A-pose. Bring the arms down
// to his sides by rotating arm vertices about each shoulder in the frontal
// plane. The rotation fades in across the shoulder (and is held off the legs)
// so the mesh bends there instead of tearing. File units: centimetres, Z-up,
// x across the body, feet near z = -103, head top near z = 78.
function lowerArms(geometry) {
  const { pivotX, pivotZ, dropDeg, blendFrom, blendTo } = CONFIG.figures.presenter.arms;
  const pos = geometry.attributes.position;
  // How much each vertex belongs to an arm (0 body, 1 arm). Later steps reuse it.
  const arm = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const side = Math.sign(x);
    const w = smoothstep(blendFrom, blendTo, Math.abs(x)) * smoothstep(-26, -20, z);
    arm[i] = w;
    if (w <= 0) continue;
    const angle = -side * THREE.MathUtils.degToRad(dropDeg) * w;
    const dx = x - side * pivotX;
    const dz = z - pivotZ;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    pos.setXYZ(i, side * pivotX + dx * c - dz * s, pos.getY(i), pivotZ + dx * s + dz * c);
  }
  geometry.userData.arm = arm;
  pos.needsUpdate = true;
  return geometry;
}

function smoothstep(a, b, v) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Straight forearms. The model's elbows are bent: the forearm swings forward
// and the hand flares out. Rotate everything below the elbow back into line
// with the upper arm, about the elbow, easing in over `blend` cm so the elbow
// bends smoothly rather than creasing.
function straightenForearms(geometry) {
  const { elbowX, elbowY, elbowZ, blend, backDeg, inDeg } = CONFIG.figures.presenter.forearms;
  const pos = geometry.attributes.position;
  const arm = geometry.userData.arm;
  for (let i = 0; i < pos.count; i += 1) {
    const t = arm[i] * smoothstep(elbowZ, elbowZ - blend, pos.getZ(i));
    if (t <= 0) continue;
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const side = Math.sign(x);
    const ex = side * elbowX;
    // Inward, in the frontal plane.
    const a1 = -side * THREE.MathUtils.degToRad(inDeg) * t;
    let dx = x - ex;
    let dz = z - elbowZ;
    x = ex + dx * Math.cos(a1) - dz * Math.sin(a1);
    z = elbowZ + dx * Math.sin(a1) + dz * Math.cos(a1);
    // Back, in the side plane (front of the body is low y in this file).
    const a2 = THREE.MathUtils.degToRad(backDeg) * t;
    const dy = y - elbowY;
    dz = z - elbowZ;
    y = elbowY + dy * Math.cos(a2) - dz * Math.sin(a2);
    z = elbowZ + dy * Math.sin(a2) + dz * Math.cos(a2);
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  return geometry;
}

// Narrower shoulders: pull everything more than `core` cm from the centre line
// inward by `squeeze`, across the shoulder band only, so the torso core and
// neck keep their shape and the band fades out with no kink. Arms move in as a
// whole by the same amount the shoulder does, so they stay straight.
function narrowShoulders(geometry) {
  const { squeeze, core, armX, rampFrom, rampTo, neckFrom, neckTo } = CONFIG.figures.presenter.shoulders;
  const pos = geometry.attributes.position;
  const arm = geometry.userData.arm;
  const armShift = (armX - core) * squeeze;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const w = smoothstep(rampFrom, rampTo, z) * (1 - smoothstep(neckFrom, neckTo, z));
    const band = Math.max(0, Math.abs(x) - core) * squeeze * w;
    const shift = arm[i] * armShift + (1 - arm[i]) * band;
    if (shift <= 0) continue;
    pos.setX(i, x - Math.sign(x) * shift);
  }
  pos.needsUpdate = true;
  return geometry;
}
// A smooth, featureless head on a real neck. The model's own head has eye
// sockets and a mouth cavity; pressing those onto a surface leaves folded
// triangles. So everything above the neck top is dropped and a clean, rounded
// head takes its place. The neck band (jaw and throat in the original) is
// shaped into a round column that rises out of the shoulders and ends inside
// the head, so the two join without a seam.
function smoothHead(geometry) {
  const { centre, radii, neck } = CONFIG.figures.presenter.head;
  const pos = geometry.attributes.position;
  const above = new Uint8Array(pos.count);
  for (let i = 0; i < pos.count; i += 1) above[i] = pos.getZ(i) >= neck.to ? 1 : 0;
  for (let i = 0; i < pos.count; i += 1) {
    const z = pos.getZ(i);
    const x = pos.getX(i);
    // Neck-width only, eased in above the shoulders so they are never pulled.
    const w = smoothstep(neck.from, neck.from + 4, z) * (1 - smoothstep(9, 13, Math.abs(x)));
    if (w <= 0) continue;
    const y = pos.getY(i);
    const dy = y - neck.y;
    const r = Math.hypot(x, dy) || 1;
    pos.setXYZ(i, x + ((x / r) * neck.radius - x) * w, y + (neck.y + (dy / r) * neck.radius - y) * w, z);
  }

  // Keep every triangle that is not wholly inside the head, then append the
  // ellipsoid. Positions and index only: normals are rebuilt after welding.
  const source = geometry.index ? geometry.index.array : Array.from({ length: pos.count }, (_, i) => i);
  const kept = [];
  for (let i = 0; i < source.length; i += 3) {
    const a = source[i];
    const b = source[i + 1];
    const c = source[i + 2];
    if (above[a] && above[b] && above[c]) continue;
    kept.push(a, b, c);
  }
  const head = new THREE.SphereGeometry(1, 48, 32);
  head.scale(radii[0], radii[1], radii[2]);
  head.translate(centre[0], centre[1], centre[2]);
  const headPos = head.attributes.position;
  const positions = new Float32Array((pos.count + headPos.count) * 3);
  positions.set(pos.array.subarray(0, pos.count * 3), 0);
  positions.set(headPos.array, pos.count * 3);
  head.index.array.forEach((v) => kept.push(v + pos.count));
  head.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  out.setIndex(kept);
  geometry.dispose();
  return out;
}

// Weld duplicate vertices so normals average across faces: smooth shading
// instead of visible facets.
// Feet-to-head colour gradient along the file's Z (up) axis.
function shadePerson(geometry) {
  const { feet, head } = CONFIG.figures.presenter.shade;
  const lo = new THREE.Color(CONFIG.color[feet]);
  const hi = new THREE.Color(CONFIG.color[head]);
  const pos = geometry.attributes.position;
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const span = Math.max(0.001, max.z - min.z);
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    c.copy(lo).lerp(hi, (pos.getZ(i) - min.z) / span);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// A standard material with a vertical colour gradient and an alpha fade, both
// on world height: transparent at fade.from, solid by fade.to, so a shape
// dissolves downward instead of ending at an edge.
function fadeMaterial(trackM, { low, high, glow, fade, gradient, roughness = 0.7, metalness = 0.05 }) {
  const uniforms = {
    uLow: { value: new THREE.Color(CONFIG.color[low]) },
    uHigh: { value: new THREE.Color(CONFIG.color[high]) },
    uFade: { value: new THREE.Vector4(fade.from, fade.to, gradient[0], gradient[1]) },
  };
  const material = trackM(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: glow,
    roughness,
    metalness,
    transparent: true,
  }));
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = "varying float vFadeY;\n" + shader.vertexShader.replace(
      "#include <project_vertex>",
      "#include <project_vertex>\n  vFadeY = (modelMatrix * vec4(transformed, 1.0)).y;",
    );
    shader.fragmentShader = "uniform vec3 uLow;\nuniform vec3 uHigh;\nuniform vec4 uFade;\nvarying float vFadeY;\n" + shader.fragmentShader
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\n  vec3 fadeTint = mix(uLow, uHigh, smoothstep(uFade.z, uFade.w, vFadeY));\n  diffuseColor.rgb *= fadeTint;\n  diffuseColor.a *= smoothstep(uFade.x, uFade.y, vFadeY);",
      )
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\n  totalEmissiveRadiance *= fadeTint;",
      );
  };
  material.customProgramCacheKey = () => "mrc-fade";
  return material;
}

// One seated person from behind: a smooth lathed torso (elliptical, wider than
// deep) with a neck, and a head. Metres, base at y = 0, facing -Z.
function bustGeometry(trackG) {
  const profile = new THREE.SplineCurve([
    [0.2, 0], [0.212, 0.16], [0.222, 0.29], [0.214, 0.355], [0.186, 0.4],
    [0.135, 0.43], [0.08, 0.448], [0.056, 0.468], [0.052, 0.53],
  ].map(([r, y]) => new THREE.Vector2(r, y))).getPoints(48);
  const torso = new THREE.LatheGeometry(profile, 64);
  torso.scale(1, 1, 0.56);
  const head = new THREE.SphereGeometry(0.097, 48, 32);
  head.scale(0.92, 1.12, 1);
  head.translate(0, 0.635, 0.008);
  const merged = mergeGeometries([torso.toNonIndexed(), head.toNonIndexed()]);
  torso.dispose();
  head.dispose();
  merged.computeVertexNormals();
  return trackG(merged);
}

// Five people on the near side of an elliptical table, all facing the screens.
// The seats follow the table's curve, so the outer people sit a little further
// back and turn slightly in toward the centre screen.
function createAudience(trackG, trackM) {
  const { count, spacing, seatGap, baseY, fade, shade } = CONFIG.figures.audience;
  const table = CONFIG.figures.table;
  const root = new THREE.Group();
  const fit = [];

  const bodyMat = fadeMaterial(trackM, {
    low: shade.low,
    high: shade.high,
    glow: shade.glow,
    fade,
    gradient: [fade.from, baseY + 0.74],
  });
  const bust = bustGeometry(trackG);
  for (let i = 0; i < count; i += 1) {
    const x = (i - (count - 1) / 2) * spacing;
    const edge = table.radiusZ * Math.sqrt(Math.max(0, 1 - (x / table.radiusX) ** 2));
    const person = new THREE.Mesh(bust, bodyMat);
    person.position.set(x, baseY, table.z + edge + seatGap);
    // Face the screens, turned a little in toward the centre. lookAt aims +Z
    // at the target and the bust faces -Z, so aim at the mirrored point.
    person.lookAt(2 * x - x * 0.35, baseY, 2 * person.position.z);
    person.renderOrder = 2;
    root.add(person);
    fit.push(person);
  }

  // Table: a thin elliptical top with a crisp lighter edge, a satin finish that
  // picks up the screens, and a pedestal that fades out toward the floor.
  const topMat = trackM(new THREE.MeshStandardMaterial({
    color: CONFIG.color.graphite900,
    roughness: 0.62,
    metalness: 0.1,
  }));
  const edgeMat = trackM(new THREE.MeshStandardMaterial({
    color: CONFIG.color.graphite500,
    emissive: CONFIG.color.graphite500,
    emissiveIntensity: 0.6,
    roughness: 0.5,
    metalness: 0.2,
  }));
  const top = new THREE.Mesh(trackG(new THREE.CylinderGeometry(1, 1, table.thickness, 96)), topMat);
  top.scale.set(table.radiusX, 1, table.radiusZ);
  top.position.set(0, table.top - table.thickness / 2, table.z);
  const edge = new THREE.Mesh(trackG(new THREE.TorusGeometry(1, 0.006, 8, 128)), edgeMat);
  edge.rotation.x = Math.PI / 2;
  edge.scale.set(table.radiusX, table.radiusZ, 1);
  edge.position.set(0, table.top, table.z);
  const pedestalMat = fadeMaterial(trackM, {
    low: "graphite800",
    high: "graphite700",
    glow: 0.05,
    fade: table.fade,
    gradient: [table.fade.from, table.top],
    roughness: 0.4,
    metalness: 0.3,
  });
  const pedestal = new THREE.Mesh(trackG(new THREE.CylinderGeometry(0.16, 0.22, table.top - table.thickness, 48, 1, true)), pedestalMat);
  pedestal.position.set(0, (table.top - table.thickness) / 2, table.z);
  pedestal.renderOrder = 1;
  root.add(top, edge, pedestal);
  fit.push(top);
  return { root, fit };
}

function smoothPerson(geometry) {
  const bare = new THREE.BufferGeometry();
  bare.setAttribute("position", geometry.attributes.position);
  if (geometry.index) bare.setIndex(geometry.index);
  const welded = mergeVertices(bare, 0.05);
  relax(welded, CONFIG.figures.presenter.smoothing);
  welded.computeVertexNormals();
  geometry.dispose();
  return welded;
}

// Taubin smoothing: alternate a shrinking and an inflating Laplacian step, so
// the low-poly edges round off without the figure getting thinner.
function relax(geometry, passes) {
  const pos = geometry.attributes.position;
  const index = geometry.index.array;
  const links = Array.from({ length: pos.count }, () => new Set());
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i];
    const b = index[i + 1];
    const c = index[i + 2];
    links[a].add(b).add(c);
    links[b].add(a).add(c);
    links[c].add(a).add(b);
  }
  const next = new Float32Array(pos.count * 3);
  const step = (factor) => {
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      let sx = 0;
      let sy = 0;
      let sz = 0;
      links[i].forEach((j) => {
        sx += pos.getX(j);
        sy += pos.getY(j);
        sz += pos.getZ(j);
      });
      const n = links[i].size || 1;
      next[i * 3] = x + (sx / n - x) * factor;
      next[i * 3 + 1] = y + (sy / n - y) * factor;
      next[i * 3 + 2] = z + (sz / n - z) * factor;
    }
    pos.array.set(next);
  };
  for (let p = 0; p < passes; p += 1) {
    step(0.5);
    step(-0.53);
  }
  pos.needsUpdate = true;
}

// Four soft faces from the lens (apex) to the screen corners.
function beamGeometry(apex, corners) {
  const position = [];
  const along = [];
  const side = [];
  for (let i = 0; i < 4; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    position.push(apex.x, apex.y, apex.z, a.x, a.y, a.z, b.x, b.y, b.z);
    along.push(0, 1, 1);
    side.push(0.5, 0, 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geo.setAttribute("along", new THREE.Float32BufferAttribute(along, 1));
  geo.setAttribute("side", new THREE.Float32BufferAttribute(side, 1));
  geo.computeVertexNormals();
  return geo;
}

function glowCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.12, "rgba(255,255,255,0.7)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.16)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return canvas;
}

function buildModel(trackG, trackM) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.color.graphite850);
  const root = new THREE.Group();
  scene.add(root);
  const ivory = () => trackM(new THREE.MeshBasicMaterial({
    color: CONFIG.color.ivory,
    transparent: true,
    opacity: 0,
  }));
  const blue = () => trackM(new THREE.MeshBasicMaterial({
    color: CONFIG.color.accent,
    transparent: true,
    opacity: 0,
  }));
  const levels = [0.16, 0.56, 0.96, 1.36].map((y, index) => {
    const group = membersAt(y, trackG, ivory());
    root.add(group);
    let blueMesh = null;
    if (index === CONFIG.model.activeLevel) {
      blueMesh = membersAt(y, trackG, blue());
      root.add(blueMesh);
    }
    return { ivory: group, blue: blueMesh, baseY: 0 };
  });
  const columns = membersColumns(trackG, ivory());
  root.add(columns);
  return { scene, root, levels, columns };
}

function membersAt(y, trackG, material) {
  const group = new THREE.Group();
  const t = 0.014;
  const xs = [-1.2, -0.6, 0, 0.6, 1.2];
  [-0.5, 0.5].forEach((z) => {
    const beam = new THREE.Mesh(trackG(new THREE.BoxGeometry(2.55, t, t)), material);
    beam.position.set(0, y, z);
    group.add(beam);
  });
  xs.forEach((x) => {
    const beam = new THREE.Mesh(trackG(new THREE.BoxGeometry(t, t, 1.12)), material);
    beam.position.set(x, y, 0);
    group.add(beam);
  });
  group.userData.material = material;
  group.material = material;
  return group;
}

function membersColumns(trackG, material) {
  const group = new THREE.Group();
  const xs = [-1.2, -0.6, 0, 0.6, 1.2];
  const zs = [-0.5, 0.5];
  xs.forEach((x) => {
    zs.forEach((z) => {
      const column = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.02, 1.48, 0.02)), material);
      column.position.set(x, 0.74, z);
      group.add(column);
    });
  });
  group.material = material;
  return group;
}

function updateModelOpacity(group, opacity) {
  group.material.opacity = opacity;
}

function shadowCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  gradient.addColorStop(0, "rgba(27,27,27,0.72)");
  gradient.addColorStop(1, "rgba(27,27,27,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return canvas;
}

void updateModelOpacity;
