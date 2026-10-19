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
 *   pin        optional: the four corners [[dyaw, dpitch] × 4] (top-left, top-right, bottom-right,
 *              bottom-left) relative to the centre, so a picture can be fitted to a wall in perspective
 *
 * In a link, a spot is written as   src~yaw~pitch~flags~label~w~pin   (pin = 8 numbers, comma-separated).
 * Inside each field, % ~ | ! * ' ( ) and line breaks are escaped (%25, %7E …) so the separators stay
 * unambiguous and the whole link survives being pasted into emails and chats.
 * Links made before October 2026 used | as the separator; those are still read.
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
  // File-sharing links don't say what kind of file they are
  const FILE_HOSTS = /(drive\.google\.com\/(file|open|uc)|docs\.google\.com\/uc|1drv\.ms|onedrive\.live\.com|sharepoint\.com|dropbox\.com)/i;

  // What the link (or text) itself suggests: 'video' | 'audio' | 'image' | 'link' | 'text',
  // or '' when it can't tell (e.g. Google Drive links)
  function guessKind(src) {
    src = Media.expand(src);
    if (!src || /^gd:/.test(src)) return '';
    if (Media.youTube(src) || Media.looksLikeVideo(src)) return 'video';
    if (Media.looksLikeImage(src)) return 'image';
    if (Media.looksLikeAudio(src)) return 'audio';
    if (Media.looksLikeModel(src)) return 'model';
    if (/^(https?:\/\/|www\.)/i.test(src)) return FILE_HOSTS.test(src) ? '' : 'link';
    if (/^[\w.\/~-]+$/.test(src) && src.includes('/')) return '';   // a file on this site
    if (/^[\w.~-]+\.[a-z0-9]{2,5}$/i.test(src) && Media.looksLikeDoc(src)) return '';   // a document next to the page
    return 'text';                                                    // anything else is words to show
  }
  // The kind it will actually be shown as
  function kindOf(d) {
    const t = d.type || (d.audioOnly ? 'audio' : '');
    const guess = guessKind(d.src);
    if (t === 'text' || guess === 'text') return 'text';
    if (t === 'link') return 'link';
    if (t === 'doc') return 'doc';                 // a document, shown full screen (always chosen by the author)
    if (Media.youTube(d.src)) return t === 'audio' ? 'audio' : 'video';
    if (guess === 'image') return 'image';
    if (guess === 'audio') return 'audio';
    if (guess === 'model') return 'model';
    if (guess === 'video') return t === 'audio' ? 'audio' : 'video';
    if (guess === 'link') return t || 'link';      // a web page, unless the author says it's really a file
    return t || 'audio';
  }
  // Only ordinary web addresses may be opened from a link spot
  function safeUrl(src) {
    let u = Media.expand(src);
    if (/^www\./i.test(u)) u = 'https://' + u;
    try {
      const url = new URL(u, location.href);
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch (e) { return ''; }
  }
  // Text is stored in the link with | % and line breaks escaped
  // Older |-separated links: text was stored with only | % and line breaks escaped
  const unpackOldText = t => t.slice(2).replace(/%0A/gi, '\n').replace(/%7C/gi, '|').replace(/%25/g, '%');
  // Escaping inside a field (new ~-separated links)
  const FIELD_ESC = { '%': '%25', '~': '%7E', '|': '%7C', '!': '%21', '*': '%2A', "'": '%27', '(': '%28', ')': '%29', '\n': '%0A' };
  const escField = v => String(v).replace(/\r?\n/g, '\n').replace(/[%~|!*'()\n]/g, c => FIELD_ESC[c]);
  const unescField = v => String(v).replace(/%(25|7E|7C|21|2A|27|28|29|0A)/gi, (m, h) => h.toUpperCase() === '0A' ? '\n' : String.fromCharCode(parseInt(h, 16)));

  // ------------------------------------------------------------------ link format
  function encodeSpot(s, shorten) {
    const kind = kindOf(s), guess = guessKind(s.src);
    const kindFlag = kind === 'text' || kind === guess || (kind === 'video' && Media.youTube(s.src)) ? ''
      : { audio: 'a', video: 'v', image: 'i', link: 'k', model: 'm', doc: 'p' }[kind];
    const flags = (s.play === 'look' ? 'l' : s.play === 'start' ? 's' : '') + kindFlag +
      (s.hidden ? 'h' : '') + (s.loop ? 'r' : '') + (s.dwell ? 'd' : '') + (s.spin ? 'o' : '') + (s.flat ? 'f' : '') + (s.stacked && kind === 'video' ? 'x' + (s.alpha ? 'w' : '') : '');
    const label = (s.label || '').trim();
    const w = s.w && Math.round(s.w) !== DEFAULT_W ? Math.round(s.w) : '';
    const src = kind === 'text' ? 't:' + s.src.trim() : shorten ? Media.shorten(s.src) : s.src.trim();
    const pin = validPin(s.pin) ? s.pin.map(c => c.map(n => Math.round(n)).join(',')).join(',') : '';
    const rot = Array.isArray(s.rot) && s.rot.some(n => Math.round(n)) ? s.rot.map(n => Math.round(n)).join(',') : '';
    return [escField(src), Math.round(s.yaw), Math.round(s.pitch), flags, escField(label), w, pin, rot].join('~').replace(/~+$/, '');
  }
  function decodeSpot(str) {
    str = String(str || '');
    const old = str.includes('|');                    // links made before October 2026
    const parts = old ? str.split('|') : str.split('~').map(unescField);
    if (!parts[0]) return null;
    const flags = parts[3] || '';
    const isText = /^t:/.test(parts[0]);
    return {
      src: isText ? (old ? unpackOldText(parts[0]) : parts[0].slice(2)) : parts[0],
      yaw: Number(parts[1]) || 0,
      pitch: Number(parts[2]) || 0,
      play: flags.includes('l') ? 'look' : flags.includes('s') ? 'start' : 'tap',
      type: isText ? 'text' : flags.includes('p') ? 'doc' : flags.includes('m') ? 'model' : flags.includes('k') ? 'link' : flags.includes('i') ? 'image' : flags.includes('a') ? 'audio' : flags.includes('v') ? 'video' : '',
      dwell: flags.includes('d'),
      hidden: flags.includes('h'),
      loop: flags.includes('r'),
      label: parts[4] || '',
      w: Number(parts[5]) || DEFAULT_W,
      pin: parsePin(parts[6]),
      spin: flags.includes('o'),
      flat: flags.includes('f'),
      stacked: flags.includes('x'),
      alpha: flags.includes('x') && flags.includes('w'),       // a WebM with its own transparency (not a stencil MP4)
      rot: (() => { const r = String(parts[7] || '').split(',').map(Number); return r.length === 3 && r.every(Number.isFinite) ? r : [0, 0, 0]; })()
    };
  }
  function validPin(p) {
    return Array.isArray(p) && p.length === 4 && p.every(c => Array.isArray(c) && c.length === 2 && c.every(Number.isFinite));
  }
  function parsePin(str) {
    const n = String(str || '').split(',').map(Number);
    if (n.length !== 8 || !n.every(Number.isFinite)) return null;
    return [[n[0], n[1]], [n[2], n[3]], [n[4], n[5]], [n[6], n[7]]];
  }
  // Settings that need the player rebuilt when they change (moving, resizing and relabelling don't)
  const rebuildKey = d => [d.src, kindOf(d), d.play, !!d.hidden, !!d.loop, !!d.dwell, !!d.stacked, !!d.alpha, kindOf(d) === 'link' ? d.label : ''].join('|');
  const MODEL_DIST = 8;            // 3D models sit this far from the viewer (the 360 photo is much further away)

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
    let started = false, muted = false, selected = -1, lastTick = 0;

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
          Object.assign(old, { yaw: d.yaw, pitch: d.pitch, w: d.w || DEFAULT_W, label: d.label, dir: dirFrom(d.yaw, d.pitch),
            pin: validPin(d.pin) ? d.pin.map(c => c.slice()) : null, lastW: null,
            rot: Array.isArray(d.rot) ? d.rot.slice() : [0, 0, 0], spin: !!d.spin });
          if (old.isModel && !!d.flat !== !!old.flat) { old.flat = !!d.flat; applyLook(old); }
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
      return s.isImage ? 'Picture' : s.isLink ? 'Link' : s.isDoc ? 'Document' : s.showsPicture ? 'Video' : 'Sound';
    }

    function build(def, index) {
      const s = Object.assign({}, def, {
        index: index, key: rebuildKey(def), w: def.w || DEFAULT_W, dir: dirFrom(def.yaw, def.pitch),
        pin: validPin(def.pin) ? def.pin.map(c => c.slice()) : null,
        yt: Media.youTube(def.src), player: null, ready: false, playing: false,
        wantPlay: false, userPaused: false, lookStarted: false
      });
      s.kind = kindOf(def);
      s.isImage = s.kind === 'image';
      s.isText = s.kind === 'text';
      s.isLink = s.kind === 'link';
      s.isModel = s.kind === 'model';
      s.isDoc = s.kind === 'doc';
      // Google Drive won't let other websites play its sounds and videos (since 2024): only its own player can.
      // So those sit in the room as Google's player, which the viewer taps; nothing can start, stop or loop them.
      s.drivePlayer = (s.kind === 'audio' || s.kind === 'video') && !Media.youTube(def.src) && /drive\.google\.com|docs\.google\.com\/uc|^gd:/i.test(Media.expand(def.src).trim());
      if (s.drivePlayer) { s.hidden = false; s.loop = false; s.play = 'tap'; }
      // A see-through ("stencil") video: picture on top, black-and-white stencil underneath, drawn into the room
      s.isStacked = s.kind === 'video' && !!def.stacked && !Media.youTube(def.src) && !s.drivePlayer;
      if (s.isStacked) { s.hidden = false; s.pin = null; }
      s.ownAlpha = s.isStacked && !!def.alpha;      // or a WebM that's see-through by itself
      s.rot = Array.isArray(def.rot) ? def.rot.slice() : [0, 0, 0];
      s.isStill = s.isImage || s.isText || s.isLink || s.isModel || s.isDoc || s.drivePlayer;   // nothing to play
      s.isVideoFile = !s.yt && s.kind === 'video';
      if (s.isStill) { s.hidden = false; s.loop = false; if (s.play === 'start' || !(s.isImage || s.isModel)) s.play = 'tap'; }
      if (s.isModel) s.pin = null;
      if (s.dwell) {                                            // shown (and played) once the dot has been looked at
        s.hidden = false;
        if (s.play !== 'tap') s.play = 'tap';
      }
      if (s.hidden && s.play === 'tap') s.hidden = false;       // otherwise nothing could ever play it
      s.showsPicture = s.kind !== 'audio' || s.drivePlayer;
      s.inScene = s.showsPicture && !s.hidden;                  // something sitting in the room
      s.aspect = s.isImage ? 4 / 3 : s.drivePlayer && s.kind === 'audio' ? 3 : 16 / 9;                    // a picture's real shape arrives when it loads

      const visible = !s.hidden || opts.editable;               // the author still sees hidden spots, faintly
      if (visible && s.isModel) buildModel(s);
      else if (visible && s.isImage) buildImage(s);
      else if (visible && s.isText) buildText(s);
      else if (visible && s.isLink) buildLink(s);
      else if (visible && s.isDoc) buildDoc(s);
      else if (visible && s.drivePlayer) buildDrivePlayer(s);
      else if (visible && s.isStacked) buildStacked(s);
      else if (visible && s.inScene) buildFrame(s);
      else if (visible) buildMarker(s);
      if (s.dwell && s.el) addDwell(s);

      if (s.isStill) return s;
      if (!s.mediaHost) {                                       // sound only / hidden: the player lives off screen
        s.mediaHost = el('div', 'spot-offscreen');
        opts.offscreen.appendChild(s.mediaHost);
      }
      prepare(s);
      if (s.isStacked && s.mesh) attachStacked(s);
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

    // Google Drive's own player, in a frame in the room
    function drivePlayerUrl(s) {
      const v = Media.docViewer(s.src);                // Drive files: …/file/d/ID/preview
      return v.url;
    }
    function buildDrivePlayer(s) {
      s.el = el('div', 'spot spot-video spot-drive');
      s.labelEl = el('div', 'spot-cap');
      s.frame = el('div', 'spot-frame');
      // Google's player lays itself out badly in a small window (its top bar pushes things out of view),
      // so it gets a normal-sized window that is then shrunk to fit the spot
      s.driveSize = s.kind === 'audio' ? [480, 160] : [640, 360];
      s.frame.style.aspectRatio = s.driveSize[0] + ' / ' + s.driveSize[1];
      s.mediaHost = el('div', 'spot-media');
      s.labelEl.textContent = s.label || '';
      s.labelEl.hidden = !s.label;
      s.frame.append(s.labelEl, s.mediaHost);
      const f = document.createElement('iframe');
      f.title = (s.label || (s.kind === 'audio' ? 'Sound' : 'Video')) + ' (Google Drive player)';
      f.allow = 'autoplay; fullscreen';
      f.className = 'drive-frame';
      f.style.width = s.driveSize[0] + 'px';
      f.style.height = s.driveSize[1] + 'px';
      s.driveFrame = f;
      // Behind a dot: load it only once revealed (and unload it to stop it when hidden again)
      if (!(s.dwell && !opts.editable)) { f.src = drivePlayerUrl(s); f.dataset.on = '1'; }
      s.mediaHost.appendChild(f);
      if (opts.editable) {
        addEditHandles(s);
        // ▶ Test: let the author click inside Google's player (the drag layer steps aside until clicked again)
        const t = el('button', 'spot-test', '▶ Test');
        t.type = 'button';
        t.title = 'Click into Google’s player to try it; click again to go back to moving it';
        t.addEventListener('pointerdown', e => e.stopPropagation());
        t.addEventListener('click', e => {
          e.stopPropagation();
          const on = s.el.classList.toggle('testing');
          t.textContent = on ? '✓ Done' : '▶ Test';
        });
        s.frame.querySelector('.spot-edit').prepend(t);
      }
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

    // ---------------------------------------------------------- 3D models
    // A real 3D object in the scene (glTF/GLB, OBJ or STL). It sits MODEL_DIST from the viewer in its
    // direction, turned to face them, sized so it spans s.w degrees, and turned by s.rot = [turn, tilt, roll].
    // A see-through box in the page follows it on screen, for tapping (and, for the author, handles).
    // One brightness for every model (the author's slider), so they can be matched to the photo's lighting
    let lights = null, brightness = opts.brightness > 0 ? opts.brightness : 1;
    const HEMI = 1.6, SUN = 1.4;
    function setBrightness(f) {
      brightness = f > 0 ? f : 1;
      if (!lights) return;
      lights[0].setAttribute('light', 'intensity', HEMI * brightness);
      lights[1].setAttribute('light', 'intensity', SUN * brightness);
    }
    function addLights() {
      if (lights) return;
      const hemi = document.createElement('a-entity');
      hemi.setAttribute('light', 'type: hemisphere; color: #ffffff; groundColor: #8a7458; intensity: ' + HEMI * brightness);
      const sun = document.createElement('a-entity');
      lights = [hemi, sun];
      sun.setAttribute('light', 'type: directional; color: #fff6e6; intensity: ' + SUN * brightness);
      sun.setAttribute('position', '1 2 1.5');
      opts.sceneEl.append(hemi, sun);
      // Draco-compressed glTF files need this decoder
      opts.sceneEl.setAttribute('gltf-model', 'dracoDecoderPath: https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    }

    function buildModel(s) {
      addLights();
      const THREE_ = THREE;
      s.ent = document.createElement('a-entity');        // positioned and facing the viewer
      s.turn = document.createElement('a-entity');       // the author's turn / tilt / roll
      s.fit = document.createElement('a-entity');        // scale and centring
      s.turn.appendChild(s.fit);
      s.ent.appendChild(s.turn);
      opts.sceneEl.appendChild(s.ent);
      const { url } = Media.resolveMediaUrl(s.src, 'model');
      const fail = msg => opts.onError(s.index, msg || 'This 3D model couldn’t be loaded. Use a .glb file in this site’s GitHub repo or on Dropbox — Google Drive won’t work for 3D models.');
      const ready = obj => {
        // Centre it and measure it once, in its holder's own space (not where it happens to be in the room);
        // sizing then happens every frame from s.w
        const parent = obj.parent;
        if (parent) parent.remove(obj);
        obj.updateMatrixWorld(true);
        const box = new THREE_.Box3().setFromObject(obj);
        if (parent) parent.add(obj);
        const size = box.getSize(new THREE_.Vector3()), centre = box.getCenter(new THREE_.Vector3());
        obj.position.sub(centre);
        s.maxDim = Math.max(size.x, size.y, size.z) || 1;
        s.modelObj = obj;
        s.localBox = new THREE_.Box3().setFromCenterAndSize(new THREE_.Vector3(), size);
        rememberLook(s, obj);
        applyLook(s);
        if (s.el) s.el.classList.add('loaded');
      };
      if (/\.stl(\?|#|$)/i.test(Media.expand(s.src))) {
        fetch(url, { mode: 'cors' }).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(buf => {
          const geo = parseSTL(buf);
          const mesh = new THREE_.Mesh(geo, new THREE_.MeshStandardMaterial({ color: 0xcdbfa8, roughness: 0.6, metalness: 0.05 }));
          mesh.rotation.x = -Math.PI / 2;                 // 3D-printing files are Z-up; the scene is Y-up
          const holder = new THREE_.Group(); holder.add(mesh); holder.updateMatrixWorld(true);
          s.fit.setObject3D('mesh', holder);
          ready(holder);
        }).catch(() => fail());
      } else if (/\.obj(\?|#|$)/i.test(Media.expand(s.src))) {
        s.fit.addEventListener('model-loaded', () => ready(s.fit.getObject3D('mesh')), { once: true });
        s.fit.addEventListener('model-error', () => fail(), { once: true });
        s.fit.setAttribute('obj-model', 'obj: url(' + url + ')');
      } else {
        s.fit.addEventListener('model-loaded', () => ready(s.fit.getObject3D('mesh')), { once: true });
        s.fit.addEventListener('model-error', () => fail(), { once: true });
        s.fit.setAttribute('gltf-model', 'url(' + url + ')');
      }

      // The on-screen box that follows the model
      s.el = el('div', 'spot spot-model' + (s.play === 'look' ? ' on-look' : ''));
      s.frame = el('div', 'spot-frame');
      s.labelEl = el('div', 'spot-cap');
      s.labelEl.textContent = s.label || '';
      s.labelEl.hidden = !s.label;
      s.frame.appendChild(s.labelEl);
      if (opts.editable) {
        addEditHandles(s);
        const rot = el('span', 'spot-handle h-rot', '');
        rot.dataset.corner = 'rot';
        rot.title = 'Drag to turn it (up and down tilts it)';
        s.frame.querySelector('.spot-edit').appendChild(rot);
      } else {
        s.frame.setAttribute('role', 'button');
        s.frame.tabIndex = 0;
        s.frame.setAttribute('aria-label', 'Look at ' + (s.label || '3D model') + ' up close');
        s.frame.addEventListener('click', () => openInspector(s));
        s.frame.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openInspector(s); } });
      }
      s.el.appendChild(s.frame);
      opts.layer.appendChild(s.el);
    }

    // "Bright, flat colours (like Tinkercad)": the author's choice, made while watching the preview.
    // Treats the colours stored in the file as ordinary screen colours and makes every surface matte plastic,
    // which is how Tinkercad itself shows them. Off = the file shown exactly as the glTF standard says.
    // (We keep the file's own values, so it can be switched either way at any time.)
    function rememberLook(s, root) {
      s.looks = [];
      const seen = new Set();
      root.traverse(o => {
        if (!o.isMesh) return;
        const col = o.geometry && o.geometry.getAttribute('color');
        if (col && !seen.has(col)) { seen.add(col); s.looks.push({ col: col, orig: col.array.slice() }); }
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
          if (!m || seen.has(m)) return;
          seen.add(m);
          s.looks.push({ mat: m, metalness: m.metalness, roughness: m.roughness, color: m.color ? m.color.clone() : null });
        });
      });
    }
    function applyLook(s) {
      if (!s.looks) return;
      const toLinear = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
      s.looks.forEach(l => {
        if (l.col) {
          const a = l.col.array, w = l.col.itemSize;
          for (let i = 0; i < a.length; i++) a[i] = s.flat && i % w < 3 ? toLinear(l.orig[i]) : l.orig[i];   // never the alpha
          l.col.needsUpdate = true;
        } else {
          const m = l.mat;
          if ('metalness' in m) m.metalness = s.flat ? 0 : l.metalness;
          if ('roughness' in m) m.roughness = s.flat ? 0.75 : l.roughness;
          if (m.color && l.color) { m.color.copy(l.color); if (s.flat) m.color.convertSRGBToLinear(); }
          m.needsUpdate = true;
        }
      });
    }

    // STL (from Tinkercad, Fusion, 3D-printing sites): binary or text
    function parseSTL(buf) {
      const dv = new DataView(buf);
      const n = buf.byteLength >= 84 ? dv.getUint32(80, true) : 0;
      const pos = [];
      if (84 + n * 50 === buf.byteLength) {
        for (let i = 0; i < n; i++) {
          const o = 84 + i * 50 + 12;
          for (let v = 0; v < 9; v++) pos.push(dv.getFloat32(o + v * 4, true));
        }
      } else {
        const text = new TextDecoder().decode(buf);
        const re = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
        let m; while ((m = re.exec(text))) pos.push(+m[1], +m[2], +m[3]);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      return geo;
    }

    // Tap a model to turn it over in your hands: drag to rotate, pinch or scroll to zoom
    function openInspector(s) {
      if (!s.modelObj || (s.play === 'look' && !s.el.classList.contains('shown'))) return;
      const box = el('div', 'lightbox inspector');
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-label', (s.label || '3D model') + ', up close');
      const canvas = el('canvas', 'inspector-canvas');
      const close = el('button', 'lightbox-close', '✕');
      close.setAttribute('aria-label', 'Close');
      const tip = el('p', 'lightbox-cap', (s.label ? esc(s.label) + ' · ' : '') + 'Drag to turn it · pinch or scroll to zoom');
      box.append(canvas, close, tip);
      document.body.appendChild(box);

      const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7458, 1.8 * brightness));
      const sun = new THREE.DirectionalLight(0xfff6e6, 1.6 * brightness); sun.position.set(1, 2, 2); scene.add(sun);
      const holder = new THREE.Group();
      const copy = s.modelObj.clone(true);
      holder.add(copy);
      holder.rotation.order = 'YXZ';
      holder.rotation.set(s.rot[1] * Math.PI / 180, s.rot[0] * Math.PI / 180, s.rot[2] * Math.PI / 180);
      holder.scale.setScalar(1 / s.maxDim);
      scene.add(holder);
      const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
      let dist = 2.2, rx = 0.25, ry = 0, alive = true, fitted = false;
      const resize = () => {
        const w = box.clientWidth, h = box.clientHeight - 60;
        renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
        camera.aspect = w / h; camera.updateProjectionMatrix();
        // Start far enough back that the whole thing fits, even on a tall, narrow phone screen
        if (!fitted) { fitted = true; dist = 0.8 / Math.tan(17.5 * Math.PI / 180) / Math.min(1, camera.aspect); }
      };
      resize(); window.addEventListener('resize', resize);
      const tick = () => {
        if (!alive) return;
        camera.position.set(Math.sin(ry) * Math.cos(rx) * dist, Math.sin(rx) * dist, Math.cos(ry) * Math.cos(rx) * dist);
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
        requestAnimationFrame(tick);
      };
      tick();
      const pts = new Map(); let pinch = 0;
      canvas.style.touchAction = 'none';
      canvas.addEventListener('pointerdown', e => { try { canvas.setPointerCapture(e.pointerId); } catch (err) {} pts.set(e.pointerId, [e.clientX, e.clientY]); });
      canvas.addEventListener('pointermove', e => {
        const p = pts.get(e.pointerId); if (!p) return;
        const dx = e.clientX - p[0], dy = e.clientY - p[1];
        pts.set(e.pointerId, [e.clientX, e.clientY]);
        if (pts.size === 2) {
          const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
          if (pinch) dist = Math.max(0.6, Math.min(12, dist * pinch / d));
          pinch = d; return;
        }
        ry -= dx * 0.01; rx = Math.max(-1.4, Math.min(1.4, rx + dy * 0.01));
      });
      const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; };
      canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('wheel', e => { e.preventDefault(); dist = Math.max(0.6, Math.min(12, dist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });
      const onKey = e => {
        if (e.key === 'Escape') shut();
        else if (e.key === 'ArrowLeft') ry -= 0.15; else if (e.key === 'ArrowRight') ry += 0.15;
        else if (e.key === 'ArrowUp') rx = Math.min(1.4, rx + 0.15); else if (e.key === 'ArrowDown') rx = Math.max(-1.4, rx - 0.15);
      };
      const shut = () => {
        alive = false; renderer.dispose(); box.remove();
        window.removeEventListener('resize', resize); document.removeEventListener('keydown', onKey);
      };
      close.addEventListener('click', shut);
      document.addEventListener('keydown', onKey);
      close.focus();
    }

    // Words on a card in the room. Tap to read them full screen.
    function buildText(s) {
      s.el = el('div', 'spot spot-text');
      s.frame = el('div', 'spot-frame');
      s.labelEl = el('div', 'spot-cap');
      s.labelEl.textContent = s.label || '';
      s.labelEl.hidden = !s.label;
      s.body = el('div', 'spot-words');
      s.body.textContent = s.src;
      s.frame.append(s.labelEl, s.body);
      if (opts.editable) addEditHandles(s);
      else {
        s.frame.setAttribute('role', 'button');
        s.frame.tabIndex = 0;
        s.frame.setAttribute('aria-label', (s.label ? s.label + ': ' : '') + s.src);
        const open = () => openReader(s);
        s.frame.addEventListener('click', open);
        s.frame.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      }
      s.el.appendChild(s.frame);
      opts.layer.appendChild(s.el);
    }

    // ---------------------------------------------------------- documents
    // A card in the room (with a first-page preview for Google files); tap to read it full screen
    const DOC_STYLE = { pdf: ['#b3261e', 'PDF'], word: ['#2b579a', 'Word'], slides: ['#c4501b', 'Slides'], sheet: ['#217346', 'Sheet'], doc: ['#5f6b66', 'Document'] };
    function buildDoc(s) {
      const kind = Media.docKind(s.src), view = Media.docViewer(s.src);
      const [colour, word] = DOC_STYLE[kind];
      s.el = el('div', 'spot spot-doc');
      s.frame = el('div', 'spot-frame');
      const card = el('div', 'doc-card');
      card.style.setProperty('--doc', colour);
      let title = s.label;
      if (!title) {
        const name = Media.expand(s.src).split(/[?#]/)[0].split('/').pop();
        title = /\.[a-z0-9]{2,5}$/i.test(name) ? decodeURIComponent(name) : word;
      }
      card.innerHTML = '<span class="doc-thumb" hidden></span>' +
        '<span class="doc-row"><span class="doc-ico" aria-hidden="true">' + DOC_SVG + '<b></b></span>' +
        '<span class="doc-txt"><span class="doc-title"></span><span class="doc-sub">Tap to open</span></span></span>';
      card.querySelector('.doc-ico b').textContent = kind === 'pdf' ? 'PDF' : word === 'Document' ? '' : word.slice(0, 1);
      if (kind === 'pdf') card.querySelector('.doc-ico b').classList.add('small');
      card.querySelector('.doc-title').textContent = title;
      // Google files: a picture of the first page (an ordinary picture, so no permission needed)
      const gid = (view.url.match(/\/(?:file|document|presentation|spreadsheets)\/d\/([\w-]{10,})/) || [])[1];
      if (gid) {
        const img = new Image();
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.onload = () => { const t = card.querySelector('.doc-thumb'); t.appendChild(img); t.hidden = false; };
        img.src = 'https://drive.google.com/thumbnail?id=' + gid + '&sz=w640';
      }
      s.labelEl = card.querySelector('.doc-title');
      s.docTitle = title;
      s.frame.appendChild(card);
      if (opts.editable) addEditHandles(s);
      else {
        card.setAttribute('role', 'button');
        card.tabIndex = 0;
        card.setAttribute('aria-label', 'Open ' + title + ' (' + word.toLowerCase() + ')');
        card.addEventListener('click', () => openDoc(s));
        card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDoc(s); } });
      }
      s.el.appendChild(s.frame);
      opts.layer.appendChild(s.el);
    }

    // Full screen: the host's own viewer in a frame, or the built-in PDF reader. Always with a way out to a new tab.
    function openDoc(s) {
      if (s.dwell && !s.revealed && !opts.editable) return;
      const view = Media.docViewer(s.src);
      const box = el('div', 'doc-reader');
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', s.docTitle || 'Document');
      box.innerHTML = '<div class="doc-bar"><span class="doc-bar-title"></span>' +
        '<span class="doc-zoom" hidden><button type="button" class="doc-btn" data-z="-1" aria-label="Zoom out">−</button>' +
        '<button type="button" class="doc-btn" data-z="1" aria-label="Zoom in">+</button></span>' +
        '<a class="doc-btn doc-out" target="_blank" rel="noopener noreferrer">Open in new tab ↗</a>' +
        '<button type="button" class="doc-btn doc-close" aria-label="Close">✕</button></div>' +
        '<div class="doc-body"><p class="doc-wait">Opening…</p></div>';
      box.querySelector('.doc-bar-title').textContent = s.docTitle || 'Document';
      const out = box.querySelector('.doc-out');
      if (/^https?:\/\//.test(view.open)) out.href = view.open; else out.remove();
      const body = box.querySelector('.doc-body');
      const prevFocus = document.activeElement;
      let alive = true;
      const shut = () => {
        alive = false; box.remove(); document.removeEventListener('keydown', onKey);
        if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
      };
      const onKey = e => { if (e.key === 'Escape') shut(); };
      box.querySelector('.doc-close').addEventListener('click', shut);
      document.addEventListener('keydown', onKey);
      document.body.appendChild(box);
      box.querySelector('.doc-close').focus();

      if (view.mode === 'frame') {
        const f = document.createElement('iframe');
        f.className = 'doc-frame';
        f.title = s.docTitle || 'Document';
        f.allow = 'fullscreen';
        f.referrerPolicy = 'no-referrer-when-downgrade';
        f.src = view.url;
        f.addEventListener('load', () => { const w = body.querySelector('.doc-wait'); if (w) w.remove(); });
        body.appendChild(f);
        // A frame can't say when the host refuses to show the file, so offer the way out if it's slow
        setTimeout(() => {
          const w = body.querySelector('.doc-wait');
          if (alive && w) w.textContent = 'Still opening… If nothing appears, use “Open in new tab”.';
        }, 6000);
      } else if (view.mode === 'pdf') {
        renderPdf(view.url, body, box, () => alive).catch(() => {
          if (!alive) return;
          body.innerHTML = '<p class="doc-wait">This PDF couldn’t be opened here. Try “Open in new tab”.</p>';
          opts.onError(s.index, 'This PDF couldn’t be opened. Check the link, or keep the PDF in your GitHub site or Dropbox.');
        });
      } else {
        body.innerHTML = '<p class="doc-wait">Nothing to show.</p>';
      }
    }

    // The built-in PDF reader (PDF.js, loaded only when a PDF is first opened)
    let pdfLib = null;
    function loadPdfLib() {
      if (!pdfLib) {
        const base = new URL('vendor/pdfjs/', document.baseURI).href;
        pdfLib = import(base + 'pdf.min.js').then(lib => {
          lib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js';
          return lib;
        });
      }
      return pdfLib;
    }
    async function renderPdf(url, body, box, isOpen) {
      const lib = await loadPdfLib();
      const pdf = await lib.getDocument({ url: url }).promise;
      body.innerHTML = '';
      body.classList.add('doc-pages');
      body.tabIndex = 0;                               // so keyboard users can scroll the pages
      body.setAttribute('role', 'region');
      body.setAttribute('aria-label', 'Document pages');
      const zoomBox = box.querySelector('.doc-zoom');
      zoomBox.hidden = false;
      let zoom = 1, drawing = 0;
      const draw = async () => {
        const run = ++drawing;
        const width = Math.min(body.clientWidth - 16, 1000) * zoom;
        body.innerHTML = '';
        for (let n = 1; n <= Math.min(pdf.numPages, 60); n++) {
          if (!isOpen() || run !== drawing) return;
          const page = await pdf.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const scale = width / base.width, dpr = Math.min(2, window.devicePixelRatio || 1);
          const vp = page.getViewport({ scale: scale * dpr });
          const c = document.createElement('canvas');
          c.className = 'doc-page';
          c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
          c.style.width = Math.floor(vp.width / dpr) + 'px';
          c.setAttribute('role', 'img');
          c.setAttribute('aria-label', 'Page ' + n + ' of ' + pdf.numPages);
          body.appendChild(c);
          await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        }
        if (pdf.numPages > 60 && run === drawing) body.appendChild(el('p', 'doc-wait', 'Showing the first 60 pages. Use “Open in new tab” for the rest.'));
      };
      zoomBox.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        zoom = Math.max(0.6, Math.min(3, zoom * (+b.dataset.z > 0 ? 1.25 : 0.8)));
        draw();
      }));
      await draw();
    }

    // A button that opens a web page in a new tab
    function buildLink(s) {
      s.el = el('div', 'spot spot-link');
      s.frame = el('div', 'spot-frame');
      const href = safeUrl(s.src);
      const a = el('a', 'spot-a');
      let text = s.label;
      if (!text) { try { text = new URL(href).hostname.replace(/^www\./, ''); } catch (e) { text = 'Open link'; } }
      a.innerHTML = '<span class="spot-a-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M22 14a8 8 0 0 1-8 8"/><path d="M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1"/><path d="M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10"/><path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg></span><span class="spot-a-text"></span><span class="spot-a-out" aria-hidden="true">↗</span>';
      a.querySelector('.spot-a-text').textContent = text;
      if (href) { a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      else opts.onError(s.index, 'Link spots need a web address starting with https://');
      a.setAttribute('aria-label', text + ' (opens in a new tab)');
      a.draggable = false;
      s.labelEl = a.querySelector('.spot-a-text');
      s.frame.appendChild(a);
      if (opts.editable) { addEditHandles(s); a.addEventListener('click', e => e.preventDefault()); }
      s.el.appendChild(s.frame);
      opts.layer.appendChild(s.el);
    }

    const DOC_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 2h8l5 5v15H6z"/><path d="M14 2v5h5"/></svg>';

    // A small dot that reveals (and starts) the spot once the crosshair has rested on it
    const DWELL_MS = 1500;
    function addDwell(s) {
      s.el.classList.add('dwell');
      s.dwellT = 0;
      const dot = el('button', 'spot-dwell',
        '<svg viewBox="0 0 44 44" aria-hidden="true"><circle class="dw-bg" cx="22" cy="22" r="18"/>' +
        '<circle class="dw-ring" cx="22" cy="22" r="18" pathLength="100"/></svg><span class="dw-core" aria-hidden="true"></span>');
      dot.setAttribute('aria-label', 'Show ' + (s.label || labelText(s) || 'this'));
      dot.addEventListener('click', e => { e.stopPropagation(); reveal(s, 'tap'); });   // tapping works too
      dot.addEventListener('pointerdown', e => { if (opts.editable) e.stopPropagation(); });
      s.dwellRing = dot.querySelector('.dw-ring');
      s.dwellDot = dot;
      s.el.appendChild(dot);
    }
    function reveal(s, how) {
      if (s.revealed) return;
      s.revealed = true;
      s.revealedBy = how || 'look';
      s.seen = s.revealedBy === 'look';
      s.awayT = 0;
      s.el.classList.add('revealed');
      if (s.driveFrame && !s.driveFrame.dataset.on) { s.driveFrame.src = drivePlayerUrl(s); s.driveFrame.dataset.on = '1'; }
      if (!s.isStill) { s.userPaused = false; play(s); }
    }
    // Back behind its dot once the viewer has looked away from it (it can be brought back the same way)
    function conceal(s) {
      if (!s.revealed) return;
      s.revealed = false;
      s.el.classList.remove('revealed');
      s.dwellT = 0; s.awayT = 0;
      if (s.dwellRing) s.dwellRing.style.strokeDashoffset = '100';
      if (s.driveFrame && !opts.editable) { s.driveFrame.src = 'about:blank'; delete s.driveFrame.dataset.on; }   // the only way to stop Google's player
      if (s.playing || s.wantPlay) pause(s);
      s.userPaused = false;
    }
    // Is the crosshair on what the dot revealed? (with a little slack, so it doesn't flicker at the edges)
    function crosshairOn(s, x, y, w, h, angle, slack) {
      if (!s.inScene) return angle < 18;                       // a sound: near its marker
      if (s.quad) return insideQuad(s.quad, w / 2, h / 2, slack);
      if (s.isModel || s.isStacked) {
        return Math.abs(w / 2 - x) < (s.boxW || 40) / 2 + slack && Math.abs(h / 2 - y) < (s.boxH || 40) / 2 + slack;
      }
      const fw = s.yt ? authoredWidth(s) : frameWidth(s);    // a YouTube player grows while playing: use its set size
      const fh = s.frame && s.frame.offsetHeight && !s.yt ? s.frame.offsetHeight : fw / (s.aspect || 16 / 9);
      return Math.abs(w / 2 - x) < fw / 2 + slack && Math.abs(h / 2 - y) < fh / 2 + slack;
    }

    // Full-screen reading view for text spots
    function openReader(s) {
      const box = el('div', 'lightbox reader');
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-label', s.label || 'Text');
      const card = el('div', 'reader-card');
      if (s.label) card.appendChild(el('h2', '', esc(s.label)));
      const p = el('p'); p.textContent = s.src; card.appendChild(p);
      const close = el('button', 'lightbox-close', '✕');
      close.setAttribute('aria-label', 'Close');
      box.append(card, close);
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
      if (s.ent) s.ent.parentNode && s.ent.parentNode.removeChild(s.ent);
      if (s.stkTex) { s.stkTex.dispose(); s.mesh.material.dispose(); s.mesh.geometry.dispose(); }
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
        if (s.isStacked) { m.crossOrigin = 'anonymous'; m.preload = 'auto'; m.controls = false; }
        m.src = Media.resolveMediaUrl(s.src, s.isVideoFile ? 'video' : 'audio').url;
        m.addEventListener('play', () => setPlaying(s, true));
        m.addEventListener('pause', () => setPlaying(s, false));
        m.addEventListener('ended', () => { s.userPaused = true; setPlaying(s, false); });
        m.addEventListener('error', () => opts.onError(s.index, /drive\.google|^gd:/.test(s.src.trim())
          ? 'Google Drive won’t play this file inside other websites (Google started blocking this in 2024), even when it’s shared correctly. For now, put the sound in your GitHub site or Dropbox.'
          : 'This file couldn’t be loaded. Check the link and that it’s shared as “Anyone with the link”.'), { once: true });
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
      if (s.isText || s.isLink || s.isDoc) return Math.max(60, s.w * pxPerDegree());
      if (s.isModel || s.isStacked) return s.boxW || 40;
      return Math.max(s.isImage ? 24 : s.drivePlayer ? 240 : 120, s.w * pxPerDegree());
    }
    // Screen point → direction in the room
    function directionAt(sx, sy) {
      const camera = opts.sceneEl.camera, c = opts.sceneEl.canvas;
      const r = c.getBoundingClientRect();
      const v = new THREE.Vector3(((sx - r.left) / r.width) * 2 - 1, -((sy - r.top) / r.height) * 2 + 1, 0.5).unproject(camera);
      const origin = new THREE.Vector3(); camera.getWorldPosition(origin);
      return v.sub(origin).normalize();
    }

    // ---------------------------------------------------------- pinned corners
    const PIN_W = 400;                 // pinned spots are laid out at this width, then warped onto their corners
    const wrap180 = a => ((a % 360) + 540) % 360 - 180;

    // The flat, upright rectangle a spot fills now, as corner offsets in degrees (the starting point for pinning)
    function rectPin(s) {
      const aspect = (s.isText || s.isLink || s.isDoc) && s.frame && s.frame.offsetHeight
        ? s.frame.offsetWidth / s.frame.offsetHeight : s.aspect || 16 / 9;
      const c = anglesFrom(s.dir);
      const hh = s.w / aspect / 2;
      const hw = s.w / 2 / Math.max(0.2, Math.cos(c.pitch * Math.PI / 180));
      return [[hw, hh], [-hw, hh], [-hw, -hh], [hw, -hh]];
    }
    // The CSS transform that maps a W×H box onto four screen points (a projective "corner pin")
    function quadMatrix(W, H, p) {
      const [x0, y0] = p[0], [x1, y1] = p[1], [x2, y2] = p[2], [x3, y3] = p[3];
      const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
      const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
      const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
      const g = (dx3 * dy2 - dx2 * dy3) / den, hh = (dx1 * dy3 - dx3 * dy1) / den;
      const a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3, c = x0;
      const d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3, f = y0;
      const m = [a / W, d / W, 0, g / W, b / H, e / H, 0, hh / H, 0, 0, 1, 0, c, f, 0, 1];
      return 'matrix3d(' + m.map(v => +v.toFixed(8)).join(',') + ')';
    }
    function insideQuad(q, px, py, grow) {
      const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
      const pts = q.map(([x, y]) => {
        const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1;
        return [x + dx / l * grow, y + dy / l * grow];
      });
      let sign = 0;
      for (let i = 0; i < 4; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % 4];
        const cr = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
        if (cr !== 0) { if (sign && Math.sign(cr) !== sign) return false; sign = Math.sign(cr); }
      }
      return true;
    }
    // Author: switch a spot between a flat rectangle and four movable corners
    function pinSpot(i, on) {
      const s = spots.find(x => x.index === i);
      if (!s || !s.frame) return;
      s.pin = on ? (s.pin || rectPin(s)) : null;
      s.lastW = null;
      reportEdit(s);
    }
    function reportEdit(s) {
      const a = anglesFrom(s.dir);
      s.yaw = a.yaw; s.pitch = a.pitch;
      opts.onEdit(s.index, { yaw: Math.round(a.yaw), pitch: Math.round(a.pitch), w: Math.round(s.w),
        pin: s.pin ? s.pin.map(c => c.map(n => Math.round(n))) : null,
        rot: s.isModel ? s.rot.map(n => Math.round(n)) : undefined });
    }

    // ---------------------------------------------------------- every frame (after A-Frame draws)
    function update() {
      const camera = opts.sceneEl.camera;
      if (!camera || !spots.length) return;
      camera.getWorldDirection(fwd);
      const canvas = opts.sceneEl.canvas;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const ppd = pxPerDegree();
      const now = performance.now(), dt = Math.min(100, now - (lastTick || now));
      lastTick = now;

      spots.forEach(s => {
        const angle = fwd.angleTo(s.dir) * 180 / Math.PI;
        let x = 0, y = 0, onScreen = angle < 85;
        if (onScreen) {
          tmp.copy(s.dir).multiplyScalar(50).project(camera);
          x = (tmp.x + 1) / 2 * w; y = (1 - tmp.y) / 2 * h;
        }

        if (s.isModel && s.ent && s.ent.object3D) {
          placeModel(s, camera, w, h, dt);
          if (s.offView) onScreen = false;       // its box would be distorted out of all proportion: don't show it
        }
        if (s.isStacked && s.mesh) {
          placeStacked(s, camera, w, h);
          if (s.offView) onScreen = false;
        }

        // A dot waiting to be looked at: fill its ring while the crosshair rests on it
        if (s.dwell && !s.revealed) {
          if (started && onScreen && !s.dragging) {
            const near = Math.hypot(w / 2 - x, h / 2 - y) < 30;
            s.dwellT = near ? s.dwellT + dt : Math.max(0, s.dwellT - dt * 2);
            if (s.dwellRing) s.dwellRing.style.strokeDashoffset = String(100 - Math.min(100, s.dwellT / DWELL_MS * 100));
            if (s.dwellT >= DWELL_MS) reveal(s, 'look');
          }
        }
        // Revealed: hide it again once the crosshair has moved off it for a moment. (Revealed by a tap and not
        // looked at yet? Then it stays until it's turned out of view.)
        else if (s.dwell && s.revealed && started && !s.dragging) {
          const on = onScreen && crosshairOn(s, x, y, w, h, angle, 24);
          if (on) s.seen = true;
          const away = s.seen ? !on : !onScreen || x < 0 || x > w || y < 0 || y > h;
          s.awayT = away ? (s.awayT || 0) + dt : 0;
          if (s.awayT > 700) conceal(s);
        }
        // "Plays when looked at": while the centre of the screen (the crosshair) is on it
        else if (started && s.play === 'look' && !s.dragging) {
          let on, off;
          if (s.inScene && onScreen && s.quad) {                    // pinned: the crosshair inside its four corners
            on = insideQuad(s.quad, w / 2, h / 2, 0);
            off = !insideQuad(s.quad, w / 2, h / 2, 6);
          } else if (s.inScene && onScreen) {
            // Plays while the crosshair is on the spot as the author sized it, and pauses when it leaves that area.
            // (A YouTube player grows bigger than that while it plays, so its bigger size doesn't count.)
            const aw = s.yt ? authoredWidth(s) : frameWidth(s);
            const dx = Math.abs(w / 2 - x), dy = Math.abs(h / 2 - y), slack = Math.max(8, aw * 0.08);
            on = dx < aw / 2 && dy < aw / s.aspect / 2;
            off = dx > aw / 2 + slack || dy > aw / s.aspect / 2 + slack;   // a little slack stops flickering at the edge
          } else if (s.inScene) {
            on = false; off = true;
          } else {
            on = angle < 12; off = angle > 18;                      // sounds: about the size of their marker
          }
          if (s.isImage || s.isModel) {                                        // pictures fade in while looked at
            if (on) s.el && s.el.classList.add('shown');
            else if (off) s.el && s.el.classList.remove('shown');
          } else if (on && !s.playing && !s.wantPlay && !s.userPaused) { s.lookStarted = true; play(s); }
          else if (off) {
            if (s.playing || s.wantPlay) pause(s);              // however it was started
            s.lookStarted = false; s.userPaused = false;
          }
        }

        if (!s.el) return;
        if (!onScreen) { s.el.style.visibility = 'hidden'; return; }
        s.el.style.visibility = 'visible';
        s.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
        const pinned = s.frame && s.pin && !(s.yt && s.expanded);   // a playing YouTube video goes flat
        s.el.classList.toggle('pinned', !!pinned);
        if (pinned) {
          // Project the four corners and warp the spot onto them
          const c = anglesFrom(s.dir), q = [];
          for (const [dy, dp] of s.pin) {
            const cd = dirFrom(c.yaw + dy, c.pitch + dp);
            if (fwd.dot(cd) < 0.12) { s.el.style.visibility = 'hidden'; s.quad = null; return; }
            tmp.copy(cd).multiplyScalar(50).project(camera);
            q.push([(tmp.x + 1) / 2 * w, (1 - tmp.y) / 2 * h]);
          }
          s.quad = q;
          if (s.lastW !== 'pin') {
            s.frame.style.width = PIN_W + 'px';
            if (s.isText) s.frame.style.fontSize = (PIN_W * 0.075) + 'px';
            if (s.isLink || s.isDoc) s.frame.style.fontSize = (PIN_W * (s.isDoc ? 0.075 : 0.09)) + 'px';
            s.lastW = 'pin';
            s.pinH = s.frame.offsetHeight || PIN_W * 9 / 16;
          }
          s.frame.style.transform = quadMatrix(PIN_W, s.pinH, q.map(([px, py]) => [px - x, py - y]));
          if (opts.editable) {          // keep the author's corner tags a usable size however small the warp makes them
            const qw = (Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) + Math.hypot(q[2][0] - q[3][0], q[2][1] - q[3][1])) / 2;
            s.frame.style.setProperty('--hs', Math.min(80, 18 * PIN_W / Math.max(20, qw)).toFixed(1) + 'px');
          }
          return;
        }
        s.quad = null;
        if (s.frame && s.frame.style.transform) s.frame.style.transform = '';
        if (s.frame) {
          const fw = Math.round(frameWidth(s));
          if (fw !== s.lastW) {
            s.frame.style.width = fw + 'px';
            s.lastW = fw;
            if (s.isText) s.frame.style.fontSize = Math.max(9, Math.min(40, fw * 0.075)).toFixed(1) + 'px';
            if (s.isLink || s.isDoc) s.frame.style.fontSize = Math.max(9, Math.min(36, fw * (s.isDoc ? 0.075 : 0.09))).toFixed(1) + 'px';
            if (s.driveFrame) s.driveFrame.style.transform = 'scale(' + (fw / s.driveSize[0]).toFixed(4) + ')';
          }
          if (s.isModel || s.isStacked) s.frame.style.height = Math.round(s.boxH || 40) + 'px';
        }
      });
    }

    // Put a model in its place, size and turn it, and work out the box it covers on screen
    const _c = new THREE.Vector3(), _d = new THREE.Vector3(), _q = [];
    function placeModel(s, camera, w, h, dt) {
      const o = s.ent.object3D;
      o.position.copy(s.dir).multiplyScalar(MODEL_DIST);
      o.lookAt(0, o.position.y, 0);                                  // face the viewer, staying upright
      if (s.spin && !s.dragging) s.rot[0] = (s.rot[0] + dt * 0.02) % 360;   // about 20° a second
      s.turn.object3D.rotation.set(s.rot[1] * Math.PI / 180, s.rot[0] * Math.PI / 180, s.rot[2] * Math.PI / 180, 'YXZ');
      const size = 2 * MODEL_DIST * Math.tan((s.w * Math.PI / 180) / 2);
      if (s.maxDim) s.fit.object3D.scale.setScalar(size / s.maxDim);
      // hidden until its dot is looked at; or only while looked at
      const show = !(s.dwell && !s.revealed && !opts.editable) && !(s.play === 'look' && !opts.editable && !s.el.classList.contains('shown'));
      o.visible = show && !!s.maxDim;
      if (!s.localBox) { s.boxW = 0; return; }
      // screen box: project the corners of its (turned, scaled) bounding box
      s.fit.object3D.updateMatrixWorld(true);
      camera.updateMatrixWorld();
      const m = s.fit.object3D.matrixWorld, b = s.localBox;      // the box is in the holder's space
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, off = false;
      for (let i = 0; i < 8; i++) {
        _c.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(m);
        // Corners level with or behind the viewer project to nonsense (huge or flipped): treat it as out of view
        _d.copy(_c).applyMatrix4(camera.matrixWorldInverse);
        if (_d.z > -0.5) off = true;
        _c.project(camera);
        if (Math.abs(_c.x) > 3 || Math.abs(_c.y) > 3) off = true;  // well beyond the screen's edges
        const px = (_c.x + 1) / 2 * w, py = (1 - _c.y) / 2 * h;
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      }
      s.offView = off;
      if (off) return;
      s.boxW = Math.max(30, x1 - x0); s.boxH = Math.max(30, y1 - y0);
      s.aspect = s.boxW / s.boxH;
    }

    // ---------------------------------------------------------- see-through ("stencil") videos
    // The file is an ordinary MP4 twice as tall as the picture: the picture (on black) on top, and a black-and-white
    // stencil underneath (white = solid, black = see-through, grey = partly). Every phone can play an MP4, and here
    // the two halves are combined as it's drawn, so the room shows through. Made with videomaker.html.
    const STACK_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
    // A WebM with its own transparency is drawn the same way, using its own see-through-ness (alphaMode 1).
    const STACK_FRAG = 'uniform sampler2D map; uniform float opacity, alphaMode; varying vec2 vUv;' +
      'void main() {' +
      '  if (alphaMode > 0.5) { vec4 t = texture2D(map, vUv); gl_FragColor = t * opacity; return; }' +   // premultiplied when loaded
      '  vec3 c = texture2D(map, vec2(vUv.x, 0.5 + vUv.y * 0.5)).rgb;' +      // top half: the picture, on black
      '  float a = texture2D(map, vec2(vUv.x, vUv.y * 0.5)).g * opacity;' +    // bottom half: the stencil
      '  gl_FragColor = vec4(c * opacity, a);' +                             // already "on black", so premultiplied
      '}';
    function buildStacked(s) {
      s.ent = document.createElement('a-entity');
      opts.sceneEl.appendChild(s.ent);
      const mat = new THREE.ShaderMaterial({
        uniforms: { map: { value: null }, opacity: { value: 1 }, alphaMode: { value: s.ownAlpha ? 1 : 0 } },
        vertexShader: STACK_VERT, fragmentShader: STACK_FRAG,
        transparent: true, premultipliedAlpha: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide
      });
      s.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      s.mesh.visible = false;
      const add = () => s.ent.setObject3D('mesh', s.mesh);
      if (s.ent.hasLoaded) add(); else s.ent.addEventListener('loaded', add, { once: true });

      // The see-through box that follows it on screen: for tapping, a play button, and the author's handles
      s.el = el('div', 'spot spot-stacked');
      s.frame = el('div', 'spot-frame');
      s.labelEl = el('div', 'spot-cap');
      s.labelEl.textContent = s.label || '';
      s.labelEl.hidden = !s.label;
      const btn = el('span', 'stk-play', '<span aria-hidden="true">▶</span>');
      s.unmute = el('button', 'spot-unmute', '🔇 Tap for sound');
      s.unmute.hidden = true;
      s.unmute.addEventListener('click', e => { e.stopPropagation(); unmute(s); });
      s.frame.append(s.labelEl, btn, s.unmute);
      if (opts.editable) addEditHandles(s);
      else {
        s.frame.setAttribute('role', 'button');
        s.frame.tabIndex = 0;
        s.frame.setAttribute('aria-label', 'Play or pause ' + (s.label || 'video'));
        s.frame.addEventListener('click', () => toggle(s));
        s.frame.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(s); } });
      }
      s.el.appendChild(s.frame);
      opts.layer.appendChild(s.el);
    }
    function attachStacked(s) {
      const v = s.media;
      const tex = new THREE.VideoTexture(v);
      tex.colorSpace = THREE.NoColorSpace;          // use the stored colours exactly as they are
      tex.generateMipmaps = false;
      // Premultiply as it's loaded, so smoothing between pixels doesn't pull in the hidden colour of see-through ones (dark fringes)
      if (s.ownAlpha) tex.premultiplyAlpha = true;
      s.stkTex = tex;
      s.mesh.material.uniforms.map.value = tex;
      const ready = () => {
        if (!v.videoWidth) return;
        s.vAspect = s.ownAlpha ? v.videoWidth / v.videoHeight : v.videoWidth / (v.videoHeight / 2);
        s.el.classList.add('loaded');
        if (!s.ownAlpha && v.videoHeight < v.videoWidth * 0.9) {
          opts.onError(s.index, 'This doesn’t look like a see-through video (it should be twice as tall as the picture: the picture on top and its black-and-white stencil underneath). Make one with the See-through Video Maker, or untick “See-through video”.');
        }
      };
      v.addEventListener('loadedmetadata', ready);
      v.addEventListener('loadeddata', () => { if (v.paused && v.currentTime === 0) { try { v.currentTime = 0.01; } catch (e) {} } });
      v.addEventListener('error', () => opts.onError(s.index, s.ownAlpha
        ? 'This WebM couldn’t be played here. iPhones and iPads can’t play see-through WebM videos: for a tour every phone can use, open it in the See-through Video Maker and make a see-through MP4. It also needs to be kept in your GitHub site or Dropbox.'
        : 'This video couldn’t be loaded. See-through videos must be kept in your GitHub site or Dropbox (Google Drive and YouTube can’t be used).'), { once: true });
      // For the author: check the WebM really has transparency in it
      if (s.ownAlpha && opts.editable) v.addEventListener('loadeddata', () => {
        Media.videoHasAlpha(v).then(has => { if (has === false) opts.onError(s.index, 'This WebM doesn’t seem to have any transparency in it, so it will show as a rectangle. If it should be see-through, make it again with the See-through Video Maker (choose “WebM with transparency”).'); });
      }, { once: true });
      if (v.readyState >= 1) ready();
    }
    function placeStacked(s, camera, w, h) {
      const o = s.ent.object3D;
      o.position.copy(s.dir).multiplyScalar(MODEL_DIST);
      o.lookAt(0, 0, 0);                                   // face the viewer
      const width = 2 * MODEL_DIST * Math.tan((s.w * Math.PI / 180) / 2);
      const height = width / (s.vAspect || 1);
      s.mesh.scale.set(width, height, 1);
      s.mesh.visible = !!s.vAspect && !(s.dwell && !s.revealed && !opts.editable);
      s.mesh.material.uniforms.opacity.value = opts.editable && s.dwell && !s.revealed ? 0.4 : 1;
      if (!s.vAspect) { s.boxW = 0; return; }
      o.updateMatrixWorld(true);
      camera.updateMatrixWorld();
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, off = false;
      for (let i = 0; i < 4; i++) {
        _c.set(i & 1 ? 0.5 : -0.5, i & 2 ? 0.5 : -0.5, 0).applyMatrix4(s.mesh.matrixWorld);
        _d.copy(_c).applyMatrix4(camera.matrixWorldInverse);
        if (_d.z > -0.5) off = true;
        _c.project(camera);
        if (Math.abs(_c.x) > 3 || Math.abs(_c.y) > 3) off = true;
        const px = (_c.x + 1) / 2 * w, py = (1 - _c.y) / 2 * h;
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      }
      s.offView = off;
      if (off) return;
      s.boxW = Math.max(30, x1 - x0); s.boxH = Math.max(20, y1 - y0);
      s.aspect = s.boxW / s.boxH;
    }

    // ---------------------------------------------------------- author editing (preview only)
    function addEditHandles(s) {
      const edit = el('div', 'spot-edit');
      edit.innerHTML = '<button type="button" class="spot-test" title="Play or pause">▶ Test</button>' +
        ['nw', 'ne', 'sw', 'se'].map(c => '<span class="spot-handle h-' + c + '" data-corner="' + c + '"></span>').join('');
      const test = edit.querySelector('.spot-test');
      if (s.isDoc) { test.textContent = '⤢ Open'; test.title = 'Open the document, as viewers will see it'; }
      else if (s.isStill) test.remove();
      test.addEventListener('click', e => { e.stopPropagation(); if (s.isDoc) openDoc(s); else toggle(s); });
      test.addEventListener('pointerdown', e => e.stopPropagation());
      s.frame.appendChild(edit);
      s.testBtn = test;

      edit.addEventListener('pointerdown', e => {
        e.stopPropagation(); e.preventDefault();
        opts.onSelect(s.index);
        const corner = e.target.dataset && e.target.dataset.corner;
        const ci = { nw: 0, ne: 1, se: 2, sw: 3 }[corner];
        const rotStart = (s.rot || [0, 0, 0]).slice();
        if ((s.isText || s.isLink || s.isDoc) && s.frame.offsetHeight) s.aspect = s.frame.offsetWidth / s.frame.offsetHeight;
        const r = s.el.getBoundingClientRect();                    // the spot's centre point
        const grab = { dx: e.clientX - r.left, dy: e.clientY - r.top };
        beginDrag(s, edit, e, ev => {
          if (corner === 'rot') {
            // Turn handle: sideways turns it, up and down tilts it
            s.rot[0] = (rotStart[0] + (ev.clientX - e.clientX) * 0.6) % 360;
            s.rot[1] = Math.max(-90, Math.min(90, rotStart[1] + (ev.clientY - e.clientY) * 0.4));
          } else if (corner && s.pin) {
            // Pinned: this corner goes exactly where the pointer is
            const a = anglesFrom(directionAt(ev.clientX, ev.clientY)), c = anglesFrom(s.dir);
            s.pin[ci] = [wrap180(a.yaw - c.yaw), a.pitch - c.pitch];
          } else if (corner) {
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
        if (moved) reportEdit(s);
        else if (onClick) onClick();
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
      set, update, start, unlock, stopAll, setMuted, setSelected, pinSpot, setBrightness,
      get count() { return spots.length; },
      get hasLook() { return spots.some(s => s.play === 'look' || s.dwell); }
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
