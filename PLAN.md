# Mission Room CINE — plan

Written before the scene code. Precedence: the build brief, then the Serro design spec, then the Serro motion spec, then Anduril motion accents. Where both motion specs name the same token, Serro's value wins. No names, logos, or copy from either source site.

Revision: the scene is scroll-scrubbed. Progress through the 320vh track maps to a 12s story (power on, populate, select, edit, propagate, confirm) and holds the confirmed state. There is no play control, no hold-and-drift loop, and no reset. The accent is Serro red.500 `#e5484d` with an 18% wash. One merged presenter stands at the left screen. The floor is a matte standard material; the reflector pass is gone.

## Tech choices

| Piece | Choice | Why |
| --- | --- | --- |
| three.js | `0.186.1` via `https://esm.sh/three@0.186.1` | Current stable on npm at build time. esm.sh rewrites bare `three` imports inside addons, so the page does not need an import map for the WordPress snippet, and the addon graph shares one module instance. |
| Addons | `RectAreaLightUniformsLib`, `Reflector`, `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `OutputPass` from the same pinned build | Area lights, a low-resolution floor reflection, and a high-threshold bloom. |
| Timeline | Hand-written, one clock | The brief allows this. A single `sampleStory(t)` function makes the 24 s loop deterministic and scrubable without a second runtime. GSAP 3.15.0 was current and was not loaded. |
| Type | Inter 5.3.0 and JetBrains Mono 5.3.0 from jsDelivr `@fontsource`, unique family names `MRC Cine Inter` and `MRC Cine Mono` | Spec faces are self-hosted commercial cuts. The spec's own fallbacks are OFL. Unique family names avoid colliding with a host page. |
| Pixel numerals | Procedural 5×7 dot grid on the canvas | No Geist Pixel font file. |
| Index | Import map points `three` and `three/addons/` at the same esm.sh URLs the module imports by absolute URL | Satisfies the index import-map requirement and cannot load a second three. |

## Token mapping

Resolved values only. Semantic tokens are listed as the primitive they resolve to.

| Token | Resolved | Where |
| --- | --- | --- |
| `{color.graphite.950}` | `#1b1b1b` | Page void, fog, clear colour, audience figures, fallback |
| `{color.graphite.925}` | `#1f1f1f` | Fog lift if 950 crushes under ACES |
| `{color.graphite.900}` | `#202020` | Sunken screen wells |
| `{color.graphite.875}` | `#262624` | Presenter and colleague |
| `{color.graphite.850}` | `#272727` | Screen background, button fill, floor tint |
| `{color.graphite.800}` | `#303030` | Raised screen bands, reflector tint |
| `{color.graphite.700}` | `#4f4f4d` | Hairline rails, frames, button border |
| `{color.graphite.500}` | `#7c7b77` | Strong rules, dependency lines |
| `{color.graphite.400}` | `#9b9b9b` | Muted micro-copy, pen body |
| `{color.ivory.50}` | `#faf9f5` | Primary text, planned S-curve, model lines |
| `{color.sand.300}` | `#dcd5ca` | Secondary text, non-critical bars, actual S-curve |
| `{color.blue.500}` | `#3e77e8` | The one accent: critical path, forecast curve, active level |
| `{color.blue.300}` | `#7b93ff` | Small accent text, eyebrows, focus ring, data pulse |
| `{color.blue.450}` / `{color.selected}` | `#4b6bf5` / `rgba(75,107,245,0.16)` | Highlight sweep fill |
| `{color.green.500}` | `#30a46c` | Live status dot only |
| `{color.alpha.white_14}` | `rgba(255,255,255,0.14)` | Row-flash overlay, vignette is graphite not white |
| `{color.alpha.ivory_60}` | `rgba(250,249,245,0.6)` | Datasheet rules |
| `{radius.0}` | `0` | Button, frames, bars |
| `{text.eyebrow}` | mono 600, upper, −0.03em | Screen eyebrows. Canvas size is larger than 20 px so the glyph survives the screen's footprint in frame |
| `{text.heading.sm}` / display tracking | Inter 500, −0.03em | Screen titles |
| `{text.micro.mono}` | mono 600 upper | Datasheet labels |
| `{text.numeral.pixel.md}` | 5×7 dots, blue or muted | SPI, CPI, forecast date |
| Vertical-line band | 1 px strokes at an irregular pitch, drawn 2 canvas px so they remain visible | Header of each screen |
| Punched-tag plate | Blue plate, four dark dots, one numeral | Centre screen, level `03`, only while that level is the edited element |
| Framed product window | Hairline frame around each projection surface | OS window dots are omitted: these are projection screens, not app chrome |

Status amber and red are not used. The slip is communicated by the blue accent moving, not by an alarm colour.

Canvas hairlines are 2–3 px, not 1 px. At 2048 px across a screen that occupies roughly 600 px of a 1440 px frame, a 1 px canvas stroke is a fraction of a device pixel. The token stays `{color.border.default}`; only the raster thickness changes.

## Motion mapping

| Pattern | Token | Value used | Scene beat |
| --- | --- | --- | --- |
| rule-draw | ease-out-expo, Serro cinematic | `cubic-bezier(0.16, 1, 0.3, 1)`, 1200 ms | Screen frames, from the left |
| text-scramble-decode | Serro `base` 400 ms, Anduril ease-in-out-sine | 400 ms, `cubic-bezier(0.445, 0.05, 0.55, 0.95)` | Eyebrows, confirm status line |
| card-grid-rise | ease-out-expo, slower 1000 ms, stagger base 90 ms | 24 px equivalent on the canvas | Gantt bars |
| chart-draw-on-view | ease-out-expo, cinematic 1200 ms | S-curve dash reveal, then the forecast redraw |
| stat-block-grow-count | grow 600 ms ease-out-expo, hold 300 ms, count 1200 ms ease-out-cubic | KPI frames, then SPI and CPI |
| demo-status-pulse | pulse 1600 ms, css ease-out | Live dots |
| demo-highlight-sweep | micro 300 ms, css ease-out | Critical row |
| demo-marker-shift | slow 800 ms, ease-snap `cubic-bezier(0.2, 0.8, 0.2, 1)`, stagger 90 ms | Bar drag, then three successors |
| demo-chip-travel | spawn 300 ms ease-snap, travel slow 800 ms ease-travel `cubic-bezier(0.55, 0, 0.25, 1)` | Blue pulse across the three screens at one height |
| roller-counter | Serro slow 800 ms, ease-out-expo | Forecast date and SPI |
| demo-row-flash | flash 1400 ms, css ease-out | Changed rows |
| demo-pop-confirm | pop 450 ms, 8% overshoot, css ease-out | Forecast KPI only |
| Arrive fast, settle long | expo-out on entrances | Power-on, populate, confirm |
| Draw the structure, then fill it | Frames lead the screen fill by about 0.7 s | Power on |

The brief's beat windows override the explainer's 3200 ms hold. Holds are 6.0–9.0 s and 16.0–21.0 s. No springs, no hover lift, no scroll-scrub.

## Beat sheet

Clock is content time `t`. Camera drift uses the same clock while playing, so a pause freezes both. After `t` reaches 24 it wraps to 6, not to 0. Power-on does not replay.

| t | Beat | What moves |
| --- | --- | --- |
| 0.00–2.50 | POWER ON | Beams and rect lights fade (ease-soft, 800 ms from 0.20). Frames draw (1200 ms from 0.15, four edges staggered). Screen fill fades (ease-soft, 800 ms from 0.90). |
| 2.50–6.00 | POPULATE | Eyebrows decode from 2.50 (400 ms). Bars rise from 2.55, index × 90 ms, 1000 ms each. Model levels draw with the same stagger. S-curve draws from 2.80 (1200 ms). KPI frames grow from 3.40 (600 ms); numbers count from 4.30 (1200 ms, ease-out-cubic). |
| 6.00–9.00 | HOLD AND DRIFT | Status dots pulse. Camera yaw ±3° and a 0.16 m dolly, period 24 s. Hero still and reduced-motion frame are `t = 8`. |
| 9.00–10.50 | SELECT | Presenter arm raises (ease-out-expo, 1200 ms). Pen cursor is the pen-tip projected onto the left screen. Critical row highlight sweeps in (300 ms). |
| 10.50–12.00 | EDIT | Edited bar shifts +2 weeks of a 16-week chart (800 ms, ease-snap). Successors A1050, A1060, A1080 follow, stagger 90 ms. |
| 12.00–14.50 | PROPAGATE | Pulse spawns (300 ms) and travels (800 ms, ease-travel) left seam → centre → right at the edited row's height. Level 03 redraws in blue. Forecast date rolls 04 APR 27 → 18 APR 27. SPI rolls 1.02 → 0.94. Forecast curve redraws (1200 ms). |
| 14.50–16.00 | CONFIRM | Row flash 1400 ms. Forecast KPI pop 450 ms. Status line decodes. |
| 16.00–21.00 | HOLD | Arm lowers from 16.00 (800 ms, ease-out-expo). |
| 21.00–24.00 | RESET | Edited frame crossfades to the populated frame (ease-soft across the 3 s window). Wrap to 6.00. |

Loop content at `t = 24` matches `t = 6`: shift 0, highlight 0, arm 0, pulse 0, screens populated.

## Scene graph

```
scene
  fog (exp2, graphite 950)
  ambient (very low) + hemisphere
  floor (MeshStandardMaterial) and optional Reflector
  plinth × 3, fascia × 3, mount × 3
  beam × 3 (additive cones) + motes (one Points)
  screen group × 3
    emissive plane (canvas or model render target)
    hairline frame (4 boxes)
    centre only: label overlay plane, model sub-scene via WebGLRenderTarget
  rect area light × 3, aimed along each screen normal
  figures
    presenter (articulated right arm, pen)
    colleague
    audience × 3
    contact shadow × 5
  pulse + short trail
```

Camera: desktop 7.2 m back, eye 1.98 m, 34° vertical FOV, look near the screen base so figures occupy the lower third. Phone and portrait reframe toward the centre screen and the presenter. Pointer parallax ±1.5°, fine pointer only, damped.

Model sub-scene: a 5×2 column grid, four horizontal frames, ivory `MeshBasicMaterial`, level 03 swapped to blue on the edit. Yaw rate about 0.7°/s. Render target 1280×720, redrawn with the main loop and dropped with the quality tier.

## Quality tiers

Start at `high`. If mean frame time exceeds 22 ms for 2 s, step down and wait 2 s before another step. Measurement starts 3 s after the first frame so shader compile does not burn a tier.

1. `high` — bloom, beams, motes, reflections, DPR cap 2 (1.5 on coarse pointer)
2. `no-bloom`
3. `no-atmosphere` — beams and motes off
4. `dpr1`
5. `flat` — reflections off

Bloom: strength 0.28, radius 0.4, threshold 0.9, half resolution. Output pass does ACES and sRGB. No chromatic aberration, flare, or grain. Vignette is a CSS radial wash of graphite 950.

## Risks

- Rect-area spill plus ACES can crush the figures or blow the screens. Intensity lives in CONFIG and will be tuned from screenshots.
- A 512 px reflector plus bloom may miss 60 fps on integrated graphics. The tier ladder is the mitigation, and it is visible in `?debug`.
- Angled canvas text shimmers if mipmaps or anisotropy are wrong. Textures use max anisotropy and mipmaps, and canvases redraw only when the story changes, capped at 30 fps except the left screen while the pen is moving.
- The 8% pop is the only overshoot in the system, and it is confined to the forecast KPI, as the Serro demo pattern specifies.
- `poster.webp` is produced by the scene (`?poster` → `canvas.toBlob`) after the first good frame. Until that file exists, the fallback is flat graphite 950.
- The snippet imports `./scene.js`. Pasted into WordPress, that path is relative to the page, not the theme. The iframe of `index.html` is the primary embed. The snippet is the same-directory path and is what the isolation test pastes.
