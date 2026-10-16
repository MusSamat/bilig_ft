/*
 * Runs before the app (render-blocking, a few hundred bytes): applies the
 * saved theme and the last hue tokens so the first paint already has the
 * right background and color-scheme (no white flash in dark mode). A file
 * rather than an inline script so a strict CSP (script-src 'self') works.
 */
(function () {
  var d = document.documentElement;
  var theme = null;
  try {
    theme = localStorage.getItem('bilig.theme');
  } catch (e) {}
  if (theme !== 'light' && theme !== 'dark') theme = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  d.setAttribute('data-theme', theme);
  d.style.colorScheme = theme;
  try {
    var vars = JSON.parse(localStorage.getItem('bilig.tokens.' + theme) || 'null');
    if (vars) for (var k in vars) d.style.setProperty(k, vars[k]);
  } catch (e) {}
})();
