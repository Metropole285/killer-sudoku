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
    const startSelectedGameButton = document.getElementById('start-selected-game-button');


    // --- Состояние игры ---
    let userGrid = []; // Массив 9x9 объектов {value: 0, isGiven: false, isError: false, notes: Set(), isSolved: false}
    let solutionGrid = []; // Решение для проверки (массив 9x9 объектов {value: N})
    let currentMode = 'classic';
    let currentDifficulty = 'medium'; // По умолчанию средний
    let selectedCellElement = null; // HTML элемент выбранной ячейки
    let selectedRow = -1;
    let selectedCol = -1;
    let isNoteMode = false;
    let timerInterval;
    let timeElapsed = 0;
    let history = [];
    let hintsRemaining = 3;

    // --- Killer Sudoku Specifics ---
    let killerSolverData = null; // {cageDataArray, cellToCageMap}
    let currentCandidatesMap = {}; // cellId -> Set<number>

    // --- Helper Functions ---
    // killerSolverLogic.getCellId и getCellCoords теперь можно использовать, если экспортированы
    // Оставим локальные для простоты, если killerSolverLogic не экспортирует их глобально
    function getCellId(r, c) { return "ABCDEFGHI"[r] + (c + 1); }
    function getCellCoords(cellId) {
        if (!cellId || typeof cellId !== 'string' || cellId.length !== 2) return null;
        const r = "ABCDEFGHI".indexOf(cellId[0]);
        const c = parseInt(cellId.substring(1)) - 1;
        if (r === -1 || isNaN(c) || c < 0 || c > 8) return null;
        return { r, c };
    }


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
                solutionGrid: solutionGrid, // Сохраняем структуру solutionGrid
                currentMode: currentMode,
                currentDifficulty: currentDifficulty,
                timeElapsed: timeElapsed,
                history: history.map(h => ({ // Глубокое копирование Set в истории
                    ...h,
                    newNotes: Array.from(h.newNotes),
                    oldCandidates: h.oldCandidates ? Array.from(h.oldCandidates) : []
                })),
                hintsRemaining: hintsRemaining,
                killerSolverData: killerSolverData,
                currentCandidatesMap: Object.fromEntries(
                    Object.entries(currentCandidatesMap).map(([key, valueSet]) => [key, Array.from(valueSet)])
                )
            };
            localStorage.setItem('sudokuGameState', JSON.stringify(gameState));
            // console.log("Game state saved.");
            checkContinueButton();
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
                history = gameState.history.map(h => ({ // Восстановление Set в истории
                    ...h,
                    newNotes: new Set(h.newNotes),
                    oldCandidates: new Set(h.oldCandidates || [])
                }));
                hintsRemaining = gameState.hintsRemaining;
                killerSolverData = gameState.killerSolverData;
                currentCandidatesMap = Object.fromEntries(
                    Object.entries(gameState.currentCandidatesMap || {}).map(([key, valueArray]) => [key, new Set(valueArray)])
                );

                startTimer();
                // Рендер доски и клеток будет вызван после загрузки
                if (currentMode === 'killer' && killerSolverData) {
                    renderKillerCages(killerSolverData.cageDataArray);
                }
                renderBoard(); // Это должно обновить и заметки на основе currentCandidatesMap или userGrid.notes
                updateHintsDisplay();
                updateLogicSolverButtonsState();
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
        currentMode = 'classic';
        selectedCellElement = null;
        selectedRow = -1;
        selectedCol = -1;
        isNoteMode = false;
        clearInterval(timerInterval);
        timeElapsed = 0;
        history = [];
        hintsRemaining = 3;
        killerSolverData = null;
        currentCandidatesMap = {};
        updateHintsDisplay();
        updateLogicSolverButtonsState();
        checkContinueButton();
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

                // Восстановление .cage-sum, если он был (для Killer)
                if (currentMode === 'killer' && killerSolverData) {
                    const cageId = killerSolverData.cellToCageMap[cellElement.id];
                    if (cageId !== undefined) {
                        const cage = killerSolverData.cageDataArray.find(cg => cg.id === cageId);
                        if (cage) {
                            const firstCellInCage = getCellCoords(cage.cells[0]);
                            if (firstCellInCage && firstCellInCage.r === rIdx && firstCellInCage.c === cIdx) {
                                const sumDiv = document.createElement('div');
                                sumDiv.classList.add('cage-sum');
                                sumDiv.textContent = cage.sum;
                                cellElement.prepend(sumDiv);
                            }
                            // Границы клеток Killer рисуются в renderKillerCages
                        }
                    }
                }
                renderCellContent(cellElement, cellData, rIdx, cIdx); // Выделено в отдельную функцию
                cellElement.addEventListener('click', () => selectCell(rIdx, cIdx));
                boardElement.appendChild(cellElement);
            });
        });
        if (currentMode === 'killer' && killerSolverData) {
             renderKillerCages(killerSolverData.cageDataArray); // Перерисовать границы клеток после создания ячеек
        }
        updateSelectionHighlight();
        // console.log("Board rendered.");
    }

    function renderCellContent(cellElement, cellData, r, c) {
        // Очищаем только содержимое, относящееся к цифрам/заметкам, не трогая .cage-sum
        Array.from(cellElement.childNodes).forEach(node => {
            if (!node.classList || !node.classList.contains('cage-sum')) {
                cellElement.removeChild(node);
            }
        });
        cellElement.classList.remove('given', 'user-input', 'error');


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
        } else { // Empty cell, render notes/candidates
            let notesToDisplay = cellData.notes; // По умолчанию пользовательские заметки
            const cellId = getCellId(r, c);
            // Если есть кандидаты от решателя и они не пустые, они имеют приоритет для отображения
            if (currentCandidatesMap[cellId] && currentCandidatesMap[cellId].size > 0) {
                notesToDisplay = currentCandidatesMap[cellId];
            }

            if (notesToDisplay.size > 0) {
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
        if (cellData.isError) {
            cellElement.classList.add('error');
        }
    }


    // Вызывается из killerSolverLogic или при ручном вводе/стирании
    function renderCell(r, c, valueToSet = null, candidatesToSet = null) {
        const cellElement = boardElement.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);
        if (!cellElement) return;
        const cellData = userGrid[r][c];
        const cellId = getCellId(r,c);

        if (valueToSet !== null) { // Установка значения (из решателя или подсказки)
            cellData.value = valueToSet;
            cellData.notes.clear();
            currentCandidatesMap[cellId] = new Set(); // Очищаем кандидатов решателя
            cellData.isSolved = (valueToSet !== 0); // Если не 0, то решена
            cellData.isError = false; // Сброс ошибки при установке значения
        } else if (candidatesToSet !== null) { // Установка кандидатов (из решателя)
            cellData.value = 0; // Убедимся, что ячейка пуста
            currentCandidatesMap[cellId] = new Set(candidatesToSet); // Обновляем карту решателя
            // Пользовательские заметки (cellData.notes) можно не трогать или очистить,
            // в зависимости от того, как они должны взаимодействовать.
            // Сейчас renderCellContent покажет currentCandidatesMap если они есть.
            cellData.isSolved = false;
        } else { // Просто обновить на основе текущего cellData (например, после стирания)
             if(cellData.value === 0) currentCandidatesMap[cellId] = new Set(); // Очистить кандидатов решателя, если стерли значение
        }
        renderCellContent(cellElement, cellData, r, c);
        updateSelectionHighlight();
    }


    function selectCell(r, c) {
        clearSelectionHighlights(); // Только подсветку, не сброс selectedRow/Col
        selectedRow = r;
        selectedCol = c;
        selectedCellElement = boardElement.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);

        if (selectedCellElement) {
            if (userGrid[r][c].isGiven && currentMode === 'classic') {
                // В классическом режиме не выделяем "данные" ячейки для ввода
                selectedCellElement = null;
                selectedRow = -1;
                selectedCol = -1;
                return;
            }
            selectedCellElement.classList.add('selected');
            highlightRelatedCells(r, c);
        }
    }

    function clearSelectionHighlights() {
        boardElement.querySelectorAll('.cell.selected, .cell.highlight, .cell.highlight-value').forEach(cell => {
            cell.classList.remove('selected', 'highlight', 'highlight-value');
        });
    }
    function clearFullSelection() { // Для выхода из игры и т.п.
        clearSelectionHighlights();
        selectedCellElement = null;
        selectedRow = -1;
        selectedCol = -1;
    }


    function highlightRelatedCells(r, c) {
        const selectedValue = userGrid[r][c].value;
        const selectedCellId = getCellId(r, c);
        const selectedCageId = (currentMode === 'killer' && killerSolverData) ? killerSolverData.cellToCageMap[selectedCellId] : undefined;

        userGrid.forEach((row, rIdx) => {
            row.forEach((cell, cIdx) => {
                const cellElement = boardElement.querySelector(`.cell[data-row='${rIdx}'][data-col='${cIdx}']`);
                if (!cellElement || (rIdx === r && cIdx === c)) return; // Пропускаем саму выбранную ячейку

                let isRelated = false;
                if (rIdx === r || cIdx === c || (Math.floor(rIdx / 3) === Math.floor(r / 3) && Math.floor(cIdx / 3) === Math.floor(c / 3))) {
                    isRelated = true;
                }
                if (currentMode === 'killer' && killerSolverData && selectedCageId !== undefined) {
                    const currentCellId = getCellId(rIdx, cIdx);
                    if (killerSolverData.cellToCageMap[currentCellId] === selectedCageId) {
                        isRelated = true;
                    }
                }
                if (isRelated) {
                    cellElement.classList.add('highlight');
                }

                if (selectedValue !== 0 && cell.value === selectedValue) {
                    cellElement.classList.add('highlight-value');
                }
            });
        });
    }
    function updateSelectionHighlight() { // Перерисовывает подсветку для текущей выбранной ячейки
        clearSelectionHighlights();
        if (selectedCellElement && selectedRow !== -1 && selectedCol !== -1) {
            selectedCellElement.classList.add('selected');
            highlightRelatedCells(selectedRow, selectedCol);
        }
    }

    function handleInput(digit) {
        if (!selectedCellElement || selectedRow === -1 || selectedCol === -1 || userGrid[selectedRow][selectedCol].isGiven) {
            return;
        }

        const currentCellData = userGrid[selectedRow][selectedCol];
        const cellId = getCellId(selectedRow, selectedCol);
        const oldValue = currentCellData.value;
        const oldNotes = new Set(currentCellData.notes);
        const oldCandidates = currentCandidatesMap[cellId] ? new Set(currentCandidatesMap[cellId]) : new Set();


        if (isNoteMode) {
            currentCellData.value = 0; // В режиме заметок значение всегда 0
            if (currentCellData.notes.has(digit)) {
                currentCellData.notes.delete(digit);
            } else {
                currentCellData.notes.add(digit);
            }
            currentCandidatesMap[cellId] = new Set(); // Пользовательские заметки отменяют кандидатов решателя
        } else {
            if (currentCellData.value === digit) { // Повторный клик на ту же цифру стирает ее
                currentCellData.value = 0;
            } else {
                currentCellData.value = digit;
            }
            currentCellData.notes.clear(); // Ввод значения стирает заметки
            currentCandidatesMap[cellId] = new Set(); // И кандидатов решателя
            currentCellData.isSolved = (currentCellData.value !== 0);
        }
        
        history.push({
            r: selectedRow, c: selectedCol,
            oldValue: oldValue, oldNotes: oldNotes, // Сохраняем старые пользовательские заметки
            newNotes: new Set(currentCellData.notes), // Сохраняем новые пользовательские заметки (для isNoteMode)
            oldCandidates: oldCandidates // Сохраняем старых кандидатов решателя
        });
        undoButton.disabled = false;

        renderCellContent(selectedCellElement, currentCellData, selectedRow, selectedCol);
        updateBoardState(); // Проверка ошибок и обновление связанных ячеек/кандидатов
        saveGameState();
        checkGameCompletion();
    }

    function eraseCell() {
        if (!selectedCellElement || selectedRow === -1 || selectedCol === -1 || userGrid[selectedRow][selectedCol].isGiven) {
            return;
        }
        const currentCellData = userGrid[selectedRow][selectedCol];
        const cellId = getCellId(selectedRow, selectedCol);

        history.push({
            r: selectedRow, c: selectedCol,
            oldValue: currentCellData.value, oldNotes: new Set(currentCellData.notes),
            newNotes: new Set(), // После стирания заметки пусты
            oldCandidates: currentCandidatesMap[cellId] ? new Set(currentCandidatesMap[cellId]) : new Set()
        });
        undoButton.disabled = false;

        currentCellData.value = 0;
        currentCellData.notes.clear();
        currentCellData.isError = false;
        currentCellData.isSolved = false;
        currentCandidatesMap[cellId] = new Set(); // Очищаем и кандидатов решателя

        renderCellContent(selectedCellElement, currentCellData, selectedRow, selectedCol);
        updateBoardState();
        saveGameState();
        checkGameCompletion();
    }


    function toggleNoteMode() {
        isNoteMode = !isNoteMode;
        noteToggleButton.textContent = isNoteMode ? '📝' : '🔢'; // Или другие иконки
        noteToggleButton.title = isNoteMode ? 'Режим заметок (ВКЛ)' : 'Режим ввода (ВЫКЛ)';
        noteToggleButton.classList.toggle('active', isNoteMode);
        numpad.classList.toggle('note-mode-active', isNoteMode);
    }

    function updateBoardState() { // Проверяет ошибки и обновляет кандидатов, если нужно
        let gameHasErrors = false;
        userGrid.forEach((row, rIdx) => {
            row.forEach((cell, cIdx) => {
                cell.isError = false; // Сброс флага ошибки
                const cellElement = boardElement.querySelector(`.cell[data-row='${rIdx}'][data-col='${cIdx}']`);

                if (cell.value !== 0) {
                    // Проверка строки
                    for (let col = 0; col < 9; col++) {
                        if (col !== cIdx && userGrid[rIdx][col].value === cell.value) cell.isError = true;
                    }
                    // Проверка столбца
                    for (let row = 0; row < 9; row++) {
                        if (row !== rIdx && userGrid[row][cIdx].value === cell.value) cell.isError = true;
                    }
                    // Проверка блока
                    const startRow = Math.floor(rIdx / 3) * 3;
                    const startCol = Math.floor(cIdx / 3) * 3;
                    for (let r = 0; r < 3; r++) {
                        for (let c = 0; c < 3; c++) {
                            if ((startRow + r !== rIdx || startCol + c !== cIdx) && userGrid[startRow + r][startCol + c].value === cell.value) cell.isError = true;
                        }
                    }
                    // Проверка в клетке Killer Sudoku
                    if (currentMode === 'killer' && killerSolverData) {
                        const currentCellId = getCellId(rIdx, cIdx);
                        const cageId = killerSolverData.cellToCageMap[currentCellId];
                        if (cageId !== undefined) {
                            const cage = killerSolverData.cageDataArray.find(cg => cg.id === cageId);
                            if (cage) {
                                for (const cageCellId of cage.cells) {
                                    if (cageCellId !== currentCellId) {
                                        const coords = getCellCoords(cageCellId);
                                        if (coords && userGrid[coords.r][coords.c].value === cell.value) {
                                            cell.isError = true;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                if (cell.isError) {
                    gameHasErrors = true;
                    if (cellElement) cellElement.classList.add('error');
                } else {
                    if (cellElement) cellElement.classList.remove('error');
                }
            });
        });

        if (currentMode === 'killer') { // Для Killer Sudoku пересчитываем кандидатов после каждого изменения
            updateAllCandidates();
        } else { // Для классики просто перерисовываем доску, чтобы обновить классы ошибок
            renderBoard(); // Может быть избыточно, если только ошибки обновляются
        }


        if (gameHasErrors) {
            statusMessageElement.textContent = "Есть ошибки на доске!";
            statusMessageElement.classList.remove('success-msg');
            statusMessageElement.classList.add('incorrect-msg');
        } else {
            statusMessageElement.textContent = "";
            statusMessageElement.classList.remove('incorrect-msg');
        }
        updateSelectionHighlight(); // Восстановить подсветку после полного рендера
    }

    function updateAllCandidates() {
        if (currentMode === 'killer' && killerSolverLogic) {
            currentCandidatesMap = killerSolverLogic.calculateAllKillerCandidates(userGrid, killerSolverData);
        } else if (currentMode === 'classic') {
            // TODO: Реализовать calculateAllClassicCandidates, если нужна автоматическая генерация заметок для классики
            // Пока что для классики currentCandidatesMap не используется активно для отображения, только пользовательские заметки
            currentCandidatesMap = {}; // Очищаем для классики, если не используется
        }
        // Перерисовать все ячейки, чтобы отобразить обновленные заметки (если они из currentCandidatesMap)
        // или просто обновить классы ошибок (если renderBoard() не вызывался из updateBoardState)
        renderBoard(); // Это перерисует все, включая новые кандидаты из currentCandidatesMap
        // console.log("All candidates updated and board re-rendered.");
    }


    function checkGameCompletion() {
        let allFilled = true;
        let hasErrors = false;
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (userGrid[r][c].value === 0) allFilled = false;
                if (userGrid[r][c].isError) hasErrors = true;
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
        }
    }

    function isGameSolved() {
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (userGrid[r][c].value === 0 || userGrid[r][c].isError) return false;
            }
        }
        return true;
    }

    function disableInput() {
        numpad.querySelectorAll('button').forEach(b => b.disabled = true);
        boardElement.style.pointerEvents = 'none'; // Блокирует клики на ячейках
        hintButton.disabled = true;
        checkButton.disabled = true;
        // undoButton.disabled = true; // Оставляем активной, если история не пуста
        logicNextStepButton.disabled = true;
        logicSolveButton.disabled = true;
    }

    function enableInput() {
        numpad.querySelectorAll('button').forEach(b => b.disabled = false);
        boardElement.style.pointerEvents = 'auto';
        hintButton.disabled = hintsRemaining <= 0;
        checkButton.disabled = false;
        undoButton.disabled = history.length === 0;
        updateLogicSolverButtonsState();
    }

    function updateHintsDisplay() {
        hintButton.textContent = `💡 ${hintsRemaining}/3`;
        hintButton.disabled = hintsRemaining <= 0 || isGameSolved();
    }

    function applyHint() {
        if (hintsRemaining <= 0 || isGameSolved()) return;

        let emptyCells = [];
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (userGrid[r][c].value === 0) emptyCells.push({ r, c });
            }
        }
        if (emptyCells.length === 0) return;

        const randomEmptyCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        const { r, c } = randomEmptyCell;
        const correctValue = solutionGrid[r][c].value;

        history.push({
            r, c, oldValue: 0, oldNotes: new Set(userGrid[r][c].notes),
            newNotes: new Set(), // Заметки очищаются
            oldCandidates: currentCandidatesMap[getCellId(r,c)] ? new Set(currentCandidatesMap[getCellId(r,c)]) : new Set()
        });

        userGrid[r][c].value = correctValue;
        userGrid[r][c].notes.clear();
        userGrid[r][c].isError = false;
        userGrid[r][c].isSolved = true; // Считаем решенной подсказкой
        currentCandidatesMap[getCellId(r,c)] = new Set(); // Очищаем кандидатов

        renderCell(r, c, correctValue, null); // Обновляем UI ячейки
        hintsRemaining--;
        updateHintsDisplay();
        updateBoardState(); // Перепроверить всю доску
        saveGameState();
        checkGameCompletion();
        undoButton.disabled = false;
    }

    function undoLastMove() {
        if (history.length === 0) return;
        const lastMove = history.pop();
        const { r, c, oldValue, oldNotes, newNotes: currentNotesOnStack, oldCandidates } = lastMove; // newNotes на самом деле это currentNotes для этой ячейки до этого хода
        
        const cellData = userGrid[r][c];
        const cellId = getCellId(r, c);

        cellData.value = oldValue;
        cellData.notes = new Set(oldNotes); // Восстанавливаем старые заметки
        cellData.isError = false;
        cellData.isSolved = (oldValue !== 0);

        // Восстанавливаем кандидатов решателя для этой ячейки
        currentCandidatesMap[cellId] = new Set(oldCandidates || []);


        const cellElement = boardElement.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);
        if (cellElement) {
            renderCellContent(cellElement, cellData, r, c);
        }

        updateBoardState(); // Это вызовет updateAllCandidates, который перерисует доску
        undoButton.disabled = history.length === 0;
        saveGameState();
        checkGameCompletion(); // Важно, т.к. могли отменить выигрышный ход
        enableInput(); // Игра могла быть завершена, а отмена вернула ее в активное состояние
    }


    function generateNewGame(mode, difficulty) {
        stopTimer();
        timeElapsed = 0; // Сброс таймера
        history = []; // Очистка истории
        clearFullSelection(); // Сброс выделения
        
        currentMode = mode;
        currentDifficulty = difficulty;
        killerSolverData = null; // Очистка данных Killer Sudoku
        currentCandidatesMap = {}; // Очистка карты кандидатов

        let puzzleGenData;

        try {
            if (currentMode === 'classic') {
                if (!window.sudoku || typeof window.sudoku.generate !== 'function') {
                    throw new Error("Classic sudoku library (sudoku.js) or generate function not found.");
                }
                puzzleGenData = window.sudoku.generate(difficulty); // Ожидаем {puzzle: "string", solution: "string"}
                if (!puzzleGenData || !puzzleGenData.puzzle || !puzzleGenData.solution) {
                     throw new Error("Classic sudoku generator returned invalid data.");
                }
            } else { // Killer Sudoku
                if (!window.killerSudoku || typeof window.killerSudoku.generate !== 'function') {
                    throw new Error("KillerSudoku library or generate function not found.");
                }
                puzzleGenData = window.killerSudoku.generate(difficulty); // Ожидаем {cages, grid, solution}
                if (!puzzleGenData || !puzzleGenData.cages || puzzleGenData.grid === undefined || !puzzleGenData.solution) {
                    throw new Error("KillerSudoku generator returned invalid data.");
                }
                // console.log("Generated Killer Sudoku raw data:", JSON.parse(JSON.stringify(puzzleGenData)));

                killerSolverData = {
                    cageDataArray: puzzleGenData.cages.map((cage, index) => ({ // Глубокое копирование и присвоение ID, если нет
                        ...cage,
                        id: cage.id !== undefined ? cage.id : index // Убедимся, что у каждой клетки есть ID
                    })),
                    cellToCageMap: {}
                };
                killerSolverData.cageDataArray.forEach(cage => {
                    cage.cells.forEach(cellId => {
                        killerSolverData.cellToCageMap[cellId] = cage.id;
                    });
                });
            }
        } catch (e) {
            console.error("Error during puzzle generation:", e);
            alert(`Ошибка при генерации ${currentMode === 'classic' ? 'классического' : 'Killer'} Судоку: ${e.message}`);
            showScreen('initial-screen'); // Возврат на начальный экран
            return;
        }

        userGrid = Array(9).fill(null).map(() => Array(9).fill(null));
        solutionGrid = Array(9).fill(null).map(() => Array(9).fill(null));

        let charIndex = 0;
        const blankChar = currentMode === 'classic' ? (sudoku.BLANK_CHAR || '.') : (killerSudoku.BLANK_CHAR || '.');
        const puzzleString = currentMode === 'classic' ? puzzleGenData.puzzle : puzzleGenData.grid; // grid для Killer обычно пуст

        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const pChar = puzzleString[charIndex];
                const sChar = puzzleGenData.solution[charIndex];

                const value = (pChar === blankChar) ? 0 : parseInt(pChar);
                const isGiven = (value !== 0);

                userGrid[r][c] = { value, isGiven, isError: false, notes: new Set(), isSolved: isGiven };
                solutionGrid[r][c] = { value: parseInt(sChar) };
                charIndex++;
            }
        }
        
        updateAllCandidates(); // Инициализация currentCandidatesMap и первый рендер доски с заметками

        if (currentMode === 'killer') {
            renderKillerCages(killerSolverData.cageDataArray); // Рисуем клетки поверх уже отрендеренной доски
        }
        // renderBoard(); // Уже вызвано через updateAllCandidates -> renderBoard

        startTimer();
        hintsRemaining = 3; // Сброс подсказок
        updateHintsDisplay();
        enableInput();
        undoButton.disabled = true;
        showScreen('game-container');
        saveGameState(); // Сохранить начальное состояние новой игры
        // console.log(`New ${currentMode} game started (Difficulty: ${currentDifficulty}).`);
    }


    function renderKillerCages(cages) {
        if (!killerSolverData || !killerSolverData.cellToCageMap) return;

        // Сначала очистим все старые границы клеток
        boardElement.querySelectorAll('.cell').forEach(cellElement => {
            cellElement.classList.remove('cage-border-top', 'cage-border-bottom', 'cage-border-left', 'cage-border-right');
            const sumDiv = cellElement.querySelector('.cage-sum');
            if (sumDiv) sumDiv.remove();
        });

        cages.forEach(cage => {
            if (!cage.cells || cage.cells.length === 0) return;

            // Отображение суммы в первой (top-left-most) ячейке клетки
            let firstCellId = cage.cells[0]; // По умолчанию первая
            if (cage.cells.length > 1) { // Найдем top-left для суммы
                let minR = 9, minC = 9;
                cage.cells.forEach(cellId => {
                    const coords = getCellCoords(cellId);
                    if (coords) {
                        if (coords.r < minR) { minR = coords.r; minC = coords.c; firstCellId = cellId; }
                        else if (coords.r === minR && coords.c < minC) { minC = coords.c; firstCellId = cellId; }
                    }
                });
            }
            const firstCellElement = document.getElementById(firstCellId);
            if (firstCellElement) {
                const sumDiv = document.createElement('div');
                sumDiv.classList.add('cage-sum');
                sumDiv.textContent = cage.sum;
                firstCellElement.prepend(sumDiv);
            }

            // Добавление пунктирных границ
            const cageId = killerSolverData.cellToCageMap[cage.cells[0]]; // ID этой клетки
            cage.cells.forEach(cellId => {
                const coords = getCellCoords(cellId);
                if (!coords) return;
                const { r, c } = coords;
                const currentCellElement = document.getElementById(cellId);
                if (!currentCellElement) return;

                // Верхняя граница
                if (r === 0 || killerSolverData.cellToCageMap[getCellId(r - 1, c)] !== cageId) {
                    currentCellElement.classList.add('cage-border-top');
                }
                // Нижняя граница
                if (r === 8 || killerSolverData.cellToCageMap[getCellId(r + 1, c)] !== cageId) {
                    currentCellElement.classList.add('cage-border-bottom');
                }
                // Левая граница
                if (c === 0 || killerSolverData.cellToCageMap[getCellId(r, c - 1)] !== cageId) {
                    currentCellElement.classList.add('cage-border-left');
                }
                // Правая граница
                if (c === 8 || killerSolverData.cellToCageMap[getCellId(r, c + 1)] !== cageId) {
                    currentCellElement.classList.add('cage-border-right');
                }
            });
        });
    }


    function showScreen(screenIdToShow) {
        const targetScreen = typeof screenIdToShow === 'string' ? document.getElementById(screenIdToShow) : screenIdToShow;
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('visible');
        });
        if (targetScreen) {
            targetScreen.classList.add('visible');
        }
        updateLogicSolverButtonsState(); // Обновить состояние кнопок решателя при смене экрана
    }

    function updateLogicSolverButtonsState() {
        const isKillerModeAndActiveGame = currentMode === 'killer' && gameContainer.classList.contains('visible') && !isGameSolved();
        if (logicNextStepButton) {
            logicNextStepButton.style.display = (currentMode === 'killer' && gameContainer.classList.contains('visible')) ? 'inline-block' : 'none';
            logicNextStepButton.disabled = !isKillerModeAndActiveGame;
        }
        if (logicSolveButton) {
            logicSolveButton.style.display = (currentMode === 'killer' && gameContainer.classList.contains('visible')) ? 'inline-block' : 'none';
            logicSolveButton.disabled = !isKillerModeAndActiveGame;
        }
    }


    // --- Обработчики событий решателя ---
    if (logicNextStepButton) {
        logicNextStepButton.addEventListener('click', () => {
            if (currentMode !== 'killer' || isGameSolved()) return;
            // updateAllCandidates(); // Уже вызывается внутри doKillerLogicStep через коллбэк

            const stepApplied = killerSolverLogic.doKillerLogicStep(
                userGrid, currentCandidatesMap, killerSolverData,
                updateAllCandidates, // Callback to re-calculate and re-render ALL candidates
                renderCell // Callback to update a single cell's display (value or notes)
            );

            if (stepApplied && stepApplied.appliedTechnique) {
                statusMessageElement.textContent = `Применена техника: ${stepApplied.appliedTechnique}!`;
                statusMessageElement.classList.remove('incorrect-msg');
                statusMessageElement.classList.add('success-msg');
                // updateAllCandidates() and renderCell() are called within doKillerLogicStep or its callbacks
                // updateBoardState(); // Может быть избыточным, если updateAllCandidates уже все обновил
                saveGameState();
                checkGameCompletion();
            } else {
                statusMessageElement.textContent = "Не найдено новых логических шагов.";
                statusMessageElement.classList.remove('success-msg');
                statusMessageElement.classList.add('incorrect-msg');
            }
            updateLogicSolverButtonsState(); // Обновить состояние кнопок
        });
    }

    if (logicSolveButton) {
        logicSolveButton.addEventListener('click', () => {
            if (currentMode !== 'killer' || isGameSolved()) return;
            let stepsCount = 0;
            let maxIterations = 200; // Safety break
            let somethingAppliedInCycle;

            do {
                somethingAppliedInCycle = false;
                // updateAllCandidates(); // Вызывается в doKillerLogicStep

                const stepApplied = killerSolverLogic.doKillerLogicStep(
                    userGrid, currentCandidatesMap, killerSolverData,
                    updateAllCandidates, renderCell
                );

                if (stepApplied && stepApplied.appliedTechnique) {
                    stepsCount++;
                    somethingAppliedInCycle = true;
                    // updateBoardState(); // Может быть избыточным
                }
                maxIterations--;
                if (isGameSolved()) break;
            } while (somethingAppliedInCycle && maxIterations > 0);

            if (isGameSolved()) {
                statusMessageElement.textContent = `Головоломка решена за ${stepsCount} логических шагов!`;
                statusMessageElement.classList.remove('incorrect-msg');
                statusMessageElement.classList.add('success-msg');
                disableInput();
            } else if (stepsCount > 0) {
                statusMessageElement.textContent = `Применено ${stepsCount} шагов. Дальнейшие шаги не найдены.`;
                statusMessageElement.classList.remove('success-msg'); // Может быть и не ошибка, а просто конец простых шагов
                statusMessageElement.classList.add('incorrect-msg'); // или success-msg если это ожидаемо
            } else {
                statusMessageElement.textContent = "Не найдено логических шагов для применения.";
                statusMessageElement.classList.remove('success-msg');
                statusMessageElement.classList.add('incorrect-msg');
            }
            saveGameState();
            checkGameCompletion(); // Проверить, не решена ли игра
            updateLogicSolverButtonsState();
        });
    }

    // --- Инициализация и слушатели событий ---
    function addEventListeners() {
        if (startNewGameButton) startNewGameButton.addEventListener('click', () => showScreen('new-game-options'));
        if (continueGameButton) {
            continueGameButton.addEventListener('click', () => {
                if (loadGameState()) {
                    showScreen('game-container');
                } else {
                    // alert("Не удалось загрузить сохраненную игру. Начните новую.");
                    statusMessageElement.textContent = "Сохраненная игра не найдена или повреждена.";
                    checkContinueButton(); // Обновить состояние кнопки
                }
            });
        }

        document.querySelectorAll('#game-mode-selection .mode-button').forEach(button => {
            button.addEventListener('click', (e) => {
                document.querySelectorAll('#game-mode-selection .mode-button').forEach(btn => btn.classList.remove('selected'));
                e.target.classList.add('selected');
                // currentMode будет установлен при старте игры
            });
        });

        if (difficultyButtonsContainer) {
            difficultyButtonsContainer.querySelectorAll('.difficulty-button').forEach(button => {
                 button.addEventListener('click', (e) => {
                    difficultyButtonsContainer.querySelectorAll('.difficulty-button').forEach(btn => btn.classList.remove('selected'));
                    e.target.classList.add('selected');
                    // currentDifficulty будет установлен при старте игры
                });
            });
        }


        if (startSelectedGameButton) { // Кнопка "Начать игру" на экране настроек
            startSelectedGameButton.addEventListener('click', () => {
                const selectedModeElem = document.querySelector('#game-mode-selection .mode-button.selected');
                const selectedDifficultyElem = document.querySelector('.difficulty-selection button.selected');
                if (selectedModeElem && selectedDifficultyElem) {
                    generateNewGame(selectedModeElem.dataset.mode, selectedDifficultyElem.dataset.difficulty);
                } else {
                    alert('Пожалуйста, выберите режим и сложность.');
                }
            });
        }


        if (backToInitialButton) backToInitialButton.addEventListener('click', () => showScreen('initial-screen'));
        if (exitGameButton) {
            exitGameButton.addEventListener('click', () => {
                if (!isGameSolved() && history.length > 0) { // Если игра не решена и есть ходы
                     if (confirm("Вы уверены, что хотите выйти? Прогресс будет сохранен.")) {
                        saveGameState();
                        showScreen('initial-screen');
                        stopTimer();
                        clearFullSelection();
                    }
                } else { // Если игра решена или пустая
                    showScreen('initial-screen');
                    stopTimer();
                    clearFullSelection();
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
        if (checkButton) checkButton.addEventListener('click', () => {
            updateBoardState(); // Просто перепроверить ошибки
            checkGameCompletion(); // И проверить, не завершена ли игра
        });
        if (hintButton) hintButton.addEventListener('click', applyHint);
        if (undoButton) undoButton.addEventListener('click', undoLastMove);

        document.addEventListener('keydown', (e) => {
            if (gameContainer.classList.contains('visible')) { // Только если игровой экран активен
                if (selectedRow !== -1 && selectedCol !== -1) { // Если ячейка выбрана
                    const digit = parseInt(e.key);
                    if (digit >= 1 && digit <= 9) {
                        handleInput(digit); e.preventDefault(); return;
                    } else if (e.key === 'Backspace' || e.key === 'Delete') {
                        eraseCell(); e.preventDefault(); return;
                    } else if (e.key === 'n' || e.key === 'N' || e.key === ' ' || e.key === 'Enter') { // Заметки
                        toggleNoteMode(); e.preventDefault(); return;
                    }

                    let newR = selectedRow, newC = selectedCol;
                    let moved = false;
                    if (e.key === 'ArrowUp') { newR--; moved = true; }
                    else if (e.key === 'ArrowDown') { newR++; moved = true; }
                    else if (e.key === 'ArrowLeft') { newC--; moved = true; }
                    else if (e.key === 'ArrowRight') { newC++; moved = true; }

                    if (moved) {
                        e.preventDefault();
                        newR = Math.max(0, Math.min(8, newR));
                        newC = Math.max(0, Math.min(8, newC));
                        selectCell(newR, newC);
                        return;
                    }
                }
                // Глобальные горячие клавиши (работают даже если ячейка не выбрана, но игра активна)
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                    undoLastMove(); e.preventDefault();
                }
                if (currentMode === 'killer') {
                    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') { // Ctrl+X для Next Step
                        if (logicNextStepButton && !logicNextStepButton.disabled) logicNextStepButton.click();
                        e.preventDefault();
                    }
                    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { // Ctrl+C для Solve
                         if (logicSolveButton && !logicSolveButton.disabled) logicSolveButton.click();
                         e.preventDefault();
                    }
                }
            }
        });
        // console.log("Event listeners added.");
    }


    // --- Инициализация Приложения ---
    function initializeApp(){
        // console.log("Initializing app...");
        try{
            loadThemePreference();
            checkContinueButton();
            addEventListeners();
            showScreen(initialScreen);
            try{
                if(window.Telegram && window.Telegram.WebApp) Telegram.WebApp.ready();
                // else console.log("Telegram SDK not found or WebApp not available.");
            }catch(e){
                console.error("Telegram SDK ready() error:",e);
            }
        }catch(e){
            console.error("CRITICAL INITIALIZATION ERROR:",e);
            document.body.innerHTML=`<div style='padding:20px;color:red;'><h1>Критическая ошибка инициализации!</h1><p>${e.message}</p><pre>${e.stack}</pre></div>`;
        }
    }
    function checkContinueButton(){
        if(!continueGameButton) return;
        try{
            const savedGame = localStorage.getItem('sudokuGameState');
            continueGameButton.disabled = !savedGame;
            // console.log(`Continue button enabled: ${!continueGameButton.disabled}`);
        }catch(e){
            console.error("Error checking for saved game:",e);
            continueGameButton.disabled = true;
        }
    }

    // --- Theme Toggling ---
    const THEME_KEY = 'sudokuTheme';

    function loadThemePreference() {
        const savedTheme = localStorage.getItem(THEME_KEY);
        if (themeToggleCheckbox) { // Убедимся, что чекбокс есть
            if (savedTheme === 'dark') {
                document.body.classList.add('dark-theme');
                themeToggleCheckbox.checked = true;
            } else {
                document.body.classList.remove('dark-theme');
                themeToggleCheckbox.checked = false;
            }
        } else if (savedTheme === 'dark') { // Если чекбокса нет, но тема сохранена
             document.body.classList.add('dark-theme');
        }
    }

    if (themeToggleCheckbox) {
        themeToggleCheckbox.addEventListener('change', () => {
            if (themeToggleCheckbox.checked) {
                document.body.classList.add('dark-theme');
                localStorage.setItem(THEME_KEY, 'dark');
            } else {
                document.body.classList.remove('dark-theme');
                localStorage.setItem(THEME_KEY, 'light'); // или 'light'
            }
        });
    }

    initializeApp();
});
```
