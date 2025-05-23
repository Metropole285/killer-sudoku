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
    var SKIP_SOLVER_VERIFICATION = true; // Set to false to enable solver check

    // --- Bitset Constants and Helpers ---
    var ALL_CANDIDATES = 511; killerSudoku.ALL_CANDIDATES_MASK = ALL_CANDIDATES;
    var DIGIT_MASKS = [0, 1, 2, 4, 8, 16, 32, 64, 128, 256]; killerSudoku.DIGIT_MASKS = DIGIT_MASKS;
    function getDigitMask(d){return DIGIT_MASKS[d]||0} function hasCandidate(b,d){return(b&DIGIT_MASKS[d])!==0} function addCandidate(b,d){return b|DIGIT_MASKS[d]} function removeCandidate(b,d){return b&~DIGIT_MASKS[d]} function countCandidates(b){var c=0;while(b>0){b&=b-1;c++}return c} function getCandidatesArray(b){var a=[];for(let d=1;d<=9;++d)if(hasCandidate(b,d))a.push(d);return a} function intersectCandidates(b1,b2){return b1&b2} function getSingleCandidateDigit(b){if(b>0&&(b&(b-1))===0){for(let d=1;d<=9;++d){if(b===DIGIT_MASKS[d])return d}}return 0}
    function formatBitset(b) { return getCandidatesArray(b).join('') || '-'; }

    // --- Deep Copy Utility ---
    function deepCopy(a){if(a===null||typeof a!=="object")return a;if(a instanceof Date)return new Date(a.getTime());if(a instanceof Set)return new Set(a);if(Array.isArray(a)){const b=[];for(let c=0;c<a.length;c++)b[c]=deepCopy(a[c]);return b}const b={};for(const c in a)if(a.hasOwnProperty(c))b[c]=deepCopy(a[c]);return b}

    // --- Cage Representation and Initialization ---
     /** @typedef {object} CageInput @property {number} sum @property {string[]} cells */
     /** @typedef {object} CageDataInternal @property {number} id @property {number} sum @property {string[]} cells @property {number} initialDigitMask @property {number} remainingSum @property {number} remainingCellsCount @property {number} currentValueMask */
     /** @typedef {object} SolverData @property {object.<string, number>} cellToCageMap @property {CageDataInternal[]} cageDataArray */

    killerSudoku._initializeSolverData = function(cages) { if(!Array.isArray(cages)){console.error("Inv cages");return false;}var cellMap={},cageArr=[],assigned={};for(var i=0;i<cages.length;++i){var cg=cages[i];if(!cg||typeof cg.sum!=='number'||!Array.isArray(cg.cells)||cg.cells.length===0){console.error(`Inv cage fmt ${i}`);return false;}if(cg.sum<=0&&cg.cells.length>0){console.error(`Inv cage sum ${i}`);return false;}if(cg.cells.length>9){console.error(`Inv cage size ${i}`);return false;}var cells=[];for(var j=0;j<cg.cells.length;++j){var cId=cg.cells[j];if(!SQUARE_MAP){console.error("SQUARE_MAP null!");return false;}if(typeof cId!=='string'||SQUARE_MAP[cId]===undefined){console.error(`Inv cell ID ${cId} cage ${i}`);return false;}if(assigned[cId]!==undefined){console.error(`Cell ${cId} multi cages ${i},${assigned[cId]}`);return false;}assigned[cId]=i;cellMap[cId]=i;cells.push(cId);}if(cells.length>0){var minPossibleSum=(cells.length*(cells.length+1))/2;var maxPossibleSum=(cells.length*(19-cells.length))/2;if(cg.sum<minPossibleSum||cg.sum>maxPossibleSum){console.error(`Inv sum ${cg.sum} size ${cells.length} cage ${i}. Min:${minPossibleSum}, Max:${maxPossibleSum}`);return false;}}var cInfo=killerSudoku.getSumCombinationInfo(cg.sum,cells.length);if(cells.length>0&&!cInfo){console.error(`Impossible sum ${cg.sum} size ${cells.length} cage ${i}.`);return false;}cageArr.push({id:i,sum:cg.sum,cells:cells,initialDigitMask:cInfo?cInfo.digitMask:0,remainingSum:cg.sum,remainingCellsCount:cells.length,currentValueMask:0,});}const assignedCnt=Object.keys(assigned).length;if(assignedCnt!==killerSudoku.NR_SQUARES){console.error(`Inv cage def: covered ${assignedCnt}/${killerSudoku.NR_SQUARES}`);if(killerSudoku.SQUARES){const missing=killerSudoku.SQUARES.filter(sq=>assigned[sq]===undefined);if(missing.length>0)console.error("Missing:",missing);}return false;}/*console.log("Solver data init OK.");*/return{cellToCageMap:cellMap,cageDataArray:cageArr}; };

    // --- Sum Combination Cache and Calculation ---
    var SUM_COMBINATION_CACHE = {};
    killerSudoku.getSumCombinationInfo = function(targetSum, numCells) { if(numCells<=0||numCells>9||targetSum<=0)return null;var minSum=(numCells*(numCells+1))/2;var maxSum=(numCells*(19-numCells))/2;if(targetSum<minSum||targetSum>maxSum)return null;if(SUM_COMBINATION_CACHE[targetSum]?.[numCells]!==undefined)return SUM_COMBINATION_CACHE[targetSum][numCells];var combos=[];function findRec(currSum,k,startD,currCombo){if(currSum===0&&k===0){combos.push([...currCombo]);return;}if(currSum<0||k===0||startD>9)return;for(let d=startD;d<=9;++d){let remK=k-1;let minRemSum=remK>0?(remK*(d+1+d+remK))/2:0;if(currSum-d<minRemSum)break;let maxRemSum=0;for(let r=0;r<remK;++r)maxRemSum+=(9-r);if(currSum-d>maxRemSum)continue;currCombo.push(d);findRec(currSum-d,remK,d+1,currCombo);currCombo.pop();}}findRec(targetSum,numCells,1,[]);var result=null;if(combos.length>0){var mask=0;combos.forEach(c=>{c.forEach(d=>{mask|=DIGIT_MASKS[d];});});result={combinations:combos,digitMask:mask};}if(!SUM_COMBINATION_CACHE[targetSum])SUM_COMBINATION_CACHE[targetSum]={};SUM_COMBINATION_CACHE[targetSum][numCells]=result;return result; };

    // --- Constraint Propagation ---
    function assignValue(candidatesMap, solverData, cellId, digitToAssign, indent="") { var oMask=candidatesMap[cellId]&~DIGIT_MASKS[digitToAssign];for(let d=1;d<=9;++d){if((oMask&DIGIT_MASKS[d])!==0){if(!eliminateCandidate(candidatesMap,solverData,cellId,d,indent+"  "))return false;}}if(!updateCageStateOnAssign(candidatesMap,solverData,cellId,digitToAssign,indent+"  "))return false;return true;}
    function eliminateCandidate(candidatesMap, solverData, cellId, digitToEliminate, indent="") { var mask=DIGIT_MASKS[digitToEliminate];var initialCands=candidatesMap[cellId];if((initialCands&mask)===0)return true;if(!CLASSIC_PEERS_MAP||!CLASSIC_UNITS_MAP||!solverData?.cellToCageMap||!solverData?.cageDataArray)return false;candidatesMap[cellId]&=~mask;var rem=candidatesMap[cellId];var numRem=countCandidates(rem);if(numRem===0)return false;if(numRem===1){var finalDigit=getSingleCandidateDigit(rem);for(const p of CLASSIC_PEERS_MAP[cellId]){if(!eliminateCandidate(candidatesMap,solverData,p,finalDigit,indent+"  "))return false;}if(!updateCageStateOnAssign(candidatesMap,solverData,cellId,finalDigit,indent+"  "))return false;}for(const u of CLASSIC_UNITS_MAP[cellId]){var places=[];for(const c of u){if((candidatesMap[c]&mask)!==0)places.push(c);}if(places.length===0)return false;if(places.length===1){const tC=places[0];if(candidatesMap[tC]!==mask){if(!assignValue(candidatesMap,solverData,tC,digitToEliminate,indent+"  "))return false;}}}const cIdx=solverData.cellToCageMap[cellId];if(cIdx!==undefined){const cage=solverData.cageDataArray[cIdx];let placesCage=[];for(const cc of cage.cells){if(countCandidates(candidatesMap[cc])>1&&(candidatesMap[cc]&mask)!==0)placesCage.push(cc);}if(placesCage.length===1){const tC=placesCage[0];if(candidatesMap[tC]!==mask){if(!assignValue(candidatesMap,solverData,tC,digitToEliminate,indent+"  "))return false;}}}
        for (const unit of CLASSIC_UNITS_MAP[cellId]) { if (!checkInnies(candidatesMap, solverData, unit, indent + "  ")) return false; } if (cIdx !== undefined) { const cage = solverData.cageDataArray[cIdx]; for (let d_outie = 1; d_outie <= 9; d_outie++) { if (!checkOuties(candidatesMap, solverData, cage, d_outie, indent + "  ")) return false; } } return true;
    }
    function updateCageStateOnAssign(candidatesMap, solverData, assignedCellId, assignedDigit, indent="") { const cIdx=solverData.cellToCageMap[assignedCellId];if(cIdx===undefined)return true;const cage=solverData.cageDataArray[cIdx];const dMask=DIGIT_MASKS[assignedDigit];if((cage.currentValueMask&dMask)!==0)return true;cage.remainingSum-=assignedDigit;cage.remainingCellsCount-=1;cage.currentValueMask|=dMask;if(cage.remainingCellsCount<0||cage.remainingSum<0){console.error(`${indent}Cage FAIL St: Cage ${cIdx} inv state`);return false;}if(cage.remainingCellsCount===0&&cage.remainingSum!==0){return false;}if(cage.remainingCellsCount>0){const cInfo=killerSudoku.getSumCombinationInfo(cage.remainingSum,cage.remainingCellsCount);if(!cInfo)return false;let allowedMask=cInfo.digitMask;let reqMask=allowedMask&~cage.currentValueMask;if(reqMask===0&&cage.remainingSum>0)return false;for(const cId of cage.cells){if(cId!==assignedCellId&&countCandidates(candidatesMap[cId])>1){const maskApply=reqMask;const origCands=candidatesMap[cId];const newCands=origCands&maskApply;if(newCands!==origCands){const elimMask=origCands&~newCands;for(let d=1;d<=9;d++){if((elimMask&DIGIT_MASKS[d])!==0){if(!eliminateCandidate(candidatesMap,solverData,cId,d,indent+"    "))return false;}}}if(candidatesMap[cId]===0)return false;}}}return true;}
    function checkInnies(candidatesMap, solverData, unit, indent="") { let progress = false; for (let d = 1; d <= 9; d++) { const digitMask = DIGIT_MASKS[d]; let placesInUnit = []; let containingCageIndex = -1; for (const cellId of unit) { if (hasCandidate(candidatesMap[cellId], d)) { placesInUnit.push(cellId); const currentCageIdx = solverData.cellToCageMap[cellId]; if (currentCageIdx === undefined) { containingCageIndex = -2; break; } if (containingCageIndex === -1) containingCageIndex = currentCageIdx; else if (containingCageIndex !== currentCageIdx) { containingCageIndex = -2; break; } } } if (placesInUnit.length > 0 && containingCageIndex >= 0) { const targetCage = solverData.cageDataArray[containingCageIndex]; if (!targetCage) continue; for (const cageCellId of targetCage.cells) { let isInUnit = false; for(const unitCellId of unit) { if (cageCellId === unitCellId) { isInUnit = true; break; } } if (!isInUnit && hasCandidate(candidatesMap[cageCellId], d)) { console.log(`${indent}Innie Rule Applied: Eliminating ${d} from ${cageCellId} (outside unit but in cage ${containingCageIndex})`); if (!eliminateCandidate(candidatesMap, solverData, cageCellId, d, indent + "  ")) { console.log(`${indent}Innie FAIL: Contradiction elim ${d} from ${cageCellId}`); return false; } progress = true; } } } } return true; }
    function checkOuties(candidatesMap, solverData, cage, digit, indent="") { let progress = false; const digitMask = DIGIT_MASKS[digit]; let intersectingUnitsMap = {}; cage.cells.forEach(cellId => { (CLASSIC_UNITS_MAP[cellId] || []).forEach((unit) => { const unitIndex = CLASSIC_UNITS.findIndex(u => u === unit); if (unitIndex === -1) return; if (!intersectingUnitsMap[unitIndex]) { intersectingUnitsMap[unitIndex] = { unitCells: unit, internalCageCells: [] }; } intersectingUnitsMap[unitIndex].internalCageCells.push(cellId); }); }); for (const unitIndex in intersectingUnitsMap) { const unitInfo = intersectingUnitsMap[unitIndex]; const unit = unitInfo.unitCells; let canBeInternal = false; for (const internalCellId of unitInfo.internalCageCells) { if (hasCandidate(candidatesMap[internalCellId], digit)) { canBeInternal = true; break; } } if (!canBeInternal) { let canBeInCage = false; for(const cellId of cage.cells) { if(hasCandidate(candidatesMap[cellId], digit)) {canBeInCage = true; break;} } if(canBeInCage) { const cageCellsSet = new Set(cage.cells); for (const unitCellId of unit) { if (!cageCellsSet.has(unitCellId) && hasCandidate(candidatesMap[unitCellId], digit)) { console.log(`${indent}Outie Rule Applied: Eliminating ${digit} from ${unitCellId} (in unit ${unitIndex} but outside cage ${cage.id})`); if (!eliminateCandidate(candidatesMap, solverData, unitCellId, digit, indent + "  ")) { console.log(`${indent}Outie FAIL: Contradiction elim ${digit} from ${unitCellId}`); return false; } progress = true; } } } } } return true; }

    // --- Solver Search Function ---
    function _search(candidatesMap, solverData, indent="") { var s=true;for(const sq of killerSudoku.SQUARES){if(countCandidates(candidatesMap[sq])!==1){s=false;break;}}if(s)return candidatesMap;var mC=10,mSq=null;for(const sq of killerSudoku.SQUARES){var nC=countCandidates(candidatesMap[sq]);if(nC>1&&nC<mC){mC=nC;mSq=sq;if(mC===2)break;}}if(!mSq)return false;/*console.log(`${indent}Search BRANCH: ${mSq} (${mC} cands: ${formatBitset(candidatesMap[mSq])})`);*/var tryCands=getCandidatesArray(candidatesMap[mSq]);for(const d of tryCands){/*console.log(`${indent}  Try ${d} for ${mSq}`);*/var mapCopy=deepCopy(candidatesMap);var solverCopy=deepCopy(solverData);if(assignValue(mapCopy,solverCopy,mSq,d,indent+"    ")){var res=_search(mapCopy,solverCopy,indent+"  ");if(res)return res;}}/*console.log(`${indent}Search BACKTRACK from ${mSq}`);*/return false;}

    // --- Public Solver Function ---
    killerSudoku.solve = function(cages) { console.log("Starting Killer Sudoku solver..."); const sData=killerSudoku._initializeSolverData(cages); if(!sData){console.error("Fail init solver data.");return false;} var initCands={}; for(const sq of killerSudoku.SQUARES)initCands[sq]=ALL_CANDIDATES; console.log("Applying initial cage constraints (simplified)..."); var propOk=true; for(let i=0;i<sData.cageDataArray.length;++i){const cage=sData.cageDataArray[i];if(cage.initialDigitMask===0&&cage.sum>0&&cage.cells.length>0){console.error(`Cage ${i} impossible.`);propOk=false;break;}for(const cellId of cage.cells){initCands[cellId]&=cage.initialDigitMask;if(initCands[cellId]===0){console.error(`Contradiction: ${cellId} 0 cands after initial cage ${i} mask.`);propOk=false;break;}}if(!propOk)break;} if(!propOk){console.log("Initial constraint application failed.");return false;} console.log("Initial constraint application complete."); console.log("Starting recursive search..."); var solMap=_search(initCands,deepCopy(sData)); if(solMap){console.log("Solve OK.");let solStr="";for(const sq of killerSudoku.SQUARES){let d=getSingleCandidateDigit(solMap[sq]);solStr+=(d>0?d:killerSudoku.BLANK_CHAR);}if(solStr.length!==killerSudoku.NR_SQUARES||solStr.includes(killerSudoku.BLANK_CHAR)){console.error("Solver incomplete map:",solMap);return false;}return solStr;}else{console.log("Solve fail.");return false;}};


    // --- GENERATOR IMPLEMENTATION ---
    /**
     * Generates a full, valid classic Sudoku solution grid.
     */
    function _generateClassicSolutionGrid() {
        var candidates = {}; // Инициализация здесь
        for (const sq of killerSudoku.SQUARES) {
            if (typeof ALL_CANDIDATES === 'undefined') { console.error("ALL_CANDS undef!"); return false; }
            candidates[sq] = ALL_CANDIDATES;
        }

        // Вложенные функции
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
        function _assignClassic(cands, sq, digit) { var otherDigits = cands[sq] & ~DIGIT_MASKS[digit]; for (let d = 1; d <= 9; d++) { if ((otherDigits & DIGIT_MASKS[d]) !== 0) { if (!_eliminateClassic(cands, sq, d)) return false; } } return true; }
        function _eliminateClassic(cands, sq, digit) { var mask = DIGIT_MASKS[digit]; if ((cands[sq] & mask) === 0) return true; cands[sq] &= ~mask; var remaining = cands[sq]; var count = countCandidates(remaining); if (count === 0) return false; if (count === 1) { var singleDigit = getSingleCandidateDigit(remaining); for (const peer of CLASSIC_PEERS_MAP[sq]) { if (!_eliminateClassic(cands, peer, singleDigit)) return false; } } for (const unit of CLASSIC_UNITS_MAP[sq]) { var places = []; for (const unitSq of unit) { if ((cands[unitSq] & mask) !== 0) places.push(unitSq); } if (places.length === 0) return false; if (places.length === 1) { if (!_assignClassic(cands, places[0], digit)) return false; } } return true; }

        // Начальная инициализация
        var initAssign = _shuffleArray([...killerSudoku.SQUARES]);
        let initSuccess = true; // Флаг
        for (let i = 0; i < 10; i++) { // НАЧАЛО ЦИКЛА FOR
            let sq = initAssign[i];
            let pDs = getCandidatesArray(candidates[sq]);
            if (pDs.length > 0) { // НАЧАЛО IF (pDs...)
                let d = pDs[Math.floor(Math.random() * pDs.length)];
                if (!_assignClassic(candidates, sq, d)) { // НАЧАЛО IF (!_assignClassic...)
                    console.warn("Init assign fail, restart.");
                    for (const sq_reset of killerSudoku.SQUARES) {
                        candidates[sq_reset] = ALL_CANDIDATES;
                    }
                    initSuccess = false; // Ставим флаг неудачи
                    // --- ИСПРАВЛЕНО: break находится внутри блока if и внутри цикла for ---
                    break; // Выходим из цикла for (i=0...)
                } // КОНЕЦ IF (!_assignClassic...)
            } // КОНЕЦ IF (pDs...)
        } // КОНЕЦ ЦИКЛА FOR

        if (!initSuccess) {
            console.warn("Restarting classic generation due to init failure.");
            return _generateClassicSolutionGrid(); // Рекурсивный перезапуск
        }

        var solMap = searchClassic(candidates);
        if (!solMap) return false;
        var resMap = {}; for (const sq of killerSudoku.SQUARES) { resMap[sq] = getSingleCandidateDigit(solMap[sq]); if (resMap[sq] === 0) { console.error("Classic grid incomplete!"); return false; } } return resMap;
    }

    /**
     * Partitions the grid into cages. Includes improved remainder handling.
     */
    function _partitionGridIntoCages(solvedGridMap, maxCageSize = 5, minCageSize = 2) {
        var cages = []; var unassignedCells = new Set(killerSudoku.SQUARES); var cellToCageObjectMap = {};
        var maxPartitionAttempts = killerSudoku.NR_SQUARES * 10; var partitionAttempts = 0;
        // console.log(`Partitioning grid. Initial unassigned: ${unassignedCells.size}`);
        while (unassignedCells.size > 0 && partitionAttempts < maxPartitionAttempts) {
            partitionAttempts++; let remainingCellsArray = Array.from(unassignedCells); let handledRemainderThisIteration = false;
            if (remainingCellsArray.length <= maxCageSize && remainingCellsArray.length > 0) {
                let attachedCompletely = true; let cellsToAttach = [...remainingCellsArray]; let successfulAttachments = 0;
                for (let i = cellsToAttach.length - 1; i >= 0; i--) { const remCell = cellsToAttach[i]; const remDigit = solvedGridMap[remCell]; let cellAttached = false; let potentialTargets = []; (SQUARE_NEIGHBORS[remCell] || []).forEach(neighbor => { const cageObj = cellToCageObjectMap[neighbor]; if (cageObj?.id !== undefined) { const targetCageDigits = new Set(cageObj.cells.map(c => solvedGridMap[c])); if (!targetCageDigits.has(remDigit) && cageObj.cells.length < 9) { if (!potentialTargets.some(t => t.id === cageObj.id)) potentialTargets.push(cageObj); } } }); if (potentialTargets.length > 0) { const targetCage = _shuffleArray(potentialTargets)[0]; targetCage.cells.push(remCell); cellToCageObjectMap[remCell] = targetCage; unassignedCells.delete(remCell); successfulAttachments++; cellAttached = true; } if (!cellAttached) attachedCompletely = false; }
                if (!attachedCompletely) { remainingCellsArray = Array.from(unassignedCells); if (remainingCellsArray.length > 0) { console.warn(`Partition: Cannot attach ${remainingCellsArray.length}. Forcing 1-cell cages.`); remainingCellsArray.forEach(rc => { const nCage = { cells: [rc] }; cages.push(nCage); cellToCageObjectMap[rc] = nCage; unassignedCells.delete(rc); }); } }
                handledRemainderThisIteration = true;
            }
            if (unassignedCells.size === 0) break;
            if (!handledRemainderThisIteration) { var startCell = _getRandomElementFromSet(unassignedCells); if (!startCell) { console.warn("Partition: No start cell."); continue; } var currentCageCells = [startCell]; var currentCageDigits = new Set([solvedGridMap[startCell]]); unassignedCells.delete(startCell); const newCageObject = { cells: currentCageCells }; cellToCageObjectMap[startCell] = newCageObject; var remainingCount = unassignedCells.size; var potentialMaxSize = Math.min(maxCageSize, remainingCount + 1); if (remainingCount > 0 && remainingCount + 1 > minCageSize && remainingCount + 1 - minCageSize < minCageSize) { potentialMaxSize = Math.min(maxCageSize, (remainingCount + 1) - minCageSize + 1 ); } potentialMaxSize = Math.max(minCageSize, potentialMaxSize); var targetSize = Math.floor(Math.random() * (potentialMaxSize - minCageSize + 1)) + minCageSize; targetSize = Math.min(targetSize, remainingCount + 1); var addedInIteration = true;
                 while (currentCageCells.length < targetSize && addedInIteration) { addedInIteration = false; let neighborCandidates = []; for (const cell of currentCageCells) { for (const neighbor of (SQUARE_NEIGHBORS[cell] || [])) { if (unassignedCells.has(neighbor) && !currentCageDigits.has(solvedGridMap[neighbor]) && !neighborCandidates.some(nc => nc.cellId === neighbor)) { let freeCount = 0; (SQUARE_NEIGHBORS[neighbor] || []).forEach(nn => { if (unassignedCells.has(nn)) freeCount++; }); neighborCandidates.push({ cellId: neighbor, freeNeighbors: freeCount }); } } } if (neighborCandidates.length > 0) { neighborCandidates.sort((a, b) => a.freeNeighbors - b.freeNeighbors); var nextCell = neighborCandidates[0].cellId; currentCageCells.push(nextCell); currentCageDigits.add(solvedGridMap[nextCell]); unassignedCells.delete(nextCell); cellToCageObjectMap[nextCell] = newCageObject; addedInIteration = true; } }
                  if (currentCageCells.length >= minCageSize) { cages.push(newCageObject); } else { currentCageCells.forEach(cell => { unassignedCells.add(cell); delete cellToCageObjectMap[cell]; }); } }
        }
        if (unassignedCells.size > 0) { console.error(`Partition failed definitively: ${unassignedCells.size} cells remain after ${partitionAttempts} attempts.`); return false; }
        cages.forEach((cage, index) => cage.id = index); console.log(`Partition OK: ${cages.length} cages.`); return cages;
    }

    /**
     * Calculates and adds the 'sum' property to each cage object.
     */
     function _calculateCageSums(cages, solvedGridMap) { cages.forEach(cg=>{cg.sum=0;cg.cells.forEach(cId=>{const d=solvedGridMap[cId];if(typeof d==='number'&&d>=1&&d<=9)cg.sum+=d;else{console.warn(`CalcSums: Inv digit ${cId}:`,d);cg.sum=NaN;}});if(isNaN(cg.sum))console.error("Cage sum NaN:",cg);});}

    // --- Public Generator Function ---
    var GENERATION_DIFFICULTY_PARAMS={"easy":{maxCage:6,minCage:2},"medium":{maxCage:5,minCage:2},"hard":{maxCage:5,minCage:2},"very-hard":{maxCage:4,minCage:2},"insane":{maxCage:4,minCage:2},"inhuman":{maxCage:4,minCage:2},"default":{maxCage:5,minCage:2}};
    killerSudoku.generate = function(difficulty = "medium", maxAttempts = 50) { console.log(`Generate Killer(diff:${difficulty}, att:${maxAttempts})`);var params=GENERATION_DIFFICULTY_PARAMS[difficulty];if(!params){console.warn(`Diff '${difficulty}' unknown, using default.`);params=GENERATION_DIFFICULTY_PARAMS.default;}if(!params){console.error("FATAL: Default difficulty params missing!");params={maxCage:5,minCage:2};}console.log(`Using params: maxCage=${params.maxCage}, minCage=${params.minCage}`);for(let att=1;att<=maxAttempts;++att){console.log(`Gen attempt ${att}/${maxAttempts}...`);/*console.log("Gen classic...");*/var solvedMap=_generateClassicSolutionGrid();if(!solvedMap){console.warn("Fail gen classic, retry...");continue;}/*console.log(`Partition grid(max:${params.maxCage}, min:${params.minCage})...`);*/var cagesCells=_partitionGridIntoCages(solvedMap,params.maxCage,params.minCage);if(!cagesCells){console.warn("Fail partition, retry gen...");continue;}/*console.log("Calc sums...");*/_calculateCageSums(cagesCells,solvedMap);if(cagesCells.some(cage=>isNaN(cage.sum))){console.error("Cage sum NaN. Retrying gen.");continue;}var puzzle={cages:cagesCells};if(SKIP_SOLVER_VERIFICATION){console.log(`Gen OK after ${att} attempts! (Verification SKIPPED)!`);return puzzle;}else{console.log("Verify solvability...");var solveRes=killerSudoku.solve(deepCopy(puzzle.cages));if(solveRes&&typeof solveRes==='string'&&solveRes.length===killerSudoku.NR_SQUARES){console.log(`Gen OK after ${att} attempts!`);let genSolutionStr="";for(const sq of killerSudoku.SQUARES)genSolutionStr+=solvedMap[sq];if(solveRes!==genSolutionStr)console.warn("Solver result MISMATCHES generator base grid!");return puzzle;}else{console.warn(`Verify fail(Solver:${solveRes}).Retry gen...`);}}}console.error(`Failed gen Killer after ${maxAttempts} attempts.`);return false;};

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
