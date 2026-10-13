/*
 * Link handling shared by the author page and the viewer.
 *
 * 1. Shortening: well-known links are stored in the QR code as short tokens
 *    (gd:<id> for Google Drive, yt:<id> for YouTube) so codes stay easy to scan.
 * 2. Resolving: share links from cloud drives are turned into direct file links.
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
    ['w:', 'https://www.'],
    ['h:', 'https://']
  ];
  /** Short code → full link (anything else is returned unchanged) */
  function expand(token) {
    token = (token || '').trim();
    for (const [code, full] of PREFIXES) if (token.startsWith(code)) return full + token.slice(code.length);
    return token;
  }

  /** Pasted link → short token for the QR code (or the link unchanged). */
  function shorten(url) {
    url = (url || '').trim();
    if (!url) return '';
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
      return { url: 'https://drive.google.com/uc?export=download&id=' + gid, provider: 'google-drive' };
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

    if (/^www\./i.test(url)) url = 'https://' + url;
    return { url: url, provider: /^https?:/i.test(url) ? 'web' : 'this-site' };
  }

  function hostingHint(provider) {
    switch (provider) {
      case 'google-drive':
        return 'Check the Google Drive file is shared as <b>“Anyone with the link”</b>. Very large files may not load from Drive.';
      case 'onedrive':
      case 'sharepoint':
        return 'Check the OneDrive file is shared with <b>“Anyone with the link”</b>. School and work OneDrive accounts often block this; if so, try Google Drive or Dropbox.';
      case 'this-site':
        return 'Check the file name and folder are exactly right (capital letters matter).';
      default:
        return 'The website hosting this file may not allow other sites to display it. Try uploading it to Google Drive or Dropbox and pasting that share link.';
    }
  }

  global.Media = { shorten, expand, youTube, looksLikeVideo, looksLikeImage, looksLikeAudio, looksLikeModel, resolveMediaUrl, hostingHint };
})(window);
