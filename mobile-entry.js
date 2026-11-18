// Progressive enhancement: all navigation links remain available without JavaScript.
(() => {
  const header = document.querySelector('.app-header');
  const nav = header?.querySelector('.app-nav');
  if (header && nav) {
    nav.id = 'main-navigation';
    const toggle = document.createElement('button');
    toggle.type = 'button'; toggle.className = 'mobile-menu-toggle';
    toggle.textContent = 'Menu';
    toggle.setAttribute('aria-controls', nav.id);
    toggle.setAttribute('aria-expanded', 'false');
    header.insertBefore(toggle, nav);
    const close = () => { header.classList.remove('menu-open'); toggle.setAttribute('aria-expanded', 'false'); };
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      header.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', event => { if (event.target.closest('a')) close(); });
    header.addEventListener('keydown', event => { if (event.key === 'Escape' && header.classList.contains('menu-open')) { close(); toggle.focus(); } });
    window.addEventListener('resize', () => { if (window.innerWidth > 760) close(); });
    header.classList.add('nav-ready');
  }
  // Fixed event names only: never collect the typed address, coordinates, or URL.
  document.querySelectorAll('#address, .entry-checker input, #addr-top').forEach(input => {
    input.addEventListener('focus', () => {
      try { if (typeof window.gtag === 'function') window.gtag('event', document.body.classList.contains('home') ? 'home_address_focus' : 'content_checker_focus'); } catch {}
    }, { once: true });
  });
})();
