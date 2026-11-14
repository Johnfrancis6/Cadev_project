/* Applies the stored theme before first paint. External file on purpose: the CSP forbids inline scripts. */
(function () {
  var root = document.documentElement;
  var pref = 'system';
  try {
    var stored = localStorage.getItem('devloop.theme');
    if (stored === 'dark' || stored === 'light' || stored === 'system') pref = stored;
  } catch (e) {
    /* storage blocked: keep following the system */
  }
  var dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  root.style.colorScheme = dark ? 'dark' : 'light';
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#111310' : '#f5f4ec');
  try {
    var lang = localStorage.getItem('devloop.lang');
    if (lang === 'fr' || lang === 'en') root.setAttribute('lang', lang);
  } catch (e) {
    /* ignore */
  }
})();
