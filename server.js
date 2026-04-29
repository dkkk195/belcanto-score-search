/*
  Bel Canto Free Score Search
  Unified search portal for public-domain / free classical vocal score resources.
  Node.js 18+ required. No external npm dependencies.

  Download rule:
  1) Prefer direct PDF/download links inside this unified UI.
  2) Fall back to the original website only when a stable direct link cannot be found,
     the website requires users to choose a version/confirm rights, or the result is informational.
*/

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 8787;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 15;
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 9000);

const USER_AGENT = 'BelCantoFreeScoreSearch/1.1 (+local research tool; contact: local-user)';

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType });
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
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function isLikelyPdfUrl(url = '') {
  return /\.pdf(?:[?#].*)?$/i.test(String(url)) || /[?&]format=pdf(?:&|$)/i.test(String(url));
}

function isDownloadLikeUrl(url = '') {
  return isLikelyPdfUrl(url) || /download|file|score|sheet/i.test(String(url));
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

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: options.accept || 'application/json,text/html;q=0.9,*/*;q=0.8',
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url) {
  const res = await fetchWithTimeout(url, { accept: 'application/json' });
  return res.json();
}

async function fetchHtml(url) {
  const res = await fetchWithTimeout(url, { accept: 'text/html' });
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
    pdfs.find((a) => /pdf|score|download|sheet|乐谱|下载/i.test(a.text)) ||
    pdfs[0];
  return preferred?.href || null;
}

async function tryFindDirectPdfFromPage(pageUrl, title = '') {
  if (!pageUrl) return null;
  try {
    const html = await fetchHtml(pageUrl);
    const anchors = extractAnchors(html, pageUrl);
    return pickPdfFromAnchors(anchors, title);
  } catch {
    return null;
  }
}

function uniqueByUrl(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.downloadUrl || item.pageUrl;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function result({
  source,
  sourceLabel,
  title,
  subtitle = '',
  description = '',
  type = 'score',
  language = '',
  composer = '',
  voice = '',
  pageUrl,
  downloadUrl = null,
  downloadLabel = '',
  directPdf = false,
  license = '请以来源站点说明为准',
  confidence = 'medium',
  fallbackReason = '',
  extra = {},
}) {
  const finalDownloadUrl = downloadUrl || pageUrl;
  return {
    id: `${source}-${Buffer.from(String(title + pageUrl)).toString('base64url').slice(0, 16)}`,
    source,
    sourceLabel,
    title: stripTags(title) || 'Untitled',
    subtitle: stripTags(subtitle),
    description: truncate(description),
    type,
    language: stripTags(language),
    composer: stripTags(composer),
    voice: stripTags(voice),
    pageUrl,
    downloadUrl: finalDownloadUrl,
    downloadLabel: downloadLabel || (directPdf ? '直接下载 PDF' : '前往原站下载'),
    directPdf,
    downloadMode: directPdf ? 'direct' : 'source',
    fallbackReason: stripTags(fallbackReason),
    license,
    confidence,
    extra,
  };
}

function fallbackResult(source, sourceLabel, query, pageUrl, note, type = 'search') {
  return result({
    source,
    sourceLabel,
    title: `在 ${sourceLabel} 中继续检索：${query}`,
    subtitle: '未取得稳定 PDF 直链，提供原站入口',
    description: note,
    type,
    pageUrl,
    downloadUrl: pageUrl,
    downloadLabel: '前往原站下载',
    directPdf: false,
    fallbackReason: '未取得可稳定直连的 PDF 下载地址，或该站需要进入页面选择版本/确认版权。',
    confidence: 'fallback',
  });
}

async function searchIMSLP(query, limit) {
  const api = `https://imslp.org/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${limit}&format=json&utf8=1`;
  const data = await fetchJson(api);
  const rows = (data?.query?.search || []).slice(0, limit);
  return Promise.all(rows.map(async (item) => {
    const title = item.title || '';
    const pageUrl = `https://imslp.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
    const pdf = await tryFindDirectPdfFromPage(pageUrl, title);
    return result({
      source: 'imslp',
      sourceLabel: 'IMSLP',
      title,
      subtitle: '公版乐谱 / 歌剧 / 艺术歌曲 / 总谱',
      description: item.snippet || '',
      type: pdf ? 'direct-pdf' : 'score-page',
      pageUrl,
      downloadUrl: pdf || pageUrl,
      downloadLabel: pdf ? '直接下载 PDF' : '前往 IMSLP 下载页',
      directPdf: Boolean(pdf),
      fallbackReason: pdf ? '' : 'IMSLP 通常需要进入作品页选择版本并确认版权状态，因此未强行伪造 PDF 直链。',
      license: 'IMSLP 页面会标注公版/版权状态；下载前请确认所在地版权',
      confidence: pdf ? 'high' : 'medium',
    });
  }));
}

async function searchCPDL(query, limit) {
  const api = `https://www.cpdl.org/wiki/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${limit}&format=json&utf8=1`;
  const data = await fetchJson(api);
  const rows = (data?.query?.search || []).slice(0, limit);
  return Promise.all(rows.map(async (item) => {
    const title = item.title || '';
    const pageUrl = `https://www.cpdl.org/wiki/index.php/${encodeURIComponent(title.replace(/ /g, '_'))}`;
    const pdf = await tryFindDirectPdfFromPage(pageUrl, title);
    return result({
      source: 'cpdl',
      sourceLabel: 'CPDL / ChoralWiki',
      title,
      subtitle: '合唱 / 宗教声乐 / 拉丁语作品',
      description: item.snippet || '',
      type: pdf ? 'direct-pdf' : 'choral-score',
      pageUrl,
      downloadUrl: pdf || pageUrl,
      downloadLabel: pdf ? '直接下载 PDF' : '前往 CPDL 下载页',
      directPdf: Boolean(pdf),
      fallbackReason: pdf ? '' : '未在 CPDL 条目页解析到稳定 PDF 直链，建议进入页面选择版本。',
      license: 'CPDL 页面会标注作品和编配版权状态',
      confidence: pdf ? 'high' : 'medium',
    });
  }));
}

async function searchLOC(query, limit) {
  const api = `https://www.loc.gov/search/?fo=json&fa=partof:notated+music&c=${limit}&q=${encodeURIComponent(query)}`;
  const data = await fetchJson(api);
  const rows = data?.results || [];
  return rows.map((item) => {
    const pdf = findFirstUrlInObject(item, /\.pdf(\?|$)/i);
    const contributors = Array.isArray(item.contributor) ? item.contributor.join(', ') : item.contributor || '';
    return result({
      source: 'loc',
      sourceLabel: 'Library of Congress',
      title: item.title || 'Library of Congress item',
      subtitle: [contributors, item.date].filter(Boolean).join(' · '),
      description: item.description || item.subject || '',
      type: pdf ? 'direct-pdf' : 'library-score',
      composer: contributors,
      pageUrl: item.url,
      downloadUrl: pdf || item.url,
      downloadLabel: pdf ? '直接下载 PDF' : '前往馆藏下载页',
      directPdf: Boolean(pdf),
      fallbackReason: pdf ? '' : 'LoC JSON 中没有解析到 PDF 直链，需进入馆藏页查看下载格式和 Rights 说明。',
      license: '以 LoC item 页面 Rights/Access 说明为准',
      confidence: pdf ? 'high' : 'medium',
    });
  });
}

function archiveQuery(query) {
  return `(${query}) AND mediatype:texts AND (score OR sheet music OR vocal OR aria OR song OR lieder OR opera)`;
}

async function searchInternetArchive(query, limit) {
  const fields = ['identifier', 'title', 'creator', 'date', 'description'];
  const fl = fields.map((f) => `fl[]=${encodeURIComponent(f)}`).join('&');
  const api = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(archiveQuery(query))}&${fl}&rows=${Math.min(limit, 8)}&page=1&output=json`;
  const data = await fetchJson(api);
  const docs = data?.response?.docs || [];

  const enriched = await Promise.all(docs.map(async (doc) => {
    let directPdf = null;
    try {
      const meta = await fetchJson(`https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`);
      const files = Array.isArray(meta?.files) ? meta.files : [];
      const pdfFiles = files.filter((f) => /\.pdf$/i.test(f.name || ''));
      const preferred = pdfFiles.find((f) => !/_text\.pdf$/i.test(f.name || '')) || pdfFiles[0];
      if (preferred?.name) {
        directPdf = `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${encodeURIComponent(preferred.name)}`;
      }
    } catch {
      directPdf = null;
    }
    const pageUrl = `https://archive.org/details/${encodeURIComponent(doc.identifier)}`;
    const creator = Array.isArray(doc.creator) ? doc.creator.join(', ') : doc.creator || '';
    return result({
      source: 'archive',
      sourceLabel: 'Internet Archive',
      title: doc.title || doc.identifier,
      subtitle: [creator, doc.date].filter(Boolean).join(' · '),
      description: Array.isArray(doc.description) ? doc.description.join(' ') : doc.description || '',
      type: directPdf ? 'direct-pdf' : 'archive-score',
      composer: creator,
      pageUrl,
      downloadUrl: directPdf || pageUrl,
      downloadLabel: directPdf ? '直接下载 PDF' : '前往原站下载',
      directPdf: Boolean(directPdf),
      fallbackReason: directPdf ? '' : 'Internet Archive metadata 中没有找到 PDF 文件，需进入条目页查看可下载格式。',
      license: '以 Internet Archive 条目 Rights/Usage 说明为准',
      confidence: directPdf ? 'high' : 'medium',
    });
  }));

  return enriched;
}

async function searchMutopia(query, limit) {
  const searchUrl = `https://www.mutopiaproject.org/cgibin/make-table.cgi?searchingfor=${encodeURIComponent(query)}`;
  const html = await fetchHtml(searchUrl);
  const anchors = extractAnchors(html, searchUrl);
  const pdfAnchors = anchors.filter((a) => isLikelyPdfUrl(a.href));
  const pageAnchors = anchors.filter((a) => /\/cgibin\/piece-info\.cgi\?id=/i.test(a.href));

  const items = [];
  for (const a of pdfAnchors.slice(0, limit)) {
    items.push(result({
      source: 'mutopia',
      sourceLabel: 'Mutopia Project',
      title: a.text || `Mutopia PDF: ${query}`,
      subtitle: 'LilyPond 排版 / PDF / MIDI / 源文件',
      description: 'Mutopia 的作品通常提供 PDF、MIDI、LilyPond 源文件等。',
      type: 'direct-pdf',
      pageUrl: searchUrl,
      downloadUrl: a.href,
      downloadLabel: '直接下载 PDF',
      directPdf: true,
      license: '以 Mutopia 曲目页面 License 为准',
      confidence: 'medium',
    }));
  }
  for (const a of pageAnchors.slice(0, Math.max(0, limit - items.length))) {
    const pdf = await tryFindDirectPdfFromPage(a.href, a.text);
    items.push(result({
      source: 'mutopia',
      sourceLabel: 'Mutopia Project',
      title: a.text || `Mutopia: ${query}`,
      subtitle: '曲目页面',
      description: '打开后可下载 PDF / MIDI / LilyPond 等格式。',
      type: pdf ? 'direct-pdf' : 'score-page',
      pageUrl: a.href,
      downloadUrl: pdf || a.href,
      downloadLabel: pdf ? '直接下载 PDF' : '前往原站下载',
      directPdf: Boolean(pdf),
      fallbackReason: pdf ? '' : '未在 Mutopia 曲目页解析到 PDF 直链，需要进入曲目页选择格式。',
      license: '以 Mutopia 曲目页面 License 为准',
      confidence: pdf ? 'high' : 'medium',
    }));
  }
  if (!items.length) {
    return [fallbackResult('mutopia', 'Mutopia Project', query, searchUrl, '没有抓取到稳定结构的结果，可点击进入 Mutopia 官方检索页。')];
  }
  return uniqueByUrl(items).slice(0, limit);
}

async function searchArtSongCentral(query, limit) {
  const searchUrl = `https://artsongcentral.com/?s=${encodeURIComponent(query)}`;
  const html = await fetchHtml(searchUrl);
  const anchors = extractAnchors(html, searchUrl)
    .filter((a) => a.href.includes('artsongcentral.com') && !/\.(jpg|png|gif|webp|css|js)$/i.test(a.href));

  const candidates = [];
  const seen = new Set();
  for (const a of anchors) {
    if (seen.has(a.href)) continue;
    if (/\?s=/.test(a.href) || /#/.test(a.href)) continue;
    seen.add(a.href);
    if (a.text.length > 2 && a.text.length < 160) candidates.push(a);
    if (candidates.length >= Math.min(limit, 6)) break;
  }

  const enriched = await Promise.all(candidates.map(async (a) => {
    let pdf = null;
    let desc = 'Art Song Central 页面通常会提供可打印的公版艺术歌曲 PDF 或相关下载入口。';
    try {
      const page = await fetchHtml(a.href);
      const pageAnchors = extractAnchors(page, a.href);
      pdf = pickPdfFromAnchors(pageAnchors, a.text);
      const meta = page.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)/i);
      if (meta?.[1]) desc = meta[1];
    } catch {}
    return result({
      source: 'artsong',
      sourceLabel: 'Art Song Central',
      title: a.text,
      subtitle: '艺术歌曲 / 免费可打印谱',
      description: desc,
      type: pdf ? 'direct-pdf' : 'art-song',
      pageUrl: a.href,
      downloadUrl: pdf || a.href,
      downloadLabel: pdf ? '直接下载 PDF' : '前往原站下载',
      directPdf: Boolean(pdf),
      fallbackReason: pdf ? '' : '未在 Art Song Central 条目中解析到 PDF 直链，需进入页面下载。',
      license: '以 Art Song Central 页面说明为准',
      confidence: pdf ? 'high' : 'medium',
    });
  }));

  if (!enriched.length) {
    return [fallbackResult('artsong', 'Art Song Central', query, searchUrl, '未抓取到条目，但可进入官方站内搜索继续查看。', 'art-song')];
  }
  return uniqueByUrl(enriched).slice(0, limit);
}

async function searchTheOperaDatabase(query, limit) {
  const searchUrl = `https://theoperadatabase.com/arias.php`;
  return [fallbackResult(
    'theoperadb',
    'The Opera Database',
    query,
    searchUrl,
    '该站提供大量咏叹调 PDF，但没有稳定公开 JSON 检索接口；点击后在 Search Key 输入同一关键词，可下载其公版 PDF。',
    'aria-pdf'
  )];
}

async function searchOperaArias(query, limit) {
  const searchUrl = `https://www.opera-arias.com/search/?search=${encodeURIComponent(query)}`;
  return [fallbackResult(
    'operaarias',
    'Opera-Arias.com',
    query,
    searchUrl,
    '适合查声部、角色、语种、唱词、剧情和咏叹调资料；页面通常会给出外部乐谱检索入口。',
    'aria-info'
  )];
}

async function searchLiederNet(query, limit) {
  const searchUrl = `https://www.lieder.net/lieder/extended.html?Title=${encodeURIComponent(query)}&Composer=&Poet=&Language=&Opus=&TOn=&Sort1=Composer&Sort2=Title&Sort3=Poet`;
  return [fallbackResult(
    'liedernet',
    'LiederNet Archive',
    query,
    searchUrl,
    '适合查艺术歌曲歌词、译文、诗人和作曲家索引；它不是乐谱站，但对多语言声乐学习很有用。',
    'lyrics'
  )];
}

async function searchOpenScoreLieder(query, limit) {
  const searchUrl = `https://musescore.com/openscore-lieder/sheetmusic?text=${encodeURIComponent(query)}`;
  return [fallbackResult(
    'openscore',
    'OpenScore Lieder',
    query,
    searchUrl,
    '适合查德奥艺术歌曲的现代排版版本；下载权限和格式以页面显示为准。',
    'art-song'
  )];
}

const CONNECTORS = {
  imslp: { label: 'IMSLP', fn: searchIMSLP },
  cpdl: { label: 'CPDL / ChoralWiki', fn: searchCPDL },
  loc: { label: 'Library of Congress', fn: searchLOC },
  archive: { label: 'Internet Archive', fn: searchInternetArchive },
  mutopia: { label: 'Mutopia Project', fn: searchMutopia },
  artsong: { label: 'Art Song Central', fn: searchArtSongCentral },
  theoperadb: { label: 'The Opera Database', fn: searchTheOperaDatabase },
  operaarias: { label: 'Opera-Arias.com', fn: searchOperaArias },
  liedernet: { label: 'LiederNet Archive', fn: searchLiederNet },
  openscore: { label: 'OpenScore Lieder', fn: searchOpenScoreLieder },
};

async function handleSearch(req, res, urlObj) {
  const query = (urlObj.searchParams.get('q') || urlObj.searchParams.get('query') || '').trim();
  if (!query) {
    return sendJson(res, 400, { error: '请输入检索关键词，例如 Nessun dorma、Schubert Gretchen、Fauré Après un rêve。' });
  }
  const limit = clampLimit(urlObj.searchParams.get('limit'));
  const selected = (urlObj.searchParams.get('sources') || Object.keys(CONNECTORS).join(','))
    .split(',')
    .map((s) => s.trim())
    .filter((s) => CONNECTORS[s]);

  const startedAt = Date.now();
  const jobs = selected.map(async (sourceKey) => {
    const connector = CONNECTORS[sourceKey];
    try {
      const results = await connector.fn(query, limit);
      return { source: sourceKey, sourceLabel: connector.label, ok: true, count: results.length, results };
    } catch (error) {
      return {
        source: sourceKey,
        sourceLabel: connector.label,
        ok: false,
        count: 0,
        error: error.message || String(error),
        results: [],
      };
    }
  });

  const settled = await Promise.all(jobs);
  const results = settled.flatMap((s) => s.results || []);
  sendJson(res, 200, {
    query,
    limit,
    elapsedMs: Date.now() - startedAt,
    sources: settled.map(({ results, ...rest }) => rest),
    results,
  });
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
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
    };
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      return res.end();
    }
    if (urlObj.pathname === '/api/search') return handleSearch(req, res, urlObj);
    if (urlObj.pathname === '/api/sources') {
      return sendJson(res, 200, Object.entries(CONNECTORS).map(([id, value]) => ({ id, label: value.label })));
    }
    return serveStatic(req, res, urlObj);
  } catch (error) {
    return sendJson(res, 500, { error: error.message || String(error) });
  }
});

server.listen(PORT, () => {
  console.log(`Bel Canto Free Score Search running at http://localhost:${PORT}`);
});
