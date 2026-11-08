/* =========================================================
 * 軽量QRコード生成（SVG出力・外部ライブラリ不要）
 * Byteモード / 誤り訂正レベルL / Version 1〜6 対応
 * ========================================================= */
const QR = (() => {
  // GF(256) 指数・対数テーブル（原始多項式 0x11d）
  const EXP = new Uint8Array(512); // 指数表
  const LOG = new Uint8Array(256); // 対数表
  (() => {
    let x = 1; // 生成元
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  // Version 1〜6（ECCレベルL）の仕様: [総コード語数, ECコード語数, アライメント座標]
  const VERS = [
    null,
    [26,  7, []],
    [44, 10, [6, 18]],
    [70, 15, [6, 22]],
    [100, 20, [6, 26]],
    [134, 26, [6, 30]],
    [172, 18, [6, 34]], // V6-Lは2ブロック(各86語中EC18語)
  ];

  // Reed-Solomon 誤り訂正コード語を計算する
  function rsEncode(data, ecLen) {
    let gen = [1]; // 生成多項式
    for (let i = 0; i < ecLen; i++) {
      const next = new Array(gen.length + 1).fill(0); // 次の多項式
      for (let j = 0; j < gen.length; j++) {
        next[j] ^= gen[j];
        next[j + 1] ^= EXP[LOG[gen[j]] + i];
      }
      gen = next;
    }
    const res = new Uint8Array(ecLen); // 剰余レジスタ
    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ res[0]; // 先頭係数
      for (let j = 0; j < ecLen - 1; j++) res[j] = res[j + 1];
      res[ecLen - 1] = 0;
      if (factor !== 0) {
        for (let j = 0; j < ecLen; j++) res[j] ^= EXP[LOG[gen[j + 1]] + LOG[factor]];
      }
    }
    return res;
  }

  // 文字列からQRマトリクスを生成する
  function makeMatrix(str) {
    const bytes = new TextEncoder().encode(str); // UTF-8バイト列
    let ver = 1; // 選択されたバージョン
    while (ver <= 5 && bytes.length + 2 > VERS[ver][0] - VERS[ver][1]) ver++;
    const [totalCw, ecCw, align] = VERS[ver]; // バージョン仕様
    const dataCw = totalCw - ecCw; // データコード語数

    // ビット列の組み立て（Byteモード = 0100）
    const bits = []; // ビット配列
    const pushBits = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
    };
    pushBits(0b0100, 4);
    pushBits(bytes.length, 8);
    for (const b of bytes) pushBits(b, 8);
    for (let i = 0; i < 4 && bits.length < dataCw * 8; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    const data = new Uint8Array(dataCw); // データコード語配列
    for (let i = 0; i < bits.length / 8; i++) {
      let v = 0;
      for (let b = 0; b < 8; b++) v = (v << 1) | bits[i * 8 + b];
      data[i] = v;
    }
    const pads = [0xec, 0x11]; // 埋め草コード語
    for (let i = bits.length / 8, p = 0; i < dataCw; i++, p ^= 1) data[i] = pads[p];

    const ec = rsEncode(data, ecCw); // 誤り訂正コード語
    const codewords = new Uint8Array(totalCw); // 全コード語
    codewords.set(data, 0);
    codewords.set(ec, dataCw);

    const size = ver * 4 + 17; // マトリクスの一辺サイズ
    const mat = Array.from({ length: size }, () => new Int8Array(size)); // 盤面（0/1）
    const rsv = Array.from({ length: size }, () => new Uint8Array(size)); // 機能パターン予約フラグ

    // ファインダパターン配置関数
    const putFinder = (r0, c0) => {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const rr = r0 + r, cc = c0 + c;
          if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
          const on = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                     (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                     (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          mat[rr][cc] = on ? 1 : 0;
          rsv[rr][cc] = 1;
        }
      }
    };
    putFinder(0, 0);
    putFinder(0, size - 7);
    putFinder(size - 7, 0);

    // アライメントパターン配置
    for (const r0 of align) {
      for (const c0 of align) {
        if (rsv[r0][c0]) continue;
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            const on = Math.max(Math.abs(r), Math.abs(c)) !== 1;
            mat[r0 + r][c0 + c] = on ? 1 : 0;
            rsv[r0 + r][c0 + c] = 1;
          }
        }
      }
    }

    // タイミングパターン
    for (let i = 8; i < size - 8; i++) {
      if (!rsv[6][i]) { mat[6][i] = (i % 2 === 0) ? 1 : 0; rsv[6][i] = 1; }
      if (!rsv[i][6]) { mat[i][6] = (i % 2 === 0) ? 1 : 0; rsv[i][6] = 1; }
    }

    // ダークモジュールとフォーマット領域予約
    mat[size - 8][8] = 1; rsv[size - 8][8] = 1;
    for (let i = 0; i < 9; i++) {
      if (i < size) { rsv[8][i] = 1; rsv[i][8] = 1; }
    }
    for (let i = 0; i < 8; i++) {
      rsv[8][size - 1 - i] = 1;
      rsv[size - 1 - i][8] = 1;
    }

    // データビット配置（ジグザグ走査）
    let bitIdx = 0; // 現在のビット位置
    const totalBits = codewords.length * 8; // 総ビット数
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        const r = ((right + 1) & 2) === 0 ? size - 1 - vert : vert; // 行番号
        for (let j = 0; j < 2; j++) {
          const c = right - j; // 列番号
          if (rsv[r][c]) continue;
          let bit = 0;
          if (bitIdx < totalBits) {
            bit = (codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1;
            bitIdx++;
          }
          // マスクパターン0: (r + c) % 2 === 0
          if ((r + c) % 2 === 0) bit ^= 1;
          mat[r][c] = bit;
        }
      }
    }

    // フォーマット情報（ECCレベルL = 01, マスク0 = 000 → BCH符号 0x77c4）
    const fmt = 0x77c4; // フォーマットビット列
    const f1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
    const f2 = [[size-1,8],[size-2,8],[size-3,8],[size-4,8],[size-5,8],[size-6,8],[size-7,8],[8,size-8],[8,size-7],[8,size-6],[8,size-5],[8,size-4],[8,size-3],[8,size-2],[8,size-1]];
    for (let i = 0; i < 15; i++) {
      const b = (fmt >>> i) & 1;
      mat[f1[i][0]][f1[i][1]] = b;
      mat[f2[i][0]][f2[i][1]] = b;
    }
    return mat;
  }

  // SVG文字列を返す
  function toSVG(text, sizePx = 220) {
    const mat = makeMatrix(text); // QRマトリクス
    const n = mat.length; // モジュール数
    const margin = 3; // 余白モジュール数
    const total = n + margin * 2; // 全体サイズ
    let d = ''; // SVGパス文字列
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (mat[r][c]) d += `M${c + margin},${r + margin}h1v1h-1z`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#ffffff"/><path d="${d}" fill="#000000"/></svg>`;
  }

  return { toSVG };
})();
