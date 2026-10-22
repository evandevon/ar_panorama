# Developer notes (hand-off)

For whoever works on this next, human or AI. README.md is the user guide and holds the full **link format**.
This file covers how the code fits together, the house rules, what's unfinished, and which files to share for each kind of job.

Every JS file starts with a **FILE GUIDE** comment: what it does, what loads it, and its section names.
Sections are marked `// ---- name` (search for them). To save tokens, share the file guide plus the one section you need, not the whole file.

## What it is

A free, no-sign-in tool for teachers (made by Ev, a NSW primary teacher). It is hosted on GitHub Pages and has no server, no accounts and no build step.

- **make.html** (tour maker): the author pastes links (a 360 photo or video, then "spots"), sees a live preview, and gets a link + QR code. **The whole tour lives in the link.**
- **index.html** (viewer): what students open from the QR code. It is also the maker's preview (`?preview=1` in an iframe).
- **videomaker.html** (See-through Video Maker): green-screen video → stencil MP4 / transparent WebM / GIF, all in the browser.
- **view.html**: an old address that redirects to index.html.

## File map: which files to share for which job

| Job | Share these |
|---|---|
| Viewer looks / start card / buttons | index.html, css/style.css, js/viewer.js (relevant section) |
| A spot behaving wrongly in the room | js/spots.js (relevant section), maybe js/viewer.js "video spots" |
| Spot options in the maker (tick boxes etc.) | js/create.js "spot cards", make.html, css/create.css |
| A new spot option end-to-end | the above + spots.js "link format", README "Link format" table |
| Masking | js/layers.js, create.js "the front layer", spots.js (search `behind`, `layerOf`) |
| Maker preview / phone window | create.js "preview", viewer.js "phone-sized window", css/create.css |
| Line up with the room (camera) | js/align.js, viewer.js "lining up" |
| Link conversion (Drive, Dropbox…) | js/sources.js |
| Video maker keying quality | js/videomaker.js "WebGL" (FRAG shader) + "settings" + "patchy screens" |
| Video maker exports | videomaker.js "making the file", "videos", "GIFs" |
| Video maker layout | videomaker.html, css/videomaker.css |
| Colours (whole site) | css/create.css `:root` tokens (also mirrored in style.css, videomaker.css) |

## Libraries (all vendored in /vendor, no CDN)

A-Frame 1.8.0 (THREE is `AFRAME.THREE`), qrcode.js, PDF.js, gifenc (ESM, lazy-imported), and fix-webm-duration. Licences sit next to each.

## How the viewer draws spots

- **Photo sphere:** `a-sky` with radius 100 and rotation `0 -90 0`; a 360 video uses `a-videosphere`.
- **Page-element spots** (pictures, text, video in a frame, buttons): `<div>`s in `#spots`. Every frame they are projected from yaw/pitch and given a size from `w` (degrees of view).
- **WebGL spots** (3D models at MODEL_DIST 8, see-through videos): meshes in the scene. A page-element "frame" sits over each for tapping and editing.
- **Masks** (js/layers.js): masked page spots go in `.spots-back`, clipped by nested `clip-path` wrappers, so clipped areas can't be tapped. Masked WebGL spots move back to BEHIND_DIST 60, behind a cut-out copy of the sky (radius 20) with an alphaMap from a mask canvas in sky texture space (alphaTest 0.5).
  - What gets masked: visual spots only, never links or sound buttons. Unticking "Hidden by masks" sets flag `u`.
- **Maker ↔ preview:** postMessage. The message names are listed in the viewer.js file guide.
- **Phone window:** the preview iframe fills the panel. The viewer gets `setWindow {w,h}`, sets the camera fov so the phone-sized window shows a real phone's view, and puts `.win-shade` panels outside it. Those panels allow dragging but not tapping.

## Link format essentials (full table in README)

- One `s=` per spot: `link~yaw~pitch~flags~label~width°~corners~turn`.
  - Flags: l s h r d o f x w u e (+ kind letters a v i k m p; b is legacy and ignored).
  - Never change what an existing letter means: printed QR codes depend on it.
- `f=` per mask; `p t y al mb v=2` for the rest.

## How the video maker keys

The keying runs in a WebGL fragment shader (`FRAG` in videomaker.js):

- **Colour difference.** `diff = keyChannel − max(other channels)`. Solidity is `1 − d/diff(key)`, and the minimum is taken over the main key, up to 8 extras (the user's extra colours + automatic `key.shades`) and the clean plate.
- **Tolerance / hue closeness** (`near()`, added 22 Oct). Colour difference fails on teal screens (G ≈ B, so `diff ≈ 0`) and that also made extra colours useless. `near()` compares each pixel's chroma direction with each key's (q = off-axis chroma ÷ on-axis chroma) and how much of the key's chroma it has; it is min'd with the colour-difference solidity for the main key and every extra (not the clean plate). It's always on: at Tolerance 0 it removes near-exact hue matches; uTol widens the hue window (q up to 0.62) and lowers the saturation needed (to 45% of the key). On the green candle test it changes nothing.
- **Sliders** (`params()`). The user-facing names map to these uniforms:

  | Slider | Uniform |
  |---|---|
  | Tolerance | uTol |
  | Remove more/less | uSim |
  | Edge detail | uSoft |
  | Keep the person solid | uSolid |
  | Soften the edges | uFeather |
  | Clean up coloured edges | uSpill + uComp + uSec |
  | Shrink edges | choke |
  | Remove specks | speck |
  | Fill holes | hole |

- **Despill** pulls the screen colour down to the average of the other channels, then adds back its complement (not yellow!). uSec handles teal screens.
- **Auto-pick** (`autoKey`) clusters a patch grid. `findShades` adds paler patches of the same screen (cos > 0.97, so warm glows aren't eaten).
- **Shapes:** a mask texture where R = allowed and G = always solid.
- **Shader outputs (uOut):** 0 preview, 1 picture on black, 2 stencil, 3 straight colour + alpha.
- **Undo/redo:** snapshots in `snapshot()`; Ctrl+Z, Ctrl+Shift+Z.

## House rules

- **Teacher-facing words:** plain English, no jargon. Say "see-through" not "alpha" and "stencil" not "matte". Australian spelling: colour, centre.
- **Accessibility:** labels on everything, keyboard paths, focus styles, and the WCAG AA contrast ratios we checked. The timeline trim dots are role=slider. axe-core showed no violations on all pages; keep it that way.
- **Privacy:** nothing is uploaded and nothing stored except in the link. Never put student media in the repo or deliverables.
- **Cache busting:** every CSS/JS include has `?v=YYYYMMDDx`. Bump it on every change, or teachers keep seeing old code (this bit us once). The current value is **20261022c**.
- **Colours: "Ember and slate" (dark).** Use the tokens, never raw hex:

  | Token | Value |
  |---|---|
  | paper | #161312 |
  | card | #221e1c |
  | ink | #f3ede9 |
  | ink-soft | #b9ada6 |
  | line | #3b3431 |
  | brass (= ember action) | #ee8b5c |
  | on-brass | #2a1105 |
  | brass-dark (link text) | #f6b596 |
  | select (teal) | #6fc7b8 |
  | ok | #86d6a0 |
  | danger | #ff8c8c |
  | note | #f2c98a |

  The QR card stays white. In-room content (text spots) stays light "paper".
- **Wide-screen layouts (≥900px):** the left column scrolls and the preview is `position: fixed` on the right and always fully visible. This applies to both make.html and videomaker.html.
- **Don't refactor large files casually.** They work and they have been tested. Make small, targeted edits.

## Decisions log (why things are the way they are)

- **Stencil MP4 (stacked)** is the default for see-through tours because iPhones can't play transparent WebM. Transparent WebM import is supported (flag `w` with `x`), and its transparency is checked on import.
- **Layers became a single "Masking" tool** (Ev's choice): outlines that hide visual spots. The "window" mask type still decodes but isn't offered.
- **Despill uses the complement**, after Ev reported a yellow edge cast.
- **The "Soften the edges" slider is an inward feather.** The old version made the whole person see-through.
- **The colour pick is an eyedropper button** (the cursor changes; click on the preview). There are 2 newer sliders: Edge detail and Keep the person solid.
- **"Disappear when it ends"** (flag `e`): the spot fades out; looking at it or tapping it again brings it back and replays it. The option is hidden for looping, sound-only and Drive videos.
- **Ember and slate** was chosen over light schemes.
- **22 Oct: video maker preview bigger, controls smaller.** Side column narrower on wide screens (`--side` override in videomaker.css), sliders in 3 columns from 1280px, shorter help lines, the trim note and "Show behind it" share a row, and "＋ Add another colour" moved from Fix problems to just under the main colour (the empty-background button stays in Fix problems).
- **22 Oct: crop and preview sound.** Crop is four draggable dots on the preview's corners (buttons over the canvas; arrow keys move them 1%, Shift 5%; a key burst is one undo step). No crop button or panel, by request. The preview shows the whole frame with the cut-off part darkened; exports use `uCrop` in the vertex shader and `srcW()/srcH()` for sizes. Crop is in undo/redo and resets for a new video. The preview always plays with sound (no button, by request); if the browser refuses sound it falls back to silent playback. During export the sound goes only into the file.

## Work in progress / not yet verified on real devices

- MP4 export from real Chrome/Edge (avc1), and the stencil MP4 playing on a real iPhone.
- A transparent WebM made in real Chrome, re-imported into a tour.
- GIF export used in Google Slides or PowerPoint.
- Touch: dragging the room outside the phone window and the eyedropper on tablets.
- The "AR Body" tool's transparency fixes: Ev mentioned them, but the code was never shared. Compare if it becomes available.

## Ideas discussed, not built

- **Camera view mode:** spots drawn over the live camera instead of the photo, with the starting direction set by re-scanning the QR code (re-scan also resets drift).
  - Strengths: real-world AR feel, and no photo needed.
  - Weaknesses: compass and gyro drift (yaw only; no position tracking, so spots slide when you walk), camera permission friction, iOS quirks, battery, and masks become meaningless.
  - Suggested plan: an optional mode on the same link, with QR detection via BarcodeDetector where available, and a manual "tap when facing the QR" fallback.

## Testing

Tests were done with Playwright (Python) driving the bundled Chromium with `--use-gl=swiftshader`, using a local server (`python3 -m http.server 8765` in the site folder).

- The test Chromium has no H.264, so tests use WebM media.
- tests/ (in the hand-off zip, not on the site) holds the most useful scripts. They need test videos in videos/ (`_t.webm`, `_c.webm`), which you make yourself. See tests/README.md.
- Checks used: pixel measurements on screenshots (mask clipping, spot sizes, keying leftovers) and axe-core for accessibility.
