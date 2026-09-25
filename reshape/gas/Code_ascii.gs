/**
 * Teras Lab. RESHAPE \u2014 \u88cf\u5074\u306e\u30d7\u30ed\u30b0\u30e9\u30e0\uff08Google Apps Script\uff09
 *
 * \u7f6e\u304d\u5834\u6240\uff1a\u904b\u55b6\u7528\u30b9\u30d7\u30ec\u30c3\u30c9\u30b7\u30fc\u30c8\u300cTeras_Lab_RESHAPE\u300d\u306e \u62e1\u5f35\u6a5f\u80fd \u2192 Apps Script
 * \u521d\u56de\u3060\u3051\uff1a\u95a2\u6570\u300csetup\u300d\u3092\u5b9f\u884c \u2192 \u30a6\u30a7\u30d6\u30a2\u30d7\u30ea\u3068\u3057\u3066\u30c7\u30d7\u30ed\u30a4
 *
 * \u30b9\u30af\u30ea\u30d7\u30c8\u30d7\u30ed\u30d1\u30c6\u30a3\uff08\u30d7\u30ed\u30b8\u30a7\u30af\u30c8\u306e\u8a2d\u5b9a \u2192 \u30b9\u30af\u30ea\u30d7\u30c8 \u30d7\u30ed\u30d1\u30c6\u30a3\uff09
 *   LINE_CHANNEL_ID   \u2026 LINE\u30ed\u30b0\u30a4\u30f3\u306e\u30c1\u30e3\u30cd\u30ebID\uff08\u6570\u5b57\uff09
 *   ADMIN_KEY         \u2026 \u7ba1\u7406\u8005\u30da\u30fc\u30b8\u306e\u5408\u8a00\u8449\uff08\u52a0\u85e4\u3055\u3093\u304c\u81ea\u5206\u3067\u6c7a\u3081\u308b\uff09
 *   ANTHROPIC_API_KEY \u2026 \u98df\u4e8b\u30b5\u30dd\u30fc\u30c8\u306b\u4f7f\u3046AI\u306e\u30ad\u30fc\uff08\u52a0\u85e4\u3055\u3093\u304c\u81ea\u5206\u3067\u5165\u529b\uff09
 *   PHOTO_FOLDER_ID   \u2026 setup \u3067\u81ea\u52d5\u4f5c\u6210\uff08\u59ff\u52e2\u5199\u771f\u306e\u4fdd\u5b58\u5148\u30d5\u30a9\u30eb\u30c0\uff09
 *   LINE_MESSAGING_TOKEN \u2026 \u516c\u5f0fLINE\uff08Messaging API\uff09\u306e\u9577\u671f\u30c1\u30e3\u30cd\u30eb\u30a2\u30af\u30bb\u30b9\u30c8\u30fc\u30af\u30f3\uff08\u6bce\u6708\u306e\u898b\u76f4\u3057\u30ea\u30de\u30a4\u30f3\u30c9\u7528\uff09
 */

const TZ = 'Asia/Tokyo';
const SOURCE_180DAY_ID = '1jRhfGPH2k3RBxXAUSmE5n5QETlXbu_eAlw9JUzHtkXM'; // 180\u65e5\u30d7\u30ed\u30b0\u30e9\u30e0\uff08\u6bce\u65e5\u306e\u30b9\u30c8\u30ec\u30c3\u30c1\u306e\u5272\u308a\u5f53\u3066\u5143\uff09
const SOURCE_180DAY_GID = 1146111468;
const MEAL_MODEL = 'claude-haiku-4-5-20251001';
const SHEET_ID = '15XKWaI3hG0ACJyY4RuLjWOIiUpfGqVTQ4V2qH_ezsUg'; // \u904b\u55b6\u7528\u30b9\u30d7\u30ec\u30c3\u30c9\u30b7\u30fc\u30c8 Teras_Lab_RESHAPE
const LIFF_URL = 'https://liff.line.me/2011731827-ZLDHlKTg';
const MONTH_HEAD = ['\u4f1a\u54e1ID', '\u540d\u524d', '\u671f', '\u6708', '\u898b\u76f4\u3057\u65e5', '\u76ee\u6a191 \u4e2d\u9593', '\u76ee\u6a192 \u4e2d\u9593', '\u76ee\u6a193 \u4e2d\u9593', '\u76ee\u6a191 \u5b9f\u7e3e', '\u76ee\u6a192 \u5b9f\u7e3e', '\u76ee\u6a193 \u5b9f\u7e3e', '\u9054\u6210\u6570', '\u3046\u307e\u304f\u3044\u3063\u305f\u3053\u3068', '\u3046\u307e\u304f\u3044\u304b\u306a\u304b\u3063\u305f\u3053\u3068', '\u6765\u6708\u306e\u5de5\u592b', '\u8a18\u5165\u65e5', 'LINE\u901a\u77e5\u65e5'];

const SH = {
  member: '\u4f1a\u54e1', record: '\u6bce\u65e5\u306e\u8a18\u9332', photo: '\u59ff\u52e2\u5199\u771f', meal: '\u98df\u4e8b',
  video: '\u52d5\u753b\u30de\u30b9\u30bf\u30fc', lecture: '\u8b1b\u7fa9\u30de\u30b9\u30bf\u30fc', roadmap: '26\u9031\u30ed\u30fc\u30c9\u30de\u30c3\u30d7', daily: '\u6bce\u65e5\u306e\u30b9\u30c8\u30ec\u30c3\u30c1', month: '\u6708\u306e\u76ee\u6a19'
};

// ============ \u5165\u53e3 ============
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

// ============ \u672c\u4eba\u78ba\u8a8d\uff08LINE\u30ed\u30b0\u30a4\u30f3\uff09 ============
function identify_(req) {
  if (req.demo) {
    const id = String(req.demo);
    if (!/^SAMPLE-/.test(id)) throw new Error('demo_not_allowed');
    return { id: id, name: '', demo: true };
  }
  if (!req.idToken) throw new Error('no_token');
  const channelId = prop_('LINE_CHANNEL_ID');
  if (!channelId) throw new Error('LINE_CHANNEL_ID \u304c\u672a\u8a2d\u5b9a\u3067\u3059');
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

// ============ \u8d77\u52d5\u6642\u306e\u30c7\u30fc\u30bf ============
function boot_(me, req) {
  const members = table_(SH.member);
  let m = members.rows.find(r => String(r['\u4f1a\u54e1ID']) === me.id);
  if (!m) {
    if (me.demo) throw new Error('sample_not_found');
    // \u306f\u3058\u3081\u3066\u958b\u3044\u305f\u4eba\uff1a\u627f\u8a8d\u5f85\u3061\u3068\u3057\u3066\u767b\u9332
    const name = String(req.displayName || me.name || '');
    appendRow_(SH.member, { '\u4f1a\u54e1ID': me.id, '\u540d\u524d': name, 'LINE\u8868\u793a\u540d': name, '\u5229\u7528': '\u627f\u8a8d\u5f85\u3061', '\u30e1\u30e2': '\u81ea\u52d5\u767b\u9332 ' + now_() });
    m = table_(SH.member).rows.find(r => String(r['\u4f1a\u54e1ID']) === me.id);
  }
  return {
    ok: true,
    today: fmtDate_(new Date()),
    member: memberOut_(m),
    records: table_(SH.record).rows.filter(r => String(r['\u4f1a\u54e1ID']) === me.id).map(recordOut_),
    photos: table_(SH.photo).rows.filter(r => String(r['\u4f1a\u54e1ID']) === me.id).map(photoOut_),
    months: monthsOf_(me.id),
    content: content_()
  };
}

function memberOut_(r) {
  const goals = [1, 2, 3].map(i => ({
    label: String(r['\u5352\u696d\u76ee\u6a19' + i] || ''),
    start: num_(r['\u76ee\u6a19' + i + ' \u30b9\u30bf\u30fc\u30c8']),
    target: num_(r['\u76ee\u6a19' + i + ' \u76ee\u6a19\u5024'])
  })).filter(g => g.label);
  return {
    id: String(r['\u4f1a\u54e1ID']), name: String(r['\u540d\u524d'] || ''), plan: String(r['\u30d7\u30e9\u30f3'] || ''), status: String(r['\u5229\u7528'] || ''),
    zoomAt: fmtDateTime_(r['\u6b21\u306eZoom']), zoomLink: String(r['\u6b21\u306eZoom\u30ea\u30f3\u30af\uff08VIP\u306e\u307f\uff09'] || ''),
    coach: String(r['\u62c5\u5f53\u304b\u3089\u306e\u3072\u3068\u3053\u3068'] || ''),
    paid: fmtDate_(r['\u652f\u6255\u65e5\uff08\u8d77\u7b97\u65e5\uff09']), start: fmtDate_(r['\u958b\u59cb\u65e5\uff08DAY1\uff09']),
    end3: fmtDate_(r['3\u30f6\u6708\u306e\u65e5\uff08\u652f\u6255\u65e5\u304b\u3089\uff09']), end6: fmtDate_(r['6\u30f6\u6708\u306e\u65e5\uff08\u652f\u6255\u65e5\u304b\u3089\uff09']),
    extension: String(r['\u5ef6\u9577\u5e0c\u671b'] || ''), community: String(r['\u5352\u696d\u751f\u30b3\u30df\u30e5\u30cb\u30c6\u30a3\u53c2\u52a0\u5e0c\u671b'] || ''),
    goal: {
      scene: String(r['6\u30f6\u6708\u5f8c\u306e\u7406\u60f3\u306e\u5834\u9762\uff08MY GOAL\uff09'] || ''), needs: String(r['\u304a\u60a9\u307f'] || ''),
      top: String(r['\u4e00\u756a\u89e3\u6c7a\u3057\u305f\u3044\u3053\u3068'] || ''), why: String(r['\u5909\u308f\u308a\u305f\u3044\u7406\u7531'] || ''), ifnot: String(r['\u3053\u306e\u307e\u307e\u3060\u30681\u5e74\u5f8c'] || ''),
      when: String(r['\u3084\u308b\u6642\u9593\u30fb\u5834\u6240'] || ''), plan: String(r['\u3064\u307e\u305a\u304d\u5bfe\u7b56'] || ''), setAt: fmtDate_(r['\u76ee\u6a19\u8a2d\u5b9a\u65e5']),
      targets: goals
    },
    fields: String(r['\u6bce\u65e5\u306e\u8a18\u9332\u9805\u76ee'] || ''),
    goalCycle: num_(r['\u76ee\u6a19\u306e\u671f']) || (goals.length ? 1 : 0)
  };
}

function monthOut_(r) {
  return {
    n: num_(r['\u6708']), cycle: num_(r['\u671f']), date: fmtDate_(r['\u898b\u76f4\u3057\u65e5']),
    targets: [num_(r['\u76ee\u6a191 \u4e2d\u9593']), num_(r['\u76ee\u6a192 \u4e2d\u9593']), num_(r['\u76ee\u6a193 \u4e2d\u9593'])],
    actual: [num_(r['\u76ee\u6a191 \u5b9f\u7e3e']), num_(r['\u76ee\u6a192 \u5b9f\u7e3e']), num_(r['\u76ee\u6a193 \u5b9f\u7e3e'])],
    hit: num_(r['\u9054\u6210\u6570']), good: String(r['\u3046\u307e\u304f\u3044\u3063\u305f\u3053\u3068'] || ''), bad: String(r['\u3046\u307e\u304f\u3044\u304b\u306a\u304b\u3063\u305f\u3053\u3068'] || ''),
    next: String(r['\u6765\u6708\u306e\u5de5\u592b'] || ''), doneAt: fmtDate_(r['\u8a18\u5165\u65e5'])
  };
}
function monthsOf_(id) {
  return table_(SH.month).rows.filter(r => String(r['\u4f1a\u54e1ID']) === id && num_(r['\u6708'])).map(monthOut_).sort((a, b) => a.n - b.n);
}

function recordOut_(r) {
  return {
    date: fmtDate_(r['\u65e5\u4ed8']), day: num_(r['DAY']),
    s1: String(r['\u30b9\u30c8\u30ec\u30c3\u30c1\u2460'] || ''), s2: String(r['\u30b9\u30c8\u30ec\u30c3\u30c1\u2461'] || ''), train: String(r['\u30c8\u30ec\u30fc\u30cb\u30f3\u30b0'] || ''),
    watched: String(r['\u898b\u305f\u52d5\u753b'] || ''), mirror: String(r['\u93e1\u30c1\u30a7\u30c3\u30af'] || ''),
    v: [num_(r['\u8a18\u93321']), num_(r['\u8a18\u93322']), num_(r['\u8a18\u93323'])],
    g: [num_(r['\u76ee\u6a191 \u3044\u307e']), num_(r['\u76ee\u6a192 \u3044\u307e']), num_(r['\u76ee\u6a193 \u3044\u307e'])],
    note: String(r['\u3072\u3068\u3053\u3068'] || '')
  };
}

function photoOut_(r) {
  return {
    date: fmtDate_(r['\u64ae\u5f71\u65e5']), day: num_(r['DAY']), label: String(r['\u30bf\u30a4\u30df\u30f3\u30b0'] || ''),
    front: fileId_(r['\u6b63\u9762\u306e\u5199\u771f']), side: fileId_(r['\u6a2a\u5411\u304d\u306e\u5199\u771f']), comment: String(r['\u62c5\u5f53\u30b3\u30e1\u30f3\u30c8'] || '')
  };
}

// \u52d5\u753b\u30fb\u8b1b\u7fa9\u30fb\u30ed\u30fc\u30c9\u30de\u30c3\u30d7\u30fb\u6bce\u65e5\u306e\u30b9\u30c8\u30ec\u30c3\u30c1\uff0810\u5206\u30ad\u30e3\u30c3\u30b7\u30e5\uff09
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
    const code = String(r['\u756a\u53f7'] || '').trim(); if (!code) return;
    const link = String(r['Vimeo\u30ea\u30f3\u30af'] || '').trim();
    if (r['\u7a2e\u5225'] === '\u30b9\u30c8\u30ec\u30c3\u30c1') stretch[code] = [String(r['\u30bf\u30a4\u30c8\u30eb'] || ''), link];
    if (r['\u7a2e\u5225'] === '\u904b\u52d5') {
      const memo = String(r['\u30e1\u30e2'] || '');
      const alt = (memo.match(/\u904b\u52d5([A-G]-[0-9]+(?:-[0-9]+)?(?:\u8ca0\u8377)?)/g) || []).map(x => x.replace('\u904b\u52d5', '')).find(x => x !== code) || '';
      train[code] = [String(r['\u30bf\u30a4\u30c8\u30eb'] || ''), link, String(r['\u5f37\u5ea6\uff0f\u96e3\u6613\u5ea6'] || ''), alt];
    }
  });
  const lectures = table_(SH.lecture).rows.filter(r => r['\u8b1b\u7fa9\u756a\u53f7']).map(r => ({
    code: String(r['\u8b1b\u7fa9\u756a\u53f7']), title: String(r['\u30bf\u30a4\u30c8\u30eb'] || ''), week: r['\u914d\u4fe1\u9031'] === '' ? null : num_(r['\u914d\u4fe1\u9031']),
    link: String(r['Vimeo\u30ea\u30f3\u30af'] || ''), kind: String(r['\u533a\u5206'] || ''), min: num_(r['\u5c3a\uff08\u5206\uff09']), status: String(r['\u72b6\u614b'] || '')
  }));
  const roadmap = table_(SH.roadmap).rows.filter(r => r['\u9031'] !== '' && !isNaN(Number(r['\u9031']))).map(r => ({
    week: Number(r['\u9031']), phase: String(r['\u30d5\u30a7\u30fc\u30ba'] || ''), theme: String(r['\u4eca\u9031\u306e\u30c6\u30fc\u30de'] || ''),
    freq: String(r['\u30c8\u30ec\u56de\u6570'] || ''),
    train: [r['\u30c8\u30ec1'], r['\u30c8\u30ec2'], r['\u30c8\u30ec3']].map(x => String(x || '').replace('\u904b\u52d5', '')).filter(Boolean),
    milestone: String(r['\u7bc0\u76ee\u30fb\u30b5\u30dd\u30fc\u30c8'] || '')
  }));
  let dailyRows = table_(SH.daily).rows;
  if (!dailyRows.length) { // \u30bf\u30d6\u304c\u7121\u3044\u3068\u304d\u306f180\u65e5\u30d7\u30ed\u30b0\u30e9\u30e0\u304b\u3089\u76f4\u63a5\u8aad\u3080
    try {
      const src = SpreadsheetApp.openById(SOURCE_180DAY_ID).getSheets().find(s => s.getSheetId() === SOURCE_180DAY_GID);
      const v = src ? src.getDataRange().getValues() : [];
      const h = (v[0] || []).map(x => String(x).trim());
      dailyRows = v.slice(1).map(r => { const o = {}; h.forEach((k, j) => { if (k) o[k] = r[j]; }); return o; });
    } catch (e) { dailyRows = []; }
  }
  const daily = dailyRows.filter(r => /^DAY\s*\d+$/.test(String(r['DAY'] || '').trim()) || /^\d+$/.test(String(r['DAY'] || '').trim())).map(r => [
    String(r['\u7ae0'] || ''), String(r['\u4eca\u65e5\u306e\u30b3\u30f3\u30bb\u30d7\u30c8'] || ''), String(r['\u7bc0\u76ee\u30d0\u30c3\u30b8'] || ''),
    String(r['\u30e1\u30a4\u30f3\u30b3\u30fc\u30c9'] || ''), String(r['\u30b5\u30d6\u30b3\u30fc\u30c9'] || '')
  ]);
  const out = { stretch: stretch, train: train, lectures: lectures, roadmap: roadmap, daily: daily };
  const s = JSON.stringify(out), size = 90000, n = Math.ceil(s.length / size), put = { cn: String(n) };
  for (let i = 0; i < n; i++) put['c' + i] = s.slice(i * size, (i + 1) * size);
  if (n <= 4) cache.putAll(put, 600);
  return out;
}

// ============ \u4fdd\u5b58 ============
function saveDay_(me, req) {
  const d = req.data || {};
  const date = String(d.date || fmtDate_(new Date()));
  const m = findMember_(me.id);
  const row = {
    '\u65e5\u4ed8': date, '\u4f1a\u54e1ID': me.id, '\u540d\u524d': m ? m['\u540d\u524d'] : '', 'DAY': d.day || '', '\u9031': d.week || '',
    '\u30b9\u30c8\u30ec\u30c3\u30c1\u2460': d.s1 || '', '\u30b9\u30c8\u30ec\u30c3\u30c1\u2461': d.s2 || '', '\u30c8\u30ec\u30fc\u30cb\u30f3\u30b0': (d.train || []).join('\u30fb'),
    '\u898b\u305f\u52d5\u753b': (d.watched || []).join('\u30fb'), '\u93e1\u30c1\u30a7\u30c3\u30af': d.mirror || '',
    '\u8a18\u93321': val_(d.v, 0), '\u8a18\u93322': val_(d.v, 1), '\u8a18\u93323': val_(d.v, 2),
    '\u76ee\u6a191 \u3044\u307e': val_(d.g, 0), '\u76ee\u6a192 \u3044\u307e': val_(d.g, 1), '\u76ee\u6a193 \u3044\u307e': val_(d.g, 2),
    '\u3072\u3068\u3053\u3068': String(d.note || '').slice(0, 500), '\u4fdd\u5b58\u65e5\u6642': now_()
  };
  ensureHeaders_(SH.record, ['\u76ee\u6a191 \u3044\u307e', '\u76ee\u6a192 \u3044\u307e', '\u76ee\u6a193 \u3044\u307e']);
  upsert_(SH.record, r => String(r['\u4f1a\u54e1ID']) === me.id && fmtDate_(r['\u65e5\u4ed8']) === date, row);
  return { ok: true };
}

function saveGoal_(me, req) {
  const g = req.goal || {};
  const t = g.targets || [];
  const upd = {
    '6\u30f6\u6708\u5f8c\u306e\u7406\u60f3\u306e\u5834\u9762\uff08MY GOAL\uff09': g.scene || '', '\u304a\u60a9\u307f': g.needs || '', '\u4e00\u756a\u89e3\u6c7a\u3057\u305f\u3044\u3053\u3068': g.top || '',
    '\u5909\u308f\u308a\u305f\u3044\u7406\u7531': g.why || '', '\u3053\u306e\u307e\u307e\u3060\u30681\u5e74\u5f8c': g.ifnot || '', '\u3084\u308b\u6642\u9593\u30fb\u5834\u6240': g.when || '', '\u3064\u307e\u305a\u304d\u5bfe\u7b56': g.plan || '',
    '\u76ee\u6a19\u8a2d\u5b9a\u65e5': fmtDate_(new Date()), '\u76ee\u6a19\u306e\u671f': Number(g.cycle) || 1
  };
  for (let i = 0; i < 3; i++) {
    upd['\u5352\u696d\u76ee\u6a19' + (i + 1)] = t[i] ? t[i].label : '';
    upd['\u76ee\u6a19' + (i + 1) + ' \u30b9\u30bf\u30fc\u30c8'] = t[i] ? t[i].start : '';
    upd['\u76ee\u6a19' + (i + 1) + ' \u76ee\u6a19\u5024'] = t[i] ? t[i].target : '';
  }
  ensureHeaders_(SH.member, ['\u76ee\u6a19\u306e\u671f']);
  const ok = updateMember_(me.id, upd);
  if (!ok) throw new Error('member_not_found');
  // \u6bce\u6708\u306e\u4e2d\u9593\u76ee\u6a19
  const ms = Array.isArray(g.milestones) ? g.milestones : [];
  if (ms.length) {
    ensureHeaders_(SH.month, MONTH_HEAD);
    const m = findMember_(me.id);
    ms.forEach(x => {
      const n = Number(x.n); if (!n) return;
      const row = { '\u4f1a\u54e1ID': me.id, '\u540d\u524d': m ? m['\u540d\u524d'] : '', '\u671f': Number(g.cycle) || 1, '\u6708': n, '\u898b\u76f4\u3057\u65e5': x.date || '' };
      for (let i = 0; i < 3; i++) row['\u76ee\u6a19' + (i + 1) + ' \u4e2d\u9593'] = val_(x.targets, i);
      upsert_(SH.month, r => String(r['\u4f1a\u54e1ID']) === me.id && Number(r['\u6708']) === n && !r['\u8a18\u5165\u65e5'], row);
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
    '\u4f1a\u54e1ID': me.id, '\u540d\u524d': m ? m['\u540d\u524d'] : '', '\u671f': Number(v.cycle) || Math.ceil(n / 6), '\u6708': n, '\u898b\u76f4\u3057\u65e5': v.date || '',
    '\u9054\u6210\u6570': v.hit != null ? Number(v.hit) : '',
    '\u3046\u307e\u304f\u3044\u3063\u305f\u3053\u3068': String(v.good || '').slice(0, 1000), '\u3046\u307e\u304f\u3044\u304b\u306a\u304b\u3063\u305f\u3053\u3068': String(v.bad || '').slice(0, 1000),
    '\u6765\u6708\u306e\u5de5\u592b': String(v.next || '').slice(0, 1000), '\u8a18\u5165\u65e5': fmtDate_(new Date())
  };
  for (let i = 0; i < 3; i++) {
    row['\u76ee\u6a19' + (i + 1) + ' \u5b9f\u7e3e'] = val_(v.actual, i);
    if (v.targets && v.targets[i] != null && v.targets[i] !== '') row['\u76ee\u6a19' + (i + 1) + ' \u4e2d\u9593'] = Number(v.targets[i]);
  }
  upsert_(SH.month, r => String(r['\u4f1a\u54e1ID']) === me.id && Number(r['\u6708']) === n, row);
  if (Array.isArray(v.nextTargets) && n % 6 !== 0) {
    const nx = { '\u4f1a\u54e1ID': me.id, '\u540d\u524d': row['\u540d\u524d'], '\u671f': row['\u671f'], '\u6708': n + 1, '\u898b\u76f4\u3057\u65e5': v.nextDate || '' };
    for (let i = 0; i < 3; i++) nx['\u76ee\u6a19' + (i + 1) + ' \u4e2d\u9593'] = val_(v.nextTargets, i);
    upsert_(SH.month, r => String(r['\u4f1a\u54e1ID']) === me.id && Number(r['\u6708']) === n + 1 && !r['\u8a18\u5165\u65e5'], nx);
  }
  return { ok: true, months: monthsOf_(me.id) };
}

// ============ \u6bce\u6708\u306e\u898b\u76f4\u3057\u30ea\u30de\u30a4\u30f3\u30c9\uff08\u6bce\u671d9\u6642\u306b\u81ea\u52d5\u5b9f\u884c\uff09 ============
function ymd_(d) { return d.getFullYear() + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + ('0' + d.getDate()).slice(-2); }
function parseYmd_(s) { const m = String(s || '').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function addMonths_(d, n) { const x = new Date(d.getTime()); x.setMonth(x.getMonth() + n); return x; }

function monthlyReminder() {
  const token = prop_('LINE_MESSAGING_TOKEN');
  if (!token) { Logger.log('LINE_MESSAGING_TOKEN \u304c\u672a\u8a2d\u5b9a\u306e\u305f\u3081\u9001\u4fe1\u3057\u307e\u305b\u3093'); return; }
  ensureHeaders_(SH.month, MONTH_HEAD);
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy/MM/dd');
  const weekAgo = Utilities.formatDate(new Date(Date.now() - 7 * 864e5), TZ, 'yyyy/MM/dd');
  const months = table_(SH.month).rows;
  let sent = 0;
  table_(SH.member).rows.forEach(r => {
    const id = String(r['\u4f1a\u54e1ID'] || '');
    if (!id || /^SAMPLE-/.test(id) || !/^(\u5229\u7528\u4e2d|\u5352\u696d\u751f)$/.test(String(r['\u5229\u7528'] || ''))) return;
    const st = parseYmd_(fmtDate_(r['\u958b\u59cb\u65e5\uff08DAY1\uff09'])); if (!st) return;
    let n = 0; while (n < 120 && ymd_(addMonths_(st, n + 1)) <= today) n++;
    if (n < 1) return;
    const date = ymd_(addMonths_(st, n));
    if (date < weekAgo) return; // 1\u9031\u9593\u4ee5\u4e0a\u524d\u306e\u898b\u76f4\u3057\u306f\u9001\u3089\u306a\u3044
    const row = months.find(x => String(x['\u4f1a\u54e1ID']) === id && Number(x['\u6708']) === n);
    if (row && (row['\u8a18\u5165\u65e5'] || row['LINE\u901a\u77e5\u65e5'])) return;
    const name = String(r['\u540d\u524d'] || '');
    const k = ((n - 1) % 6) + 1, c = Math.ceil(n / 6);
    const text = n % 6 === 0
      ? name + '\u3055\u3093\u3001\u7b2c' + c + '\u671f\u306e6\u30f6\u6708\u304c\u7d4c\u3061\u307e\u3057\u305f\u3002\n\n\u4eca\u65e5\u306f\u300c\u6700\u7d42\u898b\u76f4\u3057\u300d\u306e\u65e5\u3067\u3059\u30026\u30f6\u6708\u524d\u306b\u6c7a\u3081\u305f\u76ee\u6a19\u3092\u3075\u308a\u8fd4\u3063\u3066\u3001\u6b21\u306e6\u30f6\u6708\u306e\u76ee\u6a19\u3068\u3001\u6bce\u6708\u306e\u4e2d\u9593\u76ee\u6a19\u3092\u6c7a\u3081\u307e\u3057\u3087\u3046\uff08\u7d0410\u5206\uff09\u3002\n\n\u25bc \u898b\u76f4\u3057\u3092\u306f\u3058\u3081\u308b\n' + LIFF_URL + '?v=review'
      : name + '\u3055\u3093\u3001' + k + '\u30f6\u6708\u76ee\u306e\u898b\u76f4\u3057\u306e\u65e5\u3067\u3059\u3002\n\n\u4eca\u306e\u6570\u5b57\u3092\u5165\u308c\u3066\u3001\u4e2d\u9593\u76ee\u6a19\u306b\u3069\u3053\u307e\u3067\u8fd1\u3065\u3044\u305f\u304b\u78ba\u8a8d\u3057\u307e\u3057\u3087\u3046\u3002\u3046\u307e\u304f\u3044\u3063\u305f\u3053\u3068\u30fb\u6765\u6708\u306e\u5de5\u592b\u3082\u3072\u3068\u3053\u3068\u305a\u3064\uff08\u7d043\u5206\uff09\u3002\n\n\u25bc \u898b\u76f4\u3057\u3092\u306f\u3058\u3081\u308b\n' + LIFF_URL + '?v=review';
    const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ to: id, messages: [{ type: 'text', text: text }] })
    });
    if (res.getResponseCode() === 200) {
      sent++;
      upsert_(SH.month, x => String(x['\u4f1a\u54e1ID']) === id && Number(x['\u6708']) === n, { '\u4f1a\u54e1ID': id, '\u540d\u524d': name, '\u671f': c, '\u6708': n, '\u898b\u76f4\u3057\u65e5': date, 'LINE\u901a\u77e5\u65e5': today });
    } else {
      Logger.log('\u9001\u4fe1\u5931\u6557 ' + name + '\uff1a' + res.getResponseCode() + ' ' + res.getContentText());
    }
  });
  Logger.log('\u6bce\u6708\u306e\u898b\u76f4\u3057\u30ea\u30de\u30a4\u30f3\u30c9\uff1a' + sent + '\u4ef6\u9001\u4fe1');
}

/** \u52d5\u4f5c\u78ba\u8a8d\u7528\uff1a\u4f1a\u54e1\u30b7\u30fc\u30c8\u306e\u300c\u30e1\u30e2\u300d\u306b\u300c\u30c6\u30b9\u30c8\u9001\u4fe1\u300d\u3068\u66f8\u3044\u305f\u4eba\u306b\u3060\u3051\u3001\u898b\u76f4\u3057\u306e\u6848\u5185\u3092\u9001\u308b */
function testPush() {
  const token = prop_('LINE_MESSAGING_TOKEN');
  if (!token) { Logger.log('LINE_MESSAGING_TOKEN \u304c\u672a\u8a2d\u5b9a\u3067\u3059'); return; }
  const targets = table_(SH.member).rows.filter(r => /\u30c6\u30b9\u30c8\u9001\u4fe1/.test(String(r['\u30e1\u30e2'] || '')) && r['\u4f1a\u54e1ID']);
  if (!targets.length) { Logger.log('\u30e1\u30e2\u306b\u300c\u30c6\u30b9\u30c8\u9001\u4fe1\u300d\u3068\u66f8\u3044\u305f\u4f1a\u54e1\u304c\u3044\u307e\u305b\u3093'); return; }
  targets.forEach(r => {
    const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ to: String(r['\u4f1a\u54e1ID']), messages: [{ type: 'text', text: '\u3010\u30c6\u30b9\u30c8\u3011' + (r['\u540d\u524d'] || '') + '\u3055\u3093\u30011\u30f6\u6708\u76ee\u306e\u898b\u76f4\u3057\u306e\u65e5\u3067\u3059\u3002\n\n\u25bc \u898b\u76f4\u3057\u3092\u306f\u3058\u3081\u308b\n' + LIFF_URL + '?v=review' }] })
    });
    Logger.log((r['\u540d\u524d'] || '') + '\uff1a' + res.getResponseCode() + ' ' + res.getContentText());
  });
}

function uploadPhoto_(me, req) {
  const p = req.photo || {};
  const m = findMember_(me.id); if (!m) throw new Error('member_not_found');
  const match = String(p.dataUrl || '').match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!match) throw new Error('bad_image');
  const blob = Utilities.newBlob(Utilities.base64Decode(match[2]), match[1], p.date + '_' + p.side + '.jpg');
  const folder = memberFolder_(me.id, m['\u540d\u524d']);
  const file = folder.createFile(blob);
  const date = String(p.date || fmtDate_(new Date()));
  const col = p.side === 'front' ? '\u6b63\u9762\u306e\u5199\u771f' : '\u6a2a\u5411\u304d\u306e\u5199\u771f';
  const sheet = ss_().getSheetByName(SH.photo);
  const t = table_(SH.photo);
  const found = t.rows.find(r => String(r['\u4f1a\u54e1ID']) === me.id && fmtDate_(r['\u64ae\u5f71\u65e5']) === date);
  if (found) {
    sheet.getRange(found._row, t.col[col] + 1).setValue(file.getUrl());
  } else {
    const row = { '\u64ae\u5f71\u65e5': date, '\u4f1a\u54e1ID': me.id, '\u540d\u524d': m['\u540d\u524d'], 'DAY': p.day || '', '\u30bf\u30a4\u30df\u30f3\u30b0': p.label || '' };
    row[col] = file.getUrl();
    appendRow_(SH.photo, row);
  }
  return { ok: true, fileId: file.getId() };
}

function getPhoto_(me, req) {
  const id = String(req.fileId || '');
  const own = table_(SH.photo).rows.some(r => String(r['\u4f1a\u54e1ID']) === me.id && (fileId_(r['\u6b63\u9762\u306e\u5199\u771f']) === id || fileId_(r['\u6a2a\u5411\u304d\u306e\u5199\u771f']) === id));
  if (!own) throw new Error('not_allowed');
  return { ok: true, dataUrl: thumb_(id) };
}

function thumb_(id) {
  const f = DriveApp.getFileById(id);
  const b = f.getThumbnail() || f.getBlob();
  return 'data:' + (b.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(b.getBytes());
}

// ============ \u98df\u4e8b\u30b5\u30dd\u30fc\u30c8 ============
function meal_(me, req) {
  const key = prop_('ANTHROPIC_API_KEY');
  const m = findMember_(me.id);
  const text = String(req.text || '').slice(0, 800);
  const img = m && String(m['\u30d7\u30e9\u30f3'] || '') === 'VIP' ? String(req.image || '') : ''; // \u5199\u771f\u306fVIP\u3060\u3051
  let reply;
  if (!key) {
    reply = '\uff08\u98df\u4e8b\u30b5\u30dd\u30fc\u30c8\u306e\u6e96\u5099\u4e2d\u3067\u3059\u3002\u3082\u3046\u3057\u3070\u3089\u304f\u304a\u5f85\u3061\u304f\u3060\u3055\u3044\uff09';
  } else {
    const content = [];
    const im = img.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (im) content.push({ type: 'image', source: { type: 'base64', media_type: im[1], data: im[2] } });
    content.push({ type: 'text', text: text || '\u3053\u306e\u98df\u4e8b\u306b\u3064\u3044\u3066\u30a2\u30c9\u30d0\u30a4\u30b9\u3092\u304f\u3060\u3055\u3044\u3002' });
    const goal = m ? String(m['6\u30f6\u6708\u5f8c\u306e\u7406\u60f3\u306e\u5834\u9762\uff08MY GOAL\uff09'] || '') : '';
    const system = [
      '\u3042\u306a\u305f\u306f\u7406\u5b66\u7642\u6cd5\u58eb\u30fb\u52a0\u85e4\u304c\u76e3\u4fee\u3059\u308b\u300cTeras Lab. RESHAPE\u300d\u306e\u98df\u4e8b\u30b5\u30dd\u30fc\u30c8\u3067\u3059\u3002\u76f8\u624b\u306f40\u301c60\u4ee3\u306e\u5973\u6027\u3067\u3001\u59ff\u52e2\u6539\u5584\u3068\u4f53\u578b\u306e\u5909\u5316\u306b\u53d6\u308a\u7d44\u3093\u3067\u3044\u307e\u3059\u3002',
      '\u9001\u3089\u308c\u305f\u98df\u4e8b\uff08\u5199\u771f\u3084\u6587\u7ae0\uff09\u306b\u3064\u3044\u3066\u3001\u4e3b\u98df\u30fb\u4e3b\u83dc\u30fb\u526f\u83dc\u306e\u30d0\u30e9\u30f3\u30b9\u3092\u77ed\u304f\u8a55\u4fa1\u3057\u3001\u6b21\u306e\u4e00\u98df\u3067\u5b9f\u884c\u3067\u304d\u308b\u5177\u4f53\u7684\u306a\u30d2\u30f3\u30c8\u30921\u3064\u3060\u3051\u4f1d\u3048\u3066\u304f\u3060\u3055\u3044\u3002',
      '\u3084\u3055\u3057\u304f\u524d\u5411\u304d\u306a\u53e3\u8abf\u3067\u3001250\u6587\u5b57\u4ee5\u5185\u3002\u30ab\u30ed\u30ea\u30fc\u8a08\u7b97\u3092\u7d30\u304b\u304f\u6c42\u3081\u305f\u308a\u3001\u6975\u7aef\u306a\u5236\u9650\u3092\u3059\u3059\u3081\u305f\u308a\u3057\u306a\u3044\u3067\u304f\u3060\u3055\u3044\u3002',
      '\u6301\u75c5\u30fb\u670d\u85ac\u30fb\u598a\u5a20\u30fb\u5f37\u3044\u75db\u307f\u306a\u3069\u533b\u7642\u7684\u306a\u76f8\u8ac7\u306b\u306f\u7b54\u3048\u305a\u3001\u4e3b\u6cbb\u533b\u3084\u62c5\u5f53\u306e\u52a0\u85e4\u306b\u76f8\u8ac7\u3059\u308b\u3088\u3046\u4f1d\u3048\u3066\u304f\u3060\u3055\u3044\u3002',
      goal ? ('\u3053\u306e\u4eba\u306e\u76ee\u6a19\uff1a' + goal) : ''
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
      reply = '\u3059\u307f\u307e\u305b\u3093\u3001\u3044\u307e\u8fd4\u4fe1\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f\u3002\u5c11\u3057\u6642\u9593\u3092\u304a\u3044\u3066\u3082\u3046\u4e00\u5ea6\u9001\u3063\u3066\u304f\u3060\u3055\u3044\u3002';
    }
  }
  let photoUrl = '';
  if (img && m) {
    try {
      const im2 = img.match(/^data:(image\/[a-z]+);base64,(.+)$/);
      if (im2) photoUrl = memberFolder_(me.id, m['\u540d\u524d']).createFile(Utilities.newBlob(Utilities.base64Decode(im2[2]), im2[1], 'meal_' + Date.now() + '.jpg')).getUrl();
    } catch (err) { /* \u5199\u771f\u306e\u4fdd\u5b58\u306b\u5931\u6557\u3057\u3066\u3082\u8fd4\u4fe1\u306f\u8fd4\u3059 */ }
  }
  appendRow_(SH.meal, { '\u65e5\u6642': now_(), '\u4f1a\u54e1ID': me.id, '\u540d\u524d': m ? m['\u540d\u524d'] : '', '\u9001\u3063\u305f\u5185\u5bb9': text, '\u5199\u771f': photoUrl, '\u81ea\u52d5\u8fd4\u4fe1': reply });
  return { ok: true, reply: reply };
}

// ============ \u7ba1\u7406\u8005 ============
function checkAdmin_(req) {
  const k = prop_('ADMIN_KEY');
  if (!k || String(req.adminKey || '') !== k) throw new Error('admin_denied');
}

function adminData_(req) {
  checkAdmin_(req);
  const recs = table_(SH.record).rows, photos = table_(SH.photo).rows, monthRows = table_(SH.month).rows;
  const today = fmtDate_(new Date());
  const members = table_(SH.member).rows.filter(r => r['\u4f1a\u54e1ID']).map(r => {
    const m = memberOut_(r);
    const mine = recs.filter(x => String(x['\u4f1a\u54e1ID']) === m.id).map(recordOut_);
    const ph = photos.filter(x => String(x['\u4f1a\u54e1ID']) === m.id).map(photoOut_);
    const mo = monthRows.filter(x => String(x['\u4f1a\u54e1ID']) === m.id && num_(x['\u6708'])).map(monthOut_).sort((a, b) => a.n - b.n);
    return { member: m, records: mine.slice(-60), photos: ph, months: mo };
  });
  return { ok: true, today: today, members: members, sheetUrl: ss_().getUrl() };
}

function adminPhoto_(req) {
  checkAdmin_(req);
  return { ok: true, dataUrl: thumb_(String(req.fileId || '')) };
}

// ============ \u521d\u671f\u8a2d\u5b9a\uff08\u6700\u521d\u306b1\u56de\u3060\u3051\u5b9f\u884c\uff09 ============
function setup() {
  const ss = ss_();
  const step = (label, fn) => { try { fn(); Logger.log('OK  ' + label); } catch (e) { Logger.log('NG  ' + label + '\uff1a' + e.message); } };
  step('\u30d7\u30ed\u30d1\u30c6\u30a3\u306e\u67a0', () => ['LINE_CHANNEL_ID', 'ADMIN_KEY', 'ANTHROPIC_API_KEY', 'LINE_MESSAGING_TOKEN'].forEach(k => { if (prop_(k) === null) PropertiesService.getScriptProperties().setProperty(k, ''); }));
  step('\u898b\u51fa\u3057\u306e\u8ffd\u52a0', () => {
    ensureHeaders_(SH.record, ['\u65e5\u4ed8', '\u4f1a\u54e1ID', '\u540d\u524d', 'DAY', '\u9031', '\u30b9\u30c8\u30ec\u30c3\u30c1\u2460', '\u30b9\u30c8\u30ec\u30c3\u30c1\u2461', '\u30c8\u30ec\u30fc\u30cb\u30f3\u30b0', '\u898b\u305f\u52d5\u753b', '\u93e1\u30c1\u30a7\u30c3\u30af', '\u8a18\u93321', '\u8a18\u93322', '\u8a18\u93323', '\u3072\u3068\u3053\u3068', '\u4fdd\u5b58\u65e5\u6642', '\u76ee\u6a191 \u3044\u307e', '\u76ee\u6a192 \u3044\u307e', '\u76ee\u6a193 \u3044\u307e']);
    ensureHeaders_(SH.photo, ['\u64ae\u5f71\u65e5', '\u4f1a\u54e1ID', '\u540d\u524d', 'DAY', '\u30bf\u30a4\u30df\u30f3\u30b0', '\u6b63\u9762\u306e\u5199\u771f', '\u6a2a\u5411\u304d\u306e\u5199\u771f', '\u62c5\u5f53\u30b3\u30e1\u30f3\u30c8']);
    ensureHeaders_(SH.meal, ['\u65e5\u6642', '\u4f1a\u54e1ID', '\u540d\u524d', '\u9001\u3063\u305f\u5185\u5bb9', '\u5199\u771f', '\u81ea\u52d5\u8fd4\u4fe1', '\u62c5\u5f53\u30d5\u30a3\u30fc\u30c9\u30d0\u30c3\u30af\uff08VIP\uff09']);
  });
  step('\u4f1a\u54e1\u30b7\u30fc\u30c8\u306e\u30d7\u30eb\u30c0\u30a6\u30f3', () => {
    const ms = ss.getSheetByName(SH.member), t = table_(SH.member);
    const dv = (list) => SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build();
    const put = (h, list) => { if (t.col[h] !== undefined) ms.getRange(2, t.col[h] + 1, 500, 1).setDataValidation(dv(list)); };
    put('\u30d7\u30e9\u30f3', ['STANDARD', 'VIP']);
    put('\u5229\u7528', ['\u627f\u8a8d\u5f85\u3061', '\u5229\u7528\u4e2d', '\u5352\u696d\u751f', '\u505c\u6b62']);
    put('\u5ef6\u9577\u5e0c\u671b', ['\u5ef6\u9577\u3059\u308b', '\u5ef6\u9577\u3057\u306a\u3044', '\u672a\u78ba\u8a8d']);
    put('\u5352\u696d\u751f\u30b3\u30df\u30e5\u30cb\u30c6\u30a3\u53c2\u52a0\u5e0c\u671b', ['\u53c2\u52a0\u3059\u308b', '\u53c2\u52a0\u3057\u306a\u3044', '\u672a\u78ba\u8a8d']);
    ms.setFrozenColumns(2);
  });
  step('\u898b\u51fa\u3057\u306e\u56fa\u5b9a\u3068\u8272', () => [SH.member, SH.record, SH.photo, SH.meal].forEach(n => { const s = ss.getSheetByName(n); if (!s) return; s.setFrozenRows(1); s.getRange(1, 1, 1, s.getLastColumn()).setFontWeight('bold').setBackground('#E2EEE9'); }));
  step('\u6bce\u65e5\u306e\u30b9\u30c8\u30ec\u30c3\u30c1 \u30bf\u30d6', () => {
    if (ss.getSheetByName(SH.daily)) return;
    const src = SpreadsheetApp.openById(SOURCE_180DAY_ID).getSheets().find(s => s.getSheetId() === SOURCE_180DAY_GID);
    const vals = src.getDataRange().getValues();
    const dst = ss.insertSheet(SH.daily);
    dst.getRange(1, 1, vals.length, vals[0].length).setValues(vals);
    dst.setFrozenRows(1);
  });
  step('\u5199\u771f\u30d5\u30a9\u30eb\u30c0', () => photoRoot_());
  step('\u6708\u306e\u76ee\u6a19\u30b7\u30fc\u30c8', () => { ensureHeaders_(SH.month, MONTH_HEAD); ensureHeaders_(SH.member, ['\u76ee\u6a19\u306e\u671f']); const s = ss.getSheetByName(SH.month); s.setFrozenRows(1); s.getRange(1, 1, 1, s.getLastColumn()).setFontWeight('bold').setBackground('#E2EEE9'); });
  step('\u6bce\u6708\u306e\u898b\u76f4\u3057\u30ea\u30de\u30a4\u30f3\u30c9\uff08\u6bce\u671d9\u6642\uff09', () => {
    if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'monthlyReminder')) ScriptApp.newTrigger('monthlyReminder').timeBased().everyDays(1).atHour(9).inTimezone(TZ).create();
  });
  CacheService.getScriptCache().removeAll(['c0', 'c1', 'c2', 'c3', 'cn']);
  Logger.log('setup \u5b8c\u4e86');
}

/** \u52d5\u753b\u3084\u30ed\u30fc\u30c9\u30de\u30c3\u30d7\u3092\u76f4\u3057\u305f\u3042\u3068\u3001\u3059\u3050\u30b5\u30a4\u30c8\u306b\u53cd\u6620\u3057\u305f\u3044\u3068\u304d\u306b\u5b9f\u884c */
function clearCache() { CacheService.getScriptCache().removeAll(['c0', 'c1', 'c2', 'c3', 'cn']); }

// ============ \u5171\u901a\u306e\u9053\u5177 ============
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

function appendRow_(name, obj) {
  const t = table_(name);
  const row = t.head.map(h => obj[h] !== undefined ? obj[h] : '');
  t.sheet.appendRow(row);
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
      t.sheet.appendRow(t.head.map(h => obj[h] !== undefined ? obj[h] : ''));
    }
  } finally { lock.releaseLock(); }
}

function findMember_(id) { return table_(SH.member).rows.find(r => String(r['\u4f1a\u54e1ID']) === id); }

function updateMember_(id, upd) {
  const t = table_(SH.member);
  const r = t.rows.find(x => String(x['\u4f1a\u54e1ID']) === id);
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
  const f = (parent.hasNext() ? parent.next() : DriveApp.getRootFolder()).createFolder('RESHAPE_\u4f1a\u54e1\u306e\u5199\u771f');
  PropertiesService.getScriptProperties().setProperty('PHOTO_FOLDER_ID', f.getId());
  return f;
}

function memberFolder_(id, name) {
  const base = photoRoot_();
  const label = (name ? name + '_' : '') + id.slice(-6);
  const it = base.getFoldersByName(label);
  return it.hasNext() ? it.next() : base.createFolder(label);
}
