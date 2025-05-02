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

        // 2. Исключения Killer Sudoku (клетка)
        if (solverData && solverData.cellToCageMap && solverData.cageDataArray && typeof killerSudoku !== 'undefined' && killerSudoku.getSumCombinationInfo) {
            const cageIndex = solverData.cellToCageMap[cellId];
            if (cageIndex !== undefined) {
                const cage = solverData.cageDataArray[cageIndex];
                if (cage) {
                    let currentCageSum = 0;
                    let emptyCellsInCage = [];
                    let placedDigitsInCage = new Set();

                    for (const cageCellId of cage.cells) {
                        const coords = getCellCoords(cageCellId);
                        if (coords && userGrid[coords.r]?.[coords.c]) {
                            const cellValue = userGrid[coords.r][coords.c].value;
                            if (cellValue !== 0) {
                                candidates.delete(cellValue);
                                currentCageSum += cellValue;
                                placedDigitsInCage.add(cellValue);
                            } else {
                                emptyCellsInCage.push(cageCellId);
                            }
                        }
                    }

                    const remainingSum = cage.sum - currentCageSum;
                    const remainingCellsCount = emptyCellsInCage.length;

                    if (remainingCellsCount > 0 && remainingSum >= 0) {
                        const combinationInfo = killerSudoku.getSumCombinationInfo(remainingSum, remainingCellsCount);
                        if (combinationInfo && typeof killerSudoku.DIGIT_MASKS !== 'undefined') {
                            let possibleCandidatesForRemaining = new Set();
                            for (let d = 1; d <= 9; d++) {
                                if ((combinationInfo.digitMask & killerSudoku.DIGIT_MASKS[d]) !== 0 && !placedDigitsInCage.has(d)) {
                                    possibleCandidatesForRemaining.add(d);
                                }
                            }
                            candidates = new Set([...candidates].filter(cand => possibleCandidatesForRemaining.has(cand)));
                        } else {
                             if (remainingSum < 0 || !combinationInfo) {
                                 candidates.clear();
                             }
                        }
                    } else if (remainingCellsCount === 0 && remainingSum !== 0) {
                        candidates.clear();
                    } else if (remainingSum < 0) {
                        candidates.clear();
                    }
                }
            }
        }
        return candidates;
    }

     /**
     * Пересчитывает кандидатов для ВСЕХ пустых ячеек в Killer-режиме.
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
                    newMap[cellId] = calculateKillerCandidates(r, c, userGrid, solverData);
                } else {
                    newMap[cellId] = new Set();
                }
            }
        }
        console.log("Killer Candidates map recalculated.");
        return newMap;
    }

    // --- Функции поиска техник ---

    function findNakedSingle(userGrid, candidatesMap, solverData) {
        if (!userGrid) return null;
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

    function findHiddenSingle(userGrid, candidatesMap, solverData) {
        if (!userGrid) return null;
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

    function findNakedPair(userGrid, candidatesMap, solverData) {
         if (!userGrid) return null;
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
                         if (c1.cands.size === 2 && c2.cands.size === 2) {
                             let sameCandidates = true;
                             for (const digit of c1.cands) if (!c2.cands.has(digit)) { sameCandidates = false; break; }
                             if (sameCandidates) for (const digit of c2.cands) if (!c1.cands.has(digit)) { sameCandidates = false; break; }
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

     function findHiddenPair(userGrid, candidatesMap, solverData) {
         if (!userGrid) return null;
         const units = getAllUnitsIndices();
         for (let i = 0; i < units.length; i++) {
             const unit = units[i];
             const digitLocations = {};
             for (const [r, c] of unit) {
                 const cellId = getCellId(r, c);
                 if (userGrid[r]?.[c]?.value === 0 && candidatesMap[cellId]) {
                     candidatesMap[cellId].forEach(digit => {
                         if (!digitLocations[digit]) digitLocations[digit] = [];
                         digitLocations[digit].push(cellId);
                     });
                 }
             }
             const digitsIn2Cells = Object.entries(digitLocations)
                                         .filter(([d, locs]) => locs.length === 2)
                                         .map(([d, locs]) => ({ digit: parseInt(d), locations: new Set(locs) }));
             if (digitsIn2Cells.length >= 2) {
                 for (let j = 0; j < digitsIn2Cells.length; j++) {
                     for (let k = j + 1; k < digitsIn2Cells.length; k++) {
                         const d1Info = digitsIn2Cells[j];
                         const d2Info = digitsIn2Cells[k];
                         if (d1Info.locations.size === 2 && d1Info.locations.size === d2Info.locations.size) {
                            const loc1Arr = Array.from(d1Info.locations);
                            const loc2Arr = Array.from(d2Info.locations);
                            if ((loc1Arr[0] === loc2Arr[0] && loc1Arr[1] === loc2Arr[1]) || (loc1Arr[0] === loc2Arr[1] && loc1Arr[1] === loc2Arr[0])) {
                                const pairDigits = [d1Info.digit, d2Info.digit];
                                const pairCells = loc1Arr;
                                let eliminationNeeded = false;
                                for (const cellId of pairCells) {
                                     const cellCands = candidatesMap[cellId];
                                     if (cellCands) {
                                        for(const cand of cellCands) {
                                            if (cand !== pairDigits[0] && cand !== pairDigits[1]) {
                                                eliminationNeeded = true; break;
                                            }
                                        }
                                     }
                                     if (eliminationNeeded) break;
                                }
                                if (eliminationNeeded) {
                                     console.log(`Killer Hidden Pair found: Digits ${pairDigits.join(',')} in cells ${pairCells.join(',')}`);
                                     return { unitType: getUnitType(i), unitIndex: i, cells: pairCells, digits: pairDigits, technique: "Hidden Pair" };
                                }
                            }
                         }
                     }
                 }
             }
         }
         return null;
     }


    function findNakedTriple(userGrid, candidatesMap, solverData) {
        if (!userGrid) return null;
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

    function findHiddenTriple(userGrid, candidatesMap, solverData) {
        if (!userGrid) return null;
        const units = getAllUnitsIndices();
        for (let i = 0; i < units.length; i++) {
            const unit = units[i];
            const digitLocations = {};
            for (const [r, c] of unit) {
                const cellId = getCellId(r, c);
                if (userGrid[r]?.[c]?.value === 0 && candidatesMap[cellId]) {
                    candidatesMap[cellId].forEach(digit => {
                        if (!digitLocations[digit]) digitLocations[digit] = [];
                        digitLocations[digit].push(cellId);
                    });
                }
            }
            const potentialTripleDigits = Object.keys(digitLocations)
                .map(d => parseInt(d))
                .filter(d => digitLocations[d].length === 2 || digitLocations[d].length === 3);

            if (potentialTripleDigits.length >= 3) {
                 for (let j = 0; j < potentialTripleDigits.length; j++) {
                     for (let k = j + 1; k < potentialTripleDigits.length; k++) {
                         for (let l = k + 1; l < potentialTripleDigits.length; l++) {
                             const d1 = potentialTripleDigits[j];
                             const d2 = potentialTripleDigits[k];
                             const d3 = potentialTripleDigits[l];
                             const tripleDigits = [d1, d2, d3];
                             const combinedCells = new Set([...digitLocations[d1], ...digitLocations[d2], ...digitLocations[d3]]);

                             if (combinedCells.size === 3) {
                                 const tripleCells = Array.from(combinedCells);
                                 let eliminationNeeded = false;
                                 for (const cellId of tripleCells) {
                                     const cellCands = candidatesMap[cellId];
                                     if (cellCands) {
                                         for (const cand of cellCands) {
                                             if (!tripleDigits.includes(cand)) {
                                                 eliminationNeeded = true; break;
                                             }
                                         }
                                     }
                                     if (eliminationNeeded) break;
                                 }
                                 if (eliminationNeeded) {
                                     console.log(`Killer Hidden Triple found: Digits ${tripleDigits.join(',')} in cells ${tripleCells.join(',')}`);
                                     return { unitType: getUnitType(i), unitIndex: i, cells: tripleCells, digits: tripleDigits, technique: "Hidden Triple" };
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
                let possible = true;
                for (const cellId of unitCellIds) {
                     const coords = getCellCoords(cellId);
                     if (!coords) continue;
                     if (userGrid[coords.r][coords.c].value === d) { possible = false; break; }
                     if (userGrid[coords.r][coords.c].value === 0 && candidatesMap[cellId]?.has(d)) {
                         possibleLocationsInUnit.push(cellId);
                         const cageIdx = solverData.cellToCageMap[cellId];
                         if (cageIdx === undefined) { possible = false; break; }
                         involvedCages.add(cageIdx);
                     }
                }
                if (!possible || possibleLocationsInUnit.length === 0) continue;
                if (involvedCages.size === 1) {
                    const targetCageIndex = involvedCages.values().next().value;
                    const targetCage = solverData.cageDataArray[targetCageIndex];
                    if (!targetCage) continue;
                    const eliminations = [];
                    for (const cageCellId of targetCage.cells) {
                        if (!unitCellIdsSet.has(cageCellId)) {
                             const coords = getCellCoords(cageCellId);
                             if (coords && userGrid[coords.r][coords.c].value === 0 && candidatesMap[cageCellId]?.has(d)) {
                                 eliminations.push(cageCellId);
                             }
                        }
                    }
                    if (eliminations.length > 0) {
                        console.log(`Killer Innie found: Digit ${d} in unit ${unitIndex} confined to cage ${targetCageIndex}. Eliminating from ${eliminations.join(',')}.`);
                        return { technique: "Innie", digit: d, unitIndex: unitIndex, cageIndex: targetCageIndex, eliminations: eliminations };
                    }
                }
            }
        }
        return null;
    }

    function findOutieStep(userGrid, candidatesMap, solverData) {
        if (!userGrid || !solverData?.cageDataArray) return null;
        for (const cage of solverData.cageDataArray) {
            if (!cage.cells || cage.cells.length === 0) continue;
            const cageCellIdsSet = new Set(cage.cells);
            for (let d = 1; d <= 9; d++) {
                const possibleLocationsInCage = [];
                 for (const cellId of cage.cells) {
                     const coords = getCellCoords(cellId);
                     if(coords && userGrid[coords.r][coords.c].value === 0 && candidatesMap[cellId]?.has(d)) {
                         possibleLocationsInCage.push({id: cellId, r: coords.r, c: coords.c});
                     }
                 }
                 if (possibleLocationsInCage.length < 2) continue;
                 // Rows
                 let targetRowIndex = -1; let confinedToRow = true;
                 for(let i=0; i<possibleLocationsInCage.length; i++) { if (i === 0) targetRowIndex = possibleLocationsInCage[i].r; else if (possibleLocationsInCage[i].r !== targetRowIndex) { confinedToRow = false; break; } }
                 if (confinedToRow && targetRowIndex !== -1) {
                     const eliminations = []; const rowIndices = getRowIndices(targetRowIndex);
                     for (const [r,c] of rowIndices) { const cellId = getCellId(r,c); if (cellId && !cageCellIdsSet.has(cellId) && userGrid[r][c].value === 0 && candidatesMap[cellId]?.has(d)) { eliminations.push(cellId); } }
                     if (eliminations.length > 0) { console.log(`Killer Outie (Row) found: Digit ${d} in cage ${cage.id} confined to row ${targetRowIndex+1}. Eliminating from ${eliminations.join(',')}.`); return { technique: "Outie (Row)", digit: d, cageIndex: cage.id, unitIndex: targetRowIndex, eliminations: eliminations }; }
                 }
                 // Cols
                 let targetColIndex = -1; let confinedToCol = true;
                 for(let i=0; i<possibleLocationsInCage.length; i++) { if (i === 0) targetColIndex = possibleLocationsInCage[i].c; else if (possibleLocationsInCage[i].c !== targetColIndex) { confinedToCol = false; break; } }
                  if (confinedToCol && targetColIndex !== -1) {
                     const eliminations = []; const colIndices = getColIndices(targetColIndex);
                     for (const [r,c] of colIndices) { const cellId = getCellId(r,c); if (cellId && !cageCellIdsSet.has(cellId) && userGrid[r][c].value === 0 && candidatesMap[cellId]?.has(d)) { eliminations.push(cellId); } }
                     if (eliminations.length > 0) { console.log(`Killer Outie (Col) found: Digit ${d} in cage ${cage.id} confined to col ${targetColIndex+1}. Eliminating from ${eliminations.join(',')}.`); return { technique: "Outie (Col)", digit: d, cageIndex: cage.id, unitIndex: targetColIndex + 9, eliminations: eliminations }; }
                 }
                 // Blocks
                 let targetBlockIndex = -1; let confinedToBlock = true;
                 for(let i=0; i<possibleLocationsInCage.length; i++) { const currentBlock = Math.floor(possibleLocationsInCage[i].r / 3) * 3 + Math.floor(possibleLocationsInCage[i].c / 3); if (i === 0) targetBlockIndex = currentBlock; else if (currentBlock !== targetBlockIndex) { confinedToBlock = false; break; } }
                 if (confinedToBlock && targetBlockIndex !== -1) {
                     const eliminations = []; const blockIndices = getBlockIndices(targetBlockIndex);
                     for (const [r,c] of blockIndices) { const cellId = getCellId(r,c); if (cellId && !cageCellIdsSet.has(cellId) && userGrid[r][c].value === 0 && candidatesMap[cellId]?.has(d)) { eliminations.push(cellId); } }
                      if (eliminations.length > 0) { console.log(`Killer Outie (Block) found: Digit ${d} in cage ${cage.id} confined to block ${targetBlockIndex}. Eliminating from ${eliminations.join(',')}.`); return { technique: "Outie (Block)", digit: d, cageIndex: cage.id, unitIndex: targetBlockIndex + 18, eliminations: eliminations }; }
                 }
            }
        }
        return null;
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
     * Общая функция для элиминации по списку (Innie/Outie/Pointing/BoxLine/XWing/XYWing)
     * Возвращает true, если хотя бы один кандидат был удален.
     */
    function applyElimination(elimInfo, userGrid, candidatesMap, renderCellCallback) {
        if (!elimInfo || !elimInfo.eliminations || !userGrid || !candidatesMap) return false;
        const { eliminations, technique } = elimInfo;
        const digit = elimInfo.digit || elimInfo.digitZ;
        if (!digit) { console.error("applyElimination called without a digit to eliminate:", elimInfo); return false; }
        console.log(`Apply ${technique} Elim: Remove candidate ${digit} from ${eliminations.length} cells`);

        let eliminatedSomething = false;

        eliminations.forEach(cellId => {
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
        return eliminatedSomething;
    }


    // --- Основные функции решателя ---

    /**
     * Выполняет один шаг логического решателя для Killer Sudoku.
     * Возвращает информацию о шаге, если он был УСПЕШНО ПРИМЕНЕН (т.е. изменил состояние).
     */
    function doKillerLogicStep(userGrid, currentCandidatesMap, solverData, updateCandidatesCallback, renderCellCallback) {
        console.log("%c--- Killer Logic Step ---", "color: purple; font-weight: bold;");
        if (!userGrid) { console.error("doKillerLogicStep called without userGrid!"); return null; }
        let appliedStepInfo = null;
        let foundInfo = null;

        const techniques = [
            { name: "Naked Single", findFunc: findNakedSingle, applyFunc: applyFoundSingle },
            { name: "Hidden Single", findFunc: findHiddenSingle, applyFunc: applyFoundSingle },
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

                if (appliedSuccessfully) {
                    appliedStepInfo = foundInfo; // Запоминаем инфо только если УСПЕШНО применили
                    console.log(`Killer Applied ${tech.name}.`);
                    break; // Выходим, т.к. шаг сделан
                } else {
                    console.log(`Found ${tech.name}, but no *new* changes were applied.`);
                    // Не меняем appliedStepInfo и продолжаем поиск других техник
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
```

**3. Файл `script.js` (без изменений от предыдущей версии)**

Этот файл остается тем же, что и в предыдущем ответе. Он корректно вызывает `killerSolverLogic.doKillerLogicStep` и обрабатывает его результат в `doLogicStep` и `runLogicSolver`.

```javascript
// Убедитесь, что sudoku.js, killerSudoku.js, И killerSolverLogic.js подключены ДО script.js
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM ready.");

    // --- Элементы DOM ---
    const initialScreen = document.getElementById('initial-screen');
    const newGameOptionsScreen = document.getElementById('new-game-options');
    const gameContainer = document.getElementById('game-container');
    const startNewGameButton = document.getElementById('start-new-game-button');
    const continueGameButton = document.getElementById('continue-game-button');
    const gameModeSelectionContainer = document.getElementById('game-mode-selection');
    const difficultyButtonsContainer = newGameOptionsScreen?.querySelector('.difficulty-selection');
    const themeToggleCheckbox = document.getElementById('theme-toggle-checkbox');
    const backToInitialButton = document.getElementById('back-to-initial-button');
    const exitGameButton = document.getElementById('exit-game-button');
    const boardElement = document.getElementById('sudoku-board');
    const checkButton = document.getElementById('check-button');
    const hintButton = document.getElementById('hint-button');
    const undoButton = document.getElementById('undo-button');
    const statusMessageElement = document.getElementById('status-message');
    const numpad = document.getElementById('numpad');
    const noteToggleButton = document.getElementById('note-toggle-button');
    const timerElement = document.getElementById('timer');
    const logicStepButton = document.getElementById('logic-step-button');
    const logicSolveButton = document.getElementById('logic-solve-button');

    // --- Проверка всех элементов ---
    const essentialElements = { initialScreen, newGameOptionsScreen, gameContainer, startNewGameButton, continueGameButton, gameModeSelectionContainer, difficultyButtonsContainer, themeToggleCheckbox, backToInitialButton, exitGameButton, boardElement, checkButton, hintButton, undoButton, statusMessageElement, numpad, noteToggleButton, timerElement, logicStepButton, logicSolveButton };
    for (const key in essentialElements) {
        if (!essentialElements[key]) {
            const errorMsg = `Критическая ошибка: HTML элемент для '${key}' не найден! Проверьте ID/селектор в index.html.`;
            console.error(errorMsg);
            document.body.innerHTML = `<p style='color:red;font-size:18px; padding: 20px;'>${errorMsg}</p>`;
            return; // Остановить выполнение скрипта
        }
    }

    // --- Ключи localStorage ---
    const SAVE_KEY = 'sudokuGameState';
    const THEME_KEY = 'sudokuThemePreference';

    // --- Состояние Игры ---
    let currentMode = "classic";
    let currentDifficulty = 'medium';
    let currentPuzzle = null;
    let currentSolution = null;
    let currentCageData = null;
    let currentSolverData = null;
    let userGrid = [];
    let currentCandidatesMap = {}; // Карта кандидатов {cellId: Set<number>}
    let classicPeersMapCache = null; // Кэш для пиров (теперь только для Classic в script.js)
    let historyStack = [];
    let selectedCell = null;
    let selectedRow = -1;
    let selectedCol = -1;
    let isNoteMode = false;
    let timerInterval = null;
    let secondsElapsed = 0;
    const MAX_HINTS = 3;
    let hintsRemaining = MAX_HINTS;
    let isLogicSolverRunning = false; // Флаг для кнопки Solve Logic

    // === Placeholder Рекламы ===
    let isAdReady = false;
    let isShowingAd = false;
    function initializeAds() {
        console.log("ADS Init...");
        setTimeout(() => { preloadRewardedAd(); }, 2000);
    }
    function preloadRewardedAd() {
        if (isAdReady || isShowingAd) return;
        console.log("ADS Load...");
        isAdReady = false;
        setTimeout(() => {
             if (!isShowingAd) {
                 isAdReady = true; console.log("ADS Ready.");
             } else { console.log("ADS Load aborted (showing)."); }
         }, 3000 + Math.random() * 2000);
     }
    function showRewardedAd(callbacks) {
        if (!isAdReady || isShowingAd) {
            console.log("ADS Not ready/Showing.");
            if (callbacks.onError) callbacks.onError("Реклама не готова.");
            preloadRewardedAd();
            return;
        }
        console.log("ADS Show...");
        isShowingAd = true;
        isAdReady = false;
        if(statusMessageElement) {
            statusMessageElement.textContent = "Показ рекламы...";
            statusMessageElement.className = '';
        }
        document.body.style.pointerEvents = 'none';
        setTimeout(() => {
            const success = Math.random() > 0.2;
            document.body.style.pointerEvents = 'auto';
            if(statusMessageElement) statusMessageElement.textContent = "";
            isShowingAd = false;
            console.log("ADS Show End.");
            if (success) {
                console.log("ADS Success!");
                if (callbacks.onSuccess) callbacks.onSuccess();
            } else {
                console.log("ADS Error/Skip.");
                if (callbacks.onError) callbacks.onError("Реклама не загружена / пропущена.");
            }
            preloadRewardedAd();
         }, 5000);
     }


    // --- Функции Управления Экранами ---
    function showScreen(screenToShow) {
        [initialScreen, newGameOptionsScreen, gameContainer].forEach(s => s?.classList.remove('visible'));
        if (screenToShow) {
            screenToShow.classList.add('visible');
            console.log(`Show screen: #${screenToShow.id}`);
        } else {
            console.error("showScreen: Попытка показать неопределенный экран!");
            if(initialScreen) initialScreen.classList.add('visible'); // Fallback
        }
    }

    // --- Функции Темы ---
    function applyTheme(theme) {
        const isDark = theme === 'dark';
        document.body.classList.toggle('dark-theme', isDark);
        if(themeToggleCheckbox) themeToggleCheckbox.checked = isDark;
        console.log(`Theme set: ${theme}`);
    }
    function loadThemePreference() {
        try {
            const savedTheme = localStorage.getItem(THEME_KEY);
            applyTheme(savedTheme || 'light');
        } catch(e) {
            console.error("Error loading theme:", e);
            applyTheme('light');
        }
    }
    function handleThemeToggle() {
        if(!themeToggleCheckbox) return;
        const newTheme = themeToggleCheckbox.checked ? 'dark' : 'light';
        applyTheme(newTheme);
        try { localStorage.setItem(THEME_KEY, newTheme); } catch(e) { console.error("Error saving theme:", e); }
    }

    // --- Вспомогательные функции ---
    function showError(msg){ console.error("App Error:", msg); if(statusMessageElement) { statusMessageElement.textContent = msg; statusMessageElement.className = 'incorrect-msg'; } }
    function showSuccess(msg){ if(statusMessageElement) { statusMessageElement.textContent = msg; statusMessageElement.className = 'correct'; setTimeout(()=>clearErrors(), 3000); } }
    function clearErrors(){ if(boardElement) boardElement.querySelectorAll('.cell.incorrect').forEach(c=>c.classList.remove('incorrect')); if(statusMessageElement) { statusMessageElement.textContent = ''; statusMessageElement.className = ''; } }
    function getCellCoords(cellId){ if(!cellId||cellId.length!==2)return null; const r="ABCDEFGHI".indexOf(cellId[0]), c="123456789".indexOf(cellId[1]); if(r===-1||c===-1)return null; return{r,c}; }
    function getCellId(r,c){ if(r<0||r>8||c<0||c>8)return null; return "ABCDEFGHI"[r]+"123456789"[c]; }
    function getNeighbors(r,c){ return{top:r>0?getCellId(r-1,c):null,bottom:r<8?getCellId(r+1,c):null,left:c>0?getCellId(r,c-1):null,right:c<8?getCellId(r,c+1):null}; }
    function isGameSolved(){ if(!userGrid||userGrid.length!==9)return false; return !userGrid.flat().some(c=>!c||c.value===0); }
    function boardStringToObjectArray(boardString){if(!boardString||typeof boardString!=='string')return[];const g=[];for(let r=0;r<9;r++){g[r]=[];for(let c=0;c<9;c++){const i=r*9+c;const h=boardString[i]||'.';const v=(h==='.'||h==='0'||!"123456789".includes(h))?0:parseInt(h);g[r][c]={value:v,notes:new Set()};}}return g;}
    function clearSelection(){if(selectedCell)selectedCell.classList.remove('selected');if(boardElement)boardElement.querySelectorAll('.cell.highlighted').forEach(c=>c.classList.remove('highlighted'));selectedCell=null;selectedRow=-1;selectedCol=-1;}
    function updateNoteToggleButtonState(){if(noteToggleButton){noteToggleButton.classList.toggle('active',isNoteMode);noteToggleButton.title=`Заметки (${isNoteMode?'ВКЛ':'ВЫКЛ'})`;}}
    function highlightRelatedCells(row, col) {
         if (!boardElement) return;
         boardElement.querySelectorAll('.cell.highlighted').forEach(el=>el.classList.remove('highlighted'));
         if (currentMode === 'killer' && currentSolverData && selectedCell) {
             const cellId = getCellId(row, col); if (!cellId) return;
             const cageIndex = currentSolverData.cellToCageMap[cellId];
             if (cageIndex !== undefined) {
                 const cage = currentSolverData.cageDataArray[cageIndex];
                 if (cage?.cells) { cage.cells.forEach(cId => { const coords = getCellCoords(cId); if(coords) boardElement.querySelector(`.cell[data-row='${coords.r}'][data-col='${coords.c}']`)?.classList.add('highlighted'); }); }
             } else { boardElement.querySelectorAll(`.cell[data-row='${row}'], .cell[data-col='${col}']`).forEach(el=>el.classList.add('highlighted')); }
         } else { boardElement.querySelectorAll(`.cell[data-row='${row}'], .cell[data-col='${col}']`).forEach(el=>el.classList.add('highlighted')); }
         const cellValue = userGrid[row]?.[col]?.value;
         if (cellValue && cellValue !== 0) {
             for (let r_=0;r_<9;r_++) { for (let c_=0;c_<9;c_++) { if (userGrid[r_]?.[c_]?.value === cellValue) { boardElement.querySelector(`.cell[data-row='${r_}'][data-col='${c_}']`)?.classList.add('highlighted'); }}}}
     }
    function updateHintButtonState(){if(!hintButton)return;const s=isGameSolved();let canHint=false,title="";if(currentMode==='classic'){canHint=currentSolution&&!s;if(!currentSolution)title="Н/Д";else if(s)title="Решено";else if(hintsRemaining>0)title="Подсказка";else title=`+${MAX_HINTS}(Ad)`;}else{canHint=false;title="Н/Д(Killer)";}hintButton.disabled=!canHint;hintButton.title=title;hintButton.textContent=`💡 ${hintsRemaining}/${MAX_HINTS}`;if(currentMode==='killer')hintButton.disabled=true;else if(hintsRemaining<=0&&canHint)hintButton.disabled=false;}
    function getSolutionValue(row, col) {
         if (currentMode !== 'classic' || !currentSolution) {
             console.warn(`getSolutionValue called for invalid state: mode=${currentMode}, solutionExists=${!!currentSolution}`);
             return null;
         }
         const index = row * 9 + col;
         if (index < 0 || index >= currentSolution.length) {
             console.error(`getSolutionValue: Invalid index ${index} for row=${row}, col=${col}`);
             return null;
         }
         const char = currentSolution[index];
         if (char === '.' || char === '0' || !"123456789".includes(char)) {
              console.error(`getSolutionValue: Invalid character '${char}' in solution at index ${index}`);
              return null;
         }
         return parseInt(char);
     }
     /**
      * Получает Set ID всех пиров для ячейки (кэшируется).
      */
     function getClassicPeers(r, c) {
         const cellId = getCellId(r,c);
         if (!cellId) return new Set();
         if (classicPeersMapCache === null) {
             console.log("Initializing classic peers cache for script.js...");
             classicPeersMapCache = {};
             for (let r_cache = 0; r_cache < 9; r_cache++) {
                 for (let c_cache = 0; c_cache < 9; c_cache++) {
                     const id_cache = getCellId(r_cache, c_cache);
                     if (id_cache) {
                         const peers = new Set();
                         for (let ci = 0; ci < 9; ci++) if (ci !== c_cache) { const pid = getCellId(r_cache, ci); if(pid) peers.add(pid); }
                         for (let ri = 0; ri < 9; ri++) if (ri !== r_cache) { const pid = getCellId(ri, c_cache); if(pid) peers.add(pid); }
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
             console.log("script.js classic peers cache initialized.");
         }
         return classicPeersMapCache[cellId] || new Set();
    }
    // Вспомогательные функции для индексов/юнитов, нужны в script.js для классического решателя
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


    // --- Инициализация ИГРЫ ---
    function initGame(mode = "classic", difficulty = "medium", restoreState = null) {
        console.log(`%cInitGame START: mode=${mode}, difficulty=${difficulty}, restore=${!!restoreState}`, "color: blue; font-weight: bold;");
        // Проверка наличия библиотек
        if (mode === "classic") {
            if (typeof sudoku === 'undefined') return showError("Ошибка: sudoku.js не найден.");
        } else if (mode === "killer") {
            if (typeof killerSudoku === 'undefined') return showError("Ошибка: killerSudoku.js не найден.");
            if (typeof killerSolverLogic === 'undefined') return showError("Ошибка: killerSolverLogic.js не найден.");
            if (typeof killerSudoku._initializeSolverData !== 'function') return showError("Ошибка: killerSudoku.js неполный (_initializeSolverData).");
            if (typeof killerSudoku.generate !== 'function') return showError("Ошибка: killerSudoku.js неполный (generate).");
        } else {
             return showError("Ошибка: Неизвестный режим: " + mode);
        }
        console.log(`${mode} library OK.`);

        currentMode = mode; currentDifficulty = difficulty;
        stopTimer(); historyStack = []; updateUndoButtonState(); isNoteMode = false; updateNoteToggleButtonState(); clearSelection(); clearErrors();
        statusMessageElement.textContent = 'Генерация...'; statusMessageElement.className = '';
        currentPuzzle = null; currentSolution = null; currentCageData = null; currentSolverData = null; userGrid = [];
        currentCandidatesMap = {};
        classicPeersMapCache = null;
        if (killerSolverLogic && killerSolverLogic.resetPeersCache) {
             killerSolverLogic.resetPeersCache();
        }
        isLogicSolverRunning = false;

        let success = false;
        try {
            if (restoreState) {
                console.log("Restoring state...");
                currentMode=restoreState.mode||"classic";currentDifficulty=restoreState.difficulty||'medium';secondsElapsed=restoreState.time||0;hintsRemaining=restoreState.hints??MAX_HINTS;isNoteMode=restoreState.isNoteMode||false;userGrid=restoreState.grid.map(r=>r.map(c=>({value:c.value,notes:new Set(c.notesArray||[])})));
                if(currentMode==="classic"){
                    currentPuzzle=restoreState.puzzle;currentSolution=restoreState.solution;
                    if(!currentPuzzle||!currentSolution) throw new Error("Inv classic save.");
                } else if(currentMode==="killer"){
                    currentCageData=restoreState.cageData;
                    if(!currentCageData?.cages) throw new Error("Inv killer save (cages).");
                    console.log("Re-init solver data...");
                    currentSolverData = killerSudoku._initializeSolverData(currentCageData.cages);
                    if(!currentSolverData) throw new Error("Fail re-init solver data.");
                    console.log("Solver data re-init OK.");
                 } else {
                     throw new Error("Unk save mode:"+currentMode);
                 }
                console.log("Restore OK.");
                success=true;
            } else { // Новая игра
                secondsElapsed = 0; hintsRemaining = MAX_HINTS; clearSavedGameState();
                if (currentMode === "classic") {
                    console.log(`Gen CLASSIC: ${currentDifficulty}...`);
                    currentPuzzle = sudoku.generate(currentDifficulty);
                    console.log(`Generated puzzle: ${currentPuzzle}`);
                    if (!currentPuzzle) throw new Error("Classic gen failed.");
                    currentSolution = sudoku.solve(currentPuzzle);
                    if (!currentSolution) {
                         console.warn("Solver failed for generated classic puzzle.");
                    }
                    userGrid = boardStringToObjectArray(currentPuzzle);
                    console.log("New classic OK."); success = true;
                } else if (currentMode === "killer") {
                    console.log(`Gen KILLER: ${currentDifficulty}...`);
                    console.log("Call killer.generate...");
                    const puzzle = killerSudoku.generate(currentDifficulty);
                    console.log("Killer gen result:", puzzle);
                    if (!puzzle?.cages) throw new Error("Killer gen failed (no cages).");
                    currentCageData = puzzle;
                    console.log("Init solver data...");
                    currentSolverData = killerSudoku._initializeSolverData(currentCageData.cages);
                    console.log("Solver init result:", currentSolverData);
                    if (!currentSolverData) throw new Error("Cage validation/init failed.");
                    userGrid = boardStringToObjectArray(killerSudoku.BLANK_BOARD);
                    console.log("New killer OK."); success = true;
                }
            }
        } catch (error) { console.error("INIT DATA ERR:", error); showError(`Ошибка init (${mode}): ${error.message}`); showScreen(initialScreen); checkContinueButton(); return; }

        if (success) {
             statusMessageElement.textContent = '';
             console.log("Calculating initial candidates map and synchronizing notes...");
             calculateAllCandidates(); // Обновляет currentCandidatesMap и userGrid.notes
             console.log("Rendering...");
             updateNoteToggleButtonState(); renderBoard(); updateHintButtonState(); updateUndoButtonState(); updateLogicSolverButtonsState(); updateTimerDisplay(); console.log(`Game initialized. Is solved? ${isGameSolved()}`); showScreen(gameContainer); console.log("Schedule timer..."); setTimeout(() => { console.log("setTimeout: start timer."); startTimer(); }, 50); console.log("InitGame COMPLETE.");
        } else {
            console.error("InitGame no success flag."); showError("Ошибка инициализации."); showScreen(initialScreen); checkContinueButton();
        }
    }

    // --- Функции сохранения/загрузки состояния ---
     function saveGameState(){if(!userGrid||userGrid.length!==9)return;try{const g=userGrid.map(r=>r.map(c=>({value:c.value,notesArray:Array.from(c.notes||[])})));const s={mode:currentMode,difficulty:currentDifficulty,grid:g,time:secondsElapsed,hints:hintsRemaining,timestamp:Date.now(),isNoteMode: isNoteMode, puzzle:currentMode==='classic'?currentPuzzle:null,solution:currentMode==='classic'?currentSolution:null,cageData:currentMode==='killer'?currentCageData:null};localStorage.setItem(SAVE_KEY,JSON.stringify(s));}catch(e){console.error("SaveErr:",e);showError("Ошибка сохр.");}}
     function loadGameState(){const d=localStorage.getItem(SAVE_KEY);if(!d)return null;try{const s=JSON.parse(d);if(s?.mode&&s?.difficulty&&Array.isArray(s.grid)&&typeof s.timestamp==='number'&&(s.mode==='classic'?!(!s.puzzle||!s.solution):true)&&(s.mode==='killer'?!(!s.cageData||!s.cageData.cages):true)){console.log("Save found:",new Date(s.timestamp).toLocaleString(),`M:${s.mode}`,`D:${s.difficulty}`);return s;}else{console.warn("Inv save. Clearing.",s);clearSavedGameState();return null;}}catch(e){console.error("ParseSaveErr:",e);clearSavedGameState();return null;}}
     function clearSavedGameState(){try{localStorage.removeItem(SAVE_KEY);console.log("Save cleared.");checkContinueButton();}catch(e){console.error("Err clr save:",e);}}


    // --- Функции для Undo ---
     function createHistoryState(){if(!userGrid||userGrid.length!==9)return null;const g=userGrid.map(r=>r.map(c=>({value:c.value,notes:new Set(c.notes||[])})));return{grid:g,hints:hintsRemaining};}
     function pushHistoryState(){if(isGameSolved()) return; const s=createHistoryState();if(s){historyStack.push(s);updateUndoButtonState();}else{console.warn("Inv hist push");}}
     function handleUndo(){if(historyStack.length===0||isShowingAd)return;stopTimer();const ps=historyStack.pop();console.log("Undo...");try{userGrid=ps.grid;hintsRemaining=ps.hints;
         console.log("Recalculating candidates map and notes after undo...");
         calculateAllCandidates(); // Обновляет currentCandidatesMap и userGrid.notes
         renderBoard();clearSelection();clearErrors();updateHintButtonState();updateUndoButtonState();updateLogicSolverButtonsState(); saveGameState();console.log("Undo OK.");}catch(e){console.error("Undo Err:",e);showError("Ошибка отмены");historyStack=[];updateUndoButtonState();updateLogicSolverButtonsState();}finally{resumeTimerIfNeeded();}}
     function updateUndoButtonState(){if(undoButton)undoButton.disabled=historyStack.length===0;}


    // --- Функции для таймера ---
     function startTimer(){const v=gameContainer?.classList.contains('visible');if(timerInterval||!v)return;console.log("Timer start...");updateTimerDisplay();timerInterval=setInterval(()=>{secondsElapsed++;updateTimerDisplay();if(secondsElapsed%10===0)saveGameState();},1000);console.log("Timer started:",timerInterval);}
     function stopTimer(){if(timerInterval){clearInterval(timerInterval);const o=timerInterval;timerInterval=null;console.log(`Timer stop (${o}).Save.`);saveGameState();}}
     function updateTimerDisplay(){if(!timerElement)return;const m=Math.floor(secondsElapsed/60),s=secondsElapsed%60;timerElement.textContent=`Время: ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}
     function resumeTimerIfNeeded(){const s=isGameSolved(),v=gameContainer?.classList.contains('visible');if(v&&!s)startTimer();else stopTimer();}


    // --- Отрисовка ---
     function renderBoard() { console.log(`Render board start: mode=${currentMode}`); if (!boardElement) { console.error("Board element missing!"); return; } boardElement.innerHTML = ''; if (!userGrid || userGrid.length !== 9) { showError("Invalid grid data for rendering."); return; } const cellElementsMap = {}; for (let r = 0; r < 9; r++) { if (!userGrid[r] || userGrid[r].length !== 9) continue; for (let c = 0; c < 9; c++) { const cellId = getCellId(r, c); if (!cellId) continue; const cellElement = createCellElement(r, c); boardElement.appendChild(cellElement); cellElementsMap[cellId] = cellElement; } } if (currentMode === "killer" && currentSolverData?.cageDataArray) { currentSolverData.cageDataArray.forEach((cage, cageIndex) => { if (!cage || !Array.isArray(cage.cells) || cage.cells.length === 0) { console.warn(`Skipping invalid cage data at index ${cageIndex}`); return; } const cageCellSet = new Set(cage.cells); let anchorCellId = null; let minRow = 9, minCol = 9; cage.cells.forEach(cellId => { const coords = getCellCoords(cellId); if (coords) { if (coords.r < minRow) { minRow = coords.r; minCol = coords.c; anchorCellId = cellId; } else if (coords.r === minRow && coords.c < minCol) { minCol = coords.c; anchorCellId = cellId; } } }); cage.cells.forEach(cellId => { const cellElement = cellElementsMap[cellId]; if (!cellElement) return; cellElement.classList.add('cage-cell'); if (cellId === anchorCellId) { cellElement.classList.add('cage-sum-anchor'); if (!cellElement.querySelector('.cage-sum')) { const sumSpan = document.createElement('span'); sumSpan.className = 'cage-sum'; sumSpan.textContent = cage.sum; cellElement.appendChild(sumSpan); } } const coords = getCellCoords(cellId); if (!coords) return; const { r, c } = coords; const neighbors = getNeighbors(r, c); if (r === 0 || !neighbors.top || !cageCellSet.has(neighbors.top)) { cellElement.classList.add('cage-inner-border-top'); } if (c === 0 || !neighbors.left || !cageCellSet.has(neighbors.left)) { cellElement.classList.add('cage-inner-border-left'); } if (r === 8 || !neighbors.bottom || !cageCellSet.has(neighbors.bottom)) { cellElement.classList.add('cage-inner-border-bottom'); } if (c === 8 || !neighbors.right || !cageCellSet.has(neighbors.right)) { cellElement.classList.add('cage-inner-border-right'); } }); }); } console.log("Board rendering complete."); }
     function createCellElement(r, c) { const cell=document.createElement('div');cell.classList.add('cell'); cell.dataset.row=r;cell.dataset.col=c; const cd=userGrid[r]?.[c]; if(!cd){cell.textContent='?';console.warn(`Missing grid data for ${r},${c}`);return cell;} const vc=document.createElement('div');vc.classList.add('cell-value-container'); const nc=document.createElement('div');nc.classList.add('cell-notes-container'); if(cd.value!==0){ vc.textContent=cd.value;vc.style.display='flex';nc.style.display='none'; if(currentMode==='classic'&&currentPuzzle){ const i=r*9+c; if(currentPuzzle[i]&&currentPuzzle[i]!=='.')cell.classList.add('given'); } } else if(cd.notes instanceof Set&&cd.notes.size>0){ vc.style.display='none';nc.style.display='grid';nc.innerHTML=''; for(let n=1;n<=9;n++){const nd=document.createElement('div');nd.classList.add('note-digit');nd.textContent=cd.notes.has(n)?n:'';nc.appendChild(nd);} } else { vc.textContent='';vc.style.display='flex';nc.style.display='none'; } cell.appendChild(vc);cell.appendChild(nc); if((c+1)%3===0&&c<8)cell.classList.add('thick-border-right'); if((r+1)%3===0&&r<8)cell.classList.add('thick-border-bottom'); return cell; }
     function renderCell(r, c) { if (!boardElement) return; const oldCell = boardElement.querySelector(`.cell[data-row='${r}'][data-col='${c}']`); if (oldCell) { try { const newCell = createCellElement(r, c); oldCell.classList.forEach(cls => { if(cls!=='cell' && !cls.startsWith('thick-') && !cls.startsWith('cage-inner-')) newCell.classList.add(cls); }); ['cage-cell', 'cage-sum-anchor', 'cage-inner-border-top', 'cage-inner-border-bottom', 'cage-inner-border-left', 'cage-inner-border-right'].forEach(cls => { if (oldCell.classList.contains(cls)) newCell.classList.add(cls); }); const oldSum = oldCell.querySelector('.cage-sum'); if (oldSum) newCell.appendChild(oldSum.cloneNode(true)); if (selectedRow === r && selectedCol === c) selectedCell = newCell; oldCell.replaceWith(newCell); } catch (error) { console.error(`Error render cell [${r}, ${c}]:`, error); renderBoard(); } } else { console.warn(`renderCell: Cell [${r},${c}] not found? Render full.`); renderBoard(); } }


    // --- Логика подсказки ---
     function provideHintInternal(){if(currentMode!=='classic')return showError("Подсказки только в классике");if(!selectedCell)return showError("Выберите ячейку"); const r=selectedRow,c=selectedCol;if(r<0||c<0||!userGrid[r]?.[c])return showError("Ошибка данных ячейки"); if(userGrid[r][c].value!==0)return showError("Ячейка заполнена");if(selectedCell.classList.contains('given')) return showError("Начальная цифра");pushHistoryState();let hintUsed=false;try{const sv=getSolutionValue(r,c);if(sv===null)throw new Error("Решение недоступно");if(sv>0){console.log(`Hint [${r},${c}]: ${sv}`);userGrid[r][c].value=sv;if(userGrid[r][c].notes)userGrid[r][c].notes.clear();
         updateCandidatesOnSet(r, c, sv, userGrid);
         renderCell(r,c);const hEl=boardElement?.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);if(hEl){hEl.classList.remove('selected');const hc=getComputedStyle(document.documentElement).getPropertyValue('--highlight-hint-flash').trim()||'#fffacd';hEl.style.transition='background-color 0.1s ease-out';hEl.style.backgroundColor=hc;setTimeout(()=>{if(hEl&&hEl.style.backgroundColor!==''){hEl.style.backgroundColor='';hEl.style.transition='';}clearSelection();},500);}else{clearSelection();}hintsRemaining--;hintUsed=true;updateHintButtonState();clearErrors();saveGameState();if(isGameSolved()){checkGame();updateLogicSolverButtonsState();}}else throw new Error(`Некорректное значение решения [${r},${c}]: ${sv}`);}catch(e){console.error("Hint Err:",e.message);showError(e.message);if(!hintUsed&&historyStack.length>0){historyStack.pop();updateUndoButtonState();}}}
     function offerRewardedAdForHints(){if(currentMode!=='classic'||isShowingAd)return;console.log("Offering ad...");if(confirm(`Подсказки зак-сь! Реклама за ${MAX_HINTS} подсказку?`)){if(!isAdReady){showError("Реклама грузится...");preloadRewardedAd();return;}showRewardedAd({onSuccess:()=>{hintsRemaining+=MAX_HINTS;updateHintButtonState();saveGameState();showSuccess(`+${MAX_HINTS} подсказка!`);},onError:(msg)=>{showError(`Ошибка: ${msg||'Реклама?'} Подсказка не добавлена.`);}});}}


    // --- Логика Проверки ---
     function checkGame(){console.log(`Check: ${currentMode}`);clearErrors();if(!userGrid||userGrid.length!==9)return;let isValid=false;let isComplete=!userGrid.flat().some(c=>!c||c.value===0);if(currentMode==="classic"){if(!currentSolution){showError("Нет решения!");return;}isValid=validateClassicSudoku();}else if(currentMode==="killer"){if(!currentSolverData){showError("Нет данных Killer!");return;}isValid=validateKillerSudoku();}if(isValid&&isComplete){showSuccess("Поздравляем! Решено верно!");stopTimer();clearSelection();updateHintButtonState();updateLogicSolverButtonsState();}else if(!isValid){showError("Найдены ошибки.");}else{if(statusMessageElement){statusMessageElement.textContent="Пока верно, но не закончено.";statusMessageElement.className='';}}}
     function validateClassicSudoku(){ let ok=true;if(!currentSolution){console.error("Classic valid Err: no solution!");return false;}for(let r=0;r<9;r++){for(let c=0;c<9;c++){const cd=userGrid[r]?.[c];const el=boardElement?.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);if(!cd||!el||cd.value===0||el.classList.contains('given'))continue;const sv=getSolutionValue(r,c);if(sv===null){console.error(`Classic valid Err: No sol value for ${r},${c}`);ok=false;break;}if(cd.value!==sv){el.classList.add('incorrect');ok=false;}}if(!ok)break;}return ok;}
     function validateKillerSudoku(){let ok=true;const grid=userGrid.map(r=>r.map(c=>c.value));for(let i=0;i<9;i++){if(!isUnitValid(getRow(grid,i))||!isUnitValid(getCol(grid,i))||!isUnitValid(getBlock(grid,i))){ok=false;break;}}if(!ok){showError("Нарушены правила Судоку.");return false;}if(!currentSolverData?.cageDataArray)return false;for(const cage of currentSolverData.cageDataArray){const vals=[];let sum=0;let complete=true;let els=[];for(const cid of cage.cells){const crds=getCellCoords(cid);if(!crds)continue;const v=grid[crds.r][crds.c];const el=boardElement?.querySelector(`.cell[data-row='${crds.r}'][data-col='${crds.c}']`);if(el)els.push(el);if(v===0){complete=false;}else{vals.push(v);sum+=v;}}if(new Set(vals).size!==vals.length){console.warn(`Cage ${cage.id} unique violation:`,vals);ok=false;els.forEach(e=>e.classList.add('incorrect'));}if(complete&&sum!==cage.sum){console.warn(`Cage ${cage.id} sum violation: got ${sum}, expected ${cage.sum}`);ok=false;els.forEach(e=>e.classList.add('incorrect'));}}return ok;}
     function isUnitValid(unit){const nums=unit.filter(n=>n!==0);return new Set(nums).size===nums.length;}
     function getRow(g,r){return g[r];} function getCol(g,c){return g.map(rw=>rw[c]);} function getBlock(g,b){const sr=Math.floor(b/3)*3,sc=(b%3)*3,bl=[];for(let r=0;r<3;r++)for(let c=0;c<3;c++)bl.push(g[sr+r][sc+c]);return bl;}



    // --- ЛОГИЧЕСКИЙ РЕШАТЕЛЬ ---

    /**
     * Общая функция для расчета ВСЕХ кандидатов в зависимости от режима.
     * Обновляет currentCandidatesMap И userGrid.notes.
     */
    function calculateAllCandidates() {
        console.log(`Recalculating all candidates for mode: ${currentMode}`);
        let newMap = {};

        if (currentMode === 'classic') {
             newMap = calculateAllClassicCandidates();
        } else if (currentMode === 'killer') {
            if (killerSolverLogic && currentSolverData && userGrid.length === 9) {
                 newMap = killerSolverLogic.calculateAllKillerCandidates(userGrid, currentSolverData);
            } else {
                 console.warn("Killer solver logic or data not available for candidate calculation.");
            }
        }

        // Синхронизируем карту кандидатов с заметками в userGrid
        currentCandidatesMap = newMap;
        if (userGrid.length === 9) {
            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 9; c++) {
                    if (userGrid[r]?.[c]?.value === 0) {
                        const cellId = getCellId(r, c);
                        userGrid[r][c].notes = new Set(currentCandidatesMap[cellId] || []);
                    } else if (userGrid[r]?.[c]) {
                        userGrid[r][c].notes = new Set();
                    }
                }
            }
             console.log("User grid notes synchronized with candidates map.");
        }
    }


    /**
     * Вычисляет кандидатов для классического режима.
     */
    function calculateAllClassicCandidates() {
        const newMap = {};
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const cellId = getCellId(r, c);
                if (!cellId) continue;
                if (userGrid[r]?.[c]?.value === 0) {
                    newMap[cellId] = calculateClassicCandidatesInternal(r, c);
                } else {
                    newMap[cellId] = new Set();
                }
            }
        }
        console.log("Classic Candidates map recalculated.");
        return newMap;
    }

    /**
     * Внутренняя функция для вычисления классических кандидатов ОДНОЙ ячейки.
     */
    function calculateClassicCandidatesInternal(r, c) {
        if (!userGrid[r]?.[c] || userGrid[r][c].value !== 0) {
            return new Set();
        }
        let cands = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        for (let i = 0; i < 9; i++) {
            if (userGrid[r]?.[i]?.value !== 0) cands.delete(userGrid[r][i].value);
            if (userGrid[i]?.[c]?.value !== 0) cands.delete(userGrid[i][c].value);
        }
        const startRow = Math.floor(r / 3) * 3;
        const startCol = Math.floor(c / 3) * 3;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if (userGrid[startRow + i]?.[startCol + j]?.value !== 0) {
                    cands.delete(userGrid[startRow + i][startCol + j].value);
                }
            }
        }
        return cands;
    }

    /**
     * Обновляет карту кандидатов И ЗАМЕТКИ в userGrid после установки цифры.
     */
    function updateCandidatesOnSet(r, c, digit, userGridRef) {
        const grid = userGridRef || userGrid;
        if (!currentCandidatesMap || !grid ) return;
        const cellId = getCellId(r, c);
        if (!cellId) return;

        if (currentCandidatesMap[cellId]) currentCandidatesMap[cellId].clear();
        else currentCandidatesMap[cellId] = new Set();
        if (grid[r]?.[c]) grid[r][c].notes = new Set();

        const peers = getClassicPeers(r, c);
        for (const peerId of peers) {
            const peerCoords = getCellCoords(peerId);
            if (peerCoords) {
                 if (currentCandidatesMap[peerId]) {
                     currentCandidatesMap[peerId].delete(digit);
                 }
                 if(grid[peerCoords.r]?.[peerCoords.c]?.value === 0) {
                      if (!grid[peerCoords.r][peerCoords.c].notes) grid[peerCoords.r][peerCoords.c].notes = new Set();
                      grid[peerCoords.r][peerCoords.c].notes.delete(digit);
                 }
            }
        }

        if (currentMode === 'killer' && currentSolverData) {
             const cageIndex = currentSolverData.cellToCageMap[cellId];
             if (cageIndex !== undefined) {
                 const cage = currentSolverData.cageDataArray[cageIndex];
                 if (cage) {
                     for (const cageCellId of cage.cells) {
                         if (cageCellId !== cellId) {
                             const coords = getCellCoords(cageCellId);
                             if (coords && grid[coords.r]?.[coords.c]?.value === 0) {
                                 if(currentCandidatesMap[cageCellId]) {
                                      currentCandidatesMap[cageCellId].delete(digit);
                                 }
                                 if (!grid[coords.r][coords.c].notes) grid[coords.r][coords.c].notes = new Set();
                                 grid[coords.r][coords.c].notes.delete(digit);
                             }
                         }
                     }
                 }
             }
        }
        console.log(`Candidates & Notes updated (basic peer/cage check) after setting ${digit} at ${cellId}`);
    }


    /**
     * Обновляет карту кандидатов и ЗАМЕТКИ после стирания цифры.
     */
    function updateCandidatesOnErase(r, c) {
        calculateAllCandidates();
        console.log(`Candidates and Notes recalculated after erasing at ${getCellId(r,c)}`);
    }

    // --- Классические Функции поиска техник (find...) ---
    function findNakedSingle() {
        if (currentMode !== 'classic' || !currentCandidatesMap) return null;
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const cellId = getCellId(r, c);
                if (userGrid[r]?.[c]?.value === 0 && currentCandidatesMap[cellId]) {
                    const cands = currentCandidatesMap[cellId];
                    if (cands.size === 1) { const digit = cands.values().next().value; console.log(`Classic Naked Single: ${digit} at [${r}, ${c}] (from map)`); return { r, c, digit, technique: "Naked Single" }; }
                }
            }
        }
        return null;
    }
    function findHiddenSingle() {
        if (currentMode !== 'classic' || !currentCandidatesMap) return null;
        for (let i = 0; i < 9; i++) { const rowRes = findHiddenSingleInUnit(getRowIndices(i), currentCandidatesMap); if (rowRes) return rowRes; const colRes = findHiddenSingleInUnit(getColIndices(i), currentCandidatesMap); if (colRes) return colRes; const blkRes = findHiddenSingleInUnit(getBlockIndices(i), currentCandidatesMap); if (blkRes) return blkRes; }
        return null;
    }
    function findHiddenSingleInUnit(unitIndices, candidatesMap) {
        for (let d = 1; d <= 9; d++) { let places = []; let presentInUnit = false; for (const [r, c] of unitIndices) { if (userGrid[r]?.[c]?.value === d) { presentInUnit = true; break; } if (userGrid[r]?.[c]?.value === 0) { const cellId = getCellId(r, c); if (candidatesMap[cellId]?.has(d)) { places.push([r, c]); } } } if (!presentInUnit && places.length === 1) { const [r, c] = places[0]; console.log(`Classic Hidden Single: ${d} at [${r}, ${c}] (from map)`); return { r, c, digit: d, technique: "Hidden Single" }; } }
        return null;
    }
     function findNakedPair() {
        if (currentMode !== 'classic' || !currentCandidatesMap) return null;
        const units = getAllUnitsIndices();
        for (let i = 0; i < units.length; i++) { const unit = units[i]; const cellsWith2Candidates = []; for (const [r, c] of unit) { const cellId = getCellId(r, c); if (userGrid[r]?.[c]?.value === 0 && currentCandidatesMap[cellId]) { const cands = currentCandidatesMap[cellId]; if (cands.size === 2) { cellsWith2Candidates.push({ r, c, cands, cellId }); } } }
            if (cellsWith2Candidates.length >= 2) { for (let j = 0; j < cellsWith2Candidates.length; j++) { for (let k = j + 1; k < cellsWith2Candidates.length; k++) { const c1 = cellsWith2Candidates[j]; const c2 = cellsWith2Candidates[k]; if (c1.cands.size === 2 && c2.cands.size === 2) { let sameCandidates = true; for (const digit of c1.cands) if (!c2.cands.has(digit)) { sameCandidates = false; break; } if (sameCandidates) for (const digit of c2.cands) if (!c1.cands.has(digit)) { sameCandidates = false; break; } if (sameCandidates) { const pairDigits = Array.from(c1.cands); const pairCells = [c1.cellId, c2.cellId]; let eliminationNeeded = false; const pairCellsSet = new Set(pairCells); for (const [r_unit, c_unit] of unit) { const unitCellId = getCellId(r_unit, c_unit); if (unitCellId && !pairCellsSet.has(unitCellId) && userGrid[r_unit]?.[c_unit]?.value === 0) { const otherCands = currentCandidatesMap[unitCellId]; if (otherCands && (otherCands.has(pairDigits[0]) || otherCands.has(pairDigits[1]))) { eliminationNeeded = true; break; } } } if (eliminationNeeded) { console.log(`Classic Naked Pair found: Digits ${pairDigits.join(',')} in cells ${pairCells.join(',')}`); return { unitType: getUnitType(i), unitIndex: i, cells: pairCells, digits: pairDigits, technique: "Naked Pair" }; } } } } } }
        }
        return null;
    }
    function findHiddenPair() {
         if (currentMode !== 'classic' || !currentCandidatesMap) return null;
         const units = getAllUnitsIndices();
         for (let i = 0; i < units.length; i++) { const unit = units[i]; const digitLocations = {}; for (const [r, c] of unit) { const cellId = getCellId(r, c); if (userGrid[r]?.[c]?.value === 0 && currentCandidatesMap[cellId]) { currentCandidatesMap[cellId].forEach(digit => { if (!digitLocations[digit]) digitLocations[digit] = []; digitLocations[digit].push(cellId); }); } } const digitsIn2Cells = Object.entries(digitLocations).filter(([d, locs]) => locs.length === 2).map(([d, locs]) => ({ digit: parseInt(d), locations: new Set(locs) }));
             if (digitsIn2Cells.length >= 2) { for (let j = 0; j < digitsIn2Cells.length; j++) { for (let k = j + 1; k < digitsIn2Cells.length; k++) { const d1Info = digitsIn2Cells[j]; const d2Info = digitsIn2Cells[k]; if (d1Info.locations.size === 2 && d1Info.locations.size === d2Info.locations.size) { const loc1Arr = Array.from(d1Info.locations); const loc2Arr = Array.from(d2Info.locations); if ((loc1Arr[0] === loc2Arr[0] && loc1Arr[1] === loc2Arr[1]) || (loc1Arr[0] === loc2Arr[1] && loc1Arr[1] === loc2Arr[0])) { const pairDigits = [d1Info.digit, d2Info.digit]; const pairCells = loc1Arr; let eliminationNeeded = false; for (const cellId of pairCells) { const cellCands = currentCandidatesMap[cellId]; if (cellCands) { for(const cand of cellCands) { if (cand !== pairDigits[0] && cand !== pairDigits[1]) { eliminationNeeded = true; break; } } } if (eliminationNeeded) break; } if (eliminationNeeded) { console.log(`Classic Hidden Pair found: Digits ${pairDigits.join(',')} in cells ${pairCells.join(',')}`); return { unitType: getUnitType(i), unitIndex: i, cells: pairCells, digits: pairDigits, technique: "Hidden Pair" }; } } } } } }
         }
         return null;
     }
    function findNakedTriple() {
        if (currentMode !== 'classic' || !currentCandidatesMap) return null;
        const units = getAllUnitsIndices();
        for (let i = 0; i < units.length; i++) { const unitIndices = units[i]; const candidateCells = []; for (const [r, c] of unitIndices) { const cellId = getCellId(r, c); if (userGrid[r]?.[c]?.value === 0 && currentCandidatesMap[cellId]) { const candidates = currentCandidatesMap[cellId]; if (candidates && (candidates.size === 2 || candidates.size === 3)) { candidateCells.push({ r, c, cands: candidates, cellId }); } } }
            if (candidateCells.length >= 3) { for (let j = 0; j < candidateCells.length; j++) { for (let k = j + 1; k < candidateCells.length; k++) { for (let l = k + 1; l < candidateCells.length; l++) { const c1 = candidateCells[j], c2 = candidateCells[k], c3 = candidateCells[l]; const combinedCands = new Set([...c1.cands, ...c2.cands, ...c3.cands]); if (combinedCands.size === 3) { const tripleDigits = Array.from(combinedCands); const tripleCells = [c1.cellId, c2.cellId, c3.cellId]; let eliminationNeeded = false; const tripleCellsSet = new Set(tripleCells); for (const [r_unit, c_unit] of unitIndices) { const cellId_unit = getCellId(r_unit, c_unit); if (cellId_unit && !tripleCellsSet.has(cellId_unit) && userGrid[r_unit]?.[c_unit]?.value === 0) { const notes = currentCandidatesMap[cellId_unit]; if (notes && (notes.has(tripleDigits[0]) || notes.has(tripleDigits[1]) || notes.has(tripleDigits[2]))) { eliminationNeeded = true; break; } } } if (eliminationNeeded) { console.log(`Classic Naked Triple found: Digits ${tripleDigits.join(',')} in cells ${tripleCells.join(',')}`); return { unitType: getUnitType(i), unitIndex: i, cells: tripleCells, digits: tripleDigits, technique: "Naked Triple" }; } } } } } }
        }
        return null;
    }
     function findHiddenTriple() {
        if (currentMode !== 'classic' || !currentCandidatesMap) return null;
        const units = getAllUnitsIndices();
        for (let i = 0; i < units.length; i++) { const unit = units[i]; const digitLocations = {}; for (const [r, c] of unit) { const cellId = getCellId(r, c); if (userGrid[r]?.[c]?.value === 0 && currentCandidatesMap[cellId]) { currentCandidatesMap[cellId].forEach(digit => { if (!digitLocations[digit]) digitLocations[digit] = []; digitLocations[digit].push(cellId); }); } } const potentialTripleDigits = Object.keys(digitLocations).map(d => parseInt(d)).filter(d => digitLocations[d].length === 2 || digitLocations[d].length === 3);
            if (potentialTripleDigits.length >= 3) { for (let j = 0; j < potentialTripleDigits.length; j++) { for (let k = j + 1; k < potentialTripleDigits.length; k++) { for (let l = k + 1; l < potentialTripleDigits.length; l++) { const d1 = potentialTripleDigits[j]; const d2 = potentialTripleDigits[k]; const d3 = potentialTripleDigits[l]; const tripleDigits = [d1, d2, d3]; const combinedCells = new Set([...digitLocations[d1], ...digitLocations[d2], ...digitLocations[d3]]); if (combinedCells.size === 3) { const tripleCells = Array.from(combinedCells); let eliminationNeeded = false; for (const cellId of tripleCells) { const cellCands = currentCandidatesMap[cellId]; if (cellCands) { for (const cand of cellCands) { if (!tripleDigits.includes(cand)) { eliminationNeeded = true; break; } } } if (eliminationNeeded) break; } if (eliminationNeeded) { console.log(`Classic Hidden Triple found: Digits ${tripleDigits.join(',')} in cells ${tripleCells.join(',')}`); return { unitType: getUnitType(i), unitIndex: i, cells: tripleCells, digits: tripleDigits, technique: "Hidden Triple" }; } } } } } }
        }
        return null;
    }
    function findPointingCandidates() { /* ... как раньше ... */ }
    function tryEliminatePointing(unitType, unitIndex, blockCellIdsSet, digit, candidatesMap) { /* ... как раньше ... */ }
    function findBoxLineReduction() { /* ... как раньше ... */ }
    function checkReductionInLine(lineType, lineIndex, lineIndices, candidatesMap) { /* ... как раньше ... */ }
    function tryEliminateBoxLine(targetBlockIndex, lineType, lineIndex, digit, candidatesMap) { /* ... как раньше ... */ }
    function findXWing() { /* ... как раньше ... */ }
    function findXYWing() { /* ... как раньше ... */ }


    // --- Классические Функции применения техник (apply...) ---
    // <<< ОБНОВЛЕНЫ: Возвращают boolean, обновляют и userGrid.notes >>>

    function applyFoundSingle(foundInfo) {
        if (!foundInfo) return false;
        const { r, c, digit } = foundInfo;
        if (userGrid[r]?.[c]?.value === 0) {
            console.log(`Apply Classic Single: [${r},${c}]=${digit}`);
            userGrid[r][c].value = digit;
            userGrid[r][c].notes = new Set();
            updateCandidatesOnSet(r, c, digit, userGrid);
            renderCell(r, c);
            const el = boardElement?.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);
            if(el){ /* ... код выделения ... */ }
            return true;
        } else {
            console.warn(`Tried apply Classic Single ${digit} to already filled cell [${r},${c}]`);
            return false;
        }
    }

    function applyNakedGroupElimination(elimInfo) {
        if (!elimInfo || !elimInfo.digits || !elimInfo.cells || elimInfo.unitIndex === undefined) return false;
        const { unitIndex, cells, digits, technique } = elimInfo;
        const unitIndices = getUnitIndices(unitIndex);
        if (!unitIndices) return false;
        const groupCellsSet = new Set(cells);
        let eliminatedSomething = false;
        for (const [r, c] of unitIndices) {
            const cellId = getCellId(r, c);
            if (cellId && !groupCellsSet.has(cellId) && userGrid[r]?.[c]?.value === 0) {
                const cellData = userGrid[r][c];
                const candidatesInMap = currentCandidatesMap[cellId];
                let cellChanged = false;
                if (!cellData.notes) cellData.notes = new Set();
                digits.forEach(digit => {
                    let removedFromNotes = cellData.notes.delete(digit);
                    let removedFromMap = candidatesInMap?.delete(digit) || false;
                    if (removedFromNotes || removedFromMap) {
                        eliminatedSomething = true;
                        cellChanged = true;
                        console.log(`  - Removed candidate ${digit} from ${cellId} (Classic Naked Group)`);
                    }
                });
                if (cellChanged) renderCell(r, c);
            }
        }
        if (!eliminatedSomething) console.log(`No *new* eliminations were made for Classic ${technique}.`);
        return eliminatedSomething;
    }

     function applyHiddenGroupElimination(elimInfo) {
         if (!elimInfo || !elimInfo.digits || !elimInfo.cells) return false;
         const { cells, digits, technique } = elimInfo;
         let eliminatedSomething = false;
         const digitsToKeep = new Set(digits);
         for (const cellId of cells) {
             const coords = getCellCoords(cellId);
             if (coords && userGrid[coords.r]?.[coords.c]?.value === 0) {
                 const cellData = userGrid[coords.r][coords.c];
                 const candidatesInMap = currentCandidatesMap[cellId];
                 let cellChanged = false;
                 if (!cellData.notes) cellData.notes = new Set();
                 const notesBefore = new Set(cellData.notes);
                 cellData.notes.forEach(noteDigit => {
                     if (!digitsToKeep.has(noteDigit)) {
                         if(cellData.notes.delete(noteDigit)) {
                            cellChanged = true;
                            eliminatedSomething = true;
                            console.log(`  - Removed candidate ${noteDigit} from notes of ${cellId} (Classic Hidden Group)`);
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
                                    console.log(`  - Removed candidate ${candDigit} from map of ${cellId} (Classic Hidden Group)`);
                                }
                             }
                         }
                     });
                 }
                 if (cellChanged) renderCell(coords.r, coords.c);
             }
         }
         if (!eliminatedSomething) console.log(`No *new* eliminations were made for Classic ${technique}.`);
         return eliminatedSomething;
     }


    /** Применяет элиминацию для Pointing/Box-Line/X-Wing/XY-Wing (Classic). */
    function applyElimination(elimInfo) {
        if (!elimInfo || !elimInfo.eliminations) return false;
        const { eliminations, technique } = elimInfo;
        const digit = elimInfo.digit || elimInfo.digitZ;
        if (!digit) return false;
        let eliminatedSomething = false;
        eliminations.forEach(cellId => {
            const coords = getCellCoords(cellId);
            if (coords && userGrid[coords.r]?.[coords.c]?.value === 0) {
                const cellData = userGrid[coords.r][coords.c];
                const candidatesInMap = currentCandidatesMap[cellId];
                let cellChanged = false;
                if (!cellData.notes) cellData.notes = new Set();
                let removedFromNotes = false;
                 let removedFromMap = false;
                 if (cellData.notes.has(digit)) {
                    if(cellData.notes.delete(digit)) {
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
                    console.log(`  - Removed candidate ${digit} from ${cellId} (Classic ${technique})`);
                }
                if (cellChanged) renderCell(coords.r, coords.c);
            }
        });
        if (!eliminatedSomething) console.log(`No *new* eliminations were made for Classic ${technique}.`);
        return eliminatedSomething;
    }


    // --- Основные функции решателя ---

    /** Выполняет ОДИН шаг логического решателя в зависимости от режима */
    function doLogicStep() {
        console.log(`%c--- Logic Step (${currentMode}) ---`, "color: green; font-weight: bold;");
        if (isGameSolved()) return showSuccess("Судоку уже решено!");
        if (isLogicSolverRunning) return;
        clearErrors();

        let appliedInfo = null;
        let appliedSuccessfully = false; // <<< Флаг успешного применения
        pushHistoryState();
        let historyKept = true;

        try {
            if (currentMode === 'classic') {
                 const singleTechniques = [ { name: "Naked Single", findFunc: findNakedSingle, applyFunc: applyFoundSingle }, { name: "Hidden Single", findFunc: findHiddenSingle, applyFunc: applyFoundSingle } ];
                 const eliminationTechniques = [ { name: "Pointing Candidates", findFunc: findPointingCandidates, applyFunc: applyElimination }, { name: "Box/Line Reduction", findFunc: findBoxLineReduction, applyFunc: applyElimination }, { name: "Naked Pair", findFunc: findNakedPair, applyFunc: applyNakedGroupElimination }, { name: "Hidden Pair", findFunc: findHiddenPair, applyFunc: applyHiddenGroupElimination }, { name: "Naked Triple", findFunc: findNakedTriple, applyFunc: applyNakedGroupElimination }, { name: "Hidden Triple", findFunc: findHiddenTriple, applyFunc: applyHiddenGroupElimination }, { name: "X-Wing", findFunc: findXWing, applyFunc: applyElimination }, { name: "XY-Wing", findFunc: findXYWing, applyFunc: applyElimination } ];
                 // Поиск
                 for (const tech of singleTechniques) {
                     console.log(`Classic Searching ${tech.name}...`);
                     const found = tech.findFunc();
                     if (found) {
                         if (tech.applyFunc(found)) { // <<< Проверяем результат applyFunc
                             appliedInfo = found;
                             appliedSuccessfully = true;
                             break;
                         }
                     }
                 }
                 if (!appliedInfo) {
                     for (const tech of eliminationTechniques) {
                         console.log(`Classic Searching ${tech.name}...`);
                         const found = tech.findFunc();
                         if (found) {
                            if (tech.applyFunc(found)) { // <<< Проверяем результат applyFunc
                                 appliedInfo = found;
                                 appliedSuccessfully = true;
                                 break;
                             }
                         }
                     }
                 }
                 if (!appliedSuccessfully) historyKept = false; // Если ничего не применили

            } else if (currentMode === 'killer') {
                if (!killerSolverLogic || !currentSolverData) { throw new Error("Killer solver logic or data not available."); }
                 // killerSolverLogic.doKillerLogicStep возвращает инфо, только если шаг был применен
                 appliedInfo = killerSolverLogic.doKillerLogicStep(
                     userGrid, currentCandidatesMap, currentSolverData,
                     (r, c, digit) => updateCandidatesOnSet(r, c, digit, userGrid),
                     renderCell
                 );
                 if (appliedInfo) {
                      appliedSuccessfully = true;
                      console.log("Recalculating killer candidates/notes after step...");
                      calculateAllCandidates();
                      renderBoard();
                 } else {
                      historyKept = false;
                 }

            } else {
                 throw new Error("Unsupported game mode for logic solver.");
            }

            // Обработка результата
            if (appliedSuccessfully && appliedInfo) {
                const tech = appliedInfo.technique || "Unknown";
                let details = "Неизвестное действие";
                 if (appliedInfo.digit && appliedInfo.r !== undefined && appliedInfo.c !== undefined) { details = `цифра ${appliedInfo.digit} в [${getCellId(appliedInfo.r, appliedInfo.c)}]`; }
                 else if (appliedInfo.digits && appliedInfo.cells && appliedInfo.unitIndex !== undefined) { const unitType = getUnitType(appliedInfo.unitIndex); const displayIndex = getUnitIndexForDisplay(appliedInfo.unitIndex); details = `цифры ${appliedInfo.digits.join(',')} в ${unitType} ${displayIndex}`; }
                 else if (appliedInfo.digits && appliedInfo.cells) { details = `цифры ${appliedInfo.digits.join(',')} в ячейках ${appliedInfo.cells.join(', ')} (Hidden)`;}
                 else if (appliedInfo.digit && appliedInfo.eliminations) { details = `цифра ${appliedInfo.digit} (убраны кандидаты из ${appliedInfo.eliminations.length} ячеек)`; }
                 else if (appliedInfo.digitZ && appliedInfo.eliminations) { details = `цифра ${appliedInfo.digitZ} (убраны кандидаты из ${appliedInfo.eliminations.length} ячеек)`; }

                showSuccess(`(${currentMode}) Применено ${tech}: ${details}`);
                saveGameState();
            } else {
                 showError(`(${currentMode}) Не найдено следующих логических шагов.`);
            }

        } catch (error) {
             console.error("Error during logic step:", error);
             showError(`Ошибка решателя: ${error.message}`);
             historyKept = false;
        } finally {
            if (!historyKept && historyStack.length > 0) {
                 historyStack.pop();
             }
            updateUndoButtonState();
            updateLogicSolverButtonsState();
        }
    }


    /** Запускает логический решатель до упора */
    function runLogicSolver() {
        console.log(`%c--- Running Full Solver (${currentMode}) ---`, "color: green; font-weight: bold;");
        if (isGameSolved()) { showSuccess("Судоку уже решено!"); return; }
        if (isLogicSolverRunning) { console.log("Solver already running."); return; }

        isLogicSolverRunning = true;
        updateLogicSolverButtonsState();
        statusMessageElement.textContent = "Решаю..."; statusMessageElement.className = '';

        let stepsMade = 0;
        let actionAppliedInLastCycle = true; // <<< Используем флаг УСПЕШНОГО ПРИМЕНЕНИЯ
        let lastActionType = '';
        let errorOccurred = false;

        // Определяем функцию для выполнения одного шага
        let stepFunction;

        if (currentMode === 'classic') {
            stepFunction = () => {
                 let appliedInfo = null; // Инфо о ПРИМЕНЕННОМ шаге
                 const singleTechs = [ { name: "Naked Single", findFunc: findNakedSingle, applyFunc: applyFoundSingle }, { name: "Hidden Single", findFunc: findHiddenSingle, applyFunc: applyFoundSingle } ];
                 const elimTechs = [ { name: "Pointing Candidates", findFunc: findPointingCandidates, applyFunc: applyElimination }, { name: "Box/Line Reduction", findFunc: findBoxLineReduction, applyFunc: applyElimination }, { name: "Naked Pair", findFunc: findNakedPair, applyFunc: applyNakedGroupElimination }, { name: "Hidden Pair", findFunc: findHiddenPair, applyFunc: applyHiddenGroupElimination }, { name: "Naked Triple", findFunc: findNakedTriple, applyFunc: applyNakedGroupElimination }, { name: "Hidden Triple", findFunc: findHiddenTriple, applyFunc: applyHiddenGroupElimination }, { name: "X-Wing", findFunc: findXWing, applyFunc: applyElimination }, { name: "XY-Wing", findFunc: findXYWing, applyFunc: applyElimination } ];
                 for(const tech of singleTechs) { const found = tech.findFunc(); if(found) { if(tech.applyFunc(found)) { appliedInfo = found; break; } } } // <<< Запоминаем, если applyFunc вернул true
                 if (!appliedInfo) { for(const tech of elimTechs) { const found = tech.findFunc(); if(found) { if(tech.applyFunc(found)) { appliedInfo = found; break; } } } } // <<< Запоминаем, если applyFunc вернул true
                 return appliedInfo; // <<< Возвращаем инфо, только если шаг был УСПЕШНО применен
             };
        } else if (currentMode === 'killer') {
            if (!killerSolverLogic || !currentSolverData) {
                showError("Ошибка: Логика или данные Killer Sudoku недоступны.");
                isLogicSolverRunning = false; updateLogicSolverButtonsState(); return;
            }
            stepFunction = () => killerSolverLogic.doKillerLogicStep(
                 userGrid, currentCandidatesMap, currentSolverData,
                 updateCandidatesOnSet, renderCell
            ); // <<< doKillerLogicStep возвращает инфо только при успехе
        } else {
            showError("Неподдерживаемый режим для решателя.");
            isLogicSolverRunning = false; updateLogicSolverButtonsState(); return;
        }

        function solverCycle() {
            // <<< Проверяем флаг УСПЕШНОГО ПРИМЕНЕНИЯ из предыдущего цикла >>>
            if (errorOccurred || isGameSolved() || !actionAppliedInLastCycle) {
                 if (currentMode === 'killer' && !errorOccurred) {
                    console.log("Final recalculation and render for Killer solver cycle.");
                    calculateAllCandidates();
                    renderBoard();
                 }
                isLogicSolverRunning = false;
                updateLogicSolverButtonsState();
                saveGameState();
                if (!errorOccurred) {
                    if (isGameSolved()) showSuccess(`(${currentMode}) Решено за ${stepsMade} шаг(ов)!`);
                    else showError(`(${currentMode}) Стоп после ${stepsMade} шагов. ${lastActionType ? ('Последнее: ' + lastActionType + '.') : 'Не найдено следующих действий.'}`);
                }
                return;
            }

            let appliedInfo = null; // Инфо о шаге, ПРИМЕНЕННОМ в этом цикле
            pushHistoryState();
            let historyKept = true;
            let appliedSuccessfully = false; // <<< Флаг успеха для текущего цикла

            try {
                appliedInfo = stepFunction(); // Выполняем один шаг

                if (appliedInfo) {
                    appliedSuccessfully = true; // <<< Шаг был УСПЕШНО ПРИМЕНЕН
                    lastActionType = appliedInfo.technique || 'Unknown';
                    stepsMade++;
                    console.log(`(${currentMode}) Solver Step ${stepsMade}: Applied ${lastActionType}`);
                     // <<< Пересчет кандидатов/заметок ПОСЛЕ шага Killer >>>
                     if (currentMode === 'killer') {
                          console.log("Recalculating killer candidates/notes during full solve...");
                          calculateAllCandidates();
                     }
                } else {
                    appliedSuccessfully = false; // <<< Шаг не найден или не применен
                    historyKept = false;
                }
            } catch (error) {
                console.error("Error during solver cycle:", error);
                showError(`Ошибка решателя: ${error.message}`);
                errorOccurred = true;
                historyKept = false;
                appliedSuccessfully = false; // Считаем ошибку как неуспешное применение
            } finally {
                 if (!historyKept && historyStack.length > 0) {
                     historyStack.pop();
                 }
                 updateUndoButtonState();

                 actionAppliedInLastCycle = appliedSuccessfully; // <<< Обновляем флаг для СЛЕДУЮЩЕЙ итерации

                 if (!errorOccurred) {
                     if (currentMode === 'killer' && appliedSuccessfully) {
                         renderBoard(); // Рендерим доску после Killer шага
                     }
                     setTimeout(solverCycle, 5);
                 } else {
                      isLogicSolverRunning = false;
                      updateLogicSolverButtonsState();
                      saveGameState();
                 }
            }
        }

        actionAppliedInLastCycle = true;
        solverCycle(); // Запускаем
    }



     /** Обновляет состояние кнопок решателя */
     function updateLogicSolverButtonsState() {
         const enabled = !isGameSolved() && !isLogicSolverRunning;
         let stepEnabled = false;
         let solveEnabled = false;

         if (enabled) {
              if (currentMode === 'classic') {
                   stepEnabled = true;
                   solveEnabled = true;
              } else if (currentMode === 'killer') {
                   if (currentSolverData && killerSolverLogic) {
                        stepEnabled = true;
                        solveEnabled = true;
                   }
              }
         }

         if(logicStepButton) logicStepButton.disabled = !stepEnabled;
         if(logicSolveButton) logicSolveButton.disabled = !solveEnabled;
     }


    // --- Вспомогательные для логического решателя ---
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



    // --- Обработчики Событий ---
     function addEventListeners() {
        console.log("Adding event listeners...");
        startNewGameButton?.addEventListener('click', () => { console.log("New Game btn"); showScreen(newGameOptionsScreen); });
        continueGameButton?.addEventListener('click', () => { console.log("Continue btn"); const s=loadGameState(); if(s){ initGame(s.mode, s.difficulty, s); } else { showError("Нет сохраненной игры."); continueGameButton.disabled = true; } });
        gameModeSelectionContainer?.addEventListener('click', (event) => { const button = event.target.closest('button[data-mode]'); if (button && !button.classList.contains('selected')) { gameModeSelectionContainer.querySelectorAll('.selected').forEach(btn => btn.classList.remove('selected')); button.classList.add('selected'); const selectedMode = button.dataset.mode; const selectedDifficulty = difficultyButtonsContainer?.querySelector('button.selected')?.dataset.difficulty || 'medium'; console.log(`MODE selected: ${selectedMode}. Starting with diff: ${selectedDifficulty}`); initGame(selectedMode, selectedDifficulty); } });
        difficultyButtonsContainer?.addEventListener('click', (event) => { const target = event.target.closest('button.difficulty-button'); if (target && !target.classList.contains('selected')) { difficultyButtonsContainer.querySelectorAll('.selected').forEach(btn => btn.classList.remove('selected')); target.classList.add('selected'); const selectedDifficulty = target.dataset.difficulty; const selectedMode = gameModeSelectionContainer?.querySelector('button.selected')?.dataset.mode || 'classic'; console.log(`DIFFICULTY selected: ${selectedDifficulty}. Starting with mode: ${selectedMode}`); initGame(selectedMode, selectedDifficulty); } });
        themeToggleCheckbox?.addEventListener('change', handleThemeToggle);
        backToInitialButton?.addEventListener('click', () => { console.log("Back btn"); showScreen(initialScreen); checkContinueButton(); });
        boardElement?.addEventListener('click', (e)=>{ try { const target = e.target.closest('.cell'); if (!target || isShowingAd || isGameSolved()) return; const r = parseInt(target.dataset.row); const c = parseInt(target.dataset.col); if (isNaN(r) || isNaN(c)) return; if (target === selectedCell) { clearSelection(); } else { clearSelection(); selectedCell = target; selectedRow = r; selectedCol = c; if (!(currentMode === 'classic' && target.classList.contains('given'))) { selectedCell.classList.add('selected'); } highlightRelatedCells(r, c); } clearErrors(); } catch (error) { console.error("!!!! BOARD CLICK HANDLER ERROR !!!!", error); showError(`Ошибка клика: ${error.message}`); } });
        // NUMPAD Handler
        numpad?.addEventListener('click', (e)=>{
            const b=e.target.closest('button');
            if (!b || isShowingAd || isGameSolved() || !selectedCell) return;
            if (currentMode === 'classic' && selectedCell.classList.contains('given')) return;
            if (b.id === 'note-toggle-button') { isNoteMode = !isNoteMode; updateNoteToggleButtonState(); return; }

            clearErrors();
            if (!userGrid[selectedRow]?.[selectedCol]) return;

            const cd = userGrid[selectedRow][selectedCol];
            let rerenderNeeded = false;
            let candidatesChanged = false;
            let pushHistoryNeeded = false;

            // Определяем, нужно ли сохранять историю ДО действия
            if (b.id === 'erase-button') { pushHistoryNeeded = (cd.value !== 0) || (cd.notes?.size > 0); }
            else if (b.dataset.num) { const n = parseInt(b.dataset.num); if (!isNoteMode) { pushHistoryNeeded = (cd.value !== n); } else { pushHistoryNeeded = (cd.value === 0); } }

            if (pushHistoryNeeded && !isGameSolved()) { pushHistoryState(); }

            // Выполняем действие
            if (b.id === 'erase-button') {
                if (cd.value !== 0) { cd.value = 0; rerenderNeeded = true; candidatesChanged = true; updateCandidatesOnErase(selectedRow, selectedCol); }
                else if (cd.notes?.size > 0) { cd.notes.clear(); rerenderNeeded = true; }
            } else if (b.dataset.num) {
                const n = parseInt(b.dataset.num);
                if (isNoteMode) {
                    if (cd.value === 0) { if (!(cd.notes instanceof Set)) cd.notes = new Set(); if (cd.notes.has(n)) cd.notes.delete(n); else cd.notes.add(n); rerenderNeeded = true; }
                } else {
                    if (cd.value !== n) { cd.value = n; if (cd.notes) cd.notes.clear(); rerenderNeeded = true; candidatesChanged = true; updateCandidatesOnSet(selectedRow, selectedCol, n, userGrid); }
                    else { cd.value = 0; rerenderNeeded = true; candidatesChanged = true; updateCandidatesOnErase(selectedRow, selectedCol); }
                }
            }

            // Перерисовка и сохранение
            if (rerenderNeeded) {
                renderCell(selectedRow, selectedCol);
                 if(isNoteMode && currentMode === 'killer') {
                     renderBoard(); // Полный рендер для Killer заметок
                     if(selectedRow!==-1 && selectedCol!==-1){ selectedCell = boardElement?.querySelector(`.cell[data-row='${selectedRow}'][data-col='${selectedCol}']`); if(selectedCell && !(currentMode === 'classic' && selectedCell.classList.contains('given'))){ selectedCell.classList.add('selected'); highlightRelatedCells(selectedRow, selectedCol); } else { clearSelection(); } }
                 }
            }
            if ((rerenderNeeded || candidatesChanged) && !isGameSolved()){ saveGameState(); updateLogicSolverButtonsState(); }
        });
        checkButton?.addEventListener('click', checkGame);
        undoButton?.addEventListener('click', handleUndo);
        hintButton?.addEventListener('click', ()=>{if(isShowingAd||isGameSolved())return;if(currentMode==='classic'&&hintsRemaining>0)provideHintInternal();else if(currentMode==='classic')offerRewardedAdForHints();else showError("Подсказки недоступны");});
        exitGameButton?.addEventListener('click', ()=>{console.log("Exit btn");stopTimer();showScreen(initialScreen);checkContinueButton();});
        logicStepButton?.addEventListener('click', doLogicStep);
        logicSolveButton?.addEventListener('click', runLogicSolver);
        // KEYDOWN Handler
        document.addEventListener('keydown', (e)=>{
            if(document.activeElement.tagName==='INPUT'||isShowingAd||!gameContainer?.classList.contains('visible')||isGameSolved())return;

            if(e.key.toLowerCase()==='n'||e.key.toLowerCase()==='т'){ console.log("N/T key pressed"); isNoteMode=!isNoteMode; updateNoteToggleButtonState(); e.preventDefault(); return; }
            if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){ e.preventDefault();handleUndo();return; }
            if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
                 if(!selectedCell){ const firstCell=boardElement?.querySelector(`.cell[data-row='0'][data-col='0']`); if(firstCell) firstCell.click(); else return; }
                 else { let nr=selectedRow,nc=selectedCol; const move = (cur, d, m) => Math.min(m, Math.max(0, cur + d)); if(e.key==='ArrowUp') nr = move(selectedRow, -1, 8); if(e.key==='ArrowDown') nr = move(selectedRow, 1, 8); if(e.key==='ArrowLeft') nc = move(selectedCol, -1, 8); if(e.key==='ArrowRight') nc = move(selectedCol, 1, 8); if(nr !== selectedRow || nc !== selectedCol){ const nextEl = boardElement?.querySelector(`.cell[data-row='${nr}'][data-col='${nc}']`); if(nextEl) nextEl.click(); } }
                 e.preventDefault(); return;
            }

            if(!selectedCell||(currentMode==='classic'&&selectedCell.classList.contains('given')))return;
            if (!userGrid[selectedRow]?.[selectedCol]) return;

            const cd = userGrid[selectedRow][selectedCol];
            let rerenderNeeded = false;
            let candidatesChanged = false;
            let pushHistoryNeeded = false;

            if (e.key >= '1' && e.key <= '9') { const n = parseInt(e.key); if (!isNoteMode) pushHistoryNeeded = (cd.value !== n); else pushHistoryNeeded = (cd.value === 0); }
            else if (e.key === 'Backspace' || e.key === 'Delete') { pushHistoryNeeded = (cd.value !== 0) || (cd.notes?.size > 0); }

            if (pushHistoryNeeded && !isGameSolved()) { pushHistoryState(); }

            if (e.key >= '1' && e.key <= '9') {
                clearErrors(); const n = parseInt(e.key);
                if (isNoteMode) { if (cd.value === 0) { if (!(cd.notes instanceof Set)) cd.notes = new Set(); if (cd.notes.has(n)) cd.notes.delete(n); else cd.notes.add(n); rerenderNeeded = true; } }
                else { if (cd.value !== n) { cd.value = n; if (cd.notes) cd.notes.clear(); rerenderNeeded = true; candidatesChanged = true; updateCandidatesOnSet(selectedRow, selectedCol, n, userGrid); } else { cd.value = 0; rerenderNeeded = true; candidatesChanged = true; updateCandidatesOnErase(selectedRow, selectedCol); } }
                e.preventDefault();
            }
            else if (e.key === 'Backspace' || e.key === 'Delete') {
                clearErrors();
                if (cd.value !== 0) { cd.value = 0; rerenderNeeded = true; candidatesChanged = true; updateCandidatesOnErase(selectedRow, selectedCol); }
                else if (cd.notes?.size > 0) { cd.notes.clear(); rerenderNeeded = true; }
                e.preventDefault();
            }

            if (rerenderNeeded) {
                 renderCell(selectedRow, selectedCol);
                 if(isNoteMode && currentMode === 'killer') {
                     renderBoard();
                     if(selectedRow!==-1 && selectedCol!==-1){ selectedCell = boardElement?.querySelector(`.cell[data-row='${selectedRow}'][data-col='${selectedCol}']`); if(selectedCell && !(currentMode === 'classic' && selectedCell.classList.contains('given'))){ selectedCell.classList.add('selected'); highlightRelatedCells(selectedRow, selectedCol); } else { clearSelection(); } }
                 }
            }
            if ((rerenderNeeded || candidatesChanged) && !isGameSolved()){ saveGameState(); updateLogicSolverButtonsState(); }
        });


        console.log("Event listeners added.");
    }


    // --- Инициализация Приложения ---
    function initializeApp(){console.log("Init app...");try{loadThemePreference();checkContinueButton();addEventListeners();showScreen(initialScreen);initializeAds();try{if(window.Telegram?.WebApp)Telegram.WebApp.ready();else console.log("TG SDK not found.");}catch(e){console.error("TG SDK Err:",e);}}catch(e){console.error("CRITICAL INIT ERR:",e);document.body.innerHTML=`<div style='padding:20px;color:red;'><h1>Ошибка!</h1><p>${e.message}</p><pre>${e.stack}</pre></div>`;}}
    function checkContinueButton(){if(!continueGameButton)return;try{const s=loadGameState();continueGameButton.disabled=!s;console.log(`Continue btn state:${!continueGameButton.disabled}`);}catch(e){console.error("Err check cont:",e);continueGameButton.disabled=true;}}

    // --- Запуск ---
    initializeApp();

}); // Конец 'DOMContentLoaded'

```

**Ключевые изменения в `script.js`:**

1.  **`runLogicSolver`:**
    *   Логика цикла теперь корректно проверяет `appliedSuccessfully`, которое становится `true` только если `applyFunc` вернула `true` (т.е. реально что-то изменила).
    *   Флаг `actionFoundInLastCycle` теперь устанавливается в `appliedSuccessfully` для управления следующей итерацией.
    *   История (`historyKept`, `historyStack.pop()`) откатывается только если `appliedSuccessfully` равно `false`.
    *   **Важно для Killer:** Пересчет кандидатов (`calculateAllCandidates()`) и полный рендер (`renderBoard()`) теперь вызываются **после** успешного шага Killer *внутри* цикла `solverCycle`, чтобы гарантировать актуальность данных для следующего шага и отображение изменений. Финальный пересчет/рендер после цикла также оставлен для надежности.
2.  **`doLogicStep`:** Аналогично, теперь проверяет `appliedSuccessfully` перед тем, как считать шаг успешным и сохранять историю. Вызывает `calculateAllCandidates()` и `renderBoard()` после успешного шага Killer.
3.  **`updateCandidatesOnSet`**: Уточнено, что для Killer это упрощенное обновление, и полный пересчет может быть надежнее.
4.  **`apply...` функции (Classic):** Уточнена логика возврата `true`/`false` в зависимости от реальных изменений.

С этими исправлениями решатель должен правильно определять, когда шаг привел к реальным изменениям, и останавливаться, когда заходит в тупик или находит шаг, который больше ничего не меняет.
