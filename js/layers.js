/*
 * FILE GUIDE: js/layers.js  ·  masks ("Masking" in the tour maker): outlines on the 360 photo that hide the visual
 *   spots behind them, so a person can stand behind the teacher's desk.
 * Loaded by: index.html (after spots.js). Depends on: A-Frame. Exposes window.FrontLayer(opts) plus
 *   FrontLayer.encode / decode. make.html keeps its own tiny copy of encode/decode (create.js) so it needn't load A-Frame.
 * Link format: one f= per mask, yaw,pitch pairs in degrees to the nearest half degree, e.g. f=0,15,-20,15,-20,-15,0,-15.
 *   A leading "w" means a "window" (everything EXCEPT inside hides spots): still supported here, not offered in the maker.
 * How it hides things: page-element spots that masks apply to (spots.js sets s.behind: visual spots unless the author
 *   unticked "Hidden by masks") sit in a "behind" layer clipped every frame with CSS clip-path (clipped parts can't be
 *   tapped). 3D models / see-through videos sit further away (BEHIND_DIST in spots.js) behind a cut-out copy of the
 *   photo sphere (radius FRONT_R) whose alpha comes from a mask canvas in the photo's own texture coordinates.
 * Sections (search for "// ---- <name>"): link format · the behind layer's clipping · the cut-out copy of the photo ·
 *   every frame · the author's preview: outlines and drawing
 */
(function (global) {
  'use strict';
  const THREE = AFRAME.THREE;
  const FRONT_R = 20;          // the cut-out copy of the photo: nearer than "behind" 3D items, further than the rest
  const MASK_W = 2048, MASK_H = 1024;

  function dirFrom(yaw, pitch) {
    const y = yaw * Math.PI / 180, p = pitch * Math.PI / 180;
    return new THREE.Vector3(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
  }
  function anglesFrom(v) {
    return { yaw: Math.atan2(-v.x, -v.z) * 180 / Math.PI, pitch: Math.asin(Math.max(-1, Math.min(1, v.y))) * 180 / Math.PI };
  }
  const half = n => +(Math.round(n * 2) / 2).toFixed(1);

  // ---------------------------------------------------------------- link format
  function encode(shape) {
    return (shape.kind === 'window' ? 'w' : '') + shape.pts.map(p => half(p[0]) + ',' + half(p[1])).join(',');
  }
  function decode(str) {
    str = String(str || '').trim();
    const kind = /^w/i.test(str) ? 'window' : 'front';
    const n = str.replace(/^w/i, '').split(',').map(Number);
    if (n.length < 6 || n.length % 2 || !n.every(Number.isFinite)) return null;
    const pts = [];
    for (let i = 0; i < n.length; i += 2) pts.push([n[i], Math.max(-89.5, Math.min(89.5, n[i + 1]))]);
    return { kind, pts };
  }

  // Points along each edge (edges follow the sphere, as they look on screen), as directions
  function densify(pts) {
    const out = [], a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i = 0; i < pts.length; i++) {
      a.copy(dirFrom(pts[i][0], pts[i][1])); b.copy(dirFrom(pts[(i + 1) % pts.length][0], pts[(i + 1) % pts.length][1]));
      const ang = a.angleTo(b), steps = Math.max(1, Math.ceil(ang / (2 * Math.PI / 180)));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        if (ang < 1e-6) { out.push(a.clone()); continue; }
        const s = Math.sin(ang);                                    // slerp along the great circle
        out.push(a.clone().multiplyScalar(Math.sin((1 - t) * ang) / s).add(b.clone().multiplyScalar(Math.sin(t * ang) / s)));
      }
    }
    return out;
  }
  const area = p => { let s = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; s += p[i][0] * q[1] - q[0] * p[i][1]; } return s / 2; };
  function inside(p, x, y) {
    let c = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
    }
    return c;
  }

  function FrontLayer(opts) {
    const sceneEl = opts.sceneEl;
    // The "behind" layer: first inside the spots layer, so spots in front stay above it
    const back = document.createElement('div'); back.className = 'spots-back';
    const inner = document.createElement('div'); inner.className = 'spots-back-inner';
    back.appendChild(inner);
    opts.layer.prepend(back);

    let shapes = [], dense = [], shown = true, wrappers = [], screen = [];
    let draft = null, tool = null, hover = null;       // drawing, in the author's preview
    const wrapFor = { windows: null, fronts: [] };

    // ---------------------------------------------------------------- the behind layer's clipping
    function rewrap() {
      // back > [windows] > [front 1] > [front 2] … > inner. (Moving inner reloads players in it,
      // so this only happens when the number of shapes changes.)
      const nWin = shapes.some(s => s.kind === 'window') ? 1 : 0, nFront = shapes.filter(s => s.kind === 'front').length;
      if (wrappers.length === nWin + nFront && !!wrapFor.windows === !!nWin) return;
      let parent = back;
      wrappers.forEach(w => w.remove());
      wrappers = [];
      wrapFor.windows = null; wrapFor.fronts = [];
      for (let i = 0; i < nWin + nFront; i++) {
        const w = document.createElement('div'); w.className = 'spots-clip';
        parent.appendChild(w); wrappers.push(w); parent = w;
        if (i === 0 && nWin) wrapFor.windows = w; else wrapFor.fronts.push(w);
      }
      parent.appendChild(inner);
    }
    const setClip = (el, v) => { if (el && el._clip !== v) { el._clip = v; el.style.clipPath = v; el.style.webkitClipPath = v; } };

    // ---------------------------------------------------------------- the cut-out copy of the photo (for 3D items)
    let mesh = null, maskC = null, maskTex = null, uvMap = null, skyMesh = null;
    function currentSky() {
      const el = ['vsphere', 'sky'].map(id => document.getElementById(id)).find(e => e && e.getAttribute('visible') && e.getObject3D('mesh'));
      return el ? el.getObject3D('mesh') : null;
    }
    // Where a compass direction lands on the photo: worked out from the photo sphere itself, so it always matches
    function calibrate(sm) {
      sm.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(), o = new THREE.Vector3();
      const uvAt = (yaw, pitch) => { ray.set(o, dirFrom(yaw, pitch)); const hit = ray.intersectObject(sm, false)[0]; return hit && hit.uv ? hit.uv.clone() : null; };
      const a = uvAt(0, 0), b = uvAt(90, 0), c = uvAt(0, 45);
      if (!a || !b || !c) return null;
      let du = b.x - a.x; if (du > 0.5) du -= 1; if (du < -0.5) du += 1;
      return { u0: a.x, du: du / 90, v0: a.y, dv: (c.y - a.y) / 45 };
    }
    function buildMask() {
      if (!uvMap) return;
      maskC = maskC || Object.assign(document.createElement('canvas'), { width: MASK_W, height: MASK_H });
      const x = maskC.getContext('2d');
      x.globalCompositeOperation = 'source-over';
      const windows = shapes.filter(s => s.kind === 'window');
      x.fillStyle = windows.length ? '#fff' : '#000'; x.fillRect(0, 0, MASK_W, MASK_H);
      const draw = (s, colour, cut) => {
        const d = densify(s.pts).map(v => anglesFrom(v));
        // to photo pixels, keeping the outline continuous across the photo's left/right join
        let prev = null, shift = 0;
        const pts = d.map(({ yaw, pitch }) => {
          let u = uvMap.u0 + uvMap.du * yaw, v = uvMap.v0 + uvMap.dv * pitch;
          u = ((u % 1) + 1) % 1;
          if (prev !== null) { if (u + shift - prev > 0.5) shift -= 1; else if (u + shift - prev < -0.5) shift += 1; }
          prev = u + shift;
          return [prev * MASK_W, (1 - v) * MASK_H];
        });
        // an outline around a pole (straight up or down) doesn't come back to where it started: close it over the pole
        const wrapped = Math.abs(pts[pts.length - 1][0] - pts[0][0]) > MASK_W / 2;
        if (wrapped) {
          const poleY = d.reduce((t, p) => t + p.pitch, 0) > 0 ? 0 : MASK_H;
          pts.push([pts[pts.length - 1][0], poleY], [pts[0][0], poleY]);
        }
        x.globalCompositeOperation = cut ? 'destination-out' : 'source-over';
        x.fillStyle = colour;
        for (const off of [-MASK_W, 0, MASK_W]) {
          x.beginPath(); pts.forEach((p, i) => x[i ? 'lineTo' : 'moveTo'](p[0] + off, p[1])); x.closePath(); x.fill();
        }
      };
      windows.forEach(s => draw(s, '#000', true));
      x.globalCompositeOperation = 'source-over';
      if (windows.length) { // destination-out leaves see-through holes: make them black again
        x.globalCompositeOperation = 'destination-over'; x.fillStyle = '#000'; x.fillRect(0, 0, MASK_W, MASK_H);
        x.globalCompositeOperation = 'source-over';
      }
      shapes.filter(s => s.kind === 'front').forEach(s => draw(s, '#fff', false));
      if (maskTex) maskTex.needsUpdate = true;
    }
    function ensureMesh() {
      const sm = currentSky();
      if (!sm || !sm.material || !sm.material.map) return false;
      if (sm !== skyMesh) {
        skyMesh = sm; uvMap = calibrate(sm);
        if (!uvMap) return false;
        buildMask();
        if (mesh) { sceneEl.object3D.remove(mesh); mesh.material.dispose(); }
        maskTex = new THREE.CanvasTexture(maskC);
        const mat = sm.material.clone();             // the same picture and colour handling as the photo itself
        mat.alphaMap = maskTex; mat.alphaTest = 0.5; mat.transparent = false; mat.depthWrite = true;
        mesh = new THREE.Mesh(sm.geometry, mat);
        mesh.matrixAutoUpdate = false;
        mesh.frustumCulled = false;
        sceneEl.object3D.add(mesh);
      }
      if (mesh.material.map !== sm.material.map) { mesh.material.map = sm.material.map; mesh.material.needsUpdate = true; }
      // the same place as the photo sphere, but much nearer
      const r = sm.geometry.parameters && sm.geometry.parameters.radius ? sm.geometry.parameters.radius : 100;
      mesh.matrix.copy(sm.matrixWorld).multiply(new THREE.Matrix4().makeScale(FRONT_R / r, FRONT_R / r, FRONT_R / r));
      mesh.matrixWorldNeedsUpdate = true;
      return true;
    }

    // ---------------------------------------------------------------- every frame
    const cv = new THREE.Vector3();
    function project(camera, dirs, w, h) {
      // into camera space; cut off whatever is behind the viewer, then onto the screen
      const near = -0.05, cam = dirs.map(d => cv.copy(d).multiplyScalar(50).applyMatrix4(camera.matrixWorldInverse).clone());
      const out = [];
      for (let i = 0; i < cam.length; i++) {
        const a = cam[i], b = cam[(i + 1) % cam.length];
        const ain = a.z < near * 50, bin = b.z < near * 50;
        if (ain) out.push(a);
        if (ain !== bin) { const t = (near * 50 - a.z) / (b.z - a.z); out.push(a.clone().lerp(b, t)); }
      }
      return out.map(p => { const q = p.clone().applyMatrix4(camera.projectionMatrix); return [(q.x + 1) / 2 * w, (1 - q.y) / 2 * h]; });
    }
    function update() {
      const camera = sceneEl.camera;
      const active = shown && shapes.length > 0;
      if (mesh) mesh.visible = active;
      if (!camera) return;
      if (active) ensureMesh();
      const w = sceneEl.canvas ? sceneEl.canvas.clientWidth : innerWidth, h = sceneEl.canvas ? sceneEl.canvas.clientHeight : innerHeight;
      camera.updateMatrixWorld();
      screen = shapes.map((s, i) => ({ kind: s.kind, poly: project(camera, dense[i], w, h) }));
      if (!active) { wrappers.forEach(el => setClip(el, '')); }
      else {
        const f = n => Math.max(-1e5, Math.min(1e5, n)).toFixed(1);
        const path = p => 'M' + p.map(q => f(q[0]) + ' ' + f(q[1])).join('L') + 'Z';
        const wins = screen.filter(s => s.kind === 'window' && s.poly.length > 2).map(s => area(s.poly) < 0 ? s.poly.slice().reverse() : s.poly);
        if (wrapFor.windows) setClip(wrapFor.windows, wins.length ? 'path(nonzero, "' + wins.map(path).join(' ') + '")' : 'polygon(0 0, 0 0, 0 0)');
        const rect = 'M-50 -50H' + (w + 50) + 'V' + (h + 50) + 'H-50Z';
        screen.filter(s => s.kind === 'front').forEach((s, i) => {
          setClip(wrapFor.fronts[i], s.poly.length > 2 ? 'path(evenodd, "' + rect + ' ' + path(s.poly) + '")' : '');
        });
      }
      if (opts.editable) drawOutlines(w, h, camera);
    }
    // Is this point on the screen covered by the front layer?
    function hiddenAt(x, y) {
      if (!shown || !shapes.length) return false;
      const wins = screen.filter(s => s.kind === 'window');
      if (wins.length && !wins.some(s => s.poly.length > 2 && inside(s.poly, x, y))) return true;
      return screen.some(s => s.kind === 'front' && s.poly.length > 2 && inside(s.poly, x, y));
    }

    // ---------------------------------------------------------------- the author's preview: outlines and drawing
    let svg = null, drag = null, downAt = null;
    const COLOURS = { front: '#ffc93c', window: '#5ad1ff' };
    function ensureSvg() {
      if (svg) return svg;
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'layer-outlines'); svg.setAttribute('aria-hidden', 'true');
      document.body.appendChild(svg);
      svg.addEventListener('pointerdown', e => {
        const c = e.target.closest('circle[data-s]');
        if (!c) return;
        e.preventDefault(); e.stopPropagation();
        if (c.dataset.s === 'draft') { if (+c.dataset.p === 0 && draft && draft.pts.length >= 3) opts.tell({ type: 'layerClose' }); return; }
        drag = { s: +c.dataset.s, p: +c.dataset.p };
        svg.setPointerCapture(e.pointerId);
      });
      svg.addEventListener('pointermove', e => {
        if (!drag) return;
        const a = anglesAt(e.clientX, e.clientY);
        shapes[drag.s].pts[drag.p] = [half(a.yaw), half(a.pitch)];
        dense[drag.s] = densify(shapes[drag.s].pts);
      });
      const end = () => {
        if (!drag) return;
        const d = drag; drag = null;
        buildMask();
        opts.tell({ type: 'layerMove', shape: d.s, point: d.p, yaw: shapes[d.s].pts[d.p][0], pitch: shapes[d.s].pts[d.p][1] });
      };
      svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
      // Clicks on the photo add dots while drawing (a drag still turns the view)
      sceneEl.canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
      sceneEl.canvas.addEventListener('click', e => {
        if (!tool || !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
        const a = anglesAt(e.clientX, e.clientY);
        opts.tell({ type: 'layerPoint', yaw: half(a.yaw), pitch: half(a.pitch) });
      });
      sceneEl.canvas.addEventListener('pointermove', e => { if (tool) hover = [e.clientX, e.clientY]; });
      sceneEl.canvas.addEventListener('pointerleave', () => { hover = null; });
      return svg;
    }
    function anglesAt(x, y) {
      const camera = sceneEl.camera, r = sceneEl.canvas.getBoundingClientRect();
      const v = new THREE.Vector3((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1, 0.5).unproject(camera);
      const o = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
      return anglesFrom(v.sub(o).normalize());
    }
    function drawOutlines(w, h, camera) {
      const s = ensureSvg();
      const editing = !!(opts.isEditing && opts.isEditing()) || !!tool;
      s.classList.toggle('editing', editing);
      s.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      if (!shown && !tool) { if (s._html !== '') { s.innerHTML = ''; s._html = ''; } return; }
      const f = n => n.toFixed(1);
      let html = '';
      screen.forEach((sc, i) => {
        if (sc.poly.length > 2) html += '<path d="M' + sc.poly.map(q => f(Math.max(-1e4, Math.min(1e4, q[0]))) + ' ' + f(Math.max(-1e4, Math.min(1e4, q[1])))).join('L') + 'Z" class="lo ' + sc.kind + '"/>';
        if (editing) shapes[i].pts.forEach((p, j) => {
          const q = dot(camera, p, w, h);
          if (q) html += '<circle data-s="' + i + '" data-p="' + j + '" cx="' + f(q[0]) + '" cy="' + f(q[1]) + '" r="6" fill="' + COLOURS[sc.kind] + '"/>';
        });
      });
      if (draft && draft.pts.length) {
        const pts = draft.pts.map(p => dot(camera, p, w, h)).filter(Boolean);
        if (hover && pts.length) pts.push([hover[0], hover[1]]);
        if (pts.length > 1) html += '<polyline points="' + pts.map(q => f(q[0]) + ',' + f(q[1])).join(' ') + '" class="lo draft ' + draft.kind + '"/>';
        draft.pts.forEach((p, j) => {
          const q = dot(camera, p, w, h);
          if (q) html += '<circle data-s="draft" data-p="' + j + '" cx="' + f(q[0]) + '" cy="' + f(q[1]) + '" r="' + (j === 0 && draft.pts.length >= 3 ? 9 : 6) + '" fill="' + COLOURS[draft.kind] + '"/>';
        });
      }
      if (s._html !== html) { s.innerHTML = html; s._html = html; }
    }
    function dot(camera, p, w, h) {
      cv.copy(dirFrom(p[0], p[1])).multiplyScalar(50).applyMatrix4(camera.matrixWorldInverse);
      if (cv.z > -2) return null;
      cv.applyMatrix4(camera.projectionMatrix);
      return [(cv.x + 1) / 2 * w, (1 - cv.y) / 2 * h];
    }

    return {
      backLayer: inner,
      set(list, opt) {
        shapes = (list || []).filter(Boolean).map(s => ({ kind: s.kind === 'window' ? 'window' : 'front', pts: s.pts.map(p => p.slice()) }));
        dense = shapes.map(s => densify(s.pts));
        if (opt && 'show' in opt) shown = opt.show;
        if (opt && 'draft' in opt) draft = opt.draft;
        if (opt && 'tool' in opt) { tool = opt.tool || null; if (!tool) hover = null; }
        rewrap();
        buildMask();
      },
      get count() { return shapes.length; },
      get active() { return shown && shapes.length > 0; },
      update, hiddenAt
    };
  }
  FrontLayer.encode = encode;
  FrontLayer.decode = decode;
  FrontLayer.FRONT_R = FRONT_R;
  global.FrontLayer = FrontLayer;
})(window);
