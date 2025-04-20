/*
    killerSudoku.js
    ---------------
    JavaScript library for Killer Sudoku puzzle generation and solving.
    Includes improved partitioning logic (Attempt 2).
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

    // --- Bitset Constants and Helpers ---
    var ALL_CANDIDATES = 511; killerSudoku.ALL_CANDIDATES_MASK = ALL_CANDIDATES;
    var DIGIT_MASKS = [0, 1, 2, 4, 8, 16, 32, 64, 128, 256]; killerSudoku.DIGIT_MASKS = DIGIT_MASKS;
    function getDigitMask(d){return DIGIT_MASKS[d]||0} function hasCandidate(b,d){return(b&DIGIT_MASKS[d])!==0} function addCandidate(b,d){return b|DIGIT_MASKS[d]} function removeCandidate(b,d){return b&~DIGIT_MASKS[d]} function countCandidates(b){var c=0;while(b>0){b&=b-1;c++}return c} function getCandidatesArray(b){var a=[];for(let d=1;d<=9;++d)if(hasCandidate(b,d))a.push(d);return a} function intersectCandidates(b1,b2){return b1&b2} function getSingleCandidateDigit(b){if(b>0&&(b&(b-1))===0){for(let d=1;d<=9;++d){if(b===DIGIT_MASKS[d])return d}}return 0}

    // --- Deep Copy Utility ---
    function deepCopy(a){if(a===null||typeof a!=="object")return a;if(a instanceof Date)return new Date(a.getTime());if(a instanceof Set)return new Set(a);if(Array.isArray(a)){const b=[];for(let c=0;c<a.length;c++)b[c]=deepCopy(a[c]);return b}const b={};for(const c in a)if(a.hasOwnProperty(c))b[c]=deepCopy(a[c]);return b}

    // --- Cage Representation and Initialization ---
    /** @typedef {object} CageInput @property {number} sum @property {string[]} cells */
    /** @typedef {object} CageDataInternal @property {number} id @property {number} sum @property {string[]} cells @property {number} initialDigitMask @property {number} remainingSum @property {number} remainingCellsCount @property {number} currentValueMask */
    /** @typedef {object} SolverData @property {object.<string, number>} cellToCageMap @property {CageDataInternal[]} cageDataArray */

    killerSudoku._initializeSolverData = function(cages) { if(!Array.isArray(cages)){console.error("Inv cages");return false;}var cellMap={},cageArr=[],assigned={};for(var i=0;i<cages.length;++i){var cg=cages[i];if(!cg||typeof cg.sum!=='number'||!Array.isArray(cg.cells)||cg.cells.length===0){console.error(`Inv cage fmt ${i}`);return false;}if(cg.sum<=0){console.error(`Inv cage sum ${i}`);return false;}if(cg.cells.length>9){console.error(`Inv cage size ${i}`);return false;}var cells=[];for(var j=0;j<cg.cells.length;++j){var cId=cg.cells[j];if(!SQUARE_MAP){console.error("SQUARE_MAP null!");return false;}if(typeof cId!=='string'||SQUARE_MAP[cId]===undefined){console.error(`Inv cell ID ${cId} cage ${i}`);return false;}if(assigned[cId]!==undefined){console.error(`Cell ${cId} multi cages ${i},${assigned[cId]}`);return false;}assigned[cId]=i;cellMap[cId]=i;cells.push(cId);}var cInfo=killerSudoku.getSumCombinationInfo(cg.sum,cells.length);cageArr.push({id:i,sum:cg.sum,cells:cells,initialDigitMask:cInfo?cInfo.digitMask:0,remainingSum:cg.sum,remainingCellsCount:cells.length,currentValueMask:0,});}const assignedCnt=Object.keys(assigned).length;if(assignedCnt!==killerSudoku.NR_SQUARES){console.error(`Inv cage def: covered ${assignedCnt}/${killerSudoku.NR_SQUARES}`);if(killerSudoku.SQUARES){const missing=killerSudoku.SQUARES.filter(sq=>assigned[sq]===undefined);if(missing.length>0)console.error("Missing:",missing);}return false;}/*console.log("Solver data init OK.");*/return{cellToCageMap:cellMap,cageDataArray:cageArr}; };

    // --- Sum Combination Cache and Calculation ---
    var SUM_COMBINATION_CACHE = {};
    killerSudoku.getSumCombinationInfo = function(targetSum, numCells) { if(numCells<=0||numCells>9||targetSum<=0)return null;var minSum=(numCells*(numCells+1))/2;var maxSum=(numCells*(19-numCells))/2;if(targetSum<minSum||targetSum>maxSum)return null;if(SUM_COMBINATION_CACHE[targetSum]?.[numCells]!==undefined)return SUM_COMBINATION_CACHE[targetSum][numCells];var combos=[];function findRec(currSum,k,startD,currCombo){if(currSum===0&&k===0){combos.push([...currCombo]);return;}if(currSum<0||k===0||startD>9)return;for(let d=startD;d<=9;++d){let remK=k-1;let minRemSum=remK>0?(remK*(d+1+d+remK))/2:0;if(currSum-d<minRemSum)break;let maxRemSum=0;for(let r=0;r<remK;++r)maxRemSum+=(9-r);if(currSum-d>maxRemSum)continue;currCombo.push(d);findRec(currSum-d,remK,d+1,currCombo);currCombo.pop();}}findRec(targetSum,numCells,1,[]);var result=null;if(combos.length>0){var mask=0;combos.forEach(c=>{c.forEach(d=>{mask|=DIGIT_MASKS[d];});});result={combinations:combos,digitMask:mask};}if(!SUM_COMBINATION_CACHE[targetSum])SUM_COMBINATION_CACHE[targetSum]={};SUM_COMBINATION_CACHE[targetSum][numCells]=result;return result; };

    // --- Constraint Propagation ---
    function assignValue(candidatesMap, solverData, cellId, digitToAssign) { var oMask=candidatesMap[cellId]&~DIGIT_MASKS[digitToAssign];for(let d=1;d<=9;++d){if((oMask&DIGIT_MASKS[d])!==0){if(!eliminateCandidate(candidatesMap,solverData,cellId,d))return false;}}if(!updateCageStateOnAssign(candidatesMap,solverData,cellId,digitToAssign))return false;return true;}
    function eliminateCandidate(candidatesMap, solverData, cellId, digitToEliminate) { var mask=DIGIT_MASKS[digitToEliminate];if((candidatesMap[cellId]&mask)===0)return true;if(!CLASSIC_PEERS_MAP||!CLASSIC_UNITS_MAP||!solverData?.cellToCageMap||!solverData?.cageDataArray)return false;candidatesMap[cellId]&=~mask;var rem=candidatesMap[cellId];var numRem=countCandidates(rem);if(numRem===0)return false;if(numRem===1){var finalDigit=getSingleCandidateDigit(rem);for(const p of CLASSIC_PEERS_MAP[cellId]){if(!eliminateCandidate(candidatesMap,solverData,p,finalDigit))return false;}if(!updateCageStateOnAssign(candidatesMap,solverData,cellId,finalDigit))return false;}for(const u of CLASSIC_UNITS_MAP[cellId]){var places=[];for(const c of u){if((candidatesMap[c]&mask)!==0)places.push(c);}if(places.length===0)return false;if(places.length===1){if(!assignValue(candidatesMap,solverData,places[0],digitToEliminate))return false;}}const cIdx=solverData.cellToCageMap[cellId];if(cIdx!==undefined){const cage=solverData.cageDataArray[cIdx];let placesCage=[];for(const cc of cage.cells){if(countCandidates(candidatesMap[cc])>1&&(candidatesMap[cc]&mask)!==0)placesCage.push(cc);}if(placesCage.length===1){if(!assignValue(candidatesMap,solverData,placesCage[0],digitToEliminate))return false;}}return true;}
    function updateCageStateOnAssign(candidatesMap, solverData, assignedCellId, assignedDigit) { const cIdx=solverData.cellToCageMap[assignedCellId];if(cIdx===undefined)return true;const cage=solverData.cageDataArray[cIdx];const dMask=DIGIT_MASKS[assignedDigit];if((cage.currentValueMask&dMask)!==0)return true;cage.remainingSum-=assignedDigit;cage.remainingCellsCount-=1;cage.currentValueMask|=dMask;if(cage.remainingCellsCount<0||cage.remainingSum<0)return false;if(cage.remainingCellsCount>0){const cInfo=killerSudoku.getSumCombinationInfo(cage.remainingSum,cage.remainingCellsCount);if(!cInfo)return false;let allowedMask=cInfo.digitMask;let reqMask=allowedMask&~cage.currentValueMask;if(reqMask===0&&cage.remainingSum>0)return false;for(const cId of cage.cells){if(countCandidates(candidatesMap[cId])>1){const maskApply=reqMask;const origCands=candidatesMap[cId];const newCands=origCands&maskApply;if(newCands!==origCands){const elimMask=origCands&~newCands;for(let d=1;d<=9;d++){if((elimMask&DIGIT_MASKS[d])!==0){if(!eliminateCandidate(candidatesMap,solverData,cId,d))return false;}}}if(candidatesMap[cId]===0)return false;}}}else if(cage.remainingSum!==0)return false;return true;}

    // --- Solver Search Function ---
    function _search(candidatesMap, solverData) { var s=true;for(const sq of killerSudoku.SQUARES){if(countCandidates(candidatesMap[sq])!==1){s=false;break;}}if(s)return candidatesMap;var mC=10,mSq=null;for(const sq of killerSudoku.SQUARES){var nC=countCandidates(candidatesMap[sq]);if(nC>1&&nC<mC){mC=nC;mSq=sq;if(mC===2)break;}}if(!mSq)return false;var tryCands=getCandidatesArray(candidatesMap[mSq]);for(const d of tryCands){var mapCopy=deepCopy(candidatesMap);var solverCopy=deepCopy(solverData);if(assignValue(mapCopy,solverCopy,mSq,d)){var res=_search(mapCopy,solverCopy);if(res)return res;}}return false;}

    // --- Public Solver Function ---
    killerSudoku.solve = function(cages) { console.log("Kill solve start...");const sData=killerSudoku._initializeSolverData(cages);if(!sData){console.error("Fail init solver data.");return false;}var initCands={};for(const sq of killerSudoku.SQUARES)initCands[sq]=ALL_CANDIDATES;console.log("Apply init cage constraints...");var initSolverCopy=deepCopy(sData);var propOk=true;for(let i=0;i<sData.cageDataArray.length;++i){const cage=sData.cageDataArray[i];if(cage.initialDigitMask===0&&cage.sum>0){console.error(`Cage ${i} impossible.`);propOk=false;break;}for(const cId of cage.cells){const orig=initCands[cId];const newC=orig&cage.initialDigitMask;if(newC!==orig){const elim=orig&~newC;for(let d=1;d<=9;d++){if((elim&DIGIT_MASKS[d])!==0){if(!eliminateCandidate(initCands,initSolverCopy,cId,d)){console.error(`Contradiction init cage ${i} mask @ ${cId} (elim ${d})`);propOk=false;break;}}}}if(!propOk)break;if(initCands[cId]===0){console.error(`Contradiction: ${cId} 0 cands after init cage ${i} mask.`);propOk=false;break;}if(countCandidates(initCands[cId])===1){const sD=getSingleCandidateDigit(initCands[cId]);if(!updateCageStateOnAssign(initCands,initSolverCopy,cId,sD)){console.error(`Contradiction update cage ${i} after init prop ${cId}=${sD}`);propOk=false;break;}}}if(!propOk)break;}if(!propOk){console.log("Init constraint prop failed.");return false;}console.log("Init constraint prop done.");console.log("Start recursive search...");var solMap=_search(initCands,initSolverCopy);if(solMap){console.log("Solve OK.");let solStr="";for(const sq of killerSudoku.SQUARES){let d=getSingleCandidateDigit(solMap[sq]);solStr+=(d>0?d:killerSudoku.BLANK_CHAR);}if(solStr.length!==killerSudoku.NR_SQUARES||solStr.includes(killerSudoku.BLANK_CHAR)){console.error("Solver incomplete map:",solMap);return false;}return solStr;}else{console.log("Solve fail.");return false;}};


    // --- GENERATOR IMPLEMENTATION ---
    function _generateClassicSolutionGrid(){var c={};for(const s of killerSudoku.SQUARES){if(typeof ALL_CANDIDATES==='undefined'){console.error("ALL_CANDS undef!");return false;}c[s]=ALL_CANDIDATES;}function searchClassic(a){var b=true;for(const c of killerSudoku.SQUARES){if(countCandidates(a[c])!==1){b=false;break;}}if(b)return a;var d=10,e=null;var f=_shuffleArray([...killerSudoku.SQUARES]);for(const g of f){var h=countCandidates(a[g]);if(h>1&&h<d){d=h;e=g;if(d===2)break;}}if(!e)return false;var i=_shuffleArray(getCandidatesArray(a[e]));for(const j of i){var k=deepCopy(a);if(_assignClassic(k,e,j)){var l=searchClassic(k);if(l)return l;}}return false;}function _assignClassic(a,b,c){var d=a[b]&~DIGIT_MASKS[c];for(let e=1;e<=9;e++){if((d&DIGIT_MASKS[e])!==0){if(!_eliminateClassic(a,b,e))return false;}}return true;}function _eliminateClassic(a,b,c){var d=DIGIT_MASKS[c];if((a[b]&d)===0)return true;a[b]&=~d;var e=a[b];var f=countCandidates(e);if(f===0)return false;if(f===1){var g=getSingleCandidateDigit(e);for(const h of CLASSIC_PEERS_MAP[b]){if(!_eliminateClassic(a,h,g))return false;}}for(const i of CLASSIC_UNITS_MAP[b]){var j=[];for(const k of i){if((a[k]&d)!==0)j.push(k);}if(j.length===0)return false;if(j.length===1){if(!_assignClassic(a,j[0],c))return false;}}return true;}var initAssign=_shuffleArray([...killerSudoku.SQUARES]);for(let i=0;i<10;i++){let sq=initAssign[i];let pDs=getCandidatesArray(c[sq]);if(pDs.length>0){let d=pDs[Math.floor(Math.random()*pDs.length)];if(!_assignClassic(c,sq,d)){console.warn("Init assign fail, restart.");for(const sq of killerSudoku.SQUARES)c[sq]=ALL_CANDIDATES;break;};}}var solMap=searchClassic(c);if(!solMap)return false;var resMap={};for(const sq of killerSudoku.SQUARES){resMap[sq]=getSingleCandidateDigit(solMap[sq]);if(resMap[sq]===0){console.error("Classic grid incomplete!");return false;}}return resMap;}

    /**
     * Attempts to partition the grid into cages. Includes improved remainder handling.
     * @param {object} solvedGridMap - Map {cellId: digit} of the solved grid.
     * @param {number} maxCageSize - Maximum allowed size for a cage.
     * @param {number} minCageSize - Minimum allowed size for a cage.
     * @returns {object[] | false} Array of cages [{cells: string[], id?: number}] or false if partitioning failed.
     */
    function _partitionGridIntoCages(solvedGridMap, maxCageSize = 5, minCageSize = 2) {
        var cages = []; // Array to store {cells: string[], id?: number}
        var unassignedCells = new Set(killerSudoku.SQUARES);
        // Map to quickly find the cage object containing a cell during partitioning
        var cellToCageObjectMap = {}; // cellId -> cageObject{cells:[], id?:number} reference

        var maxAttempts = killerSudoku.NR_SQUARES * 10; // Increased attempts further
        var attempts = 0;
        console.log(`Partitioning grid. Initial unassigned: ${unassignedCells.size}`);

        while (unassignedCells.size > 0 && attempts < maxAttempts) {
            attempts++;
            // console.log(`Partition attempt ${attempts}, remaining cells: ${unassignedCells.size}`); // VERBOSE

            let remainingCellsArray = Array.from(unassignedCells);
            let handledRemainderThisIteration = false; // Flag specific to this attempt

            // --- Попытка Обработки Остатка ---
            // Try only if remainder size is potentially problematic or manageable
            if (remainingCellsArray.length <= maxCageSize && remainingCellsArray.length > 0) {
                console.log(`Partitioning: Attempting to handle remainder of size ${remainingCellsArray.length}`);
                let attached = false;

                // --- Сценарий 1: Попытка присоединить (по одному) ---
                let cellsToProcess = [...remainingCellsArray]; // Copy to modify while iterating
                let successfullyAttached = []; // Keep track of cells we managed to attach

                for (let i = cellsToProcess.length - 1; i >= 0; i--) { // Iterate backwards for safe removal
                    const remCell = cellsToProcess[i];
                    const remDigit = solvedGridMap[remCell];
                    let cellAttached = false;

                    // Find neighbors already in cages
                    const neighborCages = [];
                    (SQUARE_NEIGHBORS[remCell] || []).forEach(neighbor => {
                        const cageObj = cellToCageObjectMap[neighbor];
                        // Ensure neighbor is assigned and cageObj exists and hasn't been merged into already this round
                        if (cageObj && cageObj.id !== undefined) {
                            if (!neighborCages.some(nc => nc.id === cageObj.id)) { // Avoid duplicate cages
                                neighborCages.push(cageObj);
                            }
                        }
                    });

                    // Try attaching remCell to each neighbor cage
                    for (const targetCage of _shuffleArray(neighborCages)) { // Shuffle targets
                        const targetCageDigits = new Set(targetCage.cells.map(c => solvedGridMap[c]));
                        // Check if adding remDigit violates uniqueness AND new size is reasonable
                        if (!targetCageDigits.has(remDigit) && targetCage.cells.length < 9) { // Allow slightly larger cages here
                            console.log(`Partitioning/Attach: Attaching ${remCell}(${remDigit}) to cage ${targetCage.id}`);
                            targetCage.cells.push(remCell);
                            cellToCageObjectMap[remCell] = targetCage; // Update map
                            unassignedCells.delete(remCell); // Remove from main set
                            successfullyAttached.push(remCell);
                            cellsToProcess.splice(i, 1); // Remove from current processing list
                            cellAttached = true;
                            break; // Attached this cell, move to the next remaining one
                        }
                    }
                    // If cell could not be attached, leave it in cellsToProcess for potential Scenario 2
                } // End loop trying to attach individual cells

                // Update the main unassigned set based on successful attachments
                // This is implicitly done by unassignedCells.delete inside the loop


                // Check if ALL remaining cells were attached
                if (unassignedCells.size === 0) {
                    console.log("Partitioning: All remainder cells successfully attached individually.");
                    handledRemainderThisIteration = true;
                    break; // Exit main while loop
                } else if (successfullyAttached.length > 0 && unassignedCells.size > 0){
                    // Some were attached, some were not. Re-evaluate remainder for Scenario 2
                    remainingCellsArray = Array.from(unassignedCells); // Update remaining list
                    console.log(`Partitioning: After attaching ${successfullyAttached.length}, ${remainingCellsArray.length} remain.`);
                }

                // --- Сценарий 2: Создать клетку из оставшихся (если Сценарий 1 не прикрепил ВСЕ) ---
                if (!handledRemainderThisIteration && remainingCellsArray.length > 0) {
                     console.log(`Partitioning: Trying Scenario 2 for remaining ${remainingCellsArray.length} cells.`);
                    const remainingDigits = new Set();
                    let possible = true;
                    remainingCellsArray.forEach(cell => {
                         const digit = solvedGridMap[cell];
                         if (remainingDigits.has(digit)) { possible = false; }
                         remainingDigits.add(digit);
                    });

                    if (possible) { // Create cage even if < minCageSize as last resort
                        console.warn(`Partitioning: Creating final cage with ${remainingCellsArray.length} cells (size < ${minCageSize} allowed).`);
                        const newCage = { cells: remainingCellsArray };
                        cages.push(newCage);
                        remainingCellsArray.forEach(cell => cellToCageObjectMap[cell] = newCage);
                        unassignedCells.clear();
                        handledRemainderThisIteration = true; // Handled
                    } else {
                        // Cannot form a valid cage from the absolute remainder - this partitioning attempt fails
                        console.error(`Partitioning failed: Cannot form final cage from remainder due to digit collision. Cells: ${remainingCellsArray.join(',')}`);
                        // Put all cells back and hope the next attempt works better
                        // Need to restart the whole partition process for this attempt
                        return false; // Signal failure for this partition attempt
                    }
                }

                 if (handledRemainderThisIteration) break; // Exit main while loop if remainder was fully handled

            } // End handling remainder block

            // --- Обычный Рост Клетки ---
            // Execute only if remainder was not handled or was too large initially
             if (!handledRemainderThisIteration) {
                var startCell = _getRandomElementFromSet(unassignedCells);
                 if (!startCell) { console.warn("Partitioning: Could not get start cell."); continue; } // Should not happen if size > 0

                var currentCageCells = [startCell];
                var currentCageDigits = new Set([solvedGridMap[startCell]]);
                unassignedCells.delete(startCell);
                const newCageObject = { cells: currentCageCells }; // Create object early for mapping
                cellToCageObjectMap[startCell] = newCageObject; // Map the start cell

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
                     var potentialNeighbors = [];
                     for (const cell of currentCageCells) {
                         for (const neighbor of (SQUARE_NEIGHBORS[cell] || [])) {
                             if (unassignedCells.has(neighbor) && !currentCageDigits.has(solvedGridMap[neighbor])) {
                                  if (!potentialNeighbors.includes(neighbor)) potentialNeighbors.push(neighbor);
                             }
                         }
                     }

                     if (potentialNeighbors.length > 0) {
                         potentialNeighbors = _shuffleArray(potentialNeighbors);
                         var nextCell = potentialNeighbors[0];
                         currentCageCells.push(nextCell);
                         currentCageDigits.add(solvedGridMap[nextCell]);
                         unassignedCells.delete(nextCell);
                         cellToCageObjectMap[nextCell] = newCageObject; // Map new cell to this cage
                         addedInIteration = true;
                     }
                 } // End while growing cage

                  if (currentCageCells.length >= minCageSize) {
                      cages.push(newCageObject); // Add the fully formed cage object
                  } else {
                      // Failed cage growth, put cells back
                      // console.warn(`Partitioning: Failed cage from ${startCell}, size ${currentCageCells.length}. Putting back.`);
                      currentCageCells.forEach(cell => {
                          unassignedCells.add(cell);
                          delete cellToCageObjectMap[cell]; // Unmap cells
                      });
                  }
             } // end if !handledRemainderThisIteration

        } // End main while loop

        // Final check after loop
        if (unassignedCells.size > 0) {
             console.error(`Partitioning failed definitively: ${unassignedCells.size} cells remain unassigned after ${attempts} attempts.`);
             return false; // Failed
        }

        // Assign final IDs to cages AFTER partitioning is complete
        cages.forEach((cage, index) => cage.id = index);

        console.log(`Partitioning successful: ${cages.length} cages created.`);
        return cages; // Return cages with cells and id (sums calculated later)
    }


    function _calculateCageSums(cages, solvedGridMap) { cages.forEach(cg=>{cg.sum=0;cg.cells.forEach(cId=>{const d=solvedGridMap[cId];if(typeof d==='number'&&d>=1&&d<=9)cg.sum+=d;else{console.warn(`CalcSums: Inv digit ${cId}:`,d);cg.sum=NaN;}});if(isNaN(cg.sum))console.error("Cage sum NaN:",cg);});}
    var GENERATION_DIFFICULTY_PARAMS={"easy":{maxCage:6,minCage:2},"medium":{maxCage:5,minCage:2},"hard":{maxCage:5,minCage:2},"very-hard":{maxCage:4,minCage:2},"insane":{maxCage:4,minCage:2},"inhuman":{maxCage:4,minCage:2},"default":{maxCage:5,minCage:2}};
    killerSudoku.generate = function(difficulty = "medium", maxAttempts = 50) { // Increased attempts again
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
             var puzzle = { cages: cagesCells };

             console.log("Verify solvability...");
             var solveRes = killerSudoku.solve(deepCopy(puzzle.cages));
             if (solveRes && typeof solveRes === 'string' && solveRes.length === killerSudoku.NR_SQUARES) {
                 console.log(`Gen OK after ${attempt} attempts!`);
                 return puzzle;
             } else {
                 console.warn(`Verify fail(Solver:${solveRes}).Retry gen...`);
             }
         }
         console.error(`Failed gen Killer after ${maxAttempts} attempts.`);
         return false;
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
