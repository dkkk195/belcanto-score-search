/*
  Bel Canto Score Search v5
  Unified search portal for public-domain / free classical vocal score resources.
  Node.js 18+ required. No external npm dependencies.

  Safety / copyright rule:
  - This tool only indexes public pages and public/downloadable files.
  - It never bypasses login, DRM, subscription, preview-watermark, payment, or anti-bot restrictions.
  - If a source requires payment or manual rights confirmation, the UI shows a legal source-page prompt.
*/

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { Readable } = require('stream');

const PORT = process.env.PORT || 8787;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DEFAULT_LIMIT = Number(process.env.DEFAULT_LIMIT || 6);
const MAX_LIMIT = Number(process.env.MAX_LIMIT || 12);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 7500);
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 10 * 60 * 1000);
const DIRECT_PDF_LOOKUP_LIMIT = Number(process.env.DIRECT_PDF_LOOKUP_LIMIT || 2);

const USER_AGENT = 'BelCantoScoreSearch/1.4 (+public-domain/free-score discovery; no-paywall-bypass)';

const memoryCache = new Map();

const SAFE_DOWNLOAD_HOSTS = [
  'imslp.org', 'www.imslp.org',
  'cpdl.org', 'www.cpdl.org',
  'archive.org', 'ia800', 'ia801', 'ia802', 'ia803', 'ia804', 'ia600', 'ia601', 'ia902',
  'loc.gov', 'www.loc.gov', 'tile.loc.gov',
  'mutopiaproject.org', 'www.mutopiaproject.org', 'ibiblio.org', 'www.ibiblio.org',
  'artsongcentral.com', 'www.artsongcentral.com',
  'musopen.org', 'www.musopen.org',
  'gallica.bnf.fr', 'bnf.fr', 'www.bnf.fr',
  'freescores.com', 'www.free-scores.com', 'free-scores.com',
  '8notes.com', 'www.8notes.com',
  'musescore.com', 'www.musescore.com'
];

const SOURCE_DEFS = {
  imslp: { label: 'IMSLP', hint: '最大公版谱库', group: 'core', direct: true, category: '公版乐谱' },
  cpdl: { label: 'CPDL / ChoralWiki', hint: '合唱/宗教声乐', group: 'core', direct: true, category: '合唱' },
  loc: { label: 'Library of Congress', hint: '美国国会图书馆馆藏', group: 'core', direct: true, category: '馆藏' },
  archive: { label: 'Internet Archive', hint: '老谱/教材/咏叹调集', group: 'core', direct: true, category: '老谱扫描' },
  mutopia: { label: 'Mutopia Project', hint: 'PDF/MIDI/LilyPond', group: 'core', direct: true, category: '开放排版' },
  musopen: { label: 'Musopen', hint: '公版乐谱/录音', group: 'core', direct: true, category: '公版乐谱' },
  gallica: { label: 'Gallica BnF', hint: '法国国家图书馆扫描谱', group: 'core', direct: true, category: '法语/馆藏' },
  artsong: { label: 'Art Song Central', hint: '艺术歌曲', group: 'core', direct: true, category: '艺术歌曲' },
  theoperadb: { label: 'The Opera Database', hint: '咏叹调PDF入口', group: 'core', direct: false, category: '歌剧咏叹调' },

  operaarias: { label: 'Opera-Arias.com', hint: '咏叹调/声部/角色资料', group: 'extended', direct: false, category: '歌剧资料' },
  liedernet: { label: 'LiederNet Archive', hint: '歌词/译文/诗人索引', group: 'extended', direct: false, category: '歌词译文' },
  openscore: { label: 'OpenScore Lieder', hint: '德奥Lied现代排版', group: 'extended', direct: false, category: 'Lied' },
  rism: { label: 'RISM Online', hint: '全球音乐手稿/印本目录', group: 'extended', direct: false, category: '手稿目录' },
  mdz: { label: 'MDZ / BSB', hint: '巴伐利亚州图书馆数字馆藏', group: 'extended', direct: false, category: '馆藏' },
  europeana: { label: 'Europeana', hint: '欧洲文化遗产聚合检索', group: 'extended', direct: false, category: '欧洲馆藏' },
  hathi: { label: 'HathiTrust', hint: '公版图书/声乐集', group: 'extended', direct: false, category: '图书馆馆藏' },
  freescores: { label: 'Free-scores.com', hint: '免费/混合许可乐谱', group: 'extended', direct: true, category: '混合来源' },
  eightnotes: { label: '8notes', hint: '免费曲谱/教学资源', group: 'extended', direct: true, category: '教学曲谱' }
};

const ALIASES = new Map(Object.entries({
  '图兰朵': 'Turandot Puccini',
  '今夜无人入睡': 'Nessun dorma Puccini',
  '普契尼': 'Puccini',
  '莫扎特': 'Mozart',
  '舒伯特': 'Schubert',
  '舒曼': 'Schumann',
  '勃拉姆斯': 'Brahms',
  '亨德尔': 'Handel',
  '威尔第': 'Verdi',
  '罗西尼': 'Rossini',
  '多尼采蒂': 'Donizetti',
  '贝里尼': 'Bellini',
  '福雷': 'Faure Fauré',
  '德彪西': 'Debussy',
  '托斯卡': 'Tosca Puccini',
  '茶花女': 'La Traviata Verdi',
  '费加罗的婚礼': 'Le nozze di Figaro Mozart',
  '女人善变': 'La donna e mobile Verdi',
  '你们可知道': 'Voi che sapete Mozart',
  '让我痛哭吧': "Lascia ch'io pianga Handel",
  '鳟鱼': 'Die Forelle Schubert',
  '圣母颂': 'Ave Maria',
  '艺术歌曲': 'art song lied mélodie canzone',
  '咏叹调': 'aria opera vocal score',
  '歌剧': 'opera vocal score aria',
  '合唱': 'choral chorus choir',
  '德语艺术歌曲': 'Lied Lieder German art song',
  '法语艺术歌曲': 'mélodie chanson française art song',
  '意大利语咏叹调': 'Italian aria opera',
  '女高音': 'soprano',
  '女中音': 'mezzo-soprano',
  '男高音': 'tenor',
  '男中音': 'baritone',
  '男低音': 'bass'
}));

function sendJson(res, status, payload, cacheControl = 'no-store') {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cacheControl,
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  res.end(text);
}

function clampLimit(raw) {
  const n = Number(raw || DEFAULT_LIMIT);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(n)));
}

function stripTags(input = '') {
  return String(input)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text, max = 260) {
  const clean = stripTags(text || '');
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trim() + '…';
}

function normalizeUrl(href, base) {
  if (!href) return null;
  try { return new URL(href, base).toString(); } catch { return null; }
}

function isLikelyPdfUrl(url = '') {
  return /\.pdf(?:[?#].*)?$/i.test(String(url)) || /[?&](?:format|download)=pdf(?:&|$)/i.test(String(url));
}

function normalizeTextForSearch(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandQuery(query) {
  const raw = String(query || '').trim();
  const variants = new Set();
  if (!raw) return [];
  variants.add(raw);
  variants.add(normalizeTextForSearch(raw));
  const lower = raw.toLowerCase();
  for (const [k, v] of ALIASES.entries()) {
    if (raw.includes(k) || lower.includes(k.toLowerCase())) variants.add(v);
  }
  // If user enters a non-Latin title, add generic vocal-score terms to improve library hits.
  if (/[^\u0000-\u007f]/.test(raw)) {
    variants.add(`${normalizeTextForSearch(raw)} vocal score aria art song sheet music`);
  }
  // Useful for voice repertoire searches.
  if (!/score|sheet|aria|lied|lieder|song|opera|vocal/i.test(raw)) {
    variants.add(`${raw} vocal score`);
    variants.add(`${raw} sheet music`);
  }
  return [...variants].filter(Boolean).slice(0, 5);
}

function pickBestQuery(query) {
  return expandQuery(query)[0] || query;
}

function findFirstUrlInObject(obj, pattern) {
  const seen = new Set();
  const stack = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const value of Object.values(cur)) {
      if (typeof value === 'string' && pattern.test(value)) return value;
      if (Array.isArray(value) || (value && typeof value === 'object')) stack.push(value);
    }
  }
  return null;
}

async function fetchWithTimeout(url, options = {}, retry = 1) {
  let lastError;
  for (let attempt = 0; attempt <= retry; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS + attempt * 1500);
    try {
      const response = await fetch(url, {
        ...options,
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: options.accept || 'application/json,text/html;q=0.9,*/*;q=0.8',
          ...(options.headers || {}),
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < retry) await new Promise((r) => setTimeout(r, 220 + attempt * 250));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function fetchJson(url) {
  const res = await fetchWithTimeout(url, { accept: 'application/json' });
  return res.json();
}

async function fetchText(url, accept = 'text/html') {
  const res = await fetchWithTimeout(url, { accept });
  return res.text();
}

function extractAnchors(html, baseUrl) {
  const anchors = [];
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const href = normalizeUrl(match[1], baseUrl);
    const text = stripTags(match[2]);
    if (href && text) anchors.push({ href, text });
  }
  return anchors;
}

function pickPdfFromAnchors(anchors, preferText = '') {
  const pdfs = anchors.filter((a) => isLikelyPdfUrl(a.href));
  if (!pdfs.length) return null;
  const needle = stripTags(preferText).toLowerCase();
  const preferred =
    pdfs.find((a) => needle && a.text.toLowerCase().includes(needle)) ||
    pdfs.find((a) => /pdf|score|download|sheet|乐谱|下载|partition/i.test(a.text)) ||
    pdfs[0];
  return preferred?.href || null;
}

async function tryFindDirectPdfFromPage(pageUrl, title = '') {
  if (!pageUrl) return null;
  try {
    const html = await fetchText(pageUrl);
    const anchors = extractAnchors(html, pageUrl);
    return pickPdfFromAnchors(anchors, title);
  } catch { return null; }
}

function allowedPublicDownloadHost(inputUrl) {
  try {
    const u = new URL(inputUrl);
    if (!/^https?:$/.test(u.protocol)) return false;
    const host = u.hostname.toLowerCase();
    return SAFE_DOWNLOAD_HOSTS.some((h) => host === h || host.endsWith(`.${h}`) || host.startsWith(h));
  } catch { return false; }
}

function proxiedDownloadUrl(url) {
  if (!url || !allowedPublicDownloadHost(url)) return url || null;
  return `/api/download?url=${encodeURIComponent(url)}`;
}

function uniqueByUrl(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.rawDownloadUrl || item.pageUrl || item.downloadUrl;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function result({
  source, sourceLabel, title, subtitle = '', description = '', type = 'score',
  language = '', composer = '', voice = '', pageUrl, downloadUrl = null,
  directPdf = false, license = '请以来源站点说明为准', confidence = 'medium',
  fallbackReason = '', paidRisk = false, legalHint = '', extra = {},
}) {
  const rawDownloadUrl = downloadUrl || pageUrl;
  const safeDirect = Boolean(directPdf && rawDownloadUrl && allowedPublicDownloadHost(rawDownloadUrl));
  const finalDownloadUrl = safeDirect ? proxiedDownloadUrl(rawDownloadUrl) : rawDownloadUrl;
  return {
    id: `${source}-${Buffer.from(String(title + pageUrl)).toString('base64url').slice(0, 16)}`,
    source, sourceLabel,
    title: stripTags(title) || 'Untitled',
    subtitle: stripTags(subtitle),
    description: truncate(description),
    type, language: stripTags(language), composer: stripTags(composer), voice: stripTags(voice),
    pageUrl,
    rawDownloadUrl,
    downloadUrl: finalDownloadUrl,
    downloadLabel: safeDirect ? '本页代理下载 PDF' : (directPdf ? '直接打开 PDF' : '前往原站下载'),
    directPdf: safeDirect || Boolean(directPdf),
    downloadMode: safeDirect ? 'proxy' : (directPdf ? 'direct' : 'source'),
    fallbackReason: stripTags(fallbackReason),
    paidRisk: Boolean(paidRisk),
    legalHint: stripTags(legalHint),
    license,
    confidence,
    extra,
  };
}

function fallbackResult(source, query, pageUrl, note, type = 'search', options = {}) {
  const def = SOURCE_DEFS[source] || { label: source };
  return result({
    source,
    sourceLabel: def.label,
    title: `在 ${def.label} 中继续检索：${query}`,
    subtitle: '未取得稳定 PDF 直链，提供原站入口',
    description: note,
    type,
    pageUrl,
    downloadUrl: pageUrl,
    directPdf: false,
    fallbackReason: options.fallbackReason || '未取得可稳定直连的 PDF 下载地址，或该站需要进入页面选择版本/确认版权。',
    confidence: 'fallback',
    paidRisk: Boolean(options.paidRisk),
    legalHint: options.legalHint || '',
    license: options.license || '以来源站点说明为准',
  });
}

async function mapWithDirectPdf(rows, mapper, sourceLimit = DIRECT_PDF_LOOKUP_LIMIT) {
  const mapped = [];
  for (let i = 0; i < rows.length; i++) {
    const item = await mapper(rows[i], i < sourceLimit, i);
    mapped.push(item);
  }
  return mapped;
}

async function searchIMSLP(query, limit) {
  const variants = expandQuery(query).slice(0, 2);
  const all = [];
  for (const q of variants) {
    const api = `https://imslp.org/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=${limit}&format=json&utf8=1`;
    const data = await fetchJson(api);
    all.push(...(data?.query?.search || []));
  }
  const rows = uniqueByUrl(all.map((r) => ({ ...r, pageUrl: `https://imslp.org/wiki/${encodeURIComponent((r.title || '').replace(/ /g, '_'))}` }))).slice(0, limit);
  return mapWithDirectPdf(rows, async (item, doDirect) => {
    const title = item.title || '';
    const pageUrl = item.pageUrl;
    const pdf = doDirect ? await tryFindDirectPdfFromPage(pageUrl, title) : null;
    return result({
      source: 'imslp', sourceLabel: SOURCE_DEFS.imslp.label, title,
      subtitle: '公版乐谱 / 歌剧 / 艺术歌曲 / 总谱', description: item.snippet || '',
      type: pdf ? 'direct-pdf' : 'score-page', pageUrl, downloadUrl: pdf || pageUrl,
      directPdf: Boolean(pdf),
      fallbackReason: pdf ? '' : 'IMSLP 通常需要进入作品页选择版本并确认版权状态，因此未强行伪造 PDF 直链。',
      license: 'IMSLP 页面会标注公版/版权状态；下载前请确认所在地版权', confidence: pdf ? 'high' : 'medium',
    });
  });
}

async function searchCPDL(query, limit) {
  const q = pickBestQuery(query);
  const api = `https://www.cpdl.org/wiki/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=${limit}&format=json&utf8=1`;
  const data = await fetchJson(api);
  const rows = (data?.query?.search || []).slice(0, limit);
  return mapWithDirectPdf(rows, async (item, doDirect) => {
    const title = item.title || '';
    const pageUrl = `https://www.cpdl.org/wiki/index.php/${encodeURIComponent(title.replace(/ /g, '_'))}`;
    const pdf = doDirect ? await tryFindDirectPdfFromPage(pageUrl, title) : null;
    return result({
      source: 'cpdl', sourceLabel: SOURCE_DEFS.cpdl.label, title,
      subtitle: '合唱 / 宗教声乐 / 拉丁语作品', description: item.snippet || '',
      type: pdf ? 'direct-pdf' : 'choral-score', pageUrl, downloadUrl: pdf || pageUrl,
      directPdf: Boolean(pdf),
      fallbackReason: pdf ? '' : '未在 CPDL 条目页解析到稳定 PDF 直链，建议进入页面选择版本。',
      license: 'CPDL 页面会标注作品和编配版权状态', confidence: pdf ? 'high' : 'medium',
    });
  });
}

async function searchLOC(query, limit) {
  const q = pickBestQuery(query);
  const api = `https://www.loc.gov/search/?fo=json&fa=partof:notated+music&c=${limit}&q=${encodeURIComponent(q)}`;
  const data = await fetchJson(api);
  const rows = data?.results || [];
  return rows.map((item) => {
    const pdf = findFirstUrlInObject(item, /\.pdf(\?|$)/i);
    const contributors = Array.isArray(item.contributor) ? item.contributor.join(', ') : item.contributor || '';
    return result({
      source: 'loc', sourceLabel: SOURCE_DEFS.loc.label,
      title: item.title || 'Library of Congress item', subtitle: [contributors, item.date].filter(Boolean).join(' · '),
      description: item.description || item.subject || '', type: pdf ? 'direct-pdf' : 'library-score', composer: contributors,
      pageUrl: item.url, downloadUrl: pdf || item.url, directPdf: Boolean(pdf),
      fallbackReason: pdf ? '' : 'LoC JSON 中没有解析到 PDF 直链，需进入馆藏页查看下载格式和 Rights 说明。',
      license: '以 LoC item 页面 Rights/Access 说明为准', confidence: pdf ? 'high' : 'medium',
    });
  });
}

function archiveQuery(query) {
  const q = pickBestQuery(query);
  return `(${q}) AND mediatype:texts AND (score OR sheet music OR vocal OR aria OR song OR lieder OR opera OR libretto)`;
}

async function searchInternetArchive(query, limit) {
  const fields = ['identifier', 'title', 'creator', 'date', 'description', 'rights'];
  const fl = fields.map((f) => `fl[]=${encodeURIComponent(f)}`).join('&');
  const api = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(archiveQuery(query))}&${fl}&rows=${Math.min(limit, 8)}&page=1&output=json`;
  const data = await fetchJson(api);
  const docs = data?.response?.docs || [];
  const enriched = await Promise.all(docs.map(async (doc, index) => {
    let directPdf = null;
    if (index < Math.min(4, DIRECT_PDF_LOOKUP_LIMIT + 2)) {
      try {
        const meta = await fetchJson(`https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`);
        const files = Array.isArray(meta?.files) ? meta.files : [];
        const pdfFiles = files.filter((f) => /\.pdf$/i.test(f.name || ''));
        const preferred = pdfFiles.find((f) => !/_text\.pdf$/i.test(f.name || '')) || pdfFiles[0];
        if (preferred?.name) directPdf = `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${encodeURIComponent(preferred.name)}`;
      } catch { directPdf = null; }
    }
    const pageUrl = `https://archive.org/details/${encodeURIComponent(doc.identifier)}`;
    const creator = Array.isArray(doc.creator) ? doc.creator.join(', ') : doc.creator || '';
    return result({
      source: 'archive', sourceLabel: SOURCE_DEFS.archive.label,
      title: doc.title || doc.identifier, subtitle: [creator, doc.date].filter(Boolean).join(' · '),
      description: Array.isArray(doc.description) ? doc.description.join(' ') : doc.description || '',
      type: directPdf ? 'direct-pdf' : 'archive-score', composer: creator,
      pageUrl, downloadUrl: directPdf || pageUrl, directPdf: Boolean(directPdf),
      fallbackReason: directPdf ? '' : 'Internet Archive metadata 中没有找到 PDF 文件，需进入条目页查看可下载格式。',
      license: doc.rights || '以 Internet Archive 条目 Rights/Usage 说明为准', confidence: directPdf ? 'high' : 'medium',
    });
  }));
  return enriched;
}

async function searchMutopia(query, limit) {
  const q = pickBestQuery(query);
  const searchUrl = `https://www.mutopiaproject.org/cgibin/make-table.cgi?searchingfor=${encodeURIComponent(q)}`;
  const html = await fetchText(searchUrl);
  const anchors = extractAnchors(html, searchUrl);
  const pdfAnchors = anchors.filter((a) => isLikelyPdfUrl(a.href));
  const pageAnchors = anchors.filter((a) => /\/cgibin\/piece-info\.cgi\?id=/i.test(a.href));
  const items = [];
  for (const a of pdfAnchors.slice(0, limit)) {
    items.push(result({
      source: 'mutopia', sourceLabel: SOURCE_DEFS.mutopia.label,
      title: a.text || `Mutopia PDF: ${query}`, subtitle: 'LilyPond 排版 / PDF / MIDI / 源文件',
      description: 'Mutopia 的作品通常提供 PDF、MIDI、LilyPond 源文件等。', type: 'direct-pdf',
      pageUrl: searchUrl, downloadUrl: a.href, directPdf: true,
      license: '以 Mutopia 曲目页面 License 为准', confidence: 'medium',
    }));
  }
  for (const a of pageAnchors.slice(0, Math.max(0, limit - items.length))) {
    const pdf = items.length < DIRECT_PDF_LOOKUP_LIMIT ? await tryFindDirectPdfFromPage(a.href, a.text) : null;
    items.push(result({
      source: 'mutopia', sourceLabel: SOURCE_DEFS.mutopia.label, title: a.text || `Mutopia: ${query}`,
      subtitle: '曲目页面', description: '打开后可下载 PDF / MIDI / LilyPond 等格式。', type: pdf ? 'direct-pdf' : 'score-page',
      pageUrl: a.href, downloadUrl: pdf || a.href, directPdf: Boolean(pdf),
      fallbackReason: pdf ? '' : '未在 Mutopia 曲目页解析到 PDF 直链，需要进入曲目页选择格式。',
      license: '以 Mutopia 曲目页面 License 为准', confidence: pdf ? 'high' : 'medium',
    }));
  }
  if (!items.length) return [fallbackResult('mutopia', query, searchUrl, '没有抓取到稳定结构的结果，可点击进入 Mutopia 官方检索页。')];
  return uniqueByUrl(items).slice(0, limit);
}

async function searchArtSongCentral(query, limit) {
  const q = pickBestQuery(query);
  const searchUrl = `https://artsongcentral.com/?s=${encodeURIComponent(q)}`;
  const html = await fetchText(searchUrl);
  const anchors = extractAnchors(html, searchUrl).filter((a) => a.href.includes('artsongcentral.com') && !/\.(jpg|png|gif|webp|css|js)$/i.test(a.href));
  const candidates = [];
  const seen = new Set();
  for (const a of anchors) {
    if (seen.has(a.href) || /\?s=|#|\/category\//.test(a.href)) continue;
    seen.add(a.href);
    if (a.text.length > 2 && a.text.length < 160) candidates.push(a);
    if (candidates.length >= Math.min(limit, 6)) break;
  }
  const enriched = await Promise.all(candidates.map(async (a, index) => {
    let pdf = null;
    let desc = 'Art Song Central 页面通常会提供可打印的公版艺术歌曲 PDF 或相关下载入口。';
    if (index < DIRECT_PDF_LOOKUP_LIMIT + 1) {
      try {
        const page = await fetchText(a.href);
        const pageAnchors = extractAnchors(page, a.href);
        pdf = pickPdfFromAnchors(pageAnchors, a.text);
        const meta = page.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)/i);
        if (meta?.[1]) desc = meta[1];
      } catch {}
    }
    return result({
      source: 'artsong', sourceLabel: SOURCE_DEFS.artsong.label, title: a.text,
      subtitle: '艺术歌曲 / 免费可打印谱', description: desc, type: pdf ? 'direct-pdf' : 'art-song',
      pageUrl: a.href, downloadUrl: pdf || a.href, directPdf: Boolean(pdf),
      fallbackReason: pdf ? '' : '未在 Art Song Central 条目中解析到 PDF 直链，需进入页面下载。',
      license: '以 Art Song Central 页面说明为准', confidence: pdf ? 'high' : 'medium',
    });
  }));
  if (!enriched.length) return [fallbackResult('artsong', query, searchUrl, '未抓取到条目，但可进入官方站内搜索继续查看。', 'art-song')];
  return uniqueByUrl(enriched).slice(0, limit);
}

async function searchMusopen(query, limit) {
  const q = pickBestQuery(query);
  const searchUrl = `https://musopen.org/sheetmusic/?q=${encodeURIComponent(q)}`;
  try {
    const html = await fetchText(searchUrl);
    const anchors = extractAnchors(html, searchUrl).filter((a) => a.href.includes('/sheetmusic/') && !a.href.includes('?q='));
    const candidates = uniqueByUrl(anchors.map((a) => ({ pageUrl: a.href, text: a.text }))).slice(0, limit);
    const items = await Promise.all(candidates.map(async (a, index) => {
      const pdf = index < DIRECT_PDF_LOOKUP_LIMIT ? await tryFindDirectPdfFromPage(a.pageUrl, a.text) : null;
      return result({
        source: 'musopen', sourceLabel: SOURCE_DEFS.musopen.label,
        title: a.text || `Musopen: ${query}`, subtitle: '公版乐谱 / 免费 PDF 入口',
        description: 'Musopen 提供公版乐谱和录音资源，具体下载限制以页面显示为准。',
        type: pdf ? 'direct-pdf' : 'score-page', pageUrl: a.pageUrl, downloadUrl: pdf || a.pageUrl,
        directPdf: Boolean(pdf),
        fallbackReason: pdf ? '' : 'Musopen 页面可能需要进入条目后选择 PDF 或登录下载，本工具不绕过限制。',
        license: '以 Musopen 曲目页面 License / Public Domain 说明为准', confidence: pdf ? 'high' : 'medium',
      });
    }));
    return items.length ? items : [fallbackResult('musopen', query, searchUrl, '没有抓取到稳定结构的条目，可进入 Musopen 官方检索页。')];
  } catch {
    return [fallbackResult('musopen', query, searchUrl, 'Musopen 当前可能阻止自动抓取或响应较慢，请打开官方搜索页查看。')];
  }
}

function parseDc(record, tag) {
  const re = new RegExp(`<dc:${tag}[^>]*>([\\s\\S]*?)<\\/dc:${tag}>`, 'i');
  return stripTags((record.match(re) || [])[1] || '');
}

async function searchGallica(query, limit) {
  const q = pickBestQuery(query);
  const searchQuery = `dc.title all "${q.replace(/"/g, ' ')}" and (dc.type all "partition" or dc.type all "score")`;
  const api = `https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&maximumRecords=${limit}&query=${encodeURIComponent(searchQuery)}`;
  const fallbackUrl = `https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=${encodeURIComponent(q)}`;
  try {
    const xml = await fetchText(api, 'application/xml,text/xml,text/html');
    const records = [...xml.matchAll(/<srw:recordData>([\s\S]*?)<\/srw:recordData>/gi)].map((m) => m[1]).slice(0, limit);
    const items = records.map((record) => {
      const title = parseDc(record, 'title') || `Gallica: ${query}`;
      const creator = parseDc(record, 'creator');
      const date = parseDc(record, 'date');
      const identifier = parseDc(record, 'identifier');
      const arkMatch = record.match(/ark:\/12148\/[A-Za-z0-9]+/i);
      const ark = arkMatch ? arkMatch[0] : null;
      const pageUrl = ark ? `https://gallica.bnf.fr/${ark}` : (identifier || fallbackUrl);
      const pdf = ark ? `https://gallica.bnf.fr/${ark}.pdf` : null;
      return result({
        source: 'gallica', sourceLabel: SOURCE_DEFS.gallica.label,
        title, subtitle: [creator, date].filter(Boolean).join(' · '),
        description: 'BnF Gallica 数字馆藏中的乐谱/声乐相关扫描资源。',
        type: pdf ? 'direct-pdf' : 'library-score', composer: creator,
        pageUrl, downloadUrl: pdf || pageUrl, directPdf: Boolean(pdf),
        fallbackReason: pdf ? '' : 'Gallica SRU 结果中没有解析到 ARK/PDF 地址，需进入馆藏页面。',
        license: '以 Gallica/BnF 条目 Rights 说明为准', confidence: pdf ? 'medium' : 'fallback',
      });
    });
    return items.length ? items : [fallbackResult('gallica', query, `https://gallica.bnf.fr/accueil/en/content/accueil-en?mode=desktop&query=${encodeURIComponent(q)}`, '未从 Gallica API 抓取到结果，可进入 Gallica 搜索。')];
  } catch {
    return [fallbackResult('gallica', query, `https://gallica.bnf.fr/accueil/en/content/accueil-en?mode=desktop&query=${encodeURIComponent(q)}`, 'Gallica API 当前响应失败，可进入官方页面搜索。')];
  }
}

async function searchFreeScores(query, limit) {
  const q = pickBestQuery(query);
  const searchUrl = `https://www.free-scores.com/search-uk.php?search=${encodeURIComponent(q)}`;
  try {
    const html = await fetchText(searchUrl);
    const anchors = extractAnchors(html, searchUrl).filter((a) => /free-scores\.com/i.test(a.href));
    const pdfs = anchors.filter((a) => isLikelyPdfUrl(a.href)).slice(0, limit);
    if (pdfs.length) {
      return pdfs.map((a) => result({
        source: 'freescores', sourceLabel: SOURCE_DEFS.freescores.label,
        title: a.text || `Free-scores PDF: ${query}`, subtitle: '免费/混合许可乐谱',
        description: '请在来源页确认作品和排版权限；不处理付费或登录限制内容。', type: 'direct-pdf',
        pageUrl: searchUrl, downloadUrl: a.href, directPdf: true,
        license: '以 Free-scores 页面说明为准', confidence: 'medium',
      }));
    }
  } catch {}
  return [fallbackResult('freescores', query, searchUrl, '该站包含免费与混合授权内容；未解析到公开 PDF 直链时，请进入原站确认许可和下载方式。', 'score-page', {
    paidRisk: true,
    legalHint: '如果页面显示付费/订阅/会员下载，请购买、登录授权账号或改用公版来源；本工具不破解。'
  })];
}

async function search8notes(query, limit) {
  const q = pickBestQuery(query);
  const searchUrl = `https://www.8notes.com/search.asp?keyword=${encodeURIComponent(q)}`;
  try {
    const html = await fetchText(searchUrl);
    const anchors = extractAnchors(html, searchUrl).filter((a) => /8notes\.com/i.test(a.href) && !/search\.asp/i.test(a.href));
    const candidates = uniqueByUrl(anchors.map((a) => ({ pageUrl: a.href, text: a.text }))).slice(0, limit);
    const items = await Promise.all(candidates.map(async (a, index) => {
      const pdf = index < DIRECT_PDF_LOOKUP_LIMIT ? await tryFindDirectPdfFromPage(a.pageUrl, a.text) : null;
      return result({
        source: 'eightnotes', sourceLabel: SOURCE_DEFS.eightnotes.label,
        title: a.text || `8notes: ${query}`, subtitle: '免费曲谱 / 教学资源',
        description: '8notes 包含免费曲谱、教学和部分会员内容；下载限制以页面显示为准。',
        type: pdf ? 'direct-pdf' : 'score-page', pageUrl: a.pageUrl, downloadUrl: pdf || a.pageUrl,
        directPdf: Boolean(pdf),
        fallbackReason: pdf ? '' : '未解析到公开 PDF 直链，可能需要进入页面查看免费/会员下载按钮。',
        license: '以 8notes 页面说明为准', confidence: pdf ? 'medium' : 'fallback', paidRisk: true,
        legalHint: '如页面要求付费/会员权限，请使用合法购买或选择其他公版来源。',
      });
    }));
    return items.length ? items : [fallbackResult('eightnotes', query, searchUrl, '未抓取到结构化结果，可进入 8notes 官方搜索页。', 'score-page', { paidRisk: true })];
  } catch {
    return [fallbackResult('eightnotes', query, searchUrl, '8notes 当前响应失败或限制自动抓取，可进入官方搜索页。', 'score-page', { paidRisk: true })];
  }
}

function sourcePageOnly(source, query, url, note, type = 'search', opts = {}) {
  return Promise.resolve([fallbackResult(source, query, url, note, type, opts)]);
}

async function searchTheOperaDatabase(query) {
  const searchUrl = `https://theoperadatabase.com/arias.php`;
  return sourcePageOnly('theoperadb', query, searchUrl, '该站提供大量咏叹调 PDF，但没有稳定公开 JSON 检索接口；点击后在 Search Key 输入同一关键词，可下载其公版 PDF。', 'aria-pdf');
}

async function searchOperaArias(query) {
  const searchUrl = `https://www.opera-arias.com/search/?search=${encodeURIComponent(query)}`;
  return sourcePageOnly('operaarias', query, searchUrl, '适合查声部、角色、语种、唱词、剧情和咏叹调资料；页面通常会给出外部乐谱检索入口。', 'aria-info');
}

async function searchLiederNet(query) {
  const searchUrl = `https://www.lieder.net/lieder/extended.html?Title=${encodeURIComponent(query)}&Composer=&Poet=&Language=&Opus=&TOn=&Sort1=Composer&Sort2=Title&Sort3=Poet`;
  return sourcePageOnly('liedernet', query, searchUrl, '适合查艺术歌曲歌词、译文、诗人和作曲家索引；它不是乐谱站，但对多语言声乐学习很有用。', 'lyrics');
}

async function searchOpenScoreLieder(query) {
  const searchUrl = `https://musescore.com/openscore-lieder/sheetmusic?text=${encodeURIComponent(query)}`;
  return sourcePageOnly('openscore', query, searchUrl, '适合查德奥艺术歌曲的现代排版版本；下载权限和格式以页面显示为准。', 'art-song', {
    paidRisk: true,
    legalHint: '如 MuseScore 页面要求 Pro/订阅权限，本工具不绕过；可用 MuseScore Studio 打开公开 MusicXML/MIDI 或改查 IMSLP/OpenScore GitHub。'
  });
}

async function searchRISM(query) {
  const searchUrl = `https://rism.online/search?q=${encodeURIComponent(query)}`;
  return sourcePageOnly('rism', query, searchUrl, 'RISM 是手稿和历史印本目录，常用于确认来源和馆藏位置；通常不是直接 PDF 下载站。', 'catalog');
}

async function searchMDZ(query) {
  const searchUrl = `https://www.digitale-sammlungen.de/en/search?query=${encodeURIComponent(query)}`;
  return sourcePageOnly('mdz', query, searchUrl, '巴伐利亚州图书馆数字馆藏可查大量历史乐谱；若条目提供 IIIF/PDF，请在馆藏页下载。', 'library-score');
}

async function searchEuropeana(query) {
  const searchUrl = `https://www.europeana.eu/en/search?query=${encodeURIComponent(query)}&view=grid`;
  return sourcePageOnly('europeana', query, searchUrl, 'Europeana 聚合欧洲多馆藏资源；因公开 API 通常需要 key，本工具默认提供官方检索入口。', 'catalog');
}

async function searchHathiTrust(query) {
  const searchUrl = `https://catalog.hathitrust.org/Search/Home?lookfor=${encodeURIComponent(query + ' vocal score sheet music')}&searchtype=all`;
  return sourcePageOnly('hathi', query, searchUrl, 'HathiTrust 常可找到公版声乐集、教材和旧谱；Full view/下载权限以页面显示和所在地版权为准。', 'library-score');
}

const CONNECTORS = {
  imslp: searchIMSLP,
  cpdl: searchCPDL,
  loc: searchLOC,
  archive: searchInternetArchive,
  mutopia: searchMutopia,
  musopen: searchMusopen,
  gallica: searchGallica,
  artsong: searchArtSongCentral,
  theoperadb: searchTheOperaDatabase,
  operaarias: searchOperaArias,
  liedernet: searchLiederNet,
  openscore: searchOpenScoreLieder,
  rism: searchRISM,
  mdz: searchMDZ,
  europeana: searchEuropeana,
  hathi: searchHathiTrust,
  freescores: searchFreeScores,
  eightnotes: search8notes,
};

function getSelectedSources(urlObj) {
  const requested = (urlObj.searchParams.get('sources') || Object.keys(CONNECTORS).join(','))
    .split(',').map((s) => s.trim()).filter(Boolean);
  return [...new Set(requested)].filter((s) => CONNECTORS[s]);
}

async function handleSearch(req, res, urlObj) {
  const query = (urlObj.searchParams.get('q') || urlObj.searchParams.get('query') || '').trim();
  if (!query) return sendJson(res, 400, { error: '请输入检索关键词，例如 Nessun dorma、Schubert Gretchen、Fauré Après un rêve。' });
  const limit = clampLimit(urlObj.searchParams.get('limit'));
  const selected = getSelectedSources(urlObj);
  const cacheKey = JSON.stringify({ query, limit, selected });
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return sendJson(res, 200, { ...cached.payload, cached: true, cacheAgeMs: Date.now() - cached.at }, 'private, max-age=60');
  }

  const variants = expandQuery(query);
  const startedAt = Date.now();
  const jobs = selected.map(async (sourceKey) => {
    const def = SOURCE_DEFS[sourceKey];
    try {
      const results = await CONNECTORS[sourceKey](query, limit);
      return { source: sourceKey, sourceLabel: def.label, ok: true, count: results.length, results };
    } catch (error) {
      return { source: sourceKey, sourceLabel: def.label, ok: false, count: 0, error: error.message || String(error), results: [] };
    }
  });
  const settled = await Promise.all(jobs);
  let results = settled.flatMap((s) => s.results || []);
  results = uniqueByUrl(results).slice(0, MAX_LIMIT * Math.max(1, selected.length));
  const payload = {
    query, variants, limit, elapsedMs: Date.now() - startedAt,
    sources: settled.map(({ results, ...rest }) => rest),
    results,
  };
  memoryCache.set(cacheKey, { at: Date.now(), payload });
  sendJson(res, 200, payload, 'private, max-age=60');
}

async function handleDownload(req, res, urlObj) {
  const target = urlObj.searchParams.get('url') || '';
  if (!target || !allowedPublicDownloadHost(target)) {
    return sendText(res, 400, '不能代理下载该地址。请回到来源网站下载，或确认该链接来自公开免费谱库。');
  }
  if (!isLikelyPdfUrl(target)) {
    return sendText(res, 400, '该地址不是稳定 PDF 链接。请进入来源页面选择下载格式。');
  }
  try {
    const upstream = await fetchWithTimeout(target, { accept: 'application/pdf,*/*;q=0.8' }, 0);
    const ct = upstream.headers.get('content-type') || '';
    if (!/pdf|octet-stream/i.test(ct) && !isLikelyPdfUrl(target)) {
      return sendText(res, 415, '来源没有返回 PDF 文件。请进入来源网站下载。');
    }
    const parsed = new URL(target);
    const filename = decodeURIComponent(path.basename(parsed.pathname) || 'score.pdf').replace(/[\r\n"\\]/g, '_');
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename.endsWith('.pdf') ? filename : filename + '.pdf'}"`,
      'Cache-Control': 'private, max-age=3600',
    });
    if (!upstream.body) return res.end();
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    return sendText(res, 502, `无法从公开来源直接下载 PDF：${error.message || error}。请返回结果卡片的“来源/下载页”。`);
  }
}

function serveStatic(req, res, urlObj) {
  let pathname = decodeURIComponent(urlObj.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendText(res, 403, 'Forbidden');
  fs.readFile(filePath, (err, data) => {
    if (err) return sendText(res, 404, 'Not found');
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
    };
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
      return res.end();
    }
    if (urlObj.pathname === '/api/search') return handleSearch(req, res, urlObj);
    if (urlObj.pathname === '/api/download') return handleDownload(req, res, urlObj);
    if (urlObj.pathname === '/api/health') return sendJson(res, 200, { ok: true, service: 'Bel Canto Score Search', version: '1.5', time: new Date().toISOString() }, 'no-cache');
    if (urlObj.pathname === '/api/sources') {
      return sendJson(res, 200, Object.entries(SOURCE_DEFS).map(([id, value]) => ({ id, ...value })), 'private, max-age=300');
    }
    return serveStatic(req, res, urlObj);
  } catch (error) {
    return sendJson(res, 500, { error: error.message || String(error) });
  }
});

server.listen(PORT, () => {
  console.log(`Bel Canto Score Search v5 running at http://localhost:${PORT}`);
});
