/* =========================================================
 * 複線図レンダラー（SVG）
 * 問題データ（data/noX.js）を受け取り、ステップごとに描画する
 * ========================================================= */
window.PROBLEMS = window.PROBLEMS || {}; // 問題データの格納先（番号→データ）

const FK = (() => {
  const NS = 'http://www.w3.org/2000/svg'; // SVG名前空間

  // 電線色の定義（c: 最終色コード）
  const COLORS = {
    W:  { stroke: '#ffffff', under: '#555', w: 4,  name: '白（接地側）' },
    B:  { stroke: '#111111', w: 4,  name: '黒（非接地側）' },
    R:  { stroke: '#e60023', w: 4,  name: '赤' },
    G:  { stroke: '#00a650', w: 4,  name: '緑（接地線）' },
    X:  { stroke: '#18bcd6', w: 4,  name: '色自由（色別を問わない）' },
    P:  { stroke: '#ff8c00', w: 4,  dash: '10 6', name: '色未定（ステップ5で決定）' },
    K:  { stroke: '#111111', w: 9,  name: 'KIP（高圧絶縁電線）' },
    Y:  { stroke: '#e6b800', w: 4,  name: '黄（制御回路・わたり線）' },
    BL: { stroke: '#1f5fff', w: 4,  name: '青' },
  };

  // ステップ名（共通）
  const STEP_NAMES = {
    1: '器具を配置',
    2: '接地側（白）を負荷・コンセントへ',
    3: '非接地側（黒）をスイッチ・コンセントへ',
    4: 'スイッチ→負荷（返り線）',
    5: '色分け・スリーブ刻印・アース（緑）',
  };

  // ステップごとのハイライト色（現在ステップのネオン）
  const STEP_GLOW = { 1: '#ff2a4d', 2: '#ffd0d8', 3: '#ff2a4d', 4: '#ff8c00', 5: '#00e676' };

  /* ---------- 小さなSVGユーティリティ ---------- */
  function el(tag, attrs = {}, parent) {
    const e = document.createElementNS(NS, tag); // 生成した要素
    for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function text(parent, x, y, str, o = {}) {
    const t = el('text', {
      x, y,
      'font-size': o.size || 13,
      'text-anchor': o.anchor || 'middle',
      'dominant-baseline': o.base || 'middle',
      fill: o.color || '#222',
      'font-weight': o.bold ? 'bold' : 'normal',
      transform: o.rot ? `rotate(${o.rot} ${x} ${y})` : null,
      class: o.cls || null,
    }, parent);
    t.textContent = str;
    return t;
  }

  // 回転・反転を考慮してローカル座標→絶対座標へ
  function toAbs(dev, p) {
    let [dx, dy] = p;           // ローカルオフセット
    if (dev.flip) dx = -dx;     // 左右反転
    const r = ((dev.rot || 0) * Math.PI) / 180; // 回転角（ラジアン）
    const rx = dx * Math.cos(r) - dy * Math.sin(r); // 回転後x
    const ry = dx * Math.sin(r) + dy * Math.cos(r); // 回転後y
    return [Math.round((dev.x + rx) * 10) / 10, Math.round((dev.y + ry) * 10) / 10];
  }

  /* ---------- 器具ごとの端子（ローカル座標） ---------- */
  function localTerms(dev) {
    switch (dev.type) {
      case 'lamp':    return { B: [-9, 21], W: [9, 21] };
      case 'pilot':   return { a: [-7, 15], b: [7, 15] };
      case 'ceiling': return { B: [-10, 12], W: [10, 12] };
      case 'outlet':  return Object.assign({ B: [-8, -17], W: [8, -17] }, dev.e ? { E: [0, 18] } : {});
      case 'outlet3': return { R: [-12, -17], S: [0, -18], T: [12, -17], E: [0, 18] }; // 3P接地極付
      case 'sw':      return { a: [-22, 0], b: [22, 0] };
      case 'sw3':     return { '0': [-22, 0], '1': [22, -11], '3': [22, 11] };
      case 'sw2p':    return { a1: [-22, -12], b1: [22, -12], a2: [-22, 12], b2: [22, 12] };
      case 'ground':  return { t: [0, 0] };
      case 'point':   return { t: [0, 0] };
      case 'block':   return dev.terms || {};
      default:        return dev.terms || {};
    }
  }

  // 全器具の端子絶対座標マップを作る（"id.端子名" → [x,y]）
  function buildTermMap(prob) {
    const map = {}; // 端子名→座標
    (prob.devices || []).forEach(d => {
      const t = localTerms(d);
      for (const k in t) map[`${d.id}.${k}`] = toAbs(d, t[k]);
    });
    return map;
  }

  function resolvePt(p, map) {
    if (Array.isArray(p)) return p;
    if (map[p]) return map[p];
    console.warn('未定義の端子参照:', p);
    return [0, 0];
  }

  /* ---------- 器具の描画 ---------- */
  function drawDevice(g, d) {
    const grp = el('g', { class: 'dev', 'data-id': d.id }, g); // 器具グループ
    const tf = `translate(${d.x} ${d.y}) rotate(${d.rot || 0}) scale(${d.flip ? -1 : 1} 1)`; // 変換
    const s = el('g', { transform: tf }, grp); // 図形（回転される）
    const ink = '#222'; // 線の色
    switch (d.type) {
      case 'lamp':
        el('circle', { r: 22, fill: '#fff', stroke: ink, 'stroke-width': 2.5 }, s);
        text(grp, d.x, d.y + 1, 'R', { size: 20, bold: true });
        break;
      case 'pilot': {
        el('circle', { r: 15, fill: d.fill || '#fff', stroke: ink, 'stroke-width': 2.5 }, s);
        el('path', { d: 'M-10.6 -10.6 L10.6 10.6 M10.6 -10.6 L-10.6 10.6', stroke: ink, 'stroke-width': 2 }, s);
        break;
      }
      case 'ceiling':
        el('rect', { x: -24, y: -13, width: 48, height: 26, fill: '#fff', stroke: ink, 'stroke-width': 2.5 }, s);
        text(grp, d.x, d.y + 1, '( )', { size: 16, bold: true });
        break;
      case 'outlet':
      case 'outlet3': {
        el('circle', { r: 18, fill: '#fff', stroke: ink, 'stroke-width': 2.5 }, s);
        el('path', { d: 'M-18 0 A18 18 0 0 0 18 0 Z', fill: ink }, s); // 埋込形（下半分黒）
        el('path', { d: 'M-6 -11 V0 M6 -11 V0' + (d.type === 'outlet3' ? ' M0 -13 V0' : ''), stroke: ink, 'stroke-width': 3 }, s);
        break;
      }
      case 'sw':
        el('circle', { cx: -22, cy: 0, r: 4.5, fill: '#fff', stroke: ink, 'stroke-width': 2 }, s);
        el('circle', { cx: 22, cy: 0, r: 4.5, fill: '#fff', stroke: ink, 'stroke-width': 2 }, s);
        el('line', { x1: -18, y1: -2, x2: 17, y2: -14, stroke: ink, 'stroke-width': 2.5 }, s);
        break;
      case 'sw3':
        el('circle', { cx: -22, cy: 0, r: 4.5, fill: '#fff', stroke: ink, 'stroke-width': 2 }, s);
        el('circle', { cx: 22, cy: -11, r: 4.5, fill: '#fff', stroke: ink, 'stroke-width': 2 }, s);
        el('circle', { cx: 22, cy: 11, r: 4.5, fill: '#fff', stroke: ink, 'stroke-width': 2 }, s);
        el('line', { x1: -18, y1: -1, x2: 16, y2: -9, stroke: ink, 'stroke-width': 2.5 }, s);
        break;
      case 'sw2p':
        [-12, 12].forEach(yy => {
          el('circle', { cx: -22, cy: yy, r: 4.5, fill: '#fff', stroke: ink, 'stroke-width': 2 }, s);
          el('circle', { cx: 22, cy: yy, r: 4.5, fill: '#fff', stroke: ink, 'stroke-width': 2 }, s);
          el('line', { x1: -18, y1: yy - 2, x2: 17, y2: yy - 13, stroke: ink, 'stroke-width': 2.5 }, s);
        });
        el('line', { x1: 0, y1: -18, x2: 0, y2: 6, stroke: ink, 'stroke-width': 1.5, 'stroke-dasharray': '3 3' }, s);
        break;
      case 'ground':
        el('path', { d: 'M0 0 V16 M-16 16 H16 M-10 23 H10 M-4 30 H4', stroke: ink, 'stroke-width': 2.5, fill: 'none' }, s);
        break;
      case 'point':
        break;
      case 'block': {
        const w = d.w || 80, h = d.h || 50; // 幅・高さ
        el('rect', {
          x: -w / 2, y: -h / 2, width: w, height: h, rx: 4,
          fill: d.fillColor || '#fff', stroke: ink, 'stroke-width': 2,
          'stroke-dasharray': d.dashed ? '7 5' : null,
        }, s);
        if (d.coil) drawCoil(s, d);
        break;
      }
    }

    // 端子の小丸と端子名
    const lt = localTerms(d); // ローカル端子
    const showT = d.showTerms !== undefined ? d.showTerms : ['block', 'sw3'].includes(d.type);
    if (d.type === 'block') {
      for (const k in lt) {
        const [ax, ay] = toAbs(d, lt[k]);
        el('circle', { cx: ax, cy: ay, r: 4, fill: '#fff', stroke: ink, 'stroke-width': 1.8 }, grp);
      }
    }
    if (showT) {
      const tl = d.termLabels || {}; // 端子名ラベル位置の上書き
      for (const k in lt) {
        if (d.hideTerm && d.hideTerm.includes(k)) continue;
        const [ax, ay] = toAbs(d, lt[k]);
        const off = tl[k] || autoTermOffset(d, lt[k]);
        text(grp, ax + off[0], ay + off[1], (d.termNames && d.termNames[k]) || k, { size: 12, color: '#333', bold: true });
      }
    }
    // コンセントのW表示
    if ((d.type === 'outlet') && d.wmark !== false) {
      const [ax, ay] = toAbs(d, lt.W);
      const off = d.wOffset || [0, 0];
      const [cx, cy] = [d.x, d.y];
      const vx = ax - cx, vy = ay - cy; const L = Math.hypot(vx, vy) || 1;
      text(grp, ax + (vx / L) * 4 + off[0] + (vy !== 0 ? 10 : 0), ay + (vy / L) * 10 + off[1], 'W', { size: 11, color: '#c00018', bold: true });
    }
    // ランプレセプタクルの受金ねじ部表示
    if (d.type === 'lamp' && d.wmark !== false) {
      const [ax, ay] = toAbs(d, lt.W);
      const off = d.wOffset || [14, 0];
      text(grp, ax + off[0], ay + off[1], '受金', { size: 10, color: '#c00018', bold: true });
    }
    // 器具ラベル
    if (d.label) {
      const lo = d.labelAt || [0, -34]; // ラベル位置
      const lines = String(d.label).split('\n');
      lines.forEach((ln, i) => text(grp, d.x + lo[0], d.y + lo[1] + i * 15, ln, { size: d.labelSize || 13, bold: true, color: d.labelColor || '#7a0010', anchor: d.labelAnchor || 'middle' }));
    }
    if (d.inner) { // ブロック内部の文字
      String(d.inner).split('\n').forEach((ln, i, arr) =>
        text(grp, d.x, d.y + (i - (arr.length - 1) / 2) * 15, ln, { size: d.innerSize || 13, bold: true }));
    }
    return grp;
  }

  function autoTermOffset(d, p) {
    // 端子の外側方向にラベルを置く
    const [ax, ay] = toAbs(d, p);
    const vx = ax - d.x, vy = ay - d.y;
    if (Math.abs(vx) >= Math.abs(vy)) return [vx > 0 ? 12 : -12, vy === 0 ? -10 : (vy > 0 ? 6 : -6)];
    return [vx > 0 ? 9 : (vx < 0 ? -9 : 10), vy > 0 ? 14 : -14];
  }

  // 変圧器（端子台代用）用のコイル
  function drawCoil(s, d) {
    const w = (d.w || 80) - 24; // コイル幅
    const n = 4; const step = w / n; // 山の数
    const mk = (y, up) => {
      let p = `M${-w / 2} ${y}`;
      for (let i = 0; i < n; i++) p += ` a${step / 2} ${step / 2} 0 0 ${up ? 1 : 0} ${step} 0`;
      return p;
    };
    const cy = d.coilY || 0;
    el('path', { d: mk(cy - 5, true), stroke: '#222', 'stroke-width': 2, fill: 'none' }, s);
    el('path', { d: mk(cy + 5, false), stroke: '#222', 'stroke-width': 2, fill: 'none' }, s);
  }

  /* ---------- ボックス ---------- */
  function drawBox(g, b) {
    const grp = el('g', { class: 'box' }, g);
    if (b.type === 'circle') {
      el('circle', { cx: b.cx, cy: b.cy, r: b.r, fill: 'rgba(255,240,200,0.25)', stroke: '#444', 'stroke-width': 2, 'stroke-dasharray': '8 6' }, grp);
    } else {
      el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, fill: 'rgba(200,220,255,0.18)', stroke: '#444', 'stroke-width': 2, 'stroke-dasharray': '8 6' }, grp);
    }
    if (b.label) {
      const lx = b.lx !== undefined ? b.lx : (b.type === 'circle' ? b.cx : b.x + b.w / 2);
      const ly = b.ly !== undefined ? b.ly : (b.type === 'circle' ? b.cy - b.r - 12 : b.y - 12);
      String(b.label).split('\n').forEach((ln, i) => text(grp, lx, ly + i * 15, ln, { size: 13, bold: true, color: '#444' }));
    }
  }

  /* ---------- 電線 ---------- */
  function pathD(pts) {
    return pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
  }

  // 表示する色コードを決める（ステップ5前は tmp 色）
  function colorFor(w, step) {
    if (w.tmp && step < 5) return w.tmp;
    return w.c;
  }

  /* ---------- メイン描画 ---------- */
  // opts: { step: 1..5, animate: bool, highlight: bool }
  function render(svg, prob, opts) {
    const step = opts.step;           // 表示ステップ
    const animate = !!opts.animate;   // アニメーション有無
    const hl = opts.highlight !== false; // 現在ステップ強調
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', prob.viewBox || '0 0 1000 720');

    // 発光フィルタ
    const defs = el('defs', {}, svg);
    const f = el('filter', { id: 'glow', x: '-20%', y: '-20%', width: '140%', height: '140%' }, defs);
    el('feGaussianBlur', { stdDeviation: 3.5, result: 'b' }, f);
    const m = el('feMerge', {}, f); el('feMergeNode', { in: 'b' }, m); el('feMergeNode', { in: 'SourceGraphic' }, m);

    const vb = (prob.viewBox || '0 0 1000 720').split(/\s+/).map(Number); // ビューボックス
    el('rect', { x: vb[0], y: vb[1], width: vb[2], height: vb[3], fill: '#f6f1e7' }, svg); // 紙の背景

    const map = buildTermMap(prob); // 端子座標
    const gBox = el('g', {}, svg);
    const gGlow = el('g', {}, svg);
    const gWire = el('g', {}, svg);
    const gDev = el('g', {}, svg);
    const gJoint = el('g', {}, svg);
    const gLabel = el('g', {}, svg);

    (prob.boxes || []).forEach(b => { if ((b.step || 1) <= step) drawBox(gBox, b); });

    // 電線
    const newPaths = []; // 今回アニメーションさせるパス
    (prob.wires || []).forEach((w, idx) => {
      const ws = w.step || 1; // この電線のステップ
      if (ws > step) return;
      const pts = w.pts.map(p => resolvePt(p, map));
      const d = pathD(pts);
      const code = colorFor(w, step);
      const col = COLORS[code] || COLORS.B;
      const width = w.w || col.w;
      const isCur = hl && ws === step && step > 1;
      const isCurRecolor = hl && step === 5 && w.tmp && w.tmp !== w.c; // ステップ5で色が決まった線
      if (isCur || isCurRecolor) {
        el('path', { d, stroke: STEP_GLOW[step], 'stroke-width': width + 10, fill: 'none', opacity: 0.55, filter: 'url(#glow)', 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: 'glow' }, gGlow);
      }
      const parts = [];
      if (col.under) parts.push(el('path', { d, stroke: col.under, 'stroke-width': width + 2.5, fill: 'none', 'stroke-linejoin': 'round' }, gWire));
      parts.push(el('path', {
        d, stroke: col.stroke, 'stroke-width': width, fill: 'none', 'stroke-linejoin': 'round',
        'stroke-dasharray': col.dash || null,
        'data-wire': idx,
      }, gWire));
      if (w.dashed) parts.forEach(p => p.setAttribute('stroke-dasharray', '9 6'));
      if (animate && ws === step && step > 1 && !col.dash && !w.dashed) parts.forEach(p => newPaths.push({ p, order: w.order || 0, idx }));
      // 電線ラベル（色名など）
      if (w.label && (w.labelStep || ws) <= step) {
        const [lx, ly] = w.labelAt || midPoint(pts);
        text(gLabel, lx, ly, w.label, { size: w.labelSize || 13, bold: true, color: '#111', rot: w.labelRot, cls: 'wlabel' });
      }
    });

    (prob.devices || []).forEach(d => { if ((d.step || 1) <= step) drawDevice(gDev, d); });

    // 接続点
    (prob.joints || []).forEach(j => {
      if ((j.step || 2) > step) return;
      const [x, y] = resolvePt(j.at, map);
      const isConn = /^C/.test(j.mark || '');
      if (isConn) {
        el('rect', { x: x - 6, y: y - 6, width: 12, height: 12, rx: 2, fill: '#111', stroke: '#111' }, gJoint);
      } else {
        el('circle', { cx: x, cy: y, r: 6.5, fill: '#111' }, gJoint);
      }
      if (step >= 5 && j.mark) {
        const [ox, oy] = j.mo || [14, -14]; // 刻印ラベルのオフセット
        const lbl = markLabel(j.mark);
        const bw = Math.max(18, lbl.length * 12 + 6);
        const gm = el('g', { class: 'mark' + (hl ? ' pop' : '') }, gJoint);
        el('rect', { x: x + ox - bw / 2, y: y + oy - 10, width: bw, height: 20, rx: 10, fill: isConn ? '#2b2b2b' : '#c00018', stroke: '#fff', 'stroke-width': 1.5 }, gm);
        text(gm, x + ox, y + oy + 1, lbl, { size: 12, bold: true, color: '#fff' });
      }
    });

    // 自由ラベル
    (prob.labels || []).forEach(l => {
      if ((l.step || 1) > step) return;
      text(gLabel, l.x, l.y, l.t, { size: l.size || 13, bold: l.bold !== false, color: l.color || '#333', rot: l.rot, anchor: l.anchor });
    });

    // 描画アニメーション
    if (newPaths.length) {
      newPaths.sort((a, b) => a.order - b.order || a.idx - b.idx);
      const orders = [...new Set(newPaths.map(n => n.order * 1000 + n.idx))]; // 線ごとの順番
      newPaths.forEach(n => {
        const L = n.p.getTotalLength();
        const k = orders.indexOf(n.order * 1000 + n.idx); // 何本目か
        n.p.style.strokeDasharray = L;
        n.p.style.strokeDashoffset = L;
        n.p.getBoundingClientRect();
        n.p.style.transition = `stroke-dashoffset ${Math.min(1.2, 0.35 + L / 900)}s ease ${k * 0.45}s`;
        requestAnimationFrame(() => { n.p.style.strokeDashoffset = 0; });
        n.p.addEventListener('transitionend', () => { n.p.style.strokeDasharray = ''; }, { once: true });
      });
    }
  }

  function markLabel(m) {
    return ({ C2: '差込2', C3: '差込3', C4: '差込4', C5: '差込5' })[m] || m;
  }

  function midPoint(pts) {
    // 最長区間の中点
    let best = 0, bi = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      if (L > best) { best = L; bi = i; }
    }
    const a = pts[bi], b = pts[bi + 1] || a;
    return [(a[0] + b[0]) / 2 + (a[1] === b[1] ? 0 : 12), (a[1] + b[1]) / 2 + (a[1] === b[1] ? -10 : 0)];
  }

  // スリーブ・コネクタの集計
  function tally(prob) {
    const t = {}; // 種類→個数
    (prob.joints || []).forEach(j => { if (j.mark) t[j.mark] = (t[j.mark] || 0) + 1; });
    return t;
  }

  return { render, tally, COLORS, STEP_NAMES, markLabel, buildTermMap };
})();
