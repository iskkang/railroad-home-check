// Guide pages: address boxes hand off to the checker (address goes in the URL hash, which the
// homepage reads and clears before analytics loads), plus the sticky mobile button.
(() => {
  const path = location.pathname;
  document.querySelectorAll('form.gv-search').forEach(form => {
    form.addEventListener('submit', event => {
      event.preventDefault();
      const value = (form.querySelector('input')?.value || '').trim();
      window.GuideJourney?.mark();
      location.href = value ? '/#' + new URLSearchParams({ address: value }) : '/';
    });
  });
  document.querySelectorAll('[data-print-checklist]').forEach(button => button.addEventListener('click', () => window.print()));
  const hero = document.querySelector('.guide-hero');
  const sticky = document.querySelector('.gv-sticky');
  if (hero && sticky && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => document.body.classList.toggle('gv-sticky-on', !e.isIntersecting)).observe(hero);
    sticky.addEventListener('click', event => {
      event.preventDefault();
      const input = document.querySelector('.guide-hero .gv-search input');
      if (!input) { location.href = '/'; return; }
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => input.focus({ preventScroll: true }), 350);
    });
  }
})();
