/**
 * 海报模板引擎（纯函数，零依赖，浏览器与服务端同构）
 * ------------------------------------------------------------------
 * 输入关键词 → 版式系统 → 1080×1440 矢量海报（SVG 字符串）。
 * 设计定位：不是文生图模型，是"版式引擎"——文字内容由用户输入决定、
 * 永不乱码、完全离线；provider 抽象预留，接入文生图 API 时替换 renderPoster 即可。
 * 所有用户输入经 esc() 转义后才进入 SVG，防注入。
 */

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const wrap = (t, per) => { const s = String(t ?? ''); const lines = []; for (let i = 0; i < s.length; i += per) lines.push(s.slice(i, i + per)); return lines.slice(0, 4); };
const FONT = `'PingFang SC','Microsoft YaHei','Segoe UI',sans-serif`;

function svgWrap(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440">${body}</svg>`;
}

function footer(brandNote) {
  return `<g><rect x="0" y="1338" width="1080" height="102" fill="#0b1f4b"/>
  <path d="M64 1396l30-30-9 24-6-9Z" fill="#7ea6ff"/>
  <text x="118" y="1398" font-family="${FONT}" font-size="26" font-weight="600" fill="#ffffff">知海 TradePilot · 企业出海工作台</text>
  <text x="1016" y="1398" text-anchor="end" font-family="${FONT}" font-size="17" fill="#8fa3c4">${esc(brandNote || '示意物料 · 非官方发布')}</text></g>`;
}

/** 模板 A「出海主视觉」：深蓝渐变 + 大标题 + 卖点 + 航线装饰 */
function templateHero(p) {
  const titleLines = wrap(p.title, 9);
  const points = (p.points || []).filter(Boolean).slice(0, 4);
  return svgWrap(`
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop stop-color="#0b1f4b"/><stop offset=".62" stop-color="#173a86"/><stop offset="1" stop-color="#1e40af"/></linearGradient>
  <linearGradient id="acc" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#f5a623"/><stop offset="1" stop-color="#d97706"/></linearGradient></defs>
  <rect width="1080" height="1440" fill="url(#bg)"/>
  <g opacity=".16" stroke="#9db9f0" fill="none"><circle cx="880" cy="300" r="200"/><circle cx="880" cy="300" r="130"/><circle cx="880" cy="300" r="62"/></g>
  <path d="M120 980 Q540 700 950 420" stroke="url(#acc)" stroke-width="4" stroke-dasharray="14 12" fill="none"/>
  <circle cx="950" cy="420" r="14" fill="#f5a623"/><circle cx="120" cy="980" r="10" fill="#7ea6ff"/>
  <g transform="translate(72 128)"><rect width="${Math.max(320, esc(p.badge || '').length * 26 + 90)}" height="64" rx="32" fill="#ffffff14" stroke="#f5a62388"/>
  <circle cx="34" cy="32" r="8" fill="#f5a623"/><text x="58" y="41" font-family="${FONT}" font-size="26" fill="#ffd9a0">${esc(p.badge || '目标市场 · 中国台湾地区')}</text></g>
  ${titleLines.map((l, i) => `<text x="72" y="${330 + i * 108}" font-family="${FONT}" font-size="88" font-weight="800" fill="#ffffff">${esc(l)}</text>`).join('')}
  <rect x="74" y="${330 + titleLines.length * 108 - 46}" width="150" height="10" rx="5" fill="url(#acc)"/>
  ${p.subtitle ? `<text x="74" y="${440 + titleLines.length * 108}" font-family="${FONT}" font-size="34" fill="#c6d6f5">${esc(wrap(p.subtitle, 24)[0])}</text>` : ''}
  ${points.map((pt, i) => `<g transform="translate(74 ${700 + i * 92})"><circle cx="16" cy="16" r="16" fill="#f5a62322"/><path d="M8 16l5 6 11-12" stroke="#f5a623" stroke-width="3.5" fill="none" stroke-linecap="round"/><text x="52" y="27" font-family="${FONT}" font-size="33" fill="#e8eefc">${esc(String(pt).slice(0, 22))}</text></g>`).join('')}
  ${p.cta ? `<g transform="translate(74 ${1120})"><rect width="380" height="92" rx="46" fill="url(#acc)"/><text x="190" y="58" text-anchor="middle" font-family="${FONT}" font-size="36" font-weight="700" fill="#3a2405">${esc(p.cta)}</text></g>` : ''}
  ${footer(p.brandNote)}`);
}

/** 模板 B「价格促销」：暖色 + 大价格 + CTA，报价口径注明来自规则引擎 */
function templatePrice(p) {
  const points = (p.points || []).filter(Boolean).slice(0, 3);
  return svgWrap(`
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop stop-color="#fff8ec"/><stop offset=".55" stop-color="#fdeed2"/><stop offset="1" stop-color="#f9d9a8"/></linearGradient>
  <linearGradient id="acc" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#f5a623"/><stop offset="1" stop-color="#d97706"/></linearGradient></defs>
  <rect width="1080" height="1440" fill="url(#bg)"/>
  <circle cx="540" cy="360" r="290" fill="#ffffff" opacity=".5"/>
  <text x="540" y="150" text-anchor="middle" font-family="${FONT}" font-size="30" letter-spacing="10" fill="#b07414">${esc(p.badge || '首批订单 · 限时报价')}</text>
  ${wrap(p.title, 10).slice(0, 2).map((l, i) => `<text x="540" y="${i ? 300 : 232}" text-anchor="middle" font-family="${FONT}" font-size="74" font-weight="800" fill="#3a2405">${esc(l)}</text>`).join('')}
  <rect x="340" y="352" width="400" height="8" rx="4" fill="#d97706"/>
  <text x="540" y="600" text-anchor="middle" font-family="${FONT}" font-size="52" fill="#7a5210">${esc(p.price || '')}</text>
  <text x="540" y="760" text-anchor="middle" font-family="${FONT}" font-size="120" font-weight="800" fill="#d97706">${esc((p.price || '').match(/[\d.,]+/)?.[0] || '')}</text>
  <text x="540" y="830" text-anchor="middle" font-family="${FONT}" font-size="34" fill="#7a5210">${esc((p.price || '').replace(/[\d.,]+/, '').trim())}</text>
  ${points.map((pt, i) => `<text x="540" y="${940 + i * 64}" text-anchor="middle" font-family="${FONT}" font-size="32" fill="#5c3f10">·  ${esc(String(pt).slice(0, 24))}  ·</text>`).join('')}
  ${p.cta ? `<g transform="translate(300 1150)"><rect width="480" height="100" rx="50" fill="url(#acc)"/><text x="240" y="63" text-anchor="middle" font-family="${FONT}" font-size="40" font-weight="700" fill="#fff">${esc(p.cta)}</text></g>` : ''}
  <text x="540" y="1310" text-anchor="middle" font-family="${FONT}" font-size="20" fill="#a17c3e">报价由规则引擎测算 · 含风险缓冲 · 规则待人工核验，正式报价以核验后为准</text>
  ${footer(p.brandNote)}`);
}

/** 模板 C「三问出海」：白底卡片，直接复述评估三问的结论 */
function templateThreeQ(p) {
  const q = [
    { n: '01', q: '能不能进？', a: p.q1 || '—' },
    { n: '02', q: '多少钱进去？', a: p.q2 || '—' },
    { n: '03', q: '进去好不好卖？', a: p.q3 || '—' },
  ];
  return svgWrap(`
  <rect width="1080" height="1440" fill="#f6f8fc"/>
  <rect width="1080" height="212" fill="#1e40af"/>
  <text x="540" y="128" text-anchor="middle" font-family="${FONT}" font-size="52" font-weight="800" fill="#ffffff">${esc(p.title || '')}</text>
  <text x="540" y="180" text-anchor="middle" font-family="${FONT}" font-size="26" fill="#c6d6f5">${esc(p.badge || '')}</text>
  ${q.map((it, i) => `<g transform="translate(80 ${290 + i * 330})">
    <rect width="920" height="290" rx="20" fill="#ffffff" stroke="#dbe4f3"/>
    <rect width="12" height="290" rx="6" fill="${i === 0 ? '#137351' : i === 1 ? '#d97706' : '#1e40af'}"/>
    <text x="70" y="96" font-family="${FONT}" font-size="24" fill="#8d9db5">${it.n}</text>
    <text x="70" y="150" font-family="${FONT}" font-size="48" font-weight="700" fill="#1c2b44">${esc(it.q)}</text>
    ${wrap(it.a, 18).slice(0, 2).map((l, j) => `<text x="70" y="${210 + j * 44}" font-family="${FONT}" font-size="32" fill="#4a5e7b">${esc(l)}</text>`).join('')}
  </g>`).join('')}
  <text x="540" y="1312" text-anchor="middle" font-family="${FONT}" font-size="21" fill="#8d9db5">结论来自核心规则引擎 · 未核验规则自动标注参考级 · 不得作为实际报关依据</text>
  ${footer(p.brandNote)}`);
}

export const POSTER_TEMPLATES = [
  { id: 'hero', name: '出海主视觉', hint: '大标题 + 卖点清单，适合品牌曝光', render: templateHero },
  { id: 'price', name: '价格促销', hint: '大价格 + 行动按钮，适合渠道报价', render: templatePrice },
  { id: 'threeq', name: '三问出海', hint: '准入/成本/动销三问卡片，适合汇报物料', render: templateThreeQ },
];

export function renderPoster(templateId, params) {
  const t = POSTER_TEMPLATES.find((x) => x.id === templateId) || POSTER_TEMPLATES[0];
  return { id: t.id, name: t.name, svg: t.render(params || {}) };
}

/* ==================== AI 海报（V16）：免费生图背景 + 本地矢量合成 ====================
 * 架构：Pollinations 免费 API（无密钥、CORS 全开）只生成背景图；
 * 产品图与中文文案由本地 SVG 合成——产品 100% 保真、中文永不乱码、图片不上传。
 * 实测边界：匿名档宽≤512、高≈≤680，故按 512×682（3:4）生成，合成时放大到 1080×1440。
 * 水印：匿名档右下角有小水印，由合成层的品牌页脚条（底部 102px 不透明）覆盖。 */

export const AI_BG = {
  endpoint: 'https://image.pollinations.ai/prompt/',
  width: 512,
  height: 682,
  models: [
    { id: 'turbo', name: '极速', hint: '约 5–15 秒' },
    { id: 'flux', name: '高质量', hint: '约 15–40 秒' },
  ],
};

export const POSTER_STYLES = [
  { id: 'studio', name: '简约工作室', prompt: 'clean minimal studio product background, soft cream and light blue gradient, gentle soft shadows, professional e-commerce advertisement style, no text, no watermark, no people', g: ['#f6f1e7', '#bcd6f0'] },
  { id: 'nature', name: '清新自然', prompt: 'fresh natural morning light background, soft green leaves bokeh and sky blue tones, airy and clean, advertisement style, no text, no watermark, no people', g: ['#eef7ea', '#a8d8c8'] },
  { id: 'festival', name: '节日促销', prompt: 'festive celebration background, warm golden and red bokeh lights, elegant premium feel, no text, no watermark, no people', g: ['#ffe9c8', '#e8975e'] },
  { id: 'tech', name: '科技质感', prompt: 'modern tech gradient background, deep blue and violet, subtle geometric light lines, futuristic premium, no text, no watermark, no people', g: ['#0b1f4b', '#4c3a8f'] },
  { id: 'beach', name: '阳光海岸', prompt: 'sunny tropical beach background soft focus, turquoise sea and warm sand tones, vacation vibe, no text, no watermark, no people', g: ['#d8f0f4', '#f0d9a8'] },
  { id: 'city', name: '都市夜景', prompt: 'modern city skyline at dusk background, soft bokeh lights, premium urban feel, no text, no watermark, no people', g: ['#1a2440', '#5e4a8a'] },
];

/** 拉取 AI 背景（浏览器直连 Pollinations，仅发送风格提示词文字；产品图永不上传） */
export async function fetchAiBackground({ prompt, model = 'turbo', seed = Math.floor(Math.random() * 1e6), timeoutMs = 90000 } = {}) {
  const url = `${AI_BG.endpoint}${encodeURIComponent(String(prompt || ''))}?width=${AI_BG.width}&height=${AI_BG.height}&model=${encodeURIComponent(model)}&seed=${seed}&nologo=true&safe=true`;
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    const msg = res.status === 402 ? '免费档尺寸/频率受限（402），稍候重试或换极速模型'
      : res.status === 429 ? '请求过于频繁（429），稍候重试' : `背景生成失败（HTTP ${res.status}）`;
    throw new Error(msg);
  }
  const blob = await res.blob();
  if (!/^image\//.test(blob.type)) throw new Error('返回内容不是图片，请重试');
  return await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('读取生成结果失败'));
    fr.readAsDataURL(blob);
  });
}

/** AI 海报合成：背景（AI 图或风格渐变兜底）+ 产品图卡片 + 中文文案 + 品牌页脚 */
export function buildAiPosterSvg(p) {
  const st = p.style || POSTER_STYLES[0];
  const titleLines = wrap(p.title, 9).slice(0, 2);
  const points = (p.points || []).filter(Boolean).slice(0, 3);
  const hasPhoto = !!p.photo;
  const bgPart = p.bg
    ? `<image href="${p.bg}" x="0" y="0" width="1080" height="1440" preserveAspectRatio="xMidYMid slice"/>`
    : `<defs><linearGradient id="bgg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${st.g[0]}"/><stop offset="1" stop-color="${st.g[1]}"/></linearGradient></defs><rect width="1080" height="1440" fill="url(#bgg)"/>`;
  const scrimDefs = `<defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#06102c" stop-opacity="0"/><stop offset="1" stop-color="#06102c" stop-opacity=".82"/></linearGradient>
    <filter id="pshadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="#06102c" flood-opacity=".3"/></filter>
  </defs>`;
  const badge = `<g transform="translate(72 108)"><rect width="${Math.max(320, esc(p.badge || '').length * 26 + 90)}" height="60" rx="30" fill="#06102ccc" stroke="#ffffff55"/>
    <circle cx="32" cy="30" r="7" fill="#f5a623"/><text x="54" y="39" font-family="${FONT}" font-size="24" fill="#ffffff">${esc(p.badge || '目标市场 · 中国台湾地区')}</text></g>`;
  const photoPart = hasPhoto ? `
    <g filter="url(#pshadow)"><rect x="150" y="182" width="780" height="700" rx="28" fill="#ffffff"/></g>
    <clipPath id="pc"><rect x="164" y="196" width="752" height="672" rx="20"/></clipPath>
    <image href="${p.photo}" x="164" y="196" width="752" height="672" preserveAspectRatio="xMidYMid slice" clip-path="url(#pc)"/>` : '';
  const scrimPart = `<rect x="0" y="${hasPhoto ? 740 : 620}" width="1080" height="${hasPhoto ? 700 : 820}" fill="url(#scrim)"/>`;
  /* 文案区：有产品图时排在图下方；无图时居中放大 */
  let textPart = '';
  if (hasPhoto) {
    const tY = 985;
    textPart += titleLines.map((l, i) => `<text x="72" y="${tY + i * 92}" font-family="${FONT}" font-size="74" font-weight="800" fill="#ffffff">${esc(l)}</text>`).join('');
    const pY = tY + titleLines.length * 92 + 26;
    textPart += points.map((pt, i) => `<g transform="translate(72 ${pY + i * 62})"><circle cx="14" cy="14" r="14" fill="#f5a62322"/><path d="M7 14l4 5 10-10" stroke="#f5a623" stroke-width="3" fill="none" stroke-linecap="round"/><text x="44" y="24" font-family="${FONT}" font-size="27" fill="#e8eefc">${esc(String(pt).slice(0, 22))}</text></g>`).join('');
    const rowY = 1240;
    if (p.price) textPart += `<text x="72" y="${rowY + 58}" font-family="${FONT}" font-size="62" font-weight="800" fill="#ffd9a0">${esc(p.price)}</text>`;
    if (p.cta) textPart += `<g transform="translate(${p.price ? 620 : 700} ${rowY})"><rect width="${p.price ? 380 : 310}" height="84" rx="42" fill="#f5a623"/><text x="${p.price ? 190 : 155}" y="54" text-anchor="middle" font-family="${FONT}" font-size="33" font-weight="700" fill="#3a2405">${esc(p.cta)}</text></g>`;
  } else {
    const tY = 460;
    textPart += titleLines.map((l, i) => `<text x="540" y="${tY + i * 112}" text-anchor="middle" font-family="${FONT}" font-size="92" font-weight="800" fill="#ffffff">${esc(l)}</text>`).join('');
    if (p.subtitle) textPart += `<text x="540" y="${tY + titleLines.length * 112 + 46}" text-anchor="middle" font-family="${FONT}" font-size="34" fill="#dbe5f5">${esc(wrap(p.subtitle, 24)[0])}</text>`;
    const pY = tY + titleLines.length * 112 + 130;
    textPart += points.map((pt, i) => `<text x="540" y="${pY + i * 72}" text-anchor="middle" font-family="${FONT}" font-size="31" fill="#e8eefc">·  ${esc(String(pt).slice(0, 24))}  ·</text>`).join('');
    if (p.price) textPart += `<text x="540" y="1070" text-anchor="middle" font-family="${FONT}" font-size="104" font-weight="800" fill="#ffd9a0">${esc(p.price)}</text>`;
    if (p.cta) textPart += `<g transform="translate(320 1160)"><rect width="440" height="92" rx="46" fill="#f5a623"/><text x="220" y="59" text-anchor="middle" font-family="${FONT}" font-size="38" font-weight="700" fill="#3a2405">${esc(p.cta)}</text></g>`;
  }
  return svgWrap(`${scrimDefs}${bgPart}${scrimPart}${photoPart}${badge}${textPart}${footer(p.brandNote)}`);
}
