// killerSolverLogic.js
const killerSolverLogic = (() => {
    const DEBUG_SOLVER_INTERNAL = false; 

    function getCellCoords(cellId) {
        if (!cellId || typeof cellId !== 'string' || cellId.length !== 2) return null;
        const r = "ABCDEFGHI".indexOf(cellId[0]);
        const c = "123456789".indexOf(cellId[1]);
        if (r === -1 || c === -1) return null;
        return { r, c };
    }

    function getCellId(r, c) {
        if (r < 0 || r > 8 || c < 0 || c > 8) return null;
        return "ABCDEFGHI"[r] + "123456789"[c];
    }

    function getRowIndices(r) { const i = []; for (let c = 0; c < 9; c++) i.push([r, c]); return i; }
    function getColIndices(c) { const i = []; for (let r = 0; r < 9; r++) i.push([r, c]); return i; }
    function getBlockIndices(bI) { const sr = Math.floor(bI / 3) * 3, sc = (bI % 3) * 3, i = [];
        for (let ro = 0; ro < 3; ro++) for (let co = 0; co < 3; co++) i.push([sr + ro, sc + co]); return i; }
    function getAllUnitsIndices() { const aU = []; for (let i = 0; i < 9; i++) { aU.push(getRowIndices(i)); aU.push(getColIndices(i)); aU.push(getBlockIndices(i)); } return aU; }
    function getUnitType(gUI) { if (gUI < 9) return 'Строка'; if (gUI < 18) return 'Колонка'; return 'Блок'; }
    function getUnitIndexForDisplay(gUI) { return (gUI % 9) + 1; }

    let classicPeersMapCache = null;
    function getClassicPeers(r_coord, c_coord) {
        const cellId = getCellId(r_coord, c_coord); if (!cellId) return new Set();
        if (classicPeersMapCache === null) {
            if (DEBUG_SOLVER_INTERNAL) console.log("Initializing KSL peers cache...");
            classicPeersMapCache = {};
            for (let r_cache = 0; r_cache < 9; r_cache++) { for (let c_cache = 0; c_cache < 9; c_cache++) {
                const id_c = getCellId(r_cache, c_cache); if (id_c) { const p = new Set();
                    for (let ci = 0; ci < 9; ci++) { if (ci !== c_cache) { const pid = getCellId(r_cache, ci); if (pid) p.add(pid); } }
                    for (let ri = 0; ri < 9; ri++) { if (ri !== r_cache) { const pid = getCellId(ri, c_cache); if (pid) p.add(pid); } }
                    const sr = Math.floor(r_cache/3)*3, sc = Math.floor(c_cache/3)*3;
                    for(let i=0;i<3;i++) for(let j=0;j<3;j++){ const pr=sr+i, pc=sc+j; if(pr!==r_cache||pc!==c_cache){const pid=getCellId(pr,pc);if(pid)p.add(pid);}}
                    classicPeersMapCache[id_c] = p; } } }
        } return classicPeersMapCache[cellId] || new Set();
    }
    function resetPeersCache() { classicPeersMapCache = null; }

    function calculateKillerCandidates(r, c, userGrid, solverData) {
        const cellId = getCellId(r,c); if(!cellId || !userGrid[r]?.[c] || userGrid[r][c].value !== 0) return new Set();
        let candidates = new Set([1,2,3,4,5,6,7,8,9]);
        const peers = getClassicPeers(r,c);
        for(const pId of peers){ const crds=getCellCoords(pId); if(crds && userGrid[crds.r]?.[crds.c]?.value !== 0) candidates.delete(userGrid[crds.r][crds.c].value); }
        if(solverData?.cellToCageMap && solverData?.cageDataArray){
            const cageId = solverData.cellToCageMap[cellId]; const cage = solverData.cageDataArray.find(cd => cd.id === cageId);
            if(cage){ for(const cCId of cage.cells){ if(cCId !== cellId){ const crds = getCellCoords(cCId);
                const pVal = crds && userGrid[crds.r]?.[crds.c]?.value; if(pVal && pVal !== 0) candidates.delete(pVal); } } }
        } return candidates;
    }
    function calculateAllKillerCandidates(userGrid, solverData) {
        const newMap = {}; if (!userGrid) return newMap;
        for(let r=0;r<9;r++) for(let c=0;c<9;c++){ const cId=getCellId(r,c); if(!cId) continue;
            if(userGrid[r]?.[c]?.value === 0) newMap[cId] = calculateKillerCandidates(r,c,userGrid,solverData);
            else newMap[cId] = new Set();
        } return newMap;
    }

    function findNakedSingle(userGrid, candidatesMap, solverData, logCallback) {
        logCallback("Поиск Явного Единственного (Naked Single)...");
        for (let r=0;r<9;r++) for (let c=0;c<9;c++) { const cellId = getCellId(r,c);
            if (userGrid[r]?.[c]?.value === 0 && candidatesMap[cellId]?.size === 1) {
                const digit = candidatesMap[cellId].values().next().value;
                const description = `Найден Явный Единственный: цифра <b>${digit}</b> в ячейке <b>${cellId}</b>.`;
                logCallback(description);
                return { r, c, cellId, digit, technique: "Naked Single", description }; } }
        logCallback("Явных Единственных не найдено."); return null;
    }

    function findHiddenSingle(userGrid, candidatesMap, solverData, logCallback) {
        logCallback("Поиск Скрытого Единственного (Hidden Single)...");
        const allUnits = getAllUnitsIndices();
        for (let i=0;i<allUnits.length;i++) { const unitIndices = allUnits[i];
            for (let d=1;d<=9;d++) { let places = []; let present = false;
                for (const [r,c] of unitIndices) { if(userGrid[r]?.[c]?.value === d){present=true;break;}
                    if(userGrid[r]?.[c]?.value===0){const cId=getCellId(r,c); if(candidatesMap[cId]?.has(d))places.push({r,c,cellId:cId});}}
                if (!present && places.length === 1) { const {r,c,cellId}=places[0]; const unitName=`${getUnitType(i)} ${getUnitIndexForDisplay(i)}`;
                    const desc = `Найден Скрытый Единственный: цифра <b>${d}</b> в <b>${cellId}</b> (единственное место в ${unitName}).`;
                    logCallback(desc); return {r,c,cellId,digit:d,technique:"Hidden Single",description:desc,unitName};}}}
        logCallback("Скрытых Единственных не найдено."); return null;
    }

    function findNakedPair(userGrid, candidatesMap, solverData, logCallback) {
        logCallback("Поиск Явной Пары (Naked Pair)...");
        const units = getAllUnitsIndices();
        for (let i=0; i<units.length; i++) { const unitCoords = units[i]; const cellsW2C = [];
            for (const [r,c] of unitCoords) { const cId=getCellId(r,c); if (userGrid[r]?.[c]?.value===0 && candidatesMap[cId]?.size===2) cellsW2C.push({r,c,cands:candidatesMap[cId],cellId:cId});}
            if (cellsW2C.length >= 2) { for (let j=0; j<cellsW2C.length; j++) { for (let k=j+1; k<cellsW2C.length; k++) {
                const c1=cellsW2C[j], c2=cellsW2C[k];
                if (c1.cands.size===2 && Array.from(c1.cands).every(d=>c2.cands.has(d)) && Array.from(c2.cands).every(d=>c1.cands.has(d))) {
                    const pD=Array.from(c1.cands), pC=[c1.cellId,c2.cellId], elims=[], pS=new Set(pC);
                    for(const [r_u,c_u] of unitCoords){ const uCId=getCellId(r_u,c_u);
                        if(uCId && !pS.has(uCId) && userGrid[r_u]?.[c_u]?.value===0){ const oC=candidatesMap[uCId];
                            if(oC){ if(pD[0] !== pD[1]) {
                                if(oC.has(pD[0]))elims.push({cellId:uCId,digit:pD[0]}); if(oC.has(pD[1]))elims.push({cellId:uCId,digit:pD[1]});}
                            }}}
                    if(elims.length>0){ const uN=`${getUnitType(i)} ${getUnitIndexForDisplay(i)}`; const desc = `Явная Пара: цифры <b>${pD.join(',')}</b> в ячейках <b>${pC.join(',')}</b> в ${uN}. Можно исключить из других ячеек этого юнита.`;
                        logCallback(desc); return {unitType:getUnitType(i),unitIndex:i,cells:pC,digits:pD,technique:"Naked Pair", eliminations:elims, description:desc}; } } } } } }
        logCallback("Явных Пар не найдено."); return null;
    }

    function findHiddenPair(userGrid, candidatesMap, solverData, logCallback) {
        logCallback("Поиск Скрытой Пары (Hidden Pair)...");
        const units = getAllUnitsIndices();
        for (let i = 0; i < units.length; i++) {
            const unit = units[i]; const digitLocations = {}; for(let d=1;d<=9;d++)digitLocations[d]=new Set();
            for (const [r,c] of unit) { const cellId = getCellId(r,c);
                if (userGrid[r]?.[c]?.value === 0 && candidatesMap[cellId]) { candidatesMap[cellId].forEach(digit => digitLocations[digit].add(cellId)); } }
            const digitsIn2Cells = [];
            for(let d=1;d<=9;d++){if(digitLocations[d].size===2){ let isPlaced=false; for(const [r_u,c_u] of unit){if(userGrid[r_u][c_u].value===d){isPlaced=true;break;}} if(!isPlaced)digitsIn2Cells.push({digit:d,locations:digitLocations[d]});}}
            if(digitsIn2Cells.length>=2){
                for(let j=0;j<digitsIn2Cells.length;j++){ for(let k=j+1;k<digitsIn2Cells.length;k++){
                    const d1Info=digitsIn2Cells[j], d2Info=digitsIn2Cells[k];
                    if(d1Info.locations.size===2 && Array.from(d1Info.locations).every(loc=>d2Info.locations.has(loc)) && Array.from(d2Info.locations).every(loc=>d1Info.locations.has(loc))){
                        const pD=[d1Info.digit,d2Info.digit].sort((a,b)=>a-b), pC=Array.from(d1Info.locations), elims=[];
                        for(const cId of pC){const cCands=candidatesMap[cId];if(cCands){cCands.forEach(cand=>{if(!pD.includes(cand))elims.push({cellId:cId,digit:cand});});}}
                        if(elims.length>0){const uN=`${getUnitType(i)} ${getUnitIndexForDisplay(i)}`;const desc=`Скрытая Пара: цифры <b>${pD.join(',')}</b> в ячейках <b>${pC.join(',')}</b> в ${uN}. Исключаем лишних кандидатов из этих ячеек.`;
                            logCallback(desc);return{unitType:getUnitType(i),unitIndex:i,cells:pC,digits:pD,technique:"Hidden Pair",eliminations:elims,description:desc};}}}}}
        } logCallback("Скрытых Пар не найдено."); return null;
    }

    function findNakedTriple(userGrid, candidatesMap, solverData, logCallback) {
        logCallback("Поиск Явной Тройки (Naked Triple)...");
        const units = getAllUnitsIndices();
        for (let i=0; i<units.length; i++) { const unitIndices = units[i]; const candidateCells = [];
            for (const [r,c] of unitIndices) { const cellId=getCellId(r,c); if(userGrid[r]?.[c]?.value===0 && candidatesMap[cellId]){ const cands=candidatesMap[cellId]; if(cands&&(cands.size>=2&&cands.size<=3))candidateCells.push({r,c,cands,cellId});}}
            if(candidateCells.length>=3){ for(let j=0;j<candidateCells.length;j++){ for(let k=j+1;k<candidateCells.length;k++){ for(let l=k+1;l<candidateCells.length;l++){
                const c1=candidateCells[j],c2=candidateCells[k],c3=candidateCells[l];
                const tripleCells=[c1.cellId,c2.cellId,c3.cellId]; const combinedCands=new Set([...c1.cands,...c2.cands,...c3.cands]);
                if(combinedCands.size===3){const tripleDigits=Array.from(combinedCands).sort((a,b)=>a-b),elims=[],tS=new Set(tripleCells);
                    for(const[r_u,c_u] of unitIndices){const cId_u=getCellId(r_u,c_u);
                        if(cId_u&&!tS.has(cId_u)&&userGrid[r_u]?.[c_u]?.value===0){const notes=candidatesMap[cId_u];
                            if(notes)notes.forEach(cand=>{if(tripleDigits.includes(cand))elims.push({cellId:cId_u,digit:cand});});}}
                    if(elims.length>0){const uN=`${getUnitType(i)} ${getUnitIndexForDisplay(i)}`;const desc=`Явная Тройка: цифры <b>${tripleDigits.join(',')}</b> в ячейках <b>${tripleCells.join(',')}</b> в ${uN}. Исключаем их из других ячеек юнита.`;
                        logCallback(desc);return{unitType:getUnitType(i),unitIndex:i,cells:tripleCells,digits:tripleDigits,technique:"Naked Triple",eliminations:elims,description:desc};}}}}}}
        logCallback("Явных Троек не найдено."); return null;
    }

    function findHiddenTriple(userGrid, candidatesMap, solverData, logCallback) {
        logCallback("Поиск Скрытой Тройки (Hidden Triple)...");
        const units = getAllUnitsIndices();
        for (let i=0;i<units.length;i++) { const unit = units[i]; const digitLocations={}; for(let d=1;d<=9;d++)digitLocations[d]=new Set();
            let placedInUnit=new Set(); for(const[r_u,c_u] of unit){if(userGrid[r_u][c_u].value!==0)placedInUnit.add(userGrid[r_u][c_u].value);}
            for(const[r,c] of unit){const cellId=getCellId(r,c);if(userGrid[r]?.[c]?.value===0&&candidatesMap[cellId]){candidatesMap[cellId].forEach(digit=>{if(!placedInUnit.has(digit))digitLocations[digit].add(cellId);});}}
            const potTripDigits=Object.keys(digitLocations).map(d=>parseInt(d)).filter(d=>digitLocations[d].size>=2&&digitLocations[d].size<=3);
            if(potTripDigits.length>=3){ for(let j=0;j<potTripDigits.length;j++){ for(let k=j+1;k<potTripDigits.length;k++){ for(let l=k+1;l<potTripDigits.length;l++){
                const d1=potTripDigits[j],d2=potTripDigits[k],d3=potTripDigits[l];const tripleDigits=[d1,d2,d3].sort((a,b)=>a-b);
                const combinedCells=new Set([...digitLocations[d1],...digitLocations[d2],...digitLocations[d3]]);
                if(combinedCells.size===3){const tripleCells=Array.from(combinedCells),elims=[];
                    for(const cellId of tripleCells){const cellCands=candidatesMap[cellId];if(cellCands)cellCands.forEach(cand=>{if(!tripleDigits.includes(cand))elims.push({cellId,digit:cand});});}
                    if(elims.length>0){const uN=`${getUnitType(i)} ${getUnitIndexForDisplay(i)}`;const desc=`Скрытая Тройка: цифры <b>${tripleDigits.join(',')}</b> в ячейках <b>${tripleCells.join(',')}</b> в ${uN}. Исключаем лишних кандидатов.`;
                        logCallback(desc);return{unitType:getUnitType(i),unitIndex:i,cells:tripleCells,digits:tripleDigits,technique:"Hidden Triple",eliminations:elims,description:desc};}}}}}}
        logCallback("Скрытых Троек не найдено."); return null;
    }

    function findInnieStep(userGrid, candidatesMap, solverData, logCallback) {
        logCallback("Поиск Innie...");
        if (!userGrid || !solverData?.cellToCageMap || !solverData?.cageDataArray) {logCallback("Данные для Innie отсутствуют.",true); return null;}
        const allUnits = getAllUnitsIndices();
        for (let unitIdx=0; unitIdx<allUnits.length; unitIdx++) { const unitCoords = allUnits[unitIdx]; const unitCellIdsSet = new Set(unitCoords.map(([r,c])=>getCellId(r,c)).filter(id=>id));
            for(let d=1;d<=9;d++){ let possLocsInUnit=[], involvedCageIds=new Set(), digitPlaced=false;
                for(const[r_uc,c_uc] of unitCoords){if(userGrid[r_uc][c_uc].value===d){digitPlaced=true;break;}} if(digitPlaced)continue;
                for(const[r_uc,c_uc] of unitCoords){const cellId=getCellId(r_uc,c_uc);
                    if(userGrid[r_uc][c_uc].value===0&&candidatesMap[cellId]?.has(d)){possLocsInUnit.push(cellId);const cageId=solverData.cellToCageMap[cellId];if(cageId!==undefined)involvedCageIds.add(cageId);else involvedCageIds.add(null);}}
                if(possLocsInUnit.length>0&&involvedCageIds.size===1){const targetCageId=involvedCageIds.values().next().value;if(targetCageId===null)continue;
                    const targetCage=solverData.cageDataArray.find(c=>c.id===targetCageId);if(!targetCage)continue;
                    const elims=[];
                    for(const cageCellId of targetCage.cells){if(!unitCellIdsSet.has(cageCellId)){const crds=getCellCoords(cageCellId);
                        if(crds&&userGrid[crds.r][crds.c].value===0&&candidatesMap[cageCellId]?.has(d))elims.push({cellId:cageCellId,digit:d});}}
                    if(elims.length>0){ const uN=`${getUnitType(unitIdx)} ${getUnitIndexForDisplay(unitIdx)}`; const desc=`Innie: цифра <b>${d}</b> в ${uN} ограничена клеткой <b>${targetCage.id}</b>. Исключаем <b>${d}</b> из ячеек ${elims.map(e=>e.cellId).join(',')}.`;
                        logCallback(desc);return{technique:"Innie",digit:d,unitType:getUnitType(unitIdx),unitDisplayIndex:getUnitIndexForDisplay(unitIdx),cageId:targetCage.id,eliminations:elims,description:desc};}}}}
        logCallback("Innie не найдены."); return null;
    }

    function findOutieStep(userGrid, candidatesMap, solverData, logCallback) {
        logCallback("Поиск Outie...");
        if (!userGrid || !solverData?.cageDataArray) {logCallback("Данные для Outie отсутствуют.",true); return null;}
        for (const cage of solverData.cageDataArray) { if (!cage.cells || cage.cells.length < 2) continue;
            for(let d=1;d<=9;d++){ const possLocsInCage=[];let digitPlaced=false;
                for(const cellId of cage.cells){const crds=getCellCoords(cellId);if(!crds)continue;if(userGrid[crds.r][crds.c].value===d){digitPlaced=true;break;}
                    if(userGrid[crds.r][crds.c].value===0&&candidatesMap[cellId]?.has(d))possLocsInCage.push({id:cellId,r:crds.r,c:crds.c});}
                if(digitPlaced||possLocsInCage.length<1)continue; const cageCellIdsSet=new Set(cage.cells);
                let confinedToRow=true,targetRowIdx=possLocsInCage[0].r; for(let i=1;i<possLocsInCage.length;i++){if(possLocsInCage[i].r!==targetRowIdx){confinedToRow=false;break;}}
                if(confinedToRow){const elims=[],rowUnitCoords=getRowIndices(targetRowIdx);
                    for(const[r,c] of rowUnitCoords){const uCId=getCellId(r,c);if(uCId&&!cageCellIdsSet.has(uCId)&&userGrid[r][c].value===0&&candidatesMap[uCId]?.has(d))elims.push({cellId:uCId,digit:d});}
                    if(elims.length>0){const desc=`Outie (Строка): цифра <b>${d}</b> в клетке <b>${cage.id}</b> ограничена строкой ${targetRowIdx+1}. Исключаем из ${elims.map(e=>e.cellId).join(',')}.`;
                        logCallback(desc);return{technique:"Outie (Row)",digit:d,cageId:cage.id,unitType:'Row',unitIndex:targetRowIdx,eliminations:elims,description:desc};}}
                let confinedToCol=true,targetColIdx=possLocsInCage[0].c; for(let i=1;i<possLocsInCage.length;i++){if(possLocsInCage[i].c!==targetColIdx){confinedToCol=false;break;}}
                if(confinedToCol){const elims=[],colUnitCoords=getColIndices(targetColIdx);
                    for(const[r,c] of colUnitCoords){const uCId=getCellId(r,c);if(uCId&&!cageCellIdsSet.has(uCId)&&userGrid[r][c].value===0&&candidatesMap[uCId]?.has(d))elims.push({cellId:uCId,digit:d});}
                    if(elims.length>0){const desc=`Outie (Колонка): цифра <b>${d}</b> в клетке <b>${cage.id}</b> ограничена колонкой ${targetColIdx+1}. Исключаем из ${elims.map(e=>e.cellId).join(',')}.`;
                        logCallback(desc);return{technique:"Outie (Col)",digit:d,cageId:cage.id,unitType:'Col',unitIndex:targetColIdx,eliminations:elims,description:desc};}}
                let confinedToBlock=true,targetBlockIdx=Math.floor(possLocsInCage[0].r/3)*3+Math.floor(possLocsInCage[0].c/3);
                for(let i=1;i<possLocsInCage.length;i++){const curBlock=Math.floor(possLocsInCage[i].r/3)*3+Math.floor(possLocsInCage[i].c/3);if(curBlock!==targetBlockIdx){confinedToBlock=false;break;}}
                if(confinedToBlock){const elims=[],blockUnitCoords=getBlockIndices(targetBlockIdx);
                    for(const[r,c] of blockUnitCoords){const uCId=getCellId(r,c);if(uCId&&!cageCellIdsSet.has(uCId)&&userGrid[r][c].value===0&&candidatesMap[uCId]?.has(d))elims.push({cellId:uCId,digit:d});}
                    if(elims.length>0){const desc=`Outie (Блок): цифра <b>${d}</b> в клетке <b>${cage.id}</b> ограничена блоком ${targetBlockIdx+1}. Исключаем из ${elims.map(e=>e.cellId).join(',')}.`;
                        logCallback(desc);return{technique:"Outie (Block)",digit:d,cageId:cage.id,unitType:'Block',unitIndex:targetBlockIdx,eliminations:elims,description:desc};}}}
        } logCallback("Outie не найдены."); return null;
    }

    function findSumCombinationsRecursive(emptyCells, cellIndex, targetSum, currentCombo, placedDigitsInCageSoFar, results) {
        if (cellIndex === emptyCells.length) { if (targetSum === 0) results.push([...currentCombo]); return; }
        const currentCell = emptyCells[cellIndex]; const candidatesForCurrentCell = Array.from(currentCell.cands);
        for (const digit of candidatesForCurrentCell) {
            if (!currentCombo.includes(digit) && !placedDigitsInCageSoFar.has(digit)) {
                if (targetSum - digit >= 0) {
                    if (emptyCells.length-(cellIndex+1)===0){if(targetSum-digit!==0)continue;}
                    else{const remCellsCnt=emptyCells.length-(cellIndex+1);const tempPlacedAndCombo=new Set([...currentCombo,digit,...placedDigitsInCageSoFar]);
                        let minSumNext=0,tempDigits=[]; for(let x=1;x<=9&&tempDigits.length<remCellsCnt;++x)if(!tempPlacedAndCombo.has(x))tempDigits.push(x);
                        if(tempDigits.length<remCellsCnt&&remCellsCnt>0)continue; for(let i=0;i<remCellsCnt;++i)minSumNext+=tempDigits[i];
                        if(targetSum-digit<minSumNext&&remCellsCnt>0)continue;}
                    currentCombo.push(digit);
                    findSumCombinationsRecursive(emptyCells,cellIndex+1,targetSum-digit,currentCombo,placedDigitsInCageSoFar,results);
                    currentCombo.pop(); } } }
    }

    function findCageCombinationCheck(userGrid, candidatesMap, solverData, logCallback) {
        logCallback("Проверка комбинаций в клетках (Cage Combination Check)...");
        if (!userGrid || !solverData?.cageDataArray) { logCallback("Данные для проверки комбинаций отсутствуют.", true); return null; }
        const allElimsFound = [];
        for (const cage of solverData.cageDataArray) {
            if (!cage || !cage.cells || cage.cells.length === 0) continue;
            let currentSumPlaced=0, emptyCellsData=[], digitsPlaced=new Set(), cageValid=true;
            for (const cellId of cage.cells) { const crds=getCellCoords(cellId); if(!crds||!userGrid[crds.r]?.[crds.c]){cageValid=false;break;}
                const cellD=userGrid[crds.r][crds.c], cellV=cellD.value;
                if(cellV!==0){if(digitsPlaced.has(cellV)){cageValid=false;break;}digitsPlaced.add(cellV);currentSumPlaced+=cellV;}
                else{const cands=candidatesMap[cellId];if(!cands||cands.size===0){cageValid=false;break;}emptyCellsData.push({id:cellId,cands:new Set(cands)});}}
            if(!cageValid)continue; const targetRemSum=cage.sum-currentSumPlaced,cntEmpty=emptyCellsData.length;
            if(cntEmpty===0){if(targetRemSum!==0) logCallback(`<i>Клетка ${cage.id||'(без ID)'} заполнена, но сумма ${currentSumPlaced} != ${cage.sum} (ожидалось ${targetRemSum}=0)</i>`, true); continue;}
            if(targetRemSum<=0&&cntEmpty>0){logCallback(`<i>Клетка ${cage.id||'(без ID)'}: остаток суммы ${targetRemSum} не положителен для ${cntEmpty} пустых ячеек.</i>`,true);continue;}
            const validCombos=[]; findSumCombinationsRecursive(emptyCellsData,0,targetRemSum,[],digitsPlaced,validCombos);
            if(validCombos.length===0&&cntEmpty>0){logCallback(`<i>Клетка ${cage.id||'(без ID)'}: нет валидных комбинаций для суммы ${targetRemSum} в ${cntEmpty} ячейках. Кандидаты: ${emptyCellsData.map(ecd => `${ecd.id}:[${Array.from(ecd.cands).join('')}]`).join('; ')}</i>`,true);continue;}
            const candsUsed=new Map(); emptyCellsData.forEach(cell=>candsUsed.set(cell.id,new Set()));
            validCombos.forEach(combo=>combo.forEach((digit,idx)=>{const cId=emptyCellsData[idx].id;candsUsed.get(cId)?.add(digit);}));
            emptyCellsData.forEach(cellD=>{const origCands=candidatesMap[cellD.id],usedCands=candsUsed.get(cellD.id);
                if(origCands&&usedCands)origCands.forEach(cand=>{if(!usedCands.has(cand))allElimsFound.push({cellId:cellD.id,digit:cand});});});
        }
        if (allElimsFound.length > 0) {
            const uEMap=new Map();allElimsFound.forEach(e=>{const k=`${e.cellId}-${e.digit}`;if(!uEMap.has(k))uEMap.set(k,e);});
            const uE=Array.from(uEMap.values());
            const desc = `Проверка комбинаций: найдено <b>${uE.length}</b> возможных исключений. Пример: исключить <b>${uE[0].digit}</b> из <b>${uE[0].cellId}</b>.`;
            logCallback(desc); return {technique:"Cage Combination Check",eliminations:uE,description:desc};
        } logCallback("Проверка комбинаций: новых исключений не найдено."); return null;
    }

    function applyFoundSingle(foundInfo, userGrid, currentCandidatesMap, renderCellCallback, logCallback) {
        const { r, c, cellId, digit, description } = foundInfo;
        if (userGrid[r][c].value === 0) {
            userGrid[r][c].value = digit; userGrid[r][c].isSolved = true; userGrid[r][c].notes.clear(); currentCandidatesMap[cellId] = new Set();
            renderCellCallback(r, c, digit, new Set());
            logCallback(`<b>Применено:</b> ${description || foundInfo.technique}. Установлена цифра <b>${digit}</b> в <b>${cellId}</b>.`);
            return true;
        }
        logCallback(`<i>Не удалось применить ${foundInfo.technique} в ${cellId}, ячейка уже заполнена.</i>`, true);
        return false;
    }
    function applyElimination(foundInfo, userGrid, currentCandidatesMap, renderCellCallback, logCallback) {
        let appliedAny = false; const elims = foundInfo.eliminations; if (!elims || elims.length === 0) return false;
        logCallback(`<b>Применение исключений</b> для "${foundInfo.technique || 'Неизвестная техника'}" (Найдено ${elims.length} кандидатов на исключение):`);
        let actualElimsMade = 0; let details = "";
        for (const elim of elims) { const {cellId,digit}=elim; const crds=getCellCoords(cellId);
            if (crds && userGrid[crds.r][crds.c].value===0 && currentCandidatesMap[cellId]?.has(digit)) {
                currentCandidatesMap[cellId].delete(digit); appliedAny=true; actualElimsMade++;
                details += `<li>Исключена <b>${digit}</b> из <b>${cellId}</b> (осталось: ${Array.from(currentCandidatesMap[cellId]).join(',')||'<i>пусто</i>'})</li>`;
                renderCellCallback(crds.r,crds.c,null,currentCandidatesMap[cellId]); } }
        if (actualElimsMade > 0) logCallback(`Удалено <b>${actualElimsMade}</b> кандидатов: <ul>${details}</ul>`);
        else logCallback(`<i>Не было применено новых исключений для "${foundInfo.technique || 'Неизвестная техника'}".</i>`);
        return appliedAny;
    }
    function applyNakedGroupElimination(fI,uG,cCM,rCC,lC){return applyElimination(fI,uG,cCM,rCC,lC);}
    function applyHiddenGroupElimination(fI,uG,cCM,rCC,lC){return applyElimination(fI,uG,cCM,rCC,lC);}

    function doKillerLogicStep(userGrid, currentCandidatesMap, solverData, updateCandidatesCallback, renderCellCallback, logCallback) {
        logCallback("--- <b>Новый шаг решателя</b> ---");
        if (solverData?.cageDataArray) {
            logCallback("Поиск правила одной клетки (Single Cage Rule)..."); let sCRApplied = false;
            for (const cage of solverData.cageDataArray) { if (cage.cells.length === 1) {
                const cId = cage.cells[0], crds = getCellCoords(cId);
                if (crds && userGrid[crds.r][crds.c].value === 0) { const expD = cage.sum;
                    if (expD >= 1 && expD <= 9 && (currentCandidatesMap[cId]?.has(expD) || currentCandidatesMap[cId] === undefined )) { // Позволяем, если кандидаты еще не посчитаны
                        const desc = `Правило одной клетки: сумма ${cage.sum} для клетки ${cage.id||'(без ID)'} (ячейка ${cId}) означает цифру <b>${expD}</b>.`;
                        logCallback(desc); let fnd={r:crds.r,c:crds.c,cellId:cId,digit:expD,technique:"Single Cage Rule",description:desc};
                        if(applyFoundSingle(fnd,userGrid,currentCandidatesMap,renderCellCallback,logCallback)){
                            updateCandidatesCallback(); return {...fnd, applied:true, appliedTechnique:"Single Cage Rule"}; }
                        sCRApplied = true; } } } } // Закрытие if (expD...) и if (crds...)
            if(!sCRApplied) logCallback("Правило одной клетки не найдено/не применимо.");
        } // Закрытие for (const cage...)
    } // Закрытие if (solverData...)

        const techniques = [
            { name: "Naked Single", findFunc: findNakedSingle, applyFunc: applyFoundSingle },
            { name: "Hidden Single", findFunc: findHiddenSingle, applyFunc: applyFoundSingle },
            { name: "Cage Combination Check", findFunc: findCageCombinationCheck, applyFunc: applyElimination },
            { name: "Naked Pair", findFunc: findNakedPair, applyFunc: applyNakedGroupElimination },
            { name: "Hidden Pair", findFunc: findHiddenPair, applyFunc: applyHiddenGroupElimination },
            { name: "Innie", findFunc: findInnieStep, applyFunc: applyElimination },
            { name: "Outie", findFunc: findOutieStep, applyFunc: applyElimination },
            { name: "Naked Triple", findFunc: findNakedTriple, applyFunc: applyNakedGroupElimination },
            { name: "Hidden Triple", findFunc: findHiddenTriple, applyFunc: applyHiddenGroupElimination },
        ];

        for (const tech of techniques) {
            let foundInfo = tech.findFunc(userGrid, currentCandidatesMap, solverData, logCallback);
            if (foundInfo) {
                if (tech.applyFunc(foundInfo, userGrid, currentCandidatesMap, renderCellCallback, logCallback)) {
                    updateCandidatesCallback(); return { ...foundInfo, applied: true, appliedTechnique: tech.name }; } }
        }
        logCallback("<b>Не найдено техник для применения на этом шаге.</b>", false);
        return { applied: false };
    } // Закрытие doKillerLogicStep

    return {
        calculateKillerCandidates,
        calculateAllKillerCandidates,
        doKillerLogicStep,
        resetPeersCache,
        getCellCoords, 
        getCellId,
    };

})(); // Закрытие IIFE
