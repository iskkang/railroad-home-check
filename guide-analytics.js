// Only public guide paths are measured. No address, coordinates, query or referrer.
(() => {
  const path = window.location.pathname;
  if (!/^\/[a-z0-9-]+\/$/.test(path)) return;
  document.addEventListener('click', (event) => {
    const anchor = event.target.closest?.('a');
    if (!anchor || anchor.getAttribute('href') !== '/') return;
    if (!anchor.classList.contains('guide-button') &&
        !anchor.classList.contains('guide-quick-check') &&
        !anchor.classList.contains('source-link')) return;
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'guide_checker_click', {
        guide_path: path,
        transport_type: 'beacon'
      });
    }
  });
})();
