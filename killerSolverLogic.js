// killerSolverLogic.js

/**
 * Логика для интерактивного пошагового решателя Killer Sudoku.
 * Работает с представлением данных из script.js (userGrid, currentCandidatesMap).
 * Учитывает правила Killer Sudoku при вычислении кандидатов.
 */
const killerSolverLogic = (() => {
    const DEBUG_SOLVER = false; // Флаг для отладочных логов

    // --- Вспомогательные функции (локальны для этого модуля) ---
    function getCellCoords(cellId) {
        if (!cellId || typeof cellId !== 'string' || cellId.length !== 2) return null;
        const r = "ABCDEFGHI".indexOf(cellId[0]);
        const c = "123456789".indexOf(cellId[1]); // char '1' is index 0
        if (r === -1 || c === -1) return null;
        return { r, c }; // c is 0-8
    }

    function getCellId(r, c) {
        if (r < 0 || r > 8 || c < 0 || c > 8) return null;
        return "ABCDEFGHI"[r] + "123456789"[c];
    }

    function getRowIndices(r) {
        const indices = [];
        for (let c = 0; c < 9; c++) indices.push([r, c]);
        return indices;
    }

    function getColIndices(c) {
        const indices = [];
        for (let r = 0; r < 9; r++) indices.push([r, c]);
        return indices;
    }

    function getBlockIndices(blockIndex) { // blockIndex 0-8
        const startRow = Math.floor(blockIndex / 3) * 3;
        const startCol = (blockIndex % 3) * 3;
        const indices = [];
        for (let r_offset = 0; r_offset < 3; r_offset++) {
            for (let c_offset = 0; c_offset < 3; c_offset++) {
                indices.push([startRow + r_offset, startCol + c_offset]);
            }
        }
        return indices;
    }

    function getAllUnitsIndices() {
        const allUnits = [];
        for (let i = 0; i < 9; i++) {
            allUnits.push(getRowIndices(i));    // Rows 0-8
            allUnits.push(getColIndices(i));   // Cols 9-17
            allUnits.push(getBlockIndices(i)); // Blocks 18-26
        }
        return allUnits;
    }

    function getUnitType(globalUnitIndex) {
        if (globalUnitIndex < 9) return 'Row';
        if (globalUnitIndex < 18) return 'Col';
        return 'Block';
    }

    function getUnitIndexForDisplay(globalUnitIndex) { // 1-based index for display
        return (globalUnitIndex % 9) + 1;
    }

    // function getUnitIndices(globalUnitIndex) { // Not directly used by solver step, but good util
    //     if (globalUnitIndex < 0 || globalUnitIndex > 26) return null;
    //     const type = getUnitType(globalUnitIndex);
    //     const index = globalUnitIndex % 9; // 0-based internal index
    //     if (type === 'Row') return getRowIndices(index);
    //     if (type === 'Col') return getColIndices(index);
    //     if (type === 'Block') return getBlockIndices(index);
    //     return null;
    // }

    let classicPeersMapCache = null;

    function getClassicPeers(r_coord, c_coord) {
        const cellId = getCellId(r_coord, c_coord);
        if (!cellId) return new Set();

        if (classicPeersMapCache === null) {
            if (DEBUG_SOLVER) console.log("Initializing killerSolverLogic peers cache...");
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
                                if (pid) peers.add(pid);
                            }
                        }
                        // Col peers
                        for (let ri = 0; ri < 9; ri++) {
                            if (ri !== r_cache) {
                                const pid = getCellId(ri, c_cache);
                                if (pid) peers.add(pid);
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
                                    if (pid) peers.add(pid);
                                }
                            }
                        }
                        classicPeersMapCache[id_cache] = peers;
                    }
                }
            }
            if (DEBUG_SOLVER) console.log("killerSolverLogic peers cache initialized.");
        }
        return classicPeersMapCache[cellId] || new Set();
    }

    function resetPeersCache() { // Exported for external use if needed (e.g. new game)
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
            const cageId = solverData.cellToCageMap[cellId]; // cageId is the ID from cageDataArray
            // Find the cage by ID
            const cage = solverData.cageDataArray.find(cdata => cdata.id === cageId);

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
        return candidates;
    }

    /**
     * Пересчитывает кандидатов для ВСЕХ пустых ячеек в Killer-режиме.
     * @param {Array<Array<Object>>} userGrid - Текущее состояние игрового поля.
     * @param {Object} solverData - Данные о клетках Killer Sudoku.
     * @returns {Object<string, Set<number>>} Новая карта кандидатов.
     */
    function calculateAllKillerCandidates(userGrid, solverData) {
        // resetPeersCache(); // Сбрасываем кеш пиров при полном пересчёте - не обязательно если он кэширует только ID
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
        // if (DEBUG_SOLVER) console.log("Killer Candidates map recalculated (basic rules).");
        return newMap;
    }

    // --- Функции поиска техник ---

    function findNakedSingle(userGrid, candidatesMap) { // solverData not needed for naked single
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const cellId = getCellId(r, c);
                if (userGrid[r]?.[c]?.value === 0 && candidatesMap[cellId]?.size === 1) {
                    const digit = candidatesMap[cellId].values().next().value;
                    if (DEBUG_SOLVER) console.log(`Killer Naked Single: ${digit} at ${cellId}`);
                    return { r, c, cellId, digit, technique: "Naked Single" };
                }
            }
        }
        return null;
    }

    function findHiddenSingle(userGrid, candidatesMap) { // solverData not needed for hidden single
        const allUnits = getAllUnitsIndices(); // [[{r,c},...], ...]
        for (let unitGlobalIndex = 0; unitGlobalIndex < allUnits.length; unitGlobalIndex++) {
            const unitCellCoordinates = allUnits[unitGlobalIndex]; // Array of [r,c]
            for (let d = 1; d <= 9; d++) {
                let placesForDigitInUnit = [];
                let digitAlreadyPlacedInUnit = false;
                for (const [r_coord, c_coord] of unitCellCoordinates) {
                    if (userGrid[r_coord]?.[c_coord]?.value === d) {
                        digitAlreadyPlacedInUnit = true;
                        break;
                    }
                    if (userGrid[r_coord]?.[c_coord]?.value === 0) {
                        const cellId = getCellId(r_coord, c_coord);
                        if (candidatesMap[cellId]?.has(d)) {
                            placesForDigitInUnit.push({ r: r_coord, c: c_coord, cellId });
                        }
                    }
                }
                if (!digitAlreadyPlacedInUnit && placesForDigitInUnit.length === 1) {
                    const { r, c, cellId } = placesForDigitInUnit[0];
                    if (DEBUG_SOLVER) console.log(`Killer Hidden Single: ${d} at ${cellId} in ${getUnitType(unitGlobalIndex)} ${getUnitIndexForDisplay(unitGlobalIndex)}`);
                    return { r, c, cellId, digit: d, technique: "Hidden Single" };
                }
            }
        }
        return null;
    }

    function findNakedPair(userGrid, candidatesMap) {
        const units = getAllUnitsIndices();
        for (let i = 0; i < units.length; i++) {
            const unitCoords = units[i];
            const cellsWith2Candidates = [];
            for (const [r, c] of unitCoords) {
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
                        // Check if c1.cands and c2.cands are identical sets
                        if (c1.cands.size === 2 && c2.cands.size === 2 &&
                            Array.from(c1.cands).every(digit => c2.cands.has(digit))) {
                            const pairDigits = Array.from(c1.cands);
                            const pairCells = [c1.cellId, c2.cellId];
                            const eliminations = [];
                            const pairCellsSet = new Set(pairCells);

                            for (const [r_unit, c_unit] of unitCoords) {
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
                                if (DEBUG_SOLVER) console.log(`Killer Naked Pair found: Digits ${pairDigits.join(',')} in cells ${pairCells.join(',')} in ${getUnitType(i)} ${getUnitIndexForDisplay(i)}`);
                                return { unitType: getUnitType(i), unitIndex: i, cells: pairCells, digits: pairDigits, technique: "Naked Pair", eliminations };
                            }
                        }
                    }
                }
            }
        }
        return null;
    }

    function findHiddenPair(userGrid, candidatesMap) {
        const units = getAllUnitsIndices();
        for (let i = 0; i < units.length; i++) {
            const unitCoords = units[i];
            const digitLocationsInUnit = {}; // digit -> Set of cellIds where it's a candidate
            for (let d = 1; d <= 9; d++) {
                digitLocationsInUnit[d] = new Set();
            }

            let unitHasFilledCellsWithPairDigits = false; // Pre-check

            for (const [r, c] of unitCoords) {
                const cellId = getCellId(r, c);
                if (userGrid[r]?.[c]?.value === 0 && candidatesMap[cellId]) {
                    candidatesMap[cellId].forEach(digit => {
                        digitLocationsInUnit[digit].add(cellId);
                    });
                } else if (userGrid[r]?.[c]?.value !== 0) {
                    // If a digit that could form a pair is already placed, this path is less likely for hidden pair
                }
            }

            const digitsOccurringInExactlyTwoCells = [];
            for (let d = 1; d <= 9; d++) {
                if (digitLocationsInUnit[d].size === 2) {
                    // Check if d is already placed in the unit
                    let d_is_placed = false;
                    for (const [r_val, c_val] of unitCoords) {
                        if (userGrid[r_val]?.[c_val]?.value === d) {
                            d_is_placed = true;
                            break;
                        }
                    }
                    if (!d_is_placed) {
                         digitsOccurringInExactlyTwoCells.push({ digit: d, locations: digitLocationsInUnit[d] });
                    }
                }
            }

            if (digitsOccurringInExactlyTwoCells.length >= 2) {
                for (let j = 0; j < digitsOccurringInExactlyTwoCells.length; j++) {
                    for (let k = j + 1; k < digitsOccurringInExactlyTwoCells.length; k++) {
                        const d1Info = digitsOccurringInExactlyTwoCells[j];
                        const d2Info = digitsOccurringInExactlyTwoCells[k];

                        // Check if locations sets are identical
                        const d1Locs = d1Info.locations;
                        const d2Locs = d2Info.locations;
                        if (d1Locs.size === 2 && d2Locs.size === 2 &&
                            Array.from(d1Locs).every(loc => d2Locs.has(loc))) {
                            const pairDigits = [d1Info.digit, d2Info.digit].sort((a, b) => a - b);
                            const pairCells = Array.from(d1Locs); // Both share same two locations
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
                                if (DEBUG_SOLVER) console.log(`Killer Hidden Pair found: Digits ${pairDigits.join(',')} in cells ${pairCells.join(',')} in ${getUnitType(i)} ${getUnitIndexForDisplay(i)}`);
                                return { unitType: getUnitType(i), unitIndex: i, cells: pairCells, digits: pairDigits, technique: "Hidden Pair", eliminations };
                            }
                        }
                    }
                }
            }
        }
        return null;
    }

    function findNakedTriple(userGrid, candidatesMap) {
        const units = getAllUnitsIndices();
        for (let i = 0; i < units.length; i++) {
            const unitCoords = units[i];
            const candidateCellsInUnit = []; // Cells with 2 or 3 candidates
            for (const [r, c] of unitCoords) {
                const cellId = getCellId(r, c);
                if (userGrid[r]?.[c]?.value === 0 && candidatesMap[cellId]) {
                    const cands = candidatesMap[cellId];
                    if (cands.size === 2 || cands.size === 3) {
                        candidateCellsInUnit.push({ r, c, cands, cellId });
                    }
                }
            }

            if (candidateCellsInUnit.length >= 3) {
                for (let j = 0; j < candidateCellsInUnit.length; j++) {
                    for (let k = j + 1; k < candidateCellsInUnit.length; k++) {
                        for (let l = k + 1; l < candidateCellsInUnit.length; l++) {
                            const c1 = candidateCellsInUnit[j], c2 = candidateCellsInUnit[k], c3 = candidateCellsInUnit[l];
                            const tripleCellsSet = new Set([c1.cellId, c2.cellId, c3.cellId]);
                            const combinedCands = new Set([...c1.cands, ...c2.cands, ...c3.cands]);

                            if (combinedCands.size === 3) { // Found a naked triple
                                const tripleDigits = Array.from(combinedCands).sort((a, b) => a - b);
                                const eliminations = [];

                                for (const [r_unit, c_unit] of unitCoords) {
                                    const cellId_unit = getCellId(r_unit, c_unit);
                                    if (cellId_unit && !tripleCellsSet.has(cellId_unit) && userGrid[r_unit]?.[c_unit]?.value === 0) {
                                        const notesInOtherCell = candidatesMap[cellId_unit];
                                        if (notesInOtherCell) {
                                            notesInOtherCell.forEach(cand => {
                                                if (tripleDigits.includes(cand)) {
                                                    eliminations.push({ cellId: cellId_unit, digit: cand });
                                                }
                                            });
                                        }
                                    }
                                }
                                if (eliminations.length > 0) {
                                    if (DEBUG_SOLVER) console.log(`Killer Naked Triple found: Digits ${tripleDigits.join(',')} in cells ${Array.from(tripleCellsSet).join(',')} in ${getUnitType(i)} ${getUnitIndexForDisplay(i)}`);
                                    return { unitType: getUnitType(i), unitIndex: i, cells: Array.from(tripleCellsSet), digits: tripleDigits, technique: "Naked Triple", eliminations };
                                }
                            }
                        }
                    }
                }
            }
        }
        return null;
    }

    function findHiddenTriple(userGrid, candidatesMap) {
        const units = getAllUnitsIndices();
        for (let i = 0; i < units.length; i++) {
            const unitCoords = units[i];
            const digitLocationsInUnit = {}; // digit -> Set of cellIds
            for (let d = 1; d <= 9; d++) {
                digitLocationsInUnit[d] = new Set();
            }
            // Check if any of the potential triple digits are already placed in the unit
            let placedInUnit = new Set();
            for (const [r,c] of unitCoords) {
                if (userGrid[r]?.[c]?.value !== 0) {
                    placedInUnit.add(userGrid[r][c].value);
                }
            }


            for (const [r, c] of unitCoords) {
                const cellId = getCellId(r, c);
                if (userGrid[r]?.[c]?.value === 0 && candidatesMap[cellId]) {
                    candidatesMap[cellId].forEach(digit => {
                        if (!placedInUnit.has(digit)) { // Only consider digits not already placed
                           digitLocationsInUnit[digit].add(cellId);
                        }
                    });
                }
            }

            const potentialTripleDigits = Object.keys(digitLocationsInUnit)
                .map(d => parseInt(d))
                .filter(d => digitLocationsInUnit[d].size === 2 || digitLocationsInUnit[d].size === 3);

            if (potentialTripleDigits.length >= 3) {
                for (let j = 0; j < potentialTripleDigits.length; j++) {
                    for (let k = j + 1; k < potentialTripleDigits.length; k++) {
                        for (let l = k + 1; l < potentialTripleDigits.length; l++) {
                            const d1 = potentialTripleDigits[j];
                            const d2 = potentialTripleDigits[k];
                            const d3 = potentialTripleDigits[l];
                            const tripleDigits = [d1, d2, d3].sort((a, b) => a - b);

                            const combinedCellsForTriple = new Set([...digitLocationsInUnit[d1], ...digitLocationsInUnit[d2], ...digitLocationsInUnit[d3]]);

                            if (combinedCellsForTriple.size === 3) { // These three digits are confined to these three cells
                                const tripleCells = Array.from(combinedCellsForTriple);
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
                                    if (DEBUG_SOLVER) console.log(`Killer Hidden Triple found: Digits ${tripleDigits.join(',')} in cells ${tripleCells.join(',')} in ${getUnitType(i)} ${getUnitIndexForDisplay(i)}`);
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
            const unitCoords = allUnits[unitIndex]; // Array of [r,c] for the current unit
            const unitCellIdsSet = new Set(unitCoords.map(([r,c]) => getCellId(r,c)).filter(id => id));

            for (let d = 1; d <= 9; d++) { // For each digit
                let possibleLocationsForDigitInUnit = [];
                let involvedCageIds = new Set(); // Store actual cage IDs
                let digitAlreadyPlacedInUnit = false;

                for (const [r_coord, c_coord] of unitCoords) {
                    if (userGrid[r_coord][c_coord].value === d) {
                        digitAlreadyPlacedInUnit = true;
                        break;
                    }
                }
                if (digitAlreadyPlacedInUnit) continue; // Digit already placed, no Innie for this digit in this unit

                for (const [r_coord, c_coord] of unitCoords) {
                    const cellId = getCellId(r_coord, c_coord);
                    if (userGrid[r_coord][c_coord].value === 0 && candidatesMap[cellId]?.has(d)) {
                        possibleLocationsForDigitInUnit.push(cellId);
                        const cageId = solverData.cellToCageMap[cellId];
                        if (cageId !== undefined) { // cageId here is the actual ID of the cage
                            involvedCageIds.add(cageId);
                        } else { // Cell in unit not part of any cage? This implies an issue with cage data.
                            involvedCageIds.add(null); // Mark that some locations are not in a cage
                        }
                    }
                }

                if (possibleLocationsForDigitInUnit.length > 0 && involvedCageIds.size === 1) {
                    const targetCageId = involvedCageIds.values().next().value;
                    if (targetCageId === null) continue; // All locations for d in unit are outside cages (or error)

                    const targetCage = solverData.cageDataArray.find(c => c.id === targetCageId);
                    if (!targetCage) continue;

                    const eliminations = [];
                    for (const cageCellId of targetCage.cells) {
                        if (!unitCellIdsSet.has(cageCellId)) { // Cell is in the target cage BUT NOT in the current unit
                            const coords = getCellCoords(cageCellId);
                            if (coords && userGrid[coords.r][coords.c].value === 0 && candidatesMap[cageCellId]?.has(d)) {
                                eliminations.push({ cellId: cageCellId, digit: d });
                            }
                        }
                    }
                    if (eliminations.length > 0) {
                        if (DEBUG_SOLVER) console.log(`Killer Innie found: Digit ${d} in ${getUnitType(unitIndex)} ${getUnitIndexForDisplay(unitIndex)} confined to cage ${targetCage.id}. Eliminating from ${eliminations.map(e=>e.cellId).join(',')}.`);
                        return { technique: "Innie", digit: d, unitType: getUnitType(unitIndex) , unitDisplayIndex: getUnitIndexForDisplay(unitIndex), cageId: targetCage.id, eliminations: eliminations };
                    }
                }
            }
        }
        return null;
    }


    function findOutieStep(userGrid, candidatesMap, solverData) {
        if (!userGrid || !solverData?.cageDataArray) return null;

        for (const cage of solverData.cageDataArray) {
            if (!cage.cells || cage.cells.length < 2) continue; // Outies need at least 2 cells in a cage

            for (let d = 1; d <= 9; d++) { // For each digit
                const possibleLocationsForDigitInCage = [];
                let digitAlreadyPlacedInCage = false;
                for (const cellId of cage.cells) {
                     const coords = getCellCoords(cellId);
                     if (!coords) continue;
                     if (userGrid[coords.r][coords.c].value === d) {
                         digitAlreadyPlacedInCage = true;
                         break;
                     }
                     if (userGrid[coords.r][coords.c].value === 0 && candidatesMap[cellId]?.has(d)) {
                        possibleLocationsForDigitInCage.push({ id: cellId, r: coords.r, c: coords.c });
                    }
                }
                if (digitAlreadyPlacedInCage || possibleLocationsForDigitInCage.length < 1) continue;


                const cageCellIdsSet = new Set(cage.cells);

                // Check confinement to Row
                let confinedToRow = true;
                let targetRowIndex = possibleLocationsForDigitInCage[0].r;
                for (let i = 1; i < possibleLocationsForDigitInCage.length; i++) {
                    if (possibleLocationsForDigitInCage[i].r !== targetRowIndex) { confinedToRow = false; break; }
                }
                if (confinedToRow) {
                    const eliminations = [];
                    const rowUnitCoords = getRowIndices(targetRowIndex);
                    for (const [r,c] of rowUnitCoords) {
                        const unitCellId = getCellId(r,c);
                        if (unitCellId && !cageCellIdsSet.has(unitCellId) && userGrid[r][c].value === 0 && candidatesMap[unitCellId]?.has(d)) {
                            eliminations.push({cellId: unitCellId, digit: d});
                        }
                    }
                    if (eliminations.length > 0) {
                        if (DEBUG_SOLVER) console.log(`Killer Outie (Row) found: Digit ${d} in cage ${cage.id} confined to row ${targetRowIndex+1}. Eliminating from ${eliminations.map(e=>e.cellId).join(',')}.`);
                        return { technique: "Outie (Row)", digit: d, cageId: cage.id, unitType: 'Row', unitIndex: targetRowIndex, eliminations: eliminations };
                    }
                }

                // Check confinement to Column
                let confinedToCol = true;
                let targetColIndex = possibleLocationsForDigitInCage[0].c;
                for (let i = 1; i < possibleLocationsForDigitInCage.length; i++) {
                    if (possibleLocationsForDigitInCage[i].c !== targetColIndex) { confinedToCol = false; break; }
                }
                if (confinedToCol) {
                    const eliminations = [];
                    const colUnitCoords = getColIndices(targetColIndex);
                    for (const [r,c] of colUnitCoords) {
                        const unitCellId = getCellId(r,c);
                        if (unitCellId && !cageCellIdsSet.has(unitCellId) && userGrid[r][c].value === 0 && candidatesMap[unitCellId]?.has(d)) {
                            eliminations.push({cellId: unitCellId, digit: d});
                        }
                    }
                    if (eliminations.length > 0) {
                        if (DEBUG_SOLVER) console.log(`Killer Outie (Col) found: Digit ${d} in cage ${cage.id} confined to col ${targetColIndex+1}. Eliminating from ${eliminations.map(e=>e.cellId).join(',')}.`);
                        return { technique: "Outie (Col)", digit: d, cageId: cage.id, unitType: 'Col', unitIndex: targetColIndex, eliminations: eliminations };
                    }
                }

                // Check confinement to Block
                let confinedToBlock = true;
                let targetBlockIndex = Math.floor(possibleLocationsForDigitInCage[0].r / 3) * 3 + Math.floor(possibleLocationsForDigitInCage[0].c / 3);
                for (let i = 1; i < possibleLocationsForDigitInCage.length; i++) {
                    const currentBlock = Math.floor(possibleLocationsForDigitInCage[i].r / 3) * 3 + Math.floor(possibleLocationsForDigitInCage[i].c / 3);
                    if (currentBlock !== targetBlockIndex) { confinedToBlock = false; break; }
                }
                if (confinedToBlock) {
                    const eliminations = [];
                    const blockUnitCoords = getBlockIndices(targetBlockIndex);
                    for (const [r,c] of blockUnitCoords) {
                        const unitCellId = getCellId(r,c);
                        if (unitCellId && !cageCellIdsSet.has(unitCellId) && userGrid[r][c].value === 0 && candidatesMap[unitCellId]?.has(d)) {
                            eliminations.push({cellId: unitCellId, digit: d});
                        }
                    }
                    if (eliminations.length > 0) {
                        if (DEBUG_SOLVER) console.log(`Killer Outie (Block) found: Digit ${d} in cage ${cage.id} confined to block ${targetBlockIndex}. Eliminating from ${eliminations.map(e=>e.cellId).join(',')}.`);
                        return { technique: "Outie (Block)", digit: d, cageId: cage.id, unitType: 'Block', unitIndex: targetBlockIndex, eliminations: eliminations };
                    }
                }
            }
        }
        return null;
    }


    function findSumCombinationsRecursive(emptyCells, cellIndex, targetSum, currentCombo, placedDigitsInCageSoFar, results) {
        if (cellIndex === emptyCells.length) {
            if (targetSum === 0) {
                results.push([...currentCombo]);
            }
            return;
        }

        const currentCell = emptyCells[cellIndex];
        const candidatesForCurrentCell = Array.from(currentCell.cands); // Candidates for this specific cell

        // Optimization: Pruning based on min/max possible sum for remaining cells
        let minPossibleSumForRemaining = 0;
        let maxPossibleSumForRemaining = 0;
        const tempUsedDigits = new Set([...currentCombo, ...placedDigitsInCageSoFar]);

        for (let i = cellIndex; i < emptyCells.length; i++) {
            const remainingCellCands = Array.from(emptyCells[i].cands);
            let minDigitForCell = 10;
            let maxDigitForCell = 0;
            let foundCandForCell = false;

            for (const cand of remainingCellCands) {
                if (!tempUsedDigits.has(cand)) { // Check against combo being built for *this path*
                    minDigitForCell = Math.min(minDigitForCell, cand);
                    maxDigitForCell = Math.max(maxDigitForCell, cand);
                    foundCandForCell = true;
                }
            }
            if (!foundCandForCell && emptyCells.length - i > 0) return; // No valid cand for a future cell in this path

            minPossibleSumForRemaining += minDigitForCell; // This assumes we pick the smallest available unique
            maxPossibleSumForRemaining += maxDigitForCell; // This assumes we pick the largest available unique

            // This is a simplification; true min/max requires assigning unique digits.
            // For more accurate pruning, one would use a small backtracking for min/max sum of remaining.
            // However, this simpler check can still prune some branches.
        }
        // The simple sum check is ok if we are careful. The current logic is more about sum of available candidates
        // than ensuring uniqueness across *future* cells in this check. True pruning is harder.

        for (const digit of candidatesForCurrentCell) {
            if (!currentCombo.includes(digit) && !placedDigitsInCageSoFar.has(digit)) {
                if (targetSum - digit >= 0) { // Potential for this digit
                    // Check if sum can be achieved with remaining cells
                    if (emptyCells.length - (cellIndex + 1) === 0) { // If this is the last cell to fill
                        if (targetSum - digit === 0) {
                             // Valid
                        } else {
                            continue; // Sum won't match
                        }
                    } else {
                        // More complex check for remaining sum with remaining cells
                        const remainingCellsCountForCheck = emptyCells.length - (cellIndex + 1);
                        const tempPlacedAndCurrentCombo = new Set([...currentCombo, digit, ...placedDigitsInCageSoFar]);
                        let minSumNext = 0;
                        let tempDigits = [];
                        for(let x=1; x<=9 && tempDigits.length < remainingCellsCountForCheck; ++x){
                            if(!tempPlacedAndCurrentCombo.has(x)) tempDigits.push(x);
                        }
                        if(tempDigits.length < remainingCellsCountForCheck && remainingCellsCountForCheck > 0) continue; // Not enough unique digits left
                        for(let i=0; i<remainingCellsCountForCheck; ++i) minSumNext += tempDigits[i];


                        if (targetSum - digit < minSumNext && remainingCellsCountForCheck > 0) {
                             continue;
                        }
                        // Max sum check can also be added
                    }


                    currentCombo.push(digit);
                    // No need to add to placedDigitsInCageSoFar, as currentCombo handles uniqueness within the combo
                    findSumCombinationsRecursive(
                        emptyCells,
                        cellIndex + 1,
                        targetSum - digit,
                        currentCombo,
                        placedDigitsInCageSoFar, // Pass this unchanged
                        results
                    );
                    currentCombo.pop();
                }
            }
        }
    }


    function findCageCombinationCheck(userGrid, candidatesMap, solverData) {
        if (!userGrid || !solverData?.cageDataArray) return null;

        const allEliminationsFound = [];

        for (const cage of solverData.cageDataArray) {
            if (!cage || !cage.cells || cage.cells.length === 0) continue; // Skip empty or invalid cages

            let currentSumOfPlacedValues = 0;
            const emptyCellsInCageData = []; // {id: cellId, cands: Set<number>}
            const digitsAlreadyPlacedInCage = new Set();
            let isCageStateValid = true;

            for (const cellId of cage.cells) {
                const coords = getCellCoords(cellId);
                if (!coords || !userGrid[coords.r]?.[coords.c]) { isCageStateValid = false; break; }
                const cellData = userGrid[coords.r][coords.c];
                const cellValue = cellData.value;

                if (cellValue !== 0) {
                    if (digitsAlreadyPlacedInCage.has(cellValue)) { // Duplicate in cage
                        isCageStateValid = false; break;
                    }
                    digitsAlreadyPlacedInCage.add(cellValue);
                    currentSumOfPlacedValues += cellValue;
                } else {
                    const candidates = candidatesMap[cellId];
                    if (!candidates || candidates.size === 0) { // Empty cell with no candidates
                        isCageStateValid = false; break;
                    }
                    emptyCellsInCageData.push({ id: cellId, cands: new Set(candidates) }); // Use a copy
                }
            }
            if (!isCageStateValid) continue; // Problem with this cage's current state

            const targetRemainingSum = cage.sum - currentSumOfPlacedValues;
            const countOfEmptyCellsInCage = emptyCellsInCageData.length;

            if (countOfEmptyCellsInCage === 0) { // All cells in cage are filled
                if (targetRemainingSum !== 0) { /* console.warn(`Cage ${cage.id} filled, but sum mismatch.`); */ }
                continue;
            }
            if (targetRemainingSum <= 0 && countOfEmptyCellsInCage > 0) { // Sum already met or exceeded, but cells remain
                /* console.warn(`Cage ${cage.id} sum ${targetRemainingSum} non-positive for ${countOfEmptyCellsInCage} cells.`);*/
                continue;
            }


            const validCombinationsForCage = [];
            findSumCombinationsRecursive(emptyCellsInCageData, 0, targetRemainingSum, [], digitsAlreadyPlacedInCage, validCombinationsForCage);

            if (validCombinationsForCage.length === 0 && countOfEmptyCellsInCage > 0) {
                // This means no way to fill the remaining cells to meet the sum.
                // This could indicate an error in the puzzle or prior solver steps.
                // Or, if this technique is meant to find "impossible" states, this is a finding.
                // For now, we assume it means we can't make eliminations based on *valid* combos.
                // console.warn(`Cage ${cage.id}: No valid combinations for sum ${targetRemainingSum} in ${countOfEmptyCellsInCage} cells with current candidates.`);
                continue;
            }

            // Determine which candidates from empty cells actually participate in any valid combination
            const candidatesThatCanBeUsed = new Map(); // cellId -> Set of digits used in any combo
            emptyCellsInCageData.forEach(cell => candidatesThatCanBeUsed.set(cell.id, new Set()));

            validCombinationsForCage.forEach(combo => {
                combo.forEach((digit, index) => { // `index` corresponds to emptyCellsInCageData index
                    const cellId = emptyCellsInCageData[index].id;
                    candidatesThatCanBeUsed.get(cellId)?.add(digit);
                });
            });

            // Find eliminations: original candidates minus those that can be used
            emptyCellsInCageData.forEach(cellData => {
                const originalCellCandidates = candidatesMap[cellData.id]; // Original candidates for this cell
                const usableCandidatesForCell = candidatesThatCanBeUsed.get(cellData.id);

                if (originalCellCandidates && usableCandidatesForCell) {
                    originalCellCandidates.forEach(cand => {
                        if (!usableCandidatesForCell.has(cand)) {
                            allEliminationsFound.push({ cellId: cellData.id, digit: cand });
                        }
                    });
                }
            });
        }

        if (allEliminationsFound.length > 0) {
            // Remove duplicate eliminations if any (e.g. from overlapping logic if not careful)
            const uniqueEliminationsMap = new Map();
            allEliminationsFound.forEach(elim => {
                const key = `${elim.cellId}-${elim.digit}`;
                if (!uniqueEliminationsMap.has(key)) {
                    uniqueEliminationsMap.set(key, elim);
                }
            });
            const uniqueEliminations = Array.from(uniqueEliminationsMap.values());

            if (DEBUG_SOLVER) console.log(`Cage Combination Check found ${uniqueEliminations.length} eliminations.`);
            return {
                technique: "Cage Combination Check",
                eliminations: uniqueEliminations,
            };
        }

        return null;
    }


    // --- Функции применения техник (applyFunc) ---

    function applyFoundSingle(foundInfo, userGrid, currentCandidatesMap, renderCellCallback) {
        const { r, c, cellId, digit } = foundInfo;
        if (userGrid[r][c].value === 0) { // Apply only if cell is actually empty
            userGrid[r][c].value = digit;
            userGrid[r][c].isSolved = true; // Mark as solved by logic
            userGrid[r][c].notes.clear();   // Clear any user notes
            currentCandidatesMap[cellId] = new Set(); // No candidates left for this cell
            renderCellCallback(r, c, digit, new Set()); // Update UI to show value and clear notes
            if (DEBUG_SOLVER) console.log(`Applied Single: ${digit} to ${cellId}`);
            return true;
        }
        return false; // Cell was already filled
    }

    function applyElimination(foundInfo, userGrid, currentCandidatesMap, renderCellCallback) {
        let anyChangeApplied = false;
        const eliminations = foundInfo.eliminations;
        if (!eliminations || eliminations.length === 0) return false;

        for (const elim of eliminations) {
            const { cellId, digit } = elim;
            const coords = getCellCoords(cellId);
            if (coords && userGrid[coords.r][coords.c].value === 0 && currentCandidatesMap[cellId]?.has(digit)) {
                currentCandidatesMap[cellId].delete(digit);
                anyChangeApplied = true;
                // Update UI notes for this cell
                renderCellCallback(coords.r, coords.c, null, currentCandidatesMap[cellId]);
                // if (DEBUG_SOLVER) console.log(`Eliminated ${digit} from ${cellId} due to ${foundInfo.technique}`);
            }
        }
        return anyChangeApplied;
    }

    // For Naked/Hidden Groups, the apply function is essentially applyElimination
    function applyNakedGroupElimination(foundInfo, userGrid, currentCandidatesMap, renderCellCallback) {
        return applyElimination(foundInfo, userGrid, currentCandidatesMap, renderCellCallback);
    }

    function applyHiddenGroupElimination(foundInfo, userGrid, currentCandidatesMap, renderCellCallback) {
        return applyElimination(foundInfo, userGrid, currentCandidatesMap, renderCellCallback);
    }


    function doKillerLogicStep(userGrid, currentCandidatesMap, solverData, updateCandidatesCallback, renderCellCallback) {
        let appliedStepInfo = null;

        // --- 0. Special Case: Single-Cell Cages ---
        if (solverData && solverData.cageDataArray) {
            for (const cage of solverData.cageDataArray) {
                if (cage.cells.length === 1) {
                    const cellId = cage.cells[0];
                    const coords = getCellCoords(cellId);
                    if (coords && userGrid[coords.r][coords.c].value === 0) {
                        const expectedDigit = cage.sum;
                        if (expectedDigit >= 1 && expectedDigit <= 9) {
                             // Check if this digit is a valid candidate (it should be if puzzle is valid)
                             if (currentCandidatesMap[cellId]?.has(expectedDigit) || currentCandidatesMap[cellId] === undefined) {
                                // If undefined, it means candidates weren't calculated yet for this cell, assume ok
                                appliedStepInfo = { r: coords.r, c: coords.c, cellId, digit: expectedDigit, technique: "Single Cage Rule" };
                                const appliedSuccessfully = applyFoundSingle(appliedStepInfo, userGrid, currentCandidatesMap, renderCellCallback);
                                if (appliedSuccessfully) {
                                    if (DEBUG_SOLVER) console.log(`Killer Applied Single Cage Rule: ${expectedDigit} to ${cellId}.`);
                                    updateCandidatesCallback(); // Full recalculation after any change
                                    return appliedStepInfo;
                                }
                             }
                        }
                    }
                }
            }
        }

        const techniques = [
            { name: "Naked Single", findFunc: findNakedSingle, applyFunc: applyFoundSingle },
            { name: "Hidden Single", findFunc: findHiddenSingle, applyFunc: applyFoundSingle },
            { name: "Cage Combination Check", findFunc: findCageCombinationCheck, applyFunc: applyElimination }, // Can be powerful
            { name: "Naked Pair", findFunc: findNakedPair, applyFunc: applyNakedGroupElimination },
            { name: "Hidden Pair", findFunc: findHiddenPair, applyFunc: applyHiddenGroupElimination },
            { name: "Innie", findFunc: findInnieStep, applyFunc: applyElimination }, // Killer specific
            { name: "Outie", findFunc: findOutieStep, applyFunc: applyElimination }, // Killer specific
            { name: "Naked Triple", findFunc: findNakedTriple, applyFunc: applyNakedGroupElimination },
            { name: "Hidden Triple", findFunc: findHiddenTriple, applyFunc: applyHiddenGroupElimination },
            // More advanced techniques can be added here
        ];

        for (const tech of techniques) {
            if (DEBUG_SOLVER) console.log(`Killer Searching ${tech.name}...`);
            // Some findFuncs might need solverData, others not. Pass consistently.
            let foundInfo = tech.findFunc(userGrid, currentCandidatesMap, solverData);

            if (foundInfo) {
                let appliedSuccessfully = false;
                // applyFunc signature is consistent for singles vs eliminations
                appliedSuccessfully = tech.applyFunc(foundInfo, userGrid, currentCandidatesMap, renderCellCallback);

                if (appliedSuccessfully) {
                    appliedStepInfo = { ...foundInfo, appliedTechnique: tech.name }; // Add appliedTechnique to return
                    if (DEBUG_SOLVER) console.log(`Killer Applied ${tech.name}.`);
                    updateCandidatesCallback(); // Recalculate ALL candidates after a change
                    return appliedStepInfo;
                } else {
                    if (DEBUG_SOLVER && foundInfo.eliminations && foundInfo.eliminations.length > 0) {
                        // console.log(`Found ${tech.name} with potential eliminations, but none were new/applied.`);
                    } else if (DEBUG_SOLVER && foundInfo.digit) {
                        // console.log(`Found ${tech.name} for a single, but cell was already filled or no change.`);
                    }
                }
            }
        }

        if (!appliedStepInfo && DEBUG_SOLVER) {
            // console.log("No effective Killer logic step found in this cycle.");
        }

        return appliedStepInfo; // Null if nothing was applied
    }


    // --- Публичный интерфейс модуля ---\
    return {
        calculateKillerCandidates,    // For single cell
        calculateAllKillerCandidates, // For all cells
        doKillerLogicStep,
        resetPeersCache,
        // Export utils if script.js or other modules need them (getCellCoords is used by script.js)
        getCellCoords,
        getCellId,
        // getRowIndices, getColIndices, getBlockIndices, getUnitType, getUnitIndexForDisplay, getClassicPeers // If needed
    };

})();
