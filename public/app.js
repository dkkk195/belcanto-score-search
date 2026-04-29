const DEFAULT_SOURCES = [
  { id: 'imslp', label: 'IMSLP', hint: '最大公版谱库', group: 'core', category: '公版乐谱' },
  { id: 'cpdl', label: 'CPDL / ChoralWiki', hint: '合唱/宗教声乐', group: 'core', category: '合唱' },
  { id: 'loc', label: 'Library of Congress', hint: '美国国会图书馆馆藏', group: 'core', category: '馆藏' },
  { id: 'archive', label: 'Internet Archive', hint: '老谱/教材/咏叹调集', group: 'core', category: '老谱扫描' },
  { id: 'mutopia', label: 'Mutopia Project', hint: 'PDF/MIDI/LilyPond', group: 'core', category: '开放排版' },
  { id: 'musopen', label: 'Musopen', hint: '公版乐谱/录音', group: 'core', category: '公版乐谱' },
  { id: 'gallica', label: 'Gallica BnF', hint: '法国馆藏扫描谱', group: 'core', category: '法语/馆藏' },
  { id: 'artsong', label: 'Art Song Central', hint: '艺术歌曲', group: 'core', category: '艺术歌曲' },
  { id: 'theoperadb', label: 'The Opera Database', hint: '咏叹调PDF入口', group: 'core', category: '歌剧咏叹调' },
  { id: 'operaarias', label: 'Opera-Arias.com', hint: '角色/声部资料', group: 'extended', category: '歌剧资料' },
  { id: 'liedernet', label: 'LiederNet Archive', hint: '歌词/译文', group: 'extended', category: '歌词译文' },
  { id: 'openscore', label: 'OpenScore Lieder', hint: '德奥Lied排版', group: 'extended', category: 'Lied' },
  { id: 'rism', label: 'RISM Online', hint: '手稿/印本目录', group: 'extended', category: '手稿目录' },
  { id: 'mdz', label: 'MDZ / BSB', hint: '巴伐利亚馆藏', group: 'extended', category: '馆藏' },
  { id: 'europeana', label: 'Europeana', hint: '欧洲文化遗产', group: 'extended', category: '欧洲馆藏' },
  { id: 'hathi', label: 'HathiTrust', hint: '公版图书/声乐集', group: 'extended', category: '图书馆馆藏' },
  { id: 'freescores', label: 'Free-scores.com', hint: '免费/混合许可', group: 'extended', category: '混合来源' },
  { id: 'eightnotes', label: '8notes', hint: '免费曲谱/教学资源', group: 'extended', category: '教学曲谱' },
];

const QUICK = [
  'Nessun dorma Puccini',
  'Voi che sapete Mozart',
  'Gretchen am Spinnrade Schubert',
  'Après un rêve Fauré',
  "Lascia ch'io pianga Handel",
  'Caro mio ben Giordani',
  '今夜无人入睡',
  '德语艺术歌曲 女高音'
];

const TYPE_LABELS = {
  'score-page': '乐谱页',
  'choral-score': '合唱谱',
  'library-score': '馆藏谱',
  'archive-score': '老谱扫描',
  'direct-pdf': 'PDF 直链',
  'art-song': '艺术歌曲',
  'aria-pdf': '咏叹调PDF',
  'aria-info': '咏叹调资料',
  lyrics: '歌词/译文',
  search: '检索入口',
  catalog: '目录索引',
  score: '乐谱资源'
};

const state = {
  sources: DEFAULT_SOURCES,
  results: [],
  filter: 'all',
  sort: 'smart',
  lastQuery: '',
  lastVariants: [],
  mode: 'core',
};

const el = {
  form: document.querySelector('#searchForm'),
  input: document.querySelector('#queryInput'),
  sourceGrid: document.querySelector('#sourceGrid'),
  toggleAll: document.querySelector('#toggleAll'),
  coreBtn: document.querySelector('#coreSources'),
  allBtn: document.querySelector('#allSources'),
  quickTags: document.querySelector('#quickTags'),
  statusPanel: document.querySelector('#statusPanel'),
  statusText: document.querySelector('#statusText'),
  sourceStatus: document.querySelector('#sourceStatus'),
  resultsGrid: document.querySelector('#resultsGrid'),
  resultsSummary: document.querySelector('#resultsSummary'),
  emptyState: document.querySelector('#emptyState'),
  serverNotice: document.querySelector('#serverNotice'),
  sortSelect: document.querySelector('#sortSelect'),
  limitSelect: document.querySelector('#limitSelect'),
  template: document.querySelector('#resultTemplate'),
};

async function init() {
  renderQuickTags();
  bindEvents();
  await loadSources();
  renderSources();
  prepareResponsiveUi();
  checkServerHint();
}

async function loadSources() {
  try {
    const res = await fetch('/api/sources', { cache: 'no-store' });
    if (!res.ok) throw new Error('sources unavailable');
    const data = await res.json();
    if (Array.isArray(data) && data.length) state.sources = data;
  } catch {
    state.sources = DEFAULT_SOURCES;
  }
}

function renderSources() {
  const core = state.sources.filter((s) => s.group === 'core');
  const extended = state.sources.filter((s) => s.group !== 'core');
  el.sourceGrid.innerHTML = `
    <div class="source-section-title">核心快搜</div>
    ${core.map(sourceChip).join('')}
    <div class="source-section-title extended-title">扩展深搜</div>
    ${extended.map(sourceChip).join('')}
  `;
}

function sourceChip(s) {
  const checked = state.mode === 'all' || s.group === 'core';
  return `
    <label class="source-chip ${s.group === 'core' ? 'core' : 'extended'}" title="${escapeHtml(s.hint || '')}">
      <input type="checkbox" value="${escapeHtml(s.id)}" ${checked ? 'checked' : ''} />
      <span><strong>${escapeHtml(s.label)}</strong><br><small>${escapeHtml(s.category || s.hint || '')}</small></span>
    </label>
  `;
}

function renderQuickTags() {
  el.quickTags.innerHTML = QUICK.map((q) => `<button type="button" data-q="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join('');
}

function bindEvents() {
  el.form.addEventListener('submit', (event) => {
    event.preventDefault();
    runSearch(el.input.value.trim());
  });

  el.toggleAll.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const boxes = [...el.sourceGrid.querySelectorAll('input[type="checkbox"]')];
    const shouldCheck = boxes.some((box) => !box.checked);
    boxes.forEach((box) => box.checked = shouldCheck);
  });

  el.coreBtn?.addEventListener('click', () => {
    state.mode = 'core';
    renderSources();
    updateModeButtons();
  });

  el.allBtn?.addEventListener('click', () => {
    state.mode = 'all';
    renderSources();
    updateModeButtons();
  });

  document.body.addEventListener('click', (event) => {
    const suggestion = event.target.closest('[data-q]');
    if (!suggestion) return;
    const q = suggestion.dataset.q;
    el.input.value = q;
    runSearch(q);
  });

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      state.filter = tab.dataset.filter;
      renderResults();
    });
  });

  el.sortSelect.addEventListener('change', () => {
    state.sort = el.sortSelect.value;
    renderResults();
  });
}

function prepareResponsiveUi() {
  const filters = document.querySelector('.filters');
  if (filters && window.matchMedia('(max-width: 680px)').matches) {
    filters.removeAttribute('open');
  }
  document.documentElement.classList.toggle('is-touch', matchMedia('(pointer: coarse)').matches);
}

function updateModeButtons() {
  el.coreBtn?.classList.toggle('active-mode', state.mode === 'core');
  el.allBtn?.classList.toggle('active-mode', state.mode === 'all');
}

async function checkServerHint() {
  if (location.protocol === 'file:') {
    el.serverNotice.hidden = false;
    return;
  }
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    if (!res.ok) throw new Error('api unavailable');
  } catch {
    el.serverNotice.hidden = false;
  }
}

function getSelectedSources() {
  return [...el.sourceGrid.querySelectorAll('input[type="checkbox"]:checked')].map((box) => box.value);
}

async function runSearch(query) {
  if (!query) {
    el.input.focus();
    return;
  }
  state.lastQuery = query;
  state.lastVariants = [];
  el.serverNotice.hidden = true;
  setLoading(true, query);
  if (window.matchMedia('(max-width: 680px)').matches) {
    requestAnimationFrame(() => el.statusPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  const sources = getSelectedSources();
  if (!sources.length) {
    setLoading(false);
    showStatus('请至少选择一个来源。', []);
    return;
  }

  try {
    const limit = el.limitSelect?.value || '6';
    const params = new URLSearchParams({ q: query, sources: sources.join(','), limit });
    const res = await fetch(`/api/search?${params.toString()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    state.results = Array.isArray(data.results) ? data.results : [];
    state.lastVariants = Array.isArray(data.variants) ? data.variants : [];
    const cacheText = data.cached ? `，缓存命中 ${Math.round((data.cacheAgeMs || 0) / 1000)}s` : '';
    showStatus(`完成：${state.results.length} 条结果，用时 ${data.elapsedMs || 0} ms${cacheText}`, data.sources || []);
    renderResults();
  } catch (error) {
    state.results = [];
    renderResults();
    el.serverNotice.hidden = false;
    showStatus('检索失败：请确认网站后端正在运行，且外部谱库可访问。', []);
    console.error(error);
  } finally {
    setLoading(false);
  }
}

function setLoading(isLoading, query = '') {
  el.statusPanel.hidden = false;
  if (isLoading) {
    el.emptyState.hidden = true;
    el.resultsSummary.hidden = true;
    el.statusText.textContent = `正在同时检索：${query}`;
    el.sourceStatus.innerHTML = '';
    el.resultsGrid.innerHTML = Array.from({ length: 6 }).map(() => '<div class="loading-card"></div>').join('');
  }
}

function showStatus(text, sources) {
  el.statusPanel.hidden = false;
  el.statusText.textContent = text;
  el.sourceStatus.innerHTML = sources.map((s) => `
    <span class="source-state ${s.ok ? 'ok' : 'fail'}" title="${escapeHtml(s.error || '')}">
      ${escapeHtml(s.sourceLabel)} · ${s.ok ? s.count : '失败'}
    </span>
  `).join('');
}

function passesFilter(item) {
  const hay = `${item.type} ${item.source} ${item.sourceLabel} ${item.title}`.toLowerCase();
  if (state.filter === 'all') return true;
  if (state.filter === 'pdf') return item.directPdf;
  if (state.filter === 'source') return !item.directPdf;
  if (state.filter === 'aria') return /aria|opera|咏叹|歌剧/.test(hay);
  if (state.filter === 'lyrics') return /lyrics|liedernet|lieder|译文|歌词/.test(hay);
  if (state.filter === 'choral') return /choral|cpdl|religious|合唱|宗教/.test(hay);
  if (state.filter === 'paid') return item.paidRisk || /musescore|8notes|free-scores/.test(hay);
  return true;
}

function sorted(items) {
  const arr = [...items];
  if (state.sort === 'pdf') {
    return arr.sort((a, b) => Number(b.directPdf) - Number(a.directPdf) || a.sourceLabel.localeCompare(b.sourceLabel));
  }
  if (state.sort === 'source') {
    return arr.sort((a, b) => a.sourceLabel.localeCompare(b.sourceLabel) || a.title.localeCompare(b.title));
  }
  if (state.sort === 'title') {
    return arr.sort((a, b) => a.title.localeCompare(b.title));
  }
  return arr.sort((a, b) => scoreResult(b) - scoreResult(a));
}

function scoreResult(item) {
  let score = 0;
  if (item.downloadMode === 'proxy') score += 8;
  else if (item.directPdf) score += 6;
  if (item.confidence === 'high') score += 3;
  if (['imslp', 'cpdl', 'archive', 'loc', 'gallica', 'mutopia'].includes(item.source)) score += 2;
  if (item.confidence === 'fallback') score -= 3;
  if (item.paidRisk) score -= 2;
  return score;
}

function renderResults() {
  const items = sorted(state.results.filter(passesFilter));
  el.resultsGrid.innerHTML = '';

  if (!state.results.length) {
    el.resultsSummary.hidden = true;
    el.emptyState.hidden = false;
    el.emptyState.querySelector('h2').textContent = state.lastQuery ? '没有抓取到结果' : '先输入一个声乐关键词';
    return;
  }

  el.emptyState.hidden = true;
  const pdfCount = state.results.filter((r) => r.directPdf).length;
  const proxyCount = state.results.filter((r) => r.downloadMode === 'proxy').length;
  const sourceCount = new Set(state.results.map((r) => r.source)).size;
  const variants = state.lastVariants.length > 1 ? `<div class="variants">自动扩展检索词：${state.lastVariants.map(escapeHtml).join(' · ')}</div>` : '';
  el.resultsSummary.hidden = false;
  el.resultsSummary.innerHTML = `
    <strong>“${escapeHtml(state.lastQuery)}”</strong> 共汇总 <strong>${state.results.length}</strong> 条结果，覆盖 <strong>${sourceCount}</strong> 个来源，其中 <strong>${pdfCount}</strong> 条抓取到 PDF，<strong>${proxyCount}</strong> 条可通过本页代理下载。
    <span>不能稳定直连、需要选版本/确认版权/付费授权时，只提示去原站，不做破解。</span>
    ${variants}
  `;

  if (!items.length) {
    el.resultsGrid.innerHTML = `<section class="empty-state"><h2>当前筛选下没有结果</h2><p>可以切回“全部结果”查看来源页入口。</p></section>`;
    return;
  }

  const frag = document.createDocumentFragment();
  items.forEach((item) => frag.appendChild(createResultCard(item)));
  el.resultsGrid.appendChild(frag);
}

function createResultCard(item) {
  const node = el.template.content.cloneNode(true);
  const card = node.querySelector('.result-card');
  const source = node.querySelector('.source-pill');
  const type = node.querySelector('.type-pill');
  const title = node.querySelector('h3');
  const subtitle = node.querySelector('.subtitle');
  const desc = node.querySelector('.description');
  const meta = node.querySelector('.meta-list');
  const download = node.querySelector('.download-btn');
  const open = node.querySelector('.open-btn');
  const copy = node.querySelector('.copy-btn');
  const license = node.querySelector('.license-line');

  source.textContent = item.sourceLabel || item.source;
  type.textContent = TYPE_LABELS[item.type] || item.type || '资源';
  title.textContent = item.title || 'Untitled';
  subtitle.textContent = item.subtitle || (item.composer ? item.composer : '');
  desc.textContent = item.description || '该结果来自公开谱库页面。';

  const metaRows = [
    ['下载方式', downloadModeLabel(item)],
    ['类型', TYPE_LABELS[item.type] || item.type || '资源'],
    ['来源', item.sourceLabel || item.source],
    item.composer ? ['作曲/作者', item.composer] : null,
    item.language ? ['语言', item.language] : null,
    item.voice ? ['声部', item.voice] : null,
    item.fallbackReason ? ['提示', item.fallbackReason] : null,
    item.paidRisk ? ['付费/会员风险', item.legalHint || '如页面要求付费/会员权限，请合法购买或改用公版来源。'] : null,
  ].filter(Boolean);

  meta.innerHTML = metaRows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('');

  download.href = item.downloadUrl || item.pageUrl;
  download.textContent = item.downloadLabel || (item.directPdf ? '下载 PDF' : '前往原站下载');
  download.classList.toggle('source-download', !item.directPdf);
  download.classList.toggle('proxy-download', item.downloadMode === 'proxy');
  if (item.directPdf) card.classList.add('has-pdf');
  else card.classList.add('needs-source');
  if (item.paidRisk) card.classList.add('paid-risk');

  open.href = item.pageUrl || item.rawDownloadUrl || item.downloadUrl;
  open.textContent = item.directPdf ? '查看来源页' : '来源/下载页';
  copy.addEventListener('click', async () => {
    const text = item.directPdf ? (item.rawDownloadUrl || item.downloadUrl || '') : (item.pageUrl || item.downloadUrl || '');
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = '已复制';
      copy.classList.add('copied');
      setTimeout(() => {
        copy.textContent = '复制链接';
        copy.classList.remove('copied');
      }, 1300);
    } catch {
      prompt('复制这个链接：', text);
    }
  });

  license.textContent = `版权/使用：${item.license || '请以来源站点说明为准'}`;
  return node;
}

function downloadModeLabel(item) {
  if (item.downloadMode === 'proxy') return '本页代理下载公开 PDF';
  if (item.directPdf) return '直接打开公开 PDF';
  return '前往原站下载 / 选择版本 / 确认版权';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

init();
