import * as THREE from "https://esm.sh/three@0.186.1";
import { RectAreaLightUniformsLib } from "https://esm.sh/three@0.186.1/addons/lights/RectAreaLightUniformsLib.js";
import { EffectComposer } from "https://esm.sh/three@0.186.1/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "https://esm.sh/three@0.186.1/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://esm.sh/three@0.186.1/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "https://esm.sh/three@0.186.1/addons/postprocessing/OutputPass.js";
import { CONFIG } from "./config.js";
import { createStoryState, ease, sampleStory } from "./story.js";
import { createSurfaces, editCanvasPoint, paintSurfaces, surfaceDirtyKey } from "./screens.js";

const POSTER_URL = new URL("./poster.webp", import.meta.url).href;
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
  el.style.height = `${CONFIG.scrollTrackVh}vh`;
  const pin = document.createElement("div");
  pin.className = "mrc-cine__pin";
  const stage = document.createElement("div");
  stage.className = "mrc-cine__stage";
  stage.setAttribute("role", "img");
  stage.setAttribute("aria-label", label);
  const fallback = document.createElement("div");
  fallback.className = "mrc-cine__fallback";
  fallback.style.backgroundImage = `url("${POSTER_URL}")`;
  const vignette = document.createElement("div");
  vignette.className = "mrc-cine__vignette";
  stage.append(fallback, vignette);
  pin.append(stage);
  el.append(pin);

  const ui = { el, pin, stage, fallback, onScreen: false, started: false, destroyed: false };
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
  let smooth = POSTER_MODE ? CONFIG.posterTime / CONFIG.storyEnd : 0;
  let t = smooth * CONFIG.storyEnd;
  let tierIndex = Math.max(0, CONFIG.quality.tiers.findIndex((tier) => tier.id === QUALITY_LOCK));
  let raf = 0;
  let last = performance.now();
  let paintAcc = 1;
  let paintKey = "";
  let lightAcc = 0;
  let destroyed = false;
  let revealed = false;
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
  paintKey = surfaceDirtyKey(story);
  world.markTextures();
  applyTier(world, tierIndex, coarse);

  let debug;
  if (DEBUG_MODE) {
    debug = document.createElement("div");
    debug.className = "mrc-cine__debug";
    const read = document.createElement("p");
    debug.append(read);
    ui.pin.appendChild(debug);
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
    if (world.composer) {
      world.composer.setPixelRatio(1);
      world.composer.setSize(bufW, bufH);
    }
    const aspect = POSTER_MODE ? 16 / 9 : cssW / cssH;
    world.camera.aspect = aspect;
    world.view = { cssW, cssH, aspect, portrait: cssW < 768 || cssH > cssW };
    world.camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(ui.stage);
  resize();

  const onLost = (event) => {
    event.preventDefault();
    ui.fallback.classList.remove("is-hidden");
    revealed = false;
  };
  const onRestored = () => {
    if (destroyed) return;
    resize();
    world.markTextures();
    paintKey = "";
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
    if (!POSTER_MODE) {
      const rect = ui.el.getBoundingClientRect();
      const travel = Math.max(1, ui.el.offsetHeight - window.innerHeight);
      const scrolled = Math.min(travel, Math.max(0, -rect.top));
      const target = scrolled / travel;
      const blend = reduce ? 1 : 1 - Math.exp(-dt * CONFIG.scrollResponse);
      smooth += (target - smooth) * blend;
      if (Math.abs(target - smooth) < 0.0004) smooth = target;
    }
    t = smooth * CONFIG.storyEnd;
    sampleStory(t, t, story);
    const point = editCanvasPoint(story, false);
    story.cursorU = point.u;
    story.cursorV = point.v;
    paintAcc += dt;
    const key = surfaceDirtyKey(story);
    if (key !== paintKey && paintAcc >= 1 / CONFIG.screen.maxFps) {
      paintAcc = 0;
      paintKey = key;
      paintSurfaces(world.surfaces, story);
      world.markTextures();
    }
    lightAcc += dt;
    if (lightAcc > 0.25) {
      lightAcc = 0;
      world.sampleLights(story);
    }
    world.lights.forEach((light) => {
      light.intensity = CONFIG.room.rectIntensity * story.bg * Math.max(story.power, story.bg);
    });
    world.screenMats.forEach((mat) => {
      mat.emissiveIntensity = 1.15 * story.bg;
    });
    world.centreMat.opacity = story.bg;
    world.overlayMat.opacity = story.bg;
    updateFrames(world, story);
    updateBeams(world, story);
    updateModel(world, story);
    updatePulse(world, story);
    updateCamera(world, story);
    renderModel(world);
    if (CONFIG.quality.tiers[tierIndex].bloom && world.composer) world.composer.render();
    else world.renderer.render(world.scene, world.camera);
    if (!revealed) {
      revealed = true;
      ui.fallback.classList.add("is-hidden");
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
    disposables.geo.forEach((geo) => geo.dispose());
    disposables.mat.forEach((mat) => mat.dispose());
    disposables.tex.forEach((tex) => tex.dispose());
    world.modelTarget.dispose();
    if (world.composer) world.composer.dispose();
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
    alpha: false,
    powerPreference: "default",
    stencil: false,
    failIfMajorPerformanceCaveat: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = CONFIG.room.exposure;
  renderer.setClearColor(CONFIG.color.graphite950, 1);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.color.graphite950);
  scene.fog = new THREE.FogExp2(CONFIG.color.graphite950, CONFIG.room.fogDensity);
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.08, 80);
  scene.add(new THREE.AmbientLight(CONFIG.color.graphite800, CONFIG.room.ambient));
  const hemi = new THREE.HemisphereLight(CONFIG.color.graphite700, CONFIG.color.graphite950, CONFIG.room.hemi);
  scene.add(hemi);

  const floorGeo = trackG(new THREE.PlaneGeometry(26, 26));
  const floorMat = trackM(new THREE.MeshBasicMaterial({
    color: CONFIG.color.graphite925,
  }));
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

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
    color: CONFIG.color.graphite875,
    roughness: 0.7,
    metalness: 0.08,
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
    const mount = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.28, 0.06, 0.42)), mountMat);
    const stem = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.04, 0.28, 0.04)), mountMat);
    scene.add(plinth, fascia, mount, stem);
    group.userData.arch = { plinth, fascia, mount, stem, mesh };
  }

  const beamMat = trackM(new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uOpacity: { value: 0 },
      uColor: { value: new THREE.Color(CONFIG.color.sand200) },
    },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "varying vec2 vUv; uniform float uOpacity; uniform vec3 uColor; void main(){ float axial = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.45, vUv.y); gl_FragColor = vec4(uColor, axial * uOpacity); }",
  }));
  const beams = [];
  const beamGeo = trackG(new THREE.CylinderGeometry(0.42, 0.035, 1, 16, 1, true));
  [screens.left, screens.centre, screens.right].forEach((entry) => {
    const mesh = new THREE.Mesh(beamGeo, beamMat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    beams.push(mesh);
  });

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
    rad: 0.05 + Math.random() * 0.28,
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
  const figureMat = trackM(new THREE.MeshStandardMaterial({
    color: CONFIG.color.graphite750,
    roughness: 0.62,
    metalness: 0,
  }));
  const presenter = buildFigure(CONFIG.figures.presenter.height, figureMat, trackG);
  scene.add(presenter.root);
  const shadow = new THREE.Mesh(trackG(new THREE.CircleGeometry(0.28, 16)), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  presenter.root.add(shadow);

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

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), CONFIG.room.bloomStrength, CONFIG.room.bloomRadius, CONFIG.room.bloomThreshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

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
      arch.mount.position.y = CONFIG.room.plinthHeight + panelH + 0.78;
      arch.mount.lookAt(center);
      arch.stem.position.copy(arch.mount.position);
      arch.stem.position.y -= 0.16;
      const start = arch.mount.position.clone();
      const end = center.clone().addScaledVector(normal, 0.15);
      const delta = end.clone().sub(start);
      const len = delta.length();
      beams[index].scale.set(1, len, 1);
      beams[index].position.copy(start).addScaledVector(delta, 0.5);
      beams[index].quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
      beams[index].userData = { start, dir: delta.clone(), len };
    });
  }

  function updateMatrices() {
    scene.updateMatrixWorld(true);
  }

  function sampleLights(story) {
    averageInto(surfaces.left.canvas, screens.left.light.color);
    averageInto(surfaces.right.canvas, screens.right.light.color);
    scratch.set(CONFIG.color.ivory).lerp(screens.centre.light.color.set(CONFIG.color.accent), story.resequence * 0.55);
    screens.centre.light.color.copy(scratch);
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
  placePresenter(presenter, screens.left.mesh);

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
  };

  return {
    renderer,
    scene,
    camera,
    composer,
    bloom,
    floor,
    presenter,
    screens,
    lights,
    frames,
    beams,
    beamMat,
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
    markTextures() {
      leftTex.needsUpdate = true;
      rightTex.needsUpdate = true;
      overlayTex.needsUpdate = true;
    },
  };
}

function screenPoint(mesh, u, v, z, out) {
  out.set((u - 0.5) * CONFIG.room.panelWidth, (v - 0.5) * CONFIG.room.panelHeight, z);
  mesh.localToWorld(out);
  return out;
}

function placePresenter(figure, mesh) {
  const point = screenPoint(mesh, CONFIG.figures.presenter.standU, 0.42, 0, new THREE.Vector3());
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(mesh.matrixWorld);
  figure.root.position.set(
    point.x + normal.x * CONFIG.room.presenterDistance,
    0,
    point.z + normal.z * CONFIG.room.presenterDistance,
  );
  figure.root.lookAt(0.35, 0, 8);
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
  const opacity = tier.beams ? 0.02 * story.power * story.bg : 0;
  world.beamMat.uniforms.uOpacity.value = opacity;
  world.beams.forEach((beam) => {
    beam.visible = opacity > 0.001;
  });
  world.motes.visible = opacity > 0.001;
  if (!world.motes.visible) return;
  const attr = world.motes.geometry.attributes.position;
  world.moteSeeds.forEach((seed, i) => {
    const beam = world.beams[seed.beam];
    const data = beam.userData;
    if (!data?.dir) return;
    const along = (seed.phase + story.t * 0.04) % 1;
    world.tmp.mote.copy(data.start).addScaledVector(data.dir, along * data.len);
    world.tmp.tangent.crossVectors(Math.abs(data.dir.y) > 0.85 ? AXIS_X : UP, data.dir).normalize();
    world.tmp.bitangent.crossVectors(data.dir, world.tmp.tangent);
    const radius = seed.rad * (0.15 + along * 0.85);
    world.tmp.mote.addScaledVector(world.tmp.tangent, Math.cos(seed.ang) * radius);
    world.tmp.mote.addScaledVector(world.tmp.bitangent, Math.sin(seed.ang) * radius);
    attr.setXYZ(i, world.tmp.mote.x, world.tmp.mote.y, world.tmp.mote.z);
  });
  attr.needsUpdate = true;
}

function updateModel(world, story) {
  world.model.root.rotation.y = (story.t / CONFIG.storyEnd) * 0.42;
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

function updateCamera(world, story) {
  const rig = world.view.portrait
    ? CONFIG.camera.phone
    : world.view.cssW < 1024
      ? CONFIG.camera.tablet
      : CONFIG.camera.desktop;
  const u = THREE.MathUtils.clamp(story.t / CONFIG.storyEnd, 0, 1);
  const yaw = (u - 0.5) * THREE.MathUtils.degToRad(rig.yawDeg);
  const pitch = 0;
  const dolly = (u - 0.5) * rig.dolly;
  world.tmp.look.set(rig.look[0], rig.look[1], rig.look[2]);
  world.tmp.offset.set(rig.position[0] - rig.look[0], 0, rig.position[2] - rig.look[2]);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const x = world.tmp.offset.x * cos - world.tmp.offset.z * sin;
  const z = world.tmp.offset.x * sin + world.tmp.offset.z * cos;
  world.tmp.camPos.set(rig.look[0] + x, rig.position[1] + pitch, rig.look[2] + z);
  world.tmp.dir = world.tmp.hit.copy(world.tmp.camPos).sub(world.tmp.look).normalize();
  world.tmp.camPos.addScaledVector(world.tmp.hit, dolly);
  world.camera.position.copy(world.tmp.camPos);
  world.camera.lookAt(world.tmp.look);
  if (world.camera.fov !== rig.fov) {
    world.camera.fov = rig.fov;
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
  world.renderer.setClearColor(CONFIG.color.graphite950, 1);
  world.renderer.toneMapping = previous;
}

function applyTier(world, index, coarse) {
  const tier = CONFIG.quality.tiers[index];
  world.tier = tier;
  if (world.bloom) world.bloom.enabled = tier.bloom;
  world.floor.visible = true;
  world.beams.forEach((beam) => {
    beam.visible = tier.beams;
  });
  world.motes.visible = tier.beams;
  void coarse;
}

function buildFigure(height, material, trackG) {
  const s = height / 1.78;
  const pts = [
    [-0.1, 0],
    [0.1, 0],
    [0.11, 0.78],
    [0.18, 1.12],
    [0.22, 1.32],
    [0.36, 1.5],
    [0.32, 1.64],
    [0.16, 1.48],
    [0.13, 1.4],
    [0.12, 1.52],
    [0.14, 1.68],
    [0.04, 1.78],
    [-0.08, 1.76],
    [-0.13, 1.62],
    [-0.11, 1.48],
    [-0.18, 1.22],
    [-0.13, 0.95],
    [-0.11, 0.72],
  ];
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0] * s, pts[0][1] * s);
  for (let i = 1; i < pts.length; i += 1) shape.lineTo(pts[i][0] * s, pts[i][1] * s);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.26 * s,
    bevelEnabled: true,
    bevelThickness: 0.05 * s,
    bevelSize: 0.045 * s,
    bevelSegments: 2,
    curveSegments: 2,
  });
  geo.translate(0, 0, -0.13 * s);
  const root = new THREE.Group();
  root.add(new THREE.Mesh(trackG(geo), material));
  return { root, height };
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
