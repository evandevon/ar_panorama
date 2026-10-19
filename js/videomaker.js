/*
 * See-through Video Maker
 * Turns a green/blue-screen video (or a WebM that's already see-through) into a "stencil" MP4 for the tour tool:
 * twice as tall as the picture, with the picture (on black) on top and a black-and-white stencil underneath
 * (white = solid, black = see-through). Every phone plays an MP4; the tour tool uses the stencil to cut it out.
 * Everything runs in this browser: the video is never uploaded.
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const video = $('src');
  const view = $('view');
  let fileName = 'video', loaded = false, making = null;
  const key = { rgb: [0, 0.69, 0.25], picked: false };

  // ---------------------------------------------------------------- WebGL: one program, three jobs
  // uOut 0 = preview (over a background), 1 = the picture (premultiplied, on black), 2 = the stencil
  const VERT = 'attribute vec2 p; varying vec2 vUv; void main(){ vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }';
  const FRAG = [
    'precision mediump float;',
    'uniform sampler2D uVideo, uBg; uniform vec3 uKey; uniform float uSim, uSoft, uSpill; uniform int uOut, uAlpha, uCh;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec4 src = texture2D(uVideo, vUv);',
    '  vec3 rgb = src.rgb; float a; vec3 pm;',          // pm = the picture "on black" (premultiplied)
    '  if (uAlpha == 1) { a = src.a; pm = rgb * a; }',
    '  else {',
    // "Colour difference" keying: how much more screen-coloured (e.g. greener) this pixel is than its other
    // colours, compared with the screen itself. That measures blends (hair, soft edges, glows) accurately.
    '    float dd, kd;',
    '    if (uCh == 1) { dd = rgb.g - max(rgb.r, rgb.b); kd = uKey.g - max(uKey.r, uKey.b); }',
    '    else if (uCh == 2) { dd = rgb.b - max(rgb.r, rgb.g); kd = uKey.b - max(uKey.r, uKey.g); }',
    '    else { dd = rgb.r - max(rgb.g, rgb.b); kd = uKey.r - max(uKey.g, uKey.b); }',
    '    float al = clamp(1.0 - dd / max(kd, 0.05), 0.0, 1.0);',   // how solid it really is
    '    a = clamp((al - uSim) / max(uSoft, 0.01), 0.0, 1.0);',     // the sliders: remove more, and how soft the edge is
    // A partly see-through pixel is a mix of the subject and the screen behind it. Take the screen's share
    // back out ("unmixing"), so soft edges, glows and hair keep their own colour instead of turning grey or green.
    '    vec3 un = max(rgb - (1.0 - al) * uKey, 0.0) * (a / max(al, 0.001));',
    '    pm = mix(rgb * a, un, uSpill);',
    // Then a gentle "despill" for screen-coloured light bouncing onto solid edges: don't let the screen's
    // channel rise above the stronger of the other two (so yellows, oranges and skin tones are left alone).
    '    vec3 ds = pm;',
    '    if (uCh == 1) ds.g = min(pm.g, max(pm.r, pm.b));',
    '    else if (uCh == 2) ds.b = min(pm.b, max(pm.r, pm.g));',
    '    else ds.r = min(pm.r, max(pm.g, pm.b));',
    '    pm = mix(pm, ds, uSpill);',
    '  }',
    '  if (uOut == 1) gl_FragColor = vec4(pm, 1.0);',
    '  else if (uOut == 2) gl_FragColor = vec4(vec3(a), 1.0);',
    '  else gl_FragColor = vec4(texture2D(uBg, vUv).rgb * (1.0 - a) + pm, 1.0);',
    '}'
  ].join('\n');

  function makeGL(canvas) {
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false, alpha: false });
    if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
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
    const vTex = tex(), bTex = tex();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    const u = n => gl.getUniformLocation(prog, n);
    const U = { video: u('uVideo'), bg: u('uBg'), key: u('uKey'), sim: u('uSim'), soft: u('uSoft'), spill: u('uSpill'), out: u('uOut'), alpha: u('uAlpha'), ch: u('uCh') };
    gl.uniform1i(U.video, 0); gl.uniform1i(U.bg, 1);
    return {
      gl,
      setBackground(source) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source); },
      upload() { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, vTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video); },
      draw(out, x, y, w, h) {
        const p = params();
        gl.viewport(x, y, w, h);
        gl.uniform3fv(U.key, key.rgb); gl.uniform1f(U.sim, p.sim); gl.uniform1f(U.soft, p.soft); gl.uniform1f(U.spill, p.spill);
        gl.uniform1i(U.out, out); gl.uniform1i(U.alpha, p.alpha ? 1 : 0);
        const [r, g, b] = key.rgb;
        gl.uniform1i(U.ch, g >= r && g >= b ? 1 : b >= r ? 2 : 0);        // which colour the screen is
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    };
  }
  const pv = makeGL(view);
  if (!pv) { $('file-status').className = 'status err'; $('file-status').textContent = 'This browser can’t do the video work this page needs. Try Chrome or Edge.'; return; }

  // ---------------------------------------------------------------- settings
  function params() {
    return {
      alpha: document.querySelector('input[name=mode]:checked').value === 'alpha',
      sim: $('sim').value / 100 * 0.5,                   // below this "solidness", it's treated as screen
      soft: 0.15 + $('soft').value / 100 * 0.85,         // how wide the soft edge is
      spill: $('spill').value / 100
    };
  }
  ['sim', 'soft', 'spill'].forEach(id => {
    const show = () => { $(id + '-out').textContent = $(id).value; redraw(); };
    $(id).addEventListener('input', show); show();
  });
  document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', () => {
    const alpha = params().alpha;
    $('key-controls').hidden = alpha; $('alpha-note').hidden = !alpha;
    $('pick-hint').hidden = alpha;
    redraw();
  }));
  function setKey(rgb, picked) {
    key.rgb = rgb; key.picked = picked;
    const css = 'rgb(' + rgb.map(v => Math.round(v * 255)).join(',') + ')';
    $('swatch').style.background = css;
    const [r, g, b] = rgb;
    $('key-text').textContent = (g > r && g > b ? 'Green' : b > r && b > g ? 'Blue' : 'This colour') + (picked ? ' (picked)' : ' (guessed)') + '. Click the background again to change it.';
    redraw();
  }

  // ---------------------------------------------------------------- backgrounds for the preview
  const BG = {};
  function solid(c) { const k = document.createElement('canvas'); k.width = k.height = 2; const x = k.getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, 2, 2); return k; }
  BG.black = solid('#000'); BG.white = solid('#fff');
  BG.check = (() => { const k = document.createElement('canvas'); k.width = k.height = 512; const x = k.getContext('2d');
    for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) { x.fillStyle = (i + j) % 2 ? '#cfcfcf' : '#f2f2f2'; x.fillRect(i * 32, j * 32, 32, 32); } return k; })();
  BG.room = BG.check;
  const roomImg = new Image();
  roomImg.onload = () => {                       // the middle of the sample classroom photo, as a backdrop
    const k = document.createElement('canvas'); k.width = 1024; k.height = 768;
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
    if (/\.webm$/i.test(file.name)) { /* a WebM may already be see-through: let them choose */ }
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
    $('stage-empty').hidden = true;
    ['play', 'seek', 'make', 'auto-key'].forEach(id => { $(id).disabled = false; });
    $('t-start').value = 0; $('t-end').value = video.duration.toFixed(1);
    $('t-start').max = $('t-end').max = video.duration.toFixed(1);
    status('file-status', 'ok', w + ' × ' + h + ', ' + fmt(video.duration) + ' long.');
    video.currentTime = Math.min(0.5, video.duration / 2);
  });
  video.addEventListener('error', () => status('file-status', 'err', 'This video couldn’t be opened in this browser. Try Chrome or Edge, or save it as an MP4.'));
  video.addEventListener('seeked', () => { if (!key.picked && !params().alpha) autoKey(); redraw(); tick(); });
  video.addEventListener('loadeddata', redraw);

  // Guess the screen colour from the edges of the picture
  function sample(x, y, r) {
    const k = sample.k || (sample.k = document.createElement('canvas'));
    k.width = video.videoWidth; k.height = video.videoHeight;
    const c = k.getContext('2d', { willReadFrequently: true });
    c.drawImage(video, 0, 0);
    const d = c.getImageData(Math.max(0, x - r), Math.max(0, y - r), r * 2, r * 2).data;
    let s = [0, 0, 0], n = 0;
    for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; n++; }
    return s.map(v => v / n / 255);
  }
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
  view.addEventListener('click', e => {
    if (!loaded || params().alpha) return;
    const r = view.getBoundingClientRect();
    const x = Math.round((e.clientX - r.left) / r.width * video.videoWidth), y = Math.round((e.clientY - r.top) / r.height * video.videoHeight);
    setKey(sample(x, y, 3), true);
  });

  // ---------------------------------------------------------------- preview playback
  function redraw() {
    if (!loaded || video.readyState < 2 || making) return;
    pv.upload(); pv.draw(0, 0, 0, view.width, view.height);
  }
  function loop() {
    redraw(); tick();
    if (!video.paused && !making) requestAnimationFrame(loop);
  }
  $('play').addEventListener('click', () => {
    if (video.paused) { video.play().then(loop).catch(() => {}); } else video.pause();
  });
  video.addEventListener('play', () => { $('play').textContent = '❚❚ Pause'; });
  video.addEventListener('pause', () => { $('play').textContent = '▶ Play'; });
  video.loop = true;
  $('seek').addEventListener('input', e => { if (loaded) video.currentTime = e.target.value / 1000 * video.duration; });
  function tick() {
    if (!loaded) return;
    $('seek').value = Math.round(video.currentTime / video.duration * 1000);
    $('time').textContent = fmt(video.currentTime) + ' / ' + fmt(video.duration);
  }
  const fmt = t => { t = Math.max(0, t || 0); return Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0'); };
  function status(id, kind, text) { const e = $(id); e.className = 'status ' + (kind || ''); e.textContent = text; }

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
    const start = Math.max(0, +$('t-start').value || 0);
    const end = Math.min(video.duration, +$('t-end').value || video.duration);
    if (end - start < 0.2) return status('make-status', 'err', 'The end needs to be after the start.');
    const withSound = $('sound').checked;
    const kind = pickType(withSound);
    if (!kind) return status('make-status', 'err', 'This browser can’t make videos. Please use Chrome or Edge.');

    // Size: the chosen width (never bigger than the original), even numbers, stencil underneath
    let w = Math.min(+$('size').value, video.videoWidth);
    let h = w * video.videoHeight / video.videoWidth;
    if (h * 2 > 2160) { h = 1080; w = h * video.videoWidth / video.videoHeight; }
    w = Math.round(w / 2) * 2; h = Math.round(h / 2) * 2;
    const out = document.createElement('canvas'); out.width = w; out.height = h * 2;
    const og = makeGL(out);

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
    status('make-status', '', 'Making it… this takes as long as the clip (' + fmt(end - start) + '). Keep this tab open.');
    video.pause(); video.loop = false;
    if (Math.abs(video.currentTime - start) > 0.01) {
      const seeked = new Promise(r => video.addEventListener('seeked', r, { once: true }));
      video.currentTime = start;
      await seeked;
    }
    video.muted = !withSound;                     // the sound goes into the file, not the speakers
    rec.start(500);
    let lastT = -1;
    const frame = () => {
      if (!making) return;
      if (video.currentTime === lastT && !video.ended) { requestAnimationFrame(frame); return; }   // no new picture yet
      lastT = video.currentTime;
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
      setTimeout(() => rec.stop(), 150);            // let the last frames through
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
      a.textContent = '⬇ Download ' + name + ' (' + (blob.size / 1048576).toFixed(1) + ' MB)';
      $('path-eg').textContent = 'videos/' + name;
      $('result').hidden = false;
      status('make-status', 'ok', 'Done!' + (kind.ext === 'mp4' ? '' : ' (WebM: this won’t play on iPhones; use Chrome or Edge on a computer for an MP4.)'));
      redraw();
    };
    making.finish = finish;
    try { await video.play(); } catch (e) { making.cancelled = true; finish(); return; }
    frame();
  });
  $('cancel').addEventListener('click', () => { if (making && making.finish) { making.cancelled = true; making.finish(); } });
  setKey(key.rgb, false);
})();
