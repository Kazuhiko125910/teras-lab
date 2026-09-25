/**
 * Teras Lab. RESHAPE — 裏側のプログラム（Google Apps Script）
 *
 * 置き場所：運営用スプレッドシート「Teras_Lab_RESHAPE」の 拡張機能 → Apps Script
 * 初回だけ：関数「setup」を実行 → ウェブアプリとしてデプロイ
 *
 * スクリプトプロパティ（プロジェクトの設定 → スクリプト プロパティ）
 *   LINE_CHANNEL_ID   … LINEログインのチャネルID（数字）
 *   ADMIN_KEY         … 管理者ページの合言葉（加藤さんが自分で決める）
 *   ANTHROPIC_API_KEY … 食事サポートに使うAIのキー（加藤さんが自分で入力）
 *   PHOTO_FOLDER_ID   … setup で自動作成（姿勢写真の保存先フォルダ）
 *   LINE_MESSAGING_TOKEN … 公式LINE（Messaging API）の長期チャネルアクセストークン（毎月の見直しリマインド用）
 */

const TZ = 'Asia/Tokyo';
const SOURCE_180DAY_ID = '1jRhfGPH2k3RBxXAUSmE5n5QETlXbu_eAlw9JUzHtkXM'; // 180日プログラム（毎日のストレッチの割り当て元）
const SOURCE_180DAY_GID = 1146111468;
const MEAL_MODEL = 'claude-haiku-4-5-20251001';
const SHEET_ID = '15XKWaI3hG0ACJyY4RuLjWOIiUpfGqVTQ4V2qH_ezsUg'; // 運営用スプレッドシート Teras_Lab_RESHAPE
const LIFF_URL = 'https://liff.line.me/2011731827-ZLDHlKTg';
const MONTH_HEAD = ['会員ID', '名前', '期', '月', '見直し日', '目標1 中間', '目標2 中間', '目標3 中間', '目標1 実績', '目標2 実績', '目標3 実績', '達成数', 'うまくいったこと', 'うまくいかなかったこと', '来月の工夫', '記入日', 'LINE通知日'];

const SH = {
  member: '会員', record: '毎日の記録', photo: '姿勢写真', meal: '食事',
  video: '動画マスター', lecture: '講義マスター', roadmap: '26週ロードマップ', daily: '毎日のストレッチ', month: '月の目標'
};

// ============ 入口 ============
function doGet() {
  return json_({ ok: true, app: 'Teras Lab. RESHAPE', time: now_() });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  try {
    const a = req.action;
    if (a === 'admin') return json_(adminData_(req));
    if (a === 'adminPhoto') return json_(adminPhoto_(req));
    const me = identify_(req); // {id, name, demo}
    if (a === 'boot') return json_(boot_(me, req));
    if (a === 'saveDay') return json_(saveDay_(me, req));
    if (a === 'saveGoal') return json_(saveGoal_(me, req));
    if (a === 'saveReview') return json_(saveReview_(me, req));
    if (a === 'uploadPhoto') return json_(uploadPhoto_(me, req));
    if (a === 'getPhoto') return json_(getPhoto_(me, req));
    if (a === 'meal') return json_(meal_(me, req));
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// ============ 本人確認（LINEログイン） ============
function identify_(req) {
  if (req.demo) {
    const id = String(req.demo);
    if (!/^SAMPLE-/.test(id)) throw new Error('demo_not_allowed');
    return { id: id, name: '', demo: true };
  }
  if (!req.idToken) throw new Error('no_token');
  const channelId = prop_('LINE_CHANNEL_ID');
  if (!channelId) throw new Error('LINE_CHANNEL_ID が未設定です');
  const cache = CacheService.getScriptCache();
  const key = 'tok_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, req.idToken)).slice(0, 40);
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const res = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'post', payload: { id_token: req.idToken, client_id: channelId }, muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('login_expired');
  const v = JSON.parse(res.getContentText());
  const me = { id: v.sub, name: v.name || '', demo: false };
  cache.put(key, JSON.stringify(me), 600);
  return me;
}

// ============ 起動時のデータ ============
function boot_(me, req) {
  const members = table_(SH.member);
  let m = members.rows.find(r => String(r['会員ID']) === me.id);
  if (!m) {
    if (me.demo) throw new Error('sample_not_found');
    // はじめて開いた人：承認待ちとして登録
    const name = String(req.displayName || me.name || '');
    appendRow_(SH.member, { '会員ID': me.id, '名前': name, 'LINE表示名': name, '利用': '承認待ち', 'メモ': '自動登録 ' + now_() });
    m = table_(SH.member).rows.find(r => String(r['会員ID']) === me.id);
  }
  return {
    ok: true,
    today: fmtDate_(new Date()),
    member: memberOut_(m),
    records: table_(SH.record).rows.filter(r => String(r['会員ID']) === me.id).map(recordOut_),
    photos: table_(SH.photo).rows.filter(r => String(r['会員ID']) === me.id).map(photoOut_),
    months: monthsOf_(me.id),
    content: content_()
  };
}

function memberOut_(r) {
  const goals = [1, 2, 3].map(i => ({
    label: String(r['卒業目標' + i] || ''),
    start: num_(r['目標' + i + ' スタート']),
    target: num_(r['目標' + i + ' 目標値'])
  })).filter(g => g.label);
  return {
    id: String(r['会員ID']), name: String(r['名前'] || ''), plan: String(r['プラン'] || ''), status: String(r['利用'] || ''),
    zoomAt: fmtDateTime_(r['次のZoom']), zoomLink: String(r['次のZoomリンク（VIPのみ）'] || ''),
    coach: String(r['担当からのひとこと'] || ''),
    paid: fmtDate_(r['支払日（起算日）']), start: fmtDate_(r['開始日（DAY1）']),
    end3: fmtDate_(r['3ヶ月の日（支払日から）']), end6: fmtDate_(r['6ヶ月の日（支払日から）']),
    extension: String(r['延長希望'] || ''), community: String(r['卒業生コミュニティ参加希望'] || ''),
    goal: {
      scene: String(r['6ヶ月後の理想の場面（MY GOAL）'] || ''), needs: String(r['お悩み'] || ''),
      top: String(r['一番解決したいこと'] || ''), why: String(r['変わりたい理由'] || ''), ifnot: String(r['このままだと1年後'] || ''),
      when: String(r['やる時間・場所'] || ''), plan: String(r['つまずき対策'] || ''), setAt: fmtDate_(r['目標設定日']),
      targets: goals
    },
    fields: String(r['毎日の記録項目'] || ''),
    goalCycle: num_(r['目標の期']) || (goals.length ? 1 : 0)
  };
}

function monthOut_(r) {
  return {
    n: num_(r['月']), cycle: num_(r['期']), date: fmtDate_(r['見直し日']),
    targets: [num_(r['目標1 中間']), num_(r['目標2 中間']), num_(r['目標3 中間'])],
    actual: [num_(r['目標1 実績']), num_(r['目標2 実績']), num_(r['目標3 実績'])],
    hit: num_(r['達成数']), good: String(r['うまくいったこと'] || ''), bad: String(r['うまくいかなかったこと'] || ''),
    next: String(r['来月の工夫'] || ''), doneAt: fmtDate_(r['記入日'])
  };
}
function monthsOf_(id) {
  return table_(SH.month).rows.filter(r => String(r['会員ID']) === id && num_(r['月'])).map(monthOut_).sort((a, b) => a.n - b.n);
}

function recordOut_(r) {
  return {
    date: fmtDate_(r['日付']), day: num_(r['DAY']),
    s1: String(r['ストレッチ①'] || ''), s2: String(r['ストレッチ②'] || ''), train: String(r['トレーニング'] || ''),
    watched: String(r['見た動画'] || ''), mirror: String(r['鏡チェック'] || ''),
    v: [num_(r['記録1']), num_(r['記録2']), num_(r['記録3'])],
    g: [num_(r['目標1 いま']), num_(r['目標2 いま']), num_(r['目標3 いま'])],
    note: String(r['ひとこと'] || '')
  };
}

function photoOut_(r) {
  return {
    date: fmtDate_(r['撮影日']), day: num_(r['DAY']), label: String(r['タイミング'] || ''),
    front: fileId_(r['正面の写真']), side: fileId_(r['横向きの写真']), comment: String(r['担当コメント'] || '')
  };
}

// 動画・講義・ロードマップ・毎日のストレッチ（10分キャッシュ）
function content_() {
  const cache = CacheService.getScriptCache();
  const parts = cache.getAll(['c0', 'c1', 'c2', 'c3', 'cn']);
  if (parts.cn) {
    let s = ''; for (let i = 0; i < Number(parts.cn); i++) s += parts['c' + i] || '';
    if (s) return JSON.parse(s);
  }
  const video = table_(SH.video).rows;
  const stretch = {}, train = {};
  video.forEach(r => {
    const code = String(r['番号'] || '').trim(); if (!code) return;
    const link = String(r['Vimeoリンク'] || '').trim();
    if (r['種別'] === 'ストレッチ') stretch[code] = [String(r['タイトル'] || ''), link];
    if (r['種別'] === '運動') {
      const memo = String(r['メモ'] || '');
      const alt = (memo.match(/運動([A-G]-[0-9]+(?:-[0-9]+)?(?:負荷)?)/g) || []).map(x => x.replace('運動', '')).find(x => x !== code) || '';
      train[code] = [String(r['タイトル'] || ''), link, String(r['強度／難易度'] || ''), alt];
    }
  });
  const lectures = table_(SH.lecture).rows.filter(r => r['講義番号']).map(r => ({
    code: String(r['講義番号']), title: String(r['タイトル'] || ''), week: r['配信週'] === '' ? null : num_(r['配信週']),
    link: String(r['Vimeoリンク'] || ''), kind: String(r['区分'] || ''), min: num_(r['尺（分）']), status: String(r['状態'] || '')
  }));
  const roadmap = table_(SH.roadmap).rows.filter(r => r['週'] !== '' && !isNaN(Number(r['週']))).map(r => ({
    week: Number(r['週']), phase: String(r['フェーズ'] || ''), theme: String(r['今週のテーマ'] || ''),
    freq: String(r['トレ回数'] || ''),
    train: [r['トレ1'], r['トレ2'], r['トレ3']].map(x => String(x || '').replace('運動', '')).filter(Boolean),
    milestone: String(r['節目・サポート'] || '')
  }));
  let dailyRows = table_(SH.daily).rows;
  if (!dailyRows.length) { // タブが無いときは180日プログラムから直接読む
    try {
      const src = SpreadsheetApp.openById(SOURCE_180DAY_ID).getSheets().find(s => s.getSheetId() === SOURCE_180DAY_GID);
      const v = src ? src.getDataRange().getValues() : [];
      const h = (v[0] || []).map(x => String(x).trim());
      dailyRows = v.slice(1).map(r => { const o = {}; h.forEach((k, j) => { if (k) o[k] = r[j]; }); return o; });
    } catch (e) { dailyRows = []; }
  }
  const daily = dailyRows.filter(r => /^DAY\s*\d+$/.test(String(r['DAY'] || '').trim()) || /^\d+$/.test(String(r['DAY'] || '').trim())).map(r => [
    String(r['章'] || ''), String(r['今日のコンセプト'] || ''), String(r['節目バッジ'] || ''),
    String(r['メインコード'] || ''), String(r['サブコード'] || '')
  ]);
  const out = { stretch: stretch, train: train, lectures: lectures, roadmap: roadmap, daily: daily };
  const s = JSON.stringify(out), size = 90000, n = Math.ceil(s.length / size), put = { cn: String(n) };
  for (let i = 0; i < n; i++) put['c' + i] = s.slice(i * size, (i + 1) * size);
  if (n <= 4) cache.putAll(put, 600);
  return out;
}

// ============ 保存 ============
function saveDay_(me, req) {
  const d = req.data || {};
  const date = String(d.date || fmtDate_(new Date()));
  const m = findMember_(me.id);
  const row = {
    '日付': date, '会員ID': me.id, '名前': m ? m['名前'] : '', 'DAY': d.day || '', '週': d.week || '',
    'ストレッチ①': d.s1 || '', 'ストレッチ②': d.s2 || '', 'トレーニング': (d.train || []).join('・'),
    '見た動画': (d.watched || []).join('・'), '鏡チェック': d.mirror || '',
    '記録1': val_(d.v, 0), '記録2': val_(d.v, 1), '記録3': val_(d.v, 2),
    '目標1 いま': val_(d.g, 0), '目標2 いま': val_(d.g, 1), '目標3 いま': val_(d.g, 2),
    'ひとこと': String(d.note || '').slice(0, 500), '保存日時': now_()
  };
  ensureHeaders_(SH.record, ['目標1 いま', '目標2 いま', '目標3 いま']);
  upsert_(SH.record, r => String(r['会員ID']) === me.id && fmtDate_(r['日付']) === date, row);
  return { ok: true };
}

function saveGoal_(me, req) {
  const g = req.goal || {};
  const t = g.targets || [];
  const upd = {
    '6ヶ月後の理想の場面（MY GOAL）': g.scene || '', 'お悩み': g.needs || '', '一番解決したいこと': g.top || '',
    '変わりたい理由': g.why || '', 'このままだと1年後': g.ifnot || '', 'やる時間・場所': g.when || '', 'つまずき対策': g.plan || '',
    '目標設定日': fmtDate_(new Date()), '目標の期': Number(g.cycle) || 1
  };
  for (let i = 0; i < 3; i++) {
    upd['卒業目標' + (i + 1)] = t[i] ? t[i].label : '';
    upd['目標' + (i + 1) + ' スタート'] = t[i] ? t[i].start : '';
    upd['目標' + (i + 1) + ' 目標値'] = t[i] ? t[i].target : '';
  }
  ensureHeaders_(SH.member, ['目標の期']);
  const ok = updateMember_(me.id, upd);
  if (!ok) throw new Error('member_not_found');
  // 毎月の中間目標
  const ms = Array.isArray(g.milestones) ? g.milestones : [];
  if (ms.length) {
    ensureHeaders_(SH.month, MONTH_HEAD);
    const m = findMember_(me.id);
    ms.forEach(x => {
      const n = Number(x.n); if (!n) return;
      const row = { '会員ID': me.id, '名前': m ? m['名前'] : '', '期': Number(g.cycle) || 1, '月': n, '見直し日': x.date || '' };
      for (let i = 0; i < 3; i++) row['目標' + (i + 1) + ' 中間'] = val_(x.targets, i);
      upsert_(SH.month, r => String(r['会員ID']) === me.id && Number(r['月']) === n && !r['記入日'], row);
    });
  }
  return { ok: true, months: monthsOf_(me.id) };
}

function saveReview_(me, req) {
  const v = req.review || {};
  const n = Number(v.n); if (!n) throw new Error('bad_month');
  ensureHeaders_(SH.month, MONTH_HEAD);
  const m = findMember_(me.id);
  const row = {
    '会員ID': me.id, '名前': m ? m['名前'] : '', '期': Number(v.cycle) || Math.ceil(n / 6), '月': n, '見直し日': v.date || '',
    '達成数': v.hit != null ? Number(v.hit) : '',
    'うまくいったこと': String(v.good || '').slice(0, 1000), 'うまくいかなかったこと': String(v.bad || '').slice(0, 1000),
    '来月の工夫': String(v.next || '').slice(0, 1000), '記入日': fmtDate_(new Date())
  };
  for (let i = 0; i < 3; i++) {
    row['目標' + (i + 1) + ' 実績'] = val_(v.actual, i);
    if (v.targets && v.targets[i] != null && v.targets[i] !== '') row['目標' + (i + 1) + ' 中間'] = Number(v.targets[i]);
  }
  upsert_(SH.month, r => String(r['会員ID']) === me.id && Number(r['月']) === n, row);
  if (Array.isArray(v.nextTargets) && n % 6 !== 0) {
    const nx = { '会員ID': me.id, '名前': row['名前'], '期': row['期'], '月': n + 1, '見直し日': v.nextDate || '' };
    for (let i = 0; i < 3; i++) nx['目標' + (i + 1) + ' 中間'] = val_(v.nextTargets, i);
    upsert_(SH.month, r => String(r['会員ID']) === me.id && Number(r['月']) === n + 1 && !r['記入日'], nx);
  }
  return { ok: true, months: monthsOf_(me.id) };
}

// ============ 毎月の見直しリマインド（毎朝9時に自動実行） ============
function ymd_(d) { return d.getFullYear() + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + ('0' + d.getDate()).slice(-2); }
function parseYmd_(s) { const m = String(s || '').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function addMonths_(d, n) { const x = new Date(d.getTime()); x.setMonth(x.getMonth() + n); return x; }

function monthlyReminder() {
  const token = prop_('LINE_MESSAGING_TOKEN');
  if (!token) throw new Error('LINE_MESSAGING_TOKEN が未設定のため、毎月の見直しリマインドを送れませんでした');
  ensureHeaders_(SH.month, MONTH_HEAD);
  const failed = [];
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy/MM/dd');
  const weekAgo = Utilities.formatDate(new Date(Date.now() - 7 * 864e5), TZ, 'yyyy/MM/dd');
  const months = table_(SH.month).rows;
  let sent = 0;
  table_(SH.member).rows.forEach(r => {
    const id = String(r['会員ID'] || '');
    if (!id || /^SAMPLE-/.test(id) || !/^(利用中|卒業生)$/.test(String(r['利用'] || ''))) return;
    const st = parseYmd_(fmtDate_(r['開始日（DAY1）'])); if (!st) return;
    let n = 0; while (n < 120 && ymd_(addMonths_(st, n + 1)) <= today) n++;
    if (n < 1) return;
    const date = ymd_(addMonths_(st, n));
    if (date < weekAgo) return; // 1週間以上前の見直しは送らない
    const row = months.find(x => String(x['会員ID']) === id && Number(x['月']) === n);
    if (row && (row['記入日'] || row['LINE通知日'])) return;
    const name = String(r['名前'] || '');
    const k = ((n - 1) % 6) + 1, c = Math.ceil(n / 6);
    const text = n % 6 === 0
      ? name + 'さん、第' + c + '期の6ヶ月が経ちました。\n\n今日は「最終見直し」の日です。6ヶ月前に決めた目標をふり返って、次の6ヶ月の目標と、毎月の中間目標を決めましょう（約10分）。\n\n▼ 見直しをはじめる\n' + LIFF_URL + '?v=review'
      : name + 'さん、' + k + 'ヶ月目の見直しの日です。\n\n今の数字を入れて、中間目標にどこまで近づいたか確認しましょう。うまくいったこと・来月の工夫もひとことずつ（約3分）。\n\n▼ 見直しをはじめる\n' + LIFF_URL + '?v=review';
    const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ to: id, messages: [{ type: 'text', text: text }] })
    });
    if (res.getResponseCode() === 200) {
      sent++;
      upsert_(SH.month, x => String(x['会員ID']) === id && Number(x['月']) === n, { '会員ID': id, '名前': name, '期': c, '月': n, '見直し日': date, 'LINE通知日': today });
    } else {
      Logger.log('送信失敗 ' + name + '：' + res.getResponseCode() + ' ' + res.getContentText());
      failed.push(name + '（' + res.getResponseCode() + (res.getResponseCode() === 400 || res.getResponseCode() === 403 ? '：ブロックまたは友だち未登録の可能性' : res.getResponseCode() === 401 ? '：トークンが無効' : res.getResponseCode() === 429 ? '：今月の送信数の上限' : '') + '）');
    }
  });
  Logger.log('毎月の見直しリマインド：' + sent + '件送信');
  // 失敗があればエラーにする → Googleから加藤さんにエラー通知メールが届く
  if (failed.length) throw new Error('毎月の見直しリマインドを送れなかった会員がいます：' + failed.join('、'));
}

/** 動作確認用：会員シートの「メモ」に「テスト送信」と書いた人にだけ、見直しの案内を送る */
function testPush() {
  const token = prop_('LINE_MESSAGING_TOKEN');
  if (!token) { Logger.log('LINE_MESSAGING_TOKEN が未設定です'); return; }
  const targets = table_(SH.member).rows.filter(r => /テスト送信/.test(String(r['メモ'] || '')) && r['会員ID']);
  if (!targets.length) { Logger.log('メモに「テスト送信」と書いた会員がいません'); return; }
  targets.forEach(r => {
    const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ to: String(r['会員ID']), messages: [{ type: 'text', text: '【テスト】' + (r['名前'] || '') + 'さん、1ヶ月目の見直しの日です。\n\n▼ 見直しをはじめる\n' + LIFF_URL + '?v=review' }] })
    });
    Logger.log((r['名前'] || '') + '：' + res.getResponseCode() + ' ' + res.getContentText());
  });
}

function uploadPhoto_(me, req) {
  const p = req.photo || {};
  const m = findMember_(me.id); if (!m) throw new Error('member_not_found');
  const match = String(p.dataUrl || '').match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!match) throw new Error('bad_image');
  const blob = Utilities.newBlob(Utilities.base64Decode(match[2]), match[1], p.date + '_' + p.side + '.jpg');
  const folder = memberFolder_(me.id, m['名前']);
  const file = folder.createFile(blob);
  const date = String(p.date || fmtDate_(new Date()));
  const col = p.side === 'front' ? '正面の写真' : '横向きの写真';
  const sheet = ss_().getSheetByName(SH.photo);
  const t = table_(SH.photo);
  const found = t.rows.find(r => String(r['会員ID']) === me.id && fmtDate_(r['撮影日']) === date);
  if (found) {
    sheet.getRange(found._row, t.col[col] + 1).setValue(file.getUrl());
  } else {
    const row = { '撮影日': date, '会員ID': me.id, '名前': m['名前'], 'DAY': p.day || '', 'タイミング': p.label || '' };
    row[col] = file.getUrl();
    appendRow_(SH.photo, row);
  }
  return { ok: true, fileId: file.getId() };
}

function getPhoto_(me, req) {
  const id = String(req.fileId || '');
  const own = table_(SH.photo).rows.some(r => String(r['会員ID']) === me.id && (fileId_(r['正面の写真']) === id || fileId_(r['横向きの写真']) === id));
  if (!own) throw new Error('not_allowed');
  return { ok: true, dataUrl: thumb_(id) };
}

function thumb_(id) {
  const f = DriveApp.getFileById(id);
  const b = f.getThumbnail() || f.getBlob();
  return 'data:' + (b.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(b.getBytes());
}

// ============ 食事サポート ============
function meal_(me, req) {
  const key = prop_('ANTHROPIC_API_KEY');
  const m = findMember_(me.id);
  const text = String(req.text || '').slice(0, 800);
  const img = m && String(m['プラン'] || '') === 'VIP' ? String(req.image || '') : ''; // 写真はVIPだけ
  let reply;
  if (!key) {
    reply = '（食事サポートの準備中です。もうしばらくお待ちください）';
  } else {
    const content = [];
    const im = img.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (im) content.push({ type: 'image', source: { type: 'base64', media_type: im[1], data: im[2] } });
    content.push({ type: 'text', text: text || 'この食事についてアドバイスをください。' });
    const goal = m ? String(m['6ヶ月後の理想の場面（MY GOAL）'] || '') : '';
    const system = [
      'あなたは理学療法士・加藤が監修する「Teras Lab. RESHAPE」の食事サポートです。相手は40〜60代の女性で、姿勢改善と体型の変化に取り組んでいます。',
      '送られた食事（写真や文章）について、主食・主菜・副菜のバランスを短く評価し、次の一食で実行できる具体的なヒントを1つだけ伝えてください。',
      'やさしく前向きな口調で、250文字以内。カロリー計算を細かく求めたり、極端な制限をすすめたりしないでください。',
      '持病・服薬・妊娠・強い痛みなど医療的な相談には答えず、主治医や担当の加藤に相談するよう伝えてください。',
      goal ? ('この人の目標：' + goal) : ''
    ].join('\n');
    const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({ model: MEAL_MODEL, max_tokens: 600, system: system, messages: [{ role: 'user', content: content }] })
    });
    if (res.getResponseCode() === 200) {
      const j = JSON.parse(res.getContentText());
      reply = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
    } else {
      reply = 'すみません、いま返信できませんでした。少し時間をおいてもう一度送ってください。';
    }
  }
  let photoUrl = '';
  if (img && m) {
    try {
      const im2 = img.match(/^data:(image\/[a-z]+);base64,(.+)$/);
      if (im2) photoUrl = memberFolder_(me.id, m['名前']).createFile(Utilities.newBlob(Utilities.base64Decode(im2[2]), im2[1], 'meal_' + Date.now() + '.jpg')).getUrl();
    } catch (err) { /* 写真の保存に失敗しても返信は返す */ }
  }
  appendRow_(SH.meal, { '日時': now_(), '会員ID': me.id, '名前': m ? m['名前'] : '', '送った内容': text, '写真': photoUrl, '自動返信': reply });
  return { ok: true, reply: reply };
}

// ============ 管理者 ============
function checkAdmin_(req) {
  const k = prop_('ADMIN_KEY');
  if (!k || String(req.adminKey || '') !== k) throw new Error('admin_denied');
}

function adminData_(req) {
  checkAdmin_(req);
  const recs = table_(SH.record).rows, photos = table_(SH.photo).rows, monthRows = table_(SH.month).rows;
  const today = fmtDate_(new Date());
  const members = table_(SH.member).rows.filter(r => r['会員ID']).map(r => {
    const m = memberOut_(r);
    const mine = recs.filter(x => String(x['会員ID']) === m.id).map(recordOut_);
    const ph = photos.filter(x => String(x['会員ID']) === m.id).map(photoOut_);
    const mo = monthRows.filter(x => String(x['会員ID']) === m.id && num_(x['月'])).map(monthOut_).sort((a, b) => a.n - b.n);
    return { member: m, records: mine.slice(-60), photos: ph, months: mo };
  });
  return { ok: true, today: today, members: members, sheetUrl: ss_().getUrl() };
}

function adminPhoto_(req) {
  checkAdmin_(req);
  return { ok: true, dataUrl: thumb_(String(req.fileId || '')) };
}

// ============ 初期設定（最初に1回だけ実行） ============
function setup() {
  const ss = ss_();
  const step = (label, fn) => { try { fn(); Logger.log('OK  ' + label); } catch (e) { Logger.log('NG  ' + label + '：' + e.message); } };
  step('プロパティの枠', () => ['LINE_CHANNEL_ID', 'ADMIN_KEY', 'ANTHROPIC_API_KEY', 'LINE_MESSAGING_TOKEN'].forEach(k => { if (prop_(k) === null) PropertiesService.getScriptProperties().setProperty(k, ''); }));
  step('見出しの追加', () => {
    ensureHeaders_(SH.record, ['日付', '会員ID', '名前', 'DAY', '週', 'ストレッチ①', 'ストレッチ②', 'トレーニング', '見た動画', '鏡チェック', '記録1', '記録2', '記録3', 'ひとこと', '保存日時', '目標1 いま', '目標2 いま', '目標3 いま']);
    ensureHeaders_(SH.photo, ['撮影日', '会員ID', '名前', 'DAY', 'タイミング', '正面の写真', '横向きの写真', '担当コメント']);
    ensureHeaders_(SH.meal, ['日時', '会員ID', '名前', '送った内容', '写真', '自動返信', '担当フィードバック（VIP）']);
  });
  step('会員シートのプルダウン', () => {
    const ms = ss.getSheetByName(SH.member), t = table_(SH.member);
    const dv = (list) => SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build();
    const put = (h, list) => { if (t.col[h] !== undefined) ms.getRange(2, t.col[h] + 1, 500, 1).setDataValidation(dv(list)); };
    put('プラン', ['STANDARD', 'VIP']);
    put('利用', ['承認待ち', '利用中', '卒業生', '停止']);
    put('延長希望', ['延長する', '延長しない', '未確認']);
    put('卒業生コミュニティ参加希望', ['参加する', '参加しない', '未確認']);
    ms.setFrozenColumns(2);
  });
  step('見出しの固定と色', () => [SH.member, SH.record, SH.photo, SH.meal].forEach(n => { const s = ss.getSheetByName(n); if (!s) return; s.setFrozenRows(1); s.getRange(1, 1, 1, s.getLastColumn()).setFontWeight('bold').setBackground('#E2EEE9'); }));
  step('毎日のストレッチ タブ', () => {
    if (ss.getSheetByName(SH.daily)) return;
    const src = SpreadsheetApp.openById(SOURCE_180DAY_ID).getSheets().find(s => s.getSheetId() === SOURCE_180DAY_GID);
    const vals = src.getDataRange().getValues();
    const dst = ss.insertSheet(SH.daily);
    dst.getRange(1, 1, vals.length, vals[0].length).setValues(vals);
    dst.setFrozenRows(1);
  });
  step('写真フォルダ', () => photoRoot_());
  step('月の目標シート', () => { ensureHeaders_(SH.month, MONTH_HEAD); ensureHeaders_(SH.member, ['目標の期']); const s = ss.getSheetByName(SH.month); s.setFrozenRows(1); s.getRange(1, 1, 1, s.getLastColumn()).setFontWeight('bold').setBackground('#E2EEE9'); });
  step('毎月の見直しリマインド（毎朝9時）', () => {
    if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'monthlyReminder')) ScriptApp.newTrigger('monthlyReminder').timeBased().everyDays(1).atHour(9).inTimezone(TZ).create();
  });
  CacheService.getScriptCache().removeAll(['c0', 'c1', 'c2', 'c3', 'cn']);
  Logger.log('setup 完了');
}

/** 動画やロードマップを直したあと、すぐサイトに反映したいときに実行 */
function clearCache() { CacheService.getScriptCache().removeAll(['c0', 'c1', 'c2', 'c3', 'cn']); }

// ============ 共通の道具 ============
function ss_() { return SpreadsheetApp.openById(SHEET_ID); }
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy/MM/dd HH:mm'); }
function num_(v) { if (v === '' || v === null || v === undefined) return null; const n = Number(v); return isNaN(n) ? null : n; }
function val_(a, i) { return a && a[i] !== null && a[i] !== undefined && a[i] !== '' ? Number(a[i]) : ''; }
function fmtDate_(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy/MM/dd');
  const s = String(v).trim().replace(/-/g, '/');
  const m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  return m ? m[1] + '/' + ('0' + m[2]).slice(-2) + '/' + ('0' + m[3]).slice(-2) : s;
}
function fmtDateTime_(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy/MM/dd HH:mm');
  return String(v).trim().replace(/-/g, '/');
}
function fileId_(v) { const m = String(v || '').match(/[-\w]{25,}/); return m ? m[0] : ''; }

function table_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) return { rows: [], col: {} };
  const vals = sh.getDataRange().getValues();
  const head = (vals[0] || []).map(h => String(h).trim());
  const col = {}; head.forEach((h, i) => { if (h && col[h] === undefined) col[h] = i; });
  const rows = vals.slice(1).map((r, i) => { const o = { _row: i + 2 }; head.forEach((h, j) => { if (h) o[h] = r[j]; }); return o; });
  return { rows: rows, col: col, head: head, sheet: sh };
}

// 1列目が空いている一番上の行に書く（ARRAYFORMULA の列には書き込まない）
function appendRow_(name, obj) {
  const t = table_(name);
  const idx = t.rows.findIndex(r => r[t.head[0]] === '' || r[t.head[0]] === null);
  if (idx < 0) { t.sheet.appendRow(t.head.map(h => obj[h] !== undefined ? obj[h] : '')); return; }
  const rowNo = t.rows[idx]._row;
  t.head.forEach((h, j) => { if (h && obj[h] !== undefined && obj[h] !== '') t.sheet.getRange(rowNo, j + 1).setValue(obj[h]); });
}

function upsert_(name, pred, obj) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const t = table_(name);
    const found = t.rows.find(pred);
    if (found) {
      const cur = t.head.map(h => obj[h] !== undefined ? obj[h] : found[h]);
      t.sheet.getRange(found._row, 1, 1, cur.length).setValues([cur]);
    } else {
      appendRow_(name, obj);
    }
  } finally { lock.releaseLock(); }
}

function findMember_(id) { return table_(SH.member).rows.find(r => String(r['会員ID']) === id); }

function updateMember_(id, upd) {
  const t = table_(SH.member);
  const r = t.rows.find(x => String(x['会員ID']) === id);
  if (!r) return false;
  Object.keys(upd).forEach(h => { if (t.col[h] !== undefined) t.sheet.getRange(r._row, t.col[h] + 1).setValue(upd[h]); });
  return true;
}

function ensureHeaders_(name, heads) {
  const sh = ss_().getSheetByName(name) || ss_().insertSheet(name);
  const cur = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String) : [];
  heads.forEach(h => { if (cur.indexOf(h) < 0) { cur.push(h); sh.getRange(1, cur.length).setValue(h); } });
}

function photoRoot_() {
  const id = prop_('PHOTO_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const parent = DriveApp.getFileById(SHEET_ID).getParents();
  const f = (parent.hasNext() ? parent.next() : DriveApp.getRootFolder()).createFolder('RESHAPE_会員の写真');
  PropertiesService.getScriptProperties().setProperty('PHOTO_FOLDER_ID', f.getId());
  return f;
}

function memberFolder_(id, name) {
  const base = photoRoot_();
  const label = (name ? name + '_' : '') + id.slice(-6);
  const it = base.getFoldersByName(label);
  return it.hasNext() ? it.next() : base.createFolder(label);
}
