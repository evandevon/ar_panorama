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

  global.Media = { shorten, expand, youTube, looksLikeVideo, looksLikeImage, looksLikeAudio, looksLikeModel, looksLikeDoc, docKind,
    docViewer, fromEmbedCode, resolveMediaUrl, hostingHint };
})(window);
