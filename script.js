// Убедитесь, что sudoku.js, killerSudoku.js, И killerSolverLogic.js подключены ДО script.js
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM ready.");

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

                if (currentMode === 'killer' && killerSolverData) {
                    updateAllCandidates(); // Это создаст currentCandidatesMap
                }

                startTimer();
                // Рендер клеток ДО рендера доски, чтобы классы были на месте
                if (currentMode === 'killer' && killerSolverData) {
                    renderKillerCages(killerSolverData.cageDataArray);
                }
                renderBoard();
                updateHintsDisplay();
                updateLogicSolverButtonsState();
                undoButton.disabled = history.length === 0;
                return true;
            }
        } catch (e) {
            console.error("Error loading game state:", e);
            clearGameState();
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

    // ВОЗВРАЩАЕМ СТАРЫЙ РЕНДЕРИНГ ЯЧЕЕК (renderBoard + renderCell)
    function renderBoard() {
        boardElement.innerHTML = '';
        if (!userGrid || userGrid.length === 0) return;

        userGrid.forEach((row, rIdx) => {
            if (!row) return;
            row.forEach((cellData, cIdx) => {
                if (!cellData) return;

                const cellElement = document.createElement('div');
                cellElement.classList.add('cell');
                cellElement.dataset.row = rIdx;
                cellElement.dataset.col = cIdx;
                cellElement.id = getCellId(rIdx, cIdx);

                // Границы блоков 3x3
                if (rIdx % 3 === 0 && rIdx !== 0) cellElement.classList.add('border-top');
                if (cIdx % 3 === 0 && cIdx !== 0) cellElement.classList.add('border-left');

                // Сначала применяем классы границ клеток, если это Killer Sudoku
                // Это делается в renderKillerCages, который должен быть вызван до renderBoard при инициализации
                // или здесь, если renderKillerCages не вызывается отдельно при каждом renderBoard.
                // Для простоты, предположим, что классы cage-border-* уже установлены на cellElement, если нужно.

                if (cellData.isGiven) {
                    cellElement.classList.add('given');
                    cellElement.textContent = cellData.value;
                } else if (cellData.value !== 0) {
                    cellElement.classList.add('user-input');
                    cellElement.textContent = cellData.value;
                } else { // Пустая ячейка, отображаем заметки
                    const notesSource = (currentMode === 'killer' && currentCandidatesMap[cellElement.id]?.size > 0)
                                      ? currentCandidatesMap[cellElement.id]
                                      : cellData.notes;

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
                    }
                }

                if (cellData.isError) cellElement.classList.add('error');

                // Сумма клетки (если есть и если этот элемент должен ее отображать)
                // Этот код дублируется из renderKillerCages, если не управлять им централизованно.
                // Лучше, чтобы renderKillerCages ставил суммы один раз, а renderBoard/renderCell их не трогали.
                // Здесь оставляем его для полноты, но это место для оптимизации.
                const cageSumDivExisting = cellElement.querySelector('.cage-sum');
                if (cageSumDivExisting) cellElement.removeChild(cageSumDivExisting); // Удаляем, если был

                if (currentMode === 'killer' && killerSolverData?.cellToCageMap && killerSolverData?.cageDataArray) {
                    const cageId = killerSolverData.cellToCageMap[cellElement.id];
                    const cage = killerSolverData.cageDataArray.find(c => c.id === cageId);
                    if (cage) {
                        let isTopLeftOfCage = true; // Простая проверка, для корректной нужно сравнение координат
                        let minR = 10, minC = 10;
                        let topLeftCellIdForCage = cage.cells[0];
                         cage.cells.forEach(idInCage => {
                            const coords = killerSolverLogic.getCellCoords(idInCage);
                            if(coords) {
                                if (coords.r < minR) { minR = coords.r; minC = coords.c; topLeftCellIdForCage = idInCage; }
                                else if (coords.r === minR && coords.c < minC) { minC = coords.c; topLeftCellIdForCage = idInCage; }
                            }
                        });
                        if (cellElement.id === topLeftCellIdForCage) {
                            const sumDiv = document.createElement('div');
                            sumDiv.classList.add('cage-sum');
                            sumDiv.textContent = cage.sum;
                            cellElement.prepend(sumDiv);
                        }
                    }
                }


                cellElement.addEventListener('click', () => selectCell(rIdx, cIdx));
                boardElement.appendChild(cellElement);
            });
        });
        updateSelectionHighlight();
    }

    function renderCell(r, c, valueToSet = null, candidatesToSet = null) {
        const cellElement = boardElement.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);
        if (!cellElement || !userGrid || !userGrid[r] || !userGrid[r][c]) return;

        const cellData = userGrid[r][c];
        const cellId = getCellId(r, c);

        // Очищаем предыдущее содержимое (кроме суммы клетки и границ)
        const cageSumElement = cellElement.querySelector('.cage-sum');
        const notesContainerElement = cellElement.querySelector('.notes-container');
        if (notesContainerElement) cellElement.removeChild(notesContainerElement);
        cellElement.textContent = ''; // Очищаем текст (цифру)
        if (cageSumElement) cellElement.prepend(cageSumElement); // Восстанавливаем сумму

        cellElement.classList.remove('user-input', 'error', 'given'); // Сброс классов состояний

        if (valueToSet !== null && valueToSet !== 0) {
            cellData.value = valueToSet;
            cellData.isSolved = true;
            cellElement.textContent = valueToSet; // Пишем цифру прямо в ячейку
            if (cellData.isGiven) {
                cellElement.classList.add('given');
            } else {
                cellElement.classList.add('user-input');
            }
        } else { // Значение 0 или null, отображаем заметки
            cellData.value = 0;
            cellData.isSolved = false;

            let notesSource = candidatesToSet;
            if (!notesSource && cellData.notes.size > 0) {
                 notesSource = cellData.notes;
            } else if (!notesSource && currentCandidatesMap[cellId]?.size > 0 && currentMode === 'killer') {
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
            }
        }
        if (cellData.isError) cellElement.classList.add('error');
        updateSelectionHighlight();
    }


    function selectCell(r, c) {
        clearSelectionHighlights();
        selectedRow = r;
        selectedCol = c;
        selectedCell = boardElement.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);
        if (selectedCell) {
            selectedCell.classList.add('selected');
            highlightRelatedCells(r, c);
        }
    }

    function clearSelectionHighlights() {
        boardElement.querySelectorAll('.cell').forEach(cell => {
            cell.classList.remove('selected', 'highlight', 'highlight-value');
        });
    }

    function highlightRelatedCells(r, c) {
        if (!userGrid || userGrid.length === 0 || !userGrid[r] || !userGrid[r][c]) return;

        const valueInSelectedCell = userGrid[r][c].value;
        const selectedCellId = getCellId(r,c);
        const selectedCageId = (currentMode === 'killer' && killerSolverData?.cellToCageMap) ? killerSolverData.cellToCageMap[selectedCellId] : undefined;

        userGrid.forEach((row, rowIdx) => {
            if (!row) return;
            row.forEach((cellData, colIdx) => {
                if (!cellData) return;
                const cellElement = boardElement.querySelector(`.cell[data-row='${rowIdx}'][data-col='${colIdx}']`);
                if (!cellElement) return;

                const inSameRow = (rowIdx === r);
                const inSameCol = (colIdx === c);
                const inSameBlock = (Math.floor(rowIdx / 3) === Math.floor(r / 3) && Math.floor(colIdx / 3) === Math.floor(c / 3));
                let inSameCage = false;
                if (currentMode === 'killer' && selectedCageId !== undefined && killerSolverData?.cellToCageMap) {
                    const currentCellId = getCellId(rowIdx, colIdx);
                    if (killerSolverData.cellToCageMap[currentCellId] === selectedCageId) {
                        inSameCage = true;
                    }
                }

                if (inSameRow || inSameCol || inSameBlock || inSameCage) {
                    if(!(rowIdx === r && colIdx === c)) cellElement.classList.add('highlight');
                }
                if (valueInSelectedCell !== 0 && cellData.value === valueInSelectedCell) {
                     if(!(rowIdx === r && colIdx === c)) cellElement.classList.add('highlight-value');
                }
            });
        });
    }
    function updateSelectionHighlight() {
        if (selectedRow !== -1 && selectedCol !== -1) {
            boardElement.querySelectorAll('.cell.highlight, .cell.highlight-value').forEach(c => {
                if (!c.classList.contains('selected')) c.classList.remove('highlight', 'highlight-value');
            });
            highlightRelatedCells(selectedRow, selectedCol);
        }
    }

    function handleInput(digit) {
        if (!selectedCell || selectedRow === -1 || selectedCol === -1 || !userGrid[selectedRow]?.[selectedCol] || userGrid[selectedRow][selectedCol].isGiven) return;

        const currentCellData = userGrid[selectedRow][selectedCol];
        const cellId = getCellId(selectedRow, selectedCol);

        history.push({
            r: selectedRow, c: selectedCol, oldValue: currentCellData.value,
            newNotes: new Set(currentCellData.notes),
            oldCandidates: currentCandidatesMap[cellId] ? new Set(currentCandidatesMap[cellId]) : new Set()
        });
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

        history.push({
            r: selectedRow, c: selectedCol, oldValue: currentCellData.value,
            newNotes: new Set(currentCellData.notes),
            oldCandidates: currentCandidatesMap[cellId] ? new Set(currentCandidatesMap[cellId]) : new Set()
        });
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
                cell.isError = false;
                const cellElement = boardElement.querySelector(`.cell[data-row='${rIdx}'][data-col='${cIdx}']`);
                if(cellElement) cellElement.classList.remove('error');

                if (cell.value !== 0) {
                    for (let col = 0; col < 9; col++) {
                        if (col !== cIdx && userGrid[rIdx]?.[col]?.value === cell.value) { cell.isError = true; break; }
                    }
                    if (!cell.isError) {
                        for (let row_check = 0; row_check < 9; row_check++) {
                            if (row_check !== rIdx && userGrid[row_check]?.[cIdx]?.value === cell.value) { cell.isError = true; break; }
                        }
                    }
                    if (!cell.isError) {
                        const startRow = Math.floor(rIdx / 3) * 3; const startCol = Math.floor(cIdx / 3) * 3;
                        for (let br = 0; br < 3; br++) {
                            for (let bc = 0; bc < 3; bc++) {
                                const R = startRow + br; const C = startCol + bc;
                                if ((R !== rIdx || C !== cIdx) && userGrid[R]?.[C]?.value === cell.value) { cell.isError = true; break; }
                            }
                            if (cell.isError) break;
                        }
                    }
                    if (!cell.isError && currentMode === 'killer' && killerSolverData?.cellToCageMap && killerSolverData?.cageDataArray) {
                        const currentCellId = getCellId(rIdx, cIdx);
                        const cageId = killerSolverData.cellToCageMap[currentCellId];
                        const cage = killerSolverData.cageDataArray.find(cdata => cdata.id === cageId);
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
        updateAllCandidates();
        if (hasAnyErrors) {
            statusMessageElement.textContent = "Есть ошибки на доске!";
            statusMessageElement.classList.remove('success-msg'); statusMessageElement.classList.add('incorrect-msg');
        } else {
            statusMessageElement.textContent = ""; statusMessageElement.classList.remove('incorrect-msg');
        }
        updateSelectionHighlight();
    }

    function updateAllCandidates() {
        if (!userGrid || userGrid.length === 0) return;
        if (currentMode === 'killer' && killerSolverData) {
            currentCandidatesMap = killerSolverLogic.calculateAllKillerCandidates(userGrid, killerSolverData);
        } else if (currentMode === 'classic') {
            currentCandidatesMap = {};
        }
        // Перерисовываем только пустые ячейки для обновления заметок
        for (let r = 0; r < 9; r++) {
            if (!userGrid[r]) continue;
            for (let c = 0; c < 9; c++) {
                if (!userGrid[r][c]) continue;
                if (userGrid[r][c].value === 0) {
                    const notesToDraw = (currentMode === 'killer') ? currentCandidatesMap[getCellId(r,c)] : userGrid[r][c].notes;
                    renderCell(r, c, 0, notesToDraw || new Set());
                } else {
                     // Для заполненных ячеек можно не вызывать renderCell, если их отображение не изменилось
                     // Но если заметки могли быть видны под цифрой, то надо перерисовать, чтобы их убрать
                     const cellEl = document.getElementById(getCellId(r,c));
                     const notesEl = cellEl ? cellEl.querySelector('.notes-container') : null;
                     if(notesEl) cellEl.removeChild(notesEl); // Просто удаляем контейнер заметок
                }
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
            if (userGrid && userGrid.length > 0) {
                for (let r = 0; r < 9; r++) {
                    if (!userGrid[r]) { allFilled = false; break; }
                    for (let c = 0; c < 9; c++) {
                        if (!userGrid[r][c] || userGrid[r][c].value === 0) { allFilled = false; break; }
                    }
                    if (!allFilled) break;
                }
            } else allFilled = false;

            if (allFilled) {
                statusMessageElement.textContent = "Доска заполнена, но есть ошибки.";
                statusMessageElement.classList.remove('success-msg'); statusMessageElement.classList.add('incorrect-msg');
            } else if (statusMessageElement.textContent.startsWith("Поздравляем")) {
                 statusMessageElement.textContent = "";
            }
        }
        updateLogicSolverButtonsState();
    }

    function isGameEffectivelySolved() {
        if (!userGrid || userGrid.length !== 9) return false;
        for (let r = 0; r < 9; r++) {
            if (!userGrid[r] || userGrid[r].length !== 9) return false;
            for (let c = 0; c < 9; c++) {
                if (!userGrid[r][c] || userGrid[r][c].value === 0 || userGrid[r][c].isError) return false;
            }
        }
        return true;
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
        if (userGrid && userGrid.length === 9) {
            for (let r = 0; r < 9; r++) { if (!userGrid[r]) continue;
                for (let c = 0; c < 9; c++) { if (userGrid[r][c] && userGrid[r][c].value === 0) emptyCells.push({r,c});}}
        }
        if (emptyCells.length > 0) {
            const { r, c } = emptyCells[Math.floor(Math.random() * emptyCells.length)];
            if (!solutionGrid || !solutionGrid[r]?.[c]) return;
            const correctValue = solutionGrid[r][c].value;
            history.push({ r, c, oldValue: userGrid[r][c].value, newNotes: new Set(userGrid[r][c].notes),
                oldCandidates: currentCandidatesMap[getCellId(r,c)] ? new Set(currentCandidatesMap[getCellId(r,c)]) : new Set() });
            undoButton.disabled = false;
            userGrid[r][c].value = correctValue; userGrid[r][c].notes.clear();
            userGrid[r][c].isError = false; userGrid[r][c].isSolved = true;
            renderCell(r, c, correctValue, null); hintsRemaining--; hintApplied = true;
        }
        if (hintApplied) { updateHintsDisplay(); updateBoardState(); saveGameState(); checkGameCompletion(); }
        else statusMessageElement.textContent = "Нет ячеек для подсказки.";
    }

    function undoLastMove() {
        if (history.length === 0) return;
        const lastMove = history.pop(); const { r, c, oldValue, newNotes, oldCandidates } = lastMove;
        if (!userGrid || !userGrid[r]?.[c]) return;
        userGrid[r][c].value = oldValue; userGrid[r][c].notes = new Set(newNotes);
        userGrid[r][c].isError = false; userGrid[r][c].isSolved = (oldValue !== 0);
        if (currentMode === 'killer') currentCandidatesMap[getCellId(r,c)] = new Set(oldCandidates);
        renderCell(r, c, userGrid[r][c].value, userGrid[r][c].value === 0 ? (currentCandidatesMap[getCellId(r,c)] || userGrid[r][c].notes) : null);
        undoButton.disabled = history.length === 0;
        updateBoardState(); saveGameState(); checkGameCompletion(); enableInput();
    }

    function generateNewGame(mode, difficulty) {
        stopTimer(); clearGameState();
        currentMode = mode; currentDifficulty = difficulty;
        let puzzleGenData;

        if (currentMode === 'classic') {
            if (typeof sudoku === 'undefined' || typeof sudoku.generate !== 'function') {
                alert("Библиотека sudoku.js не загружена."); showScreen('initial-screen'); return;
            }
            puzzleGenData = sudoku.generate(difficulty);
            if (!puzzleGenData?.puzzle || !puzzleGenData?.solution) {
                alert("Ошибка генерации классического Судоку."); showScreen('initial-screen'); return;
            }
            puzzleGenData.cages = [];
        } else {
            try {
                puzzleGenData = killerSudoku.generate(difficulty);
                if (!puzzleGenData?.cages || !puzzleGenData?.grid || !puzzleGenData?.solution) {
                    throw new Error("killerSudoku.generate_invalid_data");
                }
                killerSolverData = { cageDataArray: puzzleGenData.cages, cellToCageMap: {} };
                let tempMap = {};
                killerSolverData.cageDataArray.forEach(cg => {
                     if (cg.id === undefined) cg.id = killerSolverData.cageDataArray.indexOf(cg); // Assign simple ID if missing
                     cg.cells.forEach(cid => { tempMap[cid] = cg.id; });
                });
                killerSolverData.cellToCageMap = tempMap;
            } catch (e) {
                console.error("Error generating Killer Sudoku:", e);
                alert("Ошибка генерации Killer Sudoku."); showScreen('initial-screen'); return;
            }
        }

        userGrid = Array(9).fill(null).map(() => Array(9).fill(null).map(() => ({})));
        solutionGrid = Array(9).fill(null).map(() => Array(9).fill(null).map(() => ({})));
        let charIndex = 0;
        const blank = currentMode === 'classic' ? (sudoku.BLANK_CHAR || '.') : (killerSudoku.BLANK_CHAR || '.');

        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const puzzleChar = puzzleGenData.grid[charIndex];
                const solutionChar = puzzleGenData.solution[charIndex];
                const value = (puzzleChar === blank) ? 0 : parseInt(puzzleChar);
                const isGiven = (value !== 0);
                userGrid[r][c] = { value, isGiven, isError: false, notes: new Set(), isSolved: isGiven };
                solutionGrid[r][c] = { value: parseInt(solutionChar) };
                charIndex++;
            }
        }

        // Рендер границ клеток ДО основного рендера доски
        if (currentMode === 'killer') {
            renderKillerCages(puzzleGenData.cages);
        }
        updateAllCandidates(); // Это вызовет renderCell для пустых ячеек
        renderBoard(); // Это перерисует все ячейки, включая заполненные

        timeElapsed = 0; startTimer(); updateHintsDisplay(); enableInput();
        history = []; undoButton.disabled = true; statusMessageElement.textContent = "";
        showScreen('game-container'); saveGameState();
    }

    // ИСПРАВЛЕННЫЙ РЕНДЕРИНГ ГРАНИЦ КЛЕТОК
    function renderKillerCages(cages) {
        // Сначала очистим старые границы клеток и суммы со ВСЕХ ячеек
        boardElement.querySelectorAll('.cell').forEach(cellElement => {
            cellElement.classList.remove(
                'cage-border-top', 'cage-border-bottom',
                'cage-border-left', 'cage-border-right'
            );
            const cageSumDiv = cellElement.querySelector('.cage-sum');
            if (cageSumDiv) cellElement.removeChild(cageSumDiv);
        });

        if (!cages || !killerSolverData?.cellToCageMap) return;

        cages.forEach(cage => {
            if (!cage.cells || cage.cells.length === 0) return;

            // Отображение суммы в top-left ячейке клетки
            let topLeftCellIdForSum = cage.cells[0];
            let minR = 10, minC = 10;
            cage.cells.forEach(cellIdInCage => {
                const coords = killerSolverLogic.getCellCoords(cellIdInCage);
                if (coords) {
                    if (coords.r < minR) { minR = coords.r; minC = coords.c; topLeftCellIdForSum = cellIdInCage; }
                    else if (coords.r === minR && coords.c < minC) { minC = coords.c; topLeftCellIdForSum = cellIdInCage; }
                }
            });
            const topLeftCellElement = document.getElementById(topLeftCellIdForSum);
            if (topLeftCellElement) {
                const sumDiv = document.createElement('div');
                sumDiv.classList.add('cage-sum');
                sumDiv.textContent = cage.sum;
                topLeftCellElement.prepend(sumDiv); // Вставляем сумму
            }

            // Добавление классов для пунктирных границ
            const cageIdentity = killerSolverData.cellToCageMap[cage.cells[0]]; // Все ячейки в cage имеют один ID
            cage.cells.forEach(cellId => {
                const coords = killerSolverLogic.getCellCoords(cellId);
                if (!coords) return;
                const { r, c } = coords;
                const currentCellElement = document.getElementById(cellId);
                if (!currentCellElement) return;

                const topN = (r > 0) ? getCellId(r - 1, c) : null;
                if (!topN || killerSolverData.cellToCageMap[topN] !== cageIdentity) {
                    currentCellElement.classList.add('cage-border-top');
                }
                const bottomN = (r < 8) ? getCellId(r + 1, c) : null;
                if (!bottomN || killerSolverData.cellToCageMap[bottomN] !== cageIdentity) {
                    currentCellElement.classList.add('cage-border-bottom');
                }
                const leftN = (c > 0) ? getCellId(r, c - 1) : null;
                if (!leftN || killerSolverData.cellToCageMap[leftN] !== cageIdentity) {
                    currentCellElement.classList.add('cage-border-left');
                }
                const rightN = (c < 8) ? getCellId(r, c + 1) : null;
                if (!rightN || killerSolverData.cellToCageMap[rightN] !== cageIdentity) {
                    currentCellElement.classList.add('cage-border-right');
                }
            });
        });
    }


    function showScreen(screenIdToShow) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('visible'));
        const target = typeof screenIdToShow === 'string' ? document.getElementById(screenIdToShow) : screenIdToShow;
        if (target) target.classList.add('visible');
    }

    function updateLogicSolverButtonsState() {
        const isKiller = currentMode === 'killer'; const solved = isGameEffectivelySolved();
        logicNextStepButton.style.display = isKiller ? 'inline-block' : 'none';
        logicSolveButton.style.display = isKiller ? 'inline-block' : 'none';
        if (isKiller) { logicNextStepButton.disabled = solved; logicSolveButton.disabled = solved; }
    }

    if (logicNextStepButton) {
        logicNextStepButton.addEventListener('click', () => {
            if (currentMode !== 'killer' || isGameEffectivelySolved()) return;
            updateAllCandidates();
            const step = killerSolverLogic.doKillerLogicStep(userGrid,currentCandidatesMap,killerSolverData,updateAllCandidates,renderCell);
            if (step) { statusMessageElement.textContent = `Техника: ${step.appliedTechnique || step.technique}!`;
                statusMessageElement.classList.remove('incorrect-msg'); statusMessageElement.classList.add('success-msg');
                updateBoardState(); saveGameState(); checkGameCompletion();
            } else { statusMessageElement.textContent = "Нет новых логических шагов.";
                statusMessageElement.classList.remove('success-msg'); statusMessageElement.classList.add('incorrect-msg'); }
            updateLogicSolverButtonsState();
        });
    }
    if (logicSolveButton) {
        logicSolveButton.addEventListener('click', () => {
            if (currentMode !== 'killer' || isGameEffectivelySolved()) return;
            let steps = 0, maxIter = 200, applied;
            do { applied = false; updateAllCandidates();
                const step = killerSolverLogic.doKillerLogicStep(userGrid,currentCandidatesMap,killerSolverData,updateAllCandidates,renderCell);
                if (step) { steps++; applied = true; updateBoardState(); if (isGameEffectivelySolved()) break; }
                maxIter--;
            } while (applied && maxIter > 0);
            if (isGameEffectivelySolved()) { statusMessageElement.textContent = `Решено за ${steps} шагов!`;
                statusMessageElement.classList.remove('incorrect-msg'); statusMessageElement.classList.add('success-msg');
            } else if (steps > 0) { statusMessageElement.textContent = `Применено ${steps} шагов.`;
                statusMessageElement.classList.remove('success-msg'); statusMessageElement.classList.add('incorrect-msg');
            } else { statusMessageElement.textContent = "Нет шагов для применения.";
                statusMessageElement.classList.remove('success-msg'); statusMessageElement.classList.add('incorrect-msg'); }
            saveGameState(); checkGameCompletion(); updateLogicSolverButtonsState();
        });
    }

    function addEventListeners() {
        startNewGameButton.addEventListener('click', () => showScreen('new-game-options'));
        continueGameButton.addEventListener('click', () => {
            if (loadGameState()) showScreen('game-container');
            else { alert("Нет сохраненной игры."); showScreen('new-game-options'); }
        });
        document.querySelectorAll('#game-mode-selection .mode-button').forEach(b => {
            b.addEventListener('click', (e) => {
                document.querySelectorAll('#game-mode-selection .mode-button').forEach(btn => btn.classList.remove('selected'));
                e.target.classList.add('selected');
            });
        });
        if (difficultyButtonsContainer) {
            difficultyButtonsContainer.querySelectorAll('button.difficulty-button').forEach(b => {
                b.addEventListener('click', (e) => {
                    difficultyButtonsContainer.querySelectorAll('button.difficulty-button').forEach(btn => btn.classList.remove('selected'));
                    e.target.classList.add('selected');
                });
            });
        }
        if (startSelectedGameButton) {
            startSelectedGameButton.addEventListener('click', () => {
                const modeEl = document.querySelector('#game-mode-selection .mode-button.selected');
                const diffEl = document.querySelector('.difficulty-selection button.difficulty-button.selected');
                if (modeEl && diffEl) generateNewGame(modeEl.dataset.mode, diffEl.dataset.difficulty);
                else alert('Выберите режим и сложность.');
            });
        }
        if (backToInitialButton) backToInitialButton.addEventListener('click', () => showScreen('initial-screen'));
        if (exitGameButton) {
            exitGameButton.addEventListener('click', () => {
                if (confirm("Выйти? Прогресс будет сохранен.")) {
                    saveGameState(); stopTimer(); clearSelectionHighlights();
                    selectedCell = null; selectedRow = -1; selectedCol = -1; showScreen('initial-screen');
                }
            });
        }
        if (numpad) { numpad.querySelectorAll('button[data-num]').forEach(b => b.addEventListener('click', (e) => handleInput(parseInt(e.target.dataset.num))));}
        if (eraseButton) eraseButton.addEventListener('click', eraseCell);
        if (noteToggleButton) noteToggleButton.addEventListener('click', toggleNoteMode);
        if (checkButton) checkButton.addEventListener('click', updateBoardState);
        if (hintButton) hintButton.addEventListener('click', applyHint);
        if (undoButton) undoButton.addEventListener('click', undoLastMove);

        document.addEventListener('keydown', (e) => {
            if (!gameContainer.classList.contains('visible')) return;
            if (selectedCell && selectedRow !== -1 && selectedCol !== -1) {
                const digit = parseInt(e.key);
                if (digit >= 1 && digit <= 9) { handleInput(digit); e.preventDefault(); return; }
                if (e.key === 'Backspace' || e.key === 'Delete') { eraseCell(); e.preventDefault(); return; }
                if (e.key === 'n' || e.key === 'N' || e.key === ' ' || e.key === 'Enter' ) {
                    if (!e.ctrlKey && !e.metaKey) { toggleNoteMode(); e.preventDefault(); return; }
                }
            }
            if (selectedRow !== -1 && selectedCol !== -1) {
                let newR = selectedRow, newC = selectedCol, moved = false;
                if (e.key === 'ArrowUp') { newR--; moved = true; } else if (e.key === 'ArrowDown') { newR++; moved = true; }
                else if (e.key === 'ArrowLeft') { newC--; moved = true; } else if (e.key === 'ArrowRight') { newC++; moved = true; }
                if (moved) { e.preventDefault(); selectCell(Math.max(0,Math.min(8,newR)), Math.max(0,Math.min(8,newC))); return; }
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { if (!undoButton.disabled) undoLastMove(); e.preventDefault(); }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { if (!hintButton.disabled) applyHint(); e.preventDefault(); }
            if (currentMode === 'killer') {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { if (!logicNextStepButton.disabled) logicNextStepButton.click(); e.preventDefault(); }
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (!logicSolveButton.disabled) logicSolveButton.click(); }
            }
        });
    }

    function initializeApp() {
        loadThemePreference(); checkContinueButtonState(); addEventListeners(); showScreen('initial-screen');
        try { if (window.Telegram?.WebApp) window.Telegram.WebApp.ready(); } catch (e) { console.error("TG SDK err:", e); }
    }
    function checkContinueButtonState() {
        if (!continueGameButton) return;
        try { continueGameButton.disabled = !localStorage.getItem('sudokuGameState'); }
        catch (e) { console.error("Err check cont state:", e); continueGameButton.disabled = true; }
    }
    const THEME_KEY = 'sudokuTheme';
    function loadThemePreference() {
        const theme = localStorage.getItem(THEME_KEY);
        document.body.classList.toggle('dark-theme', theme === 'dark');
        if (themeToggleCheckbox) themeToggleCheckbox.checked = (theme === 'dark');
    }
    if (themeToggleCheckbox) {
        themeToggleCheckbox.addEventListener('change', () => {
            document.body.classList.toggle('dark-theme', themeToggleCheckbox.checked);
            localStorage.setItem(THEME_KEY, themeToggleCheckbox.checked ? 'dark' : 'light');
        });
    }
    initializeApp();
});
