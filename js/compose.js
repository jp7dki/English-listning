// =============================================================
// compose.js … 英作文（瞬間英作文）
//  ・日本語を見て、10秒で英語を頭の中で作る（口パク）
//  ・「答えを見る」→ 模範解答を確認 → 自分で ○△× をつける
//  ・○は間隔をのばし、△×は翌日にもう一度出題（間隔をあけた復習）
//  ・× の問題は、その回の最後にもう一度出す
// 問題は data/compose.json、設定は data/plan.json の "compose" にあります。
// =============================================================

const Compose = (() => {
  let items = [];       // 全問題（data/compose.json）
  let el = null;        // 全画面の英作文画面
  let queue = [];       // 今回の出題リスト
  let idx = 0;          // 何問目か
  let revealed = false; // 答えを表示中か
  let hintShown = false;
  let day = 0;          // 学習プランの何日目として解いているか
  let practice = false; // おさらいモード（復習の予定は変えない）
  let results = { ok: 0, mid: 0, ng: 0 };
  let retried = new Set(); // その回の最後にもう一度出した問題

  function setItems(list) { items = Array.isArray(list) ? list : []; }
  function cfg() { return App.plan.compose; }

  // 問題ごとの記録 {box, due, ok, mid, ng, last}
  function rec(id) {
    const s = Store.get();
    if (!s.compose[id]) s.compose[id] = { box: 0, due: null, ok: 0, mid: 0, ng: 0 };
    return s.compose[id];
  }

  // 日ごとの記録 {new, rev, ok, mid, ng}
  function todayLog() {
    const s = Store.get();
    const t = DateUtil.today();
    if (!s.composeLog[t]) s.composeLog[t] = { new: 0, rev: 0, ok: 0, mid: 0, ng: 0 };
    return s.composeLog[t];
  }

  // ---------- 今日の出題リストを作る ----------
  // 復習（予定日が今日以前のもの）を最大5問 ＋ 新しい問題を最大5問
  function buildQueue(curDay) {
    const s = Store.get();
    const today = DateUtil.today();
    const c = cfg();
    const log = s.composeLog[today] || { new: 0, rev: 0 };
    const due = items
      .filter((it) => s.compose[it.id] && s.compose[it.id].due && s.compose[it.id].due <= today)
      .sort((a, b) => (s.compose[a.id].due < s.compose[b.id].due ? -1 : 1))
      .slice(0, Math.max(0, c.reviewPerDay - (log.rev || 0)));
    const fresh = items
      .filter((it) => it.day <= curDay && !s.compose[it.id])
      .slice(0, Math.max(0, c.newPerDay - (log.new || 0)));
    return due.concat(fresh);
  }

  // 苦手な問題（×が多く、まだ覚えていないもの）
  function weakItems(n) {
    const s = Store.get();
    return items
      .filter((it) => s.compose[it.id] && s.compose[it.id].ng > 0 && s.compose[it.id].box <= 1)
      .sort((a, b) => s.compose[b.id].ng - s.compose[a.id].ng)
      .slice(0, n);
  }

  // 今日の画面に出すボタンの数字用
  function remaining(curDay) { return buildQueue(curDay).length; }

  // ---------- 開始 ----------
  function start(curDay, isPractice) {
    if (!items.length) { toast('英作文の問題（data/compose.json）を読み込めませんでした'); return; }
    day = curDay;
    practice = !!isPractice;
    queue = practice ? weakItems(5) : buildQueue(curDay);
    if (practice && !queue.length) {
      // 苦手な問題がなければ、これまでに解いた問題からランダムに5問
      const seen = items.filter((it) => Store.get().compose[it.id]);
      queue = seen.sort(() => Math.random() - 0.5).slice(0, 5);
    }
    idx = 0;
    results = { ok: 0, mid: 0, ng: 0 };
    retried = new Set();
    revealed = false;
    hintShown = false;
    if (!el) build();
    el.hidden = false;
    document.body.classList.add('no-scroll');
    render();
  }

  function build() {
    el = document.createElement('div');
    el.id = 'compose';
    el.className = 'cp';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '英作文');
    document.body.appendChild(el);
    el.addEventListener('click', onClick);
  }

  function close() {
    el.hidden = true;
    document.body.classList.remove('no-scroll');
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    if (App.view === 'today') renderToday();
  }

  // ---------- 画面 ----------
  function render() {
    if (idx >= queue.length) { renderEnd(); return; }
    const it = queue[idx];
    const total = queue.length;
    const isRetry = retried.has(it.id) && idx >= total - retried.size;
    const c = cfg();
    let html = `
      <div class="cp-top">
        <span class="cp-count">${idx + 1} / ${total}${practice ? '（おさらい）' : ''}</span>
        ${it.tag ? `<span class="tag">${esc(it.tag)}</span>` : ''}
        ${isRetry ? '<span class="tag soft">もう一度</span>' : ''}
        <button class="icon-btn" data-c="close" aria-label="閉じる">✕</button>
      </div>
      <div class="cp-main">
        <div class="cp-ja">${esc(it.ja)}</div>`;
    if (!revealed) {
      html += `
        <div class="cp-timer" aria-hidden="true"><span style="animation-duration:${c.thinkSeconds}s"></span></div>
        <div class="cp-note">${c.thinkSeconds}秒で英語を頭の中で作って、口パクで言ってみる</div>
        ${hintShown ? `<div class="cp-hint">ヒント：<b lang="en">${esc(it.hint)}</b></div>` : ''}`;
    } else {
      html += `
        <div class="cp-answer">
          <div class="cp-en" lang="en">${esc(it.en)}</div>
          <button class="icon-btn" data-c="speak" data-text="${esc(it.en)}" aria-label="読み上げ">🔊</button>
        </div>
        ${it.alt ? `<div class="cp-alt"><span>別の言い方</span><div lang="en">${esc(it.alt)}</div>
          <button class="btn-link" data-c="speak" data-text="${esc(it.alt)}">🔊 聞く</button></div>` : ''}
        <div class="cp-note">🔊のお手本に重ねて口パク → 自分で採点</div>`;
    }
    html += `</div><div class="cp-bottom">`;
    if (!revealed) {
      html += `
        <button class="chip cp-hintbtn" data-c="hint" ${hintShown ? 'disabled' : ''}>ヒント</button>
        <button class="btn-start cp-reveal" data-c="reveal">答えを見る</button>`;
    } else {
      const h = c.ratingHelp;
      html += `
        <div class="cp-rate">
          <button class="cp-r ok" data-c="rate" data-r="ok"><b>○</b>${esc(h.ok)}</button>
          <button class="cp-r mid" data-c="rate" data-r="mid"><b>△</b>${esc(h.mid)}</button>
          <button class="cp-r ng" data-c="rate" data-r="ng"><b>×</b>${esc(h.ng)}</button>
        </div>`;
    }
    html += `</div>`;
    el.innerHTML = html;
  }

  function renderEnd() {
    let body;
    if (!queue.length) {
      body = `<div class="cp-ja">今日の英作文は終わっています 🎉</div>
        <p class="cp-note">新しい問題と復習は、また明日出題されます。</p>`;
    } else {
      body = `<div class="cp-ja">おつかれさまでした！</div>
        <div class="cp-sum"><span class="ok">○ ${results.ok}</span><span class="mid">△ ${results.mid}</span><span class="ng">× ${results.ng}</span></div>
        <p class="cp-note">△と×の問題は、明日もう一度出題されます。</p>`;
    }
    el.innerHTML = `
      <div class="cp-top"><span class="cp-count">${practice ? 'おさらい' : '英作文'}</span>
        <button class="icon-btn" data-c="close" aria-label="閉じる">✕</button></div>
      <div class="cp-main">${body}</div>
      <div class="cp-bottom">
        <button class="chip wide" data-c="practice">苦手な問題をおさらい（5問）</button>
        <button class="btn-start cp-reveal" data-c="close">閉じる</button>
      </div>`;
  }

  // ---------- 自己採点 ----------
  function rate(r) {
    const it = queue[idx];
    const firstTry = !(retried.has(it.id) && idx >= queue.length - retried.size);
    if (firstTry) {
      results[r]++;
      if (!practice) {
        const isNew = !Store.get().compose[it.id];
        const x = rec(it.id);
        const iv = cfg().intervalsDays;
        const today = DateUtil.today();
        if (r === 'ok') {
          x.due = DateUtil.addDays(today, iv[Math.min(x.box, iv.length - 1)]);
          x.box = Math.min(x.box + 1, iv.length);
        } else {
          if (r === 'ng') x.box = 0;
          x.due = DateUtil.addDays(today, 1); // 明日もう一度
        }
        x[r]++;
        x.last = today;
        const log = todayLog();
        log[isNew ? 'new' : 'rev']++;
        log[r]++;
        persist();
      }
      // × はこの回の最後にもう一度
      if (r === 'ng' && !retried.has(it.id)) {
        retried.add(it.id);
        queue.push(it);
      }
    }
    idx++;
    revealed = false;
    hintShown = false;
    // 全部終わったら「英作文」メニューを完了にする
    if (idx >= queue.length && !practice) {
      const d = Store.day(day);
      if (!d.compose) { d.compose = DateUtil.today(); persist(); }
    }
    render();
  }

  function onClick(e) {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    switch (b.dataset.c) {
      case 'close': close(); break;
      case 'hint': hintShown = true; render(); break;
      case 'reveal': revealed = true; render(); break;
      case 'speak': speak(b.dataset.text); break;
      case 'rate': rate(b.dataset.r); break;
      case 'practice': start(day, true); break;
    }
  }

  return { setItems, start, remaining, weakItems, all: () => items };
})();
