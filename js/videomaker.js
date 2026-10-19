/*
 * See-through Video Maker
 * Turns a green/blue-screen video (or a WebM that's already see-through) into a "stencil" MP4 for the tour tool:
 * twice as tall as the picture, with the picture (on black) on top and a black-and-white stencil underneath
 * (white = solid, black = see-through). Every phone plays an MP4; the tour tool uses the stencil to cut it out.
 * Everything runs in this browser: the video is never uploaded.
 *
 * For rough, home-made green screens there are also:
 *  - shapes drawn on the preview: "Keep only inside" (crop around the person), "Always remove", "Always keep"
 *  - extra background colours (shadows, creases, patchy light) and an "empty background" moment (clean plate)
 *  - edge tidying: shrink the edges, remove specks, fill small holes
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const video = $('src');
  const view = $('view');
  const overlay = $('overlay');
  let fileName = 'video', loaded = false, making = null;
  const key = { rgb: [0, 0.69, 0.25], picked: false };
  const extraKeys = [];                      // more background colours, for patchy screens (up to 4)
  const MAX_KEYS = 4;
  const shapes = [];                         // { kind: 'keep'|'remove'|'solid', pts: [[x,y] 0..1 in the video] }
  const trim = { start: 0, end: 0 };
  let plateOn = false, plateTime = 0;

  // ---------------------------------------------------------------- WebGL: one program, three jobs
  // uOut 0 = preview (over a background), 1 = the picture (premultiplied, on black), 2 = the stencil
  const VERT = 'attribute vec2 p; varying vec2 vUv; void main(){ vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }';
  const FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'uniform sampler2D uVideo, uBg, uMask, uPlate;',
    'uniform vec3 uKey; uniform vec3 uKeys[4]; uniform int uNKeys, uPlateOn;',
    'uniform float uSim, uSoft, uSpill, uChoke, uSpeck, uHole, uFeather; uniform vec2 uPx;',
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
    // Against every background colour we know (the main one, the extras, and the empty background at this
    // very spot): whichever says "more screen" wins. al = the true solidity; the return value has the sliders applied.
    'float keyAt(vec2 uv, out float al, out vec3 k) {',
    '  float dd = diff(texture2D(uVideo, uv).rgb);',
    '  k = uKey; al = solidity(dd, uKey);',
    '  for (int i = 0; i < 4; i++) {',
    '    if (i < uNKeys) { float s = solidity(dd, uKeys[i]); if (s < al) { al = s; k = uKeys[i]; } }',
    '  }',
    '  if (uPlateOn == 1) {',
    '    vec3 pl = texture2D(uPlate, uv).rgb;',
    '    if (diff(pl) > 0.04) { float s = solidity(dd, pl); if (s < al) { al = s; k = pl; } }',
    '  }',
    '  return clamp((al - uSim) / max(min(uSoft, 1.0 - uSim), 0.01), 0.0, 1.0);',
    '}',
    'float keyA(vec2 uv) { float al; vec3 k; return keyAt(uv, al, k); }',
    'vec3 despill(vec3 c) {',
    '  if (uCh == 1) c.g = min(c.g, max(c.r, c.b));',
    '  else if (uCh == 2) c.b = min(c.b, max(c.r, c.g));',
    '  else c.r = min(c.r, max(c.g, c.b));',
    '  return c;',
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
    '    vec3 un = max(rgb - (1.0 - al) * k, 0.0) * (aU / max(al, 0.001));',
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
    '  else gl_FragColor = vec4(texture2D(uBg, vUv).rgb * (1.0 - a) + pm, 1.0);',
    '}'
  ].join('\n');

  function makeGL(canvas) {
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false, alpha: false });
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
    ['uVideo', 'uBg', 'uMask', 'uPlate', 'uKey', 'uKeys', 'uNKeys', 'uPlateOn', 'uSim', 'uSoft', 'uSpill', 'uFeather', 'uChoke', 'uSpeck', 'uHole', 'uPx', 'uOut', 'uAlpha', 'uCh']
      .forEach(n => { U[n] = u(n); });
    gl.uniform1i(U.uVideo, 0); gl.uniform1i(U.uBg, 1); gl.uniform1i(U.uMask, 2); gl.uniform1i(U.uPlate, 3);
    const put = (unit, t, source) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source); };
    const ctx = {
      gl,
      setBackground(source) { put(1, bTex, source); },
      setMask(source) { put(2, mTex, source); },
      setPlate(source) { put(3, pTex, source); },
      upload() { put(0, vTex, video); },
      draw(out, x, y, w, h) {
        const p = params();
        gl.viewport(x, y, w, h);
        gl.uniform3fv(U.uKey, key.rgb);
        const ks = new Float32Array(12);
        extraKeys.forEach((k, i) => ks.set(k, i * 3));
        gl.uniform3fv(U.uKeys, ks); gl.uniform1i(U.uNKeys, extraKeys.length);
        gl.uniform1i(U.uPlateOn, plateOn ? 1 : 0);
        gl.uniform1f(U.uSim, p.sim); gl.uniform1f(U.uSoft, p.soft); gl.uniform1f(U.uSpill, p.spill);
        // the edge tools are set in "pixels of a 720p video", so they act the same at any size
        const s = (video.videoHeight || 720) / 720;
        gl.uniform1f(U.uFeather, p.feather * s); gl.uniform1f(U.uChoke, p.choke * s); gl.uniform1f(U.uSpeck, p.speck * s); gl.uniform1f(U.uHole, p.hole * s);
        gl.uniform2f(U.uPx, 1 / (video.videoWidth || 1), 1 / (video.videoHeight || 1));
        gl.uniform1i(U.uOut, out); gl.uniform1i(U.uAlpha, p.alpha ? 1 : 0);
        const [r, g, b] = key.rgb;
        gl.uniform1i(U.uCh, g >= r && g >= b ? 1 : b >= r ? 2 : 0);        // which colour the screen is
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
      soft: 0.5,                                         // how gradually blends (hair, glows) fade
      feather: $('soft').value / 100 * 16,               // soften the edges: blur width, in pixels of a 720p video
      spill: $('spill').value / 100,
      choke: +$('choke').value,
      speck: +$('speck').value * 4,
      hole: +$('hole').value * 4
    };
  }
  ['sim', 'soft', 'spill', 'choke', 'speck', 'hole'].forEach(id => {
    const show = () => { $(id + '-out').textContent = $(id).value; redraw(); };
    $(id).addEventListener('input', show); show();
  });
  document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', () => {
    const alpha = params().alpha;
    $('key-controls').hidden = alpha; $('alpha-note').hidden = !alpha;
    $('key-fix').hidden = alpha;
    if (alpha && tool === 'addkey') setTool(null);
    hint();
    redraw();
  }));
  const rgbCss = rgb => 'rgb(' + rgb.map(v => Math.round(v * 255)).join(',') + ')';
  function setKey(rgb, picked) {
    key.rgb = rgb; key.picked = picked;
    $('swatch').style.background = rgbCss(rgb);
    const [r, g, b] = rgb;
    $('key-text').textContent = (g > r && g > b ? 'Green' : b > r && b > g ? 'Blue' : 'This colour') + (picked ? ' (picked)' : ' (guessed)') + '. Click the background again to change it.';
    redraw();
  }

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

  video.addEventListener('loadedmetadata', () => {
    const w = video.videoWidth, h = video.videoHeight;
    if (!w) return status('file-status', 'err', 'This video couldn’t be read. Try saving it as an MP4.');
    loaded = true;
    view.width = Math.min(w, 1280); view.height = Math.round(view.width * h / w);
    overlay.width = view.width; overlay.height = view.height;
    maskC.width = Math.min(w, 1024); maskC.height = Math.round(maskC.width * h / w);
    // a new video: start again with its shapes, extra colours and empty background
    shapes.length = 0; extraKeys.length = 0; plateOn = false; setTool(null);
    listShapes(); listKeys(); showPlate(); buildMask();
    $('stage-empty').hidden = true;
    ['play', 'make', 'auto-key', 'add-key', 'plate'].forEach(id => { $(id).disabled = false; });
    document.querySelectorAll('.tool').forEach(b => { b.disabled = false; });
    trim.start = 0; trim.end = video.duration;
    timelineOn(true); layoutTimeline();
    status('file-status', 'ok', w + ' × ' + h + ', ' + fmt(video.duration) + ' long.');
    video.currentTime = Math.min(0.5, video.duration / 2);
  });
  video.addEventListener('error', () => status('file-status', 'err', 'This video couldn’t be opened in this browser. Try Chrome or Edge, or save it as an MP4.'));
  video.addEventListener('seeked', () => { if (!key.picked && !params().alpha) autoKey(); redraw(); tick(); });
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
  // Guess the screen colour from the edges of the picture
  function autoKey() {
    if (!loaded) return;
    const w = video.videoWidth, h = video.videoHeight, r = Math.max(4, Math.round(Math.min(w, h) * 0.02));
    const spots = [[r, r], [w - r, r], [r, h * 0.5], [w - r, h * 0.5], [w * 0.5, r]].map(([x, y]) => sample(Math.round(x), Math.round(y), r));
    // the most "screen-like" (saturated green or blue) of the samples
    const score = c => Math.max(c[1] - Math.max(c[0], c[2]), c[2] - Math.max(c[0], c[1]));
    spots.sort((a, b) => score(b) - score(a));
    setKey(spots[0], false);
  }
  $('auto-key').addEventListener('click', () => { key.picked = false; autoKey(); });

  // ---------------------------------------------------------------- clicking on the preview
  // No tool: pick the colour to remove. A shape tool: add dots. "Add colour": pick an extra colour.
  // Dragging a dot of a finished shape moves it, whatever tool is chosen.
  let tool = null, draft = [], hover = null, drag = null;
  const KIND = {
    keep: { label: 'Keep only inside', line: '#ffd23f', fill: 'rgba(255,210,63,.12)' },
    remove: { label: 'Always remove', line: '#ff5a5a', fill: 'rgba(255,90,90,.28)' },
    solid: { label: 'Always keep', line: '#3fd7ff', fill: 'rgba(63,215,255,.28)' }
  };
  function hint() {
    const h = $('pick-hint');
    const alpha = params().alpha;
    h.hidden = false;
    if (tool === 'addkey') h.textContent = 'click a patch of background that is still showing';
    else if (tool) h.textContent = draft.length >= 3 ? 'keep clicking around the area, then click the first dot to finish' : 'click around the area, dot by dot';
    else if (alpha) h.hidden = true;
    else h.textContent = 'click the background in the picture to choose the colour to remove';
    $('stage').classList.toggle('drawing', !!tool);
  }
  function setTool(t) {
    tool = t; draft = []; hover = null;
    document.querySelectorAll('.tool').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
    $('add-key').setAttribute('aria-pressed', String(t === 'addkey'));
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
    listShapes(); buildMask();
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
    if (tool === 'addkey') {
      addKey(sample(Math.round(p[0] * video.videoWidth), Math.round(p[1] * video.videoHeight), 3));
      setTool(null);
      return;
    }
    if (tool) { draft.push(p); updateDrawBar(); hint(); drawOverlay(); return; }
    if (!params().alpha) setKey(sample(Math.round(p[0] * video.videoWidth), Math.round(p[1] * video.videoHeight), 3), true);
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
  const endDrag = () => { if (drag) { drag = null; buildMask(); } };
  view.addEventListener('pointerup', endDrag);
  view.addEventListener('pointercancel', endDrag);
  view.addEventListener('pointerleave', () => { if (hover) { hover = null; drawOverlay(); } });

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
  }
  window.addEventListener('resize', drawOverlay);

  function listShapes() {
    const ul = $('shape-list');
    ul.innerHTML = '';
    shapes.forEach((s, i) => {
      const li = document.createElement('li');
      const mark = document.createElement('span'); mark.className = 'shape-mark ' + s.kind; mark.setAttribute('aria-hidden', 'true');
      const txt = document.createElement('span'); txt.textContent = KIND[s.kind].label + ' (' + s.pts.length + ' dots)';
      const del = document.createElement('button'); del.type = 'button'; del.className = 'btn small ghost'; del.textContent = 'Delete';
      del.setAttribute('aria-label', 'Delete shape ' + (i + 1) + ': ' + KIND[s.kind].label);
      del.addEventListener('click', () => { shapes.splice(i, 1); listShapes(); buildMask(); status('shape-status', '', 'Shape deleted.'); });
      li.append(mark, txt, del); ul.append(li);
    });
    $('shapes-clear').hidden = shapes.length < 2;
    drawOverlay();
  }
  $('shapes-clear').addEventListener('click', () => { shapes.length = 0; listShapes(); buildMask(); status('shape-status', '', 'All shapes removed.'); });
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
    extraKeys.push(rgb); listKeys(); redraw();
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
      del.addEventListener('click', () => { extraKeys.splice(i, 1); listKeys(); redraw(); status('key-status', '', 'Colour deleted.'); });
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
    plateOn = true; plateTime = video.currentTime;
    showPlate(); redraw();
  });
  $('plate-clear').addEventListener('click', () => { plateOn = false; showPlate(); redraw(); });
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
      video.play().then(loop).catch(() => {});
    } else video.pause();
  });
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
  const tlEnd = () => { tlDrag = null; };
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
  }));

  // ---------------------------------------------------------------- making the file
  // MP4 (H.264) plays on every phone. Chrome/Edge (Windows, Mac) and Safari can record it; Firefox can't.
  function pickType(withSound) {
    const mp4 = ['avc1.640028', 'avc1.4d002a', 'avc1.42E01E', 'avc1'];
    const list = [];
    mp4.forEach(c => { if (withSound) list.push('video/mp4;codecs=' + c + ',mp4a.40.2'); list.push('video/mp4;codecs=' + c); });
    for (const t of list) if (MediaRecorder.isTypeSupported(t)) return { type: t, ext: 'mp4' };
    for (const t of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9', 'video/webm']) if (MediaRecorder.isTypeSupported(t)) return { type: t, ext: 'webm' };
    return null;
  }
  if (typeof MediaRecorder === 'undefined' || !pickType(false)) {
    $('browser-warn').hidden = false;
    $('browser-warn').textContent = 'This browser can’t make videos. Please use Chrome or Edge on a Windows or Mac computer.';
  } else if (pickType(false).ext !== 'mp4') {
    $('browser-warn').hidden = false;
    $('browser-warn').textContent = 'This browser can only make WebM videos, which won’t play on iPhones. For a video that works on every phone, use Chrome or Edge on a Windows or Mac computer.';
  }

  let audioCtx = null, audioSrc = null, audioDest = null;
  $('make').addEventListener('click', async () => {
    if (!loaded || making) return;
    if (tool) setTool(null);
    const start = Math.max(0, trim.start);
    const end = Math.min(video.duration, trim.end);
    if (end - start < MIN_CLIP) return status('make-status', 'err', 'The clip is too short: drag the trim dots further apart.');
    const withSound = $('sound').checked;
    const kind = pickType(withSound);
    if (!kind) return status('make-status', 'err', 'This browser can’t make videos. Please use Chrome or Edge.');

    // Size: the chosen width (never bigger than the original), even numbers, stencil underneath
    let w = Math.min(+$('size').value, video.videoWidth);
    let h = w * video.videoHeight / video.videoWidth;
    if (h * 2 > 2160) { h = 1080; w = h * video.videoWidth / video.videoHeight; }
    w = Math.round(w / 2) * 2; h = Math.round(h / 2) * 2;
    const out = canvas(w, h * 2);
    const og = makeGL(out);
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
    const rec = new MediaRecorder(stream, { mimeType: kind.type, videoBitsPerSecond: Math.round(Math.min(12e6, Math.max(2.5e6, w * h * 2 * 30 * 0.12))) });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };

    making = { cancelled: false };
    $('make').disabled = true; $('cancel').hidden = false; $('progress').hidden = false; $('result').hidden = true;
    status('make-status', '', 'Making it… this takes as long as the clip (' + fmt(end - start, true) + '). Keep this tab open.');
    video.pause(); video.loop = false;
    if (Math.abs(video.currentTime - start) > 0.01) {
      const seeked = new Promise(r => video.addEventListener('seeked', r, { once: true }));
      video.currentTime = start;
      await seeked;
    }
    video.muted = !withSound;                     // the sound goes into the file, not the speakers
    rec.start(500);
    const recStarted = performance.now();
    let lastT = -1, drawn = 0;
    const frame = () => {
      if (!making) return;
      if (video.currentTime === lastT && !video.ended) { requestAnimationFrame(frame); return; }   // no new picture yet
      lastT = video.currentTime; drawn++;
      og.upload();
      og.draw(1, 0, h, w, h);                      // top: the picture, on black
      og.draw(2, 0, 0, w, h);                      // bottom: the stencil
      if (manual) track.requestFrame();
      $('bar').style.width = Math.min(100, (video.currentTime - start) / (end - start) * 100) + '%';
      if (video.currentTime >= end - 0.02 || video.ended || making.cancelled) return finish();
      requestAnimationFrame(frame);
    };
    const finish = () => {
      if (!making || making.done) return;
      making.done = true;
      video.pause();
      // let the last frames through; a recorder that's stopped too soon after starting gives an empty file
      setTimeout(() => rec.stop(), Math.max(300, 1500 - (performance.now() - recStarted)));
    };
    rec.onstop = () => {
      const cancelled = making.cancelled;
      making = null;
      if (audioSrc && audioDest) { try { audioSrc.disconnect(audioDest); } catch (e) {} }
      video.muted = true; video.loop = true;
      $('make').disabled = false; $('cancel').hidden = true; $('progress').hidden = true; $('bar').style.width = '0';
      if (cancelled) return status('make-status', '', 'Cancelled.');
      const blob = new Blob(chunks, { type: kind.type.split(';')[0] });
      const name = fileName + '.see-through.' + kind.ext;
      const a = $('download');
      if (a.href) URL.revokeObjectURL(a.href);
      a.href = URL.createObjectURL(blob); a.download = name;
      a.textContent = '⬇ Download ' + name + ' (' + (blob.size < 1048576 ? Math.max(1, Math.round(blob.size / 1024)) + ' KB' : (blob.size / 1048576).toFixed(1) + ' MB') + ')';
      $('path-eg').textContent = 'videos/' + name;
      $('result').hidden = false;
      if (!blob.size) { $('result').hidden = true; return status('make-status', 'err', 'Something went wrong and the video came out empty. Please try again (a slightly longer clip can help).'); }
      // fewer than ~10 pictures a second: this computer couldn't keep up
      const jerky = (end - start) > 1 && drawn < (end - start) * 10;
      status('make-status', jerky ? 'err' : 'ok', 'Done!' + (kind.ext === 'mp4' ? '' : ' (WebM: this won’t play on iPhones; use Chrome or Edge on a computer for an MP4.)')
        + (jerky ? ' This computer couldn’t keep up, so the video may look jerky. Try the Small size, or turn down the “Tidy the edges” sliders, and make it again.' : ''));
      redraw();
    };
    making.finish = finish;
    try { await video.play(); } catch (e) { making.cancelled = true; finish(); return; }
    frame();
  });
  $('cancel').addEventListener('click', () => { if (making && making.finish) { making.cancelled = true; making.finish(); } });
  setKey(key.rgb, false);
  listKeys(); hint(); layoutTimeline();
})();
