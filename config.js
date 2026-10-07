/**
 * Everything editable. Colours are resolved Serro tokens.
 * Do not introduce hex values that are not listed here.
 */
export const CONFIG = {
  brandLabel: "MISSION ROOM / CINE",
  ariaLabel:
    "Three large projection screens in a shallow curve, with five people seated at a table in front of them. A schedule change on the left screen updates the station model and performance screens across the room.",
  statusLine: "RESCHEDULED · 3 SUCCESSORS UPDATED · FORECAST REVISED",
  quietLine: "BASELINE HELD · CRITICAL PATH CLEAR",

  color: {
    // Room: a dark warm stone behind the setup, and a deeper stone floor.
    stone: "#3a3733",
    stoneFloor: "#2b2926",
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
  // Seconds between each screen's power-on in the intro (left, centre, right).
  intro: { stagger: 0.32, warmSwell: 0.3, lensFlash: 0.8 },
  // Auto-play loop (story seconds): after the first full play and a `hold` on
  // the confirmed state, fade back over `fade` and replay from `from`.
  loop: { from: 5.0, hold: 2.2, fade: 1.1 },
  // Playback speed of the story (1 = authored timing).
  speed: 1.45,
  introSpeed: 1,
  posterTime: 6.4,

  room: {
    panelWidth: 3,
    panelHeight: 1.6875,
    nominalPanelHeight: 1.7,
    plinthHeight: 0.8,
    wingAngleDeg: 35,
    fasciaHeight: 0.07,
    plinthDepth: 0.32,
    ambient: 0.07,
    hemi: 0.09,
    rectIntensity: 14,
    exposure: 1.05,
    beamOpacity: 0.075,
    // Projector height above the screen tops, and where their rods end.
    projectorRise: 0.36,
    ceilingRise: 0.66,
    lensBoost: 0.95,
    glowSize: 0.42,
    glowOpacity: 0.6,
    moteSpeed: 0.035,
  },

  screen: {
    pxWidth: 2048,
    pxHeight: 1152,
    modelTargetWidth: 1280,
    modelTargetHeight: 720,
    maxFps: 60,
    // Canvas pixel scale for the screen images (layout stays at pxWidth).
    resolution: 1,
  },

  schedule: {
    weeks: 16,
    editWeeks: 2,
    dataDate: 0.42,
    // Baseline finish on the forecast chart (fraction of the 16-week axis).
    planFinish: 0.78,
    activities: [
      { code: "A1020", name: "PILING", start: 0.1, dur: 0.16, crit: false },
      { code: "A1030", name: "PILE CAPS", start: 0.24, dur: 0.12, crit: false },
      { code: "A1040", name: "L03 SLAB POUR", start: 0.36, dur: 0.12, crit: true, edit: true },
      { code: "A1050", name: "L03 COLUMNS", start: 0.48, dur: 0.12, crit: true, succ: 0 },
      { code: "A1060", name: "L04 DECK", start: 0.58, dur: 0.14, crit: true, succ: 1 },
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
    yawRate: 0.12,
    levels: 4,
    activeLevel: 3,
  },

  camera: {
    // View direction is fixed; distance and framing are solved every frame so
    // the setup fills whatever box the scene is given (see fitCamera).
    // Straight on (x = 0) so the frame is centred; pitched slightly down.
    direction: [0, -0.54, -9.27],
    fov: 32,
    margin: { x: 0.012, y: 0.03 },
  },

  figures: {
    // Five seated people seen from behind, on the near side of a table, facing
    // the screens. Busts only: each body fades out below the shoulders.
    // Distances are metres in front of the centre screen (z) and above the
    // floor (y). They sit in the dark band under the screens and are checked
    // not to overlap any screen (see ?debug).
    audience: {
      count: 5,
      spacing: 0.7,
      // Gap between the table's near edge and each person's back.
      seatGap: 0.3,
      // Bust base height; the bust is about 0.74 m tall (head top ~ base + 0.74).
      baseY: 0.42,
      // World heights: fully transparent at `from`, solid at `to`.
      fade: { from: 0.44, to: 0.72 },
      shade: { low: "graphite600", high: "sand300", glow: 0.16 },
    },
    table: {
      z: 3.9,
      radiusX: 1.85,
      radiusZ: 0.52,
      top: 0.68,
      thickness: 0.04,
      // The pedestal fades out toward the floor.
      fade: { from: 0.2, to: 0.66 },
    },
  },

  quality: {
    desktopDpr: 2,
    touchDpr: 1.5,
    slowFrameMs: 22,
    slowWindowMs: 2000,
    warmupMs: 3000,
    tiers: [
      { id: "high", motes: true, dprCap: 2, modelFps: 30 },
      { id: "no-bloom", motes: true, dprCap: 2, modelFps: 30 },
      { id: "no-atmosphere", motes: true, dprCap: 2, modelFps: 20 },
      { id: "dpr1", motes: true, dprCap: 1, modelFps: 15 },
    ],
  },
};

export function editShiftFraction() {
  return CONFIG.schedule.editWeeks / CONFIG.schedule.weeks;
}
