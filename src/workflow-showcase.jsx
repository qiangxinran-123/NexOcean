import React from 'react';
import { ArrowRight, ArrowUpRight, Package, ShieldCheck, Calculator, BarChart3, Globe2, FileCheck2, Bell, ClipboardCheck, Link2, Layers3 } from 'lucide-react';
import './workflow-showcase.css';

// Presentation metadata only. Assessment, calculation and generation stay in existing pages.
export const WORKFLOW_STAGES = [
  {
    id: 'access', number: '01', title: '能不能进', label: '市场准入', icon: ShieldCheck,
    description: '先找准市场，再看清准入门槛。',
    output: '准入条件 · 办理路径 · 依据来源', route: 'assessment',
    tools: [
      { title: '全球市场扫描', icon: Globe2, detail: '从同一个产品出发，查看各市场的规则覆盖与待补信息。', output: '市场筛选依据', route: 'assessment/scan', action: '筛选目标市场' },
      { title: '产品准入评估', icon: ShieldCheck, detail: '围绕目标市场查看准入条件、所需资料与办理路径。', output: '准入结论与材料清单', route: 'assessment', action: '查看准入条件' },
      { title: '法规与依据', icon: FileCheck2, detail: '回到规则和官方来源，区分已核验依据与待核验条目。', output: '法规条目与来源入口', route: 'regulations', action: '查看法规依据' },
    ],
  },
  {
    id: 'cost', number: '02', title: '落地多少钱', label: '成本决策', icon: Calculator,
    description: '看清成本构成，让报价有据可依。',
    output: '税费拆解 · 情景对比 · 报价参考', route: 'cost',
    tools: [
      { title: '落地成本测算', icon: Calculator, detail: '沿用现有测算页面，查看税费构成、计算依据与情景差异。', output: '落地成本与报价参考', route: 'cost', action: '打开成本测算' },
      { title: '税则查询', icon: FileCheck2, detail: '按产品编码查找税则条目，查看适用条件与核验状态。', output: '税则条目与适用条件', route: 'tariff', action: '查询产品税则' },
      { title: '法规风险预警', icon: Bell, detail: '查看规则变更关联的产品，及时回到评估与成本页面复核。', output: '变更通知与关联产品', route: 'alerts', action: '查看变更预警' },
    ],
  },
  {
    id: 'growth', number: '03', title: '进入后怎么卖', label: '市场增长', icon: BarChart3,
    description: '把市场洞察接到内容与方案上。',
    output: '竞品洞察 · 方案报告', route: 'competition',
    tools: [
      { title: '竞品分析', icon: BarChart3, detail: '围绕目标产品查看竞品信息，梳理定位与差异化方向。', output: '竞品对比与定位参考', route: 'competition', action: '打开竞品分析' },
      { title: '出海方案报告', icon: ClipboardCheck, detail: '在现有报告页面汇总评估、成本与行动建议，形成方案。', output: '可查看的出海方案', route: 'report', action: '打开方案报告' },
    ],
  },
];

export function WorkflowHero({ product, navigate, setModal, engineOnline, activeStage, setActiveStage }) {
  const selected = WORKFLOW_STAGES.find(stage => stage.id === activeStage) || WORKFLOW_STAGES[0];
  return <section className="tp-hero" aria-labelledby="tp-hero-title">
    <div className="tp-hero-copy">
      <div className="tp-eyebrow"><span /> FROM PRODUCT TO MARKET</div>
      <h2 id="tp-hero-title">从一个产品，<br />到一份<span>出海方案。</span></h2>
      <p className="tp-hero-lead">能不能进、落地多少钱、进入后怎么卖。<br />让每一个问题，都接得上下一步行动。</p>
      <div className="tp-hero-actions">
        <button className="btn btn-primary" onClick={() => product ? navigate('assessment') : setModal({ type: 'product' })}>开始准入评估<ArrowRight size={17} aria-hidden="true" /></button>
        <button className="tp-quiet-link" onClick={() => navigate('report')}>查看方案报告<ArrowUpRight size={16} aria-hidden="true" /></button>
      </div>
      <div className="tp-principles"><span><ShieldCheck size={14} aria-hidden="true" />规则先行</span><span><Link2 size={14} aria-hidden="true" />依据可追溯</span><span><Layers3 size={14} aria-hidden="true" />工具协同</span></div>
    </div>
    <div className="tp-workflow" aria-label="产品到出海方案的工具协同示意">
      <div className="tp-workflow-head"><span>出海决策链路</span><span className="tp-flow-tag">流程示意</span></div>
      <button className="tp-input-node" onClick={() => product ? navigate('products') : setModal({ type: 'product' })}>
        <span className="tp-node-icon"><Package size={21} aria-hidden="true" /></span>
        <span><small>以产品档案为起点</small><strong>{product?.name || '添加你的第一个产品'}</strong></span>
        <ArrowUpRight size={17} aria-hidden="true" />
      </button>
      <div className="tp-flow-stem" aria-hidden="true" />
      <div className="tp-stage-nodes">{WORKFLOW_STAGES.map(({ id, number, label, icon: Icon }) => <button key={id} className={`tp-stage-node ${id === activeStage ? 'is-selected' : ''}`} aria-pressed={id === activeStage} onClick={() => setActiveStage(id)}><span className="tp-stage-number">{number}</span><Icon size={21} aria-hidden="true" /><strong>{label}</strong></button>)}</div>
      <div className="tp-flow-stem" aria-hidden="true" />
      <div className="tp-output-node"><div><small>当前环节的预期产出</small><strong>{selected.output}</strong></div><button aria-label={`进入${selected.label}工具`} onClick={() => navigate(selected.route)}><ArrowRight size={18} aria-hidden="true" /></button></div>
      <p className="tp-workflow-note"><span className={engineOnline ? 'tp-status-online' : ''} />{engineOnline ? '引擎已连接 · 结果与核验状态请在工具内查看' : '演示模式 · 进入工具查看示例与使用边界'}</p>
    </div>
  </section>;
}

export function CapabilityShowcase({ activeStage, setActiveStage, navigate, product }) {
  const refs = React.useRef([]);
  const selectedIndex = WORKFLOW_STAGES.findIndex(stage => stage.id === activeStage);
  const selected = WORKFLOW_STAGES[selectedIndex] || WORKFLOW_STAGES[0];
  function onTabKey(event, index) {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % WORKFLOW_STAGES.length;
    if (event.key === 'ArrowLeft') next = (index + WORKFLOW_STAGES.length - 1) % WORKFLOW_STAGES.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = WORKFLOW_STAGES.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    setActiveStage(WORKFLOW_STAGES[next].id);
    refs.current[next]?.focus();
  }
  return <section className="tp-capabilities" aria-labelledby="tp-capability-title">
    <div className="tp-section-intro"><div><div className="tp-eyebrow">CONNECTED TOOLS</div><h2 id="tp-capability-title">三个问题，一条完整的出海路径</h2></div><p>共用产品上下文，按业务阶段进入工具。</p></div>
    <div className="tp-tabs" role="tablist" aria-label="出海业务阶段">{WORKFLOW_STAGES.map(({ id, number, title, label, icon: Icon }, index) => <button ref={el => refs.current[index] = el} key={id} role="tab" id={`tp-tab-${id}`} aria-controls={`tp-panel-${id}`} aria-selected={activeStage === id} tabIndex={activeStage === id ? 0 : -1} onKeyDown={e => onTabKey(e, index)} onClick={() => setActiveStage(id)} className={activeStage === id ? 'is-active' : ''}><span className="tp-tab-icon"><Icon size={20} aria-hidden="true" /></span><span><small>{number} / {label}</small><strong>{title}</strong></span><ArrowRight size={16} aria-hidden="true" /></button>)}</div>
    {WORKFLOW_STAGES.map(stage => <div key={stage.id} role="tabpanel" id={`tp-panel-${stage.id}`} aria-labelledby={`tp-tab-${stage.id}`} hidden={activeStage !== stage.id} tabIndex={0}>
      <div className="tp-tools">{stage.tools.map(({ title, icon: Icon, detail, output, route, action }) => <article key={route} className="tp-tool-card"><div className="tp-tool-title"><span><Icon size={20} aria-hidden="true" /></span><h3>{title}</h3></div><p>{detail}</p><div className="tp-tool-output"><small>产出</small><span>{output}</span></div><button onClick={() => navigate(route)}>{action}<ArrowUpRight size={16} aria-hidden="true" /></button></article>)}</div>
    </div>)}
    <div className="tp-context-foot"><span><Package size={15} aria-hidden="true" />{product ? `当前产品：${product.name}` : '先建立产品档案，再开始评估'}</span><span>{selected.description}</span></div>
  </section>;
}
