/*
 * FILE GUIDE: js/maker-a.js  ·  the "style A" layout of the tour maker (make.html, 25 Nov)
 *   A workplane like Tinkercad: the room in the middle, tiles on the right, the chosen thing's settings in the same
 *   panel, and big panels (<dialog>) for picking the room, settings, trying the tour and sharing it.
 * Loaded by: make.html, after js/create.js. js/create.js still does all the work (links, preview, QR code); this file
 *   only shows and hides things. It listens for create.js's events:
 *     maker:state {photo, url, title} · maker:spots {count} · maker:card {index} · maker:library {entries}
 *   and sends one: maker:addFromLibrary {entry}.
 * Sections: dialogs · pick your room · the side panel · class library tab · try it · share
 * The classic maker (make-classic.html) doesn't load this file.
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let state = { photo: null, url: '', title: '' };

  // ------------------------------------------------------------- dialogs
  function openDialog(id) {
    const d = $(id);
    if (!d.open) d.showModal();
  }
  function closeDialog(id) { const d = $(id); if (d.open) d.close(); }
  document.querySelectorAll('.a-dialog').forEach(d => {
    d.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) { d.close(); return; }
      if (e.target === d && !(d.id === 'a-room' && state.photo !== true)) d.close();    // a click on the dimmed backdrop
    });
    d.addEventListener('cancel', e => { if (d.id === 'a-room' && state.photo !== true) e.preventDefault(); });   // Esc: there's no room yet
  });

  // ------------------------------------------------------------- pick your room
  $('a-room-btn').addEventListener('click', () => openDialog('a-room'));
  $('a-room-done').addEventListener('click', () => closeDialog('a-room'));
  let pickedRoom = false;            // close the panel by itself once a room from the teacher has loaded
  function pickRoom(link) {
    // the photo box wants a full address: a file in this site ("panoramas/room.jpg") or a short code becomes one
    let full = String(link || '').trim();
    if (/^www\./i.test(full)) full = 'https://' + full;
    if (!/^https?:\/\//i.test(full) && window.Media && Media.expand) full = Media.expand(full);
    if (!/^https?:\/\//i.test(full)) { try { full = new URL(full, location.href).href; } catch (e) { /* leave it */ } }
    $('in-pano').value = full;
    $('in-pano').dispatchEvent(new Event('change', { bubbles: true }));
    pickedRoom = true;
  }
  $('sample').addEventListener('click', () => { pickedRoom = true; });
  // Keep working on a tour: any of this site's tour links (the QR code's, or a maker's) opens here, ready to change
  $('a-resume-go').addEventListener('click', () => {
    const raw = $('a-resume-in').value.trim();
    let u = null;
    try { u = new URL(raw, location.href); } catch (e) { /* not a link */ }
    if (!u || !u.searchParams.get('p')) {
      $('a-resume-status').className = 'status err';
      $('a-resume-status').textContent = 'That isn’t a tour link. Paste the link you copied with Copy link (it has ?p= in it).';
      return;
    }
    location.href = new URL('make.html' + u.search, location.href).href;
  });
  $('a-resume-in').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('a-resume-go').click(); } });

  // ------------------------------------------------------------- the side panel: adding, then changing the chosen thing
  const side = $('a-side');
  document.addEventListener('maker:card', e => {
    const editing = e.detail.index >= 0;
    side.classList.toggle('editing', editing);
    $('a-editing-bar').hidden = !editing;
    if (editing) side.scrollTop = 0;
  });
  $('a-back').addEventListener('click', () => {
    const open = document.querySelector('#spot-list > li.open .sc-toggle');
    if (open) open.click();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && side.classList.contains('editing') && !document.querySelector('dialog[open]')) $('a-back').click();
  });
  document.addEventListener('maker:spots', e => {
    $('a-count').textContent = e.detail.count ? '(' + e.detail.count + ')' : '';
  });

  // The top bar's buttons wake up once there's a room
  document.addEventListener('maker:state', e => {
    state = e.detail;
    const has = state.photo === true;
    $('a-room-done').disabled = !has;
    $('a-try-btn').disabled = !has || !state.url;
    $('a-share-btn').disabled = !has || !state.url;
    if (has && pickedRoom) { pickedRoom = false; closeDialog('a-room'); }
  });

  // ------------------------------------------------------------- class library tab (and rooms from the teacher)
  const TYPE_NAME = { image: 'Picture', video: 'Video', audio: 'Sound', text: 'Words', model: '3D model', link: 'Link', doc: 'Document' };
  const FILTERS = [['', 'All'], ['image', 'Pictures'], ['video', 'Videos'], ['audio', 'Sounds'], ['model', '3D'], ['link', 'Links'], ['doc', 'Documents']];
  let entries = [], filter = '';
  const kindOf = en => en.type && en.type !== 'unknown' ? en.type : (window.HotSpots && HotSpots.guessKind(en.link)) || 'link';
  function drawLibrary() {
    const things = entries.filter(en => en.type !== 'pano');
    $('a-tabs').hidden = !things.length;
    if (!things.length) selectTab('own');
    // filters: only the kinds the library has
    const have = new Set(things.map(kindOf));
    const box = $('a-lib-filters');
    box.innerHTML = '';
    FILTERS.filter(([k]) => !k || have.has(k)).forEach(([k, name]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'a-chip'; b.dataset.kind = k; b.textContent = name;
      b.setAttribute('aria-pressed', String(k === filter));
      b.addEventListener('click', () => { filter = k; drawLibrary(); });
      box.appendChild(b);
    });
    const list = $('a-lib-list');
    list.innerHTML = '';
    things.filter(en => !filter || kindOf(en) === filter).forEach(en => {
      const k = kindOf(en);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'a-lib-item'; b.dataset.kind = k;
      b.innerHTML = '<span class="a-lib-ico" aria-hidden="true"></span><span class="a-lib-name"></span><span class="a-lib-kind"></span>';
      b.querySelector('.a-lib-ico').innerHTML = (document.querySelector('.add-kind[data-kind="' + k + '"] .ak-ico') || {}).innerHTML || '';
      b.querySelector('.a-lib-name').textContent = en.name || en.link;
      b.querySelector('.a-lib-kind').textContent = TYPE_NAME[k] || 'Link';
      b.disabled = state.photo !== true;
      b.addEventListener('click', () => document.dispatchEvent(new CustomEvent('maker:addFromLibrary', { detail: { entry: en } })));
      list.appendChild(b);
    });
    // rooms (Type "room") go in Pick your room
    const rooms = entries.filter(en => en.type === 'pano');
    $('a-rooms-box').hidden = !rooms.length;
    const rl = $('a-rooms');
    rl.innerHTML = '';
    rooms.forEach(en => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'a-room-pick';
      b.innerHTML = '<span class="a-room-pic" aria-hidden="true"></span><span class="a-room-name"></span>';
      b.querySelector('.a-room-name').textContent = en.name || 'Room ' + (en.num || '');
      try {
        const img = new Image();
        img.alt = ''; img.loading = 'lazy';
        img.onerror = () => img.remove();
        img.src = Media.resolveMediaUrl(en.link, 'image').url;
        b.querySelector('.a-room-pic').appendChild(img);
      } catch (e) { /* the picture is only a preview */ }
      b.addEventListener('click', () => pickRoom(en.link));
      rl.appendChild(b);
    });
  }
  document.addEventListener('maker:library', e => { entries = e.detail.entries || []; drawLibrary(); });
  document.addEventListener('maker:state', () => {
    document.querySelectorAll('.a-lib-item').forEach(b => { b.disabled = state.photo !== true; });
  });

  // tabs: Make your own | Class library (arrow keys move between them)
  function selectTab(which) {
    const own = which === 'own';
    $('a-tab-own').setAttribute('aria-selected', String(own)); $('a-tab-own').tabIndex = own ? 0 : -1;
    $('a-tab-lib').setAttribute('aria-selected', String(!own)); $('a-tab-lib').tabIndex = own ? -1 : 0;
    $('a-pane-own').hidden = !own; $('a-pane-lib').hidden = own;
  }
  $('a-tab-own').addEventListener('click', () => selectTab('own'));
  $('a-tab-lib').addEventListener('click', () => selectTab('lib'));
  $('a-tabs').addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const toLib = $('a-tab-own').getAttribute('aria-selected') === 'true';
    selectTab(toLib ? 'lib' : 'own');
    $(toLib ? 'a-tab-lib' : 'a-tab-own').focus();
    e.preventDefault();
  });

  // ------------------------------------------------------------- try it: the real tour, in a phone-shaped frame
  $('a-try-btn').addEventListener('click', () => {
    const url = $('open').href;
    if (!url) return;
    $('a-try-open').href = url;
    const f = document.createElement('iframe');
    f.title = 'Your tour, as a phone shows it';
    f.allow = 'autoplay; fullscreen; xr-spatial-tracking';
    f.src = url;
    $('a-phone-screen').innerHTML = '';
    $('a-phone-screen').appendChild(f);
    openDialog('a-tryit');
  });
  // closing it stops every sound and video (the tour is thrown away)
  $('a-tryit').addEventListener('close', () => { $('a-phone-screen').innerHTML = ''; });
  $('a-try-share').addEventListener('click', () => { closeDialog('a-tryit'); openDialog('a-sharing'); });

  // ------------------------------------------------------------- share, and settings
  $('a-share-btn').addEventListener('click', () => openDialog('a-sharing'));
  $('a-settings-btn').addEventListener('click', () => {
    $('a-classic').href = 'make-classic.html' + location.search;
    openDialog('a-settings');
  });

  // ------------------------------------------------------------- first visit: pick a room
  // (after create.js has read the page address, which may already hold a tour)
  setTimeout(() => {
    if (!$('in-pano').value.trim()) openDialog('a-room');
  }, 0);
})();
