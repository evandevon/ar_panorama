/*
 * FILE GUIDE: js/create.js  ·  the tour maker page (make.html): links in → live preview → QR code out.
 *   Nothing is stored anywhere but the link (and the page's own address, for reloading).
 * Loaded by: make.html. Depends on: js/sources.js (Media), js/spots.js (HotSpots.encode/decode/kindOf only),
 *   vendor/qrcode.js. The live preview is index.html?preview=1 in an iframe, driven by postMessage
 *   (see the list in viewer.js).
 * Sections (search for "// ---- <name>"): state ↔ page address · status lines · problems with a link (⚠ beside the
 *   field) · preview · starting direction · video spots · the front layer (= "Masking" in the page) · spot cards ·
 *   QR code · wiring
 * Spot card options live in the card markup string (search "sc-checks") and syncCard() decides which show.
 * Gotchas: wide screens use an "editor" layout (css/create.css, min-width 900px): body scrolls as the left
 *   column, the preview panel is position:fixed on the right. sendWindow() tells the preview the phone-window size.
 */
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
  // Masks: outlines on the photo that hide the visual spots behind them ({ kind: 'front', pts: [[yaw, pitch]…] })
  let layers = [];
  let layerTool = null, layerDraft = [], layerEditing = false;
  const halfDeg = n => +(Math.round(n * 2) / 2).toFixed(1);
  const encodeLayer = l => (l.kind === 'window' ? 'w' : '') + l.pts.map(p => halfDeg(p[0]) + ',' + halfDeg(p[1])).join(',');
  function decodeLayer(str) {
    str = String(str || '').trim();
    const n = str.replace(/^w/i, '').split(',').map(Number);
    if (n.length < 6 || n.length % 2 || !n.every(Number.isFinite)) return null;
    const pts = []; for (let i = 0; i < n.length; i += 2) pts.push([n[i], n[i + 1]]);
    return { kind: /^w/i.test(str) ? 'window' : 'front', pts };
  }

  // ------------------------------------------------------------- state ↔ page address
  function readForm() {
    return {
      pano: $('in-pano').value.trim(),
      title: $('in-title').value.trim(),
      align: $('in-align').checked,
      bright: Number($('in-bright').value) || 1,
      pano2: $('in-pano2').value.trim(),            // then and now: a second photo, its turn, and the two names
      yaw2: Number($('in-yaw2').value) || 0,
      n1: $('in-n1').value.trim(),
      n2: $('in-n2').value.trim()
    };
  }

  let editCheckT = 0;
  function saveToAddress(f) {
    clearTimeout(editCheckT); editCheckT = setTimeout(checkDriveEdits, 900);
    const q = new URLSearchParams();
    if (f.pano) q.set('p', f.pano);
    if (f.title) q.set('t', f.title);
    if (yaw) q.set('y', yaw);
    if (f.align) q.set('al', '1');
    if (f.bright !== 1 && hasModels()) q.set('mb', f.bright);
    compareParams(f, false).forEach(([k, v]) => q.set(k, v));
    spots.filter(sp => sp.src.trim()).forEach(sp => q.append('s', HotSpots.encode(sp, false)));
    layers.forEach(l => q.append('f', encodeLayer(l)));
    history.replaceState(null, '', q.toString() ? '?' + q : location.pathname);
  }

  function loadFromAddress() {
    const q = new URLSearchParams(location.search);
    $('in-pano').value = q.get('p') || '';
    $('in-title').value = q.get('t') || '';
    $('in-align').checked = q.get('al') === '1';
    $('in-bright').value = Number(q.get('mb')) || 1;
    $('in-pano2').value = q.get('p2') || '';
    $('in-yaw2').value = Number(q.get('y2')) || 0;
    $('in-n1').value = q.get('n1') || '';
    $('in-n2').value = q.get('n2') || '';
    if (q.get('p2')) $('compare-box').open = true;
    $('yaw2-out').textContent = (Number(q.get('y2')) || 0) + '°';
    yaw = Number(q.get('y')) || 0;
    spots = q.getAll('s').map(HotSpots.decode).filter(Boolean);
    layers = q.getAll('f').map(decodeLayer).filter(Boolean);
    spots.forEach(sp => { delete sp.behind; });
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
    compareParams(f, true).forEach(p => q.push(p));
    if (!preview) spots.filter(sp => sp.src.trim()).forEach(sp => q.push(['s', HotSpots.encode(sp, true)]));
    if (!preview) layers.forEach(l => q.push(['f', encodeLayer(l)]));
    if (preview) q.push(['preview', '1']);
    else q.push(['v', '2']);                        // format version, and a safe last character for email
    return here.href + '?' + q.map(([k, v]) => k + '=' + enc(String(v))).join('&');
  }

  // Then and now: only when there's a second photo (a turn or names alone mean nothing)
  function compareParams(f, short) {
    if (!f.pano2) return [];
    const q = [['p2', short ? Media.shorten(f.pano2) : f.pano2]];
    if (f.yaw2) q.push(['y2', f.yaw2]);
    if (f.n1) q.push(['n1', f.n1]);
    if (f.n2) q.push(['n2', f.n2]);
    return q;
  }

  // A Google Drive sound or video
  function isDriveMedia(sp) {
    const kind = HotSpots.kindOf(sp);
    return (kind === 'audio' || kind === 'video') && !Media.youTube(sp.src) && /drive\.google\.com|docs\.google\.com\/uc|^gd:/i.test(sp.src.trim());
  }
  // Without this website's Drive key (js/settings.js), Drive sounds and videos can only play in Google's own player
  // (Google blocks other sites since 2024). With it, they're downloaded whole and play like any other file.
  function isDrivePlayer(sp) {
    return isDriveMedia(sp) && !Media.canDownloadDrive(sp.src);
  }
  // Where a see-through video can be kept
  const seeThroughHomes = () => Media.driveKey() ? 'your GitHub site, Dropbox or Google Drive' : 'your GitHub site or Dropbox';

  // A visual spot in the room (masks can hide it): not a sound, a hidden player, a link, or Google's audio player
  function isMaskable(sp) {
    const kind = HotSpots.kindOf(sp);
    if (!sp.src.trim() || kind === 'audio' || kind === 'link') return false;
    if (kind === 'video' && sp.hidden && !sp.dwell && !sp.stacked && sp.play !== 'tap') return false;
    return true;
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
    if (id === 'pano-status') {                    // problems with the photo link: an icon beside the field
      fieldError($('in-pano'), kind === 'err' ? html : '');
      if (kind === 'err') { el.className = 'status'; el.innerHTML = ''; return; }
    }
    el.className = 'status ' + (kind || '');
    el.innerHTML = html || '';
  }

  // ------------------------------------------------------------- problems with a link: ⚠ beside the field
  // The message shows as a tooltip on hover, on keyboard focus, or when the icon is tapped (phones have no hover).
  function fieldError(input, html) {
    const wrap = input && input.closest('.field-wrap');
    if (!wrap) return;
    const btn = wrap.querySelector('.field-err'), tip = wrap.querySelector('.err-tip');
    if (!html) {
      btn.hidden = true; tip.hidden = true; tip.innerHTML = '';
      btn.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-invalid'); wrap.classList.remove('has-err');
      return;
    }
    if (tip.innerHTML !== html) tip.innerHTML = html;
    btn.hidden = false;
    input.setAttribute('aria-invalid', 'true'); wrap.classList.add('has-err');
  }
  function showTip(btn, on) {
    const tip = btn.parentElement.querySelector('.err-tip');
    if (!tip || btn.hidden) return;
    tip.hidden = !on;
    btn.setAttribute('aria-expanded', String(on));
  }
  let pinnedTip = null;                             // opened by a tap/click: stays until tapped again or elsewhere
  document.addEventListener('mouseover', e => { const b = e.target.closest && e.target.closest('.field-err'); if (b) showTip(b, true); });
  document.addEventListener('mouseout', e => { const b = e.target.closest && e.target.closest('.field-err'); if (b && b !== pinnedTip && !b.contains(e.relatedTarget)) showTip(b, false); });
  document.addEventListener('focusin', e => { if (e.target.classList && e.target.classList.contains('field-err')) showTip(e.target, true); });
  document.addEventListener('focusout', e => { if (e.target.classList && e.target.classList.contains('field-err') && e.target !== pinnedTip) showTip(e.target, false); });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.field-err');
    if (pinnedTip && pinnedTip !== b) { showTip(pinnedTip, false); pinnedTip = null; }
    if (b) { const open = pinnedTip !== b; showTip(b, open); pinnedTip = open ? b : null; }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && pinnedTip) { showTip(pinnedTip, false); pinnedTip.focus(); pinnedTip = null; } });

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
      panoOk = null; setNavEnabled(panoOk === true); loadedKey = '';
      renderQr(null);
      return;
    }
    const bad = checkPanoLink(f.pano);
    if (bad) {
      showEmpty('');
      status('pano-status', 'err', bad);
      panoOk = false; setNavEnabled(panoOk === true); loadedKey = '';
      renderQr(null);
      return;
    }

    // Reload the preview only when what it shows has changed (not for title edits)
    const key = [f.pano, yaw, f.pano2].join('|');
    if (key !== loadedKey) {
      if (f.pano2) status('pano2-status', 'wait', 'Loading the second photo…'); else status('pano2-status');
      $('compare-opts').hidden = true;
      loadedKey = key;
      panoOk = null; setNavEnabled(panoOk === true);
      status('pano-status', 'wait', 'Loading the photo…');
      const frame = $('frame');
      frame.querySelectorAll('iframe').forEach(i => i.remove());
      $('empty').hidden = true;
      const ifr = document.createElement('iframe');
      ifr.title = 'Preview of the 360° experience — drag to look around';
      ifr.allow = 'autoplay; fullscreen; accelerometer; gyroscope';
      ifr.src = viewerUrl(f, true);
      frame.appendChild(ifr);
      frame.classList.add('has-pano');
    }
    renderQr(f);
  }

  function showEmpty(text) {
    $('frame').querySelectorAll('iframe').forEach(i => i.remove());
    $('frame').classList.remove('has-pano');
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
        panoOk = true; setNavEnabled(panoOk === true);
        $('set-start').disabled = false;
        sendSpots();
        renderSpots();
        sendLayers(); renderLayers();
        sendWindow();
        if (m.video) {
          status('pano-status', m.width > 4096 ? 'note' : 'ok', '360 video loaded (' + m.width + ' × ' + m.height + ').' +
            (m.width > 4096 ? ' Many phones can’t play 360 video wider than 4096 px — 2880 × 1440 is a safe size.' : '') +
            ' Press <b>Play</b> in the preview to watch it; viewers’ video starts when they tap to begin.');
        } else status('pano-status', m.warning ? 'note' : 'ok', m.warning || ('Photo loaded (' + m.width + ' × ' + m.height + ').' +
          (m.width > 8192 ? ' That’s very large — around 4096 × 2048 loads faster on phones.' : '')));
      } else if (m.state === 'error') {
        panoOk = false; setNavEnabled(panoOk === true);
        status('pano-status', 'err', escapeHtml(m.message));
      }
      renderQr(readForm());
    } else if (m.type === 'compare') {
      $('compare-opts').hidden = m.state !== 'ready';
      if (m.state === 'ready') status('pano2-status', 'ok', 'Second photo loaded (' + m.width + ' × ' + m.height + '). Drag the bar in the preview to compare.');
      else status('pano2-status', 'err', escapeHtml(m.message));
    } else if (m.type === 'view') {
      viewYaw = m.yaw; viewPitch = m.pitch || 0;
    } else if (m.type === 'spotError') {
      const sp = spots[m.index];
      // an error that arrives late, about a file this spot no longer uses, is ignored
      const same = !!sp && (m.src == null || [m.src, Media.expand(m.src)].map(x => String(x).trim()).some(x => x === sp.src.trim() || x === Media.expand(sp.src).trim() || x === Media.shorten(sp.src)));
      if (same) {
        sp.error = m.message; renderSpotStatus(m.index);
        const li = $('spot-list').children[m.index]; if (li) updateSummary(li, sp);
      }
    } else if (m.type === 'layerPoint') {
      if (!layerTool) return;
      layerDraft.push([m.yaw, m.pitch]); sendLayers(); renderLayerBar();
    } else if (m.type === 'layerClose') {
      finishLayer();
    } else if (m.type === 'layerMove') {
      const l = layers[m.shape];
      if (l && l.pts[m.point]) { l.pts[m.point] = [m.yaw, m.pitch]; layersChanged(false); }
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
    loadedKey = [readForm().pano, yaw, readForm().pano2].join('|'); // preview already shows this view
    const ifr = $('frame').querySelector('iframe');
    if (ifr) ifr.contentWindow.postMessage({ type: 'setYaw', yaw: yaw }, location.origin);
    updateFacing(); refresh();
    status('pano-status', 'ok', 'Starting view saved. Viewers will begin facing this way.');
  });
  $('reset-start').addEventListener('click', () => {
    yaw = 0;
    loadedKey = [readForm().pano, yaw, readForm().pano2].join('|');
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

  // ------------------------------------------------------------- the front layer ("Things in front")
  const LAYER_NAMES = { front: 'Mask', window: 'Window mask' };
  function sendLayers() {
    post({ type: 'setLayers', shapes: layers.map(encodeLayer), show: $('layer-show').checked || !!layerTool,
      tool: layerTool, draft: layerTool ? { kind: layerTool, pts: layerDraft } : null, editing: layerEditing });
  }
  function layersChanged(resend) {
    saveToAddress(readForm());
    if (resend) sendLayers();
    if (resend) [...$('spot-list').children].forEach((li, i) => { if (spots[i]) { syncCard(li, spots[i], i); updateSummary(li, spots[i]); } });
    renderLayers();
    renderQr(readForm());
  }
  function renderLayerBar() {
    $('layer-bar').hidden = !layerTool;
    if (!layerTool) return;
    $('layer-what').textContent = LAYER_NAMES[layerTool];
    $('layer-count').textContent = !layerDraft.length ? 'click around the edge of it in the preview, dot by dot.'
      : (layerDraft.length === 1 ? '1 dot so far.' : layerDraft.length + ' dots so far.') + (layerDraft.length >= 3 ? ' Click the first dot or press Done to finish.' : '');
    $('layer-done').disabled = layerDraft.length < 3;
    $('layer-undo').disabled = !layerDraft.length;
  }
  function renderLayers() {
    const ul = $('layer-list');
    ul.innerHTML = '';
    layers.forEach((l, i) => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="lmark ' + l.kind + '" aria-hidden="true"></span><span>' + LAYER_NAMES[l.kind] + ' ' + (i + 1) + ' <span class="help-inline">(' + l.pts.length + ' dots)</span></span>';
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'btn small ghost'; del.textContent = 'Delete';
      del.setAttribute('aria-label', 'Delete ' + LAYER_NAMES[l.kind].toLowerCase() + ' ' + (i + 1));
      del.addEventListener('click', () => { layers.splice(i, 1); layersChanged(true); status('layer-status', '', 'Mask deleted.'); });
      li.appendChild(del); ul.appendChild(li);
    });
    $('layer-opts').hidden = !layers.length;
    document.querySelectorAll('.ltool').forEach(b => { b.disabled = panoOk !== true; b.setAttribute('aria-pressed', String(b.dataset.kind === layerTool)); });
    renderLayerBar();
  }
  function setLayerTool(kind) {
    layerTool = kind; layerDraft = [];
    renderLayers(); sendLayers();
    if (kind) status('layer-status', '', 'Turn the preview to it, then click around its edge dot by dot.');
  }
  function finishLayer() {
    if (!layerTool || layerDraft.length < 3) return;
    layers.push({ kind: layerTool, pts: layerDraft.slice() });
    const what = LAYER_NAMES[layerTool];
    layerTool = null; layerDraft = [];
    layersChanged(true);
    status('layer-status', 'ok', 'Mask added: pictures, videos, 3D models and text behind it are hidden there. Use <b>Adjust the dots</b> to fine-tune it.');
  }
  document.querySelectorAll('.ltool').forEach(b => b.addEventListener('click', () => setLayerTool(layerTool === b.dataset.kind ? null : b.dataset.kind)));
  $('layer-done').addEventListener('click', finishLayer);
  $('layer-undo').addEventListener('click', () => { layerDraft.pop(); sendLayers(); renderLayerBar(); });
  $('layer-cancel').addEventListener('click', () => { setLayerTool(null); status('layer-status', '', ''); });
  $('layer-show').addEventListener('change', sendLayers);
  $('layer-edit').addEventListener('click', () => {
    layerEditing = !layerEditing;
    $('layer-edit').setAttribute('aria-pressed', String(layerEditing));
    $('layer-edit').textContent = layerEditing ? 'Finish adjusting' : 'Adjust the dots';
    if (layerEditing) { $('layer-show').checked = true; status('layer-status', '', 'Drag the dots in the preview to adjust the masks.'); }
    sendLayers();
  });
  document.addEventListener('keydown', e => {
    if (!layerTool) return;
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'checkbox';
    if (e.key === 'Escape') { setLayerTool(null); e.preventDefault(); }
    else if (e.key === 'Enter' && layerDraft.length >= 3 && !typing && e.target.tagName !== 'BUTTON') { finishLayer(); e.preventDefault(); }
    else if (e.key === 'Backspace' && layerDraft.length && !typing) { layerDraft.pop(); sendLayers(); renderLayerBar(); e.preventDefault(); }
  });

  // ------------------------------------------------------------- Drive edit links
  // A Drive file shared as "Anyone with the link → Editor" could be changed or deleted by anyone who finds its link
  // in the tour. Google is asked (with this site's key) what a visitor may do with each Drive file the tour uses;
  // if they could edit it, the author is asked once whether they meant that. "I meant it" is remembered per file.
  const EDIT_OK = 'tour-edit-ok:';
  const editAsked = new Set();                 // asked this visit (so closing the box doesn't bring it straight back)
  const editQueue = [];
  let editShowing = null;
  function driveLinksInUse() {
    const f = readForm();
    return [f.pano, f.pano2].concat(spots.map(sp => sp.src || '')).filter(t => t && Media.driveFileId(t));
  }
  function checkDriveEdits() {
    if (!Media.driveKey()) return;
    driveLinksInUse().forEach(token => {
      const id = Media.driveFileId(token);
      if (editAsked.has(id)) return;
      let ok = false;
      try { ok = localStorage.getItem(EDIT_OK + id) === '1'; } catch (e) {}
      if (ok) return;
      Media.driveAccess(token).then(info => {
        if (!info || !info.canEdit || editAsked.has(id)) return;
        editAsked.add(id);
        editQueue.push({ token, info });
        showEditAsk();
      });
    });
  }
  function showEditAsk() {
    const box = $('edit-ask');
    if (editShowing || !editQueue.length || !box || !box.showModal) return;
    editShowing = editQueue.shift();
    const { token, info } = editShowing;
    $('edit-ask-name').textContent = info.name ? '“' + info.name + '”' : 'This file';
    const docs = Media.expand(token).match(/docs\.google\.com\/(document|presentation|spreadsheets|forms|drawings)\/d\//i);
    $('edit-ask-open').href = docs ? 'https://docs.google.com/' + docs[1] + '/d/' + info.id + '/edit' : 'https://drive.google.com/file/d/' + info.id + '/view';
    status('edit-ask-status');
    box.showModal();
    $('edit-ask-open').focus();
  }
  function closeEditAsk() {
    const box = $('edit-ask');
    if (box.open) box.close();
  }
  if ($('edit-ask')) {
    $('edit-ask').addEventListener('close', () => { editShowing = null; setTimeout(showEditAsk, 300); });
    $('edit-ask-keep').addEventListener('click', () => {
      try { localStorage.setItem(EDIT_OK + editShowing.info.id, '1'); } catch (e) {}
      closeEditAsk();
    });
    $('edit-ask-again').addEventListener('click', () => {
      const cur = editShowing;
      Media.forgetDriveAccess(cur.token);
      status('edit-ask-status', 'wait', 'Asking Google…');
      Media.driveAccess(cur.token).then(info => {
        if (editShowing !== cur) return;
        if (!info) return status('edit-ask-status', 'err', 'Google couldn’t say. Check the file is still shared as Anyone with the link, then try again.');
        if (info.canEdit) return status('edit-ask-status', 'err', 'It’s still editable by anyone with the link. (Changes in Drive can take a minute to show.)');
        status('edit-ask-status', 'ok', 'Done: it’s view-only now.');
        setTimeout(() => { if (editShowing === cur) closeEditAsk(); }, 1400);
      });
    });
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
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 14a8 8 0 0 1-8 8"/><path d="M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1"/><path d="M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10"/><path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 2h8l5 5v15H6z"/><path d="M14 2v5h5M9 13h6M9 17h6"/></svg>',
    model: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/></svg>',
    none: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/></svg>'
  };
  const CHEVRON = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>';
  // Floating spots: nine places on the screen (across, down: 0–100), for choosing without dragging
  const FLOAT_SPOTS = [[0, 0, 'Top left'], [50, 0, 'Top middle'], [100, 0, 'Top right'], [0, 50, 'Middle left'], [50, 50, 'Middle'],
    [100, 50, 'Middle right'], [0, 100, 'Bottom left'], [50, 100, 'Bottom middle'], [100, 100, 'Bottom right']];
  function floatPlace(x, y) {
    const hit = FLOAT_SPOTS.find(([a, b]) => Math.abs(a - x) < 4 && Math.abs(b - y) < 4);
    if (hit) return hit[2].toLowerCase();
    const h = x < 34 ? 'left' : x > 66 ? 'right' : 'middle', v = y < 34 ? 'top' : y > 66 ? 'bottom' : 'middle';
    return h === v ? 'middle' : v + ' ' + h;
  }
  const KIND_NAMES = { video: 'Video', audio: 'Sound', image: 'Picture', text: 'Text', link: 'Link', model: '3D model', doc: 'Document' };

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
        '<div class="sc-field sc-type"><label for="' + id + '-type">Type</label><select id="' + id + '-type" class="sp-type">' +
            '<option value="">Choose, or paste a link below…</option><option value="video">Video</option><option value="audio">Sound only</option><option value="image">Picture</option>' +
            '<option value="text">Text</option><option value="link">Link to a web page</option><option value="doc">Document (PDF, Word, slides…)</option><option value="model">3D model</option></select></div>' +
        '<div class="sc-field"><label for="' + id + '-src" class="sp-src-label">Link or text</label>' +
          '<span class="field-wrap"><textarea id="' + id + '-src" class="sp-src" rows="1" aria-describedby="' + id + '-err" placeholder="Paste a link (YouTube, video, sound, picture or web page) — or type some text"></textarea>' +
          '<button type="button" class="field-err" hidden aria-label="Problem with this link — show details" aria-controls="' + id + '-err" aria-expanded="false">!</button>' +
          '<span class="err-tip" id="' + id + '-err" role="tooltip" hidden></span></span></div>' +
        '<div class="sc-field"><label for="' + id + '-label">Label <span class="opt">optional</span></label>' +
          '<input id="' + id + '-label" type="text" class="sp-label" maxlength="40" placeholder="e.g. The teacher’s desk"></div>' +
        '<div class="sc-grid">' +
          '<label class="sp-row">Appears<select class="sp-dwell">' +
            '<option value="0">Straight away</option><option value="delay">After a delay</option><option value="1">After looking at a dot</option></select></label>' +
          '<label class="sp-row sp-delay-row" hidden>Seconds after the viewer starts<input type="number" class="sp-delay" min="1" max="3600" step="1" inputmode="numeric"></label>' +
          '<label class="sp-row"><span class="sp-play-word">Plays</span><select class="sp-play"></select></label>' +
        '</div>' +
        '<div class="sc-checks">' +
          '<label class="check sp-float-row"><input type="checkbox" class="sp-float"><span>Float on the screen <span class="help-inline">— stays in the same place on the screen as viewers look around, like a sticker on the glass</span></span></label>' +
          '<label class="check sp-plan-row"><input type="checkbox" class="sp-plan"><span>Floor plan <span class="help-inline">— a “you are here” dot, and a cone that turns to show which way the viewer is facing</span></span></label>' +
          '<label class="check sp-hide-row"><input type="checkbox" class="sp-hide"><span>Hidden <span class="help-inline sp-hide-note"></span></span></label>' +
          '<label class="check sp-loop-row"><input type="checkbox" class="sp-loop"><span>Loop <span class="help-inline">— start again when it ends</span></span></label>' +
          '<label class="check sp-vanish-row"><input type="checkbox" class="sp-vanish"><span>Disappear when it ends <span class="help-inline">— instead of staying on its last frame</span></span></label>' +
          '<label class="check sp-stk-row"><input type="checkbox" class="sp-stk"><span>See-through video <span class="help-inline">— the room shows around it (make one with the <a href="videomaker.html" target="_blank" rel="noopener">See-through Video Maker</a>)</span></span></label>' +
          '<div class="sp-stk-kind" role="radiogroup" aria-label="Kind of see-through video" hidden>' +
            '<label class="check"><input type="radio" class="sp-stk-mp4"><span>See-through MP4 <span class="help-inline">— from the Video Maker; plays on every phone</span></span></label>' +
            '<label class="check"><input type="radio" class="sp-stk-webm"><span>WebM with its own transparency <span class="help-inline">— iPhones and iPads can’t play these</span></span></label>' +
          '</div>' +
          '<label class="check sp-mask-row" hidden><input type="checkbox" class="sp-mask"><span>Hidden by masks <span class="help-inline">— untick to keep it in front of every mask</span></span></label>' +
          '<label class="check sp-pin-row"><input type="checkbox" class="sp-pin"><span>Pin corners <span class="help-inline">— drag each corner onto the matching point in the photo, e.g. a picture frame or window</span></span></label>' +
        '</div>' +
        '<div class="sp-floatpos" role="group" aria-label="Where it sits on the screen" hidden>' +
          FLOAT_SPOTS.map(([x, y, name]) => '<button type="button" class="sp-fpos" data-x="' + x + '" data-y="' + y + '" aria-label="' + name + '" title="' + name + '" aria-pressed="false"><span aria-hidden="true"></span></button>').join('') +
        '</div>' +
        '<div class="sp-planset" hidden>' +
          '<p class="help flush">Click the plan where the 360° photo was taken.</p>' +
          '<div class="sp-plan-pick" tabindex="0" role="slider" aria-label="Where the photo was taken on the plan: click it, or use the arrow keys" aria-valuemin="0" aria-valuemax="100">' +
            '<img class="sp-plan-img" alt=""><span class="sp-plan-dot" aria-hidden="true"></span></div>' +
          '<label class="sp-plan-turn-label">Turn the cone to match the plan <output class="sp-plan-turn-out"></output>' +
            '<input type="range" class="sp-plan-turn" min="-180" max="180" step="1"></label>' +
          '<button type="button" class="btn small ghost sp-plan-here">The way the preview faces now is the top of the plan</button>' +
          '<p class="help">Look around in the preview: when you face something, the cone on the plan should point at it.</p>' +
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
          '<label class="check sp-spin-row"><input type="checkbox" class="sp-spin"><span>Spins slowly</span></label>' +
          '<label class="check sp-flat-row"><input type="checkbox" class="sp-flat"><span>Bright, flat colours <span class="help-inline">— matte, with the colours as you picked them, like Tinkercad shows them. Untick for the file’s own materials (shinier, often paler).</span></span></label></div>' +
        '<p class="status sp-status" role="status" aria-live="polite"></p>' +
      '</div>';

    const q = c => li.querySelector(c);
    q('.sp-src').value = sp.src;
    q('.sp-dwell').value = sp.dwell ? '1' : sp.delay > 0 ? 'delay' : '0';
    q('.sp-delay').value = sp.delay > 0 ? sp.delay : 5;
    q('.sp-float').checked = !!sp.float;
    q('.sp-plan').checked = !!sp.plan;
    const grow = ta => { ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight + 2) + 'px'; };
    q('.sp-label').value = sp.label || '';
    q('.sp-hide').checked = !!sp.hidden;
    q('.sp-loop').checked = !!sp.loop;
    q('.sp-vanish').checked = !!sp.vanish;
    q('.sp-vanish').addEventListener('change', e => { sp.vanish = e.target.checked; updateSummary(li, sp); spotsChanged(true); });
    q('.sp-pin').checked = !!sp.pin;
    q('.sp-mask').checked = !sp.noMask;
    q('.sp-mask').addEventListener('change', e => { sp.noMask = !e.target.checked; updateSummary(li, sp); spotsChanged(true); });
    q('.sp-spin').checked = !!sp.spin;
    q('.sp-stk').checked = !!sp.stacked;
    q('.sp-stk-mp4').name = q('.sp-stk-webm').name = 'stk-' + (++stkGroups);
    q('.sp-stk-webm').checked = !!sp.alpha; q('.sp-stk-mp4').checked = !sp.alpha;
    q('.sp-flat').checked = !!sp.flat;
    li.dataset.index = i;
    li.addEventListener('focusin', () => selectCard(i, false));
    q('.sc-toggle').addEventListener('click', () => { openCard(openIndex === i ? -1 : i, false); selectCard(i, false); });

    let typing = 0;
    q('.sp-src').addEventListener('input', e => {
      // OneDrive's Share → Embed gives a bit of HTML: keep just its address
      const embedded = Media.fromEmbedCode(e.target.value);
      if (embedded) { e.target.value = embedded; sp.type = 'doc'; sp.autoDoc = true; }
      grow(e.target);
      sp.src = e.target.value; sp.error = '';
      // A document link becomes a Document spot by itself (the author can still change it)
      if (Media.looksLikeDoc(sp.src) && !sp.type) { sp.type = 'doc'; sp.autoDoc = true; }
      const auto = autoSeeThrough(sp.src);
      if (auto && (!sp.stacked || sp.autoStk)) setSeeThrough(li, sp, true, auto === 'alpha', true);
      else if (sp.autoStk && !auto) setSeeThrough(li, sp, false, false, false);
      else if (sp.autoDoc && sp.type === 'doc' && !Media.looksLikeDoc(sp.src) && !/drive\.google|1drv\.ms|onedrive|sharepoint/i.test(sp.src)) { sp.type = ''; sp.autoDoc = false; }
      syncCard(li, sp, i);
      clearTimeout(typing); typing = setTimeout(() => {
        spotsChanged(true);
        // Any other WebM: look inside it for transparency, and tick "See-through video" if it has some
        const src = sp.src;
        if (!sp.stacked && /\.webm(\?|#|$)/i.test(src)) Media.probeAlpha(src).then(has => {
          if (has && sp.src === src && !sp.stacked) { setSeeThrough(li, sp, true, true, true); syncCard(li, sp, i); spotsChanged(true); }
        });
      }, 600);
    });
    q('.sp-label').addEventListener('input', e => {
      sp.label = e.target.value;
      updateSummary(li, sp);
      clearTimeout(typing); typing = setTimeout(() => spotsChanged(true), 600);
    });
    q('.sp-type').addEventListener('change', e => { sp.type = e.target.value; sp.autoDoc = false; sp.error = ''; syncCard(li, sp, i); spotsChanged(true); });
    q('.sp-dwell').addEventListener('change', e => {
      sp.dwell = e.target.value === '1'; if (sp.dwell) sp.hidden = false;
      sp.delay = e.target.value === 'delay' ? Math.max(1, Number(q('.sp-delay').value) || 5) : 0;
      syncCard(li, sp, i); spotsChanged(true);
    });
    q('.sp-delay').addEventListener('input', e => {
      const v = Number(e.target.value);
      if (!(v > 0)) return;                                    // half-typed: wait
      sp.delay = Math.min(3600, v); updateSummary(li, sp); renderSpotStatus(i, li);
      clearTimeout(typing); typing = setTimeout(() => spotsChanged(true), 500);
    });
    q('.sp-delay').addEventListener('change', e => { if (!(Number(e.target.value) > 0)) e.target.value = sp.delay || 5; });
    // Floating: remember where it was in the room (and on the screen), so switching back and forth loses nothing
    q('.sp-float').addEventListener('change', e => {
      if (e.target.checked) {
        sp.roomPlace = { yaw: sp.yaw, pitch: sp.pitch, w: sp.w, pin: sp.pin };
        const f = sp.floatPlace || { yaw: 100, pitch: 100, w: 30 };
        Object.assign(sp, { float: true, yaw: f.yaw, pitch: f.pitch, w: f.w, pin: null });
      } else {
        sp.floatPlace = { yaw: sp.yaw, pitch: sp.pitch, w: sp.w };
        const r = sp.roomPlace || { yaw: viewYaw, pitch: viewPitch, w: HotSpots.DEFAULT_W, pin: null };
        Object.assign(sp, { float: false, yaw: r.yaw, pitch: r.pitch, w: r.w, pin: r.pin || null });
      }
      q('.sp-pin').checked = !!sp.pin;
      syncCard(li, sp, i); spotsChanged(true);
    });
    // Floor plan: where the photo was taken on it, and which way it's turned
    let planT = 0;
    const planChanged = () => { showPlan(li, sp); clearTimeout(planT); planT = setTimeout(() => spotsChanged(true), 60); };
    q('.sp-plan').addEventListener('change', e => {
      if (!e.target.checked) sp.planWas = sp.plan;                 // remembered, in case it's ticked again
      sp.plan = e.target.checked ? (sp.planWas || [50, 50, Math.round(yaw)]) : null;   // the cone first points up when facing the start
      syncCard(li, sp, i); spotsChanged(true);
    });
    q('.sp-plan-pick').addEventListener('click', e => {
      const r = q('.sp-plan-img').getBoundingClientRect();
      if (!r.width || !sp.plan) return;
      sp.plan[0] = Math.max(0, Math.min(100, Math.round((e.clientX - r.left) / r.width * 100)));
      sp.plan[1] = Math.max(0, Math.min(100, Math.round((e.clientY - r.top) / r.height * 100)));
      planChanged();
    });
    q('.sp-plan-pick').addEventListener('keydown', e => {
      const d = e.shiftKey ? 10 : 2, mv = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
      if (!mv || !sp.plan) return;
      e.preventDefault();
      sp.plan[0] = Math.max(0, Math.min(100, sp.plan[0] + mv[0])); sp.plan[1] = Math.max(0, Math.min(100, sp.plan[1] + mv[1]));
      planChanged();
    });
    q('.sp-plan-turn').addEventListener('input', e => { if (sp.plan) { sp.plan[2] = +e.target.value; planChanged(); } });
    q('.sp-plan-here').addEventListener('click', () => {
      if (!sp.plan) return;
      sp.plan[2] = ((Math.round(viewYaw) + 540) % 360) - 180;   // the cone then points straight up for this view
      q('.sp-plan-turn').value = sp.plan[2]; planChanged();
    });
    li.querySelectorAll('.sp-fpos').forEach(b => b.addEventListener('click', () => {
      sp.yaw = +b.dataset.x; sp.pitch = +b.dataset.y;
      updatePlaceText(i); updateSummary(li, sp); spotsChanged(true);
    }));
    q('.sp-play').addEventListener('change', e => { sp.play = e.target.value; if (sp.play === 'tap') sp.hidden = false; syncCard(li, sp, i); spotsChanged(true); });
    q('.sp-hide').addEventListener('change', e => { sp.hidden = e.target.checked; syncCard(li, sp, i); spotsChanged(true); });
    q('.sp-loop').addEventListener('change', e => { sp.loop = e.target.checked; syncCard(li, sp, i); updateSummary(li, sp); spotsChanged(true); });
    q('.sp-pin').addEventListener('change', e => {
      // The preview works out the starting corners from the spot's current shape and reports them back
      if (!e.target.checked) sp.pin = null;
      post({ type: 'pinSpot', index: i, on: e.target.checked });
      if (!e.target.checked) { updatePlaceText(i); spotsChanged(false); }
    });
    // Size and position without dragging (keyboard and switch users, or anyone who prefers buttons)
    const resize = f => { sp.w = Math.max(sp.float ? 5 : 4, Math.min(sp.float ? 100 : 140, (sp.w || HotSpots.DEFAULT_W) * f)); updatePlaceText(i); spotsChanged(true); };
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
    q('.sp-stk').addEventListener('change', e => {
      sp.stacked = e.target.checked; sp.autoStk = false;
      if (sp.stacked) { sp.alpha = autoSeeThrough(sp.src) === 'alpha' || (/\.webm(\?|#|$)/i.test(sp.src) && !autoSeeThrough(sp.src)); q('.sp-stk-webm').checked = sp.alpha; q('.sp-stk-mp4').checked = !sp.alpha; }
      syncCard(li, sp, i); spotsChanged(true);
    });
    ['.sp-stk-mp4', '.sp-stk-webm'].forEach(c => q(c).addEventListener('change', () => {
      sp.alpha = q('.sp-stk-webm').checked; sp.autoStk = false; syncCard(li, sp, i); spotsChanged(true);
    }));
    q('.sp-spin').addEventListener('change', e => { sp.spin = e.target.checked; updateSummary(li, sp); spotsChanged(true); });
    q('.sp-flat').addEventListener('change', e => { sp.flat = e.target.checked; updateSummary(li, sp); spotsChanged(true); });
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
      else if (isDrivePlayer(sp)) bits.push('Google Drive player');
      else if (kind === 'video' || kind === 'audio') bits.push(sp.play === 'look' ? 'plays when looked at' : sp.play === 'start' ? 'plays at once' : 'tap to play');
      else if ((kind === 'image' || kind === 'model') && sp.play === 'look') bits.push('shows when looked at');
      if (kind === 'model' && sp.spin) bits.push('spins');
      if (kind === 'model' && sp.flat) bits.push('flat colours');
      if (kind === 'video' && sp.stacked) bits.push(sp.alpha ? 'see-through WebM' : 'see-through');
      if (sp.hidden) bits.push('hidden');
      if (sp.loop && (kind === 'video' || kind === 'audio')) bits.push('loops');
      else if (sp.vanish && kind === 'video' && !isDrivePlayer(sp)) bits.push('disappears at the end');
      if (sp.plan && kind === 'image') bits.push('floor plan');
      if (sp.delay > 0 && !sp.dwell) bits.push('appears after ' + sp.delay + ' s');
      if (sp.pin && !sp.float) bits.push('pinned');
      if (layers.length && isMaskable(sp) && !sp.float) bits.push(sp.noMask ? 'in front of masks' : 'hidden by masks');
    }
    bits.push(sp.float ? 'floats ' + (floatPlace(sp.yaw, sp.pitch) === 'middle' ? 'in the middle' : floatPlace(sp.yaw, sp.pitch)) + ' of the screen' : describePlace(sp.yaw, sp.pitch));
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
  // See-through videos: "alpha" = a WebM with its own transparency, "stencil" = the Video Maker's MP4 (or its WebM fallback)
  let stkGroups = 0;
  function autoSeeThrough(src) {
    if (/(transparent|alpha)[^\/]*\.webm(\?|#|$)/i.test(src)) return 'alpha';
    if (/(see-?through|stencil|stacked|alpha)[^\/]*\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(src)) return 'stencil';
    return '';
  }
  function setSeeThrough(li, sp, on, alpha, auto) {
    sp.stacked = on; sp.alpha = on && alpha; sp.autoStk = on && auto;
    li.querySelector('.sp-stk').checked = on;
    li.querySelector('.sp-stk-webm').checked = sp.alpha; li.querySelector('.sp-stk-mp4').checked = !sp.alpha;
  }

  function showPlan(li, sp) {
    const q = c => li.querySelector(c);
    if (!sp.plan) return;
    const img = q('.sp-plan-img'), url = Media.resolveMediaUrl(sp.src, 'image').url;
    if (img.dataset.src !== url) { img.src = url; img.dataset.src = url; img.referrerPolicy = 'no-referrer'; }
    q('.sp-plan-dot').style.left = sp.plan[0] + '%'; q('.sp-plan-dot').style.top = sp.plan[1] + '%';
    const pick = q('.sp-plan-pick');
    pick.setAttribute('aria-valuenow', sp.plan[0]);
    pick.setAttribute('aria-valuetext', sp.plan[0] + '% across, ' + sp.plan[1] + '% down');
    q('.sp-plan-turn').value = sp.plan[2];
    q('.sp-plan-turn-out').textContent = sp.plan[2] + '°';
  }

  function syncCard(li, sp, i) {
    const q = c => li.querySelector(c);
    const yt = Media.youTube(sp.src);
    const guess = HotSpots.guessKind(sp.src);
    const kind = HotSpots.kindOf(sp);

    // Type: offer only what this link can be
    const type = q('.sp-type');
    const allowed = guess === 'text' ? ['text'] : guess === 'model' ? ['model']
      : yt ? ['video', 'audio', 'link'] : guess === 'image' ? ['image', 'link'] : guess === 'audio' ? ['audio', 'link']
      : guess === 'video' ? ['video', 'audio', 'link'] : guess === 'link' ? ['link', 'doc', 'image', 'video', 'audio']
      : !sp.src.trim() ? ['video', 'audio', 'image', 'link', 'doc', 'text', 'model'] : ['video', 'audio', 'image', 'link', 'doc', 'model'];
    [...type.options].forEach(o => { o.disabled = !allowed.includes(o.value); });
    type.value = (sp.src.trim() || sp.type) ? kind : '';

    // Plays / Shows: not for text and links; and a dot-revealed spot plays when it appears
    const isModel = kind === 'model';
    const isImage = kind === 'image' || isModel;      // models show like pictures: all the time, or while looked at
    const still = kind === 'text' || kind === 'link' || kind === 'doc';
    const drive = isDrivePlayer(sp);
    if (drive) { sp.play = 'tap'; sp.hidden = false; sp.loop = false; }
    q('.sp-play').closest('.sp-row').hidden = still || drive || !!sp.dwell;
    q('.sp-src').placeholder = {
      text: 'Type the words to show', link: 'https://…  the web page to open', image: 'Link to a picture (PNG, JPEG, GIF…)',
      model: 'Link to a .glb, .gltf, .obj or .stl file', audio: 'Link to a sound (MP3…) or a YouTube video',
      video: 'Link to a YouTube video or a video file (MP4…)',
      doc: 'Link to a PDF, Word, PowerPoint or Excel file, or a Google Doc — or paste OneDrive’s Embed code'
    }[sp.src.trim() || sp.type ? kind : ''] || 'Paste a link (YouTube, video, sound, picture, 3D model or web page) — or type some text';
    const decided = !!(sp.src.trim() || sp.type);
    q('.sp-src-label').textContent = !decided ? 'Link or text' : kind === 'text' ? 'Text' : 'Link';
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
    q('.sp-hide-row').hidden = isImage || still || drive || !!sp.dwell;
    q('.sp-loop-row').hidden = isImage || still || drive;
    // only for videos that end: not looping, not sound-only, not Google Drive's own player
    q('.sp-vanish-row').hidden = kind !== 'video' || !sp.src.trim() || drive || !!sp.loop || (!!sp.hidden && !sp.stacked);
    const inRoomKind = isImage || still || (kind === 'video' && !sp.hidden);
    const stkOk = kind === 'video' && !yt && !drive && !!sp.src.trim();
    q('.sp-stk-row').hidden = !stkOk;
    if (!stkOk && sp.stacked) { sp.stacked = false; q('.sp-stk').checked = false; }
    q('.sp-stk-kind').hidden = !stkOk || !sp.stacked;
    q('.sp-pin-row').hidden = !inRoomKind || !sp.src.trim() || isModel || drive || !!sp.stacked;
    q('.sp-mask-row').hidden = !layers.length || !isMaskable(sp) || !!sp.float;
    // Floating: anything with something to see (not a hidden player); pins and masks are about places in the room
    const canFloat = !!sp.src.trim() && !(sp.hidden && !sp.stacked);
    q('.sp-float-row').hidden = !canFloat;
    if (!canFloat && sp.float) { sp.float = false; q('.sp-float').checked = false; }
    if (sp.float) q('.sp-pin-row').hidden = true;
    q('.sp-floatpos').hidden = !sp.float;
    const planOk = kind === 'image' && !!sp.float && !!sp.src.trim();
    q('.sp-plan-row').hidden = !planOk;
    if (!planOk && sp.plan) { sp.planWas = sp.plan; sp.plan = null; q('.sp-plan').checked = false; }
    q('.sp-planset').hidden = !(planOk && sp.plan);
    if (planOk && sp.plan) showPlan(li, sp);
    q('.sp-delay-row').hidden = !(sp.delay > 0) || !!sp.dwell;

    if (sp.stacked) { sp.hidden = false; q('.sp-hide-row').hidden = true; }
    const checks = [...li.querySelectorAll('.sc-checks > .check')];
    q('.sc-checks').hidden = checks.every(c => c.hidden);
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
    const set = (k, html) => {
      fieldError(li.querySelector('.sp-src'), k === 'err' ? html : '');
      if (k === 'err') { el.className = 'status sp-status'; el.innerHTML = ''; return; }
      if (html && isDriveMedia(sp) && !isDrivePlayer(sp)) {
        html += ' It’s downloaded from Google Drive when the tour opens, so it must be shared as <b>Anyone with the link</b>. Keep it small (under about 20 MB) so it’s quick on phones.';
      }
      el.className = 'status sp-status ' + k; el.innerHTML = html;
    };
    if (!sp.src.trim()) return set('', '');
    if (sp.error) return set('err', escapeHtml(sp.error));
    const extra = (sp.float ? ' It floats on the screen: drag it around the phone window in the preview, or pick a place above.' : '') +
      (sp.delay > 0 && !sp.dwell ? ' It appears ' + sp.delay + ' second' + (sp.delay === 1 ? '' : 's') + ' after the viewer starts (the preview always shows it).' : '');
    const dwellNote = (extra ? extra : '') + (sp.dwell ? ' It appears after the viewer rests the crosshair on its dot for a moment (or taps the dot)' +
      ((kind === 'video' || kind === 'audio') && !isDrivePlayer(sp) ? ', and starts playing then.' : '.') : '');
    if (kind === 'text') return set('ok', 'Text card. Drag it in the preview to move it; pull its corners to make the text bigger or smaller. Viewers can tap it to read it full screen.' + dwellNote);
    if (kind === 'doc') {
      const v = Media.docViewer(sp.src), raw = Media.expand(sp.src);
      const how = ' Drag the card in the preview to move it; pull its corners to resize. Use <b>⤢ Open</b> on it to see what viewers will see.';
      if (v.provider === 'onedrive' && !/embed/i.test(raw)) {
        return set('err', 'A normal OneDrive share link can’t be shown inside the tour. In OneDrive, choose <b>Share → Embed</b> (or right-click the file → <b>Embed</b>), copy the code and paste it here instead.');
      }
      if (v.provider === 'google-drive') return set('ok', 'Shown with Google’s own viewer. Make sure the file is shared as <b>Anyone with the link</b>.' + how + dwellNote);
      if (v.provider === 'onedrive') return set('ok', 'Shown with OneDrive’s own viewer.' + how + dwellNote);
      if (v.provider === 'sharepoint') return set('note', 'School and work OneDrive files only show if your school allows sharing with people outside it. Test the link in a private browser window first.' + how + dwellNote);
      if (v.mode === 'pdf') {
        return set(v.provider === 'web' ? 'note' : 'ok', 'Shown by the built-in PDF reader.' +
          (v.provider === 'web' ? ' PDFs on some other websites can’t be opened here; viewers can still use “Open in new tab”.' : '') + how + dwellNote);
      }
      if (v.provider === 'this-site' && /^(localhost|127\.)/.test(location.hostname)) return set('note', 'Shown with Microsoft’s free Office viewer once your site is online (it can’t reach files on this computer).' + how);
      return set('ok', 'Shown with Microsoft’s free Office viewer. The file has to be reachable by anyone on the internet.' + how + dwellNote);
    }
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
    if (kind === 'video' && sp.stacked && sp.alpha) {
      return set('note', 'See-through WebM: the room shows around it in Chrome, Edge, Firefox and on Android phones. <b>iPhones and iPads can’t play it.</b> ' +
        'For a tour every phone can use, open it in the <a href="videomaker.html" target="_blank" rel="noopener">See-through Video Maker</a> and make a see-through MP4 (it keeps the transparency). ' +
        'Drag it in the preview to move it; pull a corner to resize it. Keep the file in ' + seeThroughHomes() + '.' + dwellNote);
    }
    if (kind === 'video' && sp.stacked) {
      return set('ok', 'See-through video: the room shows around it. Drag it in the preview to move it; pull a corner to resize it. ' +
        (sp.play === 'tap' ? 'Viewers tap it to play. ' : '') + 'Keep the file in ' + seeThroughHomes() + '.' + dwellNote);
    }
    if (isDrivePlayer(sp)) {
      return set('note', 'Google Drive only lets its own player play this, so it sits in the room as Google’s player and viewers tap play in it. ' +
        'Playing when looked at, background sound, Loop and the Sound button can’t control it. For those, put the file in your GitHub site or Dropbox.' +
        ' Use <b>▶ Test</b> on it in the preview to try it.' + dwellNote);
    }
    if (sp.dwell && (kind === 'video' || kind === 'audio')) {
      if (yt && kind === 'audio') return set('note', 'YouTube’s rules say its player must stay visible, so a sound-only YouTube spot breaks them. An MP3 link is the safe choice.' + dwellNote);
      return set('ok', 'Click once in the preview, then rest the crosshair on its dot to try it.' + dwellNote);
    }
    if (kind === 'model') {
      return set('ok', '3D model. Drag it in the preview to move it, pull a corner to resize it, and drag the round handle to turn it' +
        (sp.spin ? '' : ' (or use the Turn and Tilt buttons)') + '. Viewers can tap it to look at it up close. ' +
        (Media.driveKey()
          ? 'Use a <b>.glb</b> file (or .stl or .obj) kept in your GitHub site, on Dropbox, or in Google Drive (shared as <b>Anyone with the link</b>; Drive models are downloaded when the tour opens, so keep them under about 20 MB). OneDrive won’t work for 3D models.'
          : 'Use a <b>.glb</b> file kept in your GitHub site or on Dropbox — Google Drive and OneDrive won’t work for 3D models.') + dwellNote);
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
    const inRoom = sp.src && (kind === 'image' || kind === 'model' || kind === 'text' || kind === 'link' || kind === 'doc' || isDrivePlayer(sp) || (kind === 'video' && !sp.hidden));
    if (sp.float) {
      const where = floatPlace(sp.yaw, sp.pitch);
      li.querySelector('.sp-where').textContent = 'On the screen: ' + (where === 'middle' ? 'in the middle' : where) +
        ' · ' + Math.round(sp.w || 30) + '% of the screen' + ' · drag it in the preview to fine-tune';
      li.querySelectorAll('.sp-fpos').forEach(b => b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.x - sp.yaw) < 4 && Math.abs(+b.dataset.y - sp.pitch) < 4)));
    } else {
      li.querySelector('.sp-where').textContent = 'Placed ' + describePlace(sp.yaw, sp.pitch) +
        (inRoom ? (sp.pin ? ' · corners pinned' : ' · ' + Math.round(sp.w || HotSpots.DEFAULT_W) + '° wide') : '');
    }
    li.querySelector('.sp-smaller').hidden = li.querySelector('.sp-bigger').hidden = (!inRoom && !sp.float) || (!!sp.pin && !sp.float);
    li.querySelector('.sp-move').hidden = li.querySelector('.sp-show').hidden = !!sp.float;   // not somewhere in the room
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
    spots.push({ src: '', yaw: viewYaw, pitch: viewPitch, w: 20, play: 'tap', type: '', hidden: false, loop: false, dwell: false, label: '', rot: [0, 0, 0], spin: false, flat: false });
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
  // then and now: the turn and the names change the preview straight away
  function syncCompare() {
    const f = readForm();
    $('yaw2-out').textContent = f.yaw2 + '°';
    post({ type: 'setCompare', yaw2: f.yaw2, n1: f.n1, n2: f.n2 });
  }
  ['in-yaw2', 'in-n1', 'in-n2'].forEach(id => $(id).addEventListener('input', syncCompare));
  $('in-pano2').addEventListener('change', refresh);
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
        play: 'tap', type: '', hidden: false, loop: false, dwell: false, label: 'Inkwell', rot: [0, 15, 0], spin: true },
        { src: new URL('videos/sample-candle.mp4', here).href, yaw: -58, pitch: -4, w: 10,
        play: 'look', type: 'video', hidden: false, loop: true, dwell: false, label: '', stacked: true },
        { src: new URL('panoramas/sample-plan.png', here).href, yaw: 0, pitch: 100, w: 30,
        play: 'tap', type: '', hidden: false, loop: false, dwell: false, label: 'Where am I?', float: true, plan: [50, 50, 0] }];
      renderSpots();
    }
    yaw = 0; updateFacing(); refresh();
  });

  // Arrow buttons around the preview: a click turns 15°, holding keeps turning. Handy when spots fill the view
  // and dragging the picture keeps grabbing them instead.
  const NUDGE = { up: [0, 1], down: [0, -1], left: [1, 0], right: [-1, 0] };
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const [dy, dp] = NUDGE[btn.dataset.dir];
    let holdTimer = 0, repeat = 0, held = false;
    const stop = () => { clearTimeout(holdTimer); clearInterval(repeat); };
    btn.addEventListener('pointerdown', e => {
      if (btn.disabled || e.button > 0) return;
      held = false; stop();
      holdTimer = setTimeout(() => {
        held = true;
        repeat = setInterval(() => post({ type: 'nudge', yaw: dy * 2.5, pitch: dp * 2.5 }), 30);   // about 80° a second
      }, 300);
    });
    ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach(ev => btn.addEventListener(ev, stop));
    btn.addEventListener('click', () => {                 // a tap, or Enter / Space from the keyboard
      if (held) { held = false; return; }
      post({ type: 'nudge', yaw: dy * 15, pitch: dp * 15 });
    });
  });
  function setNavEnabled(on) { document.querySelectorAll('.nav-btn').forEach(b => { b.disabled = !on; }); }

  // Preview shape: an upright phone (what most viewers will see) or a wide screen
  function setShape(phone) {
    $('frame').classList.toggle('phone', phone);
    $('frame-nav').classList.toggle('phone', phone);
    $('shape-phone').setAttribute('aria-pressed', String(phone));
    $('shape-wide').setAttribute('aria-pressed', String(!phone));
    sendWindow();
  }
  // Phone view: a phone-shaped window (9:16) as tall as the preview allows; the viewer shows a phone's view inside it
  function sendWindow() {
    const frame = $('frame'), pw = $('phone-window');
    if (!frame.classList.contains('phone')) return post({ type: 'setWindow', win: null });
    const W = frame.clientWidth, H = frame.clientHeight;
    const h = Math.round(Math.min(H - 28, (W - 28) * 16 / 9)), w = Math.round(h * 9 / 16);
    pw.style.width = w + 'px'; pw.style.height = h + 'px';
    post({ type: 'setWindow', win: { w, h } });
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => sendWindow()).observe($('frame'));
  // A drag that starts anywhere around the preview (not just on the picture) turns the view too
  {
    const nav = $('frame-nav');
    let from = null;
    nav.addEventListener('pointerdown', e => {
      if (e.target !== nav || panoOk !== true) return;                // only the empty space around the picture
      from = { x: e.clientX, y: e.clientY }; nav.setPointerCapture(e.pointerId); e.preventDefault();
    });
    nav.addEventListener('pointermove', e => {
      if (!from) return;
      const h = $('frame').classList.contains('phone') ? $('phone-window').offsetHeight : $('frame').clientHeight;
      const k = 75 / Math.max(1, h);                                      // degrees per pixel, as on the picture itself
      post({ type: 'nudge', yaw: (e.clientX - from.x) * k, pitch: (e.clientY - from.y) * k });
      from = { x: e.clientX, y: e.clientY };
    });
    const end = () => { from = null; };
    nav.addEventListener('pointerup', end); nav.addEventListener('pointercancel', end);
    nav.style.touchAction = 'none';
  }
  $('shape-phone').addEventListener('click', () => setShape(true));
  $('shape-wide').addEventListener('click', () => setShape(false));

  loadFromAddress();
  if (layers.length) $('layers-box').open = true;
  renderLayers();
  updateFacing();
  renderSpots();
  refresh();
})();
