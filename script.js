/**
 * 第一種電気工事士 Bear Sync - コアスクリプト
 * 
 * ローカルストレージキーには全て "denkoji1_" をプレフィックスとして付与。
 */

// LocalStorageのキー
const LS_KEY_PROGRESS = 'denkoji1_progress';
const LS_KEY_FLASHCARDS = 'denkoji1_flashcards';
const LS_KEY_LOG = 'denkoji1_study_log';

// 第一種電気工事士専門用語辞書
const 専門用語辞書 = {
  "高圧受電設備": "需要家が電力会社から高圧で受電するための設備。",
  "キュービクル": "変圧器や遮断器などを一つの金属箱に収めた受電設備。",
  "地絡継電器": "地絡事故を検出し、遮断器に引き外し信号を送る継電器。",
  "架橋ポリエチレン絶縁ビニルシースケーブル": "CVケーブル。高圧配線に広く用いられる。",
  "過電流遮断器": "回路に過電流が流れたとき、自動的に回路を遮断する器具。"
};

// 第一種電気工事士9科目定義
const 科目リスト = [
  { id: 'subject1', name: '電気に関する基礎理論' },
  { id: 'subject2', name: '配電理論及び配線設計' },
  { id: 'subject3', name: '電気応用' },
  { id: 'subject4', name: '電気機器・蓄電池・配線器具・電気工事用の材料及び工具並びに受電設備' },
  { id: 'subject5', name: '電気工事の施工方法' },
  { id: 'subject6', name: '自家用電気工作物の検査方法' },
  { id: 'subject7', name: '配線図' },
  { id: 'subject8', name: '発電施設・送電施設及び変電施設の基礎的な構造及び特性' },
  { id: 'subject9', name: '一般用電気工作物及び自家用電気工作物の保安' },
];

// 年度・区分リスト
const 年度リスト平成令和2 = ['H25','H26','H27','H28','H29','H30','R1','R2'];
const 年度リスト令和3以降 = ['R3','R4','R5','R6','R7','R8'];
const 区分リスト = ['上期午前','上期午後','下期午前','下期午後'];

/**
 * 分散学習（Spaced Repetition System）アルゴリズム
 * クマが同期して記憶を定着させるイメージ
 */
class 熊同期アルゴリズム {
  // 正答状況に応じて次の復習までの日数を計算
  static 計算(現在のレベル, 評価) {
    // 評価: 1(不正解/忘れた), 2(難しい), 3(普通), 4(簡単)
    if (評価 === 1) return { レベル: 0, 復習間隔: 1 };
    
    let 新レベル = 現在のレベル + (評価 === 4 ? 2 : 1);
    let 次の復習日 = 1;

    switch (新レベル) {
      case 1: 次の復習日 = 1; break;
      case 2: 次の復習日 = 3; break;
      case 3: 次の復習日 = 7; break;
      case 4: 次の復習日 = 14; break;
      case 5: 次の復習日 = 30; break;
      default: 次の復習日 = 90; break;
    }
    
    return { レベル: 新レベル, 復習間隔: 次の復習日 };
  }
}

// データの読み込み
function データを取得(key, 規定値 = {}) {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : 規定値;
}

// データの保存
function データを保存(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

// ダッシュボードの更新
function ダッシュボードを更新() {
  const 進捗データ = データを取得(LS_KEY_PROGRESS, {});
  const フラッシュカードデータ = データを取得(LS_KEY_FLASHCARDS, []);
  
  // 復習待ち件数の計算
  const 今日 = new Date().getTime();
  const 復習待ち = フラッシュカードデータ.filter(card => card.nextReviewTime <= 今日);
  
  const badge = document.getElementById('due-badge');
  if (badge) {
    badge.textContent = `復習: ${復習待ち.length}件`;
    if (復習待ち.length > 0) {
      badge.style.background = '#ff4d4d'; // 警告色
      badge.style.boxShadow = '0 0 10px #ff4d4d';
    }
  }

  const warning = document.getElementById('review-warning');
  if (warning) {
    warning.style.display = 復習待ち.length >= 10 ? 'block' : 'none';
  }

  // 科目別進捗と全体進捗の計算（モックデータとして処理）
  let 完了合計 = 0;
  let 総問題数目安 = 科目リスト.length * 50; // 仮の全体問題数

  const subjectContainer = document.getElementById('subject-progress-container');
  if (subjectContainer) {
    subjectContainer.innerHTML = '';
    
    科目リスト.forEach(subject => {
      // 仮の進捗割合を計算 (0〜100)
      const 進捗率 = 進捗データ[subject.id] ? Math.min(100, 進捗データ[subject.id].rate) : 0;
      完了合計 += 進捗率;

      const item = document.createElement('div');
      item.className = 'subject-item';
      item.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
          <span style="font-size:0.8rem; color:var(--text-dim);">${subject.name}</span>
          <span style="font-size:0.8rem; color:var(--accent-cyan);">${Math.round(進捗率)}%</span>
        </div>
        <div class="subject-bar-bg">
          <div class="subject-bar-fill" style="width: ${進捗率}%"></div>
        </div>
      `;
      subjectContainer.appendChild(item);
    });
  }

  // BEAR METERの更新
  const 全体進捗 = Math.round(完了合計 / 科目リスト.length);
  const fill = document.getElementById('total-progress-fill');
  const text = document.getElementById('total-progress-text');
  
  if (fill && text) {
    // 少し遅延させてアニメーション発動
    setTimeout(() => {
      fill.style.width = `${全体進捗}%`;
      text.textContent = `${全体進捗}%`;
    }, 100);
  }

  // 今日の学習数（簡易実装）
  const ログ = データを取得(LS_KEY_LOG, { today: 0, date: new Date().toLocaleDateString() });
  const todaysDate = new Date().toLocaleDateString();
  if (ログ.date !== todaysDate) {
    ログ.today = 0;
    ログ.date = todaysDate;
    データを保存(LS_KEY_LOG, ログ);
  }
  const todayElem = document.getElementById('today-learned');
  if (todayElem) {
    todayElem.textContent = ログ.today;
  }
}

// 解答表示トグル（過去問画面用）
function 解答を切り替え(btnElement, panelId) {
  const panel = document.getElementById(panelId);
  if (panel) {
    panel.classList.toggle('hidden');
    if (panel.classList.contains('hidden')) {
      btnElement.textContent = '解答を見る';
    } else {
      btnElement.textContent = '解答を隠す';
      // 学習ログ加算
      const ログ = データを取得(LS_KEY_LOG, { today: 0, date: new Date().toLocaleDateString() });
      ログ.today += 1;
      データを保存(LS_KEY_LOG, ログ);
    }
  }
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  ダッシュボードを更新();
});
