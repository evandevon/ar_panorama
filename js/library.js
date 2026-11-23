/**
 * Class link library: a Google Sheet (or a CSV / text file) listing links by number and name, so a tour's link can
 * say "#3" instead of a long address. A teacher makes the sheet once with every link the class might use; pupils
 * choose from it in the maker, and the viewer looks the numbers up when the tour opens.
 *
 * The sheet: one row per link, with a number, a name and the link, in any column order (a heading row is skipped):
 *     1 | Candle video   | https://drive.google.com/file/d/…/view
 *     2 | Inkwell model  | https://drive.google.com/file/d/…/view
 * Shared as "Anyone with the link can view" (Share → General access). Publishing to the web also works.
 *
 * In a tour link: lib=<sheet id>[.<tab gid>] (or e:<published id>[.<gid>], or a CSV/text file's address), and a
 * spot's link is "#<number>" (or "#<name>" when the sheet has no numbers).
 */
(function (global) {
  'use strict';

  const CACHE = 'link-library:';

  // What to put in the tour link for whatever the teacher pasted (a Sheets address, an id, or a file's address)
  function idFrom(input) {
    const s = String(input || '').trim();
    if (!s) return '';
    let m = s.match(/docs\.google\.com\/spreadsheets\/d\/e\/([\w-]{20,})/);
    const gid = (s.match(/[#&?]gid=(\d+)/) || [])[1];
    if (m) return 'e:' + m[1] + (gid && gid !== '0' ? '.' + gid : '');
    m = s.match(/docs\.google\.com\/spreadsheets\/d\/([\w-]{20,})/);
    if (m) return m[1] + (gid && gid !== '0' ? '.' + gid : '');
    if (/^(e:)?[\w-]{25,}(\.\d+)?$/.test(s)) return s;        // already an id
    return s;                                                  // a CSV or text file (on this site, or anywhere)
  }
  const isSheet = v => /^(e:)?[\w-]{25,}(\.\d+)?$/.test(v);
  // Where to read it from, best first
  function sources(value) {
    if (!isSheet(value)) return [new URL(value, location.href).href];
    const pub = value.startsWith('e:'), [id, gid] = value.replace(/^e:/, '').split('.');
    if (pub) return ['https://docs.google.com/spreadsheets/d/e/' + id + '/pub?output=csv' + (gid ? '&gid=' + gid : '')];
    const list = ['https://docs.google.com/spreadsheets/d/' + id + '/gviz/tq?tqx=out:csv' + (gid ? '&gid=' + gid : '')];
    const key = global.Media && Media.driveKey && Media.driveKey();
    if (key && !gid) list.push('https://www.googleapis.com/drive/v3/files/' + id + '/export?mimeType=text%2Fcsv&key=' + encodeURIComponent(key));
    return list;
  }
  // The sheet's own page, for "open it" links
  function sheetUrl(value) {
    if (!isSheet(value)) return new URL(value, location.href).href;
    const pub = value.startsWith('e:'), [id, gid] = value.replace(/^e:/, '').split('.');
    return pub ? 'https://docs.google.com/spreadsheets/d/e/' + id + '/pubhtml' : 'https://docs.google.com/spreadsheets/d/' + id + '/edit' + (gid ? '#gid=' + gid : '');
  }

  // ---- reading the rows
  function parseCsv(text) {
    const rows = []; let row = [], cell = '', q = false;
    text = String(text).replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',' || c === '\t') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  // a link (web address, site file, gd: id) rather than a number or a name
  const looksLikeLink = c => /^(https?:\/\/|www\.|gd:)/i.test(c) ||
    /^((drive|docs)\.google\.com|youtu\.be|(m\.)?youtube\.com|(www\.)?dropbox\.com|1drv\.ms|onedrive\.live\.com)\//i.test(c) ||   // copied without https://
    /^[\w.\/-]+\.[a-z0-9]{2,5}([?#].*)?$/i.test(c) && /[\/.]/.test(c) && !/^\d+(\.\d+)?$/.test(c) ||
    /^[\w.-][\w .\/-]*\/[\w .-]*\.[a-z0-9]{2,5}$/i.test(c);          // a file in this site with spaces in its name (models/playground 1.glb)
  // The Type column: exactly these words, written as here or with a capital first letter ("Image", "See-through").
  // Each is the kind of card the link shows on ('see-through' = a see-through video, on Video cards).
  const TYPES = [['image', 'image'], ['video', 'video'], ['see-through', 'see-through'], ['sound', 'audio'],
    ['3D', 'model'], ['link', 'link'], ['document', 'doc']];
  const TYPE_LIST = TYPES.map(t => t[0]);
  /** The card type for a Type cell: '' when empty, null when it isn't one of the TYPES */
  function typeFrom(word) {
    const w = String(word || '').trim();
    if (!w) return '';
    const hit = TYPES.find(([t]) => w === t || w === t.charAt(0).toUpperCase() + t.slice(1) || (t === '3D' && w === '3d'));
    return hit ? hit[1] : null;
  }
  // The heading row: Number | Type | Name | Link (in that order; a sheet without a heading row is read in that order too).
  // The Type heading may list the types, e.g. "Type (image, video, see-through, sound, 3D, link, document)".
  const ORDER = ['num', 'type', 'name', 'link'];
  const HEAD = { num: /^(number|no\.?|#)$/i, type: /^type\b/i, name: /^name$/i, link: /^link$/i };
  const HEADING = 'Number\tType (' + TYPE_LIST.join(', ') + ')\tName\tLink';
  /** @returns {{num: string, name: string, link: string, type: string, typeWord: string, row: number}[]}
   *  type: the card type ('image', 'video', 'see-through', 'audio', 'model', 'link', 'doc'), '' for "any card",
   *  or 'unknown' when the Type cell isn't one of the types (then it shows on every card, and Check every link says so) */
  function entriesFrom(text) {
    const rows = parseCsv(text), out = [];
    let cols = { num: 0, type: 1, name: 2, link: 3 };
    rows.forEach((r, i) => {
      const raw = r.map(c => String(c || '').trim());
      // a heading row: which column is which
      const m = {};
      raw.forEach((c, k) => ORDER.forEach(key => { if (m[key] == null && HEAD[key].test(c)) m[key] = k; }));
      if (m.link != null && !raw.some(looksLikeLink)) { cols = Object.assign({}, cols, m); return; }
      let link = raw[cols.link] || '';
      if (!looksLikeLink(link)) link = raw.find(looksLikeLink) || '';   // (a row laid out differently)
      if (!link) return;                                                  // a note, or an empty row
      const typeWord = raw[cols.type] || '';
      const numCell = raw[cols.num] || '';
      const name = raw[cols.name] && raw[cols.name] !== link ? raw[cols.name] : '';
      const t = typeFrom(typeWord);
      out.push({ num: /^#?\d{1,4}$/.test(numCell) ? numCell.replace(/^#/, '') : '', name, link,
        type: t === null ? 'unknown' : t, typeWord, row: i + 1 });
    });
    return out;
  }

  // ---- loading (a copy is kept in this browser, used when the sheet can't be reached, e.g. a patchy connection)
  const loads = new Map();
  function load(value, fresh) {
    value = idFrom(value);
    if (!value) return Promise.reject(new Error('No link library given.'));
    if (fresh) loads.delete(value);
    if (!loads.has(value)) {
      loads.set(value, (async () => {
        let lastErr = null;
        for (const url of sources(value)) {
          try {
            const r = await fetch(url, { cache: 'no-store' });
            if (!r.ok) { lastErr = new Error(r.status === 404 ? 'not found' : 'error ' + r.status); continue; }
            const text = await r.text();
            if (/^\s*</.test(text)) { lastErr = new Error('not shared'); continue; }   // a sign-in page, not the sheet
            const entries = entriesFrom(text);
            try { localStorage.setItem(CACHE + value, JSON.stringify({ t: Date.now(), entries })); } catch (e) {}
            return { value, entries, fromCopy: false };
          } catch (e) { lastErr = e; }
        }
        try {
          const kept = JSON.parse(localStorage.getItem(CACHE + value) || 'null');
          if (kept && kept.entries) return { value, entries: kept.entries, fromCopy: true };
        } catch (e) {}
        loads.delete(value);
        throw new Error(lastErr && /not shared|401|403/.test(lastErr.message)
          ? 'The link library couldn’t be opened. Share the Google Sheet as “Anyone with the link” (Viewer).'
          : 'The link library couldn’t be loaded' + (lastErr ? ' (' + lastErr.message + ')' : '') + '. Check the Sheet is shared as “Anyone with the link”.');
      })());
    }
    return loads.get(value);
  }

  // ---- references: "#3" (by number) or "#Candle video" (by name)
  const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const isRef = src => /^#\S/.test(String(src || '').trim());
  function find(entries, ref) {
    const r = String(ref || '').trim().replace(/^#/, '');
    if (!r) return null;
    return entries.find(e => e.num && e.num === r) || entries.find(e => norm(e.name) === norm(r)) || null;
  }
  function refFor(entries, entry) {
    if (entry.num) return '#' + entry.num;
    return '#' + entry.name;
  }
  /**
   * Swap references in decoded spots for the library's links (text cards are left alone).
   * @returns {string[]} the references that weren't found
   */
  function resolve(defs, entries) {
    const missing = [];
    defs.forEach(d => {
      if (!d || d.type === 'text' || !isRef(d.src)) return;
      const e = find(entries, d.src);
      if (e) { d.ref = d.src.trim(); d.src = e.link; d.libName = e.name; }
      else missing.push(d.src.trim());
    });
    return missing;
  }

  global.Library = { TYPE_LIST, HEADING, typeFrom, idFrom, sources, sheetUrl, parseCsv, entriesFrom, load, find, refFor, resolve, isRef };
})(window);
