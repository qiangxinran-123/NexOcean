/**
 * 知识库层（Knowledge Base）
 * ------------------------------------------------------------------
 * 职责：
 *  1) 合并种子规则与运营后台覆写（override），产出运行时知识库；
 *  2) 提供 HS 编码最长前缀匹配、管制制度匹配、来源解析；
 *  3) 汇总结论所依赖规则的核验状态（verify_status），供上层强制降级；
 *  4) 提供轻量检索（BM25-lite），实现「先检索知识库、再交 LLM 成文」，
 *     杜绝让大模型凭记忆回答法规问题。
 * 本文件不含任何网络与文件系统依赖，浏览器与 Node 共用同一份。
 */

import * as SEED from './kb-seed.mjs';
import { AppError, round } from './util.mjs';

export const RULE_VERSION = SEED.RULE_VERSION;
export const DATA_AS_OF = SEED.DATA_AS_OF;
export const DISCLAIMER = SEED.DISCLAIMER;
export const UNVERIFIED_WARNING = SEED.UNVERIFIED_WARNING;

const VERIFY_RANK = { verified: 0, needs_verification: 1, skeleton: 2 };

/** 管制制度的义务等级：决定准入结论走向 */
export const OBLIGATION_LEVEL = {
  'RG-IMP-01': 'prerequisite',
  'RG-LBL-01': 'prerequisite',
  'RG-CN-01': 'blocking_check',
  'RG-FOOD-01': 'per_batch',
  'RG-BSMI-01': 'per_batch',
  'RG-AQ-PLT-01': 'per_batch',
  'RG-AGR-01': 'per_batch',
  'RG-AD-01': 'ongoing',
  'RG-COS-01': 'pre_registration',
  'RG-NCC-01': 'special_approval',
  'RG-AQ-ANI-01': 'special_approval',
  'RG-HEALTH-01': 'special_approval',
  'RG-DRUG-01': 'special_approval',
  'JP-FOOD-01': 'per_batch',
  'JP-LBL-01': 'prerequisite',
  'JP-ADD-01': 'per_batch',
  'US-FDA-01': 'pre_registration',
  'US-FSVP-01': 'pre_registration',
  'US-PN-01': 'per_batch',
  'US-LBL-01': 'prerequisite',
  'EU-GFL-01': 'pre_registration',
  'EU-LBL-01': 'prerequisite',
  'EU-NF-01': 'special_approval',
};

export function normalizeHs(raw) {
  const s = String(raw ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const digits = s.replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.length < 4) throw new AppError('HS 编码至少需要 4 位数字，请填写完整的当地分类编码。', 'VALIDATION', { field: 'hs' });
  return digits;
}

export function createKnowledgeBase({ overrides = {}, seed = SEED } = {}) {
  /* ---------- 数据合并：override 只增不删，保留来源可追溯 ---------- */
  /* 税则身份 = 编码 + 市场：同一 HS 在不同市场是不同规则条目，不得互相覆盖。
     verify_key 是核验工作台的稳定主键（台湾条目即编码本身，跨市场条目带市场后缀）。 */
  const tariffKey = (t) => `${t.code}@${t.market || 'TW'}`;
  const tariffItems = mergeByIdentity(seed.tariffItems, overrides.tariffItems, tariffKey)
    .map((t) => ({ ...t, verify_key: t.market && t.market !== 'TW' ? `${t.code}·${t.market}` : t.code }));
  const regimes = mergeByIdentity(seed.regimes, overrides.regimes, 'id').map((r) => ({
    /* 周期时间结构集中声明于 seed.regimeTimeModel；缺省保守按串行关键路径处理 */
    lead_phase: 'sequential', applies_per: 'shipment', ...((seed.regimeTimeModel || {})[r.id] || {}), ...r,
  }));
  const ssgSnapshots = mergeByIdentity(seed.ssgSnapshots, overrides.ssgSnapshots, 'code');
  const labelRules = mergeByIdentity(seed.labelRules, overrides.labelRules, 'id');
  const ports = mergeByIdentity(seed.ports, overrides.ports, 'code');
  const adminFees = mergeByIdentity(seed.adminFees, overrides.adminFees, 'id');
  const mainlandProhibited = mergeByIdentity(seed.mainlandProhibited, overrides.mainlandProhibited, 'code_prefix');
  const sources = mergeByIdentity(seed.sources, overrides.sources, 'id');
  const markets = mergeByIdentity(seed.markets, overrides.markets, 'code');
  const competitors = mergeByIdentity(seed.competitors || [], overrides.competitors || [], 'id');

  /* 竞品三层匹配：
   * 匹配机制（通用，不绑定任何具体品类）：
   * A. subcat 加速：若产品文本命中某细分品类关键词表（数据表 competitorSubcats），
   *    同 subcat = 直接竞品，同 HS 其余 = 替代品；
   * B. 文本相似度（主机制，任意品类可用）：产品名/规格 与每条竞品品名做
   *    字符 bigram 重合度打分，有实质重合（≥0.25 或命中品名词干）= 直接竞品；
   * C. 都不命中 → HS 品类粗匹配（match_level='category'），调用方须明示口径。
   * 每档结果带 match_reason 披露"凭什么算直接竞品"，不解释不输出。 */
  const SUBCATS = (seed.competitorSubcats || []);
  /* 品类词索引：word → Set(subcat)。来源 = subcat 表 keywords + 各竞品 category_words——
   * 新竞品入库填 category_words 即自动扩充词库，引擎零改动（数据不是代码）。 */
  const wordIndex = new Map();
  const indexWord = (word, subcat) => {
    const w = String(word || '').trim().toLowerCase();
    if (!w || w.length < 2) return; /* 单字词（如「汁」）误伤率高，不入索引 */
    if (!wordIndex.has(w)) wordIndex.set(w, new Set());
    wordIndex.get(w).add(subcat);
  };
  for (const sc of SUBCATS) for (const kw of (sc.keywords || [])) indexWord(kw, sc.id);
  for (const c of competitors) {
    const sub = c.subcat || 'general';
    for (const w of (c.category_words || [])) indexWord(w, sub);
  }
  const deriveSubcat = (name, specs) => {
    const t = `${name || ''} ${specs || ''}`.toLowerCase();
    /* 命中多个 subcat 时取词更长（更具体）的；返回 {id, word} 供 match_reason 披露 */
    let best = null; let bestLen = 0;
    for (const [w, subs] of wordIndex) {
      if (t.includes(w) && w.length > bestLen) {
        for (const sub of subs) { best = { id: sub, word: w }; bestLen = w.length; }
      }
    }
    return best;
  };
  /* 品名清洗：剥掉规格/包装噪声，只留品类语义，再进 bigram——
   * 「芒果冰沙 330ml 冰鎮」清洗后 ≈「芒果冰沙」，与「芒果果汁」的相似度才不会被
   * 330ml/冰鎮 这类噪声稀释。纯数字/容量/入数/储存词全部剥离。 */
  const SPEC_NOISE = [
    /\d+(?:\.\d+)?\s*(?:ml|毫升|mL|公升|L|l|克|g|g公克|kg|罐|瓶|包|入|支|盒|片|份|箱|条|塊|块)(?:[^\d]{0,2}\d+(?:\.\d+)?\s*(?:ml|毫升|公升|克|g|kg|罐|瓶|包|入|支|盒|片|份|箱))*e?/gi,
    /\d+\s*(?:入|罐|瓶|包|箱|组|組|件|支)/g,
    /[（(][^）)]*(?:ml|ml|毫升|公升|入|版|罐|瓶|常温|常溫|冷藏|冷凍|冷冻|Barista)[^）)]*[）)]/gi,
    /(?:barista\s*edition)/gi,
    /(?:常温|常溫|冷藏|冷凍|冷冻|室溫|室温|開封後|开封后|保存|无糖|無糖|低糖|原味|香浓|香濃|经典|經典|極致|黄金|黃金)/g,
  ];
  const cleanName = (t) => String(t || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(SPEC_NOISE[0], ' ')
    .replace(SPEC_NOISE[1], ' ')
    .replace(SPEC_NOISE[2], ' ')
    .replace(SPEC_NOISE[3], ' ')
    .replace(SPEC_NOISE[4], ' ')
    .replace(/[\s·•・，,。:：()（）\-–/]+/g, '')
    .trim();

  /* bigram 相似度：中文按两字滑窗 —— 不依赖分词器，品类无关。
   * 分母取 max(|A|,|B|)：短词撞长词不虚高；命中数 ≥2 才算证据。
   * 相似度在清洗后的品名上计算（规格噪声已剥离），阈值 0.22（调优值：变体可召回、
   * 椰子水↔苏打汽水等无关品类不误判——回归测试锁定）。 */
  const bigrams = (t) => {
    const s = String(t || '').toLowerCase().replace(/\s+/g, '');
    const set = new Set();
    for (let i = 0; i < s.length - 1; i += 1) set.add(s.slice(i, i + 2));
    if (s.length === 1) set.add(s);
    return set;
  };
  const similarity = (a, b) => {
    const A = bigrams(cleanName(a)), B = bigrams(cleanName(b));
    if (!A.size || !B.size) return 0;
    let hit = 0;
    for (const g of A) if (B.has(g)) hit += 1;
    if (hit < 2) return 0;
    return hit / Math.max(A.size, B.size);
  };
  function findCompetitors({ hs, category, tags = [], name, specs, market = 'TW' }) {
    const q = String(hs || '').replace(/\D/g, '');
    /* 市场允许传代码或名称（产品档案里存的是名称），统一归一成代码再分流 */
    const mkt = (findMarket(market) || {}).code || market;
    /* 竞品按市场分流：未标 market 的快照视为台湾渠道 */
    const pool = competitors.filter((c) => (c.market || 'TW') === mkt
      && (q ? q.startsWith(c.hs_prefix) : true)
      && (tags.length ? tags.some((t) => (c.tags || []).includes(t)) : true));
    const sub = deriveSubcat(name, specs);
    const subId = sub?.id || null;
    const productText = `${name || ''}${specs || ''}`.toLowerCase();
    const direct = []; const substitutes = [];
    for (const c of pool) {
      if (subId && c.subcat === subId) { direct.push({ ...c, match_reason: `细分品类命中：「${sub.word}」 → ${subId === 'general' ? '同品类' : (SUBCATS.find(s => s.id === subId) || {}).label || subId}` }); continue; }
      /* 品类词直接命中：产品文本含该竞品的任一 category_words（数据驱动，任意品类） */
      const catHit = (c.category_words || []).find((w) => String(w).length >= 2 && productText.includes(String(w).toLowerCase()));
      if (catHit) { direct.push({ ...c, match_reason: `品类词命中：「${catHit}」` }); continue; }
      const sim = similarity(`${name || ''} ${specs || ''}`, `${c.brand}${c.name}`);
      if (sim >= 0.22) { direct.push({ ...c, match_reason: `品名相似 ${Math.round(sim * 100)}%：「${(name || '').slice(0, 12)}」↔「${c.name}」（清洗规格噪声后比对）` }); continue; }
      (sub || pool.length > direct.length ? substitutes : substitutes).push(c);
    }
    const perLiter = (arr) => arr.filter((c) => c.volume_liters && c.price_twd?.[1]).map((c) => Math.round(c.price_twd[1] / c.volume_liters));
    const bandOf = (arr) => {
      const v = perLiter(arr);
      return v.length ? { min: Math.min(...v), max: Math.max(...v), unit: 'TWD/升' } : null;
    };
    return {
      items: pool, count: pool.length,
      /* subcategory=细分品类关键词命中；text=品名文本相似命中；category=品类粗匹配（兜底） */
      match_level: subId ? 'subcategory' : (direct.length ? 'text' : 'category'),
      subcategory: subId,
      subcategory_label: subId ? (SUBCATS.find(s => s.id === subId) || {}).label || subId : null,
      /* 当前词库支持的全部品类词（供前端动态提示，替代写死演示品类） */
      known_category_words: [...wordIndex.keys()].sort((a, b) => b.length - a.length).slice(0, 120),
      direct, substitutes,
      band: direct.length ? bandOf(direct) : bandOf(pool),
      band_direct: bandOf(direct), band_all: bandOf(pool),
    };
  }

  const sourceIndex = new Map(sources.map((s) => [s.id, s]));
  const regimeIndex = new Map(regimes.map((r) => [r.id, r]));

  /* ---------- HS 最长前缀匹配 ---------- */
  const sortedTariffs = [...tariffItems].sort((a, b) => b.code.length - a.code.length);
  function findTariff(hs, market = 'TW') {
    const q = normalizeHs(hs);
    if (!q) return null;
    for (const item of sortedTariffs) {
      /* 税则按市场分流：未标 market 的条目视为台湾口径，不做跨市场套用 */
      if ((item.market || 'TW') !== market) continue;
      if (q.startsWith(item.code)) return item;
    }
    return null;
  }
  /** 返回检索半径：命中的编码位数，用于表达「匹配精度」 */
  function matchPrecision(hs, item) {
    if (!item) return 0;
    return item.code.length;
  }

  function findMarket(codeOrName) {
    const q = String(codeOrName ?? '').trim();
    return markets.find((m) => m.code === q.toUpperCase() || m.name === q) || null;
  }

  function findPort(code) {
    return ports.find((p) => p.code === String(code || '').toUpperCase()) || null;
  }

  function findSsg(code, market = 'TW') {
    if (market !== 'TW') return null; /* SSG 为台湾特别防卫措施口径，其他市场不套用 */
    const q = normalizeHs(code);
    return ssgSnapshots.find((s) => q.startsWith(s.code)) || null;
  }

  function findProhibited(hs, origin, market = 'TW') {
    if (market !== 'TW') return null; /* 大陆货品禁止输入清单为台湾口径 */
    if (!isMainlandOrigin(origin)) return null;
    const q = normalizeHs(hs);
    if (!q) return null;
    return mainlandProhibited.find((p) => q.startsWith(p.code_prefix)) || null;
  }

  /* ---------- 管制制度匹配 ---------- */
  function tagsFor({ item, attributes = [] }) {
    const tags = new Set();
    if (item) (item.tags || []).forEach((t) => tags.add(t));
    for (const a of attributes) {
      const map = (seed.attributeTagMap || []).find((m) => m.attribute === a);
      if (map) tags.add(map.tag);
    }
    return tags;
  }

  function matchRegimes({ item, origin, attributes, market = 'TW' }) {
    const tags = tagsFor({ item, attributes });
    const matched = [];
    for (const r of regimes) {
      /* 制度按市场分流：未标 market 的制度视为台湾口径 */
      if ((r.market || 'TW') !== market) continue;
      const ap = r.applies_to || {};
      let hit = false;
      if (ap.any_tags?.includes('*')) hit = true;
      else if ((ap.any_tags || []).some((t) => tags.has(t))) hit = true;
      if (!hit && ap.origin_in && origin && ap.origin_in.some((o) => String(origin).includes(o))) hit = true;
      if (hit) matched.push({ ...r, obligation: OBLIGATION_LEVEL[r.id] || 'per_batch' });
    }
    return matched.sort((a, b) => a.id.localeCompare(b.id));
  }

  /* ---------- 来源与核验状态汇总 ---------- */
  function resolveSources(ids = []) {
    return ids.map((id) => sourceIndex.get(id)).filter(Boolean)
      .map((s) => ({ id: s.id, name: s.name, scope: s.scope, url: s.url, status: s.status, last_checked: s.last_checked }));
  }

  function worstVerify(list) {
    if (!list.length) return 'skeleton';
    return list.reduce((acc, v) => (VERIFY_RANK[v] > VERIFY_RANK[acc] ? v : acc), 'verified');
  }

  function evidenceFor({ item, matchedRegimes, prohibited }) {
    const ev = [];
    if (item) {
      ev.push({
        kind: 'tariff', rule_id: item.code, title: `${item.code} ${item.name}`,
        verify_status: item.verify_status, params: { duty_rate: item.duty_rate, duty_type: item.duty_type, ssg: !!item.ssg, excise: item.excise?.name || null, levy: item.levy?.name || null },
        sources: resolveSources(item.source_ids),
      });
    }
    for (const r of matchedRegimes) {
      ev.push({
        kind: 'regime', rule_id: r.id, title: r.name, agency: r.agency,
        obligation: r.obligation, verify_status: worstVerify((r.legal_basis || []).map((b) => b.verify_status || 'needs_verification')),
        legal_basis: r.legal_basis || [], sources: resolveSources(r.source_ids),
      });
    }
    if (prohibited) {
      ev.push({ kind: 'prohibition', rule_id: prohibited.code_prefix, title: `${prohibited.name}（禁止输入清单命中）`, verify_status: prohibited.verify_status, reason: prohibited.reason, sources: resolveSources(prohibited.source_ids) });
    }
    return ev;
  }

  /* ---------- 轻量检索（RAG 的「检索」半边） ---------- */
  const corpus = buildCorpus({ tariffItems, regimes, labelRules, ssgSnapshots, mainlandProhibited, markets, sources });
  const retrieval = makeRetriever(corpus);

  return {
    version: SEED.RULE_VERSION,
    data_as_of: SEED.DATA_AS_OF,
    raw: { tariffItems, regimes, labelRules, ports, adminFees, ssgSnapshots, mainlandProhibited, sources, markets, competitors, quoteDefaults: seed.quoteDefaults, notIncluded: seed.notIncluded, mandatoryFieldSets: seed.mandatoryFieldSets, mitigationPaths: seed.mitigationPaths, attributeTagMap: seed.attributeTagMap, businessInputs: seed.businessInputs || [] },
    findTariff, findMarket, findPort, findSsg, findProhibited, matchRegimes, tagsFor, findCompetitors,
    resolveSources, evidenceFor, worstVerify, matchPrecision,
    search: retrieval,
    stats: () => ({
      tariff_items: tariffItems.length,
      regimes: regimes.length,
      label_rules: labelRules.length,
      ssg_items: ssgSnapshots.length,
      prohibited_items: mainlandProhibited.length,
      ports: ports.length,
      sources: sources.length,
      verified_ratio: round(tariffItems.filter((t) => t.verify_status === 'verified').length / Math.max(1, tariffItems.length) * 100, 1),
    }),
  };
}

export const isMainlandOrigin = (origin) => /中国大陆|大陆地区|中华人民共和国|China \(Mainland\)|CN/i.test(String(origin || ''));

function mergeByIdentity(base, extra = [], key) {
  const idOf = typeof key === 'function' ? key : (r) => r[key];
  const map = new Map(base.map((b) => [idOf(b), { ...b }]));
  for (const e of extra || []) {
    const prev = map.get(idOf(e));
    map.set(idOf(e), { ...prev, ...e, _overridden: true, _updated_by: e.updated_by || prev?._updated_by || null, _updated_at: e.updated_at || prev?._updated_at || null });
  }
  return [...map.values()];
}

/* ---------------- corpus & BM25-lite ---------------- */

function buildCorpus(parts) {
  const docs = [];
  const push = (id, title, text, meta) => docs.push({ id, title, text: String(text || ''), tokens: tokenize(String(text || '') + ' ' + title), meta });
  for (const t of parts.tariffItems) push(`T:${t.code}`, `${t.code} ${t.name}`, `关税税率 ${t.duty_rate}% 完税方式 ${t.duty_type} 标签 ${(t.tags || []).join(' ')} 货物税 ${t.excise?.name || '无'} 捐费 ${t.levy?.name || '无'} SSG ${t.ssg ? t.ssg.rate + '%' : '无'}`, { kind: 'tariff', rule_id: t.code, verify_status: t.verify_status });
  for (const r of parts.regimes) push(`R:${r.id}`, `${r.id} ${r.name}`, `${r.name} 主管机关 ${r.agency} 申请主体 ${r.applicant_rule?.note || ''} 书件 ${(r.documents || []).join('、')} 风险 ${r.risk || ''} 依据 ${(r.legal_basis || []).map((b) => b.title + b.article).join('；')}`, { kind: 'regime', rule_id: r.id });
  for (const l of parts.labelRules) push(`L:${l.id}`, `${l.id} ${l.name}`, `${l.name} 原因 ${l.why} 建议 ${l.suggestion} 依据 ${(l.basis || []).map((b) => b.title + b.article).join('；')}`, { kind: 'label', rule_id: l.id });
  for (const s of parts.ssgSnapshots) push(`S:${s.code}`, `SSG ${s.name}`, `${s.name} 触发量 ${s.trigger_volume} ${s.unit} 已累积 ${s.accumulated} ${s.unit} 加征税率 ${s.ssg_rate}% 快照日 ${s.snapshot_date}`, { kind: 'ssg', rule_id: s.code });
  for (const p of parts.mainlandProhibited) push(`P:${p.code_prefix}`, `禁止输入 ${p.name}`, `${p.name} 原因 ${p.reason} 编码前缀 ${p.code_prefix}`, { kind: 'prohibition', rule_id: p.code_prefix });
  for (const m of parts.markets) push(`M:${m.code}`, `市场 ${m.name}`, `${m.name} 币别 ${m.currency} 营业税 ${m.vat_rate}% 建库覆盖度 ${m.coverage} ${m.note || ''}`, { kind: 'market', rule_id: m.code });
  for (const s of parts.sources) push(`O:${s.id}`, `来源 ${s.name}`, `${s.name} 范围 ${s.scope} 网址 ${s.url} 状态 ${s.status}`, { kind: 'source', rule_id: s.id });
  return docs;
}

/** 中英日混排友好分词：ASCII 词 + CJK 单字 + CJK 二元组 */
function tokenize(text) {
  const out = [];
  const lower = text.toLowerCase();
  for (const m of lower.match(/[a-z0-9]+/g) || []) out.push(m);
  const cjk = lower.match(/[㐀-鿿-ヿ]/g) || [];
  for (const ch of cjk) out.push(ch);
  for (let i = 0; i < cjk.length - 1; i += 1) out.push(cjk[i] + cjk[i + 1]);
  return out;
}

function makeRetriever(docs) {
  const N = docs.length;
  const df = new Map();
  const avgLen = docs.reduce((a, d) => a + d.tokens.length, 0) / Math.max(1, N);
  for (const d of docs) {
    const seen = new Set(d.tokens);
    for (const t of seen) df.set(t, (df.get(t) || 0) + 1);
  }
  const k1 = 1.4; const b = 0.75;
  return function search(query, { limit = 6, minScore = 0.4 } = {}) {
    const qTokens = tokenize(String(query || ''));
    if (!qTokens.length) return [];
    const scores = docs.map((d) => {
      const tf = new Map();
      for (const t of d.tokens) tf.set(t, (tf.get(t) || 0) + 1);
      let s = 0;
      for (const q of new Set(qTokens)) {
        const f = tf.get(q) || 0;
        if (!f) continue;
        const idf = Math.log(1 + (N - (df.get(q) || 0) + 0.5) / ((df.get(q) || 0) + 0.5));
        s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + b * (d.tokens.length / (avgLen || 1)))));
      }
      return { d, s };
    }).filter((x) => x.s >= minScore).sort((a, b2) => b2.s - a.s).slice(0, limit);
    return scores.map(({ d, s }) => ({ id: d.id, title: d.title, snippet: d.text.slice(0, 320), score: round(s, 3), ...d.meta }));
  };
}
