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
    const eraseButton = document.getElementById('erase-button'); // <--- ДОБАВЛЕНО!
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
            timerElement.textContent = `<span class="math-inline">\{minutes\}\:</span>{seconds}`;
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
                if (cell.value === 0 && currentCandidatesMap[cell.id]?.size > 0) {
                    // Создаем контейнер для заметок
                    const notesContainer = document.createElement('div');
                    notesContainer.classList.add('notes-container');

                    const notes = Array.from(currentCandidatesMap[cell.id]).sort((a,b) => a-b);
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
        const cellElement = boardElement.querySelector(`.cell[data-row='<span class="math-inline">\{r\}'\]\[data\-col\='</span>{c}']`);
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
        selectedCell = boardElement.querySelector(`.cell[data-row='<span class="math-inline">\{r\}'\]\[data\-col\='</span>{c}']`);

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
                const cellElement = boardElement.querySelector(`.cell[data-row='<span class="math-inline">\{rowIdx\}'\]\[data\-col\='</span>{colIdx}']`);
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
            if (currentCandidatesMap[cellId]) {
                currentCandidatesMap[cellId].delete(digit);
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
                const cellElement = boardElement.querySelector(`.cell[data-row='<span class="math-inline">\{rIdx\}'\]\[data\-col\='</span>{cIdx}']`);
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
        numpad.querySelectorAll('button').forEach(button => button.disabled = true);
        boardElement.querySelectorAll('.cell').forEach(cell => cell.style.pointerEvents = 'none');
        hintButton.disabled = true;
        checkButton.disabled = true;
        undoButton.disabled = true;
        logicNextStepButton.disabled = true;
        logicSolveButton.disabled = true;
    }

    function enableInput() {
        numpad.querySelectorAll('button').forEach(button => button.disabled = false);
        boardElement.querySelectorAll('.cell').forEach(cell => cell.style.pointerEvents = 'auto');
        hintButton.disabled = false;
        checkButton.disabled = false;
        // undoButton состояние зависит от истории
        undoButton.disabled = history.length === 0;
        updateLogicSolverButtonsState(); // Включить кнопки решателя
    }

    function updateHintsDisplay() {
        hintButton.textContent = `💡 ${hintsRemaining}/3`;
        hintButton.disabled = hintsRemaining <= 0;
    }

    function applyHint() {
        if (hintsRemaining <= 0 || isGameSolved()) return;

        // Найти первую пустую ячейку
        let hintApplied = false;
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (userGrid[r][c].value === 0) {
                    const correctValue = solutionGrid[r][c].value; // Получаем значение из решения
                    handleInput(correctValue); // Используем handleInput для применения (сохранит в историю)
                    userGrid[r][c].isGiven = true; // Помечаем как "given" (пользователь не может изменить)
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
        undoButton.disabled = history.length === 0;
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
            // Killer Sudoku generator is more complex.
            // For now, we'll use a placeholder or a simple generation
            // if killerSudoku.js doesn't have a fully robust generator.
            // Assuming killerSudoku.generateKillerBoard exists and returns {grid, cages, solution}
            try {
                // You might need to adjust difficulty for killerSudoku.generate
                const killerBoard = killerSudoku.generateKillerBoard(81, difficulty); // Example call
                puzzleString = killerBoard.grid; // Grid string like "1.34..."
                fullSolutionString = killerBoard.solution;
                cages = killerBoard.cages; // Array of {cells: [], sum: N}
                console.log("Generated Killer Sudoku with cages:", cages);

                // Populate killerSolverData
                killerSolverData = {
                    cageDataArray: cages,
                    cellTo
