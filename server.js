/* =========================================================
 * 複線図 METAL 道場 スマホ連動サーバー (Node.js 標準機能のみ)
 * ・Wi-Fi直結 (LAN) と インターネットトンネル (HTTPS) のハイブリッド対応
 * ・ファイアウォールやWi-Fi設定に邪魔されず、4G/5G回線からでも100%接続可能！
 * ・問題番号・ステップ・習得度チェックをPC⇔スマホ間でリアルタイム双方向同期
 * ========================================================= */
const http = require('http'); // HTTPサーバーモジュール
const fs = require('fs');     // ファイルシステムモジュール
const path = require('path'); // パス操作モジュール
const os = require('os');     // OSネットワーク情報モジュール
const { spawn } = require('child_process'); // トンネル起動用プロセスモジュール

const PORT = Number(process.env.PORT) || 8765; // 待受ポート番号
const ROOT = __dirname; // 公開ルートディレクトリ
const STATE_FILE = path.join(ROOT, 'fukusen_sync.json'); // 同期状態の保存先

// 共有ステート（習得度・現在の問題番号・ステップ）
let syncState = {
  no: 0,           // 現在表示中の問題番号（0=基本ルール, 1〜10）
  step: 1,         // 現在のステップ（1〜5）
  progress: {},    // 習得済みステップ記録 { "1": [1,2,3], ... }
  updatedAt: Date.now(), // 最終更新時刻
};

let tunnelBaseUrl = ''; // 外部トンネルURL（https://xxxx.lhr.life）

// 保存済みデータがあれば読み込む
try {
  if (fs.existsSync(STATE_FILE)) {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); // 保存済みJSON
    if (saved && typeof saved === 'object') syncState = Object.assign(syncState, saved);
  }
} catch (e) {
  console.warn('状態ファイルの読み込みをスキップしました:', e.message);
}

// ローカルIPv4アドレス一覧を取得する
function getLocalIPs() {
  const nets = os.networkInterfaces(); // ネットワークインターフェース一覧
  const ips = []; // 検出されたIPアドレス配列
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) {
        ips.push(net.address);
      }
    }
  }
  return ips.length ? ips : ['127.0.0.1'];
}

// 現在の接続情報オブジェクトを組み立てる
function buildInfo() {
  const ips = getLocalIPs(); // LAN内IP一覧
  const lanUrl = `http://${ips[0]}:${PORT}/fukusen.html`; // Wi-Fi接続URL
  const pubUrl = tunnelBaseUrl ? `${tunnelBaseUrl}/fukusen.html` : ''; // どこでも接続URL
  return {
    ips,
    port: PORT,
    url: pubUrl || lanUrl,
    publicUrl: pubUrl,
    lanUrl,
    clients: clients.size,
    state: syncState,
  };
}

// SSE（Server-Sent Events）接続中のクライアント一覧
const clients = new Set(); // 接続中レスポンスの集合

function broadcast(payload) {
  const msg = `data: ${JSON.stringify(payload)}\n\n`; // SSE送信文字列
  for (const res of clients) {
    try { res.write(msg); } catch (_) { clients.delete(res); }
  }
}

// MIMEタイプ辞書
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.pdf':  'application/pdf',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  // CORSヘッダー（ローカルのfile://からAPIを叩いた場合にも応答できるようにする）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`); // リクエストURL
  const pathname = decodeURIComponent(urlObj.pathname); // デコード済みパス

  // 1) サーバー情報・接続URL取得 API
  if (pathname === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(buildInfo()));
    return;
  }

  // 2) SSE リアルタイム同期ストリーム
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    clients.add(res);
    // 接続直後に現在の状態と接続台数・URLを通知
    const info = buildInfo(); // 接続情報
    res.write(`data: ${JSON.stringify({ type: 'init', state: syncState, clients: clients.size, url: info.url, publicUrl: info.publicUrl, lanUrl: info.lanUrl })}\n\n`);
    broadcast({ type: 'clients', clients: clients.size, url: info.url, publicUrl: info.publicUrl, lanUrl: info.lanUrl });
    req.on('close', () => {
      clients.delete(res);
      broadcast({ type: 'clients', clients: clients.size });
    });
    return;
  }

  // 3) ステート更新 API（問題切替・ステップ移動・習得度チェック）
  if (pathname === '/api/state' && req.method === 'POST') {
    let body = ''; // 受信ボディ
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const patch = JSON.parse(body || '{}'); // 更新内容
        if (typeof patch.no === 'number') syncState.no = patch.no;
        if (typeof patch.step === 'number') syncState.step = patch.step;
        if (patch.progress && typeof patch.progress === 'object') {
          syncState.progress = patch.progress;
        }
        syncState.updatedAt = Date.now();
        syncState.sender = patch.sender || '';
        fs.writeFileSync(STATE_FILE, JSON.stringify(syncState, null, 2), 'utf8');
        broadcast({ type: 'sync', state: syncState, clients: clients.size });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, state: syncState }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // 4) 静的ファイル配信
  let relPath = pathname === '/' ? '/fukusen.html' : pathname; // 相対パス
  const filePath = path.normalize(path.join(ROOT, relPath)); // 実ファイルパス
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase(); // 拡張子
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

// ファイアウォールやWi-Fi設定をバイパスするHTTPSトンネルを自動起動する
function startTunnel() {
  const sshBin = 'C:\\Windows\\System32\\OpenSSH\\ssh.exe'; // Windows標準SSHクライアント
  if (!fs.existsSync(sshBin)) return;
  const proc = spawn(sshBin, [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ExitOnForwardFailure=yes',
    '-R', `80:127.0.0.1:${PORT}`,
    'nokey@localhost.run',
  ], { windowsHide: true });

  const onOut = chunk => {
    const str = chunk.toString('utf8'); // 出力テキスト
    const m = str.match(/https:\/\/[a-z0-9-]+\.lhr\.life/i); // トンネルURL抽出
    if (m && m[0] !== tunnelBaseUrl) {
      tunnelBaseUrl = m[0];
      const info = buildInfo();
      console.log(` 🌐 どこでも接続URL (4G/5G・Wi-Fi両対応) : ${info.publicUrl}`);
      broadcast({ type: 'tunnel', url: info.url, publicUrl: info.publicUrl, lanUrl: info.lanUrl, clients: clients.size });
    }
  };
  proc.stdout.on('data', onOut);
  proc.stderr.on('data', onOut);
  proc.on('close', () => {
    tunnelBaseUrl = '';
    setTimeout(startTunnel, 3000);
  });
}

// 30秒ごとにSSEハートビートを送信（トンネルやスマホの切断防止）
setInterval(() => {
  for (const res of clients) {
    try { res.write(': ping\n\n'); } catch (_) { clients.delete(res); }
  }
}, 25000);

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPs(); // LAN内IP
  const mainUrl = `http://${ips[0]}:${PORT}/fukusen.html`; // スマホ接続用URL
  console.log('====================================================');
  console.log(' 🤘 複線図 METAL 道場 スマホ連動サーバー起動完了！');
  console.log(` 📱 Wi-Fi接続URL  : ${mainUrl}`);
  console.log(` 💻 PC接続URL     : http://localhost:${PORT}/fukusen.html`);
  console.log('====================================================');
  startTunnel();
});
