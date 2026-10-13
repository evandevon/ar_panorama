/*
 * Video and audio spots: YouTube videos, MP4 videos and MP3 sounds pinned to places in the 360 view.
 *
 * Each spot:  { src, type, yaw, pitch, w, play, hidden, loop, label }
 *   type       'video', 'audio' (sound only) or 'image'; left empty, it's worked out from the link
 *   yaw/pitch  where its centre sits, in degrees (yaw: left +, right −; pitch: up +)
 *   w          how wide a video is, in degrees of the view, so it stays the same size in the room
 *   play       tap   → the viewer starts it (YouTube's own play button, or a tap on a sound marker)
 *              look  → plays while the centre of the screen is on it, pauses when it moves off
 *              start → plays as soon as the experience starts
 *   hidden     nothing shown; it just plays (needs 'look' or 'start')
 *   loop       start again when it ends
 *
 * In a link, a spot is written as   src|yaw|pitch|flags|label|w
 * flags: l = look, s = start, h = hidden, r = loop, and a / v / i for sound / video / image
 * when that can't be told from the link itself (e.g. a Google Drive link)
 */
(function (global) {
  'use strict';

  const DEFAULT_W = 40;          // degrees
  const YT_MIN_PX = 356;         // YouTube's minimum player size is 200px tall → 356px wide at 16:9

  // ------------------------------------------------------------------ YouTube API, loaded once
  let ytPromise = null;
  function loadYouTubeApi() {
    if (ytPromise) return ytPromise;
    ytPromise = new Promise((resolve, reject) => {
      if (global.YT && global.YT.Player) return resolve(global.YT);
      const prev = global.onYouTubeIframeAPIReady;
      global.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(global.YT); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => reject(new Error('YouTube couldn’t be reached (it may be blocked on this network).'));
      document.head.appendChild(s);
    });
    return ytPromise;
  }
  const YT_ERRORS = {
    2: 'the YouTube link looks wrong', 5: 'it can’t play in this browser', 100: 'the video was not found or is private',
    101: 'its owner doesn’t allow it on other websites', 150: 'its owner doesn’t allow it on other websites'
  };

  // ------------------------------------------------------------------ what kind of spot is this?
  // What the link itself suggests: 'video' | 'audio' | 'image', or '' if it can't tell (e.g. Drive links)
  function guessKind(src) {
    if (Media.youTube(src) || Media.looksLikeVideo(src)) return 'video';
    if (Media.looksLikeImage(src)) return 'image';
    if (Media.looksLikeAudio(src)) return 'audio';
    return '';
  }
  // The kind it will actually be shown as
  function kindOf(d) {
    const guess = guessKind(d.src), t = d.type || (d.audioOnly ? 'audio' : '');
    if (Media.youTube(d.src)) return t === 'audio' ? 'audio' : 'video';
    if (guess === 'image') return 'image';
    if (guess === 'audio') return 'audio';
    if (guess === 'video') return t === 'audio' ? 'audio' : 'video';
    return t || 'audio';
  }

  // ------------------------------------------------------------------ link format
  function encodeSpot(s, shorten) {
    const kind = kindOf(s), guess = guessKind(s.src);
    const kindFlag = kind === guess || (kind === 'video' && Media.youTube(s.src)) ? '' : { audio: 'a', video: 'v', image: 'i' }[kind];
    const flags = (s.play === 'look' ? 'l' : s.play === 'start' ? 's' : '') + kindFlag +
      (s.hidden ? 'h' : '') + (s.loop ? 'r' : '');
    const label = (s.label || '').replace(/\|/g, '/').trim();
    const w = s.w && Math.round(s.w) !== DEFAULT_W ? Math.round(s.w) : '';
    return [shorten ? Media.shorten(s.src) : s.src.trim(), Math.round(s.yaw), Math.round(s.pitch), flags, label, w]
      .join('|').replace(/\|+$/, '');
  }
  function decodeSpot(str) {
    const parts = String(str || '').split('|');
    if (!parts[0]) return null;
    const flags = parts[3] || '';
    return {
      src: parts[0],
      yaw: Number(parts[1]) || 0,
      pitch: Number(parts[2]) || 0,
      play: flags.includes('l') ? 'look' : flags.includes('s') ? 'start' : 'tap',
      type: flags.includes('i') ? 'image' : flags.includes('a') ? 'audio' : flags.includes('v') ? 'video' : '',
      hidden: flags.includes('h'),
      loop: flags.includes('r'),
      label: parts[4] || '',
      w: Number(parts[5]) || DEFAULT_W
    };
  }
  // Settings that need the player rebuilt when they change (moving, resizing and relabelling don't)
  const rebuildKey = d => [d.src, kindOf(d), d.play, !!d.hidden, !!d.loop].join('|');

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ------------------------------------------------------------------ the manager
  /**
   * opts: { sceneEl, layer, offscreen, editable,
   *         onActivity(nPlaying), onError(index, msg), onNeedTap(text, fix),
   *         onEdit(index, {yaw, pitch, w}), onSelect(index) }
   */
  function HotSpots(opts) {
    const THREE = AFRAME.THREE;
    const tmp = new THREE.Vector3(), fwd = new THREE.Vector3();
    let spots = [];
    let started = false, muted = false, selected = -1;

    function dirFrom(yaw, pitch) {
      const y = yaw * Math.PI / 180, p = pitch * Math.PI / 180;
      return new THREE.Vector3(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
    }
    function anglesFrom(v) {
      return { yaw: Math.atan2(-v.x, -v.z) * 180 / Math.PI, pitch: Math.asin(Math.max(-1, Math.min(1, v.y))) * 180 / Math.PI };
    }

    // ---------------------------------------------------------- building
    function set(list) {
      list = list || [];
      const next = [];
      list.forEach((d, i) => {
        if (!d) return;
        const old = spots.find(s => s.index === i && !s.used && s.key === rebuildKey(d));
        if (old) {                                     // same media and settings: just move/resize/relabel
          old.used = true;
          Object.assign(old, { yaw: d.yaw, pitch: d.pitch, w: d.w || DEFAULT_W, label: d.label, dir: dirFrom(d.yaw, d.pitch) });
          if (old.labelEl) { old.labelEl.textContent = labelText(old); old.labelEl.hidden = !labelText(old); }
          next.push(old);
        } else {
          next.push(build(d, i));
        }
      });
      spots.forEach(s => { if (!s.used) destroy(s); s.used = false; });
      spots = next;
      spots.forEach(s => { s.used = false; });
      setSelected(selected);
    }

    function labelText(s) {
      if (s.label) return s.label;
      if (s.frame) return '';
      return s.isImage ? 'Picture' : s.showsPicture ? 'Video' : 'Sound';
    }

    function build(def, index) {
      const s = Object.assign({}, def, {
        index: index, key: rebuildKey(def), w: def.w || DEFAULT_W, dir: dirFrom(def.yaw, def.pitch),
        yt: Media.youTube(def.src), player: null, ready: false, playing: false,
        wantPlay: false, userPaused: false, lookStarted: false
      });
      s.kind = kindOf(def);
      s.isImage = s.kind === 'image';
      s.isVideoFile = !s.yt && s.kind === 'video';
      if (s.isImage) { s.hidden = false; s.loop = false; if (s.play === 'start') s.play = 'tap'; }
      if (s.hidden && s.play === 'tap') s.hidden = false;       // otherwise nothing could ever play it
      s.showsPicture = s.kind !== 'audio';
      s.inScene = s.showsPicture && !s.hidden;                  // a video or picture sitting in the room
      s.aspect = s.isImage ? 4 / 3 : 16 / 9;                    // a picture's real shape arrives when it loads

      const visible = !s.hidden || opts.editable;               // the author still sees hidden spots, faintly
      if (visible && s.isImage) buildImage(s);
      else if (visible && s.inScene) buildFrame(s);
      else if (visible) buildMarker(s);

      if (s.isImage) return s;                                  // nothing to play
      if (!s.mediaHost) {                                       // sound only / hidden: the player lives off screen
        s.mediaHost = el('div', 'spot-offscreen');
        opts.offscreen.appendChild(s.mediaHost);
      }
      prepare(s);
      return s;
    }

    // A video in the room, at its own size
    function buildFrame(s) {
      s.el = el('div', 'spot spot-video');
      s.labelEl = el('div', 'spot-cap');
      s.frame = el('div', 'spot-frame');
      s.mediaHost = el('div', 'spot-media');
      s.unmute = el('button', 'spot-unmute', '🔇 Tap for sound');
      s.unmute.hidden = true;
      s.unmute.addEventListener('click', () => unmute(s));
      s.frame.append(s.labelEl, s.mediaHost, s.unmute);
      s.labelEl.textContent = labelText(s);
      s.labelEl.hidden = !labelText(s);

      // YouTube: sit in the room as a small poster at the author's size, then grow into the
      // player (YouTube's minimum is 356×200) while it plays, and shrink back when it stops.
      if (s.yt) {
        s.el.classList.add('yt');
        s.poster = el('button', 'spot-poster',
          '<img alt="" src="https://i.ytimg.com/vi/' + s.yt.id + '/mqdefault.jpg"><span class="spot-play" aria-hidden="true">▶</span>');
        s.poster.setAttribute('aria-label', 'Play video' + (s.label ? ': ' + s.label : ''));
        s.poster.querySelector('img').addEventListener('error', e => {
          if (!/hqdefault/.test(e.target.src)) e.target.src = 'https://i.ytimg.com/vi/' + s.yt.id + '/hqdefault.jpg';
        });
        s.poster.addEventListener('click', () => { s.userPaused = false; play(s); });
        s.frame.appendChild(s.poster);
      }
      if (opts.editable) addEditHandles(s);
      s.el.appendChild(s.frame);
      opts.layer.appendChild(s.el);
    }

    function expand(s, on) {
      if (!s.poster || !!s.expanded === on) return;
      s.expanded = on;
      clearTimeout(s.collapseT);
      s.frame.classList.add('resizing');                       // animate the grow / shrink
      clearTimeout(s.resizeT);
      s.resizeT = setTimeout(() => s.frame.classList.remove('resizing'), 450);
      s.el.classList.toggle('expanded', on);
    }

    // A picture in the room. PNG, GIF and WebP transparency show through to the room behind.
    function buildImage(s) {
      s.el = el('div', 'spot spot-image' + (s.play === 'look' ? ' on-look' : ''));
      s.frame = el('div', 'spot-frame');
      s.labelEl = el('div', 'spot-cap');
      s.labelEl.textContent = labelText(s);
      s.labelEl.hidden = !labelText(s);
      const img = el('img', 'spot-img');
      img.alt = s.label || 'Picture';
      img.draggable = false;
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('load', () => {
        if (img.naturalWidth && img.naturalHeight) {
          s.aspect = img.naturalWidth / img.naturalHeight;
          s.frame.style.aspectRatio = String(s.aspect);
        }
        s.el.classList.add('loaded');
      });
      img.addEventListener('error', () => opts.onError(s.index, 'This picture couldn’t be loaded. Check the link opens the image itself and is shared as “Anyone with the link”.'), { once: true });
      img.src = Media.resolveMediaUrl(s.src, 'image').url;
      s.img = img;
      s.frame.style.aspectRatio = String(s.aspect);
      s.frame.append(s.labelEl, img);
      if (opts.editable) addEditHandles(s);
      else img.addEventListener('click', () => openLightbox(s));
      s.el.appendChild(s.frame);
      opts.layer.appendChild(s.el);
    }

    // Tapping a picture shows it full screen, e.g. to read an old letter or poster
    function openLightbox(s) {
      if (s.play === 'look' && !s.el.classList.contains('shown')) return;
      const box = el('div', 'lightbox');
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-label', s.label || 'Picture');
      const big = el('img');
      big.src = s.img.src; big.alt = s.img.alt;
      const close = el('button', 'lightbox-close', '✕');
      close.setAttribute('aria-label', 'Close');
      box.append(big, close);
      if (s.label) box.appendChild(el('p', 'lightbox-cap', esc(s.label)));
      const shut = () => { box.remove(); document.removeEventListener('keydown', onKey); };
      const onKey = e => { if (e.key === 'Escape') shut(); };
      box.addEventListener('click', shut);
      document.addEventListener('keydown', onKey);
      document.body.appendChild(box);
      close.focus();
    }

    // A speaker (or, for the author, a faint marker for a hidden spot)
    function buildMarker(s) {
      s.el = el('div', 'spot spot-audio' + (s.hidden ? ' ghost' : ''));
      const label = labelText(s) + (s.hidden ? ' (hidden)' : '');
      s.marker = el('button', 'spot-marker',
        '<span class="spot-dot" aria-hidden="true">' + (s.showsPicture ? '▶' : '🔊') + '</span><span class="spot-label"></span>');
      s.labelEl = s.marker.querySelector('.spot-label');
      s.labelEl.textContent = label;
      s.marker.setAttribute('aria-label', 'Play sound: ' + labelText(s));
      s.unmute = el('button', 'spot-unmute small', '🔇 Tap for sound');
      s.unmute.hidden = true;
      s.unmute.addEventListener('click', () => unmute(s));
      s.el.append(s.marker, s.unmute);
      if (opts.editable) makeDraggable(s, s.marker, () => toggle(s));
      else s.marker.addEventListener('click', () => toggle(s));
      opts.layer.appendChild(s.el);
    }

    function destroy(s) {
      clearTimeout(s.check);
      try { if (s.player && s.player.destroy) s.player.destroy(); } catch (e) {}
      if (s.media) { s.media.pause(); s.media.removeAttribute('src'); s.media.load(); }
      if (s.el) s.el.remove();
      if (s.mediaHost && s.mediaHost.parentNode === opts.offscreen) s.mediaHost.remove();
      if (s.playing) { s.playing = false; activityChanged(); }
    }

    // Players are made straight away, so a YouTube video shows its own poster and play button
    function prepare(s) {
      if (s.isImage) return;
      if (s.yt) {
        const host = el('div');
        s.mediaHost.appendChild(host);
        loadYouTubeApi().then(YT => {
          if (!host.isConnected) return;
          s.player = new YT.Player(host, {
            width: '100%', height: '100%', videoId: s.yt.id,
            playerVars: Object.assign({ playsinline: 1, rel: 0, controls: 1, start: s.yt.start },
              s.loop ? { loop: 1, playlist: s.yt.id } : {}),
            events: {
              onReady: () => {
                s.ready = true;
                if (muted) s.player.mute();
                applyVolume(s);
                if (s.wantPlay) play(s);
              },
              onStateChange: e => {
                const on = e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.BUFFERING;
                if (e.data === YT.PlayerState.ENDED) s.userPaused = true;
                if (on) s.userPaused = false;
                setPlaying(s, on);
              },
              onError: e => opts.onError(s.index, 'YouTube won’t play this: ' + (YT_ERRORS[e.data] || 'error ' + e.data) + '.')
            }
          });
        }).catch(err => opts.onError(s.index, err.message));
      } else {
        const m = document.createElement(s.isVideoFile && s.inScene ? 'video' : 'audio');
        m.preload = s.inScene ? 'metadata' : 'auto';
        m.setAttribute('playsinline', '');
        m.loop = !!s.loop;
        m.muted = muted;
        if (m.tagName === 'VIDEO') { m.controls = true; m.playsInline = true; }
        m.src = Media.resolveMediaUrl(s.src, s.isVideoFile ? 'video' : 'audio').url;
        m.addEventListener('play', () => setPlaying(s, true));
        m.addEventListener('pause', () => setPlaying(s, false));
        m.addEventListener('ended', () => { s.userPaused = true; setPlaying(s, false); });
        m.addEventListener('error', () => opts.onError(s.index, 'This file couldn’t be loaded. Check the link and that it’s shared as “Anyone with the link”.'), { once: true });
        s.mediaHost.appendChild(m);
        s.media = m;
        s.ready = true;
      }
    }

    // ---------------------------------------------------------- playing
    function play(s) {
      expand(s, true);
      if (!s.ready) { s.wantPlay = true; return; }
      s.wantPlay = false;
      if (s.media) {
        s.media.play().catch(() => {
          if (!s.media) return;
          s.media.muted = true; s.media.play().catch(() => {}); needTap(s);
        });
        return;
      }
      s.player.playVideo();
      // Phones can block sound that doesn't start from a tap: fall back to muted, with a button for sound
      clearTimeout(s.check);
      s.check = setTimeout(() => {
        const st = s.player.getPlayerState && s.player.getPlayerState();
        if (st === 1 || st === 3 || s.userPaused || (s.play === 'look' && !s.lookStarted)) return;
        s.player.mute(); s.player.playVideo(); needTap(s);
      }, 1800);
    }
    function pause(s) {
      s.wantPlay = false;
      clearTimeout(s.check);
      if (s.media) s.media.pause();
      else if (s.player && s.ready) s.player.pauseVideo();
    }
    function toggle(s) {
      if (s.playing || s.wantPlay) { s.userPaused = true; pause(s); }
      else { s.userPaused = false; play(s); }
    }
    function needTap(s) {
      if (muted) return;
      if (s.unmute) s.unmute.hidden = false;
      if (!s.el) opts.onNeedTap('Tap the screen to turn on the sound', () => unmute(s));
    }
    function unmute(s) {
      if (s.unmute) s.unmute.hidden = true;
      if (s.media) { s.media.muted = muted; s.media.play().catch(() => {}); }
      else if (s.player) { if (!muted) s.player.unMute(); s.player.playVideo(); }
    }
    function setPlaying(s, on) {
      if (s.playing === on) return;
      s.playing = on;
      if (s.el) s.el.classList.toggle('playing', on);
      if (s.testBtn) s.testBtn.textContent = on ? '❚❚ Pause' : '▶ Test';
      if (on) { clearTimeout(s.collapseT); expand(s, true); }
      else if (s.poster) {                                      // shrink back to the poster a moment after stopping
        clearTimeout(s.collapseT);
        s.collapseT = setTimeout(() => { if (!s.playing && !s.wantPlay) expand(s, false); }, 1500);
      }
      activityChanged();
    }
    // While a video is playing, background sounds drop to a quarter volume
    function activityChanged() {
      spots.forEach(applyVolume);
      opts.onActivity(spots.filter(x => x.playing && x.showsPicture).length);
    }
    function applyVolume(s) {
      const duck = !s.showsPicture && spots.some(x => x.playing && x.showsPicture);
      const v = duck ? 0.25 : 1;
      if (s.media) s.media.volume = v;
      else if (s.player && s.ready && s.player.setVolume) s.player.setVolume(v * 100);
    }

    // ---------------------------------------------------------- screen geometry
    function pxPerDegree() {
      const camera = opts.sceneEl.camera;
      return opts.sceneEl.canvas.clientHeight / ((camera && camera.fov) || 75);
    }
    // The size the author chose (a YouTube spot's poster size)
    function authoredWidth(s) {
      return Math.max(s.isImage ? 24 : 60, s.w * pxPerDegree());
    }
    // The size it's shown at right now: a playing YouTube video never goes below YouTube's minimum
    function frameWidth(s) {
      if (s.yt) return s.expanded ? Math.max(YT_MIN_PX, s.w * pxPerDegree()) : authoredWidth(s);
      return Math.max(s.isImage ? 24 : 120, s.w * pxPerDegree());
    }
    // Screen point → direction in the room
    function directionAt(sx, sy) {
      const camera = opts.sceneEl.camera, c = opts.sceneEl.canvas;
      const r = c.getBoundingClientRect();
      const v = new THREE.Vector3(((sx - r.left) / r.width) * 2 - 1, -((sy - r.top) / r.height) * 2 + 1, 0.5).unproject(camera);
      const origin = new THREE.Vector3(); camera.getWorldPosition(origin);
      return v.sub(origin).normalize();
    }

    // ---------------------------------------------------------- every frame (after A-Frame draws)
    function update() {
      const camera = opts.sceneEl.camera;
      if (!camera || !spots.length) return;
      camera.getWorldDirection(fwd);
      const canvas = opts.sceneEl.canvas;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const ppd = pxPerDegree();

      spots.forEach(s => {
        const angle = fwd.angleTo(s.dir) * 180 / Math.PI;
        let x = 0, y = 0, onScreen = angle < 85;
        if (onScreen) {
          tmp.copy(s.dir).multiplyScalar(50).project(camera);
          x = (tmp.x + 1) / 2 * w; y = (1 - tmp.y) / 2 * h;
        }

        // "Plays when looked at": while the centre of the screen (the crosshair) is on it
        if (started && s.play === 'look' && !s.dragging) {
          let on, off;
          if (s.inScene && onScreen) {
            // Starts when the crosshair is on the spot as the author sized it; stops when it leaves
            // what's showing (for YouTube that's the bigger player while it plays)
            const aw = s.yt ? authoredWidth(s) : frameWidth(s), fw = frameWidth(s);
            const dx = Math.abs(w / 2 - x), dy = Math.abs(h / 2 - y);
            on = dx < aw / 2 && dy < aw / s.aspect / 2;
            off = dx > fw / 2 + 6 || dy > fw / s.aspect / 2 + 6;   // a few pixels of slack stops flickering at the edge
          } else if (s.inScene) {
            on = false; off = true;
          } else {
            on = angle < 12; off = angle > 18;                      // sounds: about the size of their marker
          }
          if (s.isImage) {                                          // pictures fade in while looked at
            if (on) s.el && s.el.classList.add('shown');
            else if (off) s.el && s.el.classList.remove('shown');
          } else if (on && !s.playing && !s.wantPlay && !s.userPaused) { s.lookStarted = true; play(s); }
          else if (off) {
            if (s.lookStarted && (s.playing || s.wantPlay)) pause(s);
            s.lookStarted = false; s.userPaused = false;
          }
        }

        if (!s.el) return;
        if (!onScreen) { s.el.style.visibility = 'hidden'; return; }
        s.el.style.visibility = 'visible';
        s.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
        if (s.frame) {
          const fw = Math.round(frameWidth(s));
          if (fw !== s.lastW) { s.frame.style.width = fw + 'px'; s.lastW = fw; }
        }
      });
    }

    // ---------------------------------------------------------- author editing (preview only)
    function addEditHandles(s) {
      const edit = el('div', 'spot-edit');
      edit.innerHTML = '<button type="button" class="spot-test" title="Play or pause">▶ Test</button>' +
        ['nw', 'ne', 'sw', 'se'].map(c => '<span class="spot-handle h-' + c + '" data-corner="' + c + '"></span>').join('');
      const test = edit.querySelector('.spot-test');
      if (s.isImage) test.remove();
      test.addEventListener('click', e => { e.stopPropagation(); toggle(s); });
      test.addEventListener('pointerdown', e => e.stopPropagation());
      s.frame.appendChild(edit);
      s.testBtn = test;

      edit.addEventListener('pointerdown', e => {
        e.stopPropagation(); e.preventDefault();
        opts.onSelect(s.index);
        const corner = e.target.dataset && e.target.dataset.corner;
        const r = s.el.getBoundingClientRect();                    // the spot's centre point
        const grab = { dx: e.clientX - r.left, dy: e.clientY - r.top };
        beginDrag(s, edit, e, ev => {
          if (corner) {
            // Resize around the centre: width follows whichever direction you pull further
            const half = Math.max(Math.abs(ev.clientX - r.left), Math.abs(ev.clientY - r.top) * s.aspect);
            s.w = Math.max(5, Math.min(140, (half * 2) / pxPerDegree()));
          } else {
            s.dir = directionAt(ev.clientX - grab.dx, ev.clientY - grab.dy);
          }
        });
      });
    }

    function makeDraggable(s, handle, onClick) {
      handle.addEventListener('pointerdown', e => {
        e.stopPropagation(); e.preventDefault();
        opts.onSelect(s.index);
        const r = s.el.getBoundingClientRect();
        const grab = { dx: e.clientX - r.left, dy: e.clientY - r.top };
        beginDrag(s, handle, e, ev => { s.dir = directionAt(ev.clientX - grab.dx, ev.clientY - grab.dy); }, onClick);
      });
    }

    function beginDrag(s, target, e, onMove, onClick) {
      const start = { x: e.clientX, y: e.clientY };
      let moved = false;
      s.dragging = true;
      opts.layer.classList.add('dragging');                         // so videos don't swallow the pointer
      try { target.setPointerCapture(e.pointerId); } catch (err) {}
      const move = ev => {
        if (ev.pointerId !== e.pointerId) return;
        if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
        moved = true;
        onMove(ev);
      };
      const up = ev => {
        if (ev.pointerId !== e.pointerId) return;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        s.dragging = false;
        opts.layer.classList.remove('dragging');
        if (moved) {
          const a = anglesFrom(s.dir);
          s.yaw = a.yaw; s.pitch = a.pitch;
          opts.onEdit(s.index, { yaw: Math.round(a.yaw), pitch: Math.round(a.pitch), w: Math.round(s.w) });
        } else if (onClick) onClick();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    }

    function setSelected(i) {
      selected = i;
      spots.forEach(s => { if (s.el) s.el.classList.toggle('selected', s.index === i); });
    }

    // ---------------------------------------------------------- starting and sound
    // Call from inside the viewer's first tap: unlocks sound on phones, starts "as soon as it opens" spots.
    // Call from inside a tap: lets sounds play later on phones (iPhones need an audio element touched during a tap)
    let unlocked = false;
    function unlock() {
      if (unlocked) return;
      unlocked = true;
      spots.forEach(s => {
        if (s.media && !s.inScene) {
          const m = s.media; m.muted = true;
          m.play().then(() => { if (!s.wantPlay && !s.playing) m.pause(); m.muted = muted; }).catch(() => { m.muted = muted; });
        }
      });
    }
    // Begin: "as soon as it opens" spots play, "when looked at" spots start watching the crosshair
    function start() {
      if (started) return;
      unlock();
      started = true;
      spots.forEach(s => { if (s.play === 'start') play(s); });
    }
    function setMuted(m) {
      muted = m;
      spots.forEach(s => {
        if (s.media) s.media.muted = m;
        else if (s.player && s.ready) (m ? s.player.mute() : s.player.unMute());
        if (!m && s.unmute) s.unmute.hidden = true;
      });
    }
    function stopAll() { spots.forEach(s => { s.userPaused = true; pause(s); }); }

    return {
      set, update, start, unlock, stopAll, setMuted, setSelected,
      get count() { return spots.length; },
      get hasLook() { return spots.some(s => s.play === 'look'); }
    };
  }

  global.HotSpots = HotSpots;
  global.HotSpots.encode = encodeSpot;
  global.HotSpots.decode = decodeSpot;
  global.HotSpots.DEFAULT_W = DEFAULT_W;
  global.HotSpots.kindOf = kindOf;
  global.HotSpots.guessKind = guessKind;
  global.loadYouTubeApi = loadYouTubeApi;
})(window);
