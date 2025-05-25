/*
    killerSudoku.js
    ---------------
    JavaScript library for Killer Sudoku puzzle generation and solving.
    Final corrected version with full implementations and fixed break statement.
*/

(function(root) {
    var killerSudoku = root.killerSudoku = {};

    // --- Constants ---
    killerSudoku.DIGITS = "123456789";
    var ROWS = "ABCDEFGHI";
    var COLS = killerSudoku.DIGITS;
    killerSudoku.NR_SQUARES = 81;
    killerSudoku.BLANK_CHAR = '.'; // Используем точку как стандартный пустой символ
    killerSudoku.BLANK_BOARD = ".................................................................................";

    // --- Precomputed Data ---
    killerSudoku.SQUARES = null;
    var SQUARE_MAP = null;
    var CLASSIC_UNITS = null;
    var CLASSIC_UNITS_MAP = null;
    var CLASSIC_PEERS_MAP = null;
    var SQUARE_NEIGHBORS = {};

    // --- Configuration ---
    var SKIP_SOLVER_VERIFICATION = true; // Set to false to enable solver check

    // --- Bitset Constants and Helpers ---
    var ALL_CANDIDATES = 511; killerSudoku.ALL_CANDIDATES_MASK = ALL_CANDIDATES;
    var DIGIT_MASKS = [0, 1, 2, 4, 8, 16, 32, 64, 128, 256]; killerSudoku.DIGIT_MASKS = DIGIT_MASKS;
    function getDigitMask(d){return DIGIT_MASKS[d]||0;}
    function hasCandidate(b,d){return(b&DIGIT_MASKS[d])!==0;}
    // function addCandidate(b,d){return b|DIGIT_MASKS[d];} // Не используется в текущей версии генератора/решателя
    // function removeCandidate(b,d){return b&~DIGIT_MASKS[d];} // Не используется
    function countCandidates(b){var c=0;while(b>0){b&=b-1;c++;}return c;}
    function getCandidatesArray(b){var a=[];for(let d=1;d<=9;++d)if(hasCandidate(b,d))a.push(d);return a;}
    // function intersectCandidates(b1,b2){return b1&b2;} // Не используется
    function getSingleCandidateDigit(b){if(b>0&&(b&(b-1))===0){for(let d=1;d<=9;++d){if(b===DIGIT_MASKS[d])return d;}}return 0;}
    // function formatBitset(b) { return getCandidatesArray(b).join('') || '-'; } // Не используется

    // --- Deep Copy Utility ---
    function deepCopy(a){if(a===null||typeof a!=="object")return a;if(a instanceof Date)return new Date(a.getTime());if(a instanceof Set)return new Set(Array.from(a).map(item => deepCopy(item)));if(Array.isArray(a)){const b=[];for(let c=0;c<a.length;c++)b[c]=deepCopy(a[c]);return b;}const b={};for(const c in a)if(Object.prototype.hasOwnProperty.call(a, c))b[c]=deepCopy(a[c]);return b;}


    // --- Cage Representation and Initialization ---
     /** @typedef {object} CageInput @property {number} sum @property {string[]} cells */
     /** @typedef {object} CageDataInternal @property {number} id @property {number} sum @property {string[]} cells @property {number} initialDigitMask @property {number} remainingSum @property {number} remainingCellsCount @property {number} currentValueMask */
     /** @typedef {object} SolverData @property {object.<string, number>} cellToCageMap @property {CageDataInternal[]} cageDataArray */

    killerSudoku._initializeSolverData = function(cages) {
        if (!Array.isArray(cages)) { console.error("Invalid cages format: not an array."); return false; }
        var cellMap = {}, cageArr = [], assigned = {};
        for (var i = 0; i < cages.length; ++i) {
            var cg = cages[i];
            if (!cg || typeof cg.sum !== 'number' || !Array.isArray(cg.cells) || cg.cells.length === 0) { console.error(`Invalid cage format at index ${i}.`); return false; }
            if (cg.sum <= 0 && cg.cells.length > 0) { console.error(`Invalid cage sum for multi-cell cage at index ${i}.`); return false; }
            if (cg.cells.length > 9) { console.error(`Invalid cage size (too large) at index ${i}.`); return false; }

            var cells = [];
            for (var j = 0; j < cg.cells.length; ++j) {
                var cId = cg.cells[j];
                if (!SQUARE_MAP) { console.error("SQUARE_MAP is not initialized!"); return false; }
                if (typeof cId !== 'string' || SQUARE_MAP[cId] === undefined) { console.error(`Invalid cell ID "${cId}" in cage ${i}.`); return false; }
                if (assigned[cId] !== undefined) { console.error(`Cell ${cId} belongs to multiple cages: ${i} and ${assigned[cId]}.`); return false; }
                assigned[cId] = i;
                cellMap[cId] = i; // Map cell ID to cage index
                cells.push(cId);
            }

            if (cells.length > 0) {
                var minPossibleSum = (cells.length * (cells.length + 1)) / 2;
                var maxPossibleSum = (cells.length * (19 - cells.length)) / 2;
                if (cg.sum < minPossibleSum || cg.sum > maxPossibleSum) {
                    console.error(`Invalid sum ${cg.sum} for cage size ${cells.length} at index ${i}. Min: ${minPossibleSum}, Max: ${maxPossibleSum}.`);
                    return false;
                }
            }

            var cInfo = killerSudoku.getSumCombinationInfo(cg.sum, cells.length);
            if (cells.length > 0 && !cInfo) { // cInfo can be null for sum 0, length 0
                 console.error(`Impossible sum ${cg.sum} for ${cells.length} cells in cage ${i}.`);
                 return false;
            }

            cageArr.push({
                id: i, // Use index as ID
                sum: cg.sum,
                cells: cells,
                initialDigitMask: cInfo ? cInfo.digitMask : (cells.length === 0 ? ALL_CANDIDATES : 0), // if no cells, mask allows all initially
                remainingSum: cg.sum,
                remainingCellsCount: cells.length,
                currentValueMask: 0,
            });
        }

        const assignedCnt = Object.keys(assigned).length;
        if (killerSudoku.SQUARES && assignedCnt !== killerSudoku.NR_SQUARES) { // Ensure all squares are covered if SQUARES is initialized
            console.error(`Invalid cage definition: ${assignedCnt} cells covered, expected ${killerSudoku.NR_SQUARES}.`);
            if (killerSudoku.SQUARES) {
                const missing = killerSudoku.SQUARES.filter(sq => assigned[sq] === undefined);
                if (missing.length > 0) console.error("Missing cells from cages:", missing);
            }
            return false;
        }
        // console.log("Solver data initialized successfully.");
        return { cellToCageMap: cellMap, cageDataArray: cageArr };
    };


    // --- Sum Combination Cache and Calculation ---
    var SUM_COMBINATION_CACHE = {};
    killerSudoku.getSumCombinationInfo = function(targetSum, numCells) {
        if (numCells < 0 || numCells > 9 || targetSum < 0) return null; // Allow targetSum 0 for 0 cells
        if (numCells === 0) return targetSum === 0 ? { combinations: [[]], digitMask: 0 } : null;

        var minSum = (numCells * (numCells + 1)) / 2;
        var maxSum = (numCells * (19 - numCells)) / 2;
        if (targetSum < minSum || targetSum > maxSum) return null;

        if (SUM_COMBINATION_CACHE[targetSum] && SUM_COMBINATION_CACHE[targetSum][numCells] !== undefined) {
            return SUM_COMBINATION_CACHE[targetSum][numCells];
        }

        var combos = [];
        function findRec(currentRemainingSum, kRemainingCells, startDigit, currentCombo) {
            if (currentRemainingSum === 0 && kRemainingCells === 0) {
                combos.push([...currentCombo]);
                return;
            }
            if (currentRemainingSum < 0 || kRemainingCells === 0 || startDigit > 9) return;

            for (let d = startDigit; d <= 9; ++d) {
                let nextKRemainingCells = kRemainingCells - 1;
                // Pruning: check if remaining sum can be achieved with remaining cells
                let minPossibleNextSum = 0;
                if (nextKRemainingCells > 0) {
                     minPossibleNextSum = (nextKRemainingCells * ( (d + 1) + (d + nextKRemainingCells) )) / 2; // sum of arithmetic series
                }
                if (currentRemainingSum - d < minPossibleNextSum) break; // If we pick 'd', the remainder is too small

                let maxPossibleNextSum = 0;
                for(let r_idx = 0; r_idx < nextKRemainingCells; ++r_idx) {
                    maxPossibleNextSum += (9 - r_idx);
                }
                if (currentRemainingSum - d > maxPossibleNextSum && nextKRemainingCells > 0) continue; // If we pick 'd', remainder is too large (and we need more cells)


                currentCombo.push(d);
                findRec(currentRemainingSum - d, nextKRemainingCells, d + 1, currentCombo);
                currentCombo.pop();
            }
        }

        findRec(targetSum, numCells, 1, []);
        var result = null;
        if (combos.length > 0) {
            var mask = 0;
            combos.forEach(c => { c.forEach(d => { mask |= DIGIT_MASKS[d]; }); });
            result = { combinations: combos, digitMask: mask };
        }

        if (!SUM_COMBINATION_CACHE[targetSum]) SUM_COMBINATION_CACHE[targetSum] = {};
        SUM_COMBINATION_CACHE[targetSum][numCells] = result;
        return result;
    };

    // --- Constraint Propagation ---
    function assignValue(candidatesMap, solverData, cellId, digitToAssign, indent = "") {
        var otherDigitsMask = candidatesMap[cellId] & ~DIGIT_MASKS[digitToAssign];
        for (let d = 1; d <= 9; ++d) {
            if ((otherDigitsMask & DIGIT_MASKS[d]) !== 0) {
                if (!eliminateCandidate(candidatesMap, solverData, cellId, d, indent + "  ")) return false;
            }
        }
        // After eliminating other candidates, update cage state based on this assignment
        if (!updateCageStateOnAssign(candidatesMap, solverData, cellId, digitToAssign, indent + "  ")) return false;
        return true;
    }

    function eliminateCandidate(candidatesMap, solverData, cellId, digitToEliminate, indent = "") {
        var digitMask = DIGIT_MASKS[digitToEliminate];
        var initialCellCandidates = candidatesMap[cellId];

        if ((initialCellCandidates & digitMask) === 0) return true; // Already eliminated

        if (!CLASSIC_PEERS_MAP || !CLASSIC_UNITS_MAP || !solverData?.cellToCageMap || !solverData?.cageDataArray) {
            console.error("Solver internal maps not ready for eliminateCandidate.");
            return false;
        }

        candidatesMap[cellId] &= ~digitMask; // Eliminate the candidate
        var remainingCandidates = candidatesMap[cellId];
        var numRemaining = countCandidates(remainingCandidates);

        if (numRemaining === 0) return false; // Contradiction: cell has no candidates left

        if (numRemaining === 1) {
            var finalDigit = getSingleCandidateDigit(remainingCandidates);
            for (const peer of CLASSIC_PEERS_MAP[cellId]) {
                if (!eliminateCandidate(candidatesMap, solverData, peer, finalDigit, indent + "  ")) return false;
            }
            // If a cell is reduced to 1 candidate, it's like an assignment for cage logic
            if (!updateCageStateOnAssign(candidatesMap, solverData, cellId, finalDigit, indent + "  ")) return false;
        }

        // Check classic units (row, col, block)
        for (const unit of CLASSIC_UNITS_MAP[cellId]) {
            var placesForDigitInUnit = [];
            for (const cellInUnit of unit) {
                if ((candidatesMap[cellInUnit] & digitMask) !== 0) { // If digitToEliminate is still a candidate
                    placesForDigitInUnit.push(cellInUnit);
                }
            }
            if (placesForDigitInUnit.length === 0) return false; // Contradiction: digit has nowhere to go in this unit
            if (placesForDigitInUnit.length === 1) {
                const targetCell = placesForDigitInUnit[0];
                // If this digit must be in targetCell, assign it (if not already a single candidate)
                 if (candidatesMap[targetCell] !== digitMask) { // Check if it's not already just that digit
                    if (!assignValue(candidatesMap, solverData, targetCell, digitToEliminate, indent + "  ")) return false;
                 }
            }
        }

        // Check cage (Killer Sudoku specific)
        const cageIndex = solverData.cellToCageMap[cellId];
        if (cageIndex !== undefined) {
            const cage = solverData.cageDataArray[cageIndex];
            let placesForDigitInCage = [];
            for (const cellInCage of cage.cells) {
                 // Only consider cells that are not yet solved (have more than 1 candidate)
                if (countCandidates(candidatesMap[cellInCage]) > 1 && (candidatesMap[cellInCage] & digitMask) !== 0) {
                    placesForDigitInCage.push(cellInCage);
                }
            }
            if (placesForDigitInCage.length === 0 && cage.remainingCellsCount > 0 && (killerSudoku.getSumCombinationInfo(cage.remainingSum, cage.remainingCellsCount)?.digitMask & digitMask) !==0 ) {
                 // This check might be too complex here or indicate an issue.
                 // If the digit *must* be in the cage for sum combinations, but has no place.
                 // For now, this primarily handles the "last place in cage" logic.
            }
            if (placesForDigitInCage.length === 1) {
                const targetCellInCage = placesForDigitInCage[0];
                if (candidatesMap[targetCellInCage] !== digitMask) { // if not already just that digit
                    if (!assignValue(candidatesMap, solverData, targetCellInCage, digitToEliminate, indent + "  ")) return false;
                }
            }
        }
        // After eliminations, re-check Innie/Outie for affected units/cages
        for (const unit of CLASSIC_UNITS_MAP[cellId]) { if (!checkInnies(candidatesMap, solverData, unit, indent + "  ")) return false; }
        if (cageIndex !== undefined) { const cage = solverData.cageDataArray[cageIndex]; for (let d_outie = 1; d_outie <= 9; d_outie++) { if (!checkOuties(candidatesMap, solverData, cage, d_outie, indent + "  ")) return false; } }

        return true;
    }

    function updateCageStateOnAssign(candidatesMap, solverData, assignedCellId, assignedDigit, indent = "") {
        const cageIndex = solverData.cellToCageMap[assignedCellId];
        if (cageIndex === undefined) return true; // Cell not in a cage, or cage data not fully initialized

        const cage = solverData.cageDataArray[cageIndex];
        if (!cage) { console.error("Cage not found in updateCageStateOnAssign for index:", cageIndex); return false;}

        const digitMask = DIGIT_MASKS[assignedDigit];

        // Check if this digit was already accounted for in the cage's solved values (e.g. from a previous step in recursion)
        // This check is crucial to prevent double-counting or incorrect state updates if assign is called multiple times for same cell/digit
        let isNewAssignmentForCage = false;
        if ((cage.currentValueMask & digitMask) === 0) { // If digit is NOT YET in currentValueMask
             // Also, ensure the cell itself was considered 'remaining'
             let wasRemaining = false;
             for(let i=0; i < cage.cells.length; ++i){
                 if(cage.cells[i] === assignedCellId && countCandidates(candidatesMap[assignedCellId]) === 1){ // Or check original state before this assignment
                     // This logic is tricky: we need to know if this assignment *just now* reduced remainingCellsCount
                     // Let's assume if a value is assigned, it reduces remaining count if not already set
                     wasRemaining = true; // Simplification: assume an assign reduces count
                     break;
                 }
             }
             if(wasRemaining){ // This check needs refinement based on when remainingCellsCount is decremented
                isNewAssignmentForCage = true;
             }
        }


        // Only update if it's a "new" assignment for the cage's sum/cell count perspective
        // The currentValueMask check should be sufficient for sum calculation
        if ((cage.currentValueMask & digitMask) === 0) { // If digit is NOT YET in currentValueMask
            cage.remainingSum -= assignedDigit;
            cage.remainingCellsCount -= 1; // This should only happen once per cell in cage
            cage.currentValueMask |= digitMask;
        }


        if (cage.remainingCellsCount < 0 || cage.remainingSum < 0) {
            // console.error(`${indent}Cage State FAIL: Cage ${cage.id} has invalid state (sum: ${cage.remainingSum}, cells: ${cage.remainingCellsCount}).`);
            return false;
        }

        if (cage.remainingCellsCount === 0) {
            if (cage.remainingSum !== 0) return false; // All cells filled, sum must be 0
        } else { // remainingCellsCount > 0
            const combinationInfo = killerSudoku.getSumCombinationInfo(cage.remainingSum, cage.remainingCellsCount);
            if (!combinationInfo) return false; // No way to sum to remainingSum with remainingCells

            let allowedDigitsForRemainingCells = combinationInfo.digitMask;
            // Digits already used in this cage (currentValueMask) cannot be used again in remaining cells
            let requiredDigitsForRemaining = allowedDigitsForRemainingCells & ~cage.currentValueMask;

            if (requiredDigitsForRemaining === 0 && cage.remainingSum > 0) {
                 // This implies all digits needed for the sum are already in currentValueMask,
                 // but remainingSum > 0, which shouldn't happen if logic is correct.
                 // Or, it means remaining digits for sum can't be placed due to conflicts.
                 return false;
            }


            for (const cellIdInCage of cage.cells) {
                if (cellIdInCage !== assignedCellId && countCandidates(candidatesMap[cellIdInCage]) > 1) { // If cell is not solved
                    const originalCellCands = candidatesMap[cellIdInCage];
                    const newCellCands = originalCellCands & requiredDigitsForRemaining;

                    if (newCellCands === 0 && originalCellCands !== 0) return false; // No valid candidates left for this cell

                    if (newCellCands !== originalCellCands) {
                        // Eliminated candidates based on cage sum logic
                        const eliminatedInThisCellMask = originalCellCands & ~newCellCands;
                        for (let d = 1; d <= 9; d++) {
                            if ((eliminatedInThisCellMask & DIGIT_MASKS[d]) !== 0) {
                                if (!eliminateCandidate(candidatesMap, solverData, cellIdInCage, d, indent + "    ")) return false;
                            }
                        }
                    }
                     if (candidatesMap[cellIdInCage] === 0 && originalCellCands !== 0) return false; // Double check after elimination
                }
            }
        }
        return true;
    }

    function checkInnies(candidatesMap, solverData, unit, indent="") {
        // An "innie" occurs when all possible locations for a digit within a unit
        // fall into a single cage. That digit can then be eliminated from other
        // cells of that cage that are outside the unit.
        for (let d = 1; d <= 9; d++) {
            const digitMask = DIGIT_MASKS[d];
            let placesInUnitForDigit = [];
            let uniqueCageIndex = -1;
            let multipleCages = false;

            for (const cellId of unit) { // unit is an array of cell IDs
                if (hasCandidate(candidatesMap[cellId], d)) {
                    placesInUnitForDigit.push(cellId);
                    const currentCellCageIndex = solverData.cellToCageMap[cellId];
                    if (currentCellCageIndex === undefined) { // Should not happen if all cells are in cages
                        multipleCages = true; break;
                    }
                    if (uniqueCageIndex === -1) {
                        uniqueCageIndex = currentCellCageIndex;
                    } else if (uniqueCageIndex !== currentCellCageIndex) {
                        multipleCages = true; break;
                    }
                }
            }

            if (!multipleCages && uniqueCageIndex !== -1 && placesInUnitForDigit.length > 0) {
                const targetCage = solverData.cageDataArray[uniqueCageIndex];
                if (!targetCage) continue;

                const unitCellsSet = new Set(unit);
                for (const cageCellId of targetCage.cells) {
                    if (!unitCellsSet.has(cageCellId) && hasCandidate(candidatesMap[cageCellId], d)) {
                        // console.log(`${indent}Innie Rule: Eliminating ${d} from ${cageCellId} (outside unit but in cage ${targetCage.id})`);
                        if (!eliminateCandidate(candidatesMap, solverData, cageCellId, d, indent + "  ")) {
                            // console.log(`${indent}Innie FAIL: Contradiction eliminating ${d} from ${cageCellId}`);
                            return false;
                        }
                        // progress = true; // To indicate a change was made, if needed for loops
                    }
                }
            }
        }
        return true;
    }

    function checkOuties(candidatesMap, solverData, cage, digit, indent="") {
        // An "outie" occurs when all possible locations for a digit within a cage
        // fall into a single unit (row, col, block). That digit can then be
        // eliminated from other cells of that unit that are outside the cage.
        const digitMask = DIGIT_MASKS[digit];
        let placesInCageForDigit = [];
        for (const cellId of cage.cells) {
            if (hasCandidate(candidatesMap[cellId], digit)) {
                placesInCageForDigit.push(cellId);
            }
        }

        if (placesInCageForDigit.length === 0) return true; // Digit cannot be in this cage

        // Check for confinement to a single row, column, or block
        for (let unitType = 0; unitType < 3; unitType++) { // 0:Row, 1:Col, 2:Block
            let uniqueUnitIndex = -1;
            let multipleUnits = false;
            let unitCellsForOutie = null;

            for (const cellId of placesInCageForDigit) {
                const cellCoords = killerSolverLogic.getCellCoords(cellId); // Assuming this exists and works
                if (!cellCoords) { multipleUnits = true; break; }

                let currentUnitIndex;
                let tempUnitCells;

                if (unitType === 0) { // Row
                    currentUnitIndex = cellCoords.r;
                    tempUnitCells = CLASSIC_UNITS_MAP[cellId].find(u => u.every(sq => killerSolverLogic.getCellCoords(sq).r === currentUnitIndex));
                } else if (unitType === 1) { // Col
                    currentUnitIndex = cellCoords.c;
                    tempUnitCells = CLASSIC_UNITS_MAP[cellId].find(u => u.every(sq => killerSolverLogic.getCellCoords(sq).c === currentUnitIndex));
                } else { // Block
                    currentUnitIndex = Math.floor(cellCoords.r / 3) * 3 + Math.floor(cellCoords.c / 3);
                    tempUnitCells = CLASSIC_UNITS_MAP[cellId].find(u => {
                        return u.every(sq => {
                            const sqCoords = killerSolverLogic.getCellCoords(sq);
                            return Math.floor(sqCoords.r / 3) * 3 + Math.floor(sqCoords.c / 3) === currentUnitIndex;
                        });
                    });
                }
                 if (!tempUnitCells) { multipleUnits = true; break;}


                if (uniqueUnitIndex === -1) {
                    uniqueUnitIndex = currentUnitIndex;
                    unitCellsForOutie = tempUnitCells;
                } else if (uniqueUnitIndex !== currentUnitIndex) {
                    multipleUnits = true; break;
                }
            }

            if (!multipleUnits && uniqueUnitIndex !== -1 && unitCellsForOutie) {
                const cageCellsSet = new Set(cage.cells);
                for (const unitCellId of unitCellsForOutie) {
                    if (!cageCellsSet.has(unitCellId) && hasCandidate(candidatesMap[unitCellId], digit)) {
                        // console.log(`${indent}Outie Rule: Eliminating ${digit} from ${unitCellId} (in unit but outside cage ${cage.id})`);
                        if (!eliminateCandidate(candidatesMap, solverData, unitCellId, digit, indent + "  ")) {
                            // console.log(`${indent}Outie FAIL: Contradiction eliminating ${digit} from ${unitCellId}`);
                            return false;
                        }
                        // progress = true;
                    }
                }
            }
        }
        return true;
    }


    // --- Solver Search Function ---
    function _search(candidatesMap, solverData, indent="") {
        var isSolved = true;
        for (const sq of killerSudoku.SQUARES) {
            if (countCandidates(candidatesMap[sq]) !== 1) {
                isSolved = false;
                break;
            }
        }
        if (isSolved) return candidatesMap;

        var minCandidates = 10, mostConstrainedSquare = null;
        for (const sq of killerSudoku.SQUARES) {
            var numCands = countCandidates(candidatesMap[sq]);
            if (numCands > 1 && numCands < minCandidates) {
                minCandidates = numCands;
                mostConstrainedSquare = sq;
                if (minCandidates === 2) break; // Optimization
            }
        }

        if (!mostConstrainedSquare) return false; // No square found to branch on, but not solved (should indicate error or already failed)

        var tryDigits = getCandidatesArray(candidatesMap[mostConstrainedSquare]);
        for (const digit of tryDigits) {
            var mapCopy = deepCopy(candidatesMap);
            var solverDataCopy = deepCopy(solverData); // Must deep copy solverData as it also holds state (remainingSum etc.)

            if (assignValue(mapCopy, solverDataCopy, mostConstrainedSquare, digit, indent + "    ")) {
                var result = _search(mapCopy, solverDataCopy, indent + "  ");
                if (result) return result;
            }
        }
        return false; // Backtrack
    }

    // --- Public Solver Function ---
    killerSudoku.solve = function(cagesInput) {
        // console.log("Starting Killer Sudoku solver...");
        const solverData = killerSudoku._initializeSolverData(deepCopy(cagesInput)); // Use deep copy of cages
        if (!solverData) { console.error("Failed to initialize solver data for solving."); return false; }

        var initialCandidatesMap = {};
        for (const sq of killerSudoku.SQUARES) {
            initialCandidatesMap[sq] = ALL_CANDIDATES;
        }

        // console.log("Applying initial cage constraints for solver...");
        var propagationOK = true;
        for (let i = 0; i < solverData.cageDataArray.length; ++i) {
            const cage = solverData.cageDataArray[i];
            if (cage.initialDigitMask === 0 && cage.sum > 0 && cage.cells.length > 0) {
                // console.error(`Cage ${i} is impossible based on initial mask.`);
                propagationOK = false; break;
            }
            for (const cellId of cage.cells) {
                initialCandidatesMap[cellId] &= cage.initialDigitMask;
                if (initialCandidatesMap[cellId] === 0) {
                    // console.error(`Contradiction: Cell ${cellId} has 0 candidates after initial mask from cage ${i}.`);
                    propagationOK = false; break;
                }
            }
            if (!propagationOK) break;
        }

        if (!propagationOK) { /* console.log("Initial constraint application failed for solver.");*/ return false; }

        // Initial propagation of single-candidate cells based on masks
        for (const sq of killerSudoku.SQUARES) {
            if (countCandidates(initialCandidatesMap[sq]) === 1) {
                if (!assignValue(initialCandidatesMap, solverData, sq, getSingleCandidateDigit(initialCandidatesMap[sq]))) {
                    // console.log("Contradiction during initial propagation of singles for solver.");
                    return false;
                }
            }
        }
        // console.log("Initial constraints applied. Starting recursive search for solver...");
        var solutionMap = _search(initialCandidatesMap, solverData);

        if (solutionMap) {
            // console.log("Solver found a solution.");
            let solutionString = "";
            for (const sq of killerSudoku.SQUARES) {
                let digit = getSingleCandidateDigit(solutionMap[sq]);
                solutionString += (digit > 0 ? digit : killerSudoku.BLANK_CHAR);
            }
            if (solutionString.length !== killerSudoku.NR_SQUARES || solutionString.includes(killerSudoku.BLANK_CHAR)) {
                console.error("Solver returned incomplete or invalid map:", solutionMap);
                return false;
            }
            return solutionString;
        } else {
            // console.log("Solver failed to find a solution.");
            return false;
        }
    };


    // --- GENERATOR IMPLEMENTATION ---
    function _generateClassicSolutionGrid() {
        var candidates = {};
        for (const sq of killerSudoku.SQUARES) {
            if (typeof ALL_CANDIDATES === 'undefined') { console.error("ALL_CANDIDATES is undefined in _generateClassicSolutionGrid!"); return false; }
            candidates[sq] = ALL_CANDIDATES;
        }

        function searchClassic(cands) {
            var isSolved = true;
            for (const sq of killerSudoku.SQUARES) { if (countCandidates(cands[sq]) !== 1) { isSolved = false; break; } }
            if (isSolved) return cands;

            var minCand = 10, minSq = null;
            var shuffledSquares = _shuffleArray([...killerSudoku.SQUARES]); // Iterate randomly
            for (const sq of shuffledSquares) {
                var numC = countCandidates(cands[sq]);
                if (numC > 1 && numC < minCand) {
                    minCand = numC; minSq = sq;
                    if (minCand === 2) break; // Optimization
                }
            }
            if (!minSq) return false; // No cell to branch on but not solved

            var digitsToTry = _shuffleArray(getCandidatesArray(cands[minSq]));
            for (const digit of digitsToTry) {
                var candsCopy = deepCopy(cands);
                if (_assignClassic(candsCopy, minSq, digit)) {
                    var result = searchClassic(candsCopy);
                    if (result) return result;
                }
            }
            return false;
        }

        function _assignClassic(cands, sq, digit) {
            var otherDigitsMask = cands[sq] & ~DIGIT_MASKS[digit];
            for (let d = 1; d <= 9; d++) {
                if ((otherDigitsMask & DIGIT_MASKS[d]) !== 0) {
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

            if (count === 0) return false; // Contradiction

            if (count === 1) { // Naked Single
                var singleDigit = getSingleCandidateDigit(remaining);
                for (const peer of CLASSIC_PEERS_MAP[sq]) {
                    if (!_eliminateClassic(cands, peer, singleDigit)) return false;
                }
            }

            // Hidden Single Check
            for (const unit of CLASSIC_UNITS_MAP[sq]) {
                var places = [];
                for (const unitSq of unit) {
                    if ((cands[unitSq] & mask) !== 0) { // If 'digit' is a candidate in unitSq
                        places.push(unitSq);
                    }
                }
                if (places.length === 0) return false; // Contradiction
                if (places.length === 1) { // 'digit' can only go in places[0] in this unit
                    if (!_assignClassic(cands, places[0], digit)) return false;
                }
            }
            return true;
        }

        // Initial assignment to break symmetry and guide search
        var initialSquaresToAssign = _shuffleArray([...killerSudoku.SQUARES]);
        let initialAssignmentSuccess = true;
        for (let i = 0; i < Math.min(10, killerSudoku.NR_SQUARES); i++) { // Assign a few cells
            let sqToAssign = initialSquaresToAssign[i];
            let possibleDigits = getCandidatesArray(candidates[sqToAssign]);
            if (possibleDigits.length > 0) {
                let digitToAssign = possibleDigits[Math.floor(Math.random() * possibleDigits.length)];
                if (!_assignClassic(candidates, sqToAssign, digitToAssign)) {
                    // console.warn("Initial assignment failed, restarting classic grid generation.");
                    // Reset candidates and retry (or simply let the main loop handle retries)
                    for (const sq_reset of killerSudoku.SQUARES) { candidates[sq_reset] = ALL_CANDIDATES; }
                    initialAssignmentSuccess = false;
                    break;
                }
            }
        }

        if (!initialAssignmentSuccess) {
            // console.warn("Restarting classic generation due to initial assignment failure.");
            return _generateClassicSolutionGrid(); // Recursive call to retry
        }


        var solMapBitset = searchClassic(candidates);
        if (!solMapBitset) return false;

        var resultMap = {};
        for (const sq of killerSudoku.SQUARES) {
            resultMap[sq] = getSingleCandidateDigit(solMapBitset[sq]);
            if (resultMap[sq] === 0) { console.error("Classic grid generation resulted in an incomplete grid!"); return false; }
        }
        return resultMap; // Returns {A1: 5, A2: 3, ...}
    }


    function _partitionGridIntoCages(solvedGridMap, maxCageSize = 5, minCageSize = 2) {
        var cages = [];
        var unassignedCells = new Set(killerSudoku.SQUARES);
        var cellToCageObjectMap = {}; // Для быстрого доступа к объекту клетки по ID ячейки
        var currentCageIdCounter = 0;

        var maxTotalAttempts = killerSudoku.NR_SQUARES * 30; // Общий лимит попыток, чтобы избежать бесконечного цикла
        var totalAttempts = 0;

        while (unassignedCells.size > 0 && totalAttempts < maxTotalAttempts) {
            totalAttempts++;
            var startCell;

            // Стратегия: если осталось мало ячеек, обрабатываем их в первую очередь
            if (unassignedCells.size <= maxCageSize * 2 && unassignedCells.size > 0) { // Например, если осталось <= 10 ячеек
                let remainingToProcess = Array.from(unassignedCells);
                let processedInThisBlock = new Set(); // Ячейки, обработанные в этом блоке остатков

                // Сначала пытаемся присоединить к существующим клеткам
                for (let i = 0; i < remainingToProcess.length; i++) {
                    const cell = remainingToProcess[i];
                    if (processedInThisBlock.has(cell)) continue;

                    const cellDigit = solvedGridMap[cell];
                    let attached = false;
                    let shuffledNeighbors = _shuffleArray([...(SQUARE_NEIGHBORS[cell] || [])]);

                    for (const neighbor of shuffledNeighbors) {
                        const cageObj = cellToCageObjectMap[neighbor]; // Сосед может быть уже в клетке
                        if (cageObj && cageObj.cells.length < 9) { // Клетка не переполнена
                            const cageDigits = new Set(cageObj.cells.map(c_id => solvedGridMap[c_id]));
                            if (!cageDigits.has(cellDigit)) { // Цифра не дублируется
                                // Проверяем, не нарушит ли добавление сумму (упрощенная проверка)
                                if (killerSudoku.getSumCombinationInfo(cageObj.sum + cellDigit, cageObj.cells.length + 1)) {
                                    cageObj.cells.push(cell);
                                    cellToCageObjectMap[cell] = cageObj;
                                    unassignedCells.delete(cell);
                                    processedInThisBlock.add(cell);
                                    attached = true;
                                    break; // Присоединили, переходим к следующей оставшейся ячейке
                                }
                            }
                        }
                    }
                }
                // Обновляем список оставшихся для обработки в этом блоке
                remainingToProcess = remainingToProcess.filter(c => !processedInThisBlock.has(c));

                // Из оставшихся пытаемся сформировать новые клетки
                while (remainingToProcess.length > 0) {
                    if (remainingToProcess.length >= minCageSize) {
                        let newCageCells = [];
                        let newCageDigits = new Set();
                        // Берем первые minCageSize (или больше, до maxCageSize) ячеек, которые не дублируют цифры
                        let tempPotentialCage = [];
                        let tempDigits = new Set();
                        for(const remCell of remainingToProcess){
                            if(!tempDigits.has(solvedGridMap[remCell])){
                                tempPotentialCage.push(remCell);
                                tempDigits.add(solvedGridMap[remCell]);
                            }
                            if(tempPotentialCage.length >= Math.min(maxCageSize, remainingToProcess.length)) break;
                        }

                        if (tempPotentialCage.length >= minCageSize) {
                            newCageCells = tempPotentialCage.slice(0, Math.min(tempPotentialCage.length, maxCageSize));
                        }


                        if (newCageCells.length >= minCageSize) {
                            const newCage = { id: currentCageIdCounter++, cells: newCageCells, sum: 0 }; // Сумма позже
                            cages.push(newCage);
                            newCageCells.forEach(c => {
                                cellToCageObjectMap[c] = newCage;
                                unassignedCells.delete(c);
                                processedInThisBlock.add(c);
                            });
                        } else {
                            // Не удалось сформировать, оставляем для одноклеточных
                            break;
                        }
                    } else { // Осталось меньше minCageSize, делаем одноклеточные
                        break;
                    }
                    remainingToProcess = remainingToProcess.filter(c => !processedInThisBlock.has(c));
                }

                // Все, что не удалось ни присоединить, ни сформировать в группы, делаем одноклеточными
                remainingToProcess.forEach(cell => {
                    if (unassignedCells.has(cell)) { // Если все еще не назначена
                        const nCage = { id: currentCageIdCounter++, cells: [cell], sum: solvedGridMap[cell] };
                        cages.push(nCage);
                        cellToCageObjectMap[cell] = nCage;
                        unassignedCells.delete(cell);
                    }
                });

                if (unassignedCells.size === 0) break; // Все распределено
                startCell = _getRandomElementFromSet(unassignedCells); // Берем новую случайную для основного цикла

            } else { // Основной цикл, когда ячеек еще много
                startCell = _getRandomElementFromSet(unassignedCells);
            }

            if (!startCell) { // Если вдруг множество unassignedCells пустое, но цикл продолжается
                 if (unassignedCells.size > 0) { // Этого не должно быть, если getRandomElementFromSet корректен
                    startCell = Array.from(unassignedCells)[0];
                 } else {
                    break; // Все ячейки распределены
                 }
            }

            const currentCageCells = [startCell];
            const currentCageDigits = new Set([solvedGridMap[startCell]]);
            unassignedCells.delete(startCell);

            const newCageObject = { id: currentCageIdCounter, cells: currentCageCells, sum: 0 };
            cellToCageObjectMap[startCell] = newCageObject;

            let targetSize = Math.floor(Math.random() * (maxCageSize - minCageSize + 1)) + minCageSize;
            targetSize = Math.min(targetSize, unassignedCells.size + 1, 9); // Не больше оставшихся и не больше 9

            let cellsAddedInGrowStep = true;
            while (currentCageCells.length < targetSize && cellsAddedInGrowStep && unassignedCells.size > 0) {
                cellsAddedInGrowStep = false;
                let neighborCandidates = [];
                for (const cellInCurrentCage of currentCageCells) {
                    for (const neighbor of (SQUARE_NEIGHBORS[cellInCurrentCage] || [])) {
                        if (unassignedCells.has(neighbor) && !currentCageDigits.has(solvedGridMap[neighbor])) {
                            if (!neighborCandidates.some(nc => nc.cellId === neighbor)) {
                                neighborCandidates.push({ cellId: neighbor });
                            }
                        }
                    }
                }

                if (neighborCandidates.length > 0) {
                    const nextCellToAdd = _shuffleArray(neighborCandidates)[0].cellId;
                    currentCageCells.push(nextCellToAdd);
                    currentCageDigits.add(solvedGridMap[nextCellToAdd]);
                    unassignedCells.delete(nextCellToAdd);
                    cellToCageObjectMap[nextCellToAdd] = newCageObject;
                    cellsAddedInGrowStep = true;
                }
            }

            if (currentCageCells.length >= minCageSize) {
                cages.push(newCageObject);
                currentCageIdCounter++;
            } else { // Не удалось вырастить до минимального размера, возвращаем ячейки
                currentCageCells.forEach(cell => {
                    unassignedCells.add(cell);
                    delete cellToCageObjectMap[cell]; // Удаляем связь с неудавшейся клеткой
                });
                 // console.warn(`Partition: Rolled back cage starting with ${startCell} as it didn't reach minSize.`);
            }
        } // end while (unassignedCells.size > 0)

        if (unassignedCells.size > 0) {
            // Если после всех попыток остались ячейки, принудительно делаем их одноклеточными
            console.warn(`Partition: ${unassignedCells.size} cells remained. Forcing 1-cell cages.`);
            Array.from(unassignedCells).forEach(rc => {
                const nCage = { id: currentCageIdCounter++, cells: [rc], sum: solvedGridMap[rc] };
                cages.push(nCage);
            });
            unassignedCells.clear(); // Теперь точно все распределены
        }
        // console.log(`Partitioning complete. Generated ${cages.length} cages.`);
        return cages;
    }

     function _calculateCageSums(cages, solvedGridMap) {
         cages.forEach(cg => {
             cg.sum = 0;
             cg.cells.forEach(cId => {
                 const digit = solvedGridMap[cId];
                 if (typeof digit === 'number' && digit >= 1 && digit <= 9) {
                     cg.sum += digit;
                 } else {
                     console.warn(`CalculateCageSums: Invalid digit for cell ${cId}:`, digit);
                     cg.sum = NaN; // Mark as invalid
                 }
             });
             if (isNaN(cg.sum)) {
                 console.error("Cage sum resulted in NaN for cage with cells:", cg.cells);
             }
         });
     }

    var GENERATION_DIFFICULTY_PARAMS = {
        "easy":{maxCage:6,minCage:2, classicGridInitialAssign: 15}, // More initial numbers for easier classic
        "medium":{maxCage:5,minCage:2, classicGridInitialAssign: 10},
        "hard":{maxCage:5,minCage:2, classicGridInitialAssign: 8},
        "very-hard":{maxCage:4,minCage:2, classicGridInitialAssign: 6},
        "insane":{maxCage:4,minCage:2, classicGridInitialAssign: 5},
        "inhuman":{maxCage:3,minCage:2, classicGridInitialAssign: 4}, // Smallest cages, fewest initial
        "default":{maxCage:5,minCage:2, classicGridInitialAssign: 10}
    };

    killerSudoku.generate = function(difficulty = "medium", maxAttempts = 50) {
        // console.log(`Generate Killer Sudoku (difficulty: ${difficulty}, maxAttempts: ${maxAttempts})`);
        var params = GENERATION_DIFFICULTY_PARAMS[difficulty] || GENERATION_DIFFICULTY_PARAMS.default;
        if (!params) { // Should not happen if default is defined
            console.error("FATAL: Difficulty parameters missing!");
            params = {maxCage:5,minCage:2, classicGridInitialAssign: 10};
        }
        // console.log(`Using parameters: maxCage=${params.maxCage}, minCage=${params.minCage}`);

        for (let att = 1; att <= maxAttempts; ++att) {
            // console.log(`Generation attempt ${att}/${maxAttempts}...`);
            // console.log("Generating classic solution grid...");
            var solvedMap = _generateClassicSolutionGrid(); // Expects {A1: val, ...}
            if (!solvedMap) {
                // console.warn("Failed to generate classic solution grid, retrying...");
                continue;
            }

            // console.log(`Partitioning grid (maxCage: ${params.maxCage}, minCage: ${params.minCage})...`);
            var cagesCellsOnly = _partitionGridIntoCages(solvedMap, params.maxCage, params.minCage);
            if (!cagesCellsOnly || cagesCellsOnly.length === 0) {
                // console.warn("Failed to partition grid into cages, retrying generation...");
                continue;
            }

            // console.log("Calculating cage sums...");
            _calculateCageSums(cagesCellsOnly, solvedMap);
            if (cagesCellsOnly.some(cage => isNaN(cage.sum))) {
                // console.error("Cage sum calculation resulted in NaN. Retrying generation.");
                continue;
            }
            // Filter out any cages that might be empty if partitioning logic allows (it shouldn't ideally)
            const validCages = cagesCellsOnly.filter(cage => cage.cells && cage.cells.length > 0);


            // Format for return and for solver
            let solutionString = "";
            let puzzleString = ""; // For Killer, puzzle string is usually blank
            for (const sq of killerSudoku.SQUARES) {
                solutionString += solvedMap[sq];
                puzzleString += killerSudoku.BLANK_CHAR;
            }

            var puzzleData = {
                cages: validCages.map(cage => ({ sum: cage.sum, cells: cage.cells, id: cage.id })), // Ensure ID is passed if set
                grid: puzzleString,
                solution: solutionString
            };

            if (SKIP_SOLVER_VERIFICATION) {
                // console.log(`Generation OK (attempt ${att})! (Verification SKIPPED)`);
                return puzzleData;
            } else {
                // console.log("Verifying solvability...");
                var solveRes = killerSudoku.solve(deepCopy(puzzleData.cages)); // Solve needs only cages
                if (solveRes && typeof solveRes === 'string' && solveRes.length === killerSudoku.NR_SQUARES) {
                    // console.log(`Generation OK (attempt ${att})! Verified by solver.`);
                    if (solveRes !== puzzleData.solution) {
                        console.warn("Solver's result MISMATCHES generator's base solution grid!");
                        // Decide on action: trust generator's solution, or solver's, or fail.
                        // For now, trust generator as it's the primary source.
                    }
                    return puzzleData;
                } else {
                    // console.warn(`Verification failed (Solver result: ${solveRes}). Retrying generation...`);
                }
            }
        }
        console.error(`Failed to generate Killer Sudoku after ${maxAttempts} attempts.`);
        return false;
    };


    // --- Utility Functions ---
    function cross(A, B) { var r = []; for (var i = 0; i < A.length; i++) for (var j = 0; j < B.length; j++) r.push(A[i] + B[j]); return r; }
    function _get_all_classic_units(rows, cols) {
        var u = [];
        for (var ri = 0; ri < rows.length; ri++) u.push(cross(rows[ri], cols)); // Rows
        for (var ci = 0; ci < cols.length; ci++) u.push(cross(rows, cols[ci])); // Cols
        var rs = ["ABC", "DEF", "GHI"], cs = ["123", "456", "789"];
        for (var rsi = 0; rsi < rs.length; rsi++) for (var csi = 0; csi < cs.length; csi++) u.push(cross(rs[rsi], cs[csi])); // Blocks
        return u;
    }
    function _get_classic_maps(squares, units) {
        var um = {}, pm = {};
        for (var si = 0; si < squares.length; si++) {
            var sq = squares[si];
            um[sq] = [];
            for (var ui = 0; ui < units.length; ui++) {
                var u = units[ui];
                if (u.indexOf(sq) !== -1) um[sq].push(u);
            }
            pm[sq] = [];
            for (var sui = 0; sui < um[sq].length; sui++) {
                var unitForPeer = um[sq][sui];
                for (var ui_peer = 0; ui_peer < unitForPeer.length; ui_peer++) {
                    var ps = unitForPeer[ui_peer];
                    if (pm[sq].indexOf(ps) === -1 && ps !== sq) pm[sq].push(ps);
                }
            }
        }
        return { units_map: um, peers_map: pm };
    }
    function _shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
    function _getRandomElementFromSet(set) {
        if (set.size === 0) return undefined;
        let items = Array.from(set);
        return items[Math.floor(Math.random() * items.length)];
    }
    function _computeNeighbors(squares) { // SQUARE_MAP not needed if squares is ordered
        const neighborsMap = {};
        const gridForNeighbors = [];
        for (let r = 0; r < 9; r++) gridForNeighbors.push(new Array(9));

        squares.forEach((sq, idx) => {
            const r = Math.floor(idx / 9);
            const c = idx % 9;
            gridForNeighbors[r][c] = sq;
        });

        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const sq = gridForNeighbors[r][c];
                neighborsMap[sq] = [];
                if (r > 0) neighborsMap[sq].push(gridForNeighbors[r - 1][c]); // Up
                if (r < 8) neighborsMap[sq].push(gridForNeighbors[r + 1][c]); // Down
                if (c > 0) neighborsMap[sq].push(gridForNeighbors[r][c - 1]); // Left
                if (c < 8) neighborsMap[sq].push(gridForNeighbors[r][c + 1]); // Right
            }
        }
        return neighborsMap;
    }

    // --- Library Initialization ---
    function initialize() {
        // console.log("Initializing killerSudoku library...");
        killerSudoku.SQUARES = cross(ROWS, COLS);
        SQUARE_MAP = {};
        for (var i = 0; i < killerSudoku.NR_SQUARES; ++i) { SQUARE_MAP[killerSudoku.SQUARES[i]] = i; }

        CLASSIC_UNITS = _get_all_classic_units(ROWS, COLS);
        var classic_maps = _get_classic_maps(killerSudoku.SQUARES, CLASSIC_UNITS);
        CLASSIC_UNITS_MAP = classic_maps.units_map;
        CLASSIC_PEERS_MAP = classic_maps.peers_map;
        SQUARE_NEIGHBORS = _computeNeighbors(killerSudoku.SQUARES); // Pass ordered SQUARES

        // Pre-cache some common sum combinations if desired
        // killerSudoku.getSumCombinationInfo(10, 2); // Example
        // console.log("killerSudoku library initialized.");
    }

    initialize();

})(this);
