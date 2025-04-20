// Убедитесь, что файлы sudoku.js и killerSudoku.js подключены в index.html ПЕРЕД этим скриптом.

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed.");

    // --- Получение ссылок на ЭКРАНЫ и основные кнопки ---
    const initialScreen = document.getElementById('initial-screen');
    const newGameOptionsScreen = document.getElementById('new-game-options');
    const gameContainer = document.getElementById('game-container');
    const startNewGameButton = document.getElementById('start-new-game-button');
    const continueGameButton = document.getElementById('continue-game-button');
    // --- Новое: Контейнер выбора режима ---
    const gameModeSelectionContainer = document.getElementById('game-mode-selection'); // <<< ДОБАВИТЬ В HTML
    // ---
    const difficultyButtonsContainer = newGameOptionsScreen.querySelector('.difficulty-selection');
    const themeToggleCheckbox = document.getElementById('theme-toggle-checkbox');
    const backToInitialButton = document.getElementById('back-to-initial-button');
    const exitGameButton = document.getElementById('exit-game-button');

    // --- Получение ссылок на элементы ИГРОВОГО ЭКРАНА ---
    const boardElement = document.getElementById('sudoku-board');
    const checkButton = document.getElementById('check-button');
    const hintButton = document.getElementById('hint-button');
    const undoButton = document.getElementById('undo-button');
    const statusMessageElement = document.getElementById('status-message');
    const numpad = document.getElementById('numpad');
    const noteToggleButton = document.getElementById('note-toggle-button');
    const timerElement = document.getElementById('timer');

    // --- Ключи для localStorage ---
    const SAVE_KEY = 'sudokuGameState';
    const THEME_KEY = 'sudokuThemePreference';

    // --- Переменные состояния игры ---
    let currentMode = "classic"; // "classic" or "killer"
    let currentDifficulty = 'medium'; // Сложность для классики/параметры для killer
    let currentPuzzle = null; // Строка для классики
    let currentSolution = null; // Строка для классики
    let currentCageData = null; // Объект { cages: [...] } для killer
    let currentSolverData = null; // Объект { cellToCageMap, cageDataArray } для killer
    let userGrid = []; // Массив объектов { value: number, notes: Set<number> }
    let selectedCell = null; let selectedRow = -1; let selectedCol = -1;
    let isNoteMode = false; let timerInterval = null; let secondsElapsed = 0;
    let historyStack = [];

    // --- Переменные для подсказок ---
    const MAX_HINTS = 3;
    const HINTS_REWARD = 1;
    let hintsRemaining = MAX_HINTS;

    // === ПЛЕЙСХОЛДЕРЫ ДЛЯ SDK РЕКЛАМЫ ===
    // ... (без изменений) ...
    let isAdReady = false; let isShowingAd = false;
    function initializeAds() { console.log("ADS Init..."); setTimeout(() => { preloadRewardedAd(); }, 2000); }
    function preloadRewardedAd() { if (isAdReady || isShowingAd) return; console.log("ADS Load..."); isAdReady = false; setTimeout(() => { if (!isShowingAd) { isAdReady = true; console.log("ADS Ready."); } else { console.log("ADS Load aborted (showing)."); } }, 3000 + Math.random() * 2000); }
    function showRewardedAd(callbacks) { if (!isAdReady || isShowingAd) { console.log("ADS Not ready/Showing."); if (callbacks.onError) callbacks.onError("Реклама не готова."); preloadRewardedAd(); return; } console.log("ADS Show..."); isShowingAd = true; isAdReady = false; if(statusMessageElement) { statusMessageElement.textContent = "Показ рекламы..."; statusMessageElement.className = ''; } document.body.style.pointerEvents = 'none'; setTimeout(() => { const success = Math.random() > 0.2; document.body.style.pointerEvents = 'auto'; if(statusMessageElement) statusMessageElement.textContent = ""; isShowingAd = false; console.log("ADS Show End."); if (success) { console.log("ADS Success!"); if (callbacks.onSuccess) callbacks.onSuccess(); } else { console.log("ADS Error/Skip."); if (callbacks.onError) callbacks.onError("Реклама не загружена / пропущена."); } preloadRewardedAd(); }, 5000); }


    // --- Функции Управления Экранами ---
    // ... (без изменений) ...
    function showScreen(screenToShow) {
        [initialScreen, newGameOptionsScreen, gameContainer].forEach(screen => {
            if (screen) screen.classList.remove('visible');
            else console.warn("A screen element was not found during showScreen iteration.");
        });
        if (screenToShow) {
            screenToShow.classList.add('visible');
            console.log(`Screen shown: #${screenToShow.id}`);
        } else {
            console.error("showScreen: screenToShow is null or undefined!");
            if (initialScreen) { initialScreen.classList.add('visible'); console.log("Fallback: Showing initial screen."); }
            else { document.body.innerHTML = '<p style="color: red; font-size: 20px;">Critical Error: Cannot display any screen.</p>'; }
        }
    }


    // --- Функции Темы ---
    // ... (без изменений) ...
    function applyTheme(theme) { /* ... */ }
    function loadThemePreference() { /* ... */ }
    function handleThemeToggle() { /* ... */ }
    // (Полные функции из предыдущих ответов)
    function applyTheme(theme) {
        const isDark = theme === 'dark';
        document.body.classList.toggle('dark-theme', isDark);
        if (themeToggleCheckbox) {
            themeToggleCheckbox.checked = isDark;
        } else { console.warn("Theme toggle checkbox not found."); }
        console.log(`Theme applied: ${theme}`);
        // TG Integration omitted for brevity
    }
    function loadThemePreference() { try { const savedTheme = localStorage.getItem(THEME_KEY); applyTheme(savedTheme || 'light'); } catch (e) { console.error("Err loading theme:", e); applyTheme('light'); } }
    function handleThemeToggle() { if (!themeToggleCheckbox) { console.error("Theme checkbox missing."); return; } const newTheme = themeToggleCheckbox.checked ? 'dark' : 'light'; applyTheme(newTheme); try { localStorage.setItem(THEME_KEY, newTheme); console.log(`Theme saved: ${newTheme}`); } catch (e) { console.error("Err saving theme:", e); } }


    // --- Инициализация ИГРЫ ---
    function initGame(mode = "classic", difficultyOrState, restoreState = null) {
        console.log(`InitGame called: mode=${mode}, difficulty/state=${difficultyOrState}, restore=${!!restoreState}`);
        // --- Проверка зависимостей ---
        if (mode === "classic" && (typeof sudoku === 'undefined' || !sudoku.generate || !sudoku.solve)) {
            console.error("Classic Sudoku library (sudoku.js) not loaded properly!");
            showError("Ошибка загрузки: Классический режим недоступен.");
            return;
        }
        if (mode === "killer" && (typeof killerSudoku === 'undefined' || !killerSudoku.generate || !killerSudoku.solve || !killerSudoku._initializeSolverData)) {
             console.error("Killer Sudoku library (killerSudoku.js) not loaded properly!");
             showError("Ошибка загрузки: Killer режим недоступен.");
            return;
        }
         // --- Проверка базовых элементов ---
        if (!boardElement || !statusMessageElement || !timerElement || !hintButton || !undoButton || !noteToggleButton) {
             console.error("Cannot initialize game: Essential game elements missing!");
             showError("Критическая ошибка: Отсутствуют элементы игры.");
             return;
        }

        currentMode = mode;
        stopTimer(); // Stop previous timer & save if running
        historyStack = [];
        updateUndoButtonState();
        isNoteMode = false;
        updateNoteToggleButtonState();
        clearSelection();
        clearErrors();
        statusMessageElement.textContent = ''; statusMessageElement.className = '';
        currentPuzzle = null;
        currentSolution = null;
        currentCageData = null;
        currentSolverData = null;
        userGrid = []; // Reset user grid

        // --- Загрузка или Генерация ---
        if (restoreState) {
            // --- Восстановление состояния ---
            console.log("Attempting to restore game state...");
            try {
                currentMode = restoreState.mode || "classic"; // Restore mode!
                currentDifficulty = restoreState.difficulty || 'medium';
                secondsElapsed = restoreState.time || 0;
                hintsRemaining = restoreState.hints !== undefined ? restoreState.hints : MAX_HINTS;
                userGrid = restoreState.grid.map(row =>
                    row.map(cell => ({
                        value: cell.value,
                        notes: new Set(cell.notesArray || [])
                    }))
                );

                if (currentMode === "classic") {
                    currentPuzzle = restoreState.puzzle;
                    currentSolution = restoreState.solution;
                    if (!currentPuzzle || !currentSolution || userGrid.length !== 9) throw new Error("Invalid classic save data.");
                } else if (currentMode === "killer") {
                    currentCageData = restoreState.cageData; // Restore cage definitions
                    if (!currentCageData || !Array.isArray(currentCageData.cages)) throw new Error("Invalid killer save data (missing cages).");
                    // Re-initialize solver data from restored cages
                    const solverInitResult = killerSudoku._initializeSolverData(currentCageData.cages);
                    if (!solverInitResult) throw new Error("Failed to re-initialize solver data from saved cages.");
                    currentSolverData = solverInitResult;
                     // For killer, the "solution" isn't stored directly, it's derived
                     // We might need to solve it here if needed for hints etc., or solve on demand.
                } else {
                    throw new Error("Unknown game mode in saved state: " + currentMode);
                }
                console.log("Game state restored successfully.");

            } catch (error) {
                console.error("Error restoring game state:", error);
                showError("Ошибка загрузки сохранения. Начинаем новую игру.");
                clearSavedGameState();
                 // Fallback: Start new game with default settings
                return initGame("classic", "medium"); // Or redirect to selection
            }
        } else {
            // --- Генерация новой игры ---
            currentDifficulty = difficultyOrState; // This is the difficulty string/level
            secondsElapsed = 0;
            hintsRemaining = MAX_HINTS;

            if (currentMode === "classic") {
                console.log(`Generating new CLASSIC game: difficulty=${currentDifficulty}...`);
                try {
                    currentPuzzle = sudoku.generate(currentDifficulty);
                    if (!currentPuzzle) throw new Error("Failed to generate classic puzzle.");
                    currentSolution = sudoku.solve(currentPuzzle);
                    if (!currentSolution) throw new Error("Failed to solve generated classic puzzle.");
                    userGrid = boardStringToObjectArray(currentPuzzle); // Initialize grid with givens
                    clearSavedGameState(); // Clear old save for new game
                    console.log("New classic game generated.");
                } catch (error) {
                    console.error("Error generating classic game:", error);
                    showError(`Ошибка генерации (Классика): ${error.message}`);
                    return; // Stop initialization
                }
            } else if (currentMode === "killer") {
                console.log(`Generating new KILLER game: difficulty=${currentDifficulty}...`);
                try {
                    // Difficulty for killer might be just a string for now
                    const generatedPuzzle = killerSudoku.generate(currentDifficulty);
                    if (!generatedPuzzle || !generatedPuzzle.cages) {
                        throw new Error("Killer generator failed to return valid cage data.");
                    }
                    currentCageData = generatedPuzzle; // Store { cages: [...] }
                    const solverInitResult = killerSudoku._initializeSolverData(currentCageData.cages);
                     if (!solverInitResult) {
                         throw new Error("Generated killer puzzle cages failed validation/initialization.");
                     }
                    currentSolverData = solverInitResult;
                    userGrid = boardStringToObjectArray(killerSudoku.BLANK_BOARD); // Killer starts empty
                    clearSavedGameState();
                    console.log("New killer game generated.");
                } catch (error) {
                    console.error("Error generating killer game:", error);
                     showError(`Ошибка генерации (Killer): ${error.message}`);
                    return; // Stop initialization
                }
            }
        }

        // --- Пост-инициализация и Показ ---
        renderBoard(); // Render based on currentMode, userGrid, cageData etc.
        updateHintButtonState(); // Update hint button (disable for killer?)
        updateUndoButtonState();
        updateTimerDisplay();

        showScreen(gameContainer);
        setTimeout(() => { startTimer(); }, 50); // Start timer AFTER screen is visible

        console.log("Game initialization complete.");
    }


    // --- Функции сохранения/загрузки состояния ---
    function saveGameState() {
        if (!userGrid || userGrid.length !== 9) {
             console.warn("Cannot save game state: Invalid grid data.");
             return;
        }
        console.log(`Saving game state (Mode: ${currentMode})`);
        try {
            const serializableGrid = userGrid.map(row =>
                 row.map(cell => ({
                     value: cell.value,
                     notesArray: Array.from(cell.notes || [])
                 }))
            );
            const gameState = {
                mode: currentMode, // <-- Save mode
                difficulty: currentDifficulty,
                grid: serializableGrid,
                time: secondsElapsed,
                hints: hintsRemaining,
                timestamp: Date.now(),
                // --- Mode-specific data ---
                puzzle: currentMode === 'classic' ? currentPuzzle : null,
                solution: currentMode === 'classic' ? currentSolution : null,
                cageData: currentMode === 'killer' ? currentCageData : null // <-- Save cages
            };
            localStorage.setItem(SAVE_KEY, JSON.stringify(gameState));
            // console.log("Game state saved."); // Less frequent logging
        } catch (error) {
             console.error("Save Game State Error:", error);
             showError("Ошибка сохранения игры!");
        }
    }
    function loadGameState() {
         const savedData = localStorage.getItem(SAVE_KEY);
         if (!savedData) { console.log("No saved game found."); return null;}
         try {
             const gameState = JSON.parse(savedData);
             // Validate essential fields + mode-specific fields
             if (gameState && typeof gameState === 'object' &&
                 gameState.mode && gameState.difficulty && Array.isArray(gameState.grid) &&
                 typeof gameState.timestamp === 'number' &&
                 (gameState.mode === 'classic' ? (gameState.puzzle && gameState.solution) : true) &&
                 (gameState.mode === 'killer' ? (gameState.cageData && gameState.cageData.cages) : true)
                )
             {
                 console.log("Saved game found:", new Date(gameState.timestamp).toLocaleString(), `Mode: ${gameState.mode}`, "Difficulty:", gameState.difficulty);
                 return gameState; // Valid state
             } else {
                 console.warn("Invalid save data structure found. Clearing.", gameState);
                 clearSavedGameState();
                 return null;
             }
         } catch (error) {
             console.error("Error parsing saved game state:", error);
             clearSavedGameState();
             return null;
         }
    }
    function clearSavedGameState() { /* ... (as before) ... */ try{localStorage.removeItem(SAVE_KEY); console.log("Saved game state cleared."); checkContinueButton();}catch(e){console.error("Err clr save:",e);} }


    // --- Функции для Undo ---
    function createHistoryState() {
        if (!userGrid || userGrid.length !== 9) return null;
        // Only need to save grid and hints, as puzzle definition (cages/puzzle string) doesn't change mid-game
        const gridCopy = userGrid.map(row => row.map(cell => ({ value: cell.value, notes: new Set(cell.notes || []) })));
        return { grid: gridCopy, hints: hintsRemaining };
    }
    function pushHistoryState() { /* ... (as before) ... */ const stateToPush=createHistoryState();if(stateToPush){historyStack.push(stateToPush);updateUndoButtonState();}else{console.warn("Inv hist push");}}
    function handleUndo() {
        if (historyStack.length === 0 || isShowingAd) return;
        stopTimer();
        const previousState = historyStack.pop();
        console.log("Undo action triggered...");
        try {
            userGrid = previousState.grid; // Restore grid
            hintsRemaining = previousState.hints; // Restore hints

            renderBoard(); // Re-render the board (handles both modes)
            clearSelection();
            clearErrors();
            updateHintButtonState();
            updateUndoButtonState();
            saveGameState();
            console.log("Undo successful.");
        } catch(error) {
            console.error("Undo Err:", error);
            showError("Ошибка отмены хода!");
            historyStack = []; // Clear stack on error
            updateUndoButtonState();
        } finally {
            resumeTimerIfNeeded();
        }
    }
    function updateUndoButtonState() { /* ... (as before) ... */ if(undoButton){undoButton.disabled = historyStack.length === 0;} }


    // --- Функции для таймера ---
    // ... (без изменений, start/stop/update/resume) ...
     function startTimer() { const isVisible = gameContainer && gameContainer.classList.contains('visible'); if (timerInterval || !isVisible) { return; } console.log("Starting timer..."); updateTimerDisplay(); timerInterval = setInterval(() => { secondsElapsed++; updateTimerDisplay(); if (secondsElapsed % 10 === 0) { saveGameState(); } }, 1000); }
     function stopTimer() { if (timerInterval) { clearInterval(timerInterval); const oldId = timerInterval; timerInterval = null; console.log(`Timer stopped (was ${oldId}). Saving state.`); saveGameState(); } }
     function updateTimerDisplay() { if (!timerElement) return; const mins = Math.floor(secondsElapsed / 60); const secs = secondsElapsed % 60; timerElement.textContent = `Время: ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`; }
     function resumeTimerIfNeeded() { const solved = isGameSolved(); const visible = gameContainer && gameContainer.classList.contains('visible'); console.log(`resumeTimerIfNeeded: solved=${solved}, visible=${visible}`); if (visible && !solved) startTimer(); else stopTimer(); }


    // --- Преобразование строки/сетки ---
    // ... (boardStringToObjectArray без изменений) ...
     function boardStringToObjectArray(boardString) { if (!boardString || typeof boardString !== 'string') return []; const grid = []; for (let r = 0; r < 9; r++) { grid[r] = []; for (let c = 0; c < 9; c++) { const index = r * 9 + c; if (index >= boardString.length) { grid[r][c] = { value: 0, notes: new Set() }; continue; } const char = boardString[index]; const value = (char === '.' || char === '0' || !killerSudoku.DIGITS.includes(char)) ? 0 : parseInt(char); grid[r][c] = { value: value, notes: new Set() }; } } return grid; }


    // --- Отрисовка ---
    function renderBoard() {
        console.log(`Rendering board for mode: ${currentMode}`);
        if (!boardElement) { console.error("renderBoard: boardElement not found!"); return; }
        boardElement.innerHTML = ''; // Clear previous board

        if (!userGrid || userGrid.length !== 9) {
            boardElement.innerHTML = '<p>Ошибка данных сетки для отрисовки</p>'; return;
        }

        // 1. Render all cells first
        const cellElements = {}; // Store created cell elements for later access
        for (let r = 0; r < 9; r++) {
            if (!userGrid[r] || userGrid[r].length !== 9) continue;
            for (let c = 0; c < 9; c++) {
                const cellId = killerSudoku.SQUARES[r * 9 + c]; // Get "A1", "B2" etc.
                if (!cellId) continue;
                const cellElement = createCellElement(r, c);
                boardElement.appendChild(cellElement);
                cellElements[cellId] = cellElement; // Store reference
            }
        }

        // 2. If Killer mode, add cage visualization
        if (currentMode === "killer" && currentSolverData && currentSolverData.cageDataArray) {
             console.log("Rendering Killer Cages...");
            currentSolverData.cageDataArray.forEach((cage, cageIndex) => {
                if (!cage || !Array.isArray(cage.cells)) return;

                // Find anchor cell (top-most, then left-most)
                let anchorCellId = null;
                let minRow = 9, minCol = 9;
                cage.cells.forEach(cellId => {
                    const cellCoords = getCellCoords(cellId); // Helper needed
                    if (cellCoords) {
                        if (cellCoords.r < minRow) {
                            minRow = cellCoords.r;
                            minCol = cellCoords.c;
                            anchorCellId = cellId;
                        } else if (cellCoords.r === minRow && cellCoords.c < minCol) {
                            minCol = cellCoords.c;
                            anchorCellId = cellId;
                        }
                    }
                });

                // Add sum to the anchor cell
                if (anchorCellId && cellElements[anchorCellId]) {
                    cellElements[anchorCellId].classList.add('cage-sum-anchor');
                    const sumSpan = document.createElement('span');
                    sumSpan.className = 'cage-sum';
                    sumSpan.textContent = cage.sum;
                    cellElements[anchorCellId].appendChild(sumSpan);
                } else if (cage.cells.length > 0) {
                    console.warn(`Could not find anchor cell for cage ${cageIndex}:`, cage.cells);
                }

                // Add inner border classes
                const cageCellSet = new Set(cage.cells); // For fast lookup
                cage.cells.forEach(cellId => {
                    const cellElement = cellElements[cellId];
                    if (!cellElement) return;

                    cellElement.classList.add('cage-cell');
                    const { r, c } = getCellCoords(cellId);

                    // Check neighbors
                    const neighbors = getNeighbors(r, c);

                    // Check RIGHT neighbor
                    if (neighbors.right && cageCellSet.has(neighbors.right)) {
                        cellElement.classList.add('cage-inner-border-right');
                    }
                    // Check BOTTOM neighbor
                    if (neighbors.bottom && cageCellSet.has(neighbors.bottom)) {
                        cellElement.classList.add('cage-inner-border-bottom');
                    }
                    // Check LEFT neighbor (add border to the *left* cell)
                    if (neighbors.left && cageCellSet.has(neighbors.left) && cellElements[neighbors.left]) {
                         cellElements[neighbors.left].classList.add('cage-inner-border-right');
                    }
                     // Check TOP neighbor (add border to the *top* cell)
                    if (neighbors.top && cageCellSet.has(neighbors.top) && cellElements[neighbors.top]) {
                         cellElements[neighbors.top].classList.add('cage-inner-border-bottom');
                    }
                });
            });
         }
         console.log("Board rendering complete.");
    }

    function createCellElement(r, c) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.dataset.row = r;
        cell.dataset.col = c;

        const cellData = userGrid[r]?.[c];
        if (!cellData) {
            cell.textContent = '?'; return cell; // Error case
        }

        // Value Container (always present, maybe hidden)
        const valueContainer = document.createElement('div');
        valueContainer.classList.add('cell-value-container');

        // Notes Container (always present, maybe hidden)
        const notesContainer = document.createElement('div');
        notesContainer.classList.add('cell-notes-container');

        if (cellData.value !== 0) {
            valueContainer.textContent = cellData.value;
            valueContainer.style.display = 'flex';
            notesContainer.style.display = 'none';
            // Check if it's a 'given' number in classic mode
            if (currentMode === 'classic' && currentPuzzle) {
                 const idx = r * 9 + c;
                 if (currentPuzzle[idx] && currentPuzzle[idx] !== '.' && currentPuzzle[idx] !== '0') {
                     cell.classList.add('given');
                 }
            }
        } else if (cellData.notes instanceof Set && cellData.notes.size > 0) {
            valueContainer.style.display = 'none';
            notesContainer.style.display = 'grid';
            notesContainer.innerHTML = ''; // Clear previous notes
            for (let n = 1; n <= 9; n++) {
                const nd = document.createElement('div');
                nd.classList.add('note-digit');
                nd.textContent = cellData.notes.has(n) ? n : '';
                notesContainer.appendChild(nd);
            }
        } else {
            // Empty cell (no value, no notes)
            valueContainer.textContent = '';
            valueContainer.style.display = 'flex'; // Show empty container
            notesContainer.style.display = 'none';
        }

        cell.appendChild(valueContainer);
        cell.appendChild(notesContainer);

        // Thick borders for 3x3 boxes (classic look)
        if ((c + 1) % 3 === 0 && c < 8) cell.classList.add('thick-border-right');
        if ((r + 1) % 3 === 0 && r < 8) cell.classList.add('thick-border-bottom');

        // Base class if it's a killer game (borders added later in renderBoard)
        if (currentMode === 'killer') {
            // cell.classList.add('cage-cell'); // Add this later in renderBoard
        }

        return cell;
    }

    // --- Вспомогательные ---
    // ... (getSolutionValue, clearSelection, clearErrors, updateNoteToggleButtonState, highlightRelatedCells, isGameSolved, resumeTimerIfNeeded) ...
     function getSolutionValue(row, col) { /* ... (classic only) ... */ if(currentMode !== 'classic' || !currentSolution) return null; const i = row * 9 + col; if(i>=currentSolution.length) return null; const c = currentSolution[i]; return (c==='.'||c==='0')?0:parseInt(c); }
     function clearSelection() { /* ... */ if(selectedCell) selectedCell.classList.remove('selected'); if(boardElement) boardElement.querySelectorAll('.cell.highlighted').forEach(c=>c.classList.remove('highlighted')); selectedCell=null; selectedRow=-1; selectedCol=-1;}
     function clearErrors() { /* ... */ if(boardElement) boardElement.querySelectorAll('.cell.incorrect').forEach(c=>c.classList.remove('incorrect')); if(statusMessageElement) { statusMessageElement.textContent=''; statusMessageElement.className=''; } }
     function updateNoteToggleButtonState() { /* ... */ if(noteToggleButton){noteToggleButton.classList.toggle('active',isNoteMode);noteToggleButton.title=`Режим заметок (${isNoteMode?'ВКЛ':'ВЫКЛ'})`;}}
     function highlightRelatedCells(row, col) { /* ... */ if(boardElement){boardElement.querySelectorAll('.cell.highlighted').forEach(c=>c.classList.remove('highlighted'));boardElement.querySelectorAll(`.cell[data-row='${row}'], .cell[data-col='${col}']`).forEach(c=>c.classList.add('highlighted'));}}
     function isGameSolved() { if (!userGrid || userGrid.length !== 9) return false; return !userGrid.flat().some(cell => !cell || cell.value === 0); }
     function resumeTimerIfNeeded() { const solved=isGameSolved();const visible=gameContainer&&gameContainer.classList.contains('visible');if(visible&&!solved)startTimer();else stopTimer();}
     // --- Новые вспомогательные для Killer ---
     function getCellCoords(cellId) {
         if (!cellId || cellId.length !== 2) return null;
         const rowChar = cellId[0];
         const colChar = cellId[1];
         const r = ROWS.indexOf(rowChar);
         const c = COLS.indexOf(colChar);
         if (r === -1 || c === -1) return null;
         return { r, c };
     }
     function getCellId(r, c) {
         if (r < 0 || r > 8 || c < 0 || c > 8) return null;
         return ROWS[r] + COLS[c];
     }
      function getNeighbors(r, c) {
          return {
              top: r > 0 ? getCellId(r - 1, c) : null,
              bottom: r < 8 ? getCellId(r + 1, c) : null,
              left: c > 0 ? getCellId(r, c - 1) : null,
              right: c < 8 ? getCellId(r, c + 1) : null,
          };
      }
      function showError(message) {
         console.error("Error:", message);
         if (statusMessageElement) {
             statusMessageElement.textContent = message;
             statusMessageElement.className = 'incorrect-msg';
         }
         // Optionally show initial screen on critical errors
         // showScreen(initialScreen);
      }
     // ---
     function updateHintButtonState() {
         if (!hintButton) return;
         const solved = isGameSolved();
         let canProvideHint = false;
         let title = "";

         if (currentMode === 'classic') {
             canProvideHint = currentSolution && !solved;
             if (!currentSolution) title = "Игра не загружена";
             else if (solved) title = "Игра решена";
             else if (hintsRemaining > 0) title = "Использовать подсказку";
             else title = `Получить ${HINTS_REWARD} подсказку (реклама)`;
         } else { // Killer mode - hints disabled for now
             canProvideHint = false;
             title = "Подсказки недоступны для Killer";
         }

         hintButton.disabled = !canProvideHint;
         hintButton.title = title;
         hintButton.textContent = `💡 ${hintsRemaining}/${MAX_HINTS}`;
         // Special case for killer mode if hints are zero
         if (currentMode === 'killer') {
             hintButton.disabled = true; // Always disabled
         } else if (hintsRemaining <= 0 && canProvideHint) {
             hintButton.disabled = false; // Allow clicking for ad offer
         }
     }


    // --- Логика подсказки ---
     function provideHintInternal() {
         if (currentMode !== 'classic') {
             showError("Подсказки доступны только в классическом режиме.");
             return;
         }
         if (!selectedCell) { showError("Выберите ячейку для подсказки."); return; }
         // ... (rest of classic hint logic remains the same) ...
         pushHistoryState(); let hintUsed=false; try{ if(selectedCell.classList.contains('given'))throw new Error("Начальная цифра");const r=selectedRow,c=selectedCol;if(r<0||c<0||!userGrid[r]?.[c])throw new Error(`Err cell data [${r},${c}]`);if(userGrid[r][c].value!==0)throw new Error("Ячейка заполнена");const sv=getSolutionValue(r,c);if(sv>0){console.log(`Hint [${r},${c}]: ${sv}`);userGrid[r][c].value=sv;if(userGrid[r][c].notes)userGrid[r][c].notes.clear();renderCell(r,c);const hintedEl=boardElement?.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);if(hintedEl){hintedEl.classList.remove('selected');const hc=getComputedStyle(document.documentElement).getPropertyValue('--highlight-hint-flash').trim()||'#fffacd';hintedEl.style.transition='background-color 0.1s ease-out';hintedEl.style.backgroundColor=hc;setTimeout(()=>{if(hintedEl){hintedEl.style.backgroundColor='';hintedEl.style.transition='';}clearSelection();},500);}else{clearSelection();}hintsRemaining--;hintUsed=true;updateHintButtonState();clearErrors();saveGameState();if(isGameSolved())checkButton.click();}else throw new Error(`Err getting solution [${r},${c}]`);}catch(e){console.error("Hint Err:",e.message);showError(e.message);if(!hintUsed&&historyStack.length>0){historyStack.pop();updateUndoButtonState();}}
     }
     function offerRewardedAdForHints() { /* ... (as before) ... */ if(currentMode!=='classic')return; if(isShowingAd)return;console.log("Offering ad...");if(confirm(`Подсказки зак-сь! Реклама за ${HINTS_REWARD} подсказку?`)){if(!isAdReady){showError("Реклама грузится...");preloadRewardedAd();return;}showRewardedAd({onSuccess:()=>{hintsRemaining+=HINTS_REWARD;updateHintButtonState();saveGameState();showSuccess(`+${HINTS_REWARD} подсказка!`);},onError:(msg)=>{showError(`Ошибка: ${msg||'Реклама?'} Подсказка не добавлена.`);}});}}
     function showSuccess(message) { if(statusMessageElement){ statusMessageElement.textContent=message; statusMessageElement.className='correct'; setTimeout(()=>clearErrors(), 3000); } }

    // --- Логика Проверки ---
    function checkGame() {
        console.log(`Check button clicked for mode: ${currentMode}`);
        clearErrors();
        if (!userGrid || userGrid.length !== 9) return;

        let isValid = false;
        let isComplete = !userGrid.flat().some(cell => !cell || cell.value === 0);

        if (currentMode === "classic") {
            if (!currentSolution) { showError("Решение не загружено!"); return; }
            isValid = validateClassicSudoku();
        } else if (currentMode === "killer") {
            if (!currentSolverData) { showError("Данные Killer не загружены!"); return; }
            isValid = validateKillerSudoku(); // Call specific killer validation
        }

        if (isValid && isComplete) {
            showSuccess("Поздравляем! Судоку решено верно!");
            stopTimer();
            clearSelection();
            updateHintButtonState();
            // Submit result if using backend
            // submitGameResult();
        } else if (!isValid) {
            showError("Найдены ошибки."); // Specific errors marked by validation functions
        } else { // isValid && !isComplete
             if(statusMessageElement){ statusMessageElement.textContent = "Пока верно, но не закончено."; statusMessageElement.className = ''; }
        }
    }

    function validateClassicSudoku() {
        let allCorrect = true;
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const cellData = userGrid[r][c];
                const cellElement = boardElement?.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);
                if (!cellData || !cellElement || cellData.value === 0 || cellElement.classList.contains('given')) continue;
                const solutionValue = getSolutionValue(r, c);
                if (cellData.value !== solutionValue) {
                    cellElement.classList.add('incorrect');
                    allCorrect = false;
                }
            }
        }
        return allCorrect;
    }

    function validateKillerSudoku() {
        let isValid = true;
        const gridValues = userGrid.map(row => row.map(cell => cell.value)); // Get just the numbers

        // 1. Check Classic Rules
        for (let i = 0; i < 9; i++) {
            if (!isUnitValid(getRow(gridValues, i)) || !isUnitValid(getCol(gridValues, i)) || !isUnitValid(getBlock(gridValues, i))) {
                // Highlight the specific invalid unit/cell if possible (more complex UI)
                console.warn("Classic rule violation detected.");
                isValid = false;
                // For simplicity now, just return false. Detailed error marking is harder.
                 // We mark errors based on solution check in classic, here we check rules directly
                 // A better approach might be needed to highlight specific rule breaks in Killer
            }
        }
        if (!isValid) return false; // Stop if classic rules fail

        // 2. Check Cage Rules (Uniqueness and Sum)
        if (!currentSolverData || !currentSolverData.cageDataArray) return false; // Should not happen

        for (const cage of currentSolverData.cageDataArray) {
            const cageValues = [];
            let cageSum = 0;
            let isCageComplete = true;
            let cageCellElements = [];

            for (const cellId of cage.cells) {
                const coords = getCellCoords(cellId);
                if (!coords) continue;
                const cellValue = gridValues[coords.r][coords.c];
                const cellElement = boardElement?.querySelector(`.cell[data-row='${coords.r}'][data-col='${coords.c}']`);
                if(cellElement) cageCellElements.push(cellElement);

                if (cellValue === 0) {
                    isCageComplete = false;
                } else {
                    cageValues.push(cellValue);
                    cageSum += cellValue;
                }
            }

            // Check uniqueness within the cage
            if (new Set(cageValues).size !== cageValues.length) {
                console.warn(`Cage ${cage.id} uniqueness violation:`, cageValues);
                isValid = false;
                cageCellElements.forEach(el => el.classList.add('incorrect')); // Mark entire cage
            }

            // Check sum ONLY if cage is complete
            if (isCageComplete && cageSum !== cage.sum) {
                 console.warn(`Cage ${cage.id} sum violation: expected ${cage.sum}, got ${cageSum}`);
                 isValid = false;
                 cageCellElements.forEach(el => el.classList.add('incorrect')); // Mark entire cage
            }
        }

        return isValid;
    }

    // --- Helpers for validation ---
    function isUnitValid(unit) { // unit is an array of 9 numbers (0 for empty)
        const nums = unit.filter(n => n !== 0); // Filter out empty cells
        return new Set(nums).size === nums.length; // Check for duplicates
    }
    function getRow(grid, r) { return grid[r]; }
    function getCol(grid, c) { return grid.map(row => row[c]); }
    function getBlock(grid, blockIndex) {
        const startRow = Math.floor(blockIndex / 3) * 3;
        const startCol = (blockIndex % 3) * 3;
        const block = [];
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                block.push(grid[startRow + r][startCol + c]);
            }
        }
        return block;
    }

    // --- Обработчики Событий ---
    function addEventListeners() {
        console.log("Adding event listeners...");
        // 1. Стартовый Экран
        if (startNewGameButton) startNewGameButton.addEventListener('click', () => { console.log("New Game button clicked."); showScreen(newGameOptionsScreen); });
        if (continueGameButton) continueGameButton.addEventListener('click', () => {
             console.log("Continue Game button clicked.");
             const savedState = loadGameState();
             if (savedState) {
                 // Pass mode and difficulty/state from save
                 initGame(savedState.mode, savedState.difficulty, savedState);
             } else {
                 console.warn("Continue clicked, but no saved game found.");
                 showError("Нет сохраненной игры.");
                 if(continueGameButton) continueGameButton.disabled = true;
             }
        });

        // 2. Экран Настроек Новой Игры
        // --- Обновлено: Добавить выбор режима ---
        if (gameModeSelectionContainer) {
             gameModeSelectionContainer.addEventListener('click', (event) => {
                 const button = event.target.closest('button[data-mode]');
                 if (button) {
                     const selectedMode = button.dataset.mode;
                     const selectedDifficulty = difficultyButtonsContainer?.querySelector('button.selected')?.dataset.difficulty || 'medium'; // Get selected difficulty if any
                     console.log(`Mode selected: ${selectedMode}, starting with difficulty: ${selectedDifficulty}`);
                     initGame(selectedMode, selectedDifficulty); // Start new game with selected mode/difficulty
                 }
             });
        } else { console.error("Game Mode Selection container not found!"); }

        if (difficultyButtonsContainer) difficultyButtonsContainer.addEventListener('click', (event) => {
            const target = event.target.closest('button.difficulty-button');
            if (target && target.dataset.difficulty) {
                 // --- Изменено: Не начинаем игру здесь, просто выбираем сложность ---
                 // Remove 'selected' from others, add to this one
                 difficultyButtonsContainer.querySelectorAll('.selected').forEach(btn => btn.classList.remove('selected'));
                 target.classList.add('selected');
                 currentDifficulty = target.dataset.difficulty; // Store selection temporarily
                 console.log(`Difficulty selected: ${currentDifficulty}. Mode selection needed.`);
                 // Можно добавить кнопку "Старт", которая читает выбранный режим и сложность
            }
        });
        // --- Нужна кнопка "Старт" на экране опций ---
        // Пример: <button id="start-selected-game">Начать Игру</button>
        // const startSelectedGameButton = document.getElementById('start-selected-game');
        // if (startSelectedGameButton) {
        //     startSelectedGameButton.addEventListener('click', () => {
        //         const selectedMode = gameModeSelectionContainer?.querySelector('button.selected')?.dataset.mode || 'classic';
        //         const selectedDifficulty = difficultyButtonsContainer?.querySelector('button.selected')?.dataset.difficulty || 'medium';
        //         console.log(`Starting selected game: ${selectedMode}, ${selectedDifficulty}`);
        //         clearSavedGameState(); // Clear save for new game
        //         initGame(selectedMode, selectedDifficulty);
        //     });
        // }
        // Пока что игра начинается сразу при клике на сложность/режим


        if (themeToggleCheckbox) themeToggleCheckbox.addEventListener('change', handleThemeToggle);
        if (backToInitialButton) backToInitialButton.addEventListener('click', () => { console.log("Back button clicked."); showScreen(initialScreen); checkContinueButton(); });

        // 3. Игровой Экран
        if (boardElement) boardElement.addEventListener('click', (event) => { /* ... (as before, add checks for !isGameSolved?) ... */ const target=event.target.closest('.cell');if(!target||isShowingAd||isGameSolved())return; const r=parseInt(target.dataset.row),c=parseInt(target.dataset.col);if(isNaN(r)||isNaN(c))return; if(target===selectedCell){clearSelection();}else{clearSelection();selectedCell=target;selectedRow=r;selectedCol=c;if(!selectedCell.classList.contains('given'))selectedCell.classList.add('selected');highlightRelatedCells(r,c);}clearErrors(); });
        if (numpad) numpad.addEventListener('click', (event) => { const button = event.target.closest('button'); if (!button || isShowingAd || isGameSolved()) return; if (button.id === 'note-toggle-button') { isNoteMode = !isNoteMode; updateNoteToggleButtonState(); return; } if (!selectedCell || selectedCell.classList.contains('given')) { return; } clearErrors(); if (!userGrid[selectedRow]?.[selectedCol]) return; const cellData = userGrid[selectedRow][selectedCol]; let needsRender = false; let stateChanged = false; let potentialChange = false; if (button.id === 'erase-button') { potentialChange = (cellData.value !== 0) || (cellData.notes?.size > 0); } else if (button.dataset.num) { const num = parseInt(button.dataset.num); if (isNoteMode) { potentialChange = (cellData.value === 0); } else { potentialChange = (cellData.value !== num); } } if (potentialChange) { pushHistoryState(); } if (button.id === 'erase-button') { if (cellData.value !== 0) { cellData.value = 0; needsRender = true; stateChanged = true; } else if (cellData.notes?.size > 0) { cellData.notes.clear(); needsRender = true; stateChanged = true; } } else if (button.dataset.num) { const num = parseInt(button.dataset.num); if (isNoteMode) { if (cellData.value === 0) { if (!(cellData.notes instanceof Set)) cellData.notes = new Set(); if (cellData.notes.has(num)) cellData.notes.delete(num); else cellData.notes.add(num); needsRender = true; stateChanged = true; } } else { if (cellData.value !== num) { cellData.value = num; if (cellData.notes) cellData.notes.clear(); needsRender = true; stateChanged = true; } else { cellData.value = 0; needsRender = true; stateChanged = true; } } } if (needsRender) renderCell(selectedRow, selectedCol); if (stateChanged) saveGameState(); });
        if (checkButton) checkButton.addEventListener('click', checkGame); // Use new check function
        if (undoButton) undoButton.addEventListener('click', handleUndo);
        if (hintButton) hintButton.addEventListener('click', () => { if (isShowingAd || isGameSolved()) return; if (currentMode === 'classic' && hintsRemaining > 0) { provideHintInternal(); } else if (currentMode === 'classic') { offerRewardedAdForHints(); } else { showError("Подсказки недоступны для Killer Sudoku."); } });
        if (exitGameButton) exitGameButton.addEventListener('click', () => { console.log("Exit to menu clicked."); stopTimer(); showScreen(initialScreen); checkContinueButton(); });

        // Глобальный обработчик клавиатуры
        document.addEventListener('keydown', (event) => { if (document.activeElement.tagName === 'INPUT' || isShowingAd || !gameContainer || !gameContainer.classList.contains('visible') || isGameSolved()) return; /* ... (rest as before) ... */ if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();handleUndo();return;}if(event.key.toLowerCase()==='n'||event.key.toLowerCase()==='т'){isNoteMode=!isNoteMode;updateNoteToggleButtonState();event.preventDefault();return;}if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)){if(!selectedCell){const sc=boardElement?.querySelector(`.cell[data-row='0'][data-col='0']`);if(sc)sc.click();else return;}let nr=selectedRow,nc=selectedCol;const mv=(cur,d,m)=>Math.min(m,Math.max(0,cur+d));if(event.key==='ArrowUp')nr=mv(selectedRow,-1,8);if(event.key==='ArrowDown')nr=mv(selectedRow,1,8);if(event.key==='ArrowLeft')nc=mv(selectedCol,-1,8);if(event.key==='ArrowRight')nc=mv(selectedCol,1,8);if(nr!==selectedRow||nc!==selectedCol){const nextEl=boardElement?.querySelector(`.cell[data-row='${nr}'][data-col='${nc}']`);if(nextEl)nextEl.click();}event.preventDefault();return;}if(!selectedCell||selectedCell.classList.contains('given'))return;if(!userGrid[selectedRow]?.[selectedCol])return;const cd=userGrid[selectedRow][selectedCol];let needsRender=false,stateChanged=false,potentialChange=false;if(event.key>='1'&&event.key<='9'){const n=parseInt(event.key);if(isNoteMode){potentialChange=(cd.value===0);}else{potentialChange=(cd.value!==n);}}else if(event.key==='Backspace'||event.key==='Delete'){potentialChange=(cd.value!==0)||(cd.notes?.size>0);}if(potentialChange){pushHistoryState();}if(event.key>='1'&&event.key<='9'){clearErrors();const n=parseInt(event.key);if(isNoteMode){if(cd.value===0){if(!(cd.notes instanceof Set))cd.notes=new Set();if(cd.notes.has(n))cd.notes.delete(n);else cd.notes.add(n);needsRender=true;stateChanged=true;}}else{if(cd.value!==n){cd.value=n;if(cd.notes)cd.notes.clear();needsRender=true;stateChanged=true;}else{cd.value=0;needsRender=true;stateChanged=true;}}event.preventDefault();}else if(event.key==='Backspace'||event.key==='Delete'){clearErrors();if(cd.value!==0){cd.value=0;needsRender=true;stateChanged=true;}else if(cd.notes?.size>0){cd.notes.clear();needsRender=true;stateChanged=true;}event.preventDefault();}if(needsRender)renderCell(selectedRow,selectedCol);if(stateChanged)saveGameState(); });

        console.log("Event listeners added.");
    }


    // --- Инициализация Приложения ---
    function initializeApp() {
        console.log("Initializing application...");
        try {
            loadThemePreference();
            checkContinueButton();
            addEventListeners();
            showScreen(initialScreen);
            initializeAds();
            try { if (window.Telegram?.WebApp) { Telegram.WebApp.ready(); console.log("TG SDK ready."); } else { console.log("TG SDK not found."); } } catch (e) { console.error("TG SDK Init Error:", e); }
            console.log("Application initialized successfully.");
        } catch (error) {
            console.error("CRITICAL ERROR during application initialization:", error);
            document.body.innerHTML = `<div style="padding:20px;color:red;border:2px solid red;background:white;"><h1>Критическая ошибка!</h1><p>Не удалось запустить приложение.</p><p>Детали: ${error.message}</p><pre>${error.stack}</pre></div>`;
        }
    }

    // Функция проверки кнопки "Продолжить"
    function checkContinueButton() { /* ... (as before) ... */ if(!continueGameButton)return;try{const s=loadGameState();continueGameButton.disabled=!s;console.log(`Continue btn state: ${!continueGameButton.disabled}`);}catch(e){console.error("Err check continue:",e);continueGameButton.disabled=true;}}

    // --- Запуск ---
    initializeApp();

}); // Конец 'DOMContentLoaded'
