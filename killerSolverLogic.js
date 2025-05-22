// killerSolverLogic.js

/**
 * Логика для интерактивного пошагового решателя Killer Sudoku.
 * Работает с представлением данных из script.js (userGrid, currentCandidatesMap).
 * Учитывает правила Killer Sudoku при вычислении кандидатов.
 */
const killerSolverLogic = (() => {

    // --- Вспомогательные функции (локальны для этого модуля) ---
    function getCellCoords(cellId){
        if(!cellId || cellId.length !== 2) return null;
        const r = "ABCDEFGHI".indexOf(cellId[0]);
        const c = "123456789".indexOf(cellId[1]);
        if(r === -1 || c === -1) return null;
        return {r, c};
    }

    function getCellId(r, c){
        if(r < 0 || r > 8 || c < 0 || c > 8) return null;
        return "ABCDEFGHI"[r] + "123456789"[c];
    }

    function getRowIndices(r){
        const i = [];
        for(let c = 0; c < 9; c++) i.push([r, c]);
        return i;
    }

    function getColIndices(c){
        const i = [];
        for(let r = 0; r < 9; r++) i.push([r, c]);
        return i;
    }

    function getBlockIndices(b){
        const sr = Math.floor(b / 3) * 3;
        const sc = (b % 3) * 3;
        const i = [];
        for(let r = 0; r < 3; r++) {
            for(let c = 0; c < 3; c++) {
                i.push([sr + r, sc + c]);
            }
        }
        return i;
    }

    function getAllUnitsIndices() {
        const allUnits = [];
        for (let i = 0; i < 9; i++) {
            allUnits.push(getRowIndices(i));
            allUnits.push(getColIndices(i));
            allUnits.push(getBlockIndices(i));
        }
        return allUnits;
    }

    function getUnitType(globalUnitIndex) {
        if (globalUnitIndex < 9) return 'Row';
        if (globalUnitIndex < 18) return 'Col';
        return 'Block';
    }

    function getUnitIndexForDisplay(globalUnitIndex) {
        return (globalUnitIndex % 9) + 1;
    }

    function getUnitIndices(globalUnitIndex) {
        if (globalUnitIndex < 0 || globalUnitIndex > 26) return null;
        const type = getUnitType(globalUnitIndex);
        const index = globalUnitIndex % 9;
        if (type === 'Row') return getRowIndices(index);
        if (type === 'Col') return getColIndices(index);
        if (type === 'Block') return getBlockIndices(index);
        return null;
    }

    let classicPeersMapCache = null;

    function getClassicPeers(r, c) {
        const cellId = getCellId(r, c);
        if (!cellId) return new Set();
        if (classicPeersMapCache === null) {
            console.log("Initializing killerSolverLogic peers cache...");
            classicPeersMapCache = {};
            for (let r_cache = 0; r_cache < 9; r_cache++) {
                for (let c_cache = 0; c_cache < 9; c_cache++) {
                    const id_cache = getCellId(r_cache, c_cache);
                    if (id_cache) {
                        const peers = new Set();
                        // Row peers
                        for (let ci = 0; ci < 9; ci++) {
                            if (ci !== c_cache) {
                                const pid = getCellId(r_cache, ci);
                                if(pid) peers.add(pid);
                            }
                        }
                        // Col peers
                        for (let ri = 0; ri < 9; ri++) {
                            if (ri !== r_cache) {
                                const pid = getCellId(ri, c_cache);
                                if(pid) peers.add(pid);
                            }
                        }
                        // Block peers
                        const startRow = Math.floor(r_cache / 3) * 3;
                        const startCol = Math.floor(c_cache / 3) * 3;
                        for (let i = 0; i < 3; i++) {
                            for (let j = 0; j < 3; j++) {
                                const peerR = startRow + i;
                                const peerC = startCol + j;
                                if (peerR !== r_cache || peerC !== c_cache) {
                                    const pid = getCellId(peerR, peerC);
                                    if(pid) peers.add(pid);
                                }
                            }
                        }
                        classicPeersMapCache[id_cache] = peers;
                    }
                }
            }
            console.log("killerSolverLogic peers cache initialized.");
        }
        return classicPeersMapCache[cellId] || new Set();
    }

    function resetPeersCache() {
        classicPeersMapCache = null;
    }

    /**
     * Вычисляет кандидатов для ОДНОЙ ячейки Killer Sudoku.
     * @param {number} r - Индекс строки (0-8).
     * @param {number} c - Индекс столбца (0-8).
     * @param {Array<Array<Object>>} userGrid - Текущее состояние игрового поля.
     * @param {Object} solverData - Данные о клетках Killer Sudoku.
     * @returns {Set<number>} Набор возможных кандидатов для ячейки.
     */
    function calculateKillerCandidates(r, c, userGrid, solverData) {
        const cellId = getCellId(r, c);
        if (!cellId || !userGrid || !userGrid[r]?.[c] || userGrid[r][c].value !== 0) {
            return new Set(); // Ячейка уже заполнена или не существует
        }

        let candidates = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);

        // 1. Классические исключения (пиры)
        const peers = getClassicPeers(r, c);
        for (const peerId of peers) {
            const coords = getCellCoords(peerId);
            if (coords && userGrid[coords.r]?.[coords.c]?.value !== 0) {
                candidates.delete(userGrid[coords.r][coords.c].value);
            }
        }

        // 2. Исключения Killer Sudoku (клетка) - Базовая проверка по размещенным цифрам в этой же клетке
        if (solverData && solverData.cellToCageMap && solverData.cageDataArray) {
            const cageIndex = solverData.cellToCageMap[cellId];
            if (cageIndex !== undefined) {
                const cage = solverData.cageDataArray[cageIndex];
                if (cage) {
                    for (const cageCellId of cage.cells) {
                        if (cageCellId !== cellId) { // Исключаем саму себя
                            const coords = getCellCoords(cageCellId);
                            const placedValue = coords && userGrid[coords.r]?.[coords.c]?.value;
                            if (placedValue && placedValue !== 0) {
                                candidates.delete(placedValue); // Удаляем уже стоящие цифры в клетке
                            }
                        }
                    }
                }
            }
        }
        return candidates;
    }

    /**
     * Пересчитывает кандидатов для ВСЕХ пустых ячеек в Killer-режиме.
     * @param {Array<Array<Object>>} userGrid - Текущее состояние игрового поля.
     * @param {Object} solverData - Данные о клетках Killer Sudoku.
     * @returns {Object<string, Set<number>>} Новая карта кандидатов.
     */
    function calculateAllKillerCandidates(userGrid, solverData) {
        resetPeersCache(); // Сбрасываем кеш пиров при полном пересчёте
        const newMap = {};
        if (!userGrid) return newMap;
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const cellId = getCellId(r, c);
                if (!cellId) continue;
                if (userGrid[r]?.[c]?.value === 0) {
                    newMap[cellId] = calculateKillerCandidates(r, c, userGrid, solverData);
                } else {
                    newMap[cellId] = new Set(); // Заполненные ячейки не имеют кандидатов
                }
            }
        }
        // console.log("Killer Candidates map recalculated (basic rules)."); // Убрал частый лог
        return newMap;
    }

    // --- Функции поиска техник ---

    function findNakedSingle(userGrid, candidatesMap, solverData) {
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const cellId = getCellId(r, c);
                if (userGrid[r]?.[c]?.value === 0 && candidatesMap[cellId]?.size === 1) {
                    const digit = candidatesMap[cellId].values().next().value;
                    console.log(`Killer Naked Single: ${digit} at ${cellId}`);
                    return { r, c, cellId, digit, technique: "Naked Single" };
                }
            }
        }
        return null;
    }

    function findHiddenSingle(userGrid, candidatesMap, solverData) {
        const allUnits = getAllUnitsIndices();
        for (let i = 0; i < allUnits.length; i++) {
            const unitIndices = allUnits[i];
            for (let d = 1; d <= 9; d++) {
                let places = [];
                let presentInUnit = false;
                for (const [r, c] of unitIndices) {
                    if (userGrid[r]?.[c]?.value === d) {
                        presentInUnit = true;
                        break;
                    }
                    if (userGrid[r]?.[c]?.value === 0) {
                        const cellId = getCellId(r, c);
                        if (candidatesMap[cellId]?.has(d)) {
                            places.push({ r, c, cellId });
                        }
                    }
                }
                if (!presentInUnit && places.length === 1) {
                    const { r, c, cellId } = places[0];
                    console.log(`Killer Hidden Single: ${d} at ${cellId} in ${getUnitType(i)} ${getUnitIndexForDisplay(i)}`);
                    return { r, c, cellId, digit: d, technique: "Hidden Single" };
                }
            }
        }
        return null;
    }

    function findNakedPair(userGrid, candidatesMap, solverData) {
        const units = getAllUnitsIndices();
        for (let i = 0; i < units.length; i++) {
            const unit = units[i];
            const cellsWith2Candidates = [];
            for (const [r, c] of unit) {
                const cellId = getCellId(r, c);
                if (userGrid[r]?.[c]?.value === 0 && candidatesMap[cellId]?.size === 2) {
                    cellsWith2Candidates.push({ r, c, cands: candidatesMap[cellId], cellId });
                }
            }
            if (cellsWith2Candidates.length >= 2) {
                for (let j = 0; j < cellsWith2Candidates.length; j++) {
                    for (let k = j + 1; k < cellsWith2Candidates.length; k++) {
                        const c1 = cellsWith2Candidates[j];
                        const c2 = cellsWith2Candidates[k];
                        if (c1.cands.size === 2 && c2.cands.size === 2 &&
                            Array.from(c1.cands).every(digit => c2.cands.has(digit)) &&
                            Array.from(c2.cands).every(digit => c1.cands.has(digit)))
                        {
                            const pairDigits = Array.from(c1.cands);
                            const pairCells = [c1.cellId, c2.cellId];
                            const eliminations = [];
                            const pairCellsSet = new Set(pairCells);

                            for (const [r_unit, c_unit] of unit) {
                                const unitCellId = getCellId(r_unit, c_unit);
                                if (unitCellId && !pairCellsSet.has(unitCellId) && userGrid[r_unit]?.[c_unit]?.value === 0) {
                                    const otherCands = candidatesMap[unitCellId];
                                    if (otherCands) {
                                        if (otherCands.has(pairDigits[0])) eliminations.push({ cellId: unitCellId, digit: pairDigits[0] });
                                        if (otherCands.has(pairDigits[1])) eliminations.push({ cellId: unitCellId, digit: pairDigits[1] });
                                    }
                                }
                            }
                            if (eliminations.length > 0) {
                                console.log(`Killer Naked Pair found: Digits ${pairDigits.join(',')} in cells ${pairCells.join(',')} in ${getUnitType(i)} ${getUnitIndexForDisplay(i)}`);
                                return { unitType: getUnitType(i), unitIndex: i, cells: pairCells, digits: pairDigits, technique: "Naked Pair", eliminations };
                            }
                        }
                    }
                }
            }
        }
        return null;
    }

    function findHiddenPair(userGrid, candidatesMap, solverData) {
        const units = getAllUnitsIndices();
        for (let i = 0; i < units.length; i++) {
            const unit = units[i];
            const digitLocations = {};
            for (let d = 1; d <= 9; d++) {
                digitLocations[d] = new Set();
            }

            for (const [r, c] of unit) {
                const cellId = getCellId(r, c);
                if (userGrid[r]?.[c]?.value === 0 && candidatesMap[cellId]) {
                    candidatesMap[cellId].forEach(digit => {
                        digitLocations[digit].add(cellId);
                    });
                }
            }

            const digitsIn2Cells = [];
            for (let d = 1; d <= 9; d++) {
                if (digitLocations[d].size === 2) {
                    digitsIn2Cells.push({ digit: d, locations: digitLocations[d] });
                }
            }

            if (digitsIn2Cells.length >= 2) {
                for (let j = 0; j < digitsIn2Cells.length; j++) {
                    for (let k = j + 1; k < digitsIn2Cells.length; k++) {
                        const d1Info = digitsIn2Cells[j];
                        const d2Info = digitsIn2Cells[k];

                        if (d1Info.locations.size === 2 && d2Info.locations.size === 2 &&
                            Array.from(d1Info.locations).every(loc => d2Info.locations.has(loc)) &&
                            Array.from(d2Info.locations).every(loc => d1Info.locations.has(loc)))
                        {
                            const pairDigits = [d1Info.digit, d2Info.digit].sort((a,b)=>a-b);
                            const pairCells = Array.from(d1Info.locations);
                            const eliminations = [];

                            for (const cellId of pairCells) {
                                const cellCands = candidatesMap[cellId];
                                if (cellCands) {
                                    cellCands.forEach(cand => {
                                        if (!pairDigits.includes(cand)) {
                                            eliminations.push({ cellId, digit: cand });
                                        }
                                    });
                                }
                            }
                            if (eliminations.length > 0) {
                                console.log(`Killer Hidden Pair found: Digits ${pairDigits.join(',')} in cells ${pairCells.join(',')} in ${getUnitType(i)} ${getUnitIndexForDisplay(i)}`);
                                return { unitType: getUnitType(i), unitIndex: i, cells: pairCells, digits: pairDigits, technique: "Hidden Pair", eliminations };
                            }
                        }
                    }
                }
            }
        }
        return null;
    }

    function findNakedTriple(userGrid, candidatesMap, solverData) {
        const units = getAllUnitsIndices();
        for (let i = 0; i < units.length; i++) {
            const unitIndices = units[i];
            const candidateCells = [];
            for (const [r, c] of unitIndices) {
                const cellId = getCellId(r, c);
                if (userGrid[r]?.[c]?.value === 0 && candidatesMap[cellId]) {
                    const candidates = candidatesMap[cellId];
                    if (candidates && (candidates.size >= 2 && candidates.size <= 3)) {
                        candidateCells.push({ r, c, cands: candidates, cellId });
                    }
                }
            }
            if (candidateCells.length >= 3) {
                for (let j = 0; j < candidateCells.length; j++) {
                    for (let k = j + 1; k < candidateCells.length; k++) {
                        for (let l = k + 1; l < candidateCells.length; l++) {
                            const c1 = candidateCells[j], c2 = candidateCells[k], c3 = candidateCells[l];
                            const tripleCells = [c1.cellId, c2.cellId, c3.cellId];
                            const combinedCands = new Set([...c1.cands, ...c2.cands, ...c3.cands]);

                            if (combinedCands.size === 3) {
                                const tripleDigits = Array.from(combinedCands).sort((a,b)=>a-b);
                                const eliminations = [];
                                const tripleCellsSet = new Set(tripleCells);

                                for (const [r_unit, c_unit] of unitIndices) {
                                    const cellId_unit = getCellId(r_unit, c_unit);
                                    if (cellId_unit && !tripleCellsSet.has(cellId_unit) && userGrid[r_unit]?.[c_unit]?.value === 0) {
                                        const notes = candidatesMap[cellId_unit];
                                        if (notes) {
                                            notes.forEach(cand => {
                                                if (tripleDigits.includes(cand)) {
                                                    eliminations.push({ cellId: cellId_unit, digit: cand });
                                                }
                                            });
                                        }
                                    }
                                }
                                if (eliminations.length > 0) {
                                    console.log(`Killer Naked Triple found: Digits ${tripleDigits.join(',')} in cells ${tripleCells.join(',')} in ${getUnitType(i)} ${getUnitIndexForDisplay(i)}`);
                                    return { unitType: getUnitType(i), unitIndex: i, cells: tripleCells, digits: tripleDigits, technique: "Naked Triple", eliminations };
                                }
                            }
                        }
                    }
                }
            }
        }
        return null;
    }

    function findHiddenTriple(userGrid, candidatesMap, solverData) {
        const units = getAllUnitsIndices();
        for (let i = 0; i < units.length; i++) {
            const unit = units[i];
            const digitLocations = {};
            for (let d = 1; d <= 9; d++) {
                digitLocations[d] = new Set();
            }

            for (const [r, c] of unit) {
                const cellId = getCellId(r, c);
                if (userGrid[r]?.[c]?.value === 0 && candidatesMap[cellId]) {
                    candidatesMap[cellId].forEach(digit => {
                        digitLocations[digit].add(cellId);
                    });
                }
            }

            const potentialTripleDigits = Object.keys(digitLocations)
                .map(d => parseInt(d))
                .filter(d => digitLocations[d].size >= 2 && digitLocations[d].size <= 3);

            if (potentialTripleDigits.length >= 3) {
                for (let j = 0; j < potentialTripleDigits.length; j++) {
                    for (let k = j + 1; k < potentialTripleDigits.length; k++) {
                        for (let l = k + 1; l < potentialTripleDigits.length; l++) {
                            const d1 = potentialTripleDigits[j];
                            const d2 = potentialTripleDigits[k];
                            const d3 = potentialTripleDigits[l];
                            const tripleDigits = [d1, d2, d3].sort((a,b)=>a-b);

                            const combinedCells = new Set([...digitLocations[d1], ...digitLocations[d2], ...digitLocations[d3]]);

                            if (combinedCells.size === 3) {
                                const tripleCells = Array.from(combinedCells);
                                const eliminations = [];

                                for (const cellId of tripleCells) {
                                    const cellCands = candidatesMap[cellId];
                                    if (cellCands) {
                                        cellCands.forEach(cand => {
                                            if (!tripleDigits.includes(cand)) {
                                                eliminations.push({ cellId, digit: cand });
                                            }
                                        });
                                    }
                                }
                                if (eliminations.length > 0) {
                                    console.log(`Killer Hidden Triple found: Digits ${tripleDigits.join(',')} in cells ${tripleCells.join(',')} in ${getUnitType(i)} ${getUnitIndexForDisplay(i)}`);
                                    return { unitType: getUnitType(i), unitIndex: i, cells: tripleCells, digits: tripleDigits, technique: "Hidden Triple", eliminations };
                                }
                            }
                        }
                    }
                }
            }
        }
        return null;
    }

    function findInnieStep(userGrid, candidatesMap, solverData) {
        if (!userGrid || !solverData?.cellToCageMap || !solverData?.cageDataArray) return null;
        const allUnits = getAllUnitsIndices();
        for (let unitIndex = 0; unitIndex < allUnits.length; unitIndex++) {
            const unit = allUnits[unitIndex];
            const unitCellIds = unit.map(([r,c]) => getCellId(r,c)).filter(id => id);
            const unitCellIdsSet = new Set(unitCellIds);
            for (let d = 1; d <= 9; d++) {
                const possibleLocationsInUnit = [];
                let involvedCages = new Set();
                let digitAlreadyPlacedInUnit = false;

                for (const cellId of unitCellIds) {
                    const coords = getCellCoords(cellId);
                    if (coords && userGrid[coords.r][coords.c].value === d) {
                        digitAlreadyPlacedInUnit = true;
                        break;
                    }
                }
                if (digitAlreadyPlacedInUnit) continue;

                for (const cellId of unitCellIds) {
                    const coords = getCellCoords(cellId);
                    if (coords && userGrid[coords.r][coords.c].value === 0 && candidatesMap[cellId]?.has(d)) {
                        possibleLocationsInUnit.push(cellId);
                        const cageIdx = solverData.cellToCageMap[cellId];
                        if (cageIdx !== undefined) {
                            involvedCages.add(cageIdx);
                        }
                    }
                }

                if (possibleLocationsInUnit.length > 0 && involvedCages.size === 1) {
                    const targetCageIndex = involvedCages.values().next().value;
                    const targetCage = solverData.cageDataArray[targetCageIndex];
                    if (!targetCage) continue;

                    const eliminations = [];
                    for (const cageCellId of targetCage.cells) {
                        if (!unitCellIdsSet.has(cageCellId)) {
                            const coords = getCellCoords(cageCellId);
                            if (coords && userGrid[coords.r][coords.c].value === 0 && candidatesMap[cageCellId]?.has(d)) {
                                eliminations.push({ cellId: cageCellId, digit: d });
                            }
                        }
                    }
                    if (eliminations.length > 0) {
                        console.log(`Killer Innie found: Digit ${d} in ${getUnitType(unitIndex)} ${getUnitIndexForDisplay(unitIndex)} confined to cage ${targetCage.id}. Eliminating from ${eliminations.map(e=>e.cellId).join(',')}.`);
                        return { technique: "Innie", digit: d, unitIndex: unitIndex, cageId: targetCage.id, eliminations: eliminations };
                    }
                }
            }
        }
        return null;
    }

    function findOutieStep(userGrid, candidatesMap, solverData) {
        if (!userGrid || !solverData?.cageDataArray) return null;

        for (const cage of solverData.cageDataArray) {
            if (!cage.cells || cage.cells.length < 2) continue;

            for (let d = 1; d <= 9; d++) {
                const possibleLocationsInCage = [];
                for (const cellId of cage.cells) {
                    const coords = getCellCoords(cellId);
                    if(coords && userGrid[coords.r][coords.c].value === 0 && candidatesMap[cellId]?.has(d)) {
                        possibleLocationsInCage.push({id: cellId, r: coords.r, c: coords.c});
                    }
                }

                if (possibleLocationsInCage.length < 2) continue;

                const cageCellIdsSet = new Set(cage.cells);

                let confinedToRow = true;
                let targetRowIndex = possibleLocationsInCage[0].r;
                for(let i=1; i<possibleLocationsInCage.length; i++) {
                    if (possibleLocationsInCage[i].r !== targetRowIndex) { confinedToRow = false; break; }
                }
                if (confinedToRow) {
                    const eliminations = [];
                    const rowIndices = getRowIndices(targetRowIndex);
                    for (const [r,c] of rowIndices) {
                        const cellId = getCellId(r,c);
                        if (cellId && !cageCellIdsSet.has(cellId) && userGrid[r][c].value === 0 && candidatesMap[cellId]?.has(d)) {
                            eliminations.push({cellId, digit: d});
                        }
                    }
                    if (eliminations.length > 0) {
                        console.log(`Killer Outie (Row) found: Digit ${d} in cage ${cage.id} confined to row ${targetRowIndex+1}. Eliminating from ${eliminations.map(e=>e.cellId).join(',')}.`);
                        return { technique: "Outie (Row)", digit: d, cageId: cage.id, unitType: 'Row', unitIndex: targetRowIndex, eliminations: eliminations };
                    }
                }

                let confinedToCol = true;
                let targetColIndex = possibleLocationsInCage[0].c;
                for(let i=1; i<possibleLocationsInCage.length; i++) {
                    if (possibleLocationsInCage[i].c !== targetColIndex) { confinedToCol = false; break; }
                }
                if (confinedToCol) {
                    const eliminations = [];
                    const colIndices = getColIndices(targetColIndex);
                    for (const [r,c] of colIndices) {
                        const cellId = getCellId(r,c);
                        if (cellId && !cageCellIdsSet.has(cellId) && userGrid[r][c].value === 0 && candidatesMap[cellId]?.has(d)) {
                            eliminations.push({cellId, digit: d});
                        }
                    }
                    if (eliminations.length > 0) {
                        console.log(`Killer Outie (Col) found: Digit ${d} in cage ${cage.id} confined to col ${targetColIndex+1}. Eliminating from ${eliminations.map(e=>e.cellId).join(',')}.`);
                        return { technique: "Outie (Col)", digit: d, cageId: cage.id, unitType: 'Col', unitIndex: targetColIndex, eliminations: eliminations };
                    }
                }

                let confinedToBlock = true;
                let targetBlockIndex = Math.floor(possibleLocationsInCage[0].r / 3) * 3 + Math.floor(possibleLocationsInCage[0].c / 3);
                for(let i=1; i<possibleLocationsInCage.length; i++) {
                    const currentBlock = Math.floor(possibleLocationsInCage[i].r / 3) * 3 + Math.floor(possibleLocationsInCage[i].c / 3);
                    if (currentBlock !== targetBlockIndex) { confinedToBlock = false; break; }
                }
                if (confinedToBlock) {
                    const eliminations = [];
                    const blockIndices = getBlockIndices(targetBlockIndex);
                    for (const [r,c] of blockIndices) {
                        const cellId = getCellId(r,c);
                        if (cellId && !cageCellIdsSet.has(cellId) && userGrid[r][c].value === 0 && candidatesMap[cellId]?.has(d)) {
                            eliminations.push({cellId, digit: d});
                        }
                    }
                    if (eliminations.length > 0) {
                        console.log(`Killer Outie (Block) found: Digit ${d} in cage ${cage.id} confined to block ${targetBlockIndex}. Eliminating from ${eliminations.map(e=>e.cellId).join(',')}.`);
                        return { technique: "Outie (Block)", digit: d, cageId: cage.id, unitType: 'Block', unitIndex: targetBlockIndex, eliminations: eliminations };
                    }
                }
            }
        }
        return null;
    }

    /**
     * Рекурсивная функция для поиска комбинаций суммы в клетке.
     * @param {Array<Object>} emptyCells - Массив объектов {id: cellId, cands: Set<number>} для пустых ячеек в клетке.
     * @param {number} cellIndex - Текущий индекс ячейки, которую мы пытаемся заполнить.
     * @param {number} targetSum - Целевая сумма, которую нужно набрать оставшимися цифрами.
     * @param {Array<number>} currentCombo - Текущая формируемая комбинация цифр.
     * @param {Set<number>} placedDigitsInCageSoFar - Цифры, уже размещенные в клетке (не в currentCombo, а в userGrid).
     * @param {Array<Array<number>>} results - Массив для хранения всех валидных комбинаций.
     */
    function findSumCombinationsRecursive(emptyCells, cellIndex, targetSum, currentCombo, placedDigitsInCageSoFar, results) {
        // Базовый случай 1: Все ячейки рассмотрены
        if (cellIndex === emptyCells.length) {
            // Если сумма сошлась, добавляем комбинацию в результаты
            if (targetSum === 0) {
                results.push([...currentCombo]);
            }
            return;
        }

        const currentCell = emptyCells[cellIndex];
        const candidates = Array.from(currentCell.cands);

        // Оптимизация: Проверка на минимально/максимально возможную сумму для оставшихся ячеек
        const currentUsedDigitsInComboAndCage = new Set([...currentCombo, ...placedDigitsInCageSoFar]);
        let minRemainingSum = 0;
        let maxRemainingSum = 0;

        for (let i = cellIndex; i < emptyCells.length; i++) {
            const cellCandidates = Array.from(emptyCells[i].cands);
            let minDigit = 10;
            let maxDigit = 0;

            for (const cand of cellCandidates) {
                if (!currentUsedDigitsInComboAndCage.has(cand)) {
                    minDigit = Math.min(minDigit, cand);
                    maxDigit = Math.max(maxDigit, cand);
                }
            }

            if (minDigit === 10) { // Если для текущей или последующей ячейки нет доступных уникальных кандидатов
                return;
            }
            minRemainingSum += minDigit;
            maxRemainingSum += maxDigit;
        }

        if (targetSum < minRemainingSum || targetSum > maxRemainingSum) {
            return;
        }

        // Итерация по кандидатам текущей ячейки
        for (const digit of candidates) {
            if (!currentUsedDigitsInComboAndCage.has(digit)) {
                if (targetSum - digit >= 0) {
                    currentCombo.push(digit);
                    currentUsedDigitsInComboAndCage.add(digit);

                    findSumCombinationsRecursive(
                        emptyCells,
                        cellIndex + 1,
                        targetSum - digit,
                        currentCombo,
                        placedDigitsInCageSoFar,
                        results
                    );

                    currentCombo.pop();
                    currentUsedDigitsInComboAndCage.delete(digit);
                }
            }
        }
    }


    /**
     * Находит кандидатов, которые не могут участвовать ни в одной валидной
     * комбинации суммы для своей клетки.
     */
    function findCageCombinationCheck(userGrid, candidatesMap, solverData) {
        if (!userGrid || !solverData?.cageDataArray) return null;

        const allEliminations = [];

        for (const cage of solverData.cageDataArray) {
            // Пропускаем single-cell cages, так как они обрабатываются отдельно (как Naked Single)
            if (!cage || !cage.cells || cage.cells.length < 2) continue;

            let currentCageSum = 0;
            const emptyCellsData = [];
            const placedDigitsInCage = new Set();
            let possibleCageState = true;

            for (const cellId of cage.cells) {
                const coords = getCellCoords(cellId);
                if (!coords || !userGrid[coords.r]?.[coords.c]) { possibleCageState = false; break; }
                const cellData = userGrid[coords.r][coords.c];
                const cellValue = cellData.value;

                if (cellValue !== 0) {
                    if (placedDigitsInCage.has(cellValue)) {
                        possibleCageState = false;
                        console.warn(`Cage ${cage.id}: Duplicate digit ${cellValue} found among placed values. Invalid puzzle state.`);
                        break;
                    }
                    placedDigitsInCage.add(cellValue);
                    currentCageSum += cellValue;
                } else {
                    const candidates = candidatesMap[cellId];
                    if (!candidates || candidates.size === 0) {
                        possibleCageState = false;
                        console.warn(`Cage ${cage.id}: Empty cell ${cellId} has no candidates. Invalid puzzle state.`);
                        break;
                    }
                    emptyCellsData.push({ id: cellId, cands: candidates });
                }
            }
            if (!possibleCageState) continue;

            const remainingSum = cage.sum - currentCageSum;
            const remainingCellsCount = emptyCellsData.length;

            if (remainingCellsCount === 0) {
                if (remainingSum !== 0) {
                    console.warn(`Cage ${cage.id}: All cells filled, but sum ${currentCageSum} != target ${cage.sum}. Invalid puzzle state.`);
                }
                continue;
            }

            if (remainingSum <= 0) {
                console.warn(`Cage ${cage.id}: Remaining sum ${remainingSum} is non-positive for ${remainingCellsCount} empty cells. Invalid puzzle state.`);
                continue;
            }

            const validCombinations = [];
            findSumCombinationsRecursive(emptyCellsData, 0, remainingSum, [], placedDigitsInCage, validCombinations);

            if (validCombinations.length === 0) {
                console.warn(`Cage ${cage.id}: No valid combinations found for remaining sum ${remainingSum} in ${remainingCellsCount} cells. This might indicate an impossible puzzle state or an error in previous steps.`);
                continue;
            }

            const actuallyUsedCandidates = new Map();
            emptyCellsData.forEach(cell => actuallyUsedCandidates.set(cell.id, new Set()));

            validCombinations.forEach(combo => {
                combo.forEach((digit, index) => {
                    const cellId = emptyCellsData[index].id;
                    actuallyUsedCandidates.get(cellId)?.add(digit);
                });
            });

            emptyCellsData.forEach(cell => {
                const originalCandidates = candidatesMap[cell.id];
                const usedCandidates = actuallyUsedCandidates.get(cell.id);

                if (originalCandidates && usedCandidates) {
                    originalCandidates.forEach(cand => {
                        if (!usedCandidates.has(cand)) {
                            allEliminations.push({ cellId: cell.id, digit: cand });
                        }
                    });
                }
            });
        }

        if (allEliminations.length > 0) {
            const uniqueEliminationsMap = new Map();
            allEliminations.forEach(elim => {
                const key = `${elim.cellId}-${elim.digit}`;
                if (!uniqueEliminationsMap.has(key)) {
                    uniqueEliminationsMap.set(key, elim);
                }
            });
            const uniqueEliminations = Array.from(uniqueEliminationsMap.values());

            console.log(`Cage Combination Check found ${uniqueEliminations.length} eliminations.`);
            return {
                technique: "Cage Combination Check",
                eliminations: uniqueEliminations,
            };
        }

        return null;
    }


    // --- Функции применения техник (applyFunc) ---
    // Эти функции изменяют userGrid и currentCandidatesMap
    // и вызывают renderCellCallback для обновления UI.

    /**
     * Применяет найденный Naked/Hidden Single.
     * @param {Object} foundInfo - {r, c, cellId, digit, technique}
     * @param {Array<Array<Object>>} userGrid - Текущее состояние игрового поля.
     * @param {Object<string, Set<number>>} currentCandidatesMap - Текущая карта кандидатов.
     * @param {Function} renderCellCallback - Колбэк для обновления UI ячейки.
     * @returns {boolean} true, если изменение применено.
     */
    function applyFoundSingle(foundInfo, userGrid, currentCandidatesMap, renderCellCallback) {
        const { r, c, cellId, digit } = foundInfo;
        if (userGrid[r][c].value === 0) {
            userGrid[r][c].value = digit;
            userGrid[r][c].isSolved = true;
            currentCandidatesMap[cellId] = new Set(); // Очищаем кандидатов для этой ячейки
            renderCellCallback(r, c, digit, new Set()); // Обновляем UI
            console.log(`Applied Single: ${digit} to ${cellId}`);
            return true;
        }
        return false;
    }

    /**
     * Применяет общие элиминации (например, от Innie, Outie, Cage Combination Check).
     * @param {Object} foundInfo - {technique, eliminations: [{cellId, digit}, ...]}
     * @param {Array<Array<Object>>} userGrid - Текущее состояние игрового поля.
     * @param {Object<string, Set<number>>} currentCandidatesMap - Текущая карта кандидатов.
     * @param {Function} renderCellCallback - Колбэк для обновления UI ячейки.
     * @returns {boolean} true, если были применены новые элиминации.
     */
    function applyElimination(foundInfo, userGrid, currentCandidatesMap, renderCellCallback) {
        let appliedAny = false;
        const eliminations = foundInfo.eliminations;
        if (!eliminations || eliminations.length === 0) return false;

        for (const elim of eliminations) {
            const { cellId, digit } = elim;
            const coords = getCellCoords(cellId);
            // Проверяем, что ячейка пуста и что кандидат присутствует
            if (coords && userGrid[coords.r][coords.c].value === 0 && currentCandidatesMap[cellId]?.has(digit)) {
                currentCandidatesMap[cellId].delete(digit);
                appliedAny = true;
                // Обновляем UI заметок для этой ячейки
                renderCellCallback(coords.r, coords.c, null, currentCandidatesMap[cellId]);
                // console.log(`Eliminated ${digit} from ${cellId} due to ${foundInfo.technique}`); // Частое логирование
            }
        }
        return appliedAny;
    }

    /**
     * Применяет элиминацию для Naked Group (Pair, Triple).
     * @param {Object} foundInfo - {unitType, unitIndex, cells: [cellId, ...], digits: [d1, d2, ...], technique, eliminations: [...]}
     * @param {Array<Array<Object>>} userGrid - Текущее состояние игрового поля.
     * @param {Object<string, Set<number>>} currentCandidatesMap - Текущая карта кандидатов.
     * @param {Function} renderCellCallback - Колбэк для обновления UI ячейки.
     * @returns {boolean} true, если были применены новые элиминации.
     */
    function applyNakedGroupElimination(foundInfo, userGrid, currentCandidatesMap, renderCellCallback) {
        return applyElimination(foundInfo, userGrid, currentCandidatesMap, renderCellCallback); // Re-use general elimination logic
    }

    /**
     * Применяет элиминацию для Hidden Group (Pair, Triple).
     * @param {Object} foundInfo - {unitType, unitIndex, cells: [cellId, ...], digits: [d1, d2, ...], technique, eliminations: [...]}
     * @param {Array<Array<Object>>} userGrid - Текущее состояние игрового поля.
     * @param {Object<string, Set<number>>} currentCandidatesMap - Текущая карта кандидатов.
     * @param {Function} renderCellCallback - Колбэк для обновления UI ячейки.
     * @returns {boolean} true, если были применены новые элиминации.
     */
    function applyHiddenGroupElimination(foundInfo, userGrid, currentCandidatesMap, renderCellCallback) {
        return applyElimination(foundInfo, userGrid, currentCandidatesMap, renderCellCallback); // Re-use general elimination logic
    }


    /**
     * Главная функция для выполнения одного логического шага решателя Killer Sudoku.
     * Проверяет техники в заданном порядке и применяет первую найденную.
     * @param {Array<Array<Object>>} userGrid - Текущее состояние игрового поля.
     * @param {Object<string, Set<number>>} currentCandidatesMap - Текущая карта кандидатов.
     * @param {Object} solverData - Данные о клетках Killer Sudoku.
     * @param {Function} updateCandidatesCallback - Колбэк для полного пересчёта кандидатов (обычно находится в script.js).
     * @param {Function} renderCellCallback - Колбэк для обновления UI одной ячейки (обычно находится в script.js).
     * @returns {Object|null} Информация о примененном шаге или null, если ничего не найдено.
     */
    function doKillerLogicStep(userGrid, currentCandidatesMap, solverData, updateCandidatesCallback, renderCellCallback) {
        let appliedStepInfo = null;

        // --- 0. Special Case: Single-Cell Cages ---
        // Это самая простая и приоритетная проверка для Killer Sudoku
        // Если клетка состоит из одной ячейки, и эта ячейка пуста,
        // то значение этой ячейки должно быть равно сумме клетки.
        if (solverData && solverData.cageDataArray) {
            for (const cage of solverData.cageDataArray) {
                if (cage.cells.length === 1) {
                    const cellId = cage.cells[0];
                    const coords = getCellCoords(cellId);
                    if (coords && userGrid[coords.r][coords.c].value === 0) {
                        const expectedDigit = cage.sum;
                        // Проверяем, что ожидаемая цифра валидна и является кандидатом (хотя для single-cell cage это почти всегда так)
                        if (expectedDigit >= 1 && expectedDigit <= 9 && currentCandidatesMap[cellId]?.has(expectedDigit)) {
                            appliedStepInfo = { r: coords.r, c: coords.c, cellId, digit: expectedDigit, technique: "Single Cage Rule" };
                            const appliedSuccessfully = applyFoundSingle(appliedStepInfo, userGrid, currentCandidatesMap, renderCellCallback);
                            if (appliedSuccessfully) {
                                console.log(`Killer Applied Single Cage Rule: ${expectedDigit} to ${cellId}.`);
                                updateCandidatesCallback();
                                return appliedStepInfo;
                            }
                        }
                    }
                }
            }
        }

        // --- 1. Ordered list of techniques ---
        const techniques = [
            // Naked Single - всегда первая, самая простая и мощная
            { name: "Naked Single", findFunc: findNakedSingle, applyFunc: applyFoundSingle },
            { name: "Hidden Single", findFunc: findHiddenSingle, applyFunc: applyFoundSingle },
            { name: "Cage Combination Check", findFunc: findCageCombinationCheck, applyFunc: applyElimination },
            { name: "Naked Pair", findFunc: findNakedPair, applyFunc: applyNakedGroupElimination },
            { name: "Hidden Pair", findFunc: findHiddenPair, applyFunc: applyHiddenGroupElimination },
            { name: "Naked Triple", findFunc: findNakedTriple, applyFunc: applyNakedGroupElimination },
            { name: "Hidden Triple", findFunc: findHiddenTriple, applyFunc: applyHiddenGroupElimination },
            { name: "Innie", findFunc: findInnieStep, applyFunc: applyElimination },
            { name: "Outie", findFunc: findOutieStep, applyFunc: applyElimination },
        ];

        for (const tech of techniques) {
            console.log(`Killer Searching ${tech.name}...`);
            let foundInfo = tech.findFunc(userGrid, currentCandidatesMap, solverData);

            if (foundInfo) {
                let appliedSuccessfully = false;
                // applyFoundSingle имеет другой набор параметров
                if (tech.applyFunc === applyFoundSingle) {
                     appliedSuccessfully = tech.applyFunc(foundInfo, userGrid, currentCandidatesMap, renderCellCallback);
                } else {
                     appliedSuccessfully = tech.applyFunc(foundInfo, userGrid, currentCandidatesMap, renderCellCallback);
                }

                if (appliedSuccessfully) {
                    appliedStepInfo = { ...foundInfo, appliedTechnique: tech.name };
                    console.log(`Killer Applied ${tech.name}.`);
                    updateCandidatesCallback(); // Пересчитываем всех кандидатов после изменения
                    return appliedStepInfo; // Возвращаем, чтобы цикл решения продолжился с начала
                } else {
                    console.log(`Found ${tech.name}, but no *new* changes were applied.`);
                }
            }
        }

        if (!appliedStepInfo) {
            console.log("No effective Killer logic step found in this cycle.");
        }

        return appliedStepInfo;
    }


    // --- Публичный интерфейс модуля ---\
    return {
        calculateKillerCandidates,
        calculateAllKillerCandidates,
        doKillerLogicStep,
        resetPeersCache,
        // Экспортируем вспомогательные функции, если они нужны извне для отладки или UI
        getCellCoords,
        getCellId,
        getRowIndices,
        getColIndices,
        getBlockIndices,
        getUnitType,
        getUnitIndexForDisplay,
        getUnitIndices,
        getClassicPeers
    };

})(); // Конец IIFE killerSolverLogic
