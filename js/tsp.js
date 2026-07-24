/**
 * tsp.js
 * ----------------------------------------------------------------------
 * *** TSP ALGORITHM IMPLEMENTATION ***
 *
 * The starting location is ALWAYS index 0 in the input matrix and is
 * fixed as the first stop — it is never treated as a "destination" to
 * be reordered. This module finds the best order for the remaining
 * stops (indices 1..n-1), for whichever matrix is supplied (distance OR
 * duration), and either ends at the last destination ("open route") or
 * returns to the start ("round trip").
 *
 * Strategy:
 *  - n <= BRUTE_FORCE_LIMIT total stops -> brute-force every permutation
 *    of the destinations. Guarantees the true optimal route. Fine for
 *    small n because it's only (n-1)! permutations.
 *  - n >  BRUTE_FORCE_LIMIT -> Nearest Neighbour construction + 2-opt
 *    local-search improvement. Brute force is factorial and becomes
 *    impractical beyond ~8 stops (9! = 362,880, 10! = 3,628,800 ...).
 * ----------------------------------------------------------------------
 */

var TSP = (function () {
  'use strict';

  var BRUTE_FORCE_LIMIT = 8;

  /** Total length of a route through `order` (indices into `matrix`).
   * Adds the closing leg back to the start if `roundTrip` is true. */
  function routeLength(order, matrix, roundTrip) {
    var total = 0;
    for (var i = 0; i < order.length - 1; i++) {
      total += matrix[order[i]][order[i + 1]];
    }
    if (roundTrip) {
      total += matrix[order[order.length - 1]][order[0]];
    }
    return total;
  }

  /** Generate all permutations of an array (used only for small n). */
  function permutations(arr) {
    var results = [];
    function permute(current, remaining) {
      if (remaining.length === 0) {
        results.push(current.slice());
        return;
      }
      for (var i = 0; i < remaining.length; i++) {
        current.push(remaining[i]);
        var rest = remaining.slice(0, i).concat(remaining.slice(i + 1));
        permute(current, rest);
        current.pop();
      }
    }
    permute([], arr);
    return results;
  }

  function bruteForceTSP(matrix, roundTrip) {
    var n = matrix.length;
    var rest = [];
    for (var i = 1; i < n; i++) rest.push(i);

    var perms = permutations(rest);
    var bestOrder = null;
    var bestCost = Infinity;

    for (var p = 0; p < perms.length; p++) {
      var order = [0].concat(perms[p]);
      var cost = routeLength(order, matrix, roundTrip);
      if (cost < bestCost) {
        bestCost = cost;
        bestOrder = order;
      }
    }
    return { order: bestOrder, cost: bestCost };
  }

  function nearestNeighbourWith2Opt(matrix, roundTrip) {
    var n = matrix.length;

    // --- Nearest Neighbour construction, starting fixed at index 0 ---
    var unvisited = {};
    for (var i = 1; i < n; i++) unvisited[i] = true;
    var order = [0];
    var unvisitedCount = n - 1;

    while (unvisitedCount > 0) {
      var last = order[order.length - 1];
      var nearest = null;
      var nearestDist = Infinity;
      for (var c in unvisited) {
        c = parseInt(c, 10);
        if (matrix[last][c] < nearestDist) {
          nearestDist = matrix[last][c];
          nearest = c;
        }
      }
      order.push(nearest);
      delete unvisited[nearest];
      unvisitedCount--;
    }
    var bestCost = routeLength(order, matrix, roundTrip);

    // --- 2-opt improvement: reverse segments if it shortens the route.
    // Index 0 (the start) always stays fixed in position 0. ---
    var improved = true;
    while (improved) {
      improved = false;
      for (var i = 1; i < n - 1; i++) {
        for (var j = i + 1; j < n; j++) {
          var segment = order.slice(i, j + 1).reverse();
          var newOrder = order.slice(0, i).concat(segment).concat(order.slice(j + 1));
          var newCost = routeLength(newOrder, matrix, roundTrip);
          if (newCost < bestCost - 1e-9) {
            order = newOrder;
            bestCost = newCost;
            improved = true;
          }
        }
      }
    }
    return { order: order, cost: bestCost };
  }

  /**
   * Solve the TSP for the given matrix (distance OR duration), with the
   * start fixed at index 0.
   * @param {number[][]} matrix - n x n cost matrix.
   * @param {boolean} roundTrip - true = return to start, false = open path.
   * @returns {{order: number[], cost: number}}
   */
  function solveTSP(matrix, roundTrip) {
    var n = matrix.length;
    if (n <= 1) {
      var arr = [];
      for (var i = 0; i < n; i++) arr.push(i);
      return { order: arr, cost: 0 };
    }
    if (n <= BRUTE_FORCE_LIMIT) {
      return bruteForceTSP(matrix, roundTrip);
    }
    return nearestNeighbourWith2Opt(matrix, roundTrip);
  }

  return {
    solveTSP: solveTSP,
    routeLength: routeLength,
    BRUTE_FORCE_LIMIT: BRUTE_FORCE_LIMIT
  };
})();
