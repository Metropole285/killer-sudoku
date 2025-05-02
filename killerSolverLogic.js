// killerSolverLogic.js

/**
 * Логика для интерактивного пошагового решателя Killer Sudoku.
 * Работает с представлением данных из script.js (userGrid, currentCandidatesMap).
 * Учитывает правила Killer Sudoku при вычислении кандидатов.
 */
const killerSolverLogic = (() => {

    // --- Вспомогательные функции (локальны для этого модуля) ---
    function getCellCoords(cellId){ if(!cellId||cellId.length!==2)return null; const r="ABCDEFGHI".indexOf(cellId[0]), c="123456789".indexOf(cellId[1]); if(r===-1||c===-1)return null; return{r,c}; }
    function getCellId(r,c){ if(r<0||r>8||c<0||c>8)return null; return "ABCDEFGHI"[r]+"123456789"[c]; }
    function getRowIndices(r){const i=[];for(let c=0;c<9;c++)i.push([r,c]);return i;}
    function getColIndices(c){const i=[];for(let r=0;r<9;r++)i.push([r,c]);return i;}
    function getBlockIndices(b){const sr=Math.floor(b/3)*3,sc=(b%3)*3,i=[];for(let r=0;r<3;r++)for(let c=0;c<3;c++)i.push([sr+r,sc+c]);return i;}
    function getAllUnitsIndices() { const allUnits = []; for (let i = 0; i < 9; i++) { allUnits.push(getRowIndices(i)); allUnits.push(getColIndices(i)); allUnits.push(getBlockIndices(i)); } return allUnits; }
    function getUnitType(globalUnitIndex) { if (globalUnitIndex < 9) return 'Row'; if (globalUnitIndex < 18) return 'Col'; return 'Block'; }
    function getUnitIndexForDisplay(globalUnitIndex) { return (globalUnitIndex % 9) + 1; }
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
        const cellId = getCellId(r,c);
        if (!cellId) return new Set();
        if (classicPeersMapCache === null) {
            console.log("Initializing killerSolverLogic peers cache...");
            classicPeersMapCache = {};
            for (let r_cache = 0; r_cache < 9; r_cache++) {
                for (let c_cache = 0; c_cache < 9; c_cache++) {
                    const id_cache = getCellId(r_cache, c_cache);
                    if (id_cache) {
                        const peers = new Set();
                        for (let ci = 0; ci < 9; ci++) if (ci !== c_cache) { const pid = getCellId(r_cache, ci); if(pid) peers.add(pid); }
                        for (let ri = 0; ri < 9; ri++) if (ri !== r_cache) { const pid = getCellId(ri, c_cache); if(pid) peers.add(pid); }
                        const startRow = Math.floor(r_cache / 3) * 3; const startCol = Math.floor(c_cache / 3) * 3;
                        for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) { const peerR = startRow + i; const peerC = startCol + j; if (peerR !== r_cache || peerC !== c_cache) { const pid = getCellId(peerR, peerC); if(pid) peers.add(pid); } } }
                        classicPeersMapCache[id_cache] = peers;
                    }
                }
            }
            console.log("killerSolverLogic peers cache initialized.");
        }
        return classicPeersMapCache[cellId] || new Set();
   }
   function resetPeersCache() { classicPeersMapCache = null; }


    /**
     * Вычисляет кандидатов для ОДНОЙ ячейки Killer Sudoku.
     */
    function calculateKillerCandidates(r, c, userGrid, solverData) {
        const cellId = getCellId(r, c);
        if (!cellId || !userGrid || !userGrid[r]?.[c] || userGrid[r][c].value !== 0) {
            return new Set();
        }

        let candidates = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);

        // 1. Классические исключения (пиры)
        for (let i = 0; i < 9; i++) {
            if (userGrid[r]?.[i]?.value !== 0) candidates.delete(userGrid[r][i].value);
            if (userGrid[i]?.[c]?.value !== 0) candidates.delete(userGrid[i][c].value);
        }
        const startRow = Math.floor(r / 3) * 3;
        const startCol = Math.floor(c / 3) * 3;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if (userGrid[startRow + i]?.[startCol + j]?.value !== 0) {
                    candidates.delete(userGrid[startRow + i][startCol + j].value);
                }
            }
        }

        // 2. Исключения Killer Sudoku (клетка) - Базовая проверка по размещенным цифрам
        if (solverData && solverData.cellToCageMap && solverData.cageDataArray) {
            const cageIndex = solverData.cellToCageMap[cellId];
            if (cageIndex !== undefined) {
                const cage = solverData.cageDataArray[cageIndex];
                if (cage) {
                    for (const cageCellId of cage.cells) {
                         if (cageCellId !== cellId) { // Исключаем саму себя
                             const coords = getCellCoords(cageCellId);
                             if (coords && userGrid[coords.r]?.[coords.c]?.value !== 0) {
                                 candidates.delete(userGrid[coords.r][coords.c].value);
                             }
                         }
                    }
                    // ПРИМЕЧАНИЕ: Более сложная проверка комбинаций (getSumCombinationInfo)
                    // теперь делается в отдельном шаге findCageCombinationCheck,
                    // чтобы не замедлять базовый расчет кандидатов.
                }
            }
        }
        return candidates;
    }

     /**
     * Пересчитывает кандидатов для ВСЕХ пустых ячеек в Killer-режиме.
     * НЕ использует getSumCombinationInfo здесь для скорости.
     */
     function calculateAllKillerCandidates(userGrid, solverData) {
        resetPeersCache();
        const newMap = {};
        if (!userGrid) return newMap;
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const cellId = getCellId(r, c);
                if (!cellId) continue;
                if (userGrid[r]?.[c]?.value === 0) {
                    // Используем УПРОЩЕННЫЙ расчет (без getSumCombinationInfo)
                    // так как он может быть вызван много раз
                    let candidates = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
                    // Классические исключения
                    for (let i = 0; i < 9; i++) {
                        if (userGrid[r]?.[i]?.value !== 0) candidates.delete(userGrid[r][i].value);
                        if (userGrid[i]?.[c]?.value !== 0) candidates.delete(userGrid[i][c].value);
                    }
                    const startRow = Math.floor(r / 3) * 3; const startCol = Math.floor(c / 3) * 3;
                    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
                        if (userGrid[startRow + i]?.[startCol + j]?.value !== 0) candidates.delete(userGrid[startRow + i][startCol + j].value);
                    }
                    // Killer исключения (только по размещенным в клетке)
                     if (solverData && solverData.cellToCageMap && solverData.cageDataArray) {
                        const cageIndex = solverData.cellToCageMap[cellId];
                        if (cageIndex !== undefined) {
                            const cage = solverData.cageDataArray[cageIndex];
                            if (cage) {
                                for (const cageCellId of cage.cells) {
                                    if (cageCellId !== cellId) {
                                        const coords = getCellCoords(cageCellId);
                                        if (coords && userGrid[coords.r]?.[coords.c]?.value !== 0) {
                                            candidates.delete(userGrid[coords.r][coords.c].value);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    newMap[cellId] = candidates;
                } else {
                    newMap[cellId] = new Set();
                }
            }
        }
        console.log("Killer Candidates map recalculated (basic rules).");
        return newMap;
    }

    // --- Функции поиска техник ---
    function findNakedSingle(userGrid, candidatesMap, solverData) { /* ... как раньше ... */ }
    function findHiddenSingle(userGrid, candidatesMap, solverData) { /* ... как раньше ... */ }
    function findHiddenSingleInUnit(unitIndices, userGrid, candidatesMap) { /* ... как раньше ... */ }
    function findNakedPair(userGrid, candidatesMap, solverData) { /* ... как раньше ... */ }
    function findHiddenPair(userGrid, candidatesMap, solverData) { /* ... как раньше ... */ }
    function findNakedTriple(userGrid, candidatesMap, solverData) { /* ... как раньше ... */ }
    function findHiddenTriple(userGrid, candidatesMap, solverData) { /* ... как раньше ... */ }
    function findInnieStep(userGrid, candidatesMap, solverData) { /* ... как раньше ... */ }
    function findOutieStep(userGrid, candidatesMap, solverData) { /* ... как раньше ... */ }

    // <<< НОВОЕ: Функция поиска невозможных кандидатов в клетках >>>
    /**
     * Находит кандидатов, которые не могут участвовать ни в одной валидной
     * комбинации суммы для своей клетки.
     */
    function findCageCombinationCheck(userGrid, candidatesMap, solverData) {
        if (!userGrid || !solverData?.cageDataArray || typeof killerSudoku === 'undefined') return null;

        const allEliminations = []; // Собираем все элиминации со всех клеток

        for (const cage of solverData.cageDataArray) {
            if (!cage || !cage.cells || cage.cells.length < 2) continue; // Пропускаем клетки с 0 или 1 ячейкой

            let currentCageSum = 0;
            const emptyCellsData = []; // [{ id: cellId, cands: Set<number> }, ...]
            const placedDigitsInCage = new Set();

            // Собираем информацию о клетке
            let possible = true;
            for (const cellId of cage.cells) {
                const coords = getCellCoords(cellId);
                if (!coords || !userGrid[coords.r]?.[coords.c]) {
                    possible = false; break; // Ошибка данных
                }
                const cellData = userGrid[coords.r][coords.c];
                if (cellData.value !== 0) {
                    if (placedDigitsInCage.has(cellData.value)) { // Проверка на дубликаты в клетке
                        possible = false; break;
                    }
                    placedDigitsInCage.add(cellValue);
                    currentCageSum += cellData.value;
                } else {
                    const candidates = candidatesMap[cellId];
                    if (!candidates || candidates.size === 0) {
                         // Если у пустой ячейки нет кандидатов, комбинации невозможны (но это должно быть поймано ранее)
                         possible = false; break;
                    }
                    emptyCellsData.push({ id: cellId, cands: candidates });
                }
            }
            if (!possible) continue; // Пропускаем клетку с ошибкой

            const remainingSum = cage.sum - currentCageSum;
            const remainingCellsCount = emptyCellsData.length;

            if (remainingCellsCount <= 0 || remainingSum <= 0) continue; // Клетка заполнена или сумма невозможна

            // --- Находим ВСЕ валидные комбинации для ПУСТЫХ ячеек ---
            const validCombinations = [];
            findSumCombinationsRecursive(
                emptyCellsData,
                0, // start index
                remainingSum,
                [], // current combination array
                placedDigitsInCage, // Digits already used in this cage (cannot be reused)
                validCombinations
            );
            // -----------------------------------------------------

            if (validCombinations.length === 0 && remainingCellsCount > 0) {
                // Нет валидных комбинаций для заполнения оставшихся ячеек! Противоречие.
                // Это должно быть обработано на более ранних этапах, но на всякий случай.
                console.warn(`Cage ${cage.id}: No valid combinations found for remaining sum ${remainingSum} in ${remainingCellsCount} cells!`);
                continue;
            }

            // --- Определяем, какие кандидаты ДЕЙСТВИТЕЛЬНО используются ---
            const actuallyUsedCandidates = new Map(); // Map<cellId, Set<digit>>
            emptyCellsData.forEach(cell => actuallyUsedCandidates.set(cell.id, new Set()));

            validCombinations.forEach(combo => {
                combo.forEach((digit, index) => {
                    const cellId = emptyCellsData[index].id;
                    actuallyUsedCandidates.get(cellId).add(digit);
                });
            });

            // --- Находим кандидатов для удаления ---
            emptyCellsData.forEach(cell => {
                const originalCandidates = candidatesMap[cell.id];
                const usedCandidates = actuallyUsedCandidates.get(cell.id);
                if (originalCandidates) {
                     originalCandidates.forEach(cand => {
                         if (!usedCandidates.has(cand)) {
                             // Этот кандидат никогда не используется в валидных комбинациях!
                             allEliminations.push({ cellId: cell.id, digit: cand });
                             console.log(`Cage Combo Check: Eliminating ${cand} from ${cell.id} in cage ${cage.id}`);
                         }
                     });
                }
            });
        } // end loop cages

        if (allEliminations.length > 0) {
            // Формируем уникальный список элиминаций
            const uniqueEliminationsMap = new Map();
            allEliminations.forEach(elim => {
                const key = `${elim.cellId}-${elim.digit}`;
                if (!uniqueEliminationsMap.has(key)) {
                    uniqueEliminationsMap.set(key, elim);
                }
            });
             const uniqueEliminations = Array.from(uniqueEliminationsMap.values());

             // Создаем структуру для applyElimination
             // Группируем по цифре для удобства сообщения (хотя applyElimination обработает и так)
             const elimsByDigit = {};
             uniqueEliminations.forEach(e => {
                 if (!elimsByDigit[e.digit]) elimsByDigit[e.digit] = [];
                 elimsByDigit[e.digit].push(e.cellId);
             });
             const firstElimDigit = uniqueEliminations[0].digit; // Просто берем первую для сообщения
             const elimCellIds = uniqueEliminations.map(e => e.cellId);

            console.log(`Cage Combination Check found ${uniqueEliminations.length} eliminations.`);
             return {
                 technique: "Cage Combination Check",
                 // Возвращаем данные в формате, удобном для applyElimination
                 digit: firstElimDigit, // Условно, applyElimination разберется
                 eliminations: uniqueEliminations, // [{cellId, digit}, ...]
             };
        }

        return null;
    }

    /**
     * Рекурсивная функция для поиска комбинаций суммы в клетке.
     * @param {Array<object>} emptyCells - Массив данных пустых ячеек [{ id, cands }, ...]
     * @param {number} cellIndex - Индекс текущей обрабатываемой ячейки в emptyCells
     * @param {number} targetSum - Оставшаяся сумма, которую нужно набрать
     * @param {Array<number>} currentCombo - Текущая собираемая комбинация цифр
     * @param {Set<number>} usedDigitsGlobal - Цифры, уже использованные ГЛОБАЛЬНО в этой клетке (включая заполненные)
     * @param {Array<Array<number>>} results - Массив для сбора валидных комбинаций
     */
    function findSumCombinationsRecursive(emptyCells, cellIndex, targetSum, currentCombo, usedDigitsGlobal, results) {
        // Базовый случай: дошли до конца
        if (cellIndex === emptyCells.length) {
            if (targetSum === 0) {
                results.push([...currentCombo]); // Нашли валидную комбинацию
            }
            return;
        }

        const currentCell = emptyCells[cellIndex];
        const candidates = currentCell.cands;
        const remainingCells = emptyCells.length - (cellIndex + 1);

        candidates.forEach(cand => {
            // Проверка 1: Цифра еще не использована в этой КОНКРЕТНОЙ комбинации И ГЛОБАЛЬНО в клетке
            if (!currentCombo.includes(cand) && !usedDigitsGlobal.has(cand)) {
                 // Проверка 2: Оставшаяся сумма достижима
                 const nextTargetSum = targetSum - cand;
                 if (nextTargetSum >= 0) {
                      // Проверка 3 (оптимизация): Минимальная/Максимальная возможная сумма для оставшихся ячеек
                      // Считаем минимальную сумму, которую можно набрать из оставшихся ячеек,
                      // используя УНИКАЛЬНЫЕ цифры, не входящие в currentCombo и usedDigitsGlobal
                      let minPossibleRemainingSum = 0;
                      let maxPossibleRemainingSum = 0;
                      let availableDigits = [];
                      for (let d = 1; d <= 9; d++) {
                           if (!currentCombo.includes(d) && !usedDigitsGlobal.has(d) && d !== cand) {
                               availableDigits.push(d);
                           }
                      }
                      availableDigits.sort((a, b) => a - b); // Сортируем для min/max

                      if (availableDigits.length >= remainingCells) {
                          for (let i = 0; i < remainingCells; i++) {
                              minPossibleRemainingSum += availableDigits[i];
                              maxPossibleRemainingSum += availableDigits[availableDigits.length - 1 - i];
                          }

                          if (nextTargetSum >= minPossibleRemainingSum && nextTargetSum <= maxPossibleRemainingSum) {
                                currentCombo.push(cand);
                                findSumCombinationsRecursive(
                                    emptyCells,
                                    cellIndex + 1,
                                    nextTargetSum,
                                    currentCombo,
                                    usedDigitsGlobal, // usedDigitsGlobal не меняется в рекурсии
                                    results
                                );
                                currentCombo.pop(); // Backtrack
                           }
                      } else {
                          // Недостаточно уникальных доступных цифр для оставшихся ячеек
                      }
                 }
            }
        });
    }


    // --- Функции применения ---

    /**
     * Применяет найденный Single. Возвращает true, если значение было успешно установлено.
     */
     function applyFoundSingle(foundInfo, userGrid, updateCandidatesCallback, renderCellCallback) {
         if (!foundInfo || !userGrid) return false;
         const { r, c, digit } = foundInfo;
         if (userGrid[r]?.[c]?.value === 0) {
             console.log(`Apply Single: [${r},${c}]=${digit}`);
             userGrid[r][c].value = digit;
             userGrid[r][c].notes = new Set();
             if (updateCandidatesCallback) {
                 updateCandidatesCallback(r, c, digit, userGrid);
             }
             if (renderCellCallback) {
                  renderCellCallback(r, c);
             }
             return true;
         } else {
             console.warn(`Tried apply Single ${digit} to already filled cell [${r},${c}]`);
             return false;
         }
     }


    /**
     * Применяет элиминацию для Naked Pair/Triple. Возвращает true, если хотя бы один кандидат был удален.
     */
    function applyNakedGroupElimination(elimInfo, userGrid, candidatesMap, renderCellCallback) {
        if (!elimInfo || !elimInfo.digits || !elimInfo.cells || elimInfo.unitIndex === undefined || !userGrid) return false;
        const { unitIndex, cells, digits, technique } = elimInfo;
        const unitIndices = getUnitIndices(unitIndex);
        if (!unitIndices) { console.error(`Could not get unit indices for global index ${unitIndex}`); return false; }
        const groupCellsSet = new Set(cells);
        let eliminatedSomething = false;

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
                        if (cellData.notes.delete(digit)) {
                           removedFromNotes = true;
                           cellChanged = true;
                           eliminatedSomething = true;
                        }
                    }
                    if (candidatesInMap?.has(digit)) {
                        if (candidatesInMap.delete(digit)) {
                           removedFromMap = true;
                           cellChanged = true;
                           eliminatedSomething = true;
                        }
                    }
                    if (removedFromNotes || removedFromMap) {
                         console.log(`  - Removed candidate ${digit} from ${cellId} (Naked Group)`);
                    }
                });
                if (cellChanged && renderCellCallback) { renderCellCallback(r, c); }
            }
        }
        if (!eliminatedSomething) console.log(`No *new* eliminations were made for ${technique}.`);
        return eliminatedSomething;
    }

     /**
      * Применяет элиминацию для Hidden Pair/Triple. Возвращает true, если хотя бы один кандидат был удален.
      */
     function applyHiddenGroupElimination(elimInfo, userGrid, candidatesMap, renderCellCallback) {
         if (!elimInfo || !elimInfo.digits || !elimInfo.cells || !userGrid) return false;
         const { cells, digits, technique } = elimInfo;
         let eliminatedSomething = false;
         const digitsToKeep = new Set(digits);

         for (const cellId of cells) {
             const coords = getCellCoords(cellId);
             if (coords && userGrid[coords.r]?.[coords.c]?.value === 0) {
                 const cellData = userGrid[coords.r][coords.c];
                 const candidatesInMap = candidatesMap[cellId];
                 let cellChanged = false;
                 if (!cellData.notes) cellData.notes = new Set();
                 const notesBefore = new Set(cellData.notes);

                 cellData.notes.forEach(noteDigit => {
                     if (!digitsToKeep.has(noteDigit)) {
                          if(cellData.notes.delete(noteDigit)) {
                                cellChanged = true;
                                eliminatedSomething = true;
                                console.log(`  - Removed candidate ${noteDigit} from notes of ${cellId} (Hidden Group)`);
                          }
                     }
                 });
                 if (candidatesInMap) {
                    candidatesInMap.forEach(candDigit => {
                        if (!digitsToKeep.has(candDigit)) {
                             if(candidatesInMap.delete(candDigit)) {
                                cellChanged = true;
                                eliminatedSomething = true;
                                if (!notesBefore.has(candDigit)) {
                                    console.log(`  - Removed candidate ${candDigit} from map of ${cellId} (Hidden Group)`);
                                }
                             }
                        }
                    });
                 }
                 if (cellChanged && renderCellCallback) { renderCellCallback(coords.r, coords.c); }
             }
         }
         if (!eliminatedSomething) { console.log(`No *new* eliminations were made for ${technique}.`); }
         return eliminatedSomething;
     }

    /**
     * Общая функция для элиминации по списку (Innie/Outie/Cage Combo Check...)
     * Возвращает true, если хотя бы один кандидат был удален.
     * <<< ИЗМЕНЕНО: Принимает eliminations в формате [{cellId, digit}, ...] >>>
     */
    function applyElimination(elimInfo, userGrid, candidatesMap, renderCellCallback) {
        // Проверяем новый формат elimInfo для Cage Combination Check
        if (!elimInfo || !elimInfo.eliminations || !userGrid || !candidatesMap) return false;
        const { eliminations, technique } = elimInfo; // digit может отсутствовать для Cage Combo Check

        console.log(`Apply ${technique} Elim: Attempting to remove ${eliminations.length} candidates...`);

        let eliminatedSomething = false; // Флаг реального изменения

        eliminations.forEach(elimData => {
            // <<< Получаем cellId и digit из elimData >>>
            const { cellId, digit } = elimData;
            if (!cellId || !digit) {
                 console.warn(`Invalid elimination data in ${technique}:`, elimData);
                 return; // Пропускаем некорректные данные
            }

            const coords = getCellCoords(cellId);
            if (coords && userGrid[coords.r]?.[coords.c]?.value === 0) {
                const cellData = userGrid[coords.r][coords.c];
                const candidatesInMap = candidatesMap[cellId];
                let cellChanged = false;
                let removedFromNotes = false;
                let removedFromMap = false;

                if (!cellData.notes) cellData.notes = new Set();

                if (cellData.notes.has(digit)) {
                    if (cellData.notes.delete(digit)) {
                       removedFromNotes = true;
                       cellChanged = true;
                       eliminatedSomething = true;
                    }
                }
                if (candidatesInMap?.has(digit)) {
                    if (candidatesInMap.delete(digit)) {
                       removedFromMap = true;
                       cellChanged = true;
                       eliminatedSomething = true;
                    }
                }

                if (removedFromNotes || removedFromMap) {
                    console.log(`  - Removed candidate ${digit} from ${cellId} (${technique})`);
                }

                if (cellChanged && renderCellCallback) {
                    renderCellCallback(coords.r, coords.c);
                }
            }
        });

        if (!eliminatedSomething) { console.log(`No *new* eliminations were made for ${technique}.`); }
        return eliminatedSomething; // Возвращаем флаг реального изменения
    }


    // --- Основные функции решателя ---

    /**
     * Выполняет один шаг логического решателя для Killer Sudoku.
     * Возвращает информацию о шаге, если он был УСПЕШНО ПРИМЕНЕН.
     */
    function doKillerLogicStep(userGrid, currentCandidatesMap, solverData, updateCandidatesCallback, renderCellCallback) {
        console.log("%c--- Killer Logic Step ---", "color: purple; font-weight: bold;");
        if (!userGrid) { console.error("doKillerLogicStep called without userGrid!"); return null; }
        let appliedStepInfo = null;
        let foundInfo = null;

        const techniques = [
            { name: "Naked Single", findFunc: findNakedSingle, applyFunc: applyFoundSingle },
            { name: "Hidden Single", findFunc: findHiddenSingle, applyFunc: applyFoundSingle },
            { name: "Cage Combination Check", findFunc: findCageCombinationCheck, applyFunc: applyElimination }, // <<< ДОБАВЛЕНО
            { name: "Naked Pair", findFunc: findNakedPair, applyFunc: applyNakedGroupElimination },
            { name: "Hidden Pair", findFunc: findHiddenPair, applyFunc: applyHiddenGroupElimination },
            { name: "Naked Triple", findFunc: findNakedTriple, applyFunc: applyNakedGroupElimination },
            { name: "Hidden Triple", findFunc: findHiddenTriple, applyFunc: applyHiddenGroupElimination },
            { name: "Innie", findFunc: findInnieStep, applyFunc: applyElimination },
            { name: "Outie", findFunc: findOutieStep, applyFunc: applyElimination },
        ];

        for (const tech of techniques) {
            console.log(`Killer Searching ${tech.name}...`);
            foundInfo = tech.findFunc(userGrid, currentCandidatesMap, solverData);

            if (foundInfo) {
                let appliedSuccessfully = false;
                if (tech.applyFunc === applyFoundSingle) {
                     appliedSuccessfully = tech.applyFunc(foundInfo, userGrid, updateCandidatesCallback, renderCellCallback);
                } else {
                     appliedSuccessfully = tech.applyFunc(foundInfo, userGrid, currentCandidatesMap, renderCellCallback);
                }

                if (appliedSuccessfully) { // <<< Проверяем результат applyFunc
                    appliedStepInfo = foundInfo;
                    console.log(`Killer Applied ${tech.name}.`);
                    break;
                } else {
                    console.log(`Found ${tech.name}, but no *new* changes were applied.`);
                    // Не меняем appliedStepInfo и продолжаем поиск
                }
            }
        }

        if (!appliedStepInfo) {
            console.log("No effective Killer logic step found in this cycle.");
        }

        return appliedStepInfo; // Возвращаем инфо о ПРИМЕНЕННОМ шаге
    }


    // --- Публичный интерфейс модуля ---
    return {
        calculateKillerCandidates,
        calculateAllKillerCandidates,
        doKillerLogicStep,
        resetPeersCache
    };

})(); // Конец IIFE killerSolverLogic
