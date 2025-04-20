/*
    killerSudoku.js
    ---------------
    JavaScript library for Killer Sudoku puzzle generation and solving.
    Includes updated partitioning logic (Attempt 4 - Force 1-cell cages for remainder).
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

    killerSudoku._initializeSolverData = function(cages) {
        if (!Array.isArray(cages)) { console.error("Invalid cages input: must be an array."); return false; }
        if (!SQUARE_MAP) { console.error("_initializeSolverData: SQUARE_MAP not initialized!"); return false;}

        var cellToCageMap = {}; var cageDataArray = []; var assignedCells = {};
        for (var i = 0; i < cages.length; ++i) {
            var cage = cages[i];
            // Basic validation
            if (!cage || typeof cage.sum !== 'number' || !Array.isArray(cage.cells) || cage.cells.length === 0) { console.error(`Invalid cage format at index ${i}:`, cage); return false; }
            if (cage.sum <= 0 && cage.cells.length > 0) { console.error(`Invalid cage sum (<= 0) at index ${i}:`, cage.sum); return false; } // Allow sum 0 only for empty cages? (unlikely)
            if (cage.cells.length > 9) { console.error(`Invalid cage size (> 9) at index ${i}:`, cage.cells.length); return false; }

            // Validate cells and check overlaps
            var cageCells = [];
            var cageDigits = new Set(); // Check for duplicates within the provided cage definition itself
            for (var j = 0; j < cage.cells.length; ++j) {
                var cellId = cage.cells[j];
                if (typeof cellId !== 'string' || SQUARE_MAP[cellId] === undefined) { console.error(`Invalid cell ID '${cellId}' in cage at index ${i}`); return false; }
                if (assignedCells[cellId] !== undefined) { console.error(`Cell ${cellId} belongs to multiple cages (index ${i} and ${assignedCells[cellId]})`); return false; }

                // Check internal cage consistency (optional but good)
                // This requires the *solved* grid, which we don't have here.
                // We rely on the generator providing valid cages initially.

                assignedCells[cellId] = i; cellToCageMap[cellId] = i; cageCells.push(cellId);
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


            var combinationInfo = killerSudoku.getSumCombinationInfo(cage.sum, cageCells.length);
             // Check if the sum is actually possible for the size
             if (cage.cells.length > 0 && !combinationInfo) {
                  console.error(`Impossible sum ${cage.sum} for cage size ${cage.cells.length} at index ${i} (no combinations found).`);
                  return false;
             }

            cageDataArray.push({
                id: i, sum: cage.sum, cells: cageCells,
                initialDigitMask: combinationInfo ? combinationInfo.digitMask : 0,
                remainingSum: cage.sum, remainingCellsCount: cageCells.length,
                currentValueMask: 0,
            });
        }
         const assignedCount = Object.keys(assignedCells).length;
         if (assignedCount !== killerSudoku.NR_SQUARES) {
             console.error(`Invalid cage definition: Not all ${killerSudoku.NR_SQUARES} squares covered or some covered more than once. Covered: ${assignedCount}`);
             if (killerSudoku.SQUARES) { const missing = killerSudoku.SQUARES.filter(sq => assignedCells[sq] === undefined); if (missing.length > 0) console.error("Missing squares:", missing); }
             return false;
         }
        // console.log("Solver data initialized successfully."); // Less verbose
        return { cellToCageMap: cellToCageMap, cageDataArray: cageDataArray };
    };

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
    killerSudoku.solve = function(cages) { console.log("Kill solve start...");const sData=killerSudoku._initializeSolverData(cages);if(!sData){console.error("Fail init solver data.");return false;}var initCands={};for(const sq of killerSudoku.SQUARES)initCands[sq]=ALL_CANDIDATES;/*console.log("Apply init cage constraints...");*/var initSolverCopy=deepCopy(sData);var propOk=true;for(let i=0;i<sData.cageDataArray.length;++i){const cage=sData.cageDataArray[i];if(cage.initialDigitMask===0&&cage.sum>0){console.error(`Cage ${i} impossible.`);propOk=false;break;}for(const cId of cage.cells){const orig=initCands[cId];const newC=orig&cage.initialDigitMask;if(newC!==orig){const elim=orig&~newC;for(let d=1;d<=9;d++){if((elim&DIGIT_MASKS[d])!==0){if(!eliminateCandidate(initCands,initSolverCopy,cId,d)){console.error(`Contradiction init cage ${i} mask @ ${cId} (elim ${d})`);propOk=false;break;}}}}if(!propOk)break;if(initCands[cId]===0){console.error(`Contradiction: ${cId} 0 cands after init cage ${i} mask.`);propOk=false;break;}if(countCandidates(initCands[cId])===1){const sD=getSingleCandidateDigit(initCands[cId]);if(!updateCageStateOnAssign(initCands,initSolverCopy,cId,sD)){console.error(`Contradiction update cage ${i} after init prop ${cId}=${sD}`);propOk=false;break;}}}if(!propOk)break;}if(!propOk){console.log("Init constraint prop failed.");return false;}/*console.log("Init constraint prop done.");console.log("Start recursive search...");*/var solMap=_search(initCands,initSolverCopy);if(solMap){console.log("Solve OK.");let solStr="";for(const sq of killerSudoku.SQUARES){let d=getSingleCandidateDigit(solMap[sq]);solStr+=(d>0?d:killerSudoku.BLANK_CHAR);}if(solStr.length!==killerSudoku.NR_SQUARES||solStr.includes(killerSudoku.BLANK_CHAR)){console.error("Solver incomplete map:",solMap);return false;}return solStr;}else{console.log("Solve fail.");return false;}};


    // --- GENERATOR IMPLEMENTATION ---
    function _generateClassicSolutionGrid(){var c={};for(const s of killerSudoku.SQUARES){if(typeof ALL_CANDIDATES==='undefined'){console.error("ALL_CANDS undef!");return false;}c[s]=ALL_CANDIDATES;}function searchClassic(a){var b=true;for(const c of killerSudoku.SQUARES){if(countCandidates(a[c])!==1){b=false;break;}}if(b)return a;var d=10,e=null;var f=_shuffleArray([...killerSudoku.SQUARES]);for(const g of f){var h=countCandidates(a[g]);if(h>1&&h<d){d=h;e=g;if(d===2)break;}}if(!e)return false;var i=_shuffleArray(getCandidatesArray(a[e]));for(const j of i){var k=deepCopy(a);if(_assignClassic(k,e,j)){var l=searchClassic(k);if(l)return l;}}return false;}function _assignClassic(a,b,c){var d=a[b]&~DIGIT_MASKS[c];for(let e=1;e<=9;e++){if((d&DIGIT_MASKS[e])!==0){if(!_eliminateClassic(a,b,e))return false;}}return true;}function _eliminateClassic(a,b,c){var d=DIGIT_MASKS[c];if((a[b]&d)===0)return true;a[b]&=~d;var e=a[b];var f=countCandidates(e);if(f===0)return false;if(f===1){var g=getSingleCandidateDigit(e);for(const h of CLASSIC_PEERS_MAP[b]){if(!_eliminateClassic(a,h,g))return false;}}for(const i of CLASSIC_UNITS_MAP[b]){var j=[];for(const k of i){if((a[k]&d)!==0)j.push(k);}if(j.length===0)return false;if(j.length===1){if(!_assignClassic(a,j[0],c))return false;}}return true;}var initAssign=_shuffleArray([...killerSudoku.SQUARES]);for(let i=0;i<10;i++){let sq=initAssign[i];let pDs=getCandidatesArray(c[sq]);if(pDs.length>0){let d=pDs[Math.floor(Math.random()*pDs.length)];if(!_assignClassic(c,sq,d)){console.warn("Init assign fail, restart.");for(const sq of killerSudoku.SQUARES)c[sq]=ALL_CANDIDATES;break;};}}var solMap=searchClassic(c);if(!solMap)return false;var resMap={};for(const sq of killerSudoku.SQUARES){resMap[sq]=getSingleCandidateDigit(solMap[sq]);if(resMap[sq]===0){console.error("Classic grid incomplete!");return false;}}return resMap;}

    /**
     * Partitions the grid into cages. Includes improved remainder handling.
     * @param {object} solvedGridMap - Map {cellId: digit} of the solved grid.
     * @param {number} maxCageSize - Maximum allowed size for a cage.
     * @param {number} minCageSize - Minimum allowed size for a cage.
     * @returns {object[] | false} Array of cages [{cells: string[], id?: number}] or false if partitioning failed.
     */
    function _partitionGridIntoCages(solvedGridMap, maxCageSize = 5, minCageSize = 2) {
        var cages = [];
        var unassignedCells = new Set(killerSudoku.SQUARES);
        var cellToCageObjectMap = {}; // cellId -> cageObject reference

        var maxAttempts = killerSudoku.NR_SQUARES * 10; // Attempts for the whole process
        var attempts = 0;
        console.log(`Partitioning grid. Initial unassigned: ${unassignedCells.size}`);

        while (unassignedCells.size > 0 && attempts < maxAttempts) {
            attempts++;
            // console.log(`Partition attempt ${attempts}, remaining cells: ${unassignedCells.size}`); // VERBOSE

            let remainingCellsArray = Array.from(unassignedCells);
            let handledRemainderThisIteration = false;

            // --- Сценарий 1 и 2: Обработка остатка ---
            // Try only if remainder size is potentially manageable or needs forced handling
            if (remainingCellsArray.length <= maxCageSize && remainingCellsArray.length > 0) {
                console.log(`Partitioning: Attempting to handle remainder size ${remainingCellsArray.length}`);
                let attachedCompletely = true;

                // --- Сценарий 1: Попытка присоединить по одной ---
                let cellsToAttach = [...remainingCellsArray];
                let successfulAttachments = 0;
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
                         targetCage.cells.push(remCell);
                         cellToCageObjectMap[remCell] = targetCage;
                         unassignedCells.delete(remCell);
                         successfulAttachments++;
                         cellAttached = true;
                    }
                    if (!cellAttached) { attachedCompletely = false; } // Failed to attach this one
                } // End loop attaching individual cells

                // --- Сценарий 2: Форсировать одноклеточные кейджи из НЕПРИСОЕДИНЕННЫХ ---
                if (!attachedCompletely) {
                    remainingCellsArray = Array.from(unassignedCells); // Get the actual remaining cells
                    console.warn(`Partitioning: Could not attach all ${remainingCellsArray.length} remainder cells individually. Forcing 1-cell cages for them.`);
                    remainingCellsArray.forEach(remCell => {
                        const newCage = { cells: [remCell] }; // Create 1-cell cage
                        cages.push(newCage);
                        cellToCageObjectMap[remCell] = newCage; // Map it
                        unassignedCells.delete(remCell); // Remove it
                    });
                    // Check if now empty (should be)
                    if (unassignedCells.size === 0) {
                        console.log("Partitioning: Remainder handled by creating 1-cell cages.");
                        handledRemainderThisIteration = true;
                    } else {
                        // This case should ideally not happen if logic is correct
                        console.error(`Partitioning ERROR: Still ${unassignedCells.size} cells left after forcing 1-cell cages.`);
                        return false; // Failure state
                    }
                } else if (unassignedCells.size === 0) {
                    // Scenario 1 attached everything successfully
                    console.log("Partitioning: Remainder handled by attaching individually.");
                    handledRemainderThisIteration = true;
                }

                 if (handledRemainderThisIteration) break; // Exit main while loop

            } // End handling remainder block


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
                    var potentialNeighbors = [];
                    for (const cell of currentCageCells) { // Check neighbors of ALL current cage cells
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
                        cellToCageObjectMap[nextCell] = newCageObject; // Map newly added cell
                        addedInIteration = true;
                    }
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
             console.error(`Partitioning failed definitively: ${unassignedCells.size} cells remain unassigned after ${attempts} attempts.`);
             return false; // Failed
        }

        // Assign final IDs to cages
        cages.forEach((cage, index) => cage.id = index);

        console.log(`Partitioning successful: ${cages.length} cages created.`);
        return cages; // Return cages with cells and id
    }

    /**
     * Calculates and adds the 'sum' property to each cage object.
     * @param {object[]} cages - Array of cages [{cells: string[], id?: number}]
     * @param {object} solvedGridMap - Map {cellId: digit} of the solved grid.
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
             if (!cagesCells) { console.warn("Fail partition, retry gen..."); continue; } // Partition failed

             console.log("Calc sums...");
             _calculateCageSums(cagesCells, solvedMap);
             if (cagesCells.some(cage => isNaN(cage.sum))) { console.error("Cage sum NaN. Retrying gen."); continue; }
             var puzzle = { cages: cagesCells }; // puzzle.cages now has cells, id, sum

             console.log("Verify solvability...");
             var solveRes = killerSudoku.solve(deepCopy(puzzle.cages)); // Use deep copy
             if (solveRes && typeof solveRes === 'string' && solveRes.length === killerSudoku.NR_SQUARES) {
                 console.log(`Gen OK after ${attempt} attempts!`);
                 // Final check: ensure solved result matches the original grid
                 let genSolutionStr = "";
                 for(const sq of killerSudoku.SQUARES) genSolutionStr += solvedMap[sq];
                 if (solveRes !== genSolutionStr) {
                     console.warn("Solver result MISMATCHES generator base grid! Puzzle might be non-unique or flawed.");
                     // Depending on requirements, either return puzzle or continue generation
                     // For now, let's return it but log the warning
                 }
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
