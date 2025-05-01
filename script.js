// Убедитесь, что sudoku.js И killerSudoku.js (с ПОЛНОЙ реализацией) подключены ДО script.js
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
        // TG Integration omitted
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
         // console.log(`Highlighting for [${row}, ${col}], mode: ${currentMode}`);
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
    /**
     * Получает правильное значение для ячейки из строки решения (только для классики).
     */
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
              return null; // Invalid character in solution string
         }
         return parseInt(char);
     }

    // --- Инициализация ИГРЫ ---
    function initGame(mode = "classic", difficulty = "medium", restoreState = null) {
        console.log(`%cInitGame START: mode=${mode}, difficulty=${difficulty}, restore=${!!restoreState}`, "color: blue; font-weight: bold;");
        if (mode === "classic") { if (typeof sudoku === 'undefined') return showError("Ошибка: sudoku.js не найден."); }
        else if (mode === "killer") { if (typeof killerSudoku === 'undefined') return showError("Ошибка: killerSudoku.js не найден."); if (typeof killerSudoku._initializeSolverData !== 'function') return showError("Ошибка: killerSudoku.js неполный (_initializeSolverData)."); if (typeof killerSudoku.generate !== 'function') return showError("Ошибка: killerSudoku.js неполный (generate)."); }
        else return showError("Ошибка: Неизвестный режим: " + mode);
        console.log(`${mode} library OK.`);

        currentMode = mode; currentDifficulty = difficulty;
        stopTimer(); historyStack = []; updateUndoButtonState(); isNoteMode = false; updateNoteToggleButtonState(); clearSelection(); clearErrors();
        statusMessageElement.textContent = 'Генерация...'; statusMessageElement.className = '';
        currentPuzzle = null; currentSolution = null; currentCageData = null; currentSolverData = null; userGrid = [];
        isLogicSolverRunning = false;

        let success = false;
        try {
            if (restoreState) { console.log("Restoring state..."); currentMode=restoreState.mode||"classic";currentDifficulty=restoreState.difficulty||'medium';secondsElapsed=restoreState.time||0;hintsRemaining=restoreState.hints??MAX_HINTS;isNoteMode=restoreState.isNoteMode||false;userGrid=restoreState.grid.map(r=>r.map(c=>({value:c.value,notes:new Set(c.notesArray||[])})));if(currentMode==="classic"){currentPuzzle=restoreState.puzzle;currentSolution=restoreState.solution;if(!currentPuzzle||!currentSolution)throw new Error("Inv classic save.");}else if(currentMode==="killer"){currentCageData=restoreState.cageData;if(!currentCageData?.cages)throw new Error("Inv killer save (cages).");console.log("Re-init solver data...");currentSolverData=killerSudoku._initializeSolverData(currentCageData.cages);if(!currentSolverData)throw new Error("Fail re-init solver data.");console.log("Solver data re-init OK.");}else throw new Error("Unk save mode:"+currentMode);console.log("Restore OK.");success=true;
            } else { secondsElapsed = 0; hintsRemaining = MAX_HINTS; clearSavedGameState(); if (currentMode === "classic") { console.log(`Gen CLASSIC: ${currentDifficulty}...`); currentPuzzle = sudoku.generate(currentDifficulty); if (!currentPuzzle) throw new Error("Classic gen failed."); currentSolution = sudoku.solve(currentPuzzle); if (!currentSolution) throw new Error("Classic solve failed."); userGrid = boardStringToObjectArray(currentPuzzle); console.log("New classic OK."); success = true; } else if (currentMode === "killer") { console.log(`Gen KILLER: ${currentDifficulty}...`); console.log("Call killer.generate..."); const puzzle = killerSudoku.generate(currentDifficulty); console.log("Killer gen result:", puzzle); if (!puzzle?.cages) throw new Error("Killer gen failed (no cages)."); currentCageData = puzzle; console.log("Init solver data..."); currentSolverData = killerSudoku._initializeSolverData(currentCageData.cages); console.log("Solver init result:", currentSolverData); if (!currentSolverData) throw new Error("Cage validation/init failed."); userGrid = boardStringToObjectArray(killerSudoku.BLANK_BOARD); console.log("New killer OK."); success = true; } }
        } catch (error) { console.error("INIT DATA ERR:", error); showError(`Ошибка init (${mode}): ${error.message}`); showScreen(initialScreen); checkContinueButton(); return; }

        if (success) { statusMessageElement.textContent = ''; console.log("Rendering..."); updateNoteToggleButtonState(); renderBoard(); updateHintButtonState(); updateUndoButtonState(); updateLogicSolverButtonsState(); updateTimerDisplay(); console.log(`Game initialized. Is solved? ${isGameSolved()}`); showScreen(gameContainer); console.log("Schedule timer..."); setTimeout(() => { console.log("setTimeout: start timer."); startTimer(); }, 50); console.log("InitGame COMPLETE."); }
        else { console.error("InitGame no success flag."); showError("Ошибка инициализации."); showScreen(initialScreen); checkContinueButton(); }
    }

    // --- Функции сохранения/загрузки состояния ---
    function saveGameState(){if(!userGrid||userGrid.length!==9)return;try{const g=userGrid.map(r=>r.map(c=>({value:c.value,notesArray:Array.from(c.notes||[])})));const s={mode:currentMode,difficulty:currentDifficulty,grid:g,time:secondsElapsed,hints:hintsRemaining,timestamp:Date.now(),isNoteMode: isNoteMode, puzzle:currentMode==='classic'?currentPuzzle:null,solution:currentMode==='classic'?currentSolution:null,cageData:currentMode==='killer'?currentCageData:null};localStorage.setItem(SAVE_KEY,JSON.stringify(s));}catch(e){console.error("SaveErr:",e);showError("Ошибка сохр.");}}
    function loadGameState(){const d=localStorage.getItem(SAVE_KEY);if(!d)return null;try{const s=JSON.parse(d);if(s?.mode&&s?.difficulty&&Array.isArray(s.grid)&&typeof s.timestamp==='number'&&(s.mode==='classic'?!(!s.puzzle||!s.solution):true)&&(s.mode==='killer'?!(!s.cageData||!s.cageData.cages):true)){console.log("Save found:",new Date(s.timestamp).toLocaleString(),`M:${s.mode}`,`D:${s.difficulty}`);return s;}else{console.warn("Inv save. Clearing.",s);clearSavedGameState();return null;}}catch(e){console.error("ParseSaveErr:",e);clearSavedGameState();return null;}}
    function clearSavedGameState(){try{localStorage.removeItem(SAVE_KEY);console.log("Save cleared.");checkContinueButton();}catch(e){console.error("Err clr save:",e);}}

    // --- Функции для Undo ---
    function createHistoryState(){if(!userGrid||userGrid.length!==9)return null;const g=userGrid.map(r=>r.map(c=>({value:c.value,notes:new Set(c.notes||[])})));return{grid:g,hints:hintsRemaining};}
    function pushHistoryState(){if(isGameSolved()) return; const s=createHistoryState();if(s){historyStack.push(s);updateUndoButtonState();}else{console.warn("Inv hist push");}}
    function handleUndo(){if(historyStack.length===0||isShowingAd)return;stopTimer();const ps=historyStack.pop();console.log("Undo...");try{userGrid=ps.grid;hintsRemaining=ps.hints;renderBoard();clearSelection();clearErrors();updateHintButtonState();updateUndoButtonState();updateLogicSolverButtonsState(); saveGameState();console.log("Undo OK.");}catch(e){console.error("Undo Err:",e);showError("Ошибка отмены");historyStack=[];updateUndoButtonState();updateLogicSolverButtonsState();}finally{resumeTimerIfNeeded();}}
    function updateUndoButtonState(){if(undoButton)undoButton.disabled=historyStack.length===0;}

    // --- Функции для таймера ---
    function startTimer(){const v=gameContainer?.classList.contains('visible');if(timerInterval||!v)return;console.log("Timer start...");updateTimerDisplay();timerInterval=setInterval(()=>{secondsElapsed++;updateTimerDisplay();if(secondsElapsed%10===0)saveGameState();},1000);console.log("Timer started:",timerInterval);}
    function stopTimer(){if(timerInterval){clearInterval(timerInterval);const o=timerInterval;timerInterval=null;console.log(`Timer stop (${o}).Save.`);saveGameState();}}
    function updateTimerDisplay(){if(!timerElement)return;const m=Math.floor(secondsElapsed/60),s=secondsElapsed%60;timerElement.textContent=`Время: ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}
    function resumeTimerIfNeeded(){const s=isGameSolved(),v=gameContainer?.classList.contains('visible');if(v&&!s)startTimer();else stopTimer();}


    // --- Отрисовка ---
    function renderBoard() { console.log(`Render board start: mode=${currentMode}`); if (!boardElement) { console.error("Board element missing!"); return; } boardElement.innerHTML = ''; if (!userGrid || userGrid.length !== 9) { showError("Invalid grid data for rendering."); return; } const cellElementsMap = {}; for (let r = 0; r < 9; r++) { if (!userGrid[r] || userGrid[r].length !== 9) continue; for (let c = 0; c < 9; c++) { const cellId = getCellId(r, c); if (!cellId) continue; const cellElement = createCellElement(r, c); boardElement.appendChild(cellElement); cellElementsMap[cellId] = cellElement; } } if (currentMode === "killer" && currentSolverData?.cageDataArray) { /*console.log("Rendering Killer Cages...");*/ currentSolverData.cageDataArray.forEach((cage, cageIndex) => { if (!cage || !Array.isArray(cage.cells) || cage.cells.length === 0) { console.warn(`Skipping invalid cage data at index ${cageIndex}`); return; } const cageCellSet = new Set(cage.cells); let anchorCellId = null; let minRow = 9, minCol = 9; cage.cells.forEach(cellId => { const coords = getCellCoords(cellId); if (coords) { if (coords.r < minRow) { minRow = coords.r; minCol = coords.c; anchorCellId = cellId; } else if (coords.r === minRow && coords.c < minCol) { minCol = coords.c; anchorCellId = cellId; } } }); cage.cells.forEach(cellId => { const cellElement = cellElementsMap[cellId]; if (!cellElement) return; cellElement.classList.add('cage-cell'); if (cellId === anchorCellId) { cellElement.classList.add('cage-sum-anchor'); if (!cellElement.querySelector('.cage-sum')) { const sumSpan = document.createElement('span'); sumSpan.className = 'cage-sum'; sumSpan.textContent = cage.sum; cellElement.appendChild(sumSpan); } } const coords = getCellCoords(cellId); if (!coords) return; const { r, c } = coords; const neighbors = getNeighbors(r, c); if (r === 0 || !neighbors.top || !cageCellSet.has(neighbors.top)) { cellElement.classList.add('cage-inner-border-top'); } if (c === 0 || !neighbors.left || !cageCellSet.has(neighbors.left)) { cellElement.classList.add('cage-inner-border-left'); } if (r === 8 || !neighbors.bottom || !cageCellSet.has(neighbors.bottom)) { cellElement.classList.add('cage-inner-border-bottom'); } if (c === 8 || !neighbors.right || !cageCellSet.has(neighbors.right)) { cellElement.classList.add('cage-inner-border-right'); } }); }); /*console.log("Cage rendering finished.");*/ } console.log("Board rendering complete."); }
    function createCellElement(r, c) { const cell=document.createElement('div');cell.classList.add('cell'); cell.dataset.row=r;cell.dataset.col=c; const cd=userGrid[r]?.[c]; if(!cd){cell.textContent='?';console.warn(`Missing grid data for ${r},${c}`);return cell;} const vc=document.createElement('div');vc.classList.add('cell-value-container'); const nc=document.createElement('div');nc.classList.add('cell-notes-container'); if(cd.value!==0){ vc.textContent=cd.value;vc.style.display='flex';nc.style.display='none'; if(currentMode==='classic'&&currentPuzzle){ const i=r*9+c; if(currentPuzzle[i]&&currentPuzzle[i]!=='.')cell.classList.add('given'); } } else if(cd.notes instanceof Set&&cd.notes.size>0){ vc.style.display='none';nc.style.display='grid';nc.innerHTML=''; for(let n=1;n<=9;n++){const nd=document.createElement('div');nd.classList.add('note-digit');nd.textContent=cd.notes.has(n)?n:'';nc.appendChild(nd);} } else { vc.textContent='';vc.style.display='flex';nc.style.display='none'; } cell.appendChild(vc);cell.appendChild(nc); if((c+1)%3===0&&c<8)cell.classList.add('thick-border-right'); if((r+1)%3===0&&r<8)cell.classList.add('thick-border-bottom'); return cell; }
    function renderCell(r, c) { if (!boardElement) return; if (currentMode === 'killer' && userGrid[r]?.[c]?.value === 0) { console.log("Note changed in Killer mode, forcing full board render."); renderBoard(); if (selectedRow === r && selectedCol === c) { selectedCell = boardElement.querySelector(`.cell[data-row='${r}'][data-col='${c}']`); if (selectedCell) { selectedCell.classList.add('selected'); highlightRelatedCells(r, c); } else { selectedCell = null; selectedRow = -1; selectedCol = -1; } } return; } const oldCell = boardElement.querySelector(`.cell[data-row='${r}'][data-col='${c}']`); if (oldCell) { try { const newCell = createCellElement(r, c); oldCell.classList.forEach(cls => { if(cls!=='cell' && !cls.startsWith('thick-') && !cls.startsWith('cage-inner-')) newCell.classList.add(cls); }); ['cage-cell', 'cage-sum-anchor', 'cage-inner-border-top', 'cage-inner-border-bottom', 'cage-inner-border-left', 'cage-inner-border-right'].forEach(cls => { if (oldCell.classList.contains(cls)) newCell.classList.add(cls); }); const oldSum = oldCell.querySelector('.cage-sum'); if (oldSum) newCell.appendChild(oldSum.cloneNode(true)); if (selectedRow === r && selectedCol === c) selectedCell = newCell; oldCell.replaceWith(newCell); } catch (error) { console.error(`Error render cell [${r}, ${c}]:`, error); renderBoard(); } } else { console.warn(`renderCell: Cell [${r},${c}] not found? Render full.`); renderBoard(); } }

    // --- Логика подсказки ---
    function provideHintInternal(){if(currentMode!=='classic')return showError("Подсказки только в классике");if(!selectedCell)return showError("Выберите ячейку"); const r=selectedRow,c=selectedCol;if(r<0||c<0||!userGrid[r]?.[c])return showError("Ошибка данных ячейки"); if(userGrid[r][c].value!==0)return showError("Ячейка заполнена");if(selectedCell.classList.contains('given')) return showError("Начальная цифра");pushHistoryState();let hintUsed=false;try{const sv=getSolutionValue(r,c);if(sv===null)throw new Error("Решение недоступно");if(sv>0){console.log(`Hint [${r},${c}]: ${sv}`);userGrid[r][c].value=sv;if(userGrid[r][c].notes)userGrid[r][c].notes.clear();renderCell(r,c);const hEl=boardElement?.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);if(hEl){hEl.classList.remove('selected');const hc=getComputedStyle(document.documentElement).getPropertyValue('--highlight-hint-flash').trim()||'#fffacd';hEl.style.transition='background-color 0.1s ease-out';hEl.style.backgroundColor=hc;setTimeout(()=>{if(hEl&&hEl.style.backgroundColor!==''){hEl.style.backgroundColor='';hEl.style.transition='';}clearSelection();},500);}else{clearSelection();}hintsRemaining--;hintUsed=true;updateHintButtonState();clearErrors();saveGameState();if(isGameSolved()){checkGame();updateLogicSolverButtonsState();}}else throw new Error(`Некорректное значение решения [${r},${c}]: ${sv}`);}catch(e){console.error("Hint Err:",e.message);showError(e.message);if(!hintUsed&&historyStack.length>0){historyStack.pop();updateUndoButtonState();}}}
    function offerRewardedAdForHints(){if(currentMode!=='classic'||isShowingAd)return;console.log("Offering ad...");if(confirm(`Подсказки зак-сь! Реклама за ${MAX_HINTS} подсказку?`)){if(!isAdReady){showError("Реклама грузится...");preloadRewardedAd();return;}showRewardedAd({onSuccess:()=>{hintsRemaining+=MAX_HINTS;updateHintButtonState();saveGameState();showSuccess(`+${MAX_HINTS} подсказка!`);},onError:(msg)=>{showError(`Ошибка: ${msg||'Реклама?'} Подсказка не добавлена.`);}});}}

    // --- Логика Проверки ---
    function checkGame(){console.log(`Check: ${currentMode}`);clearErrors();if(!userGrid||userGrid.length!==9)return;let isValid=false;let isComplete=!userGrid.flat().some(c=>!c||c.value===0);if(currentMode==="classic"){if(!currentSolution){showError("Нет решения!");return;}isValid=validateClassicSudoku();}else if(currentMode==="killer"){if(!currentSolverData){showError("Нет данных Killer!");return;}isValid=validateKillerSudoku();}if(isValid&&isComplete){showSuccess("Поздравляем! Решено верно!");stopTimer();clearSelection();updateHintButtonState();updateLogicSolverButtonsState();}else if(!isValid){showError("Найдены ошибки.");}else{if(statusMessageElement){statusMessageElement.textContent="Пока верно, но не закончено.";statusMessageElement.className='';}}}
    function validateClassicSudoku(){ let ok=true;if(!currentSolution){console.error("Classic valid Err: no solution!");return false;}for(let r=0;r<9;r++){for(let c=0;c<9;c++){const cd=userGrid[r]?.[c];const el=boardElement?.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);if(!cd||!el||cd.value===0||el.classList.contains('given'))continue;const sv=getSolutionValue(r,c);if(sv===null){console.error(`Classic valid Err: No sol value for ${r},${c}`);ok=false;break;}if(cd.value!==sv){el.classList.add('incorrect');ok=false;}}if(!ok)break;}return ok;}
    function validateKillerSudoku(){let ok=true;const grid=userGrid.map(r=>r.map(c=>c.value));for(let i=0;i<9;i++){if(!isUnitValid(getRow(grid,i))||!isUnitValid(getCol(grid,i))||!isUnitValid(getBlock(grid,i))){ok=false;break;}}if(!ok){showError("Нарушены правила Судоку.");return false;}if(!currentSolverData?.cageDataArray)return false;for(const cage of currentSolverData.cageDataArray){const vals=[];let sum=0;let complete=true;let els=[];for(const cid of cage.cells){const crds=getCellCoords(cid);if(!crds)continue;const v=grid[crds.r][crds.c];const el=boardElement?.querySelector(`.cell[data-row='${crds.r}'][data-col='${crds.c}']`);if(el)els.push(el);if(v===0){complete=false;}else{vals.push(v);sum+=v;}}if(new Set(vals).size!==vals.length){console.warn(`Cage ${cage.id} unique violation:`,vals);ok=false;els.forEach(e=>e.classList.add('incorrect'));}if(complete&&sum!==cage.sum){console.warn(`Cage ${cage.id} sum violation: got ${sum}, expected ${cage.sum}`);ok=false;els.forEach(e=>e.classList.add('incorrect'));}}return ok;}
    function isUnitValid(unit){const nums=unit.filter(n=>n!==0);return new Set(nums).size===nums.length;}
    function getRow(g,r){return g[r];} function getCol(g,c){return g.map(rw=>rw[c]);} function getBlock(g,b){const sr=Math.floor(b/3)*3,sc=(b%3)*3,bl=[];for(let r=0;r<3;r++)for(let c=0;c<3;c++)bl.push(g[sr+r][sc+c]);return bl;}


    // --- ЛОГИЧЕСКИЙ РЕШАТЕЛЬ (Classic) ---
    function calculateCandidates(r, c) { if (userGrid[r]?.[c]?.value !== 0) return null; let cands = new Set([1,2,3,4,5,6,7,8,9]); for (let i=0;i<9;i++){ if(userGrid[r]?.[i]?.value !== 0) cands.delete(userGrid[r][i].value); if(userGrid[i]?.[c]?.value !== 0) cands.delete(userGrid[i][c].value); } const sr=Math.floor(r/3)*3, sc=Math.floor(c/3)*3; for(let i=0;i<3;i++) for(let j=0;j<3;j++) if(userGrid[sr+i]?.[sc+j]?.value !== 0) cands.delete(userGrid[sr+i][sc+j].value); return cands; }
    function findNakedSingle() { if(currentMode!=='classic')return null; for(let r=0;r<9;r++){for(let c=0;c<9;c++){if(userGrid[r]?.[c]?.value===0){const cands=calculateCandidates(r,c);if(cands&&cands.size===1){const digit=cands.values().next().value;console.log(`Naked Single: ${digit} at [${r}, ${c}]`);return{r,c,digit,technique:"Naked Single"};}}}} return null; }
    function findHiddenSingle() { if(currentMode!=='classic')return null; const allCands={}; for(let r=0;r<9;r++){for(let c=0;c<9;c++){if(userGrid[r]?.[c]?.value===0){allCands[getCellId(r,c)]=calculateCandidates(r,c);}}} for(let i=0;i<9;i++){ const rowRes=findHiddenSingleInUnit(getRowIndices(i),allCands);if(rowRes)return rowRes; const colRes=findHiddenSingleInUnit(getColIndices(i),allCands);if(colRes)return colRes; const blkRes=findHiddenSingleInUnit(getBlockIndices(i),allCands);if(blkRes)return blkRes; } return null; }
    function findHiddenSingleInUnit(unitIndices, allCands) { for(let d=1;d<=9;d++){let places=[];let present=false;for(const[r,c] of unitIndices){const cell=userGrid[r]?.[c];if(!cell)continue;if(cell.value===d){present=true;break;}if(cell.value===0){const cands=allCands[getCellId(r,c)];if(cands?.has(d))places.push([r,c]);}}if(!present&&places.length===1){const[r,c]=places[0];console.log(`Hidden Single: ${d} at [${r},${c}]`);return{r,c,digit:d,technique:"Hidden Single"};}} return null; }
    function findNakedPair() { if(currentMode!=='classic')return null; const units=getAllUnitsIndices(); for(let i=0;i<units.length;i++){ const unit=units[i]; const cells2=[]; for(const[r,c] of unit){if(userGrid[r]?.[c]?.value===0){const cands=calculateCandidates(r,c);if(cands?.size===2)cells2.push({r,c,cands});}} if(cells2.length>=2){ for(let j=0;j<cells2.length;j++){for(let k=j+1;k<cells2.length;k++){const c1=cells2[j],c2=cells2[k];if(c1.cands.size===2&&c2.cands.size===2){let same=true;for(const d of c1.cands){if(!c2.cands.has(d)){same=false;break;}}if(same){const dArr=Array.from(c1.cands);const pCells=[getCellId(c1.r,c1.c),getCellId(c2.r,c2.c)];console.log(`Naked Pair found: ${dArr.join(',')} in ${pCells.join(',')}`);let elim=false;const unitSet=new Set(pCells);for(const[r_u,c_u]of unit){const id_u=getCellId(r_u,c_u);if(!unitSet.has(id_u)&&userGrid[r_u]?.[c_u]?.value===0){const notes=userGrid[r_u][c_u].notes??calculateCandidates(r_u,c_u);if(notes&&(notes.has(dArr[0])||notes.has(dArr[1]))){elim=true;break;}}}if(elim)return{unitType:getUnitType(i),unitIndex:i,cells:pCells,digits:dArr,technique:"Naked Pair"};/*else console.log("...no elims needed.");*/}}}}}} return null;}
    function findNakedTriple() { if (currentMode !== 'classic') return null; const units = getAllUnitsIndices(); for (let i = 0; i < units.length; i++) { const unitIndices = units[i]; const candidateCells = []; for (const [r, c] of unitIndices) { if (userGrid[r]?.[c]?.value === 0) { const candidates = calculateCandidates(r, c); if (candidates && (candidates.size === 2 || candidates.size === 3)) { candidateCells.push({ r, c, cands: candidates }); } } } if (candidateCells.length >= 3) { for (let j = 0; j < candidateCells.length; j++) { for (let k = j + 1; k < candidateCells.length; k++) { for (let l = k + 1; l < candidateCells.length; l++) { const c1 = candidateCells[j], c2 = candidateCells[k], c3 = candidateCells[l]; const combinedCands = new Set([...c1.cands, ...c2.cands, ...c3.cands]); if (combinedCands.size === 3) { const digits = Array.from(combinedCands); const tripleCells = [getCellId(c1.r, c1.c), getCellId(c2.r, c2.c), getCellId(c3.r, c3.c)]; console.log(`Naked Triple found: Digits ${digits.join(',')} in cells ${tripleCells.join(',')}`); let eliminationNeeded = false; const unitCellsSet = new Set(tripleCells); for (const [r_unit, c_unit] of unitIndices) { const cellId_unit = getCellId(r_unit, c_unit); if (!unitCellsSet.has(cellId_unit) && userGrid[r_unit]?.[c_unit]?.value === 0) { const notes = userGrid[r_unit][c_unit].notes ?? calculateCandidates(r_unit, c_unit); if (notes && (notes.has(digits[0]) || notes.has(digits[1]) || notes.has(digits[2]))) { eliminationNeeded = true; break; } } } if (eliminationNeeded) { return { unitType: getUnitType(i), unitIndex: i, cells: tripleCells, digits: digits, technique: "Naked Triple" }; } else { console.log("...no elims needed."); } } } } } } } return null; }
    function findPointingCandidates() { if (currentMode !== 'classic') return null; const allCands={}; for(let r=0;r<9;r++)for(let c=0;c<9;c++)if(userGrid[r]?.[c]?.value===0)allCands[getCellId(r,c)]=calculateCandidates(r,c); for (let bi = 0; bi < 9; bi++) { const bIdx = getBlockIndices(bi); const bCells = bIdx.map(([r,c])=>getCellId(r,c)); const bSet=new Set(bCells); for(let d=1;d<=9;d++){ const poss=bCells.filter(cid=>allCands[cid]?.has(d)); if(poss.length>=2&&poss.length<9){ const rows=new Set(),cols=new Set(); poss.forEach(cid=>{const crds=getCellCoords(cid);if(crds){rows.add(crds.r);cols.add(crds.c);}}); if(rows.size===1){const rIdx=rows.values().next().value;const elimInfo=tryEliminatePointing('Row',rIdx,bSet,d,allCands);if(elimInfo){console.log(`Pointing (Row): Digit ${d} in block ${bi} points @ row ${rIdx+1}`);return elimInfo;}} if(cols.size===1){const cIdx=cols.values().next().value;const elimInfo=tryEliminatePointing('Col',cIdx,bSet,d,allCands);if(elimInfo){console.log(`Pointing (Col): Digit ${d} in block ${bi} points @ col ${cIdx+1}`);return elimInfo;}}}} } return null;}
    function tryEliminatePointing(unitType, unitIndex, blockCellIds, digit, allCandidatesMap) { const elims=[]; const unitIndices=unitType==='Row'?getRowIndices(unitIndex):getColIndices(unitIndex); for(const[r,c] of unitIndices){ const cellId=getCellId(r,c); if(!blockCellIds.has(cellId)){ if(userGrid[r]?.[c]?.value===0&&allCandidatesMap[cellId]?.has(digit)) elims.push(cellId); } } return elims.length>0?{type:'pointing',unitType,unitIndex,digit,eliminations:elims,technique:"Pointing Candidates"}:null;}
    function findBoxLineReduction() { if (currentMode !== 'classic') return null; const allCands = {}; for (let r = 0; r < 9; r++) { for (let c = 0; c < 9; c++) { if (userGrid[r]?.[c]?.value === 0) allCands[getCellId(r, c)] = calculateCandidates(r, c); } } for (let i = 0; i < 9; i++) { const rowRes = checkReductionInLine('Row', i, getRowIndices(i), allCands); if (rowRes) return rowRes; const colRes = checkReductionInLine('Col', i, getColIndices(i), allCands); if (colRes) return colRes; } return null; }
    function checkReductionInLine(lineType, lineIndex, lineIndices, allCandidatesMap) { for (let d = 1; d <= 9; d++) { const possibleCellsInLine = lineIndices.filter(([r, c]) => allCandidatesMap[getCellId(r, c)]?.has(d)); if (possibleCellsInLine.length >= 2 && possibleCellsInLine.length < 9) { let targetBlockIndex = -1; let confinedToBlock = true; for (let i = 0; i < possibleCellsInLine.length; i++) { const [r, c] = possibleCellsInLine[i]; const blockIndex = Math.floor(r / 3) * 3 + Math.floor(c / 3); if (i === 0) { targetBlockIndex = blockIndex; } else if (targetBlockIndex !== blockIndex) { confinedToBlock = false; break; } } if (confinedToBlock && targetBlockIndex !== -1) { const elimInfo = tryEliminateBoxLine(targetBlockIndex, lineType, lineIndex, d, allCandidatesMap); if (elimInfo) { console.log(`Box/Line Reduction: Digit ${d} in ${lineType} ${lineIndex+1} confined to block ${targetBlockIndex}`); return elimInfo; } } } } return null; }
    function tryEliminateBoxLine(targetBlockIndex, lineType, lineIndex, digit, allCandidatesMap) { const elims=[]; const blockIndices = getBlockIndices(targetBlockIndex); for (const [r, c] of blockIndices) { const isOutsideLine = (lineType === 'Row' && r !== lineIndex) || (lineType === 'Col' && c !== lineIndex); if (isOutsideLine) { const cellId = getCellId(r, c); if (userGrid[r]?.[c]?.value === 0 && allCandidatesMap[cellId]?.has(digit)) { elims.push(cellId); } } } return elims.length > 0 ? { type: 'boxLine', targetBlockIndex, lineType, lineIndex, digit, eliminations: elims, technique: "Box/Line Reduction" } : null;}
    function applyFoundSingle(foundInfo) { if (!foundInfo) return false; const { r, c, digit } = foundInfo; if (userGrid[r]?.[c]?.value === 0) { console.log(`Apply Single: [${r},${c}]=${digit}`); pushHistoryState(); userGrid[r][c].value = digit; if (userGrid[r][c].notes) userGrid[r][c].notes.clear(); renderCell(r, c); const el = boardElement?.querySelector(`.cell[data-row='${r}'][data-col='${c}']`); if(el){ clearSelection(); selectedCell = el; selectedRow = r; selectedCol = c; el.classList.add('selected'); highlightRelatedCells(r, c); const hc=getComputedStyle(document.documentElement).getPropertyValue('--highlight-hint-flash').trim()||'#fffacd';el.style.transition='background-color 0.1s ease-out';el.style.backgroundColor=hc;setTimeout(()=>{if(selectedCell===el){el.style.backgroundColor='';el.style.transition='';}}, 600); } return true; } else { console.warn(`Tried apply Single ${digit} to filled [${r},${c}]`); return false; } }
    function applyNakedGroupElimination(elimInfo) { if (!elimInfo || !elimInfo.digits || !elimInfo.cells) return false; const { unitType, unitIndex, cells, digits, technique } = elimInfo; console.log(`Apply ${technique} Elim: Digits ${digits.join(',')} in ${unitType} ${getUnitIndexForDisplay(unitIndex)}`); const unitIndices = getUnitIndices(unitIndex); const groupCellsSet = new Set(cells); let eliminated = false; let changes = []; for (const [r, c] of unitIndices) { const cellId = getCellId(r, c); if (!groupCellsSet.has(cellId) && userGrid[r]?.[c]?.value === 0) { const cellData = userGrid[r][c]; if (!cellData.notes) cellData.notes = calculateCandidates(r, c) || new Set(); const origNotes = new Set(cellData.notes); let cellChanged = false; digits.forEach(digit => { if (cellData.notes.has(digit)) { cellData.notes.delete(digit); eliminated = true; cellChanged = true; } }); if (cellChanged) { changes.push({r, c, notesBefore: origNotes, notesAfter: new Set(cellData.notes)}); renderCell(r, c); } } } if(eliminated){ pushHistoryState(); saveGameState(); updateLogicSolverButtonsState(); } return eliminated; }
    function applyPointingBoxLineElimination(elimInfo) { if (!elimInfo || !elimInfo.eliminations) return false; const { digit, eliminations, technique, unitType, unitIndex, targetBlockIndex } = elimInfo; if (technique === 'Pointing Candidates') console.log(`Apply Pointing Elim: Remove ${digit} from ${unitType} ${unitIndex+1} outside block`); else console.log(`Apply Box/Line Elim: Remove ${digit} from block ${targetBlockIndex} outside ${unitType} ${unitIndex+1}`); let eliminated = false; let changes = []; eliminations.forEach(cellId => { const coords = getCellCoords(cellId); if(coords){ const {r,c}=coords; if(userGrid[r]?.[c]?.value === 0){ if(!userGrid[r][c].notes) userGrid[r][c].notes = calculateCandidates(r,c) || new Set(); if(userGrid[r][c].notes.has(digit)){ const orig = new Set(userGrid[r][c].notes); userGrid[r][c].notes.delete(digit); eliminated = true; changes.push({r,c, notesBefore: orig, notesAfter: new Set(userGrid[r][c].notes)}); console.log(`  - Removing candidate ${digit} from notes of ${cellId}`); renderCell(r,c); } } } }); if(eliminated){ pushHistoryState(); saveGameState(); updateLogicSolverButtonsState(); } return eliminated; }

    /** Выполняет ОДИН шаг логического решателя */
    function doLogicStep() {
         console.log("%c--- Logic Step ---", "color: green; font-weight: bold;");
         if (currentMode !== 'classic') return showError("Логика только для классики.");
         if (isGameSolved()) return showSuccess("Судоку уже решено!");
         clearErrors();
         let appliedInfo = null;
         const techniques = [ { name: "Naked Single", findFunc: findNakedSingle, applyFunc: applyFoundSingle }, { name: "Hidden Single", findFunc: findHiddenSingle, applyFunc: applyFoundSingle }, { name: "Pointing Candidates", findFunc: findPointingCandidates, applyFunc: applyPointingBoxLineElimination }, { name: "Box/Line Reduction", findFunc: findBoxLineReduction, applyFunc: applyPointingBoxLineElimination }, { name: "Naked Pair", findFunc: findNakedPair, applyFunc: applyNakedGroupElimination }, { name: "Naked Triple", findFunc: findNakedTriple, applyFunc: applyNakedGroupElimination }, ];
         for (const tech of techniques) { console.log(`Searching ${tech.name}...`); appliedInfo = tech.findFunc(); if (appliedInfo) { if (tech.applyFunc(appliedInfo)) { break; } else { appliedInfo = null; } } }
         if (appliedInfo) { const tech = appliedInfo.technique || "Elimination"; const details = appliedInfo.digit && appliedInfo.r !== undefined ? `${appliedInfo.digit} в [${getCellId(appliedInfo.r, appliedInfo.c)}]` : appliedInfo.digits && appliedInfo.cells ? `цифры ${appliedInfo.digits.join(',')} в ${getUnitType(appliedInfo.unitIndex)} ${getUnitIndexForDisplay(appliedInfo.unitIndex)}` : appliedInfo.digit && appliedInfo.eliminations ? `цифра ${appliedInfo.digit} (убраны кандидаты)` : "Неизвестное действие"; showSuccess(`Применено ${tech}: ${details}`); saveGameState(); }
         else { showError("Не найдено следующих логических шагов."); }
         updateLogicSolverButtonsState();
    }

    /** Запускает логический решатель до упора */
    function runLogicSolver() {
         console.log("%c--- Running Logic Solver ---", "color: green; font-weight: bold;");
         if (currentMode !== 'classic') { showError("Логика только для классики."); return; }
         if (isGameSolved()) { showSuccess("Судоку уже решено!"); return; }
         if (isLogicSolverRunning) { console.log("Solver already running."); return; }

         isLogicSolverRunning = true; updateLogicSolverButtonsState();
         statusMessageElement.textContent = "Решаю..."; statusMessageElement.className = '';
         let stepsMade = 0; let actionFound = true; let lastActionType = '';
         const techniques = [ { name: "Naked Single", findFunc: findNakedSingle, applyFunc: applyFoundSingle }, { name: "Hidden Single", findFunc: findHiddenSingle, applyFunc: applyFoundSingle }, { name: "Pointing Candidates", findFunc: findPointingCandidates, applyFunc: applyPointingBoxLineElimination }, { name: "Box/Line Reduction", findFunc: findBoxLineReduction, applyFunc: applyPointingBoxLineElimination }, { name: "Naked Pair", findFunc: findNakedPair, applyFunc: applyNakedGroupElimination }, { name: "Naked Triple", findFunc: findNakedTriple, applyFunc: applyNakedGroupElimination }, ];

         function solverCycle() {
             if (isGameSolved() || !actionFound) { isLogicSolverRunning = false; updateLogicSolverButtonsState(); saveGameState(); if (isGameSolved()) showSuccess(`Решено за ${stepsMade} шаг(ов)!`); else showError(`Стоп после ${stepsMade} шагов. Последнее: ${lastActionType || 'N/A'}.`); return; }
             actionFound = false; let appliedInfo = null;
             for (const tech of techniques) { appliedInfo = tech.findFunc(); if (appliedInfo && tech.applyFunc(appliedInfo)) { actionFound = true; lastActionType = appliedInfo.technique || tech.name; break; } else { appliedInfo = null; } }
             if (actionFound) { stepsMade++; console.log(`Solver Step ${stepsMade}: Applied ${lastActionType}`); setTimeout(solverCycle, 10); }
             else { showError(`Стоп после ${stepsMade} шагов. Последнее: ${lastActionType || 'N/A'}.`); isLogicSolverRunning = false; updateLogicSolverButtonsState(); saveGameState(); }
         }
         solverCycle(); // Start
    }

     /** Обновляет состояние кнопок решателя */
     function updateLogicSolverButtonsState() { const enabled = currentMode === 'classic' && !isGameSolved() && !isLogicSolverRunning; if(logicStepButton) logicStepButton.disabled = !enabled; if(logicSolveButton) logicSolveButton.disabled = !enabled; /*...*/ }

    // --- Вспомогательные для логического решателя ---
    function getRowIndices(r){const i=[];for(let c=0;c<9;c++)i.push([r,c]);return i;} function getColIndices(c){const i=[];for(let r=0;r<9;r++)i.push([r,c]);return i;} function getBlockIndices(b){const sr=Math.floor(b/3)*3,sc=(b%3)*3,i=[];for(let r=0;r<3;r++)for(let c=0;c<3;c++)i.push([sr+r,sc+c]);return i;}
    function getAllUnitsIndices() { const allUnits = []; for (let i = 0; i < 9; i++) { allUnits.push(getRowIndices(i)); allUnits.push(getColIndices(i)); allUnits.push(getBlockIndices(i)); } return allUnits; }
    function getUnitType(index) { if (index < 9) return 'Row'; if (index < 18) return 'Col'; return 'Block'; }
    function getUnitIndexForDisplay(globalUnitIndex) { return (globalUnitIndex % 9) + 1; }


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
        numpad?.addEventListener('click', (e)=>{ const b=e.target.closest('button'); if (!b || isShowingAd || isGameSolved() || !selectedCell) return; if (currentMode === 'classic' && selectedCell.classList.contains('given')) return; if (b.id === 'note-toggle-button') { isNoteMode = !isNoteMode; updateNoteToggleButtonState(); return; } clearErrors(); if (!userGrid[selectedRow]?.[selectedCol]) return; const cd=userGrid[selectedRow][selectedCol]; let r=false,ch=false,p=false,fR=false; if (b.id === 'erase-button') { p=(cd.value!==0)||(cd.notes?.size>0); } else if (b.dataset.num) { const n=parseInt(b.dataset.num); if (isNoteMode) {p=(cd.value===0);} else {p=(cd.value!==n);} } if (p&&!isGameSolved()) { pushHistoryState(); } if (b.id === 'erase-button') { if (cd.value !== 0) { cd.value = 0; r = true; ch = true; } else if (cd.notes?.size > 0) { cd.notes.clear(); r = true; ch = true; fR = (currentMode === 'killer'); } } else if (b.dataset.num) { const n = parseInt(b.dataset.num); if (isNoteMode) { if (cd.value === 0) { if (!(cd.notes instanceof Set)) cd.notes = new Set(); if (cd.notes.has(n)) cd.notes.delete(n); else cd.notes.add(n); r = true; ch = true; fR = (currentMode === 'killer'); } } else { if (cd.value !== n) { cd.value = n; if (cd.notes) cd.notes.clear(); r = true; ch = true; } else { cd.value = 0; r = true; ch = true; } } } if (r) { if (fR) { console.log("Note changed, forcing full renderBoard."); renderBoard(); if (selectedRow !== -1 && selectedCol !== -1) { selectedCell = boardElement?.querySelector(`.cell[data-row='${selectedRow}'][data-col='${selectedCol}']`); if (selectedCell && !(currentMode === 'classic' && selectedCell.classList.contains('given'))) { selectedCell.classList.add('selected'); highlightRelatedCells(selectedRow, selectedCol); } else { selectedCell = null; selectedRow = -1; selectedCol = -1; } } } else { renderCell(selectedRow, selectedCol); } } if (ch && !isGameSolved()){saveGameState(); updateLogicSolverButtonsState();} });
        checkButton?.addEventListener('click', checkGame);
        undoButton?.addEventListener('click', handleUndo);
        hintButton?.addEventListener('click', ()=>{if(isShowingAd||isGameSolved())return;if(currentMode==='classic'&&hintsRemaining>0)provideHintInternal();else if(currentMode==='classic')offerRewardedAdForHints();else showError("Подсказки недоступны");});
        exitGameButton?.addEventListener('click', ()=>{console.log("Exit btn");stopTimer();showScreen(initialScreen);checkContinueButton();});
        logicStepButton?.addEventListener('click', doLogicStep);
        logicSolveButton?.addEventListener('click', runLogicSolver);
        document.addEventListener('keydown', (e)=>{if(document.activeElement.tagName==='INPUT'||isShowingAd||!gameContainer?.classList.contains('visible')||isGameSolved())return; if(e.key.toLowerCase()==='n'||e.key.toLowerCase()==='т'){ console.log("N/T key pressed"); isNoteMode=!isNoteMode; updateNoteToggleButtonState(); e.preventDefault(); return; } if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();handleUndo();return;} if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){ if(!selectedCell){const sc=boardElement?.querySelector(`.cell[data-row='0'][data-col='0']`);if(sc)sc.click();else return;}let nr=selectedRow,nc=selectedCol;const mv=(cur,d,m)=>Math.min(m,Math.max(0,cur+d));if(e.key==='ArrowUp')nr=mv(selectedRow,-1,8);if(e.key==='ArrowDown')nr=mv(selectedRow,1,8);if(e.key==='ArrowLeft')nc=mv(selectedCol,-1,8);if(e.key==='ArrowRight')nc=mv(selectedCol,1,8);if(nr!==selectedRow||nc!==selectedCol){const nextEl=boardElement?.querySelector(`.cell[data-row='${nr}'][data-col='${nc}']`);if(nextEl)nextEl.click();}e.preventDefault();return; } if(!selectedCell||(currentMode==='classic'&&selectedCell.classList.contains('given')))return; if(!userGrid[selectedRow]?.[selectedCol])return; const cd=userGrid[selectedRow][selectedCol]; let r=false,ch=false,p=false,fR=false; if(e.key>='1'&&e.key<='9'){ const n=parseInt(e.key); if(isNoteMode){p=(cd.value===0);}else{p=(cd.value!==n);} } else if(e.key==='Backspace'||e.key==='Delete'){ p=(cd.value!==0)||(cd.notes?.size>0); } if(p&&!isGameSolved()){pushHistoryState();} if(e.key>='1'&&e.key<='9'){ clearErrors();const n=parseInt(e.key); if(isNoteMode){ if(cd.value===0){if(!(cd.notes instanceof Set))cd.notes=new Set();if(cd.notes.has(n))cd.notes.delete(n);else cd.notes.add(n);r=true;ch=true;fR=(currentMode==='killer');} } else{ if(cd.value!==n){cd.value=n;if(cd.notes)cd.notes.clear();r=true;ch=true;}else{cd.value=0;r=true;ch=true;} } e.preventDefault(); } else if(e.key==='Backspace'||e.key==='Delete'){ clearErrors(); if(cd.value!==0){cd.value=0;r=true;ch=true;} else if(cd.notes?.size>0){cd.notes.clear();r=true;ch=true;fR=(currentMode==='killer');} e.preventDefault(); } if(r){ if(fR){ console.log("Note changed by key, forcing full renderBoard."); renderBoard(); if(selectedRow!==-1&&selectedCol!==-1){selectedCell=boardElement?.querySelector(`.cell[data-row='${selectedRow}'][data-col='${selectedCol}']`);if(selectedCell&&!(currentMode==='classic'&&selectedCell.classList.contains('given'))){selectedCell.classList.add('selected');highlightRelatedCells(selectedRow,selectedCol);}else{selectedCell=null;selectedRow=-1;selectedCol=-1;}}} else{ renderCell(selectedRow,selectedCol); } } if(ch&&!isGameSolved()){saveGameState(); updateLogicSolverButtonsState();} });

        console.log("Event listeners added.");
    }


    // --- Инициализация Приложения ---
    function initializeApp(){console.log("Init app...");try{loadThemePreference();checkContinueButton();addEventListeners();showScreen(initialScreen);initializeAds();try{if(window.Telegram?.WebApp)Telegram.WebApp.ready();else console.log("TG SDK not found.");}catch(e){console.error("TG SDK Err:",e);}}catch(e){console.error("CRITICAL INIT ERR:",e);document.body.innerHTML=`<div style='padding:20px;color:red;'><h1>Ошибка!</h1><p>${e.message}</p><pre>${e.stack}</pre></div>`;}}
    function checkContinueButton(){if(!continueGameButton)return;try{const s=loadGameState();continueGameButton.disabled=!s;console.log(`Continue btn state:${!continueGameButton.disabled}`);}catch(e){console.error("Err check cont:",e);continueGameButton.disabled=true;}}

    // --- Запуск ---
    initializeApp();

}); // Конец 'DOMContentLoaded'
