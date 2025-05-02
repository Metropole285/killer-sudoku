// killerSolverLogic.js

/**
 * Логика для интерактивного пошагового решателя Killer Sudoku.
 * Работает с представлением данных из script.js (userGrid, currentCandidatesMap).
 * Учитывает правила Killer Sudoku при вычислении кандидатов.
 */
const killerSolverLogic = (() => {

    // --- Вспомогательные функции (могут быть скопированы из script.js или импортированы) ---
    // Для краткости предположим, что эти функции доступны глобально или передаются
    // getCellId, getCellCoords, getClassicPeers, getRowIndices, getColIndices, getBlockIndices,
    // getAllUnitsIndices, getUnitType, getUnitIndexForDisplay, getUnitIndices

    /**
     * Вычисляет кандидатов для ОДНОЙ ячейки, учитывая КЛАССИЧЕСКИЕ и KILLER правила.
     * @param {number} r - Строка ячейки (0-8)
     * @param {number} c - Столбец ячейки (0-8)
     * @param {Array<Array<object>>} userGrid - Текущая сетка пользователя
     * @param {object} solverData - Данные Killer Sudoku ({ cellToCageMap, cageDataArray })
     * @returns {Set<number>} - Множество возможных кандидатов для ячейки
     */
    function calculateKillerCandidates(r, c, userGrid, solverData) {
        const cellId = getCellId(r, c);
        if (!cellId || !userGrid[r]?.[c] || userGrid[r][c].value !== 0) {
            return new Set(); // Возвращаем пустой Set для заполненных или невалидных
        }

        let candidates = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);

        // 1. Классические исключения (пиры)
        for (let i = 0; i < 9; i++) {
            if (userGrid[r]?.[i]?.value !== 0) candidates.delete(userGrid[r][i].value); // Строка
            if (userGrid[i]?.[c]?.value !== 0) candidates.delete(userGrid[i][c].value); // Столбец
        }
        const startRow = Math.floor(r / 3) * 3;
        const startCol = Math.floor(c / 3) * 3;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if (userGrid[startRow + i]?.[startCol + j]?.value !== 0) {
                    candidates.delete(userGrid[startRow + i][startCol + j].value); // Блок
                }
            }
        }

        // 2. Исключения Killer Sudoku (клетка)
        if (solverData && solverData.cellToCageMap && solverData.cageDataArray) {
            const cageIndex = solverData.cellToCageMap[cellId];
            if (cageIndex !== undefined) {
                const cage = solverData.cageDataArray[cageIndex];
                if (cage) {
                    let currentCageSum = 0;
                    let emptyCellsInCage = [];
                    let placedDigitsInCage = new Set();

                    // Собираем информацию о текущем состоянии клетки
                    for (const cageCellId of cage.cells) {
                        const coords = getCellCoords(cageCellId);
                        if (coords && userGrid[coords.r]?.[coords.c]) {
                            const cellValue = userGrid[coords.r][coords.c].value;
                            if (cellValue !== 0) {
                                // Удаляем уже размещенные в клетке цифры из кандидатов НАШЕЙ ячейки
                                candidates.delete(cellValue);
                                // Собираем информацию для расчета оставшейся суммы/комбинаций
                                currentCageSum += cellValue;
                                placedDigitsInCage.add(cellValue);
                            } else {
                                emptyCellsInCage.push(cageCellId);
                            }
                        }
                    }

                    // Рассчитываем оставшуюся сумму и количество пустых ячеек
                    const remainingSum = cage.sum - currentCageSum;
                    const remainingCellsCount = emptyCellsInCage.length;

                    if (remainingCellsCount > 0 && remainingSum >= 0) {
                         // Получаем ИНФОРМАЦИЮ о возможных комбинациях для ОСТАВШИХСЯ пустых ячеек
                        const combinationInfo = killerSudoku.getSumCombinationInfo(remainingSum, remainingCellsCount);

                        if (combinationInfo) {
                            // Определяем цифры, которые *должны* быть среди оставшихся пустых ячеек
                            // Это цифры из combinationInfo.digitMask, которых еще нет в placedDigitsInCage
                            let possibleCandidatesForRemaining = new Set();
                            for (let d = 1; d <= 9; d++) {
                                if ((combinationInfo.digitMask & killerSudoku.DIGIT_MASKS[d]) !== 0 && !placedDigitsInCage.has(d)) {
                                    possibleCandidatesForRemaining.add(d);
                                }
                            }

                            // Оставляем в наших кандидатах только те, что ВХОДЯТ в набор возможных для оставшихся
                            candidates = new Set([...candidates].filter(cand => possibleCandidatesForRemaining.has(cand)));

                        } else {
                             // Если нет комбинаций для оставшейся суммы/количества - это противоречие,
                             // но для расчета кандидатов просто вернем пустой сет (или текущий, т.к. явного противоречия для *этой* ячейки нет)
                             // Для простоты оставим текущий набор кандидатов, проблема обнаружится позже.
                             // Но если remainingSum < 0 или combinationInfo === null (невозможная сумма), то кандидатов нет.
                             if (remainingSum < 0) {
                                 candidates.clear();
                             }
                        }
                    } else if (remainingCellsCount === 0 && remainingSum !== 0) {
                        // Клетка заполнена, но сумма неверна - противоречие
                         candidates.clear();
                    } else if (remainingSum < 0) {
                        // Сумма уже превышена - противоречие
                        candidates.clear();
                    }
                }
            }
        }

        return candidates;
    }

     /**
     * Пересчитывает кандидатов для ВСЕХ пустых ячеек в Killer-режиме.
     * @param {Array<Array<object>>} userGrid - Текущая сетка
     * @param {object} solverData - Данные Killer Sudoku
     * @returns {object} - Новая карта кандидатов { cellId: Set<number> }
     */
     function calculateAllKillerCandidates(userGrid, solverData) {
        const newMap = {};
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const cellId = getCellId(r, c);
                if (!cellId) continue;
                if (userGrid[r]?.[c]?.value === 0) {
                    newMap[cellId] = calculateKillerCandidates(r, c, userGrid, solverData);
                } else {
                    newMap[cellId] = new Set();
                }
            }
        }
        console.log("Killer Candidates map recalculated.");
        return newMap;
    }

    // --- Функции поиска техник (Адаптированные для Killer) ---

    // Naked Single (использует candidatesMap, созданную с учетом Killer-правил)
    function findNakedSingle(userGrid, candidatesMap) {
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const cellId = getCellId(r, c);
                if (userGrid[r]?.[c]?.value === 0 && candidatesMap[cellId]?.size === 1) {
                    const digit = candidatesMap[cellId].values().next().value;
                    console.log(`Killer Naked Single: ${digit} at [${r}, ${c}]`);
                    return { r, c, digit, technique: "Naked Single" };
                }
            }
        }
        return null;
    }

    // Hidden Single (использует candidatesMap, созданную с учетом Killer-правил)
     function findHiddenSingle(userGrid, candidatesMap) {
        for (let i = 0; i < 9; i++) {
            const rowRes = findHiddenSingleInUnit(getRowIndices(i), userGrid, candidatesMap);
            if (rowRes) return rowRes;
            const colRes = findHiddenSingleInUnit(getColIndices(i), userGrid, candidatesMap);
            if (colRes) return colRes;
            const blkRes = findHiddenSingleInUnit(getBlockIndices(i), userGrid, candidatesMap);
            if (blkRes) return blkRes;
        }
        return null;
    }

    function findHiddenSingleInUnit(unitIndices, userGrid, candidatesMap) {
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
                        places.push([r, c]);
                    }
                }
            }
            if (!presentInUnit && places.length === 1) {
                const [r, c] = places[0];
                console.log(`Killer Hidden Single: ${d} at [${r}, ${c}]`);
                return { r, c, digit: d, technique: "Hidden Single" };
            }
        }
        return null;
    }

    // Naked Pair (использует candidatesMap, созданную с учетом Killer-правил)
    function findNakedPair(userGrid, candidatesMap) {
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
                         if (c1.cands.size === 2 && c2.cands.size === 2) { // Доп. проверка
                             let sameCandidates = true;
                             for (const digit of c1.cands) if (!c2.cands.has(digit)) { sameCandidates = false; break; }
                             if (sameCandidates) for (const digit of c2.cands) if (!c1.cands.has(digit)) { sameCandidates = false; break; } // Обратная проверка

                             if (sameCandidates) {
                                 const pairDigits = Array.from(c1.cands);
                                 const pairCells = [c1.cellId, c2.cellId];
                                 let eliminationNeeded = false;
                                 const pairCellsSet = new Set(pairCells);
                                 for (const [r_unit, c_unit] of unit) {
                                     const unitCellId = getCellId(r_unit, c_unit);
                                     if (unitCellId && !pairCellsSet.has(unitCellId) && userGrid[r_unit]?.[c_unit]?.value === 0) {
                                         const otherCands = candidatesMap[unitCellId];
                                         if (otherCands && (otherCands.has(pairDigits[0]) || otherCands.has(pairDigits[1]))) {
                                             eliminationNeeded = true;
                                             break;
                                         }
                                     }
                                 }
                                 if (eliminationNeeded) {
                                     console.log(`Killer Naked Pair found: Digits ${pairDigits.join(',')} in cells ${pairCells.join(',')}`);
                                     return { unitType: getUnitType(i), unitIndex: i, cells: pairCells, digits: pairDigits, technique: "Naked Pair" };
                                 }
                             }
                         }
                     }
                 }
             }
         }
         return null;
     }

     // Hidden Pair (использует candidatesMap, созданную с учетом Killer-правил)
     function findHiddenPair(userGrid, candidatesMap) {
         const units = getAllUnitsIndices();
         for (let i = 0; i < units.length; i++) {
             const unit = units[i];
             const digitLocations = {}; // { digit: [cellId1, cellId2, ...], ... }

             // Собираем локации для каждого кандидата в юните
             for (const [r, c] of unit) {
                 const cellId = getCellId(r, c);
                 if (userGrid[r]?.[c]?.value === 0 && candidatesMap[cellId]) {
                     candidatesMap[cellId].forEach(digit => {
                         if (!digitLocations[digit]) digitLocations[digit] = [];
                         digitLocations[digit].push(cellId);
                     });
                 }
             }

             // Ищем цифры, которые появляются ровно в 2 ячейках
             const digitsIn2Cells = Object.entries(digitLocations)
                                         .filter(([digit, locations]) => locations.length === 2)
                                         .map(([digit, locations]) => ({ digit: parseInt(digit), locations: new Set(locations) }));

             if (digitsIn2Cells.length >= 2) {
                 // Ищем пары таких цифр, которые находятся в одних и тех же 2 ячейках
                 for (let j = 0; j < digitsIn2Cells.length; j++) {
                     for (let k = j + 1; k < digitsIn2Cells.length; k++) {
                         const d1Info = digitsIn2Cells[j];
                         const d2Info = digitsIn2Cells[k];

                         // Проверяем, совпадают ли множества ячеек
                         if (d1Info.locations.size === 2 && d1Info.locations.size === d2Info.locations.size) {
                            const loc1Arr = Array.from(d1Info.locations);
                            const loc2Arr = Array.from(d2Info.locations);
                            if ((loc1Arr[0] === loc2Arr[0] && loc1Arr[1] === loc2Arr[1]) || (loc1Arr[0] === loc2Arr[1] && loc1Arr[1] === loc2Arr[0])) {
                                // Нашли Hidden Pair!
                                const pairDigits = [d1Info.digit, d2Info.digit];
                                const pairCells = loc1Arr; // [cellId1, cellId2]
                                let eliminationNeeded = false;

                                // Проверяем, есть ли у этих ячеек *другие* кандидаты для удаления
                                for (const cellId of pairCells) {
                                     const cellCands = candidatesMap[cellId];
                                     if (cellCands) {
                                        for(const cand of cellCands) {
                                            if (cand !== pairDigits[0] && cand !== pairDigits[1]) {
                                                eliminationNeeded = true;
                                                break;
                                            }
                                        }
                                     }
                                     if (eliminationNeeded) break;
                                }


                                if (eliminationNeeded) {
                                     console.log(`Killer Hidden Pair found: Digits ${pairDigits.join(',')} in cells ${pairCells.join(',')}`);
                                     return {
                                         unitType: getUnitType(i),
                                         unitIndex: i,
                                         cells: pairCells, // ID ячеек, где пара найдена
                                         digits: pairDigits, // Цифры, составляющие пару
                                         technique: "Hidden Pair"
                                     };
                                }
                            }
                         }
                     }
                 }
             }
         }
         return null;
     }


    // Naked Triple (использует candidatesMap, созданную с учетом Killer-правил)
    function findNakedTriple(userGrid, candidatesMap) {
        const units = getAllUnitsIndices();
        for (let i = 0; i < units.length; i++) {
            const unitIndices = units[i];
            const candidateCells = [];
            for (const [r, c] of unitIndices) {
                const cellId = getCellId(r, c);
                 if (userGrid[r]?.[c]?.value === 0 && candidatesMap[cellId]) {
                    const candidates = candidatesMap[cellId];
                    if (candidates && (candidates.size === 2 || candidates.size === 3)) {
                        candidateCells.push({ r, c, cands: candidates, cellId });
                    }
                }
            }
            if (candidateCells.length >= 3) {
                for (let j = 0; j < candidateCells.length; j++) {
                    for (let k = j + 1; k < candidateCells.length; k++) {
                        for (let l = k + 1; l < candidateCells.length; l++) {
                            const c1 = candidateCells[j], c2 = candidateCells[k], c3 = candidateCells[l];
                            const combinedCands = new Set([...c1.cands, ...c2.cands, ...c3.cands]);
                            if (combinedCands.size === 3) {
                                const tripleDigits = Array.from(combinedCands);
                                const tripleCells = [c1.cellId, c2.cellId, c3.cellId];
                                let eliminationNeeded = false;
                                const tripleCellsSet = new Set(tripleCells);
                                for (const [r_unit, c_unit] of unitIndices) {
                                    const cellId_unit = getCellId(r_unit, c_unit);
                                    if (cellId_unit && !tripleCellsSet.has(cellId_unit) && userGrid[r_unit]?.[c_unit]?.value === 0) {
                                        const notes = candidatesMap[cellId_unit];
                                        if (notes && (notes.has(tripleDigits[0]) || notes.has(tripleDigits[1]) || notes.has(tripleDigits[2]))) {
                                            eliminationNeeded = true;
                                            break;
                                        }
                                    }
                                }
                                if (eliminationNeeded) {
                                     console.log(`Killer Naked Triple found: Digits ${tripleDigits.join(',')} in cells ${tripleCells.join(',')}`);
                                    return { unitType: getUnitType(i), unitIndex: i, cells: tripleCells, digits: tripleDigits, technique: "Naked Triple" };
                                }
                            }
                        }
                    }
                }
            }
        }
        return null;
    }

    // Hidden Triple (использует candidatesMap, созданную с учетом Killer-правил)
    function findHiddenTriple(userGrid, candidatesMap) {
        const units = getAllUnitsIndices();
        for (let i = 0; i < units.length; i++) {
            const unit = units[i];
            const digitLocations = {}; // { digit: [cellId1, cellId2, ...], ... }

            for (const [r, c] of unit) {
                const cellId = getCellId(r, c);
                if (userGrid[r]?.[c]?.value === 0 && candidatesMap[cellId]) {
                    candidatesMap[cellId].forEach(digit => {
                        if (!digitLocations[digit]) digitLocations[digit] = [];
                        digitLocations[digit].push(cellId);
                    });
                }
            }

            // Находим кандидатов, которые появляются в 2 или 3 местах
            const potentialTripleDigits = Object.keys(digitLocations)
                .map(d => parseInt(d))
                .filter(d => digitLocations[d].length === 2 || digitLocations[d].length === 3);

            if (potentialTripleDigits.length >= 3) {
                 // Перебираем комбинации из 3 таких кандидатов
                 for (let j = 0; j < potentialTripleDigits.length; j++) {
                     for (let k = j + 1; k < potentialTripleDigits.length; k++) {
                         for (let l = k + 1; l < potentialTripleDigits.length; l++) {
                             const d1 = potentialTripleDigits[j];
                             const d2 = potentialTripleDigits[k];
                             const d3 = potentialTripleDigits[l];
                             const tripleDigits = [d1, d2, d3];

                             // Объединяем ячейки, где эти 3 кандидата могут быть
                             const combinedCells = new Set([...digitLocations[d1], ...digitLocations[d2], ...digitLocations[d3]]);

                             // Если таких ячеек ровно 3 - это Hidden Triple!
                             if (combinedCells.size === 3) {
                                 const tripleCells = Array.from(combinedCells);
                                 let eliminationNeeded = false;

                                 // Проверяем, есть ли в этих 3 ячейках *другие* кандидаты для удаления
                                 for (const cellId of tripleCells) {
                                     const cellCands = candidatesMap[cellId];
                                     if (cellCands) {
                                         for (const cand of cellCands) {
                                             if (!tripleDigits.includes(cand)) {
                                                 eliminationNeeded = true;
                                                 break;
                                             }
                                         }
                                     }
                                     if (eliminationNeeded) break;
                                 }

                                 if (eliminationNeeded) {
                                     console.log(`Killer Hidden Triple found: Digits ${tripleDigits.join(',')} in cells ${tripleCells.join(',')}`);
                                     return {
                                         unitType: getUnitType(i),
                                         unitIndex: i,
                                         cells: tripleCells, // ID ячеек тройки
                                         digits: tripleDigits, // Цифры тройки
                                         technique: "Hidden Triple"
                                     };
                                 }
                             }
                         }
                     }
                 }
             }
        }
        return null;
    }

    // --- Функции применения (общие для Classic/Killer в script.js) ---
    // Функции apply... остаются в script.js, так как они модифицируют
    // userGrid и вызывают renderCell, но им нужно передавать обновленную карту кандидатов.
    // Мы будем передавать callback для обновления карты из killerSolverLogic в script.js.

    /**
     * Применяет найденный Single. Обновляет userGrid и вызывает callback для обновления кандидатов.
     * @param {object} foundInfo - Информация о найденном шаге.
     * @param {Function} updateCandidatesCallback - Функция для обновления карты кандидатов (e.g., updateCandidatesOnSet).
     * @param {Function} renderCellCallback - Функция для перерисовки ячейки.
     * @returns {boolean} - Успешно ли применен шаг.
     */
     function applyFoundSingle(foundInfo, updateCandidatesCallback, renderCellCallback) {
         if (!foundInfo) return false;
         const { r, c, digit } = foundInfo;
         // Используем глобальный userGrid напрямую (или передаем как параметр)
         if (userGrid[r]?.[c]?.value === 0) {
             console.log(`Apply Single: [${r},${c}]=${digit}`);
             // pushHistoryState(); // История обрабатывается в вызывающей функции (doKillerLogicStep)
             userGrid[r][c].value = digit;
             if (userGrid[r][c].notes) {
                 userGrid[r][c].notes.clear();
             }
             if (updateCandidatesCallback) {
                 updateCandidatesCallback(r, c, digit); // Обновляем карту кандидатов
             }
             if (renderCellCallback) {
                  renderCellCallback(r, c); // Перерисовываем ячейку
             }

             // Визуальное выделение (остается в script.js)
             // ... (код для выделения) ...
             return true;
         } else {
             console.warn(`Tried apply Single ${digit} to already filled cell [${r},${c}]`);
             return false;
         }
     }


    /**
     * Применяет элиминацию для Naked Pair/Triple. Обновляет userGrid.notes и вызывает callback для обновления кандидатов.
     * @param {object} elimInfo - Информация о шаге.
     * @param {object} candidatesMap - Текущая карта кандидатов (для обновления).
     * @param {Function} renderCellCallback - Функция для перерисовки ячейки.
     * @returns {boolean} - Были ли сделаны элиминации.
     */
    function applyNakedGroupElimination(elimInfo, candidatesMap, renderCellCallback) {
        if (!elimInfo || !elimInfo.digits || !elimInfo.cells || elimInfo.unitIndex === undefined) return false;
        const { unitType, unitIndex, cells, digits, technique } = elimInfo;
        // console.log(`Apply ${technique} Elim: Digits ${digits.join(',')} in ${unitType} ${getUnitIndexForDisplay(unitIndex)}`);

        const unitIndices = getUnitIndices(unitIndex);
        if (!unitIndices) {
             console.error(`Could not get unit indices for global index ${unitIndex}`);
             return false;
        }
        const groupCellsSet = new Set(cells);
        let eliminatedSomething = false;

        // pushHistoryState(); // Обрабатывается в doKillerLogicStep

        for (const [r, c] of unitIndices) {
            const cellId = getCellId(r, c);
            if (cellId && !groupCellsSet.has(cellId) && userGrid[r]?.[c]?.value === 0) {
                const cellData = userGrid[r][c];
                const candidatesInMap = candidatesMap[cellId];
                let cellChanged = false;

                if (!cellData.notes) cellData.notes = new Set();

                digits.forEach(digit => {
                    let removedFromNotes = false;
                    let removedFromMap = false;

                    if (cellData.notes.has(digit)) {
                        cellData.notes.delete(digit);
                        removedFromNotes = true;
                        cellChanged = true;
                    }
                    if (candidatesInMap?.has(digit)) {
                        candidatesInMap.delete(digit); // Обновляем переданную карту напрямую
                        removedFromMap = true;
                        cellChanged = true;
                    }
                    if (removedFromNotes || removedFromMap) {
                        eliminatedSomething = true;
                         console.log(`  - Removed candidate ${digit} from ${cellId} (Naked Group)`);
                    }
                });
                if (cellChanged && renderCellCallback) {
                    renderCellCallback(r, c);
                }
            }
        }
        // Не откатываем историю здесь, т.к. она создается в doKillerLogicStep
        if (!eliminatedSomething) console.log(`No eliminations were made for ${technique}.`);
        return eliminatedSomething;
    }

     /**
      * Применяет элиминацию для Hidden Pair/Triple. Обновляет userGrid.notes и карту кандидатов.
      * @param {object} elimInfo - Информация о шаге.
      * @param {object} candidatesMap - Текущая карта кандидатов (для обновления).
      * @param {Function} renderCellCallback - Функция для перерисовки ячейки.
      * @returns {boolean} - Были ли сделаны элиминации.
      */
     function applyHiddenGroupElimination(elimInfo, candidatesMap, renderCellCallback) {
         if (!elimInfo || !elimInfo.digits || !elimInfo.cells) return false;
         const { cells, digits, technique } = elimInfo; // unitType/Index не нужны для применения
         // console.log(`Apply ${technique} Elim: Keep only ${digits.join(',')} in cells ${cells.join(',')}`);

         let eliminatedSomething = false;
         const digitsToKeep = new Set(digits);

         // pushHistoryState(); // Обрабатывается в doKillerLogicStep

         for (const cellId of cells) {
             const coords = getCellCoords(cellId);
             if (coords && userGrid[coords.r]?.[coords.c]?.value === 0) {
                 const cellData = userGrid[coords.r][coords.c];
                 const candidatesInMap = candidatesMap[cellId];
                 let cellChanged = false;

                 if (!cellData.notes) cellData.notes = new Set();
                 const notesBefore = new Set(cellData.notes); // Копия для сравнения

                 // Удаляем из заметок все, КРОМЕ цифр группы
                 cellData.notes.forEach(noteDigit => {
                     if (!digitsToKeep.has(noteDigit)) {
                         cellData.notes.delete(noteDigit);
                         cellChanged = true;
                         eliminatedSomething = true;
                         console.log(`  - Removed candidate ${noteDigit} from ${cellId} (Hidden Group)`);
                     }
                 });

                 // Удаляем из карты кандидатов все, КРОМЕ цифр группы
                 if (candidatesInMap) {
                    const mapCandsBefore = new Set(candidatesInMap);
                    candidatesInMap.forEach(candDigit => {
                        if (!digitsToKeep.has(candDigit)) {
                             candidatesInMap.delete(candDigit); // Обновляем карту
                             cellChanged = true; // Отмечаем изменение, даже если в notes не было
                             eliminatedSomething = true;
                             // Логируем удаление из карты, если его не было в notes
                             if (!notesBefore.has(candDigit)) {
                                console.log(`  - Removed candidate ${candDigit} from map of ${cellId} (Hidden Group)`);
                             }
                        }
                    });
                 }


                 if (cellChanged && renderCellCallback) {
                     renderCellCallback(coords.r, coords.c);
                 }
             }
         }

         if (!eliminatedSomething) {
              console.log(`No eliminations were made for ${technique}.`);
         }
          // Не откатываем историю здесь
         return eliminatedSomething;
     }


    // --- Основные функции решателя ---

    /**
     * Выполняет один шаг логического решателя для Killer Sudoku.
     * @param {Array<Array<object>>} userGrid - Текущая сетка.
     * @param {object} currentCandidatesMap - Текущая карта кандидатов.
     * @param {object} solverData - Данные Killer Sudoku.
     * @param {Function} updateCandidatesCallback - Callback для обновления карты кандидатов в script.js.
     * @param {Function} renderCellCallback - Callback для рендеринга ячейки в script.js.
     * @returns {object|null} - Информация о примененном шаге или null, если шаг не найден/не применен.
     */
    function doKillerLogicStep(userGrid, currentCandidatesMap, solverData, updateCandidatesCallback, renderCellCallback) {
        console.log("%c--- Killer Logic Step ---", "color: purple; font-weight: bold;");
        let appliedStepInfo = null;
        let foundInfo = null;

        const techniques = [
            { name: "Naked Single", findFunc: findNakedSingle, applyFunc: applyFoundSingle },
            { name: "Hidden Single", findFunc: findHiddenSingle, applyFunc: applyFoundSingle },
            { name: "Naked Pair", findFunc: findNakedPair, applyFunc: applyNakedGroupElimination },
            { name: "Hidden Pair", findFunc: findHiddenPair, applyFunc: applyHiddenGroupElimination },
            { name: "Naked Triple", findFunc: findNakedTriple, applyFunc: applyNakedGroupElimination },
            { name: "Hidden Triple", findFunc: findHiddenTriple, applyFunc: applyHiddenGroupElimination },
             // Сюда можно будет добавить другие Killer-специфичные или более сложные техники
        ];

        for (const tech of techniques) {
            console.log(`Killer Searching ${tech.name}...`);
             // Передаем текущее состояние в функции поиска
            foundInfo = tech.findFunc(userGrid, currentCandidatesMap, solverData);

            if (foundInfo) {
                // pushHistoryState(); // <<<<<<< Важно! История сохраняется в script.js ПЕРЕД вызовом doKillerLogicStep
                let appliedSuccessfully = false;
                if (tech.applyFunc === applyFoundSingle) {
                     // Передаем колбэки для обновления карты и рендера
                     appliedSuccessfully = tech.applyFunc(foundInfo, updateCandidatesCallback, renderCellCallback);
                } else {
                     // Передаем карту кандидатов и колбэк рендера для функций элиминации
                     appliedSuccessfully = tech.applyFunc(foundInfo, currentCandidatesMap, renderCellCallback);
                }


                if (appliedSuccessfully) {
                    appliedStepInfo = foundInfo; // Запоминаем успешно примененный шаг
                    console.log(`Killer Applied ${tech.name}.`);
                    break; // Выходим после первого успешного применения
                } else {
                    console.log(`Found ${tech.name}, but failed to apply or no eliminations needed.`);
                     // Если не применили, откатываем историю (которая была создана в script.js)
                     // Это должен делать вызывающий код (runKillerLogicSolver или обертка в script.js)
                    foundInfo = null; // Сбрасываем, чтобы не считать примененным
                }
            }
        }

        if (!appliedStepInfo) {
            console.log("No Killer logic step found in this cycle.");
        }
        return appliedStepInfo; // Возвращаем информацию о шаге (или null)
    }


    // --- Публичный интерфейс модуля ---
    return {
        calculateKillerCandidates,
        calculateAllKillerCandidates,
        doKillerLogicStep
        // runKillerLogicSolver - эту функцию лучше оставить в script.js для управления UI
    };

})();
