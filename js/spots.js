/*
 * Video spots: YouTube videos (or audio/video files) pinned to places in the 360 view.
 *
 * Each spot:  { src, yaw, pitch, play: 'tap'|'look'|'start', audioOnly, hidden, label }
 *   yaw/pitch  where it sits, in degrees (same directions as the "start from this view" setting)
 *   play       tap   → plays when the viewer taps its marker
 *              look  → plays while the viewer is facing it, pauses when they turn away
 *              start → plays as soon as the experience starts
 *   audioOnly  sound only, no picture (a speaker marker instead)
 *   hidden     no marker at all (needs 'look' or 'start', or nothing would ever play it)
 *
 * In the link, a spot is written as   src|yaw|pitch|flags|label
 * with flags made of: l (look) s (start) a (audio only) h (hidden).
 */
(function (global) {
  'use strict';

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

  // ------------------------------------------------------------------ link format
  function encodeSpot(s, shorten) {
    const flags = (s.play === 'look' ? 'l' : s.play === 'start' ? 's' : '') + (s.audioOnly ? 'a' : '') + (s.hidden ? 'h' : '');
    const label = (s.label || '').replace(/\|/g, '/').trim();
    return [shorten ? Media.shorten(s.src) : s.src.trim(), Math.round(s.yaw), Math.round(s.pitch), flags, label].join('|')
      .replace(/\|+$/, '');
  }
  function decodeSpot(str) {
    const parts = String(str).split('|');
    if (!parts[0]) return null;
    const flags = parts[3] || '';
    return {
      src: parts[0],
      yaw: Number(parts[1]) || 0,
      pitch: Number(parts[2]) || 0,
      play: flags.includes('l') ? 'look' : flags.includes('s') ? 'start' : 'tap',
      audioOnly: flags.includes('a'),
      hidden: flags.includes('h'),
      label: parts.slice(4).join('|')
    };
  }

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
   * opts: { sceneEl, layer, offscreen, onActivity(nPlaying), onError(index, message), onNeedTap(text) }
   */
  function HotSpots(opts) {
    const THREE = AFRAME.THREE;
    const tmp = new THREE.Vector3(), fwd = new THREE.Vector3();
    let spots = [];
    let started = false;

    function dirFrom(yaw, pitch) {
      const y = yaw * Math.PI / 180, p = pitch * Math.PI / 180;
      return new THREE.Vector3(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
    }

    // ---------------------------------------------------------- building
    function set(list) {
      spots.forEach(destroy);
      // keep each spot's position in the list as its number, even if some entries are empty
      spots = (list || []).map((d, i) => (d ? build(d, i) : null)).filter(Boolean);
      if (started) spots.forEach(prepare);
    }

    function build(def, index) {
      const s = Object.assign({}, def, {
        index: index, dir: dirFrom(def.yaw, def.pitch),
        yt: Media.youTube(def.src), player: null, ready: false, playing: false,
        wantPlay: false, userPaused: false, lookStarted: false, mutedFallback: false
      });
      s.isVideoFile = !s.yt && Media.looksLikeVideo(s.src);
      if (!s.yt && !s.isVideoFile) s.audioOnly = true;          // an MP3 is sound only, whatever was ticked
      if (s.hidden && s.play === 'tap') s.hidden = false;       // otherwise nothing could ever play it
      s.showsPicture = !s.audioOnly;

      if (!s.hidden) {
        s.el = el('div', 'spot' + (s.showsPicture ? ' spot-video' : ' spot-audio'));
        const what = s.showsPicture ? 'video' : 'sound';
        const label = s.label || (s.showsPicture ? 'Video' : 'Sound');
        s.marker = el('button', 'spot-marker', (s.yt && s.showsPicture
          ? '<span class="spot-thumb" style="background-image:url(https://i.ytimg.com/vi/' + s.yt.id + '/mqdefault.jpg)"><span class="spot-play" aria-hidden="true">▶</span></span>'
          : '<span class="spot-dot" aria-hidden="true">' + (s.showsPicture ? '▶' : '🔊') + '</span>') +
          '<span class="spot-label">' + esc(label) + '</span>');
        s.marker.setAttribute('aria-label', 'Play ' + what + ': ' + label);
        s.marker.addEventListener('click', () => toggle(s));
        s.el.appendChild(s.marker);

        if (s.showsPicture) {
          s.panel = el('div', 'spot-panel closed');
          const close = el('button', 'spot-close', '✕');
          close.setAttribute('aria-label', 'Close video');
          close.addEventListener('click', () => { s.userPaused = true; pause(s); });
          s.mediaHost = el('div', 'spot-media');
          s.unmute = el('button', 'spot-unmute', '🔇 Tap for sound');
          s.unmute.hidden = true;
          s.unmute.addEventListener('click', () => unmute(s));
          s.panel.append(close, s.mediaHost, s.unmute);
          s.el.appendChild(s.panel);
        } else {
          s.unmute = el('button', 'spot-unmute small', '🔇 Tap for sound');
          s.unmute.hidden = true;
          s.unmute.addEventListener('click', () => unmute(s));
          s.el.appendChild(s.unmute);
        }
        opts.layer.appendChild(s.el);
      }
      if (!s.mediaHost) {                                        // sound only or hidden: player lives off screen
        s.mediaHost = el('div', 'spot-offscreen');
        opts.offscreen.appendChild(s.mediaHost);
      }
      return s;
    }

    function destroy(s) {
      try { if (s.player && s.player.destroy) s.player.destroy(); } catch (e) {}
      if (s.media) { s.media.pause(); s.media.removeAttribute('src'); s.media.load(); }
      if (s.el) s.el.remove();
      if (s.mediaHost && s.mediaHost.parentNode === opts.offscreen) s.mediaHost.remove();
    }

    // Create the players ahead of time so they're ready the moment they're needed
    function prepare(s) {
      if (s.player || s.media) return;
      if (s.yt) {
        const host = el('div');
        s.mediaHost.appendChild(host);
        loadYouTubeApi().then(YT => {
          s.player = new YT.Player(host, {
            width: '100%', height: '100%', videoId: s.yt.id,
            playerVars: { playsinline: 1, rel: 0, controls: 1, start: s.yt.start },
            events: {
              onReady: () => { s.ready = true; if (s.wantPlay) play(s); },
              onStateChange: e => {
                const on = e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.BUFFERING;
                if (e.data === YT.PlayerState.ENDED) { s.userPaused = true; showOpen(s, false); }
                setPlaying(s, on);
              },
              onError: e => opts.onError(s.index, 'YouTube won’t play this: ' + (YT_ERRORS[e.data] || 'error ' + e.data) + '.')
            }
          });
        }).catch(err => opts.onError(s.index, err.message));
      } else {
        const m = document.createElement(s.isVideoFile && s.showsPicture ? 'video' : 'audio');
        m.preload = 'auto';
        m.setAttribute('playsinline', '');
        if (m.tagName === 'VIDEO') { m.controls = true; m.playsInline = true; }
        m.src = Media.resolveMediaUrl(s.src, s.isVideoFile ? 'video' : 'audio').url;
        m.addEventListener('play', () => setPlaying(s, true));
        m.addEventListener('pause', () => setPlaying(s, false));
        m.addEventListener('ended', () => { s.userPaused = true; showOpen(s, false); });
        m.addEventListener('error', () => opts.onError(s.index, 'This file couldn’t be loaded. Check the link and that it’s shared as “Anyone with the link”.'), { once: true });
        s.mediaHost.appendChild(m);
        s.media = m;
        s.ready = true;
      }
    }

    // ---------------------------------------------------------- playing
    function play(s) {
      showOpen(s, true);
      if (!s.ready) { s.wantPlay = true; prepare(s); return; }
      s.wantPlay = false;
      if (s.media) {
        s.media.play().catch(() => { s.media.muted = true; s.media.play().catch(() => {}); needTap(s); });
        return;
      }
      s.player.playVideo();
      // Phones can block sound that doesn't start from a tap. Fall back to muted, with a button for sound.
      clearTimeout(s.check);
      s.check = setTimeout(() => {
        const st = s.player.getPlayerState && s.player.getPlayerState();
        if (st === 1 || st === 3) return;
        s.player.mute(); s.player.playVideo(); needTap(s);
      }, 1800);
    }
    function pause(s) {
      s.wantPlay = false;
      clearTimeout(s.check);
      if (s.media) s.media.pause();
      else if (s.player && s.ready) s.player.pauseVideo();
      showOpen(s, false);
    }
    function toggle(s) {
      if (s.playing || s.wantPlay) { s.userPaused = true; pause(s); }
      else { s.userPaused = false; play(s); }
    }
    function needTap(s) {
      s.mutedFallback = true;
      if (s.unmute) s.unmute.hidden = false;
      else opts.onNeedTap('Tap the screen to turn on the sound', () => unmute(s));
    }
    function unmute(s) {
      s.mutedFallback = false;
      if (s.unmute) s.unmute.hidden = true;
      if (s.media) { s.media.muted = false; s.media.play().catch(() => {}); }
      else if (s.player) { s.player.unMute(); s.player.playVideo(); }
    }
    function showOpen(s, open) {
      if (s.panel) s.panel.classList.toggle('closed', !open);
      if (s.el) s.el.classList.toggle('open', open);
    }
    function setPlaying(s, on) {
      if (s.playing === on) return;
      s.playing = on;
      if (s.el) s.el.classList.toggle('playing', on);
      opts.onActivity(spots.filter(x => x.playing).length);
    }

    // ---------------------------------------------------------- every frame (after A-Frame draws)
    function update() {
      const camera = opts.sceneEl.camera;
      if (!camera || !spots.length) return;
      camera.getWorldDirection(fwd);
      const canvas = opts.sceneEl.canvas;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const fov = camera.fov || 75;

      spots.forEach(s => {
        const angle = fwd.angleTo(s.dir) * 180 / Math.PI;

        // "Plays when looked at": start within 20°, stop past 50° (the gap stops flickering)
        if (started && s.play === 'look') {
          if (angle < 20 && !s.playing && !s.wantPlay && !s.userPaused) { s.lookStarted = true; play(s); }
          else if (angle > 50) {
            if (s.lookStarted && (s.playing || s.wantPlay)) pause(s);
            s.lookStarted = false; s.userPaused = false;
          }
        }

        if (!s.el) return;
        if (angle > 85) { s.el.style.visibility = 'hidden'; return; }
        tmp.copy(s.dir).multiplyScalar(50).project(camera);
        const x = (tmp.x + 1) / 2 * w, y = (1 - tmp.y) / 2 * h;
        s.el.style.visibility = 'visible';
        s.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
        if (s.panel && !s.panel.classList.contains('closed')) {
          // Video stays at least 356×200 (YouTube's minimum player size), grows as you zoom in,
          // and is nudged sideways so an open video never hangs off the edge of the screen.
          const pw = Math.max(356, Math.min(Math.min(720, w - 16), 420 * 75 / fov));
          const left = Math.max(8, Math.min(w - pw - 8, x - pw / 2));
          s.panel.style.width = pw + 'px';
          s.panel.style.transform = 'translate(' + (left - x).toFixed(1) + 'px, -50%)';
        }
      });
    }

    // ---------------------------------------------------------- starting
    // Call from inside the viewer's first tap: gets players ready and unlocks sound on phones.
    function start() {
      if (started) return;
      started = true;
      spots.forEach(s => {
        prepare(s);
        if (s.media && s.play !== 'start') {   // iPhones: a media element touched during a tap may play later
          const m = s.media; m.muted = true;
          m.play().then(() => { if (!s.wantPlay && !s.playing) m.pause(); m.muted = false; }).catch(() => { m.muted = false; });
        }
        if (s.play === 'start') play(s);
      });
    }

    function stopAll() { spots.forEach(s => { s.userPaused = true; pause(s); }); }

    return { set, update, start, stopAll, get count() { return spots.length; } };
  }

  global.HotSpots = HotSpots;
  global.HotSpots.encode = encodeSpot;
  global.HotSpots.decode = decodeSpot;
  global.loadYouTubeApi = loadYouTubeApi;
})(window);
