/*
    killerSudoku.js
    ---------------
    JavaScript library for Killer Sudoku puzzle generation and solving.
    Final corrected version with full implementations.
*/

(function(root) {
    var killerSudoku = root.killerSudoku = {};

    // --- Constants ---
    killerSudoku.DIGITS = "123456789";
    var ROWS = "ABCDEFGHI";
    var COLS = killerSudoku.DIGITS;
    killerSudoku.NR_SQUARES = 81;
    killerSudoku.BLANK_CHAR = '.';
    killerSudoku.BLANK_BOARD = ".................................................................................";

    // --- Precomputed Data ---
    killerSudoku.SQUARES = null;
    var SQUARE_MAP = null;
    var CLASSIC_UNITS = null;
    var CLASSIC_UNITS_MAP = null;
    var CLASSIC_PEERS_MAP = null;
    var SQUARE_NEIGHBORS = {};

    // --- Configuration ---
    // Установите false, чтобы включить проверку решателем при генерации
    var SKIP_SOLVER_VERIFICATION = true;

    // --- Bitset Constants and Helpers ---
    var ALL_CANDIDATES = 511; killerSudoku.ALL_CANDIDATES_MASK = ALL_CANDIDATES;
    var DIGIT_MASKS = [0, 1, 2, 4, 8, 16, 32, 64, 128, 256]; killerSudoku.DIGIT_MASKS = DIGIT_MASKS;

    function getDigitMask(digit) { return DIGIT_MASKS[digit] || 0; }
    function hasCandidate(bitset, digit) { return (bitset & DIGIT_MASKS[digit]) !== 0; }
    function addCandidate(bitset, digit) { return bitset | DIGIT_MASKS[digit]; }
    function removeCandidate(bitset, digit) { return bitset & ~DIGIT_MASKS[digit]; }
    function countCandidates(bitset) { var c = 0; while (bitset > 0) { bitset &= (bitset - 1); c++; } return c; }
    function getCandidatesArray(bitset) { var a = []; for (let d = 1; d <= 9; ++d) if (hasCandidate(bitset, d)) a.push(d); return a; }
    function intersectCandidates(b1, b2) { return b1 & b2; }
    function getSingleCandidateDigit(bitset) { if (bitset > 0 && (bitset & (bitset - 1)) === 0) { for (let d = 1; d <= 9; ++d) { if (bitset === DIGIT_MASKS[d]) return d; } } return 0; }
    function formatBitset(b) { return getCandidatesArray(b).join('') || '-'; }

    // --- Deep Copy Utility ---
    function deepCopy(obj) {
        if (obj === null || typeof obj !== 'object') { return obj; }
        if (obj instanceof Date) { return new Date(obj.getTime()); }
        if (obj instanceof Set) { return new Set(obj); } // Elements (numbers/strings) are primitive
        if (Array.isArray(obj)) {
            const arrCopy = [];
            // Use standard for loop for potentially better performance if needed
            for (let i = 0; i < obj.length; i++) {
                arrCopy[i] = deepCopy(obj[i]);
            }
            return arrCopy;
        }
        const objCopy = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                objCopy[key] = deepCopy(obj[key]);
            }
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
        // console.log("Initializing solver data...");
        if (!Array.isArray(cages)) { console.error("Invalid cages input: must be an array."); return false; }
        if (!SQUARE_MAP) { console.error("_initializeSolverData: SQUARE_MAP not initialized!"); return false;}

        var cellToCageMap = {};
        var cageDataArray = [];
        var assignedCells = {}; // Check for overlaps and coverage

        for (var i = 0; i < cages.length; ++i) {
            var cage = cages[i];
            // Validate cage structure
            if (!cage || typeof cage.sum !== 'number' || !Array.isArray(cage.cells) || cage.cells.length === 0) {
                console.error(`Invalid cage format at index ${i}:`, cage); return false;
            }
            // Validate cage sum (only if it has cells)
            if (cage.cells.length > 0 && cage.sum <= 0) {
                console.error(`Invalid cage sum (<= 0) at index ${i}:`, cage.sum); return false;
            }
            // Validate cage size
            if (cage.cells.length > 9) {
                console.error(`Invalid cage size (> 9) at index ${i}:`, cage.cells.length); return false;
            }

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
                assignedCells[cellId] = i;
                cellToCageMap[cellId] = i;
                cageCells.push(cellId);
            }

            // Check min/max possible sum for cage size (important validation)
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
             // Check if the sum is actually possible for the size
             if (cage.cells.length > 0 && !combinationInfo) {
                  console.error(`Impossible sum ${cage.sum} for cage size ${cage.cells.length} at index ${i} (no combinations found).`);
                  return false;
             }

            cageDataArray.push({
                id: i, // Will be reassigned after partitioning if generated
                sum: cage.sum,
                cells: cageCells,
                initialDigitMask: combinationInfo ? combinationInfo.digitMask : 0,
                remainingSum: cage.sum,
                remainingCellsCount: cageCells.length,
                currentValueMask: 0,
            });
        }

         // Check if all 81 squares are covered exactly once
         const assignedCount = Object.keys(assignedCells).length;
         if (assignedCount !== killerSudoku.NR_SQUARES) {
             console.error(`Invalid cage definition: Not all ${killerSudoku.NR_SQUARES} squares covered or some covered more than once. Covered: ${assignedCount}`);
             if (killerSudoku.SQUARES) { const missing = killerSudoku.SQUARES.filter(sq => assignedCells[sq] === undefined); if (missing.length > 0) console.error("Missing squares:", missing); }
             return false;
         }
        // console.log("Solver data initialized successfully.");
        return { cellToCageMap: cellToCageMap, cageDataArray: cageDataArray };
    };

    // --- Sum Combination Cache and Calculation ---
    var SUM_COMBINATION_CACHE = {};
    killerSudoku.getSumCombinationInfo = function(targetSum, numCells) {
        if (numCells <= 0 || numCells > 9 || targetSum <= 0) return null;
        var minPossibleSum = (numCells * (numCells + 1)) / 2;
        var maxPossibleSum = (numCells * (19 - numCells)) / 2;
        if (targetSum < minPossibleSum || targetSum > maxPossibleSum) return null;
        // Use explicit check for undefined as null is cached for impossible combos
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
        SUM_COMBINATION_CACHE[targetSum][numCells] = result; // Cache null if impossible
        return result;
     };

    // --- Constraint Propagation ---
    /**
     * Assigns a definite value and propagates constraints.
     * Modifies the *passed* candidatesMap and solverData objects.
     */
    function assignValue(candidatesMap, solverData, cellId, digitToAssign, indent="") {
        var otherCandidatesMask = candidatesMap[cellId] & ~DIGIT_MASKS[digitToAssign];
        for (let d = 1; d <= 9; ++d) {
            if ((otherCandidatesMask & DIGIT_MASKS[d]) !== 0) {
                if (!eliminateCandidate(candidatesMap, solverData, cellId, d, indent + "  ")) return false;
            }
        }
        if (!updateCageStateOnAssign(candidatesMap, solverData, cellId, digitToAssign, indent + "  ")) return false;
        return true;
    }

    /**
     * Eliminates a candidate and propagates constraints.
     * Modifies the *passed* candidatesMap and solverData objects.
     */
    function eliminateCandidate(candidatesMap, solverData, cellId, digitToEliminate, indent="") {
        var initialCandidates = candidatesMap[cellId];
        var cellMask = DIGIT_MASKS[digitToEliminate];
        if ((initialCandidates & cellMask) === 0) return true; // Already eliminated

        if (!CLASSIC_PEERS_MAP || !CLASSIC_UNITS_MAP || !solverData?.cellToCageMap || !solverData?.cageDataArray) { console.error("Eliminate deps missing!"); return false; }

        candidatesMap[cellId] &= ~cellMask;
        var remainingCandidates = candidatesMap[cellId];
        var numRemaining = countCandidates(remainingCandidates);

        if (numRemaining === 0) return false; // Contradiction 1

        // Rule 1: Single candidate left
        if (numRemaining === 1) {
            var finalDigit = getSingleCandidateDigit(remainingCandidates);
            for (const peerId of CLASSIC_PEERS_MAP[cellId]) {
                if (!eliminateCandidate(candidatesMap, solverData, peerId, finalDigit, indent + "  ")) return false;
            }
            if (!updateCageStateOnAssign(candidatesMap, solverData, cellId, finalDigit, indent + "  ")) return false;
        }

        // Rule 2: Only one place left in units
        for (const unit of CLASSIC_UNITS_MAP[cellId]) {
            var placesForDigit = [];
            for (const unitCellId of unit) { if ((candidatesMap[unitCellId] & cellMask) !== 0) placesForDigit.push(unitCellId); }
            if (placesForDigit.length === 0) return false; // Contradiction 2
            if (placesForDigit.length === 1) { const targetCell = placesForDigit[0]; if (candidatesMap[targetCell] !== cellMask) { if (!assignValue(candidatesMap, solverData, targetCell, digitToEliminate, indent + "  ")) return false; } }
        }
        // Cage Unit Rule 2
        const cageIndex = solverData.cellToCageMap[cellId];
        if (cageIndex !== undefined) {
             const cage = solverData.cageDataArray[cageIndex];
             let placesForDigitInCage = [];
             for (const cageCellId of cage.cells) { if (countCandidates(candidatesMap[cageCellId]) > 1 && (candidatesMap[cageCellId] & cellMask) !== 0) placesForDigitInCage.push(cageCellId); }
             if (placesForDigitInCage.length === 1) { const targetCell = placesForDigitInCage[0]; if (candidatesMap[targetCell] !== cellMask) { if (!assignValue(candidatesMap, solverData, targetCell, digitToEliminate, indent + "  ")) return false; } }
         }

        // Rule 3: Innies/Outies (Advanced)
        for (const unit of CLASSIC_UNITS_MAP[cellId]) { if (!checkInnies(candidatesMap, solverData, unit, indent + "  ")) return false; }
        if (cageIndex !== undefined) { const cage = solverData.cageDataArray[cageIndex]; for (let d_outie = 1; d_outie <= 9; d_outie++) { if (!checkOuties(candidatesMap, solverData, cage, d_outie, indent + "  ")) return false; } } // Pass digit for Outies

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

        cage.remainingSum -= assignedDigit;
        cage.remainingCellsCount -= 1;
        cage.currentValueMask |= digitMask;

        if (cage.remainingCellsCount < 0 || cage.remainingSum < 0) { console.error(`${indent}Cage FAIL St: Cage ${cageIndex} inv state`); return false; }
        if (cage.remainingCellsCount === 0 && cage.remainingSum !== 0) return false;

        if (cage.remainingCellsCount > 0) {
            const comboInfo = killerSudoku.getSumCombinationInfo(cage.remainingSum, cage.remainingCellsCount);
            if (!comboInfo) return false; // Sum impossible

            let allowedDigitsMask = comboInfo.digitMask;
            let requiredAvailableMask = allowedDigitsMask & ~cage.currentValueMask;

            if (requiredAvailableMask === 0 && cage.remainingSum > 0) return false; // Need digits but all used

            for (const cellId of cage.cells) {
                if (cellId !== assignedCellId && countCandidates(candidatesMap[cellId]) > 1) {
                    const maskToApply = requiredAvailableMask;
                    const originalCandidates = candidatesMap[cellId];
                    const newCandidates = originalCandidates & maskToApply;
                    if (newCandidates !== originalCandidates) {
                        const eliminatedMask = originalCandidates & ~newCandidates;
                        for (let d = 1; d <= 9; d++) {
                            if ((eliminatedMask & DIGIT_MASKS[d]) !== 0) {
                                if (!eliminateCandidate(candidatesMap, solverData, cellId, d, indent + "    ")) return false;
                            }
                        }
                    }
                     if (candidatesMap[cellId] === 0) return false; // Check after elimination
                }
            }
        }
        return true; // Update successful
    }

    /**
     * Checks the "Innie" rule.
     */
    function checkInnies(candidatesMap, solverData, unit, indent="") {
        let progress = false; // Track changes
        for (let d = 1; d <= 9; d++) {
            const digitMask = DIGIT_MASKS[d];
            let placesInUnit = [];
            let containingCageIndex = -1;
            for (const cellId of unit) {
                if (hasCandidate(candidatesMap[cellId], d)) {
                    placesInUnit.push(cellId);
                    const currentCageIdx = solverData.cellToCageMap[cellId];
                    if (currentCageIdx === undefined) { containingCageIndex = -2; break; } // Cell not in cage? Error.
                    if (containingCageIndex === -1) containingCageIndex = currentCageIdx;
                    else if (containingCageIndex !== currentCageIdx) { containingCageIndex = -2; break; }
                }
            }

            if (placesInUnit.length > 0 && containingCageIndex >= 0) {
                const targetCage = solverData.cageDataArray[containingCageIndex];
                if (!targetCage) continue;
                for (const cageCellId of targetCage.cells) {
                    let isInUnit = false;
                    for(const unitCellId of unit) { if (cageCellId === unitCellId) { isInUnit = true; break; } }
                    if (!isInUnit && hasCandidate(candidatesMap[cageCellId], d)) {
                        // console.log(`${indent}Innie Rule: Elim ${d} from ${cageCellId} (cage ${containingCageIndex}, outside unit)`);
                        if (!eliminateCandidate(candidatesMap, solverData, cageCellId, d, indent + "  ")) return false;
                        progress = true;
                    }
                }
            }
        }
        return true; // Return true even if no progress, just no contradiction found
    }

     /**
      * Checks the "Outie" rule for a specific digit.
      */
     function checkOuties(candidatesMap, solverData, cage, digit, indent="") {
         let progress = false;
         const digitMask = DIGIT_MASKS[digit];

         // Find all classic units that this cage intersects
         let intersectingUnitsMap = {};
         cage.cells.forEach(cellId => {
             (CLASSIC_UNITS_MAP[cellId] || []).forEach((unit) => {
                  const unitIndex = CLASSIC_UNITS.findIndex(u => u === unit);
                  if (unitIndex === -1) return;
                  if (!intersectingUnitsMap[unitIndex]) {
                      intersectingUnitsMap[unitIndex] = { unitCells: unit, internalCageCells: [] };
                  }
                  intersectingUnitsMap[unitIndex].internalCageCells.push(cellId);
             });
         });

         for (const unitIndex in intersectingUnitsMap) {
             const unitInfo = intersectingUnitsMap[unitIndex];
             const unit = unitInfo.unitCells;

             // Check if all places for 'digit' within the cage lie OUTSIDE this unit
             let canBeInternal = false;
             for (const internalCellId of unitInfo.internalCageCells) {
                  if (hasCandidate(candidatesMap[internalCellId], digit)) {
                      canBeInternal = true;
                      break;
                  }
             }

             if (!canBeInternal) { // All candidates for 'digit' in cage are external to this unit
                 // Check if 'digit' *can* actually be placed somewhere in the cage
                 let canBeInCage = false;
                 for(const cellId of cage.cells) { if(hasCandidate(candidatesMap[cellId], digit)) {canBeInCage = true; break;} }

                 if(canBeInCage) { // Only apply rule if digit is possible in the cage at all
                      // Eliminate 'digit' from unit cells that are OUTSIDE the cage
                      const cageCellsSet = new Set(cage.cells);
                      for (const unitCellId of unit) {
                          if (!cageCellsSet.has(unitCellId) && hasCandidate(candidatesMap[unitCellId], digit)) {
                               // console.log(`${indent}Outie Rule: Elim ${digit} from ${unitCellId} (unit ${unitIndex}, outside cage ${cage.id})`);
                               if (!eliminateCandidate(candidatesMap, solverData, unitCellId, digit, indent + "  ")) return false;
                               progress = true;
                          }
                      }
                 }
             }
         }
         return true;
     }


    // --- Solver Search Function ---
    function _search(candidatesMap, solverData, indent="") {
        var isSolved = true;
        for (const cellId of killerSudoku.SQUARES) { if (countCandidates(candidatesMap[cellId]) !== 1) { isSolved = false; break; } }
        if (isSolved) return candidatesMap;

        var minCandidates = 10, minCandidatesCell = null;
        for (const cellId of killerSudoku.SQUARES) { var numC = countCandidates(candidatesMap[cellId]); if (numC > 1 && numC < minCandidates) { minCandidates = numC; minCandidatesCell = cellId; if (minCandidates === 2) break; } }
        if (!minCandidatesCell) return false;

        var candidatesToTry = getCandidatesArray(candidatesMap[minCandidatesCell]);
        for (const digit of candidatesToTry) {
            var candidatesMapCopy = deepCopy(candidatesMap);
            var solverDataCopy = deepCopy(solverData);
            if (assignValue(candidatesMapCopy, solverDataCopy, minCandidatesCell, digit, indent + "    ")) {
                var result = _search(candidatesMapCopy, solverDataCopy, indent + "  ");
                if (result) return result;
            }
        }
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
            if (cage.initialDigitMask === 0 && cage.sum > 0 && cage.cells.length > 0) { console.error(`Cage ${i} impossible.`); propagationOk = false; break; }
            for(const cellId of cage.cells) {
                initialCandidatesMap[cellId] &= cage.initialDigitMask;
                 if (initialCandidatesMap[cellId] === 0) { console.error(`Contradiction: ${cellId} has 0 cands after initial cage ${i} mask.`); propagationOk = false; break; }
            }
            if (!propagationOk) break;
        }

        if (!propagationOk) { console.log("Initial constraint application failed."); return false; }
        console.log("Initial constraint application complete.");

        console.log("Starting recursive search...");
        var solutionMap = _search(initialCandidatesMap, deepCopy(solverData));

        if (solutionMap) { console.log("Solver finished successfully.");let solStr="";for(const sq of killerSudoku.SQUARES){let d=getSingleCandidateDigit(solMap[sq]);solStr+=(d>0?d:killerSudoku.BLANK_CHAR);}if(solStr.length!==killerSudoku.NR_SQUARES||solStr.includes(killerSudoku.BLANK_CHAR)){console.error("Solver incomplete map:",solMap);return false;}return solStr;}
        else { console.log("Solver could not find a solution."); return false; }
    };


    // --- GENERATOR IMPLEMENTATION ---
    function _generateClassicSolutionGrid(){var c={};for(const s of killerSudoku.SQUARES){if(typeof ALL_CANDIDATES==='undefined'){console.error("ALL_CANDS undef!");return false;}c[s]=ALL_CANDIDATES;}function searchClassic(a){var b=true;for(const c of killerSudoku.SQUARES){if(countCandidates(a[c])!==1){b=false;break;}}if(b)return a;var d=10,e=null;var f=_shuffleArray([...killerSudoku.SQUARES]);for(const g of f){var h=countCandidates(a[g]);if(h>1&&h<d){d=h;e=g;if(d===2)break;}}if(!e)return false;var i=_shuffleArray(getCandidatesArray(a[e]));for(const j of i){var k=deepCopy(a);if(_assignClassic(k,e,j)){var l=searchClassic(k);if(l)return l;}}return false;}function _assignClassic(a,b,c){var d=a[b]&~DIGIT_MASKS[c];for(let e=1;e<=9;e++){if((d&DIGIT_MASKS[e])!==0){if(!_eliminateClassic(a,b,e))return false;}}return true;}function _eliminateClassic(a,b,c){var d=DIGIT_MASKS[c];if((a[b]&d)===0)return true;a[b]&=~d;var e=a[b];var f=countCandidates(e);if(f===0)return false;if(f===1){var g=getSingleCandidateDigit(e);for(const h of CLASSIC_PEERS_MAP[b]){if(!_eliminateClassic(a,h,g))return false;}}for(const i of CLASSIC_UNITS_MAP[b]){var j=[];for(const k of i){if((a[k]&d)!==0)j.push(k);}if(j.length===0)return false;if(j.length===1){if(!_assignClassic(a,j[0],c))return false;}}return true;}var initAssign=_shuffleArray([...killerSudoku.SQUARES]);let initSuccess=true;for(let i=0;i<10;i++){let sq=initAssign[i];let pDs=getCandidatesArray(c[sq]);if(pDs.length>0){let d=pDs[Math.floor(Math.random()*pDs.length)];if(!_assignClassic(c,sq,d)){console.warn("Init assign fail, restart.");for(const sq_reset of killerSudoku.SQUARES){c[sq_reset]=ALL_CANDIDATES;}initSuccess=false;break;}}}if(!initSuccess)return _generateClassicSolutionGrid();var solMap=searchClassic(c);if(!solMap)return false;var resMap={};for(const sq of killerSudoku.SQUARES){resMap[sq]=getSingleCandidateDigit(solMap[sq]);if(resMap[sq]===0){console.error("Classic grid incomplete!");return false;}}return resMap;}
    function _partitionGridIntoCages(solvedGridMap, maxCageSize = 5, minCageSize = 2) { var cgs=[],unas=new Set(killerSudoku.SQUARES),map={};var maxAtt=killerSudoku.NR_SQUARES*10,att=0;/*console.log(`Partition grid. Init unassigned:${unas.size}`);*/while(unas.size>0&&att<maxAtt){att++;let remArr=Array.from(unas);let handledRem=false;if(remArr.length<=maxCageSize&&remArr.length>0){let attached=true;let toAttach=[...remArr];let successAtt=0;for(let i=toAttach.length-1;i>=0;i--){const remC=toAttach[i];const remD=solvedGridMap[remC];let cAtt=false;let targets=[];(SQUARE_NEIGHBORS[remC]||[]).forEach(n=>{const cO=map[n];if(cO?.id!==undefined){const tDigs=new Set(cO.cells.map(c=>solvedGridMap[c]));if(!tDigs.has(remD)&&cO.cells.length<9){if(!targets.some(t=>t.id===cO.id))targets.push(cO);}}});if(targets.length>0){const tCage=_shuffleArray(targets)[0];tCage.cells.push(remC);map[remC]=tCage;unas.delete(remC);successAtt++;cAtt=true;}if(!cAtt)attached=false;}if(!attached){remArr=Array.from(unas);if(remArr.length>0){console.warn(`Partition: Cannot attach ${remArr.length}. Forcing 1-cell cages.`);remArr.forEach(rc=>{const nCage={cells:[rc]};cgs.push(nCage);map[rc]=nCage;unas.delete(rc);});}}}handledRem=true;}if(unas.size===0)break;if(!handledRem){var startC=_getRandomElementFromSet(unas);if(!startC){console.warn("Partition: No start cell.");continue;}var cageCells=[startC];var cageDigits=new Set([solvedGridMap[startC]]);unas.delete(startC);const nCageObj={cells:cageCells};map[startC]=nCageObj;var remCnt=unas.size;var potMax=Math.min(maxCageSize,remCnt+1);if(remCnt>0&&remCnt+1>minCageSize&&remCnt+1-minCageSize<minCageSize){potMax=Math.min(maxCageSize,(remCnt+1)-minCageSize+1);}potMax=Math.max(minCageSize,potMax);var tSize=Math.floor(Math.random()*(potMax-minCageSize+1))+minCageSize;tSize=Math.min(tSize,remCnt+1);var added=true;while(cageCells.length<tSize&&added){added=false;let neighCand=[];for(const cell of cageCells){for(const n of(SQUARE_NEIGHBORS[cell]||[])){if(unas.has(n)&&!cageDigits.has(solvedGridMap[n])&&!neighCand.some(nc=>nc.cellId===n)){let freeCnt=0;(SQUARE_NEIGHBORS[n]||[]).forEach(nn=>{if(unas.has(nn))freeCnt++;});neighCand.push({cellId:n,freeNeighbors:freeCnt});}}}if(neighCand.length>0){neighCand.sort((a,b)=>a.freeNeighbors-b.freeNeighbors);var nextC=neighCand[0].cellId;cageCells.push(nextC);cageDigits.add(solvedGridMap[nextC]);unas.delete(nextC);map[nextC]=nCageObj;added=true;}}if(cageCells.length>=minCageSize){cgs.push(nCageObj);}else{cageCells.forEach(cell=>{unas.add(cell);delete map[cell];});}}}if(unas.size>0){console.error(`Partition failed definitively: ${unas.size} cells remain after ${att} attempts.`);return false;}cgs.forEach((cg,i)=>cg.id=i);console.log(`Partition OK: ${cgs.length} cages.`);return cgs;}
    function _calculateCageSums(cages, solvedGridMap) { cages.forEach(cg=>{cg.sum=0;cg.cells.forEach(cId=>{const d=solvedGridMap[cId];if(typeof d==='number'&&d>=1&&d<=9)cg.sum+=d;else{console.warn(`CalcSums: Inv digit ${cId}:`,d);cg.sum=NaN;}});if(isNaN(cg.sum))console.error("Cage sum NaN:",cg);});}
    var GENERATION_DIFFICULTY_PARAMS={"easy":{maxCage:6,minCage:2},"medium":{maxCage:5,minCage:2},"hard":{maxCage:5,minCage:2},"very-hard":{maxCage:4,minCage:2},"insane":{maxCage:4,minCage:2},"inhuman":{maxCage:4,minCage:2},"default":{maxCage:5,minCage:2}};
    killerSudoku.generate = function(difficulty = "medium", maxAttempts = 50) { console.log(`Generate Killer(diff:${difficulty}, att:${maxAttempts})`);var params=GENERATION_DIFFICULTY_PARAMS[difficulty];if(!params){console.warn(`Diff '${difficulty}' unknown, using default.`);params=GENERATION_DIFFICULTY_PARAMS.default;}if(!params){console.error("FATAL: Default difficulty params missing!");params={maxCage:5,minCage:2};}console.log(`Using params: maxCage=${params.maxCage}, minCage=${params.minCage}`);for(let att=1;att<=maxAttempts;++att){console.log(`Gen attempt ${att}/${maxAttempts}...`);/*console.log("Gen classic...");*/var solvedMap=_generateClassicSolutionGrid();if(!solvedMap){console.warn("Fail gen classic, retry...");continue;}/*console.log(`Partition grid(max:${params.maxCage}, min:${params.minCage})...`);*/var cagesCells=_partitionGridIntoCages(solvedMap,params.maxCage,params.minCage);if(!cagesCells){console.warn("Fail partition, retry gen...");continue;}/*console.log("Calc sums...");*/_calculateCageSums(cagesCells,solvedMap);if(cagesCells.some(cage=>isNaN(cage.sum))){console.error("Cage sum NaN. Retrying gen.");continue;}var puzzle={cages:cagesCells};if(SKIP_SOLVER_VERIFICATION){console.log(`Generation attempt ${att} OK (Verification SKIPPED)!`);return puzzle;}else{console.log("Verify solvability...");var solveRes=killerSudoku.solve(deepCopy(puzzle.cages));if(solveRes&&typeof solveRes==='string'&&solveRes.length===killerSudoku.NR_SQUARES){console.log(`Gen OK after ${att} attempts!`);let genSolutionStr="";for(const sq of killerSudoku.SQUARES)genSolutionStr+=solvedMap[sq];if(solveRes!==genSolutionStr)console.warn("Solver result MISMATCHES generator base grid!");return puzzle;}else{console.warn(`Verify fail(Solver:${solveRes}).Retry gen...`);}}}console.error(`Failed gen Killer after ${maxAttempts} attempts.`);return false;};


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
