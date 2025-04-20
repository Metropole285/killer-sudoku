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
    function deepCopy(obj) { if(obj === null || typeof obj !== 'object'){ return obj; } if(obj instanceof Date){ return new Date(obj.getTime()); } if(obj instanceof Set){ return new Set(obj); } if(Array.isArray(obj)){ const cp = []; for(let i=0; i<obj.length; i++){ cp[i] = deepCopy(obj[i]); } return cp; } const cp = {}; for(const k in obj){ if(obj.hasOwnProperty(k)){ cp[k] = deepCopy(obj[k]); } } return cp; }

    // --- Cage Representation and Initialization ---
     /** @typedef {object} Cage @property {number} sum @property {string[]} cells */
     /** @typedef {object} CageData @property {number} id @property {number} sum @property {string[]} cells @property {number} initialDigitMask @property {number} remainingSum @property {number} remainingCellsCount @property {number} currentValueMask */
     /** @typedef {object} SolverData @property {object.<string, number>} cellToCageMap @property {CageData[]} cageDataArray */

    // --- ИСПРАВЛЕНО: ВСТАВЛЕНА ПОЛНАЯ РЕАЛИЗАЦИЯ ---
    killerSudoku._initializeSolverData = function(cages) {
        if (!Array.isArray(cages)) { console.error("Invalid cages input: must be an array."); return false; }
        var cellToCageMap = {}; var cageDataArray = []; var assignedCells = {};
        for (var i = 0; i < cages.length; ++i) {
            var cage = cages[i];
            if (!cage || typeof cage.sum !== 'number' || !Array.isArray(cage.cells) || cage.cells.length === 0) { console.error(`Invalid cage format at index ${i}:`, cage); return false; }
            if (cage.sum <= 0) { console.error(`Invalid cage sum (> 0) at index ${i}:`, cage.sum); return false; }
            if (cage.cells.length > 9) { console.error(`Invalid cage size (<= 9) at index ${i}:`, cage.cells.length); return false; }
            var cageCells = [];
            for (var j = 0; j < cage.cells.length; ++j) {
                var cellId = cage.cells[j];
                // Check if SQUARE_MAP is initialized
                if (!SQUARE_MAP) { console.error("_initializeSolverData: SQUARE_MAP not initialized!"); return false;}
                if (typeof cellId !== 'string' || SQUARE_MAP[cellId] === undefined) { console.error(`Invalid cell ID '${cellId}' in cage at index ${i}`); return false; }
                if (assignedCells[cellId] !== undefined) { console.error(`Cell ${cellId} belongs to multiple cages (index ${i} and ${assignedCells[cellId]})`); return false; }
                assignedCells[cellId] = i; cellToCageMap[cellId] = i; cageCells.push(cellId);
            }
            var combinationInfo = killerSudoku.getSumCombinationInfo(cage.sum, cageCells.length);
            cageDataArray.push({
                id: i, sum: cage.sum, cells: cageCells,
                initialDigitMask: combinationInfo ? combinationInfo.digitMask : 0, // Use 0 if impossible initially
                remainingSum: cage.sum, remainingCellsCount: cageCells.length,
                currentValueMask: 0,
            });
        }
         // Check if all squares are covered
         if (Object.keys(assignedCells).length !== killerSudoku.NR_SQUARES) {
            const assignedCount = Object.keys(assignedCells).length;
            console.error(`Invalid cage definition: Not all ${killerSudoku.NR_SQUARES} squares covered or some covered more than once. Covered: ${assignedCount}`);
            // Optional: Find missing squares for debugging
            if (killerSudoku.SQUARES) {
                const missing = killerSudoku.SQUARES.filter(sq => assignedCells[sq] === undefined);
                if (missing.length > 0) console.error("Missing squares:", missing);
            }
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
    // --- ИСПРАВЛЕНО: ВСТАВЛЕНЫ ПОЛНЫЕ РЕАЛИЗАЦИИ ---
    function assignValue(candidatesMap, solverData, cellId, digitToAssign) {
        // console.log(`Assign Val ${digitToAssign} to ${cellId}`); // DEBUG
        var otherCandidatesMask = candidatesMap[cellId] & ~DIGIT_MASKS[digitToAssign];
        for (let d = 1; d <= 9; ++d) {
            if ((otherCandidatesMask & DIGIT_MASKS[d]) !== 0) {
                if (!eliminateCandidate(candidatesMap, solverData, cellId, d)) {
                     // console.log(`Assign contradiction: eliminating ${d} from ${cellId} for ${digitToAssign}`); // DEBUG
                    return false;
                }
            }
        }
        // Update cage state AFTER elimination ensures the cell is reduced to the single digit
        if (!updateCageStateOnAssign(candidatesMap, solverData, cellId, digitToAssign)) {
             // console.log(`Assign contradiction: cage update failed for ${digitToAssign} at ${cellId}`); // DEBUG
            return false;
        }
        return true;
    }

    function eliminateCandidate(candidatesMap, solverData, cellId, digitToEliminate) {
        // console.log(`Eliminate ${digitToEliminate} from ${cellId}`); // DEBUG
        var cellMask = DIGIT_MASKS[digitToEliminate];
        if (!CLASSIC_PEERS_MAP || !CLASSIC_UNITS_MAP || !solverData || !solverData.cellToCageMap || !solverData.cageDataArray) {
             console.error("Eliminate called before full initialization or with invalid solverData!");
             return false; // Cannot proceed
        }

        if ((candidatesMap[cellId] & cellMask) === 0) return true; // Already eliminated

        candidatesMap[cellId] &= ~cellMask;
        var remainingCandidates = candidatesMap[cellId];
        var numRemaining = countCandidates(remainingCandidates);

        if (numRemaining === 0) {
             // console.log(`Contradiction 1: ${cellId} has 0 candidates after eliminating ${digitToEliminate}`); // DEBUG
            return false;
        }

        // Propagation Rule 1: Single candidate left
        if (numRemaining === 1) {
            var finalDigit = getSingleCandidateDigit(remainingCandidates);
            // console.log(`Single cand rule: ${cellId} = ${finalDigit}`); // DEBUG
            // Propagate to classic peers
            for (const peerId of CLASSIC_PEERS_MAP[cellId]) {
                if (!eliminateCandidate(candidatesMap, solverData, peerId, finalDigit)) {
                     // console.log(`Contradiction propagating single ${finalDigit} from ${cellId} to classic peer ${peerId}`); // DEBUG
                    return false;
                }
            }
            // Propagate to cage peers (via cage state update, which calls eliminate again)
            if (!updateCageStateOnAssign(candidatesMap, solverData, cellId, finalDigit)) {
                 // console.log(`Contradiction updating cage state after ${cellId} reduced to ${finalDigit}`); // DEBUG
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
            if (placesForDigit.length === 0) {
                 // console.log(`Contradiction 2a: No place left for ${digitToEliminate} in classic unit of ${cellId}`); // DEBUG
                 return false;
            }
            if (placesForDigit.length === 1) {
                 // console.log(`Single place classic: ${digitToEliminate} must be in ${placesForDigit[0]}`); // DEBUG
                if (!assignValue(candidatesMap, solverData, placesForDigit[0], digitToEliminate)) {
                     // console.log(`Contradiction assigning ${digitToEliminate} to ${placesForDigit[0]} from classic unit rule`); // DEBUG
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
                 // Only consider unsolved cells in the cage for this rule
                 if (countCandidates(candidatesMap[cageCellId]) > 1 && (candidatesMap[cageCellId] & cellMask) !== 0) {
                     placesForDigitInCage.push(cageCellId);
                 }
             }
             // If only one *unsolved* cell in the cage can hold this digit, assign it
             if (placesForDigitInCage.length === 1) {
                   // console.log(`Single place cage: ${digitToEliminate} must be in ${placesForDigitInCage[0]}`); // DEBUG
                  if (!assignValue(candidatesMap, solverData, placesForDigitInCage[0], digitToEliminate)) {
                       // console.log(`Contradiction assigning ${digitToEliminate} to ${placesForDigitInCage[0]} from cage unit rule`); // DEBUG
                      return false;
                  }
             }
             // No explicit check for length 0, handled by sum checks
         }

        return true; // Elimination successful
    }

    function updateCageStateOnAssign(candidatesMap, solverData, assignedCellId, assignedDigit) {
        const cageIndex = solverData.cellToCageMap[assignedCellId];
        if (cageIndex === undefined) return true; // Not in a cage

        const cage = solverData.cageDataArray[cageIndex];
        const digitMask = DIGIT_MASKS[assignedDigit];

        // Only update state if this digit hasn't been processed for this cage yet
        if ((cage.currentValueMask & digitMask) !== 0) {
             // console.log(`Cage ${cageIndex} skipping re-update for ${assignedDigit}`); // DEBUG
            return true; // Already processed
        }

        // console.log(`Updating Cage ${cageIndex} for ${assignedDigit} at ${assignedCellId}: before sum=${cage.remainingSum}, cells=${cage.remainingCellsCount}`); // DEBUG

        // Update state
        cage.remainingSum -= assignedDigit;
        cage.remainingCellsCount -= 1;
        cage.currentValueMask |= digitMask;

        // Check contradictions
        if (cage.remainingCellsCount < 0 || cage.remainingSum < 0) {
             console.error(`Cage ${cageIndex} invalid state: sum=${cage.remainingSum}, cells=${cage.remainingCellsCount}`);
             return false; // Invalid state
        }

        if (cage.remainingCellsCount > 0) {
            const comboInfo = killerSudoku.getSumCombinationInfo(cage.remainingSum, cage.remainingCellsCount);
            if (!comboInfo) {
                 // console.log(`Contradiction Cage Sum: Impossible sum ${cage.remainingSum} for ${cage.remainingCellsCount} cells in cage ${cageIndex}`); // DEBUG
                 return false;
            }
            let allowedDigitsMask = comboInfo.digitMask;
            let requiredAvailableMask = allowedDigitsMask & ~cage.currentValueMask;

            if (requiredAvailableMask === 0 && cage.remainingSum > 0) {
                 // console.log(`Contradiction Cage Digits: Digits required for sum ${cage.remainingSum} in cage ${cageIndex} (mask ${allowedDigitsMask.toString(2)}) already used (mask ${cage.currentValueMask.toString(2)})`); // DEBUG
                return false;
            }

            // Propagate to remaining cage cells
            for (const cellId of cage.cells) {
                if (countCandidates(candidatesMap[cellId]) > 1) { // Only propagate to unsolved
                    const maskToApply = requiredAvailableMask;
                    const originalCandidates = candidatesMap[cellId];
                    const newCandidates = originalCandidates & maskToApply;

                    if (newCandidates !== originalCandidates) {
                        const eliminatedMask = originalCandidates & ~newCandidates;
                         // console.log(`Cage ${cageIndex} propagating to ${cellId}: eliminating mask ${eliminatedMask.toString(2)}`); // DEBUG
                        for (let d = 1; d <= 9; d++) {
                            if ((eliminatedMask & DIGIT_MASKS[d]) !== 0) {
                                if (!eliminateCandidate(candidatesMap, solverData, cellId, d)) {
                                     // console.log(`Contradiction propagating cage ${cageIndex} constraint to ${cellId} (eliminating ${d})`); // DEBUG
                                    return false;
                                }
                            }
                        }
                    }
                     if (candidatesMap[cellId] === 0) { // Check after elimination
                         // console.log(`Contradiction: ${cellId} has no candidates after cage ${cageIndex} propagation`); // DEBUG
                         return false;
                     }
                }
            }
        } else if (cage.remainingSum !== 0) {
            // console.log(`Contradiction Cage Filled: Cage ${cageIndex} filled, but rem sum is ${cage.remainingSum}`); // DEBUG
            return false;
        }
         // console.log(`Cage ${cageIndex} updated OK: final sum=${cage.remainingSum}, cells=${cage.remainingCellsCount}`); // DEBUG
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
        if (!minCandidatesCell) return false; // Contradiction or already solved check failed

        var candidatesToTry = getCandidatesArray(candidatesMap[minCandidatesCell]);
        for (const digit of candidatesToTry) {
            var candidatesMapCopy = deepCopy(candidatesMap);
            var solverDataCopy = deepCopy(solverData); // Must copy solver data too!
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
        // 1. Initialize solver data (includes cage validation)
        // --- ИСПРАВЛЕНО: Используем _initializeSolverData ---
        const solverData = killerSudoku._initializeSolverData(cages);
        if (!solverData) {
            console.error("Failed to initialize solver data. Cannot solve.");
            return false;
        }

        // 2. Create initial candidates map
        var initialCandidatesMap = {};
        for (const cellId of killerSudoku.SQUARES) {
            initialCandidatesMap[cellId] = ALL_CANDIDATES;
        }

        // 3. Apply initial cage constraints
        console.log("Applying initial cage constraints...");
        // --- ИСПРАВЛЕНО: Создаем копию solverData для начального этапа ---
        var initialSolverDataCopy = deepCopy(solverData);
        for(let i = 0; i < solverData.cageDataArray.length; ++i) {
            const cage = solverData.cageDataArray[i]; // Читаем из оригинала
             if (cage.initialDigitMask === 0 && cage.sum > 0) {
                 console.error(`Cage ${i} impossible from the start (sum=${cage.sum}, cells=${cage.cells.length}).`);
                 return false; // Impossible cage definition
             }
            for(const cellId of cage.cells) {
                const originalCandidates = initialCandidatesMap[cellId];
                const newCandidates = originalCandidates & cage.initialDigitMask;
                if (newCandidates !== originalCandidates) {
                     const eliminatedMask = originalCandidates & ~newCandidates;
                     for (let d = 1; d <= 9; d++) {
                         if ((eliminatedMask & DIGIT_MASKS[d]) !== 0) {
                             // --- ИСПРАВЛЕНО: Передаем копию solverData ---
                             if (!eliminateCandidate(initialCandidatesMap, initialSolverDataCopy, cellId, d)) {
                                  console.error(`Contradiction applying initial cage ${i} mask to ${cellId} (eliminating ${d})`);
                                 return false;
                             }
                         }
                     }
                }
                 if (initialCandidatesMap[cellId] === 0) {
                    console.error(`Contradiction: ${cellId} has no candidates after applying initial cage ${i} mask.`);
                    return false;
                 }
                 // Check if initial propagation solved a cell
                 if(countCandidates(initialCandidatesMap[cellId]) === 1) {
                    const singleDigit = getSingleCandidateDigit(initialCandidatesMap[cellId]);
                    // Update the *copied* solver data based on this deduction
                     // --- ИСПРАВЛЕНО: Передаем копию solverData ---
                    if(!updateCageStateOnAssign(initialCandidatesMap, initialSolverDataCopy, cellId, singleDigit)){
                        console.error(`Contradiction updating initial cage ${i} state after propagation solved ${cellId}=${singleDigit}`);
                        return false;
                    }
                 }
            }
        }
         console.log("Initial constraint propagation complete.");

        // 4. Call the main recursive search function
        console.log("Starting recursive search...");
        // --- ИСПРАВЛЕНО: Передаем копию solverData ---
        var solutionMap = _search(initialCandidatesMap, initialSolverDataCopy); // Start search with propagated initial state

        // 5. Format and return result
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
    function _generateClassicSolutionGrid() { /* ... (как в пред. ответе) ... */ }
    function _partitionGridIntoCages(solvedGridMap, maxCageSize = 5, minCageSize = 2) { /* ... (как в пред. ответе) ... */ }
    function _calculateCageSums(cages, solvedGridMap) { /* ... (как в пред. ответе) ... */ }
    var GENERATION_DIFFICULTY_PARAMS = { /* ... */ };
    killerSudoku.generate = function(difficulty = "medium", maxAttempts = 10) { /* ... (как в пред. ответе) ... */ };
    // --- (Вставьте полные реализации генератора сюда) ---
    function _generateClassicSolutionGrid(){var cands={};for(const sq of killerSudoku.SQUARES)cands[sq]=ALL_CANDIDATES;function searchClassic(cands){var solved=true;for(const sq of killerSudoku.SQUARES){if(countCandidates(cands[sq])!==1){solved=false;break;}}if(solved)return cands;var minCand=10,minSq=null;var shuffledSquares=_shuffleArray([...killerSudoku.SQUARES]);for(const sq of shuffledSquares){var numC=countCandidates(cands[sq]);if(numC>1&&numC<minCand){minCand=numC;minSq=sq;if(minCand===2)break;}}if(!minSq)return false;var digitsToTry=_shuffleArray(getCandidatesArray(cands[minSq]));for(const digit of digitsToTry){var candsCopy=deepCopy(cands);if(_assignClassic(candsCopy,minSq,digit)){var result=searchClassic(candsCopy);if(result)return result;}}return false;}function _assignClassic(cands,sq,digit){var otherDigits=cands[sq]&~DIGIT_MASKS[digit];for(let d=1;d<=9;d++){if((otherDigits&DIGIT_MASKS[d])!==0){if(!_eliminateClassic(cands,sq,d))return false;}}return true;}function _eliminateClassic(cands,sq,digit){var mask=DIGIT_MASKS[digit];if((cands[sq]&mask)===0)return true;cands[sq]&=~mask;var remaining=cands[sq];var count=countCandidates(remaining);if(count===0)return false;if(count===1){var singleDigit=getSingleCandidateDigit(remaining);for(const peer of CLASSIC_PEERS_MAP[sq]){if(!_eliminateClassic(cands,peer,singleDigit))return false;}}for(const unit of CLASSIC_UNITS_MAP[sq]){var places=[];for(const unitSq of unit){if((cands[unitSq]&mask)!==0)places.push(unitSq);}if(places.length===0)return false;if(places.length===1){if(!_assignClassic(cands,places[0],digit))return false;}}return true;}var initialAssign=_shuffleArray([...killerSudoku.SQUARES]);for(let i=0;i<10;i++){let sq=initialAssign[i];let possibleDigits=getCandidatesArray(candidates[sq]);if(possibleDigits.length>0){let digit=possibleDigits[Math.floor(Math.random()*possibleDigits.length)];if(!_assignClassic(candidates,sq,digit)){console.warn("Init assign failed, restart.");for(const sq of killerSudoku.SQUARES)candidates[sq]=ALL_CANDIDATES;break;};}}var solutionMap=searchClassic(candidates);if(!solutionMap)return false;var resultMap={};for(const sq of killerSudoku.SQUARES){resultMap[sq]=getSingleCandidateDigit(solutionMap[sq]);if(resultMap[sq]===0){console.error("Classic grid incomplete!");return false;}}return resultMap;}
    function _partitionGridIntoCages(solvedGridMap,maxCageSize=5,minCageSize=2){var cages=[];var unassignedCells=new Set(killerSudoku.SQUARES);var maxAttempts=killerSudoku.NR_SQUARES*3;var attempts=0;while(unassignedCells.size>0&&attempts<maxAttempts){attempts++;var startCell=_getRandomElementFromSet(unassignedCells);if(!startCell)break;var currentCage=[startCell];var cageDigits=new Set([solvedGridMap[startCell]]);unassignedCells.delete(startCell);var remainingCount=unassignedCells.size;var potentialMaxSize=Math.min(maxCageSize,remainingCount+1);if(potentialMaxSize<minCageSize&&remainingCount>0){potentialMaxSize=minCageSize;}potentialMaxSize=Math.min(maxCageSize,potentialMaxSize);var targetSize=Math.floor(Math.random()*(potentialMaxSize-minCageSize+1))+minCageSize;targetSize=Math.min(targetSize,remainingCount+1);var addedInIteration=true;while(currentCage.length<targetSize&&addedInIteration){addedInIteration=false;var potentialNeighbors=[];currentCage.forEach(cell=>{(SQUARE_NEIGHBORS[cell]||[]).forEach(neighbor=>{if(unassignedCells.has(neighbor)&&!cageDigits.has(solvedGridMap[neighbor])){potentialNeighbors.push(neighbor);}});});if(potentialNeighbors.length>0){potentialNeighbors=_shuffleArray(potentialNeighbors);var nextCell=potentialNeighbors[0];currentCage.push(nextCell);cageDigits.add(solvedGridMap[nextCell]);unassignedCells.delete(nextCell);addedInIteration=true;}}if(currentCage.length>=minCageSize){cages.push({cells:currentCage});}else{currentCage.forEach(cell=>unassignedCells.add(cell));}}if(unassignedCells.size>0){console.error(`Partition failed: ${unassignedCells.size} cells left.`);return false;}console.log(`Partition OK: ${cages.length} cages.`);return cages;}
    function _calculateCageSums(cages,solvedGridMap){cages.forEach(cage=>{cage.sum=0;cage.cells.forEach(cellId=>{cage.sum+=solvedGridMap[cellId];});});}
    var GENERATION_DIFFICULTY_PARAMS={"easy":{maxCage:6,minCage:2},"medium":{maxCage:5,minCage:2},"hard":{maxCage:5,minCage:2},"very-hard":{maxCage:4,minCage:2},"insane":{maxCage:4,minCage:2},"inhuman":{maxCage:4,minCage:2},"default":{maxCage:5,minCage:2}};
    killerSudoku.generate=function(difficulty="medium",maxAttempts=10){console.log(`Generate Killer (diff:${difficulty}, att:${maxAttempts})`);var params=GENERATION_DIFFICULTY_PARAMS[difficulty]||GENERATION_DIFFICULTY_PARAMS.default;for(let attempt=1;attempt<=maxAttempts;++attempt){console.log(`Gen attempt ${attempt}/${maxAttempts}...`);console.log("Gen classic...");var solvedGridMap=_generateClassicSolutionGrid();if(!solvedGridMap){console.warn("Fail gen classic, retry...");continue;}console.log(`Partition grid (max:${params.maxCage}, min:${params.minCage})...`);var cagesCellsOnly=_partitionGridIntoCages(solvedGridMap,params.maxCage,params.minCage);if(!cagesCellsOnly){console.warn("Fail partition, retry gen...");continue;}console.log("Calc sums...");_calculateCageSums(cagesCellsOnly,solvedGridMap);var puzzle={cages:cagesCellsOnly};console.log("Verify solvability...");var solveResult=killerSudoku.solve(deepCopy(puzzle.cages));if(solveResult&&typeof solveResult==='string'&&solveResult.length===killerSudoku.NR_SQUARES){console.log(`Gen OK after ${attempt} attempts!`);return puzzle;}else{console.warn(`Verify fail (Solver: ${solveResult}). Retry gen...`);}}console.error(`Failed gen Killer after ${maxAttempts} attempts.`);return false;};


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
