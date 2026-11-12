/* Збирає HTML-сторінки статей і списки статей двома мовами:
     articles/*.md     → articles/*.html     і articles.html     (українська)
     articles/en/*.md  → articles/en/*.html  і articles-en.html  (англійська)
   Шапку, підвал і піктограми бере з index.html, англійські підписи — з assets/js/content.en.js.
   Запуск із кореня сайту:  node tools/build-articles.js
   Після зміни .md-файлу, шапки в index.html чи словників запустіть скрипт ще раз. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'Software and Computer Museum';
const NOTE_ICONS = ['ic-alert', 'ic-monitor', 'ic-clock', 'ic-person', 'ic-book'];

/* ---------- Мови ---------- */

const LOCALES = {
  uk: {
    dir: 'articles',            // де лежать .md і куди пишуться .html статей
    list: 'articles.html',      // сторінка зі списком
    // Блоки, які на сторінці стають окремими «вікнами» (у тому ж порядку, що й NOTE_ICONS)
    notes: ['Цікавий факт', 'Місток до сьогодення', 'Місток до спогадів', 'Поговоріть удома', 'Для уроку'],
    sources: 'Джерела',
    file: 'СТАТТЯ',
    allArticles: 'Усі статті',
    otherArticles: 'Інші статті',
    read: 'Читати',
    readLabel: t => `Читати статтю «${t}»`,
    listTitle: 'Статті',
    listPrompt: 'C:\\MUSEUM&gt; dir /статті',
    listLead: "Історії про перші комп'ютери України: хто їх створював, як вони працювали і як відрізнити факт від легенди. Читайте по черзі — кожна наступна стаття спирається на попередню.",
    listDescription: "Статті про перші комп'ютери України для школярів, батьків і дорослих.",
    listPageTitle: 'Статті',
  },
  en: {
    dir: 'articles/en',
    list: 'articles-en.html',
    notes: ['Fun fact', 'Bridge to today', 'Bridge to memories', 'Talk about it at home', 'For the classroom'],
    sources: 'Sources',
    file: 'ARTICLE',
    allArticles: 'All articles',
    otherArticles: 'Other articles',
    read: 'Read',
    readLabel: t => `Read the article “${t}”`,
    listTitle: 'Articles',
    listPrompt: 'C:\\MUSEUM&gt; dir /articles',
    listLead: "Stories about Ukraine's first computers: who built them, how they worked and how to tell fact from legend. Read them in order — each article builds on the one before.",
    listDescription: "Articles about Ukraine's first computers for schoolchildren, parents and adults.",
    listPageTitle: 'Articles',
  },
};

// Англійський словник сайту — той самий, що використовує перемикач мови
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'assets/js/content.en.js'), 'utf8'), sandbox);
const DICT = { en: sandbox.window.SCM_CONTENT.en };

/* ---------- Шматки з index.html ---------- */

const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
function cut(re, what) {
  const m = index.match(re);
  if (!m) throw new Error('У index.html не знайдено: ' + what);
  return m[0];
}
const SPRITE = cut(/<svg width="0"[\s\S]*?<\/svg>/, 'спрайт піктограм');
const HEADER = cut(/<header class="hdr">[\s\S]*?<\/header>/, 'шапку');
const FOOTER = cut(/<footer class="ftr"[\s\S]*?<\/footer>/, 'підвал');

// Підставляє тексти потрібної мови в елементи з data-i18n / data-i18n-attr
function translate(html, lang) {
  const dict = DICT[lang];
  if (!dict) return html;
  return html
    .replace(/(data-i18n="(k\d+)"[^>]*>)([^<]*)</g, (m, open, key, text) => dict[key] !== undefined ? `${open}${esc(dict[key])}<` : m)
    .replace(/data-i18n-attr="aria-label:(k\d+)" aria-label="[^"]*"/g, (m, key) => dict[key] !== undefined ? `data-i18n-attr="aria-label:${key}" aria-label="${esc(dict[key])}"` : m);
}

// Шапка й підвал для сторінки статті: посилання переписуються з урахуванням папки й мови
function chrome(html, base, lang) {
  const home = lang === 'en' ? `${base}index.html?lang=en` : `${base}index.html`;
  return translate(html, lang)
    .replace(/href="#top"/g, `href="${home}"`)
    .replace(/href="#([\w-]+)"/g, (m, id) => /^ic-/.test(id) ? m : `href="${home}#${id}"`)
    .replace(/href="articles\.html"([^>]*?) data-href-uk="articles\.html" data-href-en="articles-en\.html"/g,
      (m, rest) => `href="${base}${LOCALES[lang].list}"${rest} data-href-uk="${base}articles.html" data-href-en="${base}articles-en.html"`)
    .replace(/(href="[^"]*articles(?:-en)?\.html") aria-current="false"/g, '$1 aria-current="page"')
    .replace(/ data-section="[\w-]+" aria-current="false"/g, '')
    .replace(/(data-lang="(uk|en)"[^>]*?aria-pressed=")(true|false)"/g, (m, open, l) => `${open}${l === lang}"`);
}

/* ---------- Простий перетворювач Markdown ---------- */

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function inline(s) {
  return esc(s)
    .replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>');
}
function plain(s) {
  return s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*?/g, '');
}

// Розбирає Markdown на блоки: h1, h2, p, quote, ul, ol, hr
function parse(md) {
  const blocks = [];
  let para = null;
  let list = null;
  const flush = () => { para = null; list = null; };
  for (const raw of md.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flush(); continue; }
    if ((m = line.match(/^(#{1,2}) (.*)$/))) { flush(); blocks.push({ t: m[1].length === 1 ? 'h1' : 'h2', text: m[2] }); continue; }
    if (/^---+$/.test(line)) { flush(); blocks.push({ t: 'hr' }); continue; }
    if ((m = line.match(/^> ?(.*)$/))) { flush(); blocks.push({ t: 'quote', text: m[1] }); continue; }
    if ((m = line.match(/^- (.*)$/)) || (m = line.match(/^\d+\. (.*)$/))) {
      const type = /^- /.test(line) ? 'ul' : 'ol';
      if (!list || list.t !== type) { para = null; list = { t: type, items: [] }; blocks.push(list); }
      list.items.push(m[1]);
      continue;
    }
    if (list && /^\s+/.test(raw)) { list.items[list.items.length - 1] += ' ' + line.trim(); continue; }
    if (para) { para.text += ' ' + line.trim(); continue; }
    list = null;
    para = { t: 'p', text: line.trim() };
    blocks.push(para);
  }
  return blocks;
}

function render(b) {
  if (b.t === 'p') return `<p>${inline(b.text)}</p>`;
  if (b.t === 'ul' || b.t === 'ol') return `<${b.t}>\n${b.items.map(i => `  <li>${inline(i)}</li>`).join('\n')}\n</${b.t}>`;
  if (b.t === 'h2') return `<h2>${inline(b.text)}</h2>`;
  return '';
}

/* ---------- Стаття ---------- */

function readArticle(lang, file) {
  const blocks = parse(fs.readFileSync(path.join(ROOT, LOCALES[lang].dir, file), 'utf8'));
  const h1 = blocks.findIndex(b => b.t === 'h1');
  if (h1 < 0) throw new Error(`${LOCALES[lang].dir}/${file}: немає заголовка «# …»`);
  const quote = blocks.find(b => b.t === 'quote');
  const firstP = blocks.find((b, i) => i > h1 && b.t === 'p');
  return {
    lang, file, num: file.slice(0, 2), slug: file.replace(/\.md$/, ''),
    title: blocks[h1].text, quote,
    years: quote ? (plain(quote.text).match(/:\s*([^.]+)\./) || [])[1] || '' : '',
    excerpt: firstP ? firstP.text : '', blocks,
  };
}

// Ділить статтю на основний текст, «вікна»-блоки й джерела
function articleBody(a) {
  const L = LOCALES[a.lang];
  const main = [];
  const notes = [];
  let sources = null;
  let current = { kind: 'main' };
  for (const b of a.blocks) {
    if (b.t === 'h1' || b.t === 'quote' || b.t === 'hr') continue;
    if (b.t === 'h2') {
      const n = L.notes.indexOf(b.text);
      if (n >= 0) { current = { kind: 'note', title: b.text, icon: NOTE_ICONS[n], blocks: [] }; notes.push(current); continue; }
      if (b.text === L.sources) { current = sources = { kind: 'sources', blocks: [] }; continue; }
      current = { kind: 'main' };
    }
    if (current.kind === 'main') main.push(b); else current.blocks.push(b);
  }
  const notesHtml = notes.map(n => {
    const file = n.title.toUpperCase().replace(/\s+/g, '_') + '.TXT';
    return `      <aside class="win note" aria-label="${esc(n.title)}">
        <div class="wtitle" aria-hidden="true"><span>${esc(file)}</span><span class="wctl"><span></span><span></span><span></span></span></div>
        <div class="winbody">
          <h2 class="h4"><svg class="ic i-m" aria-hidden="true"><use href="#${n.icon}"/></svg>${esc(n.title)}</h2>
          ${n.blocks.map(render).join('\n          ')}
        </div>
      </aside>`;
  }).join('\n');
  return {
    main: main.map(render).join('\n        '),
    notes: notesHtml,
    sources: sources ? sources.blocks.map(render).join('\n        ') : '',
  };
}

/* ---------- Каркас сторінки ---------- */

function page({ lang, base, title, description, alternates, body }) {
  const alt = Object.entries(alternates).map(([l, href]) => `  <link rel="alternate" hreflang="${l}" href="${href}">`).join('\n');
  const skip = translate('<a class="skip" href="#main" data-i18n="k1">Перейти до основного вмісту</a>', lang);
  return `<!doctype html>
<html lang="${lang}" data-page-lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
${alt}
  <link rel="stylesheet" href="${base}assets/css/fonts.css">
  <link rel="stylesheet" href="${base}assets/css/tokens.css">
  <link rel="stylesheet" href="${base}assets/css/site.css">
</head>
<body id="top">
<!-- Згенеровано tools/build-articles.js — не редагуйте вручну, змінюйте .md-файли в articles/ -->

${SPRITE}

${skip}

${chrome(HEADER, base, lang)}

<main id="main">
${body}
</main>

${chrome(FOOTER, base, lang)}

<script src="${base}assets/js/content.uk.js"></script>
<script src="${base}assets/js/content.en.js"></script>
<script src="${base}assets/js/app.js"></script>
</body>
</html>
`;
}

const arrow = '<svg class="ic i-m" aria-hidden="true"><use href="#ic-arrow-right"/></svg>';

// Відносний шлях від сторінки статті / списку до сторінки іншою мовою
function articleHref(fromLang, toLang, slug) {
  if (fromLang === toLang) return `${slug}.html`;
  return toLang === 'en' ? `en/${slug}.html` : `../${slug}.html`;
}

function articlePage(a, prev, next, langsWithSlug) {
  const L = LOCALES[a.lang];
  const base = a.lang === 'en' ? '../../' : '../';
  const body = articleBody(a);
  const alternates = {};
  for (const l of langsWithSlug) alternates[l] = articleHref(a.lang, l, a.slug);
  const pager = [
    `      <nav class="pager" aria-label="${esc(L.otherArticles)}">`,
    prev ? `        <a class="btn btn-ghost prev" href="${prev.slug}.html">${arrow}<span>${inline(prev.title)}</span></a>` : '',
    next ? `        <a class="btn btn-ghost next" href="${next.slug}.html"><span>${inline(next.title)}</span>${arrow}</a>` : '',
    '      </nav>',
  ].filter(Boolean).join('\n');
  const html = `
<section class="art-head" data-theme="dark" aria-labelledby="art-title">
  <div class="wrap">
    <div class="sec-head">
      <a class="back" href="${base}${L.list}">${arrow}<span>${esc(L.allArticles)}</span></a>
      <p class="mono prompt" aria-hidden="true">C:\\MUSEUM&gt; type ${L.file}_${a.num}.TXT</p>
      <h1 id="art-title" class="disp h2">${inline(a.title)}</h1>
      ${a.quote ? `<p class="timeline">${inline(a.quote.text)}</p>` : ''}
    </div>
  </div>
</section>

<section class="sec">
  <div class="wrap">
    <div class="art">
      <article class="prose">
        ${body.main}
      </article>

      <div class="notes">
${body.notes}
      </div>

      <section class="sources" aria-labelledby="sources-title">
        <h2 id="sources-title" class="h4">${esc(L.sources)}</h2>
        ${body.sources}
      </section>

${pager}
    </div>
  </div>
</section>
`;
  return page({ lang: a.lang, base, title: `${plain(a.title)} — ${SITE}`, description: plain(a.excerpt), alternates, body: html });
}

function listPage(lang, articles) {
  const L = LOCALES[lang];
  const cards = articles.map(a => `      <article class="win card card-article">
        <div class="wtitle" aria-hidden="true"><span>${L.file}_${a.num}.TXT</span><span class="wctl"><span></span><span></span><span></span></span></div>
        <div class="winbody">
          <p class="year"><svg class="ic i-m" aria-hidden="true"><use href="#ic-calendar"/></svg>${esc(a.years)}</p>
          <h2 class="disp ct">${inline(a.title)}</h2>
          <p class="excerpt">${inline(a.excerpt)}</p>
          <a class="btn" href="${L.dir}/${a.slug}.html" aria-label="${esc(L.readLabel(plain(a.title)))}">${esc(L.read)}${arrow}</a>
        </div>
      </article>`).join('\n\n');
  const html = `
<section class="sec" aria-labelledby="articles-title">
  <div class="wrap">
    <div class="sec-head">
      <p class="mono prompt" aria-hidden="true">${L.listPrompt}</p>
      <h1 id="articles-title" class="disp h2">${esc(L.listTitle)}</h1>
      <p class="lead">${esc(L.listLead)}</p>
    </div>
    <div class="g3">

${cards}

    </div>
  </div>
</section>
`;
  const alternates = {};
  for (const l of Object.keys(LOCALES)) alternates[l] = LOCALES[l].list;
  return page({ lang, base: '', title: `${L.listPageTitle} — ${SITE}`, description: L.listDescription, alternates, body: html });
}

/* ---------- Запуск ---------- */

const byLang = {};
for (const lang of Object.keys(LOCALES)) {
  const dir = path.join(ROOT, LOCALES[lang].dir);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^\d\d-.+\.md$/.test(f)).sort() : [];
  byLang[lang] = files.map(f => readArticle(lang, f));
}
for (const lang of Object.keys(LOCALES)) {
  const list = byLang[lang];
  list.forEach((a, i) => {
    const langsWithSlug = Object.keys(LOCALES).filter(l => byLang[l].some(x => x.slug === a.slug));
    const out = path.join(ROOT, LOCALES[lang].dir, a.slug + '.html');
    fs.writeFileSync(out, articlePage(a, list[i - 1], list[i + 1], langsWithSlug));
    console.log(path.relative(ROOT, out).replace(/\\/g, '/'));
  });
  fs.writeFileSync(path.join(ROOT, LOCALES[lang].list), listPage(lang, list));
  console.log(LOCALES[lang].list);
}
// Стаття без перекладу: попередити, щоб не забути
const missing = byLang.uk.filter(a => !byLang.en.some(x => x.slug === a.slug)).map(a => a.slug);
if (missing.length) console.warn('Немає англійського перекладу: ' + missing.join(', '));
