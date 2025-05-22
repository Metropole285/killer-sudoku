// killerSolverLogic.js

/**
 * Логика для интерактивного пошагового решателя Killer Sudoku.
 * Работает с представлением данных из script.js (userGrid, currentCandidatesMap).
 * Учитывает правила Killer Sudoku при вычислелении кандидатов.
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
     */
    function calculateKillerCandidates(r, c, userGrid, solverData) {
        const cellId = getCellId(r, c);
        if (!cellId || !userGrid || !userGrid[r]?.[c] || userGrid[r][c].value !== 0) {
            return new Set(); // Ячейка уже заполнена или не существует
        }

        let candidates = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);

        // 1. Классические исключения (пиры)
        // Исключаем цифры, уже стоящие в той же строке, столбце или блоке
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
        console.log("Killer Candidates map recalculated (basic rules).");
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
                            Array.from(c2.cands).every(digit => c1.cands.has(digit))) // Check if sets are identical
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
            const digitLocations = {}; // Map: digit -> Set<cellId>
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
                            Array.from(d2Info.locations).every(loc => d1Info.locations.has(loc))) // Check if locations sets are identical
                        {
                            const pairDigits = [d1Info.digit, d2Info.digit].sort((a,b)=>a-b); // Sort for consistent output
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
                    if (candidates && (candidates.size >= 2 && candidates.size <= 3)) { // Naked Triple can involve cells with 2 or 3 candidates
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
            const digitLocations = {}; // Map: digit -> Set<cellId>
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
                .filter(d => digitLocations[d].size >= 2 && digitLocations[d].size <= 3); // Digits must appear in 2 or 3 cells

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

                // Check if digit 'd' is already placed in this unit
                for (const cellId of unitCellIds) {
                    const coords = getCellCoords(cellId);
                    if (coords && userGrid[coords.r][coords.c].value === d) {
                        digitAlreadyPlacedInUnit = true;
                        break;
                    }
                }
                if (digitAlreadyPlacedInUnit) continue;

                // Find all cells in this unit where 'd' is a candidate
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

                // If 'd' is a candidate in cells that all belong to the SAME cage
                if (possibleLocationsInUnit.length > 0 && involvedCages.size === 1) {
                    const targetCageIndex = involvedCages.values().next().value;
                    const targetCage = solverData.cageDataArray[targetCageIndex];
                    if (!targetCage) continue;

                    const eliminations = [];
                    // For cells in the target cage, but NOT in the current unit
                    for (const cageCellId of targetCage.cells) {
                        if (!unitCellIdsSet.has(cageCellId)) { // Cell is in the cage, but not in the current unit
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

            // Check each digit 1-9
            for (let d = 1; d <= 9; d++) {
                const possibleLocationsInCage = [];
                for (const cellId of cage.cells) {
                    const coords = getCellCoords(cellId);
                    if(coords && userGrid[coords.r][coords.c].value === 0 && candidatesMap[cellId]?.has(d)) {
                        possibleLocationsInCage.push({id: cellId, r: coords.r, c: coords.c});
                    }
                }

                if (possibleLocationsInCage.length < 2) continue; // Need at least two possible locations for an Outie

                const cageCellIdsSet = new Set(cage.cells);

                // Check if confined to a single Row
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

                // Check if confined to a single Column
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

                // Check if confined to a single Block
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
     * @param {Array<number>} currentCombo - Текущая формируемая комбинация цифр (цифры для emptyCells).
     * @param {Set<number>} placedDigitsInCageSoFar - Цифры, уже проставленные в других ячейках этой же клетки (value !== 0).
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
        const candidates = Array.from(currentCell.cands); // Преобразуем Set в Array для итерации

        // Важная оптимизация: Проверка на минимально/максимально возможную сумму для оставшихся ячеек
        // С учетом уже выбранных цифр в currentCombo и тех, что уже стоят в клетке (placedDigitsInCageSoFar)
        const currentUsedDigitsInComboAndCage = new Set([...currentCombo, ...placedDigitsInCageSoFar]);
        let minRemainingSum = 0;
        let maxRemainingSum = 0;

        for (let i = cellIndex; i < emptyCells.length; i++) {
            const cellCandidates = Array.from(emptyCells[i].cands);
            let minDigit = 10; // Больше 9
            let maxDigit = 0;  // Меньше 1

            // Находим минимальный и максимальный доступный кандидат для этой ячейки,
            // который ещё не используется в currentCombo и не является проставленной цифрой
            for (const cand of cellCandidates) {
                if (!currentUsedDigitsInComboAndCage.has(cand)) {
                    minDigit = Math.min(minDigit, cand);
                    maxDigit = Math.max(maxDigit, cand);
                }
            }
            if (minDigit === 10) { // Нет доступных кандидатов для этой ячейки
                 // Если нет доступных кандидатов, то эта ветвь рекурсии не приведет к решению
                return;
            }
            // Для расчета min/max remaining sum берем min/max из текущих кандидатов,
            // предполагая, что они могут быть выбраны.
            minRemainingSum += minDigit;
            maxRemainingSum += maxDigit;
        }

        // Если целевая сумма уже не может быть достигнута или уже превышена
        if (targetSum < minRemainingSum || targetSum > maxRemainingSum) {
            return;
        }

        // Итерация по кандидатам текущей ячейки
        for (const digit of candidates) {
            // Проверяем, что цифра не была использована в текущей комбинации
            // и не является одной из уже проставленных цифр в других ячейках этой клетки
            if (!currentUsedDigitsInComboAndCage.has(digit)) {
                // Если добавление цифры не превысит целевую сумму
                if (targetSum - digit >= 0) {
                    currentCombo.push(digit);
                    currentUsedDigitsInComboAndCage.add(digit); // Добавляем в Set для проверки уникальности в глубоких вызовах

                    findSumCombinationsRecursive(
                        emptyCells,
                        cellIndex + 1,
                        targetSum - digit,
                        currentCombo,
                        placedDigitsInCageSoFar, // Эта коллекция не меняется в рекурсии
                        results
                    );

                    currentCombo.pop(); // Откат: удаляем цифру для следующей итерации (бэктрекинг)
                    currentUsedDigitsInComboAndCage.delete(digit); // Удаляем из Set при откате
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
            if (!cage || !cage.cells || cage.cells.length < 2) continue; // Клетки из одной ячейки или без ячеек

            let currentCageSum = 0;
            const emptyCellsData = []; // [{ id: cellId, cands: Set<number> }, ...]
            const placedDigitsInCage = new Set(); // Цифры, уже проставленные в userGrid в этой клетке
            let possibleCageState = true;

            for (const cellId of cage.cells) {
                const coords = getCellCoords(cellId);
                if (!coords || !userGrid[coords.r]?.[coords.c]) { possibleCageState = false; break; }
                const cellData = userGrid[coords.r][coords.c];
                const cellValue = cellData.value;

                if (cellValue !== 0) {
                    if (placedDigitsInCage.has(cellValue)) {
                        // Обнаружен дубликат цифры в одной клетке, что указывает на неверное состояние головоломки
                        possibleCageState = false;
                        console.warn(`Cage ${cage.id}: Duplicate digit ${cellValue} found among placed values. Invalid puzzle state.`);
                        break;
                    }
                    placedDigitsInCage.add(cellValue);
                    currentCageSum += cellValue;
                } else {
                    const candidates = candidatesMap[cellId];
                    if (!candidates || candidates.size === 0) {
                        // Пустая ячейка без кандидатов - указывает на неверное состояние
                        possibleCageState = false;
                        console.warn(`Cage ${cage.id}: Empty cell ${cellId} has no candidates. Invalid puzzle state.`);
                        break;
                    }
                    emptyCellsData.push({ id: cellId, cands: candidates });
                }
            }
            if (!possibleCageState) continue; // Пропускаем эту клетку, если ее состояние невалидно

            const remainingSum = cage.sum - currentCageSum;
            const remainingCellsCount = emptyCellsData.length;

            if (remainingCellsCount === 0) {
                if (remainingSum !== 0) {
                    // Сумма не сходится после заполнения всех ячеек в клетке - ошибка головоломки
                    console.warn(`Cage ${cage.id}: All cells filled, but sum ${currentCageSum} != target ${cage.sum}. Invalid puzzle state.`);
                }
                continue; // Все ячейки заполнены, нет нужды проверять комбинации
            }

            if (remainingSum <= 0) {
                // Сумма уже достигнута или превышена, но есть пустые ячейки - невозможно
                console.warn(`Cage ${cage.id}: Remaining sum ${remainingSum} is non-positive for ${remainingCellsCount} empty cells. Invalid puzzle state.`);
                continue;
            }

            const validCombinations = [];
            // Вызов рекурсивной функции для поиска всех валидных комбинаций
            findSumCombinationsRecursive(emptyCellsData, 0, remainingSum, [], placedDigitsInCage, validCombinations);

            if (validCombinations.length === 0) {
                // Если не найдено ни одной комбинации, это означает, что текущее состояние несовместимо
                console.warn(`Cage ${cage.id}: No valid combinations found for remaining sum ${remainingSum} in ${remainingCellsCount} cells. This might indicate an impossible puzzle state or an error in previous steps.`);
                // В этом случае, возможно, нужно откатиться или пометить головоломку как неразрешимую
                continue;
            }

            // Создаем карту для отслеживания фактически используемых кандидатов для каждой пустой ячейки в клетке
            const actuallyUsedCandidates = new Map(); // Map: cellId -> Set<digit>
            emptyCellsData.forEach(cell => actuallyUsedCandidates.set(cell.id, new Set()));

            // Заполняем actuallyUsedCandidates на основе всех найденных валидных комбинаций
            validCombinations.forEach(combo => {
                combo.forEach((digit, index) => {
                    const cellId = emptyCellsData[index].id;
                    actuallyUsedCandidates.get(cellId)?.add(digit);
                });
            });

            // Находим кандидатов, которые присутствовали изначально, но не входят ни в одну валидную комбинацию
            emptyCellsData.forEach(cell => {
                const originalCandidates = candidatesMap[cell.id];
                const usedCandidates = actuallyUsedCandidates.get(cell.id);

                if (originalCandidates && usedCandidates) {
                    originalCandidates.forEach(cand => {
                        if (!usedCandidates.has(cand)) {
                            // Эта цифра никогда не используется в валидных комбинациях для данной клетки
                            allEliminations.push({ cellId: cell.id, digit: cand });
                        }
                    });
                }
            });
        }

        if (allEliminations.length > 0) {
            // Удаляем дубликаты из списка элиминаций
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
                eliminations: uniqueEliminations, // [{cellId, digit}, ...]
            };
        }

        return null;
    }


    // --- Функции применения техник (applyFunc) ---
    // Эти функции изменяют userGrid и currentCandidatesMap
    // и вызывают renderCellCallback для обновления UI.
    // Они должны быть предоставлены внешней логикой (script.js),
    // но я их перенесу сюда для полноты файла killerSolverLogic.js
    // и для того, чтобы doKillerLogicStep мог их использовать.

    /**
     * Применяет найденный Naked/Hidden Single.
     * @param {Object} foundInfo - {r, c, cellId, digit, technique}
     * @param {Array<Array<Object>>} userGrid - Текущее состояние игрового поля.
     * @param {Object<string, Set<number>>} currentCandidatesMap - Текущая карта кандидатов.
     * @param {Function} updateCandidatesCallback - Колбэк для пересчёта и обновления кандидатов.
     * @param {Function} renderCellCallback - Колбэк для обновления UI ячейки.
     * @returns {boolean} true, если изменение применено.
     */
    function applyFoundSingle(foundInfo, userGrid, currentCandidatesMap, updateCandidatesCallback, renderCellCallback) {
        const { r, c, cellId, digit } = foundInfo;
        if (userGrid[r][c].value === 0) {
            userGrid[r][c].value = digit;
            userGrid[r][c].isSolved = true; // Отмечаем как решенную
            currentCandidatesMap[cellId] = new Set(); // Очищаем кандидатов
            renderCellCallback(r, c, digit, new Set()); // Обновляем UI
            console.log(`Applied Single: ${digit} to ${cellId}`);

            // Важно: пересчитать кандидатов для всех затронутых ячеек
            // Это будет сделано внешним циклом через updateCandidatesCallback
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
            if (coords && userGrid[coords.r][coords.c].value === 0 && currentCandidatesMap[cellId]?.has(digit)) {
                currentCandidatesMap[cellId].delete(digit);
                appliedAny = true;
                // Обновляем UI заметок для этой ячейки
                renderCellCallback(coords.r, coords.c, null, currentCandidatesMap[cellId]);
                // console.log(`Eliminated ${digit} from ${cellId} due to ${foundInfo.technique}`);
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
        let appliedAny = false;
        const groupCellsSet = new Set(foundInfo.cells);
        const groupDigits = new Set(foundInfo.digits);
        const eliminationsToApply = foundInfo.eliminations; // Используем уже собранные элиминации

        if (!eliminationsToApply || eliminationsToApply.length === 0) return false;

        for (const elim of eliminationsToApply) {
            const { cellId, digit } = elim;
            const coords = getCellCoords(cellId);
            if (coords && userGrid[coords.r][coords.c].value === 0 && currentCandidatesMap[cellId]?.has(digit)) {
                currentCandidatesMap[cellId].delete(digit);
                appliedAny = true;
                renderCellCallback(coords.r, coords.c, null, currentCandidatesMap[cellId]);
                // console.log(`Naked Group Eliminated ${digit} from ${cellId}`);
            }
        }
        return appliedAny;
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
        let appliedAny = false;
        const groupCells = foundInfo.cells; // Cells where hidden group exists
        const groupDigits = new Set(foundInfo.digits); // Digits that form the hidden group
        const eliminationsToApply = foundInfo.eliminations; // Используем уже собранные элиминации

        if (!eliminationsToApply || eliminationsToApply.length === 0) return false;

        for (const elim of eliminationsToApply) {
            const { cellId, digit } = elim;
            const coords = getCellCoords(cellId);
            if (coords && userGrid[coords.r][coords.c].value === 0 && currentCandidatesMap[cellId]?.has(digit)) {
                currentCandidatesMap[cellId].delete(digit);
                appliedAny = true;
                renderCellCallback(coords.r, coords.c, null, currentCandidatesMap[cellId]);
                // console.log(`Hidden Group Eliminated ${digit} from ${cellId}`);
            }
        }
        return appliedAny;
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
        // Всегда начинаем с пересчёта базовых кандидатов
        // currentCandidatesMap = updateCandidatesCallback(); // Это должен делать внешний цикл, если он итеративный

        let appliedStepInfo = null;

        // Определяем порядок применения техник
        // Более простые и мощные техники идут раньше
        const techniques = [
            { name: "Naked Single", findFunc: findNakedSingle, applyFunc: applyFoundSingle },
            { name: "Hidden Single", findFunc: findHiddenSingle, applyFunc: applyFoundSingle },
            // Cage Combination Check должна быть до Naked/Hidden Pair/Triple в той же клетке
            // так как она может отсечь кандидатов, которые участвуют в паре/тройке.
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
                // applyFoundSingle требует specific params
                if (tech.applyFunc === applyFoundSingle) {
                     appliedSuccessfully = tech.applyFunc(foundInfo, userGrid, currentCandidatesMap, updateCandidatesCallback, renderCellCallback);
                } else {
                     // Остальные applyFunc принимают foundInfo, userGrid, currentCandidatesMap, renderCellCallback
                     appliedSuccessfully = tech.applyFunc(foundInfo, userGrid, currentCandidatesMap, renderCellCallback);
                }

                if (appliedSuccessfully) {
                    appliedStepInfo = { ...foundInfo, appliedTechnique: tech.name };
                    console.log(`Killer Applied ${tech.name}.`);
                    // После каждого успешного применения шага, пересчитываем всех кандидатов
                    // и выходим, чтобы внешний цикл мог повторить проверку
                    updateCandidatesCallback(); // Пересчитываем всех кандидатов после изменения
                    return appliedStepInfo;
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
        resetPeersCache
        // Вспомогательные функции могут быть экспортированы для отладки или тестов, если нужно:
        // getCellCoords, getCellId, getRowIndices, getColIndices, getBlockIndices, getUnitType, getUnitIndexForDisplay, getUnitIndices, getClassicPeers
    };

})(); // Конец IIFE killerSolverLogic
