// =============================================================
// storage.js … 進捗データの保存・読み込み・エクスポート/インポート
// データはすべてブラウザの localStorage に1つのJSONとして保存します。
// =============================================================

const Store = (() => {
  const KEY = 'elp:v1'; // 保存キー（形式を大きく変えるときは v2 などに）

  // 初期データ（何も保存されていないとき）
  function defaultState() {
    return {
      version: 1,
      startDate: null,   // 開始日 "YYYY-MM-DD"（最初に精聴を完了した日を自動で入れる）
      days: {},          // 日ごとのチェック {"1": {intensive:"2026-11-18", drill:"…", review:"…", extensive:"…", step:0}}
      tallies: {},       // 練習のタップ記録 {"1": {"linking": 3, …}}
      measurements: {},  // 測定結果 {"1": {dictation:60, keypoints:4, date:"…"}, "30": {…}}
      meetings: [],      // 会議記録 [{date:"…", askBack:2, misread:1}]
      player: {},        // 素材ごとの再生位置・A-B区間 {"<音声URL>": {pos:83.2, a:40, b:120}}
      compose: {},       // 英作文の問題ごとの記録 {"c001": {box:1, due:"…", ok:1, mid:0, ng:0}}
      composeLog: {},    // 英作文の日ごとの記録 {"2026-11-18": {new:5, rev:3, ok:6, mid:1, ng:1}}
      settings: { rate: 1.0 }
    };
  }

  // 足りない項目を初期値で補う（古いデータや手で編集したデータ対策）
  function normalize(s) {
    const d = defaultState();
    if (!s || typeof s !== 'object') return d;
    for (const k of Object.keys(d)) {
      if (s[k] === undefined || s[k] === null && d[k] !== null) s[k] = d[k];
    }
    if (!Array.isArray(s.meetings)) s.meetings = [];
    s.settings = Object.assign({}, d.settings, s.settings);
    return s;
  }

  let state = null;

  // 読み込み（失敗しても初期データで動くようにする）
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      state = normalize(raw ? JSON.parse(raw) : null);
    } catch (e) {
      console.warn('読み込みに失敗しました', e);
      state = defaultState();
    }
    return state;
  }

  // 保存（成功したら true）
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.warn('保存に失敗しました', e);
      return false;
    }
  }

  function get() {
    return state || load();
  }

  // 日ごとのデータ（なければ作る）
  function day(n) {
    const s = get();
    if (!s.days[n]) s.days[n] = {};
    return s.days[n];
  }

  // ---- エクスポート：JSONファイルとしてダウンロード ----
  function exportFile() {
    const blob = new Blob([JSON.stringify(get(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'english-listening-progress-' + DateUtil.today() + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---- インポート：ファイルの中身を確認してから上書き ----
  // 成功なら null、失敗ならエラーメッセージを返す
  function importText(text) {
    let obj;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      return 'JSONとして読み込めませんでした。';
    }
    if (!obj || typeof obj !== 'object' || obj.version !== 1 || typeof obj.days !== 'object') {
      return 'このアプリの進捗ファイルではないようです。';
    }
    state = normalize(obj);
    return save() ? null : '保存に失敗しました（容量不足やプライベートモードの可能性）。';
  }

  // ---- 全データ削除 ----
  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) { /* 何もしない */ }
    state = defaultState();
  }

  return { load, save, get, day, exportFile, importText, reset };
})();

// =============================================================
// 日付ユーティリティ（すべて Asia/Tokyo 基準）
// =============================================================
const DateUtil = (() => {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
  });

  // 今日の日付 "YYYY-MM-DD"（日本時間）
  function today() {
    return fmt.format(new Date());
  }

  // "YYYY-MM-DD" に n 日足す（日付だけの計算なのでUTCで扱う）
  function addDays(ymd, n) {
    const [y, m, d] = ymd.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return t.toISOString().slice(0, 10);
  }

  // 2つの日付の差（日数） b - a
  function diff(a, b) {
    const toUTC = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((toUTC(b) - toUTC(a)) / 86400000);
  }

  // 曜日（0=日）
  function weekday(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  }

  // 表示用 "11/18(水)"
  function label(ymd) {
    const [, m, d] = ymd.split('-').map(Number);
    return m + '/' + d + '(' + '日月火水木金土'[weekday(ymd)] + ')';
  }

  return { today, addDays, diff, weekday, label };
})();
