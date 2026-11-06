/* Audio is the master clock: pauses and buffering never leave the display running ahead. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const audio = $('audio');
  const testAudio = $('test-audio');
  const phases = [...document.querySelectorAll('[data-phase]')];
  const labels = ['慢速开始', '连续踏步', '逐渐减速'];
  let started = false;
  let interrupted = false;
  let busy = false;
  let wakeLock = null;
  let lastStatus = '';
  const fmt = n => `${Math.floor(n / 60).toString().padStart(2, '0')}:${(n % 60).toString().padStart(2, '0')}`;

  function stateAt(t) {
    const elapsed = Math.max(0, Math.min(180, t - 5));
    const done = t >= 185;
    const phase = t < 5 || done ? -1 : t < 35 ? 0 : t < 155 ? 1 : 2;
    let steps = 0;
    if (phase === 0) steps = Math.floor(t - 5) + 1;
    if (phase === 1) steps = 30 + Math.floor((t - 35) * 1.5 + 1e-8) + 1;
    if (phase === 2) steps = 210 + Math.floor(t - 155) + 1;
    if (done) steps = 240;
    return {elapsed, done, phase, steps};
  }

  async function releaseWakeLock() {
    const lock = wakeLock;
    wakeLock = null;
    if (lock) { try { await lock.release(); } catch (_) {} }
  }
  async function keepAwake() {
    if (!navigator.wakeLock || document.visibilityState !== 'visible') return;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (audio.paused) await lock.release(); else wakeLock = lock;
    } catch (_) { /* Browser support is optional. */ }
  }

  function render() {
    const t = audio.currentTime || 0;
    const {elapsed, done, phase, steps} = stateAt(t);
    const running = !audio.paused && !audio.ended;
    const preparing = started && t < 5;
    const status = done ? '本轮完成' : !started ? '准备开始' : audio.paused ? '已暂停' : preparing ? '准备倒计时' : labels[phase];
    if (lastStatus !== status) { $('status').textContent = status; lastStatus = status; }
    $('time-label').textContent = preparing ? '准备倒计时' : '运动剩余时间';
    const clock = preparing ? String(Math.ceil(5 - t)) : fmt(Math.ceil(180 - elapsed));
    $('clock').textContent = clock;
    $('clock').setAttribute('aria-label', preparing ? `准备剩余${Math.ceil(5 - t)}秒` : `运动剩余${Math.ceil(180 - elapsed)}秒`);
    $('tempo').textContent = phase < 0 ? '60 → 90 → 60 步/分钟' : `${phase === 1 ? 90 : 60} 步/分钟`;
    $('instruction').textContent = done ? '停止踏步，准备运动后采集' : !started ? '点击开始后，有 5 秒时间做好准备' : audio.paused ? '保持原位，等待实验人员继续或重置' : preparing ? '站稳，第一声高音响起时左脚落下' : '跟随声音落脚 · 左右交替';
    $('step-count').textContent = `${steps} / 240 步`;
    $('progress-fill').style.width = `${elapsed / 180 * 100}%`;
    $('progress-fill').parentElement.setAttribute('aria-valuenow', Math.floor(elapsed));
    $('left-foot').classList.toggle('active', running && phase >= 0 && steps % 2 === 1);
    $('right-foot').classList.toggle('active', running && phase >= 0 && steps % 2 === 0);
    phases.forEach((p, i) => p.classList.toggle('active', i === phase));
    document.body.classList.toggle('running', running && !done);
    $('start').textContent = busy ? '正在加载声音…' : done ? '开始下一轮 ↗' : running ? '暂停本轮' : started ? '继续本轮 ↗' : '开始本轮 ↗';
    $('start').disabled = busy;
    $('reset').disabled = busy;
    $('test-sound').disabled = busy || running;
    if (done) $('notice').textContent = interrupted ? '本轮已完成，但曾发生中断；正式实验请按预定规则处理。' : '本轮已完成。请由实验人员安排后续采集。';
  }

  function pause(message) {
    audio.pause();
    if (started && audio.currentTime < 185) interrupted = true;
    $('notice').textContent = message || '本轮已中断；可继续演示，正式实验建议重置后重新开始。';
    releaseWakeLock();
    render();
  }
  function reset() {
    audio.pause();
    audio.currentTime = 0;
    testAudio.pause();
    testAudio.currentTime = 0;
    started = false;
    interrupted = false;
    $('error').hidden = true;
    $('notice').textContent = '请先试听，确认受试者能听清节拍。';
    releaseWakeLock();
    render();
  }

  $('start').addEventListener('click', async () => {
    if (busy) return;
    if (!audio.paused && audio.currentTime < 185) { pause(); return; }
    if (audio.currentTime >= 185 || audio.ended) reset();
    testAudio.pause();
    started = true;
    busy = true;
    $('error').hidden = true;
    render();
    try {
      await audio.play();
      $('notice').textContent = interrupted ? '本轮曾中断，请由实验人员决定是否重做。' : '请保持页面在前台，声音与画面会同步运行。';
      keepAwake();
    } catch (_) {
      $('error').hidden = false;
      $('error').textContent = '声音未能播放。请检查设备音量与网络，再点击开始。';
      if (audio.currentTime === 0) started = false;
    } finally { busy = false; render(); }
  });
  $('reset').addEventListener('click', reset);
  $('test-sound').addEventListener('click', async () => {
    if (!audio.paused || busy) return;
    testAudio.currentTime = 0;
    $('error').hidden = true;
    try { await testAudio.play(); $('notice').textContent = '试听：高音左脚，低音右脚。确认听清后开始本轮。'; }
    catch (_) { $('error').hidden = false; $('error').textContent = '试听未能播放，请检查设备音量与网络。'; }
  });
  $('volume').addEventListener('input', () => {
    audio.volume = testAudio.volume = Number($('volume').value);
    $('volume-value').value = `${Math.round(audio.volume * 100)}%`;
  });
  audio.volume = testAudio.volume = Number($('volume').value);
  $('fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.querySelector('.app').requestFullscreen) await document.querySelector('.app').requestFullscreen();
      else $('notice').textContent = '此浏览器暂不支持全屏，可横屏或隐藏浏览器工具栏使用。';
    } catch (_) { $('notice').textContent = '未能进入全屏，可继续在当前页面使用。'; }
  });
  document.addEventListener('fullscreenchange', () => { $('fullscreen').textContent = document.fullscreenElement ? '退出全屏' : '全屏显示'; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !audio.paused && audio.currentTime < 185) pause('页面已切换到后台，本轮自动暂停并标记中断。');
    if (document.hidden) testAudio.pause();
  });
  audio.addEventListener('ended', () => { releaseWakeLock(); render(); });
  audio.addEventListener('error', () => {
    $('error').hidden = false;
    $('error').textContent = '音频加载失败，请刷新页面或下载音频使用。';
  });
  audio.addEventListener('pause', () => {
    if (started && audio.currentTime > 0 && audio.currentTime < 185) interrupted = true;
    releaseWakeLock();
    render();
  });
  setInterval(render, 40);
  render();
})();
