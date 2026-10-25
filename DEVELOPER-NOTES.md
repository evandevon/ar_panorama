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
- **Cache busting:** every CSS/JS include has `?v=YYYYMMDDx`. Bump it on every change, or teachers keep seeing old code (this bit us once). The current value is **20261025f**.
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
- **23 Oct: no more red hair on teal screens.** "Unmixing" subtracts (1 − al) × key from part-solid pixels and divides by al. Dull, shadowy hair lit by screen bounce isn't really a mix with the bright screen, so the subtraction overshot: for a teal key (almost no red) it left mostly red, and the divide (worse when "Keep the person solid" or a crisp "Edge detail" forces the pixel solid) brightened it. Fix in FRAG: before the divide, the unmixed colour may not lean further from the key's chroma direction than `despill(rgb)` does (−0.02 margin). The push is along the key's zero-sum chroma vector, so brightness is unchanged. Ev's clip: 52–75 red hair pixels before, 0 after. The candle tests are unchanged.
- **23 Oct: zoom and look around in the video maker preview.** Scroll (or pinch) on the picture zooms, up to 800%, keeping the point under the pointer still. A drag looks around (clamped so the picture always covers its box), and there are − / % / + buttons in the preview header (the % resets to the whole picture). With the stage focused, +/− zoom, the arrow keys look around and 0 resets. The transform is on `.view-wrap`, so `getBoundingClientRect()`-based hit tests still work; crop dots counter-scale with `--iz`. From 300% the canvas uses `image-rendering: pixelated`. Clicks now act on pointerup if the pointer moved less than 5px (10px for touch); dragging a shape dot still moves it. The preview canvas is now up to 1920 wide (was 1280), so zooming shows the real detail. The zoom buttons sat over the bottom-right crop dot inside the stage, so they moved to the header.
- **23 Oct: steps column.** At ≥900px the body (the steps' scroller) is `position: fixed; top: 0; bottom: 0`, so it always runs the full window height. "⌃ More above" / "More below ⌄" markers (fixed, gradient plus a pill that scrolls by 70%) show only when there's more to scroll that way. Ev saw the column stop about two-thirds of the way down; this couldn't be reproduced at 1920×1080 or 1440×900, so it's not yet confirmed fixed.
- **24 Oct: a plain click on the preview no longer picks the colour.** You press the colour box (eyedropper) first, then click the screen. This keeps drags and stray clicks from changing the key. With no tool chosen, the preview cursor is the arrow (a hand when zoomed). The eyedropper cursor now also shows while zoomed. The hint line says to press the colour box. tests/t56.py presses #swatch-btn before its pick.
- **25 Oct: outlines around 3D models and see-through videos fit what's seen.** Before, a model's outline was the projected corners of its 3D bounding box (near corners loom large), so it was far too big, worst when looking straight at it. It was also centred on the spot's point, not the model. Now `samplePoints()` keeps ~400 of the model's own vertices (holder space, centred) and the outline is their projected extent. See-through videos use `solidPart()`: a 48px-wide copy of the stencil half (or the WebM's alpha) is read every 400ms, and the solid area grows to cover everywhere the subject has been (falls back to the whole picture if the video can't be read). `setBox()` stores the box centre and the frame is shifted onto it with `left/top`. Corner-resizing a model or see-through video now scales s.w in proportion to the drag from the outline's centre, so the tighter outline doesn't change the size. Inkwell head-on: 362×511 before, 277×435 after; at 30°: 503×739 before, 378×517 after.
- **25 Oct: loading screen.** The progress line is now 10px, above the start buttons, with a % pill riding at its head. The text says "Loading the 360 photo…" and "164 KB of 353 KB", then "Getting it ready…" at 100%. If the host sends no content-length, a moving stripe plus the amount downloaded so far. `#loading` is a role=progressbar with aria-valuenow. Hidden for 360 videos (they don't wait to download).
- **25 Oct: then and now.** New page settings (not spot flags, so no existing letter changes): `p2` second photo, `y2` its turn, `n1`/`n2` names for the right (main) and left (second) sides. In viewer.js "then and now": the second photo is a sphere of radius 99 (the sky is 100) with the a-sky's −90° turn and −1 x-scale plus y2. Its ShaderMaterial discards fragments right of the bar using `gl_FragCoord.x > uSplit × canvas.width` (drawing-buffer pixels, so phones' 2–3× pixel ratio is fine). Texture is NoColorSpace with toneMapped off, to match the sky's colours. The bar (#compare) is page elements above the canvas; dragging it stops propagation so the view doesn't turn. The grip is role=slider with arrows (Shift = big steps), Home/End and aria-valuetext naming both sides. The names fade when their side is under 15%, and drop below the motion switch when it shows. It loads after the main photo (no progress line). The maker has a "Then and now" details box under the photo, live turn and names via postMessage `setCompare`, and the preview reloads only when p2 changes. Masks still copy the main photo on both sides (known limit).
- **25 Oct: floating spots and "appears after a delay".** Flag `g` = floats on the screen. Its yaw and pitch are reused as 0–100 across and down, between the edges, so it never hangs off; w is a % of the shorter side of the float area. Old links have no `g`, so nothing changes for them. The float area is `floatArea()` in viewer.js: the screen, or the preview's phone window, minus the bottom toolbar and the motion switch. In spots.js, `floatLayout()` works out its centre and pixel width each frame; `degW()` feeds the existing size code. 3D models and see-through videos use `floatMesh()`: placed at view depth distOf(s) under the screen point and square on to the camera (no edge distortion), sized from pixels via the camera's fov. Floating spots are never behind masks or pinned. Dragging and resizing in the preview use `floatMoveTo()` / % of the screen, and `reportEdit` sends across/down/% back. In the maker: a "Float on the screen" tickbox (it remembers the room place and the screen place when switched), a 3×3 place grid, and Smaller/Bigger work in %. Move to crosshair / Show me hide for floating spots.
  Delay is a 9th spot field (seconds, one decimal) and works on every spot, floating or not. Not in the preview (it always shows). In the viewer it's counted from start(): `waiting()` keeps the spot (and its dot or 3D object) hidden from sight and keyboards, then `appear()` fades it in (a CSS animation, or the stencil shader's opacity over 600ms) and starts "as soon as it opens" playback. Maker: Appears → "After a delay" plus a seconds box (it can't be combined with the dot).
  Labels on narrow spots may now be up to 10em wide and only break between words.
- **25 Oct: floor plans.** Picture spots can carry a 10th field `plan` = `x,y,turn` (x/y = where the photo was taken, as % of the picture; turn in degrees). In spots.js, `setPlan()` adds a clipped `.spot-plan-box` with an SVG dot and a radial-gradient cone. `updatePlan()` runs every frame and rotates the cone by `turn − viewYaw` (viewYaw from the camera's world direction, left +). The cone's width = the float area's width ÷ px-per-degree, so it matches how much of the room is visible (wider on landscape screens). It updates without a rebuild (set() calls setPlan). In the maker it's offered only for floating pictures: "Floor plan" tickbox, then click the plan thumbnail to place the dot (or arrow keys; the thumbnail is a role=slider with aria-valuetext), a turn slider, and "The way the preview faces now is the top of the plan" (turn = the preview's current yaw). The default turn = the start direction, so the cone points up at the start. Unticking remembers the settings. "Try a sample" now includes panoramas/sample-plan.png as a floating floor plan, bottom left.
- **25 Oct: drive-test.html (Google Drive Video Test, owner-only, noindex).** It tests whether see-through videos can come from Google Drive via the Drive API v3 (`files/<id>?alt=media&key=<key>`) with an API key locked to the site (HTTP referrer). Steps: read the link (plus resource key) → metadata (`fields=name,mimeType,size`) → whole download with progress and speed → play from a blob: URL → canvas getImageData (the CORS/taint check) → a 2D-canvas see-through preview over checks. Google's error reasons are mapped to plain-English fixes (referer blocked, key invalid, API not enabled, not found/not shared, quota, abusive). A fetch TypeError = blocked (CORS), so the route is impossible. The key can be remembered in localStorage only. It's one stand-alone file (drive-test.html, styles and script inside), kept outside the site package; upload it anywhere on the website to run it. Not yet run against the real Google; Ev will test with his own key and file. If it passes, next is a site-wide key setting (e.g. a small js/config.js), and Drive links on see-through videos downloading first with a progress ring.

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
