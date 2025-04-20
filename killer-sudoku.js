/*
    killerSudoku.js
    ---------------
    JavaScript library for Killer Sudoku puzzle generation and solving.
*/

(function(root) {
    var killerSudoku = root.killerSudoku = {};

    killerSudoku.DIGITS = "123456789";
    var ROWS = "ABCDEFGHI";
    var COLS = killerSudoku.DIGITS;
    killerSudoku.NR_SQUARES = 81;
    killerSudoku.BLANK_CHAR = '.';

    // --- Precomputed Data ---
    killerSudoku.SQUARES = null; // Array: ["A1", ..., "I9"]
    var SQUARE_MAP = null;       // Map: {"A1": 0, ...}
    var CLASSIC_UNITS = null;    // Array of classic units (rows, cols, boxes)
    var CLASSIC_UNITS_MAP = null;// Map: "A1" -> [unit1, unit2, unit3]
    var CLASSIC_PEERS_MAP = null;// Map: "A1" -> ["A2", "B1", "B2", ...] (Classic Sudoku peers)
    var SQUARE_NEIGHBORS = {};   // Map: "A1" -> ["A2", "B1"] (Direct orthogonal neighbors)


    // --- Bitset Constants and Helpers ---
    var ALL_CANDIDATES = (1 << 9) - 1; // 511
    killerSudoku.ALL_CANDIDATES_MASK = ALL_CANDIDATES;
    var DIGIT_MASKS = [0, 1, 2, 4, 8, 16, 32, 64, 128, 256];
    killerSudoku.DIGIT_MASKS = DIGIT_MASKS;

    function getDigitMask(digit) { return DIGIT_MASKS[digit] || 0; }
    function hasCandidate(bitset, digit) { return (bitset & DIGIT_MASKS[digit]) !== 0; }
    function addCandidate(bitset, digit) { return bitset | DIGIT_MASKS[digit]; }
    function removeCandidate(bitset, digit) { return bitset & ~DIGIT_MASKS[digit]; }
    function countCandidates(bitset) { var c = 0; while (bitset > 0) { bitset &= (bitset - 1); c++; } return c; }
    function getCandidatesArray(bitset) { var a = []; for (let d = 1; d <= 9; ++d) if (hasCandidate(bitset, d)) a.push(d); return a; }
    function intersectCandidates(b1, b2) { return b1 & b2; }
    function getSingleCandidateDigit(bitset) { if (bitset > 0 && (bitset & (bitset - 1)) === 0) { for (let d = 1; d <= 9; ++d) { if (bitset === DIGIT_MASKS[d]) return d; } } return 0; }

    // --- Deep Copy Utility ---
    function deepCopy(obj) { /* ... (as before) ... */ if(obj === null || typeof obj !== 'object'){ return obj; } if(obj instanceof Date){ return new Date(obj.getTime()); } if(obj instanceof Set){ return new Set(obj); } if(Array.isArray(obj)){ const cp = []; for(let i=0; i<obj.length; i++){ cp[i] = deepCopy(obj[i]); } return cp; } const cp = {}; for(const k in obj){ if(obj.hasOwnProperty(k)){ cp[k] = deepCopy(obj[k]); } } return cp; }

    // --- Cage Representation and Initialization ---
     /** @typedef {object} Cage @property {number} sum @property {string[]} cells */
     /** @typedef {object} CageData @property {number} id @property {number} sum @property {string[]} cells @property {number} initialDigitMask @property {number} remainingSum @property {number} remainingCellsCount @property {number} currentValueMask */
     /** @typedef {object} SolverData @property {object.<string, number>} cellToCageMap @property {CageData[]} cageDataArray */

    /** @type {SolverData | null} */
    var currentSolverData = null; // Stores data DURING solving process

    killerSudoku._initializeSolverData = function(cages) { /* ... (as before, returns object or false) ... */ }; // Needs SUM_COMBINATION_CACHE

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
    function assignValue(candidatesMap, solverData, cellId, digitToAssign) { /* ... (as before, returns true/false) ... */ }
    function eliminateCandidate(candidatesMap, solverData, cellId, digitToEliminate) { /* ... (as before, returns true/false) ... */ }
    function updateCageStateOnAssign(candidatesMap, solverData, assignedCellId, assignedDigit) { /* ... (as before, returns true/false) ... */ }
    // --- (Full implementations of assign/eliminate/updateCageState are in the previous response) ---
    // (Include the full functions here in the final combined code)
    function assignValue(candidatesMap, solverData, cellId, digitToAssign) {
        var otherCandidatesMask = candidatesMap[cellId] & ~DIGIT_MASKS[digitToAssign];
        for (let d = 1; d <= 9; ++d) {
            if ((otherCandidatesMask & DIGIT_MASKS[d]) !== 0) {
                if (!eliminateCandidate(candidatesMap, solverData, cellId, d)) return false;
            }
        }
        if (!updateCageStateOnAssign(candidatesMap, solverData, cellId, digitToAssign)) return false;
        return true;
    }
    function eliminateCandidate(candidatesMap, solverData, cellId, digitToEliminate) {
        var cellMask = DIGIT_MASKS[digitToEliminate];
        if ((candidatesMap[cellId] & cellMask) === 0) return true;
        candidatesMap[cellId] &= ~cellMask;
        var remainingCandidates = candidatesMap[cellId];
        var numRemaining = countCandidates(remainingCandidates);
        if (numRemaining === 0) return false;
        if (numRemaining === 1) {
            var finalDigit = getSingleCandidateDigit(remainingCandidates);
            for (const peerId of CLASSIC_PEERS_MAP[cellId]) {
                if (!eliminateCandidate(candidatesMap, solverData, peerId, finalDigit)) return false;
            }
            if (!updateCageStateOnAssign(candidatesMap, solverData, cellId, finalDigit)) return false;
        }
        for (const unit of CLASSIC_UNITS_MAP[cellId]) {
            var placesForDigit = [];
            for (const unitCellId of unit) {
                if ((candidatesMap[unitCellId] & cellMask) !== 0) placesForDigit.push(unitCellId);
            }
            if (placesForDigit.length === 0) return false;
            if (placesForDigit.length === 1) {
                if (!assignValue(candidatesMap, solverData, placesForDigit[0], digitToEliminate)) return false;
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
                  if (!assignValue(candidatesMap, solverData, placesForDigitInCage[0], digitToEliminate)) return false;
             }
         }
        return true;
    }
    function updateCageStateOnAssign(candidatesMap, solverData, assignedCellId, assignedDigit) {
        const cageIndex = solverData.cellToCageMap[assignedCellId];
        if (cageIndex === undefined) return true;
        const cage = solverData.cageDataArray[cageIndex];
        const digitMask = DIGIT_MASKS[assignedDigit];
        if ((cage.currentValueMask & digitMask) !== 0) return true; // Already processed
        if ( (cage.currentValueMask & digitMask) !== 0) return false; // Contradiction: unique digit rule
        cage.remainingSum -= assignedDigit;
        cage.remainingCellsCount -= 1;
        cage.currentValueMask |= digitMask;
        if (cage.remainingCellsCount > 0) {
            const comboInfo = killerSudoku.getSumCombinationInfo(cage.remainingSum, cage.remainingCellsCount);
            if (!comboInfo) return false;
            let allowedDigitsMask = comboInfo.digitMask;
            let requiredAvailableMask = allowedDigitsMask & ~cage.currentValueMask;
            if (requiredAvailableMask === 0 && cage.remainingSum > 0) return false;
            for (const cellId of cage.cells) {
                if (countCandidates(candidatesMap[cellId]) > 1) {
                    const maskToApply = requiredAvailableMask;
                    const originalCandidates = candidatesMap[cellId];
                    const newCandidates = originalCandidates & maskToApply;
                    if (newCandidates !== originalCandidates) {
                        const eliminatedMask = originalCandidates & ~newCandidates;
                        for (let d = 1; d <= 9; d++) {
                            if ((eliminatedMask & DIGIT_MASKS[d]) !== 0) {
                                if (!eliminateCandidate(candidatesMap, solverData, cellId, d)) return false;
                            }
                        }
                    }
                     if (candidatesMap[cellId] === 0) return false;
                }
            }
        } else if (cage.remainingSum !== 0) return false;
        return true;
    }

    // --- Solver Search Function (Point 5) ---
    function _search(candidatesMap, solverData) {
        var isSolved = true;
        for (const cellId of killerSudoku.SQUARES) {
            if (countCandidates(candidatesMap[cellId]) !== 1) { isSolved = false; break; }
        }
        if (isSolved) return candidatesMap; // Solved!

        var minCandidates = 10, minCandidatesCell = null;
        for (const cellId of killerSudoku.SQUARES) {
            var numCandidates = countCandidates(candidatesMap[cellId]);
            if (numCandidates > 1 && numCandidates < minCandidates) {
                minCandidates = numCandidates; minCandidatesCell = cellId;
                if (minCandidates === 2) break;
            }
        }
        if (!minCandidatesCell) return false; // Should not happen if not solved

        var candidatesToTry = getCandidatesArray(candidatesMap[minCandidatesCell]);
        for (const digit of candidatesToTry) {
            var candidatesMapCopy = deepCopy(candidatesMap);
            var solverDataCopy = deepCopy(solverData);
            if (assignValue(candidatesMapCopy, solverDataCopy, minCandidatesCell, digit)) {
                var result = _search(candidatesMapCopy, solverDataCopy);
                if (result) return result;
            }
        }
        return false; // Backtrack
    }

    // --- Public Solver Function ---
    killerSudoku.solve = function(cages) {
        console.log("Starting Killer Sudoku solver...");
        const solverData = killerSudoku._initializeSolverData(cages);
        if (!solverData) { console.error("Failed to initialize solver data."); return false; }

        var initialCandidatesMap = {};
        for (const cellId of killerSudoku.SQUARES) initialCandidatesMap[cellId] = ALL_CANDIDATES;

        console.log("Applying initial cage constraints...");
        var initialSolverDataCopy = deepCopy(solverData); // Use a copy for initial elim.
        for(let i = 0; i < solverData.cageDataArray.length; ++i) {
            const cage = solverData.cageDataArray[i];
            if (cage.initialDigitMask === 0 && cage.sum > 0) { console.error(`Cage ${i} impossible.`); return false; }
            for(const cellId of cage.cells) {
                const originalCandidates = initialCandidatesMap[cellId];
                const newCandidates = originalCandidates & cage.initialDigitMask;
                if (newCandidates !== originalCandidates) {
                     const eliminatedMask = originalCandidates & ~newCandidates;
                     for (let d = 1; d <= 9; d++) {
                         if ((eliminatedMask & DIGIT_MASKS[d]) !== 0) {
                             if (!eliminateCandidate(initialCandidatesMap, initialSolverDataCopy, cellId, d)) {
                                 console.error(`Contradiction applying initial cage ${i} mask to ${cellId} (eliminating ${d})`);
                                 return false;
                             }
                         }
                     }
                }
                 if (initialCandidatesMap[cellId] === 0) { console.error(`Contradiction: ${cellId} no candidates after initial cage ${i} mask.`); return false; }
                 if(countCandidates(initialCandidatesMap[cellId]) === 1) {
                    const singleDigit = getSingleCandidateDigit(initialCandidatesMap[cellId]);
                    // Update the *copied* solver data based on this deduction
                    if(!updateCageStateOnAssign(initialCandidatesMap, initialSolverDataCopy, cellId, singleDigit)){
                        console.error(`Contradiction updating initial cage ${i} state after propagation solved ${cellId}=${singleDigit}`);
                        return false;
                    }
                 }
            }
        }
         console.log("Initial constraint propagation complete.");

        console.log("Starting recursive search...");
        var solutionMap = _search(initialCandidatesMap, initialSolverDataCopy); // Start search with propagated initial state

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
     * Uses backtracking.
     * @returns {object | false} A map {cellId: digit} or false if failed.
     */
    function _generateClassicSolutionGrid() {
        var candidates = {};
        for (const sq of killerSudoku.SQUARES) candidates[sq] = ALL_CANDIDATES;

        function searchClassic(cands) {
            var isSolved = true;
            for (const sq of killerSudoku.SQUARES) {
                if (countCandidates(cands[sq]) !== 1) { isSolved = false; break; }
            }
            if (isSolved) return cands;

            var minCand = 10, minSq = null;
            // Shuffle squares to add randomness to selection
            var shuffledSquares = _shuffleArray([...killerSudoku.SQUARES]);
            for (const sq of shuffledSquares) {
                var numC = countCandidates(cands[sq]);
                if (numC > 1 && numC < minCand) {
                    minCand = numC; minSq = sq;
                    if (minCand === 2) break;
                }
            }
            if (!minSq) return false; // Should not happen if not solved

            var digitsToTry = _shuffleArray(getCandidatesArray(cands[minSq])); // Shuffle digits too
            for (const digit of digitsToTry) {
                var candsCopy = deepCopy(cands);
                if (_assignClassic(candsCopy, minSq, digit)) { // Use classic assign/eliminate
                    var result = searchClassic(candsCopy);
                    if (result) return result;
                }
            }
            return false;
        }

        // Simple assign/eliminate for classic Sudoku generation
        function _assignClassic(cands, sq, digit) {
            var otherDigits = cands[sq] & ~DIGIT_MASKS[digit];
            for (let d = 1; d <= 9; d++) {
                if ((otherDigits & DIGIT_MASKS[d]) !== 0) {
                    if (!_eliminateClassic(cands, sq, d)) return false;
                }
            }
            return true;
        }

        function _eliminateClassic(cands, sq, digit) {
            var mask = DIGIT_MASKS[digit];
            if ((cands[sq] & mask) === 0) return true; // Already eliminated
            cands[sq] &= ~mask;
            var remaining = cands[sq];
            var count = countCandidates(remaining);
            if (count === 0) return false; // Contradiction 1
            if (count === 1) { // Rule 1: Propagate single candidate
                var singleDigit = getSingleCandidateDigit(remaining);
                for (const peer of CLASSIC_PEERS_MAP[sq]) {
                    if (!_eliminateClassic(cands, peer, singleDigit)) return false;
                }
            }
            // Rule 2: Only one place left in a unit
            for (const unit of CLASSIC_UNITS_MAP[sq]) {
                var places = [];
                for (const unitSq of unit) {
                    if ((cands[unitSq] & mask) !== 0) places.push(unitSq);
                }
                if (places.length === 0) return false; // Contradiction 2
                if (places.length === 1) {
                    if (!_assignClassic(cands, places[0], digit)) return false;
                }
            }
            return true;
        }
         // Start search with random assignments for better randomness
         var initialAssign = _shuffleArray([...killerSudoku.SQUARES]);
         for (let i = 0; i < 10; i++) { // Try assigning a few random values initially
             let sq = initialAssign[i];
             let possibleDigits = getCandidatesArray(candidates[sq]);
             if (possibleDigits.length > 0) {
                 let digit = possibleDigits[Math.floor(Math.random() * possibleDigits.length)];
                 if (!_assignClassic(candidates, sq, digit)) {
                     // Initial assignment failed, reset and try again (less likely)
                      console.warn("Initial random assignment failed, restarting classic generation.");
                      for (const sq of killerSudoku.SQUARES) candidates[sq] = ALL_CANDIDATES;
                      break;
                 };
             }
         }


        var solutionMap = searchClassic(candidates);
        if (!solutionMap) return false; // Failed to generate

        // Convert final map {sq: bitmask} to {sq: digit}
        var resultMap = {};
        for(const sq of killerSudoku.SQUARES) {
            resultMap[sq] = getSingleCandidateDigit(solutionMap[sq]);
            if (resultMap[sq] === 0) {
                 console.error("Generated classic grid is incomplete!");
                 return false; // Should not happen
            }
        }
        return resultMap;
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
        var maxAttempts = killerSudoku.NR_SQUARES * 3; // Limit attempts to prevent infinite loops
        var attempts = 0;

        while (unassignedCells.size > 0 && attempts < maxAttempts) {
            attempts++;
            var startCell = _getRandomElementFromSet(unassignedCells);
            if (!startCell) break; // Should not happen if size > 0

            var currentCage = [startCell];
            var cageDigits = new Set([solvedGridMap[startCell]]);
            unassignedCells.delete(startCell);

            // Determine target size (respecting remaining cells)
            var remainingCount = unassignedCells.size;
            var potentialMaxSize = Math.min(maxCageSize, remainingCount + 1);
            if (potentialMaxSize < minCageSize && remainingCount > 0) {
                 // Avoid creating a situation where remaining cells cannot form a valid cage
                 // Try to adjust max size if possible, otherwise might need to backtrack/restart
                 potentialMaxSize = minCageSize;
            }
            potentialMaxSize = Math.min(maxCageSize, potentialMaxSize); // Ensure it doesn't exceed original max
            var targetSize = Math.floor(Math.random() * (potentialMaxSize - minCageSize + 1)) + minCageSize;
             targetSize = Math.min(targetSize, remainingCount + 1); // Cannot be larger than available cells


            var addedInIteration = true; // Flag to detect dead ends
            while (currentCage.length < targetSize && addedInIteration) {
                addedInIteration = false;
                // Get potential neighbors from all cells currently in the cage
                var potentialNeighbors = [];
                currentCage.forEach(cell => {
                    (SQUARE_NEIGHBORS[cell] || []).forEach(neighbor => {
                        // Check if neighbor is unassigned AND adding it doesn't violate unique digit rule
                        if (unassignedCells.has(neighbor) && !cageDigits.has(solvedGridMap[neighbor])) {
                            potentialNeighbors.push(neighbor);
                        }
                    });
                });

                if (potentialNeighbors.length > 0) {
                    // Prefer neighbors that keep the cage connected (optional complexity)
                    // Simple approach: pick a random valid neighbor
                    potentialNeighbors = _shuffleArray(potentialNeighbors); // Shuffle for randomness
                    var nextCell = potentialNeighbors[0]; // Pick the first shuffled valid neighbor

                    currentCage.push(nextCell);
                    cageDigits.add(solvedGridMap[nextCell]);
                    unassignedCells.delete(nextCell);
                    addedInIteration = true;
                }
            } // End while cage < targetSize


            // Check if the created cage is valid (size >= min)
             if (currentCage.length >= minCageSize) {
                cages.push({ cells: currentCage });
             } else {
                 // Failed to create a valid cage, put cells back and try again
                 // console.warn(`Partitioning: Failed to form valid cage starting at ${startCell}, size ${currentCage.length}. Retrying.`);
                 currentCage.forEach(cell => unassignedCells.add(cell));
                 // Maybe try a different start cell or smaller target size?
                 // For simplicity, we just let the main loop retry.
             }

        } // End while unassignedCells > 0

        if (unassignedCells.size > 0) {
             console.error(`Partitioning failed: ${unassignedCells.size} cells remain unassigned after ${attempts} attempts.`);
             return false; // Failed to cover all cells
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
         // Max cage size decreases slightly with higher difficulty
         "easy":      { maxCage: 6, minCage: 2 },
         "medium":    { maxCage: 5, minCage: 2 },
         "hard":      { maxCage: 5, minCage: 2 },
         "very-hard": { maxCage: 4, minCage: 2 },
         "insane":    { maxCage: 4, minCage: 2 },
         "inhuman":   { maxCage: 4, minCage: 2 }, // Smallest cages can be harder
         "default":   { maxCage: 5, minCage: 2 }
     };

    killerSudoku.generate = function(difficulty = "medium", maxAttempts = 10) {
        console.log(`Attempting to generate Killer Sudoku (difficulty: ${difficulty}, max attempts: ${maxAttempts})`);
        var params = GENERATION_DIFFICULTY_PARAMS[difficulty] || GENERATION_DIFFICULTY_PARAMS.default;

        for (let attempt = 1; attempt <= maxAttempts; ++attempt) {
            console.log(`Generation attempt ${attempt}/${maxAttempts}...`);

            // 1. Generate classic solution
            console.log("Generating classic solution grid...");
            var solvedGridMap = _generateClassicSolutionGrid();
            if (!solvedGridMap) {
                console.warn("Failed to generate classic solution, retrying...");
                continue; // Try again
            }
            // console.log("Classic solution generated:", solvedGridMap); // DEBUG

            // 2. Partition into cages
             console.log(`Partitioning grid (max size: ${params.maxCage}, min size: ${params.minCage})...`);
             var cagesCellsOnly = _partitionGridIntoCages(solvedGridMap, params.maxCage, params.minCage);
             if (!cagesCellsOnly) {
                 console.warn("Failed to partition grid, retrying generation...");
                 continue; // Try again
             }

            // 3. Calculate sums
             console.log("Calculating cage sums...");
             _calculateCageSums(cagesCellsOnly, solvedGridMap);
             // console.log("Generated cages with sums:", cagesCellsOnly); // DEBUG

            // 4. Format puzzle
             var puzzle = { cages: cagesCellsOnly };

            // 5. Verification (Simplified - check solvability, not uniqueness)
            console.log("Verifying puzzle solvability...");
            // IMPORTANT: Solve needs a DEEP COPY of the cages, as _initializeSolverData might be needed again if solve fails internally
            var solveResult = killerSudoku.solve(deepCopy(puzzle.cages));
            if (solveResult && typeof solveResult === 'string' && solveResult.length === killerSudoku.NR_SQUARES) {
                 // Optionally compare solveResult with the original solvedGridMap string for consistency check
                 // let originalSolutionString = killerSudoku.SQUARES.map(sq => solvedGridMap[sq]).join('');
                 // if (solveResult !== originalSolutionString) {
                 //     console.warn("Solver found a DIFFERENT solution than the generator's base! Puzzle might be non-unique or solver/generator has issues.");
                 //     // Decide whether to accept this potentially non-unique puzzle or retry
                 // }
                console.log(`Generation successful after ${attempt} attempts!`);
                return puzzle; // Solvable! Return it.
            } else {
                console.warn(`Verification failed (Solver returned ${solveResult}). Retrying generation...`);
                 // Continue loop to try again
            }
        } // End attempt loop

        console.error(`Failed to generate a solvable Killer Sudoku after ${maxAttempts} attempts.`);
        return false; // Failed after max attempts
    };


    // --- Utility Functions ---
    function cross(A, B) { var r=[];for(var i=0;i<A.length;i++)for(var j=0;j<B.length;j++)r.push(A[i]+B[j]);return r; }
    function _get_all_classic_units(rows, cols) { var u=[];for(var ri in rows)u.push(cross(rows[ri],cols));for(var ci in cols)u.push(cross(rows,cols[ci]));var rs=["ABC","DEF","GHI"],cs=["123","456","789"];for(var rsi in rs)for(var csi in cs)u.push(cross(rs[rsi],cs[csi]));return u;}
    function _get_classic_maps(squares, units) { var um={},pm={};for(var si in squares){var sq=squares[si];um[sq]=[];for(var ui in units){var u=units[ui];if(u.indexOf(sq)!==-1)um[sq].push(u);}pm[sq]=[];for(var sui in um[sq]){var u=um[sq][sui];for(var ui in u){var ps=u[ui];if(pm[sq].indexOf(ps)===-1&&ps!==sq)pm[sq].push(ps);}}}return {units_map:um,peers_map:pm};}
    function _shuffleArray(array) { for(let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } return array; }
    function _getRandomElementFromSet(set) { let items = Array.from(set); return items[Math.floor(Math.random() * items.length)]; }
    function _computeNeighbors(squares, squareMap) {
        const neighbors = {};
        const grid = [];
        for (let r = 0; r < 9; r++) grid.push(Array(9));
        squares.forEach((sq, idx) => {
            const r = Math.floor(idx / 9);
            const c = idx % 9;
            grid[r][c] = sq;
        });

        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const sq = grid[r][c];
                neighbors[sq] = [];
                if (r > 0) neighbors[sq].push(grid[r-1][c]); // Up
                if (r < 8) neighbors[sq].push(grid[r+1][c]); // Down
                if (c > 0) neighbors[sq].push(grid[r][c-1]); // Left
                if (c < 8) neighbors[sq].push(grid[r][c+1]); // Right
            }
        }
        return neighbors;
    }

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

})(this);
