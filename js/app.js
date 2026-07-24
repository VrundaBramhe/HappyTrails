/**
 * app.js
 * ----------------------------------------------------------------------
 * Main application — initialization, state, event handling.
 * This is the entry point that ties together all other modules
 * (TSP, API, MapManager, UI).
 * ----------------------------------------------------------------------
 */

var App = (function () {
  'use strict';

  var destIdCounter = 0;

  var state = {
    startAutocomplete: null,
    destinations: [],   // [{ id: string, autocomplete: PlaceAutocomplete, row: HTMLElement }]
    loading: false
  };

  function newDestId() {
    destIdCounter++;
    return 'dest-' + destIdCounter;
  }

  /* --- Initialization --- */

  function init() {
    // Create starting location autocomplete
    state.startAutocomplete = new PlaceAutocomplete(
      document.getElementById('start-input-container'),
      {
        label: 'Starting Location',
        placeholder: 'e.g. Chhatrapati Shivaji Maharaj Terminus',
        onSelect: function () { UI.updateDestCount(state.destinations); },
        onClear: function () {}
      }
    );

    // Create 2 initial destination rows
    addDestination();
    addDestination();

    // Event listeners
    document.getElementById('add-dest-btn').addEventListener('click', function () {
      addDestination();
    });

    document.getElementById('optimize-btn').addEventListener('click', function () {
      handleOptimize();
    });
  }

  /* --- Destination management --- */

  function addDestination() {
    var id = newDestId();
    var destIndex = state.destinations.length + 1;

    // Create row
    var row = document.createElement('div');
    row.className = 'dest-row';
    row.setAttribute('data-dest-id', id);

    var inputWrapper = document.createElement('div');
    inputWrapper.className = 'dest-input-wrapper';

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-dest-btn';
    removeBtn.title = 'Remove destination';
    removeBtn.setAttribute('aria-label', 'Remove destination');
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', function () {
      removeDestination(id);
    });

    row.appendChild(inputWrapper);
    row.appendChild(removeBtn);

    document.getElementById('destinations-list').appendChild(row);

    // Create autocomplete
    var autocomplete = new PlaceAutocomplete(inputWrapper, {
      placeholder: 'Destination ' + destIndex,
      onSelect: function () { UI.updateDestCount(state.destinations); },
      onClear: function () { UI.updateDestCount(state.destinations); }
    });

    state.destinations.push({
      id: id,
      autocomplete: autocomplete,
      row: row
    });

    updateRemoveButtons();
    UI.updateDestCount(state.destinations);
  }

  function removeDestination(id) {
    if (state.destinations.length <= 1) return;

    var index = -1;
    for (var i = 0; i < state.destinations.length; i++) {
      if (state.destinations[i].id === id) { index = i; break; }
    }
    if (index === -1) return;

    // Remove DOM element
    var dest = state.destinations[index];
    dest.row.parentNode.removeChild(dest.row);

    // Remove from state
    state.destinations.splice(index, 1);

    updateRemoveButtons();
    UI.updateDestCount(state.destinations);
  }

  function updateRemoveButtons() {
    var singleDest = state.destinations.length <= 1;
    var buttons = document.querySelectorAll('.remove-dest-btn');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].disabled = singleDest;
    }
  }

  /* --- Main optimization flow --- */

  function handleOptimize() {
    var start = state.startAutocomplete.selectedPlace;

    // Validate
    if (!start) {
      UI.showToast('Please select a valid starting location.', 'error');
      return;
    }

    var destinations = [];
    for (var i = 0; i < state.destinations.length; i++) {
      var place = state.destinations[i].autocomplete.selectedPlace;
      if (place) destinations.push(place);
    }

    if (destinations.length < 1) {
      UI.showToast('Please select at least 1 destination.', 'error');
      return;
    }

    var optimizeBy = document.getElementById('optimize-by').value;
    var routeType = document.getElementById('route-type').value;

    state.loading = true;
    UI.setOptimizeLoading(true);

    // index 0 is ALWAYS the fixed starting location — the TSP solver
    // never reorders it or treats it as a destination.
    var allPlaces = [start].concat(destinations);

    API.getDistanceDurationMatrix(allPlaces)
      .then(function (matrixResult) {
        if (!matrixResult.usedOsrm) {
          UI.showToast(
            'OSRM routing was unavailable (' + matrixResult.error + '). Using straight-line distance estimates instead.',
            'warning'
          );
        }

        var roundTrip = routeType === 'round';
        var matrix = optimizeBy === 'distance' ? matrixResult.dist : matrixResult.dur;

        var tspResult;
        try {
          tspResult = TSP.solveTSP(matrix, roundTrip);
        } catch (e) {
          UI.showToast('Route calculation failed: ' + e.message, 'error');
          state.loading = false;
          UI.setOptimizeLoading(false);
          return;
        }

        var order = tspResult.order;
        var orderedPlaces = order.map(function (idx) { return allPlaces[idx]; });
        var totalDistanceKm = TSP.routeLength(order, matrixResult.dist, roundTrip);
        var totalDurationMin = TSP.routeLength(order, matrixResult.dur, roundTrip);

        return API.getRouteGeometry(orderedPlaces, roundTrip)
          .then(function (geoResult) {
            if (!geoResult.ok) {
              UI.showToast('Could not fetch road-following route from OSRM; showing straight lines instead.', 'warning');
            }

            var gmapsUrl = API.buildGoogleMapsUrl(orderedPlaces[0], orderedPlaces.slice(1), roundTrip);

            var result = {
              start: orderedPlaces[0],
              stops: orderedPlaces.slice(1),
              totalDistanceKm: totalDistanceKm,
              totalDurationMin: totalDurationMin,
              routeLine: geoResult.line,
              usedOsrm: matrixResult.usedOsrm,
              roundTrip: roundTrip,
              optimizeBy: optimizeBy,
              gmapsUrl: gmapsUrl
            };

            // Show result and map
            UI.showResult(result);
            MapManager.showRoute(result.start, result.stops, result.routeLine, result.roundTrip);
            UI.showToast('Route optimized successfully!', 'success');
          });
      })
      .catch(function (err) {
        UI.showToast('Something went wrong: ' + err.message, 'error');
      })
      .finally(function () {
        state.loading = false;
        UI.setOptimizeLoading(false);
      });
  }

  return { init: init };
})();

/* --- Start the app when the DOM is ready --- */
document.addEventListener('DOMContentLoaded', App.init);
