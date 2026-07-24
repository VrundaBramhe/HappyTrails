/**
 * api.js
 * ----------------------------------------------------------------------
 * All external API calls:
 *   - Nominatim (place search / autocomplete / geocoding)
 *   - OSRM (distance/duration matrix + route geometry)
 *   - Google Maps URL builder
 *   - Debounce utility
 * ----------------------------------------------------------------------
 */

var API = (function () {
  'use strict';

  /* ====================================================================
   *  NOMINATIM — Free place search via OpenStreetMap
   * ==================================================================== */

  var NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

  /**
   * Search for places matching a text query.
   * @param {string} query
   * @returns {Promise<Array<{id:string, displayName:string, shortName:string, lat:number, lon:number}>>}
   */
  function searchPlaces(query) {
    if (!query || query.trim().length < 3) return Promise.resolve([]);

    var params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: '5',
      addressdetails: '0',
    });

    return fetch(NOMINATIM_URL + '?' + params.toString(), {
      headers: { Accept: 'application/json' },
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Nominatim search failed (HTTP ' + response.status + ')');
        }
        return response.json();
      })
      .then(function (data) {
        return data.map(function (d) {
          return {
            id: '' + d.place_id,
            displayName: d.display_name,
            shortName: d.display_name.split(',')[0].trim(),
            lat: parseFloat(d.lat),
            lon: parseFloat(d.lon),
          };
        });
      });
  }

  /* ====================================================================
   *  OSRM — Free road routing via the public demo server
   * ==================================================================== */

  var OSRM_TABLE_URL = 'https://router.project-osrm.org/table/v1/driving/';
  var OSRM_ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving/';
  var AVG_FALLBACK_SPEED_KMH = 40;

  function haversineKm(a, b) {
    var R = 6371;
    function toRad(deg) { return (deg * Math.PI) / 180; }
    var dLat = toRad(b.lat - a.lat);
    var dLon = toRad(b.lon - a.lon);
    var lat1 = toRad(a.lat);
    var lat2 = toRad(b.lat);
    var h =
      Math.pow(Math.sin(dLat / 2), 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(dLon / 2), 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function haversineFallbackMatrix(places) {
    var n = places.length;
    var dist = [];
    var dur = [];
    for (var i = 0; i < n; i++) {
      dist[i] = new Array(n).fill(0);
      dur[i] = new Array(n).fill(0);
    }
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        if (i !== j) {
          var d = haversineKm(places[i], places[j]);
          dist[i][j] = d;
          dur[i][j] = (d / AVG_FALLBACK_SPEED_KMH) * 60;
        }
      }
    }
    return { dist: dist, dur: dur };
  }

  /**
   * Get pairwise distance (km) and duration (min) matrices via OSRM.
   * Falls back to haversine if OSRM fails.
   */
  function getDistanceDurationMatrix(places) {
    var coords = places.map(function (p) { return p.lon + ',' + p.lat; }).join(';');
    var url = OSRM_TABLE_URL + coords + '?annotations=distance,duration';

    return fetch(url)
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (data) {
        if (data.code !== 'Ok') throw new Error(data.message || 'OSRM table error');
        var dist = data.distances.map(function (row) {
          return row.map(function (m) { return m / 1000; });
        });
        var dur = data.durations.map(function (row) {
          return row.map(function (s) { return s / 60; });
        });
        return { dist: dist, dur: dur, usedOsrm: true, error: null };
      })
      .catch(function (err) {
        var fb = haversineFallbackMatrix(places);
        return { dist: fb.dist, dur: fb.dur, usedOsrm: false, error: err.message };
      });
  }

  /**
   * Get road-following route geometry through ordered places.
   * Falls back to straight lines if OSRM fails.
   */
  function getRouteGeometry(orderedPlaces, roundTrip) {
    var pts = roundTrip ? orderedPlaces.concat([orderedPlaces[0]]) : orderedPlaces;
    var coords = pts.map(function (p) { return p.lon + ',' + p.lat; }).join(';');
    var url = OSRM_ROUTE_URL + coords + '?overview=full&geometries=geojson';

    return fetch(url)
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (data) {
        if (data.code !== 'Ok') throw new Error(data.message || 'OSRM route error');
        var line = data.routes[0].geometry.coordinates.map(function (c) {
          return [c[1], c[0]]; // [lat, lon]
        });
        return { line: line, ok: true };
      })
      .catch(function () {
        return {
          line: pts.map(function (p) { return [p.lat, p.lon]; }),
          ok: false
        };
      });
  }

  /* ====================================================================
   *  GOOGLE MAPS URL BUILDER
   * ==================================================================== */

  /**
   * Build a Google Maps directions URL for the optimized route.
   */
  function buildGoogleMapsUrl(start, stopsInOrder, roundTrip) {
    function coord(p) { return p.lat + ',' + p.lon; }

    var origin = coord(start);
    var destination;
    var waypoints;

    if (roundTrip) {
      destination = coord(start);
      waypoints = stopsInOrder.map(coord);
    } else if (stopsInOrder.length === 0) {
      destination = origin;
      waypoints = [];
    } else {
      destination = coord(stopsInOrder[stopsInOrder.length - 1]);
      waypoints = stopsInOrder.slice(0, -1).map(coord);
    }

    var params = new URLSearchParams({
      api: '1',
      origin: origin,
      destination: destination,
      travelmode: 'driving',
    });
    if (waypoints.length > 0) {
      params.set('waypoints', waypoints.join('|'));
    }
    return 'https://www.google.com/maps/dir/?' + params.toString();
  }

  /* ====================================================================
   *  DEBOUNCE UTILITY
   * ==================================================================== */

  /**
   * Returns a debounced version of `fn` that only runs after `delay` ms
   * have passed without it being called again.
   */
  function debounce(fn, delay) {
    if (delay === undefined) delay = 400;
    var timer = null;
    var debounced = function () {
      var args = arguments;
      var ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, delay);
    };
    debounced.cancel = function () { clearTimeout(timer); };
    return debounced;
  }

  /* ==================================================================== */

  return {
    searchPlaces: searchPlaces,
    getDistanceDurationMatrix: getDistanceDurationMatrix,
    getRouteGeometry: getRouteGeometry,
    buildGoogleMapsUrl: buildGoogleMapsUrl,
    debounce: debounce
  };
})();
