// Убедитесь, что sudoku.js, killerSudoku.js, И killerSolverLogic.js подключены ДО script.js
document.addEventListener('DOMContentLoaded', () => {
    // console.log("DOM ready.");

    // --- Элементы DOM ---
    const initialScreen = document.getElementById('initial-screen');
    const newGameOptionsScreen = document.getElementById('new-game-options');
    const gameContainer = document.getElementById('game-container');
    const startNewGameButton = document.getElementById('start-new-game-button');
    const continueGameButton = document.getElementById('continue-game-button');
    const difficultyButtonsContainer = newGameOptionsScreen?.querySelector('.difficulty-selection');
    const themeToggleCheckbox = document.getElementById('theme-toggle-checkbox');
    const backToInitialButton = document.getElementById('back-to-initial-button');
    const startSelectedGameButton = document.getElementById('start-selected-game-button');
    const exitGameButton = document.getElementById('exit-game-button');
    const boardElement = document.getElementById('sudoku-board');
    const checkButton = document.getElementById('check-button');
    const hintButton = document.getElementById('hint-button');
    const undoButton = document.getElementById('undo-button');
    const statusMessageElement = document.getElementById('status-message');
    const numpad = document.getElementById('numpad');
    const noteToggleButton = document.getElementById('note-toggle-button');
    const eraseButton = document.getElementById('erase-button');
    const timerElement = document.getElementById('timer');
    const logicNextStepButton = document.getElementById('logic-step-button');
    const logicSolveButton = document.getElementById('logic-solve-button');

    // --- Состояние игры ---
    let userGrid = [];
    let solutionGrid = [];
    let currentMode = 'classic';
    let currentDifficulty = 'medium';
    let selectedCell = null;
    let selectedRow = -1;
    let selectedCol = -1;
    let isNoteMode = false;
    let timerInterval;
    let timeElapsed = 0;
    let history = [];
    let hintsRemaining = 3;

    let killerSolverData = null;
    let currentCandidatesMap = {};

    function getCellId(r, c) { return "ABCDEFGHI"[r] + (c + 1); }

    function saveGameState() {
        try {
            const gameState = {
                userGrid: userGrid.map(row => row.map(cell => ({
                    value: cell.value,
                    isGiven: cell.isGiven,
                    notes: Array.from(cell.notes),
                    isError: cell.isError,
                    isSolved: cell.isSolved
                }))),
                solutionGrid: solutionGrid,
                currentMode: currentMode,
                currentDifficulty: currentDifficulty,
                timeElapsed: timeElapsed,
                history: history.map(h => ({
                    ...h,
                    newNotes: Array.from(h.newNotes),
                    oldCandidates: h.oldCandidates ? Array.from(h.oldCandidates) : []
                })),
                hintsRemaining: hintsRemaining,
                killerSolverData: killerSolverData,
            };
            localStorage.setItem('sudokuGameState', JSON.stringify(gameState));
            checkContinueButtonState();
        } catch (e) {
            console.error("Error saving game state:", e);
        }
    }

    function loadGameState() {
        try {
            const savedState = localStorage.getItem('sudokuGameState');
            if (savedState) {
                const gameState = JSON.parse(savedState);
                userGrid = gameState.userGrid.map(row => row.map(cell => ({
                    ...cell,
                    notes: new Set(cell.notes)
                })));
                solutionGrid = gameState.solutionGrid;
                currentMode = gameState.currentMode;
                currentDifficulty = gameState.currentDifficulty;
                timeElapsed = gameState.timeElapsed;
                history = gameState.history.map(h => ({
                    ...h,
                    newNotes: new Set(h.newNotes),
                    oldCandidates: h.oldCandidates ? new Set(h.oldCandidates) : new Set()
                }));
                hintsRemaining = gameState.hintsRemaining;
                killerSolverData = gameState.killerSolverData;

                createEmptyBoardCells(); // 1. Создаем пустые div'ы ячеек

                if (currentMode === 'killer' && killerSolverData && killerSolverData.cageDataArray) {
                    renderKillerCages(killerSolverData.cageDataArray); // 2. Рендерим клетки (суммы и границы)
                    updateAllCandidates(); // 3. Это создаст currentCandidatesMap и вызовет renderCell для всех
                } else {
                     updateAllCandidates(); // Для классики тоже нужно (вызовет renderCell)
                }

                startTimer();
                updateHintsDisplay();
                updateLogicSolverButtonsState();
                undoButton.disabled = history.length === 0;
                return true;
            }
        } catch (e) {
            console.error("Error loading game state:", e);
            clearGameState(); // Очистить, если данные повреждены
            return false;
        }
        return false;
    }


    function clearGameState() {
        localStorage.removeItem('sudokuGameState');
        userGrid = [];
        solutionGrid = [];
        selectedCell = null;
        selectedRow = -1;
        selectedCol = -1;
        isNoteMode = false;
        clearInterval(timerInterval);
        timeElapsed = 0;
        timerElement.textContent = "00:00";
        history = [];
        hintsRemaining = 3;
        killerSolverData = null;
        currentCandidatesMap = {};
        boardElement.innerHTML = ''; // Очищаем доску от старых ячеек
        updateHintsDisplay();
        updateLogicSolverButtonsState();
        checkContinueButtonState();
        statusMessageElement.textContent = "";
    }

    function startTimer() {
        clearInterval(timerInterval);
        timerElement.textContent = formatTime(timeElapsed);
        timerInterval = setInterval(() => {
            timeElapsed++;
            timerElement.textContent = formatTime(timeElapsed);
        }, 1000);
    }
    function formatTime(seconds) {
        const min = String(Math.floor(seconds / 60)).padStart(2, '0');
        const sec = String(seconds % 60).padStart(2, '0');
        return `${min}:${sec}`;
    }

    function stopTimer() {
        clearInterval(timerInterval);
    }

    function createEmptyBoardCells() {
        boardElement.innerHTML = '';
        for (let rIdx = 0; rIdx < 9; rIdx++) {
            for (let cIdx = 0; cIdx < 9; cIdx++) {
                const cellElement = document.createElement('div');
                cellElement.classList.add('cell');
                cellElement.dataset.row = rIdx;
                cellElement.dataset.col = cIdx;
                cellElement.id = getCellId(rIdx, cIdx);
                if (rIdx % 3 === 0 && rIdx !== 0) cellElement.classList.add('border-top');
                if (cIdx % 3 === 0 && cIdx !== 0) cellElement.classList.add('border-left');
                cellElement.addEventListener('click', () => selectCell(rIdx, cIdx));
                boardElement.appendChild(cellElement);
            }
        }
    }

    function renderCell(r, c, valueToSet = null, candidatesToSet = null) {
        const cellElement = document.getElementById(getCellId(r,c));
        if (!cellElement || !userGrid || !userGrid[r] || !userGrid[r][c]) return;

        const cellData = userGrid[r][c];
        const cellId = getCellId(r, c);

        let cageSumElement = cellElement.querySelector('.cage-sum');
        const notesContainerElement = cellElement.querySelector('.notes-container');
        if (notesContainerElement) cellElement.removeChild(notesContainerElement);
        
        // Очищаем только текстовое содержимое, кроме .cage-sum
        Array.from(cellElement.childNodes).forEach(node => {
            if (node.nodeType === Node.TEXT_NODE || (node.classList && node.classList.contains('cell-value'))) {
                cellElement.removeChild(node);
            }
        });
        // Если cageSumElement был и удалился, добавляем его обратно в начало
        if (cageSumElement && !cellElement.contains(cageSumElement)) {
             cellElement.prepend(cageSumElement);
        }

        cellElement.classList.remove('user-input', 'error', 'given');

        if (valueToSet !== null && valueToSet !== 0) {
            cellData.value = valueToSet;
            cellData.isSolved = true; // Может быть решена пользователем или логикой
            cellElement.textContent = valueToSet; // Показываем цифру
            if (cageSumElement) cellElement.prepend(cageSumElement); // Убеждаемся, что сумма спереди

            if (cellData.isGiven) {
                cellElement.classList.add('given');
            } else {
                cellElement.classList.add('user-input'); // Стиль для введенных/решенных цифр
            }
        } else { // valueToSet === 0 или null
            cellData.value = 0;
            cellData.isSolved = false;
            let notesSource = candidatesToSet; // Приоритет у переданных (от решателя)
            if (!notesSource && cellData.notes.size > 0) { // Иначе пользовательские
                 notesSource = cellData.notes;
            } else if (!notesSource && currentMode === 'killer' && currentCandidatesMap[cellId]?.size > 0) { // Иначе общие от решателя
                 notesSource = currentCandidatesMap[cellId];
            }

            if (notesSource && notesSource.size > 0) {
                const notesContainer = document.createElement('div');
                notesContainer.classList.add('notes-container');
                Array.from(notesSource).sort((a, b) => a - b).forEach(noteNum => {
                    const noteSpan = document.createElement('span');
                    noteSpan.classList.add('note');
                    noteSpan.textContent = noteNum;
                    notesContainer.appendChild(noteSpan);
                });
                cellElement.appendChild(notesContainer);
                if (cageSumElement) cellElement.prepend(cageSumElement); // Сумма спереди
            }
        }
        if (cellData.isError) cellElement.classList.add('error');
        // updateSelectionHighlight(); // Не здесь, а после полного обновления доски или при выборе ячейки
    }


    function selectCell(r, c) {
        clearSelectionHighlights();
        selectedRow = r;
        selectedCol = c;
        selectedCell = document.getElementById(getCellId(r,c));
        if (selectedCell) {
            selectedCell.classList.add('selected');
            highlightRelatedCells(r, c);
        }
    }

    function clearSelectionHighlights() {
        boardElement.querySelectorAll('.cell').forEach(cell => {
            cell.classList.remove('selected', 'highlight', 'highlight-cage', 'highlight-value');
        });
    }

    function highlightRelatedCells(r, c) {
        if (!userGrid || userGrid.length === 0 || !userGrid[r]?.[c]) return;
        const valueInSelectedCell = userGrid[r][c].value;
        const selectedCellId = getCellId(r, c);

        if (currentMode === 'killer' && killerSolverData?.cellToCageMap) {
            const selectedCageId = killerSolverData.cellToCageMap[selectedCellId];
            if (selectedCageId !== undefined) {
                const cage = killerSolverData.cageDataArray.find(cg => cg.id === selectedCageId);
                if (cage) {
                    cage.cells.forEach(cellIdInCage => {
                        const cellElement = document.getElementById(cellIdInCage);
                        if (cellElement && cellIdInCage !== selectedCellId) { // Не подсвечивать саму выбранную ячейку
                            cellElement.classList.add('highlight-cage');
                        }
                    });
                }
            }
        } else { // Классический режим
            userGrid.forEach((row, rowIdx) => {
                if (!row) return;
                row.forEach((cellData, colIdx) => {
                    if (!cellData) return;
                    const cellElement = document.getElementById(getCellId(rowIdx,colIdx));
                    if (!cellElement || (rowIdx === r && colIdx === c)) return;
                    const inSameRow = (rowIdx === r);
                    const inSameCol = (colIdx === c);
                    const inSameBlock = (Math.floor(rowIdx/3)===Math.floor(r/3) && Math.floor(colIdx/3)===Math.floor(c/3));
                    if (inSameRow || inSameCol || inSameBlock) cellElement.classList.add('highlight');
                });
            });
        }

        if (valueInSelectedCell !== 0) {
            userGrid.forEach((row, rowIdx) => { if (!row) return;
                row.forEach((cellData, colIdx) => { if (!cellData) return;
                    if (cellData.value === valueInSelectedCell && !(rowIdx === r && colIdx === c)) {
                        const cellElement = document.getElementById(getCellId(rowIdx,colIdx));
                        if (cellElement) cellElement.classList.add('highlight-value');
                    }
                });
            });
        }
    }
    function updateSelectionHighlight() {
        if (selectedRow !== -1 && selectedCol !== -1) {
            boardElement.querySelectorAll('.cell.highlight, .cell.highlight-cage, .cell.highlight-value').forEach(c => {
                if (!c.classList.contains('selected')) {
                    c.classList.remove('highlight', 'highlight-cage', 'highlight-value');
                }
            });
            highlightRelatedCells(selectedRow, selectedCol);
        }
    }

    function handleInput(digit) {
        if (!selectedCell || selectedRow === -1 || selectedCol === -1 || !userGrid[selectedRow]?.[selectedCol] || userGrid[selectedRow][selectedCol].isGiven) return;
        const currentCellData = userGrid[selectedRow][selectedCol];
        const cellId = getCellId(selectedRow, selectedCol);
        history.push({ r: selectedRow, c: selectedCol, oldValue: currentCellData.value, newNotes: new Set(currentCellData.notes),
            oldCandidates: currentCandidatesMap[cellId] ? new Set(currentCandidatesMap[cellId]) : new Set() });
        undoButton.disabled = false;
        if (isNoteMode) {
            currentCellData.value = 0;
            if (currentCellData.notes.has(digit)) currentCellData.notes.delete(digit);
            else currentCellData.notes.add(digit);
            renderCell(selectedRow, selectedCol, 0, currentCellData.notes);
        } else {
            if (currentCellData.value === digit) { currentCellData.value = 0; currentCellData.isSolved = false; }
            else { currentCellData.value = digit; currentCellData.isSolved = true; }
            currentCellData.notes.clear();
            renderCell(selectedRow, selectedCol, currentCellData.value, null);
        }
        updateBoardState(); saveGameState(); checkGameCompletion();
    }

    function eraseCell() {
        if (!selectedCell || selectedRow === -1 || selectedCol === -1 || !userGrid[selectedRow]?.[selectedCol] || userGrid[selectedRow][selectedCol].isGiven) return;
        const currentCellData = userGrid[selectedRow][selectedCol];
        const cellId = getCellId(selectedRow, selectedCol);
        history.push({ r: selectedRow, c: selectedCol, oldValue: currentCellData.value, newNotes: new Set(currentCellData.notes),
            oldCandidates: currentCandidatesMap[cellId] ? new Set(currentCandidatesMap[cellId]) : new Set() });
        undoButton.disabled = false;
        currentCellData.value = 0; currentCellData.notes.clear();
        currentCellData.isError = false; currentCellData.isSolved = false;
        renderCell(selectedRow, selectedCol, 0, new Set());
        updateBoardState(); saveGameState(); checkGameCompletion();
    }

    function toggleNoteMode() {
        isNoteMode = !isNoteMode;
        noteToggleButton.title = isNoteMode ? 'Режим заметок (ВКЛ)' : 'Режим ввода (ВЫКЛ)';
        numpad.classList.toggle('note-mode-active', isNoteMode);
    }

    function updateBoardState() {
        if (!userGrid || userGrid.length === 0) return;
        let hasAnyErrors = false;
        userGrid.forEach((row, rIdx) => {
            if (!row) return;
            row.forEach((cell, cIdx) => {
                if (!cell) return;
                cell.isError = false; // Сброс перед проверкой
                const cellElement = document.getElementById(getCellId(rIdx, cIdx));
                if(cellElement) cellElement.classList.remove('error');

                if (cell.value !== 0) {
                    // Проверка по строке
                    for (let col = 0; col < 9; col++) {
                        if (col !== cIdx && userGrid[rIdx]?.[col]?.value === cell.value) { cell.isError = true; break; }
                    }
                    // Проверка по столбцу
                    if (!cell.isError) {
                        for (let r_check = 0; r_check < 9; r_check++) {
                            if (r_check !== rIdx && userGrid[r_check]?.[cIdx]?.value === cell.value) { cell.isError = true; break; }
                        }
                    }
                    // Проверка по блоку 3x3
                    if (!cell.isError) {
                        const startRow = Math.floor(rIdx/3)*3, startCol = Math.floor(cIdx/3)*3;
                        for (let br=0; br<3; br++) { for (let bc=0; bc<3; bc++) {
                            const R=startRow+br, C=startCol+bc;
                            if ((R!==rIdx||C!==cIdx) && userGrid[R]?.[C]?.value === cell.value) {cell.isError=true; break;}
                        } if (cell.isError) break; }
                    }
                    // Проверка внутри клетки (Killer Sudoku)
                    if (!cell.isError && currentMode === 'killer' && killerSolverData?.cellToCageMap && killerSolverData?.cageDataArray) {
                        const currentCellId = getCellId(rIdx,cIdx);
                        const cageId = killerSolverData.cellToCageMap[currentCellId];
                        const cage = killerSolverData.cageDataArray.find(cd => cd.id === cageId);
                        if (cage) {
                            for (const cageCellId of cage.cells) {
                                if (cageCellId !== currentCellId) {
                                    const coords = killerSolverLogic.getCellCoords(cageCellId);
                                    if (coords && userGrid[coords.r]?.[coords.c]?.value === cell.value) { cell.isError = true; break; }
                                }
                            }
                        }
                    }
                    if (cell.isError) {
                        hasAnyErrors = true;
                        if(cellElement) cellElement.classList.add('error');
                    }
                }
            });
        });

        updateAllCandidates(); // Это вызовет renderCell для обновления заметок/значений

        if (hasAnyErrors) {
            statusMessageElement.textContent = "Есть ошибки на доске!";
            statusMessageElement.classList.remove('success-msg'); statusMessageElement.classList.add('incorrect-msg');
        } else {
            if (!isGameEffectivelySolved()) { // Если не решена и нет ошибок
                statusMessageElement.textContent = "";
            } // Иначе (если решена), checkGameCompletion установит "Поздравляем"
            statusMessageElement.classList.remove('incorrect-msg');
        }
        updateSelectionHighlight(); // Обновить подсветку, т.к. классы ошибок могли измениться
    }


    function updateAllCandidates() {
        if (!userGrid || userGrid.length === 0) return;
        if (currentMode === 'killer' && killerSolverData) {
            currentCandidatesMap = killerSolverLogic.calculateAllKillerCandidates(userGrid, killerSolverData);
        } else {
            currentCandidatesMap = {}; // Для классики пока не используем общие кандидаты активно
        }
        
        for (let r = 0; r < 9; r++) { if (!userGrid[r]) continue;
            for (let c = 0; c < 9; c++) { if (!userGrid[r][c]) continue;
                const cellData = userGrid[r][c];
                const notesToDraw = (cellData.value === 0)
                    ? ((currentMode === 'killer' && currentCandidatesMap[getCellId(r,c)]?.size > 0)
                        ? currentCandidatesMap[getCellId(r,c)]
                        : cellData.notes)
                    : null;
                renderCell(r, c, cellData.value, notesToDraw);
            }
        }
    }

    function checkGameCompletion() {
        const solved = isGameEffectivelySolved();
        if (solved) {
            stopTimer(); statusMessageElement.textContent = "Поздравляем! Вы решили судоку!";
            statusMessageElement.classList.remove('incorrect-msg'); statusMessageElement.classList.add('success-msg');
            disableInput(); saveGameState();
        } else {
            let allFilled = true;
            if (userGrid?.length > 0) { for (let r=0;r<9;r++) { if(!userGrid[r]) {allFilled=false; break;}
                for (let c=0;c<9;c++) { if(!userGrid[r][c]||userGrid[r][c].value===0) {allFilled=false;break;}} if(!allFilled)break;}}
            else allFilled = false;

            if (allFilled) { // Все заполнено, но есть ошибки (т.к. solved === false)
                statusMessageElement.textContent = "Доска заполнена, но есть ошибки.";
                statusMessageElement.classList.remove('success-msg');statusMessageElement.classList.add('incorrect-msg');
            } else if (statusMessageElement.textContent.startsWith("Поздравляем")) {
                 statusMessageElement.textContent = ""; // Очистить, если было поздравление, а игра уже не решена
            }
        }
        updateLogicSolverButtonsState();
    }

    function isGameEffectivelySolved() {
        if (!userGrid || userGrid.length !== 9) return false;
        for (let r=0; r<9; r++) { if (!userGrid[r] || userGrid[r].length !== 9) return false;
            for (let c=0; c<9; c++) { if (!userGrid[r][c] || userGrid[r][c].value === 0 || userGrid[r][c].isError) return false; }
        } return true;
    }

    function disableInput() {
        numpad.querySelectorAll('button').forEach(b => b.disabled = true);
        checkButton.disabled = true; hintButton.disabled = true; undoButton.disabled = true;
        logicNextStepButton.disabled = true; logicSolveButton.disabled = true;
    }
    function enableInput() {
        numpad.querySelectorAll('button').forEach(b => b.disabled = false);
        checkButton.disabled = false; updateHintsDisplay();
        undoButton.disabled = history.length === 0; updateLogicSolverButtonsState();
    }

    function updateHintsDisplay() {
        hintButton.textContent = `💡 ${hintsRemaining}/3`;
        hintButton.disabled = hintsRemaining <= 0 || isGameEffectivelySolved();
    }

    function applyHint() {
        if (hintsRemaining <= 0 || isGameEffectivelySolved()) return;
        let hintApplied = false, emptyCells = [];
        if (userGrid?.length === 9) { for (let r=0;r<9;r++) { if(!userGrid[r]) continue;
            for (let c=0;c<9;c++) { if (userGrid[r][c]?.value === 0) emptyCells.push({r,c});}}}
        if (emptyCells.length > 0) {
            const {r,c} = emptyCells[Math.floor(Math.random()*emptyCells.length)];
            if (!solutionGrid?.[r]?.[c]) return; const correctValue = solutionGrid[r][c].value;
            history.push({ r,c,oldValue:userGrid[r][c].value, newNotes:new Set(userGrid[r][c].notes),
                oldCandidates: currentCandidatesMap[getCellId(r,c)] ? new Set(currentCandidatesMap[getCellId(r,c)]) : new Set() });
            undoButton.disabled = false; userGrid[r][c].value = correctValue; userGrid[r][c].notes.clear();
            userGrid[r][c].isError = false; userGrid[r][c].isSolved = true;
            renderCell(r,c,correctValue,null); hintsRemaining--; hintApplied = true;
        }
        if(hintApplied){updateHintsDisplay();updateBoardState();saveGameState();checkGameCompletion();}
        else statusMessageElement.textContent = "Нет ячеек для подсказки.";
    }

    function undoLastMove() {
        if (history.length === 0) return;
        const lastMove = history.pop(); const {r,c,oldValue,newNotes,oldCandidates} = lastMove;
        if (!userGrid?.[r]?.[c]) return;
        userGrid[r][c].value = oldValue; userGrid[r][c].notes = new Set(newNotes);
        userGrid[r][c].isError = false; userGrid[r][c].isSolved = (oldValue !== 0);
        if (currentMode === 'killer') currentCandidatesMap[getCellId(r,c)] = new Set(oldCandidates);
        // renderCell теперь правильно обработает заметки или значение
        const notesToDraw = (userGrid[r][c].value === 0)
            ? ((currentMode === 'killer' && currentCandidatesMap[getCellId(r,c)]?.size > 0)
                ? currentCandidatesMap[getCellId(r,c)]
                : userGrid[r][c].notes)
            : null;
        renderCell(r,c,userGrid[r][c].value, notesToDraw);
        undoButton.disabled = history.length===0; updateBoardState(); saveGameState(); checkGameCompletion(); enableInput();
    }

    function generateNewGame(mode, difficulty) {
        stopTimer(); clearGameState(); currentMode = mode; currentDifficulty = difficulty;
        let puzzleGenData;
        if (currentMode === 'classic') {
            if (typeof sudoku === 'undefined' || typeof sudoku.generate !== 'function') {
                alert("sudoku.js не загружен."); showScreen('initial-screen'); return; }
            puzzleGenData = sudoku.generate(difficulty);
            if (!puzzleGenData?.puzzle || !puzzleGenData?.solution) {
                alert("Ошибка генерации судоку."); showScreen('initial-screen'); return; }
            puzzleGenData.cages = [];
        } else { // Killer Sudoku
            try { puzzleGenData = killerSudoku.generate(difficulty);
                if (!puzzleGenData?.cages || !puzzleGenData?.grid || !puzzleGenData?.solution) throw new Error("gen invalid data");
                killerSolverData = { cageDataArray: puzzleGenData.cages, cellToCageMap: {} };
                let tempMap = {}; puzzleGenData.cages.forEach((cg, idx) => {
                    // ID клетки должен быть уникальным. Если генератор не присвоил, используем индекс.
                    if (cg.id === undefined) cg.id = idx;
                    cg.cells.forEach(cid => { tempMap[cid] = cg.id; }); });
                killerSolverData.cellToCageMap = tempMap;
            } catch (e) { console.error("Error Killer Gen:", e); alert("Ошибка генерации Killer Sudoku."); showScreen('initial-screen'); return; }
        }

        userGrid = Array(9).fill(null).map(() => Array(9).fill(null).map(() => ({})));
        solutionGrid = Array(9).fill(null).map(() => Array(9).fill(null).map(() => ({})));
        let charIdx = 0; const blank = currentMode==='classic'?(sudoku.BLANK_CHAR||'.'):(killerSudoku.BLANK_CHAR||'.');
        for (let r=0;r<9;r++) { for (let c=0;c<9;c++) {
            const puzChar=puzzleGenData.grid[charIdx], solChar=puzzleGenData.solution[charIdx];
            const val=(puzChar===blank)?0:parseInt(puzChar), isGiv=(val!==0);
            userGrid[r][c]={value:val,isGiven:isGiv,isError:false,notes:new Set(),isSolved:isGiv};
            solutionGrid[r][c]={value:parseInt(solChar)}; charIdx++; } }

        createEmptyBoardCells(); // 1. Создаем пустые div'ы ячеек

        if (currentMode === 'killer' && puzzleGenData.cages) {
            renderKillerCages(puzzleGenData.cages); // 2. Рендерим клетки (суммы и границы) НА пустые ячейки
        }
        
        updateAllCandidates(); // 3. Это рассчитает кандидатов и вызовет renderCell для КАЖДОЙ ячейки

        timeElapsed=0; startTimer(); updateHintsDisplay(); enableInput();
        history=[]; undoButton.disabled=true; statusMessageElement.textContent="";
        showScreen('game-container'); saveGameState();
    }

    function renderKillerCages(cages) {
        boardElement.querySelectorAll('.cell').forEach(cellEl => {
            cellEl.classList.remove('cage-border-top','cage-border-bottom','cage-border-left','cage-border-right');
            const sumDiv = cellEl.querySelector('.cage-sum'); if (sumDiv) cellEl.removeChild(sumDiv);
        });
        if (!cages || !killerSolverData?.cellToCageMap) return;

        cages.forEach(cage => {
            if (!cage.cells?.length) return;
            let topLeftId = cage.cells[0], minR=10, minC=10;
            cage.cells.forEach(cId => { const crds = killerSolverLogic.getCellCoords(cId);
                if(crds) { if(crds.r<minR){minR=crds.r;minC=crds.c;topLeftId=cId;}
                           else if(crds.r===minR && crds.c<minC){minC=crds.c;topLeftId=cId;}}});
            
            const tlCellEl = document.getElementById(topLeftId);
            if (tlCellEl && cage.sum > 0) {
                const sumDiv = document.createElement('div'); sumDiv.classList.add('cage-sum');
                sumDiv.textContent = cage.sum; tlCellEl.prepend(sumDiv);
            }

            const cageIdent = killerSolverData.cellToCageMap[cage.cells[0]];
            cage.cells.forEach(cellId => {
                const crds = killerSolverLogic.getCellCoords(cellId); if (!crds) return;
                const {r,c} = crds; const curEl = document.getElementById(cellId); if (!curEl) return;
                const tN=(r>0)?getCellId(r-1,c):null; if(!tN||killerSolverData.cellToCageMap[tN]!==cageIdent) curEl.classList.add('cage-border-top');
                const bN=(r<8)?getCellId(r+1,c):null; if(!bN||killerSolverData.cellToCageMap[bN]!==cageIdent) curEl.classList.add('cage-border-bottom');
                const lN=(c>0)?getCellId(r,c-1):null; if(!lN||killerSolverData.cellToCageMap[lN]!==cageIdent) curEl.classList.add('cage-border-left');
                const rN=(c<8)?getCellId(r,c+1):null; if(!rN||killerSolverData.cellToCageMap[rN]!==cageIdent) curEl.classList.add('cage-border-right');
            });
        });
    }

    function showScreen(id) { document.querySelectorAll('.screen').forEach(s=>s.classList.remove('visible'));
        const t = typeof id === 'string' ? document.getElementById(id) : id; if (t) t.classList.add('visible'); }
    function updateLogicSolverButtonsState() {
        const iK=currentMode==='killer',slv=isGameEffectivelySolved();
        logicNextStepButton.style.display=iK?'inline-block':'none'; logicSolveButton.style.display=iK?'inline-block':'none';
        if(iK){logicNextStepButton.disabled=slv;logicSolveButton.disabled=slv;} }

    if(logicNextStepButton){ logicNextStepButton.addEventListener('click',()=>{ if(currentMode!=='killer'||isGameEffectivelySolved())return;
        updateAllCandidates(); const s=killerSolverLogic.doKillerLogicStep(userGrid,currentCandidatesMap,killerSolverData,updateAllCandidates,renderCell);
        if(s){statusMessageElement.textContent=`Техника: ${s.appliedTechnique||s.technique}!`; statusMessageElement.classList.remove('incorrect-msg');statusMessageElement.classList.add('success-msg');
            updateBoardState();saveGameState();checkGameCompletion();
        }else{statusMessageElement.textContent="Нет новых шагов.";statusMessageElement.classList.remove('success-msg');statusMessageElement.classList.add('incorrect-msg');}
        updateLogicSolverButtonsState(); });}
    if(logicSolveButton){ logicSolveButton.addEventListener('click',()=>{ if(currentMode!=='killer'||isGameEffectivelySolved())return;
        let st=0,maxIt=200,apl; do{apl=false;updateAllCandidates(); const s=killerSolverLogic.doKillerLogicStep(userGrid,currentCandidatesMap,killerSolverData,updateAllCandidates,renderCell);
            if(s){st++;apl=true;updateBoardState();if(isGameEffectivelySolved())break;} maxIt--;}while(apl&&maxIt>0);
        if(isGameEffectivelySolved()){statusMessageElement.textContent=`Решено за ${st} шагов!`;statusMessageElement.classList.remove('incorrect-msg');statusMessageElement.classList.add('success-msg');
        }else if(st>0){statusMessageElement.textContent=`Применено ${st} шагов.`;statusMessageElement.classList.remove('success-msg');statusMessageElement.classList.add('incorrect-msg');
        }else{statusMessageElement.textContent="Нет шагов.";statusMessageElement.classList.remove('success-msg');statusMessageElement.classList.add('incorrect-msg');}
        saveGameState();checkGameCompletion();updateLogicSolverButtonsState(); });}

    function addEventListeners() {
        startNewGameButton.addEventListener('click',()=>showScreen('new-game-options'));
        continueGameButton.addEventListener('click',()=>{if(loadGameState())showScreen('game-container');else{alert("Нет сохраненной игры.");showScreen('new-game-options');}});
        document.querySelectorAll('#game-mode-selection .mode-button').forEach(b=>{b.addEventListener('click',e=>{document.querySelectorAll('#game-mode-selection .mode-button').forEach(btn=>btn.classList.remove('selected'));e.target.classList.add('selected');});});
        if(difficultyButtonsContainer){difficultyButtonsContainer.querySelectorAll('button.difficulty-button').forEach(b=>{b.addEventListener('click',e=>{difficultyButtonsContainer.querySelectorAll('button.difficulty-button').forEach(btn=>btn.classList.remove('selected'));e.target.classList.add('selected');});});}
        if(startSelectedGameButton){startSelectedGameButton.addEventListener('click',()=>{const mE=document.querySelector('#game-mode-selection .mode-button.selected'),dE=document.querySelector('.difficulty-selection button.difficulty-button.selected');if(mE&&dE)generateNewGame(mE.dataset.mode,dE.dataset.difficulty);else alert('Выберите режим/сложность.');});}
        if(backToInitialButton)backToInitialButton.addEventListener('click',()=>showScreen('initial-screen'));
        if(exitGameButton){exitGameButton.addEventListener('click',()=>{if(confirm("Выйти? Прогресс сохранен.")){saveGameState();stopTimer();clearSelectionHighlights();selectedCell=null;selectedRow=-1;selectedCol=-1;showScreen('initial-screen');}});}
        if(numpad){numpad.querySelectorAll('button[data-num]').forEach(b=>b.addEventListener('click',e=>handleInput(parseInt(e.target.dataset.num))));}
        if(eraseButton)eraseButton.addEventListener('click',eraseCell); if(noteToggleButton)noteToggleButton.addEventListener('click',toggleNoteMode);
        if(checkButton)checkButton.addEventListener('click',updateBoardState); if(hintButton)hintButton.addEventListener('click',applyHint); if(undoButton)undoButton.addEventListener('click',undoLastMove);
        document.addEventListener('keydown',e=>{if(!gameContainer.classList.contains('visible'))return;
            if(selectedCell&&selectedRow!==-1&&selectedCol!==-1){const d=parseInt(e.key);
                if(d>=1&&d<=9){handleInput(d);e.preventDefault();return;}
                if(e.key==='Backspace'||e.key==='Delete'){eraseCell();e.preventDefault();return;}
                if(e.key==='n'||e.key==='N'||e.key===' '||e.key==='Enter'){if(!e.ctrlKey&&!e.metaKey){toggleNoteMode();e.preventDefault();return;}}}
            if(selectedRow!==-1&&selectedCol!==-1){let nR=selectedRow,nC=selectedCol,mvd=false;
                if(e.key==='ArrowUp'){nR--;mvd=true;}else if(e.key==='ArrowDown'){nR++;mvd=true;}else if(e.key==='ArrowLeft'){nC--;mvd=true;}else if(e.key==='ArrowRight'){nC++;mvd=true;}
                if(mvd){e.preventDefault();selectCell(Math.max(0,Math.min(8,nR)),Math.max(0,Math.min(8,nC)));return;}}
            if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){if(!undoButton.disabled)undoLastMove();e.preventDefault();}
            if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){if(!hintButton.disabled)applyHint();e.preventDefault();}
            if(currentMode==='killer'){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='n'){if(!logicNextStepButton.disabled)logicNextStepButton.click();e.preventDefault();}
                if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(!logicSolveButton.disabled)logicSolveButton.click();}}});}
    function initializeApp(){loadThemePreference();checkContinueButtonState();addEventListeners();showScreen('initial-screen');try{if(window.Telegram?.WebApp)window.Telegram.WebApp.ready();}catch(e){console.error("TG SDK err:",e);}}
    function checkContinueButtonState(){if(!continueGameButton)return;try{continueGameButton.disabled=!localStorage.getItem('sudokuGameState');}catch(e){console.error("Err check cont state:",e);continueGameButton.disabled=true;}}
    const THEME_KEY='sudokuTheme';function loadThemePreference(){const t=localStorage.getItem(THEME_KEY);document.body.classList.toggle('dark-theme',t==='dark');if(themeToggleCheckbox)themeToggleCheckbox.checked=(t==='dark');}
    if(themeToggleCheckbox){themeToggleCheckbox.addEventListener('change',()=>{document.body.classList.toggle('dark-theme',themeToggleCheckbox.checked);localStorage.setItem(THEME_KEY,themeToggleCheckbox.checked?'dark':'light');});}
    initializeApp();
});
