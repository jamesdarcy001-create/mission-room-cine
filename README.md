# Mission Room CINE

A transparent, self-contained 3D hero segment: three projection screens with a
live schedule, model and forecast, five people in front, and a table.

## Build

```
npm install
npm run build
```

`npm run build` bundles `scene.js` and the parts of three.js it uses into
`mrc-cine.min.js` (one file, ~126 KB brotli). Rebuild and commit it after any
change to `scene.js`, `screens.js`, `story.js` or `config.js`.

`index.html` runs the unbundled source for development (an import map points
`three` at esm.sh).

## How it loads fast

- `assets/poster-*.webp` is a still of the opening frame. The page puts it, and
  `assets/people.webp`, straight into its HTML, so the hero shows at once. The
  live canvas then fades in over the still on the same frame.
- One bundled script, preloaded with `<link rel="modulepreload">`.
- Fonts are subset to the glyphs the screens draw (`fonts/`, OFL, licences
  alongside).
- The screens' light on the room uses spotlights instead of area lights, which
  need ~250 KB of lookup tables.
- Shaders compile with `compileAsync` before the first frame.

If the opening frame changes (`CONFIG.posterTime`, layout, colours), re-capture
the poster so the hand-over stays seamless.

## Embedding

Serve the repo through jsDelivr pinned to a commit
(`https://cdn.jsdelivr.net/gh/jamesdarcy001-create/mission-room-cine@<commit>/`),
add the preload links, the `.mrc-cine` box with its two images, `cine.css`,
and a module script that imports `mountAll` from `mrc-cine.min.js`.

## Video mode (what the site uses)

The live WebGL scene is heavy for a marketing page, so the site plays a
pre-rendered loop instead: `assets/mission-room.webm` (VP9 with a transparent
background, 1600 x 728, 30 fps, 21.3 s = three story cycles, seamless). It sits
between the poster still and the people layer, loaded by `video.js`:

```html
<script src="https://cdn.jsdelivr.net/gh/jamesdarcy001-create/mission-room-cine@<commit>/video.js" defer></script>
```

Safari cannot draw a VP9 video's transparency, and reduced-motion visitors
should not get motion, so both keep the still. `assets/mission-room.mp4` is the
full composed hero (background and people baked in) for sharing and
presentations.

To re-render after changing the scene: `node tools/serve.cjs`, open
`http://localhost:5178/tools/render-video.html?debug&quality=high`, run
`await run(213, 639, "frames")`, then:

```
ffmpeg -framerate 30 -i tools/dumps/frames/f%04d.png -vf "scale=1600:728:flags=lanczos,format=yuva420p" -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 33 -row-mt 1 -deadline good -cpu-used 2 -an assets/mission-room.webm
```

Re-capture the poster from the same opening frame so the hand-over stays seamless.
