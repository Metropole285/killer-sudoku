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
        console.log("Initializing solver data...");
        if (!Array.isArray(cages)) { console.error("Invalid cages input: must be an array."); return false; }
        if (!SQUARE_MAP) { console.error("_initializeSolverData: SQUARE_MAP not initialized!"); return false; }

        var cellToCageMap = {};
        var cageDataArray = [];
        var assignedCells = {};

        for (var i = 0; i < cages.length; ++i) {
            var cage = cages[i];
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
                assignedCells[cellId] = i;
                cellToCageMap[cellId] = i;
                cageCells.push(cellId);
            }

            var combinationInfo = killerSudoku.getSumCombinationInfo(cage.sum, cageCells.length);

            cageDataArray.push({
                id: i,
                sum: cage.sum,
                cells: cageCells,
                initialDigitMask: combinationInfo ? combinationInfo.digitMask : 0,
                remainingSum: cage.sum,
                remainingCellsCount: cageCells.length,
                currentValueMask: 0,
            });
        }

         const assignedCount = Object.keys(assignedCells).length;
         if (assignedCount !== killerSudoku.NR_SQUARES) {
             console.error(`Invalid cage definition: Not all ${killerSudoku.NR_SQUARES} squares covered or some covered more than once. Covered: ${assignedCount}`);
             if (killerSudoku.SQUARES) { const missing = killerSudoku.SQUARES.filter(sq => assignedCells[sq] === undefined); if (missing.length > 0) console.error("Missing squares:", missing); }
             return false;
         }

        console.log("Solver data initialized successfully.");
        return { cellToCageMap: cellToCageMap, cageDataArray: cageDataArray };
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
            // Propagate to classic peers
            for (const peerId of CLASSIC_PEERS_MAP[cellId]) {
                 // Pass the same solverData down the chain
                if (!eliminateCandidate(candidatesMap, solverData, peerId, finalDigit)) return false;
            }
            // Propagate to cage peers (handled by updating cage state)
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
            // No explicit check for length 0, cage sum propagation handles it
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
            return true; // Already processed
        }
         // Check for unique digit violation (should not happen if logic is correct, but safety)
        if ( (cage.currentValueMask & digitMask) !== 0) {
             console.error(`Contradiction: Digit ${assignedDigit} assigned to ${assignedCellId} but already present in cage ${cageIndex}`);
             return false;
        }

        // Update cage state
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
            return false; // Cage filled, sum incorrect
        }

        // Propagate constraints if cage is not yet full
        if (cage.remainingCellsCount > 0) {
            const comboInfo = killerSudoku.getSumCombinationInfo(cage.remainingSum, cage.remainingCellsCount);
            if (!comboInfo) { // Remaining sum impossible for remaining cells
                 // console.log(`Contradiction Cage Sum: Impossible sum ${cage.remainingSum} for ${cage.remainingCellsCount} cells in cage ${cageIndex}`); // DEBUG
                return false;
            }

            let allowedDigitsMask = comboInfo.digitMask;
            // Digits that can form the sum AND are not already used in the cage
            let requiredAvailableMask = allowedDigitsMask & ~cage.currentValueMask;

            // If the required digits are empty, but sum > 0, contradiction
            if (requiredAvailableMask === 0 && cage.remainingSum > 0) {
                 // console.log(`Contradiction Cage Digits: Need digits for sum ${cage.remainingSum} in cage ${cageIndex} (mask ${allowedDigitsMask.toString(2)}) already used (mask ${cage.currentValueMask.toString(2)})`); // DEBUG
                return false;
            }

            // Propagate the refined mask to remaining cells in the cage
            for (const cellId of cage.cells) {
                // Only propagate to unsolved cells *other than* the one just assigned
                if (cellId !== assignedCellId && countCandidates(candidatesMap[cellId]) > 1) {
                    const maskToApply = requiredAvailableMask;
                    const originalCandidates = candidatesMap[cellId];
                    // Apply intersection: keep only candidates possible for remaining sum/digits
                    const newCandidates = originalCandidates & maskToApply;

                    if (newCandidates !== originalCandidates) {
                        // If candidates were removed, eliminate them formally
                        const eliminatedMask = originalCandidates & ~newCandidates;
                        for (let d = 1; d <= 9; d++) {
                            if ((eliminatedMask & DIGIT_MASKS[d]) !== 0) {
                                 // Pass the SAME solverData
                                if (!eliminateCandidate(candidatesMap, solverData, cellId, d)) {
                                    return false;
                                }
                            }
                        }
                    }
                     // Check for contradiction immediately after applying mask
                     if (candidatesMap[cellId] === 0) {
                         // console.log(`Contradiction: ${cellId} 0 cands after cage ${cageIndex} propagation`); // DEBUG
                         return false;
                     }
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
        // 1. Base Case: Is it solved? Check if all cells have exactly one candidate.
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
        // Iterate through squares to find the best one to branch on
        for (const cellId of killerSudoku.SQUARES) {
            var numCandidates = countCandidates(candidatesMap[cellId]);
            if (numCandidates > 1 && numCandidates < minCandidates) {
                minCandidates = numCandidates;
                minCandidatesCell = cellId;
                if (minCandidates === 2) break; // Optimization: cannot get better
            }
        }

        // If no cell found with > 1 candidate, but not solved (e.g., contradiction state)
        if (!minCandidatesCell) return false;

        // 3. Try assigning each candidate digit for the chosen cell
        var candidatesToTry = getCandidatesArray(candidatesMap[minCandidatesCell]);
        for (const digit of candidatesToTry) {
            // --- CRITICAL: Create deep copies for backtracking ---
            var candidatesMapCopy = deepCopy(candidatesMap);
            // solverData contains cage state which changes, so MUST be copied
            var solverDataCopy = deepCopy(solverData);

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
        // 1. Initialize and validate solver data from cages
        const solverData = killerSudoku._initializeSolverData(cages);
        if (!solverData) { console.error("Failed to initialize solver data. Cannot solve."); return false; }

        // 2. Create initial candidates map (all digits possible)
        var initialCandidatesMap = {};
        for (const cellId of killerSudoku.SQUARES) initialCandidatesMap[cellId] = ALL_CANDIDATES;

        // 3. Apply initial cage constraints based on sum/size combinations
        console.log("Applying initial cage constraints...");
        // Use a copy of solverData for this initial propagation phase
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
                // Intersect current candidates with those possible for the cage sum/size
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

                 // Check for contradiction immediately after applying mask
                 if (initialCandidatesMap[cellId] === 0) {
                    console.error(`Contradiction: ${cellId} has 0 cands after initial cage ${i} mask.`);
                    propagationOk = false; break;
                 }
                 // If a cell is solved by initial constraints, update the copied solver state
                 // This helps propagate further constraints early
                 if(countCandidates(initialCandidatesMap[cellId]) === 1) {
                    const singleDigit = getSingleCandidateDigit(initialCandidatesMap[cellId]);
                    // Pass the *copied* solver data, as state is changing
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
        var solutionMap = _search(initialCandidatesMap, initialSolverDataCopy); // Start search with propagated initial state

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
    /**
     * Generates a full, valid classic Sudoku solution grid.
     * Uses backtracking.
     * @returns {object | false} A map {cellId: digit} or false if failed.
     */
    function _generateClassicSolutionGrid() {
        var candidates = {};
        for (const sq of killerSudoku.SQUARES) {
            if (typeof ALL_CANDIDATES === 'undefined') { console.error("ALL_CANDIDATES undef!"); return false; }
            candidates[sq] = ALL_CANDIDATES;
        }
        // --- Вложенные функции для генерации ---
        function searchClassic(cands){var s=true;for(const sq of killerSudoku.SQUARES){if(countCandidates(cands[sq])!==1){s=false;break;}}if(s)return cands;var mC=10,mSq=null;var shufSqs=_shuffleArray([...killerSudoku.SQUARES]);for(const sq of shufSqs){var nC=countCandidates(cands[sq]);if(nC>1&&nC<mC){mC=nC;mSq=sq;if(mC===2)break;}}if(!mSq)return false;var tryDs=_shuffleArray(getCandidatesArray(cands[mSq]));for(const d of tryDs){var cCopy=deepCopy(cands);if(_assignClassic(cCopy,mSq,d)){var r=searchClassic(cCopy);if(r)return r;}}return false;}
        function _assignClassic(cands,sq,digit){var oDs=cands[sq]&~DIGIT_MASKS[digit];for(let d=1;d<=9;d++){if((oDs&DIGIT_MASKS[d])!==0){if(!_eliminateClassic(cands,sq,d))return false;}}return true;}
        function _eliminateClassic(cands,sq,digit){var mask=DIGIT_MASKS[digit];if((cands[sq]&mask)===0)return true;cands[sq]&=~mask;var rem=cands[sq];var cnt=countCandidates(rem);if(cnt===0)return false;if(cnt===1){var sD=getSingleCandidateDigit(rem);for(const p of CLASSIC_PEERS_MAP[sq]){if(!_eliminateClassic(cands,p,sD))return false;}}for(const u of CLASSIC_UNITS_MAP[sq]){var places=[];for(const uSq of u){if((cands[uSq]&mask)!==0)places.push(uSq);}if(places.length===0)return false;if(places.length===1){if(!_assignClassic(cands,places[0],digit))return false;}}return true;}
        // --- Начало поиска ---
        var initAssign=_shuffleArray([...killerSudoku.SQUARES]);for(let i=0;i<10;i++){let sq=initAssign[i];let pDs=getCandidatesArray(candidates[sq]);if(pDs.length>0){let d=pDs[Math.floor(Math.random()*pDs.length)];if(!_assignClassic(candidates,sq,d)){console.warn("Init assign fail, restart.");for(const sq of killerSudoku.SQUARES)candidates[sq]=ALL_CANDIDATES;break;};}}
        var solutionMap=searchClassic(candidates);
        if(!solutionMap)return false;
        var resultMap={};for(const sq of killerSudoku.SQUARES){resultMap[sq]=getSingleCandidateDigit(solutionMap[sq]);if(resultMap[sq]===0){console.error("Classic grid incomplete!");return false;}}return resultMap;
    }

    /**
     * Partitions the grid into cages using a simplified random walk.
     * @param {object} solvedGridMap - Map {cellId: digit} of the solved grid.
     * @param {number} maxCageSize - Maximum allowed size for a cage.
     * @param {number} minCageSize - Minimum allowed size for a cage.
     * @returns {object[] | false} Array of cages [{cells: string[]}] or false if partitioning failed.
     */
    function _partitionGridIntoCages(solvedGridMap, maxCageSize = 5, minCageSize = 2) {
        var cages = [];
        var unassignedCells = new Set(killerSudoku.SQUARES);
        var maxAttempts = killerSudoku.NR_SQUARES * 5; // Increased attempts slightly
        var attempts = 0;
        // console.log(`Partitioning grid. Initial unassigned: ${unassignedCells.size}`);

        while (unassignedCells.size > 0 && attempts < maxAttempts) {
            attempts++;
            // console.log(`Partition attempt ${attempts}, remaining cells: ${unassignedCells.size}`); // VERBOSE

            // --- Handle small remainders first ---
            let remainingCellsArray = Array.from(unassignedCells);
            // Only try to form a final cage if the count is within valid cage size limits
            if (remainingCellsArray.length >= minCageSize && remainingCellsArray.length <= maxCageSize) {
                const remainingDigits = new Set();
                let possible = true;
                remainingCellsArray.forEach(cell => {
                     const digit = solvedGridMap[cell];
                     if (remainingDigits.has(digit)) { possible = false; }
                     remainingDigits.add(digit);
                });

                if (possible) {
                    // console.log(`Partitioning: Creating final cage with remaining ${remainingCellsArray.length} cells.`); // VERBOSE
                    cages.push({ cells: remainingCellsArray });
                    unassignedCells.clear(); // All assigned
                    break; // Success
                }
                 // If final group is not possible (digit collision), let the loop continue to try different paths
            } else if (remainingCellsArray.length > 0 && remainingCellsArray.length < minCageSize) {
                  // This state means the previous cage creations left too few cells
                  console.error(`Partitioning failed: Cannot form cage. Remaining cells (${remainingCellsArray.length}) < minCageSize (${minCageSize}). Cells: ${remainingCellsArray.join(', ')}`);
                  return false; // Cannot form a valid cage with the remainder
            }
             // --- End remainder handling ---

             if (unassignedCells.size === 0) break; // Check again after potential remainder handling

            var startCell = _getRandomElementFromSet(unassignedCells);
            if (!startCell) { console.warn("Partitioning: Could not get start cell."); break; } // Safety

            var currentCage = [startCell];
            var cageDigits = new Set([solvedGridMap[startCell]]);
            unassignedCells.delete(startCell);
            // console.log(`Starting new cage with ${startCell}`); // VERBOSE

            var remainingCount = unassignedCells.size;
            var potentialMaxSize = Math.min(maxCageSize, remainingCount + 1);
            // Adjust potential max size to try and avoid leaving a remainder < minCageSize
            if (remainingCount > 0 && // Check if there are actually cells left to form another cage
                remainingCount + 1 > minCageSize && // Ensure we don't make current cage too big if few cells left
                remainingCount + 1 - minCageSize < minCageSize)
            {
                 potentialMaxSize = Math.min(maxCageSize, (remainingCount + 1) - minCageSize + 1 );
                 // console.log(`Adjusted potential max size to ${potentialMaxSize} to avoid small remainder`); // VERBOSE
            }
            potentialMaxSize = Math.max(minCageSize, potentialMaxSize); // Ensure not smaller than min

            var targetSize = Math.floor(Math.random() * (potentialMaxSize - minCageSize + 1)) + minCageSize;
            targetSize = Math.min(targetSize, remainingCount + 1); // Cannot be larger than available
            // console.log(`Target size for current cage: ${targetSize}`); // VERBOSE

            var addedInIteration = true;
            while (currentCage.length < targetSize && addedInIteration) {
                addedInIteration = false;
                var potentialNeighbors = [];
                // Get valid neighbors of *all* cells currently in the cage
                for (const cell of currentCage) {
                    for (const neighbor of (SQUARE_NEIGHBORS[cell] || [])) {
                        if (unassignedCells.has(neighbor) && !cageDigits.has(solvedGridMap[neighbor])) {
                             if (!potentialNeighbors.includes(neighbor)) potentialNeighbors.push(neighbor);
                        }
                    }
                }

                if (potentialNeighbors.length > 0) {
                    potentialNeighbors = _shuffleArray(potentialNeighbors);
                    var nextCell = potentialNeighbors[0];
                    currentCage.push(nextCell);
                    cageDigits.add(solvedGridMap[nextCell]);
                    unassignedCells.delete(nextCell);
                    addedInIteration = true;
                }
            } // End while growing cage

            // Check if the created cage meets min size
             if (currentCage.length >= minCageSize) {
                cages.push({ cells: currentCage });
                // console.log(`Created cage size ${currentCage.length}, cells: ${currentCage.join(',')}`); // DEBUG
             } else {
                 // Failed to create a valid cage, put cells back and try again from a different start
                 // console.warn(`Partitioning: Failed cage from ${startCell}, size ${currentCage.length}. Putting back.`); // DEBUG
                 currentCage.forEach(cell => unassignedCells.add(cell));
             }
        } // End while unassignedCells > 0

        if (unassignedCells.size > 0) {
             console.error(`Partitioning failed: ${unassignedCells.size} cells remain unassigned after ${attempts} attempts.`);
             return false; // Failed
        }

        console.log(`Partitioning successful: ${cages.length} cages created.`);
        return cages;
    }


    /**
     * Calculates and adds the 'sum' property to each cage object.
     * @param {object[]} cages - Array of cages [{cells: string[]}]
     * @param {object} solvedGridMap - Map {cellId: digit} of the solved grid.
     */
     function _calculateCageSums(cages, solvedGridMap) {
         cages.forEach(cage => {
             cage.sum = 0;
             cage.cells.forEach(cellId => {
                 cage.sum += solvedGridMap[cellId];
             });
         });
     }

    // --- Public Generator Function ---
    var GENERATION_DIFFICULTY_PARAMS = {
         "easy":      { maxCage: 6, minCage: 2 },
         "medium":    { maxCage: 5, minCage: 2 },
         "hard":      { maxCage: 5, minCage: 2 },
         "very-hard": { maxCage: 4, minCage: 2 },
         "insane":    { maxCage: 4, minCage: 2 },
         "inhuman":   { maxCage: 4, minCage: 2 },
         "default":   { maxCage: 5, minCage: 2 }
     };

    killerSudoku.generate = function(difficulty = "medium", maxAttempts = 20) {
         console.log(`Generate Killer(diff:${difficulty}, att:${maxAttempts})`);
         var params = GENERATION_DIFFICULTY_PARAMS[difficulty];
         // Fallback to default if difficulty not found or default is missing
         if (!params) { console.warn(`Diff '${difficulty}' unknown, using default.`); params = GENERATION_DIFFICULTY_PARAMS.default; }
         if (!params) { console.error("FATAL: Default difficulty params missing!"); params = { maxCage: 5, minCage: 2 }; } // Hardcoded fallback
         console.log(`Using params: maxCage=${params.maxCage}, minCage=${params.minCage}`);

         for (let attempt = 1; attempt <= maxAttempts; ++attempt) {
             console.log(`Gen attempt ${attempt}/${maxAttempts}...`);
             // 1. Generate classic solution
             console.log("Gen classic...");
             var solvedMap = _generateClassicSolutionGrid();
             if (!solvedMap) { console.warn("Fail gen classic, retry..."); continue; }

             // 2. Partition into cages
             console.log(`Partition grid(max:${params.maxCage}, min:${params.minCage})...`);
             var cagesCells = _partitionGridIntoCages(solvedMap, params.maxCage, params.minCage);
             if (!cagesCells) { console.warn("Fail partition, retry gen..."); continue; }

             // 3. Calculate sums
             console.log("Calc sums...");
             _calculateCageSums(cagesCells, solvedMap);
             var puzzle = { cages: cagesCells };

             // 4. Verification (check solvability)
             console.log("Verify solvability...");
             var solveRes = killerSudoku.solve(deepCopy(puzzle.cages)); // Use deep copy for solver
             if (solveRes && typeof solveRes === 'string' && solveRes.length === killerSudoku.NR_SQUARES) {
                 console.log(`Gen OK after ${attempt} attempts!`);
                 return puzzle; // Success!
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
        for(var i = 0; i < killerSudoku.SQUARES.length; ++i) { SQUARE_MAP[killerSudoku.SQUARES[i]] = i; }
        CLASSIC_UNITS = _get_all_classic_units(ROWS, COLS);
        var classic_maps = _get_classic_maps(killerSudoku.SQUARES, CLASSIC_UNITS);
        CLASSIC_UNITS_MAP = classic_maps.units_map;
        CLASSIC_PEERS_MAP = classic_maps.peers_map;
        SQUARE_NEIGHBORS = _computeNeighbors(killerSudoku.SQUARES, SQUARE_MAP); // Compute direct neighbors
        console.log("killerSudoku library initialized.");
    }

    initialize();

})(this); // Pass the global object
