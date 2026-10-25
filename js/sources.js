/*
 * FILE GUIDE: js/sources.js  ·  link handling shared by the tour maker and the viewer (window.Media)
 * Loaded by: index.html and make.html (before spots.js).
 * Does: short tokens (wp: db: od: gx: gr: w: h: yt: gd:, plus own-site relative paths), turning share links into
 *   direct file links (Google Drive, Dropbox, OneDrive, SharePoint, GitHub blob → raw), guessing file kinds from
 *   links, document viewers (docViewer), embed-code extraction, hosting hints for errors, and checking whether a
 *   WebM has its own transparency (videoHasAlpha / probeAlpha).
 * Gotchas: short codes are stored in printed QR codes, so their meaning must never change.
 *   Hosting reality (2026): Google blocks Drive sound/video playback on other sites (only its /preview iframe
 *   works; images work via lh3); personal OneDrive direct links fail (401). GitHub Pages and Dropbox work.
 *   Drive sounds and videos DO work when downloaded whole through the Google Drive API with this site's key
 *   (js/settings.js): downloadDrive() fetches the file and plays it from a blob: copy, which also lets
 *   see-through videos be read. Without a key, Drive sounds and videos fall back to Google's own player.
 *
 * Background: a 360 image is drawn with WebGL, which browsers only allow when the
 * hosting server permits it (CORS). Files on this GitHub Pages site always work;
 * cloud-drive links are best-effort. Audio played through an <audio> element does
 * not need that permission, so audio links are much more forgiving.
 */
(function (global) {
  'use strict';

  function googleDriveId(url) {
    let m = url.match(/drive\.google\.com\/file\/d\/([\w-]{10,})/);
    if (m) return m[1];
    m = url.match(/drive\.google\.com\/(?:open|uc)\?(?:.*&)?id=([\w-]{10,})/);
    if (m) return m[1];
    m = url.match(/docs\.google\.com\/uc\?(?:.*&)?id=([\w-]{10,})/);
    return m ? m[1] : null;
  }

  function youTubeId(url) {
    const m = url.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/);
    return m ? m[1] : null;
  }

  // t=90, t=90s, t=1m30s, start=90  →  seconds
  function youTubeStart(url) {
    const m = url.match(/[?&#](?:t|start)=([\dhms]+)/);
    if (!m) return 0;
    const v = m[1];
    if (/^\d+$/.test(v)) return Number(v);
    const p = v.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
    return (Number(p[1]) || 0) * 3600 + (Number(p[2]) || 0) * 60 + (Number(p[3]) || 0);
  }

  function base64Url(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  // Short codes for the starts of common links. Once a code has been used in a printed QR code it must
  // keep meaning the same thing forever: new codes can be added, existing ones must never change.
  // (Longer starts come before shorter ones that they begin with.)
  const PREFIXES = [
    ['wp:', 'https://en.wikipedia.org/wiki/'],
    ['db:', 'https://www.dropbox.com/'],
    ['od:', 'https://1drv.ms/'],
    ['gx:', 'https://docs.google.com/'],
    ['gr:', 'https://raw.githubusercontent.com/'],
    ['w:', 'https://www.'],
    ['h:', 'https://']
  ];
  /** Short code → full link (anything else is returned unchanged) */
  function expand(token) {
    token = (token || '').trim();
    for (const [code, full] of PREFIXES) if (token.startsWith(code)) return full + token.slice(code.length);
    return token;
  }

  // A GitHub file *page* (github.com/user/repo/blob/branch/path) → the file itself
  function gitHubRaw(url) {
    const m = String(url || '').match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^\/]+)\/([^\/]+)\/(?:blob|raw)\/(.+?)(?:[?#].*)?$/i);
    return m ? 'https://raw.githubusercontent.com/' + m[1] + '/' + m[2] + '/' + m[3] : '';
  }

  /** Pasted link → short token for the QR code (or the link unchanged). */
  function shorten(url) {
    url = (url || '').trim();
    if (!url) return '';
    const raw = gitHubRaw(url) || (/^https:\/\/raw\.githubusercontent\.com\//i.test(url) ? url : '');
    if (raw) {
      // A file in this site's own repo (user.github.io/repo/): just its path
      const m = raw.match(/^https:\/\/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/[^\/]+\/(.+)$/);
      const host = location.hostname.toLowerCase(), first = location.pathname.split('/')[1] || '';
      if (m && host === m[1].toLowerCase() + '.github.io' && first.toLowerCase() === m[2].toLowerCase()) return decodeURIComponent(m[3]);
      url = raw;
    }
    const yt = youTubeId(url);
    if (yt) { const s = youTubeStart(url); return 'yt:' + yt + (s ? '.' + s : ''); }
    const gd = googleDriveId(url);
    if (gd) return 'gd:' + gd;
    // Files on this same site: keep only the path
    try {
      const u = new URL(url, location.href);
      const here = new URL('./', location.href);
      if (u.href.startsWith(here.href)) return u.href.slice(here.href.length);
    } catch (e) {}
    if (/^http:\/\//i.test(url)) return url;            // only https links get short codes
    for (const [code, full] of PREFIXES) if (url.startsWith(full) && url.length > full.length) return code + url.slice(full.length);
    return url;
  }

  /** Is this (token or link) a YouTube video? → {id, start} or null */
  function youTube(token) {
    token = (token || '').trim();
    let m = token.match(/^yt:([\w-]{11})(?:[.~](\d+))?$/);     // older links used ~ before the start time
    if (m) return { id: m[1], start: Number(m[2]) || 0 };
    const id = youTubeId(token);
    return id ? { id: id, start: youTubeStart(token) } : null;
  }

  function looksLikeVideo(token) {
    return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(token || '');
  }
  function looksLikeImage(token) {
    return /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)(\?|#|$)/i.test(token || '');
  }
  function looksLikeModel(token) {
    return /\.(glb|gltf|stl|obj)(\?|#|$)/i.test(token || '');
  }
  function looksLikeDoc(token) {
    token = token || '';
    return /\.(pdf|docx?|pptx?|xlsx?|odt|odp|ods|rtf)(\?|#|$)/i.test(token) ||
      /docs\.google\.com\/(document|presentation|spreadsheets)\/d\//i.test(expand(token)) ||
      /sharepoint\.com\/:[wpxb]:\/|onedrive\.live\.com\/embed|1drv\.ms\/[a-z]\/c\/[^?]*\?[^#]*embed|[?&]action=embedview/i.test(expand(token));
  }
  function docKind(token) {                                   // for choosing an icon
    const u = expand(token || '');
    if (/\.pdf(\?|#|$)/i.test(u)) return 'pdf';
    if (/\.(docx?|odt|rtf)(\?|#|$)/i.test(u) || /docs\.google\.com\/document\//i.test(u) || /:w:\//.test(u)) return 'word';
    if (/\.(pptx?|odp)(\?|#|$)/i.test(u) || /docs\.google\.com\/presentation\//i.test(u) || /:p:\//.test(u)) return 'slides';
    if (/\.(xlsx?|ods)(\?|#|$)/i.test(u) || /docs\.google\.com\/spreadsheets\//i.test(u) || /:x:\//.test(u)) return 'sheet';
    return 'doc';
  }

  /**
   * How to show a document full screen, without needing the host's permission to read the file:
   *  - Google Drive / Docs / Slides / Sheets: Google's own preview, in a frame
   *  - OneDrive (personal): its Embed link, in a frame (Share → Embed)
   *  - OneDrive for work or school / SharePoint: its embed view, in a frame (if the school allows outside sharing)
   *  - a PDF elsewhere (this site, Dropbox, GitHub…): drawn by the built-in PDF reader
   *  - Word / PowerPoint / Excel elsewhere: Microsoft's free Office viewer, in a frame
   * @returns {{mode: 'frame'|'pdf'|'none', url: string, open: string, provider: string}}
   */
  function docViewer(token) {
    let url = expand(token || '');
    if (!url) return { mode: 'none', url: '', open: '', provider: 'none' };
    const m = url.match(/docs\.google\.com\/(document|presentation|spreadsheets)\/d\/([\w-]{10,})/i);
    if (m) {
      const open = 'https://docs.google.com/' + m[1] + '/d/' + m[2] + '/edit';
      return { mode: 'frame', url: 'https://docs.google.com/' + m[1] + '/d/' + m[2] + '/preview', open: open, provider: 'google-drive' };
    }
    const g = url.match(/^gd:([\w-]+)$/);
    const gid = g ? g[1] : googleDriveId(url);
    if (gid) return { mode: 'frame', url: 'https://drive.google.com/file/d/' + gid + '/preview', open: 'https://drive.google.com/file/d/' + gid + '/view', provider: 'google-drive' };
    if (/^(https?:\/\/)?(1drv\.ms|onedrive\.live\.com)\//i.test(url)) {
      if (!/^https?:/i.test(url)) url = 'https://' + url;
      return { mode: 'frame', url: url, open: url.replace(/\/embed\?/, '/?'), provider: 'onedrive' };
    }
    if (/\.sharepoint\.com\//i.test(url)) {
      const view = /[?&]action=embedview/.test(url) ? url : url + (url.includes('?') ? '&' : '?') + 'action=embedview';
      return { mode: 'frame', url: view, open: url, provider: 'sharepoint' };
    }
    const direct = resolveMediaUrl(token, 'doc');
    let abs = direct.url;
    try { abs = new URL(direct.url, location.href).href; } catch (e) {}
    if (/\.pdf(\?|#|$)/i.test(url)) return { mode: 'pdf', url: direct.url, open: abs, provider: direct.provider };
    return {
      mode: 'frame', url: 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(abs),
      open: abs, provider: direct.provider
    };
  }

  // OneDrive's Share → Embed gives a bit of HTML; keep just the address from it
  function fromEmbedCode(text) {
    const m = String(text || '').match(/<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i);
    return m ? m[1].replace(/&amp;/g, '&') : null;
  }

  function looksLikeAudio(token) {
    return /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)(\?|#|$)/i.test(token || '');
  }

  /**
   * Token or link → a URL the browser can load directly.
   * @param {'image'|'video'|'audio'} kind
   * @returns {{url: string, provider: string}}
   */
  function resolveMediaUrl(token, kind) {
    let url = expand(token);
    if (!url) return { url: '', provider: 'none' };

    let gid = null;
    const g = url.match(/^gd:([\w-]+)$/);
    if (g) gid = g[1]; else gid = googleDriveId(url);
    if (gid) {
      if (kind === 'image') return { url: 'https://lh3.googleusercontent.com/d/' + gid + '=s0', provider: 'google-drive' };
      // Sounds and videos are only played (not read by the page), so Drive's direct download works;
      // confirm=t skips the "can't scan this file for viruses" page Drive shows for bigger files.
      return { url: 'https://drive.usercontent.google.com/download?id=' + gid + '&export=download&confirm=t', provider: 'google-drive' };
    }

    if (/^(https?:\/\/)?(1drv\.ms|onedrive\.live\.com)\//i.test(url)) {
      if (!/^https?:/i.test(url)) url = 'https://' + url;
      return { url: 'https://api.onedrive.com/v1.0/shares/u!' + base64Url(url) + '/root/content', provider: 'onedrive' };
    }

    if (/\.sharepoint\.com\//i.test(url)) {
      if (/[?&]download=1/.test(url)) return { url: url, provider: 'sharepoint' };
      return { url: url + (url.includes('?') ? '&' : '?') + 'download=1', provider: 'sharepoint' };
    }

    if (/dropbox\.com\//i.test(url)) {
      const u = url.replace(/([?&])dl=0/, '$1raw=1');
      return { url: /[?&](raw|dl)=1/.test(u) ? u : u + (u.includes('?') ? '&' : '?') + 'raw=1', provider: 'dropbox' };
    }

    const gh = gitHubRaw(url);
    if (gh) return { url: gh, provider: 'web' };

    if (/^www\./i.test(url)) url = 'https://' + url;
    return { url: url, provider: /^https?:/i.test(url) ? 'web' : 'this-site' };
  }

  function hostingHint(provider) {
    switch (provider) {
      case 'google-drive':
        return 'Check the Google Drive file is shared as <b>“Anyone with the link”</b>. Very large files may not load from Drive.';
      case 'onedrive':
      case 'sharepoint':
        return 'OneDrive no longer lets other websites play or show most files directly, and school OneDrive accounts usually block outside sharing. Use Google Drive, Dropbox or your GitHub site for this file. (Documents can still come from OneDrive: use <b>Share → Embed</b> and paste that code.)';
      case 'this-site':
        return 'Check the file name and folder are exactly right (capital letters matter).';
      default:
        return 'The website hosting this file may not allow other sites to display it. Try uploading it to Google Drive or Dropbox and pasting that share link.';
    }
  }

  // Does this video picture have see-through parts? true / false, or null if this browser can't tell
  // (the file's host must allow it to be read, as GitHub and Dropbox do)
  function videoHasAlpha(v) {
    return new Promise(res => {
      try {
        const k = document.createElement('canvas');
        k.width = 64; k.height = Math.max(8, Math.round(64 * (v.videoHeight || 36) / (v.videoWidth || 64)));
        const c = k.getContext('2d', { willReadFrequently: true });
        c.clearRect(0, 0, k.width, k.height);
        c.drawImage(v, 0, 0, k.width, k.height);
        const d = c.getImageData(0, 0, k.width, k.height).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return res(true);
        res(false);
      } catch (e) { res(null); }
    });
  }
  // The same, from a link: opens the video quietly and looks at an early picture
  function probeAlpha(token) {
    return new Promise(res => {
      if (!/\.webm(\?|#|$)/i.test(String(token).trim())) return res(false);
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
      const done = r => { clearTimeout(t); v.removeAttribute('src'); v.load(); res(r); };
      const t = setTimeout(() => done(null), 10000);
      v.addEventListener('error', () => done(null), { once: true });
      v.addEventListener('loadeddata', () => {
        // the very first picture can be blank: look a little way in
        v.addEventListener('seeked', () => videoHasAlpha(v).then(done), { once: true });
        try { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); } catch (e) { videoHasAlpha(v).then(done); }
      }, { once: true });
      v.src = resolveMediaUrl(token, 'video').url;
    });
  }

  // ---------------------------------------------------------------- Google Drive downloads (with this site's key)
  // The key lives in js/settings.js. It's locked (in Google Cloud) to this website and to the Drive API only, so it
  // can't be used elsewhere or for anything that costs money. Each file is downloaded once per visit and shared by
  // every spot that uses it; at most two download at a time, so the first ones finish sooner on a slow phone.
  const DRIVE_API = 'https://www.googleapis.com/drive/v3/files/';
  function driveKey() {
    const c = global.TOUR_SETTINGS;
    return (c && typeof c.driveKey === 'string' && c.driveKey.trim()) || '';
  }
  function driveId(token) {
    const url = expand(token || '');
    const g = url.match(/^gd:([\w-]+)$/);
    return g ? g[1] : googleDriveId(url);
  }
  // Any Google Drive or Docs/Slides/Sheets link → its file ID (or null)
  function driveFileId(token) {
    const id = driveId(token);
    if (id) return id;
    const m = expand(token || '').match(/docs\.google\.com\/(?:document|presentation|spreadsheets|forms|drawings)\/d\/([\w-]{10,})/i);
    return m ? m[1] : null;
  }
  /**
   * Ask Google what an anonymous visitor (anyone with the link) may do with a shared file. One tiny request.
   * @returns {Promise<{name: string, canEdit: boolean}|null>} null if Google couldn't say (not shared, no key, offline…)
   */
  const driveInfoCache = new Map();
  function driveAccess(token) {
    const id = driveFileId(token);
    if (!id || !driveKey() || !/^https?:$/.test(location.protocol)) return Promise.resolve(null);
    if (!driveInfoCache.has(id)) {
      driveInfoCache.set(id, fetch(DRIVE_API + encodeURIComponent(id) + '?fields=name,capabilities(canEdit)&supportsAllDrives=true&key=' + encodeURIComponent(driveKey()))
        .then(r => r.ok ? r.json() : null)
        .then(j => j ? { id: id, name: j.name || '', canEdit: !!(j.capabilities && j.capabilities.canEdit) } : null)
        .catch(() => null));
    }
    return driveInfoCache.get(id);
  }
  function forgetDriveAccess(token) { const id = driveFileId(token); if (id) driveInfoCache.delete(id); }
  /** Can this sound or video be downloaded from Google Drive by this website? */
  function canDownloadDrive(token) {
    return !!(driveKey() && driveId(token) && /^https?:$/.test(location.protocol));
  }
  // Google's reasons for saying no, in plain English (no HTML: shown as text)
  function driveProblem(status, body) {
    const err = body && body.error || {};
    const reason = (err.errors && err.errors[0] && err.errors[0].reason) || (err.details && err.details[0] && err.details[0].reason) || err.status || '';
    const r = (reason + ' ' + (err.message || '')).toLowerCase();
    if (/referer|referrer/.test(r)) return 'Google Drive refused this website’s key here. Drive videos only work on the website the key was made for (see js/settings.js).';
    if (/api_key_invalid|keyinvalid|api key not valid/.test(r)) return 'This website’s Google Drive key isn’t valid any more. Make a new one and put it in js/settings.js.';
    if (/accessnotconfigured|service_disabled|has not been used|is disabled/.test(r)) return 'The Google Drive API is switched off for this website’s key. Switch it on in Google Cloud.';
    if (status === 404 || /notfound/.test(r)) return 'Google Drive can’t find this file. Check it’s shared as “Anyone with the link”. (School Google accounts sometimes don’t allow sharing outside the school.)';
    if (/downloadquotaexceeded|ratelimit|quota/.test(r)) return 'Google Drive has had too many downloads today (of this file, or with this website’s key). Try again tomorrow.';
    if (/abusive/.test(r)) return 'Google has flagged this file, so only its owner can download it.';
    if (status === 403 || /insufficient|permission/.test(r)) return 'Google Drive won’t let this file be downloaded. Check it’s shared as “Anyone with the link”.';
    return 'Google Drive said no (error ' + status + ').';
  }
  const driveJobs = new Map();
  let driveRunning = 0;
  const driveWaiting = [];
  function driveSlot() {
    if (driveRunning < 2) { driveRunning++; return Promise.resolve(); }
    return new Promise(res => driveWaiting.push(res));
  }
  function driveDone() {
    const next = driveWaiting.shift();
    if (next) next(); else driveRunning--;
  }
  /**
   * Download a Drive sound or video whole. onProgress(got, total) is called as it arrives (total 0 if unknown).
   * @returns {Promise<{url: string, blob: Blob, type: string, size: number}>} url is a blob: link to the downloaded copy
   */
  function downloadDrive(token, onProgress) {
    const id = driveId(token);
    if (!id || !driveKey()) return Promise.reject(new Error('Not a Google Drive link.'));
    let job = driveJobs.get(id);
    if (!job) {
      job = { got: 0, total: 0, listeners: new Set() };
      const tell = () => job.listeners.forEach(f => { try { f(job.got, job.total); } catch (e) {} });
      job.promise = driveSlot().then(async () => {
        try {
          let resp;
          try {
            resp = await fetch(DRIVE_API + encodeURIComponent(id) + '?alt=media&supportsAllDrives=true&key=' + encodeURIComponent(driveKey()));
          } catch (e) {
            throw new Error('Couldn’t reach Google Drive. Check the internet connection.');
          }
          if (!resp.ok) {
            let body = null;
            try { body = await resp.json(); } catch (e) {}
            throw new Error(driveProblem(resp.status, body));
          }
          const type = resp.headers.get('content-type') || '';
          if (/^text\/html/.test(type)) throw new Error('Google Drive sent back a web page instead of the file. Try a smaller file.');
          job.total = Number(resp.headers.get('content-length')) || 0;
          let blob;
          if (resp.body && resp.body.getReader) {
            const reader = resp.body.getReader(), chunks = [];
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value); job.got += value.length; tell();
            }
            blob = new Blob(chunks, { type: type });
          } else blob = await resp.blob();
          job.got = job.total = blob.size; tell();
          return { url: URL.createObjectURL(blob), blob: blob, type: type, size: blob.size };
        } finally { driveDone(); }
      });
      job.promise.catch(() => driveJobs.delete(id));          // a later try can start again
      driveJobs.set(id, job);
    }
    if (onProgress) { job.listeners.add(onProgress); if (job.got) onProgress(job.got, job.total); }
    return job.promise;
  }

  global.Media = { shorten, expand, youTube, looksLikeVideo, looksLikeImage, looksLikeAudio, looksLikeModel, looksLikeDoc, docKind,
    docViewer, fromEmbedCode, resolveMediaUrl, hostingHint, videoHasAlpha, probeAlpha, driveKey, canDownloadDrive, downloadDrive, driveFileId, driveAccess, forgetDriveAccess };
})(window);
