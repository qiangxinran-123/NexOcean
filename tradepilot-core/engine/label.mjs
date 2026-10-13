/**
 * F1-3 标签与宣传文案合规校验
 * ------------------------------------------------------------------
 * 要做什么：输入标签文本/广告文案 + 目标市场 + 品类 → 按规则库扫描风险点
 * 输入：text（必填）、market、category_tags 或 product 属性、可选结构化标示字段
 * 输出：命中条目（违规原句片段 + 位置 + 法规条款 + 风险等级 + 修改建议 + 替换候选）
 *       未检出项、总体风险评分、是否可刊播建议
 * 边界：
 *   1) 一期只校验文字内容，不做美术图片 OCR（二期迭代）；
 *   2) 关键词命中属「高置信提示」，未命中不代表合规——输出必须区分「命中」与「未检出」；
 *   3) 简体字检测存在两岸通用字形误报，结果标注需人工确认；
 *   4) 不产出法律意见，只给改写方向，最终判定权在目的事业主管机关与专业顾问。
 */

import { AppError, round, str } from './util.mjs';
import { DISCLAIMER } from './kb.mjs';

/**
 * 两岸异形字：仅收录「大陆规范字形且台湾不使用」的字，避免把两岸同形字（如 台/湾/合/格）
 * 误判为简体。仍可能因异体字、日文汉字混排产生误报，故输出标注 confidence 并要求人工确认。
 */
const SIMPLIFIED_CHARS = [
  '东车会员关单线产业优体医药疗营养发肤护净减细织级国际云运输达纪验检测标准无实对从经组网卖购销价钱费资源约设备档录载图书页临为们让给应张强总独电脑柜样诚诺质数释放断绝梦欢乐艺节获赢订阅读话语请谢转动轻松艳专业丛严丽买亚亲亿仅仪众伞余佣侦侧侨俩债倾偿储宾导尔尘尝岗岛帅师币帜带干庆库庙废弯弹当征忆怀态恼悬惊惧惨惯战户扑执报拟拥择挂损换据摄摆敌斩时显晓术机杀杂权极构枪枫栏树样椭楼歼残殡毁毕汉汤沟泽洁济涂涌润涨渐渔温湿满滤滚灭灯灵灾炉点烂烛烟爱牵牺犹狮猎环现玛电画疯盏盐监盘睁瞩矫码硕确碍礼祸离积稳竖竞笔简篮类紧纠红纯纲纳纸练绍结络统继绩续维罗罚罢职联胀胆脉脱舰艰芦苏药蓝虏虑虽蚀衅衔补装袜见观规视览触计认训议讯记讲许论访证评识诉词译试诗询该详误诸课谁调谈谊谓谱贝贞负贡财责贤败货贩贪贫贮贯贱贴贵贷贸贺赋赏赐赔赖赚赛赞赠赵赶踪软轿较辖辗迁过还这进远违连迟迹适选逊递遗邮邻郑酝针钟钢钥钩银铜链销锁锅锐',
].join('');

const SIMPLIFIED_SET = new Set(SIMPLIFIED_CHARS);

/**
 * 繁简归一映射（仅覆盖规则词库中出现的字符）。
 * 必要性：违规词库以台湾用字（繁体）书写，而大陆客户粘贴的文案多为简体，
 * 若不做归一，「治療高血压」这类最高风险宣称会被静默漏检——这是不可接受的漏判方向。
 * 映射为 1:1 字符替换，因此命中位置可直接回指原文。
 */
const S2T = {
  压: '壓', 胆: '膽', 肿: '腫', 疗: '療', 预: '預', 缓: '緩', 郁: '鬱', 发: '發', 炎: '炎',
  减: '減', 肠: '腸', 养: '養', 销: '銷', 军: '軍', 国: '國', 级: '級', 无: '無', 医: '醫',
  生: '生', 胸: '胸', 处: '處', 肤: '膚', 专: '專', 注: '注', 射: '射', 抗: '抗', 药: '藥',
  零: '零', 添: '添', 腐: '腐', 保: '保', 质: '質', 机: '機', 农: '農', 残: '殘', 第: '第',
  最: '最', 低: '低', 高: '高', 有: '有', 效: '效', 完: '完', 全: '全', 害: '害', 产: '產',
  地: '地', 中: '中', 糖: '糖', 癌: '癌', 瘤: '瘤', 失: '失', 眠: '眠',
  脂: '脂', 排: '排', 毒: '毒', 燃: '燃', 肥: '肥', 固: '固', 醇: '醇', 治: '治',
  验: '驗', 临: '臨', 床: '床', 网: '網',
  量: '量', 纯: '純', 天: '天', 然: '然', 适: '適', 宜: '宜', 与: '與', 代: '代',
};

const toTraditional = (text) => [...text].map((c) => S2T[c] || c).join('');

export function scanLabel(input, kb) {
  const text = str(input.text, '待校验文本', { required: true, max: 20000 });
  if (!text.trim()) throw new AppError('待校验文本不能为空。', 'VALIDATION', { field: 'text' });
  const market = kb.findMarket(input.market || 'TW');
  if (!market) throw new AppError('目标市场不在已建库范围内。', 'UNKNOWN_MARKET');
  const tags = new Set([...(input.tags || []), ...(input.category_tags || [])]);
  if (input.is_food) tags.add('food');
  if (input.is_cosmetic) tags.add('cosmetic');
  if (String(input.category || '').includes('食品') || String(input.category || '').includes('饮料')) tags.add('food');
  if (String(input.category || '').includes('化妆') || String(input.category || '').includes('护肤')) tags.add('cosmetic');

  const hits = [];
  const skipped = [];
  const norm = toTraditional(text); // 1:1 字符映射，命中位置可直接回指原文

  for (const rule of kb.raw.labelRules) {
    /* 标签规则按市场分流：未标 market 的规则视为台湾口径 */
    if ((rule.market || 'TW') !== market.code) { skipped.push({ id: rule.id, name: rule.name, reason: '非本市场规则' }); continue; }
    const scope = rule.scope_tags || [];
    const inScope = scope.includes('*') || scope.some((t) => tags.has(t));
    if (!inScope) { skipped.push({ id: rule.id, name: rule.name, reason: '品类范围不适用' }); continue; }

    if (rule.pattern) {
      const re = new RegExp(rule.pattern, 'giu');
      let m; let guard = 0;
      while ((m = re.exec(norm)) && guard < 200) {
        guard += 1;
        const original = text.slice(m.index, m.index + m[0].length);
        hits.push(formatHit(rule, {
          matched: original, index: m.index,
          context: contextOf(text, m.index, m[0].length),
          normalized_form: original !== m[0] ? m[0] : null,
        }));
      }
    } else if (rule.detector === 'simplified_chinese') {
      const found = [...new Set([...text].filter((c) => SIMPLIFIED_SET.has(c)))];
      if (found.length) {
        hits.push(formatHit(rule, {
          matched: found.slice(0, 24).join('、'), index: text.indexOf(found[0]),
          context: `检出 ${found.length} 个大陆规范字形：${found.slice(0, 24).join('')}`,
          confidence: 'medium', caveat: '两岸部分字形通用，存在误报，需人工确认。',
        }));
      }
    } else if (rule.detector === 'origin_wording') {
      const re = /(原产?地|產地|产地|Origin|Made\s*in)\s*[:：]?\s*(中国|China)(?!大陆| mainland)/giu;
      let m;
      while ((m = re.exec(text))) hits.push(formatHit(rule, { matched: m[0], index: m.index, context: contextOf(text, m.index, m[0].length) }));
      const re2 = /(大陆|中国大陆|中国)/giu;
      if (!re.test(text) && !/产地|原產|原产地|Origin/i.test(text) && re2.test(text)) {
        hits.push(formatHit(rule, { matched: '(未见产地字段)', index: 0, context: '文本出现大陆相关字样但未见明确产地标示字段', confidence: 'low' }));
      }
    } else if (rule.detector === 'missing_mandatory_fields') {
      const sets = kb.raw.mandatoryFieldSets;
      const fieldSet = tags.has('food') ? sets.food : tags.has('cosmetic') ? sets.cosmetic : null;
      if (!fieldSet) { skipped.push({ id: rule.id, name: rule.name, reason: '非食品/化妆品，强制标示字段族未定义' }); continue; }
      const missing = fieldSet.filter((f) => !f.keywords.some((k) => text.toLowerCase().includes(String(k).toLowerCase())));
      if (missing.length) {
        hits.push(formatHit(rule, {
          matched: missing.map((m) => m.field).join('、'), index: 0,
          context: `未在文本中检出以下应标示项目：${missing.map((m) => m.field).join('、')}`,
          confidence: 'medium',
          caveat: '「未检出」不等于「不存在」，可能标示在其他版面或图片上（一期不做图片 OCR）。',
          missing_fields: missing.map((m) => m.field),
        }));
      }
    }
  }

  const severityRank = { high: 3, medium: 2, low: 1 };
  const sorted = hits.sort((a, b) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0) || a.index - b.index);
  const score = round(sorted.reduce((acc, h) => acc + (severityRank[h.severity] || 1) * (h.confidence === 'low' ? 0.5 : 1), 0), 1);
  const level = score >= 9 ? 'critical' : score >= 5 ? 'high' : score >= 2 ? 'medium' : score > 0 ? 'low' : 'pass';

  return {
    engine: 'label_compliance',
    generated_at: new Date().toISOString(),
    rule_version: kb.version,
    data_as_of: kb.data_as_of,
    session_id: input.session_id || null,
    market: { code: market.code, name: market.name },
    scope_tags: [...tags],
    input: { length: text.length, preview: text.slice(0, 120) },
    summary: {
      total_rules_applied: sorted.length ? kb.raw.labelRules.filter((r) => !(skipped.find((s) => s.id === r.id))).length : 0,
      hits: sorted.length,
      high: sorted.filter((h) => h.severity === 'high').length,
      medium: sorted.filter((h) => h.severity === 'medium').length,
      low: sorted.filter((h) => h.severity === 'low').length,
      risk_score: score,
      level,
      publishable: level === 'pass' ? '可刊播（仍建议人工终审）' : level === 'low' ? '建议微调后刊播' : '不建议直接刊播',
    },
    hits: sorted,
    skipped_rules: skipped,
    limitations: [
      '一期仅校验文字，不做标签美术图/包装图片 OCR。',
      '关键词命中为高置信提示，未命中不代表合规；本结果不覆盖所有法规要求。',
      '改写建议为方向性提示，不构成法律意见。',
    ],
    disclaimer: DISCLAIMER,
  };
}

function formatHit(rule, found) {
  return {
    rule_id: rule.id,
    rule_name: rule.name,
    severity: rule.severity,
    matched: found.matched,
    position: found.index,
    context: found.context,
    normalized_form: found.normalized_form || null,
    confidence: found.confidence || 'high',
    caveat: found.caveat || null,
    missing_fields: found.missing_fields || null,
    legal_basis: (rule.basis || []).map((b) => ({ title: b.title, article: b.article, verify_status: b.verify_status })),
    why: rule.why,
    suggestion: rule.suggestion,
    rewrite_candidates: rewriteCandidates(rule, found.matched),
  };
}

/** 替换候选：只做词表级替换建议，不宣称生成合规文案（F3-2 二期能力） */
function rewriteCandidates(rule, matched) {
  const map = {
    'LB-01': ['保留成分与含量叙述，删除疾病相关动词', '改为「适合日常饮用」等场景描述'],
    'LB-02': ['「温和清洁、使用感清爽」', '「依化妆品许可用语改写」'],
    'LB-03': ['「每份含 β-葡聚糖 3g」（客观含量叙述）', '或走健康食品认证路径（见准入评估 F1-1 缓解选项）'],
    'LB-04': ['「依 2026 Q2 某通路出货统计」', '删除最高级用语'],
    'LB-05': ['「采用密封灭菌包装，未使用防腐剂（依实际配方）」', '直接删除添加物诉求'],
    'LB-06': ['全文转繁体并做用地词汇替换'],
    'LB-07': ['「原产地：中国大陆」'],
    'LB-08': ['改以成分、检验报告与使用情境为主轴'],
    'LB-09': ['补齐应标示项目后再送审'],
    'LB-10': ['删除有机字样，或附认证机构与标志'],
  };
  return map[rule.id] || [`删除或改写「${String(matched).slice(0, 20)}」`];
}

function contextOf(text, index, len, span = 24) {
  const from = Math.max(0, index - span);
  const to = Math.min(text.length, index + len + span);
  return (from > 0 ? '…' : '') + text.slice(from, to) + (to < text.length ? '…' : '');
}
