// Убедитесь, что sudoku.js, killerSudoku.js, И killerSolverLogic.js подключены ДО script.js
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM ready.");

    // --- Элементы DOM ---
    const initialScreen = document.getElementById('initial-screen');
    const newGameOptionsScreen = document.getElementById('new-game-options');
    const gameContainer = document.getElementById('game-container');
    const startNewGameButton = document.getElementById('start-new-game-button');
    const continueGameButton = document.getElementById('continue-game-button');
    // const gameModeSelectionContainer = document.getElementById('game-mode-selection'); // Не используется напрямую
    const difficultyButtonsContainer = newGameOptionsScreen?.querySelector('.difficulty-selection');
    const themeToggleCheckbox = document.getElementById('theme-toggle-checkbox');
    const backToInitialButton = document.getElementById('back-to-initial-button');
    const startSelectedGameButton = document.getElementById('start-selected-game-button'); // Кнопка "Начать игру" на экране настроек
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
    let currentDifficulty = 'medium'; // Устанавливаем значение по умолчанию, как в HTML
    let selectedCell = null;
    let selectedRow = -1;
    let selectedCol = -1;
    let isNoteMode = false;
    let timerInterval;
    let timeElapsed = 0;
    let history = [];
    let hintsRemaining = 3;

    let killerSolverData = null;
    let currentCandidatesMap = {}; // cellId -> Set<number>

    // --- Helper Functions ---
    function getCellId(r, c) { return "ABCDEFGHI"[r] + (c + 1); }
    // getCellCoords используется из killerSolverLogic.getCellCoords

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
                solutionGrid: solutionGrid, // solutionGrid обычно не меняется, можно не сохранять userGrid если оно содержит решение
                currentMode: currentMode,
                currentDifficulty: currentDifficulty,
                timeElapsed: timeElapsed,
                history: history.map(h => ({ // Убедимся, что Set-ы в истории тоже сериализуются
                    ...h,
                    newNotes: Array.from(h.newNotes),
                    oldCandidates: h.oldCandidates ? Array.from(h.oldCandidates) : []
                })),
                hintsRemaining: hintsRemaining,
                killerSolverData: killerSolverData,
            };
            localStorage.setItem('sudokuGameState', JSON.stringify(gameState));
            // console.log("Game state saved.");
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
                history = gameState.history.map(h => ({ // И десериализуем Set-ы
                    ...h,
                    newNotes: new Set(h.newNotes),
                    oldCandidates: h.oldCandidates ? new Set(h.oldCandidates) : new Set()
                }));
                hintsRemaining = gameState.hintsRemaining;
                killerSolverData = gameState.killerSolverData;

                // Пересчитать currentCandidatesMap при загрузке, если это Killer режим
                if (currentMode === 'killer' && killerSolverData) {
                    updateAllCandidates(); // Это создаст currentCandidatesMap
                }


                startTimer();
                if (currentMode === 'killer' && killerSolverData) {
                    renderKillerCages(killerSolverData.cageDataArray); // Рендер клеток после загрузки
                }
                renderBoard(); // Полный рендер доски
                updateHintsDisplay();
                updateLogicSolverButtonsState();
                undoButton.disabled = history.length === 0;

                // console.log("Game state loaded.");
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
        // currentMode = 'classic'; // Не сбрасываем, если хотим начать новую с теми же настройками
        // currentDifficulty = 'medium';
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
        // console.log("Game state cleared.");
    }

    function startTimer() {
        clearInterval(timerInterval);
        timerElement.textContent = formatTime(timeElapsed); // Отобразить начальное время
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

    function renderBoard() {
        boardElement.innerHTML = '';
        userGrid.forEach((row, rIdx) => {
            row.forEach((cellData, cIdx) => {
                const cellElement = document.createElement('div');
                cellElement.classList.add('cell');
                cellElement.dataset.row = rIdx;
                cellElement.dataset.col = cIdx;
                cellElement.id = getCellId(rIdx, cIdx);

                if (rIdx % 3 === 0 && rIdx !== 0) cellElement.classList.add('border-top');
                if (cIdx % 3 === 0 && cIdx !== 0) cellElement.classList.add('border-left');

                // Очищаем перед заполнением
                cellElement.textContent = '';
                const existingNotes = cellElement.querySelector('.notes-container');
                if (existingNotes) cellElement.removeChild(existingNotes);

                if (cellData.isGiven) {
                    cellElement.classList.add('given');
                    const valueSpan = document.createElement('span');
                    valueSpan.classList.add('cell-value');
                    valueSpan.textContent = cellData.value;
                    cellElement.appendChild(valueSpan);
                } else if (cellData.value !== 0) {
                    cellElement.classList.add('user-input');
                    const valueSpan = document.createElement('span');
                    valueSpan.classList.add('cell-value');
                    valueSpan.textContent = cellData.value;
                    cellElement.appendChild(valueSpan);
                } else { // Пустая ячейка, отображаем заметки/кандидатов
                    const notesToDisplay = currentCandidatesMap[cellElement.id] || cellData.notes;
                    if (notesToDisplay && notesToDisplay.size > 0) {
                        const notesContainer = document.createElement('div');
                        notesContainer.classList.add('notes-container');
                        Array.from(notesToDisplay).sort((a, b) => a - b).forEach(noteNum => {
                            const noteSpan = document.createElement('span');
                            noteSpan.classList.add('note');
                            noteSpan.textContent = noteNum;
                            notesContainer.appendChild(noteSpan);
                        });
                        cellElement.appendChild(notesContainer);
                    }
                }

                if (cellData.isError) cellElement.classList.add('error');
                cellElement.addEventListener('click', () => selectCell(rIdx, cIdx));
                boardElement.appendChild(cellElement);
            });
        });
        updateSelectionHighlight();
        // console.log("Board rendered.");
    }

    function renderCell(r, c, valueToSet = null, candidatesToSet = null) {
        const cellElement = boardElement.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);
        if (!cellElement) return;

        const cellData = userGrid[r][c];
        const cellId = getCellId(r, c);

        // Очищаем содержимое ячейки (кроме суммы клетки, если есть)
        const cageSumDiv = cellElement.querySelector('.cage-sum');
        cellElement.innerHTML = '';
        if (cageSumDiv) cellElement.prepend(cageSumDiv);

        cellElement.classList.remove('user-input', 'error', 'given'); // Сброс классов состояний

        if (valueToSet !== null && valueToSet !== 0) {
            cellData.value = valueToSet;
            // cellData.notes.clear(); // При установке значения заметки обычно очищаются
            cellData.isSolved = true; // Отметить как решенную (пользователем или логикой)

            const valueSpan = document.createElement('span');
            valueSpan.classList.add('cell-value');
            valueSpan.textContent = valueToSet;
            cellElement.appendChild(valueSpan);

            if (cellData.isGiven) { // Если это "данная" ячейка (хотя они не должны меняться)
                cellElement.classList.add('given');
            } else {
                cellElement.classList.add('user-input'); // Или другой класс для решенных логикой
            }
        } else { // Значение 0 или null, отображаем заметки
            cellData.value = 0;
            cellData.isSolved = false;

            let notesSource = candidatesToSet; // Приоритет у переданных кандидатов (от решателя)
            if (!notesSource && cellData.notes.size > 0) {
                 notesSource = cellData.notes; // Иначе пользовательские заметки
            } else if (!notesSource && currentCandidatesMap[cellId]?.size > 0) {
                 notesSource = currentCandidatesMap[cellId]; // Иначе общие кандидаты
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
        if (cellData.isError) cellElement.classList.add('error'); // Восстановить класс ошибки если нужно
        updateSelectionHighlight();
    }


    function selectCell(r, c) {
        clearSelectionHighlights(); // Только подсветку, не сам selectedCell
        selectedRow = r;
        selectedCol = c;
        selectedCell = boardElement.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);

        if (selectedCell) { // Не запрещаем выбор given ячеек, просто ввод в них будет заблокирован
            selectedCell.classList.add('selected');
            highlightRelatedCells(r, c);
        }
    }

    function clearSelectionHighlights() {
        const allCells = boardElement.querySelectorAll('.cell');
        allCells.forEach(cell => {
            cell.classList.remove('selected', 'highlight', 'highlight-value');
        });
        // Не сбрасываем selectedRow, selectedCol, selectedCell здесь, это делается при новом выборе
    }


    function highlightRelatedCells(r, c) {
        const valueInSelectedCell = userGrid[r][c].value;
        const selectedCellId = getCellId(r,c);
        const selectedCageId = (currentMode === 'killer' && killerSolverData?.cellToCageMap) ? killerSolverData.cellToCageMap[selectedCellId] : undefined;


        userGrid.forEach((row, rowIdx) => {
            row.forEach((cellData, colIdx) => {
                const cellElement = boardElement.querySelector(`.cell[data-row='${rowIdx}'][data-col='${colIdx}']`);
                if (!cellElement) return;

                const inSameRow = (rowIdx === r);
                const inSameCol = (colIdx === c);
                const inSameBlock = (Math.floor(rowIdx / 3) === Math.floor(r / 3) && Math.floor(colIdx / 3) === Math.floor(c / 3));

                let inSameCage = false;
                if (currentMode === 'killer' && selectedCageId !== undefined) {
                    const currentCellId = getCellId(rowIdx, colIdx);
                    if (killerSolverData.cellToCageMap[currentCellId] === selectedCageId) {
                        inSameCage = true;
                    }
                }

                if (inSameRow || inSameCol || inSameBlock || inSameCage) {
                    if(!(rowIdx === r && colIdx === c)) { // Не подсвечивать саму выбранную ячейку как related
                       cellElement.classList.add('highlight');
                    }
                }

                if (valueInSelectedCell !== 0 && cellData.value === valueInSelectedCell) {
                     if(!(rowIdx === r && colIdx === c)) { // Не подсвечивать саму выбранную ячейку
                        cellElement.classList.add('highlight-value');
                     }
                }
            });
        });
    }
    function updateSelectionHighlight() {
        if (selectedRow !== -1 && selectedCol !== -1) {
            // Сначала очистить старую подсветку (кроме 'selected' на текущей ячейке)
            boardElement.querySelectorAll('.cell.highlight, .cell.highlight-value').forEach(c => {
                if (!c.classList.contains('selected')) {
                    c.classList.remove('highlight', 'highlight-value');
                }
            });
            highlightRelatedCells(selectedRow, selectedCol);
        }
    }


    function handleInput(digit) {
        if (!selectedCell || selectedRow === -1 || selectedCol === -1 || userGrid[selectedRow][selectedCol].isGiven) {
            return;
        }

        const currentCellData = userGrid[selectedRow][selectedCol];
        const cellId = getCellId(selectedRow, selectedCol);

        history.push({
            r: selectedRow,
            c: selectedCol,
            oldValue: currentCellData.value,
            newNotes: new Set(currentCellData.notes), // Копируем старые заметки
            oldCandidates: currentCandidatesMap[cellId] ? new Set(currentCandidatesMap[cellId]) : new Set()
        });
        undoButton.disabled = false;

        if (isNoteMode) {
            currentCellData.value = 0; // В режиме заметок значение всегда 0
            if (currentCellData.notes.has(digit)) {
                currentCellData.notes.delete(digit);
            } else {
                currentCellData.notes.add(digit);
            }
            // Если пользователь меняет заметки, кандидаты решателя для этой ячейки больше не релевантны (или их нужно синхронизировать)
            // currentCandidatesMap[cellId]?.clear(); // Очищаем кандидатов решателя, если пользователь активно ставит свои
            renderCell(selectedRow, selectedCol, 0, currentCellData.notes);
        } else {
            if (currentCellData.value === digit) { // Повторный клик на ту же цифру - очистка
                currentCellData.value = 0;
                currentCellData.isSolved = false;
            } else {
                currentCellData.value = digit;
                currentCellData.isSolved = true; // Пользователь "решил" эту ячейку
            }
            currentCellData.notes.clear(); // Ввод значения очищает заметки
            renderCell(selectedRow, selectedCol, currentCellData.value, null);
        }
        updateBoardState(); // Пересчет ошибок и кандидатов (если нужно)
        saveGameState();
        checkGameCompletion();
    }

    function eraseCell() {
        if (!selectedCell || selectedRow === -1 || selectedCol === -1 || userGrid[selectedRow][selectedCol].isGiven) {
            return;
        }
        const currentCellData = userGrid[selectedRow][selectedCol];
        const cellId = getCellId(selectedRow, selectedCol);

        history.push({
            r: selectedRow,
            c: selectedCol,
            oldValue: currentCellData.value,
            newNotes: new Set(currentCellData.notes),
            oldCandidates: currentCandidatesMap[cellId] ? new Set(currentCandidatesMap[cellId]) : new Set()
        });
        undoButton.disabled = false;

        currentCellData.value = 0;
        currentCellData.notes.clear();
        currentCellData.isError = false;
        currentCellData.isSolved = false;
        // currentCandidatesMap[cellId]?.clear(); // Очистить и кандидатов решателя для этой ячейки

        renderCell(selectedRow, selectedCol, 0, new Set()); // Перерисовать как пустую
        updateBoardState();
        saveGameState();
        checkGameCompletion();
    }

    function toggleNoteMode() {
        isNoteMode = !isNoteMode;
        noteToggleButton.title = isNoteMode ? 'Режим заметок (ВКЛ)' : 'Режим ввода (ВЫКЛ)';
        // Визуальное отображение активного режима заметок
        numpad.classList.toggle('note-mode-active', isNoteMode);
        // Можно также менять текст кнопки, если 📝/🔢 недостаточно
        // noteToggleButton.textContent = isNoteMode ? "ЗАМЕТКИ" : "ВВОД";
    }


    function updateBoardState() { // Проверка ошибок и обновление кандидатов
        let hasAnyErrors = false;
        userGrid.forEach((row, rIdx) => {
            row.forEach((cell, cIdx) => {
                cell.isError = false; // Сброс флага ошибки
                const cellElement = boardElement.querySelector(`.cell[data-row='${rIdx}'][data-col='${cIdx}']`);
                if(cellElement) cellElement.classList.remove('error'); // Сброс визуальной ошибки

                if (cell.value !== 0) {
                    // Проверка по строке
                    for (let col = 0; col < 9; col++) {
                        if (col !== cIdx && userGrid[rIdx][col].value === cell.value) {
                            cell.isError = true; break;
                        }
                    }
                    // Проверка по столбцу
                    if (!cell.isError) {
                        for (let row = 0; row < 9; row++) {
                            if (row !== rIdx && userGrid[row][cIdx].value === cell.value) {
                                cell.isError = true; break;
                            }
                        }
                    }
                    // Проверка по блоку 3x3
                    if (!cell.isError) {
                        const startRow = Math.floor(rIdx / 3) * 3;
                        const startCol = Math.floor(cIdx / 3) * 3;
                        for (let br = 0; br < 3; br++) {
                            for (let bc = 0; bc < 3; bc++) {
                                const R = startRow + br;
                                const C = startCol + bc;
                                if ((R !== rIdx || C !== cIdx) && userGrid[R][C].value === cell.value) {
                                    cell.isError = true; break;
                                }
                            }
                            if (cell.isError) break;
                        }
                    }
                    // Проверка внутри клетки (Killer Sudoku)
                    if (!cell.isError && currentMode === 'killer' && killerSolverData?.cellToCageMap) {
                        const currentCellId = getCellId(rIdx, cIdx);
                        const cageId = killerSolverData.cellToCageMap[currentCellId];
                        const cage = killerSolverData.cageDataArray.find(cdata => cdata.id === cageId);
                        if (cage) {
                            for (const cageCellId of cage.cells) {
                                if (cageCellId !== currentCellId) {
                                    const coords = killerSolverLogic.getCellCoords(cageCellId);
                                    if (coords && userGrid[coords.r][coords.c].value === cell.value) {
                                        cell.isError = true; break;
                                    }
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

        updateAllCandidates(); // Пересчитать и отобразить кандидатов

        if (hasAnyErrors) {
            statusMessageElement.textContent = "Есть ошибки на доске!";
            statusMessageElement.classList.remove('success-msg');
            statusMessageElement.classList.add('incorrect-msg');
        } else {
            statusMessageElement.textContent = "";
            statusMessageElement.classList.remove('incorrect-msg');
        }
        updateSelectionHighlight(); // Обновить подсветку, т.к. классы ошибок могли измениться
    }


    function updateAllCandidates() {
        if (currentMode === 'killer' && killerSolverData) {
            currentCandidatesMap = killerSolverLogic.calculateAllKillerCandidates(userGrid, killerSolverData);
        } else if (currentMode === 'classic') {
            // Здесь можно реализовать логику кандидатов для классического судоку, если нужно
            // Например, basicClassicCandidateUpdate();
            // Пока для классики currentCandidatesMap не используется активно решателем.
            // Пользовательские заметки userGrid[r][c].notes остаются главным источником.
            // Очистим currentCandidatesMap для классики, чтобы не было путаницы
            currentCandidatesMap = {};
        }

        // Перерисовать все ячейки, чтобы обновить отображение заметок
        // (или только те, где value === 0)
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (userGrid[r][c].value === 0) {
                    // Для Killer - используем currentCandidatesMap
                    // Для Classic - используем userGrid[r][c].notes (или currentCandidatesMap если он заполняется для classic)
                    const notesToDraw = (currentMode === 'killer') ? currentCandidatesMap[getCellId(r,c)] : userGrid[r][c].notes;
                    renderCell(r, c, 0, notesToDraw || new Set());
                } else {
                    renderCell(r,c, userGrid[r][c].value, null); // Перерисовать заполненные (для сброса старых заметок)
                }
            }
        }
        // console.log("All candidates updated and cells re-rendered if empty.");
    }


    function checkGameCompletion() {
        let allFilled = true;
        let hasErrors = false;
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (userGrid[r][c].value === 0) {
                    allFilled = false;
                }
                if (userGrid[r][c].isError) {
                    hasErrors = true;
                }
            }
        }

        if (allFilled && !hasErrors) {
            stopTimer();
            statusMessageElement.textContent = "Поздравляем! Вы решили судоку!";
            statusMessageElement.classList.remove('incorrect-msg');
            statusMessageElement.classList.add('success-msg');
            disableInput();
            saveGameState(); // Сохранить решенное состояние
        } else if (allFilled && hasErrors) {
            statusMessageElement.textContent = "Доска заполнена, но есть ошибки.";
            statusMessageElement.classList.remove('success-msg');
            statusMessageElement.classList.add('incorrect-msg');
        } else {
            // statusMessageElement.textContent = ""; // Не очищать, если там было сообщение об ошибках
        }
        updateLogicSolverButtonsState(); // Кнопки решателя могут стать disabled
    }

    function isGameEffectivelySolved() { // Учитывает ошибки
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (userGrid[r][c].value === 0 || userGrid[r][c].isError) {
                    return false;
                }
            }
        }
        return true;
    }

    function disableInput() {
        numpad.querySelectorAll('button').forEach(button => button.disabled = true);
        // boardElement.style.pointerEvents = 'none'; // Это слишком глобально, лучше через selectedCell
        checkButton.disabled = true;
        hintButton.disabled = true;
        undoButton.disabled = true;
        logicNextStepButton.disabled = true;
        logicSolveButton.disabled = true;
    }

    function enableInput() {
        numpad.querySelectorAll('button').forEach(button => button.disabled = false);
        // boardElement.style.pointerEvents = 'auto';
        checkButton.disabled = false;
        updateHintsDisplay(); // Состояние hintButton зависит от hintsRemaining
        undoButton.disabled = history.length === 0;
        updateLogicSolverButtonsState();
    }


    function updateHintsDisplay() {
        hintButton.textContent = `💡 ${hintsRemaining}/3`;
        hintButton.disabled = hintsRemaining <= 0 || isGameEffectivelySolved();
    }

    function applyHint() {
        if (hintsRemaining <= 0 || isGameEffectivelySolved()) return;

        let hintApplied = false;
        // Попробуем найти первую пустую ячейку без ошибок
        // Если таких нет, то первую пустую с ошибкой (чтобы исправить)
        let emptyCells = [];
        for (let r = 0; r < 9; r++) { for (let c = 0; c < 9; c++) { if (userGrid[r][c].value === 0) emptyCells.push({r,c});}}

        if (emptyCells.length > 0) {
            const { r, c } = emptyCells[Math.floor(Math.random() * emptyCells.length)]; // Случайная пустая ячейка
            const correctValue = solutionGrid[r][c].value;

            history.push({
                r: r, c: c, oldValue: userGrid[r][c].value,
                newNotes: new Set(userGrid[r][c].notes),
                oldCandidates: currentCandidatesMap[getCellId(r,c)] ? new Set(currentCandidatesMap[getCellId(r,c)]) : new Set()
            });
            undoButton.disabled = false;

            userGrid[r][c].value = correctValue;
            userGrid[r][c].notes.clear();
            userGrid[r][c].isError = false; // Подсказка всегда верна
            userGrid[r][c].isSolved = true;

            renderCell(r, c, correctValue, null);
            hintsRemaining--;
            hintApplied = true;
        }


        if (hintApplied) {
            updateHintsDisplay();
            updateBoardState(); // Важно для пересчета ошибок и кандидатов
            saveGameState();
            checkGameCompletion();
        } else {
            statusMessageElement.textContent = "Нет ячеек для подсказки.";
        }
    }

    function undoLastMove() {
        if (history.length === 0) return;
        const lastMove = history.pop();
        const { r, c, oldValue, newNotes, oldCandidates } = lastMove;

        userGrid[r][c].value = oldValue;
        userGrid[r][c].notes = new Set(newNotes); // Восстанавливаем пользовательские заметки
        userGrid[r][c].isError = false; // Сбрасываем ошибку при отмене
        userGrid[r][c].isSolved = (oldValue !== 0); // Если было значение, то "решена"

        if (currentMode === 'killer') { // Восстанавливаем кандидатов решателя
            currentCandidatesMap[getCellId(r,c)] = new Set(oldCandidates);
        }

        // Перерисовываем ячейку: если было значение, показываем его, иначе заметки
        renderCell(r, c, userGrid[r][c].value, userGrid[r][c].value === 0 ? (currentCandidatesMap[getCellId(r,c)] || userGrid[r][c].notes) : null);

        undoButton.disabled = history.length === 0;
        updateBoardState(); // Полное обновление состояния
        saveGameState();
        checkGameCompletion(); // Проверить, не решена ли игра после отмены
        enableInput(); // Убедиться, что ввод снова доступен, если был заблокирован
    }

    function generateNewGame(mode, difficulty) {
        stopTimer();
        clearGameState(); // Очищаем перед новой игрой, но сохраняем mode/difficulty

        currentMode = mode; // Устанавливаем выбранный режим/сложность
        currentDifficulty = difficulty;

        let puzzleGenData;

        if (currentMode === 'classic') {
            if (typeof sudoku === 'undefined' || typeof sudoku.generate !== 'function') {
                alert("Библиотека для классического Судоку (sudoku.js) не загружена или не имеет функции generate.");
                showScreen('initial-screen'); return;
            }
            puzzleGenData = sudoku.generate(difficulty); // {puzzle: "string", solution: "string"}
            if (!puzzleGenData || !puzzleGenData.puzzle || !puzzleGenData.solution) {
                alert("Ошибка при генерации классического Судоку.");
                showScreen('initial-screen'); return;
            }
            // Для классики cages будет пустым или undefined
            puzzleGenData.cages = [];
        } else { // Killer Sudoku
            try {
                puzzleGenData = killerSudoku.generate(difficulty); // Ожидаем {cages, grid, solution}
                if (!puzzleGenData || !puzzleGenData.cages || !puzzleGenData.grid || !puzzleGenData.solution) {
                    throw new Error("killerSudoku.generate_returned_invalid_data");
                }
                // console.log("Generated Killer Sudoku:", puzzleGenData);

                killerSolverData = {
                    cageDataArray: puzzleGenData.cages, // Это уже массив {sum, cells, id?}
                    cellToCageMap: {} // cellId: cage.id
                };
                puzzleGenData.cages.forEach(cage => { // cage.id должен быть уникальным
                    // Если генератор не присвоил ID, можно сделать это здесь, но лучше если генератор это делает
                    // if (cage.id === undefined) cage.id = generateUniqueId(); // Пример
                    cage.cells.forEach(cellId => {
                        killerSolverData.cellToCageMap[cellId] = cage.id;
                    });
                });

            } catch (e) {
                console.error("Error generating Killer Sudoku:", e);
                alert("Ошибка при генерации Killer Sudoku. Попробуйте еще раз.");
                showScreen('initial-screen'); return;
            }
        }

        userGrid = Array(9).fill(null).map(() => Array(9).fill(null));
        solutionGrid = Array(9).fill(null).map(() => Array(9).fill(null));
        let charIndex = 0;
        const blank = currentMode === 'classic' ? sudoku.BLANK_CHAR : killerSudoku.BLANK_CHAR;

        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const puzzleChar = puzzleGenData.grid[charIndex]; // grid это строка головоломки
                const solutionChar = puzzleGenData.solution[charIndex];
                const value = (puzzleChar === blank) ? 0 : parseInt(puzzleChar);
                const isGiven = (value !== 0);

                userGrid[r][c] = { value, isGiven, isError: false, notes: new Set(), isSolved: isGiven };
                solutionGrid[r][c] = { value: parseInt(solutionChar) };
                charIndex++;
            }
        }

        if (currentMode === 'killer') {
            renderKillerCages(puzzleGenData.cages);
        }

        updateAllCandidates(); // Первичный расчет кандидатов
        renderBoard();
        timeElapsed = 0; // Сброс таймера для новой игры
        startTimer();
        updateHintsDisplay();
        enableInput();
        history = []; // Очистка истории для новой игры
        undoButton.disabled = true;
        statusMessageElement.textContent = "";
        showScreen('game-container');
        saveGameState(); // Сохранить состояние новой игры
        // console.log(`New ${currentMode} game (${currentDifficulty}) started.`);
    }


    function renderKillerCages(cages) {
        // Сначала очистим старые границы клеток и суммы, если они были
        boardElement.querySelectorAll('.cell').forEach(cellElement => {
            // Удаляем классы границ клеток
            cellElement.className = cellElement.className.split(' ').filter(c => !c.startsWith('cage-border-')).join(' ');
            // Удаляем отображение суммы
            const cageSumDiv = cellElement.querySelector('.cage-sum');
            if (cageSumDiv) cellElement.removeChild(cageSumDiv);
        });

        if (!cages || !killerSolverData || !killerSolverData.cellToCageMap) return;


        cages.forEach(cage => {
            if (!cage.cells || cage.cells.length === 0) return;

            // Находим top-left ячейку для отображения суммы
            // Учитываем, что cellId это строка "A1", "B5" и т.д.
            let topLeftCellId = cage.cells[0]; // По умолчанию первая в списке
            let minR = 10, minC = 10;

            cage.cells.forEach(cellId => {
                const coords = killerSolverLogic.getCellCoords(cellId);
                if (coords) {
                    if (coords.r < minR) {
                        minR = coords.r; minC = coords.c; topLeftCellId = cellId;
                    } else if (coords.r === minR && coords.c < minC) {
                        minC = coords.c; topLeftCellId = cellId;
                    }
                }
            });

            const topLeftCellElement = document.getElementById(topLeftCellId);
            if (topLeftCellElement) {
                const cageSumDiv = document.createElement('div');
                cageSumDiv.classList.add('cage-sum');
                cageSumDiv.textContent = cage.sum;
                topLeftCellElement.prepend(cageSumDiv);
            }

            cage.cells.forEach(cellId => {
                const coords = killerSolverLogic.getCellCoords(cellId);
                if (!coords) return;
                const { r, c } = coords;
                const currentCellElement = document.getElementById(cellId);
                if (!currentCellElement) return;

                const currentCageIdentity = killerSolverData.cellToCageMap[cellId];

                // Верхняя граница
                const topNeighborId = (r > 0) ? getCellId(r - 1, c) : null;
                if (!topNeighborId || killerSolverData.cellToCageMap[topNeighborId] !== currentCageIdentity) {
                    currentCellElement.classList.add('cage-border-top');
                }
                // Нижняя граница
                const bottomNeighborId = (r < 8) ? getCellId(r + 1, c) : null;
                if (!bottomNeighborId || killerSolverData.cellToCageMap[bottomNeighborId] !== currentCageIdentity) {
                    currentCellElement.classList.add('cage-border-bottom');
                }
                // Левая граница
                const leftNeighborId = (c > 0) ? getCellId(r, c - 1) : null;
                if (!leftNeighborId || killerSolverData.cellToCageMap[leftNeighborId] !== currentCageIdentity) {
                    currentCellElement.classList.add('cage-border-left');
                }
                // Правая граница
                const rightNeighborId = (c < 8) ? getCellId(r, c + 1) : null;
                if (!rightNeighborId || killerSolverData.cellToCageMap[rightNeighborId] !== currentCageIdentity) {
                    currentCellElement.classList.add('cage-border-right');
                }
            });
        });
    }

    function showScreen(screenIdToShow) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('visible');
        });
        const target = typeof screenIdToShow === 'string' ? document.getElementById(screenIdToShow) : screenIdToShow;
        if (target) target.classList.add('visible');
    }

    function updateLogicSolverButtonsState() {
        const isKiller = currentMode === 'killer';
        const solved = isGameEffectivelySolved();

        logicNextStepButton.style.display = isKiller ? 'inline-block' : 'none';
        logicSolveButton.style.display = isKiller ? 'inline-block' : 'none';

        if (isKiller) {
            logicNextStepButton.disabled = solved;
            logicSolveButton.disabled = solved;
        }
    }

    // --- Обработчики событий решателя ---
    if (logicNextStepButton) {
        logicNextStepButton.addEventListener('click', () => {
            if (currentMode !== 'killer' || isGameEffectivelySolved()) return;
            updateAllCandidates(); // Убедимся, что кандидаты свежие
            const stepApplied = killerSolverLogic.doKillerLogicStep(
                userGrid, currentCandidatesMap, killerSolverData,
                updateAllCandidates, renderCell
            );
            if (stepApplied) {
                statusMessageElement.textContent = `Применена техника: ${stepApplied.appliedTechnique || stepApplied.technique}!`;
                statusMessageElement.classList.remove('incorrect-msg');
                statusMessageElement.classList.add('success-msg');
                // updateAllCandidates() и renderCell() уже вызваны внутри doKillerLogicStep или его колбэков
                updateBoardState(); // Обновить ошибки и т.д.
                saveGameState();
                checkGameCompletion();
            } else {
                statusMessageElement.textContent = "Не найдено новых логических шагов.";
                statusMessageElement.classList.remove('success-msg');
                statusMessageElement.classList.add('incorrect-msg');
            }
            updateLogicSolverButtonsState();
        });
    }

    if (logicSolveButton) {
        logicSolveButton.addEventListener('click', () => {
            if (currentMode !== 'killer' || isGameEffectivelySolved()) return;
            let stepsCount = 0;
            let maxIterations = 200; // Защита от бесконечного цикла
            let somethingAppliedInLastIteration;

            do {
                somethingAppliedInLastIteration = false;
                updateAllCandidates();
                const stepApplied = killerSolverLogic.doKillerLogicStep(
                    userGrid, currentCandidatesMap, killerSolverData,
                    updateAllCandidates, renderCell
                );
                if (stepApplied) {
                    stepsCount++;
                    somethingAppliedInLastIteration = true;
                    updateBoardState(); // Обновление после каждого шага
                    if (isGameEffectivelySolved()) break; // Если решено, выходим
                }
                maxIterations--;
            } while (somethingAppliedInLastIteration && maxIterations > 0);

            if (isGameEffectivelySolved()) {
                statusMessageElement.textContent = `Головоломка решена за ${stepsCount} логических шагов!`;
                statusMessageElement.classList.remove('incorrect-msg');
                statusMessageElement.classList.add('success-msg');
            } else if (stepsCount > 0) {
                statusMessageElement.textContent = `Применено ${stepsCount} логических шагов.`;
                statusMessageElement.classList.remove('success-msg'); // Может быть еще не решена
                statusMessageElement.classList.add('incorrect-msg'); // или просто информационное
            } else {
                statusMessageElement.textContent = "Не найдено логических шагов для применения.";
                statusMessageElement.classList.remove('success-msg');
                statusMessageElement.classList.add('incorrect-msg');
            }
            saveGameState();
            checkGameCompletion();
            updateLogicSolverButtonsState();
        });
    }

    // --- Инициализация и слушатели событий ---
    function addEventListeners() {
        startNewGameButton.addEventListener('click', () => showScreen('new-game-options'));
        continueGameButton.addEventListener('click', () => {
            if (loadGameState()) {
                showScreen('game-container');
            } else {
                alert("Не удалось загрузить сохраненную игру. Начните новую.");
                showScreen('new-game-options'); // Предложить начать новую
            }
        });

        document.querySelectorAll('#game-mode-selection .mode-button').forEach(button => {
            button.addEventListener('click', (e) => {
                document.querySelectorAll('#game-mode-selection .mode-button').forEach(btn => btn.classList.remove('selected'));
                e.target.classList.add('selected');
                // currentMode устанавливается при генерации игры, здесь только для UI
            });
        });

        if (difficultyButtonsContainer) {
            difficultyButtonsContainer.querySelectorAll('button.difficulty-button').forEach(button => {
                button.addEventListener('click', (e) => {
                    difficultyButtonsContainer.querySelectorAll('button.difficulty-button').forEach(btn => btn.classList.remove('selected'));
                    e.target.classList.add('selected');
                    // currentDifficulty устанавливается при генерации
                });
            });
        }


        if (startSelectedGameButton) { // Эта кнопка добавлена в HTML
            startSelectedGameButton.addEventListener('click', () => {
                const selectedModeEl = document.querySelector('#game-mode-selection .mode-button.selected');
                const selectedDifficultyEl = document.querySelector('.difficulty-selection button.difficulty-button.selected');
                if (selectedModeEl && selectedDifficultyEl) {
                    generateNewGame(selectedModeEl.dataset.mode, selectedDifficultyEl.dataset.difficulty);
                } else {
                    alert('Пожалуйста, выберите режим и сложность.');
                }
            });
        }

        if (backToInitialButton) backToInitialButton.addEventListener('click', () => showScreen('initial-screen'));
        if (exitGameButton) {
            exitGameButton.addEventListener('click', () => {
                if (confirm("Вы уверены, что хотите выйти? Текущий прогресс будет сохранен.")) {
                    saveGameState();
                    stopTimer();
                    clearSelectionHighlights(); // Сбросить выделение
                    selectedCell = null; selectedRow = -1; selectedCol = -1; // Сбросить выбор
                    showScreen('initial-screen');
                }
            });
        }

        if (numpad) {
            numpad.querySelectorAll('button[data-num]').forEach(button => {
                button.addEventListener('click', (e) => handleInput(parseInt(e.target.dataset.num)));
            });
        }

        if (eraseButton) eraseButton.addEventListener('click', eraseCell);
        if (noteToggleButton) noteToggleButton.addEventListener('click', toggleNoteMode);
        if (checkButton) checkButton.addEventListener('click', updateBoardState); // Перепроверить ошибки
        if (hintButton) hintButton.addEventListener('click', applyHint);
        if (undoButton) undoButton.addEventListener('click', undoLastMove);

        document.addEventListener('keydown', (e) => {
            if (!gameContainer.classList.contains('visible')) return; // Обработка только на игровом экране

            if (selectedCell && selectedRow !== -1 && selectedCol !== -1) { // Если ячейка выбрана
                const digit = parseInt(e.key);
                if (digit >= 1 && digit <= 9) {
                    handleInput(digit); e.preventDefault(); return;
                } else if (e.key === 'Backspace' || e.key === 'Delete') {
                    eraseCell(); e.preventDefault(); return;
                } else if (e.key === 'n' || e.key === 'N' || e.key === ' ' || e.key === 'Enter' ) { // Заметки по N, Space, Enter
                    if (!e.ctrlKey && !e.metaKey) { // Не пересекаться с Ctrl+N
                        toggleNoteMode(); e.preventDefault(); return;
                    }
                }
            }

            // Навигация стрелками
            if (selectedRow !== -1 && selectedCol !== -1) {
                let newR = selectedRow, newC = selectedCol, moved = false;
                if (e.key === 'ArrowUp') { newR--; moved = true; }
                else if (e.key === 'ArrowDown') { newR++; moved = true; }
                else if (e.key === 'ArrowLeft') { newC--; moved = true; }
                else if (e.key === 'ArrowRight') { newC++; moved = true; }

                if (moved) {
                    e.preventDefault();
                    selectCell(Math.max(0, Math.min(8, newR)), Math.max(0, Math.min(8, newC)));
                    return;
                }
            }

            // Глобальные горячие клавиши
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                if (!undoButton.disabled) undoLastMove(); e.preventDefault();
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { // Ctrl+Y для подсказки
                if (!hintButton.disabled) applyHint(); e.preventDefault();
            }
            if (currentMode === 'killer') {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
                    if (!logicNextStepButton.disabled) logicNextStepButton.click(); e.preventDefault();
                }
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                    if (!logicSolveButton.disabled) logicSolveButton.click(); e.preventDefault();
                }
            }
        });
        // console.log("Event listeners added.");
    }

    function initializeApp() {
        // console.log("Initializing app...");
        loadThemePreference();
        checkContinueButtonState();
        addEventListeners();
        showScreen('initial-screen');
        try {
            if (window.Telegram && window.Telegram.WebApp) {
                window.Telegram.WebApp.ready();
            }
        } catch (e) {
            console.error("Telegram SDK error:", e);
        }
    }

    function checkContinueButtonState() {
        if (!continueGameButton) return;
        try {
            const gameStateExists = !!localStorage.getItem('sudokuGameState');
            continueGameButton.disabled = !gameStateExists;
        } catch (e) {
            console.error("Error checking continue button state:", e);
            continueGameButton.disabled = true;
        }
    }

    const THEME_KEY = 'sudokuTheme';
    function loadThemePreference() {
        const savedTheme = localStorage.getItem(THEME_KEY);
        document.body.classList.toggle('dark-theme', savedTheme === 'dark');
        if (themeToggleCheckbox) themeToggleCheckbox.checked = (savedTheme === 'dark');
    }

    if (themeToggleCheckbox) {
        themeToggleCheckbox.addEventListener('change', () => {
            document.body.classList.toggle('dark-theme', themeToggleCheckbox.checked);
            localStorage.setItem(THEME_KEY, themeToggleCheckbox.checked ? 'dark' : 'light');
        });
    }

    initializeApp();
});
