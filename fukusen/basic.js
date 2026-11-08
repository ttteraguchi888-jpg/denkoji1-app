/* =========================================================
 * 基本ルールページ（複線図の描き方・スリーブ・欠陥）
 * ========================================================= */
const BASIC = (() => {
  function render(root, go) {
    let cards = ''; // 問題カードのHTML
    for (let n = 1; n <= 10; n++) {
      const p = PROBLEMS[n]; // 問題データ
      cards += `<div class="probcard" data-no="${n}">
        <img src="fukusen/img/no${n}_tansen.png" alt="No.${n} 単線図">
        <h4>No.${n}</h4><p>${p ? p.subtitle : '準備中'}</p></div>`;
    }
    root.innerHTML = `
    <div class="hero">
      <h2>🤘 複線図は「5つの手順」で必ず描ける 🤘</h2>
      <p>単線図を見たら、毎回同じ順番で描く。迷ったらこの順番に戻る。それが合格への最短ルート。</p>
    </div>

    <div class="grid2">
      <div class="card">
        <h3>複線図 5ステップ（この順番で描く）</h3>
        <ol class="five">
          <li><b>器具を配置</b><br>単線図と同じ位置に、電源・器具・ジョイントボックス・スイッチを描く。スイッチと点滅させる負荷の記号（イ・ロ…）を確認。</li>
          <li><b>接地側（白・W）</b>を、<b>スイッチ以外</b>の全負荷とコンセントへつなぐ。<br>ランプは<b>受金ねじ部</b>、コンセントは<b>W表示側</b>。</li>
          <li><b>非接地側（黒・B）</b>を、<b>スイッチとコンセント</b>へつなぐ。<br>取付枠でスイッチとコンセントが一緒なら<b>渡り線</b>。</li>
          <li><b>スイッチから対応する負荷へ</b>（返り線）。<br>「イ」のスイッチ → 「イ」の負荷。3路は 0＝電源/負荷、1・3＝相互間。</li>
          <li><b>色分け・スリーブ刻印・アース（緑）</b>で仕上げ。<br>ケーブルの心線色を割り当て、接続点ごとに本数を数えて刻印を決める。接地線は緑。</li>
        </ol>
      </div>

      <div class="card">
        <h3>リングスリーブの選び方（刻印）</h3>
        <table class="tbl">
          <tr><th>刻印</th><th>1.6mm のみ</th><th>2.0mm のみ</th><th>2.0mm と 1.6mm の混在</th></tr>
          <tr><td class="mk">○（小）</td><td>2本</td><td>―</td><td>―</td></tr>
          <tr><td class="mk">小（小）</td><td>3〜4本</td><td>2本</td><td>2.0×1 ＋ 1.6×1〜2</td></tr>
          <tr><td class="mk">中（中）</td><td>5〜6本</td><td>3〜4本</td><td>2.0×1＋1.6×3〜5<br>2.0×2＋1.6×1〜3<br>2.0×3＋1.6×1</td></tr>
        </table>
        <p class="dim" style="font-size:.85rem">※ 1.6mm×2本だけ「○」。それ以外の小スリーブは「小」で圧着。サイズ（小/中）と刻印の両方を間違えない。<br>
        ※ 差込形コネクタは、つなぐ本数と同じ穴数のもの（2本用・3本用・4本用）。</p>

        <h3 style="margin-top:14px">色のお約束</h3>
        <ul class="list">
          <li><b>白</b>：接地側電線（N相・o相・v相など施工条件で指定）。ランプレセプタクルの<b>受金ねじ部</b>、コンセントの<b>W</b>端子。</li>
          <li><b>黒</b>：非接地側電線（施工条件で指定されることが多い）。</li>
          <li><b>緑</b>：接地線（E）。</li>
          <li><b>色自由</b>：施工条件で指定がない返り線・3路スイッチ相互間など（公式解答の水色線）。</li>
          <li>3相回路の相色（赤・白・黒）は<b>必ず施工条件で確認</b>。</li>
        </ul>
      </div>
    </div>

    <div class="grid2">
      <div class="card">
        <h3>⚠️ 一発で不合格になる「欠陥」の代表例</h3>
        <ul class="list">
          <li><b>未完成</b>：未結線・未接続、取付枠を使わない、指定の材料を使わない。</li>
          <li><b>誤結線・誤接続</b>：複線図どおりでない、スイッチと負荷の組合せ違い。</li>
          <li><b>色別の誤り</b>：接地側に白以外、接地線に緑以外、受金ねじ部・W に白以外。</li>
          <li><b>リングスリーブ</b>：サイズ・刻印の誤り、圧着マークの欠け、心線の先端・末端の不足、絶縁被覆のはさみ込み。</li>
          <li><b>差込形コネクタ</b>：先端から心線が見えない／差込口から心線が露出。</li>
          <li><b>器具の結線</b>：ねじ締め不良、心線の露出しすぎ、ランプレセプタクルの輪作り不良（左巻き・重ね巻き・巻き不足）、ケーブル外装が台座に入っていない。</li>
          <li><b>被覆の損傷</b>：シースや絶縁被覆に傷、心線が露出するキズ。</li>
          <li><b>寸法</b>：配線図の寸法の 50% 以下。</li>
        </ul>
      </div>
      <div class="card">
        <h3>⏱ 60分の時間配分（目安）</h3>
        <div class="timeline">
          <div><b>3〜5分</b>複線図</div>
          <div><b>25分</b>ケーブル切断・<br>器具結線</div>
          <div><b>15分</b>ボックス内<br>接続</div>
          <div><b>10分</b>見直し<br>（色・刻印・本数）</div>
        </div>
        <ul class="list" style="margin-top:10px">
          <li>複線図は <b>試験問題の余白に5分以内</b>で描けるまで練習（このアプリで毎日1問）。</li>
          <li>描いたら、<b>接続点ごとに本数と太さ</b>をメモ → スリーブ刻印が一瞬で決まる。</li>
          <li>見直しは「色 → 刻印 → ねじ締め → 寸法」の順で。</li>
        </ul>
      </div>
    </div>

    <div class="card">
      <h3>候補問題を選んで練習（No.1〜No.10）</h3>
      <div class="probgrid">${cards}</div>
    </div>

    <div class="card">
      <h3>試験センター公表の注意事項</h3>
      <img src="fukusen/img/kihon.png" class="zoomable" style="width:100%;max-width:820px;background:#fff">
    </div>`;
    root.querySelectorAll('.probcard').forEach(c => c.onclick = () => go(+c.dataset.no));
  }
  return { render };
})();
