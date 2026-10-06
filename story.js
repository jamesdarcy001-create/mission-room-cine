import { CONFIG, editShiftFraction } from "./config.js";

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function seg(t, a, b) {
  return clamp01((t - a) / (b - a));
}

function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i += 1) {
      const dx = sampleDX(t);
      if (Math.abs(dx) < 1e-6) break;
      t = Math.min(1, Math.max(0, t - (sampleX(t) - x) / dx));
    }
    return sampleY(t);
  };
}

const M = CONFIG.motion;
export const ease = {
  expo: cubicBezier(...M.easeOutExpo),
  soft: cubicBezier(...M.easeSoft),
  snap: cubicBezier(...M.easeSnap),
  travel: cubicBezier(...M.easeTravel),
  sine: cubicBezier(...M.easeInOutSine),
  css: cubicBezier(...M.easeOutCss),
  cubic: (t) => 1 - (1 - clamp01(t)) ** 3,
};

export function beatAt(t) {
  const beats = CONFIG.beats;
  let name = beats[0].name;
  for (let i = 0; i < beats.length; i += 1) {
    if (t >= beats[i].start) name = beats[i].name;
  }
  return name;
}

export function createStoryState() {
  return {
    t: 0,
    elapsed: 0,
    beat: CONFIG.beats[0].name,
    power: 0,
    frameLinear: 0,
    bg: 0,
    eyebrow: 0,
    barRise: new Array(CONFIG.schedule.activities.length).fill(0),
    modelLevel: new Array(CONFIG.model.levels).fill(0),
    curveDraw: 0,
    kpiFrame: 0,
    kpiCount: 0,
    highlight: 0,
    arm: 0,
    shift: 0,
    succ: [0, 0, 0],
    pulse: 0,
    pulseOpacity: 0,
    resequence: 0,
    dateRoll: 0,
    spiRoll: 0,
    forecastReveal: 0,
    forecastEdited: 0,
    rowFlash: 0,
    pop: 0,
    status: 0,
    reset: 0,
    dotPhase: 0,
    cursor: 0,
    cursorU: 0.5,
    cursorV: 0.5,
    quant: 0,
  };
}

export function sampleStory(t, elapsed, s) {
  const D = M.durations;
  const activities = CONFIG.schedule.activities;
  s.t = t;
  s.elapsed = elapsed;
  s.beat = beatAt(t);
  s.quant = Math.floor(t * 24);

  s.power = ease.soft(seg(t, 0.05, 0.05 + D.slow));
  s.frameLinear = seg(t, 0, D.cinematic);
  s.bg = ease.soft(seg(t, 0.35, 0.35 + D.slow));
  s.eyebrow = ease.sine(seg(t, 1.55, 1.55 + D.base));

  for (let i = 0; i < activities.length; i += 1) {
    const start = 1.65 + i * M.stagger.base;
    s.barRise[i] = ease.expo(seg(t, start, start + D.rise));
  }
  for (let i = 0; i < CONFIG.model.levels; i += 1) {
    const start = 1.75 + i * M.stagger.base;
    s.modelLevel[i] = ease.expo(seg(t, start, start + D.rise));
  }

  s.curveDraw = ease.expo(seg(t, 1.9, 1.9 + D.cinematic));
  s.kpiFrame = ease.expo(seg(t, 2.5, 2.5 + D.grow));
  s.kpiCount = ease.cubic(seg(t, 2.5 + D.grow + D.hold, 2.5 + D.grow + D.hold + D.count));

  const select = 5.15;
  s.highlight = t < select ? 0 : t < select + D.micro ? ease.css(seg(t, select, select + D.micro)) : 1;
  s.arm = s.highlight;
  s.cursor = s.highlight;

  const edit = 6.35;
  s.shift = ease.snap(seg(t, edit, edit + D.slow));
  for (let i = 0; i < 3; i += 1) {
    const start = edit + 0.12 + i * M.stagger.base;
    s.succ[i] = ease.snap(seg(t, start, start + D.slow));
  }

  const prop = 7.7;
  const spawn = ease.snap(seg(t, prop, prop + D.micro));
  s.pulse = ease.travel(seg(t, prop + 0.25, prop + 0.25 + D.slow));
  const arriveFade = ease.soft(seg(t, prop + 1.05, prop + 1.05 + D.micro));
  s.pulseOpacity = t < prop || t > prop + 2.2 ? 0 : spawn * (1 - arriveFade);

  s.resequence = ease.expo(seg(t, prop + 0.9, prop + 0.9 + D.cinematic));
  s.dateRoll = ease.expo(seg(t, prop + 1.05, prop + 1.05 + D.slow));
  s.spiRoll = ease.expo(seg(t, prop + 1.15, prop + 1.15 + D.slow));
  s.forecastEdited = ease.expo(seg(t, prop + 1.0, prop + 1.0 + D.cinematic));
  s.forecastReveal = t < prop + 1.0 ? s.curveDraw : s.forecastEdited;

  const confirm = 10.15;
  s.rowFlash = t >= confirm && t < confirm + D.flash ? 1 - ease.css(seg(t, confirm, confirm + D.flash)) : 0;
  s.pop = t < confirm ? 0 : t > confirm + D.pop ? 1 : seg(t, confirm, confirm + D.pop);
  s.status = t < confirm ? 0 : ease.sine(seg(t, confirm, confirm + D.base));
  s.reset = 0;
  s.dotPhase = 0;
  return s;
}

export function activityShift(story, activity, baseline) {
  if (baseline) return 0;
  if (activity.edit) return story.shift;
  if (activity.succ != null) return story.succ[activity.succ];
  return 0;
}

export function barInterval(story, index, baseline) {
  const activity = CONFIG.schedule.activities[index];
  const delta = activityShift(story, activity, baseline) * editShiftFraction();
  return { start: activity.start + delta, end: activity.start + activity.dur + delta };
}

const SCRAMBLE = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";

export function scramble(text, progress, quant) {
  if (progress <= 0) return "";
  const n = text.length;
  let out = "";
  for (let i = 0; i < n; i += 1) {
    const ch = text[i];
    if (ch === " " || ch === "·" || ch === "/" || ch === "-" || ch === ".") {
      out += ch;
      continue;
    }
    const threshold = (i + 0.35) / n;
    if (progress >= threshold) out += ch;
    else out += SCRAMBLE[(i * 13 + quant * 7) % SCRAMBLE.length];
  }
  return out;
}

export function popScale(p) {
  if (p <= 0 || p >= 1) return 1;
  if (p < 0.6) return 0.7 + (1.08 - 0.7) * ease.css(p / 0.6);
  return 1.08 + (1 - 1.08) * ease.css((p - 0.6) / 0.4);
}
