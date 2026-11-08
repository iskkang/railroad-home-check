/* Puts /trains/ crossing dots on an OpenStreetMap basemap. Points are the same
   3-byte (x, y, category) records used for map.svg, so positions are approximate (~200 m). */
(function () {
  var COLORS = ['#8E99AE', '#2451E6', '#E8590C', '#0F7B6C'];
  var OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  function decode(el) {
    var b = JSON.parse(el.dataset.b), raw = atob(el.dataset.p), pts = [];
    for (var i = 0; i + 2 < raw.length; i += 3) {
      var x = raw.charCodeAt(i), y = raw.charCodeAt(i + 1);
      pts.push([b[1] - (y / 255) * (b[1] - b[0]), b[2] + (x / 255) * (b[3] - b[2]), raw.charCodeAt(i + 2)]);
    }
    return { b: b, pts: pts, dt: el.dataset.dt ? JSON.parse(el.dataset.dt) : null };
  }

  function draw(el) {
    if (el._rcMap || !window.L) return;
    var mini = el.classList.contains('rc-mini');
    var d = decode(el);
    var fallback = el.querySelector('img');
    var map = L.map(el, {
      preferCanvas: true, zoomControl: !mini, dragging: !mini, touchZoom: !mini, doubleClickZoom: !mini,
      scrollWheelZoom: !mini, boxZoom: false, keyboard: !mini, tap: false, zoomSnap: 0.25, maxZoom: 13
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 13, attribution: mini ? '&copy; OpenStreetMap' : OSM
    }).on('load', function () { if (fallback) fallback.remove(); }).addTo(map);
    map.attributionControl.setPrefix(false);
    map.fitBounds([[d.b[0], d.b[2]], [d.b[1], d.b[3]]], { padding: mini ? [6, 6] : [12, 12] });
    if (d.dt) {
      L.circle(d.dt, { radius: 1600, color: '#0F1B33', weight: 1.5, dashArray: '4 4', fill: false, interactive: false }).addTo(map);
      if (!mini) L.marker(d.dt, { interactive: false, icon: L.divIcon({ className: 'rc-dt', html: '<span>Downtown</span>', iconSize: [0, 0] }) }).addTo(map);
    }
    var r = mini ? 3 : 5;
    [0, 1, 2, 3].forEach(function (cat) {
      d.pts.forEach(function (p) {
        if (p[2] !== cat) return;
        L.circleMarker([p[0], p[1]], { radius: cat ? r : r - 1, color: '#fff', weight: mini ? 0.8 : 1.3, fillColor: COLORS[cat], fillOpacity: 0.95, interactive: false }).addTo(map);
      });
    });
    el._rcMap = map;
  }

  function init() {
    if (!window.L) return;
    var els = document.querySelectorAll('.rc-mini[data-p], .rc-lmap[data-p]');
    if (!('IntersectionObserver' in window)) { els.forEach(draw); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); draw(e.target); } });
    }, { rootMargin: '300px 0px' });
    els.forEach(function (el) { io.observe(el); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
