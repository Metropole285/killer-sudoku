/*
    killerSudoku.js
    ---------------
    JavaScript library for Killer Sudoku puzzle generation and solving.
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
    var SKIP_SOLVER_VERIFICATION = true;
    var DEBUG_PARTITION = true; // УСТАНОВЛЕН ДЛЯ ОТЛАДКИ

    // --- Bitset Constants and Helpers ---
    var ALL_CANDIDATES = 511; killerSudoku.ALL_CANDIDATES_MASK = ALL_CANDIDATES;
    var DIGIT_MASKS = [0, 1, 2, 4, 8, 16, 32, 64, 128, 256]; killerSudoku.DIGIT_MASKS = DIGIT_MASKS;
    // function getDigitMask(d){return DIGIT_MASKS[d]||0;} // Не используется напрямую в этом файле в текущей версии
    function hasCandidate(b,d){return(b&DIGIT_MASKS[d])!==0;}
    function countCandidates(b){var c=0;while(b>0){b&=b-1;c++;}return c;}
    function getCandidatesArray(b){var a=[];for(let d=1;d<=9;++d)if(hasCandidate(b,d))a.push(d);return a;}
    function getSingleCandidateDigit(b){if(b>0&&(b&(b-1))===0){for(let d=1;d<=9;++d){if(b===DIGIT_MASKS[d])return d;}}return 0;}

    function deepCopy(a){if(a===null||typeof a!=="object")return a;if(a instanceof Date)return new Date(a.getTime());if(a instanceof Set)return new Set(Array.from(a).map(item => deepCopy(item)));if(Array.isArray(a)){const b=[];for(let c=0;c<a.length;c++)b[c]=deepCopy(a[c]);return b;}const b={};for(const c in a)if(Object.prototype.hasOwnProperty.call(a, c))b[c]=deepCopy(a[c]);return b;}

     /** @typedef {object} CageInput @property {number} sum @property {string[]} cells */
     /** @typedef {object} CageDataInternal @property {number} id @property {number} sum @property {string[]} cells @property {number} initialDigitMask @property {number} remainingSum @property {number} remainingCellsCount @property {number} currentValueMask */
     /** @typedef {object} SolverData @property {object.<string, number>} cellToCageMap @property {CageDataInternal[]} cageDataArray */

    killerSudoku._initializeSolverData = function(cages) {
        if (!Array.isArray(cages)) { console.error("Invalid cages format: not an array."); return false; }
        var cellMap = {}, cageArr = [], assigned = {};
        for (var i = 0; i < cages.length; ++i) {
            var cg = cages[i];
            if (!cg || typeof cg.sum !== 'number' || !Array.isArray(cg.cells) || cg.cells.length === 0) { console.error(`Invalid cage format at index ${i}.`); return false; }
            if (cg.id === undefined) { console.warn(`Cage at index ${i} is missing an ID during _initializeSolverData. Assigning index ${i}.`); cg.id = i; }
            if (cg.sum <= 0 && cg.cells.length > 0) { console.error(`Invalid cage sum for multi-cell cage with ID ${cg.id}.`); return false; }
            if (cg.cells.length > 9) { console.error(`Invalid cage size (too large) for cage with ID ${cg.id}.`); return false; }
            var cells = [];
            for (var j = 0; j < cg.cells.length; ++j) {
                var cId = cg.cells[j];
                if (!SQUARE_MAP) { console.error("SQUARE_MAP is not initialized!"); return false; }
                if (typeof cId !== 'string' || SQUARE_MAP[cId] === undefined) { console.error(`Invalid cell ID "${cId}" in cage ID ${cg.id}.`); return false; }
                if (cellMap[cId] !== undefined && cellMap[cId] !== cg.id) {
                     console.error(`Cell ${cId} attempting to be added to cage ID ${cg.id}, but already belongs to cage ID ${cellMap[cId]}.`);
                     return false;
                }
                if (assigned[cId] && cellMap[cId] !== cg.id) {
                    console.error(`Cell ${cId} already assigned to a different cage ID logic path.`);
                    return false;
                }
                assigned[cId] = true; cellMap[cId] = cg.id; cells.push(cId);
            }
            if (cells.length > 0) {
                var minPossibleSum = (cells.length * (cells.length + 1)) / 2;
                var maxPossibleSum = (cells.length * (19 - cells.length)) / 2;
                if (cg.sum < minPossibleSum || cg.sum > maxPossibleSum) {
                    console.error(`Invalid sum ${cg.sum} for cage size ${cells.length} with ID ${cg.id}. Min: ${minPossibleSum}, Max: ${maxPossibleSum}.`);
                    return false;
                }
            }
            var cInfo = killerSudoku.getSumCombinationInfo(cg.sum, cells.length);
            if (cells.length > 0 && !cInfo) { console.error(`Impossible sum ${cg.sum} for ${cells.length} cells in cage ID ${cg.id}.`); return false; }
            cageArr.push({ id: cg.id, sum: cg.sum, cells: cells,
                initialDigitMask: cInfo ? cInfo.digitMask : (cells.length === 0 ? ALL_CANDIDATES : 0),
                remainingSum: cg.sum, remainingCellsCount: cells.length, currentValueMask: 0,
            });
        }
        const assignedCnt = Object.keys(assigned).length;
        if (killerSudoku.SQUARES && assignedCnt !== killerSudoku.NR_SQUARES) {
            console.error(`Invalid cage definition: ${assignedCnt} cells covered, expected ${killerSudoku.NR_SQUARES}.`);
            if (killerSudoku.SQUARES) { const missing = killerSudoku.SQUARES.filter(sq => assigned[sq] === undefined);
                if (missing.length > 0) console.error("Missing cells from cages:", missing); }
            return false;
        }
        return { cellToCageMap: cellMap, cageDataArray: cageArr };
    };

    var SUM_COMBINATION_CACHE = {};
    killerSudoku.getSumCombinationInfo = function(targetSum, numCells) {
        if (numCells < 0 || numCells > 9 || targetSum < 0) return null;
        if (numCells === 0) return targetSum === 0 ? { combinations: [[]], digitMask: 0 } : null;
        var minSum = (numCells * (numCells + 1)) / 2; var maxSum = (numCells * (19 - numCells)) / 2;
        if (targetSum < minSum || targetSum > maxSum) return null;
        if (SUM_COMBINATION_CACHE[targetSum]?.[numCells] !== undefined) return SUM_COMBINATION_CACHE[targetSum][numCells];
        var combos = [];
        function findRec(currSum,k,startD,currCombo){
            if(currSum===0&&k===0){combos.push([...currCombo]);return;}
            if(currSum<0||k===0||startD>9)return;
            for(let d=startD;d<=9;++d){ let remK=k-1;
                let minRemSum=0; if(remK>0){minRemSum=(remK*((d+1)+(d+remK)))/2;} if(currSum-d<minRemSum)break;
                let maxRemSum=0; for(let r_idx=0;r_idx<remK;++r_idx)maxRemSum+=(9-r_idx); if(currSum-d>maxRemSum&&remK>0)continue;
                currCombo.push(d); findRec(currSum-d,remK,d+1,currCombo); currCombo.pop(); }}
        findRec(targetSum,numCells,1,[]); var result=null;
        if(combos.length>0){var mask=0;combos.forEach(c=>{c.forEach(d=>{mask|=DIGIT_MASKS[d];});});result={combinations:combos,digitMask:mask};}
        if(!SUM_COMBINATION_CACHE[targetSum])SUM_COMBINATION_CACHE[targetSum]={}; SUM_COMBINATION_CACHE[targetSum][numCells]=result; return result;
    };

    function assignValue(candidatesMap, solverData, cellId, digitToAssign, indent = "") {
        var otherDigitsMask = candidatesMap[cellId] & ~DIGIT_MASKS[digitToAssign];
        for (let d = 1; d <= 9; ++d) {
            if ((otherDigitsMask & DIGIT_MASKS[d]) !== 0) {
                if (!eliminateCandidate(candidatesMap, solverData, cellId, d, indent + "  ")) return false;
            }
        }
        if (!updateCageStateOnAssign(candidatesMap, solverData, cellId, digitToAssign, indent + "  ")) return false;
        return true;
    }

    function eliminateCandidate(candidatesMap, solverData, cellId, digitToEliminate, indent = "") {
        var digitMask = DIGIT_MASKS[digitToEliminate];
        var initialCellCandidates = candidatesMap[cellId];
        if ((initialCellCandidates & digitMask) === 0) return true;
        if (!CLASSIC_PEERS_MAP || !CLASSIC_UNITS_MAP || !solverData?.cellToCageMap || !solverData?.cageDataArray) {
            console.error("Solver internal maps not ready for eliminateCandidate."); return false; }
        candidatesMap[cellId] &= ~digitMask;
        var remainingCandidates = candidatesMap[cellId]; var numRemaining = countCandidates(remainingCandidates);
        if (numRemaining === 0) return false;
        if (numRemaining === 1) {
            var finalDigit = getSingleCandidateDigit(remainingCandidates);
            for (const peer of CLASSIC_PEERS_MAP[cellId]) {
                if (!eliminateCandidate(candidatesMap, solverData, peer, finalDigit, indent + "  ")) return false; }
            if (!updateCageStateOnAssign(candidatesMap, solverData, cellId, finalDigit, indent + "  ")) return false;
        }
        for (const unit of CLASSIC_UNITS_MAP[cellId]) {
            var placesForDigitInUnit = [];
            for (const cellInUnit of unit) { if ((candidatesMap[cellInUnit] & digitMask) !== 0) placesForDigitInUnit.push(cellInUnit); }
            if (placesForDigitInUnit.length === 0) return false;
            if (placesForDigitInUnit.length === 1) { const targetCell = placesForDigitInUnit[0];
                if (candidatesMap[targetCell] !== digitMask) { if (!assignValue(candidatesMap, solverData, targetCell, digitToEliminate, indent + "  ")) return false; } }
        }
        const cageIdFromMap = solverData.cellToCageMap[cellId];
        if (cageIdFromMap !== undefined) {
            const cage = solverData.cageDataArray.find(c => c.id === cageIdFromMap);
            if (cage) { let placesForDigitInCage = [];
                for (const cellInCage of cage.cells) { if (countCandidates(candidatesMap[cellInCage]) > 1 && (candidatesMap[cellInCage] & digitMask) !== 0) placesForDigitInCage.push(cellInCage); }
                if (placesForDigitInCage.length === 1) { const targetCellInCage = placesForDigitInCage[0];
                    if (candidatesMap[targetCellInCage] !== digitMask) { if (!assignValue(candidatesMap, solverData, targetCellInCage, digitToEliminate, indent + "  ")) return false; } } }
        }
        for (const unit of CLASSIC_UNITS_MAP[cellId]) { if (!checkInnies(candidatesMap, solverData, unit, indent + "  ")) return false; }
        if (cageIdFromMap !== undefined) { const cage = solverData.cageDataArray.find(c => c.id === cageIdFromMap); if(cage){ for (let d_outie = 1; d_outie <= 9; d_outie++) { if (!checkOuties(candidatesMap, solverData, cage, d_outie, indent + "  ")) return false; } } }
        return true;
    }

    function updateCageStateOnAssign(candidatesMap, solverData, assignedCellId, assignedDigit, indent = "") {
        const cageId = solverData.cellToCageMap[assignedCellId];
        if (cageId === undefined) return true;
        const cage = solverData.cageDataArray.find(c => c.id === cageId);
        if (!cage) { console.error("Cage not found in updateCageStateOnAssign for ID:", cageId); return false;}
        const digitMask = DIGIT_MASKS[assignedDigit];
        if ((cage.currentValueMask & digitMask) === 0) {
            cage.remainingSum -= assignedDigit;
            cage.remainingCellsCount -= 1;
            cage.currentValueMask |= digitMask;
        }
        if (cage.remainingCellsCount < 0 || cage.remainingSum < 0) return false;
        if (cage.remainingCellsCount === 0) { if (cage.remainingSum !== 0) return false;
        } else { const combinationInfo = killerSudoku.getSumCombinationInfo(cage.remainingSum, cage.remainingCellsCount);
            if (!combinationInfo) return false;
            let allowedDigitsForRemainingCells = combinationInfo.digitMask;
            let requiredDigitsForRemaining = allowedDigitsForRemainingCells & ~cage.currentValueMask;
            if (requiredDigitsForRemaining === 0 && cage.remainingSum > 0) return false;
            for (const cellIdInCage of cage.cells) {
                if (cellIdInCage !== assignedCellId && countCandidates(candidatesMap[cellIdInCage]) > 1) {
                    const originalCellCands = candidatesMap[cellIdInCage];
                    const newCellCands = originalCellCands & requiredDigitsForRemaining;
                    if (newCellCands === 0 && originalCellCands !== 0) return false;
                    if (newCellCands !== originalCellCands) {
                        const eliminatedInThisCellMask = originalCellCands & ~newCellCands;
                        for (let d = 1; d <= 9; d++) { if ((eliminatedInThisCellMask & DIGIT_MASKS[d]) !== 0) {
                            if (!eliminateCandidate(candidatesMap, solverData, cellIdInCage, d, indent + "    ")) return false; } } }
                     if (candidatesMap[cellIdInCage] === 0 && originalCellCands !== 0) return false;
                } } }
        return true;
    }

    function checkInnies(candidatesMap, solverData, unit, indent="") {
        for (let d = 1; d <= 9; d++) { const digitMask = DIGIT_MASKS[d]; let placesInUnitForDigit = [];
            let uniqueCageId = undefined; let multipleCages = false;
            for (const cellId of unit) { if (hasCandidate(candidatesMap[cellId], d)) {
                placesInUnitForDigit.push(cellId); const currentCellCageId = solverData.cellToCageMap[cellId];
                if (currentCellCageId === undefined) { multipleCages = true; break; }
                if (uniqueCageId === undefined) uniqueCageId = currentCellCageId;
                else if (uniqueCageId !== currentCellCageId) { multipleCages = true; break; } } }
            if (!multipleCages && uniqueCageId !== undefined && placesInUnitForDigit.length > 0) {
                const targetCage = solverData.cageDataArray.find(c => c.id === uniqueCageId); if (!targetCage) continue;
                const unitCellsSet = new Set(unit);
                for (const cageCellId of targetCage.cells) {
                    if (!unitCellsSet.has(cageCellId) && hasCandidate(candidatesMap[cageCellId], d)) {
                        if (!eliminateCandidate(candidatesMap, solverData, cageCellId, d, indent + "  ")) return false; } } } }
        return true;
    }

    function checkOuties(candidatesMap, solverData, cage, digit, indent="") {
        const digitMask = DIGIT_MASKS[digit]; let placesInCageForDigit = [];
        for (const cellId of cage.cells) { if (hasCandidate(candidatesMap[cellId], digit)) placesInCageForDigit.push(cellId); }
        if (placesInCageForDigit.length === 0) return true;
        for (let unitType = 0; unitType < 3; unitType++) { let uniqueUnitIndex = -1; let multipleUnits = false; let unitCellsForOutie = null;
            for (const cellId of placesInCageForDigit) {
                const r_coord = "ABCDEFGHI".indexOf(cellId[0]);
                const c_coord = "123456789".indexOf(cellId[1]);
                if (r_coord === -1 || c_coord === -1) { multipleUnits = true; break;}

                let currentUnitIndex; let tempUnitCells;
                if (unitType === 0) { currentUnitIndex = r_coord; tempUnitCells = CLASSIC_UNITS_MAP[cellId].find(u => u.every(sq => "ABCDEFGHI".indexOf(sq[0]) === currentUnitIndex));
                } else if (unitType === 1) { currentUnitIndex = c_coord; tempUnitCells = CLASSIC_UNITS_MAP[cellId].find(u => u.every(sq => "123456789".indexOf(sq[1]) === currentUnitIndex));
                } else { currentUnitIndex = Math.floor(r_coord / 3) * 3 + Math.floor(c_coord / 3);
                    tempUnitCells = CLASSIC_UNITS_MAP[cellId].find(u => u.every(sq => { const r0 = "ABCDEFGHI".indexOf(sq[0]), c0 = "123456789".indexOf(sq[1]); return Math.floor(r0 / 3) * 3 + Math.floor(c0 / 3) === currentUnitIndex; })); }
                if (!tempUnitCells) { multipleUnits = true; break;}
                if (uniqueUnitIndex === -1) { uniqueUnitIndex = currentUnitIndex; unitCellsForOutie = tempUnitCells;
                } else if (uniqueUnitIndex !== currentUnitIndex) { multipleUnits = true; break; } }
            if (!multipleUnits && uniqueUnitIndex !== -1 && unitCellsForOutie) {
                const cageCellsSet = new Set(cage.cells);
                for (const unitCellId of unitCellsForOutie) {
                    if (!cageCellsSet.has(unitCellId) && hasCandidate(candidatesMap[unitCellId], digit)) {
                        if (!eliminateCandidate(candidatesMap, solverData, unitCellId, digit, indent + "  ")) return false; } } } }
        return true;
    }

    function _search(candidatesMap, solverData, indent="") {
        var isSolved = true; for (const sq of killerSudoku.SQUARES) { if (countCandidates(candidatesMap[sq]) !== 1) { isSolved = false; break; } }
        if (isSolved) return candidatesMap;
        var minCandidates = 10, mostConstrainedSquare = null;
        for (const sq of killerSudoku.SQUARES) { var numCands = countCandidates(candidatesMap[sq]);
            if (numCands > 1 && numCands < minCandidates) { minCandidates = numCands; mostConstrainedSquare = sq; if (minCandidates === 2) break; } }
        if (!mostConstrainedSquare) return false;
        var tryDigits = getCandidatesArray(candidatesMap[mostConstrainedSquare]);
        for (const digit of tryDigits) { var mapCopy = deepCopy(candidatesMap); var solverDataCopy = deepCopy(solverData);
            if (assignValue(mapCopy, solverDataCopy, mostConstrainedSquare, digit, indent + "    ")) {
                var result = _search(mapCopy, solverDataCopy, indent + "  "); if (result) return result; } }
        return false;
    }

    killerSudoku.solve = function(cagesInput) {
        const solverData = killerSudoku._initializeSolverData(deepCopy(cagesInput));
        if (!solverData) { console.error("Failed to initialize solver data for solving."); return false; }
        var initialCandidatesMap = {}; for (const sq of killerSudoku.SQUARES) initialCandidatesMap[sq] = ALL_CANDIDATES;
        var propagationOK = true;
        for (let i = 0; i < solverData.cageDataArray.length; ++i) { const cage = solverData.cageDataArray[i];
            if (cage.initialDigitMask === 0 && cage.sum > 0 && cage.cells.length > 0) { propagationOK = false; break; }
            for (const cellId of cage.cells) { initialCandidatesMap[cellId] &= cage.initialDigitMask;
                if (initialCandidatesMap[cellId] === 0) { propagationOK = false; break; } } if (!propagationOK) break; }
        if (!propagationOK) return false;
        for (const sq of killerSudoku.SQUARES) { if (countCandidates(initialCandidatesMap[sq]) === 1) {
            if (!assignValue(initialCandidatesMap, solverData, sq, getSingleCandidateDigit(initialCandidatesMap[sq]))) return false; } }
        var solutionMap = _search(initialCandidatesMap, solverData);
        if (solutionMap) { let solutionString = "";
            for (const sq of killerSudoku.SQUARES) { let digit = getSingleCandidateDigit(solutionMap[sq]); solutionString += (digit > 0 ? digit : killerSudoku.BLANK_CHAR); }
            if (solutionString.length !== killerSudoku.NR_SQUARES || solutionString.includes(killerSudoku.BLANK_CHAR)) {
                console.error("Solver returned incomplete or invalid map:", solutionMap); return false; }
            return solutionString;
        } else return false;
    };

    function _generateClassicSolutionGrid() {
        var candidates = {}; for (const sq of killerSudoku.SQUARES) { if (typeof ALL_CANDIDATES === 'undefined') { console.error("ALL_CANDIDATES undefined!"); return false; } candidates[sq] = ALL_CANDIDATES; }
        
        function searchClassic(cands) {
            var isSolved = true;
            for (const sq of killerSudoku.SQUARES) { if (countCandidates(cands[sq]) !== 1) { isSolved = false; break; } }
            if (isSolved) return cands;
            var minCand = 10, minSq = null;
            var shuffledSquares = _shuffleArray([...killerSudoku.SQUARES]);
            for (const sq of shuffledSquares) { var numC = countCandidates(cands[sq]); if (numC > 1 && numC < minCand) { minCand = numC; minSq = sq; if (minCand === 2) break; } }
            if (!minSq) return false;
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
            if ((cands[sq] & mask) === 0) return true;
            cands[sq] &= ~mask;
            var remaining = cands[sq];
            var count = countCandidates(remaining);
            if (count === 0) return false;
            if (count === 1) {
                var singleDigit = getSingleCandidateDigit(remaining);
                for (const peer of CLASSIC_PEERS_MAP[sq]) {
                    if (!_eliminateClassic(cands, peer, singleDigit)) return false;
                }
            }
            for (const unit of CLASSIC_UNITS_MAP[sq]) {
                var places = [];
                for (const unitSq of unit) { if ((cands[unitSq] & mask) !== 0) places.push(unitSq); }
                if (places.length === 0) return false;
                if (places.length === 1) { if (!_assignClassic(cands, places[0], digit)) return false; }
            }
            return true;
        }

        var initialSquaresToAssign = _shuffleArray([...killerSudoku.SQUARES]); let initialAssignmentSuccess = true;
        for (let i = 0; i < Math.min(10, killerSudoku.NR_SQUARES); i++) { let sqToAssign = initialSquaresToAssign[i];
            let possibleDigits = getCandidatesArray(candidates[sqToAssign]);
            if (possibleDigits.length > 0) { let digitToAssign = possibleDigits[Math.floor(Math.random() * possibleDigits.length)];
                if (!_assignClassic(candidates, sqToAssign, digitToAssign)) {
                    for (const sq_reset of killerSudoku.SQUARES) { candidates[sq_reset] = ALL_CANDIDATES; }
                    initialAssignmentSuccess = false; break; } } }
        if (!initialAssignmentSuccess) return _generateClassicSolutionGrid();
        var solMapBitset = searchClassic(candidates); if (!solMapBitset) return false;
        var resultMap = {}; for (const sq of killerSudoku.SQUARES) { resultMap[sq] = getSingleCandidateDigit(solMapBitset[sq]);
            if (resultMap[sq] === 0) { console.error("Classic grid generation incomplete!"); return false; } }
        return resultMap;
    }

    function _partitionGridIntoCages(solvedGridMap, maxCageSize = 5, minCageSize = 2) {
        var cages = [];
        var unassignedCells = new Set(killerSudoku.SQUARES);
        var currentCageIdCounter = 0;
        var maxTotalAttempts = killerSudoku.NR_SQUARES * 30;
        var totalAttempts = 0;

        if (DEBUG_PARTITION) console.log(`Starting partition. Min: ${minCageSize}, Max: ${maxCageSize}. Unassigned: ${unassignedCells.size}`);

        while (unassignedCells.size > 0 && totalAttempts < maxTotalAttempts) {
            totalAttempts++;
            var startCell;

            if (unassignedCells.size <= maxCageSize * 2 && unassignedCells.size > 0 && unassignedCells.size < killerSudoku.NR_SQUARES / 2) {
                if (DEBUG_PARTITION) console.log(`Handling ${unassignedCells.size} remaining cells (aggressive remainder processing).`);
                let remainingToProcessAggressive = Array.from(unassignedCells);
                
                while (remainingToProcessAggressive.length > 0) {
                    let cellsForThisNewCage = [];
                    let digitsInThisNewCage = new Set();
                    
                    let initialCellForNewAggressiveCage = remainingToProcessAggressive.shift();
                    if (!unassignedCells.has(initialCellForNewAggressiveCage)) continue;

                    cellsForThisNewCage.push(initialCellForNewAggressiveCage);
                    digitsInThisNewCage.add(solvedGridMap[initialCellForNewAggressiveCage]);

                    let tempRemaining = [...remainingToProcessAggressive];
                    for (const potentialCell of tempRemaining) {
                        if (cellsForThisNewCage.length >= maxCageSize) break;
                        if (unassignedCells.has(potentialCell) && !digitsInThisNewCage.has(solvedGridMap[potentialCell])) {
                            let isNeighborToCurrentCage = false;
                            for (const cellInCurrentAggressiveCage of cellsForThisNewCage) {
                                if (SQUARE_NEIGHBORS[cellInCurrentAggressiveCage]?.includes(potentialCell)) {
                                    isNeighborToCurrentCage = true;
                                    break;
                                }
                            }
                            if (isNeighborToCurrentCage) {
                                cellsForThisNewCage.push(potentialCell);
                                digitsInThisNewCage.add(solvedGridMap[potentialCell]);
                                remainingToProcessAggressive = remainingToProcessAggressive.filter(c => c !== potentialCell);
                            }
                        }
                    }
                    
                    if (cellsForThisNewCage.length >= minCageSize) {
                        const newCage = { id: currentCageIdCounter++, cells: cellsForThisNewCage, sum: 0 };
                        cages.push(newCage);
                        if (DEBUG_PARTITION) console.log(`[AGGR] Formed new cage ${newCage.id} from remainder: ${newCage.cells.join(',')}`);
                        cellsForThisNewCage.forEach(c => unassignedCells.delete(c));
                    } else {
                        if (DEBUG_PARTITION) console.log(`[AGGR] Could not form valid cage from: ${cellsForThisNewCage.join(',')}. These cells will be re-processed or become 1-cell cages.`);
                         break; 
                    }
                    remainingToProcessAggressive = Array.from(unassignedCells);
                }
                 if (unassignedCells.size === 0) break;
                 startCell = _getRandomElementFromSet(unassignedCells);
            } else {
                startCell = _getRandomElementFromSet(unassignedCells);
            }

            if (!startCell) {
                 if (unassignedCells.size > 0) startCell = Array.from(unassignedCells)[0];
                 else break;
            }

            const currentCageCells = [startCell];
            const currentCageDigits = new Set([solvedGridMap[startCell]]);
            unassignedCells.delete(startCell);

            let targetSize = Math.floor(Math.random() * (maxCageSize - minCageSize + 1)) + minCageSize;
            targetSize = Math.min(targetSize, unassignedCells.size + 1, 9);

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
                    cellsAddedInGrowStep = true;
                }
            }

            if (currentCageCells.length >= minCageSize) {
                const finalCage = {id: currentCageIdCounter++, cells: currentCageCells, sum: 0};
                cages.push(finalCage);
                if (DEBUG_PARTITION) console.log(`Formed main loop cage ${finalCage.id}: ${finalCage.cells.join(',')}`);
            } else {
                currentCageCells.forEach(cell => unassignedCells.add(cell));
                if (DEBUG_PARTITION) console.log(`Rolled back main loop cage started with ${startCell}, size ${currentCageCells.length}. Cells returned: ${currentCageCells.join(',')}`);
            }
        }

        if (unassignedCells.size > 0) {
            if (DEBUG_PARTITION) console.warn(`Partition FINAL: ${unassignedCells.size} cells remained. Forcing 1-cell cages.`);
            Array.from(unassignedCells).forEach(rc => {
                const nCage = { id: currentCageIdCounter++, cells: [rc], sum: solvedGridMap[rc] };
                cages.push(nCage);
                 if (DEBUG_PARTITION) console.log(`Formed final 1-cell cage ${nCage.id}: ${rc}`);
            });
            unassignedCells.clear();
        }
        if (DEBUG_PARTITION) console.log(`Partitioning complete. Generated ${cages.length} cages.`);
        
        const cageIds = new Set(); let duplicateIdFound = false; let missingIdFound = false;
        cages.forEach(c => {
            if(c.id === undefined) {console.error("CRITICAL: Cage created without ID!", c); missingIdFound = true;}
            if(!missingIdFound && cageIds.has(c.id)) { console.error("CRITICAL: Duplicate Cage ID found!", c.id, c); duplicateIdFound = true; }
            if(!missingIdFound) cageIds.add(c.id);
        });
        if(duplicateIdFound || missingIdFound) {
            console.error("Partition resulted in cages with duplicate or missing IDs. Failing.");
            return false;
        }

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
                     console.warn(`CalculateCageSums: Invalid digit for cell ${cId}:`, digit, "in cage ID:", cg.id);
                     cg.sum = NaN;
                 }
             });
             if (isNaN(cg.sum)) {
                 console.error("Cage sum resulted in NaN for cage with ID:", cg.id, "cells:", cg.cells);
             }
         });
     }

    var GENERATION_DIFFICULTY_PARAMS = {
        "easy":{maxCage:6,minCage:2, classicGridInitialAssign: 15},
        "medium":{maxCage:5,minCage:2, classicGridInitialAssign: 10},
        "hard":{maxCage:5,minCage:2, classicGridInitialAssign: 8},
        "very-hard":{maxCage:4,minCage:2, classicGridInitialAssign: 6},
        "insane":{maxCage:4,minCage:2, classicGridInitialAssign: 5},
        "inhuman":{maxCage:3,minCage:2, classicGridInitialAssign: 4},
        "default":{maxCage:5,minCage:2, classicGridInitialAssign: 10}
    };

    killerSudoku.generate = function(difficulty = "medium", maxAttempts = 50) {
        var params = GENERATION_DIFFICULTY_PARAMS[difficulty] || GENERATION_DIFFICULTY_PARAMS.default;
        if (!params) { params = {maxCage:5,minCage:2, classicGridInitialAssign: 10}; }

        for (let att = 1; att <= maxAttempts; ++att) {
            if (DEBUG_PARTITION) console.log(`\n--- GENERATION ATTEMPT ${att} ---`);
            var solvedMap = _generateClassicSolutionGrid();
            if (!solvedMap) { if (DEBUG_PARTITION) console.warn(`Attempt ${att}: Failed to generate classic solution grid.`); continue; }

            var cagesFromPartition = _partitionGridIntoCages(solvedMap, params.maxCage, params.minCage);
            if (!cagesFromPartition || cagesFromPartition.length === 0) { if (DEBUG_PARTITION) console.warn(`Attempt ${att}: Failed to partition grid.`); continue; }

            _calculateCageSums(cagesFromPartition, solvedMap);
            if (cagesFromPartition.some(cage => isNaN(cage.sum))) { if (DEBUG_PARTITION) console.warn(`Attempt ${att}: Cage sum calculation resulted in NaN.`); continue; }
            
            const validCages = cagesFromPartition.filter(cage => cage.cells && cage.cells.length > 0 && cage.id !== undefined);
            if(validCages.length !== cagesFromPartition.length){
                console.warn(`Attempt ${att}: Some cages were filtered out due to missing cells or ID after partition/sum calculation. Original: ${cagesFromPartition.length}, Valid: ${validCages.length}`);
            }
            if(validCages.length === 0) { if (DEBUG_PARTITION) console.warn(`Attempt ${att}: No valid cages remained after filtering.`); continue;}


            let solutionString = ""; let puzzleString = "";
            for (const sq of killerSudoku.SQUARES) { solutionString += solvedMap[sq]; puzzleString += killerSudoku.BLANK_CHAR; }

            var puzzleData = {
                cages: validCages.map(cage => ({ sum: cage.sum, cells: cage.cells, id: cage.id })),
                grid: puzzleString,
                solution: solutionString
            };

            const finalCageIds = new Set(); let hasDuplicateId = false;
            for(const cage of puzzleData.cages){
                if(cage.id === undefined) { console.error("CRITICAL ERROR: puzzleData cage missing ID!", cage); hasDuplicateId = true; break; }
                if(finalCageIds.has(cage.id)){ console.error("Duplicate cage ID found in final puzzleData!", cage.id, "Attempt:", att, cage); hasDuplicateId = true; break; }
                finalCageIds.add(cage.id);
            }
            if(hasDuplicateId) { console.warn(`Attempt ${att}: Retrying generation due to duplicate/missing cage ID issue in final data.`); continue; }


            if (SKIP_SOLVER_VERIFICATION) {
                if (DEBUG_PARTITION) console.log(`Attempt ${att}: Generation OK (Verification SKIPPED).`);
                return puzzleData;
            } else {
                var solveRes = killerSudoku.solve(deepCopy(puzzleData.cages));
                if (solveRes && typeof solveRes === 'string' && solveRes.length === killerSudoku.NR_SQUARES) {
                    if (solveRes !== puzzleData.solution) console.warn("Solver's result MISMATCHES generator's base solution grid!");
                    if (DEBUG_PARTITION) console.log(`Attempt ${att}: Generation OK (Verified by solver).`);
                    return puzzleData;
                } else { if (DEBUG_PARTITION) console.warn(`Attempt ${att}: Verification failed (Solver result: ${solveRes})`); }
            }
        }
        console.error(`Failed to generate Killer Sudoku after ${maxAttempts} attempts.`);
        return false;
    };

    function cross(A, B) { var r = []; for (var i = 0; i < A.length; i++) for (var j = 0; j < B.length; j++) r.push(A[i] + B[j]); return r; }
    function _get_all_classic_units(rows, cols) {
        var u = [];
        for (var ri = 0; ri < rows.length; ri++) u.push(cross(rows[ri], cols));
        for (var ci = 0; ci < cols.length; ci++) u.push(cross(rows, cols[ci]));
        var rs = ["ABC", "DEF", "GHI"], cs = ["123", "456", "789"];
        for (var rsi = 0; rsi < rs.length; rsi++) for (var csi = 0; csi < cs.length; csi++) u.push(cross(rs[rsi], cs[csi]));
        return u;
    }
    function _get_classic_maps(squares, units) {
        var um = {}, pm = {};
        for (var si = 0; si < squares.length; si++) {
            var sq = squares[si]; um[sq] = [];
            for (var ui = 0; ui < units.length; ui++) { var u = units[ui]; if (u.indexOf(sq) !== -1) um[sq].push(u); }
            pm[sq] = [];
            for (var sui = 0; sui < um[sq].length; sui++) { var unitForPeer = um[sq][sui];
                for (var ui_peer = 0; ui_peer < unitForPeer.length; ui_peer++) { var ps = unitForPeer[ui_peer];
                    if (pm[sq].indexOf(ps) === -1 && ps !== sq) pm[sq].push(ps); } } }
        return { units_map: um, peers_map: pm };
    }
    function _shuffleArray(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } return array; }
    function _getRandomElementFromSet(set) { if (set.size === 0) return undefined; let items = Array.from(set); return items[Math.floor(Math.random() * items.length)]; }
    function _computeNeighbors(squares) {
        const neighborsMap = {}; const gridForNeighbors = [];
        for (let r = 0; r < 9; r++) gridForNeighbors.push(new Array(9));
        squares.forEach((sq, idx) => { const r = Math.floor(idx / 9), c = idx % 9; gridForNeighbors[r][c] = sq; });
        for (let r = 0; r < 9; r++) { for (let c = 0; c < 9; c++) { const sq = gridForNeighbors[r][c]; neighborsMap[sq] = [];
            if (r > 0) neighborsMap[sq].push(gridForNeighbors[r - 1][c]); if (r < 8) neighborsMap[sq].push(gridForNeighbors[r + 1][c]);
            if (c > 0) neighborsMap[sq].push(gridForNeighbors[r][c - 1]); if (c < 8) neighborsMap[sq].push(gridForNeighbors[r][c + 1]); } }
        return neighborsMap;
    }

    function initialize() {
        killerSudoku.SQUARES = cross(ROWS, COLS); SQUARE_MAP = {};
        for (var i = 0; i < killerSudoku.NR_SQUARES; ++i) { SQUARE_MAP[killerSudoku.SQUARES[i]] = i; }
        CLASSIC_UNITS = _get_all_classic_units(ROWS, COLS);
        var classic_maps = _get_classic_maps(killerSudoku.SQUARES, CLASSIC_UNITS);
        CLASSIC_UNITS_MAP = classic_maps.units_map; CLASSIC_PEERS_MAP = classic_maps.peers_map;
        SQUARE_NEIGHBORS = _computeNeighbors(killerSudoku.SQUARES);
    }

    initialize();
})(this);
