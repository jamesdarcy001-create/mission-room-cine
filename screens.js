import { CONFIG } from "./config.js";
import { activityShift, barInterval, popScale, scramble } from "./story.js";

const W = CONFIG.screen.pxWidth;
const H = CONFIG.screen.pxHeight;
const C = CONFIG.color;
const F = CONFIG.font;

export const LAYOUT = {
  w: W,
  h: H,
  pad: 80,
  chartLeft: 860,
  chartRight: 1968,
  chartTop: 268,
  chartBottom: 1048,
};

const FONT = {
  eyebrow: `600 36px ${F.mono}`,
  title: `500 84px ${F.display}`,
  name: `500 34px ${F.display}`,
  mono: `400 24px ${F.mono}`,
  monoStrong: `600 22px ${F.mono}`,
  micro: `600 20px ${F.mono}`,
  legend: `400 22px ${F.mono}`,
};

const FONT5 = {
  "0": "01110100011001110101110011000101110",
  "1": "00100011000010000100001000010001110",
  "2": "01110100010000100010001000100011111",
  "3": "01110100010000100110000011000101110",
  "4": "00010001100101010010111110001000010",
  "5": "11111100001111000001000011000101110",
  "6": "00110010001000011110100011000101110",
  "7": "11111000010001000100010000100001000",
  "8": "01110100011000101110100011000101110",
  "9": "01110100011000101111000010001001100",
  " ": "00000000000000000000000000000000000",
  ".": "00000000000000000000000000110001100",
  "-": "00000000000000011111000000000000000",
  A: "01110100011000111111100011000110001",
  B: "11110100011000111110100011000111110",
  C: "01110100011000010000100001000101110",
  D: "11100100011000110001100011000111100",
  E: "11111100001000011100100001000011111",
  F: "11111100001000011100100001000010000",
  G: "01110100011000010111100011000101111",
  H: "10001100011111110001100011000110001",
  I: "01110001000010000100001000010001110",
  J: "00111000100001000010100101001001100",
  K: "10001100101010011000101001001010001",
  L: "10000100001000010000100001000011111",
  M: "10001110111010110101100011000110001",
  N: "10001110011010110011100011000110001",
  O: "01110100011000110001100011000101110",
  P: "11110100011000111110100001000010000",
  R: "11110100011000111110101001001010001",
  S: "01111100001000001110000010000111110",
  T: "11111001000010000100001000010000100",
  U: "10001100011000110001100011000101110",
  V: "10001100011000110001010100101000100",
  W: "10001100011000110101101011010101010",
  X: "10001100010101000100010101000110001",
  Y: "10001100010101000100001000010000100",
  Z: "11111000010001000100010001000011111",
};

function setFont(ctx, font, color) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  if ("letterSpacing" in ctx) ctx.letterSpacing = "-0.03em";
}

function hairline(ctx, x, y, w) {
  ctx.fillStyle = C.graphite700;
  ctx.fillRect(x, y, w, 3);
}

function verticalBand(ctx, y, h) {
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = C.graphite700;
  const pitch = [8, 8, 6, 14, 8, 8, 18, 8, 10];
  let x = 0;
  let i = 0;
  while (x < W) {
    ctx.fillRect(x, y, 2, h);
    x += 2 + pitch[i % pitch.length] + 7;
    i += 1;
  }
  ctx.restore();
}

function header(ctx, eyebrow, title, story, liveLabel) {
  ctx.fillStyle = C.graphite900;
  ctx.fillRect(0, 0, W, 210);
  verticalBand(ctx, 0, 210);
  ctx.fillStyle = C.graphite850;
  ctx.fillRect(0, 210, W, H - 210);
  setFont(ctx, FONT.eyebrow, C.accent);
  ctx.textAlign = "left";
  ctx.fillText(scramble(eyebrow, story.eyebrow, story.quant), LAYOUT.pad, 78);
  setFont(ctx, FONT.title, C.ivory);
  ctx.fillText(title, LAYOUT.pad, 148);
  hairline(ctx, LAYOUT.pad, 196, W - LAYOUT.pad * 2);
  drawLiveDot(ctx, W - 220, 78, story, liveLabel);
}

function drawLiveDot(ctx, x, y, story, label) {
  ctx.save();
  ctx.fillStyle = C.green500;
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  setFont(ctx, FONT.micro, C.graphite400);
  ctx.textAlign = "left";
  ctx.fillText(label, x + 22, y);
}

function rowMetrics() {
  const rows = CONFIG.schedule.activities.length;
  const rowH = (LAYOUT.chartBottom - LAYOUT.chartTop) / rows;
  return { rows, rowH };
}

export function rowCenterY(index) {
  const { rowH } = rowMetrics();
  return LAYOUT.chartTop + rowH * index + rowH / 2;
}

function chartX(fraction) {
  return LAYOUT.chartLeft + fraction * (LAYOUT.chartRight - LAYOUT.chartLeft);
}

export function editCanvasPoint(story, baseline) {
  const index = CONFIG.schedule.activities.findIndex((item) => item.edit);
  const bar = barInterval(story, index, baseline);
  return {
    x: chartX(bar.end),
    y: rowCenterY(index),
    u: chartX(bar.end) / W,
    v: 1 - rowCenterY(index) / H,
  };
}

function drawCursor(ctx, story) {
  if (story.cursor < 0.04) return;
  const x = story.cursorU * W;
  const y = (1 - story.cursorV) * H;
  ctx.save();
  ctx.globalAlpha = Math.min(1, story.cursor);
  ctx.strokeStyle = C.accent;
  ctx.fillStyle = C.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 28, y);
  ctx.lineTo(x - 10, y);
  ctx.moveTo(x + 10, y);
  ctx.lineTo(x + 28, y);
  ctx.moveTo(x, y - 28);
  ctx.lineTo(x, y - 10);
  ctx.moveTo(x, y + 10);
  ctx.lineTo(x, y + 28);
  ctx.stroke();
  ctx.fillRect(x - 2, y - 2, 4, 4);
  ctx.restore();
}

function drawGantt(ctx, story, baseline) {
  const activities = CONFIG.schedule.activities;
  const { rowH } = rowMetrics();

  setFont(ctx, FONT.micro, C.graphite400);
  ctx.textAlign = "center";
  for (let w = 0; w <= CONFIG.schedule.weeks; w += 2) {
    const x = chartX(w / CONFIG.schedule.weeks);
    ctx.fillText(`W${String(w).padStart(2, "0")}`, x, LAYOUT.chartTop - 28);
    ctx.fillStyle = C.white06;
    ctx.fillRect(x, LAYOUT.chartTop, 2, LAYOUT.chartBottom - LAYOUT.chartTop);
    ctx.fillStyle = C.graphite400;
  }

  const dateX = chartX(CONFIG.schedule.dataDate);
  ctx.fillStyle = C.ivory60;
  ctx.fillRect(dateX, LAYOUT.chartTop - 8, 3, LAYOUT.chartBottom - LAYOUT.chartTop + 8);
  ctx.save();
  ctx.translate(dateX - 18, (LAYOUT.chartTop + LAYOUT.chartBottom) / 2);
  ctx.rotate(-Math.PI / 2);
  setFont(ctx, FONT.micro, C.ivory);
  ctx.textAlign = "center";
  ctx.fillText("DATA DATE", 0, 0);
  ctx.restore();

  activities.forEach((activity, i) => {
    const y = LAYOUT.chartTop + rowH * i;
    const rise = baseline ? 1 : story.barRise[i];
    const bar = barInterval(story, i, baseline);
    const edited = !baseline && (activity.edit || activity.succ != null) && activityShift(story, activity, false) > 0.02;
    if (!baseline && story.highlight > 0 && activity.edit) {
      ctx.save();
      ctx.globalAlpha = story.highlight;
      ctx.fillStyle = C.accentSoft;
      ctx.fillRect(LAYOUT.pad, y + 8, W - LAYOUT.pad * 2, rowH - 16);
      ctx.restore();
    }
    if (!baseline && story.rowFlash > 0 && (activity.edit || activity.succ != null)) {
      ctx.save();
      ctx.globalAlpha = story.rowFlash;
      ctx.fillStyle = C.white14;
      ctx.fillRect(LAYOUT.pad, y + 8, W - LAYOUT.pad * 2, rowH - 16);
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = rise;
    const dy = (1 - rise) * 24;
    setFont(ctx, FONT.micro, activity.crit ? C.accent : C.graphite400);
    ctx.textAlign = "left";
    ctx.fillText(activity.code, LAYOUT.pad, y + rowH * 0.38 + dy);
    setFont(ctx, FONT.name, C.ivory);
    ctx.fillText(activity.name, LAYOUT.pad + 150, y + rowH * 0.62 + dy);

    const x0 = chartX(bar.start);
    const x1 = chartX(bar.end);
    const bh = 42;
    const by = y + (rowH - bh) / 2 + dy;
    if (edited) {
      const ghost = barInterval(story, i, true);
      ctx.strokeStyle = C.graphite500;
      ctx.lineWidth = 2;
      ctx.strokeRect(chartX(ghost.start), by, Math.max(8, chartX(ghost.end) - chartX(ghost.start)), bh);
    }
    ctx.fillStyle = activity.crit ? C.accent : C.sand300;
    ctx.fillRect(x0, by, Math.max(8, x1 - x0), bh);
    if (activity.crit) {
      ctx.fillStyle = C.accent;
      ctx.fillRect(x0, by, 6, bh);
    }
    ctx.restore();
  });

  ctx.save();
  ctx.strokeStyle = C.graphite500;
  ctx.lineWidth = 2;
  ctx.lineJoin = "miter";
  activities.forEach((activity, i) => {
    if (activity.succ == null) return;
    const fromIndex = activity.succ === 0 ? activities.findIndex((item) => item.edit) : activities.findIndex((item) => item.succ === activity.succ - 1);
    if (fromIndex < 0) return;
    const a = barInterval(story, fromIndex, baseline);
    const b = barInterval(story, i, baseline);
    const y1 = rowCenterY(fromIndex);
    const y2 = rowCenterY(i);
    const x1 = chartX(a.end);
    const x2 = chartX(b.start);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + 18, y1);
    ctx.lineTo(x1 + 18, y2);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  });
  ctx.restore();

  setFont(ctx, FONT.micro, C.graphite400);
  ctx.textAlign = "left";
  ctx.fillText("WBS  A1000", LAYOUT.pad, H - 56);
  ctx.textAlign = "right";
  ctx.fillText("CALENDAR  5-DAY", W - LAYOUT.pad, H - 56);
}

function seriesPoint(kind, x, edited) {
  const planned = 1 / (1 + Math.exp(-9.5 * (x - 0.48)));
  if (kind === "planned") return planned;
  const date = CONFIG.schedule.dataDate;
  if (kind === "actual") {
    if (x >= date) return 1 / (1 + Math.exp(-9.5 * (date - 0.48)));
    return planned * 0.98;
  }
  const end = edited > 0.5 ? 1 : 0.9 - edited * 0.08;
  if (x <= date) return 1 / (1 + Math.exp(-9.5 * (date - 0.48))) * 0.98;
  const u = (x - date) / (end - date);
  const startY = 1 / (1 + Math.exp(-9.5 * (date - 0.48))) * 0.98;
  return startY + (1 - startY) * (u * u * (3 - 2 * u));
}

function drawCurve(ctx, story, baseline) {
  const x = 96;
  const y = 250;
  const w = 1180;
  const h = 520;
  const edited = baseline ? 0 : story.shift;
  ctx.fillStyle = C.white04;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = C.graphite700;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  ctx.strokeStyle = C.graphite700;
  ctx.beginPath();
  ctx.moveTo(x + 64, y + 36);
  ctx.lineTo(x + 64, y + h - 48);
  ctx.lineTo(x + w - 36, y + h - 48);
  ctx.stroke();

  const plot = (kind, color, width, dash, reveal) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 64, y + 24, w - 100, h - 72);
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    const steps = 48;
    const n = Math.max(2, Math.round(reveal * steps));
    for (let i = 0; i <= n; i += 1) {
      const u = i / steps;
      const px = x + 64 + u * (w - 110);
      const py = y + h - 48 - seriesPoint(kind, u, edited) * (h - 110);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  };

  const reveal = baseline ? 1 : story.curveDraw;
  const forecastReveal = baseline ? 1 : story.forecastReveal;
  plot("planned", C.ivory, 4, [], reveal);
  plot("actual", C.sand300, 4, [], reveal);
  plot("forecast", C.accent, 4, [14, 10], forecastReveal);

  const legend = [
    ["PLANNED", C.ivory],
    ["ACTUAL", C.sand300],
    ["FORECAST", C.accent],
  ];
  legend.forEach((item, i) => {
    const lx = x + 80 + i * 220;
    const ly = y + 28;
    ctx.fillStyle = item[1];
    ctx.fillRect(lx, ly - 4, 28, 4);
    setFont(ctx, FONT.legend, C.sand300);
    ctx.textAlign = "left";
    ctx.fillText(item[0], lx + 40, ly);
  });
}

function glyphRows(ch) {
  const raw = FONT5[ch] || FONT5[" "];
  const rows = [];
  for (let r = 0; r < 7; r += 1) rows.push(raw.slice(r * 5, r * 5 + 5));
  return rows;
}

function drawGlyph(ctx, ch, x, y, dot, gap) {
  const rows = glyphRows(ch);
  rows.forEach((row, r) => {
    for (let c = 0; c < 5; c += 1) {
      if (row[c] === "1") ctx.fillRect(x + c * (dot + gap), y + r * (dot + gap), dot, dot);
    }
  });
}

function pixelAdvance(dot, gap) {
  return 5 * (dot + gap) + dot * 1.6;
}

function drawPixelString(ctx, text, x, y, dot, gap, color) {
  ctx.fillStyle = color;
  let cursor = x;
  const adv = pixelAdvance(dot, gap);
  for (let i = 0; i < text.length; i += 1) {
    drawGlyph(ctx, text[i], cursor, y, dot, gap);
    cursor += adv;
  }
  return cursor;
}

function drawPixelRoller(ctx, from, to, progress, x, y, dot, gap, color) {
  const cellH = 7 * (dot + gap);
  const adv = pixelAdvance(dot, gap);
  let cursor = x;
  ctx.fillStyle = color;
  for (let i = 0; i < from.length; i += 1) {
    const a = from[i];
    const b = to[i] || " ";
    const p = a === b ? 0 : progress;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cursor - 2, y - 2, adv, cellH + 4);
    ctx.clip();
    ctx.translate(0, -p * cellH);
    drawGlyph(ctx, a, cursor, y, dot, gap);
    drawGlyph(ctx, b, cursor, y + cellH, dot, gap);
    ctx.restore();
    cursor += adv;
  }
}

function growFrame(ctx, x, y, w, h, p) {
  const pp = Math.max(0.001, Math.min(1, p));
  ctx.save();
  ctx.translate(x, y + h);
  ctx.scale(pp, pp);
  ctx.strokeStyle = C.graphite700;
  ctx.lineWidth = 3;
  ctx.strokeRect(0, -h, w, h);
  ctx.strokeStyle = C.accent;
  const m = 14;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -h + m);
  ctx.lineTo(0, -h);
  ctx.lineTo(m, -h);
  ctx.moveTo(w - m, -h);
  ctx.lineTo(w, -h);
  ctx.lineTo(w, -h + m);
  ctx.moveTo(0, -m);
  ctx.lineTo(0, 0);
  ctx.lineTo(m, 0);
  ctx.moveTo(w - m, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, -m);
  ctx.stroke();
  ctx.restore();
}

function drawKpis(ctx, story, baseline) {
  const cards = [
    { label: "SPI", kind: "spi" },
    { label: "CPI", kind: "cpi" },
    { label: "FORECAST", kind: "date" },
  ];
  const y = 800;
  const h = 210;
  const gap = 24;
  const w = (W - LAYOUT.pad * 2 - gap * 2) / 3;
  cards.forEach((card, i) => {
    const x = LAYOUT.pad + i * (w + gap);
    const frameP = baseline ? 1 : story.kpiFrame;
    const pop = !baseline && card.kind === "date" ? popScale(story.pop) : 1;
    ctx.save();
    if (pop !== 1) {
      ctx.translate(x + w / 2, y + h / 2);
      ctx.scale(pop, pop);
      ctx.translate(-(x + w / 2), -(y + h / 2));
    }
    growFrame(ctx, x, y, w, h, frameP);
    const labelAlpha = baseline ? 1 : Math.max(0, Math.min(1, (story.kpiFrame - 0.5) / 0.5));
    ctx.save();
    ctx.globalAlpha = labelAlpha;
    setFont(ctx, FONT.micro, C.graphite400);
    ctx.textAlign = "left";
    ctx.fillText(card.label, x + 28, y + 36);
    ctx.restore();
    if ((baseline ? 1 : story.kpiCount) <= 0) {
      ctx.restore();
      return;
    }
    const dot = card.kind === "date" ? 8 : 11;
    const gapPx = 3;
    const color = card.kind === "cpi" ? C.graphite400 : C.accent;
    if (card.kind === "spi") {
      const counted = CONFIG.performance.spiBase * (baseline ? 1 : Math.max(story.kpiCount, 0.001));
      const from = counted.toFixed(2);
      const to = CONFIG.performance.spiNext.toFixed(2);
      const roll = baseline ? 0 : story.spiRoll;
      drawPixelRoller(ctx, roll > 0 ? CONFIG.performance.spiBase.toFixed(2) : from, roll > 0 ? to : from, roll, x + 28, y + 78, dot, gapPx, color);
    } else if (card.kind === "cpi") {
      const value = (CONFIG.performance.cpi * (baseline ? 1 : Math.max(story.kpiCount, 0.001))).toFixed(2);
      drawPixelString(ctx, value, x + 28, y + 78, dot, gapPx, color);
    } else {
      const from = CONFIG.performance.dateBase;
      const to = CONFIG.performance.dateNext;
      const roll = baseline ? 0 : story.dateRoll;
      drawPixelRoller(ctx, from, to, roll, x + 28, y + 86, dot, gapPx, C.accent);
    }
    ctx.restore();
  });
}

function drawStatus(ctx, story, baseline) {
  if (!baseline && story.kpiFrame < 0.45 && story.status <= 0) return;
  const text = baseline || story.status <= 0
    ? CONFIG.quietLine
    : scramble(CONFIG.statusLine, story.status, story.quant);
  setFont(ctx, FONT.monoStrong, story.status > 0 && !baseline ? C.ivory : C.graphite400);
  ctx.textAlign = "left";
  ctx.fillText(text, LAYOUT.pad, H - 52);
}

export function createSurfaces() {
  const make = (alpha) => {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { alpha, desynchronized: true });
    ctx.lineJoin = "miter";
    ctx.lineCap = "butt";
    return { canvas, ctx };
  };
  return { left: make(false), right: make(false), overlay: make(true) };
}

function paintLeft(ctx, story, baseline) {
  header(ctx, "SCHEDULE", "Critical path", story, "LIVE");
  drawGantt(ctx, story, baseline);
  if (!baseline) drawCursor(ctx, story);
}

function paintRight(ctx, story, baseline) {
  header(ctx, "PERFORMANCE", "Forecast", story, "LIVE");
  drawCurve(ctx, story, baseline);
  drawKpis(ctx, story, baseline);
  drawStatus(ctx, story, baseline);
}

function paintOverlay(ctx, story, baseline) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = C.graphite900;
  ctx.fillRect(0, 0, W, 210);
  verticalBand(ctx, 0, 210);
  setFont(ctx, FONT.eyebrow, C.accent);
  ctx.textAlign = "left";
  ctx.fillText(scramble("4D MODEL", story.eyebrow, story.quant), LAYOUT.pad, 78);
  setFont(ctx, FONT.title, C.ivory);
  ctx.fillText("Station frame", LAYOUT.pad, 148);
  hairline(ctx, LAYOUT.pad, 196, W - LAYOUT.pad * 2);
  drawLiveDot(ctx, W - 280, 78, story, "LIVE");
  ctx.fillStyle = C.graphite900;
  ctx.fillRect(0, H - 260, 760, 260);

  const showTag = !baseline && story.resequence > 0.15 && story.reset < 0.85;
  if (showTag) {
    const x = W - 420;
    const y = 250;
    ctx.save();
    ctx.globalAlpha = Math.min(1, story.resequence) * (1 - story.reset);
    ctx.fillStyle = C.accent;
    ctx.fillRect(x, y, 280, 220);
    ctx.fillStyle = C.graphite950;
    [[18, 18], [280 - 32, 18], [18, 220 - 32], [280 - 32, 220 - 32]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, 8, 0, Math.PI * 2);
      ctx.fill();
    });
    drawPixelString(ctx, "03", x + 70, y + 70, 16, 5, C.ivory);
    ctx.restore();
  }

  const rows = [
    ["GRID", "5 × 2"],
    ["LEVELS", "04"],
    ["ACTIVITY", showTag ? "A1040" : "A1000"],
    ["SYSTEM", CONFIG.brandLabel],
  ];
  rows.forEach((row, i) => {
    const y = H - 220 + i * 42;
    setFont(ctx, FONT.micro, C.graphite400);
    ctx.textAlign = "left";
    ctx.fillText(row[0], LAYOUT.pad, y);
    setFont(ctx, FONT.mono, C.ivory);
    ctx.textAlign = "right";
    ctx.fillText(row[1], 640, y);
    ctx.fillStyle = C.graphite700;
    ctx.fillRect(LAYOUT.pad, y + 16, 560, 2);
  });
}

function scratchFor(surface) {
  if (!surface.scratch) {
    surface.scratch = document.createElement("canvas");
    surface.scratch.width = W;
    surface.scratch.height = H;
  }
  return surface.scratch;
}

// `only` limits the repaint to the named surfaces ("left", "right", "overlay").
export function paintSurfaces(surfaces, story, only) {
  const blend = story.reset;
  const jobs = [
    ["left", surfaces.left, paintLeft],
    ["right", surfaces.right, paintRight],
    ["overlay", surfaces.overlay, paintOverlay],
  ].filter(([name]) => !only || only.includes(name));
  jobs.forEach(([, surface, painter]) => {
    if (blend >= 0.985) {
      painter(surface.ctx, story, true);
      return;
    }
    painter(surface.ctx, story, false);
    if (blend > 0.02) {
      const scratch = scratchFor(surface);
      const sctx = scratch.getContext("2d");
      painter(sctx, story, true);
      surface.ctx.save();
      surface.ctx.globalAlpha = blend;
      surface.ctx.drawImage(scratch, 0, 0);
      surface.ctx.restore();
    }
  });
}

// One key per surface, so a scroll step only repaints (and re-uploads) the
// screens whose content actually moved. The scramble tick only counts while a
// scramble is mid-decode; otherwise it would mark every surface dirty on
// every frame.
export function surfaceKeys(story) {
  const f = (v) => v.toFixed(3);
  const decoding = story.eyebrow > 0 && story.eyebrow < 1;
  const statusDecoding = story.status > 0 && story.status < 1;
  const shared = [f(story.eyebrow), decoding ? story.quant : "", f(story.reset), Math.floor(story.dotPhase * 8)];
  return {
    left: [
      ...shared,
      story.barRise.map(f).join(","),
      f(story.highlight),
      f(story.rowFlash),
      f(story.shift),
      story.succ.map(f).join(","),
      f(story.cursor),
      story.cursorU.toFixed(4),
      story.cursorV.toFixed(4),
    ].join("|"),
    right: [
      ...shared,
      statusDecoding ? story.quant : "",
      f(story.curveDraw),
      f(story.forecastReveal),
      f(story.kpiFrame),
      f(story.kpiCount),
      f(story.pop),
      f(story.spiRoll),
      f(story.dateRoll),
      f(story.status),
    ].join("|"),
    overlay: [...shared, f(story.resequence)].join("|"),
  };
}
