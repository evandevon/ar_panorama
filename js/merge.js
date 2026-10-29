/*
 * FILE GUIDE: js/merge.js  ·  "Export merged photosphere" (merge.html)
 * Opened from the tour maker with the tour's own settings in the address (the same as make.html's address).
 * Paints the spots that sit still (pictures, text cards, 3D models: HotSpots.mergeInfo decides) into the 360 photo,
 * so the QR code no longer has to carry them. Then builds the tour maker link with the new photo and without them.
 * How each thing is painted, onto a copy of the photo at its own size (up to 8192 wide):
 *   · 3D models: drawn by the tour's own engine (spots.js, in a small off-screen A-Frame scene), all the way round,
 *     with a cube camera at the viewer's spot; the cube is unwrapped into the photo's shape on the GPU, a strip at a time.
 *   · pictures and text cards: laid out with the tour's own styles (css/style.css) in an off-screen frame, turned into
 *     a picture (SVG foreignObject, so it looks exactly like the tour), then projected onto the sphere pixel by pixel
 *     the way the tour shows them (a flat card facing the viewer, as wide as the spot's width on a phone, or warped
 *     onto its four pinned corners).
 *   · masks: spots that masks hide are hidden here too (a mask picture in the photo's own shape).
 * Order (as in the tour): photo → models behind masks → other models → page spots behind masks → other page spots.
 * Gotchas: photo and pictures must be readable by this page (CORS): files on this site, Google Drive (lh3, or the
 *   Drive key), Dropbox. Text cards need Chrome or Edge (Safari and Firefox won't let HTML be turned into a picture).
 * Sections (search for "// ---- <name>"): setup · the list · links and QR sizes · the photo · masks · page spots ·
 *   models · making it · using it
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const THREE = AFRAME.THREE;
  const K = 75 / (2 * Math.tan(75 / 2 * Math.PI / 180));   // degrees of width per unit of flat-card width (a phone's 75° view)
  const REF_PPD = 720 / 75;                                // a phone's pixels per degree, for laying out text at its real size
  const PIN_W = 400;                                       // pinned spots are laid out this wide (as in spots.js)
  const MAX_W = 8192;

  // ---------------------------------------------------------------- setup
  const q = new URLSearchParams(location.search);
  const tour = {
    pano: q.get('p') || '', title: q.get('t') || '', bright: Number(q.get('mb')) || 1,
    pano2: q.get('p2') || ''
  };
  const raw = q.getAll('s');
  const items = raw.map((str, i) => {
    const d = HotSpots.decode(str);
    if (!d) return null;
    const info = HotSpots.mergeInfo(d);
    return { i, str, d, info, on: info.ok && info.kind !== 'text' };
  }).filter(Boolean);
  const masks = q.getAll('f').map(FrontLayer.decode).filter(Boolean);

  const status = (id, kind, html) => { const e = $(id); e.className = 'status ' + (kind || ''); e.innerHTML = html || ''; };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NAMES = { image: 'Picture', text: 'Text card', model: '3D model', video: 'Video', audio: 'Sound', link: 'Link', doc: 'Document' };
  function nameOf(it) {
    const d = it.d;
    if (d.label) return d.label;
    if (it.info.kind === 'text') return '“' + (d.src.length > 40 ? d.src.slice(0, 38) + '…' : d.src) + '”';
    const f = Media.expand(d.src).split(/[?#]/)[0].split('/').pop();
    return f && f.length < 40 && /\./.test(f) ? f : NAMES[it.info.kind] || 'Spot';
  }

  // ---------------------------------------------------------------- the list
  function renderList() {
    const can = items.filter(it => it.info.ok), stay = items.filter(it => !it.info.ok);
    $('m-list').innerHTML = '';
    can.forEach(it => {
      const li = document.createElement('li');
      const id = 'm-it-' + it.i;
      li.innerHTML = '<label class="check" for="' + id + '"><input type="checkbox" id="' + id + '"> <span><b>' + esc(nameOf(it)) + '</b> <span class="help-inline">' +
        NAMES[it.info.kind] + (it.d.pin ? ', pinned' : '') + ' · ' + (Math.round(it.d.yaw) === 0 ? 'straight ahead' : Math.abs(Math.round(it.d.yaw)) + '° ' + (it.d.yaw > 0 ? 'left' : 'right')) + '</span></span></label>';
      const box = li.querySelector('input');
      box.checked = it.on;
      box.addEventListener('change', () => { it.on = box.checked; result = null; showQr(); updateMake(); });
      $('m-list').appendChild(li);
    });
    $('m-text-note').hidden = !can.some(it => it.info.kind === 'text');
    $('m-compare-note').hidden = !tour.pano2;
    $('m-stay-box').hidden = !stay.length;
    $('m-stay-n').textContent = stay.length;
    $('m-stay').innerHTML = stay.map(it => '<li><b>' + esc(nameOf(it)) + '</b>: ' + esc(it.info.why) + '</li>').join('');
    if (!tour.pano) status('m-status', 'err', 'This page needs a tour: open it from the tour maker’s <b>Export merged photosphere</b> button.');
    else if (!can.length) status('m-status', 'note', 'Nothing in this tour can be merged: only pictures, text cards and 3D models that are always there (not revealed, delayed, floating or spinning) can be.');
    else status('m-status', '', can.length + ' of the ' + items.length + ' spots can be merged.');
  }
  function updateMake() { $('m-make').disabled = !tour.pano || !items.some(it => it.on); }

  // ---------------------------------------------------------------- links and QR sizes
  // The tour's own link (as the maker makes it), with some spots taken out
  function tourLink(keep, pano, keepMasks) {
    const enc = v => encodeURIComponent(v).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
      .replace(/%2F/gi, '/').replace(/%3A/gi, ':').replace(/%2C/gi, ',').replace(/%20/g, '+');
    const out = [['p', Media.shorten(pano)]];
    ['t', 'y', 'al'].forEach(k => { if (q.get(k)) out.push([k, q.get(k)]); });
    if (q.get('mb') && keep.some(it => it.info.kind === 'model')) out.push(['mb', q.get('mb')]);
    if (q.get('p2')) out.push(['p2', Media.shorten(q.get('p2'))]);
    ['y2', 'n1', 'n2'].forEach(k => { if (q.get(k) && q.get('p2')) out.push([k, q.get(k)]); });
    keep.forEach(it => out.push(['s', HotSpots.encode(it.d, true)]));
    if (keepMasks) q.getAll('f').forEach(f => out.push(['f', f]));
    out.push(['v', '2']);
    return new URL('./', location.href).href + '?' + out.map(([k, v]) => k + '=' + enc(String(v))).join('&');
  }
  // Masks are only worth keeping while something left in the tour can be hidden by them
  function masksNeeded(keep) {
    return masks.length > 0 && keep.some(it => {
      const k = it.info.kind, d = it.d;
      return !d.noMask && !d.float && (k === 'image' || k === 'text' || k === 'model' || k === 'doc' || (k === 'video' && (!d.hidden || d.stacked)));
    });
  }
  function qrSize(link) {
    try { const c = qrcode(0, 'M'); c.addData(link); c.make(); return c.getModuleCount(); } catch (e) { return 0; }
  }
  const verdict = n => !n ? 'too long for a QR code' : n <= 65 ? 'easy to scan' : n <= 97 ? 'fine printed 6 cm wide' : n <= 117 ? 'crowded: print it 8 cm wide' : 'very crowded: hard for some phones';
  function showQr() {
    if (!tour.pano) { $('m-qr').innerHTML = ''; return; }
    const keep = items.filter(it => !it.on);
    const before = tourLink(items, tour.pano, masks.length > 0);
    const after = tourLink(keep, tour.pano.length > 60 ? tour.pano : 'gd:' + 'x'.repeat(33), masksNeeded(keep));
    const nb = qrSize(before), na = qrSize(after);
    $('m-qr').innerHTML = '<p><b>QR code now:</b> ' + before.length.toLocaleString() + ' characters, ' + (nb || '—') + ' squares across (' + verdict(nb) + ')</p>' +
      '<p><b>After merging:</b> about ' + after.length.toLocaleString() + ' characters, ' + (na || '—') + ' squares across (' + verdict(na) + ')</p>';
  }

  // ---------------------------------------------------------------- the photo
  async function fetchBlob(token, kind) {
    const { url } = Media.resolveMediaUrl(token, kind);
    try {
      const r = await fetch(url, { mode: 'cors', referrerPolicy: 'no-referrer' });
      if (r.ok) { const b = await r.blob(); if (!/^text\/html/.test(b.type)) return b; }
    } catch (e) {}
    if (Media.driveFileId(token) && Media.driveKey()) return (await Media.downloadDrive(token)).blob;   // Drive, with the site's key
    throw new Error('couldn’t be read by this page');
  }
  async function loadPhoto() {
    const bmp = await createImageBitmap(await fetchBlob(tour.pano, 'image'));
    const W = Math.min(MAX_W, bmp.width - bmp.width % 2), H = W / 2;
    const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
    c.getContext('2d').drawImage(bmp, 0, 0, W, H);
    if (Math.abs(bmp.width / bmp.height - 2) > 0.05) status('m-make-status', 'note', 'The photo isn’t exactly twice as wide as it is tall, so it’s been stretched to that shape (as the tour shows it).');
    bmp.close && bmp.close();
    return c;
  }

  // ---------------------------------------------------------------- masks
  // White where a mask hides spots, in the photo's own shape (yaw 0 = the middle; left is +; the top is straight up)
  const dirFrom = (yaw, pitch) => { const y = yaw * Math.PI / 180, p = pitch * Math.PI / 180; return [-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)]; };
  const anglesOf = v => ({ yaw: Math.atan2(-v[0], -v[2]) * 180 / Math.PI, pitch: Math.asin(Math.max(-1, Math.min(1, v[1]))) * 180 / Math.PI });
  function densify(pts) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = dirFrom(pts[i][0], pts[i][1]), b = dirFrom(pts[(i + 1) % pts.length][0], pts[(i + 1) % pts.length][1]);
      const ang = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))), n = Math.max(1, Math.ceil(ang / (Math.PI / 180)));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        if (ang < 1e-6) { out.push(a); continue; }
        const s0 = Math.sin((1 - t) * ang) / Math.sin(ang), s1 = Math.sin(t * ang) / Math.sin(ang);
        out.push([a[0] * s0 + b[0] * s1, a[1] * s0 + b[1] * s1, a[2] * s0 + b[2] * s1]);
      }
    }
    return out;
  }
  function maskCanvas(W, H) {
    if (!masks.length) return null;
    const c = Object.assign(document.createElement('canvas'), { width: W, height: H }), x = c.getContext('2d');
    const windows = masks.filter(m => m.kind === 'window');
    x.fillStyle = windows.length ? '#fff' : '#000'; x.fillRect(0, 0, W, H);
    const draw = (m, colour) => {
      const d = densify(m.pts).map(anglesOf);
      let prev = null, shift = 0;
      const pts = d.map(({ yaw, pitch }) => {
        const u = ((0.5 - yaw / 360) % 1 + 1) % 1;
        if (prev !== null) { if (u + shift - prev > 0.5) shift -= 1; else if (u + shift - prev < -0.5) shift += 1; }
        prev = u + shift;
        return [prev * W, (0.5 - pitch / 180) * H];
      });
      if (Math.abs(pts[pts.length - 1][0] - pts[0][0]) > W / 2) {           // round a pole
        const poleY = d.reduce((t, p) => t + p.pitch, 0) > 0 ? 0 : H;
        pts.push([pts[pts.length - 1][0], poleY], [pts[0][0], poleY]);
      }
      x.fillStyle = colour;
      for (const off of [-W, 0, W]) { x.beginPath(); pts.forEach((p, i) => x[i ? 'lineTo' : 'moveTo'](p[0] + off, p[1])); x.closePath(); x.fill(); }
    };
    windows.forEach(m => draw(m, '#000'));
    masks.filter(m => m.kind === 'front').forEach(m => draw(m, '#fff'));
    return c;
  }

  // ---------------------------------------------------------------- page spots (pictures and text cards)
  // Laid out with the tour's own styles in an off-screen frame, so they look exactly as they do in the tour
  let cssText = null, measure = null;
  async function layoutFrame() {
    if (measure) return measure;
    cssText = await (await fetch('css/style.css')).text();
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
    f.style.cssText = 'position:absolute;left:-10000px;top:0;width:2400px;height:1600px;border:0;visibility:hidden';
    document.querySelector('.merge-work').appendChild(f);
    f.contentDocument.open();
    f.contentDocument.write('<!doctype html><html><head><style>' + cssText + '\n' + OVERRIDES + '</style></head><body></body></html>');
    f.contentDocument.close();
    measure = f.contentDocument;
    return measure;
  }
  // The spot sits still and fully shown, at a point, as it would at that moment in the tour
  const OVERRIDES = 'html,body{background:transparent!important;overflow:visible!important}' +
    '.spot{position:absolute;width:0;height:0;visibility:visible!important;transform:none!important;will-change:auto}' +
    '.spot *{transition:none!important;animation:none!important}.spot-frame{opacity:1!important}';
  async function imageDataUrl(token, maxSide) {
    const bmp = await createImageBitmap(await fetchBlob(token, 'image'));
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(bmp.width * k)), height: Math.max(1, Math.round(bmp.height * k)) });
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const out = { url: c.toDataURL(/\.(jpe?g)(\?|$)/i.test(Media.expand(token)) ? 'image/jpeg' : 'image/png', 0.92), aspect: bmp.width / bmp.height };
    bmp.close && bmp.close();
    return out;
  }
  // → { canvas, fw, fh, px, py, k }: the picture of the spot; its frame is fw × fh (layout pixels), with its top-left at
  //   (px, py) in the picture's layout pixels, and k picture pixels per layout pixel
  async function rasterSpot(it, outW) {
    const d = it.d, kind = it.info.kind, doc = await layoutFrame();
    const pinned = !!d.pin;
    const fw = pinned ? PIN_W : Math.max(kind === 'image' ? 24 : 60, d.w * REF_PPD);
    // how many picture pixels it needs: about 1.5 for every pixel of the photo it covers
    const degWide = pinned ? pinWidthDeg(d) : d.w * 1.25;
    const k = Math.max(1, Math.min(6, 1.5 * degWide * outW / 360 / fw));
    let inner = '', img = null;
    if (kind === 'image') {
      img = await imageDataUrl(d.src, Math.min(4096, Math.ceil(fw * k)));
      const fh = fw / img.aspect;
      inner = '<div class="spot spot-image loaded"><div class="spot-frame" style="width:' + fw + 'px;height:' + fh + 'px;aspect-ratio:auto">' +
        (d.label ? '<div class="spot-cap">' + esc(d.label) + '</div>' : '') +
        '<img class="spot-img" alt="" src="' + img.url + '"' + (pinned ? ' style="object-fit:fill"' : '') + '></div></div>';
    } else {
      const fs = pinned ? PIN_W * 0.075 : Math.max(9, Math.min(40, fw * 0.075));
      inner = '<div class="spot spot-text"><div class="spot-frame" style="width:' + fw + 'px;font-size:' + fs.toFixed(1) + 'px">' +
        (d.label ? '<div class="spot-cap">' + esc(d.label) + '</div>' : '') + '<div class="spot-words">' + esc(d.src) + '</div></div></div>';
    }
    // lay it out at a known point, then measure everything it draws (the label above it, shadows around it)
    doc.body.innerHTML = '<div id="pt" style="position:absolute;left:1200px;top:800px">' + inner + '</div>';
    if (img) await doc.querySelector('img').decode().catch(() => {});
    const frame = doc.querySelector('.spot-frame'), fr = frame.getBoundingClientRect();
    let x0 = fr.left, y0 = fr.top, x1 = fr.right, y1 = fr.bottom;
    doc.querySelectorAll('.spot-cap').forEach(c => { const r = c.getBoundingClientRect(); x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); });
    const pad = 36;                                                  // room for the shadows
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    const lw = Math.ceil(x1 - x0), lh = Math.ceil(y1 - y0);
    const cw = Math.min(8192, Math.ceil(lw * k)), ch = Math.min(8192, Math.ceil(lh * k)), kk = Math.min(cw / lw, ch / lh);
    // the same markup, turned into a picture
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + cw + '" height="' + ch + '"><foreignObject x="0" y="0" width="' + cw + '" height="' + ch + '">' +
      '<div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:' + lw + 'px;height:' + lh + 'px;transform:scale(' + kk + ');transform-origin:0 0">' +
      '<style><![CDATA[' + cssText + '\n' + OVERRIDES + ']]></style>' +
      '<div style="position:absolute;left:' + (1200 - x0) + 'px;top:' + (800 - y0) + 'px">' + toXhtml(inner) + '</div></div></foreignObject></svg>';
    const pic = new Image();
    pic.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await pic.decode();
    const canvas = Object.assign(document.createElement('canvas'), { width: cw, height: ch });
    const cx = canvas.getContext('2d');
    cx.drawImage(pic, 0, 0);
    try { cx.getImageData(0, 0, 1, 1); } catch (e) { throw new Error('this browser won’t let the page turn it into a picture (use Chrome or Edge)'); }
    return { canvas, fw: fr.width, fh: fr.height, px: fr.left - x0, py: fr.top - y0, k: kk };
  }
  const toXhtml = html => html.replace(/<img([^>]*?)>/g, '<img$1/>');
  function pinWidthDeg(d) {
    const c = [d.yaw, d.pitch], a = dirFrom(c[0] + d.pin[0][0], c[1] + d.pin[0][1]), b = dirFrom(c[0] + d.pin[1][0], c[1] + d.pin[1][1]);
    return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180 / Math.PI;
  }
  // 3×3 matrix that maps the unit square's corners (0,0) (1,0) (1,1) (0,1) to the four points given
  function squareToQuad(p) {
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = p;
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
    const den = dx1 * dy2 - dx2 * dy1;
    const g = (sx * dy2 - dx2 * sy) / den, h = (dx1 * sy - sx * dy1) / den;
    return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
  }
  function inv3(m) {
    const [a, b, c, d, e, f, g, h, i] = m, A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
    return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
  }
  // Project one spot's picture onto the photo, pixel by pixel: each photo pixel's direction → the flat card facing
  // the viewer → the spot's picture. mask: hide it where masks are (if masks hide this spot)
  function paintSpot(out, r, d, mask) {
    const W = out.canvas.width, H = out.canvas.height;
    const f = dirFrom(d.yaw, d.pitch);
    let rt = [f[2], 0, -f[0]]; const rl = Math.hypot(rt[0], rt[2]);
    rt = rl > 1e-6 ? [-rt[0] / rl, 0, -rt[2] / rl] : [1, 0, 0];                // right: level, at right angles to f
    const up = [rt[1] * f[2] - rt[2] * f[1], rt[2] * f[0] - rt[0] * f[2], rt[0] * f[1] - rt[1] * f[0]];
    const flat = v => { const z = v[0] * f[0] + v[1] * f[1] + v[2] * f[2]; return [(v[0] * rt[0] + v[1] * rt[1] + v[2] * rt[2]) / z, (v[0] * up[0] + v[1] * up[1] + v[2] * up[2]) / z, z]; };
    // flat (X, Y) → frame layout pixels (fx, fy), and back
    let toFrame, fromFrame;
    if (d.pin) {
      const corners = d.pin.map(([dy, dp]) => flat(dirFrom(d.yaw + dy, d.pitch + dp)));
      if (corners.some(c => c[2] < 0.1)) return;
      const S = squareToQuad(corners.map(c => [c[0], c[1]])), Si = inv3(S);
      toFrame = (X, Y) => { const w = Si[6] * X + Si[7] * Y + Si[8]; return [(Si[0] * X + Si[1] * Y + Si[2]) / w * r.fw, (Si[3] * X + Si[4] * Y + Si[5]) / w * r.fh]; };
      fromFrame = (fx, fy) => { const u = fx / r.fw, v = fy / r.fh, w = S[6] * u + S[7] * v + S[8]; return [(S[0] * u + S[1] * v + S[2]) / w, (S[3] * u + S[4] * v + S[5]) / w]; };
    } else {
      const hw = (d.w / 2) / K, hh = hw * r.fh / r.fw;
      toFrame = (X, Y) => [(X / (2 * hw) + 0.5) * r.fw, (0.5 - Y / (2 * hh)) * r.fh];
      fromFrame = (fx, fy) => [(fx / r.fw - 0.5) * 2 * hw, (0.5 - fy / r.fh) * 2 * hh];
    }
    // how far it reaches from its centre (the picture's corners, label and shadows included)
    const cw = r.canvas.width, ch = r.canvas.height;
    let reach = 0;
    [[0, 0], [cw, 0], [cw, ch], [0, ch], [cw / 2, 0], [cw / 2, ch], [0, ch / 2], [cw, ch / 2]].forEach(([x, y]) => {
      const [X, Y] = fromFrame(x / r.k - r.px, y / r.k - r.py);
      reach = Math.max(reach, Math.atan(Math.hypot(X, Y)) * 180 / Math.PI);
    });
    reach = Math.min(89, reach + 1);
    const lat0 = Math.max(-90, d.pitch - reach), lat1 = Math.min(90, d.pitch + reach);
    const y0 = Math.max(0, Math.floor((0.5 - lat1 / 180) * H)), y1 = Math.min(H, Math.ceil((0.5 - lat0 / 180) * H));
    const polar = lat1 > 88 || lat0 < -88;
    const dlon = polar ? 180 : Math.min(180, reach / Math.cos(Math.max(Math.abs(lat0), Math.abs(lat1)) * Math.PI / 180) + 1);
    const xc = (0.5 - d.yaw / 360) * W, xa = polar ? 0 : Math.floor(xc - dlon / 360 * W), xb = polar ? W : Math.ceil(xc + dlon / 360 * W);
    const src = r.canvas.getContext('2d').getImageData(0, 0, cw, ch).data;
    const rows = out.getImageData(0, y0, W, y1 - y0), dst = rows.data;
    const mk = mask ? mask.getContext('2d').getImageData(0, y0, W, y1 - y0).data : null;
    for (let y = y0; y < y1; y++) {
      const pitch = (0.5 - (y + 0.5) / H) * Math.PI, sp = Math.sin(pitch), cp = Math.cos(pitch);
      for (let xx = xa; xx < xb; xx++) {
        const x = ((xx % W) + W) % W;
        const yaw = (0.5 - (x + 0.5) / W) * 2 * Math.PI;
        const v = [-Math.sin(yaw) * cp, sp, -Math.cos(yaw) * cp];
        const z = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
        if (z < 0.05) continue;
        const X = (v[0] * rt[0] + v[2] * rt[2]) / z, Y = (v[0] * up[0] + v[1] * up[1] + v[2] * up[2]) / z;
        const [fx, fy] = toFrame(X, Y);
        const sx = (fx + r.px) * r.k - 0.5, sy = (fy + r.py) * r.k - 0.5;
        if (sx < -1 || sy < -1 || sx > cw || sy > ch) continue;
        // smooth sampling (premultiplied, so see-through edges don't darken)
        const ix = Math.floor(sx), iy = Math.floor(sy), ax = sx - ix, ay = sy - iy;
        let pr = 0, pg = 0, pb = 0, pa = 0;
        for (let j = 0; j < 4; j++) {
          const px = ix + (j & 1), py = iy + (j >> 1);
          if (px < 0 || py < 0 || px >= cw || py >= ch) continue;
          const wgt = (j & 1 ? ax : 1 - ax) * (j >> 1 ? ay : 1 - ay), o = (py * cw + px) * 4, a = src[o + 3] / 255 * wgt;
          pr += src[o] * a; pg += src[o + 1] * a; pb += src[o + 2] * a; pa += a;
        }
        if (pa <= 0.002) continue;
        const o = ((y - y0) * W + x) * 4;
        if (mk) { const m = 1 - mk[o] / 255; pr *= m; pg *= m; pb *= m; pa *= m; if (pa <= 0.002) continue; }
        dst[o] = pr + dst[o] * (1 - pa); dst[o + 1] = pg + dst[o + 1] * (1 - pa); dst[o + 2] = pb + dst[o + 2] * (1 - pa);
      }
    }
    out.putImageData(rows, 0, y0);
  }

  // ---------------------------------------------------------------- models
  // The tour's own engine places and lights them; a cube camera at the viewer's spot sees all the way round
  const sceneEl = document.getElementById('m-scene');
  let engine = null;
  function engineReady() {
    return new Promise(res => (sceneEl.hasLoaded ? res() : sceneEl.addEventListener('loaded', res, { once: true })));
  }
  async function loadModels(list) {
    await engineReady();
    const errors = [];
    if (!engine) {
      engine = HotSpots({
        sceneEl: sceneEl, editable: false, brightness: tour.bright,
        layer: $('m-layer'), backLayer: $('m-back'), offscreen: $('m-off'),
        onError: (i, msg) => errors.push(msg),
        onActivity: () => {}, onNeedTap: () => {}, onEdit: () => {}, onSelect: () => {}
      });
      AFRAME.registerComponent('merge-tracker', { tock: () => engine.update() });
      sceneEl.setAttribute('merge-tracker', '');
    }
    engine.set(list.map(it => Object.assign({}, it.d)));
    const t0 = performance.now();
    for (;;) {
      await new Promise(r => setTimeout(r, 150));
      const done = document.querySelectorAll('.merge-work .spot-model.loaded').length;
      if (done >= list.length) break;
      if (errors.length) throw new Error(errors[0]);
      if (performance.now() - t0 > 60000) throw new Error('a 3D model took too long to load');
    }
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));   // placed, sized and lit
  }
  // Draw what's loaded into the photo, a strip at a time (mask: hide them where masks are)
  function paintModels(out, mask) {
    const W = out.canvas.width, H = out.canvas.height, renderer = sceneEl.renderer, scene = sceneEl.object3D;
    const face = Math.min(renderer.capabilities.maxCubemapSize || 4096, Math.pow(2, Math.ceil(Math.log2(W / 2))));   // ~2 cube pixels per photo pixel
    const cubeRT = new THREE.WebGLCubeRenderTarget(face, { generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const cam = new THREE.CubeCamera(0.05, 2000, cubeRT);
    const prevColour = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha(), prevBg = scene.background, prevRT = renderer.getRenderTarget();
    renderer.setClearColor(0x000000, 0); scene.background = null;
    scene.add(cam); cam.update(renderer, scene); scene.remove(cam);
    // unwrap the cube into the photo's shape
    const TH = 256, strip = new THREE.WebGLRenderTarget(W, TH, { generateMipmaps: false, depthBuffer: false });
    const mat = new THREE.ShaderMaterial({
      uniforms: { cube: { value: cubeRT.texture }, rows: { value: new THREE.Vector2() } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: [
        'uniform samplerCube cube; uniform vec2 rows; varying vec2 vUv;',
        'vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }',
        'void main() {',
        '  float v = rows.x + (1.0 - vUv.y) * rows.y;',
        '  float yaw = (0.5 - vUv.x) * 6.2831853, pitch = (0.5 - v) * 3.14159265;',
        '  vec3 d = vec3(-sin(yaw) * cos(pitch), sin(pitch), -cos(yaw) * cos(pitch));',
        '  vec4 c = textureCube(cube, d);',
        '  vec3 rgb = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);',            // the cleared background is see-through black
        '  gl_FragColor = vec4(toSrgb(clamp(rgb, 0.0, 1.0)), c.a);',
        '}'
      ].join('\n'),
      depthTest: false, depthWrite: false, transparent: false, blending: THREE.NoBlending
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat), qs = new THREE.Scene(), oc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    qs.add(quad);
    const buf = new Uint8Array(W * TH * 4), tile = Object.assign(document.createElement('canvas'), { width: W, height: TH }), tx = tile.getContext('2d');
    for (let y0 = 0; y0 < H; y0 += TH) {
      const th = Math.min(TH, H - y0);
      mat.uniforms.rows.value.set(y0 / H, TH / H);
      renderer.setRenderTarget(strip); renderer.render(qs, oc);
      renderer.readRenderTargetPixels(strip, 0, 0, W, TH, buf);
      const img = tx.createImageData(W, th), p = img.data;
      const mk = mask ? mask.getContext('2d').getImageData(0, y0, W, th).data : null;
      for (let r = 0; r < th; r++) {
        const from = (TH - 1 - r) * W * 4;                          // the strip comes bottom row first
        p.set(buf.subarray(from, from + W * 4), r * W * 4);
        if (mk) for (let i = r * W * 4, e = i + W * 4; i < e; i += 4) p[i + 3] = p[i + 3] * (1 - mk[i] / 255);
      }
      tx.clearRect(0, 0, W, TH); tx.putImageData(img, 0, 0);
      out.drawImage(tile, 0, 0, W, th, 0, y0, W, th);
    }
    renderer.setRenderTarget(prevRT); renderer.setClearColor(prevColour, prevAlpha); scene.background = prevBg;
    cubeRT.dispose(); strip.dispose(); mat.dispose(); quad.geometry.dispose();
  }

  // ---------------------------------------------------------------- making it
  let result = null, resultUrl = '';
  function progress(f, text) {
    $('m-progress').hidden = f == null;
    if (f != null) $('m-progress').firstElementChild.style.width = Math.round(f * 100) + '%';
    if (text) status('m-make-status', 'wait', text);
  }
  async function make() {
    const chosen = items.filter(it => it.on);
    $('m-make').disabled = true; $('m-download').hidden = true; $('m-download-help').hidden = true;
    const skipped = [];
    try {
      progress(0.05, 'Loading the 360° photo…');
      const photo = await loadPhoto().catch(e => { throw new Error('The 360° photo ' + e.message + '.'); });
      const W = photo.width, H = photo.height, out = photo.getContext('2d', { willReadFrequently: true });
      const mask = maskCanvas(W, H);
      const behind = it => !!mask && !it.d.noMask;
      const models = chosen.filter(it => it.info.kind === 'model'), page = chosen.filter(it => it.info.kind !== 'model');
      let step = 0;
      // The 3D part is painted the way the tour draws it: layer by layer (lowest first), and within a layer, pictures that
      // have gone behind a 3D model (drawn far back), then models behind the masks, then models in front of them.
      // A picture goes behind when an overlapping 3D model is on a higher layer (HotSpots.angBox / angOverlap: the
      // same test the tour uses). Everything else is a page element in the tour, so it's painted over all of that.
      const zOf = it => it.d.z || 0;
      const aspects = new Map();
      for (const it of page.filter(it => it.info.kind === 'image' && !it.d.float && !it.d.plan && models.some(m => zOf(m) > zOf(it)))) {
        try { aspects.set(it, (await imageDataUrl(it.d.src, 64)).aspect); } catch (e) { aspects.set(it, 1.78); }
      }
      const under = page.filter(it => aspects.has(it) && models.some(m => zOf(m) > zOf(it) &&
        HotSpots.angOverlap(HotSpots.angBox(it.d, aspects.get(it)), HotSpots.angBox(m.d, 1), 0)));
      const levels = [...new Set(models.concat(under).map(zOf))].sort((a, b) => a - b);
      const passes = [];
      levels.forEach(z => {
        under.filter(it => zOf(it) === z).forEach(it => passes.push({ pic: it }));
        [models.filter(it => zOf(it) === z && behind(it)), models.filter(it => zOf(it) === z && !behind(it))]
          .forEach(g => { if (g.length) passes.push({ models: g }); });
      });
      const steps = passes.length + page.length - under.length;
      for (const p of passes) {
        if (p.pic) {
          const it = p.pic;
          progress(0.1 + 0.8 * step / steps, 'Painting in ' + nameOf(it) + '…');
          try { paintSpot(out, await rasterSpot(it, W), it.d, behind(it) ? mask : null); }
          catch (e) { skipped.push(it); it.failed = nameOf(it) + ' ' + (e.message || 'couldn’t be painted in'); }
          it.painted = true;
        } else {
          progress(0.1 + 0.8 * step / steps, 'Drawing ' + (p.models.length === 1 ? 'the 3D model' : p.models.length + ' 3D models') + '…');
          await loadModels(p.models);
          paintModels(out, behind(p.models[0]) ? mask : null);
        }
        step++;
      }
      if (engine) engine.set([]);
      const byZ = (a, b) => (a.d.z || 0) - (b.d.z || 0);              // layer order: lower first, so higher paints over it
      for (const group of [page.filter(behind).sort(byZ), page.filter(it => !behind(it)).sort(byZ)]) {
        for (const it of group) {
          if (it.painted) { it.painted = false; continue; }
          progress(0.1 + 0.8 * step / steps, 'Painting in ' + nameOf(it) + '…');
          await new Promise(r => setTimeout(r, 30));
          try { paintSpot(out, await rasterSpot(it, W), it.d, behind(it) ? mask : null); }
          catch (e) { skipped.push(it); it.failed = nameOf(it) + ' ' + (e.message || 'couldn’t be painted in'); }
          step++;
        }
      }
      progress(0.95, 'Saving…');
      const blob = await addPanoTag(await new Promise(r => photo.toBlob(r, 'image/jpeg', 0.92)), W, H);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      resultUrl = URL.createObjectURL(blob);
      result = { merged: chosen.filter(it => !skipped.includes(it)) };
      const pv = $('m-preview'), px = pv.getContext('2d');
      px.drawImage(photo, 0, 0, pv.width, pv.height);
      $('m-empty').hidden = true;
      const name = (tour.title || 'tour').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'tour';
      $('m-download').href = resultUrl; $('m-download').download = name + '-merged.jpg';
      $('m-download').textContent = '⬇ Download the merged photo (' + (blob.size / 1048576).toFixed(1) + ' MB)';
      $('m-download').hidden = false; $('m-download-help').hidden = false;
      progress(null);
      status('m-make-status', skipped.length ? 'note' : 'ok', 'Done: ' + W + ' × ' + H + ', with ' + result.merged.length + ' spot' + (result.merged.length === 1 ? '' : 's') + ' painted in.' +
        (skipped.length ? ' Left as spots: ' + skipped.map(it => esc(it.failed)).join('; ') + '.' : ''));
      updateLink();
    } catch (e) {
      console.error(e);
      progress(null);
      status('m-make-status', 'err', esc(e.message || 'Something went wrong.'));
    } finally { updateMake(); }
  }
  async function addPanoTag(blob, W, H) {
    const xmp = '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
      '<rdf:Description rdf:about="" xmlns:GPano="http://ns.google.com/photos/1.0/panorama/" GPano:UsePanoramaViewer="True" GPano:ProjectionType="equirectangular"' +
      ' GPano:FullPanoWidthPixels="' + W + '" GPano:FullPanoHeightPixels="' + H + '" GPano:CroppedAreaImageWidthPixels="' + W + '" GPano:CroppedAreaImageHeightPixels="' + H + '"' +
      ' GPano:CroppedAreaLeftPixels="0" GPano:CroppedAreaTopPixels="0" GPano:PoseHeadingDegrees="0"/></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
    const head = new TextEncoder().encode('http://ns.adobe.com/xap/1.0/\0'), body = new TextEncoder().encode(xmp);
    const seg = new Uint8Array(4 + head.length + body.length), len = 2 + head.length + body.length;
    seg.set([0xFF, 0xE1, len >> 8, len & 255]); seg.set(head, 4); seg.set(body, 4 + head.length);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return new Blob([bytes.subarray(0, 2), seg, bytes.subarray(2)], { type: 'image/jpeg' });
  }

  // ---------------------------------------------------------------- using it
  // The tour maker's own address (make.html), with the new photo and without the merged spots
  const original = new URL('make.html' + location.search, location.href).href;
  function makerLink(newPano) {
    const merged = result ? result.merged : [];
    const keep = items.filter(it => !merged.includes(it));
    const m = new URLSearchParams();
    m.set('p', newPano);
    ['t', 'y', 'al'].forEach(k => { if (q.get(k)) m.set(k, q.get(k)); });
    if (q.get('mb') && keep.some(it => it.info.kind === 'model')) m.set('mb', q.get('mb'));
    ['p2', 'y2', 'n1', 'n2'].forEach(k => { if (q.get(k)) m.set(k, q.get(k)); });
    keep.forEach(it => m.append('s', it.str));
    if (masksNeeded(keep)) q.getAll('f').forEach(f => m.append('f', f));
    return new URL('make.html?' + m.toString(), location.href).href;
  }
  function updateLink() {
    const v = $('m-link').value.trim(), btn = $('m-open');
    let ok = false;
    if (!result) status('m-link-status', v ? 'note' : '', v ? 'Make the merged photo first (step 2).' : '');
    else if (!v) status('m-link-status');
    else if (v === tour.pano || Media.shorten(v) === Media.shorten(tour.pano)) status('m-link-status', 'err', 'That’s the original photo’s link. Paste the link to the merged one you uploaded.');
    else if (!/^(https?:\/\/|www\.)/i.test(v) && !/^[\w.\/-]+\.(jpe?g|png|webp)$/i.test(v)) status('m-link-status', 'err', 'That doesn’t look like a link. It should start with https://');
    else { ok = true; status('m-link-status', 'ok', 'Ready. The tour maker will open with the merged photo and ' + (items.length - result.merged.length) + ' spot' + (items.length - result.merged.length === 1 ? '' : 's') + ' left.'); }
    btn.setAttribute('aria-disabled', String(!ok));
    btn.classList.toggle('disabled', !ok);
    if (ok) btn.href = makerLink(v); else btn.removeAttribute('href');
  }
  $('m-link').addEventListener('input', updateLink);
  $('m-open').addEventListener('click', () => {
    if ($('m-open').getAttribute('aria-disabled') === 'true') return;
    // remember the editable version, so the tour maker can offer it when this merged photo is used
    try { localStorage.setItem('tour-merged:' + Media.shorten($('m-link').value.trim()), location.search); } catch (e) {}
  });
  $('m-orig').href = original;
  $('m-copy-orig').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(original); $('m-copy-orig').textContent = 'Copied ✓'; setTimeout(() => { $('m-copy-orig').textContent = 'Copy the editable version’s link'; }, 1600); }
    catch (e) { prompt('Copy this link:', original); }
  });
  $('m-make').addEventListener('click', make);

  renderList(); showQr(); updateMake(); updateLink();
})();
