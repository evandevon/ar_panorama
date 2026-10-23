/*
 * FILE GUIDE: js/videomaker.js  ·  the See-through Video Maker (videomaker.html)
 * Turns a green/blue-screen video (or a WebM that's already see-through) into:
 *   - a "stencil" MP4 for tours: twice as tall, picture (premultiplied, on black) on top, black-and-white stencil below
 *     (plays on every phone; the tour cuts it out with a shader; flag x)
 *   - a WebM with real transparency (VP9/VP8 alpha; not iPhones), or an animated GIF (gifenc, no sound).
 * Everything runs in the browser; the video is never uploaded. Loaded by: videomaker.html (also loads
 *   vendor/fix-webm-duration; vendor/gifenc is imported only when a GIF is made).
 * Keying (in the FRAG shader): colour-difference keying against the main colour, extra colours (added by hand),
 *   paler "shades" of the screen found automatically (findShades), and an "empty background" frame (clean plate);
 *   each also checked for closeness of hue (near(), widened by the Tolerance slider, uTol: needed for teal screens);
 *   whichever says "more screen" wins. Then sliders: Remove more or less (uSim), Edge detail (uSoft window),
 *   Keep the person solid (uSolid), Soften the edges (uFeather, inward blur), Clean up coloured edges (despill,
 *   uSpill/uComp/uSec), Shrink/Remove specks/Fill holes (neighbour sampling). Shapes (mask canvas) apply last.
 *   Crop: the preview always shows the whole picture (outside the box darkened on the overlay); files are drawn
 *   with uCrop (a uv rectangle in the VERTEX shader), and srcW()/srcH() give the cropped size for every export.
 *   The preview plays with sound (speakers(); after a video with sound is made, the element's audio runs through
 *   the Web Audio graph, so it is routed to audioCtx.destination too).
 *   Shader outputs (uOut): 0 preview over a background · 1 picture on black · 2 stencil · 3 straight colour + alpha.
 * Sections (search for "// ---- <name>"): WebGL: one program, three jobs · settings · undo and redo · backgrounds for
 *   the preview · loading a video · clicking on the preview · crop: a dot on each corner · shapes · patchy screens · preview playback ·
 *   the timeline · making the file · videos (real time) · GIFs (frame by frame)
 * Gotchas learned the hard way: MediaRecorder output needs time to start (stop only after real data arrives);
 *   browser-made WebMs have no duration (fixed on export with fix-webm-duration, and handled on import);
 *   WebM colour is half resolution, so mode 3 bleeds edge colour outward; GIF frames need dispose:2 and a single
 *   transparent palette entry; WebGL readPixels is upside down. The hint above the preview has a fixed height so
 *   the picture never moves under the pointer while drawing.
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const video = $('src');
  const view = $('view');
  const overlay = $('overlay');
  let fileName = 'video', fileLabel = '', fileType = '', loaded = false, making = null;
  const key = { rgb: [0, 0.69, 0.25], picked: false };
  const extraKeys = [];                      // more background colours, for patchy screens (up to 4)
  const MAX_KEYS = 4;
  const shapes = [];                         // { kind: 'keep'|'remove'|'solid', pts: [[x,y] 0..1 in the video] }
  const trim = { start: 0, end: 0 };
  const crop = { x: 0, y: 0, w: 1, h: 1 };     // the part of the picture that's kept (0..1 of the video, from the top left)
  const MIN_CROP = 0.05;
  const cropped = () => crop.x > 0.001 || crop.y > 0.001 || crop.w < 0.999 || crop.h < 0.999;
  const srcW = () => (video.videoWidth || 0) * crop.w, srcH = () => (video.videoHeight || 0) * crop.h;
  let plateOn = false, plateTime = 0;

  // ---------------------------------------------------------------- WebGL: one program, three jobs
  // uOut 0 = preview (over a background), 1 = the picture (premultiplied, on black), 2 = the stencil
  const VERT = 'attribute vec2 p; uniform vec4 uCrop; varying vec2 vUv; void main(){ vUv = uCrop.xy + (p * 0.5 + 0.5) * uCrop.zw; gl_Position = vec4(p, 0.0, 1.0); }';
  const FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'uniform sampler2D uVideo, uBg, uMask, uPlate;',
    'uniform vec3 uKey; uniform vec3 uKeys[8]; uniform int uNKeys, uPlateOn;',
    'uniform float uSim, uSoft, uSolid, uSpill, uChoke, uSpeck, uHole, uFeather, uTol; uniform vec2 uPx;',
    'uniform int uOut, uAlpha, uCh;',
    'varying vec2 vUv;',
    // "Colour difference": how much more screen-coloured (e.g. greener) a colour is than its other colours.
    'float diff(vec3 c) {',
    '  if (uCh == 1) return c.g - max(c.r, c.b);',
    '  if (uCh == 2) return c.b - max(c.r, c.g);',
    '  return c.r - max(c.g, c.b);',
    '}',
    // How solid a pixel is against one background colour (0 = all screen, 1 = all subject). Measures blends well.
    'float solidity(float dd, vec3 k) { return clamp(1.0 - dd / max(diff(k), 0.05), 0.0, 1.0); }',
    // Tolerance: how close a colour's hue is to a background colour, whatever its brightness. Catches screens the
    // colour difference can't (teal screens, where green and blue are almost equal) and darker creases and shadows.
    // q = how much "other" colour there is for each bit of the screen's own colour (0 = exactly the screen's hue).
    'float near(vec3 c, vec3 k) {',
    '  vec3 cc = c - vec3((c.r + c.g + c.b) / 3.0), kc = k - vec3((k.r + k.g + k.b) / 3.0);',
    '  float kl = length(kc); if (kl < 0.04) return 1.0;',
    '  vec3 kn = kc / kl; float along = dot(cc, kn); if (along <= 0.004) return 1.0;',
    '  float q = length(cc - along * kn) / along, hi = 0.12 + 0.5 * uTol;',
    '  float s = clamp(along / (kl * (0.85 - 0.4 * uTol)), 0.0, 1.0) * (1.0 - smoothstep(hi * 0.5, hi, q));',
    '  return 1.0 - s;',
    '}',
    // Against every background colour we know (the main one, the extras, and the empty background at this
    // very spot): whichever says "more screen" wins. al = the true solidity; the return value has the sliders applied.
    'float keyAt(vec2 uv, out float al, out vec3 k) {',
    '  vec3 c = texture2D(uVideo, uv).rgb; float dd = diff(c);',
    '  k = uKey; al = min(solidity(dd, uKey), near(c, uKey));',
    '  for (int i = 0; i < 8; i++) {',
    '    if (i < uNKeys) { float s = min(solidity(dd, uKeys[i]), near(c, uKeys[i])); if (s < al) { al = s; k = uKeys[i]; } }',
    '  }',
    '  if (uPlateOn == 1) {',
    '    vec3 pl = texture2D(uPlate, uv).rgb;',
    '    if (diff(pl) > 0.04) { float s = solidity(dd, pl); if (s < al) { al = s; k = pl; } }',
    '  }',
    '  float a = clamp((al - uSim) / max(min(uSoft, 1.0 - uSim), 0.01), 0.0, 1.0);',
    '  return clamp(a / max(1.0 - uSolid, 0.05), 0.0, 1.0);',                   // keep the person solid
    '}',
    'float keyA(vec2 uv) { float al; vec3 k; return keyAt(uv, al, k); }',
    // Clean up coloured edges: bring the screen's colour down to the average of the other two, and add what was taken
    // away back as the screen's opposite colour (magenta-ish for green), so edges keep their brightness without a cast.
    // Screens are rarely pure: a teal-ish green also carries blue, so take a matching share of that too (uSec),
    // or leftover screen turns blue. Colours with no screen colour in them (a navy shirt, skin) aren't touched.
    'uniform vec3 uComp; uniform float uSec;',
    'vec3 despill(vec3 c) {',
    '  float sp;',
    '  if (uCh == 1) { sp = max(c.g - (c.r + c.b) * 0.5, 0.0); c.g -= sp; c.b -= sp * uSec; }',
    '  else if (uCh == 2) { sp = max(c.b - (c.r + c.g) * 0.5, 0.0); c.b -= sp; c.g -= sp * uSec; }',
    '  else { sp = max(c.r - (c.g + c.b) * 0.5, 0.0); c.r -= sp; }',
    '  return clamp(c + sp * uComp, 0.0, 1.0);',
    '}',
    'void main() {',
    '  vec4 src = texture2D(uVideo, vUv);',
    '  vec3 rgb = src.rgb; float a; vec3 pm;',          // pm = the picture "on black" (premultiplied)
    '  vec2 m = texture2D(uMask, vUv).rg;',             // r: 1 = allowed, 0 = removed by a shape; g: 1 = always kept
    '  if (uAlpha == 1) { a = src.a; pm = rgb * a; }',
    '  else {',
    '    float al; vec3 k;',
    '    float aK = keyAt(vUv, al, k);',
    '    a = aK;',
    // Shrink the edges: take the least solid of the neighbours
    '    if (uChoke > 0.0) {',
    '      for (int i = 0; i < 8; i++) { float t = float(i) * 0.7853982; a = min(a, keyA(vUv + vec2(cos(t), sin(t)) * uChoke * uPx)); }',
    '    }',
    // Specks and holes: look at a ring around this pixel. Solid specks with nothing around them go;
    // see-through holes with solid all around are filled in.
    '    if (uSpeck > 0.0 || uHole > 0.0) {',
    '      float ms = 0.0, mh = 0.0;',
    '      for (int i = 0; i < 8; i++) {',
    '        float t = float(i) * 0.7853982 + 0.3927; vec2 d = vec2(cos(t), sin(t));',
    '        if (uSpeck > 0.0) ms += keyA(vUv + d * uSpeck * uPx);',
    '        if (uHole > 0.0) mh += keyA(vUv + d * uHole * uPx);',
    '      }',
    '      if (uSpeck > 0.0) a *= smoothstep(0.03, 0.2, ms / 8.0);',
    '      if (uHole > 0.0) a = max(a, smoothstep(0.7, 0.9, mh / 8.0));',
    '    }',
    '    if (uFeather > 0.0) {',
    '      float sum = aK;',
    '      for (int i = 0; i < 8; i++) {',
    '        float t = float(i) * 0.7853982 + 0.19635; vec2 d = vec2(cos(t), sin(t)) * uPx;',
    '        sum += keyA(vUv + d * uFeather) + keyA(vUv + d * uFeather * 0.5);',
    '      }',
    '      a = min(a, smoothstep(0.0, 1.0, sum / 17.0) + max(a - aK, 0.0));',
    '    }',
    // A partly see-through pixel is a mix of the subject and the screen behind it. Take the screen's share
    // back out ("unmixing"), so soft edges, glows and hair keep their own colour instead of turning grey or green.
    '    float aU = min(a, aK);',
    '    vec3 un = max(rgb - (1.0 - al) * k, 0.0);',
    // Don't overshoot: a dull, shadowy colour with a hint of the screen in it (hair lit by light bouncing off the screen)
    // isn't really a mix with the bright screen, and taking that much screen out leaves the screen's opposite colour
    // (red, for a teal screen). So never let the result lean further away from the screen's colour than the gently
    // "despilled" pixel does. The push is along the screen's colour direction only, so brightness doesn't change.
    '    vec3 kc = k - vec3((k.r + k.g + k.b) / 3.0); float kcl = length(kc);',
    '    if (kcl > 0.02) { vec3 kn = kc / kcl; float over = dot(un - despill(rgb), kn); if (over < -0.02) un = max(un - (over + 0.02) * kn, 0.0); }',
    '    un *= aU / max(al, 0.001);',
    '    pm = mix(rgb * aU, un, uSpill);',
    '    pm += rgb * max(a - aK, 0.0);',                  // filled-in holes use their own colour
    // A gentle "despill" for screen-coloured light bouncing onto edges: don't let the screen's channel rise
    // above the stronger of the other two (so yellows, oranges and skin tones are left alone).
    '    pm = mix(pm, despill(pm), uSpill);',
    '  }',
    // Shapes drawn by the teacher win over everything: removed areas go, "always keep" areas stay as filmed.
    '  a *= m.r; pm *= m.r;',
    '  pm = mix(pm, rgb, m.g); a = mix(a, 1.0, m.g);',
    '  if (uOut == 1) gl_FragColor = vec4(pm, 1.0);',
    '  else if (uOut == 2) gl_FragColor = vec4(vec3(a), 1.0);',
    // 3 = real transparency (WebM, GIF): plain colour plus alpha, not "on black", or edges go dark.
    '  else if (uOut == 3) {',
    '    vec3 c = pm / max(a, 0.001);',
    // WebM keeps colour at half the resolution, so a see-through pixel's colour bleeds into the solid pixel next to it.
    // Give see-through pixels near the edge the person's colour (from solid neighbours), so no dark or green fringe.
    '    if (a < 0.98) {',
    '      vec3 s = vec3(0.0); float w = 0.0;',
    '      for (int i = 0; i < 8; i++) {',
    '        float t = float(i) * 0.7853982; vec2 uv = vUv + vec2(cos(t), sin(t)) * 2.0 * uPx;',
    '        vec4 n = texture2D(uVideo, uv);',
    '        float na = (uAlpha == 1 ? n.a : keyA(uv)) * texture2D(uMask, uv).r;',
    '        s += (uAlpha == 1 ? n.rgb : despill(n.rgb)) * na; w += na;',
    '      }',
    '      vec3 nb = w > 0.05 ? s / w : (uAlpha == 1 ? rgb : despill(rgb));',
    '      c = mix(nb, c, smoothstep(0.0, 0.5, a));',
    '    }',
    '    gl_FragColor = vec4(clamp(c, 0.0, 1.0), a);',
    '  }',
    '  else gl_FragColor = vec4(texture2D(uBg, vUv).rgb * (1.0 - a) + pm, 1.0);',
    '}'
  ].join('\n');

  function makeGL(canvas, transparent) {
    // a transparent canvas keeps plain (not premultiplied) colour, so what's recorded is exactly what was drawn
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false, alpha: !!transparent });
    if (!gl) return null;
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog); gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = () => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return t;
    };
    const vTex = tex(), bTex = tex(), mTex = tex(), pTex = tex();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    const u = n => gl.getUniformLocation(prog, n);
    const U = {};
    ['uVideo', 'uBg', 'uMask', 'uPlate', 'uKey', 'uKeys', 'uNKeys', 'uPlateOn', 'uSim', 'uSoft', 'uSolid', 'uSpill', 'uTol', 'uFeather', 'uChoke', 'uSpeck', 'uHole', 'uPx', 'uOut', 'uAlpha', 'uCh', 'uComp', 'uSec', 'uCrop']
      .forEach(n => { U[n] = u(n); });
    gl.uniform1i(U.uVideo, 0); gl.uniform1i(U.uBg, 1); gl.uniform1i(U.uMask, 2); gl.uniform1i(U.uPlate, 3);
    const put = (unit, t, source) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source); };
    const ctx = {
      gl,
      setBackground(source) { put(1, bTex, source); },
      setMask(source) { put(2, mTex, source); },
      setPlate(source) { put(3, pTex, source); },
      upload() { put(0, vTex, video); },
      draw(out, x, y, w, h, useCrop) {
        const p = params();
        gl.viewport(x, y, w, h);
        // the files are cut to the crop; the preview shows the whole picture (with the crop drawn on top)
        if (useCrop) gl.uniform4f(U.uCrop, crop.x, 1 - crop.y - crop.h, crop.w, crop.h); else gl.uniform4f(U.uCrop, 0, 0, 1, 1);
        gl.uniform3fv(U.uKey, key.rgb);
        // the extra colours: the ones added by hand, and the paler shades of the screen found automatically
        const all = extraKeys.concat(params().alpha ? [] : key.shades || []).slice(0, 8);
        const ks = new Float32Array(24);
        all.forEach((k, i) => ks.set(k, i * 3));
        gl.uniform3fv(U.uKeys, ks); gl.uniform1i(U.uNKeys, all.length);
        gl.uniform1i(U.uPlateOn, plateOn ? 1 : 0);
        gl.uniform1f(U.uSim, p.sim); gl.uniform1f(U.uSoft, p.soft); gl.uniform1f(U.uSolid, p.solid); gl.uniform1f(U.uSpill, p.spill); gl.uniform1f(U.uTol, p.tol);
        // the edge tools are set in "pixels of a 720p video", so they act the same at any size
        const s = (video.videoHeight || 720) / 720;
        gl.uniform1f(U.uFeather, p.feather * s); gl.uniform1f(U.uChoke, p.choke * s); gl.uniform1f(U.uSpeck, p.speck * s); gl.uniform1f(U.uHole, p.hole * s);
        gl.uniform2f(U.uPx, 1 / (video.videoWidth || 1), 1 / (video.videoHeight || 1));
        gl.uniform1i(U.uOut, out); gl.uniform1i(U.uAlpha, p.alpha ? 1 : 0);
        const [r, g, b] = key.rgb;
        gl.uniform1i(U.uCh, g >= r && g >= b ? 1 : b >= r ? 2 : 0);        // which colour the screen is
        // the screen's opposite colour, used to replace the screen-coloured light taken off the edges
        const mx = Math.max(r, g, b, 0.01), ch = g >= r && g >= b ? 1 : b >= r ? 2 : 0;
        const comp = [r, g, b].map((v, i) => i === ch ? 0 : 1 - v / mx);
        const cm = Math.max(...comp, 0.01);
        gl.uniform3fv(U.uComp, comp.map(v => v / cm * 0.5));
        // how much of the screen's second colour comes with its main one (blue in a teal-ish green screen)
        const sec = ch === 1 ? (b - r) / Math.max(g - (r + b) / 2, 0.05) : ch === 2 ? (g - r) / Math.max(b - (r + g) / 2, 0.05) : 0;
        gl.uniform1f(U.uSec, Math.max(0, Math.min(1.2, sec)));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    };
    ctx.setMask(maskC); ctx.setPlate(plateC);
    return ctx;
  }
  const canvas = (w, h) => { const k = document.createElement('canvas'); k.width = w; k.height = h; return k; };
  const maskC = canvas(2, 2);                // red = allowed, green = always solid
  { const x = maskC.getContext('2d'); x.fillStyle = '#f00'; x.fillRect(0, 0, 2, 2); }
  const plateC = canvas(2, 2);
  const pv = makeGL(view);
  if (!pv) { $('file-status').className = 'status err'; $('file-status').textContent = 'This browser can’t do the video work this page needs. Try Chrome or Edge.'; return; }

  // ---------------------------------------------------------------- settings
  function params() {
    return {
      alpha: document.querySelector('input[name=mode]:checked').value === 'alpha',
      sim: $('sim').value / 100 * 0.5,                   // below this "solidness", it's treated as screen
      soft: 0.1 + $('detail').value / 100 * 0.8,         // edge detail: how gradually blends (hair, glows) fade
      solid: $('solid').value / 100 * 0.8,               // keep the person solid: partly see-through parts count as more solid
      feather: $('soft').value / 100 * 16,               // soften the edges: blur width, in pixels of a 720p video
      tol: $('tol').value / 100,                         // tolerance: how far from the picked colour still counts as screen
      spill: $('spill').value / 100,
      choke: +$('choke').value,
      speck: +$('speck').value * 4,
      hole: +$('hole').value * 4
    };
  }
  ['tol', 'sim', 'solid', 'detail', 'soft', 'spill', 'choke', 'speck', 'hole'].forEach(id => {
    const show = () => { $(id + '-out').textContent = $(id).value; redraw(); };
    $(id).addEventListener('input', show); show();
  });
  // Every slider gets a small reset button beside its number (shown once it's been moved)
  const SLIDERS = ['tol', 'sim', 'solid', 'detail', 'soft', 'spill', 'choke', 'speck', 'hole', 'feather'];
  SLIDERS.forEach(id => {
    const input = $(id), out = $(id + '-out'), label = document.querySelector('label[for="' + id + '"]');
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'reset'; b.textContent = '↺';
    b.title = 'Back to the usual setting';
    b.setAttribute('aria-label', 'Reset ' + label.firstChild.textContent.trim().toLowerCase());
    label.after(b);
    b.addEventListener('click', () => {
      input.value = input.defaultValue;
      input.dispatchEvent(new Event('input')); input.dispatchEvent(new Event('change'));
      input.focus();
    });
    const sync = () => { b.hidden = input.value === input.defaultValue; };
    input.addEventListener('input', sync); sync();
    input.addEventListener('change', () => commit());
  });
  function syncResets() { SLIDERS.forEach(id => { const b = $(id).parentNode.querySelector('label[for="' + id + '"] + .reset'); if (b) b.hidden = $(id).value === $(id).defaultValue; }); }
  document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', () => {
    const alpha = params().alpha;
    $('key-controls').hidden = alpha; $('alpha-note').hidden = !alpha;
    $('key-fix').hidden = alpha; $('key-fix-2').hidden = alpha;
    commit();
    if (alpha && (tool === 'addkey' || tool === 'pick')) setTool(null);
    hint();
    redraw();
  }));
  const rgbCss = rgb => 'rgb(' + rgb.map(v => Math.round(v * 255)).join(',') + ')';
  function setKey(rgb, picked, shades) {
    key.rgb = rgb; key.picked = picked;
    key.shades = shades || findShades(rgb);
    $('swatch').style.background = rgbCss(rgb);
    const [r, g, b] = rgb;
    const n = key.shades.length;
    $('key-text').textContent = (g > r && b > r && Math.abs(g - b) < 0.12 * Math.max(g, b) ? 'Teal' : g > r && g > b ? 'Green' : b > r && b > g ? 'Blue' : 'This colour') + (picked ? ' (picked)' : ' (guessed)') +
      (n ? ', plus ' + (n === 1 ? 'a lighter shade' : n + ' lighter shades') + ' of it found in the picture' : '') + '. To change it, press the colour box and click the screen.';
    redraw();
  }
  // Screens are rarely one even colour: light from a window, creases and the camera make some parts paler (or bluer)
  // than others. Find the paler shades of the same screen that the chosen colour wouldn't fully remove, so clicking
  // the deepest green still clears the pale parts.
  function findShades(rgb) {
    if (!loaded || video.readyState < 2 || params().alpha) return [];
    const k = findShades.k || (findShades.k = document.createElement('canvas'));
    const cols = 32, rows = 18;
    k.width = cols; k.height = rows;
    const c = k.getContext('2d', { willReadFrequently: true });
    c.drawImage(video, 0, 0, cols, rows);
    const d = c.getImageData(0, 0, cols, rows).data;
    const [r0, g0, b0] = rgb, ch = g0 >= r0 && g0 >= b0 ? 1 : b0 >= r0 ? 2 : 0;
    const diff = ([r, g, b]) => ch === 1 ? g - Math.max(r, b) : ch === 2 ? b - Math.max(r, g) : r - Math.max(g, b);
    const chroma = ([r, g, b]) => { const m = (r + g + b) / 3; return [r - m, g - m, b - m]; };
    const kc = chroma(rgb), kl = Math.hypot(...kc), kd = diff(rgb);
    if (kl < 0.05 || kd < 0.03) return [];
    const risky = [];
    for (let i = 0; i < d.length; i += 4) {
      const p = [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255], pc = chroma(p), pl = Math.hypot(...pc);
      if (pl < 0.06) continue;
      const cos = (pc[0] * kc[0] + pc[1] * kc[1] + pc[2] * kc[2]) / (pl * kl);
      const q = diff(p) / kd;
      // the same kind of colour as the screen, still screen-coloured, but not different enough to be fully removed
      if (cos > 0.97 && diff(p) > 0.02 && q < 0.92) risky.push({ p, q });
    }
    if (risky.length < Math.max(4, cols * rows * 0.02)) return [];
    risky.sort((a, b) => a.q - b.q);
    const pick = f => {                                  // a typical colour around this point (averaged, so noise doesn't count)
      const i = Math.min(risky.length - 1, Math.floor(f * risky.length)), lo = Math.max(0, i - 2), hi = Math.min(risky.length, i + 3);
      const g = risky.slice(lo, hi);
      return [0, 1, 2].map(j => g.reduce((t, x) => t + x.p[j], 0) / g.length);
    };
    const out = [pick(0.1), pick(0.5)];
    if (risky.length > 40) out.push(pick(0.3));
    return out;
  }

  // ---------------------------------------------------------------- undo and redo
  // A snapshot after every finished change: a slider let go, a colour picked, a shape drawn or moved, the trim changed…
  let past = [], future = [], last = null, restoring = false, plateImg = null;
  function snapshot() {
    const v = {};
    SLIDERS.forEach(id => { v[id] = $(id).value; });
    return {
      v, alpha: params().alpha, key: { rgb: key.rgb.slice(), picked: key.picked, shades: (key.shades || []).map(x => x.slice()) },
      extra: extraKeys.map(k => k.slice()),
      shapes: shapes.map(sh => ({ kind: sh.kind, pts: sh.pts.map(p => p.slice()) })),
      plateOn, plateTime, plateImg, trim: { start: trim.start, end: trim.end }, crop: Object.assign({}, crop)
    };
  }
  const same = (a, b) => JSON.stringify(Object.assign({}, a, { plateImg: 0 })) === JSON.stringify(Object.assign({}, b, { plateImg: 0 })) && a.plateImg === b.plateImg;
  function commit() {
    if (!loaded || restoring) return;
    const now = snapshot();
    if (last && same(now, last)) return;
    if (last) { past.push(last); if (past.length > 100) past.shift(); }
    future = []; last = now;
    histButtons();
  }
  function resetHistory() { past = []; future = []; last = null; histButtons(); }
  function histButtons() { $('undo').disabled = !past.length; $('redo').disabled = !future.length; }
  function undo() { if (!past.length) return; future.push(last); last = past.pop(); restore(last, 'Undone'); }
  function redo() { if (!future.length) return; past.push(last); last = future.pop(); restore(last, 'Redone'); }
  function restore(st, word) {
    restoring = true;
    SLIDERS.forEach(id => { $(id).value = st.v[id]; const o = $(id + '-out'); if (o) o.textContent = st.v[id]; });
    syncResets();
    const r = document.querySelector('input[name=mode][value=' + (st.alpha ? 'alpha' : 'key') + ']');
    if (!r.checked) { r.checked = true; r.dispatchEvent(new Event('change')); }
    setKey(st.key.rgb.slice(), st.key.picked, st.key.shades.map(x => x.slice()));
    extraKeys.length = 0; st.extra.forEach(k => extraKeys.push(k.slice())); listKeys();
    shapes.length = 0; st.shapes.forEach(sh => shapes.push({ kind: sh.kind, pts: sh.pts.map(p => p.slice()) })); listShapes();
    plateOn = st.plateOn; plateTime = st.plateTime;
    if (st.plateImg && st.plateImg !== plateImg) {
      plateC.width = st.plateImg.width; plateC.height = st.plateImg.height;
      plateC.getContext('2d').drawImage(st.plateImg, 0, 0); pv.setPlate(plateC);
    }
    plateImg = st.plateImg; showPlate();
    trim.start = st.trim.start; trim.end = st.trim.end; layoutTimeline();
    Object.assign(crop, st.crop); cropChanged();
    $('feather-out').textContent = $('feather').value;
    buildMask(); redraw();
    restoring = false;
    histButtons();
    $('sr-note').textContent = word + '.';
  }
  $('undo').addEventListener('click', undo);
  $('redo').addEventListener('click', redo);
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || making) return;
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox' && e.target.type !== 'radio';
    if (typing) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
  });
  { const n = document.createElement('p'); n.id = 'sr-note'; n.className = 'vh'; n.setAttribute('role', 'status'); document.body.appendChild(n); }

  // ---------------------------------------------------------------- backgrounds for the preview
  const BG = {};
  function solid(c) { const k = canvas(2, 2); const x = k.getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, 2, 2); return k; }
  BG.black = solid('#000'); BG.white = solid('#fff');
  BG.check = (() => { const k = canvas(512, 512); const x = k.getContext('2d');
    for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) { x.fillStyle = (i + j) % 2 ? '#cfcfcf' : '#f2f2f2'; x.fillRect(i * 32, j * 32, 32, 32); } return k; })();
  BG.room = BG.check;
  const roomImg = new Image();
  roomImg.onload = () => {                       // the middle of the sample classroom photo, as a backdrop
    const k = canvas(1024, 768);
    k.getContext('2d').drawImage(roomImg, roomImg.width * 0.36, roomImg.height * 0.22, roomImg.width * 0.28, roomImg.height * 0.5, 0, 0, 1024, 768);
    BG.room = k; if (bgName === 'room') { pv.setBackground(BG.room); redraw(); }
  };
  roomImg.src = 'panoramas/sample-room.jpg';
  let bgName = 'room';
  pv.setBackground(BG.room);
  document.querySelectorAll('.bg-btn').forEach(b => b.addEventListener('click', () => {
    bgName = b.dataset.bg;
    document.querySelectorAll('.bg-btn').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    pv.setBackground(BG[bgName]); redraw();
  }));

  // Picture or stencil: the stencil shows only the black-and-white mask (white = solid, black = see-through)
  let viewMode = 'picture';
  document.querySelectorAll('.view-toggle button').forEach(b => b.addEventListener('click', () => {
    viewMode = b.dataset.view;
    document.querySelectorAll('.view-toggle button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    const bgRow = $('bg-row'), stencil = viewMode === 'stencil';
    bgRow.classList.toggle('off', stencil);
    bgRow.querySelectorAll('button').forEach(x => { x.disabled = stencil; });
    redraw();
  }));

  // ---------------------------------------------------------------- loading a video
  function load(file) {
    if (!file) return;
    if (!/^video\//.test(file.type) && !/\.(mp4|mov|webm|m4v|mkv)$/i.test(file.name)) {
      return status('file-status', 'err', 'That doesn’t look like a video file.');
    }
    fileLabel = file.name; fileType = file.type || '';
    fileName = file.name.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'video';
    if (video.src) URL.revokeObjectURL(video.src);
    loaded = false;
    video.src = URL.createObjectURL(file);
    status('file-status', '', 'Opening ' + file.name + '…');
  }
  $('file').addEventListener('change', e => load(e.target.files[0]));
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => load(e.dataTransfer.files[0]));

  // Some WebMs (made by recording in a browser) don't say how long they are: find out by jumping to the very end
  function knownDuration() {
    return new Promise(res => {
      if (Number.isFinite(video.duration)) return res();
      const t = setTimeout(done, 5000);
      function done() { clearTimeout(t); video.removeEventListener('durationchange', check); video.currentTime = 0; res(); }
      function check() { if (Number.isFinite(video.duration)) done(); }
      video.addEventListener('durationchange', check);
      video.currentTime = 1e9;
    });
  }
  video.addEventListener('loadedmetadata', async () => {
    await knownDuration();
    if (!Number.isFinite(video.duration)) return status('file-status', 'err', 'This video doesn’t say how long it is, so it can’t be used. Try saving it again as an MP4.');
    const w = video.videoWidth, h = video.videoHeight;
    if (!w) return status('file-status', 'err', 'This video couldn’t be read. Try saving it as an MP4.');
    loaded = true;
    view.width = Math.min(w, 1280); view.height = Math.round(view.width * h / w);
    overlay.width = view.width; overlay.height = view.height;
    fitView();
    maskC.width = Math.min(w, 1024); maskC.height = Math.round(maskC.width * h / w);
    // a new video: start again with its shapes, extra colours and empty background
    shapes.length = 0; extraKeys.length = 0; plateOn = false; setTool(null);
    if (params().alpha) { const r = document.querySelector('input[name=mode][value=key]'); r.checked = true; r.dispatchEvent(new Event('change')); }
    listShapes(); listKeys(); showPlate(); buildMask();
    resetHistory(); needBaseline = true;
    $('stage-empty').hidden = true;
    ['play', 'make', 'auto-key', 'add-key', 'plate', 'swatch-btn'].forEach(id => { $(id).disabled = false; });
    document.querySelectorAll('.tool').forEach(b => { b.disabled = false; });
    trim.start = 0; trim.end = video.duration;
    Object.assign(crop, { x: 0, y: 0, w: 1, h: 1 }); cropChanged();
    timelineOn(true); layoutTimeline(); if (typeof gifNote === 'function') gifNote();
    status('file-status', 'ok', w + ' × ' + h + ', ' + fmt(video.duration) + ' long.');
    video.currentTime = Math.min(0.5, video.duration / 2);
  });
  video.addEventListener('error', () => status('file-status', 'err', 'This video couldn’t be opened in this browser. Try Chrome or Edge, or save it as an MP4.'));
  // A WebM that's already see-through: notice, and use its own transparency
  let checkAlpha = false, needBaseline = false;
  video.addEventListener('loadedmetadata', () => { checkAlpha = /\.webm$/i.test(fileLabel) || /webm/.test(fileType); });
  function ownAlpha() {
    try {
      const k = canvas(64, Math.max(8, Math.round(64 * video.videoHeight / video.videoWidth)));
      const c = k.getContext('2d', { willReadFrequently: true });
      c.drawImage(video, 0, 0, k.width, k.height);
      const d = c.getImageData(0, 0, k.width, k.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
    } catch (e) {}
    return false;
  }
  video.addEventListener('seeked', () => {
    if (checkAlpha) {
      checkAlpha = false;
      if (ownAlpha()) {
        document.querySelector('input[name=mode][value=alpha]').checked = true;
        document.querySelector('input[name=mode][value=alpha]').dispatchEvent(new Event('change'));
        status('file-status', 'ok', $('file-status').textContent + ' It’s already see-through, so its own transparency is used (step 2).');
      }
    }
    if (!key.picked && !params().alpha) autoKey();
    redraw(); tick();
    if (needBaseline) { needBaseline = false; commit(); updateSummary(); }
  });
  video.addEventListener('loadeddata', redraw);

  // Average colour of a small square of the current frame (x, y in video pixels)
  function sample(x, y, r) {
    const k = sample.k || (sample.k = document.createElement('canvas'));
    if (k.width !== video.videoWidth || k.height !== video.videoHeight) { k.width = video.videoWidth; k.height = video.videoHeight; }
    const c = k.getContext('2d', { willReadFrequently: true });
    c.drawImage(video, 0, 0);
    const d = c.getImageData(Math.max(0, x - r), Math.max(0, y - r), r * 2, r * 2).data;
    let s = [0, 0, 0], n = 0;
    for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; n++; }
    return s.map(v => v / n / 255);
  }
  // Guess the screen colour: look at a grid of patches across the whole picture, group similar colours, and pick
  // the strongly green (or blue) colour that covers the most of it. (A white wall lit blue by a window can look
  // "bluer" than a slightly teal green screen, but it covers far less of the picture.)
  function autoKey() {
    if (!loaded) return;
    const k = autoKey.k || (autoKey.k = document.createElement('canvas'));
    const cols = 16, rows = 9;
    k.width = cols * 4; k.height = rows * 4;
    const c = k.getContext('2d', { willReadFrequently: true });
    c.drawImage(video, 0, 0, k.width, k.height);
    const d = c.getImageData(0, 0, k.width, k.height).data;
    const cand = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      let s3 = [0, 0, 0];
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const o = ((j * 4 + y) * k.width + i * 4 + x) * 4; s3[0] += d[o]; s3[1] += d[o + 1]; s3[2] += d[o + 2]; }
      const rgb = s3.map(v => v / 16 / 255), [r, g, b] = rgb;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      // a screen: clearly coloured, with green (or blue) the strongest and red the weakest
      if (chroma > 0.15 && Math.max(g, b) > r + 0.1 && (g >= b || b - g > 0.12)) cand.push(rgb);
    }
    if (!cand.length) return setKey(key.rgb, false);
    const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.14;
    let best = null, bestN = 0;
    cand.forEach(c1 => { const n = cand.filter(c2 => near(c1, c2)).length; if (n > bestN) { bestN = n; best = c1; } });
    const group = cand.filter(c2 => near(best, c2));
    setKey([0, 1, 2].map(i => group.reduce((t, g2) => t + g2[i], 0) / group.length), false);
  }
  $('auto-key').addEventListener('click', () => { if (tool === 'pick') setTool(null); key.picked = false; autoKey(); commit(); });
  // The colour box: press it, and the next click on the preview (with the eyedropper) chooses the screen colour
  $('swatch-btn').addEventListener('click', () => setTool(tool === 'pick' ? null : 'pick'));

  // ---------------------------------------------------------------- clicking on the preview
  // No tool: pick the colour to remove. A shape tool: add dots. "Add colour": pick an extra colour.
  // Dragging a dot of a finished shape moves it, whatever tool is chosen.
  let tool = null, draft = [], hover = null, drag = null;
  const KIND = {
    keep: { label: 'Remove outside', line: '#ffd23f', fill: 'rgba(255,210,63,.12)' },
    remove: { label: 'Remove inside', line: '#ff5a5a', fill: 'rgba(255,90,90,.28)' },
    solid: { label: 'Keep inside', line: '#3fd7ff', fill: 'rgba(63,215,255,.28)' }
  };
  function hint() {
    const h = $('pick-hint');
    const alpha = params().alpha;
    h.hidden = false;
    if (tool === 'pick') h.textContent = 'click the screen in the picture to choose its colour (Esc to cancel)';
    else if (tool === 'addkey') h.textContent = 'click a patch of background that is still showing';
    else if (tool) h.textContent = draft.length >= 3 ? 'keep clicking around the area, then click the first dot to finish' : 'click around the area, dot by dot';
    else if (alpha) h.hidden = true;
    else h.textContent = 'click the background in the picture to choose the colour to remove';
    $('stage').classList.toggle('drawing', !!tool && !!KIND[tool]);
    $('stage').classList.toggle('picking', tool === 'pick' || tool === 'addkey');
  }
  function setTool(t) {
    tool = t; draft = []; hover = null;
    document.querySelectorAll('.tool').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
    $('add-key').setAttribute('aria-pressed', String(t === 'addkey'));
    $('swatch-btn').setAttribute('aria-pressed', String(t === 'pick'));
    const drawing = !!(t && KIND[t]);
    $('draw-bar').hidden = !drawing;
    if (drawing) $('draw-what').textContent = KIND[t].label;
    updateDrawBar(); hint(); drawOverlay();
  }
  function updateDrawBar() {
    $('draw-done').disabled = draft.length < 3;
    $('draw-undo').disabled = !draft.length;
    $('draw-count').textContent = draft.length === 1 ? '1 dot' : draft.length + ' dots';
  }
  document.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => setTool(tool === b.dataset.tool ? null : b.dataset.tool)));
  $('draw-done').addEventListener('click', finishShape);
  $('draw-undo').addEventListener('click', () => { draft.pop(); updateDrawBar(); hint(); drawOverlay(); });
  $('draw-cancel').addEventListener('click', () => setTool(null));
  function finishShape() {
    if (draft.length < 3) return;
    shapes.push({ kind: tool, pts: draft.slice() });
    const what = KIND[tool].label;
    setTool(null);
    listShapes(); buildMask(); commit();
    status('shape-status', 'ok', '“' + what + '” shape added. Drag its dots to adjust it.');
  }
  document.addEventListener('keydown', e => {
    if (!tool) return;
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range';
    if (e.key === 'Escape') { setTool(null); e.preventDefault(); }
    else if (e.key === 'Enter' && draft.length >= 3 && !typing && e.target.tagName !== 'BUTTON') { finishShape(); e.preventDefault(); }
    else if (e.key === 'Backspace' && draft.length && !typing) { draft.pop(); updateDrawBar(); hint(); drawOverlay(); e.preventDefault(); }
  });

  // Dots clicked close to the picture's edge snap onto it (and the shape then carries on past the edge, so a soft edge doesn't fade the person)
  const snap = v => v < 0.025 ? 0 : v > 0.975 ? 1 : v;
  const toVideo = e => {
    const r = view.getBoundingClientRect();
    return [snap(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))), snap(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)))];
  };
  // the dot under the pointer, if any (within about a fingertip)
  function hitDot(e, list) {
    const r = view.getBoundingClientRect(), reach = e.pointerType === 'touch' ? 18 : 10;
    let best = null, bd = reach;
    list.forEach((pts, si) => pts.forEach((p, pi) => {
      const d = Math.hypot(p[0] * r.width - (e.clientX - r.left), p[1] * r.height - (e.clientY - r.top));
      if (d <= bd) { bd = d; best = { si, pi }; }
    }));
    return best;
  }
  view.addEventListener('pointerdown', e => {
    if (!loaded || making) return;
    const p = toVideo(e);
    if (tool && KIND[tool]) {
      if (draft.length >= 3 && hitDot(e, [[draft[0]]])) { finishShape(); return; }
    }
    const hit = (!tool || KIND[tool]) && !draft.length ? hitDot(e, shapes.map(s => s.pts)) : null;
    if (hit) { drag = hit; view.setPointerCapture(e.pointerId); e.preventDefault(); return; }
    if (tool === 'pick') {
      setKey(sample(Math.round(p[0] * video.videoWidth), Math.round(p[1] * video.videoHeight), 3), true); commit();
      setTool(null);
      return;
    }
    if (tool === 'addkey') {
      addKey(sample(Math.round(p[0] * video.videoWidth), Math.round(p[1] * video.videoHeight), 3));
      setTool(null);
      return;
    }
    if (tool) { draft.push(p); updateDrawBar(); hint(); drawOverlay(); return; }
    if (!params().alpha) { setKey(sample(Math.round(p[0] * video.videoWidth), Math.round(p[1] * video.videoHeight), 3), true); commit(); }
  });
  let maskQueued = false;
  view.addEventListener('pointermove', e => {
    if (drag) {
      shapes[drag.si].pts[drag.pi] = toVideo(e);
      drawOverlay();
      if (!maskQueued) { maskQueued = true; requestAnimationFrame(() => { maskQueued = false; buildMask(); }); }
      return;
    }
    const over = shapes.length && hitDot(e, shapes.map(s => s.pts));
    view.classList.toggle('over-dot', !!over && !draft.length);
    if (tool && KIND[tool]) { hover = toVideo(e); drawOverlay(); }
  });
  const endDrag = () => { if (drag) { drag = null; buildMask(); commit(); } };
  view.addEventListener('pointerup', endDrag);
  view.addEventListener('pointercancel', endDrag);
  view.addEventListener('pointerleave', () => { if (hover) { hover = null; drawOverlay(); } });

  // ---------------------------------------------------------------- crop: a dot on each corner of the preview
  // The preview always shows the whole picture, with the part that's cut off darkened; the files are made from the box.
  // Drag a corner dot to crop (or focus it and use the arrow keys).
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rawVideo = e => { const r = view.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  const cropDots = [...document.querySelectorAll('.crop-dot')];
  // move one corner (c = 'tl', 'tr', 'bl' or 'br') to x, y (0..1 of the picture); the opposite corner stays put
  function moveCorner(c, x, y) {
    const right = crop.x + crop.w, bottom = crop.y + crop.h, snapE = 0.012;
    if (c[1] === 'l') { x = clamp(x, 0, right - MIN_CROP); if (x < snapE) x = 0; crop.x = x; crop.w = right - x; }
    else { x = clamp(x, crop.x + MIN_CROP, 1); if (x > 1 - snapE) x = 1; crop.w = x - crop.x; }
    if (c[0] === 't') { y = clamp(y, 0, bottom - MIN_CROP); if (y < snapE) y = 0; crop.y = y; crop.h = bottom - y; }
    else { y = clamp(y, crop.y + MIN_CROP, 1); if (y > 1 - snapE) y = 1; crop.h = y - crop.y; }
    cropChanged();
  }
  function cropChanged() {
    cropDots.forEach(d => {
      const c = d.dataset.c;
      d.style.left = (c[1] === 'l' ? crop.x : crop.x + crop.w) * 100 + '%';
      d.style.top = (c[0] === 't' ? crop.y : crop.y + crop.h) * 100 + '%';
      d.hidden = !loaded;
    });
    drawOverlay();
    if (fmtReady) { gifNote(); updateSummary(); }
  }
  let cropDrag = null, cropKeyCommit = 0;
  cropDots.forEach(d => {
    d.addEventListener('pointerdown', e => {
      if (!loaded || making) return;
      cropDrag = d.dataset.c; d.setPointerCapture(e.pointerId); d.classList.add('dragging'); e.preventDefault();
    });
    d.addEventListener('pointermove', e => { if (cropDrag === d.dataset.c) { const p = rawVideo(e); moveCorner(cropDrag, p[0], p[1]); } });
    const end = () => { if (cropDrag) { cropDrag = null; d.classList.remove('dragging'); commit(); } };
    d.addEventListener('pointerup', end); d.addEventListener('pointercancel', end);
    d.addEventListener('keydown', e => {
      if (!loaded || making) return;
      const step = e.shiftKey ? 0.05 : 0.01, c = d.dataset.c;
      const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!mv) return;
      e.preventDefault();
      moveCorner(c, (c[1] === 'l' ? crop.x : crop.x + crop.w) + mv[0], (c[0] === 't' ? crop.y : crop.y + crop.h) + mv[1]);
      clearTimeout(cropKeyCommit); cropKeyCommit = setTimeout(commit, 700);   // a burst of key presses is one undo step
    });
  });
  function drawCrop(x, W, H, k) {
    if (!cropped()) return;
    const L = crop.x * W, T = crop.y * H, CW = crop.w * W, CH = crop.h * H;
    x.fillStyle = 'rgba(0,0,0,.6)';
    x.beginPath(); x.rect(0, 0, W, H); x.rect(L, T, CW, CH); x.fill('evenodd');
    x.lineWidth = 1.5 * k; x.strokeStyle = 'rgba(255,255,255,.9)'; x.strokeRect(L, T, CW, CH);
  }

  // ---------------------------------------------------------------- shapes: outlines on top, and the mask they make
  $('show-shapes').addEventListener('change', drawOverlay);
  function drawOverlay() {
    const x = overlay.getContext('2d'), W = overlay.width, H = overlay.height;
    x.clearRect(0, 0, W, H);
    const r = view.getBoundingClientRect();
    const k = r.width ? W / r.width : 1;               // one screen pixel, in canvas pixels
    const path = pts => { x.beginPath(); pts.forEach((p, i) => x[i ? 'lineTo' : 'moveTo'](p[0] * W, p[1] * H)); };
    const dots = (pts, colour, first) => pts.forEach((p, i) => {
      x.beginPath(); x.arc(p[0] * W, p[1] * H, (i === 0 && first ? 7 : 5) * k, 0, Math.PI * 2);
      x.fillStyle = colour; x.fill(); x.lineWidth = 1.5 * k; x.strokeStyle = '#000'; x.stroke();
    });
    if ($('show-shapes').checked || tool) {
      // shade what "Remove outside" shapes take away
      const keeps = shapes.filter(s => s.kind === 'keep');
      if (keeps.length) {
        x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(0, 0, W, H);
        x.globalCompositeOperation = 'destination-out';
        keeps.forEach(s => { path(s.pts); x.closePath(); x.fillStyle = '#000'; x.fill(); });
        x.globalCompositeOperation = 'source-over';
      }
      shapes.forEach(s => {
        const K = KIND[s.kind];
        path(s.pts); x.closePath();
        if (s.kind !== 'keep') { x.fillStyle = K.fill; x.fill(); }
        x.setLineDash(s.kind === 'keep' ? [8 * k, 6 * k] : []);
        x.lineWidth = 2 * k; x.strokeStyle = K.line; x.stroke(); x.setLineDash([]);
        dots(s.pts, K.line, false);
      });
    }
    if (tool && KIND[tool] && draft.length) {
      const K = KIND[tool];
      path(hover ? draft.concat([hover]) : draft);
      x.lineWidth = 2 * k; x.strokeStyle = K.line; x.setLineDash([4 * k, 4 * k]); x.stroke(); x.setLineDash([]);
      dots(draft, K.line, draft.length >= 3);
    }
    drawCrop(x, W, H, k);
  }
  window.addEventListener('resize', drawOverlay);
  // Wide screens: the picture fills the space it has (keeping its shape), however small the video is
  const wide = matchMedia('(min-width: 900px)');
  function fitView() {
    if (!wide.matches) { view.style.width = ''; return; }
    const st = $('stage'), W = st.clientWidth, H = st.clientHeight;
    if (!W || !H || !view.width) return;
    view.style.width = Math.floor(Math.min(W, H * view.width / view.height)) + 'px';
    drawOverlay();
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fitView).observe($('stage'));
  wide.addEventListener('change', fitView);

  function listShapes() {
    const ul = $('shape-list');
    ul.innerHTML = '';
    shapes.forEach((s, i) => {
      const li = document.createElement('li');
      const mark = document.createElement('span'); mark.className = 'shape-mark ' + s.kind; mark.setAttribute('aria-hidden', 'true');
      const txt = document.createElement('span'); txt.textContent = KIND[s.kind].label + ' (' + s.pts.length + ' dots)';
      const del = document.createElement('button'); del.type = 'button'; del.className = 'btn small ghost'; del.textContent = 'Delete';
      del.setAttribute('aria-label', 'Delete shape ' + (i + 1) + ': ' + KIND[s.kind].label);
      del.addEventListener('click', () => { shapes.splice(i, 1); listShapes(); buildMask(); commit(); status('shape-status', '', 'Shape deleted.'); });
      li.append(mark, txt, del); ul.append(li);
    });
    $('shapes-clear').hidden = shapes.length < 2;
    drawOverlay();
  }
  $('shapes-clear').addEventListener('click', () => { shapes.length = 0; listShapes(); buildMask(); commit(); status('shape-status', '', 'All shapes removed.'); });
  $('feather').addEventListener('input', () => { $('feather-out').textContent = $('feather').value; buildMask(); });
  $('feather-out').textContent = $('feather').value;

  // The mask: red = "allowed" (black where a shape removes it), green = "always solid".
  function buildMask() {
    const W = maskC.width, H = maskC.height;
    const fillShapes = (x, list, colour) => {
      x.fillStyle = colour;
      const out = v => v <= 0 ? -0.1 : v >= 1 ? 1.1 : v;
      list.forEach(s => { x.beginPath(); s.pts.forEach((p, i) => x[i ? 'lineTo' : 'moveTo'](out(p[0]) * W, out(p[1]) * H)); x.closePath(); x.fill(); });
    };
    const keeps = shapes.filter(s => s.kind === 'keep'), removes = shapes.filter(s => s.kind === 'remove'), solids = shapes.filter(s => s.kind === 'solid');
    const allow = canvas(W, H), ax = allow.getContext('2d');
    ax.fillStyle = keeps.length ? '#000' : '#fff'; ax.fillRect(0, 0, W, H);
    fillShapes(ax, keeps, '#fff'); fillShapes(ax, removes, '#000');
    const sol = canvas(W, H), sx = sol.getContext('2d');
    sx.fillStyle = '#000'; sx.fillRect(0, 0, W, H);
    fillShapes(sx, solids, '#fff');
    // Soft edges: draw it sharp, then blurred on top (so the picture's own edges don't darken)
    const blur = $('feather').value / 100 * 0.03 * W;
    const soften = src => {
      const out = canvas(W, H), o = out.getContext('2d', { willReadFrequently: true });
      o.drawImage(src, 0, 0);
      if (blur > 0.5 && 'filter' in o) { o.filter = 'blur(' + blur.toFixed(1) + 'px)'; o.drawImage(src, 0, 0); o.filter = 'none'; }
      return o.getImageData(0, 0, W, H).data;
    };
    const A = soften(allow), S = soften(sol);
    const mx = maskC.getContext('2d');
    const img = mx.createImageData(W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = A[i]; d[i + 1] = S[i]; d[i + 2] = 0; d[i + 3] = 255; }
    mx.putImageData(img, 0, 0);
    pv.setMask(maskC);
    redraw();
  }

  // ---------------------------------------------------------------- patchy screens: more colours, empty background
  $('add-key').addEventListener('click', () => {
    if (extraKeys.length >= MAX_KEYS) return status('key-status', 'err', 'That’s the most extra colours you can add. Delete one first, or try “Use this moment as the empty background”.');
    setTool(tool === 'addkey' ? null : 'addkey');
    if (tool) status('key-status', '', 'Now click a patch of background that’s still showing in the preview (a shadow, a crease, a darker corner).');
    else status('key-status', '', '');
  });
  function addKey(rgb) {
    extraKeys.push(rgb); listKeys(); redraw(); commit();
    status('key-status', 'ok', 'Colour added. If part of the person vanished too, delete it and click a different spot.');
  }
  function listKeys() {
    const ul = $('extra-keys');
    ul.innerHTML = '';
    extraKeys.forEach((k, i) => {
      const li = document.createElement('li');
      const sw = document.createElement('span'); sw.className = 'swatch small'; sw.style.background = rgbCss(k); sw.setAttribute('aria-hidden', 'true');
      const del = document.createElement('button'); del.type = 'button'; del.className = 'chip-x';
      del.textContent = '×'; del.setAttribute('aria-label', 'Delete extra colour ' + (i + 1));
      del.addEventListener('click', () => { extraKeys.splice(i, 1); listKeys(); redraw(); commit(); status('key-status', '', 'Colour deleted.'); });
      li.append(sw, del); ul.append(li);
    });
    ul.hidden = !extraKeys.length;
    $('add-key').disabled = !loaded;
  }
  $('plate').addEventListener('click', () => {
    if (!loaded) return;
    plateC.width = Math.min(video.videoWidth, 1280); plateC.height = Math.round(plateC.width * video.videoHeight / video.videoWidth);
    plateC.getContext('2d').drawImage(video, 0, 0, plateC.width, plateC.height);
    pv.setPlate(plateC);
    plateImg = canvas(plateC.width, plateC.height); plateImg.getContext('2d').drawImage(plateC, 0, 0);   // kept for undo
    plateOn = true; plateTime = video.currentTime;
    showPlate(); redraw(); commit();
  });
  $('plate-clear').addEventListener('click', () => { plateOn = false; showPlate(); redraw(); commit(); });
  function showPlate() {
    $('plate-clear').hidden = !plateOn;
    $('plate').textContent = plateOn ? 'Use this moment instead' : 'Use this moment as the empty background';
    if (plateOn) status('plate-status', 'ok', 'Using the background from ' + fmt(plateTime, true) + '. The camera needs to stay still for this to work.');
    else status('plate-status', '', '');
  }

  // ---------------------------------------------------------------- preview playback
  function redraw() {
    if (!loaded || video.readyState < 2 || making) return;
    pv.upload(); pv.draw(viewMode === 'stencil' ? 2 : 0, 0, 0, view.width, view.height);
  }
  function loop() {
    if (!video.paused && !making) {
      // play just the kept part, round and round
      if (video.currentTime >= trim.end - 0.03 || video.currentTime < trim.start - 0.1) video.currentTime = trim.start;
    }
    redraw(); tick();
    if (!video.paused && !making) requestAnimationFrame(loop);
  }
  $('play').addEventListener('click', () => {
    if (video.paused) {
      if (video.currentTime < trim.start || video.currentTime >= trim.end - 0.05) video.currentTime = trim.start;
      speakers();
      // if the browser won't play it with sound, play it silently rather than not at all
      video.play().catch(() => { video.muted = true; return video.play(); }).then(loop).catch(() => {});
    } else video.pause();
  });
  // The preview plays with its sound. (Once a video with sound has been made, the sound runs through the page's
  // audio graph, so it has to be routed to the speakers there too.)
  let toSpeakers = false;
  function speakers() {
    const on = !making;
    video.muted = !on;
    if (audioSrc && audioCtx) {
      if (on && !toSpeakers) { audioSrc.connect(audioCtx.destination); toSpeakers = true; audioCtx.resume().catch(() => {}); }
      else if (!on && toSpeakers) { try { audioSrc.disconnect(audioCtx.destination); } catch (e) {} toSpeakers = false; }
    }
  }
  video.addEventListener('play', () => { $('play').textContent = '❚❚ Pause'; $('play').setAttribute('aria-label', 'Pause'); });
  video.addEventListener('pause', () => { $('play').textContent = '▶ Play'; $('play').setAttribute('aria-label', 'Play'); });
  video.loop = true;
  function tick() {
    if (!loaded) return;
    layoutTimeline();
    $('time').textContent = fmt(video.currentTime, true) + ' / ' + fmt(video.duration, true);
  }
  const fmt = (t, tenths) => {
    t = Math.max(0, t || 0);
    const m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (tenths ? s.toFixed(1).padStart(4, '0') : String(Math.floor(s)).padStart(2, '0'));
  };
  function status(id, kind, text) { const e = $(id); e.className = 'status ' + (kind || ''); e.textContent = text; }

  // ---------------------------------------------------------------- the timeline: playhead, and trim dots at each end
  const track = $('tl-track'), head = $('seek'), tStart = $('trim-start'), tEnd = $('trim-end');
  const MIN_CLIP = 0.2;
  let fmtReady = false;
  function timelineOn(on) {
    [head, tStart, tEnd].forEach(el => { el.tabIndex = on ? 0 : -1; el.setAttribute('aria-disabled', String(!on)); });
    $('timeline').classList.toggle('off', !on);
  }
  timelineOn(false);
  function layoutTimeline() {
    const d = video.duration || 1, pc = t => (t / d * 100) + '%';
    tStart.style.left = pc(trim.start); tEnd.style.left = pc(trim.end);
    head.style.left = pc(video.currentTime || 0);
    $('tl-cut-l').style.width = pc(trim.start);
    $('tl-cut-r').style.left = pc(trim.end); $('tl-cut-r').style.width = (100 - trim.end / d * 100) + '%';
    const set = (el, v, text) => { el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', d.toFixed(1)); el.setAttribute('aria-valuenow', v.toFixed(1)); el.setAttribute('aria-valuetext', text); };
    set(head, video.currentTime || 0, fmt(video.currentTime, true));
    set(tStart, trim.start, 'starts at ' + fmt(trim.start, true));
    set(tEnd, trim.end, 'ends at ' + fmt(trim.end, true));
    const cut = trim.start > 0.05 || trim.end < d - 0.05;
    $('trim-text').textContent = !loaded ? 'Drag the dots at each end of the timeline to trim.'
      : cut ? 'Keeping ' + fmt(trim.start, true) + ' to ' + fmt(trim.end, true) + ' (' + (trim.end - trim.start).toFixed(1) + ' seconds).'
      : 'Drag the dots at each end of the timeline to trim. Keeping all ' + (d).toFixed(1) + ' seconds.';
    if (loaded && fmtReady) { gifNote(); updateSummary(); }
  }
  const timeAt = e => { const r = track.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * video.duration; };
  function moveTo(which, t) {
    const d = video.duration;
    if (which === tStart) { trim.start = Math.max(0, Math.min(t, trim.end - MIN_CLIP)); show(trim.start); }
    else if (which === tEnd) { trim.end = Math.min(d, Math.max(t, trim.start + MIN_CLIP)); show(Math.min(trim.end, d - 0.04)); }
    else show(Math.max(0, Math.min(d, t)));
    layoutTimeline();
  }
  function show(t) { if (Math.abs(video.currentTime - t) > 0.01) video.currentTime = t; }
  let tlDrag = null;
  track.addEventListener('pointerdown', e => {
    if (!loaded || making) return;
    tlDrag = e.target === tStart || e.target === tEnd ? e.target : head;
    if (tlDrag !== head) video.pause();
    track.setPointerCapture(e.pointerId);
    (tlDrag === head ? head : tlDrag).focus({ preventScroll: true });
    moveTo(tlDrag, timeAt(e));
    e.preventDefault();
  });
  track.addEventListener('pointermove', e => { if (tlDrag) moveTo(tlDrag, timeAt(e)); });
  const tlEnd = () => { if (tlDrag && tlDrag !== head) commit(); tlDrag = null; };
  track.addEventListener('pointerup', tlEnd); track.addEventListener('pointercancel', tlEnd);
  [head, tStart, tEnd].forEach(el => el.addEventListener('keydown', e => {
    if (!loaded || making) return;
    const now = el === tStart ? trim.start : el === tEnd ? trim.end : video.currentTime;
    const step = e.shiftKey ? 1 : 0.1;
    const to = { ArrowLeft: now - step, ArrowDown: now - step, ArrowRight: now + step, ArrowUp: now + step,
      PageDown: now - 1, PageUp: now + 1, Home: 0, End: video.duration }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    if (el !== head) video.pause();
    moveTo(el, to);
    if (el !== head) { clearTimeout(keyCommit); keyCommit = setTimeout(commit, 700); }   // a burst of key presses is one undo step
  }));
  let keyCommit = 0;

  // ---------------------------------------------------------------- making the file
  // Three kinds of file:
  //  stencil: an MP4 twice as tall (picture on black + black-and-white stencil). Plays on every phone; the tour cuts it out.
  //  webm:    a WebM with real transparency (VP9/VP8 alpha). Chrome, Edge, Firefox, Android; not iPhones.
  //  gif:     an animated GIF, no sound. Pixels are fully solid or fully see-through.
  const fmtNow = () => document.querySelector('input[name=fmt]:checked').value;
  const isChromium = !!(navigator.userAgentData && navigator.userAgentData.brands && navigator.userAgentData.brands.some(b => /Chromium/.test(b.brand)))
    || (/Chrome\//.test(navigator.userAgent) && !/Firefox\//.test(navigator.userAgent));
  // MP4 (H.264) plays on every phone. Chrome/Edge (Windows, Mac) and Safari can record it; Firefox can't.
  function pickType(withSound) {
    const mp4 = ['avc1.640028', 'avc1.4d002a', 'avc1.42E01E', 'avc1'];
    const list = [];
    mp4.forEach(c => { if (withSound) list.push('video/mp4;codecs=' + c + ',mp4a.40.2'); list.push('video/mp4;codecs=' + c); });
    for (const t of list) if (MediaRecorder.isTypeSupported(t)) return { type: t, ext: 'mp4' };
    return pickWebm(withSound);
  }
  function pickWebm(withSound) {
    const list = withSound ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus'] : [];
    list.push('video/webm;codecs=vp9', 'video/webm;codecs=vp8');
    for (const t of list) if (MediaRecorder.isTypeSupported(t)) return { type: t, ext: 'webm' };
    return null;
  }
  const canRecord = typeof MediaRecorder !== 'undefined' && !!pickType(false);
  function formatChanged() {
    const f = fmtNow();
    $('gif-opts').hidden = f !== 'gif';
    $('sound').disabled = f === 'gif'; $('sound-note').hidden = f !== 'gif';
    $('make').textContent = { stencil: 'Make the see-through MP4', webm: 'Make the transparent WebM', gif: 'Make the GIF' }[f];
    gifNote();
    const warn = $('browser-warn');
    let msg = '';
    if (f === 'gif') msg = '';
    else if (!canRecord) msg = 'This browser can’t make videos. Please use Chrome or Edge on a Windows or Mac computer.';
    else if (f === 'stencil' && pickType(false).ext !== 'mp4') msg = 'This browser can only make WebM videos, which won’t play on iPhones. For a video that works on every phone, use Chrome or Edge on a Windows or Mac computer.';
    else if (f === 'webm' && !pickWebm(false)) msg = 'This browser can’t make WebM videos. Please use Chrome or Edge.';
    else if (f === 'webm' && !isChromium) msg = 'This browser may lose the transparency when it makes a WebM. Chrome or Edge keep it.';
    warn.hidden = !msg; warn.textContent = msg;
  }
  function gifSize() {
    const w = Math.round(Math.min(+$('size').value, 480, srcW() || 480) / 2) * 2;
    return [w, Math.round(w * (srcH() || 270) / (srcW() || 480) / 2) * 2];
  }
  function gifNote() {
    if (fmtNow() !== 'gif') return;
    const [w, h] = gifSize();
    const secs = loaded ? trim.end - trim.start : 0;
    let t = 'GIFs are made at most 480 wide' + (loaded ? ' (this one: ' + w + ' × ' + h + ')' : '') + '.';
    if (secs > 8) t += ' This clip is ' + secs.toFixed(1) + ' seconds long: GIFs this long get very big. Try trimming it to a few seconds.';
    $('gif-note').textContent = t;
  }
  // What will be made: kind, size, length, sound and roughly how big the file will be
  function outSize(f) {
    if (f === 'gif') return gifSize();
    let w = Math.min(+$('size').value, srcW()), h = w * srcH() / srcW();
    if (f === 'stencil' && h * 2 > 2160) { h = 1080; w = h * srcW() / srcH(); }
    return [Math.round(w / 2) * 2, Math.round(h / 2) * 2];
  }
  function updateSummary() {
    $('summary').hidden = !loaded;
    if (!loaded) return;
    const f = fmtNow(), [w, h] = outSize(f), secs = Math.max(0, trim.end - trim.start);
    const kind = f !== 'gif' && canRecord ? (f === 'webm' ? pickWebm(false) : pickType(false)) : null;
    $('sum-file').textContent = f === 'gif' ? 'Animated GIF' : f === 'webm' ? 'Transparent WebM'
      : kind && kind.ext === 'webm' ? 'See-through WebM (this browser can’t make MP4s)' : 'See-through MP4';
    $('sum-size').textContent = (f === 'stencil' ? w + ' × ' + h + ' (made ' + w + ' × ' + h * 2 + ', with its stencil)' : w + ' × ' + h) + (cropped() ? ', cropped' : '');
    $('sum-length').textContent = secs.toFixed(1) + ' seconds' + (trim.start > 0.05 || trim.end < video.duration - 0.05 ? ' (trimmed)' : '');
    $('sum-sound').textContent = f === 'gif' ? 'None (GIFs can’t have sound)' : $('sound').checked ? 'Kept' : 'Off';
    let bytes;
    if (f === 'gif') bytes = w * h * Math.round(secs * +$('gif-fps').value) * 0.3;
    else {
      const H = f === 'stencil' ? h * 2 : h;
      const bps = Math.min(12e6, Math.max(2.5e6, w * H * 30 * 0.12));
      bytes = (bps * 0.6 + ($('sound').checked ? 128e3 : 0)) * secs / 8;
    }
    $('sum-bytes').textContent = 'up to about ' + sizeText(bytes);
  }
  document.querySelectorAll('input[name=fmt]').forEach(r => r.addEventListener('change', () => { formatChanged(); updateSummary(); }));
  $('size').addEventListener('change', () => { gifNote(); updateSummary(); });
  $('sound').addEventListener('change', updateSummary);
  $('gif-fps').addEventListener('change', updateSummary);
  formatChanged();
  fmtReady = true;

  const sizeText = n => n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  function busy(on) {
    $('make').disabled = on; $('cancel').hidden = !on; $('progress').hidden = !on;
    if (on) $('result').hidden = true; else $('bar').style.width = '0';
  }
  function deliver(blob, name, extra) {
    const a = $('download');
    if (a.href) URL.revokeObjectURL(a.href);
    a.href = URL.createObjectURL(blob); a.download = name;
    a.textContent = '⬇ Download ' + name + ' (' + sizeText(blob.size) + ')';
    const f = fmtNow();
    ['stencil', 'webm', 'gif'].forEach(k => { $('next-' + k).hidden = k !== f; });
    document.querySelectorAll('#next-' + f + ' .path-eg').forEach(c => { c.textContent = (f === 'gif' ? 'images/' : 'videos/') + name; });
    $('result').hidden = false;
    status('make-status', extra && extra.err ? 'err' : 'ok', 'Done!' + (extra && extra.text ? ' ' + extra.text : ''));
    tryInRoom(a.href, f);
  }
  // The finished file in the sample classroom, the way a tour shows it (played at once, looping)
  function tryInRoom(url, f) {
    const flags = f === 'gif' ? 'i' : 'svr' + 'x' + (f === 'webm' ? 'w' : '');
    const spot = url + '~0~-4~' + flags + '~~40';
    const src = 'index.html?p=panoramas/sample-room.jpg&t=' + encodeURIComponent('Try it in a room') + '&s=' + encodeURIComponent(spot) + '&v=2';
    const box = $('try-frame');
    box.innerHTML = '';
    const ifr = document.createElement('iframe');
    ifr.title = 'Your file in the sample classroom';
    ifr.allow = 'autoplay; fullscreen';
    ifr.src = src;
    box.appendChild(ifr);
  }
  // seek and wait until that picture is ready
  function seekTo(t) {
    return new Promise(res => {
      if (Math.abs(video.currentTime - t) < 0.0005 && video.readyState >= 2) return res();
      video.addEventListener('seeked', () => res(), { once: true });
      video.currentTime = t;
    });
  }

  $('make').addEventListener('click', async () => {
    if (!loaded || making) return;
    if (tool) setTool(null);
    const start = Math.max(0, trim.start);
    const end = Math.min(video.duration, trim.end);
    if (end - start < MIN_CLIP) return status('make-status', 'err', 'The clip is too short: drag the trim dots further apart.');
    const f = fmtNow();
    if (f === 'gif') return makeGif(start, end);
    makeVideo(f, start, end);
  });

  // ---------------------------------------------------------------- videos (played through in real time, so the sound stays in step)
  let audioCtx = null, audioSrc = null, audioDest = null;
  async function makeVideo(f, start, end) {
    const withSound = $('sound').checked;
    const kind = f === 'webm' ? pickWebm(withSound) : pickType(withSound);
    if (!kind) return status('make-status', 'err', 'This browser can’t make videos. Please use Chrome or Edge.');

    // Size: the chosen width (never bigger than the original), even numbers; the stencil MP4 is twice as tall
    const stencil = f === 'stencil';
    let w = Math.min(+$('size').value, srcW());
    let h = w * srcH() / srcW();
    if (stencil && h * 2 > 2160) { h = 1080; w = h * srcW() / srcH(); }
    w = Math.round(w / 2) * 2; h = Math.round(h / 2) * 2;
    const out = canvas(w, stencil ? h * 2 : h);
    const og = makeGL(out, !stencil);
    if (plateOn) og.setPlate(plateC);

    const manual = typeof CanvasCaptureMediaStreamTrack !== 'undefined' && 'requestFrame' in CanvasCaptureMediaStreamTrack.prototype;
    const stream = out.captureStream(manual ? 0 : 30);
    const track = stream.getVideoTracks()[0];
    if (withSound) {
      try {
        audioCtx = audioCtx || new AudioContext();
        audioSrc = audioSrc || audioCtx.createMediaElementSource(video);
        audioDest = audioDest || audioCtx.createMediaStreamDestination();
        audioSrc.connect(audioDest);
        await audioCtx.resume();
        audioDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
      } catch (e) { /* no sound track: carry on silently */ }
    }
    const rec = new MediaRecorder(stream, { mimeType: kind.type, videoBitsPerSecond: Math.round(Math.min(12e6, Math.max(2.5e6, w * out.height * 30 * 0.12))) });
    const chunks = [];
    let bytes = 0;
    rec.ondataavailable = e => { if (e.data.size) { chunks.push(e.data); bytes += e.data.size; } };

    making = { cancelled: false };
    busy(true);
    status('make-status', '', 'Making it… this takes as long as the clip (' + fmt(end - start, true) + '). Keep this tab open.');
    video.pause(); video.loop = false;
    await seekTo(start);
    if (audioSrc && toSpeakers) { try { audioSrc.disconnect(audioCtx.destination); } catch (e) {} toSpeakers = false; }
    video.muted = !withSound;                     // the sound goes into the file, not the speakers
    rec.start(500);
    const recStarted = performance.now();
    let lastT = -1, drawn = 0;
    const frame = () => {
      if (!making) return;
      if (video.currentTime === lastT && !video.ended) { requestAnimationFrame(frame); return; }   // no new picture yet
      lastT = video.currentTime; drawn++;
      og.upload();
      if (stencil) {
        og.draw(1, 0, h, w, h, true);              // top: the picture, on black
        og.draw(2, 0, 0, w, h, true);              // bottom: the stencil
      } else og.draw(3, 0, 0, w, h, true);               // the picture with real transparency
      if (manual) track.requestFrame();
      $('bar').style.width = Math.min(100, (video.currentTime - start) / (end - start) * 100) + '%';
      if (video.currentTime >= end - 0.02 || video.ended || making.cancelled) return finish();
      requestAnimationFrame(frame);
    };
    const finish = () => {
      if (!making || making.done) return;
      making.done = true;
      video.pause();
      // Let the last frames through. The encoder can take a moment to get going (longer with transparency),
      // and a recorder stopped before it has delivered any pictures gives an empty file, so wait for real data.
      const stopAt = performance.now() + 8000;
      const settle = () => {
        if (making && making.cancelled) return rec.stop();
        if (bytes > 1024 && performance.now() - recStarted > 600) return setTimeout(() => rec.stop(), 300);
        if (performance.now() > stopAt) return rec.stop();
        try { rec.requestData(); } catch (e) {}
        setTimeout(settle, 250);
      };
      setTimeout(settle, 300);
    };
    rec.onstop = async () => {
      const cancelled = making.cancelled;
      making = null;
      if (audioSrc && audioDest) { try { audioSrc.disconnect(audioDest); } catch (e) {} }
      video.loop = true; speakers();
      busy(false);
      redraw();
      if (cancelled) return status('make-status', '', 'Cancelled.');
      let blob = new Blob(chunks, { type: kind.type.split(';')[0] });
      // A recorded WebM doesn't say how long it is, which breaks seeking and some apps: write the length in
      if (blob.size && kind.ext === 'webm' && window.ysFixWebmDuration) {
        try { blob = await window.ysFixWebmDuration(blob, Math.round((end - start) * 1000), { logger: false }); } catch (e) {}
      }
      if (!blob.size) return status('make-status', 'err', 'Something went wrong and the video came out empty. Please try again (a slightly longer clip can help).');
      const notes = [];
      let err = false;
      if (stencil && kind.ext !== 'mp4') notes.push('(WebM: this won’t play on iPhones; use Chrome or Edge on a computer for an MP4.)');
      // fewer than ~10 pictures a second: this computer couldn't keep up
      if ((end - start) > 1 && drawn < (end - start) * 10) { err = true; notes.push('This computer couldn’t keep up, so the video may look jerky. Try the Small size, or turn down the “Tidy the edges” sliders, and make it again.'); }
      if (!stencil) {
        status('make-status', '', 'Checking the transparency…');
        const kept = await hasAlpha(blob);
        if (kept === false) { err = true; notes.push('This browser didn’t keep the transparency in the file. Please make it in Chrome or Edge.'); }
      }
      deliver(blob, fileName + (stencil ? '.see-through.' : '.transparent.') + kind.ext, { err, text: notes.join(' ') });
    };
    making.finish = finish;
    try { await video.play(); } catch (e) { making.cancelled = true; finish(); return; }
    frame();
  }

  // Open the finished WebM and look for see-through pixels (true / false; null if this browser can't tell)
  function hasAlpha(blob) {
    return new Promise(res => {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      const url = URL.createObjectURL(blob);
      const done = r => { clearTimeout(timer); URL.revokeObjectURL(url); v.removeAttribute('src'); v.load(); res(r); };
      const timer = setTimeout(() => done(null), 8000);
      v.addEventListener('error', () => done(null), { once: true });
      v.addEventListener('loadeddata', () => {
        try {
          const k = canvas(Math.min(160, v.videoWidth || 160), Math.min(160, v.videoHeight || 90));
          const c = k.getContext('2d', { willReadFrequently: true });
          c.clearRect(0, 0, k.width, k.height);
          c.drawImage(v, 0, 0, k.width, k.height);
          const d = c.getImageData(0, 0, k.width, k.height).data;
          let low = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i] < 250) low++;
          done(low > 0);
        } catch (e) { done(null); }
      }, { once: true });
      v.src = url;
    });
  }

  // ---------------------------------------------------------------- GIFs (made picture by picture, so no frames are skipped)
  let gifLib = null;
  async function makeGif(start, end) {
    const [w, h] = gifSize();
    const fps = +$('gif-fps').value;
    making = { cancelled: false };
    busy(true);
    status('make-status', '', 'Making the GIF… keep this tab open.');
    try {
      gifLib = gifLib || await import(new URL('vendor/gifenc/gifenc.esm.js', document.baseURI).href);
    } catch (e) {
      making = null; busy(false);
      return status('make-status', 'err', 'The GIF maker couldn’t be loaded. Check that the vendor/gifenc folder was uploaded with this page.');
    }
    const { GIFEncoder, quantize, applyPalette } = gifLib;
    const out = canvas(w, h);
    const og = makeGL(out, true);
    if (plateOn) og.setPlate(plateC);
    const gl = og.gl;
    video.pause();
    const enc = GIFEncoder();
    const n = Math.max(1, Math.round((end - start) * fps));
    const px = new Uint8Array(w * h * 4), rgba = new Uint8Array(w * h * 4), row = w * 4;
    for (let i = 0; i < n; i++) {
      if (making.cancelled) break;
      await seekTo(Math.min(end - 0.001, start + i / fps));
      og.upload(); og.draw(3, 0, 0, w, h, true);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      // WebGL reads bottom row first: flip it. A GIF pixel is solid or see-through, nothing between, and every
      // see-through pixel must be exactly the same colour, so the palette has only one see-through entry.
      for (let y = 0; y < h; y++) {
        const src = (h - 1 - y) * row, dst = y * row;
        for (let x = 0; x < row; x += 4) {
          const s = src + x, d = dst + x;
          if (px[s + 3] < 128) { rgba[d] = rgba[d + 1] = rgba[d + 2] = rgba[d + 3] = 0; }
          else { rgba[d] = px[s]; rgba[d + 1] = px[s + 1]; rgba[d + 2] = px[s + 2]; rgba[d + 3] = 255; }
        }
      }
      const palette = quantize(rgba, 256, { format: 'rgba4444', oneBitAlpha: true });
      const index = applyPalette(rgba, palette, 'rgba4444');
      const ti = palette.findIndex(c => c[3] === 0);
      // dispose: 2 clears each picture before the next, or see-through parts would show the previous pictures
      enc.writeFrame(index, w, h, { palette, delay: 1000 / fps, transparent: ti >= 0, transparentIndex: Math.max(0, ti), dispose: 2 });
      $('bar').style.width = ((i + 1) / n * 100) + '%';
      await new Promise(r => setTimeout(r));        // let the page breathe
    }
    const cancelled = making.cancelled;
    making = null;
    video.loop = true;
    busy(false); redraw();
    if (cancelled) return status('make-status', '', 'Cancelled.');
    enc.finish();
    const blob = new Blob([enc.bytes()], { type: 'image/gif' });
    deliver(blob, fileName + '.gif', blob.size > 15 * 1048576
      ? { err: true, text: 'This GIF is big (' + sizeText(blob.size) + '), so it may be slow to load. Try a shorter clip, the Small size, or 10 pictures a second.' }
      : null);
  }
  $('cancel').addEventListener('click', () => { if (making && making.finish) { making.cancelled = true; making.finish(); } });
  setKey(key.rgb, false);
  listKeys(); hint(); layoutTimeline();
})();
