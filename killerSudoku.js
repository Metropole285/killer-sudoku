/*
    killerSudoku.js
    ---------------
    JavaScript library for Killer Sudoku puzzle generation and solving.
    Includes updated partitioning logic and solver fixes.
*/

(function(root) {
    // Create the main library object on the root (window)
    var killerSudoku = root.killerSudoku = {};

    // --- Constants ---
    killerSudoku.DIGITS = "123456789";
    var ROWS = "ABCDEFGHI";
    var COLS = killerSudoku.DIGITS;
    killerSudoku.NR_SQUARES = 81;
    killerSudoku.BLANK_CHAR = '.';
    killerSudoku.BLANK_BOARD = "................................................................................."; // 81 dots

    // --- Precomputed Data (Initialized at the end) ---
    killerSudoku.SQUARES = null; // Array of cell IDs: ["A1", "A2", ..., "I9"]
    var SQUARE_MAP = null;       // Map for quick lookup: {"A1": 0, "A2": 1, ...}
    var CLASSIC_UNITS = null;    // Array of classic units (rows, cols, boxes) - each unit is an array of cell IDs
    var CLASSIC_UNITS_MAP = null;// Map: cellId -> array of classic units it belongs to
    var CLASSIC_PEERS_MAP = null;// Map: cellId -> array of classic peer cell IDs
    var SQUARE_NEIGHBORS = {};   // Map: cellId -> array of orthogonal neighbor cell IDs


    // --- Bitset Constants and Helpers ---
    var ALL_CANDIDATES = (1 << 9) - 1; // 0b111111111 (511)
    killerSudoku.ALL_CANDIDATES_MASK = ALL_CANDIDATES;
    // Masks for digits 1-9 (index 0 unused)
    var DIGIT_MASKS = [0, 1, 2, 4, 8, 16, 32, 64, 128, 256];
    killerSudoku.DIGIT_MASKS = DIGIT_MASKS; // Expose if needed externally

    function getDigitMask(digit) { return DIGIT_MASKS[digit] || 0; }
    function hasCandidate(bitset, digit) { return (bitset & DIGIT_MASKS[digit]) !== 0; }
    function addCandidate(bitset, digit) { return bitset | DIGIT_MASKS[digit]; }
    function removeCandidate(bitset, digit) { return bitset & ~DIGIT_MASKS[digit]; }
    function countCandidates(bitset) { var c = 0; while (bitset > 0) { bitset &= (bitset - 1); c++; } return c; }
    function getCandidatesArray(bitset) { var a = []; for (let d = 1; d <= 9; ++d) if (hasCandidate(bitset, d)) a.push(d); return a; }
    function intersectCandidates(b1, b2) { return b1 & b2; }
    function getSingleCandidateDigit(bitset) { if (bitset > 0 && (bitset & (bitset - 1)) === 0) { for (let d = 1; d <= 9; ++d) { if (bitset === DIGIT_MASKS[d]) return d; } } return 0; }
    function formatBitset(b) { return getCandidatesArray(b).join(''); } // Helper for logging

    // --- Deep Copy Utility ---
    function deepCopy(obj) {
      if (obj === null || typeof obj !== 'object') { return obj; }
      if (obj instanceof Date) { return new Date(obj.getTime()); }
      if (obj instanceof Set) { return new Set(obj); } // Shallow copy of Set elements ok
      if (Array.isArray(obj)) {
        const arrCopy = [];
        for (let i = 0; i < obj.length; i++) { arrCopy[i] = deepCopy(obj[i]); }
        return arrCopy;
      }
      const objCopy = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) { objCopy[key] = deepCopy(obj[key]); }
      }
      return objCopy;
    }

    // --- Cage Representation and Initialization ---
     /** @typedef {object} CageInput @property {number} sum @property {string[]} cells */
     /** @typedef {object} CageDataInternal @property {number} id @property {number} sum @property {string[]} cells @property {number} initialDigitMask @property {number} remainingSum @property {number} remainingCellsCount @property {number} currentValueMask */
     /** @typedef {object} SolverData @property {object.<string, number>} cellToCageMap @property {CageDataInternal[]} cageDataArray */

    /**
     * Initializes data structures needed by the solver based on cage definitions.
     * Validates cages and precomputes initial masks.
     * @param {CageInput[]} cages Array of cage objects.
     * @returns {SolverData | false} Object containing solver data or false on error.
     */
    killerSudoku._initializeSolverData = function(cages) {
        // console.log("Initializing solver data..."); // DEBUG
        if (!Array.isArray(cages)) { console.error("Invalid cages input: must be an array."); return false; }
        if (!SQUARE_MAP) { console.error("_initializeSolverData: SQUARE_MAP not initialized!"); return false;}

        var cellToCageMap = {};
        var cageDataArray = [];
        var assignedCells = {};

        for (var i = 0; i < cages.length; ++i) {
            var cage = cages[i];
            if (!cage || typeof cage.sum !== 'number' || !Array.isArray(cage.cells) || cage.cells.length === 0) { console.error(`Invalid cage format at index ${i}:`, cage); return false; }
            if (cage.sum <= 0 && cage.cells.length > 0) { console.error(`Invalid cage sum (<= 0) at index ${i}:`, cage.sum); return false; }
            if (cage.cells.length > 9) { console.error(`Invalid cage size (> 9) at index ${i}:`, cage.cells.length); return false; }

            var cageCells = [];
            for (var j = 0; j < cage.cells.length; ++j) {
                var cellId = cage.cells[j];
                if (typeof cellId !== 'string' || SQUARE_MAP[cellId] === undefined) { console.error(`Invalid cell ID '${cellId}' in cage at index ${i}`); return false; }
                if (assignedCells[cellId] !== undefined) { console.error(`Cell ${cellId} belongs to multiple cages (index ${i} and ${assignedCells[cellId]})`); return false; }
                assignedCells[cellId] = i; cellToCageMap[cellId] = i; cageCells.push(cellId);
            }
            if (cage.cells.length > 0) {
                 var minPossibleSum = (cage.cells.length * (cage.cells.length + 1)) / 2;
                 var maxPossibleSum = (cage.cells.length * (19 - cage.cells.length)) / 2;
                 if (cage.sum < minPossibleSum || cage.sum > maxPossibleSum) { console.error(`Invalid sum ${cage.sum} size ${cage.cells.length} cage ${i}. Min:${minPossibleSum}, Max:${maxPossibleSum}`); return false; }
             }
            var combinationInfo = killerSudoku.getSumCombinationInfo(cage.sum, cageCells.length);
            if (cage.cells.length > 0 && !combinationInfo) { console.error(`Impossible sum ${cage.sum} size ${cage.cells.length} cage ${i}.`); return false; }

            cageDataArray.push({
                id: i, sum: cage.sum, cells: cageCells,
                initialDigitMask: combinationInfo ? combinationInfo.digitMask : 0,
                remainingSum: cage.sum, remainingCellsCount: cageCells.length,
                currentValueMask: 0,
            });
        }
         const assignedCount = Object.keys(assignedCells).length;
         if (assignedCount !== killerSudoku.NR_SQUARES) { console.error(`Inv cage def: covered ${assignedCnt}/${killerSudoku.NR_SQUARES}`); if(killerSudoku.SQUARES){const missing=killerSudoku.SQUARES.filter(sq=>assigned[sq]===undefined);if(missing.length>0)console.error("Missing:",missing);} return false; }
        // console.log("Solver data init OK.");
        return { cellToCageMap: cellToCageMap, cageDataArray: cageDataArray };
    };

    // --- Sum Combination Cache and Calculation ---
    var SUM_COMBINATION_CACHE = {};
    killerSudoku.getSumCombinationInfo = function(targetSum, numCells) {
        if (numCells <= 0 || numCells > 9 || targetSum <= 0) return null;
        var minPossibleSum = (numCells * (numCells + 1)) / 2;
        var maxPossibleSum = (numCells * (19 - numCells)) / 2;
        if (targetSum < minPossibleSum || targetSum > maxPossibleSum) return null;
        if (SUM_COMBINATION_CACHE[targetSum] && SUM_COMBINATION_CACHE[targetSum][numCells] !== undefined) {
            return SUM_COMBINATION_CACHE[targetSum][numCells];
        }
        var combinations = [];
        function findCombinationsRecursive(currentSum, k, startDigit, currentCombo) {
            if (currentSum === 0 && k === 0) { combinations.push([...currentCombo]); return; }
            if (currentSum < 0 || k === 0 || startDigit > 9) { return; }
            for (let digit = startDigit; digit <= 9; ++digit) {
                 let remainingK = k - 1;
                 let minRemainingSum = remainingK > 0 ? (remainingK * (digit + 1 + digit + remainingK)) / 2 : 0;
                 if (currentSum - digit < minRemainingSum) break;
                 let maxRemainingSumPossible = 0;
                 for(let r=0; r<remainingK; ++r) maxRemainingSumPossible += (9-r);
                 if (currentSum - digit > maxRemainingSumPossible) continue;
                 currentCombo.push(digit);
                 findCombinationsRecursive(currentSum - digit, k - 1, digit + 1, currentCombo);
                 currentCombo.pop();
            }
        }
        findCombinationsRecursive(targetSum, numCells, 1, []);
        var result = null;
        if (combinations.length > 0) {
            var combinedMask = 0;
            combinations.forEach(combo => { combo.forEach(digit => { combinedMask |= DIGIT_MASKS[digit]; }); });
            result = { combinations: combinations, digitMask: combinedMask };
        }
        if (!SUM_COMBINATION_CACHE[targetSum]) { SUM_COMBINATION_CACHE[targetSum] = {}; }
        SUM_COMBINATION_CACHE[targetSum][numCells] = result;
        return result;
     };

    // --- Constraint Propagation ---
    /**
     * Assigns a definite value and propagates constraints.
     * Modifies the *passed* candidatesMap and solverData objects.
     * @param {object} candidatesMap - Map { cellId: bitset }
     * @param {SolverData} solverData - Current solver state.
     * @param {string} cellId - The cell to assign the value to.
     * @param {number} digitToAssign - The digit (1-9) to assign.
     * @param {string} [indent=""] - Indentation for logging.
     * @returns {boolean} True if successful, false if contradiction found.
     */
    function assignValue(candidatesMap, solverData, cellId, digitToAssign, indent="") {
        // console.log(`${indent}Assign START: ${cellId} = ${digitToAssign}`); // DEBUG
        var otherCandidatesMask = candidatesMap[cellId] & ~DIGIT_MASKS[digitToAssign];
        for (let d = 1; d <= 9; ++d) {
            if ((otherCandidatesMask & DIGIT_MASKS[d]) !== 0) {
                if (!eliminateCandidate(candidatesMap, solverData, cellId, d, indent + "  ")) {
                    // console.log(`${indent}Assign FAIL: Contradiction eliminating ${d} from ${cellId}`); // DEBUG
                    return false;
                }
            }
        }
        if (!updateCageStateOnAssign(candidatesMap, solverData, cellId, digitToAssign, indent + "  ")) {
             // console.log(`${indent}Assign FAIL: Contradiction during cage update for ${cellId}=${digitToAssign}`); // DEBUG
            return false;
        }
        // console.log(`${indent}Assign OK: ${cellId} = ${digitToAssign}`); // DEBUG
        return true;
    }

    /**
     * Eliminates a candidate and propagates constraints.
     * Modifies the *passed* candidatesMap and solverData objects.
     * @param {object} candidatesMap - Map { cellId: bitset }
     * @param {SolverData} solverData - Current solver state.
     * @param {string} cellId - The cell from which to eliminate.
     * @param {number} digitToEliminate - The digit (1-9) to eliminate.
     * @param {string} [indent=""] - Indentation for logging.
     * @returns {boolean} True if successful, false if contradiction found.
     */
    function eliminateCandidate(candidatesMap, solverData, cellId, digitToEliminate, indent="") {
        var initialCandidates = candidatesMap[cellId];
        var cellMask = DIGIT_MASKS[digitToEliminate];
        if ((initialCandidates & cellMask) === 0) return true;

        if (!CLASSIC_PEERS_MAP || !CLASSIC_UNITS_MAP || !solverData?.cellToCageMap || !solverData?.cageDataArray) {
             console.error("Eliminate called before full initialization or with invalid solverData!"); return false;
        }

        candidatesMap[cellId] &= ~cellMask;
        var remainingCandidates = candidatesMap[cellId];
        var numRemaining = countCandidates(remainingCandidates);
        // console.log(`${indent}Eliminate: ${cellId} -${digitToEliminate}. Before: ${formatBitset(initialCandidates)}, After: ${formatBitset(remainingCandidates)} (${numRemaining} left)`); // LOG

        if (numRemaining === 0) {
            // console.log(`${indent}Eliminate FAIL (Rule 0): ${cellId} has 0 candidates left!`); // LOG
            return false;
        }

        if (numRemaining === 1) {
            var finalDigit = getSingleCandidateDigit(remainingCandidates);
            // console.log(`${indent}Eliminate PROP 1: ${cellId} reduced to ${finalDigit}. Eliminating from peers...`); // LOG
            for (const peerId of CLASSIC_PEERS_MAP[cellId]) {
                if (!eliminateCandidate(candidatesMap, solverData, peerId, finalDigit, indent + "  ")) {
                    // console.log(`${indent}Eliminate FAIL (Prop 1 - Classic): Contradiction eliminating ${finalDigit} from peer ${peerId}`); // LOG
                    return false;
                }
            }
            if (!updateCageStateOnAssign(candidatesMap, solverData, cellId, finalDigit, indent + "  ")) {
                 // console.log(`${indent}Eliminate FAIL (Prop 1 - Cage): Contradiction updating cage state for ${cellId}=${finalDigit}`); // LOG
                 return false;
            }
        }

        for (const unit of CLASSIC_UNITS_MAP[cellId]) {
            var placesForDigit = [];
            for (const unitCellId of unit) {
                if ((candidatesMap[unitCellId] & cellMask) !== 0) placesForDigit.push(unitCellId);
            }
            if (placesForDigit.length === 0) {
                // console.log(`${indent}Eliminate FAIL (Rule 2a - Classic): No place left for ${digitToEliminate} in unit containing ${cellId}`); // LOG
                 return false;
            }
            if (placesForDigit.length === 1) {
                const targetCell = placesForDigit[0];
                if (candidatesMap[targetCell] !== cellMask) {
                     // console.log(`${indent}Eliminate PROP 2a: ${digitToEliminate} must be in ${targetCell} (only place in classic unit)`); // LOG
                    if (!assignValue(candidatesMap, solverData, targetCell, digitToEliminate, indent + "  ")) {
                        // console.log(`${indent}Eliminate FAIL (Prop 2a - Classic): Contradiction assigning ${digitToEliminate} to ${targetCell}`); // LOG
                        return false;
                    }
                }
            }
        }
         const cageIndex = solverData.cellToCageMap[cellId];
         if (cageIndex !== undefined) {
             const cage = solverData.cageDataArray[cageIndex];
             let placesForDigitInCage = [];
             for (const cageCellId of cage.cells) {
                 if (countCandidates(candidatesMap[cageCellId]) > 1 && (candidatesMap[cageCellId] & cellMask) !== 0) {
                     placesForDigitInCage.push(cageCellId);
                 }
             }
             if (placesForDigitInCage.length === 1) {
                  const targetCell = placesForDigitInCage[0];
                  if (candidatesMap[targetCell] !== cellMask) {
                       // console.log(`${indent}Eliminate PROP 2b: ${digitToEliminate} must be in ${targetCell} (only place in cage ${cageIndex})`); // LOG
                      if (!assignValue(candidatesMap, solverData, targetCell, digitToEliminate, indent + "  ")) {
                           // console.log(`${indent}Eliminate FAIL (Prop 2b - Cage): Contradiction assigning ${digitToEliminate} to ${targetCell}`); // LOG
                          return false;
                      }
                  }
             }
         }
        return true; // Elimination successful
    }

    /**
     * Updates cage state and propagates constraints based on the new state.
     */
    function updateCageStateOnAssign(candidatesMap, solverData, assignedCellId, assignedDigit, indent="") {
        const cageIndex = solverData.cellToCageMap[assignedCellId];
        if (cageIndex === undefined) return true;

        const cage = solverData.cageDataArray[cageIndex];
        const digitMask = DIGIT_MASKS[assignedDigit];

        if ((cage.currentValueMask & digitMask) !== 0) return true; // Avoid double processing

        // console.log(`${indent}Cage Update START: Cage ${cageIndex} cell ${assignedCellId}=${assignedDigit}. Before: sum=${cage.remainingSum}, cells=${cage.remainingCellsCount}`); // LOG

        cage.remainingSum -= assignedDigit;
        cage.remainingCellsCount -= 1;
        cage.currentValueMask |= digitMask;

        if (cage.remainingCellsCount < 0 || cage.remainingSum < 0) {
             console.error(`${indent}Cage Update FAIL: Cage ${cageIndex} invalid state - sum=${cage.remainingSum}, cells=${cage.remainingCellsCount}`); // LOG
             return false;
        }
        if (cage.remainingCellsCount === 0 && cage.remainingSum !== 0) {
            // console.log(`${indent}Cage Update FAIL: Cage ${cageIndex} filled, but remaining sum is ${cage.remainingSum}`); // LOG
            return false;
        }

        if (cage.remainingCellsCount > 0) {
            const comboInfo = killerSudoku.getSumCombinationInfo(cage.remainingSum, cage.remainingCellsCount);
            if (!comboInfo) {
                 // console.log(`${indent}Cage Update FAIL: Impossible sum ${cage.remainingSum} for ${cage.remainingCellsCount} cells in cage ${cageIndex}`); // LOG
                return false;
            }
            let allowedDigitsMask = comboInfo.digitMask;
            let requiredAvailableMask = allowedDigitsMask & ~cage.currentValueMask;

            if (requiredAvailableMask === 0 && cage.remainingSum > 0) {
                 // console.log(`${indent}Cage Update FAIL: Need digits for sum ${cage.remainingSum} in cage ${cageIndex}, but all required used.`); // LOG
                return false;
            }
            // console.log(`${indent}Cage Update Propagate: Cage ${cageIndex}, reqMask=${formatBitset(requiredAvailableMask)}`); // LOG

            for (const cellId of cage.cells) {
                if (cellId !== assignedCellId && countCandidates(candidatesMap[cellId]) > 1) {
                    const maskToApply = requiredAvailableMask;
                    const originalCandidates = candidatesMap[cellId];
                    const newCandidates = originalCandidates & maskToApply;
                    if (newCandidates !== originalCandidates) {
                        const eliminatedMask = originalCandidates & ~newCandidates;
                        // console.log(`${indent}  Prop to ${cellId}: elim mask ${formatBitset(eliminatedMask)}`); // LOG
                        for (let d = 1; d <= 9; d++) {
                            if ((eliminatedMask & DIGIT_MASKS[d]) !== 0) {
                                if (!eliminateCandidate(candidatesMap, solverData, cellId, d, indent + "    ")) {
                                    // console.log(`${indent}  Prop FAIL: Contradiction elim ${d} from ${cellId}`); // LOG
                                    return false;
                                }
                            }
                        }
                    }
                     if (candidatesMap[cellId] === 0) {
                        // console.log(`${indent}Cage Update FAIL: ${cellId} has 0 cands after cage ${cageIndex} propagation`); // LOG
                         return false;
                     }
                }
            }
        }
        // console.log(`${indent}Cage Update OK: Cage ${cageIndex}. After: sum=${cage.remainingSum}, cells=${cage.remainingCellsCount}`); // LOG
        return true;
    }


    // --- Solver Search Function ---
    /**
     * Recursive backtracking search function.
     */
    function _search(candidatesMap, solverData, indent="") {
        // console.log(`${indent}Search START`); // LOG - Verbose
        var isSolved = true;
        for (const cellId of killerSudoku.SQUARES) { if (countCandidates(candidatesMap[cellId]) !== 1) { isSolved = false; break; } }
        if (isSolved) { /*console.log(`${indent}Search BASE CASE: Solved!`);*/ return candidatesMap; }

        var minCandidates = 10, minCandidatesCell = null;
        for (const cellId of killerSudoku.SQUARES) { var numC = countCandidates(candidatesMap[cellId]); if (numC > 1 && numC < minCandidates) { minCandidates = numC; minCandidatesCell = cellId; if (minCandidates === 2) break; } }
        if (!minCandidatesCell) { /*console.log(`${indent}Search FAIL: No branch cell found?`);*/ return false; }

        // console.log(`${indent}Search BRANCH: Cell ${minCandidatesCell} (${minCandidates} cands: ${formatBitset(candidatesMap[minCandidatesCell])})`); // LOG
        var candidatesToTry = getCandidatesArray(candidatesMap[minCandidatesCell]);
        for (const digit of candidatesToTry) {
            // console.log(`${indent}  Try ${digit} for ${minCandidatesCell}`); // LOG
            var candidatesMapCopy = deepCopy(candidatesMap);
            var solverDataCopy = deepCopy(solverData); // Copy cage state too!
            if (assignValue(candidatesMapCopy, solverDataCopy, minCandidatesCell, digit, indent + "    ")) {
                var result = _search(candidatesMapCopy, solverDataCopy, indent + "  ");
                if (result) { /*console.log(`${indent}Search SUCCESS: Path found via ${minCandidatesCell}=${digit}`);*/ return result; }
            }
        }
        // console.log(`${indent}Search BACKTRACK from ${minCandidatesCell}`); // LOG
        return false;
    }


    // --- Public Solver Function ---
    killerSudoku.solve = function(cages) {
        console.log("Starting Killer Sudoku solver...");
        const solverData = killerSudoku._initializeSolverData(cages);
        if (!solverData) { console.error("Failed to initialize solver data."); return false; }

        var initialCandidatesMap = {};
        for (const cellId of killerSudoku.SQUARES) initialCandidatesMap[cellId] = ALL_CANDIDATES;

        console.log("Applying initial cage constraints (simplified)...");
        var propagationOk = true;
        for(let i = 0; i < solverData.cageDataArray.length; ++i) {
            const cage = solverData.cageDataArray[i];
            if (cage.initialDigitMask === 0 && cage.sum > 0 && cage.cells.length > 0) { console.error(`Cage ${i} impossible based on sum/size.`); propagationOk = false; break; }
            for(const cellId of cage.cells) { // ИСПОЛЬЗУЕМ cellId
                const originalCandidates = initialCandidatesMap[cellId];
                // Применяем ТОЛЬКО маску из getSumCombinationInfo
                const newCandidates = originalCandidates & cage.initialDigitMask;
                initialCandidatesMap[cellId] = newCandidates;

                 if (initialCandidatesMap[cellId] === 0) {
                    console.error(`Contradiction: ${cellId} has 0 cands after applying initial cage ${i} mask.`);
                    propagationOk = false; break;
                 }
                 // НЕ ВЫЗЫВАЕМ eliminateCandidate или updateCageState здесь
            }
            if (!propagationOk) break;
        }

        if (!propagationOk) { console.log("Initial constraint application failed."); return false; }
        console.log("Initial constraint application complete.");

        console.log("Starting recursive search...");
        // Начинаем поиск с начальными кандидатами и ОРИГИНАЛЬНЫМИ данными клеток
        var solutionMap = _search(initialCandidatesMap, deepCopy(solverData)); // Передаем копию solverData

        if (solutionMap) {
             console.log("Solver finished successfully.");
             let solutionString = "";
             for (const cellId of killerSudoku.SQUARES) {
                 let digit = getSingleCandidateDigit(solutionMap[cellId]);
                 solutionString += (digit > 0 ? digit : killerSudoku.BLANK_CHAR);
             }
             if (solutionString.length !== killerSudoku.NR_SQUARES || solutionString.includes(killerSudoku.BLANK_CHAR)) {
                  console.error("Solver returned incomplete/invalid map:", solutionMap);
                  return false;
             }
             return solutionString;
        } else {
            console.log("Solver could not find a solution.");
            return false;
        }
    };


    // --- GENERATOR IMPLEMENTATION ---
    function _generateClassicSolutionGrid(){var c={};for(const s of killerSudoku.SQUARES){if(typeof ALL_CANDIDATES==='undefined'){console.error("ALL_CANDS undef!");return false;}c[s]=ALL_CANDIDATES;}function searchClassic(a){var b=true;for(const c of killerSudoku.SQUARES){if(countCandidates(a[c])!==1){b=false;break;}}if(b)return a;var d=10,e=null;var f=_shuffleArray([...killerSudoku.SQUARES]);for(const g of f){var h=countCandidates(a[g]);if(h>1&&h<d){d=h;e=g;if(d===2)break;}}if(!e)return false;var i=_shuffleArray(getCandidatesArray(a[e]));for(const j of i){var k=deepCopy(a);if(_assignClassic(k,e,j)){var l=searchClassic(k);if(l)return l;}}return false;}function _assignClassic(a,b,c){var d=a[b]&~DIGIT_MASKS[c];for(let e=1;e<=9;e++){if((d&DIGIT_MASKS[e])!==0){if(!_eliminateClassic(a,b,e))return false;}}return true;}function _eliminateClassic(a,b,c){var d=DIGIT_MASKS[c];if((a[b]&d)===0)return true;a[b]&=~d;var e=a[b];var f=countCandidates(e);if(f===0)return false;if(f===1){var g=getSingleCandidateDigit(e);for(const h of CLASSIC_PEERS_MAP[b]){if(!_eliminateClassic(a,h,g))return false;}}for(const i of CLASSIC_UNITS_MAP[b]){var j=[];for(const k of i){if((a[k]&d)!==0)j.push(k);}if(j.length===0)return false;if(j.length===1){if(!_assignClassic(a,j[0],c))return false;}}return true;}var initAssign=_shuffleArray([...killerSudoku.SQUARES]);for(let i=0;i<10;i++){let sq=initAssign[i];let pDs=getCandidatesArray(c[sq]);if(pDs.length>0){let d=pDs[Math.floor(Math.random()*pDs.length)];if(!_assignClassic(c,sq,d)){console.warn("Init assign fail, restart.");for(const sq of killerSudoku.SQUARES)c[sq]=ALL_CANDIDATES;break;};}}var solMap=searchClassic(c);if(!solMap)return false;var resMap={};for(const sq of killerSudoku.SQUARES){resMap[sq]=getSingleCandidateDigit(solMap[sq]);if(resMap[sq]===0){console.error("Classic grid incomplete!");return false;}}return resMap;}
    function _partitionGridIntoCages(solvedGridMap, maxCageSize = 5, minCageSize = 2) { var cgs=[],unas=new Set(killerSudoku.SQUARES),map={};var maxAtt=killerSudoku.NR_SQUARES*10,att=0;/*console.log(`Partition grid. Init unassigned:${unas.size}`);*/while(unas.size>0&&att<maxAtt){att++;let remArr=Array.from(unas);let handledRem=false;if(remArr.length<=maxCageSize&&remArr.length>0){let attached=true;let toAttach=[...remArr];let successAtt=0;for(let i=toAttach.length-1;i>=0;i--){const remC=toAttach[i];const remD=solvedGridMap[remC];let cAtt=false;let targets=[];(SQUARE_NEIGHBORS[remC]||[]).forEach(n=>{const cO=map[n];if(cO?.id!==undefined){const tDigs=new Set(cO.cells.map(c=>solvedGridMap[c]));if(!tDigs.has(remD)&&cO.cells.length<9){if(!targets.some(t=>t.id===cO.id))targets.push(cO);}}});if(targets.length>0){const tCage=_shuffleArray(targets)[0];tCage.cells.push(remC);map[remC]=tCage;unas.delete(remC);successAtt++;cAtt=true;}if(!cAtt)attached=false;}if(!attached){remArr=Array.from(unas);if(remArr.length>0){console.warn(`Partition: Cannot attach ${remArr.length}. Forcing 1-cell cages.`);remArr.forEach(rc=>{const nCage={cells:[rc]};cgs.push(nCage);map[rc]=nCage;unas.delete(rc);});}}}handledRem=true;}if(unas.size===0)break;if(!handledRem){var startC=_getRandomElementFromSet(unas);if(!startC){console.warn("Partition: No start cell.");continue;}var cageCells=[startC];var cageDigits=new Set([solvedGridMap[startC]]);unas.delete(startC);const nCageObj={cells:cageCells};map[startC]=nCageObj;var remCnt=unas.size;var potMax=Math.min(maxCageSize,remCnt+1);if(remCnt>0&&remCnt+1>minCageSize&&remCnt+1-minCageSize<minCageSize){potMax=Math.min(maxCageSize,(remCnt+1)-minCageSize+1);}potMax=Math.max(minCageSize,potMax);var tSize=Math.floor(Math.random()*(potMax-minCageSize+1))+minCageSize;tSize=Math.min(tSize,remCnt+1);var added=true;while(cageCells.length<tSize&&added){added=false;let neighCand=[];for(const cell of cageCells){for(const n of(SQUARE_NEIGHBORS[cell]||[])){if(unas.has(n)&&!cageDigits.has(solvedGridMap[n])&&!neighCand.some(nc=>nc.cellId===n)){let freeCnt=0;(SQUARE_NEIGHBORS[n]||[]).forEach(nn=>{if(unas.has(nn))freeCnt++;});neighCand.push({cellId:n,freeNeighbors:freeCnt});}}}if(neighCand.length>0){neighCand.sort((a,b)=>a.freeNeighbors-b.freeNeighbors);var nextC=neighCand[0].cellId;cageCells.push(nextC);cageDigits.add(solvedGridMap[nextC]);unas.delete(nextC);map[nextC]=nCageObj;added=true;}}if(cageCells.length>=minCageSize){cgs.push(nCageObj);}else{cageCells.forEach(cell=>{unas.add(cell);delete map[cell];});}}}if(unas.size>0){console.error(`Partition failed definitively: ${unas.size} cells remain after ${att} attempts.`);return false;}cgs.forEach((cg,i)=>cg.id=i);console.log(`Partition OK: ${cgs.length} cages.`);return cgs;}
    function _calculateCageSums(cages, solvedGridMap) { cages.forEach(cg=>{cg.sum=0;cg.cells.forEach(cId=>{const d=solvedGridMap[cId];if(typeof d==='number'&&d>=1&&d<=9)cg.sum+=d;else{console.warn(`CalcSums: Inv digit ${cId}:`,d);cg.sum=NaN;}});if(isNaN(cg.sum))console.error("Cage sum NaN:",cg);});}
    var GENERATION_DIFFICULTY_PARAMS={"easy":{maxCage:6,minCage:2},"medium":{maxCage:5,minCage:2},"hard":{maxCage:5,minCage:2},"very-hard":{maxCage:4,minCage:2},"insane":{maxCage:4,minCage:2},"inhuman":{maxCage:4,minCage:2},"default":{maxCage:5,minCage:2}};
    killerSudoku.generate = function(difficulty = "medium", maxAttempts = 50) { console.log(`Generate Killer(diff:${difficulty}, att:${maxAttempts})`);var params=GENERATION_DIFFICULTY_PARAMS[difficulty];if(!params){console.warn(`Diff '${difficulty}' unknown, using default.`);params=GENERATION_DIFFICULTY_PARAMS.default;}if(!params){console.error("FATAL: Default difficulty params missing!");params={maxCage:5,minCage:2};}console.log(`Using params: maxCage=${params.maxCage}, minCage=${params.minCage}`);for(let att=1;att<=maxAttempts;++att){console.log(`Gen attempt ${att}/${maxAttempts}...`);/*console.log("Gen classic...");*/var solvedMap=_generateClassicSolutionGrid();if(!solvedMap){console.warn("Fail gen classic, retry...");continue;}/*console.log(`Partition grid(max:${params.maxCage}, min:${params.minCage})...`);*/var cagesCells=_partitionGridIntoCages(solvedMap,params.maxCage,params.minCage);if(!cagesCells){console.warn("Fail partition, retry gen...");continue;}/*console.log("Calc sums...");*/_calculateCageSums(cagesCells,solvedMap);if(cagesCells.some(cage=>isNaN(cage.sum))){console.error("Cage sum NaN. Retrying gen.");continue;}var puzzle={cages:cagesCells};console.log("Verify solvability...");var solveRes=killerSudoku.solve(deepCopy(puzzle.cages));if(solveRes&&typeof solveRes==='string'&&solveRes.length===killerSudoku.NR_SQUARES){console.log(`Gen OK after ${att} attempts!`);let genSolutionStr="";for(const sq of killerSudoku.SQUARES)genSolutionStr+=solvedMap[sq];if(solveRes!==genSolutionStr)console.warn("Solver result MISMATCHES generator base grid!");return puzzle;}else{console.warn(`Verify fail(Solver:${solveRes}).Retry gen...`);}}console.error(`Failed gen Killer after ${maxAttempts} attempts.`);return false;};

    // --- Utility Functions ---
    function cross(A, B) { var r=[];for(var i=0;i<A.length;i++)for(var j=0;j<B.length;j++)r.push(A[i]+B[j]);return r; }
    function _get_all_classic_units(rows, cols) { var u=[];for(var ri in rows)u.push(cross(rows[ri],cols));for(var ci in cols)u.push(cross(rows,cols[ci]));var rs=["ABC","DEF","GHI"],cs=["123","456","789"];for(var rsi in rs)for(var csi in cs)u.push(cross(rs[rsi],cs[csi]));return u;}
    function _get_classic_maps(squares, units) { var um={},pm={};for(var si in squares){var sq=squares[si];um[sq]=[];for(var ui in units){var u=units[ui];if(u.indexOf(sq)!==-1)um[sq].push(u);}pm[sq]=[];for(var sui in um[sq]){var u=um[sq][sui];for(var ui in u){var ps=u[ui];if(pm[sq].indexOf(ps)===-1&&ps!==sq)pm[sq].push(ps);}}}return {units_map:um,peers_map:pm};}
    function _shuffleArray(array) { for(let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } return array; }
    function _getRandomElementFromSet(set) { let items = Array.from(set); return items[Math.floor(Math.random() * items.length)]; }
    function _computeNeighbors(squares, squareMap) { const n={};const g=[];for(let r=0;r<9;r++)g.push(Array(9));squares.forEach((sq,idx)=>{const r=Math.floor(idx/9),c=idx%9;g[r][c]=sq;});for(let r=0;r<9;r++){for(let c=0;c<9;c++){const sq=g[r][c];n[sq]=[];if(r>0)n[sq].push(g[r-1][c]);if(r<8)n[sq].push(g[r+1][c]);if(c>0)n[sq].push(g[r][c-1]);if(c<8)n[sq].push(g[r][c+1]);}}return n; }

    // --- Library Initialization ---
    function initialize() {
        console.log("Initializing killerSudoku library...");
        killerSudoku.SQUARES = cross(ROWS, COLS);
        SQUARE_MAP = {};
        for(var i = 0; i < killerSudoku.NR_SQUARES; ++i) { SQUARE_MAP[killerSudoku.SQUARES[i]] = i; }
        CLASSIC_UNITS = _get_all_classic_units(ROWS, COLS);
        var classic_maps = _get_classic_maps(killerSudoku.SQUARES, CLASSIC_UNITS);
        CLASSIC_UNITS_MAP = classic_maps.units_map;
        CLASSIC_PEERS_MAP = classic_maps.peers_map;
        SQUARE_NEIGHBORS = _computeNeighbors(killerSudoku.SQUARES, SQUARE_MAP);
        console.log("killerSudoku library initialized.");
    }

    initialize();

})(this); // Pass the global object
