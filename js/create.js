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
      title: $('in-title').value.trim()
    };
  }

  function saveToAddress(f) {
    const q = new URLSearchParams();
    if (f.pano) q.set('p', f.pano);
    if (f.title) q.set('t', f.title);
    if (yaw) q.set('y', yaw);
    spots.filter(sp => sp.src.trim()).forEach(sp => q.append('s', HotSpots.encode(sp, false)));
    history.replaceState(null, '', q.toString() ? '?' + q : location.pathname);
  }

  function loadFromAddress() {
    const q = new URLSearchParams(location.search);
    $('in-pano').value = q.get('p') || '';
    $('in-title').value = q.get('t') || '';
    yaw = Number(q.get('y')) || 0;
    spots = q.getAll('s').map(HotSpots.decode).filter(Boolean);
    // Older links had a separate background sound: turn it into a hidden sound spot
    if (q.get('a')) spots.unshift({ src: q.get('a'), yaw: 0, pitch: 0, w: HotSpots.DEFAULT_W, play: 'start', type: 'audio', hidden: true, loop: q.get('l') === '1', label: 'Background sound' });
  }

  /** The link the QR code opens */
  function viewerUrl(f, preview) {
    // Light encoding (keeps / : ~ readable) makes the link shorter, so the QR code is easier to scan
    const enc = v => encodeURIComponent(v).replace(/%2F/gi, '/').replace(/%3A/gi, ':').replace(/%7C/gi, '|').replace(/%20/g, '+');
    const q = [['p', Media.shorten(f.pano)]];
    if (f.title) q.push(['t', f.title]);
    if (yaw) q.push(['y', yaw]);
    if (!preview) spots.filter(sp => sp.src.trim()).forEach(sp => q.push(['s', HotSpots.encode(sp, true)]));
    if (preview) q.push(['preview', '1']);
    return new URL('view.html', here).href + '?' + q.map(([k, v]) => k + '=' + enc(String(v))).join('&');
  }

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
        status('pano-status', m.warning ? 'note' : 'ok', m.warning || ('Photo loaded (' + m.width + ' × ' + m.height + ').' +
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
      if (sp) { sp.error = m.message; renderSpotStatus(m.index); }
    } else if (m.type === 'spotEdit') {
      // Moved or resized by dragging in the preview: the preview already shows it, so just record it
      const sp = spots[m.index];
      if (!sp) return;
      sp.yaw = m.yaw; sp.pitch = m.pitch; sp.w = m.w;
      updatePlaceText(m.index);
      spotsChanged(false);
    } else if (m.type === 'spotSelect') {
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
  function sendSpots() { post({ type: 'setSpots', spots: spots.map(sp => (sp.src.trim() ? HotSpots.encode(sp, false) : null)) }); }

  function spotsChanged(reloadPreview) {
    saveToAddress(readForm());
    if (reloadPreview) sendSpots();
    renderQr(readForm());
  }

  function renderSpots() {
    const list = $('spot-list');
    list.innerHTML = '';
    spots.forEach((sp, i) => list.appendChild(spotCard(sp, i)));
    $('add-spot').disabled = !panoOk || spots.length >= MAX_SPOTS;
    $('add-spot').textContent = spots.length >= MAX_SPOTS ? 'Maximum of ' + MAX_SPOTS + ' spots' : '+ Add a spot at the crosshair';
    $('spots-empty').hidden = spots.length > 0;
  }

  function spotCard(sp, i) {
    const li = document.createElement('li');
    li.className = 'spot-card';
    li.innerHTML =
      '<div class="spot-card-head"><span class="pin">' + (i + 1) + '</span>' +
        '<input type="url" class="sp-src" placeholder="YouTube, video, sound or picture link" aria-label="Spot ' + (i + 1) + ' link">' +
        '<button type="button" class="iconbtn sp-remove" aria-label="Remove spot ' + (i + 1) + '" title="Remove">✕</button></div>' +
      '<input type="text" class="sp-label" maxlength="40" placeholder="Label, e.g. The teacher’s desk (optional)" aria-label="Spot ' + (i + 1) + ' label">' +
      '<div class="sp-place"><span class="sp-where"></span>' +
        '<span class="sp-place-btns"><button type="button" class="textbtn sp-move">Move to crosshair</button>' +
        '<button type="button" class="textbtn sp-show">Show me</button></span></div>' +
      '<label class="sp-row">Type <select class="sp-type">' +
        '<option value="video">Video</option>' +
        '<option value="audio">Sound only</option>' +
        '<option value="image">Picture</option></select></label>' +
      '<label class="sp-row"><span class="sp-play-word">Plays</span> <select class="sp-play"></select></label>' +
      '<label class="check sp-hide-row"><input type="checkbox" class="sp-hide"> Hidden <span class="help-inline sp-hide-note"></span></label>' +
      '<label class="check sp-loop-row"><input type="checkbox" class="sp-loop"> Loop <span class="help-inline">— start again when it ends</span></label>' +
      '<p class="status sp-status" aria-live="polite"></p>';

    const q = c => li.querySelector(c);
    q('.sp-src').value = sp.src;
    q('.sp-label').value = sp.label || '';
    q('.sp-hide').checked = !!sp.hidden;
    q('.sp-loop').checked = !!sp.loop;
    li.dataset.index = i;
    li.addEventListener('focusin', () => selectCard(i, false));
    li.addEventListener('pointerdown', () => selectCard(i, false));

    let typing = 0;
    q('.sp-src').addEventListener('input', e => {
      sp.src = e.target.value; sp.error = '';
      syncCard(li, sp, i);
      clearTimeout(typing); typing = setTimeout(() => spotsChanged(true), 600);
    });
    q('.sp-label').addEventListener('input', e => {
      sp.label = e.target.value;
      clearTimeout(typing); typing = setTimeout(() => spotsChanged(true), 600);
    });
    q('.sp-type').addEventListener('change', e => { sp.type = e.target.value; sp.error = ''; syncCard(li, sp, i); spotsChanged(true); });
    q('.sp-play').addEventListener('change', e => { sp.play = e.target.value; if (sp.play === 'tap') sp.hidden = false; syncCard(li, sp, i); spotsChanged(true); });
    q('.sp-hide').addEventListener('change', e => { sp.hidden = e.target.checked; syncCard(li, sp, i); spotsChanged(true); });
    q('.sp-loop').addEventListener('change', e => { sp.loop = e.target.checked; spotsChanged(true); });
    q('.sp-move').addEventListener('click', () => {
      sp.yaw = viewYaw; sp.pitch = viewPitch;
      updatePlaceText(i);
      spotsChanged(true);
    });
    q('.sp-show').addEventListener('click', () => post({ type: 'lookAt', yaw: sp.yaw, pitch: sp.pitch }));
    q('.sp-remove').addEventListener('click', () => { spots.splice(i, 1); renderSpots(); spotsChanged(true); });

    syncCard(li, sp, i);
    return li;
  }

  const PLAY_OPTIONS = {
    media: [['tap', 'when the viewer taps it'], ['look', 'automatically when the viewer looks at it'], ['start', 'automatically as soon as it opens']],
    image: [['tap', 'all the time'], ['look', 'only while the viewer looks at it']]
  };

  // Keep the choices and notes in step with the link and with each other
  function syncCard(li, sp, i) {
    const q = c => li.querySelector(c);
    const yt = Media.youTube(sp.src);
    const guess = HotSpots.guessKind(sp.src);
    const kind = HotSpots.kindOf(sp);

    // Type: offer only what this link can be
    const type = q('.sp-type');
    const allowed = yt ? ['video', 'audio'] : guess === 'image' ? ['image'] : guess === 'audio' ? ['audio']
      : guess === 'video' ? ['video', 'audio'] : ['video', 'audio', 'image'];
    [...type.options].forEach(o => { o.disabled = !allowed.includes(o.value); });
    type.value = kind;

    // Plays / Shows
    const isImage = kind === 'image';
    const opts = isImage ? PLAY_OPTIONS.image : PLAY_OPTIONS.media;
    if (isImage && sp.play === 'start') sp.play = 'tap';
    const sel = q('.sp-play');
    if (sel.dataset.set !== (isImage ? 'image' : 'media')) {
      sel.innerHTML = opts.map(([v, t]) => '<option value="' + v + '">' + t + '</option>').join('');
      sel.dataset.set = isImage ? 'image' : 'media';
    }
    sel.value = sp.play;
    q('.sp-play-word').textContent = isImage ? 'Shows' : 'Plays';

    // Hidden and Loop don't apply to pictures
    q('.sp-hide-row').hidden = isImage;
    q('.sp-loop-row').hidden = isImage;
    const hide = q('.sp-hide');
    hide.disabled = sp.play === 'tap';
    if (sp.play === 'tap' || isImage) { hide.checked = false; sp.hidden = false; }
    q('.sp-hide-note').textContent = sp.play === 'tap'
      ? '— needs one of the automatic options, or nobody could start it'
      : '— nothing shows; it just plays';
    updatePlaceText(i, li);
    renderSpotStatus(i, li);
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
    if (!/^(https?:\/\/|www\.|yt:|gd:|1drv\.ms)/i.test(sp.src.trim()) && !yt) return set('err', 'That doesn’t look like a web link. It should start with https://');
    if (/\.(heic|heif|tiff?|psd)(\?|#|$)/i.test(sp.src)) return set('err', 'Most phones’ browsers can’t show this kind of picture. Save it as a JPEG or PNG first.');
    if (!HotSpots.guessKind(sp.src) && !sp.type) {
      return set('note', 'This link doesn’t say what kind of file it is (Google Drive and OneDrive links don’t). Choose its <b>Type</b> above.');
    }
    if (yt && (kind === 'audio' || sp.hidden)) {
      return set('note', 'YouTube’s rules say its player must stay visible, so a sound-only or hidden YouTube spot breaks them. ' +
        'An MP3 link is the safe choice here. On iPhones, sound that starts by itself may begin muted, with a “tap for sound” button.');
    }
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
    const inRoom = sp.src && (kind === 'image' || (kind === 'video' && !sp.hidden));
    li.querySelector('.sp-where').textContent = 'Placed ' + describePlace(sp.yaw, sp.pitch) +
      (inRoom ? ' · ' + Math.round(sp.w || HotSpots.DEFAULT_W) + '° wide' : '');
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
    spots.push({ src: '', yaw: viewYaw, pitch: viewPitch, w: HotSpots.DEFAULT_W, play: 'tap', type: '', hidden: false, loop: false, label: '' });
    renderSpots();
    spotsChanged(false);
    const cards = $('spot-list').querySelectorAll('.sp-src');
    cards[cards.length - 1].focus();
  });

  // ------------------------------------------------------------- QR code
  function renderQr(f) {
    const ready = f && f.pano && panoOk !== false;
    ['copy', 'dl', 'print'].forEach(id => { $(id).disabled = !ready; });
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
        play: 'tap', type: '', hidden: false, loop: false, label: '' }];
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
