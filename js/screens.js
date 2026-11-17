// =============================================================
// screens.js … フレーズ集・記録・設定・測定・立て直しフレーズ（🆘）
// =============================================================

const Screens = {};

// ---------- 英語を読み上げる（端末の音声合成。オフラインでも動くことが多い） ----------
function speak(text) {
  if (!('speechSynthesis' in window)) { toast('この端末は読み上げに対応していません'); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[…]/g, ', '));
  u.lang = 'en-US';
  u.rate = 0.95;
  speechSynthesis.speak(u);
}

function phraseHtml(en, ja) {
  return `<li class="phrase">
    <div class="ph-text"><div lang="en" class="ph-en">${esc(en)}</div>${ja ? `<div class="ph-ja">${esc(ja)}</div>` : ''}</div>
    <button class="icon-btn" data-action="speak" data-text="${esc(en)}" aria-label="読み上げ">🔊</button>
  </li>`;
}

function recoveryHtml() {
  return `<ul class="phrases">${App.plan.recoveryPhrases.map((p) => phraseHtml(p.en, p.ja)).join('')}</ul>`;
}

// ---------- フレーズ集 ----------
Screens.phrases = (el) => {
  let html = `<h1 class="page-title">フレーズ集</h1>`;
  html += `<h2 class="sec">🆘 聞き取れなかったときの立て直し</h2>${recoveryHtml()}`;
  html += `<h2 class="sec">質問の型</h2>`;
  for (const q of App.plan.questionTypes) {
    html += `<h3 class="sub">${esc(q.label)}</h3><ul class="phrases">${q.examples.map((x) => phraseHtml(x)).join('')}</ul>`;
  }
  html += `<h2 class="sec">週ごとの練習</h2>`;
  for (const w of App.plan.weeks) {
    html += `<details class="card wk"><summary><b>Week ${w.week}</b>：${esc(w.theme)}</summary>
      <div class="meta">素材：${esc(w.materials)}</div>
      <div class="wk-drill"><b>${esc(w.drill.title)}</b><ol>${w.drill.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>
    </details>`;
  }
  el.innerHTML = html;
};

// ---------- 立て直しフレーズ（どの画面からでも1タップ） ----------
function openSheet() {
  const sh = document.getElementById('sheet');
  sh.querySelector('.sheet-body').innerHTML =
    `<h2 class="sec" style="margin-top:0">🆘 立て直しフレーズ</h2>${recoveryHtml()}`;
  sh.hidden = false;
}
function closeSheet() {
  document.getElementById('sheet').hidden = true;
}

// ---------- 測定（Day 1 / Day 30） ----------

// 今日の画面に出す測定カード（その日が測定日で、まだ記録していないとき）
function measureCardHtml(day) {
  const m = App.plan.measurement;
  if (!m.days.includes(day)) return '';
  const s = Store.get();
  const rec = s.days[day] || {};
  if (s.measurements[day]) {
    if (day === 30 && s.measurements[1]) return `<div class="card">${compareHtml()}</div>`;
    return '';
  }
  if (rec.measureLater) return '';
  return `
    <details class="card measure" ${App.measureOpen ? 'open' : ''}>
      <summary><b>📏 今日は測定の日</b><span class="meta">（タップで開く）</span></summary>
      ${measureFormHtml(day)}
      <button class="btn-link" data-action="measure-later" data-day="${day}">今日はあとで（記録タブから入力できます）</button>
    </details>`;
}

function measureFormHtml(day) {
  const m = App.plan.measurement;
  const cur = Store.get().measurements[day] || {};
  const mats = (m.materials && m.materials[day]) || [];
  let html = `<p class="meta">${esc(m.intro)}</p>`;
  if (mats.length) {
    html += `<div class="links">${mats.map((x) =>
      `<a href="${esc(x.pageUrl)}" target="_blank" rel="noopener">${esc(x.label || x.title)} ↗</a>`).join('')}</div>`;
  }
  html += `<form class="mform" data-day="${day}">`;
  for (const it of m.items) {
    html += `<label class="field"><span>${esc(it.label)}</span>
      <small>${esc(it.howto)}</small>
      <input type="number" inputmode="numeric" name="${it.id}" min="${it.min}" max="${it.max}" value="${cur[it.id] != null ? esc(cur[it.id]) : ''}">
    </label>`;
  }
  html += `<div class="field"><span>③ 実際の会議（任意）</span><small>${esc(m.meetingHowto)}</small>
      <div class="two">
        <label>聞き返した回数<input type="number" inputmode="numeric" name="askBack" min="0"></label>
        <label>取り違えた回数<input type="number" inputmode="numeric" name="misread" min="0"></label>
      </div></div>
    <button type="submit" class="btn-start" style="font-size:18px;min-height:56px">記録する</button>
  </form>`;
  return html;
}

// フォームの「記録する」
document.addEventListener('submit', (e) => {
  const f = e.target;
  if (f.classList.contains('mform')) {
    e.preventDefault();
    const day = Number(f.dataset.day);
    const s = Store.get();
    const rec = { date: DateUtil.today() };
    for (const it of App.plan.measurement.items) {
      const v = f.elements[it.id].value;
      if (v !== '') rec[it.id] = Number(v);
    }
    s.measurements[day] = rec;
    addMeeting(f.elements.askBack.value, f.elements.misread.value, DateUtil.today());
    persist();
    toast('測定結果を記録しました');
    App.measureOpen = false;
    if (App.view === 'today') renderToday(); else Screens.log(document.getElementById('view-log'));
  } else if (f.classList.contains('meetform')) {
    e.preventDefault();
    if (f.elements.askBack.value === '' && f.elements.misread.value === '') { toast('回数を入力してください'); return; }
    addMeeting(f.elements.askBack.value, f.elements.misread.value, f.elements.date.value || DateUtil.today());
    persist();
    toast('会議の記録を追加しました');
    Screens.log(document.getElementById('view-log'));
  }
});

function addMeeting(askBack, misread, date) {
  if (askBack === '' && misread === '') return;
  Store.get().meetings.push({
    date,
    askBack: askBack === '' ? null : Number(askBack),
    misread: misread === '' ? null : Number(misread)
  });
  Store.get().meetings.sort((a, b) => (a.date < b.date ? -1 : 1));
}

// 会議記録の平均（期間の前半と後半で比べる）
function meetingAvg(list, key) {
  const v = list.map((x) => x[key]).filter((x) => x != null);
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

// Day 1 と Day 30 の比較
function compareHtml() {
  const s = Store.get();
  const a = s.measurements[1] || {};
  const b = s.measurements[30] || {};
  const m = App.plan.measurement;
  const diff = (x, y) => (x != null && y != null ? (y - x > 0 ? '+' : '') + (y - x) : '—');
  const show = (v) => (v == null ? '—' : v);
  let rows = '';
  for (const it of m.items) {
    rows += `<tr><th>${esc(it.label)}</th><td>${show(a[it.id])}</td><td>${show(b[it.id])}</td><td class="diff">${diff(a[it.id], b[it.id])}</td></tr>`;
  }
  // 会議：最初の半分と最後の半分の平均
  const ms = s.meetings;
  if (ms.length >= 2) {
    const half = Math.floor(ms.length / 2);
    const first = ms.slice(0, half);
    const last = ms.slice(ms.length - half);
    for (const [key, label] of [['askBack', '③ 聞き返した回数（平均）'], ['misread', '③ 取り違えた回数（平均）']]) {
      const x = meetingAvg(first, key);
      const y = meetingAvg(last, key);
      const r = (v) => (v == null ? '—' : Math.round(v * 10) / 10);
      rows += `<tr><th>${label}</th><td>${r(x)}</td><td>${r(y)}</td><td class="diff">${x != null && y != null ? diff(r(x), r(y)) : '—'}</td></tr>`;
    }
  }
  return `<h2 class="sec" style="margin-top:0">📊 Day 1 → Day 30</h2>
    <table class="cmp"><thead><tr><th></th><th>Day 1</th><th>Day 30</th><th>差</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="meta">${esc(m.targetNote)}</p>`;
}

// ---------- 記録 ----------
Screens.log = (el) => {
  const s = Store.get();
  const st = Plan.stats();
  const total = Plan.total();
  let html = `<h1 class="page-title">記録</h1>
    <div class="stat-row"><div><b>${st.total}</b><span>累計日数</span></div><div><b>${st.streak}</b><span>連続日数</span></div></div>`;

  // 30日の達成状況
  html += `<h2 class="sec">30日の進み具合</h2><div class="daygrid">`;
  for (let d = 1; d <= total; d++) {
    const r = s.days[d] || {};
    const n = ['drill', 'review', 'extensive'].filter((k) => r[k]).length;
    html += `<div class="dcell ${r.intensive ? 'done' : ''}" title="Day ${d}">
      <span class="dn">${d}</span><span class="dm">${r.intensive ? '✓' : ''}</span><span class="dots">${'•'.repeat(n)}</span></div>`;
  }
  html += `</div><p class="meta">✓＝精聴完了（今日はOK）、•＝ほかのメニューの数</p>`;

  // カレンダー（実際の日付）
  html += `<h2 class="sec">カレンダー</h2>` + calendarHtml();

  // 測定
  html += `<h2 class="sec">測定（Day 1 / Day 30）</h2><div class="card">`;
  if (s.measurements[1] || s.measurements[30]) html += compareHtml();
  else html += `<p class="meta">まだ記録がありません。</p>`;
  html += `<details class="measure-edit"><summary>測定を入力・修正する</summary>
      <div class="seg"><button class="chip ${App.logMeasureDay !== 30 ? 'on' : ''}" data-action="log-mday" data-day="1">Day 1</button>
      <button class="chip ${App.logMeasureDay === 30 ? 'on' : ''}" data-action="log-mday" data-day="30">Day 30</button></div>
      ${measureFormHtml(App.logMeasureDay === 30 ? 30 : 1)}
    </details></div>`;

  // 会議
  html += `<h2 class="sec">実際の会議</h2><div class="card">
    <form class="meetform">
      <div class="two">
        <label>日付<input type="date" name="date" value="${DateUtil.today()}"></label>
        <span></span>
        <label>聞き返した回数<input type="number" inputmode="numeric" name="askBack" min="0"></label>
        <label>取り違えた回数<input type="number" inputmode="numeric" name="misread" min="0"></label>
      </div>
      <button type="submit" class="chip primary" style="width:100%;margin-top:8px">会議の記録を追加</button>
    </form>`;
  if (s.meetings.length) {
    html += `<table class="cmp mt"><thead><tr><th>日付</th><th>聞き返し</th><th>取り違え</th><th></th></tr></thead><tbody>`;
    s.meetings.forEach((m, i) => {
      html += `<tr><td>${esc(DateUtil.label(m.date))}</td><td>${m.askBack ?? '—'}</td><td>${m.misread ?? '—'}</td>
        <td><button class="btn-link" data-action="meet-del" data-i="${i}">削除</button></td></tr>`;
    });
    html += `</tbody></table>`;
  }
  html += `</div>`;

  // タップ記録の集計（Week 1 の「聞こえなかった原因」など）
  html += `<h2 class="sec">練習のタップ記録</h2>`;
  for (const w of App.plan.weeks) {
    if (!w.drill.counters) continue;
    const sum = {};
    let max = 0;
    for (let d = 1; d <= total; d++) {
      if (Plan.weekOf(d) !== w.week) continue;
      const t = s.tallies[d] || {};
      for (const c of w.drill.counters) {
        sum[c.id] = (sum[c.id] || 0) + (t[c.id] || 0);
        max = Math.max(max, sum[c.id]);
      }
    }
    html += `<div class="card"><div class="card-label">Week ${w.week}：${esc(w.drill.countersTitle.replace(/（.*?）/, ''))}</div>`;
    for (const c of w.drill.counters) {
      const v = sum[c.id] || 0;
      html += `<div class="bar"><span class="bl">${esc(c.label)}</span>
        <span class="bt"><span class="bf" style="width:${max ? (v / max) * 100 : 0}%"></span></span><span class="bv">${v}</span></div>`;
    }
    html += `</div>`;
  }
  el.innerHTML = html;
};

// 実際の日付のカレンダー（開始日の週から今日まで。精聴をした日に Day 番号）
function calendarHtml() {
  const s = Store.get();
  const byDate = {};
  for (const [d, r] of Object.entries(s.days)) if (r.intensive) byDate[r.intensive] = d;
  const today = DateUtil.today();
  const start = s.startDate || Object.keys(byDate).sort()[0];
  if (!start) return `<p class="meta">精聴を1回完了すると、ここに表示されます。</p>`;
  let first = DateUtil.addDays(start, -DateUtil.weekday(start)); // 日曜はじまり
  let last = today > start ? today : start;
  last = DateUtil.addDays(last, 6 - DateUtil.weekday(last));
  let html = `<div class="cal"><div class="cal-h">日</div><div class="cal-h">月</div><div class="cal-h">火</div><div class="cal-h">水</div><div class="cal-h">木</div><div class="cal-h">金</div><div class="cal-h">土</div>`;
  for (let x = first; x <= last; x = DateUtil.addDays(x, 1)) {
    const d = byDate[x];
    const [, mm, dd] = x.split('-').map(Number);
    const cls = [d ? 'done' : '', x === today ? 'today' : '', x < start || x > today ? 'out' : ''].join(' ');
    html += `<div class="cal-c ${cls}"><span class="cd">${dd === 1 ? mm + '/' : ''}${dd}</span>${d ? `<span class="cday">D${d}</span>` : ''}</div>`;
  }
  return html + `</div>`;
}

// ---------- 設定 ----------
Screens.settings = (el) => {
  const s = Store.get();
  el.innerHTML = `<h1 class="page-title">設定</h1>
    <div class="card">
      <label class="field"><span>開始日</span>
        <small>カレンダー表示の起点です。日数は「未完了で一番若い日」から進むので、休んでも課題は飛びません。</small>
        <input type="date" id="startDate" value="${esc(s.startDate || '')}">
      </label>
    </div>
    <div class="card">
      <div class="field"><span>進捗の引き継ぎ</span>
        <small>別の端末に移るときは、ここで書き出したファイルを新しい端末で読み込みます。</small></div>
      <button class="chip primary wide" data-action="export">進捗をファイルに書き出す</button>
      <label class="chip wide filebtn">ファイルから読み込む<input type="file" id="importFile" accept="application/json,.json" hidden></label>
    </div>
    <div class="card">
      <div class="field"><span>リセット</span><small>すべての進捗・記録・再生位置を消します（元に戻せません）。</small></div>
      <button class="chip wide danger" data-action="reset">全データをリセット</button>
    </div>
    <p class="meta center">データはこの端末のブラウザ内だけに保存されています。<br>教材の差し替え方は data/README.md を見てください。</p>`;

  el.querySelector('#startDate').addEventListener('change', (e) => {
    Store.get().startDate = e.target.value || null;
    persist();
    toast('開始日を保存しました');
  });
  el.querySelector('#importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('今の進捗を、ファイルの内容で上書きします。よろしいですか？')) { e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const err = Store.importText(String(reader.result));
      if (err) alert('読み込めませんでした：' + err);
      else { toast('進捗を読み込みました'); Screens.settings(el); }
    };
    reader.readAsText(file);
  });
};

// ---------- 各画面のボタン ----------
Screens.onAction = (t) => {
  switch (t.dataset.action) {
    case 'speak': speak(t.dataset.text); break;
    case 'sos': openSheet(); break;
    case 'sheet-close': closeSheet(); break;
    case 'measure-later':
      Store.day(Number(t.dataset.day)).measureLater = true;
      persist();
      renderToday();
      break;
    case 'log-mday':
      App.logMeasureDay = Number(t.dataset.day);
      Screens.log(document.getElementById('view-log'));
      document.querySelector('.measure-edit').open = true;
      break;
    case 'meet-del':
      if (confirm('この会議の記録を削除しますか？')) {
        Store.get().meetings.splice(Number(t.dataset.i), 1);
        persist();
        Screens.log(document.getElementById('view-log'));
      }
      break;
    case 'export': Store.exportFile(); break;
    case 'reset':
      if (confirm('本当にすべてのデータを消しますか？\n（先に「書き出す」でバックアップするのがおすすめです）')) {
        Store.reset();
        persist();
        toast('リセットしました');
        location.hash = '#today';
        showView('today');
      }
      break;
  }
};
