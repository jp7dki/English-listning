// =============================================================
// app.js … 日数の計算・進捗管理・「今日の学習」画面・タブ切り替え
// 学習プランの中身は data/plan.json、教材は data/materials.json にあります。
// =============================================================

const App = {
  plan: null,       // data/plan.json の中身
  materials: [],    // data/materials.json の中身
  view: 'today',    // 表示中のタブ
  renderedDate: null // 画面を描いた日付（日付が変わったら描き直す）
};

// ---------- 小さな道具 ----------

// HTMLに文字を入れるときの安全対策（< > & などを無害化）
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// 短いお知らせを画面下に表示
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 2500);
}

// 保存して、失敗したら知らせる
function persist() {
  if (!Store.save()) toast('⚠ 保存できませんでした（プライベートモード等）');
}

// ---------- 日数の計算 ----------

const Plan = {
  total() {
    return App.plan.totalDays || 30;
  },

  // その日の教材（なければ null）
  material(day) {
    return App.materials.find((m) => Number(m.day) === Number(day)) || null;
  },

  // その日の週番号（教材に week があればそれを優先）
  weekOf(day) {
    const m = Plan.material(day);
    if (m && m.week) return Number(m.week);
    return Math.min(4, Math.ceil(day / 7));
  },

  // 週の情報（テーマ・練習内容）
  week(w) {
    return App.plan.weeks.find((x) => x.week === w) || App.plan.weeks[0];
  },

  // 今日の課題の日を決める
  // ・今日（日本時間）すでに精聴を終えた日があれば、その日を表示（先取りしない）
  // ・なければ「精聴が未完了で一番若い日」
  current() {
    const s = Store.get();
    const today = DateUtil.today();
    const total = Plan.total();
    let doneToday = 0;
    for (let d = 1; d <= total; d++) {
      if (s.days[d] && s.days[d].intensive === today) doneToday = d;
    }
    if (doneToday) return { day: doneToday, doneToday: true, allDone: false };
    for (let d = 1; d <= total; d++) {
      if (!(s.days[d] && s.days[d].intensive)) return { day: d, doneToday: false, allDone: false };
    }
    return { day: total, doneToday: false, allDone: true };
  },

  // 連続日数と累計日数（精聴を完了したカレンダー日付で数える）
  stats() {
    const s = Store.get();
    const dates = new Set();
    let total = 0;
    for (const k of Object.keys(s.days)) {
      if (s.days[k].intensive) { dates.add(s.days[k].intensive); total++; }
    }
    // 今日まだやっていなくても、昨日までの連続は途切れさせない
    let cur = DateUtil.today();
    if (!dates.has(cur)) cur = DateUtil.addDays(cur, -1);
    let streak = 0;
    while (dates.has(cur)) { streak++; cur = DateUtil.addDays(cur, -1); }
    return { streak, total };
  }
};

// ---------- チェックの切り替え ----------

function toggleCheck(day, id) {
  const d = Store.day(day);
  if (d[id]) {
    delete d[id];
  } else {
    d[id] = DateUtil.today(); // 完了した日付を記録
    const s = Store.get();
    if (id === 'intensive' && !s.startDate) s.startDate = DateUtil.today();
  }
  persist();
  renderToday();
  if (id === 'intensive' && d[id]) toast('🎉 今日はOK！');
}

// ---------- 「今日の学習」画面 ----------

function renderToday() {
  const el = document.getElementById('view-today');
  const cur = Plan.current();
  const day = cur.day;
  const w = Plan.weekOf(day);
  const week = Plan.week(w);
  const mat = Plan.material(day);
  const st = Plan.stats();
  const rec = Store.get().days[day] || {};
  App.renderedDate = DateUtil.today();
  App.currentDay = day;

  let html = '';

  // 見出し：Day N / 30・Week X：テーマ
  html += `
    <header class="today-head">
      <div class="dayline">Day ${day} / ${Plan.total()}・Week ${w}</div>
      <h1 class="theme">${esc(week.theme)}</h1>
      <div class="stats">連続 ${st.streak}日 ・ 累計 ${st.total}日</div>
    </header>`;

  if (cur.allDone) {
    html += `<div class="banner ok">🏆 30日分すべて完了しました！おつかれさまでした。<br>記録タブで Day 1 との比較を見てみましょう。</div>`;
  }

  // 測定の日（Day 1 / Day 30）は最初に測定カード
  html += measureCardHtml(day);

  // 今日の精聴素材
  if (mat) {
    html += `
    <section class="card material">
      <div class="card-label">今日の精聴素材</div>
      <h2 class="mat-title">${esc(mat.title)}</h2>
      <div class="meta">${esc(mat.source)}${mat.durationMin ? '・約' + esc(mat.durationMin) + '分' : ''}</div>
      ${mat.focusHint ? `<p class="hint">💡 ${esc(mat.focusHint)}</p>` : ''}
      <div class="links">
        ${mat.pageUrl ? `<a href="${esc(mat.pageUrl)}" target="_blank" rel="noopener">公式ページ ↗</a>` : ''}
        ${mat.transcriptUrl ? `<a href="${esc(mat.transcriptUrl)}" target="_blank" rel="noopener">スクリプト ↗</a>` : ''}
      </div>
    </section>`;
  } else {
    html += `<section class="card material"><p>Day ${day} の教材が data/materials.json にありません。</p></section>`;
  }

  // 大きな「始める」ボタン（終わっていれば「今日はOK」）
  if (rec.intensive && cur.doneToday) {
    html += `
    <div class="banner ok">✓ 今日はOK！ 精聴が完了しました。<br><small>続きは明日。余裕があれば下のメニューもどうぞ。</small></div>
    <button class="btn-start secondary" data-action="start" data-day="${day}">▶ もう一度聞く</button>`;
  } else if (mat) {
    html += `<button class="btn-start" data-action="start" data-day="${day}">▶ 始める</button>`;
  }

  // メニュー（1タップでチェック）
  html += `<ul class="menu">`;
  for (const item of App.plan.menu) {
    if (item.id === 'review' && day === 1) continue; // Day 1 は前日がないので復習なし
    const done = !!rec[item.id];
    html += `
      <li class="menu-item ${done ? 'done' : ''} ${item.required ? 'required' : ''}">
        <button class="check" data-action="toggle" data-day="${day}" data-id="${item.id}"
          aria-pressed="${done}" aria-label="${esc(item.label)}を${done ? '未完了に戻す' : '完了にする'}">${done ? '✓' : ''}</button>
        <div class="mi-body">
          <div class="mi-title">${esc(item.label)} <span class="mi-min">${item.minutes}分</span>
            ${item.required ? '<span class="tag">最低ライン</span>' : ''}${item.optional ? '<span class="tag soft">任意</span>' : ''}</div>
          <div class="mi-desc">${esc(item.desc)}</div>
          ${menuExtra(item.id, day, w)}
        </div>
      </li>`;
  }
  html += `</ul>`;

  el.innerHTML = html;
}

// メニューごとの追加表示（練習のやり方・再生ボタンなど）
function menuExtra(id, day, w) {
  if (id === 'drill') return drillHtml(day, w);
  if (id === 'review') {
    const prev = Plan.material(day - 1);
    if (!prev) return '';
    return `<button class="btn-small" data-action="play" data-day="${day - 1}" data-mode="review">▶ Day ${day - 1}：${esc(prev.title)}</button>`;
  }
  if (id === 'extensive') {
    return `<button class="btn-small" data-action="play" data-day="${day}" data-mode="extensive">▶ 今日の素材を流し聞き</button>`;
  }
  return '';
}

// 質問キャッチ練習（週ごとの内容とタップ記録）
function drillHtml(day, w) {
  const drill = Plan.week(w).drill;
  let html = `<details class="drill"><summary>やり方：${esc(drill.title)}</summary><ol>`;
  for (const s of drill.steps) html += `<li>${esc(s)}</li>`;
  html += `</ol>`;
  if (drill.showQuestionTypes) {
    html += `<div class="qtypes">`;
    for (const q of App.plan.questionTypes) {
      html += `<div><b>${esc(q.label)}</b>：<span lang="en">${q.examples.map(esc).join(' / ')}</span></div>`;
    }
    html += `</div>`;
  }
  html += countersHtml(day, w);
  html += `</details>`;
  return html;
}

// タップ記録のボタン（練習カードと精聴ステップ2で共通）
function countersHtml(day, w) {
  const drill = Plan.week(w).drill;
  if (!drill.counters) return '';
  const t = Store.get().tallies[day] || {};
  let html = `<div class="counters-title">${esc(drill.countersTitle)}</div><div class="counters">`;
  for (const c of drill.counters) {
    html += `<button class="counter" data-action="tally" data-day="${day}" data-id="${c.id}">
      ${esc(c.label)}<span class="count">${t[c.id] || 0}</span></button>`;
  }
  html += `</div><button class="btn-link" data-action="tally-undo" data-day="${day}">1つ取り消す</button>`;
  return html;
}

// タップ記録 +1（最後に押したものを覚えておき、取り消せるようにする）
function addTally(day, id) {
  const s = Store.get();
  if (!s.tallies[day]) s.tallies[day] = {};
  s.tallies[day][id] = (s.tallies[day][id] || 0) + 1;
  App.lastTally = { day, id };
  persist();
  // 開いている「やり方」を閉じないよう、数字だけ書き換える
  setCountText(day, id, s.tallies[day][id]);
}

function setCountText(day, id, n) {
  document.querySelectorAll(`.counter[data-day="${day}"][data-id="${id}"] .count`)
    .forEach((x) => { x.textContent = n; });
}

function undoTally(day) {
  const s = Store.get();
  const last = App.lastTally;
  if (!last || last.day !== day || !s.tallies[day] || !s.tallies[day][last.id]) {
    toast('取り消せる記録がありません');
    return;
  }
  s.tallies[day][last.id]--;
  persist();
  setCountText(day, last.id, s.tallies[day][last.id]);
  App.lastTally = null;
}

// ---------- 素材を再生する（音声プレーヤーは player.js） ----------

function startMaterial(day, mode) {
  const mat = Plan.material(day);
  if (!mat) return;
  if ((typeof Player !== 'undefined')) {
    Player.open(mat, { mode, day });
  } else if (mat.pageUrl) {
    window.open(mat.pageUrl, '_blank', 'noopener');
  }
}

// ---------- タブ切り替え ----------

function showView(name) {
  if (!document.getElementById('view-' + name)) name = 'today';
  App.view = name;
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.dataset.view !== name; });
  document.querySelectorAll('.tabbar a').forEach((a) => {
    a.classList.toggle('active', a.dataset.tab === name);
    if (a.dataset.tab === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if ((typeof Player !== 'undefined')) Player.onViewChange(name);
  if (name === 'today') renderToday();
  else if ((typeof Screens !== 'undefined') && Screens[name]) Screens[name](document.getElementById('view-' + name));
  window.scrollTo(0, 0);
}

function route() {
  showView((location.hash || '#today').slice(1));
}

// ---------- ボタン操作（まとめて受け付ける） ----------

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const day = Number(t.dataset.day);
  switch (t.dataset.action) {
    case 'toggle': toggleCheck(day, t.dataset.id); break;
    case 'start': startMaterial(day, 'intensive'); break;
    case 'play': startMaterial(day, t.dataset.mode); break;
    case 'tally': addTally(day, t.dataset.id); break;
    case 'tally-undo': undoTally(day); break;
    default:
      // 他の画面のボタン（screens.js などで処理）
      if ((typeof Screens !== 'undefined') && Screens.onAction) Screens.onAction(t, e);
  }
});

// ---------- 起動 ----------

async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(path + ' を読み込めませんでした (' + res.status + ')');
  return res.json();
}

async function init() {
  Store.load();
  try {
    [App.plan, App.materials] = await Promise.all([
      loadJson('data/plan.json'),
      loadJson('data/materials.json')
    ]);
  } catch (e) {
    document.getElementById('view-today').innerHTML =
      `<div class="banner warn">データを読み込めませんでした。<br><small>${esc(e.message)}</small><br>
       <small>※ファイルを直接開くのではなく、http サーバー経由（GitHub Pages や python3 -m http.server）で開いてください。</small></div>`;
    return;
  }
  window.addEventListener('hashchange', route);
  route();

  // アプリを開き直したとき、日付が変わっていたら描き直す
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && App.view === 'today' && App.renderedDate !== DateUtil.today()) {
      renderToday();
    }
  });
}

init();
