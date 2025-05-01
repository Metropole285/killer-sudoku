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
    for (const key in essentialElements) { if (!essentialElements[key]) { const errorMsg = `Критическая ошибка: HTML элемент для '${key}' не найден!`; console.error(errorMsg); document.body.innerHTML = `<p style='color:red;font-size:18px; padding: 20px;'>${errorMsg}</p>`; return; } }
    console.log("Note Toggle Button Element on Load:", noteToggleButton);

    // --- Ключи localStorage ---
    const SAVE_KEY = 'sudokuGameState';
    const THEME_KEY = 'sudokuThemePreference';

    // --- Состояние Игры ---
    let currentMode = "classic"; let currentDifficulty = 'medium';
    let currentPuzzle = null, currentSolution = null, currentCageData = null, currentSolverData = null;
    let userGrid = [], historyStack = [];
    let selectedCell = null, selectedRow = -1, selectedCol = -1;
    let isNoteMode = false; let timerInterval = null, secondsElapsed = 0;
    const MAX_HINTS = 3; let hintsRemaining = MAX_HINTS;
    let isLogicSolverRunning = false;

    // === Placeholder Рекламы ===
    let isAdReady = false, isShowingAd = false; function initializeAds(){console.log("ADS Init...");setTimeout(()=>{preloadRewardedAd();},2000);} function preloadRewardedAd(){if(isAdReady||isShowingAd)return;console.log("ADS Load...");isAdReady=false;setTimeout(()=>{if(!isShowingAd){isAdReady=true;console.log("ADS Ready.");}else{console.log("ADS Load aborted (showing).");}},3000+Math.random()*2000);} function showRewardedAd(callbacks){if(!isAdReady||isShowingAd){console.log("ADS Not ready/Showing.");if(callbacks.onError)callbacks.onError("Реклама не готова.");preloadRewardedAd();return;}console.log("ADS Show...");isShowingAd=true;isAdReady=false;if(statusMessageElement){statusMessageElement.textContent="Показ рекламы...";statusMessageElement.className='';}document.body.style.pointerEvents='none';setTimeout(()=>{const success=Math.random()>0.2;document.body.style.pointerEvents='auto';if(statusMessageElement)statusMessageElement.textContent="";isShowingAd=false;console.log("ADS Show End.");if(success){console.log("ADS Success!");if(callbacks.onSuccess)callbacks.onSuccess();}else{console.log("ADS Error/Skip.");if(callbacks.onError)callbacks.onError("Реклама не загружена / пропущена.");}preloadRewardedAd();},5000);}

    // --- Функции Управления Экранами ---
    function showScreen(screenToShow) { [initialScreen, newGameOptionsScreen, gameContainer].forEach(s => s?.classList.remove('visible')); if(screenToShow) screenToShow.classList.add('visible'); else console.error("showScreen: null screen!"); }

    // --- Функции Темы ---
    function applyTheme(theme) { const iD=theme==='dark';document.body.classList.toggle('dark-theme',iD);if(themeToggleCheckbox)themeToggleCheckbox.checked=iD;console.log(`Theme set: ${theme}`);/*TG omit*/ }
    function loadThemePreference() { try{const sT=localStorage.getItem(THEME_KEY);applyTheme(sT||'light');}catch(e){console.error("Error loading theme:",e);applyTheme('light');}}
    function handleThemeToggle() { if(!themeToggleCheckbox)return;const nT=themeToggleCheckbox.checked?'dark':'light';applyTheme(nT);try{localStorage.setItem(THEME_KEY,nT);}catch(e){console.error("Error saving theme:",e);}}

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
    function highlightRelatedCells(row, col) { /* ... как раньше ... */ console.log(`Highlighting for [${row}, ${col}], mode: ${currentMode}`); if (!boardElement) return; boardElement.querySelectorAll('.cell.highlighted').forEach(el=>el.classList.remove('highlighted')); if (currentMode === 'killer' && currentSolverData && selectedCell) { const cellId = getCellId(row, col); if (!cellId) return; const cageIndex = currentSolverData.cellToCageMap[cellId]; if (cageIndex !== undefined) { const cage = currentSolverData.cageDataArray[cageIndex]; if (cage?.cells) { cage.cells.forEach(cId => { const coords = getCellCoords(cId); if(coords) boardElement.querySelector(`.cell[data-row='${coords.r}'][data-col='${coords.c}']`)?.classList.add('highlighted'); }); } } else { boardElement.querySelectorAll(`.cell[data-row='${row}'], .cell[data-col='${col}']`).forEach(el=>el.classList.add('highlighted')); } } else { boardElement.querySelectorAll(`.cell[data-row='${row}'], .cell[data-col='${col}']`).forEach(el=>el.classList.add('highlighted')); } const cellValue = userGrid[row]?.[col]?.value; if (cellValue && cellValue !== 0) { /*console.log(`Highlighting cells with value ${cellValue}`);*/ for (let r_=0;r_<9;r_++) { for (let c_=0;c_<9;c_++) { if (userGrid[r_]?.[c_]?.value === cellValue) { boardElement.querySelector(`.cell[data-row='${r_}'][data-col='${c_}']`)?.classList.add('highlighted'); }}}} }
    function updateHintButtonState(){if(!hintButton)return;/*console.log(`Upd hints. Mode:${currentMode}, Left:${hintsRemaining}`);*/const s=isGameSolved();let canHint=false,title="";if(currentMode==='classic'){canHint=currentSolution&&!s;if(!currentSolution)title="Н/Д";else if(s)title="Решено";else if(hintsRemaining>0)title="Подсказка";else title=`+${MAX_HINTS}(Ad)`;}else{canHint=false;title="Н/Д(Killer)";}hintButton.disabled=!canHint;hintButton.title=title;hintButton.textContent=`💡 ${hintsRemaining}/${MAX_HINTS}`;if(currentMode==='killer')hintButton.disabled=true;else if(hintsRemaining<=0&&canHint)hintButton.disabled=false;/*console.log(`Hint btn: disabled=${hintButton.disabled}, title='${hintButton.title}'`);*/}

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
            if (restoreState) {
                console.log("Restoring state...");
                currentMode = restoreState.mode || "classic"; currentDifficulty = restoreState.difficulty || 'medium'; secondsElapsed = restoreState.time || 0; hintsRemaining = restoreState.hints ?? MAX_HINTS; isNoteMode = restoreState.isNoteMode || false;
                userGrid = restoreState.grid.map(r => r.map(c => ({ value: c.value, notes: new Set(c.notesArray || []) })));
                if (currentMode === "classic") { currentPuzzle = restoreState.puzzle; currentSolution = restoreState.solution; if (!currentPuzzle || !currentSolution) throw new Error("Invalid classic save."); }
                else if (currentMode === "killer") { currentCageData = restoreState.cageData; if (!currentCageData?.cages) throw new Error("Invalid killer save (cages)."); console.log("Re-init solver data..."); currentSolverData = killerSudoku._initializeSolverData(currentCageData.cages); if (!currentSolverData) throw new Error("Fail re-init solver data."); console.log("Solver data re-init OK."); }
                else throw new Error("Unknown save mode: " + currentMode);
                console.log("Restore OK."); success = true;
            } else {
                secondsElapsed = 0; hintsRemaining = MAX_HINTS; clearSavedGameState();
                if (currentMode === "classic") { console.log(`Gen CLASSIC: ${currentDifficulty}...`); currentPuzzle = sudoku.generate(currentDifficulty); if (!currentPuzzle) throw new Error("Classic gen failed."); currentSolution = sudoku.solve(currentPuzzle); if (!currentSolution) throw new Error("Classic solve failed."); userGrid = boardStringToObjectArray(currentPuzzle); console.log("New classic OK."); success = true; }
                else if (currentMode === "killer") { console.log(`Gen KILLER: ${currentDifficulty}...`); console.log("Call killer.generate..."); const puzzle = killerSudoku.generate(currentDifficulty); console.log("Killer gen result:", puzzle); if (!puzzle?.cages) throw new Error("Killer gen failed (no cages)."); currentCageData = puzzle; console.log("Init solver data..."); currentSolverData = killerSudoku._initializeSolverData(currentCageData.cages); console.log("Solver init result:", currentSolverData); if (!currentSolverData) throw new Error("Cage validation/init failed."); userGrid = boardStringToObjectArray(killerSudoku.BLANK_BOARD); console.log("New killer OK."); success = true; }
            }
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
    function renderBoard() { /* ... как раньше ... */ console.log(`Render board start: mode=${currentMode}`); if (!boardElement) { console.error("Board element missing!"); return; } boardElement.innerHTML = ''; if (!userGrid || userGrid.length !== 9) { showError("Invalid grid data for rendering."); return; } const cellElementsMap = {}; for (let r = 0; r < 9; r++) { if (!userGrid[r] || userGrid[r].length !== 9) continue; for (let c = 0; c < 9; c++) { const cellId = getCellId(r, c); if (!cellId) continue; const cellElement = createCellElement(r, c); boardElement.appendChild(cellElement); cellElementsMap[cellId] = cellElement; } } if (currentMode === "killer" && currentSolverData?.cageDataArray) { /*console.log("Rendering Killer Cages...");*/ currentSolverData.cageDataArray.forEach((cage, cageIndex) => { if (!cage || !Array.isArray(cage.cells) || cage.cells.length === 0) { console.warn(`Skipping invalid cage data at index ${cageIndex}`); return; } const cageCellSet = new Set(cage.cells); let anchorCellId = null; let minRow = 9, minCol = 9; cage.cells.forEach(cellId => { const coords = getCellCoords(cellId); if (coords) { if (coords.r < minRow) { minRow = coords.r; minCol = coords.c; anchorCellId = cellId; } else if (coords.r === minRow && coords.c < minCol) { minCol = coords.c; anchorCellId = cellId; } } }); cage.cells.forEach(cellId => { const cellElement = cellElementsMap[cellId]; if (!cellElement) return; cellElement.classList.add('cage-cell'); if (cellId === anchorCellId) { cellElement.classList.add('cage-sum-anchor'); if (!cellElement.querySelector('.cage-sum')) { const sumSpan = document.createElement('span'); sumSpan.className = 'cage-sum'; sumSpan.textContent = cage.sum; cellElement.appendChild(sumSpan); } } const coords = getCellCoords(cellId); if (!coords) return; const { r, c } = coords; const neighbors = getNeighbors(r, c); if (r === 0 || !neighbors.top || !cageCellSet.has(neighbors.top)) { cellElement.classList.add('cage-inner-border-top'); } if (c === 0 || !neighbors.left || !cageCellSet.has(neighbors.left)) { cellElement.classList.add('cage-inner-border-left'); } if (r === 8 || !neighbors.bottom || !cageCellSet.has(neighbors.bottom)) { cellElement.classList.add('cage-inner-border-bottom'); } if (c === 8 || !neighbors.right || !cageCellSet.has(neighbors.right)) { cellElement.classList.add('cage-inner-border-right'); } }); }); /*console.log("Cage rendering finished.");*/ } console.log("Board rendering complete."); }
    function createCellElement(r, c) { const cell=document.createElement('div');cell.classList.add('cell'); cell.dataset.row=r;cell.dataset.col=c; const cd=userGrid[r]?.[c]; if(!cd){cell.textContent='?';console.warn(`Missing grid data for ${r},${c}`);return cell;} const vc=document.createElement('div');vc.classList.add('cell-value-container'); const nc=document.createElement('div');nc.classList.add('cell-notes-container'); if(cd.value!==0){ vc.textContent=cd.value;vc.style.display='flex';nc.style.display='none'; if(currentMode==='classic'&&currentPuzzle){ const i=r*9+c; if(currentPuzzle[i]&&currentPuzzle[i]!=='.')cell.classList.add('given'); } } else if(cd.notes instanceof Set&&cd.notes.size>0){ vc.style.display='none';nc.style.display='grid';nc.innerHTML=''; for(let n=1;n<=9;n++){const nd=document.createElement('div');nd.classList.add('note-digit');nd.textContent=cd.notes.has(n)?n:'';nc.appendChild(nd);} } else { vc.textContent='';vc.style.display='flex';nc.style.display='none'; } cell.appendChild(vc);cell.appendChild(nc); if((c+1)%3===0&&c<8)cell.classList.add('thick-border-right'); if((r+1)%3===0&&r<8)cell.classList.add('thick-border-bottom'); return cell; }
    function renderCell(r, c) { if (!boardElement) return; if (currentMode === 'killer' && userGrid[r]?.[c]?.value === 0) { console.log("Note changed in Killer mode, forcing full board render."); renderBoard(); if (selectedRow === r && selectedCol === c) { selectedCell = boardElement.querySelector(`.cell[data-row='${r}'][data-col='${c}']`); if (selectedCell) { selectedCell.classList.add('selected'); highlightRelatedCells(r, c); } else { selectedCell = null; selectedRow = -1; selectedCol = -1; } } return; } const oldCell = boardElement.querySelector(`.cell[data-row='${r}'][data-col='${c}']`); if (oldCell) { try { const newCell = createCellElement(r, c); oldCell.classList.forEach(cls => { if(cls!=='cell' && !cls.startsWith('thick-') && !cls.startsWith('cage-inner-')) newCell.classList.add(cls); }); ['cage-cell', 'cage-sum-anchor', 'cage-inner-border-top', 'cage-inner-border-bottom', 'cage-inner-border-left', 'cage-inner-border-right'].forEach(cls => { if (oldCell.classList.contains(cls)) newCell.classList.add(cls); }); const oldSum = oldCell.querySelector('.cage-sum'); if (oldSum) newCell.appendChild(oldSum.cloneNode(true)); if (selectedRow === r && selectedCol === c) selectedCell = newCell; oldCell.replaceWith(newCell); } catch (error) { console.error(`Error render cell [${r}, ${c}]:`, error); renderBoard(); } } else { console.warn(`renderCell: Cell [${r},${c}] not found? Render full.`); renderBoard(); } }

    // --- Логика подсказки ---
    function provideHintInternal(){if(currentMode!=='classic')return showError("Подсказки только в классике");if(!selectedCell)return showError("Выберите ячейку"); const r=selectedRow,c=selectedCol;if(r<0||c<0||!userGrid[r]?.[c])return showError("Ошибка данных ячейки"); if(userGrid[r][c].value!==0)return showError("Ячейка заполнена");if(selectedCell.classList.contains('given')) return showError("Начальная цифра");pushHistoryState();let hintUsed=false;try{const sv=getSolutionValue(r,c);if(sv===null)throw new Error("Решение недоступно");if(sv>0){console.log(`Hint [${r},${c}]: ${sv}`);userGrid[r][c].value=sv;if(userGrid[r][c].notes)userGrid[r][c].notes.clear();renderCell(r,c);const hEl=boardElement?.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);if(hEl){hEl.classList.remove('selected');const hc=getComputedStyle(document.documentElement).getPropertyValue('--highlight-hint-flash').trim()||'#fffacd';hEl.style.transition='background-color 0.1s ease-out';hEl.style.backgroundColor=hc;setTimeout(()=>{if(hEl){hEl.style.backgroundColor='';hEl.style.transition='';}clearSelection();},500);}else{clearSelection();}hintsRemaining--;hintUsed=true;updateHintButtonState();clearErrors();saveGameState();if(isGameSolved()){checkGame();updateLogicSolverButtonsState();}}else throw new Error(`Err getting solution [${r},${c}]`);}catch(e){console.error("Hint Err:",e.message);showError(e.message);if(!hintUsed&&historyStack.length>0){historyStack.pop();updateUndoButtonState();}}}
    function offerRewardedAdForHints(){if(currentMode!=='classic'||isShowingAd)return;console.log("Offering ad...");if(confirm(`Подсказки зак-сь! Реклама за ${MAX_HINTS} подсказку?`)){if(!isAdReady){showError("Реклама грузится...");preloadRewardedAd();return;}showRewardedAd({onSuccess:()=>{hintsRemaining+=MAX_HINTS;updateHintButtonState();saveGameState();showSuccess(`+${MAX_HINTS} подсказка!`);},onError:(msg)=>{showError(`Ошибка: ${msg||'Реклама?'} Подсказка не добавлена.`);}});}}

    // --- Логика Проверки ---
    function checkGame(){console.log(`Check: ${currentMode}`);clearErrors();if(!userGrid||userGrid.length!==9)return;let isValid=false;let isComplete=!userGrid.flat().some(c=>!c||c.value===0);if(currentMode==="classic"){if(!currentSolution){showError("Нет решения!");return;}isValid=validateClassicSudoku();}else if(currentMode==="killer"){if(!currentSolverData){showError("Нет данных Killer!");return;}isValid=validateKillerSudoku();}if(isValid&&isComplete){showSuccess("Поздравляем! Решено верно!");stopTimer();clearSelection();updateHintButtonState();updateLogicSolverButtonsState();}else if(!isValid){showError("Найдены ошибки.");}else{if(statusMessageElement){statusMessageElement.textContent="Пока верно, но не закончено.";statusMessageElement.className='';}}}
    function validateClassicSudoku(){let ok=true;if(!currentSolution){console.error("Classic valid Err: no solution!");return false;}for(let r=0;r<9;r++){for(let c=0;c<9;c++){const cd=userGrid[r]?.[c];const el=boardElement?.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);if(!cd||!el||cd.value===0||el.classList.contains('given'))continue;const sv=getSolutionValue(r,c);if(sv===null){console.error(`Classic valid Err: No sol value for ${r},${c}`);ok=false;break;}if(cd.value!==sv){el.classList.add('incorrect');ok=false;}}if(!ok)break;}return ok;}
    function validateKillerSudoku(){let ok=true;const grid=userGrid.map(r=>r.map(c=>c.value));for(let i=0;i<9;i++){if(!isUnitValid(getRow(grid,i))||!isUnitValid(getCol(grid,i))||!isUnitValid(getBlock(grid,i))){ok=false;break;}}if(!ok){showError("Нарушены правила Судоку.");return false;}if(!currentSolverData?.cageDataArray)return false;for(const cage of currentSolverData.cageDataArray){const vals=[];let sum=0;let complete=true;let els=[];for(const cid of cage.cells){const crds=getCellCoords(cid);if(!crds)continue;const v=grid[crds.r][crds.c];const el=boardElement?.querySelector(`.cell[data-row='${crds.r}'][data-col='${crds.c}']`);if(el)els.push(el);if(v===0){complete=false;}else{vals.push(v);sum+=v;}}if(new Set(vals).size!==vals.length){console.warn(`Cage ${cage.id} unique violation:`,vals);ok=false;els.forEach(e=>e.classList.add('incorrect'));}if(complete&&sum!==cage.sum){console.warn(`Cage ${cage.id} sum violation: got ${sum}, expected ${cage.sum}`);ok=false;els.forEach(e=>e.classList.add('incorrect'));}}return ok;}
    function isUnitValid(unit){const nums=unit.filter(n=>n!==0);return new Set(nums).size===nums.length;}
    function getRow(g,r){return g[r];} function getCol(g,c){return g.map(rw=>rw[c]);} function getBlock(g,b){const sr=Math.floor(b/3)*3,sc=(b%3)*3,bl=[];for(let r=0;r<3;r++)for(let c=0;c<3;c++)bl.push(g[sr+r][sc+c]);return bl;}

    // --- НОВЫЙ БЛОК: ЛОГИЧЕСКИЙ РЕШАТЕЛЬ (Классика) ---

    /**
     * Вычисляет возможных кандидатов для ячейки на основе соседей.
     * @param {number} r - Row index (0-8).
     * @param {number} c - Column index (0-8).
     * @returns {Set<number> | null} Set of candidate digits, or null if cell is filled.
     */
    function calculateCandidates(r, c) {
        if (userGrid[r]?.[c]?.value !== 0) return null; // Already filled

        let candidates = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);

        // Check row
        for (let col = 0; col < 9; col++) {
            if (userGrid[r]?.[col]?.value !== 0) {
                candidates.delete(userGrid[r][col].value);
            }
        }
        // Check column
        for (let row = 0; row < 9; row++) {
            if (userGrid[row]?.[c]?.value !== 0) {
                candidates.delete(userGrid[row][c].value);
            }
        }
        // Check block
        const startRow = Math.floor(r / 3) * 3;
        const startCol = Math.floor(c / 3) * 3;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if (userGrid[startRow + i]?.[startCol + j]?.value !== 0) {
                    candidates.delete(userGrid[startRow + i][startCol + j].value);
                }
            }
        }
        return candidates;
    }

    /**
     * Находит ОДНУ голую одиночку (Naked Single) на доске.
     * @returns {object | null} Объект { r, c, digit } или null.
     */
    function findNakedSingle() {
        if (currentMode !== 'classic') return null;
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (userGrid[r]?.[c]?.value === 0) {
                    const candidates = calculateCandidates(r, c);
                    if (candidates && candidates.size === 1) {
                        const digit = candidates.values().next().value; // Get the only digit
                        console.log(`Naked Single found: ${digit} at [${r}, ${c}]`);
                        return { r, c, digit };
                    }
                }
            }
        }
        return null;
    }

    /**
     * Находит ОДНУ скрытую одиночку (Hidden Single) на доске.
     */
    function findHiddenSingle() {
        if (currentMode !== 'classic') return null;
        // Calculate all candidates for all empty cells ONCE for efficiency
        const allCandidatesMap = {};
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                 if (userGrid[r]?.[c]?.value === 0) {
                      allCandidatesMap[getCellId(r, c)] = calculateCandidates(r, c);
                 }
            }
        }

        for (let i = 0; i < 9; i++) {
            // Check units (rows, cols, blocks)
            const rowResult = findHiddenSingleInUnit(getRowIndices(i), allCandidatesMap);
            if (rowResult) return rowResult;
            const colResult = findHiddenSingleInUnit(getColIndices(i), allCandidatesMap);
            if (colResult) return colResult;
            const blockResult = findHiddenSingleInUnit(getBlockIndices(i), allCandidatesMap);
            if (blockResult) return blockResult;
        }
        return null;
    }

    /**
     * Ищет Hidden Single внутри заданного юнита, используя предрассчитанных кандидатов.
     */
    function findHiddenSingleInUnit(unitIndices, allCandidatesMap) {
        for (let digit = 1; digit <= 9; digit++) {
            let possiblePlaces = [];
            let digitAlreadyPresent = false;

            for (const [r, c] of unitIndices) {
                const cellData = userGrid[r]?.[c];
                if (!cellData) continue;

                if (cellData.value === digit) { digitAlreadyPresent = true; break; }
                if (cellData.value === 0) {
                    const cellId = getCellId(r, c);
                    const candidates = allCandidatesMap[cellId]; // Use pre-calculated candidates
                    if (candidates && candidates.has(digit)) {
                        possiblePlaces.push([r, c]);
                    }
                }
            }

            if (!digitAlreadyPresent && possiblePlaces.length === 1) {
                const [r, c] = possiblePlaces[0];
                console.log(`Hidden Single found: Digit ${digit} in cell [${r}, ${c}] (unit check)`);
                return { r, c, digit };
            }
        }
        return null;
    }

    /**
     * Находит ОДНУ голую пару (Naked Pair) в юните.
     * Возвращает информацию для удаления кандидатов.
     * @returns {object | null} { unitType:string, unitIndex:number, cells:string[2], digits:number[2] } or null.
     */
    function findNakedPair() {
        if (currentMode !== 'classic') return null;
        const units = getAllUnitsIndices(); // Получаем все юниты

        for (let i = 0; i < units.length; i++) {
            const unitIndices = units[i];
            const cellsWithTwoCandidates = []; // Store { r, c, cands: Set<number> }

            // Находим все ячейки с 2 кандидатами в юните
            for (const [r, c] of unitIndices) {
                if (userGrid[r]?.[c]?.value === 0) {
                    const candidates = calculateCandidates(r, c);
                    if (candidates && candidates.size === 2) {
                        cellsWithTwoCandidates.push({ r, c, cands: candidates });
                    }
                }
            }

            // Ищем пары с одинаковыми кандидатами
            if (cellsWithTwoCandidates.length >= 2) {
                for (let j = 0; j < cellsWithTwoCandidates.length; j++) {
                    for (let k = j + 1; k < cellsWithTwoCandidates.length; k++) {
                        const cell1 = cellsWithTwoCandidates[j];
                        const cell2 = cellsWithTwoCandidates[k];

                        // Проверяем, одинаковые ли у них наборы кандидатов
                        if (cell1.cands.size === 2 && cell2.cands.size === 2) {
                            let same = true;
                            if (cell1.cands.size !== cell2.cands.size) {
                                same = false;
                            } else {
                                for (const digit of cell1.cands) {
                                    if (!cell2.cands.has(digit)) {
                                        same = false; break;
                                    }
                                }
                            }

                            if (same) {
                                // Найдена голая пара!
                                const digits = Array.from(cell1.cands);
                                const pairCells = [getCellId(cell1.r, cell1.c), getCellId(cell2.r, cell2.c)];
                                console.log(`Naked Pair found: Digits ${digits.join(',')} in cells ${pairCells.join(',')}`);
                                // Проверяем, нужно ли что-то удалять
                                let eliminationNeeded = false;
                                const unitCellsSet = new Set(pairCells);
                                for (const [r_unit, c_unit] of unitIndices) {
                                    const cellId_unit = getCellId(r_unit, c_unit);
                                    if (!unitCellsSet.has(cellId_unit) && userGrid[r_unit]?.[c_unit]?.value === 0) {
                                        const notes = userGrid[r_unit][c_unit].notes;
                                        if (notes && (notes.has(digits[0]) || notes.has(digits[1]))) {
                                            eliminationNeeded = true; break;
                                        }
                                    }
                                }
                                if (eliminationNeeded) {
                                    return { unitType: getUnitType(i), unitIndex: i, cells: pairCells, digits: digits };
                                } else {
                                    console.log("...but no eliminations possible from this pair.");
                                }
                            }
                        }
                    }
                }
            }
        }
        return null; // Не найдено
    }

     /**
      * Находит ОДНО голое трио (Naked Triple).
      * @returns {object | null} { unitType, unitIndex, cells:string[3], digits:number[3] } or null.
      */
     function findNakedTriple() {
         if (currentMode !== 'classic') return null;
         const units = getAllUnitsIndices();

         for (let i = 0; i < units.length; i++) {
             const unitIndices = units[i];
             const candidateCells = []; // Store { r, c, cands: Set<number> }

             // Находим ячейки с 2 или 3 кандидатами
             for (const [r, c] of unitIndices) {
                 if (userGrid[r]?.[c]?.value === 0) {
                     const candidates = calculateCandidates(r, c);
                     if (candidates && (candidates.size === 2 || candidates.size === 3)) {
                         candidateCells.push({ r, c, cands: candidates });
                     }
                 }
             }

             // Ищем комбинации из 3 ячеек
             if (candidateCells.length >= 3) {
                 for (let j = 0; j < candidateCells.length; j++) {
                     for (let k = j + 1; k < candidateCells.length; k++) {
                         for (let l = k + 1; l < candidateCells.length; l++) {
                             const c1 = candidateCells[j];
                             const c2 = candidateCells[k];
                             const c3 = candidateCells[l];

                             // Объединяем кандидатов из трех ячеек
                             const combinedCands = new Set([...c1.cands, ...c2.cands, ...c3.cands]);

                             // Если у них ровно 3 уникальных кандидата - это голое трио
                             if (combinedCands.size === 3) {
                                 const digits = Array.from(combinedCands);
                                 const tripleCells = [getCellId(c1.r, c1.c), getCellId(c2.r, c2.c), getCellId(c3.r, c3.c)];
                                 console.log(`Naked Triple found: Digits ${digits.join(',')} in cells ${tripleCells.join(',')}`);

                                 // Проверяем, нужно ли удалять кандидатов из других ячеек
                                 let eliminationNeeded = false;
                                 const unitCellsSet = new Set(tripleCells);
                                 for (const [r_unit, c_unit] of unitIndices) {
                                     const cellId_unit = getCellId(r_unit, c_unit);
                                     if (!unitCellsSet.has(cellId_unit) && userGrid[r_unit]?.[c_unit]?.value === 0) {
                                         const notes = userGrid[r_unit][c_unit].notes;
                                         if (notes && (notes.has(digits[0]) || notes.has(digits[1]) || notes.has(digits[2]))) {
                                             eliminationNeeded = true; break;
                                         }
                                     }
                                 }

                                 if (eliminationNeeded) {
                                     return { unitType: getUnitType(i), unitIndex: i, cells: tripleCells, digits: digits };
                                 } else {
                                     console.log("...but no eliminations possible from this triple.");
                                 }
                             }
                         }
                     }
                 }
             }
         }
         return null;
     }


    /**
     * Применяет найденный Hidden/Naked Single на доску.
     */
    function applyFoundSingle(foundInfo) {
        if (!foundInfo) return false;
        const { r, c, digit } = foundInfo;
        if (userGrid[r]?.[c]?.value === 0) {
            console.log(`Applying Single: Setting [${r}, ${c}] = ${digit}`);
            pushHistoryState();
            userGrid[r][c].value = digit;
            if (userGrid[r][c].notes) userGrid[r][c].notes.clear(); // Очищаем заметки
            renderCell(r, c); // Перерисовываем ячейку
            // --- Подсветка найденной ячейки ---
            const cellElement = boardElement?.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);
            if(cellElement) {
                clearSelection(); selectedCell = cellElement; selectedRow = r; selectedCol = c;
                selectedCell.classList.add('selected'); highlightRelatedCells(r, c);
                const hintColor = getComputedStyle(document.documentElement).getPropertyValue('--highlight-hint-flash').trim() || '#fffacd';
                cellElement.style.transition = 'background-color 0.1s ease-out'; cellElement.style.backgroundColor = hintColor;
                setTimeout(() => { if(cellElement && cellElement.style.backgroundColor === hintColor) { cellElement.style.backgroundColor = ''; cellElement.style.transition = ''; } }, 600);
            }
            // --- Конец подсветки ---
            return true; // Успешно применили
        } else {
             console.warn(`Attempted to apply Single ${digit} to already filled/invalid cell [${r}, ${c}]`);
             return false; // Не удалось применить
        }
    }

    /**
     * Удаляет кандидатов на основе найденной Голой Пары/Трио.
     * @param {object} eliminationInfo - { unitType, unitIndex, cells: string[], digits: number[] }
     * @returns {boolean} True, если хотя бы один кандидат был удален.
     */
    function applyNakedGroupElimination(eliminationInfo) {
        if (!eliminationInfo) return false;
        const { unitType, unitIndex, cells, digits } = eliminationInfo;
        console.log(`Applying Naked ${digits.length === 2 ? 'Pair' : 'Triple'} Elimination: Digits ${digits.join(',')} in ${unitType} ${unitIndex}`);

        const unitIndices = getUnitIndices(unitIndex); // Получаем координаты ячеек юнита
        const groupCellsSet = new Set(cells); // Ячейки, входящие в группу (пара/трио)
        let eliminatedSomething = false;
        let changesMade = []; // Сохраняем изменения для undo

        for (const [r, c] of unitIndices) {
            const cellId = getCellId(r, c);
            // Пропускаем ячейки из самой группы и уже заполненные ячейки
            if (groupCellsSet.has(cellId) || userGrid[r]?.[c]?.value !== 0) {
                continue;
            }

            const cellData = userGrid[r][c];
            if (!cellData.notes) cellData.notes = new Set(); // Инициализируем, если нужно

            // Сохраняем изначальное состояние заметок для undo
             const originalNotes = new Set(cellData.notes);

            let cellChanged = false;
            digits.forEach(digit => {
                if (cellData.notes.has(digit)) {
                    console.log(`  - Removing candidate ${digit} from notes of [${r}, ${c}]`);
                    cellData.notes.delete(digit);
                    eliminatedSomething = true;
                    cellChanged = true;
                }
            });
             // Если в ячейке были изменения, сохраняем ее состояние для undo
             if (cellChanged) {
                 changesMade.push({r, c, notesBefore: originalNotes, notesAfter: new Set(cellData.notes)});
                 renderCell(r, c); // Перерисовываем ячейку с обновленными заметками
             }
        }

        if (eliminatedSomething) {
             // TODO: Улучшить механизм undo для таких сложных шагов
             // Пока просто сохраняем текущее состояние сетки после всех удалений
             pushHistoryState();
             saveGameState();
             updateLogicSolverButtonsState(); // Обновляем кнопки, т.к. прогресс есть
        }
        return eliminatedSomething;
    }

    /**
     * Выполняет ОДИН шаг логического решателя, применяя первую найденную технику.
     */
    function doLogicStep() {
         console.log("%c--- Logic Step ---", "color: green; font-weight: bold;");
         if (currentMode !== 'classic') return showError("Логика только для классики.");
         if (isGameSolved()) return showSuccess("Судоку уже решено!");
         clearErrors();

         let foundAndApplied = false;
         let stepType = "";
         let stepDetails = "";

         // 1. Поиск Naked Singles
         console.log("Searching for Naked Singles...");
         const nakedSingle = findNakedSingle();
         if (nakedSingle) {
             stepType = "Naked Single";
             stepDetails = `${nakedSingle.digit} в [${getCellId(nakedSingle.r, nakedSingle.c)}]`;
             foundAndApplied = applyFoundSingle(nakedSingle);
         }

         // 2. Поиск Hidden Singles (если Naked не найден)
         if (!foundAndApplied) {
             console.log("Searching for Hidden Singles...");
             const hiddenSingle = findHiddenSingle();
             if (hiddenSingle) {
                 stepType = "Hidden Single";
                 stepDetails = `${hiddenSingle.digit} в [${getCellId(hiddenSingle.r, hiddenSingle.c)}]`;
                 foundAndApplied = applyFoundSingle(hiddenSingle);
             }
         }

         // 3. Поиск Naked Pairs (если Singles не найдены)
         if (!foundAndApplied) {
             console.log("Searching for Naked Pairs...");
             const nakedPair = findNakedPair();
             if (nakedPair) {
                 stepType = "Naked Pair";
                 stepDetails = `цифры ${nakedPair.digits.join(',')} в ${nakedPair.cells.join(',')}`;
                 // Применение возвращает true, если что-то удалено
                 foundAndApplied = applyNakedGroupElimination(nakedPair);
             }
         }

         // 4. Поиск Naked Triples (если Pairs не найдены)
         if (!foundAndApplied) {
             console.log("Searching for Naked Triples...");
             const nakedTriple = findNakedTriple();
             if (nakedTriple) {
                 stepType = "Naked Triple";
                 stepDetails = `цифры ${nakedTriple.digits.join(',')} в ${nakedTriple.cells.join(',')}`;
                 foundAndApplied = applyNakedGroupElimination(nakedTriple);
             }
         }

         // Отчет о результате шага
         if (foundAndApplied && stepType.includes("Single")) {
             showSuccess(`Найден ${stepType}: ${stepDetails}`);
             saveGameState(); // Сохраняем после успешного шага
         } else if (foundAndApplied) { // Для Pairs/Triples
             showSuccess(`Применено ${stepType} (${stepDetails}). Удалены кандидаты.`);
             // Save game state is handled inside applyNakedGroupElimination
         } else {
             showError("Не найдено следующих логических шагов (Singles/Pairs/Triples).");
         }
         updateLogicSolverButtonsState(); // Обновляем кнопки
    }

    /**
     * Запускает логический решатель до тех пор, пока он может находить шаги.
     */
    function runLogicSolver() {
         console.log("%c--- Running Logic Solver ---", "color: green; font-weight: bold;");
         if (currentMode !== 'classic') { showError("Логика только для классики."); return; }
         if (isGameSolved()) { showSuccess("Судоку уже решено!"); return; }
         if (isLogicSolverRunning) { console.log("Solver already running."); return; }

         isLogicSolverRunning = true;
         updateLogicSolverButtonsState(); // Отключаем кнопки
         statusMessageElement.textContent = "Решаю..."; statusMessageElement.className = '';

         let stepsMade = 0;
         let lastAction = null; // Чтобы избежать бесконечного цикла на одной и той же технике

         function solverCycle() {
             if (isGameSolved()) {
                 showSuccess(`Решено за ${stepsMade} шаг(ов)!`);
                 isLogicSolverRunning = false; updateLogicSolverButtonsState(); saveGameState(); return;
             }

             let appliedThisCycle = false;
             let actionType = "";

             // Приоритет техник
             if (!appliedThisCycle) {
                 const nakedSingle = findNakedSingle();
                 if (nakedSingle) {
                      if (applyFoundSingle(nakedSingle)) {
                         appliedThisCycle = true; actionType = "Naked Single";
                     }
                 }
             }
             if (!appliedThisCycle) {
                 const hiddenSingle = findHiddenSingle();
                 if (hiddenSingle) {
                      if (applyFoundSingle(hiddenSingle)) {
                         appliedThisCycle = true; actionType = "Hidden Single";
                      }
                 }
             }
             if (!appliedThisCycle) {
                 const nakedPair = findNakedPair();
                 if (nakedPair) {
                      if (applyNakedGroupElimination(nakedPair)) {
                         appliedThisCycle = true; actionType = "Naked Pair Elim";
                      }
                 }
             }
              if (!appliedThisCycle) {
                 const nakedTriple = findNakedTriple();
                 if (nakedTriple) {
                      if (applyNakedGroupElimination(nakedTriple)) {
                         appliedThisCycle = true; actionType = "Naked Triple Elim";
                      }
                 }
             }

             if (appliedThisCycle) {
                 stepsMade++;
                 console.log(`Solver Step ${stepsMade}: Applied ${actionType}`);
                 lastAction = actionType; // Запоминаем последнее действие
                 // Продолжаем со следующей итерацией
                 setTimeout(solverCycle, 10); // Маленькая задержка для UI
             } else {
                 // Больше нет известных шагов
                 showError(`Стоп после ${stepsMade} шагов. Нет простых техник.`);
                 isLogicSolverRunning = false;
                 updateLogicSolverButtonsState();
                 saveGameState(); // Сохраняем финальное состояние
             }
         }
         solverCycle(); // Запускаем первый цикл
    }

     /**
      * Обновляет состояние кнопок логического решателя.
      */
     function updateLogicSolverButtonsState() {
         const enabled = currentMode === 'classic' && !isGameSolved() && !isLogicSolverRunning;
         if (logicStepButton) logicStepButton.disabled = !enabled;
         if (logicSolveButton) logicSolveButton.disabled = !enabled;
         // console.log(`Logic buttons: mode='${currentMode}', solved=${isGameSolved()}, running=${isLogicSolverRunning} => enabled=${enabled}`); // DEBUG
     }

    // --- Вспомогательные для логического решателя ---
    function getRowIndices(r){const i=[];for(let c=0;c<9;c++)i.push([r,c]);return i;} function getColIndices(c){const i=[];for(let r=0;r<9;r++)i.push([r,c]);return i;} function getBlockIndices(b){const sr=Math.floor(b/3)*3,sc=(b%3)*3,i=[];for(let r=0;r<3;r++)for(let c=0;c<3;c++)i.push([sr+r,sc+c]);return i;}
    // Функция для получения всех юнитов (для поиска пар/трио)
    function getAllUnitsIndices() {
        const allUnits = [];
        for (let i = 0; i < 9; i++) {
            allUnits.push(getRowIndices(i));
            allUnits.push(getColIndices(i));
            allUnits.push(getBlockIndices(i));
        }
        return allUnits;
    }
     // Функция для определения типа юнита по его глобальному индексу (0-8 строки, 9-17 столбцы, 18-26 блоки)
     function getUnitType(index) {
         if (index < 9) return 'Row';
         if (index < 18) return 'Col';
         return 'Block';
     }
    // --- КОНЕЦ БЛОКА ЛОГИЧЕСКОГО РЕШАТЕЛЯ ---


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
        numpad?.addEventListener('click', (e)=>{ const b=e.target.closest('button'); if (!b || isShowingAd || isGameSolved() || !selectedCell) return; if (currentMode === 'classic' && selectedCell.classList.contains('given')) return; if (b.id === 'note-toggle-button') { console.log("Note toggle button CLICKED!"); isNoteMode = !isNoteMode; console.log("isNoteMode toggled to:", isNoteMode); updateNoteToggleButtonState(); return; } clearErrors(); if (!userGrid[selectedRow]?.[selectedCol]) return; const cd=userGrid[selectedRow][selectedCol]; let r=false,ch=false,p=false,fR=false; if (b.id === 'erase-button') { p=(cd.value!==0)||(cd.notes?.size>0); } else if (b.dataset.num) { const n=parseInt(b.dataset.num); if (isNoteMode) {p=(cd.value===0);} else {p=(cd.value!==n);} } if (p&&!isGameSolved()) { pushHistoryState(); } if (b.id === 'erase-button') { if (cd.value !== 0) { cd.value = 0; r = true; ch = true; } else if (cd.notes?.size > 0) { cd.notes.clear(); r = true; ch = true; fR = (currentMode === 'killer'); } } else if (b.dataset.num) { const n = parseInt(b.dataset.num); if (isNoteMode) { if (cd.value === 0) { if (!(cd.notes instanceof Set)) cd.notes = new Set(); if (cd.notes.has(n)) cd.notes.delete(n); else cd.notes.add(n); r = true; ch = true; fR = (currentMode === 'killer'); } } else { if (cd.value !== n) { cd.value = n; if (cd.notes) cd.notes.clear(); r = true; ch = true; } else { cd.value = 0; r = true; ch = true; } } } if (r) { if (fR) { console.log("Note changed, forcing full renderBoard."); renderBoard(); if (selectedRow !== -1 && selectedCol !== -1) { selectedCell = boardElement?.querySelector(`.cell[data-row='${selectedRow}'][data-col='${selectedCol}']`); if (selectedCell && !(currentMode === 'classic' && selectedCell.classList.contains('given'))) { selectedCell.classList.add('selected'); highlightRelatedCells(selectedRow, selectedCol); } else { selectedCell = null; selectedRow = -1; selectedCol = -1; } } } else { renderCell(selectedRow, selectedCol); } } if (ch && !isGameSolved()) saveGameState(); });
        checkButton?.addEventListener('click', checkGame);
        undoButton?.addEventListener('click', handleUndo);
        hintButton?.addEventListener('click', ()=>{if(isShowingAd||isGameSolved())return;if(currentMode==='classic'&&hintsRemaining>0)provideHintInternal();else if(currentMode==='classic')offerRewardedAdForHints();else showError("Подсказки недоступны");});
        exitGameButton?.addEventListener('click', ()=>{console.log("Exit btn");stopTimer();showScreen(initialScreen);checkContinueButton();});
        logicStepButton?.addEventListener('click', doLogicStep); // Добавлен обработчик
        logicSolveButton?.addEventListener('click', runLogicSolver); // Добавлен обработчик
        document.addEventListener('keydown', (e)=>{if(document.activeElement.tagName==='INPUT'||isShowingAd||!gameContainer?.classList.contains('visible')||isGameSolved())return; if(e.key.toLowerCase()==='n'||e.key.toLowerCase()==='т'){ console.log("N/T key pressed"); isNoteMode=!isNoteMode; updateNoteToggleButtonState(); e.preventDefault(); return; } if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();handleUndo();return;} if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){ if(!selectedCell){const sc=boardElement?.querySelector(`.cell[data-row='0'][data-col='0']`);if(sc)sc.click();else return;}let nr=selectedRow,nc=selectedCol;const mv=(cur,d,m)=>Math.min(m,Math.max(0,cur+d));if(e.key==='ArrowUp')nr=mv(selectedRow,-1,8);if(e.key==='ArrowDown')nr=mv(selectedRow,1,8);if(e.key==='ArrowLeft')nc=mv(selectedCol,-1,8);if(e.key==='ArrowRight')nc=mv(selectedCol,1,8);if(nr!==selectedRow||nc!==selectedCol){const nextEl=boardElement?.querySelector(`.cell[data-row='${nr}'][data-col='${nc}']`);if(nextEl)nextEl.click();}e.preventDefault();return; } if(!selectedCell||(currentMode==='classic'&&selectedCell.classList.contains('given')))return; if(!userGrid[selectedRow]?.[selectedCol])return; const cd=userGrid[selectedRow][selectedCol]; let r=false,ch=false,p=false,fR=false; if(e.key>='1'&&e.key<='9'){ const n=parseInt(e.key); if(isNoteMode){p=(cd.value===0);}else{p=(cd.value!==n);} } else if(e.key==='Backspace'||e.key==='Delete'){ p=(cd.value!==0)||(cd.notes?.size>0); } if(p&&!isGameSolved()){pushHistoryState();} if(e.key>='1'&&e.key<='9'){ clearErrors();const n=parseInt(e.key); if(isNoteMode){ if(cd.value===0){if(!(cd.notes instanceof Set))cd.notes=new Set();if(cd.notes.has(n))cd.notes.delete(n);else cd.notes.add(n);r=true;ch=true;fR=(currentMode==='killer');} } else{ if(cd.value!==n){cd.value=n;if(cd.notes)cd.notes.clear();r=true;ch=true;}else{cd.value=0;r=true;ch=true;} } e.preventDefault(); } else if(e.key==='Backspace'||e.key==='Delete'){ clearErrors(); if(cd.value!==0){cd.value=0;r=true;ch=true;} else if(cd.notes?.size>0){cd.notes.clear();r=true;ch=true;fR=(currentMode==='killer');} e.preventDefault(); } if(r){ if(fR){ console.log("Note changed by key, forcing full renderBoard."); renderBoard(); if(selectedRow!==-1&&selectedCol!==-1){selectedCell=boardElement?.querySelector(`.cell[data-row='${selectedRow}'][data-col='${selectedCol}']`);if(selectedCell&&!(currentMode==='classic'&&selectedCell.classList.contains('given'))){selectedCell.classList.add('selected');highlightRelatedCells(selectedRow,selectedCol);}else{selectedCell=null;selectedRow=-1;selectedCol=-1;}}} else{ renderCell(selectedRow,selectedCol); } } if(ch&&!isGameSolved()){saveGameState();} });

        console.log("Event listeners added.");
    }


    // --- Инициализация Приложения ---
    function initializeApp(){console.log("Init app...");try{loadThemePreference();checkContinueButton();addEventListeners();showScreen(initialScreen);initializeAds();try{if(window.Telegram?.WebApp)Telegram.WebApp.ready();else console.log("TG SDK not found.");}catch(e){console.error("TG SDK Err:",e);}}catch(e){console.error("CRITICAL INIT ERR:",e);document.body.innerHTML=`<div style='padding:20px;color:red;'><h1>Ошибка!</h1><p>${e.message}</p><pre>${e.stack}</pre></div>`;}}
    function checkContinueButton(){if(!continueGameButton)return;try{const s=loadGameState();continueGameButton.disabled=!s;console.log(`Continue btn state:${!continueGameButton.disabled}`);}catch(e){console.error("Err check cont:",e);continueGameButton.disabled=true;}}

    // --- Запуск ---
    initializeApp();

}); // Конец 'DOMContentLoaded'
