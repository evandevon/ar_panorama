/* Author page: links in → live preview → QR code out. Nothing is stored anywhere but the link. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const here = new URL('./', location.href);

  let yaw = 0;              // chosen starting direction (degrees)
  let viewYaw = 0, viewPitch = 0;   // where the preview is currently looking
  let spots = [];           // spots: { src, type, yaw, pitch, w, play, hidden, loop, label }
  const MAX_SPOTS = 8;
  let loadedKey = '';       // what the preview iframe is showing
  let panoOk = null;        // did the preview manage to load the photo?
  let qrUrl = '';

  // ------------------------------------------------------------- state ↔ page address
  function readForm() {
    return {
      pano: $('in-pano').value.trim(),
      title: $('in-title').value.trim(),
      align: $('in-align').checked,
      bright: Number($('in-bright').value) || 1
    };
  }

  function saveToAddress(f) {
    const q = new URLSearchParams();
    if (f.pano) q.set('p', f.pano);
    if (f.title) q.set('t', f.title);
    if (yaw) q.set('y', yaw);
    if (f.align) q.set('al', '1');
    if (f.bright !== 1 && hasModels()) q.set('mb', f.bright);
    spots.filter(sp => sp.src.trim()).forEach(sp => q.append('s', HotSpots.encode(sp, false)));
    history.replaceState(null, '', q.toString() ? '?' + q : location.pathname);
  }

  function loadFromAddress() {
    const q = new URLSearchParams(location.search);
    $('in-pano').value = q.get('p') || '';
    $('in-title').value = q.get('t') || '';
    $('in-align').checked = q.get('al') === '1';
    $('in-bright').value = Number(q.get('mb')) || 1;
    yaw = Number(q.get('y')) || 0;
    spots = q.getAll('s').map(HotSpots.decode).filter(Boolean);
    // Older links had a separate background sound: turn it into a hidden sound spot
    if (q.get('a')) spots.unshift({ src: q.get('a'), yaw: 0, pitch: 0, w: HotSpots.DEFAULT_W, play: 'start', type: 'audio', hidden: true, loop: q.get('l') === '1', label: 'Background sound' });
  }

  /** The link the QR code opens */
  function viewerUrl(f, preview) {
    // Light encoding keeps / : , ~ readable (shorter link, simpler QR code). ! ' ( ) * are always encoded,
    // and the link ends with v=2, so email and chat apps don't cut the clickable part short.
    const enc = v => encodeURIComponent(v).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
      .replace(/%2F/gi, '/').replace(/%3A/gi, ':').replace(/%2C/gi, ',').replace(/%20/g, '+');
    const q = [['p', Media.shorten(f.pano)]];
    if (f.title) q.push(['t', f.title]);
    if (yaw) q.push(['y', yaw]);
    if (f.align && !preview) q.push(['al', '1']);
    if (f.bright !== 1 && hasModels()) q.push(['mb', f.bright]);
    if (!preview) spots.filter(sp => sp.src.trim()).forEach(sp => q.push(['s', HotSpots.encode(sp, true)]));
    if (preview) q.push(['preview', '1']);
    else q.push(['v', '2']);                        // format version, and a safe last character for email
    return here.href + '?' + q.map(([k, v]) => k + '=' + enc(String(v))).join('&');
  }

  function hasModels() { return spots.some(sp => sp.src.trim() && HotSpots.kindOf(sp) === 'model'); }

  let brightT = 0;
  // Brightness of every 3D model: changes the preview straight away, without reloading it
  function syncBright() {
    const v = Number($('in-bright').value) || 1;
    $('bright-row').hidden = !hasModels();
    $('bright-out').textContent = v === 1 ? 'Normal' : Math.round(v * 100) + '%';
  }
  $('in-bright').addEventListener('input', e => {
    e.stopPropagation();                                    // no preview reload for this one
    syncBright();
    post({ type: 'setBrightness', value: Number(e.target.value) });
    clearTimeout(brightT); brightT = setTimeout(() => { saveToAddress(readForm()); renderQr(readForm()); }, 300);
  });
  $('bright-reset').addEventListener('click', () => {
    $('in-bright').value = 1; syncBright(); post({ type: 'setBrightness', value: 1 });
    saveToAddress(readForm()); renderQr(readForm());
  });

  // ------------------------------------------------------------- status lines
  function status(id, kind, html) {
    const el = $(id);
    el.className = 'status ' + (kind || '');
    el.innerHTML = html || '';
  }

  function checkPanoLink(link) {
    if (Media.youTube(link)) return 'That’s a YouTube link. Paste a link to a 360° <b>photo</b> here — YouTube goes in step 2 for sound.';
    if (/photos\.app\.goo\.gl|photos\.google\.com/i.test(link)) return 'Google Photos links can’t be used. Download the photo and put it in Google Drive, then share that link.';
    if (/drive\.google\.com\/drive\/(u\/\d+\/)?folders/i.test(link)) return 'That’s a link to a folder. Open the photo itself in Drive and use <b>Share → Copy link</b>.';
    if (/^gd:|^yt:/.test(link)) return '';
    if (!/^(https?:\/\/|www\.|1drv\.ms)/i.test(link)) return 'That doesn’t look like a web link. It should start with https://';
    return '';
  }

  // ------------------------------------------------------------- preview
  function refresh() {
    const f = readForm();
    saveToAddress(f);
    $('qr-title').textContent = f.title || 'A 360° experience';

    if (!f.pano) {
      showEmpty('Paste a 360° photo link to see it here.');
      status('pano-status');
      panoOk = null; loadedKey = '';
      renderQr(null);
      return;
    }
    const bad = checkPanoLink(f.pano);
    if (bad) {
      showEmpty('');
      status('pano-status', 'err', bad);
      panoOk = false; loadedKey = '';
      renderQr(null);
      return;
    }

    // Reload the preview only when what it shows has changed (not for title edits)
    const key = [f.pano, yaw].join('|');
    if (key !== loadedKey) {
      loadedKey = key;
      panoOk = null;
      status('pano-status', 'wait', 'Loading the photo…');
      const frame = $('frame');
      frame.querySelectorAll('iframe').forEach(i => i.remove());
      $('empty').hidden = true;
      const ifr = document.createElement('iframe');
      ifr.title = 'Preview of the 360° experience — drag to look around';
      ifr.allow = 'autoplay; fullscreen; accelerometer; gyroscope';
      ifr.src = viewerUrl(f, true);
      frame.appendChild(ifr);
    }
    renderQr(f);
  }

  function showEmpty(text) {
    $('frame').querySelectorAll('iframe').forEach(i => i.remove());
    $('empty').hidden = !text;
    $('empty').textContent = text;
    $('set-start').disabled = true;
    $('add-spot').disabled = true;
  }

  window.addEventListener('message', e => {
    const m = e.data;
    if (e.origin !== location.origin || !m || m.from !== 'viewer360') return;
    if (m.type === 'status') {
      if (m.state === 'ready') {
        panoOk = true;
        $('set-start').disabled = false;
        sendSpots();
        renderSpots();
        if (m.video) {
          status('pano-status', m.width > 4096 ? 'note' : 'ok', '360 video loaded (' + m.width + ' × ' + m.height + ').' +
            (m.width > 4096 ? ' Many phones can’t play 360 video wider than 4096 px — 2880 × 1440 is a safe size.' : '') +
            ' Press <b>Play</b> in the preview to watch it; viewers’ video starts when they tap to begin.');
        } else status('pano-status', m.warning ? 'note' : 'ok', m.warning || ('Photo loaded (' + m.width + ' × ' + m.height + ').' +
          (m.width > 8192 ? ' That’s very large — around 4096 × 2048 loads faster on phones.' : '')));
      } else if (m.state === 'error') {
        panoOk = false;
        status('pano-status', 'err', escapeHtml(m.message));
      }
      renderQr(readForm());
    } else if (m.type === 'view') {
      viewYaw = m.yaw; viewPitch = m.pitch || 0;
    } else if (m.type === 'spotError') {
      const sp = spots[m.index];
      if (sp) {
        sp.error = m.message; renderSpotStatus(m.index);
        const li = $('spot-list').children[m.index]; if (li) updateSummary(li, sp);
      }
    } else if (m.type === 'spotEdit') {
      // Moved or resized by dragging in the preview: the preview already shows it, so just record it
      const sp = spots[m.index];
      if (!sp) return;
      sp.yaw = m.yaw; sp.pitch = m.pitch; sp.w = m.w;
      if ('pin' in m) sp.pin = m.pin;
      if (Array.isArray(m.rot)) sp.rot = m.rot;
      const box = $('spot-list').children[m.index] && $('spot-list').children[m.index].querySelector('.sp-pin');
      if (box) box.checked = !!sp.pin;
      updatePlaceText(m.index);
      spotsChanged(false);
    } else if (m.type === 'spotSelect') {
      if (openIndex !== m.index) openCard(m.index, false);
      selectCard(m.index, true);
    }
  });

  // ------------------------------------------------------------- starting direction
  function describeYaw(d) {
    if (!d) return 'Starts facing the centre of the photo.';
    return 'Starts turned ' + Math.abs(d) + '° to the ' + (d > 0 ? 'left' : 'right') + ' of the centre.';
  }
  function updateFacing() {
    $('facing-text').textContent = describeYaw(yaw);
    $('reset-start').hidden = !yaw;
  }
  $('set-start').addEventListener('click', () => {
    yaw = viewYaw;
    loadedKey = [readForm().pano, yaw].join('|'); // preview already shows this view
    const ifr = $('frame').querySelector('iframe');
    if (ifr) ifr.contentWindow.postMessage({ type: 'setYaw', yaw: yaw }, location.origin);
    updateFacing(); refresh();
    status('pano-status', 'ok', 'Starting view saved. Viewers will begin facing this way.');
  });
  $('reset-start').addEventListener('click', () => {
    yaw = 0;
    loadedKey = [readForm().pano, yaw].join('|');
    const ifr = $('frame').querySelector('iframe');
    if (ifr) ifr.contentWindow.postMessage({ type: 'setYaw', yaw: 0 }, location.origin);
    updateFacing(); refresh();
  });

  // ------------------------------------------------------------- video spots
  function describePlace(y, p) {
    const h = !y ? 'straight ahead' : Math.abs(y) + '° ' + (y > 0 ? 'left' : 'right');
    const v = Math.abs(p) < 3 ? '' : ', ' + Math.abs(p) + '° ' + (p > 0 ? 'up' : 'down');
    return h + v;
  }

  function preview() { return $('frame').querySelector('iframe'); }
  function post(msg) { const f = preview(); if (f && panoOk) f.contentWindow.postMessage(msg, location.origin); }
  function sendSpots() {
    post({ type: 'setSpots', spots: spots.map(sp => (sp.src.trim() ? HotSpots.encode(sp, false) : null)) });
    post({ type: 'setBrightness', value: readForm().bright });
  }

  function spotsChanged(reloadPreview) {
    syncBright();
    saveToAddress(readForm());
    if (reloadPreview) sendSpots();
    renderQr(readForm());
  }

  // ------------------------------------------------------------- spot cards
  // Each spot is a collapsible card: a one-line summary, and its settings when opened. One is open at a time.
  let openIndex = -1;
  const ICONS = {
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="15" height="14" rx="2"/><path d="m17 10 5-3v10l-5-3z"/></svg>',
    audio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
    text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
    model: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/></svg>',
    none: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/></svg>'
  };
  const CHEVRON = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>';
  const KIND_NAMES = { video: 'Video', audio: 'Sound', image: 'Picture', text: 'Text', link: 'Link', model: '3D model' };

  function renderSpots() {
    const list = $('spot-list');
    list.innerHTML = '';
    spots.forEach((sp, i) => list.appendChild(spotCard(sp, i)));
    $('add-spot').disabled = !panoOk || spots.length >= MAX_SPOTS;
    $('add-spot').textContent = spots.length >= MAX_SPOTS ? 'Maximum of ' + MAX_SPOTS + ' spots' : '+ Add a spot at the crosshair';
    $('spots-empty').hidden = spots.length > 0;
    syncBright();
  }

  function openCard(i, focus) {
    openIndex = i;
    [...$('spot-list').children].forEach((li, n) => {
      const open = n === i;
      li.classList.toggle('open', open);
      li.querySelector('.sc-toggle').setAttribute('aria-expanded', String(open));
      li.querySelector('.sc-body').hidden = !open;
      if (open) {
        const ta = li.querySelector('.sp-src');
        ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight + 2) + 'px';
        if (focus) ta.focus();
      }
    });
  }

  function spotCard(sp, i) {
    const li = document.createElement('li');
    li.className = 'spot-card';
    const id = 'sc' + i;
    li.innerHTML =
      '<div class="sc-head">' +
        '<button type="button" class="sc-toggle" aria-expanded="false" aria-controls="' + id + '-body">' +
          '<span class="pin" aria-hidden="true">' + (i + 1) + '</span><span class="sc-icon" aria-hidden="true"></span>' +
          '<span class="sc-sum"><span class="sc-title"></span><span class="sc-meta"></span></span>' + CHEVRON +
        '</button>' +
        '<button type="button" class="iconbtn sp-remove" aria-label="Remove spot ' + (i + 1) + '" title="Remove">' + TRASH + '</button>' +
      '</div>' +
      '<div class="sc-body" id="' + id + '-body" hidden>' +
        '<div class="sc-field"><label for="' + id + '-src">Link or text</label>' +
          '<textarea id="' + id + '-src" class="sp-src" rows="1" placeholder="Paste a link (YouTube, video, sound, picture or web page) — or type some text"></textarea></div>' +
        '<div class="sc-field"><label for="' + id + '-label">Label <span class="opt">optional</span></label>' +
          '<input id="' + id + '-label" type="text" class="sp-label" maxlength="40" placeholder="e.g. The teacher’s desk"></div>' +
        '<div class="sc-grid">' +
          '<label class="sp-row">Type<select class="sp-type">' +
            '<option value="video">Video</option><option value="audio">Sound only</option><option value="image">Picture</option>' +
            '<option value="text">Text</option><option value="link">Link to a web page</option><option value="model">3D model</option></select></label>' +
          '<label class="sp-row">Appears<select class="sp-dwell">' +
            '<option value="0">Straight away</option><option value="1">After looking at a dot</option></select></label>' +
          '<label class="sp-row"><span class="sp-play-word">Plays</span><select class="sp-play"></select></label>' +
        '</div>' +
        '<div class="sp-place"><span class="sp-where"></span>' +
          '<span class="sp-place-btns">' +
            '<button type="button" class="btn small ghost sp-smaller" aria-label="Make smaller">− Smaller</button>' +
            '<button type="button" class="btn small ghost sp-bigger" aria-label="Make bigger">+ Bigger</button>' +
            '<button type="button" class="btn small ghost sp-move">Move to crosshair</button>' +
            '<button type="button" class="btn small ghost sp-show">Show me</button>' +
          '</span></div>' +
        '<div class="sp-turn" role="group" aria-label="Turn the 3D model"><span class="sp-turn-text"></span>' +
          '<span class="sp-place-btns">' +
            '<button type="button" class="btn small ghost sp-rot" data-axis="0" data-step="-15" aria-label="Turn left">↺ Turn</button>' +
            '<button type="button" class="btn small ghost sp-rot" data-axis="0" data-step="15" aria-label="Turn right">Turn ↻</button>' +
            '<button type="button" class="btn small ghost sp-rot" data-axis="1" data-step="-15" aria-label="Tilt back">▲ Tilt</button>' +
            '<button type="button" class="btn small ghost sp-rot" data-axis="1" data-step="15" aria-label="Tilt forward">Tilt ▼</button>' +
            '<button type="button" class="btn small ghost sp-rot" data-axis="2" data-step="15" aria-label="Roll sideways">Roll ⟲</button>' +
            '<button type="button" class="btn small ghost sp-rot-reset" aria-label="Reset rotation">Reset</button>' +
          '</span>' +
          '<label class="check sp-spin-row"><input type="checkbox" class="sp-spin"><span>Spins slowly</span></label></div>' +
        '<details class="sc-more"><summary>More options</summary>' +
          '<label class="check sp-hide-row"><input type="checkbox" class="sp-hide"><span>Hidden <span class="help-inline sp-hide-note"></span></span></label>' +
          '<label class="check sp-loop-row"><input type="checkbox" class="sp-loop"><span>Loop <span class="help-inline">— start again when it ends</span></span></label>' +
          '<label class="check sp-pin-row"><input type="checkbox" class="sp-pin"><span>Pin corners <span class="help-inline">— drag each corner onto the matching point in the photo, e.g. a picture frame or window</span></span></label>' +
        '</details>' +
        '<p class="status sp-status" role="status" aria-live="polite"></p>' +
      '</div>';

    const q = c => li.querySelector(c);
    q('.sp-src').value = sp.src;
    q('.sp-dwell').value = sp.dwell ? '1' : '0';
    const grow = ta => { ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight + 2) + 'px'; };
    q('.sp-label').value = sp.label || '';
    q('.sp-hide').checked = !!sp.hidden;
    q('.sp-loop').checked = !!sp.loop;
    q('.sp-pin').checked = !!sp.pin;
    q('.sp-spin').checked = !!sp.spin;
    li.dataset.index = i;
    li.addEventListener('focusin', () => selectCard(i, false));
    q('.sc-toggle').addEventListener('click', () => { openCard(openIndex === i ? -1 : i, false); selectCard(i, false); });

    let typing = 0;
    q('.sp-src').addEventListener('input', e => {
      grow(e.target);
      sp.src = e.target.value; sp.error = '';
      syncCard(li, sp, i);
      clearTimeout(typing); typing = setTimeout(() => spotsChanged(true), 600);
    });
    q('.sp-label').addEventListener('input', e => {
      sp.label = e.target.value;
      updateSummary(li, sp);
      clearTimeout(typing); typing = setTimeout(() => spotsChanged(true), 600);
    });
    q('.sp-type').addEventListener('change', e => { sp.type = e.target.value; sp.error = ''; syncCard(li, sp, i); spotsChanged(true); });
    q('.sp-dwell').addEventListener('change', e => { sp.dwell = e.target.value === '1'; if (sp.dwell) sp.hidden = false; syncCard(li, sp, i); spotsChanged(true); });
    q('.sp-play').addEventListener('change', e => { sp.play = e.target.value; if (sp.play === 'tap') sp.hidden = false; syncCard(li, sp, i); spotsChanged(true); });
    q('.sp-hide').addEventListener('change', e => { sp.hidden = e.target.checked; syncCard(li, sp, i); spotsChanged(true); });
    q('.sp-loop').addEventListener('change', e => { sp.loop = e.target.checked; updateSummary(li, sp); spotsChanged(true); });
    q('.sp-pin').addEventListener('change', e => {
      // The preview works out the starting corners from the spot's current shape and reports them back
      if (!e.target.checked) sp.pin = null;
      post({ type: 'pinSpot', index: i, on: e.target.checked });
      if (!e.target.checked) { updatePlaceText(i); spotsChanged(false); }
    });
    // Size and position without dragging (keyboard and switch users, or anyone who prefers buttons)
    const resize = f => { sp.w = Math.max(4, Math.min(140, (sp.w || HotSpots.DEFAULT_W) * f)); updatePlaceText(i); spotsChanged(true); };
    q('.sp-smaller').addEventListener('click', () => resize(1 / 1.15));
    q('.sp-bigger').addEventListener('click', () => resize(1.15));
    q('.sp-move').addEventListener('click', () => {
      sp.yaw = viewYaw; sp.pitch = viewPitch;
      updatePlaceText(i);
      spotsChanged(true);
    });
    // 3D models: turn in steps (or drag the round handle in the preview)
    li.querySelectorAll('.sp-rot').forEach(b => b.addEventListener('click', () => {
      sp.rot = (sp.rot || [0, 0, 0]).slice();
      const a = +b.dataset.axis, v = sp.rot[a] + (+b.dataset.step);
      sp.rot[a] = a === 1 ? Math.max(-90, Math.min(90, v)) : ((v + 540) % 360) - 180;
      updatePlaceText(i); spotsChanged(true);
    }));
    q('.sp-rot-reset').addEventListener('click', () => { sp.rot = [0, 0, 0]; updatePlaceText(i); spotsChanged(true); });
    q('.sp-spin').addEventListener('change', e => { sp.spin = e.target.checked; updateSummary(li, sp); spotsChanged(true); });
    q('.sp-show').addEventListener('click', () => post({ type: 'lookAt', yaw: sp.yaw, pitch: sp.pitch }));
    q('.sp-remove').addEventListener('click', () => removeSpot(i));

    syncCard(li, sp, i);
    if (i === openIndex) {
      li.classList.add('open');
      q('.sc-toggle').setAttribute('aria-expanded', 'true');
      q('.sc-body').hidden = false;
      requestAnimationFrame(() => grow(q('.sp-src')));
    }
    return li;
  }

  // One-line summary shown on the closed card
  function updateSummary(li, sp) {
    const kind = HotSpots.kindOf(sp);
    const hasSrc = !!sp.src.trim();
    li.querySelector('.sc-icon').innerHTML = ICONS[hasSrc ? kind : 'none'];
    let title = sp.label || '';
    if (!title && hasSrc) {
      if (kind === 'text') title = sp.src.trim().split('\n')[0];
      else { const yt = Media.youTube(sp.src); title = yt ? 'YouTube video' : sp.src.trim().replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, ''); }
    }
    li.querySelector('.sc-title').textContent = title || 'New spot — add a link or text';
    const bits = [];
    if (hasSrc) {
      bits.push(KIND_NAMES[kind]);
      if (sp.dwell) bits.push('behind a dot');
      else if (kind === 'video' || kind === 'audio') bits.push(sp.play === 'look' ? 'plays when looked at' : sp.play === 'start' ? 'plays at once' : 'tap to play');
      else if ((kind === 'image' || kind === 'model') && sp.play === 'look') bits.push('shows when looked at');
      if (kind === 'model' && sp.spin) bits.push('spins');
      if (sp.hidden) bits.push('hidden');
      if (sp.loop && (kind === 'video' || kind === 'audio')) bits.push('loops');
      if (sp.pin) bits.push('pinned');
    }
    bits.push(describePlace(sp.yaw, sp.pitch));
    li.querySelector('.sc-meta').innerHTML = (sp.error ? '<span class="sc-flag">Problem · </span>' : '') + escapeHtml(bits.join(' · '));
  }

  // Remove, with a few seconds to change your mind
  let undoTimer = 0;
  function removeSpot(i) {
    const removed = spots.splice(i, 1)[0];
    if (openIndex === i) openIndex = -1; else if (openIndex > i) openIndex--;
    renderSpots(); spotsChanged(true);
    $('toast-text').textContent = 'Spot ' + (i + 1) + ' removed.';
    $('toast').hidden = false;
    $('toast-btn').onclick = () => {
      spots.splice(Math.min(i, spots.length), 0, removed);
      openIndex = i;
      $('toast').hidden = true;
      renderSpots(); spotsChanged(true);
    };
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { $('toast').hidden = true; }, 8000);
  }

  const PLAY_OPTIONS = {
    media: [['tap', 'When tapped'], ['look', 'When looked at'], ['start', 'As soon as it opens']],
    image: [['tap', 'All the time'], ['look', 'Only while looked at']]
  };

  // Keep the choices and notes in step with the link and with each other
  function syncCard(li, sp, i) {
    const q = c => li.querySelector(c);
    const yt = Media.youTube(sp.src);
    const guess = HotSpots.guessKind(sp.src);
    const kind = HotSpots.kindOf(sp);

    // Type: offer only what this link can be
    const type = q('.sp-type');
    const allowed = guess === 'text' ? ['text'] : guess === 'model' ? ['model']
      : yt ? ['video', 'audio', 'link'] : guess === 'image' ? ['image', 'link'] : guess === 'audio' ? ['audio', 'link']
      : guess === 'video' ? ['video', 'audio', 'link'] : guess === 'link' ? ['link', 'image', 'video', 'audio']
      : !sp.src.trim() ? ['video', 'audio', 'image', 'link', 'text', 'model'] : ['video', 'audio', 'image', 'link', 'model'];
    [...type.options].forEach(o => { o.disabled = !allowed.includes(o.value); });
    type.value = kind;

    // Plays / Shows: not for text and links; and a dot-revealed spot plays when it appears
    const isModel = kind === 'model';
    const isImage = kind === 'image' || isModel;      // models show like pictures: all the time, or while looked at
    const still = kind === 'text' || kind === 'link';
    q('.sp-play').closest('.sp-row').hidden = still || !!sp.dwell;
    q('.sp-src').placeholder = kind === 'text' ? 'Type the words to show' : 'Paste a link (YouTube, video, sound, picture or web page) — or type some text';
    q('.sp-label').placeholder = kind === 'link' ? 'Button text, e.g. Read more about slates' : kind === 'text' ? 'Heading (optional)' : 'Label, e.g. The teacher’s desk (optional)';
    const opts = isImage ? PLAY_OPTIONS.image : PLAY_OPTIONS.media;
    if (isImage && sp.play === 'start') sp.play = 'tap';
    const sel = q('.sp-play');
    if (sel.dataset.set !== (isImage ? 'image' : 'media')) {
      sel.innerHTML = opts.map(([v, t]) => '<option value="' + v + '">' + t + '</option>').join('');
      sel.dataset.set = isImage ? 'image' : 'media';
    }
    sel.value = sp.play;
    q('.sp-play-word').textContent = isImage ? 'Shows' : 'Plays';

    // Hidden doesn't apply to pictures, text, links or dot-revealed spots; Loop only to video and sound
    q('.sp-turn').hidden = !isModel || !sp.src.trim();
    q('.sp-hide-row').hidden = isImage || still || !!sp.dwell;
    q('.sp-loop-row').hidden = isImage || still;
    const inRoomKind = isImage || still || (kind === 'video' && !sp.hidden);
    q('.sp-pin-row').hidden = !inRoomKind || !sp.src.trim() || isModel;
    q('.sc-more').hidden = isModel;
    const hide = q('.sp-hide');
    hide.disabled = sp.play === 'tap';
    if (sp.play === 'tap' || isImage || still || sp.dwell) { hide.checked = false; sp.hidden = false; }
    q('.sp-hide-note').textContent = sp.play === 'tap'
      ? '— needs one of the automatic options, or nobody could start it'
      : '— nothing shows; it just plays';
    updatePlaceText(i, li);
    renderSpotStatus(i, li);
    updateSummary(li, sp);
  }

  function renderSpotStatus(i, li) {
    li = li || $('spot-list').children[i];
    const sp = spots[i];
    if (!li || !sp) return;
    const el = li.querySelector('.sp-status');
    const yt = Media.youTube(sp.src);
    const kind = HotSpots.kindOf(sp);
    const set = (k, html) => { el.className = 'status sp-status ' + k; el.innerHTML = html; };
    if (!sp.src.trim()) return set('', '');
    if (sp.error) return set('err', escapeHtml(sp.error));
    const dwellNote = sp.dwell ? ' It appears after the viewer rests the crosshair on its dot for a moment (or taps the dot)' +
      (kind === 'video' || kind === 'audio' ? ', and starts playing then.' : '.') : '';
    if (kind === 'text') return set('ok', 'Text card. Drag it in the preview to move it; pull its corners to make the text bigger or smaller. Viewers can tap it to read it full screen.' + dwellNote);
    if (kind === 'link') {
      if (!/^(https?:\/\/|www\.)/i.test(sp.src.trim())) return set('err', 'Links need a web address starting with https://');
      return set('ok', 'A button that opens this page in a new tab. Viewers tap it to go there.' + dwellNote);
    }
    if (/\.(heic|heif|tiff?|psd)(\?|#|$)/i.test(sp.src)) return set('err', 'Most phones’ browsers can’t show this kind of picture. Save it as a JPEG or PNG first.');
    if (!HotSpots.guessKind(sp.src) && !sp.type) {
      return set('note', 'This link doesn’t say what kind of file it is (Google Drive and OneDrive links don’t). Choose its <b>Type</b> above.');
    }
    if (yt && (kind === 'audio' || sp.hidden)) {
      return set('note', 'YouTube’s rules say its player must stay visible, so a sound-only or hidden YouTube spot breaks them. ' +
        'An MP3 link is the safe choice here. On iPhones, sound that starts by itself may begin muted, with a “tap for sound” button.');
    }
    if (sp.dwell && (kind === 'video' || kind === 'audio')) {
      if (yt && kind === 'audio') return set('note', 'YouTube’s rules say its player must stay visible, so a sound-only YouTube spot breaks them. An MP3 link is the safe choice.' + dwellNote);
      return set('ok', 'Click once in the preview, then rest the crosshair on its dot to try it.' + dwellNote);
    }
    if (kind === 'model') {
      return set('ok', '3D model. Drag it in the preview to move it, pull a corner to resize it, and drag the round handle to turn it' +
        (sp.spin ? '' : ' (or use the Turn and Tilt buttons)') + '. Viewers can tap it to look at it up close. ' +
        'Use a <b>.glb</b> file kept in your GitHub site or on Dropbox — Google Drive and OneDrive won’t work for 3D models.' + dwellNote);
    }
    if (kind === 'image' && sp.dwell) return set('ok', 'Drag it in the preview to move it; pull its corners to resize.' + dwellNote);
    if (kind === 'image') {
      return set('ok', sp.play === 'look' ? 'Fades in while the crosshair is on it. Drag it in the preview to move it; pull its corners to resize.'
        : 'Drag it in the preview to move it; pull its corners to resize. Viewers can tap it to see it full screen.');
    }
    const inRoom = kind === 'video' && !sp.hidden;
    if (sp.play === 'tap' && inRoom) return set('ok', 'Viewers press play on the video. Use <b>▶ Test</b> on it in the preview to try it.');
    if (sp.play === 'tap') return set('ok', 'Click its marker in the preview to try it.');
    set('ok', 'Click anywhere in the preview once, then ' + (sp.play === 'look' ? 'turn towards it' : 'it will start') + '.');
  }

  function updatePlaceText(i, li) {
    li = li || $('spot-list').children[i];
    const sp = spots[i];
    if (!li || !sp) return;
    const kind = HotSpots.kindOf(sp);
    const inRoom = sp.src && (kind === 'image' || kind === 'model' || kind === 'text' || kind === 'link' || (kind === 'video' && !sp.hidden));
    li.querySelector('.sp-where').textContent = 'Placed ' + describePlace(sp.yaw, sp.pitch) +
      (inRoom ? (sp.pin ? ' · corners pinned' : ' · ' + Math.round(sp.w || HotSpots.DEFAULT_W) + '° wide') : '');
    li.querySelector('.sp-smaller').hidden = li.querySelector('.sp-bigger').hidden = !inRoom || !!sp.pin;
    if (kind === 'model') {
      const r = (sp.rot || [0, 0, 0]).map(n => Math.round(n));
      li.querySelector('.sp-turn-text').textContent = r.some(Boolean)
        ? 'Turned ' + r[0] + '°' + (r[1] ? ', tilted ' + r[1] + '°' : '') + (r[2] ? ', rolled ' + r[2] + '°' : '') : 'Facing the viewer, not turned';
    }
    updateSummary(li, sp);
  }

  // Highlight a spot's card here and its outline in the preview
  function selectCard(i, scroll) {
    [...$('spot-list').children].forEach((li, n) => li.classList.toggle('selected', n === i));
    const li = $('spot-list').children[i];
    if (scroll && li) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    post({ type: 'selectSpot', index: i });
  }

  $('add-spot').addEventListener('click', () => {
    if (spots.length >= MAX_SPOTS) return;
    spots.push({ src: '', yaw: viewYaw, pitch: viewPitch, w: 20, play: 'tap', type: '', hidden: false, loop: false, dwell: false, label: '', rot: [0, 0, 0], spin: false });
    openIndex = spots.length - 1;
    renderSpots();
    spotsChanged(false);
    openCard(openIndex, true);
    selectCard(openIndex, false);
  });

  // ------------------------------------------------------------- QR code
  function renderQr(f) {
    const ready = f && f.pano && panoOk !== false;
    ['copy', 'dl', 'print', 'embed'].forEach(id => { $(id).disabled = !ready; });
    $('open').classList.toggle('disabled', !ready);
    $('open').setAttribute('aria-disabled', String(!ready));
    const warns = [];

    if (!ready) {
      qrUrl = '';
      $('qr').innerHTML = '<div class="qr-empty">' + (f && f.pano ? 'Fix the photo link above to get a QR code' : 'Your QR code will appear here') + '</div>';
      $('link-out').textContent = '';
      $('open').removeAttribute('href');
      $('warn').hidden = true;
      return;
    }

    qrUrl = viewerUrl(f, false);
    let qr;
    try {
      qr = qrcode(0, 'M'); qr.addData(qrUrl); qr.make();
    } catch (e) {
      $('qr').innerHTML = '<div class="qr-empty">These links are too long to fit in a QR code. Try a shorter link (Google Drive and YouTube links are shortened automatically).</div>';
      return;
    }
    $('qr').innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
    $('link-out').textContent = qrUrl;
    updateEmbed();
    $('open').href = qrUrl;
    $('qr-foot').textContent = spots.some(sp => sp.src) ? 'Turn your sound up 🔊' : 'Look around by moving your phone';

    if (/^(file:|https?:\/\/(localhost|127\.|192\.168\.|10\.))/i.test(qrUrl)) warns.push('This page is running from your own computer, so phones can’t open this link. Use the version on GitHub Pages to make codes.');
    if (panoOk === null) warns.push('Still checking the photo in the preview…');
    if (qr.getModuleCount() > 65) warns.push('This code is quite detailed because the links are long. Print it at least 6 cm wide so phones can read it.');
    $('warn').innerHTML = warns.join('<br>');
    $('warn').hidden = !warns.length;
  }

  $('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(qrUrl); flash($('copy'), 'Copied ✓'); }
    catch (e) { prompt('Copy this link:', qrUrl); }
  });
  $('print').addEventListener('click', () => window.print());

  // Embed code for other websites
  function updateEmbed() {
    if (!qrUrl) return;
    const h = $('embed-h').value;
    const attrs = 'src="' + qrUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"\n  title="' +
      (readForm().title || '360° experience').replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"\n  ' +
      'allow="accelerometer; gyroscope; magnetometer; autoplay; fullscreen; camera; xr-spatial-tracking" allowfullscreen';
    $('embed-code').value = h === 'wide'
      ? '<div style="position:relative;width:100%;aspect-ratio:16/9">\n<iframe ' + attrs + '\n  style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>\n</div>'
      : '<iframe ' + attrs + '\n  style="width:100%;height:' + h + 'px;border:0"></iframe>';
  }
  $('embed').addEventListener('click', () => {
    const open = $('embed-panel').hidden;
    $('embed-panel').hidden = !open;
    $('embed').setAttribute('aria-expanded', String(open));
    if (open) updateEmbed();
  });
  $('embed-h').addEventListener('change', updateEmbed);
  $('embed-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('embed-code').value); flash($('embed-copy'), 'Copied ✓'); }
    catch (e) { $('embed-code').select(); }
  });
  $('dl').addEventListener('click', () => {
    const svg = $('qr').querySelector('svg');
    const img = new Image();
    img.onload = () => {
      const size = 1200, c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, size, size);
      const a = document.createElement('a');
      a.download = ((readForm().title || '360 experience').replace(/[^\w\- ]+/g, '').trim() || 'qr') + ' QR.png';
      a.href = c.toDataURL('image/png');
      a.click();
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
  });

  function flash(btn, text) {
    const old = btn.textContent; btn.textContent = text;
    setTimeout(() => { btn.textContent = old; }, 1600);
  }
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ------------------------------------------------------------- wiring
  let t = 0;
  $('form').addEventListener('input', () => { clearTimeout(t); t = setTimeout(refresh, 450); });
  $('in-pano').addEventListener('change', refresh);
  $('sample').addEventListener('click', () => {
    $('in-pano').value = new URL('panoramas/sample-room.jpg', here).href;
    if (!$('in-title').value) $('in-title').value = 'Sample room';
    if (!spots.length) {
      spots = [{ src: new URL('audio/clock-tick.mp3', here).href, yaw: 90, pitch: 5, w: HotSpots.DEFAULT_W,
        play: 'look', type: 'audio', hidden: false, loop: true, label: 'Ticking clock' },
        { src: new URL('panoramas/sample-slate.png', here).href, yaw: -30, pitch: 4, w: 24,
        play: 'tap', type: '', hidden: false, loop: false, dwell: true, label: '' },
        { src: 'Pupils wrote on slates with a slate pencil, then wiped them clean to use again.', yaw: 30, pitch: 2, w: 26,
        play: 'tap', type: '', hidden: false, loop: false, dwell: false, label: 'Did you know?' },
        { src: 'https://en.wikipedia.org/wiki/Writing_slate', yaw: 30, pitch: -14, w: 24,
        play: 'tap', type: '', hidden: false, loop: false, dwell: false, label: 'Read about slates' },
        { src: new URL('models/sample-inkwell.glb', here).href, yaw: -4, pitch: -16, w: 12,
        play: 'tap', type: '', hidden: false, loop: false, dwell: false, label: 'Inkwell', rot: [0, 15, 0], spin: true }];
      renderSpots();
    }
    yaw = 0; updateFacing(); refresh();
  });

  // Preview shape: an upright phone (what most viewers will see) or a wide screen
  function setShape(phone) {
    $('frame').classList.toggle('phone', phone);
    $('shape-phone').setAttribute('aria-pressed', String(phone));
    $('shape-wide').setAttribute('aria-pressed', String(!phone));
  }
  $('shape-phone').addEventListener('click', () => setShape(true));
  $('shape-wide').addEventListener('click', () => setShape(false));

  loadFromAddress();
  updateFacing();
  renderSpots();
  refresh();
})();
