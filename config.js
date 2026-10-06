/**
 * Everything editable. Colours are resolved Serro tokens.
 * Do not introduce hex values that are not listed here.
 */
export const CONFIG = {
  brandLabel: "MISSION ROOM / CINE",
  ariaLabel:
    "A darkened theatre with three large projection screens in a shallow curve. A presenter marks a schedule change on the left screen, and the station model and performance screens update across the room.",
  statusLine: "RESCHEDULED · 3 SUCCESSORS UPDATED · FORECAST REVISED",
  quietLine: "BASELINE HELD · CRITICAL PATH CLEAR",

  color: {
    graphite950: "#1b1b1b",
    graphite925: "#1f1f1f",
    graphite900: "#202020",
    graphite875: "#262624",
    graphite850: "#272727",
    graphite800: "#303030",
    graphite775: "#333333",
    graphite750: "#3f3f3e",
    graphite700: "#4f4f4d",
    graphite600: "#6b6b6b",
    graphite500: "#7c7b77",
    graphite400: "#9b9b9b",
    ivory: "#faf9f5",
    sand300: "#dcd5ca",
    sand200: "#e9e4da",
    green500: "#30a46c",
    white14: "rgba(255,255,255,0.14)",
    white10: "rgba(255,255,255,0.10)",
    white06: "rgba(255,255,255,0.06)",
    white04: "rgba(255,255,255,0.04)",
    accent: "#e5484d",
    accentSoft: "rgba(229,72,77,0.18)",
    ivory60: "rgba(250,249,245,0.60)",
  },

  font: {
    display: '"MRC Cine Inter", Inter, "Helvetica Neue", Arial, sans-serif',
    mono: '"MRC Cine Mono", "JetBrains Mono", ui-monospace, monospace',
  },

  motion: {
    easeOutExpo: [0.16, 1, 0.3, 1],
    easeSoft: [0.44, 0, 0.56, 1],
    easeSnap: [0.2, 0.8, 0.2, 1],
    easeTravel: [0.55, 0, 0.25, 1],
    easeInOutSine: [0.445, 0.05, 0.55, 0.95],
    easeOutCss: [0, 0, 0.58, 1],
    durations: {
      fast: 0.2,
      base: 0.4,
      slow: 0.8,
      cinematic: 1.2,
      micro: 0.3,
      pop: 0.45,
      grow: 0.6,
      count: 1.2,
      hold: 0.3,
      flash: 1.4,
      pulse: 1.6,
      rise: 1.0,
    },
    stagger: { tight: 0.03, base: 0.09, loose: 0.19 },
  },

  beats: [
    { name: "POWER ON", start: 0, end: 1.55 },
    { name: "POPULATE", start: 1.55, end: 5.15 },
    { name: "SELECT", start: 5.15, end: 6.35 },
    { name: "EDIT", start: 6.35, end: 7.7 },
    { name: "PROPAGATE", start: 7.7, end: 10.15 },
    { name: "CONFIRM", start: 10.15, end: 12 },
  ],
  storyEnd: 12,
  scrollTrackVh: 320,
  scrollResponse: 12,
  posterTime: 6.4,

  room: {
    panelWidth: 3,
    panelHeight: 1.6875,
    nominalPanelHeight: 1.7,
    plinthHeight: 0.8,
    wingAngleDeg: 35,
    presenterDistance: 0.6,
    fasciaHeight: 0.07,
    plinthDepth: 0.32,
    fogDensity: 0.011,
    ambient: 0.07,
    hemi: 0.09,
    rectIntensity: 14,
    exposure: 1.05,
    bloomStrength: 0.14,
    bloomRadius: 0.35,
    bloomThreshold: 0.96,
  },

  screen: {
    pxWidth: 2048,
    pxHeight: 1152,
    modelTargetWidth: 1280,
    modelTargetHeight: 720,
    maxFps: 30,
  },

  schedule: {
    weeks: 16,
    editWeeks: 2,
    dataDate: 0.42,
    activities: [
      { code: "A1010", name: "SITE ESTABLISHMENT", start: 0.02, dur: 0.1, crit: false },
      { code: "A1020", name: "PILING", start: 0.1, dur: 0.16, crit: false },
      { code: "A1030", name: "PILE CAPS", start: 0.24, dur: 0.12, crit: false },
      { code: "A1040", name: "LEVEL 03 SLAB POUR", start: 0.36, dur: 0.12, crit: true, edit: true },
      { code: "A1050", name: "LEVEL 03 COLUMNS", start: 0.48, dur: 0.12, crit: true, succ: 0 },
      { code: "A1060", name: "LEVEL 04 DECK", start: 0.58, dur: 0.14, crit: true, succ: 1 },
      { code: "A1070", name: "PLATFORM FITOUT", start: 0.52, dur: 0.18, crit: false },
      { code: "A1080", name: "COMMISSIONING", start: 0.72, dur: 0.16, crit: true, succ: 2 },
    ],
  },

  performance: {
    spiBase: 1.02,
    spiNext: 0.94,
    cpi: 1.04,
    dateBase: "04 APR 27",
    dateNext: "18 APR 27",
  },

  model: {
    yawRate: 0.012,
    levels: 4,
    activeLevel: 3,
  },

  camera: {
    driftPeriod: 24,
    parallaxDeg: 1.5,
    desktop: { position: [0.55, 1.76, 9.35], look: [0.45, 1.22, 0.08], fov: 38, yawDeg: 4, dolly: 0.42 },
    tablet: { position: [-0.15, 1.78, 6.7], look: [-0.2, 1.38, 0.25], fov: 36, yawDeg: 3, dolly: 0.28 },
    phone: { position: [-1.15, 1.62, 4.35], look: [-1.25, 1.42, 0.45], fov: 34, yawDeg: 1.6, dolly: 0.16 },
  },

  figures: {
    presenter: { height: 1.78, standU: 0.64 },
  },

  quality: {
    desktopDpr: 2,
    touchDpr: 1.5,
    slowFrameMs: 22,
    slowWindowMs: 2000,
    warmupMs: 3000,
    tiers: [
      { id: "high", bloom: true, beams: true, dprCap: 2, modelFps: 30 },
      { id: "no-bloom", bloom: false, beams: true, dprCap: 2, modelFps: 30 },
      { id: "no-atmosphere", bloom: false, beams: false, dprCap: 2, modelFps: 20 },
      { id: "dpr1", bloom: false, beams: false, dprCap: 1, modelFps: 15 },
    ],
  },
};

export function editShiftFraction() {
  return CONFIG.schedule.editWeeks / CONFIG.schedule.weeks;
}
