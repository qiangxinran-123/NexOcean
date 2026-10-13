/**
 * 风控预案生成器（确定性规则推导，零依赖）
 * ------------------------------------------------------------------
 * 输入一次评估/成本的结果，输出结构化风控预案：每条风险含
 * 触发条件、影响、预案动作、责任角色、监控指标与出处。
 * 与准入/成本同源：所有风险点均引用规则库或业务访谈出处，
 * 不凭空生成风险，也不输出未定义的"AI 建议"。
 */
import { DISCLAIMER } from './kb.mjs';

export function buildRiskPlan({ product, assessment, cost }, kb) {
  const risks = [];
  const item = cost?.matched_tariff || null;
  const verdict = assessment?.verdict?.code || 'undetermined';

  /* R1 准入信息风险 */
  if (verdict === 'prohibited') {
    risks.push({
      id: 'R1', category: '准入阻断', risk: '命中禁止输入清单，当前产地 × 编码组合不具备合法输入路径',
      trigger: `准入判定为 prohibited：${String(assessment?.verdict?.reason || '').slice(0, 90)}`,
      impact: '按现有产地与编码无法成货，报价、档期与签约前提均不成立；此时讨论办理周期没有意义',
      action: '三条替代路径并行评估：① 变更产地或加工地（须能证明实质转型，不得第三地转口规避）② 调整配方/归类至清单外编码 ③ 暂缓该市场转向已开放市场；同时开启法规变更监测等待清单解除',
      owner: '企业 · 供应链与合规负责人', monitor: '禁止输入清单增删公告（F1-2 法规监测）/ 替代路径重估结论',
      provenance: 'engine:admission + RG-CN-01 禁止输入清单',
    });
  } else if (verdict === 'undetermined') {
    risks.push({
      id: 'R1', category: '准入信息', risk: '准入结论为「无法判定」，不能作为报价或签约依据',
      trigger: `产品资料不全或编码未入库（待补：${(assessment?.missing_fields || ['产品资料']).slice(0, 3).join('、')}）`,
      impact: '无法推进合作方确认与试单，报价缺乏准入前提',
      action: '补齐 HS 编码与成分规格后重估；暂缓对外报价与签约动作',
      owner: '企业 · 产品负责人', monitor: '工作台待办清零 / 准入状态脱离「无法判定」',
      provenance: 'engine:admission',
    });
  } else if (verdict === 'special_approval') {
    risks.push({
      id: 'R1', category: '准入信息', risk: '需专案核准，周期长且通过率不受厂家控制',
      trigger: '产品命中事前核准类管制制度（健康食品/药品/电信射频等）',
      impact: `核准周期约 ${assessment?.timeline ? `${assessment.timeline.days ? assessment.timeline.days[0] + '–' + assessment.timeline.days[1] + ' 天' : assessment.timeline.text}` : '数月'}，错过档期与资金占用`,
      action: '由当地进口方牵头递交；同步评估去掉功效宣称降级为普通食品路径',
      owner: '当地进口方牵头 · 企业配合', monitor: '递交回执 / 补件通知',
      provenance: 'engine:admission + RG-HEALTH-01',
    });
  }

  /* R2 SSG 加征风险 */
  if (item?.ssg) {
    risks.push({
      id: 'R2', category: '税负', risk: `SSG 特别防卫措施可能触发，加征 ${item.ssg.rate}% 关税`,
      trigger: '同类产品累计进口量逼近起征点（阈值随官方公告浮动）',
      impact: `完税价格约 ${(item.ssg.rate + (item.duty_rate || 0))}% 计税，单件成本显著上升`,
      action: '报价预留 SSG 缓冲（参考报价带已含）；分批出货与累计量监控；触发前与进口方确认改价机制',
      owner: '企业 · 业务负责人 + 报关行', monitor: 'SSG 累积量（关务署公告）→ 预警页',
      provenance: `engine:tax + ${item.code}`,
    });
  }

  /* R3 币种与汇率风险 */
  const fxLines = (cost?.lines || []).filter((l) => l.fx_unconverted);
  risks.push({
    id: 'R3', category: '成本口径', risk: '口岸规费以 TWD 计征，测算未做汇率换算',
    trigger: `跨币种计价（货值 CNY × 规费 TWD，涉 ${fxLines.length} 项：${fxLines.map((l) => l.label).slice(0, 3).join('、')}${fxLines.length > 3 ? ' 等' : ''}）`,
    impact: '实际成本与测算存在汇率差额；汇率波动直接侵蚀利润',
    action: '正式报价前按当期汇率折算全部 TWD 费项；预留汇率缓冲（参考 3%）',
    owner: '企业 · 财务负责人', monitor: 'CNY/TWD 汇率月度复核',
    provenance: 'engine:tax + pending_items:fx_conversion',
  });

  /* R4 口岸执行差异风险（BI-02） */
  risks.push({
    id: 'R4', category: '执行差异', risk: '同一产品在不同口岸/报关行的执行口径可能不一致',
    trigger: '各口岸查验强度与解读差异（业务访谈 BI-02）',
    impact: '通关时长与查验成本波动，交期承诺存在不确定性',
    action: '首票走主力口岸并留存完整通关记录；订舱前与报关行书面确认本批口径',
    owner: '报关行 + 企业 · 物流负责人', monitor: '首票通关时效 vs 预期（口岸参考天数见评估页）',
    provenance: 'business-input:BI-02',
  });

  /* R5 标签合规风险 */
  const labelRules = (kb.raw.labelRules || []).filter((r) => (r.applies_tags || []).some((t) => (item?.tags || ['food']).includes(t)) || (r.applies_tags || []).includes('*'));
  if (labelRules.length) {
    risks.push({
      id: 'R5', category: '合规', risk: `标签与宣称违规风险（适用 ${labelRules.length} 条标示规则）`,
      trigger: '繁体中文标示缺项、医疗/功效宣称、绝对化用语',
      impact: '下架、罚则与通关退运；广告不实罚款',
      action: '包装定稿前过一遍标签扫描（繁简归一检测）；宣称用语清单化审核并留存记录',
      owner: '企业 · 品牌负责人', monitor: '标签扫描命中数归零 / 主管机关公告',
      provenance: `engine:label + ${labelRules.slice(0, 2).map((r) => r.id).join('/')}`,
    });
  }

  /* R6 动销风险（BI-03） */
  risks.push({
    id: 'R6', category: '市场动销', risk: '货到岸但卖不动：依赖华人圈、进不了主流渠道',
    trigger: '包装/文案/定价未针对本地消费者；渠道结构不熟（业务访谈 BI-03）',
    impact: '库存积压与复购率低，试单失败成本高',
    action: '试单前用竞品价格带定位定价（见竞品分析）；首单小批量测动销，复购数据达标再放量',
    owner: '企业 · 市场负责人 + 当地进口方', monitor: '首月动销率 / 复购率（试单复盘）',
    provenance: 'business-input:BI-03',
  });

  /* R7 数据核验风险 */
  const unverified = cost?.verification?.unverified_rules ?? 0;
  risks.push({
    id: 'R7', category: '数据边界', risk: `本方案依据的规则参数尚未完成人工核验（${unverified || '全部'} 条待核验）`,
    trigger: '规则库条目均为 needs_verification 状态',
    impact: '税率/费项与官方现行口径可能存在偏差',
    action: '正式报价前由运营对照官方税则与法规原文逐条核验；核验通过前所有结论仅作方向判断',
    owner: '平台运营 · 规则核验', monitor: '核验状态从「待核验」升级为「已核验」',
    provenance: 'engine:verification',
  });

  return {
    engine: 'risk_plan',
    generated_at: new Date().toISOString(),
    rule_version: kb.version,
    product: { name: product?.name, hs: product?.hs, market: product?.market },
    risks,
    principles: [
      '先核验后报价：所有税率与费项以官方核验口径为准，未核验结论只做方向判断。',
      '首票小批量：通关执行与动销均以试单实证，数据达标再放量。',
      '变更即重估：法规变更或 SSG 触发后，评估与成本必须重新生成，不以旧结论续用。',
    ],
    disclaimer: DISCLAIMER,
    note: '预案由规则引擎从本次评估与成本结果确定性推导，风险条目均绑定出处；不含未定义的推测性建议。',
  };
}
