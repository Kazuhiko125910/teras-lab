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
 *   SLACK_WEBHOOK_URL … Slackの通知先（Incoming Webhook のURL。目標の設定・変更、延長保証の測定、目標未記入、サポート終了のお知らせ）
 */

const TZ = 'Asia/Tokyo';
const SOURCE_180DAY_ID = '1jRhfGPH2k3RBxXAUSmE5n5QETlXbu_eAlw9JUzHtkXM'; // 180日プログラム（毎日のストレッチの割り当て元）
const SOURCE_180DAY_GID = 1146111468;
const MEAL_MODEL = 'claude-haiku-4-5-20251001';
const SHEET_ID = '15XKWaI3hG0ACJyY4RuLjWOIiUpfGqVTQ4V2qH_ezsUg'; // 運営用スプレッドシート Teras_Lab_RESHAPE
const LIFF_URL = 'https://liff.line.me/2011731827-ZLDHlKTg';
const ADMIN_URL = 'https://kazuhiko125910.github.io/teras-lab/reshape/admin.html';
const REMIND_HEAD = ['LINE登録日', '目標リマインド回数', '目標リマインド通知日'];
const MONTH_HEAD = ['会員ID', '名前', '期', '月', '見直し日', '目標1 中間', '目標2 中間', '目標3 中間', '目標1 実績', '目標2 実績', '目標3 実績', '達成数', 'うまくいったこと', 'うまくいかなかったこと', '来月の工夫', '記入日', 'LINE通知日'];
// 目標の変更履歴（契約書 第5条：変更前後の目標と変更日を記録し、担当が確認して確定する）
const GOAL_HEAD = ['会員ID', '名前', '変更日', '期', '目標1', '目標1 スタート', '目標1 目標値', '目標2', '目標2 スタート', '目標2 目標値', '目標3', '目標3 スタート', '目標3 目標値', '状態', '確認日', '担当メモ'];
const GOAL_CHECK = ['確認待ち', '確定', '見直しをお願い', '面談で相談'];
// 延長保証（契約書 第9条）の判定に使う会員シートの列
const JUDGE_HEAD = ['目標の確認', '目標の確認日', '延長保証 測定日', '延長保証 測定値', '延長保証 記録週数', '延長保証 判定'];

const SH = {
  member: '会員', record: '毎日の記録', photo: '姿勢写真', meal: '食事',
  video: '動画マスター', lecture: '講義マスター', roadmap: '26週ロードマップ', daily: '毎日のストレッチ', month: '月の目標',
  goalLog: '目標の履歴'
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
    if (!a && Array.isArray(req.events)) return json_(lineWebhook_(req)); // 公式LINEの友だち追加（Webhook）
    if (a === 'admin') return json_(adminData_(req));
    if (a === 'adminPhoto') return json_(adminPhoto_(req));
    if (a === 'adminGoal') return json_(adminGoal_(req));
    const me = identify_(req); // {id, name, demo}
    if (a === 'boot') return json_(boot_(me, req));
    if (a === 'saveDay') return json_(saveDay_(me, req));
    if (a === 'saveGoal') return json_(saveGoal_(me, req));
    if (a === 'saveReview') return json_(saveReview_(me, req));
    if (a === 'saveJudge') return json_(saveJudge_(me, req));
    if (a === 'uploadPhoto') return json_(uploadPhoto_(me, req));
    if (a === 'getPhoto') return json_(getPhoto_(me, req));
    if (a === 'deletePhoto') return json_(deletePhoto_(me, req));
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
    ensureHeaders_(SH.member, REMIND_HEAD);
    appendRow_(SH.member, { '会員ID': me.id, '名前': name, 'LINE表示名': name, '利用': '承認待ち', 'LINE登録日': fmtDate_(new Date()), 'メモ': '自動登録 ' + now_() });
    m = table_(SH.member).rows.find(r => String(r['会員ID']) === me.id);
  }
  return {
    ok: true,
    today: fmtDate_(new Date()),
    member: memberOut_(m),
    records: table_(SH.record).rows.filter(r => String(r['会員ID']) === me.id).map(recordOut_),
    photos: table_(SH.photo).rows.filter(r => String(r['会員ID']) === me.id).map(photoOut_),
    months: monthsOf_(me.id),
    goalLog: goalLogOf_(me.id),
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
    goalCycle: num_(r['目標の期']) || (goals.length ? 1 : 0),
    goalCheck: String(r['目標の確認'] || ''), goalCheckAt: fmtDate_(r['目標の確認日']),
    judge: {
      at: fmtDate_(r['延長保証 測定日']), values: String(r['延長保証 測定値'] || ''),
      weeks: String(r['延長保証 記録週数'] || ''), result: String(r['延長保証 判定'] || '')
    }
  };
}

// 目標の変更履歴（新しい順ではなく、古い順で返す）
function goalLogOut_(r) {
  return {
    date: fmtDate_(r['変更日']), cycle: num_(r['期']) || 1,
    targets: [1, 2, 3].map(i => ({ label: String(r['目標' + i] || ''), start: num_(r['目標' + i + ' スタート']), target: num_(r['目標' + i + ' 目標値']) })).filter(t => t.label),
    status: String(r['状態'] || ''), checkedAt: fmtDate_(r['確認日']), memo: String(r['担当メモ'] || ''), _row: r._row
  };
}
function goalLogOf_(id) {
  return table_(SH.goalLog).rows.filter(r => String(r['会員ID']) === id && r['変更日']).map(goalLogOut_)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a._row - b._row)).map(x => { delete x._row; return x; });
}

// ---------- 受講期間と延長保証 ----------
// 受講期間の終わり：支払日から6ヶ月（VIPで延長保証を受けた場合は9ヶ月）
function courseEnd_(r) {
  let e = parseYmd_(fmtDate_(r['6ヶ月の日（支払日から）']));
  if (!e) { const st = parseYmd_(fmtDate_(r['開始日（DAY1）'])); if (st) e = new Date(st.getTime() + 181 * 864e5); }
  if (e && String(r['プラン'] || '') === 'VIP' && /延長する/.test(String(r['延長希望'] || ''))) e = addMonths_(e, 3);
  // VIPは延長保証の測定（26週の終了日から7日以内）が終わるまでは使えるようにする
  const st = parseYmd_(fmtDate_(r['開始日（DAY1）']));
  if (e && st && String(r['プラン'] || '') === 'VIP') { const j = new Date(st.getTime() + 188 * 864e5); if (j > e) e = j; }
  if (e && String(r['プラン'] || '') === 'VIP' && joining_(r)) e = monthEnd_(supportEnd_(r) || e);
  return e;
}
// 卒業生コミュニティに参加する人は、サポート終了日の月末まで今のサポートを続け、翌月1日から切り替える
function monthEnd_(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
const joining_ = r => /参加する/.test(String(r['卒業生コミュニティ参加希望'] || '')) && String(r['利用'] || '') !== '卒業生';
// サポート（チャット）の終了日：STANDARD 3ヶ月・VIP 6ヶ月（延長保証で+3ヶ月、コミュニティ参加なら月末まで）
function supportEnd_(r) {
  const vip = String(r['プラン'] || '') === 'VIP';
  let e = parseYmd_(fmtDate_(r[vip ? '6ヶ月の日（支払日から）' : '3ヶ月の日（支払日から）']));
  if (!e) return null;
  if (/延長する/.test(String(r['延長希望'] || ''))) e = addMonths_(e, 3);
  return e;
}
// 受講期間が終わり、卒業生コミュニティにも参加していない（＝会員サイトの利用を終了する）
function courseOver_(r) {
  const s = String(r['利用'] || '');
  if (s === '卒業生') return false;
  if (s === '終了') return true;
  const e = courseEnd_(r);
  return !!(e && ymd_(e) < ymd_(new Date()));
}
// 延長保証の「記録した日」：ストレッチかトレーニングを実施し、その日のうちに保存した日（契約書 第9条第2項）
function countable_(r) {
  if (!(r['ストレッチ①'] || r['ストレッチ②'] || r['トレーニング'])) return false;
  const saved = String(r['保存日時'] || '');
  return !saved || saved.slice(0, 10) === fmtDate_(r['日付']);
}
// 判定期間のうち、週3日以上の記録があった週の数
function recordWeeks_(m, recRows) {
  const vip = String(m['プラン'] || '') === 'VIP', total = vip ? 26 : 13, need = vip ? 22 : 11;
  const st = parseYmd_(fmtDate_(m['開始日（DAY1）']));
  const cnt = {};
  if (st) recRows.forEach(r => {
    if (String(r['会員ID']) !== String(m['会員ID']) || !countable_(r)) return;
    const d = parseYmd_(fmtDate_(r['日付'])); if (!d) return;
    const w = Math.ceil((Math.round((d - st) / 864e5) + 1) / 7);
    if (w >= 1 && w <= total) cnt[w] = (cnt[w] || 0) + 1;
  });
  let ok = 0; for (let w = 1; w <= total; w++) if ((cnt[w] || 0) >= 3) ok++;
  // 救済ルール（契約書 第9条）：判定期間の最後の4週間すべてで週3日以上なら、記録の条件を満たしたものとして扱う
  let last4 = true; for (let w = total - 3; w <= total; w++) if ((cnt[w] || 0) < 3) last4 = false;
  return { ok: ok, total: total, need: need, last4: last4, pass: ok >= need || last4 };
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
  const today = fmtDate_(new Date());
  const date = String(d.date || today);
  // 記録はその日のうちに保存したものだけ（契約書 第9条第2項）。日付をまたいで開いたままの画面からは保存しない
  if (!me.demo && date !== today) throw new Error('date_changed');
  const m = findMember_(me.id);
  if (m && courseOver_(m)) throw new Error('course_over');
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
  const before = findMember_(me.id);
  if (!before) throw new Error('member_not_found');
  const key = arr => JSON.stringify(arr.map(x => [String(x.label || ''), x.start === '' || x.start == null ? null : Number(x.start), x.target === '' || x.target == null ? null : Number(x.target)]));
  const oldKey = key([1, 2, 3].map(i => ({ label: before['卒業目標' + i], start: before['目標' + i + ' スタート'], target: before['目標' + i + ' 目標値'] })).filter(x => x.label));
  const newKey = key(t.slice(0, 3));
  const changed = oldKey !== newKey || (Number(g.cycle) || 1) !== (Number(before['目標の期']) || 1);
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
  ensureHeaders_(SH.member, ['目標の期'].concat(JUDGE_HEAD));
  // 数値目標が変わったときは、担当の確認が済むまで「確認待ち」にして、変更履歴に残す（契約書 第5条第5項〜第7項）
  if (changed) { upd['目標の確認'] = '確認待ち'; upd['目標の確認日'] = ''; }
  const ok = updateMember_(me.id, upd);
  if (!ok) throw new Error('member_not_found');
  if (changed) {
    ensureHeaders_(SH.goalLog, GOAL_HEAD);
    const log = { '会員ID': me.id, '名前': before['名前'] || '', '変更日': fmtDate_(new Date()), '期': Number(g.cycle) || 1, '状態': '確認待ち' };
    for (let i = 0; i < 3; i++) {
      log['目標' + (i + 1)] = t[i] ? t[i].label : '';
      log['目標' + (i + 1) + ' スタート'] = t[i] ? t[i].start : '';
      log['目標' + (i + 1) + ' 目標値'] = t[i] ? t[i].target : '';
    }
    appendRow_(SH.goalLog, log);
    if (!me.demo) {
      const first = oldKey === '[]';
      const newCycle = (Number(g.cycle) || 1) > (Number(before['目標の期']) || 1);
      const kind = first ? '初回の目標設定' : newCycle ? '第' + (Number(g.cycle) || 1) + '期の目標' : '目標の変更';
      const lines = t.slice(0, 3).map((x, i) => {
        const was = !first && !newCycle && before['卒業目標' + (i + 1)] && String(before['目標' + (i + 1) + ' 目標値']) !== String(x.target) ? '（前回の目標 ' + before['目標' + (i + 1) + ' 目標値'] + '）' : '';
        return '• ' + sesc_(x.label) + '：' + x.start + ' → *' + x.target + '*' + was;
      });
      notify_(':dart: *' + sesc_(memberName_(before)) + 'さんが目標を保存しました*（' + sesc_(String(before['プラン'] || 'プラン未設定')) + '・' + kind + '）\n'
        + (g.scene ? '6ヶ月後の理想の場面：' + sesc_(g.scene) + '\n' : '')
        + lines.join('\n') + '\n'
        + '<' + ADMIN_URL + '|管理者ページ>で「確定する／見直しをお願い／面談で相談」を選んでください');
    }
  }
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
  const after = findMember_(me.id);
  return { ok: true, months: monthsOf_(me.id), goalLog: goalLogOf_(me.id), goalCheck: String(after['目標の確認'] || ''), goalCheckAt: fmtDate_(after['目標の確認日']) };
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

// ============ 延長保証の測定と判定（契約書 第9条） ============
// 判定期間（STANDARD 13週・VIP 26週）の終了日から7日以内に、受講開始時と同じ方法で測った数値を入力してもらう
function saveJudge_(me, req) {
  const m = findMember_(me.id); if (!m) throw new Error('member_not_found');
  const vip = String(m['プラン'] || '') === 'VIP', total = vip ? 26 : 13;
  const st = parseYmd_(fmtDate_(m['開始日（DAY1）'])); if (!st) throw new Error('not_started');
  const today = parseYmd_(fmtDate_(new Date()));
  const day = Math.round((today - st) / 864e5) + 1;
  if (!me.demo && (day < total * 7 || day > total * 7 + 7)) throw new Error('judge_closed');
  const vals = (Array.isArray(req.values) ? req.values : []).slice(0, 3).map(v => v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
  if (vals.every(v => v == null)) throw new Error('no_values');
  // 判定に使う目標：判定期間の終了日の4週間前までに確定していたもの（なければ現在の目標）
  const cutoff = ymd_(new Date(st.getTime() + (total * 7 - 1 - 28) * 864e5));
  const confirmed = goalLogOf_(me.id).filter(x => x.status === '確定' && (x.checkedAt || x.date) <= cutoff);
  const cur = [1, 2, 3].map(i => ({ label: String(m['卒業目標' + i] || ''), start: num_(m['目標' + i + ' スタート']), target: num_(m['目標' + i + ' 目標値']) })).filter(t => t.label);
  const goals = confirmed.length ? confirmed[confirmed.length - 1].targets : cur;
  const hit = goals.filter((t, i) => vals[i] != null && t.start != null && t.target != null && (t.target < t.start ? vals[i] <= t.target : vals[i] >= t.target)).length;
  const w = recordWeeks_(m, table_(SH.record).rows);
  const result = !w.pass ? '対象外（記録の週数が不足）' : hit >= 2 ? '対象外（卒業目標を達成）' : '対象（延長の手続きをする）';
  ensureHeaders_(SH.member, JUDGE_HEAD);
  updateMember_(me.id, {
    '延長保証 測定日': fmtDate_(new Date()),
    '延長保証 測定値': goals.map((t, i) => t.label + '：' + (vals[i] == null ? '—' : vals[i]) + '（目標 ' + (t.target == null ? '—' : t.target) + '）').join('／'),
    '延長保証 記録週数': w.ok + '/' + w.total + '週（条件 ' + w.need + '週以上）' + (w.ok < w.need && w.last4 ? '・最後の4週間をすべて達成' : ''),
    '延長保証 判定': result
  });
  if (!me.demo) {
    const r2 = findMember_(me.id);
    notify_(':memo: *' + sesc_(memberName_(r2)) + 'さんが延長保証の測定値を送りました*（' + sesc_(String(r2['プラン'] || '')) + '）\n'
      + '測定値：' + sesc_(String(r2['延長保証 測定値'])) + '\n記録：' + sesc_(String(r2['延長保証 記録週数'])) + '\n判定：*' + sesc_(String(r2['延長保証 判定'])) + '*\n'
      + '対象なら会員シートの「延長希望」を「延長する」にして、7日以内に公式LINEで結果を伝えてください（<' + ADMIN_URL + '|管理者ページ>）');
  }
  return { ok: true, at: fmtDate_(new Date()) };
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
    if (courseOver_(r)) return; // 受講期間が終わり、卒業生コミュニティに参加していない人には送らない
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

/** 動作確認用：Slackにテストのお知らせを1通送る */
function testSlack() {
  Logger.log(notify_(':white_check_mark: RESHAPEからのテスト通知です。目標の設定・変更、延長保証の測定、目標未記入のお知らせがこのチャンネルに届きます。') ? '送信しました' : '送れませんでした（SLACK_WEBHOOK_URL を確認してください）');
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

// 会員が自分の写真を削除（ドライブのファイルはゴミ箱へ＝30日間は復元できる）
function deletePhoto_(me, req) {
  const id = String(req.fileId || '');
  const t = table_(SH.photo);
  const r = t.rows.find(x => String(x['会員ID']) === me.id && (fileId_(x['正面の写真']) === id || fileId_(x['横向きの写真']) === id));
  if (!r) throw new Error('not_allowed');
  const col = fileId_(r['正面の写真']) === id ? '正面の写真' : '横向きの写真';
  const other = col === '正面の写真' ? '横向きの写真' : '正面の写真';
  if (fileId_(r[other])) t.sheet.getRange(r._row, t.col[col] + 1).setValue('');
  else t.sheet.deleteRow(r._row);
  try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* ファイルが見つからなくても記録は消す */ }
  return { ok: true };
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
  if (!m || String(m['利用'] || '') === '停止' || courseOver_(m)) throw new Error('course_over');
  const text = String(req.text || '').slice(0, 800);
  // 食事写真はVIPと卒業生コミュニティの人だけ（契約書 別紙1・第10条）
  const photoOk = String(m['プラン'] || '') === 'VIP' || String(m['利用'] || '') === '卒業生';
  const img = photoOk ? String(req.image || '') : '';
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

// ============ Slack通知 ============
function sesc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function memberName_(r) { return String((r && (r['名前'] || r['LINE表示名'])) || '（名前未登録）'); }
// Slackに送る。届かなくても会員の保存は止めない
function notify_(text) {
  try {
    const url = prop_('SLACK_WEBHOOK_URL');
    if (!url) { Logger.log('SLACK_WEBHOOK_URL が未設定のため、Slackに送れませんでした'); return false; }
    const res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ text: text }), muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) { Logger.log('Slackへの送信に失敗：' + res.getResponseCode() + ' ' + res.getContentText()); return false; }
    return true;
  } catch (e) { Logger.log('Slackへの送信に失敗：' + e.message); return false; }
}

// ============ 公式LINEの友だち追加（Webhook）→ 会員シートに「承認待ち」で登録し、LINE登録日を残す ============
function lineWebhook_(req) {
  const token = prop_('LINE_MESSAGING_TOKEN');
  if (!token) return { ok: true };
  (req.events || []).forEach(ev => {
    if (!ev || ev.type !== 'follow' || !ev.source || !ev.source.userId) return;
    const id = String(ev.source.userId);
    // 本当にこの公式LINEの友だちかを、LINEに問い合わせて確かめる（なりすまし対策）
    const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/profile/' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return;
    const name = String(JSON.parse(res.getContentText()).displayName || '');
    const date = Utilities.formatDate(new Date(Number(ev.timestamp) || Date.now()), TZ, 'yyyy/MM/dd');
    ensureHeaders_(SH.member, REMIND_HEAD);
    const m = findMember_(id);
    if (m) { if (!m['LINE登録日']) updateMember_(id, { 'LINE登録日': date }); return; }
    appendRow_(SH.member, { '会員ID': id, '名前': name, 'LINE表示名': name, '利用': '承認待ち', 'LINE登録日': date, 'メモ': '友だち追加 ' + now_() });
  });
  return { ok: true };
}

// ============ 目標が未記入の人をSlackで知らせる（毎朝9時に自動実行） ============
// LINE登録日から3日たっても目標が未記入 → 1回目、7日たっても未記入（1回目から4日以上あと）→ 2回目。送信用のメッセージも付ける
function goalReminder() {
  ensureHeaders_(SH.member, REMIND_HEAD);
  const today = parseYmd_(fmtDate_(new Date()));
  const items = [];
  table_(SH.member).rows.forEach(r => {
    const id = String(r['会員ID'] || '');
    if (!id || /^SAMPLE-/.test(id)) return;
    if (/^(停止|終了|卒業生)$/.test(String(r['利用'] || ''))) return;
    if (r['卒業目標1'] || r['目標設定日']) return;
    const memo = (String(r['メモ'] || '').match(/(?:自動登録|友だち追加)\s*(\d{4}\/\d{1,2}\/\d{1,2})/) || [])[1];
    const reg = parseYmd_(fmtDate_(r['LINE登録日'])) || parseYmd_(memo);
    if (!reg) return;
    const days = Math.round((today - reg) / 864e5);
    const n = Number(r['目標リマインド回数']) || 0;
    const last = parseYmd_(fmtDate_(r['目標リマインド通知日']));
    const sinceLast = last ? Math.round((today - last) / 864e5) : 999;
    let step = 0;
    if (n === 0 && days >= 3) step = 1;
    else if (n === 1 && days >= 7 && sinceLast >= 4) step = 2;
    if (step) items.push({ r: r, id: id, reg: reg, days: days, step: step });
  });
  if (!items.length) { Logger.log('目標が未記入の人はいません'); return; }
  const blocks = items.map(x => {
    const name = memberName_(x.r), plan = String(x.r['プラン'] || '');
    return '• *' + sesc_(name) + 'さん*' + (plan ? '（' + sesc_(plan) + '）' : '') + '　LINE登録日 ' + ymd_(x.reg) + '（' + x.days + '日経過・' + x.step + '回目のお知らせ）\n'
      + '送信用メッセージ：\n```' + sesc_(goalReminderText_(name, plan, x.step)) + '```';
  });
  const ok = notify_(':bell: *目標の記入がまだの方がいます（' + items.length + '名）*\n下のメッセージをコピーして、その方の公式LINEに送ってください。\n\n' + blocks.join('\n\n'));
  if (ok) items.forEach(x => updateMember_(x.id, { '目標リマインド回数': x.step, '目標リマインド通知日': fmtDate_(new Date()) }));
}

// 目標未記入の人に送るメッセージ（加藤さんがSlackからコピーして公式LINEで送る）
// STANDARDには面談がないので面談に触れず、「このLINEでやり取りしながら一緒に決める」形にする
function goalReminderText_(name, plan, step) {
  const vip = plan === 'VIP';
  if (step === 1) {
    return name + 'さん、こんにちは。加トちゃんです😊\n'
      + 'Teras Lab. RESHAPEへのご登録、ありがとうございます！\n\n'
      + '最初のステップの「目標設定」はもう開いてみましたか？\n'
      + '「数字にするのが難しい」「何を目標にしたらいいかわからない」と感じる方も多いので、最初から完璧に決めなくても大丈夫です。あとから一緒に調整できます。\n\n'
      + (vip
        ? '最終的には初回カウンセリングで一緒に決めていきます。その前に、今いちばん気になっていることを1つだけ、このLINEに送ってもらえると当日がスムーズです😊\n'
        : 'このLINEでやり取りしながら、一緒に目標を決めていきましょう。\nまずは今いちばん気になっていることを、1つだけ返信で送ってください😊\n')
      + '\n▼ 目標設定はこちら\n' + LIFF_URL;
  }
  return name + 'さん、こんにちは。加トちゃんです。\n\n'
    + 'その後、目標設定はいかがですか？\n'
    + 'たとえば「朝の腰の痛み」「体重」「休まず歩ける時間」など、変えたいことを言葉で送ってもらえれば、数字にするところは僕が一緒に考えます。\n\n'
    + (vip
      ? '初回カウンセリングの前に、気になっていることだけでも送っておいてもらえると、当日がスムーズです😊\n'
      : 'このLINEに返信をもらえたら、そこから一緒に進めていきますね😊\n')
    + '\n▼ 目標設定はこちら\n' + LIFF_URL;
}

// ============ サポート終了のお知らせ（毎朝9時に自動実行・Slack） ============
// 終了の30日前・7日前・当日に、送信用メッセージつきで知らせる。コミュニティに参加する人は、月末のつなぎ期間の終わりにも知らせる
const END_HEAD = ['終了案内 30日前', '終了案内 7日前', '終了案内 当日', '終了案内 切り替え'];
function supportReminder() {
  ensureHeaders_(SH.member, END_HEAD);
  const today = parseYmd_(fmtDate_(new Date()));
  const recs = table_(SH.record).rows;
  const items = [];
  table_(SH.member).rows.forEach(r => {
    const id = String(r['会員ID'] || '');
    if (!id || /^SAMPLE-/.test(id) || String(r['利用'] || '') !== '利用中') return;
    const end = supportEnd_(r); if (!end) return;
    const left = Math.round((end - today) / 864e5);
    let step = '';
    if (joining_(r) && Math.round((today - monthEnd_(end)) / 864e5) >= 0 && !r['終了案内 切り替え']) step = '切り替え';
    else if (left <= 0 && left > -7 && !r['終了案内 当日']) step = '当日';
    else if (left > 0 && left <= 7 && !r['終了案内 7日前']) step = '7日前';
    else if (left > 7 && left <= 30 && !r['終了案内 30日前']) step = '30日前';
    if (step) items.push({ r: r, id: id, end: end, left: left, step: step, w: recordWeeks_(r, recs) });
  });
  if (!items.length) { Logger.log('サポート終了のお知らせはありません'); return; }
  const label = { '30日前': '終了の30日前', '7日前': '終了の7日前', '当日': '終了日当日', '切り替え': 'コミュニティへの切り替え' };
  const blocks = items.map(x => {
    const r = x.r, name = memberName_(r), plan = String(r['プラン'] || ''), ext = /延長する/.test(String(r['延長希望'] || ''));
    const comm = String(r['卒業生コミュニティ参加希望'] || '未確認');
    const st = parseYmd_(fmtDate_(r['開始日（DAY1）'])), periodOver = st && Math.round((today - st) / 864e5) + 1 > x.w.total * 7;
    const judged = String(r['延長保証 判定'] || '');
    const g = ext ? '延長中' : judged ? judged : x.w.pass ? '記録の条件をクリア（' + x.w.ok + '/' + x.w.total + '週）・測定待ち' : periodOver ? '対象外（記録の週数が不足）' : '記録 ' + x.w.ok + '/' + x.w.total + '週（条件 ' + x.w.need + '週。最後の4週間すべて週3日以上でも対象）';
    x.pending = !ext && !judged && x.w.pass;
    let todo = '';
    if (x.step === '7日前') todo = '\n→ 返信で参加の意思を確認したら、会員シートの「卒業生コミュニティ参加希望」を「参加する」または「参加しない」にしてください';
    if (x.step === '当日' && !joining_(r)) todo = x.pending ? '\n→ 延長保証の判定待ちです。判定が出るまでは受講生専用LINEでのやり取りを続けてください' : '\n→ 受講生専用LINEでのやり取りは終了です（ブロックはせず、返信しない運用で大丈夫です）';
    if (x.step === '切り替え') todo = '\n→ 会員シートの「利用」を「卒業生」にして、卒業生コミュニティの決済（毎月1日）を開始してください';
    return '• *' + sesc_(name) + 'さん*（' + sesc_(plan) + '）　' + label[x.step] + '：サポート終了日 ' + ymd_(x.end)
      + '\n延長保証：' + g + '　卒業生コミュニティ：' + sesc_(comm) + todo
      + (x.step === '切り替え' ? '' : '\n送信用メッセージ：\n```' + sesc_(supportReminderText_(r, x)) + '```');
  });
  const ok = notify_(':hourglass_flowing_sand: *サポート期間のお知らせ（' + items.length + '名）*\n下のメッセージをコピーして、その方の公式LINEに送ってください。\n\n' + blocks.join('\n\n'));
  if (ok) items.forEach(x => { const u = {}; u['終了案内 ' + x.step] = fmtDate_(new Date()); updateMember_(x.id, u); });
}

function supportReminderText_(r, x) {
  const name = memberName_(r), vip = String(r['プラン'] || '') === 'VIP', ext = /延長する/.test(String(r['延長希望'] || ''));
  const md = d => (d.getMonth() + 1) + '月' + d.getDate() + '日';
  const what = ext ? '延長サポート' : vip ? 'サポート期間' : 'チャットでのサポート';
  const endWhat = ext ? '延長サポート' : vip ? 'サポート' : 'チャットでのサポート';
  const me = monthEnd_(x.end), next = new Date(me.getFullYear(), me.getMonth() + 1, 1);
  const course = courseEnd_(r);
  if (x.step === '30日前') {
    return name + 'さん、こんにちは。加トちゃんです😊\n'
      + 'RESHAPEの' + what + 'も、残り1ヶ月になりました（' + md(x.end) + 'まで）。\n\n'
      + 'ここまで続けてきたこと、本当にすごいです。\nラスト1ヶ月、一緒にいい形で締めくくりましょう！\n\n'
      + (ext ? ''
        : '【延長保証について】\nこの最後の1ヶ月、毎週3日以上の記録を続けてもらえたら、延長保証の対象になります。\n'
          + '期間が終わったあとに測定値を入力して、目標に届いていなかった場合は、サポートを3ヶ月無料で延長します。\n'
          + '（記録は、ストレッチかトレーニングにチェックを入れて、その日のうちに保存した日が数えられます）\n\n')
      + '▼ 今日のメニューはこちら\n' + LIFF_URL + '\n\n気になることがあれば、このLINEで気軽に聞いてくださいね。';
  }
  if (x.step === '7日前') {
    return name + 'さん、こんにちは。加トちゃんです。\n'
      + 'RESHAPEの' + what + 'は' + md(x.end) + 'までです。残り1週間、ラストスパートです！\n\n'
      + 'そして、ここからのご案内です。\n'
      + 'RESHAPEを卒業したあとも、手に入れた体を一緒に保っていけるように「卒業生コミュニティ」を用意しています。\n'
      + '・動画講座の継続視聴（新しい動画も含む）\n・会員サイトで記録と体の変化の確認\n・月1回のセッション\n・食事写真へのフィードバック\n・勉強会・交流会\n'
      + '月額10,000円で、それ以外の費用はかかりません。\n\n'
      + '参加される方は、' + md(x.end) + 'のあとも' + md(me) + 'まで今のサポートをそのまま続けて、' + (next.getMonth() + 1) + '月1日からコミュニティに切り替えます。間が空かないので、そのまま続けられます😊\n\n'
      + (!ext ? '延長保証の対象になった場合は、延長期間が終わるときにあらためてご案内しますね。\n\n' : '')
      + '「参加したい」「少し迷っている」どちらでも大丈夫なので、このLINEに返信をもらえるとうれしいです。';
  }
  // 当日
  if (joining_(r)) {
    return name + 'さん、こんにちは。加トちゃんです。\n'
      + '本日で、RESHAPEの' + endWhat + 'が終了します。本当におつかれさまでした！\n\n'
      + '卒業生コミュニティへのご参加、ありがとうございます。\n' + md(me) + 'までは今のサポートをそのまま続けて、' + (next.getMonth() + 1) + '月1日からコミュニティに切り替わります。決済のご案内は、あらためてお送りしますね。\n\n'
      + 'これからも一緒に続けていきましょう😊';
  }
  return name + 'さん、こんにちは。加トちゃんです。\n'
    + '本日で、RESHAPEの' + endWhat + 'が終了します。' + (vip || ext ? '' : '3ヶ月間、') + '本当におつかれさまでした！\n\n'
    + 'ここまで続けてきたことは、これからの体の財産になります。\n'
    + (!vip && !ext && course && course > x.end ? '会員サイトと動画は' + md(course) + 'まで引き続き使えるので、記録はこのまま続けてくださいね。\n' : '')
    + (x.pending
      ? '\n延長保証の記録の条件をクリアしています🎉\n会員サイトに出る「延長保証の測定」から、受講開始時と同じ方法で測った数値を入力してください。結果は7日以内にこのLINEでお知らせします。\n'
      : '\nこのLINEでのご質問へのお返事は、本日で終了となります。\n')
    + '卒業生コミュニティには、あとからでも参加できます。続けたくなったときは、いつでも声をかけてください😊';
}

// ============ 管理者 ============
function checkAdmin_(req) {
  const k = prop_('ADMIN_KEY');
  if (!k || String(req.adminKey || '') !== k) throw new Error('admin_denied');
}

function adminData_(req) {
  checkAdmin_(req);
  const recs = table_(SH.record).rows, photos = table_(SH.photo).rows, monthRows = table_(SH.month).rows;
  const logs = table_(SH.goalLog).rows;
  const today = fmtDate_(new Date());
  const members = table_(SH.member).rows.filter(r => r['会員ID']).map(r => {
    const m = memberOut_(r);
    const mine = recs.filter(x => String(x['会員ID']) === m.id).map(recordOut_);
    const ph = photos.filter(x => String(x['会員ID']) === m.id).map(photoOut_);
    const mo = monthRows.filter(x => String(x['会員ID']) === m.id && num_(x['月'])).map(monthOut_).sort((a, b) => a.n - b.n);
    const gl = logs.filter(x => String(x['会員ID']) === m.id && x['変更日']).map(goalLogOut_).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a._row - b._row)).map(x => { delete x._row; return x; });
    const ce = courseEnd_(r);
    return { member: m, records: mine.slice(-60), photos: ph, months: mo, goalLog: gl, weeks: recordWeeks_(r, recs), courseEnd: ce ? ymd_(ce) : '', courseOver: courseOver_(r) };
  });
  return { ok: true, today: today, members: members, sheetUrl: ss_().getUrl() };
}

// 目標の確認（確定・見直しをお願い・面談で相談）を管理者ページから記録する
function adminGoal_(req) {
  checkAdmin_(req);
  const id = String(req.id || ''), status = String(req.status || ''), memo = String(req.memo || '').slice(0, 300);
  if (GOAL_CHECK.indexOf(status) < 0) throw new Error('bad_status');
  if (!findMember_(id)) throw new Error('member_not_found');
  ensureHeaders_(SH.member, JUDGE_HEAD);
  const upd = { '目標の確認': status, '目標の確認日': fmtDate_(new Date()) };
  if (memo) upd['担当からのひとこと'] = memo;
  updateMember_(id, upd);
  // 変更履歴のいちばん新しい行にも、確認の結果を書く
  ensureHeaders_(SH.goalLog, GOAL_HEAD);
  const t = table_(SH.goalLog);
  const mine = t.rows.filter(r => String(r['会員ID']) === id && r['変更日']);
  const last = mine[mine.length - 1];
  if (last) {
    t.sheet.getRange(last._row, t.col['状態'] + 1).setValue(status);
    t.sheet.getRange(last._row, t.col['確認日'] + 1).setValue(fmtDate_(new Date()));
    if (memo) t.sheet.getRange(last._row, t.col['担当メモ'] + 1).setValue(memo);
  }
  return { ok: true };
}

function adminPhoto_(req) {
  checkAdmin_(req);
  return { ok: true, dataUrl: thumb_(String(req.fileId || '')) };
}

// ============ 初期設定（最初に1回だけ実行） ============
function setup() {
  const ss = ss_();
  const step = (label, fn) => { try { fn(); Logger.log('OK  ' + label); } catch (e) { Logger.log('NG  ' + label + '：' + e.message); } };
  step('プロパティの枠', () => ['LINE_CHANNEL_ID', 'ADMIN_KEY', 'ANTHROPIC_API_KEY', 'LINE_MESSAGING_TOKEN', 'SLACK_WEBHOOK_URL'].forEach(k => { if (prop_(k) === null) PropertiesService.getScriptProperties().setProperty(k, ''); }));
  step('見出しの追加', () => {
    ensureHeaders_(SH.member, ['目標の期'].concat(JUDGE_HEAD, REMIND_HEAD));
    ensureHeaders_(SH.goalLog, GOAL_HEAD);
    ensureHeaders_(SH.record, ['日付', '会員ID', '名前', 'DAY', '週', 'ストレッチ①', 'ストレッチ②', 'トレーニング', '見た動画', '鏡チェック', '記録1', '記録2', '記録3', 'ひとこと', '保存日時', '目標1 いま', '目標2 いま', '目標3 いま']);
    ensureHeaders_(SH.photo, ['撮影日', '会員ID', '名前', 'DAY', 'タイミング', '正面の写真', '横向きの写真', '担当コメント']);
    ensureHeaders_(SH.meal, ['日時', '会員ID', '名前', '送った内容', '写真', '自動返信', '担当フィードバック（VIP）']);
  });
  step('会員シートのプルダウン', () => {
    const ms = ss.getSheetByName(SH.member), t = table_(SH.member);
    const dv = (list) => SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build();
    const put = (h, list) => { if (t.col[h] !== undefined) ms.getRange(2, t.col[h] + 1, 500, 1).setDataValidation(dv(list)); };
    put('プラン', ['STANDARD', 'VIP']);
    put('利用', ['承認待ち', '利用中', '卒業生', '終了', '停止']);
    put('延長希望', ['延長する', '延長しない', '未確認']);
    put('卒業生コミュニティ参加希望', ['参加する', '参加しない', '未確認']);
    put('目標の確認', GOAL_CHECK);
    ms.setFrozenColumns(2);
  });
  step('見出しの固定と色', () => [SH.member, SH.record, SH.photo, SH.meal, SH.goalLog].forEach(n => { const s = ss.getSheetByName(n); if (!s) return; s.setFrozenRows(1); s.getRange(1, 1, 1, s.getLastColumn()).setFontWeight('bold').setBackground('#E2EEE9'); }));
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
  step('サポート終了のお知らせ（毎朝9時・Slack）', () => {
    ensureHeaders_(SH.member, END_HEAD);
    if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'supportReminder')) ScriptApp.newTrigger('supportReminder').timeBased().everyDays(1).atHour(9).inTimezone(TZ).create();
  });
  step('目標未記入のお知らせ（毎朝9時・Slack）', () => {
    if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'goalReminder')) ScriptApp.newTrigger('goalReminder').timeBased().everyDays(1).atHour(9).inTimezone(TZ).create();
  });
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
