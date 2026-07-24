/**
 * ui.js
 * ----------------------------------------------------------------------
 * DOM updates, place autocomplete, toasts, result rendering,
 * loading states, and formatting utilities.
 * ----------------------------------------------------------------------
 */

/* ======================================================================
 *  SVG ICON TEMPLATES
 * ====================================================================== */

var SVG = {
  search: '<svg class="input-icon-svg search-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">' +
    '<path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.6 4.2l3.6 3.6a1 1 0 01-1.4 1.4l-3.6-3.6A7 7 0 012 9z" clip-rule="evenodd"></path></svg>',

  check: '<svg class="input-icon-svg check-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">' +
    '<path fill-rule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.4 7.4a1 1 0 01-1.4 0L3.3 9.5a1 1 0 111.4-1.4l3.9 3.9 6.7-6.7a1 1 0 011.4 0z" clip-rule="evenodd"></path></svg>',

  spinner: '<svg class="input-icon-svg spinner-icon" viewBox="0 0 24 24" fill="none" width="16" height="16">' +
    '<circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>' +
    '<path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg>',

  pin: '<svg class="suggestion-pin" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">' +
    '<path fill-rule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clip-rule="evenodd"></path></svg>'
};


/* ======================================================================
 *  PLACE AUTOCOMPLETE
 * ====================================================================== */

/**
 * Reusable autocomplete search box backed by Nominatim.
 * Creates its own DOM elements inside the given container.
 *
 * @param {HTMLElement} container
 * @param {Object} options
 * @param {string} [options.label]
 * @param {string} [options.placeholder]
 * @param {function} [options.onSelect]
 * @param {function} [options.onClear]
 */
function PlaceAutocomplete(container, options) {
  options = options || {};
  this.container = container;
  this.onSelect = options.onSelect || function () {};
  this.onClear = options.onClear || function () {};
  this.selectedPlace = null;
  this.suggestions = [];
  this.isLoading = false;
  this.isOpen = false;

  this._build(options.label || null, options.placeholder || 'Type at least 3 characters...');
  this._bindEvents();
}

PlaceAutocomplete.prototype._build = function (label, placeholder) {
  this.container.innerHTML = '';
  this.container.classList.add('place-input-container');

  // Label
  if (label) {
    var labelEl = document.createElement('label');
    labelEl.className = 'form-label';
    labelEl.textContent = label;
    this.container.appendChild(labelEl);
  }

  // Input wrapper
  var wrapper = document.createElement('div');
  wrapper.className = 'place-input-wrapper';

  this.input = document.createElement('input');
  this.input.type = 'text';
  this.input.className = 'place-input';
  this.input.placeholder = placeholder;
  this.input.autocomplete = 'off';
  wrapper.appendChild(this.input);

  this.iconArea = document.createElement('div');
  this.iconArea.className = 'place-input-icon';
  this.iconArea.innerHTML = SVG.search;
  wrapper.appendChild(this.iconArea);

  this.container.appendChild(wrapper);

  // Suggestions dropdown
  this.dropdown = document.createElement('ul');
  this.dropdown.className = 'suggestions-dropdown';
  this.dropdown.style.display = 'none';
  this.container.appendChild(this.dropdown);

  // No results message
  this.noResults = document.createElement('div');
  this.noResults.className = 'no-results';
  this.noResults.textContent = 'No matching places found. Try a more specific name.';
  this.noResults.style.display = 'none';
  this.container.appendChild(this.noResults);

  // Error message
  this.errorEl = document.createElement('p');
  this.errorEl.className = 'input-error';
  this.errorEl.style.display = 'none';
  this.container.appendChild(this.errorEl);
};

PlaceAutocomplete.prototype._bindEvents = function () {
  var self = this;

  // Debounced search
  var debouncedSearch = API.debounce(function (q) {
    self._search(q);
  }, 450);

  this.input.addEventListener('input', function () {
    var q = self.input.value;

    // Clear selection on new typing
    if (self.selectedPlace) {
      self.selectedPlace = null;
      self._updateInputState();
      self.onClear();
    }

    if (q.trim().length < 3) {
      self._close();
      return;
    }
    debouncedSearch(q);
  });

  // Re-open on focus if suggestions exist
  this.input.addEventListener('focus', function () {
    if (self.suggestions.length > 0 && !self.isOpen) {
      self._open();
    }
  });

  // Close on click outside
  document.addEventListener('mousedown', function (e) {
    if (!self.container.contains(e.target)) {
      self._close();
    }
  });
};

PlaceAutocomplete.prototype._search = function (query) {
  var self = this;
  self._setLoading(true);
  self.errorEl.style.display = 'none';
  self.noResults.style.display = 'none';

  API.searchPlaces(query)
    .then(function (results) {
      self.suggestions = results;
      if (results.length > 0) {
        self._renderSuggestions();
        self._open();
      } else {
        self.dropdown.style.display = 'none';
        self.noResults.style.display = 'block';
      }
    })
    .catch(function () {
      self.errorEl.textContent = 'Search failed. Please try again.';
      self.errorEl.style.display = 'block';
      self.suggestions = [];
      self.dropdown.style.display = 'none';
    })
    .finally(function () {
      self._setLoading(false);
    });
};

PlaceAutocomplete.prototype._renderSuggestions = function () {
  var self = this;
  this.dropdown.innerHTML = '';

  this.suggestions.forEach(function (s) {
    var li = document.createElement('li');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'suggestion-item';
    btn.innerHTML =
      SVG.pin +
      '<span class="suggestion-text">' +
        '<span class="suggestion-name">' + self._escapeHtml(s.shortName) + '</span>' +
        '<span class="suggestion-detail">' + self._escapeHtml(s.displayName) + '</span>' +
      '</span>';
    btn.addEventListener('click', function () {
      self._select(s);
    });
    li.appendChild(btn);
    self.dropdown.appendChild(li);
  });
};

PlaceAutocomplete.prototype._select = function (place) {
  this.selectedPlace = place;
  this.input.value = place.displayName;
  this.suggestions = [];
  this._close();
  this._updateInputState();
  this.onSelect(place);
};

PlaceAutocomplete.prototype._open = function () {
  this.dropdown.style.display = 'block';
  this.noResults.style.display = 'none';
  this.isOpen = true;
};

PlaceAutocomplete.prototype._close = function () {
  this.dropdown.style.display = 'none';
  this.noResults.style.display = 'none';
  this.isOpen = false;
};

PlaceAutocomplete.prototype._setLoading = function (loading) {
  this.isLoading = loading;
  this._updateIcon();
};

PlaceAutocomplete.prototype._updateInputState = function () {
  if (this.selectedPlace) {
    this.input.classList.add('selected');
  } else {
    this.input.classList.remove('selected');
  }
  this._updateIcon();
};

PlaceAutocomplete.prototype._updateIcon = function () {
  if (this.isLoading) {
    this.iconArea.innerHTML = SVG.spinner;
  } else if (this.selectedPlace) {
    this.iconArea.innerHTML = SVG.check;
  } else {
    this.iconArea.innerHTML = SVG.search;
  }
};

PlaceAutocomplete.prototype._escapeHtml = function (str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
};


/* ======================================================================
 *  UI MODULE — Formatting, toasts, result rendering, loading states
 * ====================================================================== */

var UI = (function () {
  'use strict';

  /* --- Formatting utilities --- */

  function formatKm(km) {
    return km.toFixed(1) + ' km';
  }

  function formatMinutes(min) {
    if (min < 60) return Math.round(min) + ' min';
    var h = Math.floor(min / 60);
    var m = Math.round(min % 60);
    return m > 0 ? h + ' hr ' + m + ' min' : h + ' hr';
  }

  function shortName(displayName) {
    if (!displayName) return 'Unknown place';
    return displayName.split(',')[0].trim();
  }

  /* --- Toast notifications --- */

  var TOAST_STYLES = {
    info: 'toast-info',
    success: 'toast-success',
    error: 'toast-error',
    warning: 'toast-warning'
  };

  var TOAST_ICONS = {
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warning: '⚠️'
  };

  function showToast(message, type, duration) {
    type = type || 'info';
    duration = duration || 4500;
    var container = document.getElementById('toast-container');

    var toast = document.createElement('div');
    toast.className = 'toast slide-in ' + (TOAST_STYLES[type] || TOAST_STYLES.info);

    var icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.textContent = TOAST_ICONS[type] || TOAST_ICONS.info;

    var msg = document.createElement('span');
    msg.className = 'toast-message';
    msg.textContent = message;

    var dismiss = document.createElement('button');
    dismiss.className = 'toast-dismiss';
    dismiss.setAttribute('aria-label', 'Dismiss');
    dismiss.textContent = '✕';

    toast.appendChild(icon);
    toast.appendChild(msg);
    toast.appendChild(dismiss);
    container.appendChild(toast);

    function remove() {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 200);
    }

    dismiss.addEventListener('click', remove);
    setTimeout(remove, duration);
  }

  /* --- Result display --- */

  function showResult(result) {
    var card = document.getElementById('result-card');
    card.style.display = 'block';
    card.classList.add('fade-in');

    // Meta
    document.getElementById('result-meta').textContent =
      'Optimized for ' +
      (result.optimizeBy === 'distance' ? 'minimum distance' : 'minimum travel time') +
      ' · ' +
      (result.roundTrip ? 'Round trip' : 'Open route');

    // Stats
    document.getElementById('stat-start').textContent = shortName(result.start.displayName);
    document.getElementById('stat-start').title = result.start.displayName;
    document.getElementById('stat-stops').textContent = result.stops.length;
    document.getElementById('stat-distance').textContent = formatKm(result.totalDistanceKm);
    document.getElementById('stat-time').textContent = formatMinutes(result.totalDurationMin);

    // OSRM warning
    document.getElementById('osrm-warning').style.display = result.usedOsrm ? 'none' : 'block';

    // Route steps
    var stepsList = document.getElementById('route-steps');
    stepsList.innerHTML = '';

    // Start step
    stepsList.appendChild(createRouteStep('S', 'Start: ' + shortName(result.start.displayName), 'start'));

    // Stop steps
    for (var i = 0; i < result.stops.length; i++) {
      var isEnd = (i === result.stops.length - 1) && !result.roundTrip;
      stepsList.appendChild(
        createRouteStep(String(i + 1), shortName(result.stops[i].displayName), isEnd ? 'end' : 'mid')
      );
    }

    // Round trip return
    if (result.roundTrip) {
      stepsList.appendChild(
        createRouteStep('⟲', 'Return to Start: ' + shortName(result.start.displayName), 'end')
      );
    }

    // Google Maps link
    document.getElementById('gmaps-link').href = result.gmapsUrl;

    // Scroll result into view
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function createRouteStep(icon, label, highlight) {
    var li = document.createElement('li');
    li.className = 'route-step';

    var badge = document.createElement('span');
    badge.className = 'route-badge route-badge-' + highlight;
    badge.textContent = icon;

    var text = document.createElement('span');
    text.className = 'route-label';
    text.textContent = label;

    li.appendChild(badge);
    li.appendChild(text);
    return li;
  }

  function hideResult() {
    document.getElementById('result-card').style.display = 'none';
  }

  /* --- Optimize button loading state --- */

  function setOptimizeLoading(loading) {
    var btn = document.getElementById('optimize-btn');
    var btnText = document.getElementById('optimize-btn-text');
    var btnLoading = document.getElementById('optimize-btn-loading');

    btn.disabled = loading;
    btnText.style.display = loading ? 'none' : 'inline';
    btnLoading.style.display = loading ? 'inline-flex' : 'none';
  }

  /* --- Destination counter --- */

  function updateDestCount(destinations) {
    var count = 0;
    for (var i = 0; i < destinations.length; i++) {
      if (destinations[i].autocomplete.selectedPlace) count++;
    }
    document.getElementById('dest-count').textContent = count + ' selected';
  }

  return {
    formatKm: formatKm,
    formatMinutes: formatMinutes,
    shortName: shortName,
    showToast: showToast,
    showResult: showResult,
    hideResult: hideResult,
    setOptimizeLoading: setOptimizeLoading,
    updateDestCount: updateDestCount
  };
})();
