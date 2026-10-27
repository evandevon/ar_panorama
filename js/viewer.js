/*
 * FILE GUIDE: js/viewer.js  ·  the 360 viewer page (index.html): what students see, and the author's live preview
 * Loaded by: index.html. Depends on: A-Frame, js/sources.js, js/spots.js (HotSpots), js/align.js (Aligner),
 *   js/layers.js (FrontLayer = masks).
 * Page address: p (photo or 360 video), t (title), y (start direction), al=1 (offer "line up with the room"),
 *   mb (3D model brightness), s (one per spot, see spots.js), f (one per mask, see layers.js), v=2 (format version),
 *   preview=1 (inside the tour maker: no start card, editable spots), p2 / y2 / n1 / n2 (compare photospheres: a second
 *   photo, its turn, and the two photos' names).
 * In preview mode it talks to make.html with postMessage: tell({type:...}) out; window 'message' handler in.
 *   In: setYaw setSpots setCompare lookAt pinSpot selectSpot hoverSpot nudge setLayers setWindow setBrightness stopAll.
 *   Out: status compare view spotEdit spotSelect spotError layerPoint layerClose layerMove audio.
 * Sections (search for "// ---- <name>"): talking to the author page · start card · loading the panorama · sound ·
 *   looking around: drag · the author's preview: a phone-sized window · looking around: phone motion · entering ·
 *   lining up with the real room · video spots · compare photospheres · boot
 * Gotchas: phones only allow motion sensors and sound after a tap (enter() runs inside the tap).
 *   "Phone window" mode: the preview iframe is bigger than the phone; win/winFov make spot sizes and drag speed
 *   match a real phone, and .win-shade panels outside the window only turn the view.
 */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  // Toolbar icons (drawn, so they look the same on every phone, unlike emoji)
  const SVG = d => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + d + '</svg>';
  const ICON = {
    play: SVG('<path d="M7 4v16l13-8z"/>'),
    pause: SVG('<path d="M8 4v16M16 4v16"/>'),
    soundOn: SVG('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>'),
    soundOff: SVG('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>'),
    lineUp: SVG('<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>')
  };
  // Every toolbar button keeps a spoken name, even when its words are hidden on small screens
  function setButton(b, icon, label) {
    b.querySelector('.ico').innerHTML = ICON[icon];
    b.querySelector('.lbl').textContent = label;
    b.setAttribute('aria-label', label);
  }
  const sceneEl = $('scene'), sky = $('sky'), vsphere = $('vsphere'), rig = $('rig'), cam = $('cam');
  const params = new URLSearchParams(location.search);
  const PREVIEW = params.get('preview') === '1';
  // Shown inside another website (an <iframe>), rather than in its own tab
  const EMBEDDED = !PREVIEW && (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const cfg = {
    pano: params.get('p') || '',
    audio: params.get('a') || '',
    title: params.get('t') || 'Look around',
    yaw: Number(params.get('y')) || 0,
    loop: params.get('l') === '1',
    align: params.get('al') === '1',         // offer "line up with this room" (camera overlay)
    bright: Number(params.get('mb')) || 1     // brightness of 3D models (1 = normal)
  };

  let mode = 'drag';             // 'drag' or 'motion'
  let lc = null;                 // A-Frame look-controls component
  let video = null;              // <video> when the panorama is a 360 video

  // ------------------------------------------------------------- talking to the author page
  function tell(msg) {
    if (PREVIEW && window.parent !== window) window.parent.postMessage(Object.assign({ from: 'viewer360' }, msg), location.origin);
  }

  // ------------------------------------------------------------- start card
  function showError(html, plain) {
    const e = $('error');
    e.innerHTML = html;
    e.hidden = false;
    $('choices').hidden = true;
    $('loading').hidden = true;
    $('start').hidden = false;
    $('start').classList.remove('gone');
    tell({ type: 'status', state: 'error', message: plain || e.textContent });
  }
  // The loading line: f = 0..1 (null when the host didn't say how big the file is); got/total in bytes
  const mb = n => n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';
  function setProgress(f, got, total) {
    const bar = document.querySelector('.progress'), box = $('loading');
    bar.classList.toggle('unknown', f == null);
    if (f == null) {
      $('load-size').textContent = got ? mb(got) : '';
      box.removeAttribute('aria-valuenow');
      return;
    }
    const pct = Math.round(Math.max(0, Math.min(1, f)) * 100);
    bar.style.setProperty('--p', pct + '%');
    $('bar-pct').textContent = pct + '%';
    box.setAttribute('aria-valuenow', pct);
    $('load-size').textContent = total ? mb(got) + ' of ' + mb(total) : '';
    if (pct >= 100) $('load-what').textContent = 'Getting it ready…';
  }

  let hintTimer = 0;
  function hint(text, ms) {
    const h = $('hint');
    h.textContent = text; h.hidden = false; h.classList.remove('fade');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => h.classList.add('fade'), ms || 3500);
  }

  // ------------------------------------------------------------- loading the panorama
  function sceneReady() {
    return new Promise(res => (sceneEl.hasLoaded ? res() : sceneEl.addEventListener('loaded', res, { once: true })));
  }

  async function loadImage(token) {
    const { url, provider } = Media.resolveMediaUrl(token, 'image');
    const fail = why => {
      showError('Couldn’t load the 360 photo (' + why + ').<br><br>' + Media.hostingHint(provider),
        'Couldn’t load the 360 photo (' + why + '). ' + Media.hostingHint(provider).replace(/<[^>]+>/g, ''));
      return false;
    };
    let blob;
    try {
      const resp = await fetch(url, { mode: 'cors' });
      if (!resp.ok) return fail('error ' + resp.status);
      const total = Number(resp.headers.get('content-length')) || 0;
      if (resp.body && total) {
        const reader = resp.body.getReader(), chunks = [];
        let got = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value); got += value.length; setProgress(got / total, got, total);
        }
        blob = new Blob(chunks, { type: resp.headers.get('content-type') || '' });
      } else {
        // the host didn't say how big it is: count what arrives instead
        setProgress(null);
        if (resp.body) {
          const reader = resp.body.getReader(), chunks = [];
          let got = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value); got += value.length; setProgress(null, got);
          }
          blob = new Blob(chunks, { type: resp.headers.get('content-type') || '' });
        } else blob = await resp.blob();
      }
    } catch (err) {
      return fail('the host didn’t allow it, or the link is wrong');
    }
    if (/^text\/html/.test(blob.type)) return fail('the link opened a web page, not a picture');
    setProgress(1, blob.size, blob.size);

    const img = new Image();
    img.src = URL.createObjectURL(blob);
    try { await img.decode(); } catch (e) { return fail('the file isn’t a picture this device can open — use a JPEG'); }

    // Phones can't display textures bigger than their GPU allows, so shrink if needed.
    await sceneReady();
    const max = Math.min(sceneEl.renderer ? sceneEl.renderer.capabilities.maxTextureSize : 4096, 8192);
    let source = img;
    Stats.photo = { w: img.naturalWidth, h: img.naturalHeight, bytes: blob.size, max: max };
    if (img.naturalWidth > max) {
      const c = document.createElement('canvas');
      c.width = max; c.height = Math.round(max * img.naturalHeight / img.naturalWidth);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      source = c;
    }
    source.id = 'pano-src';
    source.style.display = 'none';
    document.body.appendChild(source);
    sky.setAttribute('src', '#pano-src');
    sky.setAttribute('visible', true);

    const ratio = img.naturalWidth / img.naturalHeight;
    tell({
      type: 'status', state: 'ready', width: img.naturalWidth, height: img.naturalHeight,
      warning: Math.abs(ratio - 2) > 0.05 ? 'This picture is ' + img.naturalWidth + '×' + img.naturalHeight +
        '. A 360 photosphere should be twice as wide as it is tall (2:1), so it may look stretched.' : ''
    });
    return true;
  }

  function loadVideo(token) {
    const { url, provider } = Media.resolveMediaUrl(token, 'video');
    video = document.createElement('video');
    video.id = 'pano-video';
    video.crossOrigin = 'anonymous';
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.loop = true;
    video.preload = 'auto';
    video.src = url;
    $('assets').appendChild(video);
    video.addEventListener('error', () => showError('Couldn’t load the 360 video.<br><br>' + Media.hostingHint(provider)), { once: true });
    video.addEventListener('loadeddata', () => {
      try { // a video from a host that doesn't allow sharing plays, but can't be drawn
        const c = document.createElement('canvas'); c.width = c.height = 2;
        const ctx = c.getContext('2d'); ctx.drawImage(video, 0, 0, 2, 2); ctx.getImageData(0, 0, 1, 1);
        tell({ type: 'status', state: 'ready', video: true, width: video.videoWidth, height: video.videoHeight });
      } catch (e) {
        showError('The video’s host doesn’t allow it to be shown in 360.<br><br>' + Media.hostingHint(provider));
      }
    }, { once: true });
    vsphere.setAttribute('src', '#pano-video');
    vsphere.setAttribute('visible', true);
    return true;   // iPhones don't download video until it's played, so don't wait
  }

  // ------------------------------------------------------------- sound
  const Sound = {
    kind: 'none', playing: false, yt: null, ytReady: false, wantPlay: false,

    init(token) {
      if (!token) {
        if (video) { this.kind = 'video'; $('btn-sound').hidden = false; }
        return;
      }
      $('btn-sound').hidden = false;
      const yt = Media.youTube(token);
      if (yt) return this.initYouTube(yt);

      this.kind = 'file';
      const a = $('audio');
      // A Google Drive sound needs downloading first (with this website's key); anything else plays from its link
      if (Media.canDownloadDrive(token)) {
        Media.downloadDrive(token).then(r => { a.src = r.url; if (this.wantPlay) { this.wantPlay = false; a.play().catch(() => this.set(false)); } })
          .catch(err => { tell({ type: 'audio', ok: false, message: err.message }); $('btn-sound').hidden = true; });
      } else a.src = Media.resolveMediaUrl(token, 'audio').url;
      a.loop = cfg.loop;
      a.addEventListener('play', () => this.set(true));
      a.addEventListener('pause', () => this.set(false));
      a.addEventListener('ended', () => this.set(false));
      a.addEventListener('canplay', () => tell({ type: 'audio', ok: true }), { once: true });
      a.addEventListener('error', () => {
        tell({ type: 'audio', ok: false, message: 'The audio file couldn’t be loaded. Check the link opens an MP3 and is shared as “Anyone with the link”.' });
        $('btn-sound').hidden = true;
      }, { once: true });
    },

    initYouTube(yt) {
      this.kind = 'yt';
      loadYouTubeApi().then(YT => {
        this.yt = new YT.Player('yt', {
          width: 200, height: 200, videoId: yt.id,
          playerVars: Object.assign({ playsinline: 1, rel: 0, controls: 1, start: yt.start },
            cfg.loop ? { loop: 1, playlist: yt.id } : {}),
          events: {
            onReady: () => {
              this.ytReady = true;
              tell({ type: 'audio', ok: true });
              if (this.wantPlay) this.play();
            },
            onStateChange: e => this.set(e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.BUFFERING),
            onError: e => {
              const why = { 2: 'the YouTube link looks wrong', 5: 'it can’t play in this browser', 100: 'the video was not found or is private',
                101: 'its owner doesn’t allow it to be played on other websites', 150: 'its owner doesn’t allow it to be played on other websites' }[e.data] || 'error ' + e.data;
              tell({ type: 'audio', ok: false, message: 'YouTube audio won’t play: ' + why + '.' });
            }
          }
        });
      }).catch(err => tell({ type: 'audio', ok: false, message: err.message }));
    },

    play() {
      if (this.kind === 'file') {
        if (!$('audio').getAttribute('src')) { this.wantPlay = true; return; }   // a Drive sound still downloading
        $('audio').play().catch(() => this.set(false));
      }
      else if (this.kind === 'video') video.play().then(() => this.set(true)).catch(() => {});
      else if (this.kind === 'yt') {
        $('yt-wrap').hidden = false;
        if (this.ytReady) this.yt.playVideo(); else this.wantPlay = true;
      }
    },
    pause() {
      if (this.kind === 'file') { this.wantPlay = false; $('audio').pause(); }
      else if (this.kind === 'video') { video.pause(); this.set(false); }
      else if (this.kind === 'yt' && this.ytReady) this.yt.pauseVideo();
    },
    set(on) {
      this.playing = on;
      setButton($('btn-sound'), on ? 'pause' : 'play', on ? 'Pause' : (this.kind === 'video' ? 'Play' : 'Play audio'));
    }
  };
  $('btn-sound').addEventListener('click', () => {
    if (Sound.kind === 'spots') return setSpotsMuted(!spotsMuted);
    Sound.playing ? Sound.pause() : Sound.play();
  });
  // With no background sound of its own, the sound button mutes and unmutes all the spots
  let spotsMuted = false;
  function setSpotsMuted(m) {
    spotsMuted = m;
    spots.setMuted(m);
    if (video) video.muted = m;
    const b = $('btn-sound');
    setButton(b, m ? 'soundOff' : 'soundOn', m ? 'Sound off' : 'Sound on');
    b.setAttribute('aria-pressed', String(!m));
  }

  // ------------------------------------------------------------- looking around: drag
  const PITCH_LIMIT = 85 * Math.PI / 180;
  const clampPitch = v => Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, v));
  const pointers = new Map();
  let lastPinch = 0, vel = { x: 0, y: 0 }, lastMoveTime = 0, spin = 0;

  function radiansPerPixel() {
    if (win) return winFov * Math.PI / 180 / Math.max(1, win.h);
    const fov = (cam.getAttribute('camera').fov || 75) * Math.PI / 180;
    return fov / Math.max(1, sceneEl.canvas.clientHeight);
  }
  function turn(dx, dy) {
    const k = radiansPerPixel();
    lc.yawObject.rotation.y += dx * k;                               // drag right → picture moves right
    if (mode === 'drag') lc.pitchObject.rotation.x = clampPitch(lc.pitchObject.rotation.x + dy * k);
  }
  function zoom(factor) {
    if (win) { winFov = Math.max(30, Math.min(100, winFov * factor)); applyWindow(); return; }
    const c = cam.getAttribute('camera');
    cam.setAttribute('camera', 'fov', Math.max(30, Math.min(100, c.fov * factor)));
  }

  // ------------------------------------------------------------- the author's preview: a phone-sized window
  // The preview can show the whole photo around a phone-shaped window. Inside the window is exactly what a
  // phone shows (its field of view, its spot sizes); outside is dimmed, and only turns the view when dragged.
  let win = null, winFov = 75;
  const shades = ['t', 'b', 'l', 'r'].map(k => {
    const d = document.createElement('div');
    d.className = 'win-shade win-' + k; d.hidden = true; d.setAttribute('aria-hidden', 'true');
    document.body.appendChild(d);
    return d;
  });
  function applyWindow() {
    const W = innerWidth, H = innerHeight;
    document.body.classList.toggle('windowed', !!win);
    shades.forEach(d => { d.hidden = !win; });
    if (!win) { cam.setAttribute('camera', 'fov', winFov); return; }
    const x = (W - win.w) / 2, y = (H - win.h) / 2;
    // a wider view all round, so the window's own height still covers the phone's view
    const full = 2 * Math.atan(Math.tan(winFov * Math.PI / 360) * H / win.h) * 180 / Math.PI;
    cam.setAttribute('camera', 'fov', Math.min(170, full));
    const st = document.body.style;
    st.setProperty('--wx', x + 'px'); st.setProperty('--wy', y + 'px');
    st.setProperty('--ww', win.w + 'px'); st.setProperty('--wh', win.h + 'px');
  }
  window.addEventListener('resize', () => { if (win) applyWindow(); });

  function clearSelection() {
    const sel = window.getSelection && window.getSelection();
    if (sel && sel.rangeCount && !sel.isCollapsed && !(document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName))) sel.removeAllRanges();
  }
  function bindDrag() {
    const el = sceneEl.canvas;
    el.style.touchAction = 'none';
    el.style.cursor = 'grab';
    let travelled = 0;

    // Drags can start on the picture or on a spot marker (so markers never get in the way of looking around)
    const down = e => {
      // In the author's preview, only the picture itself turns the view (spots are moved instead)
      const passThrough = '.spot-marker, .spot-model';
      const shade = e.target.classList && e.target.classList.contains('win-shade');
      if (e.target !== el && !shade && (PREVIEW || !e.target.closest(passThrough))) return;
      if (e.target !== el && !shade) e.target.closest(passThrough).style.touchAction = 'none';
      // A mouse press here must not start selecting text: a selection (of spot labels) would later be dragged
      // by the browser instead of the view, cancelling the drag after a moment
      if (e.pointerType === 'mouse') e.preventDefault();
      clearSelection();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) travelled = 0;
      cancelAnimationFrame(spin); vel = { x: 0, y: 0 };
      el.style.cursor = 'grabbing';
    };
    el.addEventListener('pointerdown', down);
    $('spots').addEventListener('pointerdown', down);
    shades.forEach(d => {
      d.addEventListener('pointerdown', down);
      d.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.08 : 1 / 1.08); }, { passive: false });
    });

    window.addEventListener('pointermove', e => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      travelled += Math.abs(dx) + Math.abs(dy);
      if (pointers.size === 2) {                                     // pinch to zoom
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastPinch) zoom(lastPinch / d);
        lastPinch = d;
        return;
      }
      turn(dx, dy);
      const now = performance.now(), dt = Math.max(8, now - lastMoveTime);
      const cap = v => Math.max(-40, Math.min(40, v));
      vel = { x: cap(dx / dt * 16), y: cap(dy / dt * 16) }; lastMoveTime = now;
    });
    const end = e => {
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size < 2) lastPinch = 0;
      if (pointers.size) return;
      setTimeout(() => { travelled = 0; }, 0);   // after any click this pointer-up causes
      el.style.cursor = 'grab';
      if (!REDUCED_MOTION && performance.now() - lastMoveTime < 80) glide(); else reportView();
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    // Nothing in the viewer is meant to be dragged out by the browser (text, pictures, links): that would cancel
    // the look-around drag. Spots and the view are moved with pointer events instead.
    window.addEventListener('dragstart', e => { e.preventDefault(); clearSelection(); }, true);
    // A drag that started on a marker shouldn't also count as tapping it
    $('spots').addEventListener('click', e => {
      if (travelled > 10 && e.target.closest('.spot-marker, .spot-model')) { e.stopPropagation(); e.preventDefault(); }
      travelled = 0;
    }, true);
    el.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.08 : 1 / 1.08); }, { passive: false });
  }
  function glide() {                                                  // a little momentum after a flick
    vel.x *= 0.92; vel.y *= 0.92;
    if (Math.abs(vel.x) + Math.abs(vel.y) < 0.2) return reportView();
    turn(vel.x, vel.y);
    spin = requestAnimationFrame(glide);
  }

  // Keyboard: arrows look, +/- zoom
  document.addEventListener('keydown', e => {
    if (!lc || !$('start').hidden) return;
    const step = 40;
    const keys = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (keys[e.key]) { turn(...keys[e.key]); reportView(); e.preventDefault(); }
    else if (e.key === '+' || e.key === '=') zoom(1 / 1.1);
    else if (e.key === '-') zoom(1.1);
  });

  // Where we're looking, in degrees: yaw (left +, right −) and pitch (up +).
  // The author page uses this for "start from this view" and for placing video spots.
  function currentView() {
    const camera = sceneEl.camera, d = new AFRAME.THREE.Vector3();
    camera.updateMatrixWorld(true);
    camera.getWorldDirection(d);
    const yaw = Math.atan2(-d.x, -d.z) * 180 / Math.PI;
    const pitch = Math.asin(Math.max(-1, Math.min(1, d.y))) * 180 / Math.PI;
    return { yaw: Math.round(yaw), pitch: Math.round(pitch) };
  }
  function reportView() { if (lc) tell(Object.assign({ type: 'view' }, currentView())); }

  // Point the view at a direction (author page: "show me this spot")
  function lookAt(yaw, pitch) {
    if (mode === 'motion') setMode('drag');
    lc.yawObject.rotation.y = (yaw - cfg.yaw) * Math.PI / 180;
    lc.pitchObject.rotation.x = clampPitch(pitch * Math.PI / 180);
    reportView();
  }

  // ------------------------------------------------------------- looking around: phone motion
  const motionPossible = () => !!(lc && lc.magicWindowControls);

  function setMode(next) {
    if (next === mode) return;
    if (next === 'drag') {
      // Fold where the phone was pointing into the drag position, so the view doesn't jump.
      const d = lc.magicWindowDeltaEuler;
      lc.yawObject.rotation.y += d.y;
      lc.pitchObject.rotation.x = clampPitch(d.x);
      cam.setAttribute('look-controls', 'magicWindowTrackingEnabled', false);
    } else {
      lc.pitchObject.rotation.x = 0;          // the phone's tilt takes over up/down
      lc.previousMagicWindowYaw = undefined;   // start measuring turns from here
      cam.setAttribute('look-controls', 'magicWindowTrackingEnabled', true);
    }
    mode = next;
    $('mode-toggle').setAttribute('aria-checked', String(mode === 'motion'));
  }

  // Must be called straight from a tap: iPhones only ask for motion permission then.
  function startMotion() {
    const ask = (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function')
      ? DeviceOrientationEvent.requestPermission() : Promise.resolve('granted');
    return ask.then(state => {
      if (state !== 'granted') {
        setMode('drag');
        hint('Motion wasn’t allowed, so drag to look. To use motion, reload the page and tap Allow.', 6000);
        return;
      }
      setMode('motion');
      let seen = false;
      const on = e => { if (e.alpha !== null || e.beta !== null) seen = true; };
      window.addEventListener('deviceorientation', on);
      setTimeout(() => {
        window.removeEventListener('deviceorientation', on);
        if (!seen) { setMode('drag'); $('mode-toggle').hidden = true; hint('This device has no motion sensor — drag to look around.', 5000); }
        else hint('Turn around to look. You can still drag left and right.');
      }, 1200);
    }).catch(() => { setMode('drag'); hint('Motion isn’t available — drag to look around.', 5000); });
  }

  function recentre() {
    lc.yawObject.rotation.y = mode === 'motion' ? -lc.magicWindowDeltaEuler.y : 0;
    if (mode === 'drag') lc.pitchObject.rotation.x = 0;
    winFov = 75;
    if (win) applyWindow(); else cam.setAttribute('camera', 'fov', 75);
    reportView();
  }

  // ------------------------------------------------------------- entering
  function enter(how) {
    // Start sound and video inside the tap, before anything else.
    if (Sound.kind !== 'none' && Sound.kind !== 'spots') Sound.play();
    if (video && Sound.kind !== 'video') { video.muted = false; video.play().catch(() => {}); }
    spots.start();
    if (how === 'motion') startMotion(); else hint(matchMedia('(pointer: coarse)').matches ? 'Drag to look around' : 'Drag to look around · scroll to zoom');

    $('start').classList.add('gone');
    $('toolbar').hidden = false;
    $('mode-toggle').hidden = !motionPossible();
    setTimeout(() => { $('start').hidden = true; }, 500);
  }
  // Tapping anywhere on the start screen starts too (the usual way, without aiming for a button)
  $('start').addEventListener('click', e => {
    if (e.target.closest('button, a') || $('tap-any').hidden || !document.querySelector('.card.ready') || $('start').classList.contains('gone')) return;
    enter(motionPossible() ? 'motion' : 'drag');
  });

  // ------------------------------------------------------------- lining up with the real room
  let aligned = false;
  const aligner = Aligner({
    sceneEl: sceneEl,
    getLook: () => lc,
    panoSource: () => document.getElementById('pano-src') || document.getElementById('pano-video'),
    onDone: () => afterAlign('Lined up! Look around the room.'),
    onSkip: () => afterAlign(mode === 'motion' ? 'Turn around to look.' : 'Drag to look around.')
  });
  function afterAlign(msg) {
    aligned = true;
    spots.start();
    $('toolbar').hidden = false;
    $('mode-toggle').hidden = !motionPossible();
    setButton($('btn-centre'), 'lineUp', 'Line up');
    $('btn-centre').title = 'Line the photo up with the room again';
    hint(msg);
  }
  function enterAlign() {
    // Inside the tap: unlock sound for later, and ask for motion (iPhones only ask from a tap)
    spots.unlock();
    if (video) { video.muted = spotsMuted; video.play().catch(() => {}); }
    startMotion();
    $('start').classList.add('gone');
    setTimeout(() => { $('start').hidden = true; }, 500);
    aligner.begin();
  }
  $('go-align').addEventListener('click', enterAlign);

  $('go-motion').addEventListener('click', () => enter('motion'));
  $('go-drag').addEventListener('click', () => enter('drag'));
  $('mode-toggle').addEventListener('click', () => {
    if (mode !== 'motion') startMotion();
    else { setMode('drag'); hint('Motion off — drag to look around'); }
  });
  $('btn-centre').addEventListener('click', () => {
    if (aligned) { if (mode !== 'motion') startMotion(); $('toolbar').hidden = true; aligner.begin(); }
    else recentre();
  });

  let nudgeReport = 0;
  // The author page can change the starting direction without reloading the preview
  window.addEventListener('message', e => {
    const m = e.data;
    if (!PREVIEW || e.origin !== location.origin || !m || !lc) return;
    if (m.type === 'setYaw') {
      const delta = (m.yaw - cfg.yaw) * Math.PI / 180;
      cfg.yaw = m.yaw;
      rig.setAttribute('rotation', { x: 0, y: cfg.yaw, z: 0 });
      lc.yawObject.rotation.y -= delta;          // keep looking at the same spot
    } else if (m.type === 'setSpots') {
      spotDefs = (m.spots || []).map(HotSpots.decode);
      spots.set(spotDefs);
    } else if (m.type === 'setCompare') {
      setCompare(m);
    } else if (m.type === 'lookAt') {
      lookAt(m.yaw, m.pitch);
    } else if (m.type === 'pinSpot') {
      spots.pinSpot(m.index, m.on);
    } else if (m.type === 'selectSpot') {
      spots.setSelected(m.index, !!m.flash);
    } else if (m.type === 'hoverSpot') {
      spots.setHover(m.index);
    } else if (m.type === 'nudge') {
      // The author page's arrow buttons: turn by a few degrees (left and up are positive)
      if (mode === 'motion') setMode('drag');
      lc.yawObject.rotation.y += (m.yaw || 0) * Math.PI / 180;
      lc.pitchObject.rotation.x = clampPitch(lc.pitchObject.rotation.x + (m.pitch || 0) * Math.PI / 180);
      clearTimeout(nudgeReport); nudgeReport = setTimeout(reportView, 120);
    } else if (m.type === 'setLayers') {
      // the author's front layer: its shapes, whether to show it, and any shape being drawn
      layerEditing = !!m.editing;
      front.set((m.shapes || []).map(FrontLayer.decode).filter(Boolean), {
        show: m.show !== false,
        tool: m.tool || null,
        draft: m.draft && m.draft.pts && m.draft.pts.length ? m.draft : null
      });
      document.body.classList.toggle('layer-drawing', !!m.tool);
    } else if (m.type === 'setWindow') {
      win = m.win && m.win.w > 50 && m.win.h > 50 ? { w: m.win.w, h: m.win.h } : null;
      applyWindow();
    } else if (m.type === 'setBrightness') {
      spots.setBrightness(m.value);
    } else if (m.type === 'stopAll') {
      spots.stopAll();
    }
  });

  // ------------------------------------------------------------- video spots
  let spotDefs = [];             // the spots shown, so a late error can say which file it was about
  // The front layer: parts of the photo drawn in front of spots marked "behind" (made in the author page)
  let layerEditing = false;
  const front = FrontLayer({
    sceneEl: sceneEl,
    layer: $('spots'),
    editable: PREVIEW,
    isEditing: () => layerEditing,
    tell: tell
  });
  // Where floating spots may go: the screen (or the preview's phone window), clear of the toolbar along the bottom
  // and the motion switch at the top
  function floatArea() {
    const r = win ? { x: (innerWidth - win.w) / 2, y: (innerHeight - win.h) / 2, w: win.w, h: win.h } : { x: 0, y: 0, w: innerWidth, h: innerHeight };
    const tb = $('toolbar'), mt = $('mode-toggle');
    if (tb && !tb.hidden) { const b = tb.offsetHeight || 56; r.h -= b + 12; }
    if (mt && !mt.hidden) { const t = (mt.offsetHeight || 40) + 10; r.y += t; r.h -= t; }
    return r;
  }
  const spots = HotSpots({
    sceneEl: sceneEl,
    editable: PREVIEW,
    brightness: cfg.bright,
    onEdit: (i, v) => tell(Object.assign({ type: 'spotEdit', index: i }, v)),
    onSelect: i => tell({ type: 'spotSelect', index: i }),
    layer: $('spots'),
    backLayer: front.backLayer,
    pxPerDegree: () => (win ? win.h / winFov : 0),
    viewRect: floatArea,                               // floating spots stay inside it
    frontAt: (x, y) => front.hiddenAt(x, y),
    offscreen: $('spots-offscreen'),
    onActivity: () => {},                    // (the background sound used to be turned down here; the author decides volumes now)
    onError: (i, msg) => { (Stats.problems = Stats.problems || {})[i] = msg; tell({ type: 'spotError', index: i, message: msg, src: spotDefs[i] ? spotDefs[i].src : null }); if (!PREVIEW) console.warn('Video spot ' + (i + 1) + ': ' + msg); },
    onNeedTap: (text, fix) => {
      hint(text, 6000);
      document.addEventListener('pointerdown', fix, { once: true, capture: true });
    }
  });
  AFRAME.registerComponent('spot-tracker', {
    tock: () => {
      if (!Stats.on) { front.update(); spots.update(); compareTick(); return; }
      const t0 = performance.now(); front.update();
      const t1 = performance.now(); spots.update();
      const t2 = performance.now(); compareTick();
      Stats.frame(t1 - t0, t2 - t1);
    }
  });

  // ------------------------------------------------------------- compare photospheres: a second photo, and a bar to drag
  // p2 = a second 360 photo taken from the same spot, y2 = turn it (degrees) to line it up, n1 / n2 = names for the
  // main photo (right of the bar) and the second one (left of it). The second photo is a sphere just inside the
  // first, drawn only left of the bar (decided per pixel on screen), so dragging the bar wipes between them.
  // Spots sit in front of both. (Masks still show the main photo, on both sides.)
  const cmp = { split: 0.5, ent: null, mat: null, yaw2: Number(params.get('y2')) || 0, n1: params.get('n1') || '', n2: params.get('n2') || '' };
  async function loadCompare(token) {
    const { url, provider } = Media.resolveMediaUrl(token, 'image');
    const fail = why => {
      tell({ type: 'compare', state: 'error', message: 'Couldn’t load the second photo (' + why + '). ' + Media.hostingHint(provider).replace(/<[^>]+>/g, '') });
      if (!PREVIEW) console.warn('Second photo: ' + why);
    };
    let img;
    try {
      const resp = await fetch(url, { mode: 'cors' });
      if (!resp.ok) return fail('error ' + resp.status);
      const blob = await resp.blob();
      if (/^text\/html/.test(blob.type)) return fail('the link opened a web page, not a picture');
      img = new Image(); img.src = URL.createObjectURL(blob);
      await img.decode();
    } catch (e) { return fail('the host didn’t allow it, the link is wrong, or it isn’t a JPEG'); }
    await sceneReady();
    const THREE_ = AFRAME.THREE;
    const max = Math.min(sceneEl.renderer ? sceneEl.renderer.capabilities.maxTextureSize : 4096, 8192);
    let source = img;
    if (img.naturalWidth > max) {
      const c = document.createElement('canvas');
      c.width = max; c.height = Math.round(max * img.naturalHeight / img.naturalWidth);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      source = c;
    }
    const tex = new THREE_.Texture(source);
    tex.colorSpace = THREE_.NoColorSpace;              // the stored colours exactly, to match the main photo
    tex.minFilter = THREE_.LinearFilter; tex.generateMipmaps = false;
    tex.needsUpdate = true;
    cmp.mat = new THREE_.ShaderMaterial({
      uniforms: { map: { value: tex }, uSplit: { value: cmp.split }, uX: { value: 0 }, uW: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D map; uniform float uSplit, uX, uW; varying vec2 vUv;' +
        'void main() { if (gl_FragCoord.x > uX + uSplit * uW) discard; gl_FragColor = vec4(texture2D(map, vUv).rgb, 1.0); }',
      side: THREE_.DoubleSide, toneMapped: false
    });
    // the same placement as the main photo's <a-sky> (turned −90°, mirrored), plus the author's turn
    cmp.ent = document.createElement('a-entity');
    cmp.ent.setAttribute('scale', '-1 1 1');
    sceneEl.appendChild(cmp.ent);
    const add = () => { cmp.ent.setObject3D('mesh', new THREE_.Mesh(new THREE_.SphereGeometry(99, 64, 32), cmp.mat)); setCompare({}); };
    if (cmp.ent.hasLoaded) add(); else cmp.ent.addEventListener('loaded', add, { once: true });
    $('compare').hidden = false;
    tell({ type: 'compare', state: 'ready', width: img.naturalWidth, height: img.naturalHeight });
  }
  function setCompare(m) {
    if (m.yaw2 != null) cmp.yaw2 = Number(m.yaw2) || 0;
    if (m.n1 != null) cmp.n1 = m.n1;
    if (m.n2 != null) cmp.n2 = m.n2;
    if (cmp.ent) cmp.ent.setAttribute('rotation', { x: 0, y: -90 + cmp.yaw2, z: 0 });
    $('cmp-n1').textContent = cmp.n1; $('cmp-n1').hidden = !cmp.n1;
    $('cmp-n2').textContent = cmp.n2; $('cmp-n2').hidden = !cmp.n2;
    setSplit(cmp.split);
  }
  function setSplit(f) {
    cmp.split = Math.max(0, Math.min(1, f));
    const c = sceneEl.canvas, r = c && c.getBoundingClientRect();
    if (r) $('compare').style.setProperty('--split', (r.left + cmp.split * r.width) + 'px');
    const pct = Math.round(cmp.split * 100), a = cmp.n2 || 'the second photo', b = cmp.n1 || 'the main photo';
    const g = $('cmp-grip');
    g.setAttribute('aria-valuenow', pct);
    g.setAttribute('aria-valuetext', pct + '% ' + a + ', ' + (100 - pct) + '% ' + b);
    // names fade when their side is too narrow to read them
    $('compare').classList.toggle('narrow-l', cmp.split < 0.15);
    $('compare').classList.toggle('narrow-r', cmp.split > 0.85);
  }
  // every frame: the bar's place in drawing-buffer pixels (the canvas can be any size, and phones draw at 2–3×)
  function compareTick() {
    if (!cmp.mat) return;
    const c = sceneEl.canvas;
    cmp.mat.uniforms.uW.value = c.width;
    cmp.mat.uniforms.uX.value = 0;
    cmp.mat.uniforms.uSplit.value = cmp.split;
  }
  {
    const bar = $('cmp-bar'), grip = $('cmp-grip');
    let dragging = false;
    const at = e => { const r = sceneEl.canvas.getBoundingClientRect(); setSplit((e.clientX - r.left) / r.width); };
    bar.addEventListener('pointerdown', e => { dragging = true; bar.setPointerCapture(e.pointerId); e.stopPropagation(); e.preventDefault(); at(e); $('compare').classList.add('dragging'); });
    bar.addEventListener('pointermove', e => { if (dragging) { e.stopPropagation(); at(e); } });
    const end = e => { dragging = false; $('compare').classList.remove('dragging'); e.stopPropagation(); };
    bar.addEventListener('pointerup', end); bar.addEventListener('pointercancel', end);
    grip.addEventListener('keydown', e => {
      const step = e.shiftKey ? 0.2 : 0.05;
      const to = { ArrowLeft: cmp.split - step, ArrowDown: cmp.split - step, ArrowRight: cmp.split + step, ArrowUp: cmp.split + step, Home: 0, End: 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault(); e.stopPropagation(); setSplit(to);
    });
    window.addEventListener('resize', () => setSplit(cmp.split));
  }

  // ------------------------------------------------------------- boot
  async function main() {
    document.title = cfg.title + ' · 360°';
    $('title').textContent = cfg.title;

    if (!cfg.pano) {
      $('title').textContent = 'Scan a QR code to begin';
      $('error').classList.add('info');
      $('error').setAttribute('role', 'status');
      showError('This page shows 360° experiences made with the <a href="make.html">360° QR Experience Maker</a>. ' +
        'Scan an experience’s QR code, or <a href="make.html">make your own</a>.');
      return;
    }

    await sceneReady();
    lc = cam.components['look-controls'];
    rig.setAttribute('rotation', { x: 0, y: cfg.yaw, z: 0 });
    bindDrag();
    rig.setAttribute('spot-tracker', '');
    front.set(params.getAll('f').map(FrontLayer.decode).filter(Boolean));
    spotDefs = params.getAll('s').map(HotSpots.decode);
    spots.set(spotDefs);

    const isVideo = Media.looksLikeVideo(cfg.pano);
    if (isVideo) { $('loading').hidden = true; loadVideo(cfg.pano); }
    Sound.init(cfg.audio);
    // With spots, the sound button mutes everything (a 360 video background included)
    if ((Sound.kind === 'none' || Sound.kind === 'video') && spots.count) {
      Sound.kind = 'spots';
      $('btn-sound').hidden = false;
      setSpotsMuted(false);
    }
    if (PREVIEW) $('spots').classList.add('editing');
    else { $('crosshair').classList.add('dot'); $('crosshair').hidden = false; }   // always: it shows where "looking at" aims

    if (PREVIEW) {
      // The author's preview: straight in, mouse only. Sound waits for a click on Play.
      $('start').hidden = true;
      $('toolbar').hidden = false;
      if (Sound.kind === 'yt') $('yt-wrap').hidden = false;
      $('crosshair').hidden = false;
      // Autoplay spots start once the author first clicks in the preview (browsers need a click for sound)
      document.addEventListener('pointerdown', () => spots.start(), { once: true, capture: true });
      tell({ type: 'status', state: 'loading' });
      const ok = isVideo ? true : await loadImage(cfg.pano);
      if (ok && params.get('p2')) loadCompare(params.get('p2'));
      reportView();
      return;
    }

    if (EMBEDDED) {
      // Phones often block motion and the camera inside another site, so offer a way out into a full tab
      document.body.classList.add('embedded');
      const full = location.href;
      $('embed-open-link').href = full;
      $('embed-open').hidden = false;
      $('btn-full').hidden = false;
      $('btn-full').addEventListener('click', () => window.open(full, '_blank', 'noopener'));
    }
    const canAlign = !EMBEDDED && cfg.align && motionPossible() && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    // One tap to start. Phones look around by moving (the tap is what lets iPhones use motion and sound);
    // a small switch on screen turns that off for dragging with a finger.
    $('go-drag').hidden = motionPossible();
    if (canAlign) {
      $('go-align').hidden = false;
      $('go-motion').hidden = false;
      $('go-motion').classList.add('secondary');
      $('go-motion').querySelector('b').textContent = 'Skip lining up';
      $('go-motion').querySelector('small').textContent = 'Just move your phone to look around';
      $('tip').textContent = 'Stand where the QR code is. Nothing from your camera is saved or sent anywhere.';
    } else if (motionPossible()) {
      $('go-motion').hidden = false;
      $('go-motion').querySelector('b').textContent = 'Start';
      $('go-motion').querySelector('small').textContent = 'Then move your phone to look around';
      $('tip').textContent = (cfg.audio ? 'Turn your sound up — headphones help. ' : '') + 'Prefer your finger? Switch Motion off at the top.';
      $('tap-any').hidden = false;
    } else {
      $('drag-label').textContent = 'Start';
      $('tap-any').hidden = false;
      $('drag-sub').textContent = matchMedia('(pointer: coarse)').matches ? 'Drag with your finger to look around' : 'Drag with your mouse to look around';
      $('tip').textContent = cfg.audio ? 'Turn your sound up — headphones help.' : '';
    }

    const ok = isVideo ? true : await loadImage(cfg.pano);
    if (ok && params.get('p2')) loadCompare(params.get('p2'));
    if (ok) {
      $('go-align').disabled = $('go-motion').disabled = $('go-drag').disabled = false;
      document.querySelector('.card').classList.add('ready');
      (!$('go-align').hidden ? $('go-align') : $('go-motion').hidden ? $('go-drag') : $('go-motion')).focus({ preventScroll: true });
    }
  }
  // ------------------------------------------------------------- stats (&stats=1)
  // For tracking down a slow tour on a real phone: add &stats=1 to the tour's link (never put in QR codes).
  // Shows how smooth it is, where each frame's time goes, what's drawn, and switches to hide kinds of things.
  function Stats() {}
  Stats.on = params.get('stats') === '1';
  Stats.photo = null;
  Stats.problems = {};                                   // spot index → what went wrong (shown in the stats panel)
  if (Stats.on) {
    const acc = { masks: 0, spots: 0, draw: 0, n: 0, calls: 0, tris: 0 }, gaps = [];
    let last = 0;
    Stats.frame = (m, sp) => {
      acc.masks += m; acc.spots += sp; acc.n++;
      const info = sceneEl.renderer && sceneEl.renderer.info.render;
      if (info) { acc.calls = info.calls; acc.tris = info.triangles; }
    };
    const loop = t => { if (last) gaps.push(t - last); if (gaps.length > 240) gaps.shift(); last = t; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    sceneReady().then(() => {
      const r = sceneEl.renderer, render = r.render.bind(r);
      r.render = function (scene, camera) { const t = performance.now(); render(scene, camera); acc.draw += performance.now() - t; };
    });
    const box = document.createElement('div');
    box.className = 'stats-box';
    box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Stats');
    box.innerHTML = '<pre class="stats-text"></pre><div class="stats-btns">' +
      [['model', '3D models'], ['mask', 'masks'], ['image', 'pictures and cards'], ['video', 'videos']].map(([k, t]) =>
        '<button type="button" data-hide="' + k + '" aria-pressed="false">Hide ' + t + '</button>').join('') +
      '<button type="button" data-copy>Copy these stats</button></div>';
    document.body.appendChild(box);
    const masks = params.getAll('f').map(FrontLayer.decode).filter(Boolean);
    box.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      e.stopPropagation();
      if (b.dataset.copy != null) {
        navigator.clipboard.writeText(box.querySelector('pre').textContent)
          .then(() => { b.textContent = 'Copied ✓'; setTimeout(() => { b.textContent = 'Copy these stats'; }, 1500); }).catch(() => {});
        return;
      }
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      if (b.dataset.hide === 'mask') front.set(masks, { show: !on });
      else spots.setDebugHide(b.dataset.hide, on);
    });
    box.addEventListener('pointerdown', e => e.stopPropagation());
    const kb = n => !n ? 'size ?' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
    const k = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n);
    const name = sp => (sp.label || Media.expand(sp.src).split(/[?#]/)[0].split('/').pop() || sp.kind).slice(0, 28);
    setInterval(() => {
      const g = gaps.slice(-60), avg = g.length ? g.reduce((a, b) => a + b, 0) / g.length : 0, worst = g.length ? Math.max(...g) : 0;
      const n = Math.max(1, acc.n), r = sceneEl.renderer, c = sceneEl.canvas;
      const list = spots.stats(), by = {};
      list.forEach(sp => { by[sp.kind] = (by[sp.kind] || 0) + 1; });
      const ph = Stats.photo, dpr = r ? r.getPixelRatio() : devicePixelRatio;
      const lines = [
        'Smoothness: ' + (avg ? Math.round(1000 / avg) : '–') + ' frames a second · ' + avg.toFixed(1) + ' ms a frame (slowest ' + Math.round(worst) + ' ms)',
        'Each frame: spots ' + (acc.spots / n).toFixed(1) + ' ms · masks ' + (acc.masks / n).toFixed(1) + ' ms · 3D drawing ' + (acc.draw / n).toFixed(1) + ' ms (code only)',
        'Drawn: ' + acc.calls + ' draw calls · ' + k(acc.tris) + ' triangles',
        'Photo: ' + (ph ? ph.w + '×' + ph.h + ', ' + kb(ph.bytes) + (ph.w > ph.max ? ' → shrunk to ' + ph.max + ' wide (this phone’s limit)' : '') : 'not loaded yet') +
          ' · biggest picture this phone can draw: ' + (r ? r.capabilities.maxTextureSize : '?'),
        'Screen: ' + (c ? c.clientWidth + '×' + c.clientHeight + ' at ×' + dpr.toFixed(2) + ' = ' + c.width + '×' + c.height + ' pixels drawn' : '?'),
        'Spots: ' + list.length + (list.length ? ' (' + Object.keys(by).map(kk => by[kk] + ' ' + kk).join(', ') + ')' : '') + ' · masks: ' + masks.length
      ];
      list.forEach(sp => lines.push('  #' + sp.n + ' ' + sp.kind + ' “' + name(sp) + '” ' + sp.how + (sp.behind ? ', behind masks' : '') +
        (sp.tris ? ' · ' + k(sp.tris) + ' triangles' : '') + (sp.size && sp.size[0] ? ' · ' + sp.size[0] + '×' + sp.size[1] : '') + ' · ' + kb(sp.bytes) + (sp.shown ? '' : ' (not in view)') +
        (Stats.problems[sp.n - 1] ? '\n      ✕ ' + Stats.problems[sp.n - 1] : '')));
      lines.push('Tip: slow frames with small times above = the graphics chip (photo size, triangles, screen pixels) or redrawing pictures. Try the Hide switches.');
      lines.push(navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 120));
      box.querySelector('pre').textContent = lines.join('\n');
      acc.masks = acc.spots = acc.draw = acc.n = 0;
    }, 1000);
  }

  main();
})();
