/**
 * 大模型调用网关（LLM Gateway）
 * ------------------------------------------------------------------
 * 定位：LLM 只做「文本理解、检索结果组织、把引擎结论写成人类可读报告」。
 *      禁止 LLM 产出任何准入结论或金额——本文件用「数字白名单」硬拦。
 * 能力：prompt 模板管理 / 限流（令牌桶）/ 调用日志 / token 与费用统计 /
 *      未配置密钥时自动降级为确定性模板成文（rule_template 模式）。
 * 边界：
 *   1) 密钥只留在服务端环境变量，浏览器端一律走降级模式，绝不下发；
 *   2) LLM 输出中出现的每一个数字，都必须能在引擎结果白名单中找到，
 *      否则整段输出作废并降级——这是防幻觉的最后一道闸；
 *   3) 未接通真实模型时，输出标注 source='rule_template'，不冒充 AI 生成。
 */

import { round } from './util.mjs';

/**
 * 环境变量安全读取：本模块同时运行在 Node 与浏览器。
 * 浏览器里没有 process 这个标识符，`process?.env` 依然会抛 ReferenceError（可选链不能
 * 保护未声明的全局变量），因此必须先做 typeof 判定。
 */
const ENV = typeof process !== 'undefined' && process?.env ? process.env : {};

const PRICE_PER_MTOKEN = { in: Number(ENV.LLM_PRICE_IN || 0), out: Number(ENV.LLM_PRICE_OUT || 0) };

export const PROMPTS = {
  admission_brief: {
    name: 'admission_brief',
    version: 'v3',
    system: [
      '你是企业出海合规助理。你只能依据【引擎结论】与【检索到的规则片段】写作。',
      '禁止：新增任何数字、税率、日期、法规条款号；禁止改变准入结论；禁止使用「一定可以」「保证获批」等承诺性表述。',
      '必须：在结尾保留免责声明原文；对未核验规则明确说「需人工核验」。',
      '输出：不超过 320 字的中文执行摘要，先给结论，再给关键动作，最后给风险。',
    ].join('\n'),
    user: ({ verdict, evidence, retrieval }) => [
      '【引擎结论】', JSON.stringify({ verdict, applicant: verdict.applicant, timeline: verdict.timeline, risk: verdict.risk }, null, 0),
      '【依据规则（含核验状态）】', evidence.slice(0, 8).map((e) => `- ${e.rule_id} ${e.title} [${e.verify_status}]`).join('\n'),
      '【检索片段】', retrieval.slice(0, 6).map((r) => `- ${r.title} :: ${r.snippet}`).join('\n'),
      '【免责声明（必须原样保留）】', verdict.disclaimer,
    ].join('\n'),
  },
  cost_brief: {
    name: 'cost_brief',
    version: 'v3',
    system: [
      '你是贸易成本分析师。所有金额、税率、比率必须原样引用【引擎结论】中的数字，不得重新计算、四舍五入或补充。',
      '输出：不超过 260 字的中文报价建议摘要，含综合税负率、单件落地成本、报价带与必须提示的未计入项。',
    ].join('\n'),
    user: ({ cost }) => [
      '【引擎结论】', JSON.stringify({ lines: cost.lines.map((l) => ({ label: l.label, amount: l.amount })), totals: cost.totals, quote: { low: cost.quote.suggested_low, mid: cost.quote.suggested_mid, high: cost.quote.suggested_high, buffers: cost.quote.buffers.map((b) => b.name) }, not_included: cost.not_included.slice(0, 4) }, null, 0),
      '【免责声明（必须原样保留）】', cost.disclaimer,
    ].join('\n'),
  },
};

/** 从引擎结果抽取「允许出现的数字白名单」 */
export function buildNumberWhitelist(payload) {
  const set = new Set();
  const walk = (v) => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      set.add(fmt(v)); set.add(String(v)); set.add(v.toFixed(2)); set.add(v.toFixed(1)); set.add(v.toFixed(0));
      const pct = v * 100;
      if (Math.abs(pct) < 100000) { set.add(fmt(pct)); set.add(pct.toFixed(2)); set.add(pct.toFixed(1)); }
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(payload);
  return set;
}

const fmt = (n) => String(round(n, 4));

/**
 * 数字白名单校验：LLM 输出中的每个数字都必须能在引擎结果中找到。
 * 容忍集仅含 0–3（序数与「前 3 项」这类计数词），不含任何税率/金额量级，
 * 避免「15%」这类被幻觉出来的税率被误判为合法。
 */
const TOLERATED = new Set(['0', '1', '2', '3']);

export function auditNumbers(text, whitelist) {
  const nums = (String(text).match(/\d+(?:\.\d+)?/g) || []).map((s) => s.replace(/\.0+$/, ''));
  const allowed = new Set([...whitelist].map((s) => String(s).replace(/\.0+$/, '')).concat([...TOLERATED]));
  const violations = [...new Set(nums.filter((n) => !allowed.has(n)))];
  return { checked: nums.length, violations: violations.slice(0, 20), passed: violations.length === 0 };
}

export function createLlmGateway({ config = {}, logger = null, kb = null } = {}) {
  const baseUrl = config.baseUrl || ENV.LLM_BASE_URL || '';
  const apiKey = config.apiKey || ENV.LLM_API_KEY || '';
  const model = config.model || ENV.LLM_MODEL || 'qwen-office';
  const rpmLimit = Number(config.rpm || ENV.LLM_RPM || 20);
  const bucket = { tokens: rpmLimit, last: Date.now() };

  const mode = baseUrl && apiKey ? 'live' : 'rule_template';

  function takeToken() {
    const nowMs = Date.now();
    bucket.tokens = Math.min(rpmLimit, bucket.tokens + ((nowMs - bucket.last) / 60000) * rpmLimit);
    bucket.last = nowMs;
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  async function call({ purpose = 'admission_brief', messages, maxTokens = 700 }) {
    const t0 = Date.now();
    if (!takeToken()) {
      const err = new Error('大模型调用超过限流阈值，已降级为规则模板成文。');
      err.code = 'RATE_LIMITED';
      throw err;
    }
    const res = await fetch(`${String(baseUrl).replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.2 }),
      signal: AbortSignal.timeout(Number(config.timeout_ms || ENV.LLM_TIMEOUT || 15000)),
    });
    if (!res.ok) { const err = new Error(`大模型网关返回 ${res.status}`); err.code = 'LLM_HTTP'; throw err; }
    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content || '';
    const usage = json?.usage || {};
    const record = {
      mode, purpose, model, latency_ms: Date.now() - t0,
      tokens_in: usage.prompt_tokens || Math.ceil(JSON.stringify(messages).length / 3),
      tokens_out: usage.completion_tokens || Math.ceil(text.length / 2),
    };
    record.cost_estimate = round((record.tokens_in / 1e6) * PRICE_PER_MTOKEN.in + (record.tokens_out / 1e6) * PRICE_PER_MTOKEN.out, 6);
    logger?.(record);
    return text;
  }

  /** 对外主入口：生成执行摘要，带防幻觉审计与降级 */
  async function narrate({ promptName, payload, retrieval = [], fallbackText }) {
    const prompt = PROMPTS[promptName];
    if (!prompt) throw new Error(`未知 prompt 模板：${promptName}`);
    const whitelist = buildNumberWhitelist(payload);

    if (mode === 'live') {
      try {
        const raw = await call({
          purpose: prompt.name,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user({ [payloadKind(payload)]: payload, verdict: payload, cost: payload, evidence: payload.evidence || [], retrieval }) },
          ],
        });
        const audit = auditNumbers(raw, whitelist);
        if (!audit.passed) {
          logger?.({ mode, purpose: prompt.name, model, status: 'rejected_hallucinated_numbers', violations: audit.violations });
          return { text: fallbackText, source: 'rule_template', reason: '模型输出包含引擎结果之外的数字，已拒绝采用并降级', audit };
        }
        return { text: ensureDisclaimer(raw, payload.disclaimer), source: 'llm', model, audit };
      } catch (e) {
        logger?.({ mode, purpose: prompt.name, status: 'error', error: e.message });
        return { text: fallbackText, source: 'rule_template', reason: `网关调用失败（${e.code || e.message}），已降级`, audit: null };
      }
    }
    return { text: ensureDisclaimer(fallbackText, payload.disclaimer), source: 'rule_template', reason: '未配置模型密钥，系统按设计走确定性模板成文（结论与数字始终来自规则引擎）', audit: null };
  }

  return { mode, model, narrate, PROMPTS, stats: () => ({ rpm_limit: rpmLimit, available_tokens: round(bucket.tokens, 2) }) };
}

const payloadKind = (p) => (p.engine === 'cost' ? 'cost' : 'verdict');

function ensureDisclaimer(text, disclaimer) {
  if (!disclaimer) return text;
  return text.includes(disclaimer.slice(0, 12)) ? text : `${text}\n\n${disclaimer}`;
}

/** 确定性模板成文：无密钥时的默认路径，也是降级兜底 */
export function templateBrief(payload) {
  if (payload.engine === 'cost') {
    const t = payload.totals;
    return [
      `综合税负率 ${t.effective_tax_rate_pct}%（税项合计 ${t.taxes_total} ${payload.market.currency}，以完税价格 ${t.customs_value} 为分母）。`,
      `单件落地成本 ${t.unit_landed_cost} ${payload.market.currency}，到岸总成本 ${t.grand_total} ${payload.market.currency}。`,
      `建议报价带 ${payload.quote.suggested_low}–${payload.quote.suggested_high} ${payload.market.currency}，其中已含缓冲 ${payload.quote.buffer_pct}%（${payload.quote.buffers.map((b) => b.name).join('、')}）。`,
      payload.verification.usable_for_quotation ? '规则参数已核验，可用于内部报价参考。' : '注意：所引用税率参数尚未完成人工核验，不得直接对外报价。',
      `未计入项至少包括：${payload.not_included.slice(0, 3).join('；')}。`,
      payload.disclaimer,
    ].join('\n');
  }
  const v = payload.verdict || {};
  const lines = [
    `准入结论：${v.label || '无法判定'}。${v.reason || ''}`,
    payload.applicant ? `申请主体：${payload.applicant.summary}` : '',
    payload.timeline ? `关键路径：${payload.timeline.critical_path_text}（不含船期与通路进场）。` : '',
    payload.risk ? `风险等级：${payload.risk.label}。${(payload.risk.notes || [])[0] || ''}` : '',
    payload.document_checklist?.length ? `需备文件 ${payload.document_checklist.length} 项，其中 ${(payload.document_checklist.filter((d) => d.status === '待准备')).length} 项待准备。` : '',
    payload.mitigation_options?.length ? `可选缓解路径：${payload.mitigation_options.map((m) => m.option).join(' / ')}。` : '',
    payload.verification?.usable_for_quotation ? '' : '注意：本次依据的规则参数尚未完成人工核验，结论为参考级。',
    payload.disclaimer,
  ];
  return lines.filter(Boolean).join('\n');
}
