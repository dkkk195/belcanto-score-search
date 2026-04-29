const SOURCES = [
  { id: 'imslp', label: 'IMSLP', hint: '最大公版谱库' },
  { id: 'cpdl', label: 'CPDL', hint: '合唱/宗教' },
  { id: 'loc', label: 'LoC', hint: '馆藏扫描' },
  { id: 'archive', label: 'Internet Archive', hint: '老谱/教材' },
  { id: 'mutopia', label: 'Mutopia', hint: 'PDF/MIDI' },
  { id: 'artsong', label: 'Art Song Central', hint: '艺术歌曲' },
  { id: 'theoperadb', label: 'Opera Database', hint: '咏叹调PDF' },
  { id: 'operaarias', label: 'Opera-Arias', hint: '角色/声部' },
  { id: 'liedernet', label: 'LiederNet', hint: '歌词/翻译' },
  { id: 'openscore', label: 'OpenScore Lieder', hint: '德奥 Lied' },
];

const QUICK = [
  'Nessun dorma Puccini',
  'Voi che sapete Mozart',
  'Gretchen am Spinnrade Schubert',
  'Après un rêve Fauré',
  'Lascia ch\'io pianga Handel',
  'Caro mio ben Giordani',
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
};

const state = {
  results: [],
  filter: 'all',
  sort: 'smart',
  lastQuery: '',
};

const el = {
  form: document.querySelector('#searchForm'),
  input: document.querySelector('#queryInput'),
  sourceGrid: document.querySelector('#sourceGrid'),
  toggleAll: document.querySelector('#toggleAll'),
  quickTags: document.querySelector('#quickTags'),
  statusPanel: document.querySelector('#statusPanel'),
  statusText: document.querySelector('#statusText'),
  sourceStatus: document.querySelector('#sourceStatus'),
  resultsGrid: document.querySelector('#resultsGrid'),
  resultsSummary: document.querySelector('#resultsSummary'),
  emptyState: document.querySelector('#emptyState'),
  serverNotice: document.querySelector('#serverNotice'),
  sortSelect: document.querySelector('#sortSelect'),
  template: document.querySelector('#resultTemplate'),
};

function init() {
  renderSources();
  renderQuickTags();
  bindEvents();
  checkServerHint();
}

function renderSources() {
  el.sourceGrid.innerHTML = SOURCES.map((s) => `
    <label class="source-chip" title="${s.hint}">
      <input type="checkbox" value="${s.id}" checked />
      <span><strong>${s.label}</strong><br><small>${s.hint}</small></span>
    </label>
  `).join('');
}

function renderQuickTags() {
  el.quickTags.innerHTML = QUICK.map((q) => `<button type="button" data-q="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join('');
}

function bindEvents() {
  el.form.addEventListener('submit', (event) => {
    event.preventDefault();
    runSearch(el.input.value.trim());
  });

  el.toggleAll.addEventListener('click', () => {
    const boxes = [...el.sourceGrid.querySelectorAll('input[type="checkbox"]')];
    const shouldCheck = boxes.some((box) => !box.checked);
    boxes.forEach((box) => box.checked = shouldCheck);
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

async function checkServerHint() {
  if (location.protocol === 'file:') {
    el.serverNotice.hidden = false;
    return;
  }
  try {
    const res = await fetch('/api/sources', { cache: 'no-store' });
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
  el.serverNotice.hidden = true;
  setLoading(true, query);

  const sources = getSelectedSources();
  if (!sources.length) {
    setLoading(false);
    showStatus('请至少选择一个来源。', []);
    return;
  }

  try {
    const params = new URLSearchParams({ q: query, sources: sources.join(','), limit: '8' });
    const res = await fetch(`/api/search?${params.toString()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    state.results = Array.isArray(data.results) ? data.results : [];
    showStatus(`完成：${state.results.length} 条结果，用时 ${data.elapsedMs || 0} ms`, data.sources || []);
    renderResults();
  } catch (error) {
    state.results = [];
    renderResults();
    el.serverNotice.hidden = false;
    showStatus('检索失败：请确认 npm start 已启动，且网络可访问外部谱库。', []);
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
    el.resultsGrid.innerHTML = Array.from({ length: 4 }).map(() => '<div class="loading-card"></div>').join('');
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
  if (state.filter === 'all') return true;
  if (state.filter === 'pdf') return item.directPdf;
  if (state.filter === 'aria') return /aria|opera/i.test(`${item.type} ${item.source} ${item.sourceLabel}`);
  if (state.filter === 'lyrics') return /lyrics|liedernet/i.test(`${item.type} ${item.source}`);
  if (state.filter === 'choral') return /choral|cpdl|religious/i.test(`${item.type} ${item.source}`);
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
  return arr.sort((a, b) => scoreResult(b) - scoreResult(a));
}

function scoreResult(item) {
  let score = 0;
  if (item.directPdf) score += 6;
  if (item.confidence === 'high') score += 3;
  if (item.source === 'imslp') score += 2;
  if (item.source === 'cpdl') score += 2;
  if (item.source === 'archive') score += 2;
  if (item.confidence === 'fallback') score -= 3;
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
  const sourceCount = new Set(state.results.map((r) => r.source)).size;
  el.resultsSummary.hidden = false;
  el.resultsSummary.innerHTML = `
    <strong>“${escapeHtml(state.lastQuery)}”</strong> 共汇总 <strong>${state.results.length}</strong> 条结果，覆盖 <strong>${sourceCount}</strong> 个来源，其中 <strong>${pdfCount}</strong> 条已在本页面抓取到 PDF 直链。
    <span>只有无法取得稳定 PDF 直链、需要选择版本或确认版权时，才跳转到原站下载。</span>
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
    ['下载方式', item.directPdf ? '本页直接下载 PDF' : '前往原站下载'],
    ['类型', TYPE_LABELS[item.type] || item.type || '资源'],
    ['来源', item.sourceLabel || item.source],
    item.composer ? ['作曲/作者', item.composer] : null,
    item.language ? ['语言', item.language] : null,
    item.voice ? ['声部', item.voice] : null,
    item.fallbackReason ? ['跳转原因', item.fallbackReason] : null,
  ].filter(Boolean);

  meta.innerHTML = metaRows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('');

  download.href = item.downloadUrl || item.pageUrl;
  download.textContent = item.downloadLabel || (item.directPdf ? '直接下载 PDF' : '前往原站下载');
  download.classList.toggle('source-download', !item.directPdf);
  if (item.directPdf) card.classList.add('has-pdf');
  else card.classList.add('needs-source');

  open.href = item.pageUrl || item.downloadUrl;
  open.textContent = item.directPdf ? '查看来源页' : '来源/下载页';
  copy.addEventListener('click', async () => {
    const text = item.directPdf ? (item.downloadUrl || '') : (item.pageUrl || item.downloadUrl || '');
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

init();
