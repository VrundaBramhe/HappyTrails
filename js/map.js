/**
 * map.js
 * ----------------------------------------------------------------------
 * Leaflet map management:
 *   - Map initialization
 *   - Numbered / styled markers
 *   - Route polyline rendering
 *   - Auto-fit bounds
 * ----------------------------------------------------------------------
 */

var MapManager = (function () {
  'use strict';

  var map = null;
  var markersGroup = null;
  var routePolyline = null;

  /**
   * Create a numbered circular div-icon for Leaflet.
   */
  function numberedIcon(label, kind) {
    var bg = kind === 'start' ? '#004225' : kind === 'end' ? '#dc2626' : '#FFB000';
    var color = kind === 'mid' ? '#004225' : '#ffffff';
    return L.divIcon({
      className: '',
      html: '<div style="' +
        'background:' + bg + ';color:' + color + ';font-weight:700;font-size:12px;' +
        'width:28px;height:28px;border-radius:9999px;display:flex;' +
        'align-items:center;justify-content:center;border:2.5px solid white;' +
        'box-shadow:0 2px 8px rgba(0,66,37,0.35);">' + label + '</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -16],
    });
  }

  /**
   * Initialize the Leaflet map (called once, lazily on first result).
   */
  function init() {
    if (map) return;

    var mapEl = document.getElementById('map');
    map = L.map(mapEl, { scrollWheelZoom: true }).setView([20, 78], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    markersGroup = L.layerGroup().addTo(map);
  }

  /**
   * Display the optimized route on the map.
   */
  function showRoute(start, stops, routeLine, roundTrip) {
    var wrapperEl = document.getElementById('map-wrapper');
    var emptyEl = document.getElementById('empty-state');

    // Show map, hide empty state
    emptyEl.style.display = 'none';
    wrapperEl.style.display = 'block';

    // Lazy init
    init();

    // Clear previous route
    clear();

    // Invalidate size since container may have been hidden
    setTimeout(function () { map.invalidateSize(); }, 50);

    // Start marker
    var startMarker = L.marker([start.lat, start.lon], {
      icon: numberedIcon('S', 'start')
    });
    startMarker.bindPopup('<strong>Start:</strong> ' + start.displayName);
    markersGroup.addLayer(startMarker);

    // Stop markers
    for (var i = 0; i < stops.length; i++) {
      var s = stops[i];
      var isLast = (i === stops.length - 1) && !roundTrip;
      var marker = L.marker([s.lat, s.lon], {
        icon: numberedIcon(i + 1, isLast ? 'end' : 'mid')
      });
      marker.bindPopup(
        '<strong>' + (i + 1) + '. ' + UI.shortName(s.displayName) + '</strong><br>' +
        s.displayName
      );
      markersGroup.addLayer(marker);
    }

    // Route polyline
    if (routeLine && routeLine.length > 1) {
      routePolyline = L.polyline(routeLine, {
        color: '#004225',
        weight: 4,
        opacity: 0.8,
        dashArray: '8 4'
      }).addTo(map);
    }

    // Fit bounds
    var boundsPoints = (routeLine && routeLine.length > 0)
      ? routeLine
      : [start].concat(stops).map(function (p) { return [p.lat, p.lon]; });

    setTimeout(function () {
      if (boundsPoints.length === 1) {
        map.setView(boundsPoints[0], 14);
      } else if (boundsPoints.length > 1) {
        map.fitBounds(boundsPoints, { padding: [48, 48] });
      }
    }, 100);
  }

  /**
   * Clear all markers and route lines.
   */
  function clear() {
    if (markersGroup) markersGroup.clearLayers();
    if (routePolyline) {
      map.removeLayer(routePolyline);
      routePolyline = null;
    }
  }

  /**
   * Reset to empty state (hide map, show placeholder).
   */
  function showEmpty() {
    var wrapperEl = document.getElementById('map-wrapper');
    var emptyEl = document.getElementById('empty-state');
    wrapperEl.style.display = 'none';
    emptyEl.style.display = 'flex';
    clear();
  }

  return {
    init: init,
    showRoute: showRoute,
    clear: clear,
    showEmpty: showEmpty
  };
})();
