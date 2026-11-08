/* =========================================================
 * 複線図 METAL 道場  アプリ本体（PC⇔スマホ リアルタイム連動対応）
 * ========================================================= */
(() => {
  const $ = id => document.getElementById(id); // 要素取得の短縮
  const STORE_KEY = 'fukusen_metal_progress_v1'; // localStorage のキー
  const progress = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); // 習得記録 { "1": [1,2,..] }
  const CLIENT_ID = 'c_' + Math.random().toString(36).slice(2, 9); // 自端末の識別ID
  const DEFAULT_LAN_URL = 'https://ttteraguchi888-jpg.github.io/denkoji1-app/fukusen.html'; // 既定のスマホ接続URL（GitHub Pages 24時間公開URL）
  const API_BASE = (location.protocol.startsWith('http') && !location.hostname.endsWith('github.io')) ? location.origin : 'http://localhost:8765'; // 連動サーバーURL

  let curNo = 0;         // 表示中の問題番号（0 = 基本ルール）
  let curStep = 1;       // 表示中のステップ
  let playTimer = null;  // 自動再生タイマー
  let suppressPush = false; // リモート受信中のエコーバック抑止フラグ
  let serverOnline = false; // 連動サーバー接続状態

  const DOCS = [ // 公式資料ボタン（ファイル接尾辞, 表示名）
    ['haisenzu', '配線図（問題）'], ['jouken', '施工条件'],
    ['fukusen', '公式 複線図'], ['gainen', '完成概念図'],
    ['sakuhin', '正解作品例（写真）'], ['zairyo', '支給材料'],
  ];

  function save() { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); }
  function doneSteps(no) { return progress[no] || []; }
  function img(no, kind) { return `fukusen/img/no${no}_${kind}.png`; }

  /* ---------- サーバーへ現在の状態を送信（PC⇔スマホ同期） ---------- */
  function pushState() {
    if (suppressPush || !serverOnline) return;
    fetch(`${API_BASE}/api/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        no: curNo,
        step: curStep,
        progress,
        sender: CLIENT_ID,
      }),
    }).catch(() => {});
  }

  /* ---------- ナビ ---------- */
  function buildNav() {
    const nav = $('nav');
    nav.innerHTML = '';
    const b0 = document.createElement('button');
    b0.textContent = '📖 基本ルール';
    b0.onclick = () => go(0);
    if (curNo === 0) b0.classList.add('active');
    nav.appendChild(b0);
    for (let n = 1; n <= 10; n++) {
      const b = document.createElement('button'); // 問題ボタン
      const ds = doneSteps(n).length; // 習得ステップ数
      b.innerHTML = `No.${n}<span class="pips">${'■'.repeat(ds)}${'□'.repeat(5 - ds)}</span>`;
      if (!PROBLEMS[n]) b.title = 'データ準備中';
      if (curNo === n) b.classList.add('active');
      b.onclick = () => go(n);
      nav.appendChild(b);
    }
  }

  /* ---------- ページ切替 ---------- */
  function go(no, step, fromRemote = false) {
    stopPlay();
    curNo = no;
    location.hash = no ? `no${no}` : 'basic';
    buildNav();
    if (!no) {
      $('page-basic').classList.remove('hidden');
      $('page-prob').classList.add('hidden');
      $('mob-bar').classList.add('hidden');
      BASIC.render($('page-basic'), go);
      if (!fromRemote) { window.scrollTo(0, 0); pushState(); }
      return;
    }
    $('page-basic').classList.add('hidden');
    $('page-prob').classList.remove('hidden');
    $('mob-bar').classList.remove('hidden');
    const p = PROBLEMS[no]; // 問題データ
    $('p-title').textContent = p ? p.title : `候補問題 No.${no}`;
    $('p-sub').textContent = p ? p.subtitle || '' : 'この問題のデータは準備中です';
    $('p-power').textContent = p ? p.power || '' : '';
    $('p-tansen').src = img(no, 'tansen');
    $('official-img').src = img(no, 'fukusen');

    const docs = $('p-docs');
    docs.innerHTML = '';
    DOCS.forEach(([k, name]) => {
      const b = document.createElement('button');
      b.className = 'btn'; b.textContent = name;
      b.onclick = () => openLB(img(no, k));
      docs.appendChild(b);
    });
    $('p-cond').innerHTML = (p && p.conditions || []).map(s => `<li>${s}</li>`).join('');
    $('p-points').innerHTML = (p && p.points || []).map(s => `<li>${s}</li>`).join('');
    buildLegend();
    setStep(step || 1, true, fromRemote);
    if (!fromRemote) window.scrollTo(0, 0);
  }

  /* ---------- ステップ ---------- */
  function buildStepbar() {
    const bar = $('stepbar');
    bar.innerHTML = '';
    const ds = doneSteps(curNo);
    for (let s = 1; s <= 5; s++) {
      const d = document.createElement('div'); // ステップボタン
      d.className = 'step' + (s < curStep ? ' done' : '') + (s === curStep ? ' cur' : '');
      d.innerHTML = `<b>STEP ${s}</b><span>${FK.STEP_NAMES[s]}</span>${ds.includes(s) ? '<i class="ok">✔</i>' : ''}`;
      d.onclick = () => { stopPlay(); setStep(s, true); };
      bar.appendChild(d);
    }
  }

  function setStep(s, animate, fromRemote = false) {
    curStep = Math.max(1, Math.min(5, s));
    const p = PROBLEMS[curNo];
    buildStepbar();
    $('btn-prev').disabled = curStep === 1;
    $('btn-next').disabled = curStep === 5;
    $('mob-prev').disabled = curStep === 1;
    $('mob-next').disabled = curStep === 5;
    $('mob-step').textContent = `No.${curNo}  STEP ${curStep} / 5`;
    const svg = $('svg');
    if (p) {
      FK.render(svg, p, { step: curStep, animate, highlight: $('chk-hl').checked });
    } else {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      svg.setAttribute('viewBox', '0 0 1000 300');
      svg.innerHTML = '<rect width="1000" height="300" fill="#f6f1e7"/><text x="500" y="150" text-anchor="middle" font-size="28" fill="#7a0010">データ準備中（右の「公式 複線図」を参照）</text>';
    }
    // 解説
    $('ex-title').textContent = `STEP ${curStep}：${FK.STEP_NAMES[curStep]}`;
    const lines = (p && p.steps && p.steps[curStep]) || [];
    $('ex-list').innerHTML = lines.map(s => `<li>${s}</li>`).join('');
    // 集計（ステップ5）
    const tl = $('ex-tally');
    if (p && curStep === 5) {
      const t = FK.tally(p);
      const order = ['○', '小', '中', '大', 'C2', 'C3', 'C4', 'C5'];
      const keys = Object.keys(t).sort((a, b) => order.indexOf(a) - order.indexOf(b));
      tl.innerHTML = '<div class="tally">' + keys.map(k =>
        `<div>${/^C/.test(k) ? '差込形コネクタ ' + k.slice(1) + '本用' : 'リングスリーブ 刻印「' + k + '」'}<b>×${t[k]}</b></div>`).join('') + '</div>';
    } else tl.innerHTML = '';
    $('chk-self').checked = doneSteps(curNo).includes(curStep);
    updateMastery();
    if (!fromRemote) pushState();
  }

  function updateMastery() {
    const n = doneSteps(curNo).length;
    $('p-mastery').innerHTML = `<div>習得度 <b style="color:var(--red2)">${n}/5</b> ステップ</div><div class="bar"><i style="width:${n * 20}%"></i></div>`;
  }

  /* ---------- 凡例 ---------- */
  function buildLegend() {
    const items = ['W', 'B', 'R', 'G', 'Y', 'X', 'P', 'K'];
    let h = '<h3>電線の色（凡例）</h3><div class="items">';
    items.forEach(k => {
      const c = FK.COLORS[k];
      h += `<div class="it"><svg viewBox="0 0 46 14">${c.under ? `<line x1="2" y1="7" x2="44" y2="7" stroke="${c.under}" stroke-width="${c.w + 2.5}"/>` : ''}<line x1="2" y1="7" x2="44" y2="7" stroke="${c.stroke}" stroke-width="${Math.min(c.w, 8)}" ${c.dash ? `stroke-dasharray="6 4"` : ''}/></svg>${c.name}</div>`;
    });
    h += `<div class="it"><svg viewBox="0 0 46 14"><circle cx="23" cy="7" r="5" fill="#111"/></svg>リングスリーブ接続</div>`;
    h += `<div class="it"><svg viewBox="0 0 46 14"><rect x="17" y="1" width="12" height="12" rx="2" fill="#111"/></svg>差込形コネクタ接続</div>`;
    h += `<div class="it"><svg viewBox="0 0 46 14"><rect x="8" y="0" width="30" height="14" rx="7" fill="#c00018"/><text x="23" y="10.5" font-size="10" fill="#fff" text-anchor="middle" font-weight="bold">小</text></svg>スリーブ刻印（STEP5）</div>`;
    h += '</div>';
    $('legend').innerHTML = h;
  }

  /* ---------- 自動再生 ---------- */
  function play() {
    if (playTimer) { stopPlay(); return; }
    $('btn-play').textContent = '■ 停止';
    setStep(1, true);
    playTimer = setInterval(() => {
      if (curStep >= 5) { stopPlay(); return; }
      setStep(curStep + 1, true);
    }, 4200);
  }
  function stopPlay() {
    if (playTimer) clearInterval(playTimer);
    playTimer = null;
    $('btn-play').textContent = '▶▶ 自動再生';
  }

  /* ---------- 拡大表示 ---------- */
  function openLB(src) { $('lb-img').src = src; $('lightbox').classList.remove('hidden'); }

  /* ---------- QRコード＆リアルタイム連動 ---------- */
  function renderQR(url) {
    const clean = (url || DEFAULT_LAN_URL).trim(); // QR化するURL
    try {
      $('qr-svg-box').innerHTML = QR.toSVG(clean, 210);
    } catch (e) {
      $('qr-svg-box').innerHTML = '<div style="color:#c00;padding:20px">URLが長すぎます</div>';
    }
  }

  function applyRemoteState(st) {
    if (!st) return;
    suppressPush = true;
    try {
      // 習得度データのマージ（どちらの端末でチェックしても統合される）
      if (st.progress && typeof st.progress === 'object') {
        for (const k of Object.keys(st.progress)) {
          const merged = new Set([...(progress[k] || []), ...(st.progress[k] || [])]);
          progress[k] = [...merged].sort();
        }
        save();
        buildNav();
        if (curNo) { buildStepbar(); updateMastery(); $('chk-self').checked = doneSteps(curNo).includes(curStep); }
      }
      // リモコン連動モードがONなら、問題番号・ステップも追従
      if ($('chk-remote') && $('chk-remote').checked && st.sender && st.sender !== CLIENT_ID) {
        if (typeof st.no === 'number' && st.no !== curNo) {
          go(st.no, st.step || 1, true);
        } else if (curNo && typeof st.step === 'number' && st.step !== curStep) {
          setStep(st.step, true, true);
        }
      }
    } finally {
      suppressPush = false;
    }
  }

  function updateSyncBadge(online, count = 1) {
    serverOnline = online;
    const dot = $('sync-dot');
    const stText = $('sync-status-text');
    if (online) {
      dot.classList.add('online');
      stText.innerHTML = `🟢 <b>連動サーバー接続OK</b>（現在 <b>${count}台</b> 接続中）`;
    } else {
      dot.classList.add('online');
      stText.innerHTML = `🌍 <b>GitHub Pages 公開接続OK（外出先・4G/5G対応）</b><br><span style="font-size:0.8rem;color:var(--dim)">※パソコンの電源がOFFでも、上のQRコードで24時間いつでもスマホで学習できます</span>`;
    }
  }

  function initSync() {
    renderQR($('qr-url-input').value);
    fetch(`${API_BASE}/api/info`)
      .then(r => r.json())
      .then(info => {
        if (info && info.url) {
          $('qr-url-input').value = info.url;
          renderQR(info.url);
        }
        updateSyncBadge(true, info.clients || 1);
        if (info.state) applyRemoteState(info.state);

        // SSEストリーム購読
        const es = new EventSource(`${API_BASE}/api/events`); // イベントストリーム
        es.onmessage = ev => {
          try {
            const msg = JSON.parse(ev.data); // 受信メッセージ
            if (msg.url) {
              $('qr-url-input').value = msg.url;
              renderQR(msg.url);
            }
            if (typeof msg.clients === 'number') updateSyncBadge(true, msg.clients);
            if (msg.state) applyRemoteState(msg.state);
          } catch (_) {}
        };
        es.onerror = () => updateSyncBadge(false);
      })
      .catch(() => {
        updateSyncBadge(false);
      });
  }

  /* ---------- イベント ---------- */
  $('btn-prev').onclick = () => { stopPlay(); setStep(curStep - 1, false); };
  $('btn-next').onclick = () => { stopPlay(); setStep(curStep + 1, true); };
  $('mob-prev').onclick = () => { stopPlay(); setStep(curStep - 1, false); };
  $('mob-next').onclick = () => { stopPlay(); setStep(curStep + 1, true); };
  $('btn-play').onclick = play;
  $('btn-replay').onclick = () => { stopPlay(); setStep(curStep, true); };
  $('chk-hl').onchange = () => setStep(curStep, false);
  $('chk-cmp').onchange = e => {
    $('official-box').classList.toggle('hidden', !e.target.checked);
    $('canvas-wrap').classList.toggle('cmp', e.target.checked);
  };
  $('chk-self').onchange = e => {
    const arr = new Set(doneSteps(curNo)); // 習得済みステップ
    e.target.checked ? arr.add(curStep) : arr.delete(curStep);
    progress[curNo] = [...arr].sort();
    save(); buildNav(); buildStepbar(); updateMastery();
    pushState();
  };

  // QRモーダル開閉
  $('btn-qr').onclick = () => {
    renderQR($('qr-url-input').value);
    $('qr-modal').classList.remove('hidden');
  };
  $('qr-close').onclick = () => $('qr-modal').classList.add('hidden');
  $('qr-modal').onclick = () => $('qr-modal').classList.add('hidden');
  $('qr-url-input').oninput = e => renderQR(e.target.value);
  $('btn-copy-url').onclick = () => {
    navigator.clipboard.writeText($('qr-url-input').value).then(() => {
      $('btn-copy-url').textContent = '✔ コピー完了';
      setTimeout(() => { $('btn-copy-url').textContent = 'コピー'; }, 1500);
    });
  };

  $('lightbox').onclick = () => $('lightbox').classList.add('hidden');
  document.addEventListener('click', e => {
    if (e.target.classList && e.target.classList.contains('zoomable')) openLB(e.target.src);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      $('lightbox').classList.add('hidden');
      $('qr-modal').classList.add('hidden');
      return;
    }
    if (!curNo || !$('qr-modal').classList.contains('hidden')) return;
    if (e.key === 'ArrowRight') { stopPlay(); setStep(curStep + 1, true); }
    if (e.key === 'ArrowLeft') { stopPlay(); setStep(curStep - 1, false); }
  });

  /* ---------- 起動 ---------- */
  const m = location.hash.match(/no(\d+)(?:s(\d))?/); // URLハッシュ（#no3 / #no3s5）
  if (m) go(+m[1], m[2] ? +m[2] : 1); else go(0);
  initSync();
  if (location.search.includes('qr=1') || location.hash.includes('qr')) $('btn-qr').click();
})();
