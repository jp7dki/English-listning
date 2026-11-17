// =============================================================
// player.js … 音声プレーヤー（画面下に固定。タブを切り替えても再生は続く）
//  ・再生/一時停止、5秒・10秒戻し、速度 0.8〜1.1倍
//  ・A-B区間リピート（素材ごとに保存）
//  ・再生位置の保存（次に開いたら続きから）
//  ・ロック画面/イヤホン操作（Media Session API）
//  ・精聴モードではステップ（聞く→確認→口パク→もう一度）を案内
// =============================================================

const Player = (() => {
  const RATES = [0.8, 0.9, 1.0, 1.1];
  const MODE_LABEL = { intensive: '精聴', review: '復習', extensive: '多聴' };

  let audio, dock;
  let mat = null;      // 再生中の素材
  let opt = {};        // { mode, day }
  let lastSaved = 0;   // 最後に再生位置を保存した時刻

  // 素材ごとの保存データ（キーは音声URL）
  function keyOf(m) { return m.audioUrl || m.embedUrl || m.pageUrl; }
  function saved() {
    const s = Store.get();
    const k = keyOf(mat);
    if (!s.player[k]) s.player[k] = {};
    return s.player[k];
  }

  // 秒 → "1:05"
  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  // ---------- 画面の組み立て（最初の1回だけ） ----------
  function build() {
    dock = document.createElement('div');
    dock.id = 'dock';
    dock.className = 'dock';
    dock.hidden = true;
    dock.innerHTML = `
      <div class="dock-head">
        <button class="dock-title" data-p="expand"><span class="dock-mode"></span><span class="dock-name"></span></button>
        <button class="icon-btn mini-only" data-p="back5" aria-label="5秒戻す">↺5</button>
        <button class="icon-btn mini-only" data-p="toggle" aria-label="再生/一時停止"><span class="pp">▶</span></button>
        <button class="icon-btn full-only" data-p="minimize" aria-label="小さくする">▾</button>
        <button class="icon-btn" data-p="close" aria-label="閉じる">✕</button>
      </div>
      <div class="full-only">
        <div class="steps"></div>
        <div class="noaudio" hidden></div>
        <div class="audio-ui">
          <div class="seek">
            <span class="t-cur">0:00</span>
            <input type="range" class="seekbar" min="0" max="100" step="0.1" value="0" aria-label="再生位置">
            <span class="t-dur">0:00</span>
          </div>
          <div class="row ab">
            <button class="chip" data-p="setA">A</button>
            <button class="chip" data-p="setB">B</button>
            <span class="ab-label">区間なし</span>
            <button class="chip" data-p="clearAB">解除</button>
          </div>
          <div class="row rates">
            ${RATES.map((r) => `<button class="chip rate" data-p="rate" data-rate="${r}">${r.toFixed(1)}×</button>`).join('')}
          </div>
          <div class="controls">
            <button class="ctl" data-p="back10" aria-label="10秒戻す">↺10</button>
            <button class="ctl" data-p="back5" aria-label="5秒戻す">↺5</button>
            <button class="ctl play" data-p="toggle" aria-label="再生/一時停止"><span class="pp">▶</span></button>
          </div>
        </div>
      </div>
      <audio preload="metadata"></audio>`;
    document.body.appendChild(dock);
    audio = dock.querySelector('audio');

    // ボタン操作
    dock.addEventListener('click', onClick);

    // シークバー（ドラッグで移動）
    const bar = dock.querySelector('.seekbar');
    bar.addEventListener('input', () => {
      if (isFinite(audio.duration)) audio.currentTime = (bar.value / 100) * audio.duration;
    });

    // 音声のイベント
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('play', updatePlayState);
    audio.addEventListener('pause', () => { updatePlayState(); savePos(true); });
    audio.addEventListener('ended', updatePlayState);
    audio.addEventListener('error', () => {
      if (audio.getAttribute('src')) showNoAudio('音声を読み込めませんでした。公式ページで聞いてください。');
    });

    // アプリを閉じる・裏に回るときも位置を保存
    window.addEventListener('pagehide', () => savePos(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') savePos(true);
    });

    // プレーヤーの高さぶん、画面の下に余白を作る
    if (window.ResizeObserver) {
      new ResizeObserver(updateDockHeight).observe(dock);
    }
    setupMediaSession();
  }

  function updateDockHeight() {
    const h = dock.hidden ? 0 : dock.offsetHeight;
    document.body.style.setProperty('--dock-h', h + 'px');
  }

  // ---------- 素材を開く ----------
  // m: 教材データ, o: { mode: 'intensive'|'review'|'extensive', day }
  function open(m, o) {
    if (!dock) build();
    const same = mat && keyOf(mat) === keyOf(m);
    if (!same) savePos(true); // 前の素材の位置を保存
    mat = m;
    opt = o || {};

    dock.hidden = false;
    dock.classList.remove('mini');
    dock.querySelector('.dock-mode').textContent = (MODE_LABEL[opt.mode] || '') + ' Day ' + m.day;
    dock.querySelector('.dock-name').textContent = m.title;
    renderSteps();

    if (m.audioUrl) {
      dock.querySelector('.noaudio').hidden = true;
      dock.querySelector('.audio-ui').hidden = false;
      if (!same || !audio.getAttribute('src')) {
        audio.src = m.audioUrl;
        audio.load();
      }
      applyRate(Store.get().settings.rate || 1.0);
      renderAB();
      // タップした流れでそのまま再生（iPhoneはタップ直後でないと再生できない）
      const p = audio.play();
      if (p && p.catch) p.catch(() => updatePlayState());
      setMetadata();
    } else {
      // 音声を埋め込めない素材 → 公式ページへ
      audio.pause();
      audio.removeAttribute('src');
      showNoAudio();
    }
    updateDockHeight();
  }

  function showNoAudio(msg) {
    const box = dock.querySelector('.noaudio');
    dock.querySelector('.audio-ui').hidden = true;
    box.hidden = false;
    let html = `<p>${esc(msg || 'この素材はアプリ内で再生できません。公式ページで聞いてください。')}</p>`;
    if (mat.embedUrl) {
      // TEDなどの公式埋め込みプレーヤー（倍速・区間リピートは埋め込み側の機能のみ）
      html = `<div class="embed"><iframe src="${esc(mat.embedUrl)}" allow="autoplay; fullscreen; encrypted-media" allowfullscreen loading="lazy" title="${esc(mat.title)}"></iframe></div>`;
    }
    if (mat.pageUrl) html += `<a class="btn-ext" href="${esc(mat.pageUrl)}" target="_blank" rel="noopener">公式ページで聞く ↗</a>`;
    if (mat.transcriptUrl) html += `<a class="btn-ext sub" href="${esc(mat.transcriptUrl)}" target="_blank" rel="noopener">スクリプトを開く ↗</a>`;
    box.innerHTML = html;
    updateDockHeight();
  }

  // ---------- 精聴のステップ案内 ----------
  function renderSteps() {
    const box = dock.querySelector('.steps');
    if (opt.mode !== 'intensive') {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const steps = App.plan.intensiveSteps;
    const rec = Store.day(opt.day);
    const i = Math.min(rec.step || 0, steps.length - 1);
    const st = steps[i];
    const last = i === steps.length - 1;
    const scriptUrl = mat.transcriptUrl || mat.pageUrl;
    box.innerHTML = `
      <div class="step-dots">${steps.map((_, k) => `<span class="${k < i ? 'past' : k === i ? 'now' : ''}"></span>`).join('')}</div>
      <div class="step-title">ステップ ${i + 1}/${steps.length}：${esc(st.title)}</div>
      <div class="step-detail">${esc(st.detail)}</div>
      ${i === 1 && scriptUrl ? `<a class="step-link" href="${esc(scriptUrl)}" target="_blank" rel="noopener">スクリプトを開く ↗</a>` : ''}
      ${i === 1 && Plan.weekOf(opt.day) === 1 ? `<div class="step-counters">${countersHtml(opt.day, 1)}</div>` : ''}
      <div class="step-nav">
        <button class="chip" data-p="stepPrev" ${i === 0 ? 'disabled' : ''}>‹ 前へ</button>
        ${last
          ? `<button class="chip primary" data-p="finish">${rec.intensive ? '✓ 完了済み' : '✓ 精聴を完了'}</button>`
          : `<button class="chip primary" data-p="stepNext">次へ ›</button>`}
      </div>`;
  }

  function moveStep(delta) {
    const rec = Store.day(opt.day);
    const n = App.plan.intensiveSteps.length;
    rec.step = Math.max(0, Math.min(n - 1, (rec.step || 0) + delta));
    persist();
    renderSteps();
    // 次のステップは区間の頭（A）から聞き直す
    const s = mat.audioUrl ? saved() : {};
    if (s.a != null) audio.currentTime = s.a;
    updateDockHeight();
  }

  // ---------- ボタン ----------
  function onClick(e) {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    switch (b.dataset.p) {
      case 'toggle': toggle(); break;
      case 'back5': skip(-5); break;
      case 'back10': skip(-10); break;
      case 'rate':
        applyRate(Number(b.dataset.rate));
        Store.get().settings.rate = Number(b.dataset.rate);
        persist();
        break;
      case 'setA': setA(); break;
      case 'setB': setB(); break;
      case 'clearAB': clearAB(); break;
      case 'stepNext': moveStep(1); break;
      case 'stepPrev': moveStep(-1); break;
      case 'finish':
        if (!Store.day(opt.day).intensive) toggleCheck(opt.day, 'intensive');
        renderSteps();
        break;
      case 'minimize': dock.classList.add('mini'); updateDockHeight(); break;
      case 'expand': dock.classList.remove('mini'); updateDockHeight(); break;
      case 'close':
        savePos(true);
        audio.pause();
        dock.hidden = true;
        updateDockHeight();
        break;
    }
  }

  function toggle() {
    if (!audio.getAttribute('src')) return;
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  }

  function skip(sec) {
    if (!audio.getAttribute('src')) return;
    const max = isFinite(audio.duration) ? audio.duration : Infinity;
    audio.currentTime = Math.max(0, Math.min(max, audio.currentTime + sec));
  }

  function applyRate(r) {
    audio.playbackRate = r;
    audio.defaultPlaybackRate = r;
    dock.querySelectorAll('.rate').forEach((x) => x.classList.toggle('on', Number(x.dataset.rate) === r));
  }

  // ---------- A-B区間リピート ----------
  function setA() {
    const s = saved();
    s.a = Math.floor(audio.currentTime * 10) / 10;
    if (s.b != null && s.b <= s.a + 1) s.b = null; // Bより後ろにAを置いたらBを消す
    persist();
    renderAB();
  }

  function setB() {
    const s = saved();
    const t = Math.floor(audio.currentTime * 10) / 10;
    if (s.a == null) s.a = 0;
    if (t <= s.a + 1) { toast('Bは Aより後ろの位置で押してください'); return; }
    s.b = t;
    persist();
    renderAB();
    audio.currentTime = s.a; // すぐにAから繰り返し
  }

  function clearAB() {
    const s = saved();
    delete s.a; delete s.b;
    persist();
    renderAB();
  }

  function renderAB() {
    const s = saved();
    const label = dock.querySelector('.ab-label');
    if (s.a != null && s.b != null) label.textContent = `🔁 ${fmt(s.a)} – ${fmt(s.b)} リピート中`;
    else if (s.a != null) label.textContent = `A ${fmt(s.a)} → 終わりでBを押す`;
    else label.textContent = '区間なし（Aで始点を記録）';
    dock.querySelector('[data-p="setA"]').classList.toggle('on', s.a != null);
    dock.querySelector('[data-p="setB"]').classList.toggle('on', s.b != null);
  }

  // ---------- 再生位置 ----------
  function onLoaded() {
    const s = saved();
    // 前回の続きから（最後のほうまで聞いていたら最初から）
    if (s.pos && s.pos < audio.duration - 5) audio.currentTime = s.pos;
    dock.querySelector('.t-dur').textContent = fmt(audio.duration);
    applyRate(Store.get().settings.rate || 1.0);
    updatePosition();
  }

  function onTime() {
    if (!mat) return;
    const s = saved();
    // A-B区間：Bを過ぎたらAに戻る
    if (s.a != null && s.b != null && audio.currentTime >= s.b) {
      audio.currentTime = s.a;
    }
    const d = audio.duration;
    dock.querySelector('.t-cur').textContent = fmt(audio.currentTime);
    if (isFinite(d) && d > 0) {
      dock.querySelector('.seekbar').value = (audio.currentTime / d) * 100;
      dock.querySelector('.t-dur').textContent = fmt(d);
    }
    savePos(false);
  }

  // 位置の保存（timeupdateは頻繁なので5秒に1回だけ）
  function savePos(force) {
    if (!mat || !mat.audioUrl || !audio || !audio.getAttribute('src')) return;
    const now = Date.now();
    if (!force && now - lastSaved < 5000) return;
    lastSaved = now;
    saved().pos = Math.floor(audio.currentTime);
    Store.save();
    updatePosition();
  }

  function updatePlayState() {
    const playing = !audio.paused && !audio.ended;
    dock.querySelectorAll('.pp').forEach((x) => { x.textContent = playing ? '❚❚' : '▶'; });
    dock.classList.toggle('playing', playing);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }

  // ---------- ロック画面・イヤホン操作（Media Session API） ----------
  function setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const handlers = {
      play: () => audio.play(),
      pause: () => audio.pause(),
      seekbackward: (d) => skip(-((d && d.seekOffset) || 10)),
      seekforward: (d) => skip((d && d.seekOffset) || 10),
      // イヤホンの「前の曲」操作 = 10秒戻し
      previoustrack: () => skip(-10),
      seekto: (d) => { if (d && d.seekTime != null) audio.currentTime = d.seekTime; }
    };
    for (const [k, fn] of Object.entries(handlers)) {
      try { ms.setActionHandler(k, fn); } catch (e) { /* 未対応の操作は無視 */ }
    }
  }

  function setMetadata() {
    if (!('mediaSession' in navigator) || !window.MediaMetadata) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: mat.title,
      artist: mat.source || '',
      album: '英語リスニング30日 Day ' + mat.day,
      artwork: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
      ]
    });
  }

  function updatePosition() {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    if (!isFinite(audio.duration) || audio.duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: audio.duration,
        playbackRate: audio.playbackRate,
        position: Math.min(audio.currentTime, audio.duration)
      });
    } catch (e) { /* 無視 */ }
  }

  // タブ切り替え時：「今日」以外では小さく表示
  function onViewChange(name) {
    if (!dock || dock.hidden) return;
    dock.classList.toggle('mini', name !== 'today');
    updateDockHeight();
  }

  return { open, onViewChange };
})();
