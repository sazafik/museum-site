/* Поведінка сторінки: мова, меню для смартфона, поточний розділ і форма запису. */
(function () {
  var CONTENT = window.SCM_CONTENT || {};
  var LANG_KEY = 'scm-lang';
  var lang = 'uk';
  // Сторінки статей мають фіксовану мову: інша мова — це окрема сторінка (link rel="alternate")
  var pageLang = document.documentElement.getAttribute('data-page-lang');

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function t(key) { return (CONTENT[lang] || CONTENT.uk || {})[key]; }

  /* ---------- Мова ---------- */

  function readLang() {
    if (pageLang) return pageLang;
    var fromUrl = new URLSearchParams(window.location.search).get('lang');
    if (fromUrl === 'en' || fromUrl === 'uk') return fromUrl;
    try { var saved = localStorage.getItem(LANG_KEY); if (saved === 'en' || saved === 'uk') return saved; } catch (e) {}
    return 'uk';
  }

  function applyLang(next, remember) {
    lang = next === 'en' ? 'en' : 'uk';
    document.documentElement.lang = lang;
    $$('[data-i18n]').forEach(function (el) {
      var value = t(el.getAttribute('data-i18n'));
      if (typeof value === 'string') el.textContent = value;
    });
    $$('[data-i18n-attr]').forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var parts = pair.split(':');
        var value = t(parts[1]);
        if (typeof value === 'string') el.setAttribute(parts[0], value);
      });
    });
    $$('.lang').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-lang') === lang ? 'true' : 'false');
    });
    // Посилання, що ведуть на різні сторінки залежно від мови (наприклад, «Статті»)
    $$('[data-href-' + lang + ']').forEach(function (a) { a.setAttribute('href', a.getAttribute('data-href-' + lang)); });
    updateSentLabel();
    if (remember) {
      try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
      var url = new URL(window.location.href);
      if (lang === 'en') url.searchParams.set('lang', 'en'); else url.searchParams.delete('lang');
      history.replaceState(null, '', url);
    }
  }

  $$('.lang').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var next = btn.getAttribute('data-lang');
      if (pageLang) {
        if (next === pageLang) return;
        try { localStorage.setItem(LANG_KEY, next); } catch (e) {}
        var alt = $('link[rel="alternate"][hreflang="' + next + '"]');
        // Перекладу немає — ведемо на головну потрібною мовою
        var home = $('.hdr-logo').getAttribute('href').split('?')[0];
        window.location.href = alt ? alt.getAttribute('href') : home + (next === 'en' ? '?lang=en' : '');
        return;
      }
      applyLang(next, true);
    });
  });

  /* ---------- Меню для смартфона ---------- */

  var burger = $('.burger');
  var menu = $('#mobile-menu');

  function setMenu(open) {
    menu.hidden = !open;
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    $('.burger-closed', burger).hidden = open;
    $('.burger-open', burger).hidden = !open;
  }

  burger.addEventListener('click', function () { setMenu(menu.hidden); });
  $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
  window.matchMedia('(min-width: 768px)').addEventListener('change', function (e) { if (e.matches) setMenu(false); });
  // Escape закриває меню й повертає фокус на кнопку
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !menu.hidden) { setMenu(false); burger.focus(); }
  });

  /* ---------- Поточний розділ у навігації ---------- */

  var navLinks = $$('[data-section]');
  function setCurrent(id) {
    navLinks.forEach(function (a) { a.setAttribute('aria-current', a.getAttribute('data-section') === id ? 'true' : 'false'); });
  }
  // Лише на головній: на сторінках статей цих розділів немає
  var hero = $('.hero');
  if ('IntersectionObserver' in window && hero) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { if (entry.isIntersecting) setCurrent(entry.target.id); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['tours', 'exhibits', 'courses', 'contacts'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    // На першому екрані жоден розділ не позначено
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) setCurrent(null);
    }, { rootMargin: '-45% 0px -50% 0px' }).observe(hero);
  }

  /* ---------- Експонати: «Показати більше» ---------- */

  var EXHIBITS_VISIBLE = 3;
  var moreBox = $('#exhibits .more');
  var extraExhibits = $$('#exhibits-grid > .card-exhibit').slice(EXHIBITS_VISIBLE);
  if (moreBox && extraExhibits.length) {
    var moreBtn = $('button', moreBox);
    extraExhibits.forEach(function (card) { card.hidden = true; });
    moreBox.hidden = false;
    moreBtn.addEventListener('click', function () {
      extraExhibits.forEach(function (card) { card.hidden = false; });
      moreBtn.setAttribute('aria-expanded', 'true');
      moreBox.hidden = true;
      // Фокус — на перший щойно показаний експонат, щоб клавіатура не «загубилася»
      var first = extraExhibits[0];
      first.setAttribute('tabindex', '-1');
      first.focus();
    });
  }

  /* ---------- Форма запису (лише на головній) ---------- */

  var form = $('#booking-form');
  function updateSentLabel() {
    if (!form) return;
    var labels = t('dirLabels') || {};
    $('#f-sent-label').textContent = labels[$('#f-dir').value] || '';
  }
  if (form) initBooking();
  applyLang(readLang(), false);

  function initBooking() {
    var dir = $('#f-dir');
    var name = $('#f-name');
    var phone = $('#f-phone');
    var submit = $('#f-submit');
    var fail = $('#f-fail');
    var success = $('#f-success');
    var busy = false;
    var tried = false;

    function phoneOk(value) {
      var digits = value.replace(/\D/g, '');
      return (digits.length === 12 && digits.indexOf('380') === 0) || (digits.length === 10 && digits.charAt(0) === '0');
    }

    function setError(field, errId, isError) {
      field.setAttribute('aria-invalid', isError ? 'true' : 'false');
      document.getElementById(errId).hidden = !isError;
    }

    function validate() {
      var errDir = !dir.value;
      var errName = !name.value.trim();
      var errPhone = !phoneOk(phone.value);
      setError(dir, 'f-dir-err', errDir);
      setError(name, 'f-name-err', errName);
      setError(phone, 'f-phone-err', errPhone);
      return errDir ? dir : errName ? name : errPhone ? phone : null;
    }

    function setBusy(value) {
      busy = value;
      [dir, name, phone].forEach(function (f) { f.disabled = value; });
      if (value) { submit.setAttribute('aria-disabled', 'true'); submit.setAttribute('aria-busy', 'true'); }
      else { submit.removeAttribute('aria-disabled'); submit.removeAttribute('aria-busy'); }
      $('.when-idle', submit).hidden = value;
      $('.when-busy', submit).hidden = !value;
    }

    // Після першої спроби помилки оновлюються під час введення
    [dir, name, phone].forEach(function (f) {
      f.addEventListener(f === dir ? 'change' : 'input', function () { if (tried) validate(); });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      tried = true;
      var firstError = validate();
      if (firstError) { firstError.focus(); return; }
      fail.hidden = true;
      setBusy(true);
      window.submitBooking({ direction: dir.value, name: name.value.trim(), phone: phone.value.trim(), lang: lang })
        .then(function () {
          setBusy(false);
          updateSentLabel();
          form.hidden = true;
          success.hidden = false;
          success.focus();
        })
        .catch(function () {
          setBusy(false);
          fail.hidden = false;
          fail.focus();
        });
    });

    $('#f-again').addEventListener('click', function () {
      form.reset();
      tried = false;
      [dir, name, phone].forEach(function (f) { f.setAttribute('aria-invalid', 'false'); });
      ['f-dir-err', 'f-name-err', 'f-phone-err'].forEach(function (id) { document.getElementById(id).hidden = true; });
      success.hidden = true;
      form.hidden = false;
      dir.focus();
    });

    // «Записатися» в картці: підставити напрям у форму (прокрутка — через якір #booking)
    $$('[data-book]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (busy) return;
        dir.value = btn.getAttribute('data-book');
        if (tried) validate();
        success.hidden = true;
        form.hidden = false;
      });
    });
  }
})();
