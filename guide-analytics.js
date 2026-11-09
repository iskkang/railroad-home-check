// Only public page paths and a short-lived guide attribution token; never addresses or coordinates.
(() => {
  const key = 'home-guide-entry-v1';
  const validPath = value => typeof value === 'string' && /^\/[a-z0-9-]+\/$/.test(value);
  const path = location.pathname;
  const attribution = () => {
    try {
      const entry = JSON.parse(sessionStorage.getItem(key));
      if (validPath(entry?.path) && Number.isFinite(entry?.time) && Date.now() - entry.time >= 0 && Date.now() - entry.time < 30 * 60 * 1000) return entry.path;
      sessionStorage.removeItem(key);
    } catch {}
    return null;
  };
  globalThis.GuideJourney = {
    mark() {
      if (!validPath(path)) return;
      try { sessionStorage.setItem(key, JSON.stringify({path, time:Date.now()})); } catch {}
      if (typeof gtag === 'function') gtag('event', 'guide_checker_click', {guide_path:path, transport_type:'beacon'});
    },
    track(eventName) {
      if (!['property_check_started','property_check_completed','property_check_failed'].includes(eventName)) return;
      const source = attribution();
      if (source && typeof gtag === 'function') gtag('event', 'guide_' + eventName, {guide_path:source, transport_type:'beacon'});
    }
  };
  document.addEventListener('click', event => {
    const anchor = event.target.closest?.('a');
    const href = anchor?.getAttribute('href');
    if (!validPath(path) || !anchor || !['/', '/#searchForm', '/#comparison'].includes(href)) return;
    // Links to the home brand are navigation, not a deliberate checker CTA.
    if (anchor.matches('.guide-button,.guide-quick-check,.gv-sticky,[data-checker-cta]') || href !== '/') GuideJourney.mark();
  });
})();
