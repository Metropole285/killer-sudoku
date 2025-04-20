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
                if (!SQUARE_MAP) { console.error("_initializeSolverData: SQUARE_MAP not initialized!"); return false;}
                if (typeof cellId !== 'string' || SQUARE_MAP[cellId] === undefined) { console.error(`Invalid cell ID '${cellId}' in cage at index ${i}`); return false; }
                if (assignedCells[cellId] !== undefined) { console.error(`Cell ${cellId} belongs to multiple cages (index ${i} and ${assignedCells[cellId]})`); return false; }
                assignedCells[cellId] = i; cellToCageMap[cellId] = i; cageCells.push(cellId);
            }
            var combinationInfo = killerSudoku.getSumCombinationInfo(cage.sum, cageCells.length);
            cageDataArray.push({
                id: i, sum: cage.sum, cells: cageCells,
                initialDigitMask: combinationInfo ? combinationInfo.digitMask : 0,
                remainingSum: cage.sum, remainingCellsCount: cageCells.length,
                currentValueMask: 0,
            });
        }
         if (Object.keys(assignedCells).length !== killerSudoku.NR_SQUARES) {
            const assignedCount = Object.keys(assignedCells).length;
            console.error(`Invalid cage definition: Not all ${killerSudoku.NR_SQUARES} squares covered/covered more than once. Covered: ${assignedCount}`);
            if (killerSudoku.SQUARES) { const missing = killerSudoku.SQUARES.filter(sq => assignedCells[sq] === undefined); if (missing.length > 0) console.error("Missing squares:", missing); }
            return false;
         }
        console.log("Solver data initialized successfully.");
        return { cellToCageMap: cellToCageMap, cageDataArray: cageDataArray };
    };


    // --- Sum Combination Cache and Calculation ---
    var SUM_COMBINATION_CACHE = {};
    killerSudoku.getSumCombinationInfo = function(targetSum, numCells) { /* ... как в предыдущем ... */ if(numCells<=0||numCells>9||targetSum<=0)return null;var minSum=(numCells*(numCells+1))/2;var maxSum=(numCells*(19-numCells))/2;if(targetSum<minSum||targetSum>maxSum)return null;if(SUM_COMBINATION_CACHE[targetSum]?.[numCells]!==undefined)return SUM_COMBINATION_CACHE[targetSum][numCells];var combos=[];function findRec(currSum,k,startD,currCombo){if(currSum===0&&k===0){combos.push([...currCombo]);return;}if(currSum<0||k===0||startD>9)return;for(let d=startD;d<=9;++d){let remK=k-1;let minRemSum=remK>0?(remK*(d+1+d+remK))/2:0;if(currSum-d<minRemSum)break;let maxRemSum=0;for(let r=0;r<remK;++r)maxRemSum+=(9-r);if(currSum-d>maxRemSum)continue;currCombo.push(d);findRec(currSum-d,remK,d+1,currCombo);currCombo.pop();}}findRec(targetSum,numCells,1,[]);var result=null;if(combos.length>0){var mask=0;combos.forEach(c=>{c.forEach(d=>{mask|=DIGIT_MASKS[d];});});result={combinations:combos,digitMask:mask};}if(!SUM_COMBINATION_CACHE[targetSum])SUM_COMBINATION_CACHE[targetSum]={};SUM_COMBINATION_CACHE[targetSum][numCells]=result;return result; };

    // --- Constraint Propagation ---
    function assignValue(candidatesMap, solverData, cellId, digitToAssign) { /* ... как в предыдущем ... */ var otherMask=candidatesMap[cellId]&~DIGIT_MASKS[digitToAssign];for(let d=1;d<=9;++d){if((otherMask&DIGIT_MASKS[d])!==0){if(!eliminateCandidate(candidatesMap,solverData,cellId,d))return false;}}if(!updateCageStateOnAssign(candidatesMap,solverData,cellId,digitToAssign))return false;return true;}
    function eliminateCandidate(candidatesMap, solverData, cellId, digitToEliminate) { /* ... как в предыдущем ... */ var mask=DIGIT_MASKS[digitToEliminate];if((candidatesMap[cellId]&mask)===0)return true;if(!CLASSIC_PEERS_MAP||!CLASSIC_UNITS_MAP||!solverData?.cellToCageMap||!solverData?.cageDataArray)return false;candidatesMap[cellId]&=~mask;var rem=candidatesMap[cellId];var numRem=countCandidates(rem);if(numRem===0)return false;if(numRem===1){var finalDigit=getSingleCandidateDigit(rem);for(const p of CLASSIC_PEERS_MAP[cellId]){if(!eliminateCandidate(candidatesMap,solverData,p,finalDigit))return false;}if(!updateCageStateOnAssign(candidatesMap,solverData,cellId,finalDigit))return false;}for(const u of CLASSIC_UNITS_MAP[cellId]){var places=[];for(const c of u){if((candidatesMap[c]&mask)!==0)places.push(c);}if(places.length===0)return false;if(places.length===1){if(!assignValue(candidatesMap,solverData,places[0],digitToEliminate))return false;}}const cIdx=solverData.cellToCageMap[cellId];if(cIdx!==undefined){const cage=solverData.cageDataArray[cIdx];let placesCage=[];for(const cc of cage.cells){if(countCandidates(candidatesMap[cc])>1&&(candidatesMap[cc]&mask)!==0)placesCage.push(cc);}if(placesCage.length===1){if(!assignValue(candidatesMap,solverData,placesCage[0],digitToEliminate))return false;}}return true;}
    function updateCageStateOnAssign(candidatesMap, solverData, assignedCellId, assignedDigit) { /* ... как в предыдущем ... */ const cIdx=solverData.cellToCageMap[assignedCellId];if(cIdx===undefined)return true;const cage=solverData.cageDataArray[cIdx];const dMask=DIGIT_MASKS[assignedDigit];if((cage.currentValueMask&dMask)!==0)return true;if((cage.currentValueMask&dMask)!==0)return false;cage.remainingSum-=assignedDigit;cage.remainingCellsCount-=1;cage.currentValueMask|=dMask;if(cage.remainingCellsCount<0||cage.remainingSum<0)return false;if(cage.remainingCellsCount>0){const cInfo=killerSudoku.getSumCombinationInfo(cage.remainingSum,cage.remainingCellsCount);if(!cInfo)return false;let allowedMask=cInfo.digitMask;let reqMask=allowedMask&~cage.currentValueMask;if(reqMask===0&&cage.remainingSum>0)return false;for(const cId of cage.cells){if(countCandidates(candidatesMap[cId])>1){const maskApply=reqMask;const origCands=candidatesMap[cId];const newCands=origCands&maskApply;if(newCands!==origCands){const elimMask=origCands&~newCands;for(let d=1;d<=9;d++){if((elimMask&DIGIT_MASKS[d])!==0){if(!eliminateCandidate(candidatesMap,solverData,cId,d))return false;}}}if(candidatesMap[cId]===0)return false;}}}else if(cage.remainingSum!==0)return false;return true;}

    // --- Solver Search Function (Point 5) ---
    function _search(candidatesMap, solverData) { /* ... как в предыдущем ... */ var solved=true;for(const sq of killerSudoku.SQUARES){if(countCandidates(candidatesMap[sq])!==1){solved=false;break;}}if(solved)return candidatesMap;var minC=10,minSq=null;for(const sq of killerSudoku.SQUARES){var numC=countCandidates(candidatesMap[sq]);if(numC>1&&numC<minC){minC=numC;minSq=sq;if(minC===2)break;}}if(!minSq)return false;var tryCands=getCandidatesArray(candidatesMap[minSq]);for(const d of tryCands){var mapCopy=deepCopy(candidatesMap);var solverCopy=deepCopy(solverData);if(assignValue(mapCopy,solverCopy,minSq,d)){var res=_search(mapCopy,solverCopy);if(res)return res;}}return false;}

    // --- Public Solver Function ---
    killerSudoku.solve = function(cages) { /* ... как в предыдущем ... */ console.log("Kill solve start...");const sData=killerSudoku._initializeSolverData(cages);if(!sData){console.error("Fail init solver data.");return false;}var initCands={};for(const sq of killerSudoku.SQUARES)initCands[sq]=ALL_CANDIDATES;console.log("Apply init cage constraints...");var initSolverCopy=deepCopy(sData);for(let i=0;i<sData.cageDataArray.length;++i){const cage=sData.cageDataArray[i];if(cage.initialDigitMask===0&&cage.sum>0){console.error(`Cage ${i} impossible.`);return false;}for(const cId of cage.cells){const orig=initCands[cId];const newC=orig&cage.initialDigitMask;if(newC!==orig){const elim=orig&~newC;for(let d=1;d<=9;d++){if((elim&DIGIT_MASKS[d])!==0){if(!eliminateCandidate(initCands,initSolverCopy,cId,d)){console.error(`Contradiction init cage ${i} mask @ ${cId} (elim ${d})`);return false;}}}}if(initCands[cId]===0){console.error(`Contradiction: ${cId} 0 cands after init cage ${i} mask.`);return false;}if(countCandidates(initCands[cId])===1){const sD=getSingleCandidateDigit(initCands[cId]);if(!updateCageStateOnAssign(initCands,initSolverCopy,cId,sD)){console.error(`Contradiction update cage ${i} after init prop ${cId}=${sD}`);return false;}}}}console.log("Init constraint prop done.");console.log("Start recursive search...");var solMap=_search(initCands,initSolverCopy);if(solMap){console.log("Solve OK.");let solStr="";for(const sq of killerSudoku.SQUARES){let d=getSingleCandidateDigit(solMap[sq]);solStr+=(d>0?d:killerSudoku.BLANK_CHAR);}if(solStr.length!==killerSudoku.NR_SQUARES||solStr.includes(killerSudoku.BLANK_CHAR)){console.error("Solver incomplete map:",solMap);return false;}return solStr;}else{console.log("Solve fail.");return false;}};


    // --- GENERATOR IMPLEMENTATION (Stage 2) ---
    function _generateClassicSolutionGrid() {
        // --- ИСПРАВЛЕНО: Добавлена инициализация candidates ---
        var candidates = {};
        for (const sq of killerSudoku.SQUARES) {
             // Проверка, что ALL_CANDIDATES определено
            if (typeof ALL_CANDIDATES === 'undefined') {
                console.error("_generateClassicSolutionGrid: ALL_CANDIDATES is not defined!");
                return false; // Не можем продолжить
            }
            candidates[sq] = ALL_CANDIDATES;
        }
        // --- Конец исправления ---

        function searchClassic(cands) { /* ... как в пред. ответе ... */ var s=true;for(const sq of killerSudoku.SQUARES){if(countCandidates(cands[sq])!==1){s=false;break;}}if(s)return cands;var mC=10,mSq=null;var shufSqs=_shuffleArray([...killerSudoku.SQUARES]);for(const sq of shufSqs){var nC=countCandidates(cands[sq]);if(nC>1&&nC<mC){mC=nC;mSq=sq;if(mC===2)break;}}if(!mSq)return false;var tryDs=_shuffleArray(getCandidatesArray(cands[mSq]));for(const d of tryDs){var cCopy=deepCopy(cands);if(_assignClassic(cCopy,mSq,d)){var r=searchClassic(cCopy);if(r)return r;}}return false;}
        function _assignClassic(cands, sq, digit) { /* ... как в пред. ответе ... */ var oDs=cands[sq]&~DIGIT_MASKS[digit];for(let d=1;d<=9;d++){if((oDs&DIGIT_MASKS[d])!==0){if(!_eliminateClassic(cands,sq,d))return false;}}return true;}
        function _eliminateClassic(cands, sq, digit) { /* ... как в пред. ответе ... */ var mask=DIGIT_MASKS[digit];if((cands[sq]&mask)===0)return true;cands[sq]&=~mask;var rem=cands[sq];var cnt=countCandidates(rem);if(cnt===0)return false;if(cnt===1){var sD=getSingleCandidateDigit(rem);for(const p of CLASSIC_PEERS_MAP[sq]){if(!_eliminateClassic(cands,p,sD))return false;}}for(const u of CLASSIC_UNITS_MAP[sq]){var places=[];for(const uSq of u){if((cands[uSq]&mask)!==0)places.push(uSq);}if(places.length===0)return false;if(places.length===1){if(!_assignClassic(cands,places[0],digit))return false;}}return true;}
        var initAssign=_shuffleArray([...killerSudoku.SQUARES]);for(let i=0;i<10;i++){let sq=initAssign[i];let pDs=getCandidatesArray(candidates[sq]);if(pDs.length>0){let d=pDs[Math.floor(Math.random()*pDs.length)];if(!_assignClassic(candidates,sq,d)){console.warn("Init assign fail, restart.");for(const sq of killerSudoku.SQUARES)candidates[sq]=ALL_CANDIDATES;break;};}}
        var solutionMap = searchClassic(candidates);
        if (!solutionMap) return false;
        var resultMap = {};
        for(const sq of killerSudoku.SQUARES) { resultMap[sq] = getSingleCandidateDigit(solutionMap[sq]); if (resultMap[sq] === 0) { console.error("Classic grid incomplete!"); return false; } }
        return resultMap;
    }
    function _partitionGridIntoCages(solvedGridMap, maxCageSize = 5, minCageSize = 2) { /* ... как в пред. ответе ... */ }
    function _calculateCageSums(cages, solvedGridMap) { /* ... как в пред. ответе ... */ }
    var GENERATION_DIFFICULTY_PARAMS = { /* ... */ };
    killerSudoku.generate = function(difficulty = "medium", maxAttempts = 10) { /* ... как в пред. ответе, но вызывает исправленный _generateClassicSolutionGrid ... */ };
    // --- (Полные реализации partition, calculateSums, generate из пред. ответа) ---
    function _partitionGridIntoCages(solvedGridMap,maxCageSize=5,minCageSize=2){var cages=[];var unassigned=new Set(killerSudoku.SQUARES);var maxAtt=killerSudoku.NR_SQUARES*3;var att=0;while(unassigned.size>0&&att<maxAtt){att++;var startC=_getRandomElementFromSet(unassigned);if(!startC)break;var cage=[startC];var digits=new Set([solvedGridMap[startC]]);unassigned.delete(startC);var remCnt=unassigned.size;var potMax=Math.min(maxCageSize,remCnt+1);if(potMax<minCageSize&&remCnt>0)potMax=minCageSize;potMax=Math.min(maxCageSize,potMax);var targetSize=Math.floor(Math.random()*(potMax-minCageSize+1))+minCageSize;targetSize=Math.min(targetSize,remCnt+1);var added=true;while(cage.length<targetSize&&added){added=false;var potN=[];cage.forEach(c=>{(SQUARE_NEIGHBORS[c]||[]).forEach(n=>{if(unassigned.has(n)&&!digits.has(solvedGridMap[n]))potN.push(n);});});if(potN.length>0){potN=_shuffleArray(potN);var nextC=potN[0];cage.push(nextC);digits.add(solvedGridMap[nextC]);unassigned.delete(nextC);added=true;}}if(cage.length>=minCageSize)cages.push({cells:cage});else{cage.forEach(c=>unassigned.add(c));}}if(unassigned.size>0){console.error(`Partition fail: ${unassigned.size} left.`);return false;}console.log(`Partition OK: ${cages.length} cages.`);return cages;}
    function _calculateCageSums(cages,solvedMap){cages.forEach(cg=>{cg.sum=0;cg.cells.forEach(cId=>{cg.sum+=solvedMap[cId];});});}
    var GENERATION_DIFFICULTY_PARAMS={"easy":{maxCage:6,minCage:2},"medium":{maxCage:5,minCage:2},"hard":{maxCage:5,minCage:2},"very-hard":{maxCage:4,minCage:2},"insane":{maxCage:4,minCage:2},"inhuman":{maxCage:4,minCage:2},"default":{maxCage:5,minCage:2}};
    killerSudoku.generate=function(difficulty="medium",maxAttempts=10){console.log(`Generate Killer(diff:${difficulty},att:${maxAttempts})`);var params=GENERATION_DIFFICULTY_PARAMS[difficulty]||GENERATION_DIFFICULTY_PARAMS.default;for(let att=1;att<=maxAttempts;++att){console.log(`Gen attempt ${att}/${maxAttempts}...`);console.log("Gen classic...");var solvedMap=_generateClassicSolutionGrid();if(!solvedMap){console.warn("Fail gen classic, retry...");continue;}console.log(`Partition grid(max:${params.maxCage},min:${params.minCage})...`);var cagesCells=_partitionGridIntoCages(solvedMap,params.maxCage,params.minCage);if(!cagesCells){console.warn("Fail partition, retry gen...");continue;}console.log("Calc sums...");_calculateCageSums(cagesCells,solvedMap);var puzzle={cages:cagesCells};console.log("Verify solvability...");var solveRes=killerSudoku.solve(deepCopy(puzzle.cages));if(solveRes&&typeof solveRes==='string'&&solveRes.length===killerSudoku.NR_SQUARES){console.log(`Gen OK after ${att} attempts!`);return puzzle;}else{console.warn(`Verify fail(Solver:${solveRes}).Retry gen...`);}}console.error(`Failed gen Killer after ${maxAttempts} attempts.`);return false;};

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
