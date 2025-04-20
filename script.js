// Убедитесь, что файлы sudoku.js И killerSudoku.js подключены в index.html ПЕРЕД этим скриптом.

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed.");

    // --- Получение ссылок на ЭКРАНЫ и основные кнопки ---
    const initialScreen = document.getElementById('initial-screen');
    const newGameOptionsScreen = document.getElementById('new-game-options');
    const gameContainer = document.getElementById('game-container');
    const startNewGameButton = document.getElementById('start-new-game-button');
    const continueGameButton = document.getElementById('continue-game-button');
    // --- Контейнеры для выбора ---
    const gameModeSelectionContainer = document.getElementById('game-mode-selection'); // <<< Убедитесь, что этот ID есть в HTML
    const difficultyButtonsContainer = newGameOptionsScreen?.querySelector('.difficulty-selection'); // Добавил ? для безопасности

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

    // --- Проверки на null ---
    if (!initialScreen || !newGameOptionsScreen || !gameContainer || !startNewGameButton || !continueGameButton || !gameModeSelectionContainer || !difficultyButtonsContainer || !themeToggleCheckbox || !backToInitialButton || !exitGameButton || !boardElement || !checkButton || !hintButton || !undoButton || !statusMessageElement || !numpad || !noteToggleButton || !timerElement) {
        console.error("CRITICAL ERROR: One or more essential HTML elements are missing!");
        document.body.innerHTML = "<p style='color:red; font-size: 20px;'>Ошибка: Не найдены все необходимые элементы интерфейса.</p>";
        return; // Остановить выполнение скрипта
    }


    // --- Ключи для localStorage ---
    const SAVE_KEY = 'sudokuGameState';
    const THEME_KEY = 'sudokuThemePreference';

    // --- Переменные состояния игры ---
    let currentMode = "classic"; // "classic" or "killer"
    let currentDifficulty = 'medium';
    let currentPuzzle = null;
    let currentSolution = null;
    let currentCageData = null;
    let currentSolverData = null;
    let userGrid = [];
    let selectedCell = null; let selectedRow = -1; let selectedCol = -1;
    let isNoteMode = false; let timerInterval = null; let secondsElapsed = 0;
    let historyStack = [];

    // --- Переменные для подсказок ---
    const MAX_HINTS = 3;
    let hintsRemaining = MAX_HINTS;

    // === ПЛЕЙСХОЛДЕРЫ ДЛЯ SDK РЕКЛАМЫ ===
    // ... (без изменений) ...
    let isAdReady = false; let isShowingAd = false;
    function initializeAds() { console.log("ADS Init..."); setTimeout(() => { preloadRewardedAd(); }, 2000); }
    function preloadRewardedAd() { if (isAdReady || isShowingAd) return; console.log("ADS Load..."); isAdReady = false; setTimeout(() => { if (!isShowingAd) { isAdReady = true; console.log("ADS Ready."); } else { console.log("ADS Load aborted (showing)."); } }, 3000 + Math.random() * 2000); }
    function showRewardedAd(callbacks) { if (!isAdReady || isShowingAd) { console.log("ADS Not ready/Showing."); if (callbacks.onError) callbacks.onError("Реклама не готова."); preloadRewardedAd(); return; } console.log("ADS Show..."); isShowingAd = true; isAdReady = false; if(statusMessageElement) { statusMessageElement.textContent = "Показ рекламы..."; statusMessageElement.className = ''; } document.body.style.pointerEvents = 'none'; setTimeout(() => { const success = Math.random() > 0.2; document.body.style.pointerEvents = 'auto'; if(statusMessageElement) statusMessageElement.textContent = ""; isShowingAd = false; console.log("ADS Show End."); if (success) { console.log("ADS Success!"); if (callbacks.onSuccess) callbacks.onSuccess(); } else { console.log("ADS Error/Skip."); if (callbacks.onError) callbacks.onError("Реклама не загружена / пропущена."); } preloadRewardedAd(); }, 5000); }


    // --- Функции Управления Экранами ---
    // ... (без изменений) ...
    function showScreen(screenToShow) { [initialScreen, newGameOptionsScreen, gameContainer].forEach(s => s?.classList.remove('visible')); if(screenToShow)screenToShow.classList.add('visible'); else console.error("showScreen: null screen!");}

    // --- Функции Темы ---
    // ... (без изменений) ...
    function applyTheme(theme) { const iD = theme === 'dark'; document.body.classList.toggle('dark-theme', iD); if (themeToggleCheckbox) themeToggleCheckbox.checked = iD; console.log(`Theme: ${theme}`); /* TG omitted */ }
    function loadThemePreference() { try { const sT=localStorage.getItem(THEME_KEY); applyTheme(sT||'light'); } catch(e){ console.error("Err theme load:",e); applyTheme('light');}}
    function handleThemeToggle() { if (!themeToggleCheckbox) return; const nT=themeToggleCheckbox.checked?'dark':'light'; applyTheme(nT); try { localStorage.setItem(THEME_KEY, nT); } catch(e){console.error("Err theme save:",e);}}

    // --- Инициализация ИГРЫ ---
    function initGame(mode = "classic", difficultyOrState, restoreState = null) {
        console.log(`InitGame: mode=${mode}, difficulty/state=${difficultyOrState}, restore=${!!restoreState}`);
        // --- Проверка зависимостей ---
        if (mode === "classic" && typeof sudoku === 'undefined') return showError("Ошибка: sudoku.js не загружен!");
        if (mode === "killer" && typeof killerSudoku === 'undefined') return showError("Ошибка: killerSudoku.js не загружен!");

        currentMode = mode;
        stopTimer();
        historyStack = []; updateUndoButtonState();
        isNoteMode = false; updateNoteToggleButtonState();
        clearSelection(); clearErrors();
        statusMessageElement.textContent = ''; statusMessageElement.className = '';
        currentPuzzle = null; currentSolution = null; currentCageData = null; currentSolverData = null; userGrid = [];

        if (restoreState) {
            console.log("Restoring game state...");
            try {
                currentMode = restoreState.mode || "classic";
                currentDifficulty = restoreState.difficulty || 'medium';
                secondsElapsed = restoreState.time || 0;
                hintsRemaining = restoreState.hints !== undefined ? restoreState.hints : MAX_HINTS;
                userGrid = restoreState.grid.map(row => row.map(cell => ({ value: cell.value, notes: new Set(cell.notesArray || []) })));

                if (currentMode === "classic") {
                    currentPuzzle = restoreState.puzzle;
                    currentSolution = restoreState.solution;
                    if (!currentPuzzle || !currentSolution || userGrid.length !== 9) throw new Error("Invalid classic save data.");
                } else if (currentMode === "killer") {
                    currentCageData = restoreState.cageData;
                    if (!currentCageData || !Array.isArray(currentCageData.cages)) throw new Error("Invalid killer save data (cages).");
                     console.log("Restored cages, re-initializing solver data..."); // DEBUG
                    const solverInitResult = killerSudoku._initializeSolverData(currentCageData.cages);
                    if (!solverInitResult) throw new Error("Failed to re-initialize solver data from saved cages.");
                    currentSolverData = solverInitResult;
                     console.log("Solver data re-initialized from save."); // DEBUG
                } else throw new Error("Unknown game mode in save: " + currentMode);
                console.log("Game state restored.");
            } catch (error) {
                console.error("Restore Err:", error); showError("Ошибка загрузки. Новая игра."); clearSavedGameState(); return initGame("classic", "medium");
            }
        } else { // Генерация новой игры
            currentDifficulty = difficultyOrState;
            secondsElapsed = 0; hintsRemaining = MAX_HINTS;
            clearSavedGameState(); // Clear previous save

            if (currentMode === "classic") {
                console.log(`Generating CLASSIC: diff=${currentDifficulty}...`);
                try {
                    if (!sudoku.generate || !sudoku.solve) throw new Error("sudoku.js generate/solve missing");
                    currentPuzzle = sudoku.generate(currentDifficulty);
                    if (!currentPuzzle) throw new Error("Classic generator returned null");
                    currentSolution = sudoku.solve(currentPuzzle);
                    if (!currentSolution) throw new Error("Classic solver failed");
                    userGrid = boardStringToObjectArray(currentPuzzle);
                    console.log("New classic game generated.");
                } catch (error) { console.error("Gen Classic Err:", error); showError(`Ошибка генерации (Классика): ${error.message}`); return; }
            } else if (currentMode === "killer") {
                console.log(`Generating KILLER: diff=${currentDifficulty}...`);
                try {
                    if (!killerSudoku.generate) throw new Error("killerSudoku.js generate missing");
                     console.log("Calling killerSudoku.generate..."); // DEBUG
                    const generatedPuzzle = killerSudoku.generate(currentDifficulty);
                     console.log("killerSudoku.generate result:", generatedPuzzle); // DEBUG
                    if (!generatedPuzzle || !generatedPuzzle.cages) throw new Error("Killer generator failed (no cage data)");
                    currentCageData = generatedPuzzle;

                     console.log("Initializing solver data for new Killer puzzle..."); // DEBUG
                    const solverInitResult = killerSudoku._initializeSolverData(currentCageData.cages);
                     console.log("Solver init result:", solverInitResult); // DEBUG
                    if (!solverInitResult) throw new Error("Generated killer cages failed validation/init");
                    currentSolverData = solverInitResult;
                    userGrid = boardStringToObjectArray(killerSudoku.BLANK_BOARD); // Killer starts empty
                    console.log("New killer game generated.");
                } catch (error) { console.error("Gen Killer Err:", error); showError(`Ошибка генерации (Killer): ${error.message}`); return; }
            }
        }

        console.log("Rendering board...");
        renderBoard();
        updateHintButtonState(); updateUndoButtonState(); updateTimerDisplay();
        showScreen(gameContainer);
        console.log("Scheduling timer start...");
        setTimeout(() => { console.log("setTimeout: starting timer."); startTimer(); }, 50);
        console.log("Game init complete.");
    }

    // --- Функции сохранения/загрузки состояния ---
    // ... (save/load/clear с mode и cageData, как в предыдущем ответе) ...
    function saveGameState() { if(!userGrid||userGrid.length!==9)return; console.log(`Saving: ${currentMode}`); try{ const grid=userGrid.map(r=>r.map(c=>({value:c.value,notesArray:Array.from(c.notes||[])}))); const state={mode:currentMode,difficulty:currentDifficulty,grid:grid,time:secondsElapsed,hints:hintsRemaining,timestamp:Date.now(),puzzle:currentMode==='classic'?currentPuzzle:null,solution:currentMode==='classic'?currentSolution:null,cageData:currentMode==='killer'?currentCageData:null}; localStorage.setItem(SAVE_KEY,JSON.stringify(state));}catch(e){console.error("Save Err:",e);showError("Ошибка сохранения");}}
    function loadGameState() { const d=localStorage.getItem(SAVE_KEY);if(!d)return null;try{const s=JSON.parse(d);if(s&&typeof s==='object'&&s.mode&&s.difficulty&&Array.isArray(s.grid)&&typeof s.timestamp==='number'&&(s.mode==='classic'?!(!s.puzzle||!s.solution):true)&&(s.mode==='killer'?!(!s.cageData||!s.cageData.cages):true)){console.log("Save found:",new Date(s.timestamp).toLocaleString(),`Mode:${s.mode}`,`Diff:${s.difficulty}`);return s;}else{console.warn("Invalid save data. Clearing.",s);clearSavedGameState();return null;}}catch(e){console.error("Parse Save Err:",e);clearSavedGameState();return null;}}
    function clearSavedGameState() { try{localStorage.removeItem(SAVE_KEY); console.log("Save cleared."); checkContinueButton();}catch(e){console.error("Err clr save:",e);}}

    // --- Функции для Undo ---
    // ... (create/push/handle/update без изменений) ...
    function createHistoryState() { if(!userGrid||userGrid.length!==9)return null;const grid=userGrid.map(r=>r.map(c=>({value:c.value,notes:new Set(c.notes||[])})));return{grid:grid,hints:hintsRemaining};}
    function pushHistoryState() { const s=createHistoryState();if(s){historyStack.push(s);updateUndoButtonState();}else{console.warn("Inv hist push");}}
    function handleUndo() { if(historyStack.length===0||isShowingAd)return;stopTimer();const ps=historyStack.pop();console.log("Undo...");try{userGrid=ps.grid;hintsRemaining=ps.hints;renderBoard();clearSelection();clearErrors();updateHintButtonState();updateUndoButtonState();saveGameState();console.log("Undo OK.");}catch(e){console.error("Undo Err:",e);showError("Ошибка отмены");historyStack=[];updateUndoButtonState();}finally{resumeTimerIfNeeded();}}
    function updateUndoButtonState() { if(undoButton)undoButton.disabled=historyStack.length===0;}

    // --- Функции для таймера ---
    // ... (start/stop/update/resume без изменений) ...
     function startTimer() { const v=gameContainer&&gameContainer.classList.contains('visible');if(timerInterval||!v)return;console.log("Timer starting...");updateTimerDisplay();timerInterval=setInterval(()=>{secondsElapsed++;updateTimerDisplay();if(secondsElapsed%10===0)saveGameState();},1000);console.log("Timer started:",timerInterval);}
     function stopTimer() { if(timerInterval){clearInterval(timerInterval);const o=timerInterval;timerInterval=null;console.log(`Timer stopped (${o}). Saving.`);saveGameState();}}
     function updateTimerDisplay() { if(!timerElement)return;const m=Math.floor(secondsElapsed/60),s=secondsElapsed%60;timerElement.textContent=`Время: ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}
     function resumeTimerIfNeeded() { const s=isGameSolved(),v=gameContainer&&gameContainer.classList.contains('visible');if(v&&!s)startTimer();else stopTimer();}

    // --- Преобразование строки/сетки ---
    // ... (boardStringToObjectArray без изменений) ...
    function boardStringToObjectArray(boardString){if(!boardString||typeof boardString!=='string')return[];const g=[];for(let r=0;r<9;r++){g[r]=[];for(let c=0;c<9;c++){const i=r*9+c;if(i>=boardString.length){g[r][c]={value:0,notes:new Set()};continue;}const h=boardString[i];const v=(h==='.'||h==='0'||!killerSudoku.DIGITS.includes(h))?0:parseInt(h);g[r][c]={value:v,notes:new Set()};}}return g;}

    // --- Отрисовка ---
    // ... (renderBoard, createCellElement с логикой Killer, как в пред. ответе) ...
    function renderBoard() {
        console.log(`Rendering board: ${currentMode}`);
        if (!boardElement) { console.error("Board el missing!"); return; }
        boardElement.innerHTML = '';
        if (!userGrid || userGrid.length !== 9) { showError("Invalid grid data"); return; }

        const cellElements = {};
        for (let r = 0; r < 9; r++) {
            if (!userGrid[r] || userGrid[r].length !== 9) continue;
            for (let c = 0; c < 9; c++) {
                const cellId = getCellId(r, c);
                if (!cellId) continue;
                const cellElement = createCellElement(r, c);
                boardElement.appendChild(cellElement);
                cellElements[cellId] = cellElement;
            }
        }

        if (currentMode === "killer" && currentSolverData?.cageDataArray) {
             console.log("Rendering cages...");
            currentSolverData.cageDataArray.forEach((cage, cageIndex) => {
                if (!cage || !Array.isArray(cage.cells) || cage.cells.length === 0) return;
                let anchorCellId = null, minRow = 9, minCol = 9;
                cage.cells.forEach(cellId => { const cc = getCellCoords(cellId); if(cc){if(cc.r<minRow){minRow=cc.r;minCol=cc.c;anchorCellId=cellId;}else if(cc.r===minRow&&cc.c<minCol){minCol=cc.c;anchorCellId=cellId;}}});

                if (anchorCellId && cellElements[anchorCellId]) {
                    cellElements[anchorCellId].classList.add('cage-sum-anchor');
                    const sumSpan = document.createElement('span'); sumSpan.className = 'cage-sum'; sumSpan.textContent = cage.sum;
                    cellElements[anchorCellId].appendChild(sumSpan);
                } else if(cage.cells.length > 0) console.warn(`No anchor for cage ${cageIndex}`);

                const cageCellSet = new Set(cage.cells);
                cage.cells.forEach(cellId => {
                    const cellEl = cellElements[cellId]; if (!cellEl) return;
                    cellEl.classList.add('cage-cell');
                    const { r, c } = getCellCoords(cellId);
                    const ne = getNeighbors(r, c);
                    if (ne.right && cageCellSet.has(ne.right)) cellEl.classList.add('cage-inner-border-right');
                    if (ne.bottom && cageCellSet.has(ne.bottom)) cellEl.classList.add('cage-inner-border-bottom');
                    if (ne.left && cageCellSet.has(ne.left) && cellElements[ne.left]) cellElements[ne.left].classList.add('cage-inner-border-right');
                    if (ne.top && cageCellSet.has(ne.top) && cellElements[ne.top]) cellElements[ne.top].classList.add('cage-inner-border-bottom');
                });
            });
         }
         console.log("Render complete.");
    }
    function createCellElement(r,c){ /* ... (как в пред. ответе) ... */ const cell=document.createElement('div');cell.classList.add('cell');cell.dataset.row=r;cell.dataset.col=c;const cd=userGrid[r]?.[c];if(!cd){cell.textContent='?';return cell;}const vc=document.createElement('div');vc.classList.add('cell-value-container');const nc=document.createElement('div');nc.classList.add('cell-notes-container');if(cd.value!==0){vc.textContent=cd.value;vc.style.display='flex';nc.style.display='none';if(currentMode==='classic'&¤tPuzzle){const i=r*9+c;if(currentPuzzle[i]&¤tPuzzle[i]!=='.')cell.classList.add('given');}}else if(cd.notes instanceof Set&&cd.notes.size>0){vc.style.display='none';nc.style.display='grid';nc.innerHTML='';for(let n=1;n<=9;n++){const nd=document.createElement('div');nd.classList.add('note-digit');nd.textContent=cd.notes.has(n)?n:'';nc.appendChild(nd);}}else{vc.textContent='';vc.style.display='flex';nc.style.display='none';}cell.appendChild(vc);cell.appendChild(nc);if((c+1)%3===0&&c<8)cell.classList.add('thick-border-right');if((r+1)%3===0&&r<8)cell.classList.add('thick-border-bottom');return cell;}


    // --- Вспомогательные ---
    // ... (getCellCoords, getCellId, getNeighbors, showError, updateHintButtonState, etc.) ...
    function getSolutionValue(r,c){if(currentMode!=='classic'||!currentSolution)return null;const i=r*9+c;if(i>=currentSolution.length)return null;const char=currentSolution[i];return(char==='.'||char==='0')?0:parseInt(char);}
    function clearSelection(){if(selectedCell)selectedCell.classList.remove('selected');if(boardElement)boardElement.querySelectorAll('.cell.highlighted').forEach(c=>c.classList.remove('highlighted'));selectedCell=null;selectedRow=-1;selectedCol=-1;}
    function clearErrors(){if(boardElement)boardElement.querySelectorAll('.cell.incorrect').forEach(c=>c.classList.remove('incorrect'));if(statusMessageElement){statusMessageElement.textContent='';statusMessageElement.className='';}}
    function updateNoteToggleButtonState(){if(noteToggleButton){noteToggleButton.classList.toggle('active',isNoteMode);noteToggleButton.title=`Режим заметок (${isNoteMode?'ВКЛ':'ВЫКЛ'})`;}}
    function highlightRelatedCells(r,c){if(boardElement){boardElement.querySelectorAll('.cell.highlighted').forEach(el=>el.classList.remove('highlighted'));boardElement.querySelectorAll(`.cell[data-row='${r}'], .cell[data-col='${c}']`).forEach(el=>el.classList.add('highlighted'));}}
    function isGameSolved(){if(!userGrid||userGrid.length!==9)return false;return!userGrid.flat().some(c=>!c||c.value===0);}
    function getCellCoords(cellId){if(!cellId||cellId.length!==2)return null;const r=ROWS.indexOf(cellId[0]),c=COLS.indexOf(cellId[1]);if(r===-1||c===-1)return null;return{r,c};}
    function getCellId(r,c){if(r<0||r>8||c<0||c>8)return null;return ROWS[r]+COLS[c];}
    function getNeighbors(r,c){return{top:r>0?getCellId(r-1,c):null,bottom:r<8?getCellId(r+1,c):null,left:c>0?getCellId(r,c-1):null,right:c<8?getCellId(r,c+1):null};}
    function showError(msg){console.error("Error:",msg);if(statusMessageElement){statusMessageElement.textContent=msg;statusMessageElement.className='incorrect-msg';}}
    function showSuccess(msg){if(statusMessageElement){statusMessageElement.textContent=msg;statusMessageElement.className='correct';setTimeout(()=>clearErrors(),3000);}}
    function updateHintButtonState(){if(!hintButton)return;const s=isGameSolved();let canHint=false,title="";if(currentMode==='classic'){canHint=currentSolution&&!s;if(!currentSolution)title="Игра не загружена";else if(s)title="Решено";else if(hintsRemaining>0)title="Подсказка";else title=`+${HINTS_REWARD} (реклама)`;}else{canHint=false;title="Подсказки недоступны";}hintButton.disabled=!canHint;hintButton.title=title;hintButton.textContent=`💡 ${hintsRemaining}/${MAX_HINTS}`;if(currentMode==='killer')hintButton.disabled=true;else if(hintsRemaining<=0&&canHint)hintButton.disabled=false;}

    // --- Логика подсказки ---
    // ... (provideHintInternal, offerRewardedAdForHints без изменений логики, но с проверкой currentMode) ...
    function provideHintInternal(){if(currentMode!=='classic')return showError("Подсказки только в классике");if(!selectedCell)return showError("Выберите ячейку");/* ... остальная логика ... */}
    function offerRewardedAdForHints(){if(currentMode!=='classic'||isShowingAd)return;console.log("Offering ad...");if(confirm(`Подсказки зак-сь! Реклама за ${HINTS_REWARD} подсказку?`)){if(!isAdReady){showError("Реклама грузится...");preloadRewardedAd();return;}showRewardedAd({onSuccess:()=>{hintsRemaining+=HINTS_REWARD;updateHintButtonState();saveGameState();showSuccess(`+${HINTS_REWARD} подсказка!`);},onError:(msg)=>{showError(`Ошибка: ${msg||'Реклама?'} Подсказка не добавлена.`);}});}}

    // --- Логика Проверки ---
    // ... (checkGame, validateClassicSudoku, validateKillerSudoku, isUnitValid, getRow, getCol, getBlock как в пред. ответе) ...
    function checkGame(){console.log(`Check: ${currentMode}`);clearErrors();if(!userGrid||userGrid.length!==9)return;let isValid=false;let isComplete=!userGrid.flat().some(c=>!c||c.value===0);if(currentMode==="classic"){if(!currentSolution){showError("Нет решения!");return;}isValid=validateClassicSudoku();}else if(currentMode==="killer"){if(!currentSolverData){showError("Нет данных Killer!");return;}isValid=validateKillerSudoku();}if(isValid&&isComplete){showSuccess("Поздравляем! Решено верно!");stopTimer();clearSelection();updateHintButtonState();/* submitGameResult(); */}else if(!isValid){showError("Найдены ошибки.");}else{if(statusMessageElement){statusMessageElement.textContent="Пока верно, но не закончено.";statusMessageElement.className='';}}}
    function validateClassicSudoku(){let ok=true;for(let r=0;r<9;r++){for(let c=0;c<9;c++){const cd=userGrid[r][c];const el=boardElement?.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);if(!cd||!el||cd.value===0||el.classList.contains('given'))continue;const sv=getSolutionValue(r,c);if(cd.value!==sv){el.classList.add('incorrect');ok=false;}}}return ok;}
    function validateKillerSudoku(){let ok=true;const grid=userGrid.map(r=>r.map(c=>c.value));for(let i=0;i<9;i++){if(!isUnitValid(getRow(grid,i))||!isUnitValid(getCol(grid,i))||!isUnitValid(getBlock(grid,i))){console.warn("Classic rule violation");ok=false;/* Mark cells? */}}if(!ok)return false;if(!currentSolverData?.cageDataArray)return false;for(const cage of currentSolverData.cageDataArray){const vals=[];let sum=0;let complete=true;let els=[];for(const cid of cage.cells){const crds=getCellCoords(cid);if(!crds)continue;const v=grid[crds.r][crds.c];const el=boardElement?.querySelector(`.cell[data-row='${crds.r}'][data-col='${crds.c}']`);if(el)els.push(el);if(v===0){complete=false;}else{vals.push(v);sum+=v;}}if(new Set(vals).size!==vals.length){console.warn(`Cage ${cage.id} unique violation:`,vals);ok=false;els.forEach(e=>e.classList.add('incorrect'));}if(complete&&sum!==cage.sum){console.warn(`Cage ${cage.id} sum violation: got ${sum}, expected ${cage.sum}`);ok=false;els.forEach(e=>e.classList.add('incorrect'));}}return ok;}
    function isUnitValid(unit){const nums=unit.filter(n=>n!==0);return new Set(nums).size===nums.length;}
    function getRow(g,r){return g[r];} function getCol(g,c){return g.map(rw=>rw[c]);} function getBlock(g,b){const sr=Math.floor(b/3)*3,sc=(b%3)*3,bl=[];for(let r=0;r<3;r++)for(let c=0;c<3;c++)bl.push(g[sr+r][sc+c]);return bl;}

    // --- Обработчики Событий ---
    function addEventListeners() {
        console.log("Adding event listeners...");
        // 1. Стартовый Экран
        startNewGameButton?.addEventListener('click', () => { console.log("New Game btn"); showScreen(newGameOptionsScreen); });
        continueGameButton?.addEventListener('click', () => { console.log("Continue btn"); const s=loadGameState(); if(s){ initGame(s.mode, s.difficulty, s); } else { showError("Нет сохраненной игры."); continueGameButton.disabled = true; } });

        // 2. Экран Настроек Новой Игры
        gameModeSelectionContainer?.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-mode]');
            if (button) {
                 gameModeSelectionContainer.querySelectorAll('.selected').forEach(btn => btn.classList.remove('selected'));
                 button.classList.add('selected');
                 const selectedMode = button.dataset.mode;
                 // Запускаем с текущей выбранной сложностью
                 const selectedDifficulty = difficultyButtonsContainer?.querySelector('button.selected')?.dataset.difficulty || 'medium';
                 console.log(`Mode selected: ${selectedMode}, starting with diff: ${selectedDifficulty}`);
                 initGame(selectedMode, selectedDifficulty); // Запускаем игру
            }
        });
        difficultyButtonsContainer?.addEventListener('click', (event) => {
            const target = event.target.closest('button.difficulty-button');
            if (target && target.dataset.difficulty) {
                 difficultyButtonsContainer.querySelectorAll('.selected').forEach(btn => btn.classList.remove('selected'));
                 target.classList.add('selected');
                 const selectedDifficulty = target.dataset.difficulty;
                 // Запускаем с текущим выбранным режимом
                  const selectedMode = gameModeSelectionContainer?.querySelector('button.selected')?.dataset.mode || 'classic';
                 console.log(`Difficulty selected: ${selectedDifficulty}, starting with mode: ${selectedMode}`);
                  initGame(selectedMode, selectedDifficulty); // Запускаем игру
            }
        });
        themeToggleCheckbox?.addEventListener('change', handleThemeToggle);
        backToInitialButton?.addEventListener('click', () => { console.log("Back btn"); showScreen(initialScreen); checkContinueButton(); });

        // 3. Игровой Экран
        boardElement?.addEventListener('click', (e) => { const t = e.target.closest('.cell'); if (!t||isShowingAd||isGameSolved()) return; const r = parseInt(t.dataset.row), c = parseInt(t.dataset.col); if (isNaN(r) || isNaN(c)) return; if (t === selectedCell) clearSelection(); else { clearSelection(); selectedCell = t; selectedRow = r; selectedCol = c; if (!t.classList.contains('given')) t.classList.add('selected'); highlightRelatedCells(r, c); } clearErrors(); });
        numpad?.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || isShowingAd || isGameSolved()) return; if (b.id === 'note-toggle-button') { isNoteMode = !isNoteMode; updateNoteToggleButtonState(); return; } if (!selectedCell || selectedCell.classList.contains('given')) return; clearErrors(); if (!userGrid[selectedRow]?.[selectedCol]) return; const cd = userGrid[selectedRow][selectedCol]; let render = false, changed = false, potential = false; if (b.id === 'erase-button') { potential = (cd.value !== 0) || (cd.notes?.size > 0); } else if (b.dataset.num) { const n = parseInt(b.dataset.num); if (isNoteMode) potential = (cd.value === 0); else potential = (cd.value !== n); } if (potential) pushHistoryState(); if (b.id === 'erase-button') { if (cd.value !== 0) { cd.value = 0; render = true; changed = true; } else if (cd.notes?.size > 0) { cd.notes.clear(); render = true; changed = true; } } else if (b.dataset.num) { const n = parseInt(b.dataset.num); if (isNoteMode) { if (cd.value === 0) { if (!(cd.notes instanceof Set)) cd.notes = new Set(); if (cd.notes.has(n)) cd.notes.delete(n); else cd.notes.add(n); render = true; changed = true; } } else { if (cd.value !== n) { cd.value = n; if (cd.notes) cd.notes.clear(); render = true; changed = true; } else { cd.value = 0; render = true; changed = true; } } } if (render) renderCell(selectedRow, selectedCol); if (changed) saveGameState(); });
        checkButton?.addEventListener('click', checkGame);
        undoButton?.addEventListener('click', handleUndo);
        hintButton?.addEventListener('click', () => { if (isShowingAd||isGameSolved())return; if(currentMode==='classic'&&hintsRemaining>0)provideHintInternal(); else if(currentMode==='classic')offerRewardedAdForHints(); else showError("Подсказки недоступны"); });
        exitGameButton?.addEventListener('click', () => { console.log("Exit btn"); stopTimer(); showScreen(initialScreen); checkContinueButton(); });

        // Глобальный обработчик клавиатуры
        document.addEventListener('keydown', (e) => { if (document.activeElement.tagName === 'INPUT' || isShowingAd || !gameContainer?.classList.contains('visible') || isGameSolved()) return; if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();handleUndo();return;}if(e.key.toLowerCase()==='n'||e.key.toLowerCase()==='т'){isNoteMode=!isNoteMode;updateNoteToggleButtonState();e.preventDefault();return;}if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){if(!selectedCell){const sc=boardElement?.querySelector(`.cell[data-row='0'][data-col='0']`);if(sc)sc.click();else return;}let nr=selectedRow,nc=selectedCol;const mv=(cur,d,m)=>Math.min(m,Math.max(0,cur+d));if(e.key==='ArrowUp')nr=mv(selectedRow,-1,8);if(e.key==='ArrowDown')nr=mv(selectedRow,1,8);if(e.key==='ArrowLeft')nc=mv(selectedCol,-1,8);if(e.key==='ArrowRight')nc=mv(selectedCol,1,8);if(nr!==selectedRow||nc!==selectedCol){const nextEl=boardElement?.querySelector(`.cell[data-row='${nr}'][data-col='${nc}']`);if(nextEl)nextEl.click();}e.preventDefault();return;}if(!selectedCell||selectedCell.classList.contains('given'))return;if(!userGrid[selectedRow]?.[selectedCol])return;const cd=userGrid[selectedRow][selectedCol];let render=false,changed=false,potential=false;if(e.key>='1'&&e.key<='9'){const n=parseInt(e.key);if(isNoteMode)potential=(cd.value===0);else potential=(cd.value!==n);}else if(e.key==='Backspace'||e.key==='Delete'){potential=(cd.value!==0)||(cd.notes?.size>0);}if(potential)pushHistoryState();if(e.key>='1'&&e.key<='9'){clearErrors();const n=parseInt(e.key);if(isNoteMode){if(cd.value===0){if(!(cd.notes instanceof Set))cd.notes=new Set();if(cd.notes.has(n))cd.notes.delete(n);else cd.notes.add(n);render=true;changed=true;}}else{if(cd.value!==n){cd.value=n;if(cd.notes)cd.notes.clear();render=true;changed=true;}else{cd.value=0;render=true;changed=true;}}e.preventDefault();}else if(e.key==='Backspace'||e.key==='Delete'){clearErrors();if(cd.value!==0){cd.value=0;render=true;changed=true;}else if(cd.notes?.size>0){cd.notes.clear();render=true;changed=true;}e.preventDefault();}if(render)renderCell(selectedRow,selectedCol);if(changed)saveGameState(); });

        console.log("Event listeners added.");
    }


    // --- Инициализация Приложения ---
    function initializeApp() {
        console.log("Initializing application...");
        try {
            loadThemePreference();
            checkContinueButton();
            addEventListeners(); // Add listeners early
            showScreen(initialScreen); // Show initial screen
            initializeAds();
            try { if (window.Telegram?.WebApp) { Telegram.WebApp.ready(); console.log("TG SDK ready."); } else { console.log("TG SDK not found."); } } catch (e) { console.error("TG SDK Init Error:", e); }
            console.log("Application initialized successfully.");
        } catch (error) {
            console.error("CRITICAL ERROR during initialization:", error);
            document.body.innerHTML = `<div style="padding:20px;color:red;border:2px solid red;background:white;"><h1>Крит. ошибка!</h1><p>Не удалось запустить.</p><p>Детали: ${error.message}</p><pre>${error.stack}</pre></div>`;
        }
    }

    // Функция проверки кнопки "Продолжить"
    function checkContinueButton() { if(!continueGameButton)return; try{const s=loadGameState();continueGameButton.disabled=!s;console.log(`Continue btn state: ${!continueGameButton.disabled}`);}catch(e){console.error("Err check continue:",e);continueGameButton.disabled=true;}}

    // --- Запуск ---
    initializeApp();

}); // Конец 'DOMContentLoaded'
