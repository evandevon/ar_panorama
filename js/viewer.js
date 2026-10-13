/*
 * 360° viewer. Everything it shows comes from the page address (made by the author page):
 *   p  panorama: image link (or .mp4 for 360 video), or a short token like gd:<id>
 *   a  audio: MP3 link, Drive/OneDrive/Dropbox link, or YouTube (yt:<id>)
 *   t  title        y  starting direction in degrees        l=1  loop the audio
 *   preview=1       embedded in the author page: mouse-drag only, no start card
 */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const sceneEl = $('scene'), sky = $('sky'), vsphere = $('vsphere'), rig = $('rig'), cam = $('cam');
  const params = new URLSearchParams(location.search);
  const PREVIEW = params.get('preview') === '1';
  const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const cfg = {
    pano: params.get('p') || '',
    audio: params.get('a') || '',
    title: params.get('t') || 'Look around',
    yaw: Number(params.get('y')) || 0,
    loop: params.get('l') === '1'
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
    document.querySelector('.progress').hidden = true;
    $('start').hidden = false;
    $('start').classList.remove('gone');
    tell({ type: 'status', state: 'error', message: plain || e.textContent });
  }
  function setProgress(f) { $('bar').style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + '%'; }

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
          chunks.push(value); got += value.length; setProgress(got / total);
        }
        blob = new Blob(chunks, { type: resp.headers.get('content-type') || '' });
      } else {
        setProgress(0.5);
        blob = await resp.blob();
      }
    } catch (err) {
      return fail('the host didn’t allow it, or the link is wrong');
    }
    if (/^text\/html/.test(blob.type)) return fail('the link opened a web page, not a picture');
    setProgress(1);

    const img = new Image();
    img.src = URL.createObjectURL(blob);
    try { await img.decode(); } catch (e) { return fail('the file isn’t a picture this device can open — use a JPEG'); }

    // Phones can't display textures bigger than their GPU allows, so shrink if needed.
    await sceneReady();
    const max = Math.min(sceneEl.renderer ? sceneEl.renderer.capabilities.maxTextureSize : 4096, 8192);
    let source = img;
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
        tell({ type: 'status', state: 'ready', width: video.videoWidth, height: video.videoHeight });
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
      a.src = Media.resolveMediaUrl(token, 'audio').url;
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
      if (this.kind === 'file') $('audio').play().catch(() => this.set(false));
      else if (this.kind === 'video') video.play().then(() => this.set(true)).catch(() => {});
      else if (this.kind === 'yt') {
        $('yt-wrap').hidden = false;
        if (this.ytReady) this.yt.playVideo(); else this.wantPlay = true;
      }
    },
    pause() {
      if (this.kind === 'file') $('audio').pause();
      else if (this.kind === 'video') { video.pause(); this.set(false); }
      else if (this.kind === 'yt' && this.ytReady) this.yt.pauseVideo();
    },
    // Turn the background sound down while a video spot is playing
    duck(on) {
      const v = on ? 0.25 : 1;
      if (this.kind === 'file') $('audio').volume = v;
      else if (this.kind === 'video') video.volume = v;
      else if (this.kind === 'yt' && this.ytReady) this.yt.setVolume(v * 100);
    },
    set(on) {
      this.playing = on;
      const b = $('btn-sound');
      b.querySelector('.ico').textContent = on ? '⏸' : '▶';
      b.querySelector('.lbl').textContent = on ? 'Pause' : (this.kind === 'video' ? 'Play' : 'Play audio');
    }
  };
  $('btn-sound').addEventListener('click', () => (Sound.playing ? Sound.pause() : Sound.play()));

  // ------------------------------------------------------------- looking around: drag
  const PITCH_LIMIT = 85 * Math.PI / 180;
  const clampPitch = v => Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, v));
  const pointers = new Map();
  let lastPinch = 0, vel = { x: 0, y: 0 }, lastMoveTime = 0, spin = 0;

  function radiansPerPixel() {
    const fov = (cam.getAttribute('camera').fov || 75) * Math.PI / 180;
    return fov / Math.max(1, sceneEl.canvas.clientHeight);
  }
  function turn(dx, dy) {
    const k = radiansPerPixel();
    lc.yawObject.rotation.y += dx * k;                               // drag right → picture moves right
    if (mode === 'drag') lc.pitchObject.rotation.x = clampPitch(lc.pitchObject.rotation.x + dy * k);
  }
  function zoom(factor) {
    const c = cam.getAttribute('camera');
    cam.setAttribute('camera', 'fov', Math.max(30, Math.min(100, c.fov * factor)));
  }

  function bindDrag() {
    const el = sceneEl.canvas;
    el.style.touchAction = 'none';
    el.style.cursor = 'grab';
    let travelled = 0;

    // Drags can start on the picture or on a spot marker (so markers never get in the way of looking around)
    const down = e => {
      if (e.target !== el && !e.target.closest('.spot-marker')) return;
      if (e.target !== el) e.target.closest('.spot-marker').style.touchAction = 'none';
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) travelled = 0;
      cancelAnimationFrame(spin); vel = { x: 0, y: 0 };
      el.style.cursor = 'grabbing';
    };
    el.addEventListener('pointerdown', down);
    $('spots').addEventListener('pointerdown', down);

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
    // A drag that started on a marker shouldn't also count as tapping it
    $('spots').addEventListener('click', e => {
      if (travelled > 10 && e.target.closest('.spot-marker')) { e.stopPropagation(); e.preventDefault(); }
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
    $('mode-motion').setAttribute('aria-pressed', String(mode === 'motion'));
    $('mode-drag').setAttribute('aria-pressed', String(mode === 'drag'));
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
        if (!seen) { setMode('drag'); hint('This device has no motion sensor — drag to look around.', 5000); }
        else hint('Turn around to look. You can still drag left and right.');
      }, 1200);
    }).catch(() => { setMode('drag'); hint('Motion isn’t available — drag to look around.', 5000); });
  }

  function recentre() {
    lc.yawObject.rotation.y = mode === 'motion' ? -lc.magicWindowDeltaEuler.y : 0;
    if (mode === 'drag') lc.pitchObject.rotation.x = 0;
    cam.setAttribute('camera', 'fov', 75);
    reportView();
  }

  // ------------------------------------------------------------- entering
  function enter(how) {
    // Start sound and video inside the tap, before anything else.
    if (Sound.kind !== 'none') Sound.play();
    if (video && Sound.kind !== 'video') { video.muted = false; video.play().catch(() => {}); }
    spots.start();
    if (how === 'motion') startMotion(); else hint(matchMedia('(pointer: coarse)').matches ? 'Drag to look around' : 'Drag to look around · scroll to zoom');

    $('start').classList.add('gone');
    $('toolbar').hidden = false;
    setTimeout(() => { $('start').hidden = true; }, 500);
  }

  $('go-motion').addEventListener('click', () => enter('motion'));
  $('go-drag').addEventListener('click', () => enter('drag'));
  $('mode-motion').addEventListener('click', () => { if (mode !== 'motion') startMotion(); });
  $('mode-drag').addEventListener('click', () => { setMode('drag'); hint('Drag to look around'); });
  $('btn-centre').addEventListener('click', recentre);

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
      spots.set((m.spots || []).map(HotSpots.decode));
    } else if (m.type === 'lookAt') {
      lookAt(m.yaw, m.pitch);
    } else if (m.type === 'stopAll') {
      spots.stopAll();
    }
  });

  // ------------------------------------------------------------- video spots
  const spots = HotSpots({
    sceneEl: sceneEl,
    layer: $('spots'),
    offscreen: $('spots-offscreen'),
    onActivity: n => Sound.duck(n > 0),
    onError: (i, msg) => { tell({ type: 'spotError', index: i, message: msg }); if (!PREVIEW) console.warn('Video spot ' + (i + 1) + ': ' + msg); },
    onNeedTap: (text, fix) => {
      hint(text, 6000);
      document.addEventListener('pointerdown', fix, { once: true, capture: true });
    }
  });
  AFRAME.registerComponent('spot-tracker', { tock: () => spots.update() });

  // ------------------------------------------------------------- boot
  async function main() {
    document.title = cfg.title + ' · 360°';
    $('title').textContent = cfg.title;

    if (!cfg.pano) {
      $('title').textContent = 'Nothing to show yet';
      showError('This link doesn’t include a 360 photo. <a href="./">Make an experience</a>.');
      return;
    }

    await sceneReady();
    lc = cam.components['look-controls'];
    rig.setAttribute('rotation', { x: 0, y: cfg.yaw, z: 0 });
    bindDrag();
    rig.setAttribute('spot-tracker', '');
    spots.set(params.getAll('s').map(HotSpots.decode));

    const isVideo = Media.looksLikeVideo(cfg.pano);
    if (isVideo) loadVideo(cfg.pano);
    Sound.init(cfg.audio);

    if (PREVIEW) {
      // The author's preview: straight in, mouse only. Sound waits for a click on Play.
      $('mode-seg').hidden = true;
      $('start').hidden = true;
      $('toolbar').hidden = false;
      if (Sound.kind === 'yt') $('yt-wrap').hidden = false;
      $('crosshair').hidden = false;
      // Autoplay spots start once the author first clicks in the preview (browsers need a click for sound)
      document.addEventListener('pointerdown', () => spots.start(), { once: true, capture: true });
      tell({ type: 'status', state: 'loading' });
      if (!isVideo) await loadImage(cfg.pano);
      reportView();
      return;
    }

    if (motionPossible()) {
      $('go-motion').hidden = false;
      $('go-drag').classList.add('secondary');
      $('drag-sub').textContent = 'Use your finger instead';
      $('tip').textContent = (cfg.audio ? 'Turn your sound up — headphones help. ' : '') + 'You can switch any time.';
    } else {
      $('mode-seg').hidden = true;
      $('drag-label').textContent = 'Start';
      $('drag-sub').textContent = matchMedia('(pointer: coarse)').matches ? 'Drag with your finger to look around' : 'Drag with your mouse to look around';
      $('tip').textContent = cfg.audio ? 'Turn your sound up — headphones help.' : '';
    }

    const ok = isVideo ? true : await loadImage(cfg.pano);
    if (ok) {
      $('go-motion').disabled = $('go-drag').disabled = false;
      document.querySelector('.card').classList.add('ready');
      ($('go-motion').hidden ? $('go-drag') : $('go-motion')).focus({ preventScroll: true });
    }
  }
  main();
})();
