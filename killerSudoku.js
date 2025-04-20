/*
    killerSudoku.js
    ---------------
    JavaScript library for Killer Sudoku puzzle generation and solving.
    Includes improved partitioning logic (Attempt 4 - Neighbor Priority).
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
        // console.log("Initializing solver data..."); // DEBUG
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
            if (cage.sum <= 0 && cage.cells.length > 0) { // Allow sum 0 only for empty cages?
                console.error(`Invalid cage sum (<= 0) at index ${i}:`, cage.sum); return false;
             }
            if (cage.cells.length > 9) { console.error(`Invalid cage size (> 9) at index ${i}:`, cage.cells.length); return false; }

            // Validate cells and check overlaps
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

             // Check min/max possible sum for cage size
             if (cage.cells.length > 0) {
                 var minPossibleSum = (cage.cells.length * (cage.cells.length + 1)) / 2;
                 var maxPossibleSum = (cage.cells.length * (19 - cage.cells.length)) / 2;
                 if (cage.sum < minPossibleSum || cage.sum > maxPossibleSum) {
                     console.error(`Invalid sum ${cage.sum} for cage size ${cage.cells.length} at index ${i}. Min: ${minPossibleSum}, Max: ${maxPossibleSum}`);
                     return false;
                 }
             }

            // Calculate initial digit mask based on sum/cell count
            var combinationInfo = killerSudoku.getSumCombinationInfo(cage.sum, cageCells.length);
             // If sum is impossible for the size, fail validation
             if (cage.cells.length > 0 && !combinationInfo) {
                  console.error(`Impossible sum ${cage.sum} for cage size ${cage.cells.length} at index ${i} (no combinations found).`);
                  return false;
             }

            cageDataArray.push({
                id: i, // Cage index (will be reassigned after partitioning potentially)
                sum: cage.sum,
                cells: cageCells, // Store validated cell IDs
                initialDigitMask: combinationInfo ? combinationInfo.digitMask : 0, // Mask of ALL possible digits
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

        // console.log("Solver data initialized successfully."); // Less verbose
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
        var otherCandidatesMask = candidatesMap[cellId] & ~DIGIT_MASKS[digitToAssign];
        // Eliminate all other candidates for this cell
        for (let d = 1; d <= 9; ++d) {
            if ((otherCandidatesMask & DIGIT_MASKS[d]) !== 0) {
                // Pass the same solverData object for recursive calls within assign
                if (!eliminateCandidate(candidatesMap, solverData, cellId, d)) {
                    return false; // Contradiction found during elimination
                }
            }
        }
        // Update cage state AFTER elimination ensures the cell is reduced
        if (!updateCageStateOnAssign(candidatesMap, solverData, cellId, digitToAssign)) {
            return false; // Contradiction during cage update
        }
        return true; // Assignment successful
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
        var cellMask = DIGIT_MASKS[digitToEliminate];
        // If already eliminated, return successfully
        if ((candidatesMap[cellId] & cellMask) === 0) return true;

        // Check dependencies are initialized
        if (!CLASSIC_PEERS_MAP || !CLASSIC_UNITS_MAP || !solverData?.cellToCageMap || !solverData?.cageDataArray) {
             console.error("Eliminate called before full initialization or with invalid solverData!");
             return false;
        }

        // Remove the candidate
        candidatesMap[cellId] &= ~cellMask;
        var remainingCandidates = candidatesMap[cellId];
        var numRemaining = countCandidates(remainingCandidates);

        // Contradiction 1: No candidates left
        if (numRemaining === 0) return false;

        // Propagation Rule 1: Single candidate left -> Eliminate from peers
        if (numRemaining === 1) {
            var finalDigit = getSingleCandidateDigit(remainingCandidates);
            // Classic Peers
            for (const peerId of CLASSIC_PEERS_MAP[cellId]) {
                 // Pass the same solverData down the chain
                if (!eliminateCandidate(candidatesMap, solverData, peerId, finalDigit)) return false;
            }
            // Cage update (which handles cage peers implicitly)
             // Pass the same solverData
            if (!updateCageStateOnAssign(candidatesMap, solverData, cellId, finalDigit)) return false;
        }

        // Propagation Rule 2: Only one place left for the digit in a unit
        // Classic Units
        for (const unit of CLASSIC_UNITS_MAP[cellId]) {
            var placesForDigit = [];
            for (const unitCellId of unit) {
                if ((candidatesMap[unitCellId] & cellMask) !== 0) placesForDigit.push(unitCellId);
            }
            if (placesForDigit.length === 0) return false; // Contradiction 2: Digit must be somewhere
            if (placesForDigit.length === 1) {
                // If only one place, assign it there (pass same solverData)
                if (!assignValue(candidatesMap, solverData, placesForDigit[0], digitToEliminate)) return false;
            }
        }
        // Cage Unit
        const cageIndex = solverData.cellToCageMap[cellId];
        if (cageIndex !== undefined) {
            const cage = solverData.cageDataArray[cageIndex];
            let placesForDigitInCage = [];
            for (const cageCellId of cage.cells) {
                // Only consider *unsolved* cells for this rule
                if (countCandidates(candidatesMap[cageCellId]) > 1 && (candidatesMap[cageCellId] & cellMask) !== 0) {
                    placesForDigitInCage.push(cageCellId);
                }
            }
            // If only one *unsolved* cell in the cage can hold this digit, assign it
            if (placesForDigitInCage.length === 1) {
                 // Pass the same solverData
                 if (!assignValue(candidatesMap, solverData, placesForDigitInCage[0], digitToEliminate)) return false;
            }
            // No explicit check for length 0 here, cage sum propagation handles it
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
        if ((cage.currentValueMask & digitMask) !== 0) return true;

        // Update state
        cage.remainingSum -= assignedDigit;
        cage.remainingCellsCount -= 1;
        cage.currentValueMask |= digitMask;

        // Check for basic state validity
        if (cage.remainingCellsCount < 0 || cage.remainingSum < 0) {
             console.error(`Cage ${cageIndex} invalid state: sum=${cage.remainingSum}, cells=${cage.remainingCellsCount}`);
             return false;
        }
        // Check final state if cage is now full
        if (cage.remainingCellsCount === 0 && cage.remainingSum !== 0) return false;

        // Propagate constraints if cage is not yet full
        if (cage.remainingCellsCount > 0) {
            const comboInfo = killerSudoku.getSumCombinationInfo(cage.remainingSum, cage.remainingCellsCount);
            if (!comboInfo) return false; // Remaining sum impossible

            let allowedDigitsMask = comboInfo.digitMask;
            // Digits that can form the sum AND are not already used in the cage
            let requiredAvailableMask = allowedDigitsMask & ~cage.currentValueMask;

            if (requiredAvailableMask === 0 && cage.remainingSum > 0) return false; // Need digits but all used

            // Propagate the refined mask to remaining cells in the cage
            for (const cellId of cage.cells) {
                // Only propagate to unsolved cells *other than* the one just assigned
                if (cellId !== assignedCellId && countCandidates(candidatesMap[cellId]) > 1) {
                    const maskToApply = requiredAvailableMask;
                    const originalCandidates = candidatesMap[cellId];
                    // Apply intersection
                    const newCandidates = originalCandidates & maskToApply;

                    if (newCandidates !== originalCandidates) {
                        // If candidates were removed, eliminate them formally
                        const eliminatedMask = originalCandidates & ~newCandidates;
                        for (let d = 1; d <= 9; d++) {
                            if ((eliminatedMask & DIGIT_MASKS[d]) !== 0) {
                                // Pass the SAME solverData
                                if (!eliminateCandidate(candidatesMap, solverData, cellId, d)) return false;
                            }
                        }
                    }
                     // Check for contradiction immediately after applying mask
                     if (candidatesMap[cellId] === 0) return false;
                }
            }
        }
        return true; // Update and propagation successful
    }


    // --- Solver Search Function ---
    /**
     * Recursive backtracking search function.
     * @param {object} candidatesMap - Current map { cellId: bitset }.
     * @param {SolverData} solverData - Current solver state.
     * @returns {object | false} The solved candidatesMap or false if no solution found from this state.
     */
    function _search(candidatesMap, solverData) {
        // 1. Base Case: Is it solved?
        var isSolved = true;
        for (const cellId of killerSudoku.SQUARES) {
            if (countCandidates(candidatesMap[cellId]) !== 1) {
                isSolved = false;
                break;
            }
        }
        if (isSolved) return candidatesMap; // Solved!

        // 2. Find cell with minimum remaining values (MRV heuristic)
        var minCandidates = 10;
        var minCandidatesCell = null;
        for (const cellId of killerSudoku.SQUARES) {
            var numCandidates = countCandidates(candidatesMap[cellId]);
            if (numCandidates > 1 && numCandidates < minCandidates) {
                minCandidates = numCandidates;
                minCandidatesCell = cellId;
                if (minCandidates === 2) break; // Optimization
            }
        }

        // If no cell found with > 1 candidate, but not solved (contradiction)
        if (!minCandidatesCell) return false;

        // 3. Try assigning each candidate digit for the chosen cell
        var candidatesToTry = getCandidatesArray(candidatesMap[minCandidatesCell]);
        for (const digit of candidatesToTry) {
            // --- CRITICAL: Create deep copies for backtracking ---
            var candidatesMapCopy = deepCopy(candidatesMap);
            var solverDataCopy = deepCopy(solverData); // Copy cage state too!

            // Try assigning the digit in the copy and propagating constraints
            if (assignValue(candidatesMapCopy, solverDataCopy, minCandidatesCell, digit)) {
                // If assignment and propagation didn't immediately fail, recurse
                var result = _search(candidatesMapCopy, solverDataCopy);
                if (result) {
                    // Solution found down this path! Return it up the stack.
                    return result;
                }
                 // else: This path failed, loop continues (backtrack)
            }
             // else: Assignment itself led to immediate contradiction, loop continues (backtrack)
        }

        // 4. Backtrack: None of the candidates worked for this cell
        return false;
    }


    // --- Public Solver Function ---
    killerSudoku.solve = function(cages) {
        console.log("Starting Killer Sudoku solver...");
        const solverData = killerSudoku._initializeSolverData(cages);
        if (!solverData) { console.error("Failed to initialize solver data."); return false; }

        var initialCandidatesMap = {};
        for (const cellId of killerSudoku.SQUARES) initialCandidatesMap[cellId] = ALL_CANDIDATES;

        console.log("Applying initial cage constraints...");
        var initialSolverDataCopy = deepCopy(solverData);
        var propagationOk = true;
        for(let i = 0; i < solverData.cageDataArray.length; ++i) {
            const cage = solverData.cageDataArray[i];
            if (cage.initialDigitMask === 0 && cage.sum > 0) { console.error(`Cage ${i} impossible.`); propagationOk = false; break; }
            for(const cellId of cage.cells) {
                const originalCandidates = initialCandidatesMap[cellId];
                const newCandidates = originalCandidates & cage.initialDigitMask;
                if (newCandidates !== originalCandidates) {
                     const eliminatedMask = originalCandidates & ~newCandidates;
                     for (let d = 1; d <= 9; d++) {
                         if ((eliminatedMask & DIGIT_MASKS[d]) !== 0) {
                             if (!eliminateCandidate(initialCandidatesMap, initialSolverDataCopy, cellId, d)) {
                                 console.error(`Contradiction init cage ${i} mask @ ${cId} (elim ${d})`);
                                 propagationOk = false; break;
                             }
                         }
                     }
                }
                if (!propagationOk) break;
                if (initialCandidatesMap[cellId] === 0) { console.error(`Contradiction: ${cellId} 0 cands after init cage ${i} mask.`); propagationOk = false; break; }
                if(countCandidates(initialCandidatesMap[cellId]) === 1) {
                   const singleDigit = getSingleCandidateDigit(initialCandidatesMap[cellId]);
                   if(!updateCageStateOnAssign(initialCandidatesMap, initialSolverDataCopy, cellId, singleDigit)){
                       console.error(`Contradiction update cage ${i} after init prop ${cId}=${sD}`);
                       propagationOk = false; break;
                   }
                }
            }
            if (!propagationOk) break;
        }

        if (!propagationOk) { console.log("Initial constraint propagation failed."); return false; }
        console.log("Initial constraint propagation complete.");

        console.log("Starting recursive search...");
        var solutionMap = _search(initialCandidatesMap, initialSolverDataCopy);

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


    // --- GENERATOR IMPLEMENTATION (Stage 2) ---
    /**
     * Generates a full, valid classic Sudoku solution grid.
     */
    function _generateClassicSolutionGrid(){
        var candidates={};for(const s of killerSudoku.SQUARES){if(typeof ALL_CANDIDATES==='undefined'){console.error("ALL_CANDS undef!");return false;}candidates[s]=ALL_CANDIDATES;}
        function searchClassic(a){var b=true;for(const c of killerSudoku.SQUARES){if(countCandidates(a[c])!==1){b=false;break;}}if(b)return a;var d=10,e=null;var f=_shuffleArray([...killerSudoku.SQUARES]);for(const g of f){var h=countCandidates(a[g]);if(h>1&&h<d){d=h;e=g;if(d===2)break;}}if(!e)return false;var i=_shuffleArray(getCandidatesArray(a[e]));for(const j of i){var k=deepCopy(a);if(_assignClassic(k,e,j)){var l=searchClassic(k);if(l)return l;}}return false;}
        function _assignClassic(a,b,c){var d=a[b]&~DIGIT_MASKS[c];for(let e=1;e<=9;e++){if((d&DIGIT_MASKS[e])!==0){if(!_eliminateClassic(a,b,e))return false;}}return true;}
        function _eliminateClassic(a,b,c){var d=DIGIT_MASKS[c];if((a[b]&d)===0)return true;a[b]&=~d;var e=a[b];var f=countCandidates(e);if(f===0)return false;if(f===1){var g=getSingleCandidateDigit(e);for(const h of CLASSIC_PEERS_MAP[b]){if(!_eliminateClassic(a,h,g))return false;}}for(const i of CLASSIC_UNITS_MAP[b]){var j=[];for(const k of i){if((a[k]&d)!==0)j.push(k);}if(j.length===0)return false;if(j.length===1){if(!_assignClassic(a,j[0],c))return false;}}return true;}
        var initAssign=_shuffleArray([...killerSudoku.SQUARES]);for(let i=0;i<10;i++){let sq=initAssign[i];let pDs=getCandidatesArray(candidates[sq]);if(pDs.length>0){let d=pDs[Math.floor(Math.random()*pDs.length)];if(!_assignClassic(candidates,sq,d)){console.warn("Init assign fail, restart.");for(const sq of killerSudoku.SQUARES)candidates[sq]=ALL_CANDIDATES;break;};}}
        var solMap=searchClassic(candidates);if(!solMap)return false;
        var resMap={};for(const sq of killerSudoku.SQUARES){resMap[sq]=getSingleCandidateDigit(solMap[sq]);if(resMap[sq]===0){console.error("Classic grid incomplete!");return false;}}return resMap;
    }

    /**
     * Partitions the grid into cages. Includes improved remainder handling.
     */
    function _partitionGridIntoCages(solvedGridMap, maxCageSize = 5, minCageSize = 2) {
        var cages = [];
        var unassignedCells = new Set(killerSudoku.SQUARES);
        var cellToCageObjectMap = {};

        var maxPartitionAttempts = killerSudoku.NR_SQUARES * 10;
        var partitionAttempts = 0;
        console.log(`Partitioning grid. Initial unassigned: ${unassignedCells.size}`);

        while (unassignedCells.size > 0 && partitionAttempts < maxPartitionAttempts) {
            partitionAttempts++;
            let remainingCellsArray = Array.from(unassignedCells);
            let handledRemainderThisIteration = false;

            // --- Попытка Обработки Остатка ---
            if (remainingCellsArray.length <= maxCageSize && remainingCellsArray.length > 0) {
                // console.log(`Partitioning: Handling remainder size ${remainingCellsArray.length}`);
                let attachedCompletely = true;
                let cellsToAttach = [...remainingCellsArray];
                let successfulAttachments = 0;

                // --- Сценарий 1: Попытка присоединить по одной ---
                for (let i = cellsToAttach.length - 1; i >= 0; i--) {
                    const remCell = cellsToAttach[i];
                    const remDigit = solvedGridMap[remCell];
                    let cellAttached = false;
                    let potentialTargets = [];
                    (SQUARE_NEIGHBORS[remCell] || []).forEach(neighbor => {
                        const cageObj = cellToCageObjectMap[neighbor];
                        if (cageObj && cageObj.id !== undefined) {
                           const targetCageDigits = new Set(cageObj.cells.map(c => solvedGridMap[c]));
                           if (!targetCageDigits.has(remDigit) && cageObj.cells.length < 9) {
                                if (!potentialTargets.some(t => t.id === cageObj.id)) potentialTargets.push(cageObj);
                           }
                        }
                    });
                    if (potentialTargets.length > 0) {
                         const targetCage = _shuffleArray(potentialTargets)[0];
                         // console.log(`Partitioning/Attach: Attaching ${remCell}(${remDigit}) to cage ${targetCage.id}`);
                         targetCage.cells.push(remCell);
                         cellToCageObjectMap[remCell] = targetCage;
                         unassignedCells.delete(remCell);
                         successfulAttachments++;
                         cellAttached = true;
                    }
                    if (!cellAttached) attachedCompletely = false;
                } // End loop attaching individual cells

                // --- Сценарий 2: Форсировать 1-клеточные кейджи из НЕПРИСОЕДИНЕННЫХ ---
                if (!attachedCompletely) {
                    remainingCellsArray = Array.from(unassignedCells);
                    if (remainingCellsArray.length > 0) {
                        console.warn(`Partitioning: Could not attach ${remainingCellsArray.length} cells. Forcing 1-cell cages.`);
                        remainingCellsArray.forEach(remCell => {
                            const newCage = { cells: [remCell] }; // Create 1-cell cage
                            cages.push(newCage);
                            cellToCageObjectMap[remCell] = newCage; // Map it
                            unassignedCells.delete(remCell); // Remove it
                        });
                    }
                }
                // Если мы дошли сюда, остаток обработан (либо присоединен, либо стали 1-клеточными)
                handledRemainderThisIteration = true;

            } // End handling remainder block

            if (unassignedCells.size === 0) break; // Exit main while loop if done

            // --- Обычный Рост Клетки ---
             if (!handledRemainderThisIteration) {
                var startCell = _getRandomElementFromSet(unassignedCells);
                if (!startCell) { console.warn("Partitioning: Could not get start cell."); continue; }

                var currentCageCells = [startCell];
                var currentCageDigits = new Set([solvedGridMap[startCell]]);
                unassignedCells.delete(startCell);
                const newCageObject = { cells: currentCageCells }; // Cage object created
                cellToCageObjectMap[startCell] = newCageObject; // Map start cell

                var remainingCount = unassignedCells.size;
                var potentialMaxSize = Math.min(maxCageSize, remainingCount + 1);
                if (remainingCount > 0 && remainingCount + 1 > minCageSize && remainingCount + 1 - minCageSize < minCageSize) {
                     potentialMaxSize = Math.min(maxCageSize, (remainingCount + 1) - minCageSize + 1 );
                }
                potentialMaxSize = Math.max(minCageSize, potentialMaxSize);
                var targetSize = Math.floor(Math.random() * (potentialMaxSize - minCageSize + 1)) + minCageSize;
                targetSize = Math.min(targetSize, remainingCount + 1);

                var addedInIteration = true;
                 while (currentCageCells.length < targetSize && addedInIteration) {
                     addedInIteration = false;
                     // --- ИЗМЕНЕНИЕ: Сбор и оценка соседей с приоритетом ---
                     let neighborCandidates = [];
                     for (const cell of currentCageCells) {
                         for (const neighbor of (SQUARE_NEIGHBORS[cell] || [])) {
                             if (unassignedCells.has(neighbor) &&
                                 !currentCageDigits.has(solvedGridMap[neighbor]) &&
                                 !neighborCandidates.some(nc => nc.cellId === neighbor))
                             {
                                 let freeCount = 0;
                                 (SQUARE_NEIGHBORS[neighbor] || []).forEach(nNeighbor => {
                                     if (unassignedCells.has(nNeighbor)) freeCount++;
                                 });
                                 neighborCandidates.push({ cellId: neighbor, freeNeighbors: freeCount });
                             }
                         }
                     }

                     if (neighborCandidates.length > 0) {
                         neighborCandidates.sort((a, b) => a.freeNeighbors - b.freeNeighbors); // Sort by fewest free neighbors first
                         var nextCell = neighborCandidates[0].cellId;
                         currentCageCells.push(nextCell);
                         currentCageDigits.add(solvedGridMap[nextCell]);
                         unassignedCells.delete(nextCell);
                         cellToCageObjectMap[nextCell] = newCageObject; // Map newly added cell
                         addedInIteration = true;
                     }
                     // --- КОНЕЦ ИЗМЕНЕНИЯ ---
                 } // End while growing cage

                  if (currentCageCells.length >= minCageSize) {
                      cages.push(newCageObject); // Add the created cage object
                  } else {
                      // Failed cage growth, put cells back
                      currentCageCells.forEach(cell => {
                          unassignedCells.add(cell);
                          delete cellToCageObjectMap[cell]; // Unmap cells
                      });
                  }
             } // end if !handledRemainderThisIteration

        } // End main while loop

        // Final check after loop
        if (unassignedCells.size > 0) {
             console.error(`Partitioning failed definitively: ${unassignedCells.size} cells remain unassigned after ${partitionAttempts} attempts.`);
             return false; // Failed
        }

        // Assign final IDs to cages
        cages.forEach((cage, index) => cage.id = index);

        console.log(`Partitioning successful: ${cages.length} cages created.`);
        return cages; // Return cages with cells and id
    }


    /**
     * Calculates and adds the 'sum' property to each cage object.
     */
     function _calculateCageSums(cages, solvedGridMap) {
         cages.forEach(cage => {
             cage.sum = 0;
             cage.cells.forEach(cellId => {
                 const digit = solvedGridMap[cellId];
                 if (typeof digit === 'number' && digit >= 1 && digit <= 9) {
                    cage.sum += digit;
                 } else {
                     console.warn(`_calculateCageSums: Invalid digit for cell ${cellId}:`, digit);
                     cage.sum = NaN; // Mark sum as invalid
                 }
             });
             if (isNaN(cage.sum)) console.error("Cage sum calculation failed for cage:", cage);
         });
     }

    // --- Public Generator Function ---
    var GENERATION_DIFFICULTY_PARAMS={"easy":{maxCage:6,minCage:2},"medium":{maxCage:5,minCage:2},"hard":{maxCage:5,minCage:2},"very-hard":{maxCage:4,minCage:2},"insane":{maxCage:4,minCage:2},"inhuman":{maxCage:4,minCage:2},"default":{maxCage:5,minCage:2}};
    killerSudoku.generate = function(difficulty = "medium", maxAttempts = 50) { // Increased attempts
         console.log(`Generate Killer(diff:${difficulty}, att:${maxAttempts})`);
         var params = GENERATION_DIFFICULTY_PARAMS[difficulty];
         if (!params) { console.warn(`Diff '${difficulty}' unknown, using default.`); params = GENERATION_DIFFICULTY_PARAMS.default; }
         if (!params) { console.error("FATAL: Default difficulty params missing!"); params = { maxCage: 5, minCage: 2 }; }
         console.log(`Using params: maxCage=${params.maxCage}, minCage=${params.minCage}`);

         for (let attempt = 1; attempt <= maxAttempts; ++attempt) {
             console.log(`Gen attempt ${attempt}/${maxAttempts}...`);
             console.log("Gen classic...");
             var solvedMap = _generateClassicSolutionGrid();
             if (!solvedMap) { console.warn("Fail gen classic, retry..."); continue; }

             console.log(`Partition grid(max:${params.maxCage}, min:${params.minCage})...`);
             var cagesCells = _partitionGridIntoCages(solvedMap, params.maxCage, params.minCage);
             if (!cagesCells) { console.warn("Fail partition, retry gen..."); continue; }

             console.log("Calc sums...");
             _calculateCageSums(cagesCells, solvedMap);
             if (cagesCells.some(cage => isNaN(cage.sum))) { console.error("Cage sum NaN. Retrying gen."); continue; }
             var puzzle = { cages: cagesCells }; // puzzle.cages now has cells, id, sum

             console.log("Verify solvability...");
             var solveRes = killerSudoku.solve(deepCopy(puzzle.cages)); // Use deep copy
             if (solveRes && typeof solveRes === 'string' && solveRes.length === killerSudoku.NR_SQUARES) {
                 console.log(`Gen OK after ${attempt} attempts!`);
                 // Optional consistency check
                 let genSolutionStr = ""; for(const sq of killerSudoku.SQUARES) genSolutionStr += solvedMap[sq];
                 if (solveRes !== genSolutionStr) console.warn("Solver result MISMATCHES generator base grid!");
                 return puzzle;
             } else {
                 console.warn(`Verify fail(Solver:${solveRes}).Retry gen...`);
             }
         }
         console.error(`Failed gen Killer after ${maxAttempts} attempts.`);
         return false; // All attempts failed
     };


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
