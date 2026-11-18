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
    track(eventName, diagnostics) {
      if (!['property_check_started','property_check_completed','property_check_failed'].includes(eventName)) return;
      const source = attribution();
      if (source && typeof gtag === 'function') {
        const params = {guide_path:source, transport_type:'beacon'};
        if (eventName === 'property_check_failed' && diagnostics) {
          const code = diagnostics.error_code;
          params.error_code = ['REQUEST_TIMEOUT','REQUEST_ABORTED','NETWORK_ERROR','INVALID_JSON','RENDER_ERROR','UNEXPECTED_ERROR'].includes(code) || /^HTTP_[45][0-9]{2}$/.test(code || '') ? code : 'UNEXPECTED_ERROR';
          params.failure_stage = ['geocode','crossings','render'].includes(diagnostics.failure_stage) ? diagnostics.failure_stage : 'unknown';
          params.duration_ms = Math.min(86400000, Math.max(0, Math.round(Number(diagnostics.duration_ms) || 0)));
        }
        gtag('event', 'guide_' + eventName, params);
      }
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
