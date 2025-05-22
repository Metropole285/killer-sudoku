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
    const eraseButton = document.getElementById('erase-button'); // <--- ИСПРАВЛЕНО: Добавлено объявление eraseButton
    const timerElement = document.getElementById('timer');
    const logicNextStepButton = document.getElementById('logic-next-step-button'); // Кнопка "Next Step"
    const logicSolveButton = document.getElementById('logic-solve-button');       // Кнопка "Solve"

    // --- Состояние игры ---
    let userGrid = []; // Массив 9x9 объектов {value: 0, isGiven: false, isError: false, notes: Set(), isSolved: false}
    let solutionGrid = []; // Решение для проверки
    let currentMode = 'classic'; // 'classic' или 'killer'
    let currentDifficulty = 'easy';
    let selectedCell = null;
    let selectedRow = -1;
    let selectedCol = -1;
    let isNoteMode = false;
    let timerInterval;
    let timeElapsed = 0;
    let history = []; // Для функции отмены
    let hintsRemaining = 3;

    // --- Killer Sudoku Specifics ---
    let killerSolverData = null; // Будет содержать {cageDataArray, cellToCageMap}
    let currentCandidatesMap = {}; // Map: cellId -> Set<number> для кандидатов решателя
    // (A1: Set(1,2,3), A2: Set(4,5), ...)

    // --- Helper Functions ---
    function getCellId(r, c) { return "ABCDEFGHI"[r] + (c + 1); }
    function getCellCoords(cellId) {
        const r = "ABCDEFGHI".indexOf(cellId[0]);
        const c = parseInt(cellId[1]) - 1;
        return { r, c };
    }

    function saveGameState() {
        try {
            const gameState = {
                userGrid: userGrid.map(row => row.map(cell => ({
                    value: cell.value,
                    isGiven: cell.isGiven,
                    notes: Array.from(cell.notes), // Set to Array for JSON
                    isError: cell.isError,
                    isSolved: cell.isSolved
                }))),
                solutionGrid: solutionGrid,
                currentMode: currentMode,
                currentDifficulty: currentDifficulty,
                timeElapsed: timeElapsed,
                history: history,
                hintsRemaining: hintsRemaining,
                killerSolverData: killerSolverData, // Сохраняем данные по Killer Sudoku
                // currentCandidatesMap не сохраняем, т.к. она пересчитывается
            };
            localStorage.setItem('sudokuGameState', JSON.stringify(gameState));
            console.log("Game state saved.");
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
                    notes: new Set(cell.notes) // Array back to Set
                })));
                solutionGrid = gameState.solutionGrid;
                currentMode = gameState.currentMode;
                currentDifficulty = gameState.currentDifficulty;
                timeElapsed = gameState.timeElapsed;
                history = gameState.history;
                hintsRemaining = gameState.hintsRemaining;
                killerSolverData = gameState.killerSolverData;

                startTimer();
                renderBoard();
                updateHintsDisplay();
                updateLogicSolverButtonsState();
                console.log("Game state loaded.");
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
        currentMode = 'classic';
        selectedCell = null;
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
        console.log("Game state cleared.");
    }

    function startTimer() {
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            timeElapsed++;
            const minutes = String(Math.floor(timeElapsed / 60)).padStart(2, '0');
            const seconds = String(timeElapsed % 60).padStart(2, '0');
            timerElement.textContent = `${minutes}:${seconds}`;
        }, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
    }

    function renderBoard() {
        boardElement.innerHTML = ''; // Очистка доски
        userGrid.forEach((row, rIdx) => {
            row.forEach((cell, cIdx) => {
                const cellElement = document.createElement('div');
                cellElement.classList.add('cell');
                cellElement.dataset.row = rIdx;
                cellElement.dataset.col = cIdx;
                cellElement.id = getCellId(rIdx, cIdx); // Добавляем ID для быстрой выборки

                // Добавляем классы для границ блоков 3х3
                if (rIdx % 3 === 0 && rIdx !== 0) cellElement.classList.add('border-top');
                if (cIdx % 3 === 0 && cIdx !== 0) cellElement.classList.add('border-left');

                if (cell.isGiven) {
                    cellElement.classList.add('given');
                    cellElement.textContent = cell.value;
                } else if (cell.value !== 0) {
                    cellElement.textContent = cell.value;
                    cellElement.classList.add('user-input');
                }

                if (cell.isError) {
                    cellElement.classList.add('error');
                } else {
                    cellElement.classList.remove('error');
                }

                // Отображение заметок/кандидатов
                // Если ячейка пуста и у нас есть кандидаты, отображаем их
                if (cell.value === 0 && currentCandidatesMap[cellElement.id]?.size > 0) { // Используем cellElement.id
                    // Создаем контейнер для заметок
                    const notesContainer = document.createElement('div');
                    notesContainer.classList.add('notes-container');

                    const notes = Array.from(currentCandidatesMap[cellElement.id]).sort((a,b) => a-b);
                    notes.forEach(note => {
                        const noteSpan = document.createElement('span');
                        noteSpan.classList.add('note');
                        noteSpan.textContent = note;
                        notesContainer.appendChild(noteSpan);
                    });
                    cellElement.appendChild(notesContainer);
                } else if (cell.value === 0 && cell.notes.size > 0 && !cell.isSolved) { // Для пользовательских заметок
                    const notesContainer = document.createElement('div');
                    notesContainer.classList.add('notes-container');
                    Array.from(cell.notes).sort((a,b) => a-b).forEach(note => {
                        const noteSpan = document.createElement('span');
                        noteSpan.classList.add('note');
                        noteSpan.textContent = note;
                        notesContainer.appendChild(noteSpan);
                    });
                    cellElement.appendChild(notesContainer);
                }


                // Добавляем обработчик кликов
                cellElement.addEventListener('click', () => selectCell(rIdx, cIdx));
                boardElement.appendChild(cellElement);
            });
        });
        updateSelectionHighlight(); // Обновить подсветку после перерендера
        console.log("Board rendered.");
    }

    // Эта функция будет вызываться из killerSolverLogic для обновления одной ячейки
    function renderCell(r, c, value = null, candidates = null) {
        const cellElement = boardElement.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);
        if (!cellElement) return;

        cellElement.textContent = ''; // Очищаем содержимое

        // Удаляем старые заметки
        const existingNotesContainer = cellElement.querySelector('.notes-container');
        if (existingNotesContainer) {
            cellElement.removeChild(existingNotesContainer);
        }

        if (value !== null) { // Если передано значение, это решенная ячейка
            userGrid[r][c].value = value;
            userGrid[r][c].notes.clear(); // Очищаем пользовательские заметки
            userGrid[r][c].isSolved = true;
            cellElement.textContent = value;
            cellElement.classList.remove('user-input', 'error'); // Убираем старые классы
            if (!userGrid[r][c].isGiven) {
                 cellElement.classList.add('user-input');
            } else {
                 cellElement.classList.add('given'); // Если вдруг была не Given, а стала Given (не должно быть)
            }
        } else if (candidates !== null) { // Если переданы кандидаты, это обновление заметок
            userGrid[r][c].notes = candidates; // Обновляем заметки в userGrid (хотя решатель использует currentCandidatesMap)
            // Создаем новый контейнер для заметок
            const notesContainer = document.createElement('div');
            notesContainer.classList.add('notes-container');
            Array.from(candidates).sort((a,b) => a-b).forEach(note => {
                const noteSpan = document.createElement('span');
                noteSpan.classList.add('note');
                noteSpan.textContent = note;
                notesContainer.appendChild(noteSpan);
            });
            cellElement.appendChild(notesContainer);
            // Убеждаемся, что значение в ячейке пусто, если это заметки
            if (userGrid[r][c].value !== 0) {
                 // Эта ветка должна быть недоступна, если ячейка уже заполнена
                 console.warn(`Attempted to render candidates for a filled cell ${getCellId(r,c)}`);
                 cellElement.textContent = userGrid[r][c].value;
            }
        } else { // Если ничего не передано, но ячейка пуста, перерендерим ее (это может случиться)
            if (userGrid[r][c].value === 0) {
                 // Использовать currentCandidatesMap, так как это данные решателя
                 const solverCandidates = currentCandidatesMap[getCellId(r,c)];
                 if (solverCandidates && solverCandidates.size > 0) {
                    const notesContainer = document.createElement('div');
                    notesContainer.classList.add('notes-container');
                    Array.from(solverCandidates).sort((a,b) => a-b).forEach(note => {
                        const noteSpan = document.createElement('span');
                        noteSpan.classList.add('note');
                        noteSpan.textContent = note;
                        notesContainer.appendChild(noteSpan);
                    });
                    cellElement.appendChild(notesContainer);
                 }
            } else {
                 cellElement.textContent = userGrid[r][c].value;
            }
        }
        updateSelectionHighlight(); // Обновить подсветку
    }


    function selectCell(r, c) {
        clearSelection();
        selectedRow = r;
        selectedCol = c;
        selectedCell = boardElement.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);

        if (selectedCell && !(currentMode === 'classic' && userGrid[r][c].isGiven)) {
            selectedCell.classList.add('selected');
            highlightRelatedCells(r, c);
        } else {
            // Если ячейка "given" в классическом режиме, то не выбираем ее
            selectedCell = null;
            selectedRow = -1;
            selectedCol = -1;
        }
    }

    function clearSelection() {
        const allCells = boardElement.querySelectorAll('.cell');
        allCells.forEach(cell => {
            cell.classList.remove('selected', 'highlight', 'highlight-value');
        });
        selectedCell = null;
        selectedRow = -1;
        selectedCol = -1;
    }

    function highlightRelatedCells(r, c) {
        const value = userGrid[r][c].value;
        userGrid.forEach((row, rowIdx) => {
            row.forEach((cell, colIdx) => {
                const cellElement = boardElement.querySelector(`.cell[data-row='${rowIdx}'][data-col='${colIdx}']`);
                if (!cellElement) return;

                // Подсветка строки, столбца и блока
                const inSameRow = (rowIdx === r);
                const inSameCol = (colIdx === c);
                const inSameBlock = (Math.floor(rowIdx / 3) === Math.floor(r / 3) && Math.floor(colIdx / 3) === Math.floor(c / 3));
                const inSameCage = (currentMode === 'killer' && killerSolverData?.cellToCageMap[getCellId(r, c)] === killerSolverData?.cellToCageMap[getCellId(rowIdx, colIdx)]);


                if (inSameRow || inSameCol || inSameBlock || inSameCage) {
                    cellElement.classList.add('highlight');
                }

                // Подсветка ячеек с тем же значением
                if (value !== 0 && cell.value === value) {
                    cellElement.classList.add('highlight-value');
                }
            });
        });
    }

    function handleInput(digit) {
        if (!selectedCell || selectedRow === -1 || selectedCol === -1 || userGrid[selectedRow][selectedCol].isGiven) {
            return;
        }

        const currentCell = userGrid[selectedRow][selectedCol];
        const cellId = getCellId(selectedRow, selectedCol);

        // Сохраняем состояние для "Отмены"
        history.push({
            r: selectedRow,
            c: selectedCol,
            oldValue: currentCell.value,
            newNotes: new Set(currentCell.notes), // Копируем заметки
            oldCandidates: currentCandidatesMap[cellId] ? new Set(currentCandidatesMap[cellId]) : new Set() // Копируем кандидатов решателя
        });

        if (isNoteMode) {
            // Режим заметок: добавляем/удаляем цифру из заметок
            if (currentCell.notes.has(digit)) {
                currentCell.notes.delete(digit);
            } else {
                currentCell.notes.add(digit);
            }
            // Удаляем заметки из currentCandidatesMap, если пользователь сам их меняет
            if (currentCandidatesMap[cellId]) { // Удаляем из карты решателя при ручном изменении
                currentCandidatesMap[cellId].clear(); // Очищаем, чтобы не конфликтовать
            }
            currentCell.value = 0; // Убедиться, что значение пусто
            renderCell(selectedRow, selectedCol, null, currentCell.notes); // Обновляем UI заметок
        } else {
            // Режим ввода: устанавливаем значение
            if (currentCell.value === digit) { // Если та же цифра, очищаем
                currentCell.value = 0;
                currentCell.notes.clear();
                currentCell.isError = false;
                currentCell.isSolved = false;
            } else {
                currentCell.value = digit;
                currentCell.notes.clear(); // Очищаем заметки при вводе значения
                currentCell.isSolved = true; // Отмечаем как решенную (пользователем)
            }
            renderCell(selectedRow, selectedCol, currentCell.value, new Set()); // Обновляем UI значения
            updateBoardState(); // Пересчитать ошибки и кандидатов
        }
        undoButton.disabled = false; // Включаем кнопку отмены
        saveGameState();
        checkGameCompletion();
    }

    function eraseCell() {
        if (!selectedCell || selectedRow === -1 || selectedCol === -1 || userGrid[selectedRow][selectedCol].isGiven) {
            return;
        }

        const currentCell = userGrid[selectedRow][selectedCol];
        const cellId = getCellId(selectedRow, selectedCol);

        history.push({
            r: selectedRow,
            c: selectedCol,
            oldValue: currentCell.value,
            newNotes: new Set(currentCell.notes),
            oldCandidates: currentCandidatesMap[cellId] ? new Set(currentCandidatesMap[cellId]) : new Set()
        });

        currentCell.value = 0;
        currentCell.notes.clear();
        currentCell.isError = false;
        currentCell.isSolved = false; // Сбрасываем статус решения
        renderCell(selectedRow, selectedCol, 0, new Set()); // Обновляем UI, устанавливая значение в 0 и очищая заметки
        updateBoardState();
        undoButton.disabled = false;
        saveGameState();
        checkGameCompletion();
    }

    function toggleNoteMode() {
        isNoteMode = !isNoteMode;
        noteToggleButton.textContent = isNoteMode ? '📝' : '🔢';
        noteToggleButton.title = isNoteMode ? 'Режим заметок (ВКЛ)' : 'Режим ввода (ВЫКЛ)';
        numpad.classList.toggle('note-mode-active', isNoteMode); // Для стилей, если нужно
    }

    function updateBoardState() {
        let hasErrors = false;
        userGrid.forEach((row, rIdx) => {
            row.forEach((cell, cIdx) => {
                cell.isError = false; // Сброс ошибок
                const cellElement = boardElement.querySelector(`.cell[data-row='${rIdx}'][data-col='${cIdx}']`);
                if (cellElement) cellElement.classList.remove('error'); // Сброс визуальных ошибок

                if (cell.value !== 0) {
                    // Проверка на ошибки (дубликаты)
                    // Строка
                    for (let col = 0; col < 9; col++) {
                        if (col !== cIdx && userGrid[rIdx][col].value === cell.value) {
                            cell.isError = true;
                            hasErrors = true;
                            break;
                        }
                    }
                    if (cell.isError) {
                        cellElement.classList.add('error');
                        return; // Если уже есть ошибка в строке, не проверяем дальше
                    }

                    // Столбец
                    for (let row = 0; row < 9; row++) {
                        if (row !== rIdx && userGrid[row][cIdx].value === cell.value) {
                            cell.isError = true;
                            hasErrors = true;
                            break;
                        }
                    }
                    if (cell.isError) {
                        cellElement.classList.add('error');
                        return;
                    }

                    // Блок 3x3
                    const startRow = Math.floor(rIdx / 3) * 3;
                    const startCol = Math.floor(cIdx / 3) * 3;
                    for (let row = 0; row < 3; row++) {
                        for (let col = 0; col < 3; col++) {
                            const currR = startRow + row;
                            const currC = startCol + col;
                            if ((currR !== rIdx || currC !== cIdx) && userGrid[currR][currC].value === cell.value) {
                                cell.isError = true;
                                hasErrors = true;
                                break;
                            }
                        }
                        if (cell.isError) break;
                    }
                    if (cell.isError) {
                        cellElement.classList.add('error');
                        return;
                    }

                    // Killer Sudoku specific: check within cage for duplicates
                    if (currentMode === 'killer' && killerSolverData?.cellToCageMap) {
                        const currentCellId = getCellId(rIdx, cIdx);
                        const cageIndex = killerSolverData.cellToCageMap[currentCellId];
                        if (cageIndex !== undefined) {
                            const cage = killerSolverData.cageDataArray[cageIndex];
                            if (cage) {
                                for (const cageCellId of cage.cells) {
                                    const coords = killerSolverLogic.getCellCoords(cageCellId);
                                    if (coords && (coords.r !== rIdx || coords.c !== cIdx) && userGrid[coords.r][coords.c].value === cell.value) {
                                        cell.isError = true;
                                        hasErrors = true;
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    if (cell.isError) cellElement.classList.add('error');
                }
            });
        });

        // Пересчет и отображение кандидатов (заметок)
        updateAllCandidates();

        if (hasErrors) {
            statusMessageElement.textContent = "Есть ошибки на доске!";
            statusMessageElement.classList.remove('success-msg');
            statusMessageElement.classList.add('incorrect-msg');
        } else {
            statusMessageElement.textContent = ""; // Очищаем сообщение об ошибке
            statusMessageElement.classList.remove('incorrect-msg');
        }
    }

    // НОВАЯ ФУНКЦИЯ: Обновляет currentCandidatesMap и перерисовывает ВСЕ заметки
    function updateAllCandidates() {
        if (currentMode === 'killer') {
            currentCandidatesMap = killerSolverLogic.calculateAllKillerCandidates(userGrid, killerSolverData);
            // Перерисовать все ячейки, чтобы обновить заметки
            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 9; c++) {
                    const cellId = getCellId(r, c);
                    // Только для пустых ячеек обновляем заметки
                    if (userGrid[r][c].value === 0) {
                        renderCell(r, c, null, currentCandidatesMap[cellId]);
                    }
                }
            }
            console.log("All candidates updated and rendered.");
        } else {
            // Для классического судоку можно тоже реализовать пересчёт,
            // но пока оставляем пользовательские заметки
            // currentCandidatesMap = classicSudokuLogic.calculateAllCandidates(userGrid); // Если будет classicSolverLogic
            // renderBoard(); // Перерисовать все ячейки для классики
        }
    }


    function checkGameCompletion() {
        let allCellsFilled = true;
        let hasErrors = false;
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (userGrid[r][c].value === 0) {
                    allCellsFilled = false;
                    break;
                }
                if (userGrid[r][c].isError) {
                    hasErrors = true;
                    break;
                }
            }
            if (!allCellsFilled || hasErrors) break;
        }

        if (allCellsFilled && !hasErrors) {
            stopTimer();
            statusMessageElement.textContent = "Поздравляем! Вы решили судоку!";
            statusMessageElement.classList.remove('incorrect-msg');
            statusMessageElement.classList.add('success-msg');
            disableInput(); // Отключить ввод после решения
            saveGameState();
        } else if (allCellsFilled && hasErrors) {
            statusMessageElement.textContent = "Доска заполнена, но есть ошибки.";
            statusMessageElement.classList.remove('success-msg');
            statusMessageElement.classList.add('incorrect-msg');
        } else {
            statusMessageElement.textContent = "";
            statusMessageElement.classList.remove('success-msg', 'incorrect-msg');
        }
    }

    function isGameSolved() {
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
        if (numpad) numpad.querySelectorAll('button').forEach(button => button.disabled = true);
        if (boardElement) boardElement.querySelectorAll('.cell').forEach(cell => cell.style.pointerEvents = 'none');
        if (hintButton) hintButton.disabled = true;
        if (checkButton) checkButton.disabled = true;
        if (undoButton) undoButton.disabled = true;
        if (logicNextStepButton) logicNextStepButton.disabled = true;
        if (logicSolveButton) logicSolveButton.disabled = true;
    }

    function enableInput() {
        if (numpad) numpad.querySelectorAll('button').forEach(button => button.disabled = false);
        if (boardElement) boardElement.querySelectorAll('.cell').forEach(cell => cell.style.pointerEvents = 'auto');
        if (hintButton) hintButton.disabled = false;
        if (checkButton) checkButton.disabled = false;
        // undoButton состояние зависит от истории
        if (undoButton) undoButton.disabled = history.length === 0;
        updateLogicSolverButtonsState(); // Включить кнопки решателя
    }

    function updateHintsDisplay() {
        if (hintButton) {
            hintButton.textContent = `💡 ${hintsRemaining}/3`;
            hintButton.disabled = hintsRemaining <= 0;
        }
    }

    function applyHint() {
        if (hintsRemaining <= 0 || isGameSolved()) return;

        // Найти первую пустую ячейку
        let hintApplied = false;
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (userGrid[r][c].value === 0) {
                    const correctValue = solutionGrid[r][c].value; // Получаем значение из решения
                    // Прежде чем применять, сохраним текущее состояние для undo
                    history.push({
                        r: r,
                        c: c,
                        oldValue: userGrid[r][c].value,
                        newNotes: new Set(userGrid[r][c].notes),
                        oldCandidates: currentCandidatesMap[getCellId(r,c)] ? new Set(currentCandidatesMap[getCellId(r,c)]) : new Set()
                    });

                    userGrid[r][c].value = correctValue;
                    userGrid[r][c].notes.clear(); // Очищаем заметки при вводе значения
                    userGrid[r][c].isError = false;
                    userGrid[r][c].isSolved = true; // Отмечаем как решенную (подсказкой)
                    
                    // Обновляем отображение ячейки
                    renderCell(r, c, correctValue, new Set());

                    hintsRemaining--;
                    hintApplied = true;
                    statusMessageElement.textContent = ""; // Очищаем сообщение об ошибке
                    break;
                }
            }
            if (hintApplied) break;
        }

        updateHintsDisplay();
        updateBoardState(); // Обновить состояние доски (пересчет ошибок, заметок)
        saveGameState();
        checkGameCompletion();
        if (undoButton) undoButton.disabled = false; // Включаем кнопку отмены
    }


    function undoLastMove() {
        if (history.length === 0) return;

        const lastMove = history.pop();
        const { r, c, oldValue, newNotes, oldCandidates } = lastMove;
        const cellId = getCellId(r, c);

        userGrid[r][c].value = oldValue;
        userGrid[r][c].notes = new Set(newNotes); // Восстанавливаем заметки
        userGrid[r][c].isError = false; // Сбрасываем ошибку
        userGrid[r][c].isSolved = (oldValue !== 0); // Статус решенной

        // Восстанавливаем кандидатов решателя
        currentCandidatesMap[cellId] = new Set(oldCandidates);

        // Перерисовываем ячейку
        if (userGrid[r][c].value !== 0) {
            renderCell(r, c, userGrid[r][c].value, new Set()); // Перерисовать как заполненную
        } else {
            renderCell(r, c, null, userGrid[r][c].notes); // Перерисовать как пустую с заметками
        }

        updateBoardState(); // Пересчитать ошибки и кандидатов для всей доски
        if (undoButton) undoButton.disabled = history.length === 0;
        saveGameState();
        checkGameCompletion();
    }


    function generateNewGame(mode, difficulty) {
        stopTimer();
        clearGameState(); // Очистить предыдущее состояние

        currentMode = mode;
        currentDifficulty = difficulty;

        // 1. Сгенерировать доску
        let puzzleString;
        let fullSolutionString;
        let cages = [];

        if (currentMode === 'classic') {
            const classicPuzzle = sudoku.generate(difficulty);
            puzzleString = classicPuzzle.puzzle;
            fullSolutionString = classicPuzzle.solution;
        } else { // Killer Sudoku
            try {
                const killerBoard = killerSudoku.generateKillerBoard(81, difficulty); // Example call
                puzzleString = killerBoard.grid; // Grid string like "1.34..."
                fullSolutionString = killerBoard.solution;
                cages = killerBoard.cages; // Array of {cells: [], sum: N}
                console.log("Generated Killer Sudoku with cages:", cages);

                // Populate killerSolverData
                killerSolverData = {
                    cageDataArray: cages,
                    cellToCageMap: {} // 'A1': cageIndex
                };
                cages.forEach((cage, index) => {
                    cage.cells.forEach(cellId => {
                        killerSolverData.cellToCageMap[cellId] = index;
                    });
                });

            } catch (e) {
                console.error("Error generating Killer Sudoku:", e);
                alert("Ошибка при генерации Killer Sudoku. Попробуйте еще раз.");
                showScreen('initial-screen');
                return;
            }
        }

        userGrid = Array(9).fill(null).map(() => Array(9).fill(null));
        solutionGrid = Array(9).fill(null).map(() => Array(9).fill(null));

        // Заполняем userGrid и solutionGrid
        let charIndex = 0;
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const puzzleChar = puzzleString[charIndex];
                const solutionChar = fullSolutionString[charIndex];

                const value = (puzzleChar === sudoku.BLANK_CHAR || puzzleChar === killerSudoku.BLANK_CHAR) ? 0 : parseInt(puzzleChar);
                const isGiven = (value !== 0);

                userGrid[r][c] = {
                    value: value,
                    isGiven: isGiven,
                    isError: false,
                    notes: new Set(),
                    isSolved: isGiven // Если задано изначально, считаем решенной
                };
                solutionGrid[r][c] = { value: parseInt(solutionChar) };
                charIndex++;
            }
        }

        // Рендер специфичных для Killer Sudoku элементов (клеток)
        if (currentMode === 'killer') {
            renderKillerCages(cages);
        }

        // Инициализация заметок решателя (currentCandidatesMap)
        updateAllCandidates(); // Это вызовет calculateAllKillerCandidates и перерендерит заметки

        renderBoard(); // Рендерим доску в целом
        startTimer();
        updateHintsDisplay();
        enableInput();
        if (undoButton) undoButton.disabled = true; // В начале игры отмена недоступна
        showScreen('game-container');
        saveGameState();
        console.log(`New ${currentMode} game started with difficulty ${currentDifficulty}.`);
    }

    function renderKillerCages(cages) {
        boardElement.querySelectorAll('.cell').forEach(cellElement => {
            cellElement.classList.remove('cage-border-top', 'cage-border-bottom', 'cage-border-left', 'cage-border-right');
            const cageSumDiv = cellElement.querySelector('.cage-sum');
            if (cageSumDiv) {
                cellElement.removeChild(cageSumDiv);
            }
        });

        cages.forEach(cage => {
            if (cage.cells.length === 0) return;

            // Находим top-left ячейку для отображения суммы
            let minR = 9, minC = 9;
            cage.cells.forEach(cellId => {
                const { r, c } = killerSolverLogic.getCellCoords(cellId);
                if (r < minR) minR = r;
                if (c < minC) minC = c;
            });

            // Находим элемент для top-left ячейки
            const topLeftCellElement = boardElement.querySelector(`.cell[data-row='${minR}'][data-col='${minC}']`);
            if (topLeftCellElement) {
                const cageSumDiv = document.createElement('div');
                cageSumDiv.classList.add('cage-sum');
                cageSumDiv.textContent = cage.sum;
                topLeftCellElement.prepend(cageSumDiv); // Вставляем в начало, чтобы не перекрывать цифру
            }

            // Добавляем границы для каждой ячейки в клетке
            cage.cells.forEach(cellId => {
                const { r, c } = killerSolverLogic.getCellCoords(cellId);
                const currentCellElement = boardElement.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);
                if (!currentCellElement) return;

                // Проверяем соседей, чтобы определить, где нужна граница
                const neighbors = [
                    { dr: -1, dc: 0, class: 'cage-border-top' }, // top
                    { dr: 1, dc: 0, class: 'cage-border-bottom' }, // bottom
                    { dr: 0, dc: -1, class: 'cage-border-left' }, // left
                    { dr: 0, dc: 1, class: 'cage-border-right' }  // right
                ];

                neighbors.forEach(n => {
                    const neighborR = r + n.dr;
                    const neighborC = c + n.dc;
                    const neighborId = killerSolverLogic.getCellId(neighborR, neighborC);

                    // Если соседа нет, или сосед не в этой же клетке, добавляем границу
                    // Проверка на null neighborId для граничных ячеек
                    if (!neighborId || killerSolverData.cellToCageMap[neighborId] !== killerSolverData.cellToCageMap[cellId]) {
                        currentCellElement.classList.add(n.class);
                    }
                });
            });
        });
    }

    function showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        const targetScreen = typeof screenId === 'string' ? document.getElementById(screenId) : screenId; // Обработка как ID, так и элемента
        if (targetScreen) {
            targetScreen.classList.add('active');
        }
    }

    function updateLogicSolverButtonsState() {
        const isKillerMode = currentMode === 'killer';
        if (logicNextStepButton) logicNextStepButton.style.display = isKillerMode ? 'block' : 'none';
        if (logicSolveButton) logicSolveButton.style.display = isKillerMode ? 'block' : 'none';

        if (isKillerMode && !isGameSolved()) {
            if (logicNextStepButton) logicNextStepButton.disabled = false;
            if (logicSolveButton) logicSolveButton.disabled = false;
        } else {
            if (logicNextStepButton) logicNextStepButton.disabled = true;
            if (logicSolveButton) logicSolveButton.disabled = true;
        }
    }


    // --- Обработчики событий решателя ---
    if (logicNextStepButton) { // Проверяем существование кнопки перед добавлением слушателя
        logicNextStepButton.addEventListener('click', () => {
            if (currentMode !== 'killer' || isGameSolved()) return;

            // Пересчитать кандидатов перед поиском шага (это важно, чтобы логика работала с актуальными данными)
            updateAllCandidates(); // Это обновит currentCandidatesMap

            const stepApplied = killerSolverLogic.doKillerLogicStep(
                userGrid,
                currentCandidatesMap, // Передаем ссылку на текущую карту кандидатов
                killerSolverData,
                updateAllCandidates, // Колбэк для полного пересчёта и ререндера кандидатов
                renderCell             // Колбэк для обновления одной ячейки (значение или заметки)
            );

            if (stepApplied) {
                statusMessageElement.textContent = `Применена техника: ${stepApplied.appliedTechnique}!`;
                statusMessageElement.classList.remove('incorrect-msg');
                statusMessageElement.classList.add('success-msg');
                // updateAllCandidates() уже вызвана внутри doKillerLogicStep
                // renderBoard() вызывается при updateAllCandidates
                updateBoardState(); // Обновление ошибок, т.к. значение могло быть проставлено
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

    if (logicSolveButton) { // Проверяем существование кнопки перед добавлением слушателя
        logicSolveButton.addEventListener('click', () => {
            if (currentMode !== 'killer' || isGameSolved()) return;

            let stepsCount = 0;
            let maxIterations = 200; // Ограничение на количество шагов, чтобы избежать бесконечного цикла
            let somethingAppliedInIteration;

            do {
                somethingAppliedInIteration = false;
                updateAllCandidates(); // Всегда пересчитываем кандидатов перед поиском нового шага
                const stepApplied = killerSolverLogic.doKillerLogicStep(
                    userGrid,
                    currentCandidatesMap,
                    killerSolverData,
                    updateAllCandidates,
                    renderCell
                );

                if (stepApplied) {
                    stepsCount++;
                    somethingAppliedInIteration = true;
                    // updateAllCandidates() и renderCell() уже вызваны внутри doKillerLogicStep
                    updateBoardState(); // Обновление ошибок
                }

                maxIterations--;
            } while (somethingAppliedInIteration && !isGameSolved() && maxIterations > 0);

            if (isGameSolved()) {
                statusMessageElement.textContent = `Головоломка решена за ${stepsCount} логических шагов!`;
                statusMessageElement.classList.remove('incorrect-msg');
                statusMessageElement.classList.add('success-msg');
            } else if (stepsCount > 0) {
                statusMessageElement.textContent = `Применено ${stepsCount} логических шагов. Дальнейшие шаги не найдены или требуется более сложная логика.`;
                statusMessageElement.classList.remove('success-msg');
                statusMessageElement.classList.add('incorrect-msg');
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
        if (startNewGameButton) startNewGameButton.addEventListener('click', () => showScreen('new-game-options'));
        if (continueGameButton) {
            continueGameButton.addEventListener('click', () => {
                if (loadGameState()) {
                    showScreen('game-container');
                } else {
                    alert("Не удалось загрузить сохраненную игру.");
                }
            });
        }

        document.querySelectorAll('#game-mode-selection .mode-button').forEach(button => {
            button.addEventListener('click', (e) => {
                document.querySelectorAll('#game-mode-selection .mode-button').forEach(btn => btn.classList.remove('selected'));
                e.target.classList.add('selected');
                currentMode = e.target.dataset.mode;
                const killerSolverControls = document.getElementById('killer-solver-controls');
                if (killerSolverControls) {
                    killerSolverControls.style.display = (currentMode === 'killer' ? 'block' : 'none');
                }
            });
        });

        if (difficultyButtonsContainer) {
            difficultyButtonsContainer.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON') {
                    document.querySelectorAll('.difficulty-selection button').forEach(btn => btn.classList.remove('selected'));
                    e.target.classList.add('selected');
                    currentDifficulty = e.target.dataset.difficulty;
                }
            });
        }

        const generateGameButton = document.getElementById('generate-game-button');
        if (generateGameButton) {
            generateGameButton.addEventListener('click', () => {
                // Убедитесь, что выбран режим и сложность
                const selectedModeButton = document.querySelector('#game-mode-selection .mode-button.selected');
                const selectedDifficultyButton = document.querySelector('.difficulty-selection button.selected');

                if (!selectedModeButton || !selectedDifficultyButton) {
                    alert('Пожалуйста, выберите режим и сложность.');
                    return;
                }
                generateNewGame(selectedModeButton.dataset.mode, selectedDifficultyButton.dataset.difficulty);
            });
        }

        if (backToInitialButton) backToInitialButton.addEventListener('click', () => showScreen('initial-screen'));
        if (exitGameButton) {
            exitGameButton.addEventListener('click', () => {
                // Возможно, запрос на подтверждение сохранения или очистки
                if (confirm("Вы уверены, что хотите выйти? Прогресс будет сохранен.")) {
                    saveGameState(); // Сохраняем перед выходом
                    showScreen('initial-screen');
                    stopTimer();
                    clearSelection();
                }
            });
        }

        if (numpad) {
            numpad.querySelectorAll('button[data-num]').forEach(button => {
                button.addEventListener('click', (e) => handleInput(parseInt(e.target.dataset.num)));
            });
        }
        
        if (eraseButton) eraseButton.addEventListener('click', eraseCell); // <--- Теперь eraseButton определен и используется
        if (noteToggleButton) noteToggleButton.addEventListener('click', toggleNoteMode);
        if (checkButton) checkButton.addEventListener('click', updateBoardState); // Просто перепроверить ошибки
        if (hintButton) hintButton.addEventListener('click', applyHint);
        if (undoButton) undoButton.addEventListener('click', undoLastMove);

        // Обработка клавиш клавиатуры
        document.addEventListener('keydown', (e) => {
            if (gameContainer && gameContainer.classList.contains('active') && selectedCell) {
                const digit = parseInt(e.key);
                if (digit >= 1 && digit <= 9) {
                    handleInput(digit);
                    return; // Предотвратить дальнейшую обработку, чтобы не сбрасывать выделение
                } else if (e.key === 'Backspace' || e.key === 'Delete') {
                    eraseCell();
                    return;
                } else if (e.key === ' ' || e.key === 'Enter') { // Space or Enter for toggling notes
                    toggleNoteMode();
                    e.preventDefault(); // Предотвратить прокрутку для пробела
                    return;
                }
            }

            // Навигация по доске стрелками
            if (gameContainer && gameContainer.classList.contains('active') && selectedRow !== -1 && selectedCol !== -1) {
                let newR = selectedRow;
                let newC = selectedCol;
                let moved = false;

                if (e.key === 'ArrowUp') { newR--; moved = true; }
                else if (e.key === 'ArrowDown') { newR++; moved = true; }
                else if (e.key === 'ArrowLeft') { newC--; moved = true; }
                else if (e.key === 'ArrowRight') { newC++; moved = true; }

                if (moved) {
                    e.preventDefault(); // Предотвратить прокрутку страницы
                    newR = Math.max(0, Math.min(8, newR));
                    newC = Math.max(0, Math.min(8, newC));
                    selectCell(newR, newC);
                }
            }

            // Горячие клавиши для отмены (Ctrl+Z или Cmd+Z)
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                undoLastMove();
                e.preventDefault();
            }

            // Горячие клавиши для "Next Step" (Ctrl+N или Cmd+N)
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                if (logicNextStepButton && currentMode === 'killer' && !logicNextStepButton.disabled) {
                    logicNextStepButton.click();
                }
                e.preventDefault();
            }
            // Горячие клавиши для "Solve" (Ctrl+S или Cmd+S)
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                if (logicSolveButton && currentMode === 'killer' && !logicSolveButton.disabled) {
                    logicSolveButton.click();
                }
                e.preventDefault();
            }
        });


        console.log("Event listeners added.");
    }


    // --- Инициализация Приложения ---
    function initializeApp(){
        console.log("Init app...");
        try{
            loadThemePreference();
            checkContinueButton();
            addEventListeners();
            showScreen(initialScreen); // Показать начальный экран
            // initializeAds(); // Если есть функция инициализации рекламы
            try{
                if(window.Telegram?.WebApp) Telegram.WebApp.ready();
                else console.log("TG SDK not found.");
            }catch(e){
                console.error("TG SDK Err:",e);
            }
        }catch(e){
            console.error("CRITICAL INIT ERR:",e);
            document.body.innerHTML=`<div style='padding:20px;color:red;'><h1>Ошибка!</h1><p>${e.message}</p><pre>${e.stack}</pre></div>`;
        }
    }
    function checkContinueButton(){
        if(!continueGameButton) return;
        try{
            const s = localStorage.getItem('sudokuGameState'); // Изменено с loadGameState() на localStorage.getItem()
            continueGameButton.disabled = !s;
            console.log(`Continue btn state:${!continueGameButton.disabled}`);
        }catch(e){
            console.error("Err check cont:",e);
            continueGameButton.disabled = true;
        }
    }

    // --- Theme Toggling ---
    const themeStylesheet = document.getElementById('theme-stylesheet'); // Эта переменная не используется, можно удалить или использовать
    const THEME_KEY = 'sudokuTheme';

    function loadThemePreference() {
        const savedTheme = localStorage.getItem(THEME_KEY);
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-theme');
            if (themeToggleCheckbox) {
                themeToggleCheckbox.checked = true;
            }
        } else {
            document.body.classList.remove('dark-theme');
            if (themeToggleCheckbox) {
                themeToggleCheckbox.checked = false;
            }
        }
    }

    if (themeToggleCheckbox) {
        themeToggleCheckbox.addEventListener('change', () => {
            if (themeToggleCheckbox.checked) {
                document.body.classList.add('dark-theme');
                localStorage.setItem(THEME_KEY, 'dark');
            } else {
                document.body.classList.remove('dark-theme');
                localStorage.setItem(THEME_KEY, 'light');
            }
        });
    }

    // --- Запуск ---
    initializeApp();

}); // Конец 'DOMContentLoaded'
