/**
 * 知海 TradePilot · 规则知识库种子（Rule Knowledge Base Seed）
 * -------------------------------------------------------------------
 * 架构原则：规则优先，AI 为辅。本文件是全系统唯一「事实来源层」。
 * 准入结论与税费数字只能从这里的规则推导，大模型不得产出任何数字或结论。
 *
 * 诚实性约定（重要，评审可直接核）：
 *   verify_status: 'verified'          已人工比对官方原文条款，可作业务参考
 *   verify_status: 'needs_verification' 结构真实、参数为示例值，禁止作为报价依据
 *   verify_status: 'skeleton'          仅建了骨架，系统对该内容一律输出「无法判定」
 * 当前种子库除机构名称/网址与制度框架外，绝大多数数值为 needs_verification。
 * 系统不会把 needs_verification 的规则伪装成已核验，UI 必须显式分色标注。
 */

export const RULE_VERSION = 'TW-CORE-2026.10-r1';
export const DATA_AS_OF = '2026-10-08';

/** 免责声明：所有出口结果强制携带，前端与报告均不可移除 */
export const DISCLAIMER = '本系统仅为信息参考，不能替代官方许可与报关行专业意见。';
export const UNVERIFIED_WARNING =
  '本次结论所依据的规则参数尚未完成人工核验（needs_verification），仅可用于流程演示，不得作为实际报价、报关或签约依据。';

/* ------------------------------------------------------------------ */
/* 0. 官方来源登记（只登记公开查询入口，不声称已绑定具体条款）           */
/* ------------------------------------------------------------------ */
export const sources = [
  { id: 'S01', name: '财政部关务署', scope: '进口税则、关税税率、SSG 特别防卫措施', url: 'https://www.customs.gov.tw/', kind: 'official', status: '待核验', last_checked: DATA_AS_OF },
  { id: 'S02', name: '经济部国际贸易署', scope: '商品输入规定、禁止输入货品清单、输入业者登记', url: 'https://www.trade.gov.tw/', kind: 'official', status: '待核验', last_checked: DATA_AS_OF },
  { id: 'S03', name: '卫生福利部食品药物管理署', scope: '输入食品/化妆品/药品查验登记与标示规定', url: 'https://www.fda.gov.tw/', kind: 'official', status: '待核验', last_checked: DATA_AS_OF },
  { id: 'S04', name: '经济部标准检验局（BSMI）', scope: '商品检验（强制检验品目、CRC 标章）', url: 'https://www.bsmi.gov.tw/', kind: 'official', status: '待核验', last_checked: DATA_AS_OF },
  { id: 'S05', name: '农业部动植物防疫检疫署', scope: '动物、植物、木质包装输入检疫许可', url: 'https://www.aaph.gov.tw/', kind: 'official', status: '待核验', last_checked: DATA_AS_OF },
  { id: 'S06', name: '国家通讯传播委员会（NCC）', scope: '电信管制射频器材审验', url: 'https://www.ncc.gov.tw/', kind: 'official', status: '待核验', last_checked: DATA_AS_OF },
  { id: 'S07', name: '财政部赋税署', scope: '加值型营业税、货物税条例', url: 'https://www.ntb.mof.gov.tw/', kind: 'official', status: '待核验', last_checked: DATA_AS_OF },
  { id: 'S08', name: '农业部（农粮署业务）', scope: '农产品输入许可、配额、推广费', url: 'https://www.moa.gov.tw/', kind: 'official', status: '待核验', last_checked: DATA_AS_OF },  { id: 'S09', name: '日本厚生劳动省 / 消费者厅', scope: '输入食品届出与查验（食品卫生法）、标示（食品表示法）', url: 'https://www.mhlw.go.jp/', kind: 'official', status: '待核验', last_checked: DATA_AS_OF },
  { id: 'S10', name: '美国食品药品监督管理局（FDA）', scope: '食品设施注册、FSVP、Prior Notice、营养与过敏原标示', url: 'https://www.fda.gov/', kind: 'official', status: '待核验', last_checked: DATA_AS_OF },
  { id: 'S11', name: '欧盟委员会（食品链总司）', scope: '一般食品法、预包装标示、Novel Food、进口追溯', url: 'https://food.ec.europa.eu/', kind: 'official', status: '待核验', last_checked: DATA_AS_OF },
];

/* ------------------------------------------------------------------ */
/* 1. 市场与覆盖度                                                     */
/* ------------------------------------------------------------------ */
export const markets = [
  /* 一期建库市场：中国台湾地区（最完整）+ 日本 / 美国 / 欧盟（食品饮料口径）。
     其余市场不再登记为「骨架」——演示里摆一排无法判定的空市场没有信息量，
     需要扩展时按「税则 + 制度 + 来源」三件套补录即可自动进入扫描与评估。 */
  { code: 'TW', name: '中国台湾地区', currency: 'TWD', coverage: 'deep', vat_rate: 5, note: '一期主战场，规则条目最完整' },
  { code: 'JP', name: '日本', currency: 'JPY', coverage: 'deep', vat_rate: 10, note: '食品饮料口径建库：食品卫生法申报查验 + 食品表示法标示，税率与周期均待核验' },
  { code: 'US', name: '美国', currency: 'USD', coverage: 'deep', vat_rate: 0, note: '食品饮料口径建库：FDA 设施注册 / FSVP / Prior Notice / 标示，联邦层面无增值税' },
  { code: 'EU', name: '欧盟', currency: 'EUR', coverage: 'deep', vat_rate: 20, note: '食品饮料口径建库：一般食品法 + 1169/2011 标示 + Novel Food 门槛，成员国语言标签另计' },
];

export const regimes = [
  {
    id: 'RG-IMP-01', name: '进口主体与商业登记', agency: '经济部国际贸易署', source_ids: ['S02'],
    applies_to: { any_tags: ['*'] },
    applicant_rule: { can_mainland_apply: false, requires_local_importer: true, note: '大陆厂商不具备当地进口申报资格，须由已办理营利事业登记并完成输入业者登录的当地进口商作为报验义务人。' },
    documents: ['当地进口商营业执照/营利事业登记证号', '输入业者登录资料', '外销契约（Proforma Invoice）', '装箱单（Packing List）'],
    duration_days: [0, 3], fee_note: '无规费，属申报前提',
    legal_basis: [{ title: '货物输入相关规定', article: '进口申报主体条款（待核验）', verify_status: 'needs_verification' }],
    risk: '若尚无当地合作进口商，整条路径无法启动，属最高优先级阻塞项。',
  },
  {
    id: 'RG-FOOD-01', name: '输入食品查验登记（逐批/抽验）', agency: '卫生福利部食品药物管理署', source_ids: ['S03'],
    applies_to: { any_tags: ['food'] },
    applicant_rule: { can_mainland_apply: false, requires_local_importer: true, note: '食品输入业者登录与查验申请由当地进口商办理，大陆厂商仅能提供技术资料与检验报告。' },
    documents: ['食品业者登录证明文件号', '产品成分及配方资料（含添加剂 CAS 号）', '原产地证明/制造厂商登记', '卫生证明或出厂检验报告（第三方全项分析）', '中文标签样张', '逐批输入查验申请文件'],
    duration_days: [14, 45], fee_note: '查验费按批计征，金额待核验',
    legal_basis: [{ title: '食品安全卫生管理法', article: '输入食品查验及标示相关条款（待核验）', verify_status: 'needs_verification' }],
    risk: '首次输入常落入「抽验」而非「免验」，前若干批需等待检验结果方可上架，须预留 30–45 天。',
  },
  {
    id: 'RG-HEALTH-01', name: '健康食品查验登记（功效宣称门槛）', agency: '卫生福利部食品药物管理署', source_ids: ['S03'],
    applies_to: { any_tags: ['health_claim'] },
    applicant_rule: { can_mainland_apply: false, requires_local_importer: true, note: '健康食品认证申请人须为当地业者。' },
    documents: ['功效成分与科学证据资料', '动物/人体功能性评估报告', '稳定性试验报告', '标签说明书样张'],
    duration_days: [180, 540], fee_note: '审查费较高，金额待核验',
    legal_basis: [{ title: '健康食品管理法', article: '健康食品认证与功效宣称条款（待核验）', verify_status: 'needs_verification' }],
    risk: '未取得认证标志而宣称功效，属高频开罚点；多数企业选择「改文案」而非「走认证」，本系统会同时给出两条路径成本。',
  },
  {
    id: 'RG-COS-01', name: '化妆品输入登录与标签', agency: '卫生福利部食品药物管理署', source_ids: ['S03'],
    applies_to: { any_tags: ['cosmetic'] },
    applicant_rule: { can_mainland_apply: false, requires_local_importer: true, note: '化妆品输入业者登录及产品登录应由当地负责人办理。' },
    documents: ['化妆品输入业者登录', '产品登录（含配方、GMP 或安全资料）', '中文标签（品名、成分、重量容量、厂商、原产地、有效日期、注意事项）', '含药化妆品另须查验登记'],
    duration_days: [20, 60], fee_note: '登录费待核验',
    legal_basis: [{ title: '化妆品卫生安全管理法', article: '登录、标示与广告限制条款（待核验）', verify_status: 'needs_verification' }],
    risk: '宣称医疗效能（如「治疗」「修复伤口」「生发」）为开罚重灾区，广告文案与标签同受规范。',
  },
  {
    id: 'RG-DRUG-01', name: '药品查验登记', agency: '卫生福利部食品药物管理署', source_ids: ['S03'],
    applies_to: { any_tags: ['drug'] },
    applicant_rule: { can_mainland_apply: false, requires_local_importer: true, note: '药商执照与许可证持有人须为当地药商，大陆厂商不可自行申请。' },
    documents: ['当地药商执照', '药品查验登记申请', '制造厂 GMP 证明', '品质/稳定性/非临床临床资料'],
    duration_days: [365, 730], fee_note: '审查费待核验',
    legal_basis: [{ title: '药事法', article: '药品查验登记条款（待核验）', verify_status: 'needs_verification' }],
    risk: '周期以年计，且陆制药品另有附加审查与政策不确定性，建议改以技术授权或当地委托制造切入。',
  },
  {
    id: 'RG-BSMI-01', name: '商品检验（强制检验品目）', agency: '经济部标准检验局', source_ids: ['S04'],
    applies_to: { any_tags: ['bsmi_mandatory'] },
    applicant_rule: { can_mainland_apply: false, requires_local_importer: true, note: '报验人为当地进口商；完成查验后取得 CRC 号码方可通关。' },
    documents: ['强制检验商品申请（PRC/CRC）', '型式试验报告（安规/EMC）', '工厂检查或 ISO 资料（部分品目）', '中文标示与警语'],
    duration_days: [10, 30], fee_note: '查验费按批，金额待核验',
    legal_basis: [{ title: '商品检验法', article: '强制检验品目与申报程序条款（待核验）', verify_status: 'needs_verification' }],
    risk: '未取得检验标章即上架销售，除退货外另有罚则；不同口岸抽验频率差异会造成交期波动。',
  },
  {
    id: 'RG-NCC-01', name: '电信管制射频器材审验', agency: '国家通讯传播委员会', source_ids: ['S06'],
    applies_to: { any_tags: ['rf_wireless'] },
    applicant_rule: { can_mainland_apply: false, requires_local_importer: true, note: '审验合格制式认证申请人须为当地登记公司或进口商。' },
    documents: ['型式认证申请', '射频/EMC/SAR 测试报告（认可实验室）', '审验标章与正本标签', '使用手册繁体中文版'],
    duration_days: [30, 90], fee_note: '审验费待核验',
    legal_basis: [{ title: '电信管制射频器材管理办法', article: '审验合格与标示条款（待核验）', verify_status: 'needs_verification' }],
    risk: '频段开放表与大陆不同，若产品仅支持大陆频段组合，可能需硬件改版，属不可压缩的前置成本。',
  },
  {
    id: 'RG-AQ-ANI-01', name: '动物产品输入检疫许可', agency: '农业部动植物防疫检疫署', source_ids: ['S05'],
    applies_to: { any_tags: ['animal_product'] },
    applicant_rule: { can_mainland_apply: false, requires_local_importer: true, note: '检疫费与输入许可由当地收货人申请，输出国/场须先取得认可。' },
    documents: ['输入检疫许可（事前申请）', '输出国官方动物卫生证明', '认可制造厂/牧场编号', '加工中心（heat treatment）证明'],
    duration_days: [30, 180], fee_status: 'needs_verification', fee_note: '检疫费待核验',
    legal_basis: [{ title: '动物传染病防治条例', article: '动物产品输入检疫条款（待核验）', verify_status: 'needs_verification' }],
    risk: '口蹄疫/禽流感疫区状态直接决定可否输入，且状态会变；本系统对动物源成分一律给「需专案核准 + 高变动风险」。',
  },
  {
    id: 'RG-AQ-PLT-01', name: '植物防疫检疫与木质包装处理', agency: '农业部动植物防疫检疫署', source_ids: ['S05'],
    applies_to: { any_tags: ['plant_product', 'wood_package'] },
    applicant_rule: { can_mainland_apply: false, requires_local_importer: true, note: '植物检疫申报由当地收货人办理。' },
    documents: ['植物检疫证明书（输出国官方）', '输入植物检疫申请', '木质包装 ISPM#15 热处理/熏蒸标示', '成分与加工程度说明'],
    duration_days: [7, 30], fee_note: '检疫费待核验',
    legal_basis: [{ title: '植物防疫检疫法', article: '禁止输入植物与检疫程序条款（待核验）', verify_status: 'needs_verification' }],
    risk: '寄主与产地组合可能命中禁止输入清单（如部分生鲜水果），且托盘/木箱未标 IPPC 会被退运或就地销毁。',
  },
  {
    id: 'RG-AGR-01', name: '农产品输入许可、配额与 SSG', agency: '经济部国际贸易署 / 农业部', source_ids: ['S02', 'S08'],
    applies_to: { any_tags: ['agri_controlled'] },
    applicant_rule: { can_mainland_apply: false, requires_local_importer: true, note: '配额与输入许可由当地进口商持有，大陆来源另受两岸贸易管制。' },
    documents: ['农产品输入许可/配额证明', '完税价格申报', '原产地证明', 'SSG 触发时的加征税额准备'],
    duration_days: [7, 45], fee_note: '推广费按完税价格比率课征，费率待核验',
    legal_basis: [{ title: '农产品输入辅导及 SSG 相关办法', article: '配额、警戒进口量与特别防卫措施条款（待核验）', verify_status: 'needs_verification' }],
    risk: 'SSG 为累积量触发，同季多家进口会互相挤占额度，报价必须预留加征缓冲，否则单批即亏损。',
  },
  {
    id: 'RG-CN-01', name: '大陆地区货品输入管制（禁止输入清单）', agency: '经济部国际贸易署', source_ids: ['S02'],
    applies_to: { origin_in: ['中国大陆'] },
    applicant_rule: { can_mainland_apply: false, requires_local_importer: true, note: '大陆产地属特殊管制来源，除一般规定外另受禁止输入清单与逐批管控约束。' },
    documents: ['确认是否命中禁止输入货品清单', '原产地证明（须能证明实质转型）', '大陆产地标示（须标示为「中国大陆」）'],
    duration_days: [0, 14], fee_note: '无额外规费，但可能直接不可输入',
    legal_basis: [{ title: '大陆地区货品禁止输入相关规定', article: '禁止输入货品清单（清单项目待核验）', verify_status: 'needs_verification' }],
    risk: '清单会增删，且第三地转口不改变原产地认定；系统对大陆产地产品一律执行「先查禁止清单，再谈其他」的判定顺序。',
  },
  {
    id: 'RG-LBL-01', name: '中文标示与原产地标示', agency: '各目的事业主管机关', source_ids: ['S02', 'S03'],
    applies_to: { any_tags: ['*'] },
    applicant_rule: { can_mainland_apply: false, requires_local_importer: true, note: '标示义务落在当地进口商与上架业者。' },
    documents: ['繁体中文标示（品名、规格、成分、厂商、原产地、有效日期、警语）', '大陆产地须标示「中国大陆」'],
    duration_days: [0, 7], fee_note: '无规费',
    legal_basis: [{ title: '各项商品标示专法', article: '标示内容与文字规定（待核验）', verify_status: 'needs_verification' }],
    risk: '简体字标示、产地表述不清是上架与稽查常见退件原因，成本极低但发生频率高。',
  },
  {
    id: 'RG-AD-01', name: '广告与宣传内容限制', agency: '卫生福利部食品药物管理署 / 公平交易委员会', source_ids: ['S03'],
    applies_to: { any_tags: ['food', 'cosmetic', 'health_claim', 'drug'] },
    applicant_rule: { can_mainland_apply: false, requires_local_importer: true, note: '广告责任归属当地刊播者与负责人。' },
    documents: ['广告内容事前合规审查记录', '宣称依据文献（如有功效宣称）'],
    duration_days: [0, 7], fee_note: '无规费，违规另有罚锾',
    legal_basis: [{ title: '食品安全卫生管理法 / 化妆品卫生安全管理法 / 公平交易法', article: '虚伪不实及超范围宣传条款（待核验）', verify_status: 'needs_verification' }],
    risk: '电商页面、社群贴文、直播口播同属广告，华人圈惯用话术（如「医美等级」「医院同款」）在本土属高风险宣称。',
  },

  /* ---------------- 日本（market=JP） ---------------- */
  {
    id: 'JP-FOOD-01', market: 'JP', name: '输入食品届出与查验（食品卫生法）', agency: '厚生劳动省 · 检疫所', source_ids: ['S09'],
    applies_to: { any_tags: ['food'] },
    applicant_rule: { can_mainland_apply: true, requires_local_importer: true, note: '届出义务人为日本进口商；大陆厂商提供成分、添加剂用途与检验资料。' },
    documents: ['输入食品届出书', '成分配比表（含添加剂名称与用途）', '原产地证明', '制造厂与加工场信息', '必要时检验报告（检查命令对象）'],
    duration_days: [7, 20], fee_note: '查验费按件计征，金额待核验',
    legal_basis: [{ title: '食品卫生法', article: '第27条 输入届出（待核验）', verify_status: 'needs_verification' }],
    risk: '添加剂或农残不符基准时整批不得销售；初次输入常落入监测检查或命令检查。',
  },
  {
    id: 'JP-LBL-01', market: 'JP', name: '日文标示（食品表示法）', agency: '消费者厅', source_ids: ['S09'],
    applies_to: { any_tags: ['food'] },
    applicant_rule: { can_mainland_apply: true, requires_local_importer: true, note: '标示责任落在日本进口商与销售者。' },
    documents: ['日文标示样张（名称 / 过敏原 / 营养表示 / 保存方法 / 期限）'],
    duration_days: [0, 7], fee_note: '无规费',
    legal_basis: [{ title: '食品表示法', article: '标示基准（待核验）', verify_status: 'needs_verification' }],
    risk: '过敏原与营养表示格式严格，中文或简体标示不可直接上架。',
  },
  {
    id: 'JP-ADD-01', market: 'JP', name: '添加剂 / 农残基准核对（肯定列表）', agency: '厚生劳动省', source_ids: ['S09'],
    applies_to: { any_tags: ['food'] },
    applicant_rule: { can_mainland_apply: true, requires_local_importer: true, note: '由进口商会同制造商核对配方。' },
    documents: ['添加剂使用清单与用途说明', '农药残留自检报告'],
    duration_days: [3, 14], fee_note: '自检费用自理',
    legal_basis: [{ title: '食品卫生法', article: '添加剂指定与残留基准（待核验）', verify_status: 'needs_verification' }],
    risk: '部分大陆常用添加剂在日本未获指定，须逐成分比对后再谈准入。',
  },
  /* ---------------- 美国（market=US） ---------------- */
  {
    id: 'US-FDA-01', market: 'US', name: '食品设施注册与美国代理人', agency: '美国 FDA', source_ids: ['S10'],
    applies_to: { any_tags: ['food'] },
    applicant_rule: { can_mainland_apply: true, requires_local_importer: true, note: '境外设施须指定美国代理人；注册每偶数年续期。' },
    documents: ['FDA 食品设施注册号', '美国代理人授权文件', '续注册记录'],
    duration_days: [0, 14], fee_note: '注册本身无规费',
    legal_basis: [{ title: '联邦食品药品化妆品法 / 生物反恐法', article: '设施注册条款（待核验）', verify_status: 'needs_verification' }],
    risk: '未注册设施的产品可被自动扣留（Import Alert / DWPE）。',
  },
  {
    id: 'US-FSVP-01', market: 'US', name: '外国供应商验证计划（FSVP）', agency: '美国 FDA', source_ids: ['S10'],
    applies_to: { any_tags: ['food'] },
    applicant_rule: { can_mainland_apply: true, requires_local_importer: true, note: 'FSVP 由美国进口商持有并执行，是路径成立的前提。' },
    documents: ['FSVP 计划文件', '供应商危害分析', '验证活动记录（审核 / 抽样 / 检测）'],
    duration_days: [30, 90], fee_note: '第三方审核费用自理',
    legal_basis: [{ title: '食品安全现代化法（FSMA）', article: 'FSVP 条款（待核验）', verify_status: 'needs_verification' }],
    risk: '找不到合格美国进口商时整条路径不成立，与台湾口径同源的最高优先级阻塞项。',
  },
  {
    id: 'US-PN-01', market: 'US', name: 'Prior Notice 事先申报', agency: '美国 FDA', source_ids: ['S10'],
    applies_to: { any_tags: ['food'] },
    applicant_rule: { can_mainland_apply: true, requires_local_importer: true, note: '可由进口商或报关行提交。' },
    documents: ['Prior Notice 确认号'],
    duration_days: [0, 1], fee_note: '无规费',
    legal_basis: [{ title: '生物反恐法', article: '事先申报条款（待核验）', verify_status: 'needs_verification' }],
    risk: '未申报货到港即被拒收，须排入船期计划。',
  },
  {
    id: 'US-LBL-01', market: 'US', name: '营养标示与过敏原标示', agency: '美国 FDA', source_ids: ['S10'],
    applies_to: { any_tags: ['food'] },
    applicant_rule: { can_mainland_apply: true, requires_local_importer: true, note: '标示责任归属进口商与经销商。' },
    documents: ['英文标签样张（Nutrition Facts 新版格式）', '八大过敏原声明'],
    duration_days: [0, 14], fee_note: '无规费',
    legal_basis: [{ title: '21 CFR 101', article: '标签条款（待核验）', verify_status: 'needs_verification' }],
    risk: '过敏原声明缺失是召回与扣留的高频原因。',
  },
  /* ---------------- 欧盟（market=EU） ---------------- */
  {
    id: 'EU-GFL-01', market: 'EU', name: '食品经营者责任与追溯（一般食品法）', agency: '欧盟委员会 / 成员国主管机关', source_ids: ['S11'],
    applies_to: { any_tags: ['food'] },
    applicant_rule: { can_mainland_apply: true, requires_local_importer: true, note: '责任主体须为欧盟境内食品经营者。' },
    documents: ['欧盟境内经营者登记信息', '追溯体系说明（上下游各一步）'],
    duration_days: [0, 30], fee_note: '登记费用因成员国而异',
    legal_basis: [{ title: '(EC) 178/2002', article: '第18-19条 追溯与经营者责任（待核验）', verify_status: 'needs_verification' }],
    risk: '无欧盟境内责任主体时不得投放市场。',
  },
  {
    id: 'EU-LBL-01', market: 'EU', name: '预包装标示（1169/2011）', agency: '欧盟委员会 / 成员国', source_ids: ['S11'],
    applies_to: { any_tags: ['food'] },
    applicant_rule: { can_mainland_apply: true, requires_local_importer: true, note: '标示语言按销售成员国要求。' },
    documents: ['目标成员国语言标签样张', '过敏原强调标示', '营养声明表'],
    duration_days: [0, 14], fee_note: '无规费',
    legal_basis: [{ title: '(EU) 1169/2011', article: '强制标示事项（待核验）', verify_status: 'needs_verification' }],
    risk: '多成员国销售需多语言版本标签，包装成本按市场数放大。',
  },
  {
    id: 'EU-NF-01', market: 'EU', name: 'Novel Food 评估（非传统原料）', agency: '欧盟委员会 / EFSA', source_ids: ['S11'],
    applies_to: { any_tags: ['novel_ingredient'] },
    applicant_rule: { can_mainland_apply: true, requires_local_importer: true, note: '申请人可为境外企业，但须欧盟授权后方可投放。' },
    documents: ['原料食用历史资料', '安全性评估卷宗'],
    duration_days: [180, 540], fee_note: '评估费用高，金额待核验',
    legal_basis: [{ title: '(EU) 2015/2283', article: 'Novel Food 授权（待核验）', verify_status: 'needs_verification' }],
    risk: '燕麦 / 豆基等传统原料不在范围；新植物蛋白原料须先取得授权。',
  },
];

/* ------------------------------------------------------------------ */
/* 2a. 周期的时间结构：一项义务的天数 ≠ 它在关键路径上占的位置            */
/* ------------------------------------------------------------------ */
/* duration_days 只回答「这件事要多久」，不回答「它要不要排队等」。      */
/* 实际办理里三种角色完全不同：                                         */
/*   prerequisite 一次性主体资格（输入业者登录办好后长期复用，不必每批重来）*/
/*   parallel     可与审查等待期重叠完成的准备工（做中文标签、审广告文案） */
/*   sequential   必须排队的前置核准/查验（检疫许可、型式认证、逐批查验）  */
/* applies_per 再标一次该义务的复用语境：每批重复，还是产品/主体层面一次搞定 */
/* 未在此声明的制度，引擎保守按 sequential + 每批 处理（宁可高估交期）。  */
export const regimeTimeModel = {
  'RG-IMP-01': { lead_phase: 'prerequisite', applies_per: 'importer' },
  'RG-FOOD-01': { lead_phase: 'sequential', applies_per: 'shipment' },
  'RG-HEALTH-01': { lead_phase: 'sequential', applies_per: 'product' },
  'RG-COS-01': { lead_phase: 'sequential', applies_per: 'product' },
  'RG-DRUG-01': { lead_phase: 'sequential', applies_per: 'product' },
  'RG-BSMI-01': { lead_phase: 'sequential', applies_per: 'shipment' },
  'RG-NCC-01': { lead_phase: 'sequential', applies_per: 'product' },
  'RG-AQ-ANI-01': { lead_phase: 'sequential', applies_per: 'shipment' },
  'RG-AQ-PLT-01': { lead_phase: 'sequential', applies_per: 'shipment' },
  'RG-AGR-01': { lead_phase: 'sequential', applies_per: 'shipment' },
  'RG-CN-01': { lead_phase: 'parallel', applies_per: 'shipment' },
  'RG-LBL-01': { lead_phase: 'parallel', applies_per: 'product' },
  'RG-AD-01': { lead_phase: 'parallel', applies_per: 'product' },
  'JP-FOOD-01': { lead_phase: 'sequential', applies_per: 'shipment' },
  'JP-LBL-01': { lead_phase: 'parallel', applies_per: 'product' },
  'JP-ADD-01': { lead_phase: 'parallel', applies_per: 'product' },
  'US-FDA-01': { lead_phase: 'prerequisite', applies_per: 'importer' },
  'US-FSVP-01': { lead_phase: 'prerequisite', applies_per: 'importer' },
  'US-PN-01': { lead_phase: 'sequential', applies_per: 'shipment' },
  'US-LBL-01': { lead_phase: 'parallel', applies_per: 'product' },
  'EU-GFL-01': { lead_phase: 'prerequisite', applies_per: 'importer' },
  'EU-LBL-01': { lead_phase: 'parallel', applies_per: 'product' },
  'EU-NF-01': { lead_phase: 'sequential', applies_per: 'product' },
};


/* ------------------------------------------------------------------ */
/* 2b. 竞品参考库（台湾主流零售渠道检索快照，非实时爬取）                 */
/*     价格为检索时的典型区间（TWD），全部 needs_verification；          */
/*     subcat + keywords 支撑三层匹配：细分品类（直接竞品/替代品分档），
/*     识别不了细分品类时退回 HS 品类粗匹配并明示。                      */
/*     正式版应接入实时电商数据源，由运营定期更新。                       */
/* ------------------------------------------------------------------ */
/* 细分品类定义表：运营录新品类时在此加一行即可，引擎不改代码。
 * keywords 用于加速匹配与中文展示；不在此表的品类走品名文本相似度通用匹配。 */
export const competitorSubcats = [
  { id: 'oat', label: '燕麦饮', keywords: ['燕麦', '燕麥', 'oat', '麦奶', '麥奶', '燕麥奶', '燕麦奶'] },
  { id: 'sparkling', label: '气泡水 / 苏打', keywords: ['气泡', '氣泡', '苏打', '蘇打', '碳酸', '气泡水', '氣泡水'] },
  { id: 'plant_protein', label: '植物蛋白饮', keywords: ['豆浆', '豆漿', '豆奶', '蛋白', '植物奶', '植物蛋白'] },
  { id: 'juice', label: '果汁 / 蔬果汁', keywords: ['果汁', '蔬果汁', '综合果蔬汁', '綜合果蔬汁', 'juice'] },
];

export const competitors = [
  /* 燕麦饮 / 植物奶（HS 2202） */
  { id: 'CMP-OAT-01', subcat: 'oat', keywords: ['燕麦', '燕麥', 'oat', '麦奶', '麥奶'], brand: 'OATLY', name: '原味燕麦奶 1L', category_words: ['燕麦奶', '燕麥奶', '燕麦饮', '燕麥飲', 'oat'], hs_prefix: '2202', tags: ['food'], platform: 'momo購物網 / 全聯', spec: '1L 常温', volume_liters: 1, price_twd: [145, 185], note: '全球市占最高的燕麦奶品牌，在台主流渠道有售', url: 'https://www.momoshop.com.tw/search/燕麥奶', retrieved_at: '2026-10-11', verify_status: 'needs_verification' },
  { id: 'CMP-OAT-02', subcat: 'oat', keywords: ['燕麦', '燕麥', 'oat', '麦奶', '麥奶'], brand: 'OATLY', name: '咖啡師燕麦奶 1L（Barista Edition）', category_words: ['燕麦奶', '燕麥奶', '咖啡師', 'oat'], hs_prefix: '2202', tags: ['food'], platform: 'momo購物網', spec: '1L 常温', volume_liters: 1, price_twd: [165, 215], note: '主打咖啡渠道搭配，B 端与家庭双场景', url: 'https://www.momoshop.com.tw/search/燕麥奶', retrieved_at: '2026-10-11', verify_status: 'needs_verification' },
  { id: 'CMP-SOY-01', subcat: 'plant_protein', keywords: ['豆浆', '豆漿', '豆奶', '蛋白', '植物奶'], brand: '統一陽光', name: '無糖豆漿 1L', category_words: ['豆漿', '豆浆', '豆奶', '植物奶'], hs_prefix: '2202', tags: ['food'], platform: '全聯 / momo購物網', spec: '1L 冷藏', volume_liters: 1, price_twd: [42, 58], note: '台湾植物蛋白饮存量最大单品，无糖主流价格锚点', url: 'https://www.momoshop.com.tw/search/無糖豆漿', retrieved_at: '2026-10-11', verify_status: 'needs_verification' },
  { id: 'CMP-SOY-02', subcat: 'plant_protein', keywords: ['豆浆', '豆漿', '豆奶', '蛋白', '植物奶'], brand: '味全', name: '香濃豆漿 1L', category_words: ['豆漿', '豆浆', '豆奶', '植物奶'], hs_prefix: '2202', tags: ['food'], platform: '全聯 / momo購物網', spec: '1L 冷藏', volume_liters: 1, price_twd: [40, 55], note: '通路覆盖广，常做促销组合价', url: 'https://www.momoshop.com.tw/search/豆漿', retrieved_at: '2026-10-11', verify_status: 'needs_verification' },
  { id: 'CMP-SOY-03', subcat: 'plant_protein', keywords: ['豆浆', '豆漿', '豆奶', '蛋白', '植物奶'], brand: '光泉', name: '無糖豆漿 1L', category_words: ['豆漿', '豆浆', '豆奶', '植物奶'], hs_prefix: '2202', tags: ['food'], platform: '全聯', spec: '1L 冷藏', volume_liters: 1, price_twd: [40, 55], note: '老牌乳品/豆浆品牌，商超常备', url: 'https://www.momoshop.com.tw/search/豆漿', retrieved_at: '2026-10-11', verify_status: 'needs_verification' },
  /* 无糖气泡水 / 苏打汽水（HS 2202） */
  { id: 'CMP-SPK-01', subcat: 'sparkling', keywords: ['气泡', '氣泡', '苏打', '蘇打', '碳酸'], brand: '泰象 Chang', name: '苏打水 325ml（24 入整箱）', category_words: ['苏打水', '蘇打水', '气泡水', '氣泡水', '碳酸'], hs_prefix: '2202', tags: ['food'], platform: 'momo購物網 /蝦皮', spec: '325ml×24', volume_liters: 7.8, price_twd: [550, 780], note: '泰国进口，无糖苏打水整箱性价比代表', url: 'https://www.momoshop.com.tw/search/蘇打水', retrieved_at: '2026-10-11', verify_status: 'needs_verification' },
  { id: 'CMP-SPK-02', subcat: 'sparkling', keywords: ['气泡', '氣泡', '苏打', '蘇打', '碳酸'], brand: '舒味思 Schweppes', name: '原味苏打汽水 330ml', category_words: ['苏打', '蘇打', '汽水', '气泡', '氣泡'], hs_prefix: '2202', tags: ['food'], platform: '全聯 / momo購物網', spec: '330ml 单罐', volume_liters: 0.33, price_twd: [15, 25], note: '可口可樂系，通路渗透率高', url: 'https://www.momoshop.com.tw/search/氣泡水', retrieved_at: '2026-10-11', verify_status: 'needs_verification' },
  { id: 'CMP-SPK-03', subcat: 'sparkling', keywords: ['气泡', '氣泡', '苏打', '蘇打', '碳酸'], brand: 'Perrier', name: '巴黎氣泡礦泉水 330ml', category_words: ['气泡', '氣泡', '矿泉水', '礦泉水'], hs_prefix: '2202', tags: ['food'], platform: 'momo購物網 / city’super', spec: '330ml 单罐', volume_liters: 0.33, price_twd: [25, 42], note: '高端天然含气矿泉水，价格带上限参考', url: 'https://www.momoshop.com.tw/search/氣泡水', retrieved_at: '2026-10-11', verify_status: 'needs_verification' },
  { id: 'CMP-JUI-01', subcat: 'juice', keywords: ['果汁', '蔬果汁', '汁', 'juice'], brand: '香吉士', name: '柳橙果汁 1000ml', hs_prefix: '2009', tags: ['food'], category_words: ['果汁', '柳橙', 'juice'], platform: '全聯 / momo購物網', spec: '1L 常温', volume_liters: 1, price_twd: [75, 110], note: '台湾果汁老牌，常温果汁主流价格锚点', url: 'https://www.momoshop.com.tw/search/果汁', retrieved_at: '2026-10-11', verify_status: 'needs_verification' },
  { id: 'CMP-JUI-02', subcat: 'juice', keywords: ['果汁', '蔬果汁', '汁', 'juice'], brand: '義美', name: '芒果果汁 450ml', hs_prefix: '2009', tags: ['food'], category_words: ['果汁', '芒果', 'mango'], platform: '全聯', spec: '450ml 常温', volume_liters: 0.45, price_twd: [30, 45], note: '本土品牌芒果汁单品，热带水果汁价格参考', url: 'https://www.momoshop.com.tw/search/果汁', retrieved_at: '2026-10-11', verify_status: 'needs_verification' },
  { id: 'CMP-JUI-03', subcat: 'juice', keywords: ['果汁', '蔬果汁', '汁', 'juice'], brand: '每日C（統一）', name: '綜合果蔬汁 300ml', hs_prefix: '2009', tags: ['food'], category_words: ['果蔬汁', '果汁', '蔬菜汁'], platform: '全聯 / momo購物網', spec: '300ml 冷藏', volume_liters: 0.3, price_twd: [25, 40], note: '冷藏每日C系列，冷藏果汁价格带', url: 'https://www.momoshop.com.tw/search/果蔬汁', retrieved_at: '2026-10-11', verify_status: 'needs_verification' },
  { id: 'CMP-SPK-04', subcat: 'sparkling', keywords: ['气泡', '氣泡', '苏打', '蘇打', '碳酸'], brand: '屈臣氏 Watsons', name: '苏打汽水 330ml（24 入）', category_words: ['苏打', '蘇打', '汽水', '气泡', '氣泡'], hs_prefix: '2202', tags: ['food'], platform: '全聯 / momo購物網', spec: '330ml×24', volume_liters: 7.92, price_twd: [289, 420], note: '价格带下限参考，常做整箱促销', url: 'https://www.momoshop.com.tw/search/蘇打汽水', retrieved_at: '2026-10-11', verify_status: 'needs_verification' },
  /* ---- 日本 / 美国 / 欧盟渠道检索快照（本地币种；price_twd 为参考折算，汇率未核验） ---- */
  { id: 'CMP-JP-OAT-01', market: 'JP', subcat: 'oat', keywords: ['燕麦', '燕麥', 'oat', '麦奶', '麥奶'], brand: 'OATLY Japan', name: '燕麦奶 1L（オーツミルク）', hs_prefix: '2202', tags: ['food'], category_words: ['燕麦奶', '燕麥奶', 'oat', 'オーツ'], platform: 'AEON / 楽天市場', spec: '1L 常温', volume_liters: 1, currency: 'JPY', price_local: [398, 498], price_twd: [84, 105], note: '日本渠道检索快照；TWD 为参考折算（1 JPY≈0.21 TWD，汇率未核验）', url: 'https://search.rakuten.co.jp/search/mall/オーツミルク/', retrieved_at: '2026-10-12', verify_status: 'needs_verification' },
  { id: 'CMP-JP-JUI-01', market: 'JP', subcat: 'juice', keywords: ['果汁', '蔬果汁', '汁', 'juice'], brand: 'Kagome 可果美', name: '蔬菜果汁 900ml', hs_prefix: '2009', tags: ['food'], category_words: ['果汁', '蔬果汁', '野菜'], platform: 'AEON / Amazon JP', spec: '900ml 冷藏', volume_liters: 0.9, currency: 'JPY', price_local: [298, 398], price_twd: [63, 84], note: '日本渠道检索快照；TWD 为参考折算（汇率未核验）', url: 'https://www.amazon.co.jp/s?k=野菜ジュース', retrieved_at: '2026-10-12', verify_status: 'needs_verification' },
  { id: 'CMP-JP-SPK-01', market: 'JP', subcat: 'sparkling', keywords: ['气泡', '氣泡', '苏打', '蘇打', '碳酸'], brand: 'Asahi 朝日', name: '碳酸水 500ml', hs_prefix: '2202', tags: ['food'], category_words: ['碳酸', '气泡水', '氣泡水'], platform: '楽天市場 / AEON', spec: '500ml 单瓶', volume_liters: 0.5, currency: 'JPY', price_local: [108, 150], price_twd: [23, 32], note: '日本渠道检索快照；TWD 为参考折算（汇率未核验）', url: 'https://search.rakuten.co.jp/search/mall/炭酸水/', retrieved_at: '2026-10-12', verify_status: 'needs_verification' },
  { id: 'CMP-US-OAT-01', market: 'US', subcat: 'oat', keywords: ['燕麦', '燕麥', 'oat', '麦奶', '麥奶'], brand: 'Oatly USA', name: 'Original Oatmilk 32oz', hs_prefix: '2202', tags: ['food'], category_words: ['燕麦奶', '燕麥奶', 'oat', 'oatmilk'], platform: 'Walmart / Amazon', spec: '32oz 常温', volume_liters: 0.946, currency: 'USD', price_local: [4.99, 5.99], price_twd: [160, 192], note: '美国渠道检索快照；TWD 为参考折算（1 USD≈32 TWD，汇率未核验）', url: 'https://www.walmart.com/search?q=oat+milk', retrieved_at: '2026-10-12', verify_status: 'needs_verification' },
  { id: 'CMP-US-JUI-01', market: 'US', subcat: 'juice', keywords: ['果汁', '蔬果汁', '汁', 'juice'], brand: 'Simply', name: 'Orange Juice 1.75L', hs_prefix: '2009', tags: ['food'], category_words: ['果汁', 'juice', 'orange'], platform: 'Walmart / Whole Foods', spec: '1.75L 冷藏', volume_liters: 1.75, currency: 'USD', price_local: [6.49, 7.49], price_twd: [208, 240], note: '美国渠道检索快照；TWD 为参考折算（汇率未核验）', url: 'https://www.walmart.com/search?q=orange+juice', retrieved_at: '2026-10-12', verify_status: 'needs_verification' },
  { id: 'CMP-US-SPK-01', market: 'US', subcat: 'sparkling', keywords: ['气泡', '氣泡', '苏打', '蘇打', '碳酸'], brand: 'LaCroix', name: 'Sparkling Water 12×355ml', hs_prefix: '2202', tags: ['food'], category_words: ['气泡水', '氣泡水', 'sparkling'], platform: 'Amazon / Walmart', spec: '12×355ml 整箱', volume_liters: 4.26, currency: 'USD', price_local: [5.99, 7.99], price_twd: [192, 256], note: '美国渠道检索快照；TWD 为参考折算（汇率未核验）', url: 'https://www.amazon.com/s?k=sparkling+water', retrieved_at: '2026-10-12', verify_status: 'needs_verification' },
  { id: 'CMP-EU-OAT-01', market: 'EU', subcat: 'oat', keywords: ['燕麦', '燕麥', 'oat', '麦奶', '麥奶'], brand: 'Oatly EU', name: 'Haferdrink Barista 1L', hs_prefix: '2202', tags: ['food'], category_words: ['燕麦奶', '燕麥奶', 'oat', 'hafer'], platform: 'Carrefour / Rewe', spec: '1L 常温', volume_liters: 1, currency: 'EUR', price_local: [2.79, 3.49], price_twd: [95, 119], note: '欧盟渠道检索快照；TWD 为参考折算（1 EUR≈34 TWD，汇率未核验）', url: 'https://www.rewe.de/suche/?q=haferdrink', retrieved_at: '2026-10-12', verify_status: 'needs_verification' },
  { id: 'CMP-EU-JUI-01', market: 'EU', subcat: 'juice', keywords: ['果汁', '蔬果汁', '汁', 'juice'], brand: 'Innocent', name: 'Smoothie 900ml', hs_prefix: '2009', tags: ['food'], category_words: ['果汁', 'juice', 'smoothie'], platform: 'Carrefour / Sainsbury’s', spec: '900ml 冷藏', volume_liters: 0.9, currency: 'EUR', price_local: [3.29, 3.99], price_twd: [112, 136], note: '欧盟渠道检索快照；TWD 为参考折算（汇率未核验）', url: 'https://www.carrefour.fr/s?q=smoothie', retrieved_at: '2026-10-12', verify_status: 'needs_verification' },
  { id: 'CMP-EU-SPK-01', market: 'EU', subcat: 'sparkling', keywords: ['气泡', '氣泡', '苏打', '蘇打', '碳酸'], brand: 'Gerolsteiner', name: 'Sprudel 750ml（玻璃瓶）', hs_prefix: '2201', tags: ['food'], category_words: ['气泡水', '氣泡水', '矿泉水', '礦泉水'], platform: 'Rewe / Edeka', spec: '750ml 玻璃瓶', volume_liters: 0.75, currency: 'EUR', price_local: [0.89, 1.29], price_twd: [30, 44], note: '欧盟渠道检索快照；TWD 为参考折算（汇率未核验）', url: 'https://www.rewe.de/suche/?q=sprudel', retrieved_at: '2026-10-12', verify_status: 'needs_verification' },
];

/* ------------------------------------------------------------------ */
/* 3. 商品分类条目（HS 前缀 → 税率 / 货物税 / 捐费 / 管制标签）          */
/*    duty_type: advalorem | specific | mixed                          */
/* ------------------------------------------------------------------ */
export const tariffItems = [
  // ---- 食品饮料 ----
  { code: '170199', name: '固态糖（蔗糖/甜菜糖）', tags: ['food', 'agri_controlled', 'ssg'], duty_type: 'advalorem', duty_rate: 30, ssg: { rate: 30, unit: 'advalorem' }, levy: { name: '农产品推广费', rate: 0.15 }, excise: null, verify_status: 'needs_verification', source_ids: ['S01', 'S08'] },
  { code: '110100', name: '小麦或混合麦之粉', tags: ['food', 'agri_controlled', 'ssg'], duty_type: 'advalorem', duty_rate: 12.5, ssg: { rate: 25, unit: 'advalorem' }, levy: { name: '农产品推广费', rate: 0.15 }, excise: null, verify_status: 'needs_verification', source_ids: ['S01', 'S08'] },
  { code: '071331', name: '绿豆（干、脱荚）', tags: ['food', 'plant_product', 'agri_controlled', 'ssg'], duty_type: 'advalorem', duty_rate: 12.5, ssg: { rate: 35, unit: 'advalorem' }, levy: { name: '农产品推广费', rate: 0.15 }, excise: null, verify_status: 'needs_verification', source_ids: ['S01', 'S05', 'S08'] },
  { code: '040221', name: '脂肪含量>10% 之奶粉/奶油粉（未加糖）', tags: ['food', 'animal_product', 'agri_controlled', 'ssg'], duty_type: 'advalorem', duty_rate: 27, ssg: { rate: 35, unit: 'advalorem' }, levy: { name: '农产品推广费', rate: 0.15 }, excise: null, verify_status: 'needs_verification', source_ids: ['S01', 'S05', 'S08'] },
  { code: '220299', name: '其他非酒精饮料（含植物蛋白饮/燕麦饮）', tags: ['food'], duty_type: 'advalorem', duty_rate: 12, ssg: null, levy: null, excise: { name: '货物税-饮料类（含糖饮料）', mode: 'specific', amount_per_liter: 6, condition: '含糖量达课征门槛', verify_status: 'needs_verification' }, verify_status: 'needs_verification', source_ids: ['S01', 'S07'] },
  { code: '220210', name: '水/含气及加味水（无糖气泡饮）', tags: ['food'], duty_type: 'advalorem', duty_rate: 12, ssg: null, levy: null, excise: { name: '货物税-饮料类', mode: 'none', amount_per_liter: 0, condition: '未添加糖之包装饮用水不课', verify_status: 'needs_verification' }, verify_status: 'needs_verification', source_ids: ['S01', 'S07'] },
  { code: '190590', name: '其他烘焙/饼干类食品', tags: ['food'], duty_type: 'advalorem', duty_rate: 12.5, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01'] },
  { code: '210690', name: '其他未列名食品（含调制粉、膳食补充原料）', tags: ['food'], duty_type: 'advalorem', duty_rate: 12.5, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01'] },
  { code: '180690', name: '其他含可可食品', tags: ['food'], duty_type: 'advalorem', duty_rate: 12, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01'] },
  { code: '040210', name: '奶粉（脂肪含量≤1.5%，浓缩/加糖除外）', tags: ['food', 'animal_product', 'agri_controlled', 'ssg'], duty_type: 'advalorem', duty_rate: 10, ssg: null, levy: { name: '农产品推广费', rate: 0.15 }, excise: null, verify_status: 'needs_verification', source_ids: ['S01', 'S05', 'S08'] },
  { code: '040221', name: '奶粉（脂肪含量>1.5%，未加糖）', tags: ['food', 'animal_product', 'agri_controlled', 'ssg'], duty_type: 'advalorem', duty_rate: 27, ssg: { rate: 35, unit: 'advalorem' }, levy: { name: '农产品推广费', rate: 0.15 }, excise: null, verify_status: 'needs_verification', source_ids: ['S01', 'S05', 'S08'] },
  { code: '0902', name: '茶叶（未发酵/发酵半发酵）', tags: ['food', 'plant_product', 'agri_controlled', 'ssg'], duty_type: 'advalorem', duty_rate: 15, ssg: { rate: 25, unit: 'advalorem' }, levy: { name: '农产品推广费', rate: 0.15 }, excise: null, verify_status: 'needs_verification', source_ids: ['S01', 'S05', 'S08'] },
  { code: '1806', name: '巧克力及其他含可可食品', tags: ['food'], duty_type: 'advalorem', duty_rate: 12.5, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01'] },
  { code: '1902', name: '面条/方便面等面食', tags: ['food', 'agri_controlled'], duty_type: 'advalorem', duty_rate: 12.5, ssg: null, levy: { name: '农产品推广费', rate: 0.15 }, excise: null, verify_status: 'needs_verification', source_ids: ['S01', 'S08'] },
  { code: '2009', name: '果汁及蔬菜汁（非大陆产）', tags: ['food'], duty_type: 'advalorem', duty_rate: 15, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01'] },
  { code: '2101', name: '咖啡/茶/马黛茶浓缩精汁及制品', tags: ['food'], duty_type: 'advalorem', duty_rate: 12.5, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01'] },
  { code: '3305', name: '护发/洗发制品', tags: ['cosmetic'], duty_type: 'advalorem', duty_rate: 7.5, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01'] },
  { code: '3306', name: '口腔/牙齿卫生制品（牙膏/牙线）', tags: ['cosmetic'], duty_type: 'advalorem', duty_rate: 7.5, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01'] },
  { code: '3304', name: '美容/化妆/护肤品', tags: ['cosmetic'], duty_type: 'advalorem', duty_rate: 7.5, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01'] },
  { code: '3401', name: '肥皂/洗涤剂/表面活性制品', tags: ['cosmetic'], duty_type: 'advalorem', duty_rate: 7.5, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01'] },
  { code: '8539', name: 'LED/光源灯具', tags: ['bsmi_mandatory'], duty_type: 'advalorem', duty_rate: 5, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01', 'S04'] },
  { code: '4202', name: '箱包/手机壳/收纳用品', tags: [], duty_type: 'advalorem', duty_rate: 7.5, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01'] },
  { code: '9405', name: '灯具及照明装置', tags: ['bsmi_mandatory'], duty_type: 'advalorem', duty_rate: 6, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01', 'S04'] },
  { code: '8517', name: '电话/通信设备（手机等）', tags: ['rf_wireless'], duty_type: 'advalorem', duty_rate: 0, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01', 'S06'] },
  { code: '6115', name: '针织袜类', tags: [], duty_type: 'advalorem', duty_rate: 10, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01'] },
  { code: '2005', name: '其他未冷冻蔬菜制品（含腌渍）', tags: ['food', 'plant_product'], duty_type: 'advalorem', duty_rate: 15, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01', 'S05'] },
  { code: '200811', name: '坚果/果实制品（糖渍等，非大陆产）', tags: ['food', 'plant_product'], duty_type: 'advalorem', duty_rate: 15, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01', 'S05'] },
  { code: '090121', name: '烘焙咖啡豆（已脱咖啡因以外）', tags: ['food', 'plant_product'], duty_type: 'advalorem', duty_rate: 8, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01', 'S05'] },
  { code: '220820', name: '蒸馏酒（威士忌/白兰地等）', tags: ['food', 'excise_heavy'], duty_type: 'advalorem', duty_rate: 18.5, ssg: null, levy: null, excise: { name: '货物税-酒类（从量）', mode: 'specific', amount_per_liter: 204, condition: '按酒精浓度级距，此处取示例级距', verify_status: 'needs_verification' }, verify_status: 'needs_verification', source_ids: ['S01', 'S07'] },
  // ---- 化妆品 / 医药 ----
  { code: '330499', name: '美容或护肤制品（不含药品）', tags: ['cosmetic'], duty_type: 'advalorem', duty_rate: 12, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01', 'S03'] },
  { code: '330510', name: '发剂（洗发精）', tags: ['cosmetic'], duty_type: 'advalorem', duty_rate: 12, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01', 'S03'] },
  { code: '300490', name: '已配定量药品（其他）', tags: ['drug'], duty_type: 'advalorem', duty_rate: 0, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01', 'S03'] },
  // ---- 电子 / 电器 ----
  { code: '851762', name: '无线通信设备（路由器/蓝牙装置等）', tags: ['bsmi_mandatory', 'rf_wireless'], duty_type: 'advalorem', duty_rate: 0, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01', 'S04', 'S06'] },
  { code: '850760', name: '锂离子蓄电池（含行动电源）', tags: ['bsmi_mandatory'], duty_type: 'advalorem', duty_rate: 5, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01', 'S04'] },
  { code: '841451', name: '电风扇（桌面/落地/窗型）', tags: ['bsmi_mandatory', 'ssg'], duty_type: 'advalorem', duty_rate: 12, ssg: { rate: 32, unit: 'advalorem' }, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01', 'S04'] },
  { code: '851660', name: '电热器具（热水壶/烤面包机）', tags: ['bsmi_mandatory'], duty_type: 'advalorem', duty_rate: 10, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01', 'S04'] },
  // ---- 日用 / 工业 / 纺织 ----
  { code: '610910', name: '针织棉质 T 恤', tags: ['ssg', 'textile'], duty_type: 'advalorem', duty_rate: 17.5, ssg: { rate: 25.7, unit: 'advalorem' }, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01'] },
  { code: '640299', name: '其他塑胶面鞋靴', tags: ['ssg', 'footwear'], duty_type: 'advalorem', duty_rate: 19.5, ssg: { rate: 30, unit: 'advalorem' }, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01'] },
  { code: '690721', name: '瓷质饰面砖/铺地砖', tags: ['ssg'], duty_type: 'advalorem', duty_rate: 12.5, ssg: { rate: 30, unit: 'advalorem' }, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01'] },
  { code: '940360', name: '木家具', tags: ['wood_package'], duty_type: 'advalorem', duty_rate: 5, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01', 'S05'] },
  { code: '848180', name: '阀门（其他龙头旋塞）', tags: ['industrial'], duty_type: 'advalorem', duty_rate: 5, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01'] },
  { code: '392690', name: '其他塑胶制品', tags: ['plastic'], duty_type: 'advalorem', duty_rate: 10, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S01'] },
  /* 日本 / 美国 / 欧盟：食品饮料高频品目的 MFN 参考税率（登记口径，待核验）。
     未登记品目在该市场一律「无法判定」，不做跨市场推测。 */
  { code: '2202', market: 'JP', name: '无酒精饮料（含植物蛋白饮 / 燕麦奶）', tags: ['food'], duty_type: 'advalorem', duty_rate: 0, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S09'] },
  { code: '2009', market: 'JP', name: '果汁与蔬果汁', tags: ['food'], duty_type: 'advalorem', duty_rate: 15, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S09'] },
  { code: '2202', market: 'US', name: '无酒精饮料（含植物蛋白饮 / 燕麦奶）', tags: ['food'], duty_type: 'advalorem', duty_rate: 0, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S10'] },
  { code: '2009', market: 'US', name: '果汁与蔬果汁', tags: ['food'], duty_type: 'advalorem', duty_rate: 0, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S10'] },
  { code: '2202', market: 'EU', name: '无酒精饮料（含植物蛋白饮 / 燕麦奶）', tags: ['food'], duty_type: 'advalorem', duty_rate: 9.1, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S11'] },
  { code: '2009', market: 'EU', name: '果汁与蔬果汁', tags: ['food'], duty_type: 'advalorem', duty_rate: 12, ssg: null, levy: null, excise: null, verify_status: 'needs_verification', source_ids: ['S11'] },
];

/* ------------------------------------------------------------------ */
/* 4. 大陆产地禁止输入清单（命中即 prohibited）                         */
/*    真实清单项目数远多于此，此处为结构演示 + 高频踩坑品类，全部待核验。 */
/* ------------------------------------------------------------------ */
export const mainlandProhibited = [
  { code_prefix: '0303', name: '部分冷冻/干制水产品（示例条目）', reason: '动物传染病防疫管制', verify_status: 'needs_verification', source_ids: ['S02', 'S05'] },
  { code_prefix: '071410', name: '部分薯类及寄主植物产品（示例条目）', reason: '植物防疫管制（寄主/疫区）', verify_status: 'needs_verification', source_ids: ['S02', 'S05'] },
  { code_prefix: '160100', name: '肉品及肉制品（示例条目）', reason: '口蹄疫/禽流感疫区限制', verify_status: 'needs_verification', source_ids: ['S02', 'S05'] },
  { code_prefix: '250200', name: '未焙烧黄铁矿（示例条目）', reason: '大陆货品禁止输入清单', verify_status: 'needs_verification', source_ids: ['S02'] },
  { code_prefix: '871160', name: '电动摩托车（示例条目）', reason: '大陆货品禁止输入清单（整车类）', verify_status: 'needs_verification', source_ids: ['S02'] },
  /* ---- 补充：大陆产常见禁止/管制输入品类（演示「禁止入境」分支；以官方清单核验为准） ---- */
  { code_prefix: '200811', name: '糖渍坚果及果实制品（含栗子 2008.11.92.00）', reason: '大陆产坚果/果实制品属大陆货品不准输入项目（植物防疫与贸易管制）', verify_status: 'needs_verification', source_ids: ['S02', 'S05'] },
  { code_prefix: '0810', name: '鲜水果（大陆产荔枝/龙眼/芒果等）', reason: '植物防疫检疫：寄主限制与疫区管制，鲜果多数不准自大陆输入', verify_status: 'needs_verification', source_ids: ['S02', 'S05'] },
  { code_prefix: '0802', name: '鲜坚果（大陆产板栗/核桃等）', reason: '植物防疫检疫：实蝇等寄主管制', verify_status: 'needs_verification', source_ids: ['S05'] },
  { code_prefix: '2009', name: '果汁及蔬菜汁（大陆产）', reason: '大陆产果汁属不准输入项目（贸易管制）', verify_status: 'needs_verification', source_ids: ['S02'] },
  { code_prefix: '0207', name: '禽肉及杂碎（大陆产）', reason: '禽流感疫区管制，禁止输入', verify_status: 'needs_verification', source_ids: ['S05'] },
  { code_prefix: '0102', name: '活牛（大陆产）', reason: '偶蹄类动物疫病管制，禁止输入', verify_status: 'needs_verification', source_ids: ['S05'] },
  { code_prefix: '0401', name: '生鲜乳与奶油（大陆产）', reason: '动物防疫管制，不准输入', verify_status: 'needs_verification', source_ids: ['S05'] },
  { code_prefix: '1901', name: '麦芽/可可食品（含乳婴幼儿配方除外，大陆产部分品目）', reason: '部分大陆产食品属不准输入项目（贸易管制）', verify_status: 'needs_verification', source_ids: ['S02'] },
  { code_prefix: '2201', name: '包装饮用水（大陆产）', reason: '大陆产包装水属不准输入项目', verify_status: 'needs_verification', source_ids: ['S02'] },
  { code_prefix: '0902', name: '茶叶（大陆产）', reason: '大陆产茶叶属不准输入项目（贸易管制）', verify_status: 'needs_verification', source_ids: ['S02'] },
  { code_prefix: '0901', name: '咖啡豆（大陆产生豆）', reason: '植物检疫：咖啡果小蠹等寄主管制', verify_status: 'needs_verification', source_ids: ['S05'] },
  { code_prefix: '3303', name: '香水及芳香制品（大陆产）', reason: '部分日化品类属大陆不准输入项目', verify_status: 'needs_verification', source_ids: ['S02'] },
  { code_prefix: '9503', name: '玩具（部分电动/金属类）', reason: '部分玩具品类属大陆不准输入项目（检验与贸易管制）', verify_status: 'needs_verification', source_ids: ['S02', 'S04'] },
  { code_prefix: '8528', name: '电视接收机（整机）', reason: '大陆产整机属不准输入项目', verify_status: 'needs_verification', source_ids: ['S02'] },
  { code_prefix: '6109', name: '针织 T 恤（大陆产）', reason: '部分纺织成衣品类属大陆不准输入项目（贸易管制）', verify_status: 'needs_verification', source_ids: ['S02'] },
  { code_prefix: '1704', name: '糖果/口香糖（无可可，大陆产）', reason: '部分糖制品属大陆不准输入项目', verify_status: 'needs_verification', source_ids: ['S02'] },
];

/* ------------------------------------------------------------------ */
/* 5. SSG 特别防卫措施监控表（累积量 → 触发点）                          */
/* ------------------------------------------------------------------ */
export const ssgSnapshots = [
  { code: '170199', name: '糖', unit: '公吨', trigger_volume: 52320, accumulated: 44100, monthly_rate: 6200, ssg_rate: 30, snapshot_date: '2026-09-15', source_ids: ['S01'], verify_status: 'needs_verification' },
  { code: '110100', name: '小麦粉', unit: '公吨', trigger_volume: 100000, accumulated: 61200, monthly_rate: 12800, ssg_rate: 25, snapshot_date: '2026-09-15', source_ids: ['S01'], verify_status: 'needs_verification' },
  { code: '071331', name: '绿豆', unit: '公吨', trigger_volume: 1000, accumulated: 872, monthly_rate: 180, ssg_rate: 35, snapshot_date: '2026-09-15', source_ids: ['S01'], verify_status: 'needs_verification' },
  { code: '040221', name: '奶粉', unit: '公吨', trigger_volume: 11500, accumulated: 9980, monthly_rate: 1450, ssg_rate: 35, snapshot_date: '2026-09-15', source_ids: ['S01'], verify_status: 'needs_verification' },
  { code: '841451', name: '电风扇', unit: '台', trigger_volume: 350000, accumulated: 121000, monthly_rate: 46000, ssg_rate: 32, snapshot_date: '2026-09-15', source_ids: ['S01'], verify_status: 'needs_verification' },
  { code: '610910', name: '针织衫', unit: '打', trigger_volume: 1200000, accumulated: 1044000, monthly_rate: 96000, ssg_rate: 25.7, snapshot_date: '2026-09-15', source_ids: ['S01'], verify_status: 'needs_verification' },
  { code: '640299', name: '塑胶面鞋靴', unit: '双', trigger_volume: 900000, accumulated: 421000, monthly_rate: 78000, ssg_rate: 30, snapshot_date: '2026-09-15', source_ids: ['S01'], verify_status: 'needs_verification' },
  { code: '690721', name: '磁砖', unit: '公吨', trigger_volume: 24000, accumulated: 22850, monthly_rate: 3100, ssg_rate: 30, snapshot_date: '2026-09-15', source_ids: ['S01'], verify_status: 'needs_verification' },
];

/* ------------------------------------------------------------------ */
/* 6. 口岸与物流参数（F2-3 多方案对比用）                                */
/* ------------------------------------------------------------------ */
export const ports = [
  { code: 'KEE', name: '基隆港（海运 CFS）', handling_per_teu: 4200, clearance_days: [2, 5], inspection_intensity: '中', note: '北部消费集散，小批量拼柜常用，查验频率中等', verify_status: 'needs_verification' },
  { code: 'KHH', name: '高雄港（海运 CFS）', handling_per_teu: 3800, clearance_days: [2, 6], inspection_intensity: '中高', note: '南部主要口岸，重柜与大宗农产品多走此口，SSG 品类查验较严', verify_status: 'needs_verification' },
  { code: 'TXG', name: '台中港（海运）', handling_per_teu: 3500, clearance_days: [3, 7], inspection_intensity: '低', note: '散杂货与大宗原料，仓容较足但内陆配送成本较高', verify_status: 'needs_verification' },
  { code: 'TPE', name: '台北空运（桃园机场）', handling_per_teu: 0, air_per_100kg: 2600, clearance_days: [1, 2], inspection_intensity: '高', note: '高价值/急单，空运逐批查验比例高，电子与食品小批量常用', verify_status: 'needs_verification' },
];

/* ------------------------------------------------------------------ */
/* 7. 行政规费（查验/检验/检疫，按批计征）                                */
/* ------------------------------------------------------------------ */
export const adminFees = [
  { id: 'FEE-FOOD-INSPECT', name: '输入食品查验费', applies_tags: ['food'], mode: 'per_shipment', amount: 1200, currency: 'TWD', verify_status: 'needs_verification', source_ids: ['S03'] },
  { id: 'FEE-BSMI-CRC', name: '商品检验报验查验费', applies_tags: ['bsmi_mandatory'], mode: 'per_shipment', amount: 2500, currency: 'TWD', verify_status: 'needs_verification', source_ids: ['S04'] },
  { id: 'FEE-AQ-PLANT', name: '植物检疫费', applies_tags: ['plant_product'], mode: 'per_shipment', amount: 900, currency: 'TWD', verify_status: 'needs_verification', source_ids: ['S05'] },
  { id: 'FEE-AQ-ANIMAL', name: '动物产品检疫费', applies_tags: ['animal_product'], mode: 'per_shipment', amount: 1500, currency: 'TWD', verify_status: 'needs_verification', source_ids: ['S05'] },
  { id: 'FEE-CUSTOMS-SVC', name: '报关行服务费（市场行价）', applies_tags: ['*'], mode: 'per_shipment', amount: 3000, currency: 'TWD', verify_status: 'needs_verification', source_ids: ['S01'] },
];

/* ------------------------------------------------------------------ */
/* 8. 标签与宣传文案合规规则（F1-3，纯文本，不做图片 OCR）                 */
/* ------------------------------------------------------------------ */
export const labelRules = [
  { id: 'LB-01', name: '食品涉及医疗效能宣称', scope_tags: ['food'], severity: 'high', pattern: '(治療|治癒|療效|預防|改善|緩解|抑制).{0,8}(癌|腫瘤|高血壓|高血脂|糖尿病|血糖|失眠|憂鬱|發炎|疾病)', basis: [{ title: '食品安全卫生管理法', article: '食品不得宣称医疗效能相关条款（待核验）', verify_status: 'needs_verification' }], why: '食品（含膳食补充品）不得涉及医疗效能，属高频开罚项目。', suggestion: '删除疾病/症状动词，改为口感、成分含量、使用场景等客观描述。' },
  { id: 'LB-02', name: '化妆品涉及医疗效能', scope_tags: ['cosmetic'], severity: 'high', pattern: '(治療|修復傷口|生髮|豐胸|抗菌藥|藥用|處方|皮膚科專用|醫美等級|注射級)', basis: [{ title: '化妆品卫生安全管理法', article: '化妆品广告与标示限制条款（待核验）', verify_status: 'needs_verification' }], why: '化妆品不得宣称医疗效能或暗示药品等级，「医美化」话术风险最高。', suggestion: '改用「温和清洁」「使用感」等化妆品许可用语，并避免与医师/诊所形象绑定。' },
  { id: 'LB-03', name: '功效宣称未持有健康食品认证', scope_tags: ['food', 'health_claim'], severity: 'high', pattern: '(增強免疫力|改善睡眠|調節血壓|降低膽固醇|減肥|燃脂|排毒|養腸道菌)', basis: [{ title: '健康食品管理法', article: '功效宣称须认证并标示标志（待核验）', verify_status: 'needs_verification' }], why: '未经认证使用功效语句等同违法广告，罚锾金额高且易被职业举报。', suggestion: '两条路径：A 改写为成分含量叙述（成本 0）；B 申请健康食品认证（周期长、费用高）。' },
  { id: 'LB-04', name: '绝对化与无法查证之比较宣称', scope_tags: ['*'], severity: 'medium', pattern: '(第一|最(?:低|高|好|有效)|100%有效|完全無(?:效|害)|國家級|世界級|銷售冠軍|全网銷量)', basis: [{ title: '公平交易法', article: '虚伪不实或引人错误之表示条款（待核验）', verify_status: 'needs_verification' }], why: '无数据来源支撑的绝对化用语构成引人错误之表示。', suggestion: '删除最高级用语，或改为可查证范围与期间（例：某通路 2026 年 Q2 出货统计）。' },
  { id: 'LB-05', name: '「零添加/不含防腐剂」类用语', scope_tags: ['food'], severity: 'medium', pattern: '(零添加|無添加|不含防腐劑|0 添加|無化學)', basis: [{ title: '包装食品标示相关规定', article: '添加物标示用语限制（待核验，政策变动中）', verify_status: 'needs_verification' }], why: '主管机关已朝向禁止以「未添加/零添加」作为诉求，属政策变动敏感区。', suggestion: '改为如实标示实际成分与防腐方式，不做「无添加」诉求。' },
  { id: 'LB-06', name: '简体字标示（应使用繁体中文）', scope_tags: ['*'], severity: 'medium', detector: 'simplified_chinese', basis: [{ title: '各项商品标示专法', article: '中文标示规定（待核验）', verify_status: 'needs_verification' }], why: '上架与稽查要求繁体中文标示，简体字常被要求整改。', suggestion: '全文转繁体并做用地词汇替换（例：软件→軟體、服务器→伺服器）。' },
  { id: 'LB-07', name: '大陆产地表述不规范', scope_tags: ['*'], severity: 'high', detector: 'origin_wording', basis: [{ title: '大陆地区货品输入及标示相关规定', article: '原产地标示条款（待核验）', verify_status: 'needs_verification' }], why: '大陆生产产品须明确标示原产地为「中国大陆」，写「产地：中国」或仅列城市易被要求整改。', suggestion: '统一使用「原产地：中国大陆」并附制造厂名称与地址。' },
  { id: 'LB-08', name: '仅面向华人圈层的渠道话术', scope_tags: ['*'], severity: 'low', pattern: '(微商|小紅書同款|淘寶爆款|大陸爆款|代購|直郵|海外旗艦店|華人社團專供)', basis: [{ title: '（非法规，渠道适配建议）', article: '本土主流通路语言习惯', verify_status: 'verified' }], why: '该类话术在华人圈有效，但进入本土超商/药妆/量贩通路会削弱品牌可信度，也常触发平台审核。', suggestion: '本土通路版本改以成分、检测报告、使用情境与通路背书为主轴。' },
  { id: 'LB-09', name: '强制标示项目缺失（需结构化字段核对）', scope_tags: ['food', 'cosmetic'], severity: 'high', detector: 'missing_mandatory_fields', basis: [{ title: '包装食品/化妆品标示规定', article: '应标示事项（待核验）', verify_status: 'needs_verification' }], why: '缺项属形式违规，整改成本最低但最常被抓。', suggestion: '补齐品名、内容物/成分、净重容量、原产地、厂商名称地址、有效日期与保存方式、营养标示（食品适用）。' },
  { id: 'LB-10', name: '有机/认证类宣称无凭证', scope_tags: ['food'], severity: 'medium', pattern: '(有機|有機認證|天然無農藥|無農藥殘留)', basis: [{ title: '有机农产品管理办法', article: '有机标示与认证标志条款（待核验）', verify_status: 'needs_verification' }], why: '有机字样须认证机构与标志，「无农药残留」属绝对化。', suggestion: '未取得认证前删除有机字样，或改为「符合残留容许量标准」并附检验报告。' },
  /* ---- 多市场宣称规则（market 分流，不污染台湾扫描） ---- */
  { id: 'LB-JP-01', market: 'JP', name: '日本：机能性/健康宣称未届出', scope_tags: ['food'], severity: 'high', pattern: '(增強免疫力|改善腸道|降血壓|降血糖|緩解疲勞|抗衰老)', basis: [{ title: '食品表示法 / 机能性表示食品制度', article: '机能性宣称须届出或许可（待核验）', verify_status: 'needs_verification' }], why: '日本仅「机能性表示食品」届出后或「特定保健用食品」许可后方可宣称功能，普通食品使用即违规。', suggestion: '未届出前改为成分含量与口感描述；确需宣称则评估机能性表示届出路径。' },
  { id: 'LB-US-01', market: 'US', name: '美国：疾病宣称（drug claim）', scope_tags: ['food', 'cosmetic'], severity: 'high', pattern: '(治療|治癒|預防疾病|抗癌|降膽固醇治療|diagnose|cure|treat|prevent)', basis: [{ title: 'FD&C Act / 21 CFR 101.93', article: '疾病宣称使产品被视为未批准新药（待核验）', verify_status: 'needs_verification' }], why: '食品/化妆品出现疾病宣称即按未批准新药监管，可致扣留与警告信。', suggestion: '改为结构/功能宣称并加 FDA 免责声明，或彻底删除疾病词汇。' },
  { id: 'LB-US-02', market: 'US', name: '美国：营养素含量宣称不合规', scope_tags: ['food'], severity: 'medium', pattern: '(低脂|無糖|零糖|高纖維|高鈣|light|low fat|sugar free)', basis: [{ title: '21 CFR 101.13 / 101.54-62', article: '含量宣称的阈值与标示条件（待核验）', verify_status: 'needs_verification' }], why: 'low/free/high 等词有法定阈值与伴随标示要求，未达标即属 misbranding。', suggestion: '核对每份含量阈值后再使用；不达标改为事实性成分陈述。' },
  { id: 'LB-EU-01', market: 'EU', name: '欧盟：未经授权的健康宣称', scope_tags: ['food'], severity: 'high', pattern: '(增強免疫力|抗氧化|降膽固醇|改善睡眠|提升記憶力)', basis: [{ title: '(EC) 1924/2006', article: '营养与健康宣称须列入授权清单（待核验）', verify_status: 'needs_verification' }], why: '欧盟健康宣称实行授权清单制，清单外表述一律禁止，与台湾/美国口径不同。', suggestion: '对照 EU 授权宣称清单逐条改写；清单外功效词全部删除。' },
];

/** LB-09 用：各品类强制标示字段族（关键词族命中即视为「已检出」，未命中报「未检出」而非「不存在」） */
export const mandatoryFieldSets = {
  food: [
    { field: '品名', keywords: ['品名', '商品名稱'] },
    { field: '内容物或成分', keywords: ['內容物', '成分', '原料'] },
    { field: '净重/容量', keywords: ['淨重', '容量', '毫升', '公克', 'g', 'mL'] },
    { field: '原产地', keywords: ['原產地', '產地'] },
    { field: '厂商名称与地址', keywords: ['製造商', '負責廠商', '地址', '公司地址'] },
    { field: '有效日期或制造日期', keywords: ['有效日期', '製造日期', '保存期限', 'BBD', 'EXP'] },
    { field: '营养标示', keywords: ['營養標示', '熱量', '蛋白質', '脂肪', '碳水化合物', '鈉'] },
  ],
  cosmetic: [
    { field: '品名', keywords: ['品名', '名稱'] },
    { field: '成分', keywords: ['成分', '全成分', 'INGREDIENTS'] },
    { field: '容量/重量', keywords: ['容量', '淨重', 'mL', 'g'] },
    { field: '厂商名称与地址', keywords: ['負責廠商', '製造廠', '地址'] },
    { field: '原产地', keywords: ['原產地', '產地'] },
    { field: '有效日期/保存期限', keywords: ['有效日期', '保存期限', '製造日期'] },
    { field: '警语/注意事项', keywords: ['注意事項', '警語', '使用上'] },
  ],
};

/* ------------------------------------------------------------------ */
/* 9. 属性 → 附加管制标签（用户在产品档案里勾选的属性）                   */
/* ------------------------------------------------------------------ */
export const attributeTagMap = [
  { attribute: 'contains_animal_origin', tag: 'animal_product', label: '含动物源成分' },
  { attribute: 'contains_plant_fresh', tag: 'plant_product', label: '含生鲜植物/寄主材料' },
  { attribute: 'claims_health_function', tag: 'health_claim', label: '宣称保健功效' },
  { attribute: 'has_wireless_rf', tag: 'rf_wireless', label: '含无线射频功能' },
  { attribute: 'contains_lithium_battery', tag: 'bsmi_mandatory', label: '含锂电池' },
  { attribute: 'wood_packaging', tag: 'wood_package', label: '使用木质包装/托盘' },
  { attribute: 'is_food', tag: 'food', label: '属食品' },
  { attribute: 'is_cosmetic', tag: 'cosmetic', label: '属化妆品' },
];

/* ------------------------------------------------------------------ */
/* 10. 强制检验/低风险简化路径（给「改文案 vs 走认证」的成本对照用）        */
/* ------------------------------------------------------------------ */
export const mitigationPaths = [
  { id: 'MP-01', when_regime: 'RG-HEALTH-01', option: 'A 改写文案', cost_index: 1, duration_days: [0, 7], note: '删除功效宣称，改以成分含量叙述，无需审查' },
  { id: 'MP-02', when_regime: 'RG-HEALTH-01', option: 'B 申请健康食品认证', cost_index: 9, duration_days: [180, 540], note: '可合法宣称功效并上架药妆/健检通路，但周期与费用高' },
  { id: 'MP-03', when_regime: 'RG-NCC-01', option: 'A 调整硬件频段后送审', cost_index: 7, duration_days: [60, 150], note: '频段不匹配无法靠文件解决，须改版' },
  { id: 'MP-04', when_regime: 'RG-NCC-01', option: 'B 采购已认证平台方案', cost_index: 5, duration_days: [30, 90], note: '换模组可复用既有认证，缩短时程' },
  { id: 'MP-05', when_regime: 'RG-AQ-ANI-01', option: 'A 改用非疫区产地/加工中心', cost_index: 6, duration_days: [90, 365], note: '产地与加工厂认可为前提，不可用文件绕过' },
];

/* ------------------------------------------------------------------ */
/* 11. 未计入项清单（边界约束，必须展示给用户）                           */
/* ------------------------------------------------------------------ */
export const notIncluded = [
  '当地通路进场费、上架费、促销折让与退货损失',
  '品牌授权、商标当地注册与智慧财产权争议处理费用',
  '汇兑损益与账期资金成本（本系统仅按申报时点汇率）',
  '当地仓储月租、最后一公里配送与售后维修成本',
  '产品责任保险、召回准备金',
  '第三地转口之原产地认定风险（不构成改变原产地的合法依据）',
  '两岸政策变动导致的清单增删（须依赖法规监测模块持续更新）',
];

/* ------------------------------------------------------------------ */
/* 12. 报价缓冲默认参数（SSG / 汇率 / 合规变动）                          */
/* ------------------------------------------------------------------ */
export const quoteDefaults = {
  gross_margin_band: [0.25, 0.45],
  ssg_buffer_pct_when_watch: 8,
  ssg_buffer_pct_when_alert: 18,
  fx_buffer_pct: 3,
  compliance_buffer_pct: 2,
  verify_status: 'needs_verification',
};

/* ------------------------------------------------------------------ */
/* 13. 业务访谈输入（provenance 独立于官方来源登记）                      */
/*     访谈是业务证据，不是法规原文：不得进入 sources 官方登记，           */
/*     只能作为参数与提示的来源，且一律 needs_verification。             */
/* ------------------------------------------------------------------ */
export const businessInputs = [
  { id: 'BI-01', claim: '专案核准通过率低、周期长，厂家对审查进度几乎没有控制力', affects: 'admission.risk', verify_status: 'needs_verification', source: '企业出海案例访谈（2026-10）', implication: '专案核准类结论必须同时给出周期与进度可控性提示，不得只报周期' },
  { id: 'BI-02', claim: '同一产品在不同口岸、不同报关行的执行解读可能不一致', affects: 'admission.execution_variance', verify_status: 'needs_verification', source: '企业出海案例访谈（2026-10）', implication: '准入结论须声明执行口径差异，并提示与当地报关行复核' },
  { id: 'BI-03', claim: '改标、改文案、补许可随时可能发生，合规成本不可预测', affects: 'quote.compliance_buffer', verify_status: 'needs_verification', source: '企业出海案例访谈（2026-10）', implication: '报价带须含合规变动预留，比例待运营按品类历史复核' },
];

