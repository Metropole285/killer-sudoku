/*
    killerSudoku.js
    ---------------
    JavaScript library for Killer Sudoku puzzle generation and solving.
    Contains implementations for core logic, solver, and generator.
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

    // --- Deep Copy Utility ---
    function deepCopy(obj) {
      if (obj === null || typeof obj !== 'object') { return obj; }
      if (obj instanceof Date) { return new Date(obj.getTime()); }
      // Set can be shallow copied as elements (numbers) are primitive
      if (obj instanceof Set) { return new Set(obj); }
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
        console.log("Initializing solver data..."); // DEBUG
        if (!Array.isArray(cages)) { console.error("Invalid cages input: must be an array."); return false; }
        if (!SQUARE_MAP) { console.error("_initializeSolverData: SQUARE_MAP not initialized!"); return false; } // Check dependency

        var cellToCageMap = {}; // Map: "A1" -> cageIndex
        var cageDataArray = []; // Array: [ { id, sum, cells, initialDigitMask, ... } ]
        var assignedCells = {}; // To check for overlapping cells

        for (var i = 0; i < cages.length; ++i) {
            var cage = cages[i];
            // Validate cage structure
            if (!cage || typeof cage.sum !== 'number' || !Array.isArray(cage.cells) || cage.cells.length === 0) {
                console.error(`Invalid cage format at index ${i}:`, cage); return false;
            }
            if (cage.sum <= 0) { console.error(`Invalid cage sum (> 0) at index ${i}:`, cage.sum); return false; }
            if (cage.cells.length > 9) { console.error(`Invalid cage size (<= 9) at index ${i}:`, cage.cells.length); return false; }

            var cageCells = [];
            for (var j = 0; j < cage.cells.length; ++j) {
                var cellId = cage.cells[j];
                if (typeof cellId !== 'string' || SQUARE_MAP[cellId] === undefined) {
                    console.error(`Invalid cell ID '${cellId}' in cage at index ${i}`); return false;
                }
                if (assignedCells[cellId] !== undefined) {
                    console.error(`Cell ${cellId} belongs to multiple cages (index ${i} and ${assignedCells[cellId]})`); return false;
                }
                assignedCells[cellId] = i; // Mark cell as assigned to this cage index
                cellToCageMap[cellId] = i; // Map cell to cage index
                cageCells.push(cellId);
            }

            // Calculate initial digit mask based on sum/cell count
            var combinationInfo = killerSudoku.getSumCombinationInfo(cage.sum, cageCells.length);
            // If combination is impossible from the start, mask will be 0. Solver should handle this.
            // if (!combinationInfo) {
            //     console.error(`Impossible combination for cage at index ${i}: sum=${cage.sum}, cells=${cageCells.length}`);
            //     return false; // Fail early if needed
            // }

            cageDataArray.push({
                id: i, // Cage index
                sum: cage.sum,
                cells: cageCells, // Store validated cell IDs
                initialDigitMask: combinationInfo ? combinationInfo.digitMask : 0, // Mask of ALL possible digits for this sum/size
                // Initial data for solver state:
                remainingSum: cage.sum,
                remainingCellsCount: cageCells.length,
                currentValueMask: 0, // Mask of values already placed in the cage
            });
        }

         // Check if all 81 squares are covered exactly once
         const assignedCount = Object.keys(assignedCells).length;
         if (assignedCount !== killerSudoku.NR_SQUARES) {
             console.error(`Invalid cage definition: Not all ${killerSudoku.NR_SQUARES} squares covered or some covered more than once. Covered: ${assignedCount}`);
             if (killerSudoku.SQUARES) { const missing = killerSudoku.SQUARES.filter(sq => assignedCells[sq] === undefined); if (missing.length > 0) console.error("Missing squares:", missing); }
             return false;
         }

        console.log("Solver data initialized successfully.");
        return { cellToCageMap: cellToCageMap, cageDataArray: cageDataArray }; // Return the data object
    };


    // --- Sum Combination Cache and Calculation ---
    var SUM_COMBINATION_CACHE = {};
    killerSudoku.getSumCombinationInfo = function(targetSum, numCells) {
        if (numCells <= 0 || numCells > 9 || targetSum <= 0) return null;
        var minPossibleSum = (numCells * (numCells + 1)) / 2;
        var maxPossibleSum = (numCells * (19 - numCells)) / 2;
        if (targetSum < minPossibleSum || targetSum > maxPossibleSum) { return null; }
        if (SUM_COMBINATION_CACHE[targetSum] && SUM_COMBINATION_CACHE[targetSum][numCells] !== undefined) {
            return SUM_COMBINATION_CACHE[targetSum][numCells];
        }
        // console.log(`Calculating combinations for sum=${targetSum}, cells=${numCells}`); // Less verbose
        var combinations = [];
        function findCombinationsRecursive(currentSum, k, startDigit, currentCombo) {
            if (currentSum === 0 && k === 0) { combinations.push([...currentCombo]); return; }
            if (currentSum < 0 || k === 0 || startDigit > 9) { return; }
            for (let digit = startDigit; digit <= 9; ++digit) {
                 let remainingK = k - 1;
                 // Improved pruning checks
                 let minRemainingSum = remainingK > 0 ? (remainingK * (digit + 1 + digit + remainingK)) / 2 : 0;
                 if (currentSum - digit < minRemainingSum) break; // Cannot reach target even with smallest remaining digits
                 let maxRemainingSumPossible = 0;
                 for(let r=0; r<remainingK; ++r) maxRemainingSumPossible += (9-r);
                 if (currentSum - digit > maxRemainingSumPossible) continue; // Cannot reach target even with largest remaining digits

                 currentCombo.push(digit);
                 findCombinationsRecursive(currentSum - digit, k - 1, digit + 1, currentCombo);
                 currentCombo.pop(); // Backtrack
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
        SUM_COMBINATION_CACHE[targetSum][numCells] = result; // Cache null if impossible
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
     * @returns {boolean} True if successful, false if contradiction found.
     */
    function assignValue(candidatesMap, solverData, cellId, digitToAssign) {
        // console.log(`Assign Val ${digitToAssign} to ${cellId}`); // DEBUG
        var otherCandidatesMask = candidatesMap[cellId] & ~DIGIT_MASKS[digitToAssign];
        for (let d = 1; d <= 9; ++d) {
            if ((otherCandidatesMask & DIGIT_MASKS[d]) !== 0) {
                // Pass the SAME solverData object for recursive calls within assign
                if (!eliminateCandidate(candidatesMap, solverData, cellId, d)) {
                    return false;
                }
            }
        }
        // Update cage state AFTER elimination
        if (!updateCageStateOnAssign(candidatesMap, solverData, cellId, digitToAssign)) {
            return false;
        }
        return true;
    }

    /**
     * Eliminates a candidate and propagates constraints.
     * Modifies the *passed* candidatesMap and solverData objects.
     * @param {object} candidatesMap - Map { cellId: bitset }
     * @param {SolverData} solverData - Current solver state.
     * @param {string} cellId - The cell from which to eliminate.
     * @param {number} digitToEliminate - The digit (1-9) to eliminate.
     * @returns {boolean} True if successful, false if contradiction found.
     */
    function eliminateCandidate(candidatesMap, solverData, cellId, digitToEliminate) {
        // console.log(`Eliminate ${digitToEliminate} from ${cellId}`); // DEBUG
        var cellMask = DIGIT_MASKS[digitToEliminate];
        if ((candidatesMap[cellId] & cellMask) === 0) return true; // Already eliminated

        // Check dependencies
        if (!CLASSIC_PEERS_MAP || !CLASSIC_UNITS_MAP || !solverData?.cellToCageMap || !solverData?.cageDataArray) {
             console.error("Eliminate called before full initialization or with invalid solverData!");
             return false;
        }

        candidatesMap[cellId] &= ~cellMask;
        var remainingCandidates = candidatesMap[cellId];
        var numRemaining = countCandidates(remainingCandidates);

        // Contradiction 1: No candidates left
        if (numRemaining === 0) {
             // console.log(`Contradiction 1: ${cellId} has 0 cands after elim ${digitToEliminate}`); // DEBUG
            return false;
        }

        // Propagation Rule 1: Single candidate left -> Eliminate from peers
        if (numRemaining === 1) {
            var finalDigit = getSingleCandidateDigit(remainingCandidates);
            // console.log(`Single cand rule: ${cellId} = ${finalDigit}`); // DEBUG
            // Classic Peers
            for (const peerId of CLASSIC_PEERS_MAP[cellId]) {
                 // Pass the SAME solverData
                if (!eliminateCandidate(candidatesMap, solverData, peerId, finalDigit)) {
                    return false;
                }
            }
            // Cage update (which handles cage peers implicitly)
             // Pass the SAME solverData
            if (!updateCageStateOnAssign(candidatesMap, solverData, cellId, finalDigit)) {
                 return false;
            }
        }

        // Propagation Rule 2: Only one place left for the digit in a unit
        // Classic Units
        for (const unit of CLASSIC_UNITS_MAP[cellId]) {
            var placesForDigit = [];
            for (const unitCellId of unit) {
                if ((candidatesMap[unitCellId] & cellMask) !== 0) placesForDigit.push(unitCellId);
            }
            if (placesForDigit.length === 0) { // Contradiction 2: Digit must be somewhere
                // console.log(`Contradiction 2a: No place for ${digitToEliminate} in classic unit of ${cellId}`); // DEBUG
                 return false;
            }
            if (placesForDigit.length === 1) {
                // console.log(`Single place classic: ${digitToEliminate} must be in ${placesForDigit[0]}`); // DEBUG
                 // Pass the SAME solverData
                if (!assignValue(candidatesMap, solverData, placesForDigit[0], digitToEliminate)) {
                    return false;
                }
            }
        }
        // Cage Unit
         const cageIndex = solverData.cellToCageMap[cellId];
         if (cageIndex !== undefined) {
             const cage = solverData.cageDataArray[cageIndex];
             let placesForDigitInCage = [];
             for (const cageCellId of cage.cells) {
                 // Only consider *unsolved* cells in the cage for this rule
                 if (countCandidates(candidatesMap[cageCellId]) > 1 && (candidatesMap[cageCellId] & cellMask) !== 0) {
                     placesForDigitInCage.push(cageCellId);
                 }
             }
             // If only one *unsolved* cell in the cage can hold this digit, assign it
             if (placesForDigitInCage.length === 1) {
                  // console.log(`Single place cage: ${digitToEliminate} must be in ${placesForDigitInCage[0]}`); // DEBUG
                   // Pass the SAME solverData
                  if (!assignValue(candidatesMap, solverData, placesForDigitInCage[0], digitToEliminate)) {
                      return false;
                  }
             }
             // No explicit check for length 0 here, cage sum propagation is more robust
         }

        return true; // Elimination successful
    }

    /**
     * Updates cage state and propagates constraints based on the new state.
     * Modifies the *passed* candidatesMap and solverData objects.
     * @param {object} candidatesMap - Map { cellId: bitset }
     * @param {SolverData} solverData - Current solver state.
     * @param {string} assignedCellId - The cell that got a value.
     * @param {number} assignedDigit - The digit assigned.
     * @returns {boolean} True if successful, false if contradiction.
     */
    function updateCageStateOnAssign(candidatesMap, solverData, assignedCellId, assignedDigit) {
        const cageIndex = solverData.cellToCageMap[assignedCellId];
        if (cageIndex === undefined) return true; // Not in a cage

        const cage = solverData.cageDataArray[cageIndex];
        const digitMask = DIGIT_MASKS[assignedDigit];

        // Avoid double processing if propagation already handled this
        if ((cage.currentValueMask & digitMask) !== 0) {
            return true;
        }
         // console.log(`Updating Cage ${cageIndex} for ${assignedDigit} @ ${assignedCellId}: before sum=${cage.remainingSum}, cells=${cage.remainingCellsCount}`); // DEBUG

        // Update state BEFORE checks
        cage.remainingSum -= assignedDigit;
        cage.remainingCellsCount -= 1;
        cage.currentValueMask |= digitMask;

        // Check for basic state validity
        if (cage.remainingCellsCount < 0 || cage.remainingSum < 0) {
             console.error(`Cage ${cageIndex} invalid state: sum=${cage.remainingSum}, cells=${cage.remainingCellsCount}`);
             return false;
        }
        // Check final state if cage is now full
        if (cage.remainingCellsCount === 0 && cage.remainingSum !== 0) {
             // console.log(`Contradiction Cage Filled: Cage ${cageIndex} filled, but rem sum is ${cage.remainingSum}`); // DEBUG
            return false;
        }

        // Propagate constraints if cage is not yet full
        if (cage.remainingCellsCount > 0) {
            const comboInfo = killerSudoku.getSumCombinationInfo(cage.remainingSum, cage.remainingCellsCount);
            if (!comboInfo) {
                 // console.log(`Contradiction Cage Sum: Impossible sum ${cage.remainingSum} for ${cage.remainingCellsCount} cells in cage ${cageIndex}`); // DEBUG
                return false; // Remaining sum impossible for remaining cells
            }

            let allowedDigitsMask = comboInfo.digitMask;
            // Digits that can form the sum AND are not already used in the cage
            let requiredAvailableMask = allowedDigitsMask & ~cage.currentValueMask;

            // If the required digits are empty, but sum > 0, contradiction
            if (requiredAvailableMask === 0 && cage.remainingSum > 0) {
                 // console.log(`Contradiction Cage Digits: Need digits for sum ${cage.remainingSum} in cage ${cageIndex}, but all required are used.`); // DEBUG
                return false;
            }

            // Propagate the refined mask to remaining cells in the cage
            for (const cellId of cage.cells) {
                // Only propagate to unsolved cells *other than* the one just assigned
                if (cellId !== assignedCellId && countCandidates(candidatesMap[cellId]) > 1) {
                    const maskToApply = requiredAvailableMask;
                    const originalCandidates = candidatesMap[cellId];
                    // Apply the intersection: only keep candidates that are BOTH originally possible AND possible for the remaining sum/digits
                    const newCandidates = originalCandidates & maskToApply;

                    if (newCandidates !== originalCandidates) {
                        // If candidates were removed, eliminate them formally to trigger further propagation
                        const eliminatedMask = originalCandidates & ~newCandidates;
                        // console.log(`Cage ${cageIndex} propagating to ${cellId}: elim mask ${eliminatedMask.toString(2)}`); // DEBUG
                        for (let d = 1; d <= 9; d++) {
                            if ((eliminatedMask & DIGIT_MASKS[d]) !== 0) {
                                // Pass the SAME solverData
                                if (!eliminateCandidate(candidatesMap, solverData, cellId, d)) {
                                    return false;
                                }
                            }
                        }
                    }
                     // Check if applying the mask directly caused a contradiction
                     if (candidatesMap[cellId] === 0) {
                         // console.log(`Contradiction: ${cellId} 0 cands after cage ${cageIndex} propagation`); // DEBUG
                         return false;
                     }
                }
            }
        }
        // console.log(`Cage ${cageIndex} updated OK: final sum=${cage.remainingSum}, cells=${cage.remainingCellsCount}`); // DEBUG
        return true; // Update successful
    }


    // --- Solver Search Function ---
    function _search(candidatesMap, solverData) {
        // console.log("Enter search"); // DEBUG
        var isSolved = true;
        for (const cellId of killerSudoku.SQUARES) {
            if (countCandidates(candidatesMap[cellId]) !== 1) { isSolved = false; break; }
        }
        if (isSolved) { /*console.log("Search Base case: Solved!");*/ return candidatesMap; }

        // MRV Heuristic: Find unsolved cell with fewest candidates
        var minCandidates = 10, minCandidatesCell = null;
        for (const cellId of killerSudoku.SQUARES) {
            var numCandidates = countCandidates(candidatesMap[cellId]);
            if (numCandidates > 1 && numCandidates < minCandidates) {
                minCandidates = numCandidates; minCandidatesCell = cellId;
                if (minCandidates === 2) break; // Optimization
            }
        }

        // If no cell found (e.g., contradiction state already reached but not caught)
        if (!minCandidatesCell) {
             // console.log("Search: No branch cell found, but not solved?"); // DEBUG
            return false;
        }

        // console.log(`Search branch on ${minCandidatesCell} (${minCandidates} cands)`); // DEBUG
        var candidatesToTry = getCandidatesArray(candidatesMap[minCandidatesCell]);
        for (const digit of candidatesToTry) {
            // console.log(`Trying ${digit} for ${minCandidatesCell}`); // DEBUG
            // --- CRITICAL: Create deep copies for backtracking ---
            var candidatesMapCopy = deepCopy(candidatesMap);
            var solverDataCopy = deepCopy(solverData); // Copy cage state too!

            // Try assigning the digit in the copy and propagating
            if (assignValue(candidatesMapCopy, solverDataCopy, minCandidatesCell, digit)) {
                // If assignment didn't immediately fail, recurse
                var result = _search(candidatesMapCopy, solverDataCopy);
                if (result) {
                    // Solution found down this path!
                    return result;
                }
                 // else: This path failed, continue loop (backtrack)
            }
             // else: Assignment failed immediately, continue loop (backtrack)
        }

        // Backtrack: None of the candidates worked for this cell
        // console.log(`Backtrack from ${minCandidatesCell}`); // DEBUG
        return false;
    }


    // --- Public Solver Function ---
    killerSudoku.solve = function(cages) {
        console.log("Starting Killer Sudoku solver...");
        // 1. Initialize and validate solver data from cages
        const solverData = killerSudoku._initializeSolverData(cages);
        if (!solverData) { console.error("Failed to initialize solver data."); return false; }

        // 2. Create initial candidates map (all digits possible)
        var initialCandidatesMap = {};
        for (const cellId of killerSudoku.SQUARES) initialCandidatesMap[cellId] = ALL_CANDIDATES;

        // 3. Apply initial cage constraints based on sum/size combinations
        console.log("Applying initial cage constraints...");
        // Use a copy of solverData for this initial propagation phase
        // because eliminateCandidate/assignValue modify it
        var initialSolverDataCopy = deepCopy(solverData);
        var propagationOk = true; // Flag to track success
        for(let i = 0; i < solverData.cageDataArray.length; ++i) {
            const cage = solverData.cageDataArray[i]; // Read from original for mask
            // Check if the cage is impossible from the start
            if (cage.initialDigitMask === 0 && cage.sum > 0) {
                console.error(`Cage ${i} sum=${cage.sum} size=${cage.cells.length} is impossible.`);
                return false; // No solution possible
            }
            // Apply the initial mask to all cells in the cage
            for(const cellId of cage.cells) {
                const originalCandidates = initialCandidatesMap[cellId];
                const newCandidates = originalCandidates & cage.initialDigitMask;
                if (newCandidates !== originalCandidates) {
                     const eliminatedMask = originalCandidates & ~newCandidates;
                     for (let d = 1; d <= 9; d++) {
                         if ((eliminatedMask & DIGIT_MASKS[d]) !== 0) {
                             // Eliminate using the copied solver data state
                             if (!eliminateCandidate(initialCandidatesMap, initialSolverDataCopy, cellId, d)) {
                                  console.error(`Contradiction applying initial cage ${i} mask to ${cellId} (eliminating ${d})`);
                                 propagationOk = false; break; // Stop inner loop
                             }
                         }
                     }
                }
                if (!propagationOk) break; // Stop outer loop if contradiction

                 // Check for contradiction after applying mask
                 if (initialCandidatesMap[cellId] === 0) {
                    console.error(`Contradiction: ${cellId} has 0 cands after initial cage ${i} mask.`);
                    propagationOk = false; break;
                 }
                 // If a cell is solved by initial constraints, update the copied solver state
                 if(countCandidates(initialCandidatesMap[cellId]) === 1) {
                    const singleDigit = getSingleCandidateDigit(initialCandidatesMap[cellId]);
                    if(!updateCageStateOnAssign(initialCandidatesMap, initialSolverDataCopy, cellId, singleDigit)){
                        console.error(`Contradiction updating initial cage ${i} state after prop solved ${cellId}=${singleDigit}`);
                        propagationOk = false; break;
                    }
                 }
            }
            if (!propagationOk) break; // Stop iterating cages if contradiction
        }

        if (!propagationOk) {
             console.log("Initial constraint propagation failed.");
             return false; // Stop if initial state is contradictory
        }
         console.log("Initial constraint propagation complete.");

        // 4. Start the recursive search with the refined initial state
        console.log("Starting recursive search...");
        var solutionMap = _search(initialCandidatesMap, initialSolverDataCopy);

        // 5. Format and return result
        if (solutionMap) {
            console.log("Solver finished successfully.");
            let solutionString = "";
            for (const cellId of killerSudoku.SQUARES) {
                let digit = getSingleCandidateDigit(solutionMap[cellId]);
                solutionString += (digit > 0 ? digit : killerSudoku.BLANK_CHAR);
            }
            // Final check of the solved string
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


    // --- GENERATOR IMPLEMENTATION (Stage 2) ---
    function _generateClassicSolutionGrid(){var c={};for(const s of killerSudoku.SQUARES){if(typeof ALL_CANDIDATES==='undefined'){console.error("ALL_CANDS undef!");return false;}c[s]=ALL_CANDIDATES;}function searchClassic(a){var b=true;for(const c of killerSudoku.SQUARES){if(countCandidates(a[c])!==1){b=false;break;}}if(b)return a;var d=10,e=null;var f=_shuffleArray([...killerSudoku.SQUARES]);for(const g of f){var h=countCandidates(a[g]);if(h>1&&h<d){d=h;e=g;if(d===2)break;}}if(!e)return false;var i=_shuffleArray(getCandidatesArray(a[e]));for(const j of i){var k=deepCopy(a);if(_assignClassic(k,e,j)){var l=searchClassic(k);if(l)return l;}}return false;}function _assignClassic(a,b,c){var d=a[b]&~DIGIT_MASKS[c];for(let e=1;e<=9;e++){if((d&DIGIT_MASKS[e])!==0){if(!_eliminateClassic(a,b,e))return false;}}return true;}function _eliminateClassic(a,b,c){var d=DIGIT_MASKS[c];if((a[b]&d)===0)return true;a[b]&=~d;var e=a[b];var f=countCandidates(e);if(f===0)return false;if(f===1){var g=getSingleCandidateDigit(e);for(const h of CLASSIC_PEERS_MAP[b]){if(!_eliminateClassic(a,h,g))return false;}}for(const i of CLASSIC_UNITS_MAP[b]){var j=[];for(const k of i){if((a[k]&d)!==0)j.push(k);}if(j.length===0)return false;if(j.length===1){if(!_assignClassic(a,j[0],c))return false;}}return true;}var initAssign=_shuffleArray([...killerSudoku.SQUARES]);for(let i=0;i<10;i++){let sq=initAssign[i];let pDs=getCandidatesArray(c[sq]);if(pDs.length>0){let d=pDs[Math.floor(Math.random()*pDs.length)];if(!_assignClassic(c,sq,d)){console.warn("Init assign fail, restart.");for(const sq of killerSudoku.SQUARES)c[sq]=ALL_CANDIDATES;break;};}}var solMap=searchClassic(c);if(!solMap)return false;var resMap={};for(const sq of killerSudoku.SQUARES){resMap[sq]=getSingleCandidateDigit(solMap[sq]);if(resMap[sq]===0){console.error("Classic grid incomplete!");return false;}}return resMap;}
    function _partitionGridIntoCages(solvedGridMap,maxCageSize=5,minCageSize=2){var cgs=[],unas=new Set(killerSudoku.SQUARES),maxAtt=killerSudoku.NR_SQUARES*5,att=0;while(unas.size>0&&att<maxAtt){att++;let remArr=Array.from(unas);if(remArr.length<=maxCageSize&&remArr.length>=minCageSize){const remDig=new Set();let poss=true;remArr.forEach(cl=>{const dig=solvedGridMap[cl];if(remDig.has(dig))poss=false;remDig.add(dig);});if(poss){console.log(`Partition: Final cage size ${remArr.length}.`);cgs.push({cells:remArr});unas.clear();break;}}if(unas.size===0)break;var startC=_getRandomElementFromSet(unas);if(!startC)break;var cage=[startC];var digits=new Set([solvedGridMap[startC]]);unas.delete(startC);var remCnt=unas.size;var potMax=Math.min(maxCageSize,remCnt+1);if(remCnt+1-minCageSize<minCageSize&&remCnt+1>minCageSize)potMax=Math.min(maxCageSize,(remCnt+1)-minCageSize+1);potMax=Math.max(minCageSize,potMax);var tSize=Math.floor(Math.random()*(potMax-minCageSize+1))+minCageSize;tSize=Math.min(tSize,remCnt+1);var added=true;while(cage.length<tSize&&added){added=false;var potN=[];let cageSet=new Set(cage);for(const cell of cage){for(const n of(SQUARE_NEIGHBORS[cell]||[])){if(unas.has(n)&&!digits.has(solvedGridMap[n])){if(!potN.includes(n))potN.push(n);}}}if(potN.length>0){potN=_shuffleArray(potN);var nextC=potN[0];cage.push(nextC);digits.add(solvedGridMap[nextC]);unas.delete(nextC);added=true;}}if(cage.length>=minCageSize)cgs.push({cells:cage});else{cage.forEach(c=>unas.add(c));if(att>maxAtt/2)maxAtt++;}}if(unas.size>0){console.error(`Partition fail: ${unas.size} left.`);return false;}console.log(`Partition OK: ${cgs.length} cages.`);return cgs;}
    function _calculateCageSums(cages,solvedMap){cages.forEach(cg=>{cg.sum=0;cg.cells.forEach(cId=>{cg.sum+=solvedMap[cId];});});}
    var GENERATION_DIFFICULTY_PARAMS={"easy":{maxCage:6,minCage:2},"medium":{maxCage:5,minCage:2},"hard":{maxCage:5,minCage:2},"very-hard":{maxCage:4,minCage:2},"insane":{maxCage:4,minCage:2},"inhuman":{maxCage:4,minCage:2},"default":{maxCage:5,minCage:2}};
    killerSudoku.generate=function(difficulty="medium",maxAttempts=20){console.log(`Generate Killer(diff:${difficulty},att:${maxAttempts})`);var params=GENERATION_DIFFICULTY_PARAMS[difficulty];if(!params){console.warn(`Diff '${difficulty}' unknown, using default.`);params=GENERATION_DIFFICULTY_PARAMS.default;}if(!params){console.error("Default difficulty params missing!");params={maxCage:5,minCage:2};}console.log(`Using params: maxCage=${params.maxCage}, minCage=${params.minCage}`);for(let att=1;att<=maxAttempts;++att){console.log(`Gen attempt ${att}/${maxAttempts}...`);console.log("Gen classic...");var solvedMap=_generateClassicSolutionGrid();if(!solvedMap){console.warn("Fail gen classic, retry...");continue;}console.log(`Partition grid(max:${params.maxCage},min:${params.minCage})...`);var cagesCells=_partitionGridIntoCages(solvedMap,params.maxCage,params.minCage);if(!cagesCells){console.warn("Fail partition, retry gen...");continue;}console.log("Calc sums...");_calculateCageSums(cagesCells,solvedMap);var puzzle={cages:cagesCells};console.log("Verify solvability...");var solveRes=killerSudoku.solve(deepCopy(puzzle.cages));if(solveRes&&typeof solveRes==='string'&&solveRes.length===killerSudoku.NR_SQUARES){console.log(`Gen OK after ${att} attempts!`);return puzzle;}else{console.warn(`Verify fail(Solver:${solveRes}).Retry gen...`);}}console.error(`Failed gen Killer after ${maxAttempts} attempts.`);return false;};


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
        for(var i = 0; i < killerSudoku.SQUARES.length; ++i) { SQUARE_MAP[killerSudoku.SQUARES[i]] = i; }
        CLASSIC_UNITS = _get_all_classic_units(ROWS, COLS);
        var classic_maps = _get_classic_maps(killerSudoku.SQUARES, CLASSIC_UNITS);
        CLASSIC_UNITS_MAP = classic_maps.units_map;
        CLASSIC_PEERS_MAP = classic_maps.peers_map;
        SQUARE_NEIGHBORS = _computeNeighbors(killerSudoku.SQUARES, SQUARE_MAP);
        console.log("killerSudoku library initialized.");
    }

    initialize();

})(this); // Pass the global object
