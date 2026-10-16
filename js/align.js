/*
 * "Line up with the room": the 360 photo is shown faded over the phone's live camera so the viewer
 * can turn it until it matches the real room. Used when the author ticks "Line up with the real room".
 *
 * How the automatic check works:
 *   The phone's motion sensors already know which way is up and how the phone is tilted, so only the
 *   left–right turn is unknown. A few times a second we take a tiny copy of the camera picture, build
 *   the same tiny view from the 360 photo at a range of turns (±30°), and compare their edges
 *   (outlines of doors, windows, ceiling lines…). Edges are compared rather than colours so lighting
 *   differences matter less. If one turn matches clearly better than the rest, we say how far off it is.
 *   Everything happens on the phone; no camera pictures are stored or sent anywhere.
 */
(function (global) {
  'use strict';

  const SEARCH = 30, STEP = 1.5;            // degrees either side, and how finely
  const GW = 48;                            // grid width; height follows the screen's shape
  const CAMERA_FOV = 64;                    // a typical phone camera, held upright, in vertical degrees

  function Aligner(opts) {
    // opts: { sceneEl, getLook(): look-controls, panoSource(): img/canvas, onDone(), onSkip(), hint(text) }
    const $ = id => document.getElementById(id);
    const THREE = AFRAME.THREE;
    let stream = null, timer = 0, pano = null, active = false, goodRuns = 0, lastBest = null, savedFov = 75;

    // ---------------------------------------------------------------- camera
    let cams = [], camIndex = -1, facing = 'environment', watchdog = 0;
    const UA = navigator.userAgent;
    const IOS = /iPad|iPhone|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const ANDROID = /Android/i.test(UA);
    const IN_APP = /FBAN|FBAV|Instagram|Snapchat|Line\/|MicroMessenger|TikTok|; wv\)/i.test(UA);

    async function begin() {
      active = true;
      $('align').hidden = false;
      $('spots').hidden = true;
      $('crosshair').hidden = true;
      document.body.classList.add('aligning');
      savedFov = opts.sceneEl.camera ? opts.sceneEl.camera.fov : 75;
      $('cam').setAttribute('camera', 'fov', CAMERA_FOV);
      startCamera();
    }

    async function startCamera() {
      hideHelp();
      stopCamera();
      setOpacity(1 - $('align-mix').value);          // slider: left = more photo ("Then"), right = more camera ("Now")
      $('align-ok').hidden = true;
      status('Starting the camera…', '');
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return showHelp('unsupported');

      const video = camIndex >= 0 && cams[camIndex]
        ? { deviceId: { exact: cams[camIndex].deviceId } }
        : { facingMode: { ideal: facing } };
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: Object.assign(video, { width: { ideal: 1280 }, height: { ideal: 720 } }), audio: false });
      } catch (e) {
        await listCameras();
        const n = e && e.name;
        if (n === 'NotAllowedError' || n === 'PermissionDeniedError' || n === 'SecurityError') return showHelp('blocked');
        if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError') return showHelp('missing');
        return showHelp('busy');                       // NotReadableError, TrackStartError, AbortError: usually another app has it
      }
      if (!active) return stopCamera();
      await listCameras();
      const v = $('camfeed');
      v.srcObject = stream;
      v.muted = true; v.playsInline = true;
      try { await v.play(); } catch (e) {}
      // A camera that "starts" but never shows a picture is usually held by another app
      clearTimeout(watchdog);
      watchdog = setTimeout(() => { if (active && stream && !v.videoWidth) showHelp('blank'); }, 4000);
      $('align-ok').hidden = false;
      $('align-switch').hidden = cams.length < 2;
      status('Turn until the photo and the room overlap, then slide left or right to line them up.', '');
      preparePano();
      clearInterval(timer);
      timer = setInterval(check, 400);
    }

    // Cameras get names only once one has been allowed; until then, switching flips front/back
    async function listCameras() {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        cams = all.filter(d => d.kind === 'videoinput');
        if (stream && camIndex < 0) {
          const id = stream.getVideoTracks()[0] && stream.getVideoTracks()[0].getSettings().deviceId;
          camIndex = cams.findIndex(c => c.deviceId === id);
        }
      } catch (e) { cams = []; }
    }
    function switchCamera() {
      // Step through the cameras by name when we know which one is on; otherwise flip front/back
      if (camIndex >= 0 && cams.length > 1 && cams.every(c => c.deviceId)) camIndex = (camIndex + 1) % cams.length;
      else { camIndex = -1; facing = facing === 'environment' ? 'user' : 'environment'; }
      startCamera();
    }

    const STEPS = {
      busy: ['Close the Camera app and any video calls (FaceTime, Zoom, Teams, Meet).',
             IOS ? 'Swipe up from the bottom of the screen and swipe those apps away.' : 'Open your recent apps and swipe them away.',
             'Close other browser tabs that might be using the camera, such as a QR scanner page.',
             'Come back here and tap Try again.'],
      blank: ['Close the Camera app and any video calls, then tap Try again.',
              'Or tap Switch camera to try a different one.'],
      blocked: IOS
        ? ['Tap ᴀA (or the page icon) beside the web address, then Website Settings.', 'Set Camera to Allow, then tap Try again.',
           'If there’s no setting there: open Settings → Safari (on newer iPhones, Settings → Apps → Safari) → Camera → Allow.']
        : ANDROID
        ? ['Tap the icon to the left of the web address, then Permissions (or Site settings).', 'Turn Camera on, then tap Try again.',
           'If Chrome itself can’t use the camera: Settings app → Apps → Chrome → Permissions → Camera → Allow.']
        : ['Click the camera or padlock icon in the address bar and allow the camera.', 'Then click Try again.'],
      missing: ['Tap Switch camera to try a different one.', 'Close the Camera app and any video calls, then tap Try again.'],
      unsupported: IN_APP
        ? ['You’re probably in a QR scanner’s or social app’s own browser, which can’t use the camera.',
           'Tap Copy link, then paste it into ' + (IOS ? 'Safari' : 'Chrome') + '. Or use the ⋯ menu → Open in browser.']
        : ['Open this page in ' + (IOS ? 'Safari' : 'Chrome') + ' instead.', 'Pages must start with https:// to use the camera.']
    };
    const TITLES = {
      busy: 'The camera is being used by another app',
      blank: 'The camera isn’t showing a picture',
      blocked: 'The camera isn’t allowed',
      missing: 'No camera found',
      unsupported: 'This browser can’t use the camera'
    };
    const TEXTS = {
      busy: 'Only one app can use the camera at a time.',
      blank: 'It may be busy in another app, or this camera may not work here.',
      blocked: 'This page needs your camera to line the photo up with the room. Nothing is recorded or sent anywhere.',
      missing: 'This device may not have a camera, or another one may work better.',
      unsupported: 'Lining up needs the camera.'
    };
    function showHelp(kind) {
      clearInterval(timer); clearTimeout(watchdog);
      if (kind !== 'blank') stopCamera();
      setOpacity(1);
      status('', '');
      $('align-status').hidden = true;
      $('cam-help-title').textContent = TITLES[kind];
      $('cam-help-text').textContent = TEXTS[kind];
      $('cam-help-steps').innerHTML = '';
      STEPS[kind].forEach(t => { const li = document.createElement('li'); li.textContent = t; $('cam-help-steps').appendChild(li); });
      $('cam-retry').hidden = kind === 'unsupported';
      $('cam-switch').hidden = !['missing', 'blank', 'busy'].includes(kind);
      $('cam-copy').hidden = kind !== 'unsupported';
      document.getElementById('align').classList.add('cam-problem');
      $('cam-help').hidden = false;
      ($('cam-retry').hidden ? $('cam-skip') : $('cam-retry')).focus();
    }
    function hideHelp() {
      $('cam-help').hidden = true;
      $('align-status').hidden = false;
      document.getElementById('align').classList.remove('cam-problem');
    }

    function stopCamera() {
      clearInterval(timer); clearTimeout(watchdog);
      if (stream) stream.getTracks().forEach(t => t.stop());
      stream = null;
      $('camfeed').srcObject = null;
    }

    function finish(cb) {
      active = false;
      stopCamera();
      $('align').hidden = true;
      $('spots').hidden = false;
      $('crosshair').hidden = false;
      document.body.classList.remove('aligning');
      setOpacity(1);
      $('cam').setAttribute('camera', 'fov', savedFov || 75);
      cb();
    }

    function setOpacity(v) { opts.sceneEl.canvas.style.opacity = String(v); }
    function status(text, kind) {
      const el = $('align-status');
      el.textContent = text;
      el.className = 'align-status' + (kind ? ' ' + kind : '');
    }

    // ---------------------------------------------------------------- automatic check
    // A small greyscale copy of the 360 photo to sample from
    function preparePano() {
      const src = opts.panoSource();
      if (!src) return;
      const c = document.createElement('canvas');
      c.width = 512; c.height = 256;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(src, 0, 0, 512, 256);
      const d = ctx.getImageData(0, 0, 512, 256).data;
      const g = new Float32Array(512 * 256);
      for (let i = 0; i < g.length; i++) g[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
      pano = g;
    }

    const work = document.createElement('canvas');
    const wctx = work.getContext('2d', { willReadFrequently: true });

    function edges(gray, w, h) {
      // Sobel edge strength, as one long list
      const out = new Float32Array((w - 2) * (h - 2));
      let k = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          const gx = gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1];
          const gy = gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1];
          out[k++] = Math.sqrt(gx * gx + gy * gy);
        }
      }
      return out;
    }
    function similarity(a, b) {            // normalised cross-correlation, −1…1
      let ma = 0, mb = 0;
      for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; }
      ma /= a.length; mb /= b.length;
      let num = 0, da = 0, db = 0;
      for (let i = 0; i < a.length; i++) {
        const x = a[i] - ma, y = b[i] - mb;
        num += x * y; da += x * x; db += y * y;
      }
      return da && db ? num / Math.sqrt(da * db) : 0;
    }

    function check() {
      const v = $('camfeed');
      const camera = opts.sceneEl.camera;
      if (!active || !pano || !camera || v.readyState < 2 || !v.videoWidth) return;

      const sw = opts.sceneEl.canvas.clientWidth, sh = opts.sceneEl.canvas.clientHeight;
      const GH = Math.max(24, Math.min(110, Math.round(GW * sh / sw)));

      // 1. The camera picture, cropped the same way the screen shows it (object-fit: cover)
      const vw = v.videoWidth, vh = v.videoHeight;
      const scale = Math.max(sw / vw, sh / vh);
      const cw = sw / scale, ch = sh / scale;
      work.width = GW; work.height = GH;
      wctx.drawImage(v, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, GW, GH);
      const cd = wctx.getImageData(0, 0, GW, GH).data;
      const camGray = new Float32Array(GW * GH);
      for (let i = 0; i < camGray.length; i++) camGray[i] = cd[i * 4] * 0.299 + cd[i * 4 + 1] * 0.587 + cd[i * 4 + 2] * 0.114;
      const camEdges = edges(camGray, GW, GH);

      // 2. Where each grid point looks in the 360 photo right now
      camera.updateMatrixWorld(true);
      const origin = new THREE.Vector3(); camera.getWorldPosition(origin);
      const p = new THREE.Vector3();
      const us = new Float32Array(GW * GH), vs = new Float32Array(GW * GH);
      for (let j = 0; j < GH; j++) {
        for (let i = 0; i < GW; i++) {
          p.set((i + 0.5) / GW * 2 - 1, 1 - (j + 0.5) / GH * 2, 0.5).unproject(camera).sub(origin).normalize();
          const yaw = Math.atan2(-p.x, -p.z), pitch = Math.asin(Math.max(-1, Math.min(1, p.y)));
          us[j * GW + i] = 0.5 - yaw / (2 * Math.PI);        // matches how the sky is turned (rotation −90°)
          vs[j * GW + i] = 0.5 - pitch / Math.PI;
        }
      }

      // 3. Try a range of turns and see which matches the camera best
      const synth = new Float32Array(GW * GH);
      const scores = [];
      let best = -2, bestOff = 0;
      for (let off = -SEARCH; off <= SEARCH + 1e-6; off += STEP) {
        const du = off / 360;
        for (let k = 0; k < synth.length; k++) {
          let u = us[k] + du; u -= Math.floor(u);
          const x = Math.min(511, (u * 512) | 0), y = Math.min(255, Math.max(0, (vs[k] * 256) | 0));
          synth[k] = pano[y * 512 + x];
        }
        const s = similarity(camEdges, edges(synth, GW, GH));
        scores.push(s);
        if (s > best) { best = s; bestOff = off; }
      }
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const confident = best > 0.25 && best - mean > 0.1;

      if (!confident) {
        goodRuns = 0; lastBest = null;
        $('align-snap').hidden = true;
        status('Turn until the photo and the room overlap, then slide left or right to line them up.', '');
        return;
      }
      lastBest = bestOff;
      if (Math.abs(bestOff) <= 3) {
        goodRuns++;
        $('align-snap').hidden = true;
        if (goodRuns >= 2) status('✓ Looks lined up — tap “Lined up”.', 'good');
      } else {
        goodRuns = 0;
        $('align-snap').hidden = false;
        status('Nearly — about ' + Math.round(Math.abs(bestOff)) + '° out. Slide ' + (bestOff > 0 ? 'left' : 'right') + ', or tap Snap.', 'near');
      }
    }

    // Turn the view by the amount the check found. A match at +n° means the camera is really
    // facing n° further right in the photo than the view shows (sliding left turns the view right).
    function snap() {
      if (lastBest == null) return;
      const lc = opts.getLook();
      lc.yawObject.rotation.y -= lastBest * Math.PI / 180;
      lastBest = null;
      $('align-snap').hidden = true;
      status('Checking…', '');
    }

    $('align-mix').addEventListener('input', e => setOpacity(1 - e.target.value));
    $('align-snap').addEventListener('click', snap);
    $('align-ok').addEventListener('click', () => finish(opts.onDone));
    $('align-skip').addEventListener('click', () => finish(opts.onSkip));
    $('cam-skip').addEventListener('click', () => { hideHelp(); finish(opts.onSkip); });
    $('cam-retry').addEventListener('click', () => startCamera());
    $('cam-switch').addEventListener('click', switchCamera);
    $('align-switch').addEventListener('click', switchCamera);
    $('cam-copy').addEventListener('click', () => {
      const done = () => { $('cam-copy').textContent = 'Link copied ✓'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(location.href).then(done, () => prompt('Copy this link:', location.href));
      else prompt('Copy this link:', location.href);
    });

    return { begin, get active() { return active; } };
  }

  global.Aligner = Aligner;
})(window);
