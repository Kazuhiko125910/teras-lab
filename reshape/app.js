/* Teras Lab. RESHAPE — 会員用サイト */
(() => {
'use strict';
const CFG = window.RESHAPE_CONFIG || {};
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DOW = '日月火水木金土';
const ZOOM_NO = { 2: '①', 4: '②', 6: '③', 8: '④', 10: '⑤', 13: '⑥', 15: '⑦', 17: '⑧', 19: '⑨', 21: '⑩', 23: '⑪', 26: '⑫' };
const NAY = ['腰痛', '肩こり', '首こり', '猫背', '巻き肩', '反り腰', 'ぽっこりお腹', '膝の痛み', '体重', '疲れやすい', 'O脚・X脚', '見た目の老け感'];
const WORK_STEPS = ['いまの私', '変わりたい理由', '6ヶ月後の私', '6ヶ月後の目標を数字に', '毎月の中間目標', '続けるための約束', '確認と宣言'];

// ---------- 日付 ----------
const parseD = s => { const m = String(s || '').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/); return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null; };
const fmt = d => d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0');
const md = d => (d.getMonth() + 1) + '/' + d.getDate();
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const dayDiff = (a, b) => Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()) - new Date(b.getFullYear(), b.getMonth(), b.getDate())) / 864e5);

// ---------- 状態 ----------
const S = {
  view: 'today', auth: {}, demo: false, data: null, today: null, day: 0, week: 0,
  form: null, watched: new Set(), photoCache: {}, cmp: [], cmpSide: 'side', chart: 0, sel: null,
  chat: [{ r: 'bot', t: 'こんにちは、食事サポートです🍚\n食べたものの写真か、内容を送ってください。主食・主菜・副菜のバランスと、次の一食のヒントを返します。' }],
  work: null, ws: -1, busy: false, rv: null
};

// ---------- 通信 ----------
async function api(action, payload) {
  const body = Object.assign({}, payload || {}, { action }, S.demo ? { demo: S.auth.demo } : { idToken: S.auth.idToken });
  const res = await fetch(CFG.GAS_URL, { method: 'POST', body: JSON.stringify(body) });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || 'error');
  return j;
}
function toast(msg) { const t = document.createElement('div'); t.className = 'toast-mini'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

// ---------- 起動 ----------
async function start() {
  const q = new URLSearchParams(location.search);
  const demo = q.get('demo');
  if (q.get('v')) S.view = q.get('v');
  if (demo) { S.demo = true; S.auth.demo = demo === 'std' ? 'SAMPLE-STD' : demo === 'vip' ? 'SAMPLE-VIP' : demo; $('#demo-flag').hidden = false; }
  if (!CFG.GAS_URL) return screen(`<section class="card msgcard"><h2>準備中です</h2><p>サイトの設定（GAS_URL）がまだ入っていません。</p></section>`);
  try {
    if (!S.demo) {
      if (!CFG.LIFF_ID) return screen(`<section class="card msgcard"><h2>準備中です</h2><p>LINEログインの設定（LIFF_ID）がまだ入っていません。</p></section>`);
      await liff.init({ liffId: CFG.LIFF_ID });
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return; }
      S.auth.idToken = liff.getIDToken();
      const v = new URLSearchParams(location.search).get('v'); if (v) S.view = v;
      try { const p = await liff.getProfile(); S.auth.displayName = p.displayName; } catch (e) { /* 表示名が取れなくても続ける */ }
    }
    const d = await api('boot', { displayName: S.auth.displayName });
    load(d);
    route();
  } catch (e) {
    const msg = String(e.message || e);
    if (/login_expired|no_token/.test(msg) && !S.demo) { try { liff.logout(); } catch (_) {} location.reload(); return; }
    screen(`<section class="card msgcard"><h2>読み込めませんでした</h2><p>通信の状態を確認して、もう一度開いてください。続く場合は公式LINEでお知らせください。</p><p style="font-size:11px;color:var(--faint)">${esc(msg)}</p><p style="text-align:center"><button class="btn" type="button" onclick="location.reload()">もう一度読み込む</button></p></section>`);
  }
}

function load(d) {
  S.data = d; S.today = parseD(d.today) || new Date(); d.months = d.months || [];
  const m = d.member;
  const st = parseD(m.start);
  S.day = st ? dayDiff(S.today, st) + 1 : 0;
  S.week = S.day >= 1 ? Math.ceil(S.day / 7) : 0;
  S.watched = new Set();
  d.records.forEach(r => String(r.watched || '').split('・').filter(Boolean).forEach(c => S.watched.add(c)));
  S.fields = parseFields(m.fields);
  S.goalLink = m.goal.targets.map(t => matchField(t.label));
  const rec = todayRec();
  const P = plan(S.day);
  S.form = {
    checks: {}, mirror: rec ? rec.mirror : '', note: rec ? rec.note : '',
    v: S.fields.map((f, i) => rec && rec.v[i] != null ? rec.v[i] : lastVal(i)),
    g: m.goal.targets.map((t, i) => rec && rec.g[i] != null ? rec.g[i] : lastGoal(i)),
    saved: !!rec
  };
  if (rec) {
    if (rec.s1) S.form.checks.s1 = true; if (rec.s2) S.form.checks.s2 = true;
    String(rec.train || '').split('・').filter(Boolean).forEach(c => S.form.checks['t' + c] = true);
    String(rec.watched || '').split('・').filter(Boolean).forEach(c => S.form.checks['l' + c] = true);
  }
  S.sel = S.day >= 1 ? S.day : null;
  if (!S.work) S.work = workFromMember(m);
}

function screen(html) { $('#view').innerHTML = html; $('#tabs').hidden = true; }

function mode() {
  const m = S.data.member;
  if (m.status === '停止') return 'stopped';
  if (m.status === '卒業生') return 'grad';
  if (!goalSet()) return 'work';
  if (m.status === '承認待ち' || !m.start) return 'waiting';
  if (S.day > 182) return 'grad';
  return 'member';
}
function supportOver() { const e = supportEnd(); return !!(e && dayDiff(S.today, e) > 0); }
const goalSet = () => !!(S.data.member.goal.setAt || S.data.member.goal.targets.length);

function supportEnd() {
  const m = S.data.member;
  let e = parseD(m.plan === 'VIP' ? m.end6 : m.end3);
  if (!e) return null;
  if (/延長する/.test(m.extension)) e = addMonths(e, 3);
  return e;
}

// ---------- 毎月の中間目標と見直し ----------
const mStart = () => parseD(S.data.member.start);
const monthDate = n => { const st = mStart(); return st ? addMonths(st, n) : null; };
function monthsPassed() { const st = mStart(); if (!st) return 0; let n = 0; while (n < 120 && dayDiff(S.today, addMonths(st, n + 1)) >= 0) n++; return n; }
const cycOf = n => Math.max(1, Math.ceil(n / 6));
const kOf = n => n - 6 * (cycOf(n) - 1);
const curCycle = () => Math.floor(monthsPassed() / 6) + 1;
const goalCyc = () => S.data.member.goalCycle || (goalSet() ? 1 : 0);
const monthRow = n => S.data.months.find(x => x.n === n);
const decOf = v => { const m = String(v ?? '').match(/\.(\d+)/); return m ? m[1].length : 0; };
function rnd(v, a, b, label) { if (/10/.test(unitOf(label || ''))) return Math.round(v); let d = Math.max(decOf(a), decOf(b)); if (!d && Math.abs(b - a) < 6) d = 1; return +v.toFixed(Math.min(d, 1)); }
function msTarget(i, n) {
  const r = monthRow(n); if (r && r.targets[i] != null) return r.targets[i];
  const t = S.data.member.goal.targets[i]; if (!t || t.start == null || t.target == null) return null;
  return rnd(t.start + (t.target - t.start) * kOf(n) / 6, t.start, t.target, t.label);
}
function hitOf(t, now, target) { if (now == null || target == null || t.start == null || t.target == null) return false; return t.target < t.start ? now <= target : now >= target; }
function reviewDue() { if (!goalSet() || !mStart()) return null; const p = monthsPassed(); if (p < 1 || p > 6 * goalCyc()) return null; const r = monthRow(p); return r && r.doneAt ? null : p; }
function needNewGoals() { if (!goalSet() || !mStart()) return false; const p = monthsPassed(), end = 6 * goalCyc(); return p > end || (p === end && !!(monthRow(p) || {}).doneAt); }
function cycleDays(c) { const st = mStart(); if (!st) return [1, 182]; return [c > 1 ? dayDiff(monthDate(6 * (c - 1)), st) + 1 : 1, dayDiff(monthDate(6 * c), st) + 1]; }
function nextReview() { const p = monthsPassed(), n = p + 1; return n <= 6 * goalCyc() ? n : null; }
function reviewCard() {
  if (!goalSet() || !mStart()) return '';
  if (needNewGoals()) return `<section class="rv-card"><div><b>第${curCycle()}期の目標を決めましょう</b><p>6ヶ月、おつかれさまでした。次の6ヶ月の目標と、毎月の中間目標を決めます（約10分）。</p></div><button type="button" class="btn" id="goal-next">目標を決める</button></section>`;
  const due = reviewDue();
  if (due) return `<section class="rv-card"><div><b>${due % 6 === 0 ? '6ヶ月の最終見直し' : kOf(due) + 'ヶ月目の見直し'}の日です</b><p>今の数字を入れて、中間目標までの進み具合を確認しましょう（約3分）。</p></div><button type="button" class="btn" data-v="review">見直しをする</button></section>`;
  return '';
}
function progressBlock() {
  const g = S.data.member.goal, c = goalCyc(); if (!g.targets.length || !c) return '';
  const ns = [1, 2, 3, 4, 5, 6].map(k => 6 * (c - 1) + k), nx = nextReview();
  return g.targets.map((t, i) => `<div class="mt"><div class="mt-h"><b>${esc(nameOf(t.label))}</b><span class="num">${t.start ?? '—'} → ${t.target ?? '—'}${esc(unitOf(t.label))}</span></div>
    <table><thead><tr><th>月</th><th>見直し日</th><th>中間目標</th><th>実績</th><th></th></tr></thead><tbody>${ns.map(n => { const r = monthRow(n), d = monthDate(n), tg = msTarget(i, n), a = r && r.doneAt ? r.actual[i] : null, past = d && dayDiff(S.today, d) >= 0;
      return `<tr class="${nx === n ? 'cur' : ''}"><td>${kOf(n)}ヶ月目</td><td class="num">${d ? md(d) : '—'}</td><td class="num">${tg ?? '—'}</td><td class="num">${a ?? (past && !(r && r.doneAt) ? '<span class="miss">未記入</span>' : '')}</td><td>${a != null ? (hitOf(t, a, tg) ? '<span class="pill good">達成</span>' : '<span class="pill warn">もう少し</span>') : nx === n ? '<span class="pill">次回</span>' : ''}</td></tr>`; }).join('')}</tbody></table></div>`).join('');
}
function vReview() {
  const g = S.data.member.goal;
  const back = `<button type="button" class="linkbtn" data-v="today">← 今日の画面へ</button>`;
  if (!goalSet() || !mStart()) return `<section class="card msgcard"><h2>毎月の見直し</h2><p>目標と開始日が決まると、ここで毎月の見直しができます。</p>${back}</section>`;
  const due = reviewDue(), c = goalCyc();
  let top = '';
  if (due && !S.busy) {
    if (!S.rv || S.rv.n !== due) S.rv = { n: due, actual: g.targets.map((t, i) => { const sr = goalSeries(i); return sr.length ? String(sr[sr.length - 1][1]) : ''; }), good: '', bad: '', next: '', nt: g.targets.map((t, i) => String(msTarget(i, due + 1) ?? '')) };
    const R = S.rv, fin = due % 6 === 0;
    top = `<section class="sec" style="margin-top:4px"><div class="sec-h"><h2>${fin ? '6ヶ月の最終見直し' : kOf(due) + 'ヶ月目の見直し'}</h2><span class="aside">第${cycOf(due)}期・${md(monthDate(due))}</span></div>
    <div class="card rv-form">
      <div class="rv-step"><b>1</b>今の数字を入れる</div>
      ${g.targets.map((t, i) => { const tg = msTarget(i, due); return `<div class="rv-g"><div class="rv-h"><b>${esc(nameOf(t.label))}</b><span>${fin ? '6ヶ月の目標' : '今月の中間目標'} <b class="num">${tg ?? '—'}</b>${esc(unitOf(t.label))}</span></div><div class="rv-in"><input type="text" inputmode="decimal" aria-label="${esc(nameOf(t.label))}の今の数字" data-rva="${i}" value="${esc(R.actual[i])}"><span class="u">${esc(unitOf(t.label))}</span><span id="rvp-${i}">${rvPill(i)}</span></div></div>`; }).join('')}
      <div class="rv-step"><b>2</b>ふり返り</div>
      <div class="q"><label for="rv-good">うまくいったこと</label><textarea id="rv-good" data-rvt="good" placeholder="例：朝のストレッチは毎日できた">${esc(R.good)}</textarea></div>
      <div class="q"><label for="rv-bad">うまくいかなかったこと</label><textarea id="rv-bad" data-rvt="bad" placeholder="例：週末に記録を忘れがちだった">${esc(R.bad)}</textarea></div>
      <div class="q"><label for="rv-next">${fin ? '次の6ヶ月にいかしたいこと' : '来月の工夫'}</label><textarea id="rv-next" data-rvt="next" placeholder="例：土日は昼食後にやると決める">${esc(R.next)}</textarea></div>
      ${fin ? `<div class="hint">6ヶ月の目標3つのうち、2つ以上の達成がゴールです。保存したあと、次の6ヶ月の目標を決めます。</div>` : `<div class="rv-step"><b>3</b>来月（${md(monthDate(due + 1))}）の中間目標</div>
      ${g.targets.map((t, i) => `<div class="rv-g"><div class="rv-h"><b>${esc(nameOf(t.label))}</b><span>6ヶ月後 <b class="num">${t.target ?? '—'}</b>${esc(unitOf(t.label))}</span></div><div class="rv-in"><input type="text" inputmode="decimal" aria-label="${esc(nameOf(t.label))}の来月の中間目標" data-rvn="${i}" value="${esc(R.nt[i])}"><span class="u">${esc(unitOf(t.label))}</span></div></div>`).join('')}
      <div class="hint">今月の結果を見て、無理なく届きそうな数字に調整しましょう。</div>`}
      <button type="button" class="save" id="rv-save">見直しを保存</button></div></section>`;
  } else if (S.rv && S.rv.saved) {
    const R = S.rv, fin = R.n % 6 === 0;
    top = `<section class="card msgcard" style="margin-top:4px"><h2>${fin ? '6ヶ月の最終見直し' : kOf(R.n) + 'ヶ月目の見直し'}、できました</h2><p>${fin ? '6ヶ月の目標' : '今月の中間目標'}：3つのうち <b class="num">${R.hit}</b> つ達成。${fin ? (R.hit >= 2 ? '目標クリアです。本当におつかれさまでした。' : 'ここまで続けてきたことが一番の財産です。') : 'この調子で、来月も一歩ずつ進みましょう。'}</p></section>`;
  }
  const nx = nextReview();
  const hist = S.data.months.filter(x => x.doneAt).sort((a, b) => b.n - a.n);
  return `${back}${top}${needNewGoals() ? reviewCard() : ''}
  <section class="sec"><div class="sec-h"><h2>中間目標の進み具合</h2><span class="aside">${nx && !due ? '次の見直し ' + md(monthDate(nx)) + '（あと' + dayDiff(monthDate(nx), S.today) + '日）' : '第' + c + '期'}</span></div>
  <div class="card">${progressBlock() || '<p style="padding:14px;color:var(--muted);font-size:13px">目標を決めると表示されます。</p>'}</div></section>
  ${hist.length ? `<section class="sec"><div class="sec-h"><h2>これまでのふり返り</h2></div><div class="card">${hist.map(x => `<div class="rv-hist"><div class="rv-hh"><b>第${cycOf(x.n)}期 ${kOf(x.n)}ヶ月目</b><span class="num">${esc(x.doneAt)}・達成 ${x.hit ?? '—'}</span></div>${x.good ? `<p><small>うまくいったこと</small>${esc(x.good)}</p>` : ''}${x.bad ? `<p><small>うまくいかなかったこと</small>${esc(x.bad)}</p>` : ''}${x.next ? `<p><small>次の工夫</small>${esc(x.next)}</p>` : ''}</div>`).join('')}</div></section>` : ''}`;
}
function rvPill(i) {
  const R = S.rv, t = S.data.member.goal.targets[i], v = R.actual[i] === '' ? NaN : Number(R.actual[i]), tg = msTarget(i, R.n);
  if (isNaN(v) || tg == null) return '';
  return hitOf(t, v, tg) ? '<span class="pill good">達成</span>' : `<span class="pill warn">あと ${+Math.abs(tg - v).toFixed(1)}</span>`;
}
async function saveReview() {
  const R = S.rv, g = S.data.member.goal, n = R.n, fin = n % 6 === 0;
  const actual = [0, 1, 2].map(i => R.actual[i] == null || R.actual[i] === '' || isNaN(Number(R.actual[i])) ? null : Number(R.actual[i]));
  if (actual.every(x => x == null)) { toast('今の数字を1つ以上入れてください'); return; }
  const nt = [0, 1, 2].map(i => R.nt[i] == null || R.nt[i] === '' || isNaN(Number(R.nt[i])) ? null : Number(R.nt[i]));
  const targets = g.targets.map((t, i) => msTarget(i, n));
  const hit = g.targets.filter((t, i) => hitOf(t, actual[i], targets[i])).length;
  const review = { n, cycle: cycOf(n), date: fmt(monthDate(n)), actual, targets, hit, good: R.good, bad: R.bad, next: R.next, nextTargets: fin ? null : nt, nextDate: fin ? '' : fmt(monthDate(n + 1)) };
  S.busy = true; route();
  try {
    const r = await api('saveReview', { review });
    S.data.months = r.months || S.data.months;
    R.saved = true; R.hit = hit;
    actual.forEach((v, i) => { if (v == null) return; const k = S.goalLink[i]; if (k >= 0) S.form.v[k] = v; else S.form.g[i] = v; });
    S.busy = false;
    if (S.mode === 'grad') S.P = { train: [], D: null };
    await saveDay('見直しを保存しました');
    scrollTo(0, 0);
  } catch (e) { S.busy = false; route(); toast('保存できませんでした。通信を確認してもう一度押してください'); }
}

function route() {
  const md_ = S.forceWork ? 'work' : mode();
  S.mode = md_;
  const tabsOn = md_ === 'member' || md_ === 'grad' || md_ === 'ended';
  $('#tabs').hidden = !tabsOn;
  $('#tabs').querySelector('[data-v="meal"]').hidden = supportOver();
  let html;
  if (md_ === 'stopped') html = `<section class="card msgcard"><h2>ご利用を停止しています</h2><p>ご不明な点は公式LINEでお問い合わせください。</p></section>`;
  else if (md_ === 'work') html = vWork();
  else if (md_ === 'waiting') html = vWaiting();
  else {
    const v = S.view;
    if (v === 'review') html = vReview();
    else if (v === 'log') html = vLog();
    else if (v === 'photo') html = vPhoto();
    else if (v === 'map') html = vMap();
    else if (v === 'meal') html = vMeal();
    else html = md_ === 'grad' ? vGrad() : md_ === 'ended' ? vEnded() : vToday();
  }
  $('#view').innerHTML = html;
  document.querySelectorAll('#tabs button').forEach(b => b.dataset.v === S.view ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  if (S.view === 'photo') loadPhotos();
  if (S.view === 'meal') { const c = $('#chat'); if (c) c.scrollTop = c.scrollHeight; }
}

// ---------- 記録項目 ----------
function parseFields(s) {
  const src = String(s || '').trim() || '体重(kg)／痛み(0-10)／睡眠(時間)';
  return src.split(/[／\/]/).map(x => x.trim()).filter(Boolean).slice(0, 3).map(x => {
    const m = x.match(/^(.*?)[（(](.*?)[）)]\s*$/);
    const label = (m ? m[1] : x).trim(), unit = m ? m[2].trim() : '';
    return { label, unit, range: /^0\s*[-〜~ー]\s*10$/.test(unit) };
  });
}
const norm = s => String(s || '').replace(/[（(].*?[）)]/g, '').replace(/\s/g, '');
function matchField(label) { const g = norm(label); return S.fields.findIndex(f => { const n = norm(f.label); return n && g && (g.includes(n) || n.includes(g)); }); }
const unitOf = label => { const m = String(label).match(/[（(](.*?)[）)]/); return m ? m[1].replace(/0\s*[〜~-]\s*10/, '/10') : ''; };
const nameOf = label => String(label).replace(/[（(].*?[）)]/g, '').trim();
const todayRec = () => S.data.records.find(r => r.date === fmt(S.today));
function lastVal(i) { const r = [...S.data.records].reverse().find(x => x.v[i] != null); return r ? r.v[i] : ''; }
function lastGoal(i) { const r = [...S.data.records].reverse().find(x => x.g[i] != null); return r ? r.g[i] : ''; }

// ---------- 今日の予定 ----------
const C = () => S.data.content;
const V = link => link || '';
function roadmapWeek(w) { return C().roadmap.find(r => r.week === w) || { week: w, phase: '', theme: '', freq: '', train: [], milestone: '' }; }
function dailyOf(day) { const d = C().daily; if (!d.length) return null; return d[((Math.max(day, 1) - 1) % d.length)]; }
function lec(code) { return C().lectures.find(l => l.code === code); }
function plan(day) {
  const wk = day >= 1 ? Math.ceil(day / 7) : 0, dow = day >= 1 ? (day - 1) % 7 : 0;
  const R = roadmapWeek(Math.min(wk, 26));
  const body = [];
  const D = day >= 1 ? dailyOf(day) : null;
  if (D) {
    [['s1', D[3], 'ストレッチ①'], ['s2', D[4], 'ストレッチ②']].forEach(([k, code, s]) => {
      const st = C().stretch[code]; if (st) body.push({ k, code, t: st[0], link: st[1], s });
    });
  }
  const head = [];
  const add = code => { const l = lec(code); if (l) head.push({ k: 'l' + code, code: l.code.replace(/^(MS|HB)-/, '$1'), full: l.code, t: l.title, link: l.link, s: l.kind + (l.min ? '・' + l.min + '分' : '') }); };
  if (day >= 1 && day <= 21) (day === 1 ? ['MS-00', 'MS-01'] : ['MS-' + String(day).padStart(2, '0')]).forEach(add);
  if (day === 22) add('MS-22');
  if (wk === 2) (dow === 0 ? ['HB-00', 'HB-01'] : ['HB-0' + (dow + 1)]).forEach(add);
  if (day === 15) add('HB-08');
  if (wk === 5) (dow === 0 ? ['HB-00', 'HB-01'] : dow === 6 ? ['HB-07', 'HB-08'] : ['HB-0' + (dow + 1)]).forEach(add);
  C().lectures.filter(l => l.week === wk && /必修|目安|推奨/.test(l.kind) && !/^(MS|HB)-/.test(l.code)).forEach(l => add(l.code));
  const opt = C().lectures.filter(l => l.week === wk && l.kind === '任意');
  return { wk, dow, R, D, body, head, opt, train: R.train || [] };
}
function missed() { return C().lectures.filter(l => l.week != null && l.week < S.week && /必修|目安/.test(l.kind) && !/^(MS|HB)-/.test(l.code) && l.link && !S.watched.has(l.code)); }
function msFor(txt) { const vip = S.data.member.plan === 'VIP'; return String(txt || '').split('／').map(x => x.trim()).filter(x => x && (vip || !/Zoom|VIP|カウンセリング/.test(x)) && (!vip || !/STANDARD/.test(x))).map(x => x.replace(/^VIP[：\s]*/, '')); }

function recInWeek(w) { const st = parseD(S.data.member.start); if (!st) return 0; return S.data.records.filter(r => { const d = parseD(r.date); if (!d) return false; const n = dayDiff(d, st) + 1; return Math.ceil(n / 7) === w; }).length; }
function streak() { let s = 0, d = todayRec() ? S.today : addDays(S.today, -1); const set = new Set(S.data.records.map(r => r.date)); while (set.has(fmt(d))) { s++; d = addDays(d, -1); } return s; }

function photoPlan() {
  const vip = S.data.member.plan === 'VIP';
  if (vip) return [{ d: 1, l: 'スタート' }, ...Object.keys(ZOOM_NO).map(w => ({ d: (w - 1) * 7 + 1, l: 'Zoom' + ZOOM_NO[w] + 'の前' })), { d: 182, l: '卒業' }];
  return [1, 29, 57, 85].map((d, i) => ({ d, l: d === 1 ? 'スタート' : (i * 4) + '週目' }));
}
function photoTaken(p, i, list) { const next = list[i + 1] ? list[i + 1].d : 9999; return S.data.photos.some(x => x.day >= p.d && x.day < next && (x.front || x.side)); }
function photoDue() { const list = photoPlan(); let last = -1; list.forEach((p, i) => { if (photoTaken(p, i, list)) last = i; }); return list.find((p, i) => i > last) || null; }

// ---------- アイコン ----------
const tick = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const icMirror = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="10" rx="6" ry="8"/><path d="M12 18v4M8 22h8"/></svg>';
const icCheck = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>';
const icCam = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
function spine(p) {
  const n = 9, amp = 15 * (1 - p), pts = [];
  for (let i = 0; i < n; i++) pts.push([43 + amp * Math.sin((i / (n - 1)) * Math.PI * 1.35 - 0.35), 14 + i * 15.5]);
  const lit = Math.round(p * n * 2.2);
  return `<svg class="spine" viewBox="0 0 86 150" aria-hidden="true"><line x1="43" y1="6" x2="43" y2="146" stroke="currentColor" stroke-opacity=".28" stroke-dasharray="3 4"/><path d="M${pts.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' L')}" fill="none" stroke="currentColor" stroke-opacity=".55" stroke-width="2"/>${pts.map((q, i) => `<ellipse cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" rx="${9 - i * .25}" ry="5.2" fill="${i < lit ? 'var(--spine)' : 'currentColor'}" fill-opacity="${i < lit ? 1 : .35}"/>`).join('')}</svg>`;
}
function row(i) {
  const on = !!S.form.checks[i.k];
  return `<div class="item"><button type="button" class="check" aria-pressed="${on}" aria-label="${esc(i.t)} を完了" data-k="${esc(i.k)}">${tick}</button><div><div class="t"><span class="code">${esc(i.code)}</span>${esc(i.t)}${i.lvl ? `<span class="lvl ${esc(i.lvl)}">${esc(i.lvl)}</span>` : ''}</div>${i.s ? `<div class="s">${esc(i.s)}</div>` : ''}</div>${i.link ? `<a class="play" href="${esc(i.link)}" target="_blank" rel="noopener">▶ 見る</a>` : '<span class="play" style="opacity:.5">準備中</span>'}</div>`;
}

// ---------- 今日 ----------
function hero(sub) {
  const m = S.data.member, d = S.day, R = roadmapWeek(Math.min(S.week, 26)), P = S.P;
  const prog = Math.max(0, Math.min(1, d / 182));
  const chips = [R.phase ? R.phase.replace(/^\d\s*/, 'フェーズ' + (R.phase[0] || '') + ' ') : '', P && P.D ? P.D[1] : '', m.plan, ...msFor(R.milestone)].filter(Boolean);
  return `<section class="hero" aria-label="今日の状況"><div class="hero-top"><div>
    <div class="hello">${md(S.today)}（${DOW[S.today.getDay()]}）　${esc(m.name)}さん</div>
    <div class="day"><span class="dl">${d >= 1 ? 'DAY' : 'START'}</span><span class="dn">${d >= 1 ? d : '0'}</span><small class="num">/ 182</small></div>
    <div class="wk">${d >= 1 ? '第' + S.week + '週「' + esc(R.theme) + '」' : 'はじまるまで、あと' + (1 - d) + '日'}</div>
    <div class="chips">${chips.map(c => `<span class="chip">${esc(c)}</span>`).join('')}</div>${sub || ''}
  </div>${spine(prog)}</div>
  <div class="bar" aria-hidden="true"><i style="width:${(prog * 100).toFixed(1)}%"></i></div>
  <div class="barlbl"><span>スタート</span><span class="num">${Math.round(prog * 100)}%</span><span>卒業 DAY182</span></div></section>`;
}

function zoomCard() {
  const m = S.data.member; if (m.plan !== 'VIP') return '';
  const at = parseD(m.zoomAt);
  const past = at && (S.now || new Date()) - at > 2 * 3600e3;
  if (!at || past) return `<div class="zoom"><div class="zi"><span class="num">Z</span></div><div><b>次のZoom面談</b><p>次回の日程は調整中です。決まり次第ここに表示されます。</p></div></div>`;
  const n = dayDiff(at, S.today);
  const no = Object.keys(ZOOM_NO).map(Number).find(w => w >= S.week);
  const link = /^https?:\/\//.test(m.zoomLink) ? m.zoomLink : '';
  return `<div class="zoom"><div class="zi"><span class="num">${no ? ZOOM_NO[no] : 'Z'}</span><small>/12</small></div><div><b>次のZoom面談　${md(at)}（${DOW[at.getDay()]}）${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}</b>
    <p>${n > 0 ? 'あと' + n + '日。' : n === 0 ? '今日です。' : ''}${photoDue() && photoDue().l.startsWith('Zoom') ? 'それまでに<strong>横向きの姿勢写真</strong>を撮っておきましょう。' : '気になっていることをメモしておきましょう。'}</p>
    ${link ? `<p style="margin-top:8px"><a class="btn" href="${esc(link)}" target="_blank" rel="noopener">Zoomに参加する</a></p>` : '<p style="margin-top:4px">参加リンクは前日までにここに表示されます。</p>'}</div></div>`;
}

function supportBar() {
  const e = supportEnd(); if (!e) return '';
  const n = dayDiff(e, S.today);
  const vip = S.data.member.plan === 'VIP';
  if (n < 0) return `<div class="support"><b>${vip ? 'サポート期間' : 'LINEでの質問サポート'}は${md(e)}で終了しました</b>記録・動画・毎月の見直しは、このまま続けられます。</div>`;
  return `<div class="support"><b>${vip ? 'サポート期間' : 'LINEでの質問サポート'}：${md(e)}まで</b>${n <= 30 ? 'あと' + n + '日です。延長や、その後のご案内は担当からご連絡します。' : '気になることは公式LINEで気軽に質問してください。'}</div>`;
}

function goalCard() {
  const g = S.data.member.goal;
  if (!goalSet()) return `<section class="goal card gcta"><div class="gk">MY GOAL</div><h2 style="margin-top:6px">まだ目標が決まっていません</h2><p>卒業のときに達成したい目標を、最初に具体的に決めましょう（約10分）。</p><button type="button" id="goal-start">目標設定をはじめる</button></section>`;
  return `<section class="goal card" aria-label="わたしの目標"><button type="button" class="gedit" id="goal-edit">編集</button><div class="gk">MY GOAL・${goalCyc() > 1 ? '第' + goalCyc() + '期の目標' : '卒業目標'}</div><div class="gt">${esc(g.scene)}</div>${g.needs ? `<div class="needs">お悩み：${esc(g.needs)}</div>` : ''}
    <div class="gl">${g.targets.map((t, i) => goalRow(t, i)).join('')}</div>
    <div class="gfoot">${goalCyc() > 1 ? '第' + goalCyc() + '期のゴール：' + md(monthDate(6 * goalCyc())) + 'の最終見直しで、3つのうち2つ以上の達成' : '卒業の条件：DAY182の測定③で、卒業目標3つのうち2つ以上を達成すること'}${nextReview() && mStart() ? '<br>次の見直し：' + md(monthDate(nextReview())) + '（あと' + dayDiff(monthDate(nextReview()), S.today) + '日）<button type="button" class="linkbtn" data-v="review">進み具合を見る</button>' : ''}</div>
    ${S.data.member.coach ? `<div class="coach"><i>加藤</i><div><small>担当からひとこと</small>${esc(S.data.member.coach)}</div></div>` : ''}</section>`;
}
function goalSeries(i) {
  const t = S.data.member.goal.targets[i], k = S.goalLink[i];
  const st = parseD(S.data.member.start), d0 = cycleDays(goalCyc() || 1)[0];
  const pts = S.data.records.map(r => { const v = k >= 0 ? r.v[k] : r.g[i]; const d = parseD(r.date); return v != null && d && st ? [dayDiff(d, st) + 1, v] : null; }).filter(p => p && p[0] >= d0).sort((a, b) => a[0] - b[0]);
  if (t.start != null && (!pts.length || pts[0][0] > d0)) pts.unshift([d0, t.start]);
  return pts;
}
function achieved(t, now) { if (now == null || t.target == null || t.start == null) return false; return t.target < t.start ? now <= t.target : now >= t.target; }
function goalRow(t, i) {
  const ser = goalSeries(i), now = ser.length ? ser[ser.length - 1][1] : null, u = unitOf(t.label);
  const left = now != null && t.target != null ? Math.abs(t.target - now) : null;
  const nx = nextReview(), mt = nx && mStart() ? msTarget(i, nx) : null;
  const dots = mStart() ? [1, 2, 3, 4, 5, 6].map(k => { const n = 6 * ((goalCyc() || 1) - 1) + k, v = msTarget(i, n); return v != null ? [dayDiff(monthDate(n), mStart()) + 1, v] : null; }).filter(Boolean) : [];
  return `<div><div class="top"><b>${esc(nameOf(t.label))}</b><span>${achieved(t, now) ? '達成！' : left != null ? '達成まであと <span class="num">' + (+left.toFixed(1)) + '</span>' + esc(u) : ''}</span></div>${ser.length > 1 || dots.length ? mini(ser, t.start, t.target, dots) : ''}<div class="vals"><span>スタート <span class="num">${t.start ?? '—'}</span></span><span>いま <em class="num">${now ?? '—'}</em>${esc(u)}</span>${mt != null ? `<span>今月の中間 <span class="num">${mt}</span></span>` : ''}<span>目標 <span class="num">${t.target ?? '—'}</span></span></div></div>`;
}
function mini(ser, start, goal, dots) {
  dots = dots || [];
  const W = 320, H = 64, pl = 4, pr = 40, pt = 8, pb = 8; const ys = [...ser.map(p => p[1]), ...dots.map(p => p[1]), start, goal].filter(v => v != null);
  let lo = Math.min(...ys), hi = Math.max(...ys); const pad = (hi - lo) * .12 || 1; lo -= pad; hi += pad;
  const [d0, d1] = cycleDays(goalCyc() || 1);
  const X = d => pl + (Math.max(d0, Math.min(d, d1)) - d0) / Math.max(1, d1 - d0) * (W - pl - pr), Y = v => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  if (!ser.length) ser = [[d0, start]];
  const line = ser.map(p => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join(' '), last = ser[ser.length - 1];
  const dotSvg = dots.map(p => `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="3" fill="var(--surface)" stroke="var(--sun)" stroke-width="1.6"/>`).join('');
  return `<svg class="gchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="推移のグラフ">${goal != null ? `<line x1="${pl}" x2="${W - pr}" y1="${Y(goal)}" y2="${Y(goal)}" stroke="var(--sun)" stroke-dasharray="4 4"/><text x="${W - pr + 4}" y="${Y(goal) + 4}" font-size="11" fill="var(--sun-ink)" font-weight="700">目標</text>` : ''}<line x1="${X(Math.max(S.day, 1))}" x2="${X(Math.max(S.day, 1))}" y1="${pt}" y2="${H - pb}" stroke="var(--line)"/>${dotSvg}<polyline points="${line}" fill="none" stroke="var(--primary)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${X(last[0])}" cy="${Y(last[1])}" r="4.5" fill="var(--primary)" stroke="var(--surface)" stroke-width="2"/><text x="${W - pr + 4}" y="${H - pb}" font-size="10" fill="var(--faint)">6ヶ月</text></svg>`;
}

function vToday() {
  const P = S.P = plan(S.day), m = S.data.member;
  const wr = recInWeek(S.week), streakN = streak();
  const trainItems = P.train.map(c => { const T = C().train[c]; return T ? { k: 't' + c, code: c, t: T[0], link: T[1], s: '', lvl: T[2], alt: T[3] } : null; }).filter(Boolean);
  const head = P.head;
  const mi = missed();
  const due = photoDue();
  const photoNow = due && due.d <= S.day;
  const isCheckDay = P.dow === 6;
  const total = P.body.length + trainItems.length + head.length + 1;
  const done = Object.keys(S.form.checks).filter(k => S.form.checks[k] && (P.body.some(i => i.k === k) || trainItems.some(i => i.k === k) || head.some(i => i.k === k))).length + (S.form.mirror ? 1 : 0);
  const goalFields = m.goal.targets.map((t, i) => ({ t, i })).filter(x => S.goalLink[x.i] < 0);
  const tw = String(P.R.freq || '');
  return hero() + reviewCard() + `
  <div class="meter"><div class="dots" aria-label="今週の記録 ${wr}日">${[1, 2, 3].map(i => `<span class="${i <= wr ? 'on' : ''}">${i <= wr ? '✓' : i}</span>`).join('')}</div>
    <div><b>今週 ${Math.min(wr, 7)}/3日 記録</b><p>${wr >= 3 ? '今週の延長保証ラインをクリアしました' : 'あと' + (3 - wr) + '日で今週の延長保証ラインをクリア'}</p></div></div>
  ${zoomCard()}${supportBar()}
  <div class="streak"><div class="stat"><div class="v">${streakN}<small>日</small></div><div class="k">連続記録</div></div><div class="stat"><div class="v">${S.data.records.length}<small>日</small></div><div class="k">これまでの記録</div></div><div class="stat"><div class="v">${S.week}<small>/26週</small></div><div class="k">いまの週</div></div></div>
  ${goalCard()}
  ${S.day >= 1 ? `<section class="sec"><div class="sec-h"><h2>からだ</h2><span class="aside">毎日のストレッチ2本</span></div><div class="card">${P.body.map(row).join('') || '<div class="note">今日のストレッチはありません。</div>'}</div></section>` : ''}
  ${trainItems.length ? `<section class="sec"><div class="sec-h"><h2>トレーニング</h2><span class="aside">今週は${esc(tw)}</span></div><div class="card">${trainItems.map(i => row(i) + (i.alt && C().train[i.alt] ? `<div class="easier">難しいときは <a href="${esc(C().train[i.alt][1])}" target="_blank" rel="noopener">${esc(i.alt)} ${esc(C().train[i.alt][0])}</a></div>` : '')).join('')}<div class="note">${esc(tw)}が目安。やった日にチェックを入れてください。</div></div></section>` : ''}
  <section class="sec"><div class="sec-h"><h2>あたま</h2><span class="aside">今週見る動画</span></div><div class="card">${head.map(row).join('') || '<div class="note">今週の必修動画はありません。困ったときは「道のり」の辞書から選べます。</div>'}${mi.length ? `<details class="catch"><summary><span style="all:unset">見のがした動画が <b>${mi.length}本</b> あります</span><span>時間のあるときに</span></summary>${mi.map(l => row({ k: 'l' + l.code, code: l.code, t: l.title, link: l.link, s: '第' + l.week + '週の動画' + (l.min ? '・' + l.min + '分' : '') })).join('')}</details>` : ''}</div></section>
  ${P.opt.length ? `<section class="sec"><div class="sec-h"><h2>任意</h2><span class="aside">希望する人だけ</span></div><div class="card">${P.opt.map(l => row({ k: 'l' + l.code, code: l.code, t: l.title, link: l.link, s: '第6章・' + (l.min || '') + '分' })).join('')}</div></section>` : ''}
  <section class="sec"><div class="sec-h"><h2>姿勢のチェック</h2><span class="aside">スケジュール</span></div>
  <div class="sched">
    <div class="sch today ${S.form.mirror ? 'done' : ''}"><div class="ic">${icMirror}</div><b>鏡チェック</b><span class="when">毎日・今日</span></div>
    <div class="sch ${isCheckDay ? 'today' : ''}"><div class="ic">${icCheck}</div><b>姿勢チェック</b><span class="when">${isCheckDay ? '今日（週1回）' : '毎週' + DOW[addDays(S.today, 6 - P.dow).getDay()] + '曜日'}</span></div>
    <div class="sch ${photoNow ? 'today' : ''}"><div class="ic">${icCam}</div><b>姿勢の撮影</b><span class="when">${due ? (photoNow ? esc(due.l) + '（今週）' : 'DAY' + due.d + '（あと' + (due.d - S.day) + '日）') : '—'}</span></div>
  </div>
  <div class="card" style="margin-top:10px">
    <div class="item"><button type="button" class="check" aria-pressed="${!!S.form.mirror}" aria-label="鏡チェック" data-mirror="○">${tick}</button><div><div class="t">鏡チェック</div><div class="s">横向きで耳・肩・骨盤が一直線か見る（10秒）</div></div><span></span></div>
    <div class="feel" role="group" aria-label="今日の姿勢の感じ">${['◎ いい感じ', '○ ふつう', '△ 崩れ気味'].map(x => `<button type="button" data-mirror="${x[0]}" aria-pressed="${S.form.mirror === x[0]}">${x}</button>`).join('')}</div>
  </div></section>
  <section class="sec"><div class="sec-h"><h2>わたしの記録</h2><span class="aside">わかる項目だけでOK</span></div>
  <div class="card"><div class="fields">
    ${S.fields.map((f, i) => f.range ? `<div class="field"><label for="f-${i}">${esc(f.label)} <span class="num" id="o-${i}">${S.form.v[i] === '' ? '—' : S.form.v[i]} / 10</span></label><input type="range" id="f-${i}" min="0" max="10" step="1" value="${S.form.v[i] === '' ? 5 : S.form.v[i]}" data-f="${i}"><div class="scale"><span>0 なし</span><span>10 最大</span></div></div>`
      : `<div class="field"><label for="f-${i}">${esc(f.label)} <span>${esc(f.unit)}</span></label><input type="number" inputmode="decimal" id="f-${i}" step="any" value="${esc(S.form.v[i])}" data-f="${i}"></div>`).join('')}
    ${goalFields.map(({ t, i }) => `<div class="field"><label for="g-${i}">${esc(nameOf(t.label))} <span>卒業目標・測ったときだけ</span></label><input type="number" inputmode="decimal" id="g-${i}" step="any" value="${esc(S.form.g[i])}" data-g="${i}"></div>`).join('')}
    <div class="field"><label for="f-note">ひとこと <span>任意</span></label><textarea id="f-note" placeholder="体の変化、気づいたことなど">${esc(S.form.note)}</textarea></div>
  </div></div></section>
  <button type="button" class="save" id="save" ${S.busy ? 'disabled' : ''}>${S.form.saved ? '今日の記録を更新する' : '今日の記録を保存'} <span class="p num">${done}/${total}</span></button>`;
}

function vWaiting() {
  return `<section class="card msgcard"><img src="logo-full.webp" alt="Teras Lab. RESHAPE" style="width:160px"><h2>目標の登録ありがとうございます</h2><p>いま担当がプランと開始日を設定しています。準備ができると、毎日のメニューがここに表示されます。もうしばらくお待ちください。</p></section>${goalCard()}`;
}

// ---------- 卒業生・終了 ----------
function results() {
  return S.data.member.goal.targets.map((t, i) => { const s = goalSeries(i); const now = s.length ? s[s.length - 1][1] : null; return { t, now, ok: achieved(t, now) }; });
}
function vGrad() {
  const res = results(), n = res.filter(r => r.ok).length;
  const st = parseD(S.data.member.start), since = st ? Math.max(0, S.day - 182) : 0;
  const D = dailyOf(S.day);
  const items = D ? [['s1', D[3]], ['s2', D[4]]].map(([k, c]) => C().stretch[c] ? { k, code: c, t: C().stretch[c][0], link: C().stretch[c][1], s: 'ストレッチ' } : null).filter(Boolean) : [];
  return `<section class="hero"><div class="hero-top"><div><div class="hello">${md(S.today)}（${DOW[S.today.getDay()]}）　${esc(S.data.member.name)}さん</div><div class="day"><span class="dl">${S.data.member.status === '卒業生' ? 'RESHAPE 卒業生' : 'RESHAPE 第' + curCycle() + '期'}</span><span class="dn">${since}</span><small class="num">日目</small></div><div class="wk">ここからは自分で続ける番です</div><div class="chips"><span class="chip">182日 完走</span>${goalCyc() > 1 ? `<span class="chip">第${goalCyc()}期の目標に挑戦中</span>` : `<span class="chip">卒業目標 ${n}/${res.length} 達成</span>`}${S.data.member.status === '卒業生' ? '<span class="chip">卒業生コミュニティ</span>' : ''}</div></div>${spine(1)}</div></section>
  ${reviewCard()}${goalCard()}
  <div class="meter"><div class="dots">${[1, 2, 3].map(i => `<span class="${i <= Math.min(3, recThisCalWeek()) ? 'on' : ''}">${i <= recThisCalWeek() ? '✓' : i}</span>`).join('')}</div><div><b>今週 ${recThisCalWeek()}日</b><p>卒業後も、週3日を目安に続けましょう</p></div></div>
  <section class="sec"><div class="sec-h"><h2>今日のストレッチ</h2></div><div class="card">${items.map(row).join('')}<div class="note">困ったときは「道のり」の辞書から選べます。</div></div></section>
  ${recordBlock()}`;
}
function recThisCalWeek() { const mon = addDays(S.today, -((S.today.getDay() + 6) % 7)); return S.data.records.filter(r => { const d = parseD(r.date); return d && d >= mon && d <= S.today; }).length; }
function recordBlock() {
  return `<section class="sec"><div class="sec-h"><h2>わたしの記録</h2></div><div class="card"><div class="fields">${S.fields.map((f, i) => `<div class="field"><label for="f-${i}">${esc(f.label)} <span>${esc(f.unit)}</span></label><input type="number" inputmode="decimal" id="f-${i}" step="any" value="${esc(S.form.v[i])}" data-f="${i}"></div>`).join('')}<div class="field"><label for="f-note">ひとこと</label><textarea id="f-note">${esc(S.form.note)}</textarea></div></div></div></section>
  <button type="button" class="save" id="save">${S.form.saved ? '今日の記録を更新する' : '今日の記録を保存'}</button>`;
}
function vEnded() {
  const res = results(), n = res.filter(r => r.ok).length, e = supportEnd();
  return `<section class="card msgcard"><img src="logo-full.webp" alt="Teras Lab. RESHAPE" style="width:150px"><h2>サポート期間が終了しました</h2><p>${md(e)}でサポート期間が終わりました。ここまで本当にお疲れさまでした。これまでの記録と姿勢写真は、下のメニューから見返せます。</p></section>
  <section class="goal card"><div class="gk">RESULT・卒業目標</div><div class="res" style="padding:10px 0 0">${res.map(r => `<div><i class="${r.ok ? 'ok' : 'ng'}">${r.ok ? '✓' : '…'}</i><span>${esc(nameOf(r.t.label))}</span><span class="num"><b>${r.t.start ?? '—'} → ${r.now ?? '—'}</b>${esc(unitOf(r.t.label))}</span></div>`).join('')}</div>
  <div class="gfoot">${n >= 2 ? '卒業目標を達成しました。卒業生コミュニティのご案内を担当からお送りします。' : '延長や、今後の続け方については担当からご連絡します。'}</div></section>`;
}

// ---------- 記録 ----------
function vLog() {
  const st = parseD(S.data.member.start);
  if (!st) return `<section class="card msgcard"><h2>まだ記録がありません</h2><p>開始日が決まると、ここにカレンダーが表示されます。</p></section>`;
  const recs = {}; S.data.records.forEach(r => { const d = parseD(r.date); if (d) recs[dayDiff(d, st) + 1] = r; });
  const phs = new Set(S.data.photos.map(p => p.day));
  const span = Math.max(28, Math.ceil(Math.max(S.day, 1) / 7) * 7 + 7), from = Math.max(1, Math.ceil(Math.max(S.day, 1) / 7) * 7 - 55);
  let cells = '';
  for (let i = 0; i < (addDays(st, from - 1).getDay()); i++) cells += '<span></span>';
  for (let d = from; d <= Math.min(from + 62, span + from); d++) {
    const r = recs[d];
    let cls = d > S.day ? 'future' : r ? (r.s1 && r.s2 ? 'rec' : 'part') : 'miss';
    if (d === S.day) cls += ' today'; if (S.sel === d) cls += ' sel';
    cells += `<button type="button" class="${cls}" data-day="${d}" aria-label="DAY${d} ${md(addDays(st, d - 1))}" ${d > S.day ? 'disabled' : ''}>${addDays(st, d - 1).getDate()}${phs.has(d) ? '<i class="ph"></i>' : ''}</button>`;
  }
  const s = S.sel, r = recs[s];
  const det = s ? `<div class="detail"><div class="row"><b>DAY ${s}（${md(addDays(st, s - 1))}）</b><span>第${Math.ceil(s / 7)}週</span></div>${r ? `
    <div class="row"><span>ストレッチ</span><span>${esc([r.s1, r.s2].filter(Boolean).join('・') || '—')}</span></div>
    <div class="row"><span>トレーニング</span><span>${esc(r.train || '—')}</span></div>
    <div class="row"><span>見た動画</span><span>${esc(r.watched || '—')}</span></div>
    <div class="row"><span>鏡チェック</span><span>${esc(r.mirror || '—')}</span></div>
    ${S.fields.map((f, i) => `<div class="row"><span>${esc(f.label)}</span><span class="num">${r.v[i] ?? '—'} ${esc(f.unit)}</span></div>`).join('')}
    ${r.note ? `<div class="row"><span>ひとこと</span><span>${esc(r.note)}</span></div>` : ''}` : '<div class="row"><span>記録なし</span></div>'}</div>` : '';
  const badges = [[7, '1週間'], [21, '3週間'], [30, '1ヶ月'], [60, '2ヶ月'], [91, '折り返し'], [120, '4ヶ月'], [150, '5ヶ月'], [182, '完走']];
  const series = S.fields.map((f, i) => ({ f, i, pts: S.data.records.map(r => { const d = parseD(r.date); return r.v[i] != null && d ? [dayDiff(d, st) + 1, r.v[i]] : null; }).filter(Boolean).sort((a, b) => a[0] - b[0]) }));
  const cur = series[S.chart] || series[0];
  const prog = progressBlock();
  return `${prog ? `<section class="sec" style="margin-top:4px"><div class="sec-h"><h2>毎月の中間目標</h2><button type="button" class="linkbtn" data-v="review">見直しページへ</button></div><div class="card">${prog}</div></section>` : ''}
  <section class="sec" style="margin-top:4px"><div class="sec-h"><h2>記録カレンダー</h2><span class="aside">日付を押すと中身が見られます</span></div>
  <div class="card"><div class="cal">${'日月火水木金土'.split('').map(x => `<span class="dh">${x}</span>`).join('')}${cells}</div>
  <div class="legend"><span><i style="background:var(--primary)"></i>できた</span><span><i style="background:var(--primary-soft)"></i>一部</span><span><i style="border:1.5px dashed var(--line)"></i>記録なし</span><span><i style="background:var(--sun);border-radius:50%"></i>姿勢写真</span></div>${det}</div></section>
  <section class="sec"><div class="sec-h"><h2>変化のグラフ</h2></div>
  <div class="card"><div class="charttabs" role="group" aria-label="グラフの項目">${series.map(x => `<button type="button" data-chart="${x.i}" aria-pressed="${S.chart === x.i}">${esc(x.f.label)}</button>`).join('')}</div>
  <div class="chart">${cur && cur.pts.length > 1 ? chart(cur) : '<p style="padding:14px;color:var(--muted);font-size:13px">記録が2日分たまるとグラフが出ます。</p>'}</div></div></section>
  <section class="sec"><div class="sec-h"><h2>達成バッジ</h2><span class="aside">記録した日数で解放</span></div>
  <div class="badges">${badges.map(b => `<div class="badge ${S.data.records.length >= b[0] ? 'got' : ''}"><div class="b">${b[0]}</div>${b[1]}</div>`).join('')}</div></section>`;
}
function chart(x) {
  const s = x.pts, W = 340, H = 170, pl = 34, pr = 12, pt = 12, pb = 26;
  const gi = S.goalLink.indexOf(x.i), tg = gi >= 0 ? S.data.member.goal.targets[gi].target : null;
  const ys = s.map(p => p[1]).concat(tg != null ? [tg] : []); let lo = Math.min(...ys), hi = Math.max(...ys);
  if (x.f.range) { lo = 0; hi = 10; } else { const pad = (hi - lo) * .2 || 1; lo = Math.floor((lo - pad) * 2) / 2; hi = Math.ceil((hi + pad) * 2) / 2; }
  const d0 = s[0][0], d1 = Math.max(s[s.length - 1][0], d0 + 1);
  const X = d => pl + (d - d0) / (d1 - d0) * (W - pl - pr), Y = v => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  let g = ''; for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4; g += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${pl - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="10" fill="var(--faint)" font-family="Outfit">${+v.toFixed(1)}</text>`; }
  const ticks = [d0, Math.round((d0 + d1) / 2), d1].map(d => `<text x="${X(d)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--faint)" font-family="Outfit">D${d}</text>`).join('');
  const line = s.map(p => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join(' '), last = s[s.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(x.f.label)}の推移">${g}${ticks}<polygon points="${X(s[0][0])},${H - pb} ${line} ${X(last[0])},${H - pb}" fill="var(--primary)" fill-opacity=".10"/>${tg != null ? `<line x1="${pl}" x2="${W - pr}" y1="${Y(tg)}" y2="${Y(tg)}" stroke="var(--sun)" stroke-dasharray="4 4"/><text x="${W - pr}" y="${Y(tg) - 4}" text-anchor="end" font-size="10" fill="var(--sun-ink)" font-weight="700">目標 ${tg}</text>` : ''}<polyline points="${line}" fill="none" stroke="var(--primary)" stroke-width="2.2" stroke-linejoin="round"/><circle cx="${X(last[0])}" cy="${Y(last[1])}" r="5" fill="var(--sun)" stroke="var(--surface)" stroke-width="2"/></svg>`;
}

// ---------- 姿勢写真 ----------
function vPhoto() {
  const ph = [...S.data.photos].sort((a, b) => a.day - b.day);
  if (S.cmp.length < 2 && ph.length) S.cmp = [ph[0].day, ph[ph.length - 1].day];
  const byDay = d => ph.find(p => p.day === d);
  const shot = d => { const p = byDay(d); const id = p ? (S.cmpSide === 'front' ? p.front : p.side) || p.side || p.front : ''; const src = id && S.photoCache[id]; return `<div class="shot">${src ? `<img src="${src}" alt="DAY${d}の写真">` : `<div class="ph-empty">${id ? '読み込み中…' : '写真なし'}</div>`}<div class="grid-line"></div><span class="cap">DAY ${d}</span></div>`; };
  const list = photoPlan(), due = photoDue(), ended = S.mode === 'ended';
  return `<section class="sec" style="margin-top:4px"><div class="sec-h"><h2>ビフォー・アフター</h2><span class="aside">オレンジ線は垂直の目安</span></div>
  <div class="card">${ph.length ? `<div class="sideseg" role="group" aria-label="向き" style="padding-top:14px"><button type="button" data-side="side" aria-pressed="${S.cmpSide === 'side'}">横向き</button><button type="button" data-side="front" aria-pressed="${S.cmpSide === 'front'}">正面</button></div><div class="cmp">${shot(S.cmp[0])}${shot(S.cmp[1] ?? S.cmp[0])}</div>
  <div class="pick" role="group" aria-label="比べる写真">${ph.map(p => `<button type="button" data-cmp="${p.day}" aria-pressed="${S.cmp.includes(p.day)}">DAY ${p.day}</button>`).join('')}</div>` : '<p style="padding:14px;color:var(--muted);font-size:13px">まだ写真がありません。最初の1枚を撮ってみましょう。</p>'}</div></section>
  ${ended ? '' : `<section class="sec"><div class="sec-h"><h2>写真を追加</h2><span class="aside">${due ? '次は ' + esc(due.l) + '（DAY' + due.d + '〜）' : ''}</span></div>
  <div class="card" style="padding-top:14px"><div class="two" style="padding:0 14px 14px">
    <div class="upload" style="margin:0"><b>正面</b><input type="file" id="ph-front" accept="image/*"><label for="ph-front">選ぶ</label></div>
    <div class="upload" style="margin:0"><b>横向き</b><input type="file" id="ph-side" accept="image/*"><label for="ph-side">選ぶ</label></div></div>
  <div class="tips"><div><b>1</b>壁から1歩離れ、足をそろえて立つ（頭から足先まで入れる）</div><div><b>2</b>スマホは胸の高さ・2m離して縦向き</div><div><b>3</b>毎回同じ場所・同じ服装で</div><div><b>4</b>選んだあと、足首が中央の線にくるよう自動で位置を合わせます</div></div></div></section>
  <section class="sec"><div class="sec-h"><h2>撮影スケジュール</h2><span class="aside">${S.data.member.plan === 'VIP' ? 'Zoom面談の前ごと' : '4週ごと'}</span></div>
  <div class="card">${list.map((p, i) => { const ok = photoTaken(p, i, list); return `<div class="item"><span class="check" aria-hidden="true" ${ok ? 'data-on' : ''}>${ok ? tick : ''}</span><div><div class="t">${esc(p.l)}</div><div class="s num">DAY ${p.d}〜</div></div><span class="pill ${ok ? 'good' : due && due.d === p.d ? (p.d <= S.day ? 'bad' : 'warn') : ''}">${ok ? '撮影済み' : due && due.d === p.d ? (p.d <= S.day ? '今撮りましょう' : '次回') : p.d < S.day ? '—' : '予定'}</span></div>`; }).join('')}</div></section>`}`;
}
async function loadPhotos() {
  const ids = []; S.cmp.forEach(d => { const p = S.data.photos.find(x => x.day === d); if (p) { const id = (S.cmpSide === 'front' ? p.front : p.side) || p.side || p.front; if (id && !S.photoCache[id]) ids.push(id); } });
  for (const id of ids) { try { const r = await api('getPhoto', { fileId: id }); S.photoCache[id] = r.dataUrl; if (S.view === 'photo') route(); } catch (e) { /* 表示できない写真は空欄のまま */ } }
}
// ---------- 姿勢写真の位置合わせ（足首を中央線・頭〜かかとを同じ高さに） ----------
const AL = { W: 900, H: 1200, TOP: 0.08, FOOT: 0.92 };
let posePromise = null;
function loadPose() {
  if (posePromise) return posePromise;
  const base = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  posePromise = (async () => {
    const v = await import(base + '/vision_bundle.mjs');
    const fs = await v.FilesetResolver.forVisionTasks(base + '/wasm');
    return v.PoseLandmarker.createFromOptions(fs, {
      baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', delegate: 'CPU' },
      runningMode: 'IMAGE', numPoses: 1
    });
  })();
  posePromise.catch(() => { posePromise = null; });
  return posePromise;
}
function loadImage(file, max) {
  return new Promise((ok, ng) => {
    const img = new Image(); const u = URL.createObjectURL(file);
    img.onload = () => { const r = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); ok(c); };
    img.onerror = ng; img.src = u;
  });
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, ng) => setTimeout(() => ng(new Error('timeout')), ms))]);
async function autoFit(src) {
  const pose = await withTimeout(loadPose(), 25000);
  const res = pose.detect(src);
  const L = res && res.landmarks && res.landmarks[0];
  if (!L) return null;
  const px = i => L[i].x * src.width, py = i => L[i].y * src.height;
  const shoulderY = (py(11) + py(12)) / 2, noseY = py(0);
  const headTop = Math.min(...[0, 1, 2, 3, 4, 5, 6, 7, 8].map(py)) - Math.max(0, shoulderY - noseY) * 0.75;
  const footY = Math.max(...[27, 28, 29, 30, 31, 32].map(py));
  const feetOk = [27, 28].some(i => (L[i].visibility ?? 1) > 0.5 && L[i].y < 1.02) && footY <= src.height * 1.02;
  if (!feetOk) { // 足先が写っていないときは、腰の真ん中を中央線にそろえるだけ
    const f = fitWhole(src), hx = (px(23) + px(24)) / 2;
    return { sc: f.sc, tx: AL.W / 2 - f.sc * hx, ty: f.ty, partial: true };
  }
  const cx = (px(27) + px(28)) / 2;
  const h = footY - headTop;
  if (!(h > 20)) return null;
  const sc = AL.H * (AL.FOOT - AL.TOP) / h;
  return { sc, tx: AL.W / 2 - sc * cx, ty: AL.H * AL.FOOT - sc * footY };
}
function fitWhole(src) {
  const sc = Math.min(AL.W / src.width, AL.H / src.height);
  return { sc, tx: (AL.W - src.width * sc) / 2, ty: (AL.H - src.height * sc) / 2 };
}
function drawAligned(ctx, src, t, k, guides) {
  const W = AL.W * k, H = AL.H * k;
  ctx.fillStyle = '#E9E6E0'; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(src, t.tx * k, t.ty * k, src.width * t.sc * k, src.height * t.sc * k);
  if (!guides) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(232,147,12,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
  ctx.setLineDash([8, 6]); ctx.strokeStyle = 'rgba(31,107,92,.9)';
  [AL.TOP, AL.FOOT].forEach(y => { ctx.beginPath(); ctx.moveTo(0, H * y); ctx.lineTo(W, H * y); ctx.stroke(); });
  ctx.setLineDash([]); ctx.fillStyle = 'rgba(31,107,92,.95)'; ctx.font = `700 ${Math.round(13 * k * 1.6)}px sans-serif`;
  ctx.fillText('頭のてっぺん', 8, H * AL.TOP - 6); ctx.fillText('かかと', 8, H * AL.FOOT - 6);
  ctx.restore();
}
function alignPhoto(src, side) {
  return new Promise(resolve => {
    const box = document.createElement('div'); box.className = 'align-wrap';
    box.innerHTML = `<div class="align-card" role="dialog" aria-modal="true" aria-label="写真の位置合わせ">
      <h2>${side === 'front' ? '正面' : '横向き'}の写真の位置合わせ</h2>
      <p class="align-msg" id="al-msg">自動で位置を合わせています…（初回は少し時間がかかります）</p>
      <div class="align-stage"><canvas id="al-cv"></canvas></div>
      <div class="align-zoom"><button type="button" data-al="out" aria-label="小さくする">－</button><input type="range" id="al-z" min="0.5" max="2" step="0.01" value="1" aria-label="大きさ"><button type="button" data-al="in" aria-label="大きくする">＋</button></div>
      <p class="align-help">オレンジの線に<b>${side === 'front' ? '両足の真ん中' : '足首（くるぶし）'}</b>、点線に<b>頭のてっぺん</b>と<b>かかと</b>がくるように、指で動かして調整できます。</p>
      <div class="align-btns"><button type="button" class="btn ghost" data-al="cancel">やめる</button><button type="button" class="btn ghost" data-al="auto">自動で合わせ直す</button><button type="button" class="btn" data-al="ok">この位置で保存</button></div></div>`;
    document.body.appendChild(box);
    const cv = box.querySelector('#al-cv'), ctx = cv.getContext('2d'), msg = box.querySelector('#al-msg'), z = box.querySelector('#al-z');
    const stage = box.querySelector('.align-stage');
    const k0 = Math.min(stage.clientWidth || 300, 420) / AL.W, dpr = window.devicePixelRatio || 1, k = k0 * dpr;
    cv.width = Math.round(AL.W * k); cv.height = Math.round(AL.H * k); cv.style.width = Math.round(AL.W * k0) + 'px'; cv.style.height = Math.round(AL.H * k0) + 'px';
    let t = fitWhole(src), base = t.sc;
    const draw = () => drawAligned(ctx, src, t, k, true);
    const setScale = (ns, cx = AL.W / 2, cy = AL.H / 2) => { ns = Math.max(base * 0.5, Math.min(base * 2, ns)); t.tx = cx - (cx - t.tx) * ns / t.sc; t.ty = cy - (cy - t.ty) * ns / t.sc; t.sc = ns; z.value = (t.sc / base).toFixed(2); draw(); };
    const runAuto = async () => {
      msg.textContent = '自動で位置を合わせています…（初回は少し時間がかかります）';
      try { const a = await autoFit(src); if (a) { t = a; base = a.sc; z.value = 1; msg.textContent = a.partial ? '足先まで写っていないため、横の位置だけ合わせました。頭から足先まで入れて撮り直すのがおすすめです。' : '自動で合わせました。ずれていたら指で動かして調整してください。'; } else { msg.textContent = '体を見つけられませんでした。指で動かして合わせてください。'; } }
      catch (e) { msg.textContent = '自動で合わせられませんでした。指で動かして合わせてください。'; }
      draw();
    };
    draw(); runAuto();
    const pts = new Map(); let last = null;
    const toOut = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / k0, y: (e.clientY - r.top) / k0 }; };
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, toOut(e)); last = null; });
    cv.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId), cur = toOut(e); pts.set(e.pointerId, cur);
      if (pts.size === 1) { t.tx += cur.x - prev.x; t.ty += cur.y - prev.y; draw(); }
      else if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (last) setScale(t.sc * d / last, (a.x + b.x) / 2, (a.y + b.y) / 2); last = d; }
    });
    const up = e => { pts.delete(e.pointerId); last = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    z.addEventListener('input', () => setScale(base * Number(z.value)));
    const close = v => { box.remove(); resolve(v); };
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-al]'); if (!b) return;
      const a = b.dataset.al;
      if (a === 'in') setScale(t.sc * 1.05); else if (a === 'out') setScale(t.sc / 1.05);
      else if (a === 'auto') runAuto(); else if (a === 'cancel') close(null);
      else if (a === 'ok') { const c = document.createElement('canvas'); c.width = AL.W; c.height = AL.H; drawAligned(c.getContext('2d'), src, t, 1, false); close(c.toDataURL('image/jpeg', .88)); }
    });
  });
}
function resize(file, max) {
  return new Promise((ok, ng) => {
    const img = new Image(); const u = URL.createObjectURL(file);
    img.onload = () => { const r = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); ok(c.toDataURL('image/jpeg', .85)); };
    img.onerror = ng; img.src = u;
  });
}

// ---------- 道のり ----------
function vMap() {
  const vip = S.data.member.plan === 'VIP';
  let h = '', ph = '';
  const mi = missed();
  C().roadmap.forEach(r => {
    if (r.phase !== ph) { ph = r.phase; h += `<div class="phase">${esc(ph.replace(/^(\d)\s*/, 'フェーズ$1　'))}</div>`; }
    const lecs = C().lectures.filter(l => l.week === r.week && /必修|目安|推奨/.test(l.kind) && !/^(MS|HB)-/.test(l.code));
    const ms = msFor(r.milestone);
    const miss = mi.filter(l => l.week === r.week).length;
    h += `<div class="wkrow ${r.week < S.week ? 'past' : r.week === S.week ? 'now' : ''}"><div class="n">${r.week === 0 ? '準備' : 'W' + r.week}</div><div><div class="th">${esc(r.theme)}${r.week === S.week ? '　<span class="pill warn">今週</span>' : ''}${miss ? '　<span class="pill bad">未視聴 ' + miss + '</span>' : ''}</div>
      <div class="mi">${r.train.length ? 'トレ ' + esc(r.freq) + '：' + esc(r.train.join('・')) : ''}${ms.length ? '<br>★ ' + esc(ms.join('／')) : ''}</div>
      ${lecs.length ? `<details class="wk-lec"${miss || r.week === S.week ? ' open' : ''}><summary>動画 ${lecs.length}本${miss ? '（未視聴 ' + miss + '）' : ''}</summary>${lecs.map(l => {
        const seen = S.watched.has(l.code), open = !!l.link;
        return `<div class="lec"><div class="lt"><span class="code">${esc(l.code)}</span>${esc(l.title)}<small>${esc(l.kind)}${l.min ? '・' + l.min + '分' : ''}</small></div>${seen ? `<span class="pill good">見た</span>` : ''}${open ? `<a class="play" href="${esc(l.link)}" target="_blank" rel="noopener" data-watch="${esc(l.code)}">▶ 見る</a>` : `<span class="lock">準備中</span>`}</div>`;
      }).join('')}</details>` : ''}</div></div>`;
  });
  const dict = ch => C().lectures.filter(l => l.kind === '辞書' && l.code.startsWith(ch + '-')).map(l => `<a href="${esc(l.link)}" target="_blank" rel="noopener"><b>${esc(l.code)}</b>${esc(l.title.replace(/^.*?（|）$/g, ''))}</a>`).join('');
  const opt = C().lectures.filter(l => l.kind === '任意');
  return `<section class="sec" style="margin-top:4px"><div class="sec-h"><h2>26週の道のり</h2><span class="aside">${vip ? 'VIP' : 'STANDARD'}</span></div><div class="card">${h}</div></section>
  <section class="sec"><div class="sec-h"><h2>困ったら辞書</h2><span class="aside">部位ごとのセルフケア・トレーニング</span></div>
  <div class="card"><div class="sec-h" style="padding:12px 14px 0;margin:0"><b style="font-size:13px">第4章 セルフケア</b></div><div class="dict">${dict('4')}</div><div class="sec-h" style="padding:4px 14px 0;margin:0"><b style="font-size:13px">第5章 トレーニング</b></div><div class="dict">${dict('5')}</div></div></section>
  ${opt.length ? `<section class="sec"><div class="sec-h"><h2>第6章 ダイエット</h2><span class="aside">希望する人だけ</span></div><div class="card">${opt.map(l => `<div class="item" style="grid-template-columns:1fr auto"><div><div class="t"><span class="code">${esc(l.code)}</span>${esc(l.title)}</div><div class="s">${l.week ? '第' + l.week + '週ごろ・' : ''}${l.min || ''}分</div></div><a class="play" href="${esc(l.link)}" target="_blank" rel="noopener">▶ 見る</a></div>`).join('')}</div></section>` : ''}`;
}

// ---------- 食事 ----------
function vMeal() {
  const vip = S.data.member.plan === 'VIP';
  if (supportOver()) return `<section class="card msgcard"><h2>食事サポート</h2><p>食事サポートは、サポート期間（${md(supportEnd())}まで）で終了しました。</p></section>`;
  S.chat[0].t = vip ? 'こんにちは、食事サポートです🍚\n食べたものの写真か、内容を送ってください。主食・主菜・副菜のバランスと、次の一食のヒントを返します。'
    : 'こんにちは、食事サポートです🍚\n食べたものや、迷っていることを文章で送ってください。主食・主菜・副菜のバランスと、次の一食のヒントを返します。';
  return `<section class="sec" style="margin-top:4px"><div class="sec-h"><h2>食事サポート</h2><span class="aside">LINEのメニューからも開けます</span></div>
  ${vip && S.week >= 9 ? '<div class="support" style="margin:0 0 10px"><b>VIP特典：食事写真へのフィードバック</b>送った食事写真に、加藤からもコメントが届きます。</div>' : ''}
  <div class="card"><div class="chat" id="chat">${S.chat.map(m => `<div class="msg ${m.r}">${m.img ? `<img src="${m.img}" alt="送った食事の写真">` : ''}${esc(m.t)}</div>`).join('')}${S.busy ? '<div class="msg bot">…</div>' : ''}</div>
  <div class="quick">${['朝ごはんを送る', 'コンビニで選ぶなら？', '間食したくなったら'].map(q => `<button type="button" data-q="${q}">${q}</button>`).join('')}</div>
  <form class="composer" id="meal-form">${vip ? `<label for="meal-img" aria-label="写真を送る">${icCam}</label><input type="file" id="meal-img" accept="image/*">` : ''}<input type="text" id="meal-txt" placeholder="例：鮭おにぎり、ゆで卵、サラダ" autocomplete="off"><button type="submit" class="send" aria-label="送信"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l16-8-6 16-3-7z"/></svg></button></form></div>
  <p style="font-size:12px;color:var(--muted)">返信はAIによる目安です。持病や服薬、強い痛みがある場合は担当か主治医に相談してください。</p></section>`;
}
async function sendMeal(text, img) {
  if (S.busy || (!text && !img)) return;
  S.chat.push({ r: 'me', t: text || 'この食事どうですか？', img }); S.busy = true; route();
  try { const r = await api('meal', { text, image: img || '' }); S.chat.push({ r: 'bot', t: String(r.reply || '').replace(/\*\*/g, '').replace(/^#+\s*/gm, '') }); }
  catch (e) { S.chat.push({ r: 'bot', t: 'すみません、送信できませんでした。通信の状態を確認して、もう一度送ってください。' }); }
  S.busy = false; route();
}

// ---------- 目標設定ワーク ----------
function workFromMember(m, next) {
  const g = m.goal; const t = g.targets;
  const def = [['体重（kg）', '', ''], ['', '', ''], ['', '', '']];
  const cycle = next ? curCycle() : (m.goalCycle || 1);
  const nowOf = i => { const sr = goalSeries(i); return sr.length ? sr[sr.length - 1][1] : (t[i].start ?? ''); };
  const tg = [0, 1, 2].map(i => t[i] ? (next ? [t[i].label, nowOf(i), ''] : [t[i].label, t[i].start ?? '', t[i].target ?? '']) : def[i]);
  const ms = [0, 1, 2].map(() => ['', '', '', '', '', '']);
  let has = false;
  if (!next) [1, 2, 3, 4, 5, 6].forEach(k => { const r = monthRow(6 * (cycle - 1) + k); if (r) r.targets.forEach((v, i) => { if (v != null) { ms[i][k - 1] = String(v); has = true; } }); });
  return {
    cycle, next: !!next,
    nay: g.needs ? g.needs.split('・').filter(Boolean) : [], top: g.top || '', why: g.why || '', ifnot: g.ifnot || '', scene: next ? '' : (g.scene || ''),
    tg, ms, msKey: has ? JSON.stringify(tg) : '',
    when: g.when || '', plan: g.plan || '', sign: ''
  };
}
const tgOk = t => t[0] && t[1] !== '' && t[2] !== '' && !isNaN(Number(t[1])) && !isNaN(Number(t[2]));
function autoMs(force) {
  const a = S.work, key = JSON.stringify(a.tg);
  if (!force && a.msKey === key) return;
  a.tg.forEach((t, i) => { if (!tgOk(t)) return; const st = Number(t[1]), tg = Number(t[2]);
    for (let k = 1; k <= 6; k++) { const r = monthRow(6 * (a.cycle - 1) + k); if (r && r.doneAt) continue; a.ms[i][k - 1] = String(k === 6 ? tg : rnd(st + (tg - st) * k / 6, t[1], t[2], t[0])); } });
  a.msKey = key;
}
function vWork() {
  const s = S.ws, a = S.work, m = S.data.member;
  const cy = a.cycle, endD = mStart() ? monthDate(6 * cy) : null;
  if (s < 0) return a.next
    ? `<section class="card intro"><img src="logo-full.webp" alt="Teras Lab. RESHAPE"><h2>第${cy}期の目標を決めましょう</h2><p>6ヶ月、本当におつかれさまでした。ここからの6ヶ月（${endD ? md(endD) + 'まで' : '次の6ヶ月'}）で届きたい姿と、毎月の中間目標を決めます。</p><ul><li>所要時間は約10分</li><li>「いまの値」には今の数字が入っています</li><li>毎月の見直しの日に、LINEでお知らせします</li></ul><button type="button" class="go" id="w-start">目標設定をはじめる</button>${goalSet() ? '<button type="button" class="back" id="w-cancel" style="margin-top:8px">あとで決める</button>' : ''}</section>`
    : `<section class="card intro"><img src="logo-full.webp" alt="Teras Lab. RESHAPE"><h2>ようこそ、${esc(m.name || '')}さん</h2><p>RESHAPEは、26週間（182日）で「なりたい自分」に届くためのプログラムです。はじめに、6ヶ月後に達成したい目標と、そこへ向かう毎月の中間目標を一緒に決めましょう。</p><ul><li>所要時間は約10分、7つのステップに答えるだけ</li><li>決めた目標は毎日の画面にずっと表示されます</li><li>毎月1回、見直しの日にLINEでお知らせします</li><li>あとからいつでも編集できます</li></ul><button type="button" class="go" id="w-start">目標設定をはじめる</button></section>`;
  const q = (id, label, v, ta, ph) => `<div class="q"><label for="w-${id}">${label}</label>${ta ? `<textarea id="w-${id}" data-w="${id}" placeholder="${esc(ph || '')}">${esc(v)}</textarea>` : `<input type="text" id="w-${id}" data-w="${id}" value="${esc(v)}" placeholder="${esc(ph || '')}">`}</div>`;
  const bodies = [
    `<div class="lead">まずは今の体の状態と、一番なんとかしたいことを書き出します。</div><div class="q"><label>気になっていること<small>いくつでも</small></label><div class="opts">${NAY.map(n => `<button type="button" data-nay="${n}" aria-pressed="${a.nay.includes(n)}">${n}</button>`).join('')}</div></div>${q('top', 'その中で、一番解決したいこと', a.top, 1, '例：朝起きたときの腰のこわばりをなくしたい')}`,
    `<div class="lead">理由がはっきりしている人ほど、途中でやめません。遠慮せず本音で書いてください。</div>${q('why', 'なぜ、いま変わりたいのですか？', a.why, 1)}${q('ifnot', 'このまま何もしなかったら、1年後どうなっていそうですか？', a.ifnot, 1)}`,
    `<div class="lead">${cy > 1 ? '次の6ヶ月（' + (endD ? md(endD) + 'まで' : '6ヶ月後') + '）の自分' : '6ヶ月後、卒業するときの自分'}を「場面」で思い浮かべます。誰と、どこで、何をしていますか。</div>${q('scene', '6ヶ月後の理想の場面', a.scene, 1, '例：日曜の朝、孫と公園を1時間歩いている')}`,
    `<div class="lead">理想の場面を、測れる数字に置きかえます。${cy > 1 ? 'この数字が第' + cy + '期の目標になり、' + (endD ? md(endD) : '6ヶ月後') + 'の最終見直しで確認します。' : 'この数字が<b>卒業目標</b>になり、DAY182の測定③で判定します。'}項目名の後ろに（単位）をつけてください。</div>
     ${a.tg.map((t, i) => `<div class="tgt"><span class="h full">卒業目標 ${i + 1}</span><input class="full" type="text" aria-label="卒業目標${i + 1}の項目" data-tg="${i},0" value="${esc(t[0])}" placeholder="${['体重（kg）', '朝の腰の痛み（0〜10）', '公園を休まず歩ける時間（分）'][i]}"><span class="h">いまの値</span><span class="h">6ヶ月後の目標</span><input type="text" inputmode="decimal" aria-label="卒業目標${i + 1}のいまの値" data-tg="${i},1" value="${esc(t[1])}"><input type="text" inputmode="decimal" aria-label="卒業目標${i + 1}の目標" data-tg="${i},2" value="${esc(t[2])}"></div>`).join('')}
     <div class="hint">よい目標のコツ：①自分で測れる（体重計・0〜10の点数・時間など）②6ヶ月で届く、少しがんばる数字 ③「痛みがなくなる」ではなく「朝の痛みが2以下」のように言い切る。${cy > 1 ? '' : '<br>数字は初回の面談で加藤と一緒に最終決定します。'}</div>`,
    `<div class="lead">6ヶ月後の目標までを、1ヶ月ごとの小さなゴールに分けます。数字は自動で計算してあるので、無理のないように調整してください。毎月の見直しの日に、ここまで来られたかを確認します。</div>
     ${a.tg.map((t, i) => tgOk(t) ? `<div class="ms"><div class="ms-h"><b>${esc(t[0])}</b><span class="num">いま ${esc(t[1])} → 6ヶ月後 ${esc(t[2])}</span></div><div class="ms-g">${[1, 2, 3, 4, 5, 6].map(k => { const n = 6 * (cy - 1) + k, d = mStart() ? monthDate(n) : null, done = (monthRow(n) || {}).doneAt;
        return `<label><small>${k}ヶ月目${d ? '<br>' + md(d) : ''}</small><input type="text" inputmode="decimal" data-ms="${i},${k - 1}" value="${esc(a.ms[i][k - 1])}" ${k === 6 || done ? 'readonly' : ''} aria-label="${esc(t[0])} ${k}ヶ月目"></label>`; }).join('')}</div></div>` : '').join('')}
     <button type="button" class="btn ghost" id="ms-auto" style="margin-top:6px">自動で計算し直す</button>
     <div class="hint">6ヶ月目は、前のステップで決めた目標の数字です。見直しの日にうまくいかなかったら、翌月以降の数字はそこで調整できます。</div>`,
    `<div class="lead">続く人は「いつ・どこで」を先に決めています。うまくいかない日の作戦も立てておきましょう。</div>${q('when', '毎日やる時間と場所', a.when, 0, '例：朝食のあと、リビングのヨガマットで')}${q('plan', 'つまずきそうな場面と、そのときの作戦', a.plan, 1, '例：週末は時間がとれない → ストレッチ1本だけでもやって記録する')}`,
    `<div class="lead">書いた内容を確認して、名前を入れたら完了です。この内容は毎日の画面の「MY GOAL」にずっと表示されます。</div>
     <div class="sum"><div><small>一番解決したいこと</small>${esc(a.top)}</div><div><small>6ヶ月後の理想の場面</small>${esc(a.scene)}</div><div><small>${cy > 1 ? '第' + cy + '期の目標' : '卒業目標'}</small>${a.tg.filter(t => t[0]).map(t => `${esc(t[0])}：${esc(t[1])} → <b>${esc(t[2])}</b>`).join('<br>')}</div><div><small>毎月の中間目標</small>${a.tg.map((t, i) => tgOk(t) ? `${esc(nameOf(t[0]))}：${a.ms[i].map((v, k) => (k + 1) + 'ヶ月目 ' + esc(v)).join('／')}` : '').filter(Boolean).join('<br>')}</div><div><small>続けるための約束</small>${esc(a.when)}<br>${esc(a.plan)}</div></div>
     ${q('sign', '名前（宣言のサイン）', a.sign, 0)}`];
  return `<div class="steps" aria-hidden="true">${WORK_STEPS.map((_, i) => `<i class="${i <= s ? 'on' : ''}"></i>`).join('')}</div>
  <section class="card wk-card"><div class="no">${cy > 1 ? '第' + cy + '期・' : ''}STEP ${s + 1} / ${WORK_STEPS.length}</div><h2>${WORK_STEPS[s]}</h2>${bodies[s]}
  <div class="wk-nav">${s > 0 ? '<button type="button" class="back" id="w-back">もどる</button>' : (goalSet() ? '<button type="button" class="back" id="w-cancel">やめる</button>' : '')}<button type="button" class="next" id="w-next" ${S.busy ? 'disabled' : ''}>${s < WORK_STEPS.length - 1 ? '次へ' : goalSet() && !a.next ? '変更を保存' : '目標を決定する'}</button></div></section>`;
}
function workValid(s) {
  const a = S.work;
  if (s === 2 && !a.scene.trim()) return '理想の場面を書いてください';
  if (s === 3) { const ok = a.tg.filter(tgOk); if (ok.length < 1) return '目標を1つ以上、数字で入れてください'; }
  if (s === 4) { const bad = a.tg.some((t, i) => tgOk(t) && a.ms[i].some(v => v === '' || isNaN(Number(v)))); if (bad) return '中間目標をすべて数字で入れてください'; }
  return '';
}
async function saveGoal() {
  const a = S.work;
  const kept = [0, 1, 2].filter(i => tgOk(a.tg[i]));
  const milestones = [1, 2, 3, 4, 5, 6].map(k => { const n = 6 * (a.cycle - 1) + k; return { n, date: mStart() ? fmt(monthDate(n)) : '', targets: kept.map(i => Number(a.ms[i][k - 1])) }; }).filter(x => !(monthRow(x.n) || {}).doneAt);
  const goal = { scene: a.scene, needs: a.nay.join('・'), top: a.top, why: a.why, ifnot: a.ifnot, when: a.when, plan: a.plan, cycle: a.cycle, milestones,
    targets: kept.map(i => ({ label: a.tg[i][0], start: Number(a.tg[i][1]), target: Number(a.tg[i][2]) })) };
  S.busy = true; route();
  try {
    const r = await api('saveGoal', { goal });
    if (r.months) S.data.months = r.months;
    S.data.member.goalCycle = a.cycle;
    const g = S.data.member.goal; Object.assign(g, { scene: goal.scene, needs: goal.needs, top: goal.top, why: goal.why, ifnot: goal.ifnot, when: goal.when, plan: goal.plan, targets: goal.targets }, { setAt: fmt(S.today) });
    S.goalLink = g.targets.map(t => matchField(t.label));
    S.form.g = g.targets.map(() => '');
    S.forceWork = false; S.ws = -1; S.view = 'today'; toast('目標を保存しました');
  } catch (e) { toast('保存できませんでした。もう一度お試しください'); }
  S.busy = false; route(); scrollTo(0, 0);
}

// ---------- 記録の保存 ----------
async function saveDay(quiet) {
  if (S.busy) return;
  const P = S.P || plan(S.day);
  const f = S.form;
  const trained = P.train.filter(c => f.checks['t' + c]);
  const watched = Object.keys(f.checks).filter(k => k[0] === 'l' && f.checks[k]).map(k => k.slice(1));
  const data = { date: fmt(S.today), day: Math.max(S.day, 0), week: S.week, s1: f.checks.s1 && P.D ? P.D[3] : '', s2: f.checks.s2 && P.D ? P.D[4] : '', train: trained, watched, mirror: f.mirror,
    v: f.v.map(x => x === '' || x == null ? null : Number(x)), g: f.g.map(x => x === '' || x == null ? null : Number(x)), note: f.note };
  S.busy = true; route();
  try {
    await api('saveDay', { data });
    const rec = { date: data.date, day: data.day, s1: data.s1, s2: data.s2, train: trained.join('・'), watched: watched.join('・'), mirror: data.mirror, v: data.v, g: data.g, note: data.note };
    const i = S.data.records.findIndex(r => r.date === rec.date); if (i >= 0) S.data.records[i] = rec; else S.data.records.push(rec);
    watched.forEach(c => S.watched.add(c));
    const first = !f.saved; f.saved = true; S.busy = false; route();
    if (quiet) toast(quiet);
    else if (first) celebrate();
    else toast('今日の記録を更新しました');
  } catch (e) { S.busy = false; route(); toast('保存できませんでした。通信を確認してもう一度押してください'); }
}
function celebrate() {
  const wr = recInWeek(S.week), mi = missed(), nd = dailyOf(S.day + 1);
  const box = document.createElement('div'); box.className = 'toast'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', '記録しました');
  box.innerHTML = `<div class="box"><div class="big num">DAY ${S.day}</div><h3>今日の記録、できました</h3><p>今週 ${wr}/3日。${wr >= 3 ? '延長保証ラインをクリアです。' : 'あと' + (3 - wr) + '日で今週のラインをクリア。'}<br>連続 ${streak()}日。${nd ? '明日はDAY ' + (S.day + 1) + '「' + esc(nd[1]) + '」です。' : ''}${mi.length ? '<br><span style="color:var(--sun-ink)">時間があれば「' + esc(mi[0].code + ' ' + mi[0].title) + '」もどうぞ</span>' : ''}</p><button type="button" id="toast-close">とじる</button></div>`;
  document.body.appendChild(box); burst();
}
function burst() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = $('#burst'), x = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight;
  const cs = getComputedStyle(document.documentElement); const cols = [cs.getPropertyValue('--sun'), cs.getPropertyValue('--primary'), '#F2C4A8'];
  const ps = Array.from({ length: 90 }, () => ({ x: innerWidth / 2, y: innerHeight / 2 - 60, vx: (Math.random() - .5) * 11, vy: Math.random() * -11 - 2, r: Math.random() * 5 + 3, c: cols[Math.floor(Math.random() * 3)], a: 1 }));
  let f = 0; (function tk() { x.clearRect(0, 0, c.width, c.height); ps.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .35; p.a -= .012; x.globalAlpha = Math.max(p.a, 0); x.fillStyle = p.c; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 7); x.fill(); }); if (++f < 90) requestAnimationFrame(tk); else x.clearRect(0, 0, c.width, c.height); })();
}

// ---------- 操作 ----------
document.addEventListener('click', async e => {
  const w = e.target.closest('[data-watch]');
  if (w && S.form && !S.watched.has(w.dataset.watch)) { S.form.checks['l' + w.dataset.watch] = true; setTimeout(() => saveDay('「' + w.dataset.watch + '」を見た動画として記録しました'), 300); }
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.v) { S.view = t.dataset.v; route(); scrollTo(0, 0); return; }
  if (t.dataset.k) { S.form.checks[t.dataset.k] = !S.form.checks[t.dataset.k]; route(); return; }
  if (t.dataset.mirror) { S.form.mirror = t.classList.contains('check') ? (S.form.mirror ? '' : '○') : (S.form.mirror === t.dataset.mirror ? '' : t.dataset.mirror); route(); return; }
  if (t.dataset.day) { S.sel = +t.dataset.day; route(); return; }
  if (t.dataset.chart) { S.chart = +t.dataset.chart; route(); return; }
  if (t.dataset.side) { S.cmpSide = t.dataset.side; route(); return; }
  if (t.dataset.cmp) { const d = +t.dataset.cmp; if (!S.cmp.includes(d)) S.cmp = [S.cmp[1] ?? S.cmp[0], d].filter(v => v != null); route(); return; }
  if (t.dataset.q) { sendMeal(t.dataset.q); return; }
  if (t.dataset.nay) { const a = S.work.nay, n = t.dataset.nay; a.includes(n) ? a.splice(a.indexOf(n), 1) : a.push(n); route(); return; }
  if (t.id === 'save') { if (S.mode === 'grad') { S.P = { train: [], D: null }; } saveDay(); return; }
  if (t.id === 'toast-close') { document.querySelector('.toast')?.remove(); return; }
  if (t.id === 'goal-start' || t.id === 'goal-edit') { S.work = workFromMember(S.data.member); S.forceWork = true; S.ws = goalSet() ? 0 : -1; route(); scrollTo(0, 0); return; }
  if (t.id === 'goal-next') { S.work = workFromMember(S.data.member, true); S.forceWork = true; S.ws = -1; route(); scrollTo(0, 0); return; }
  if (t.id === 'ms-auto') { autoMs(true); route(); return; }
  if (t.id === 'rv-save') { saveReview(); return; }
  if (t.id === 'w-start') { S.ws = 0; route(); scrollTo(0, 0); return; }
  if (t.id === 'w-back') { S.ws--; route(); scrollTo(0, 0); return; }
  if (t.id === 'w-cancel') { S.forceWork = false; S.ws = -1; route(); scrollTo(0, 0); return; }
  if (t.id === 'w-next') { const err = workValid(S.ws); if (err) { toast(err); return; } if (S.ws < WORK_STEPS.length - 1) { S.ws++; if (S.ws === 4) autoMs(false); route(); scrollTo(0, 0); } else saveGoal(); return; }
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.f !== undefined) { S.form.v[+el.dataset.f] = el.value; const o = document.getElementById('o-' + el.dataset.f); if (o) o.textContent = el.value + ' / 10'; }
  if (el.dataset.g !== undefined) S.form.g[+el.dataset.g] = el.value;
  if (el.id === 'f-note') S.form.note = el.value;
  if (el.dataset.w) S.work[el.dataset.w] = el.value;
  if (el.dataset.tg) { const [i, j] = el.dataset.tg.split(','); S.work.tg[i][j] = el.value; }
  if (el.dataset.ms) { const [i, k] = el.dataset.ms.split(','); S.work.ms[i][k] = el.value; }
  if (el.dataset.rva !== undefined) { S.rv.actual[+el.dataset.rva] = el.value; const o = document.getElementById('rvp-' + el.dataset.rva); if (o) o.innerHTML = rvPill(+el.dataset.rva); }
  if (el.dataset.rvn !== undefined) S.rv.nt[+el.dataset.rvn] = el.value;
  if (el.dataset.rvt) S.rv[el.dataset.rvt] = el.value;
});
document.addEventListener('change', async e => {
  const el = e.target;
  if ((el.id === 'ph-front' || el.id === 'ph-side') && el.files[0]) {
    const side = el.id === 'ph-front' ? 'front' : 'side';
    const file = el.files[0]; el.value = '';
    let dataUrl;
    try { dataUrl = await alignPhoto(await loadImage(file, 1600), side); } catch (err) { toast('写真を読み込めませんでした'); return; }
    if (!dataUrl) return;
    toast('写真を送っています…');
    try {
      const due = photoDue();
      const r = await api('uploadPhoto', { photo: { date: fmt(S.today), day: Math.max(S.day, 1), label: due ? due.l : '', side, dataUrl } });
      let p = S.data.photos.find(x => x.date === fmt(S.today));
      if (!p) { p = { date: fmt(S.today), day: Math.max(S.day, 1), label: due ? due.l : '', front: '', side: '' }; S.data.photos.push(p); }
      p[side] = r.fileId; S.photoCache[r.fileId] = dataUrl; S.cmpSide = side; S.cmp = [S.cmp[0] ?? p.day, p.day];
      toast('写真を保存しました'); route();
    } catch (err) { toast('写真を送れませんでした。もう一度お試しください'); }
  }
  if (el.id === 'meal-img' && el.files[0]) { const img = await resize(el.files[0], 1024); sendMeal($('#meal-txt') ? $('#meal-txt').value.trim() : '', img); }
});
document.addEventListener('submit', e => { if (e.target.id === 'meal-form') { e.preventDefault(); const i = $('#meal-txt'); const v = i.value.trim(); i.value = ''; sendMeal(v); } });

start();
})();
