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

    // --- Проверка всех элементов ---
    const essentialElements = { initialScreen, newGameOptionsScreen, gameContainer, startNewGameButton, continueGameButton, gameModeSelectionContainer, difficultyButtonsContainer, themeToggleCheckbox, backToInitialButton, exitGameButton, boardElement, checkButton, hintButton, undoButton, statusMessageElement, numpad, noteToggleButton, timerElement };
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
    let currentPuzzle = null, currentSolution = null, currentCageData = null, currentSolverData = null;
    let userGrid = [], historyStack = [];
    let selectedCell = null, selectedRow = -1, selectedCol = -1;
    let isNoteMode = false, timerInterval = null, secondsElapsed = 0;
    const MAX_HINTS = 3; let hintsRemaining = MAX_HINTS;

    // === Placeholder Рекламы ===
    let isAdReady = false, isShowingAd = false;
    function initializeAds() { console.log("ADS Init..."); setTimeout(() => { preloadRewardedAd(); }, 2000); }
    function preloadRewardedAd() { if (isAdReady || isShowingAd) return; console.log("ADS Load..."); isAdReady = false; setTimeout(() => { if (!isShowingAd) { isAdReady = true; console.log("ADS Ready."); } else { console.log("ADS Load aborted (showing)."); } }, 3000 + Math.random() * 2000); }
    function showRewardedAd(callbacks) { if (!isAdReady || isShowingAd) { console.log("ADS Not ready/Showing."); if (callbacks.onError) callbacks.onError("Реклама не готова."); preloadRewardedAd(); return; } console.log("ADS Show..."); isShowingAd = true; isAdReady = false; if(statusMessageElement) { statusMessageElement.textContent = "Показ рекламы..."; statusMessageElement.className = ''; } document.body.style.pointerEvents = 'none'; setTimeout(() => { const success = Math.random() > 0.2; document.body.style.pointerEvents = 'auto'; if(statusMessageElement) statusMessageElement.textContent = ""; isShowingAd = false; console.log("ADS Show End."); if (success) { console.log("ADS Success!"); if (callbacks.onSuccess) callbacks.onSuccess(); } else { console.log("ADS Error/Skip."); if (callbacks.onError) callbacks.onError("Реклама не загружена / пропущена."); } preloadRewardedAd(); }, 5000); }


    // --- Функции Управления Экранами ---
    function showScreen(screenToShow) {
        [initialScreen, newGameOptionsScreen, gameContainer].forEach(s => s?.classList.remove('visible'));
        if (screenToShow) {
            screenToShow.classList.add('visible');
            console.log(`Show screen: #${screenToShow.id}`);
        } else {
            console.error("showScreen: Попытка показать неопределенный экран!");
            // Fallback к начальному экрану
            if(initialScreen) initialScreen.classList.add('visible');
        }
    }

    // --- Функции Темы ---
    function applyTheme(theme) { const iD=theme==='dark';document.body.classList.toggle('dark-theme',iD);if(themeToggleCheckbox)themeToggleCheckbox.checked=iD;console.log(`Theme set: ${theme}`);/*TG omit*/ }
    function loadThemePreference() { try{const sT=localStorage.getItem(THEME_KEY);applyTheme(sT||'light');}catch(e){console.error("Error loading theme:",e);applyTheme('light');}}
    function handleThemeToggle() { if(!themeToggleCheckbox)return;const nT=themeToggleCheckbox.checked?'dark':'light';applyTheme(nT);try{localStorage.setItem(THEME_KEY,nT);}catch(e){console.error("Error saving theme:",e);}}

    // --- Вспомогательные функции (ошибки, соседи и т.д.) ---
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

    // --- Подсветка ---
    function highlightRelatedCells(row, col) {
         console.log(`Highlighting for [${row}, ${col}], mode: ${currentMode}`); // DEBUG
         if (!boardElement) return;
         boardElement.querySelectorAll('.cell.highlighted').forEach(el=>el.classList.remove('highlighted'));

         if (currentMode === 'killer' && currentSolverData) {
             const cellId = getCellId(row, col);
             if (!cellId) return; // Невалидные координаты

             const cageIndex = currentSolverData.cellToCageMap[cellId];
             if (cageIndex !== undefined) {
                 console.log(`Highlighting cage index ${cageIndex}`); // DEBUG
                 const cage = currentSolverData.cageDataArray[cageIndex];
                 if (cage && cage.cells) {
                     cage.cells.forEach(cId => {
                         const coords = getCellCoords(cId);
                         if (coords) {
                             boardElement.querySelector(`.cell[data-row='${coords.r}'][data-col='${coords.c}']`)?.classList.add('highlighted');
                         }
                     });
                     // Не выходим, позволяем подсветить и одинаковые цифры ниже
                 } else {
                      console.warn("Cage data missing for index:", cageIndex);
                 }
             } else {
                 console.log(`Cell ${cellId} not found in cage map.`); // DEBUG
                 // Если ячейка не в клетке (не должно быть), подсвечиваем строку/колонку
                  boardElement.querySelectorAll(`.cell[data-row='${row}'], .cell[data-col='${col}']`).forEach(el=>el.classList.add('highlighted'));
             }
         } else { // Классический режим
              boardElement.querySelectorAll(`.cell[data-row='${row}'], .cell[data-col='${col}']`).forEach(el=>el.classList.add('highlighted'));
         }

         // Подсветка ячеек с той же цифрой (для обоих режимов)
         const cellValue = userGrid[row]?.[col]?.value;
         if (cellValue && cellValue !== 0) {
             console.log(`Highlighting cells with value ${cellValue}`); // DEBUG
             for (let r_ = 0; r_ < 9; r_++) {
                 for (let c_ = 0; c_ < 9; c_++) {
                     if (userGrid[r_]?.[c_]?.value === cellValue) {
                         boardElement.querySelector(`.cell[data-row='${r_}'][data-col='${c_}']`)?.classList.add('highlighted');
                     }
                 }
             }
         }
     }

    // --- Обновление кнопки подсказки ---
    function updateHintButtonState(){if(!hintButton)return;const s=isGameSolved();let canHint=false,title="";if(currentMode==='classic'){canHint=currentSolution&&!s;if(!currentSolution)title="Н/Д";else if(s)title="Решено";else if(hintsRemaining>0)title="Подсказка";else title=`+${MAX_HINTS}(Ad)`;}else{canHint=false;title="Н/Д(Killer)";}hintButton.disabled=!canHint;hintButton.title=title;hintButton.textContent=`💡 ${hintsRemaining}/${MAX_HINTS}`;if(currentMode==='killer')hintButton.disabled=true;else if(hintsRemaining<=0&&canHint)hintButton.disabled=false;}


    // --- Инициализация ИГРЫ ---
    function initGame(mode = "classic", difficulty = "medium", restoreState = null) {
        console.log(`%cInitGame START: mode=${mode}, difficulty=${difficulty}, restore=${!!restoreState}`, "color: blue; font-weight: bold;");
        // --- Проверка библиотек ---
        if (mode === "classic") { if (typeof sudoku === 'undefined') return showError("Ошибка: sudoku.js не найден."); console.log("Classic lib OK."); }
        else if (mode === "killer") { if (typeof killerSudoku === 'undefined') return showError("Ошибка: killerSudoku.js не найден."); if (typeof killerSudoku._initializeSolverData !== 'function') return showError("Ошибка: killerSudoku.js неполный (_initializeSolverData)."); if (typeof killerSudoku.generate !== 'function') return showError("Ошибка: killerSudoku.js неполный (generate)."); console.log("Killer lib OK."); }
        else return showError("Ошибка: Неизвестный режим: " + mode);

        currentMode = mode; currentDifficulty = difficulty;
        stopTimer(); historyStack = []; updateUndoButtonState(); isNoteMode = false; updateNoteToggleButtonState(); clearSelection(); clearErrors();
        statusMessageElement.textContent = 'Генерация...'; statusMessageElement.className = '';
        currentPuzzle = null; currentSolution = null; currentCageData = null; currentSolverData = null; userGrid = [];

        let success = false;
        try {
            if (restoreState) {
                console.log("Restoring state...");
                currentMode = restoreState.mode || "classic"; currentDifficulty = restoreState.difficulty || 'medium'; secondsElapsed = restoreState.time || 0; hintsRemaining = restoreState.hints ?? MAX_HINTS;
                userGrid = restoreState.grid.map(r => r.map(c => ({ value: c.value, notes: new Set(c.notesArray || []) })));
                if (currentMode === "classic") { currentPuzzle = restoreState.puzzle; currentSolution = restoreState.solution; if (!currentPuzzle || !currentSolution) throw new Error("Invalid classic save."); }
                else if (currentMode === "killer") { currentCageData = restoreState.cageData; if (!currentCageData?.cages) throw new Error("Invalid killer save (cages)."); console.log("Re-init solver data..."); currentSolverData = killerSudoku._initializeSolverData(currentCageData.cages); if (!currentSolverData) throw new Error("Fail re-init solver data."); console.log("Solver data re-init OK."); }
                else throw new Error("Unknown save mode: " + currentMode);
                console.log("Restore OK."); success = true;
            } else { // Generate new
                secondsElapsed = 0; hintsRemaining = MAX_HINTS; clearSavedGameState();
                if (currentMode === "classic") { console.log(`Gen CLASSIC: ${currentDifficulty}...`); currentPuzzle = sudoku.generate(currentDifficulty); if (!currentPuzzle) throw new Error("Classic gen failed."); currentSolution = sudoku.solve(currentPuzzle); if (!currentSolution) throw new Error("Classic solve failed."); userGrid = boardStringToObjectArray(currentPuzzle); console.log("New classic OK."); success = true; }
                else if (currentMode === "killer") { console.log(`Gen KILLER: ${currentDifficulty}...`); console.log("Call killer.generate..."); const puzzle = killerSudoku.generate(currentDifficulty); console.log("Killer gen result:", puzzle); if (!puzzle?.cages) throw new Error("Killer gen failed (no cages)."); currentCageData = puzzle; console.log("Init solver data..."); currentSolverData = killerSudoku._initializeSolverData(currentCageData.cages); console.log("Solver init result:", currentSolverData); if (!currentSolverData) throw new Error("Cage validation/init failed."); userGrid = boardStringToObjectArray("."); console.log("New killer OK."); success = true; } // Killer starts blank
            }
        } catch (error) { console.error("INIT DATA ERR:", error); showError(`Ошибка init (${mode}): ${error.message}`); showScreen(initialScreen); checkContinueButton(); return; }

        if (success) { statusMessageElement.textContent = ''; console.log("Rendering..."); renderBoard(); updateHintButtonState(); updateUndoButtonState(); updateTimerDisplay(); showScreen(gameContainer); console.log("Schedule timer..."); setTimeout(() => { console.log("setTimeout: start timer."); startTimer(); }, 50); console.log("InitGame COMPLETE."); }
        else { console.error("InitGame no success flag."); showError("Ошибка инициализации."); showScreen(initialScreen); checkContinueButton(); }
    }

    // --- Функции сохранения/загрузки состояния ---
    function saveGameState(){if(!userGrid||userGrid.length!==9)return;/*console.log(`Saving:${currentMode}`);*/try{const g=userGrid.map(r=>r.map(c=>({value:c.value,notesArray:Array.from(c.notes||[])})));const s={mode:currentMode,difficulty:currentDifficulty,grid:g,time:secondsElapsed,hints:hintsRemaining,timestamp:Date.now(),puzzle:currentMode==='classic'?currentPuzzle:null,solution:currentMode==='classic'?currentSolution:null,cageData:currentMode==='killer'?currentCageData:null};localStorage.setItem(SAVE_KEY,JSON.stringify(s));}catch(e){console.error("SaveErr:",e);showError("Ошибка сохр.");}}
    function loadGameState(){const d=localStorage.getItem(SAVE_KEY);if(!d)return null;try{const s=JSON.parse(d);if(s&&typeof s==='object'&&s.mode&&s.difficulty&&Array.isArray(s.grid)&&typeof s.timestamp==='number'&&(s.mode==='classic'?!(!s.puzzle||!s.solution):true)&&(s.mode==='killer'?!(!s.cageData||!s.cageData.cages):true)){console.log("Save found:",new Date(s.timestamp).toLocaleString(),`M:${s.mode}`,`D:${s.difficulty}`);return s;}else{console.warn("Inv save. Clearing.",s);clearSavedGameState();return null;}}catch(e){console.error("ParseSaveErr:",e);clearSavedGameState();return null;}}
    function clearSavedGameState(){try{localStorage.removeItem(SAVE_KEY);console.log("Save cleared.");checkContinueButton();}catch(e){console.error("Err clr save:",e);}}

    // --- Функции для Undo ---
    function createHistoryState(){if(!userGrid||userGrid.length!==9)return null;const g=userGrid.map(r=>r.map(c=>({value:c.value,notes:new Set(c.notes||[])})));return{grid:g,hints:hintsRemaining};}
    function pushHistoryState(){const s=createHistoryState();if(s){historyStack.push(s);updateUndoButtonState();}else{console.warn("Inv hist push");}}
    function handleUndo(){if(historyStack.length===0||isShowingAd)return;stopTimer();const ps=historyStack.pop();console.log("Undo...");try{userGrid=ps.grid;hintsRemaining=ps.hints;renderBoard();clearSelection();clearErrors();updateHintButtonState();updateUndoButtonState();saveGameState();console.log("Undo OK.");}catch(e){console.error("Undo Err:",e);showError("Ошибка отмены");historyStack=[];updateUndoButtonState();}finally{resumeTimerIfNeeded();}}
    function updateUndoButtonState(){if(undoButton)undoButton.disabled=historyStack.length===0;}

    // --- Функции для таймера ---
    function startTimer(){const v=gameContainer?.classList.contains('visible');if(timerInterval||!v)return;console.log("Timer start...");updateTimerDisplay();timerInterval=setInterval(()=>{secondsElapsed++;updateTimerDisplay();if(secondsElapsed%10===0)saveGameState();},1000);console.log("Timer started:",timerInterval);}
    function stopTimer(){if(timerInterval){clearInterval(timerInterval);const o=timerInterval;timerInterval=null;console.log(`Timer stop (${o}).Save.`);saveGameState();}}
    function updateTimerDisplay(){if(!timerElement)return;const m=Math.floor(secondsElapsed/60),s=secondsElapsed%60;timerElement.textContent=`Время: ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}
    function resumeTimerIfNeeded(){const s=isGameSolved(),v=gameContainer?.classList.contains('visible');if(v&&!s)startTimer();else stopTimer();}


    // --- Отрисовка ---
        // --- Отрисовка ---
    function renderBoard(){
        console.log(`Render: ${currentMode}`);
        if(!boardElement){console.error("Board el missing!");return;}
        boardElement.innerHTML='';
        if(!userGrid||userGrid.length!==9){showError("Invalid grid data");return;}
        const cE={}; // cellElements cache
        for(let r=0;r<9;r++){
            if(!userGrid[r]||userGrid[r].length!==9)continue;
            for(let c=0;c<9;c++){
                const cid=getCellId(r,c);
                if(!cid)continue;
                const el=createCellElement(r,c); // Создаем ячейку
                boardElement.appendChild(el);
                cE[cid]=el; // Сохраняем ссылку
            }
        }
        // --- ИСПРАВЛЕНО: &¤tSolverData -> && currentSolverData ---
        if(currentMode==="killer" && currentSolverData?.cageDataArray){
            console.log("Rendering cages...");
            currentSolverData.cageDataArray.forEach((cage,ci)=>{
                if(!cage||!Array.isArray(cage.cells)||cage.cells.length===0)return;
                let anch=null,minR=9,minC=9;
                // Находим ячейку-якорь (верхняя-левая)
                cage.cells.forEach(cid=>{
                    const cc=getCellCoords(cid);
                    if(cc){if(cc.r<minR){minR=cc.r;minC=cc.c;anch=cid;}else if(cc.r===minR&&cc.c<minC){minC=cc.c;anch=cid;}}
                });
                // Добавляем сумму
                if(anch&&cE[anch]){
                    cE[anch].classList.add('cage-sum-anchor');
                    const sS=document.createElement('span');
                    sS.className='cage-sum';
                    sS.textContent=cage.sum;
                    cE[anch].appendChild(sS);
                }else if(cage.cells.length>0)console.warn(`No anchor cage ${ci}`);
                // Добавляем границы
                const cageSet=new Set(cage.cells);
                cage.cells.forEach(cid=>{
                    const el=cE[cid];if(!el)return;
                    el.classList.add('cage-cell');
                    const{r,c}=getCellCoords(cid); const ne=getNeighbors(r,c);
                    // Проверяем соседей и добавляем классы границ к *текущей* или *соседней* ячейке
                    if(ne.right&&cageSet.has(ne.right))el.classList.add('cage-inner-border-right');
                    if(ne.bottom&&cageSet.has(ne.bottom))el.classList.add('cage-inner-border-bottom');
                    if(ne.left&&cageSet.has(ne.left)&&cE[ne.left])cE[ne.left].classList.add('cage-inner-border-right');
                    if(ne.top&&cageSet.has(ne.top)&&cE[ne.top])cE[ne.top].classList.add('cage-inner-border-bottom');
                });
            });
        }
        console.log("Render complete.");
    }

    function createCellElement(r,c){
        const cell=document.createElement('div');cell.classList.add('cell');
        cell.dataset.row=r;cell.dataset.col=c;
        const cd=userGrid[r]?.[c];
        if(!cd){cell.textContent='?';return cell;}
        const vc=document.createElement('div');vc.classList.add('cell-value-container');
        const nc=document.createElement('div');nc.classList.add('cell-notes-container');
        if(cd.value!==0){
            vc.textContent=cd.value;vc.style.display='flex';nc.style.display='none';
            // --- ИСПРАВЛЕНО: &Puzzle -> && currentPuzzle (дважды) ---
            if(currentMode==='classic' && currentPuzzle){
                const i=r*9+c;
                if(currentPuzzle[i] && currentPuzzle[i]!=='.')cell.classList.add('given');
            }
        }else if(cd.notes instanceof Set&&cd.notes.size>0){
            vc.style.display='none';nc.style.display='grid';nc.innerHTML='';
            for(let n=1;n<=9;n++){const nd=document.createElement('div');nd.classList.add('note-digit');nd.textContent=cd.notes.has(n)?n:'';nc.appendChild(nd);}
        }else{vc.textContent='';vc.style.display='flex';nc.style.display='none';}
        cell.appendChild(vc);cell.appendChild(nc);
        if((c+1)%3===0&&c<8)cell.classList.add('thick-border-right');
        if((r+1)%3===0&&r<8)cell.classList.add('thick-border-bottom');
        return cell;
    }
    // --- Логика подсказки ---
    function provideHintInternal(){if(currentMode!=='classic')return showError("Подсказки только в классике");if(!selectedCell)return showError("Выберите ячейку");/* ... */}
    function offerRewardedAdForHints(){if(currentMode!=='classic'||isShowingAd)return;console.log("Offering ad...");if(confirm(`Hints finished! Watch ad for ${HINTS_REWARD} hint?`)){if(!isAdReady){showError("Ad loading...");preloadRewardedAd();return;}showRewardedAd({onSuccess:()=>{hintsRemaining+=HINTS_REWARD;updateHintButtonState();saveGameState();showSuccess(`+${HINTS_REWARD} hint!`);},onError:(msg)=>{showError(`Error: ${msg||'Ad?'} No hint added.`);}});}}

    // --- Логика Проверки ---
    function checkGame(){console.log(`Check: ${currentMode}`);clearErrors();if(!userGrid||userGrid.length!==9)return;let isValid=false;let isComplete=!userGrid.flat().some(c=>!c||c.value===0);if(currentMode==="classic"){if(!currentSolution){showError("Нет решения!");return;}isValid=validateClassicSudoku();}else if(currentMode==="killer"){if(!currentSolverData){showError("Нет данных Killer!");return;}isValid=validateKillerSudoku();}if(isValid&&isComplete){showSuccess("Поздравляем! Решено верно!");stopTimer();clearSelection();updateHintButtonState();/* submitGameResult(); */}else if(!isValid){showError("Найдены ошибки.");}else{if(statusMessageElement){statusMessageElement.textContent="Пока верно, но не закончено.";statusMessageElement.className='';}}}
    function validateClassicSudoku(){let ok=true;for(let r=0;r<9;r++){for(let c=0;c<9;c++){const cd=userGrid[r][c];const el=boardElement?.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);if(!cd||!el||cd.value===0||el.classList.contains('given'))continue;const sv=getSolutionValue(r,c); if(sv === null && currentSolution){ console.error(`Classic validation Error: No solution value for ${r},${c}`); ok = false; break; } if(cd.value!==sv){el.classList.add('incorrect');ok=false;}} if (!ok) break;} return ok;}
    function validateKillerSudoku(){let ok=true;const grid=userGrid.map(r=>r.map(c=>c.value));for(let i=0;i<9;i++){if(!isUnitValid(getRow(grid,i))||!isUnitValid(getCol(grid,i))||!isUnitValid(getBlock(grid,i))){console.warn("Classic rule violation");ok=false;break;}}if(!ok){showError("Нарушены правила Судоку.");return false;}if(!currentSolverData?.cageDataArray)return false;for(const cage of currentSolverData.cageDataArray){const vals=[];let sum=0;let complete=true;let els=[];for(const cid of cage.cells){const crds=getCellCoords(cid);if(!crds)continue;const v=grid[crds.r][crds.c];const el=boardElement?.querySelector(`.cell[data-row='${crds.r}'][data-col='${crds.c}']`);if(el)els.push(el);if(v===0){complete=false;}else{vals.push(v);sum+=v;}}if(new Set(vals).size!==vals.length){console.warn(`Cage ${cage.id} unique violation:`,vals);ok=false;els.forEach(e=>e.classList.add('incorrect'));}if(complete&&sum!==cage.sum){console.warn(`Cage ${cage.id} sum violation: got ${sum}, expected ${cage.sum}`);ok=false;els.forEach(e=>e.classList.add('incorrect'));}}return ok;}
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
            if (button && !button.classList.contains('selected')) {
                 gameModeSelectionContainer.querySelectorAll('.selected').forEach(btn => btn.classList.remove('selected'));
                 button.classList.add('selected');
                 const selectedMode = button.dataset.mode;
                 const selectedDifficulty = difficultyButtonsContainer?.querySelector('button.selected')?.dataset.difficulty || 'medium';
                 console.log(`MODE selected: ${selectedMode}. Starting with diff: ${selectedDifficulty}`);
                 initGame(selectedMode, selectedDifficulty);
            }
        });
        difficultyButtonsContainer?.addEventListener('click', (event) => {
            const target = event.target.closest('button.difficulty-button');
            if (target && !target.classList.contains('selected')) {
                 difficultyButtonsContainer.querySelectorAll('.selected').forEach(btn => btn.classList.remove('selected'));
                 target.classList.add('selected');
                 const selectedDifficulty = target.dataset.difficulty;
                 const selectedMode = gameModeSelectionContainer?.querySelector('button.selected')?.dataset.mode || 'classic';
                 console.log(`DIFFICULTY selected: ${selectedDifficulty}. Starting with mode: ${selectedMode}`);
                 initGame(selectedMode, selectedDifficulty);
            }
        });
        themeToggleCheckbox?.addEventListener('change', handleThemeToggle);
        backToInitialButton?.addEventListener('click', () => { console.log("Back btn"); showScreen(initialScreen); checkContinueButton(); });

        // 3. Игровой Экран
        // --- ИЗМЕНЕНО: Добавлен try-catch и логирование ---
        boardElement?.addEventListener('click', (e)=>{
            try {
                console.log("Board click event"); // DEBUG
                const target = e.target.closest('.cell');
                if (!target || isShowingAd || isGameSolved()) {
                     console.log("Board click ignored", {target, isShowingAd, isSolved: isGameSolved()}); // DEBUG
                     return;
                }
                const r = parseInt(target.dataset.row);
                const c = parseInt(target.dataset.col);
                console.log(`Clicked cell: [${r}, ${c}]`); // DEBUG
                if (isNaN(r) || isNaN(c)) { console.warn("Invalid coords", {r, c}); return; }

                if (target === selectedCell) {
                    console.log("Deselecting cell"); clearSelection();
                } else {
                    console.log("Selecting cell"); clearSelection();
                    selectedCell = target; selectedRow = r; selectedCol = c;
                    if (!(currentMode === 'classic' && target.classList.contains('given'))) {
                        selectedCell.classList.add('selected');
                    }
                     console.log("Highlighting..."); // DEBUG
                    highlightRelatedCells(r, c);
                     console.log("Highlighting done."); // DEBUG
                }
                 console.log("Clearing errors..."); // DEBUG
                clearErrors();
                 console.log("Board click handler finished."); // DEBUG
            } catch (error) {
                 console.error("!!!! BOARD CLICK HANDLER ERROR !!!!");
                 console.error(error);
                 console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                 showError(`Ошибка клика: ${error.message}`);
                 // Try graceful recovery
                 // clearSelection();
                 // showScreen(initialScreen);
                 // checkContinueButton();
            }
        });
        // Остальные обработчики без изменений в try/catch, но можно добавить по аналогии
        numpad?.addEventListener('click', (e)=>{const b=e.target.closest('button');if(!b||isShowingAd||isGameSolved())return;if(b.id==='note-toggle-button'){isNoteMode=!isNoteMode;updateNoteToggleButtonState();return;}if(!selectedCell||(currentMode==='classic'&&selectedCell.classList.contains('given')))return;clearErrors();if(!userGrid[selectedRow]?.[selectedCol])return;const cd=userGrid[selectedRow][selectedCol];let r=false,ch=false,p=false;if(b.id==='erase-button'){p=(cd.value!==0)||(cd.notes?.size>0);}else if(b.dataset.num){const n=parseInt(b.dataset.num);if(isNoteMode)p=(cd.value===0);else p=(cd.value!==n);}if(p)pushHistoryState();if(b.id==='erase-button'){if(cd.value!==0){cd.value=0;r=true;ch=true;}else if(cd.notes?.size>0){cd.notes.clear();r=true;ch=true;}}else if(b.dataset.num){const n=parseInt(b.dataset.num);if(isNoteMode){if(cd.value===0){if(!(cd.notes instanceof Set))cd.notes=new Set();if(cd.notes.has(n))cd.notes.delete(n);else cd.notes.add(n);r=true;ch=true;}}else{if(cd.value!==n){cd.value=n;if(cd.notes)cd.notes.clear();r=true;ch=true;}else{cd.value=0;r=true;ch=true;}}}if(r)renderCell(selectedRow,selectedCol);if(ch)saveGameState();});
        checkButton?.addEventListener('click', checkGame);
        undoButton?.addEventListener('click', handleUndo);
        hintButton?.addEventListener('click', ()=>{if(isShowingAd||isGameSolved())return;if(currentMode==='classic'&&hintsRemaining>0)provideHintInternal();else if(currentMode==='classic')offerRewardedAdForHints();else showError("Подсказки недоступны");});
        exitGameButton?.addEventListener('click', ()=>{console.log("Exit btn");stopTimer();showScreen(initialScreen);checkContinueButton();});
        document.addEventListener('keydown', (e)=>{if(document.activeElement.tagName==='INPUT'||isShowingAd||!gameContainer?.classList.contains('visible')||isGameSolved())return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();handleUndo();return;}if(e.key.toLowerCase()==='n'||e.key.toLowerCase()==='т'){isNoteMode=!isNoteMode;updateNoteToggleButtonState();e.preventDefault();return;}if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){if(!selectedCell){const sc=boardElement?.querySelector(`.cell[data-row='0'][data-col='0']`);if(sc)sc.click();else return;}let nr=selectedRow,nc=selectedCol;const mv=(cur,d,m)=>Math.min(m,Math.max(0,cur+d));if(e.key==='ArrowUp')nr=mv(selectedRow,-1,8);if(e.key==='ArrowDown')nr=mv(selectedRow,1,8);if(e.key==='ArrowLeft')nc=mv(selectedCol,-1,8);if(e.key==='ArrowRight')nc=mv(selectedCol,1,8);if(nr!==selectedRow||nc!==selectedCol){const nextEl=boardElement?.querySelector(`.cell[data-row='${nr}'][data-col='${nc}']`);if(nextEl)nextEl.click();}e.preventDefault();return;}if(!selectedCell||(currentMode==='classic'&&selectedCell.classList.contains('given')))return;if(!userGrid[selectedRow]?.[selectedCol])return;const cd=userGrid[selectedRow][selectedCol];let r=false,ch=false,p=false;if(e.key>='1'&&e.key<='9'){const n=parseInt(e.key);if(isNoteMode)p=(cd.value===0);else p=(cd.value!==n);}else if(e.key==='Backspace'||e.key==='Delete'){p=(cd.value!==0)||(cd.notes?.size>0);}if(p)pushHistoryState();if(e.key>='1'&&e.key<='9'){clearErrors();const n=parseInt(e.key);if(isNoteMode){if(cd.value===0){if(!(cd.notes instanceof Set))cd.notes=new Set();if(cd.notes.has(n))cd.notes.delete(n);else cd.notes.add(n);r=true;ch=true;}}else{if(cd.value!==n){cd.value=n;if(cd.notes)cd.notes.clear();r=true;ch=true;}else{cd.value=0;r=true;ch=true;}}e.preventDefault();}else if(e.key==='Backspace'||e.key==='Delete'){clearErrors();if(cd.value!==0){cd.value=0;r=true;ch=true;}else if(cd.notes?.size>0){cd.notes.clear();r=true;ch=true;}e.preventDefault();}if(r)renderCell(selectedRow,selectedCol);if(ch)saveGameState();});

        console.log("Event listeners added.");
    }


    // --- Инициализация Приложения ---
    function initializeApp(){console.log("Init app...");try{loadThemePreference();checkContinueButton();addEventListeners();showScreen(initialScreen);initializeAds();try{if(window.Telegram?.WebApp)Telegram.WebApp.ready();else console.log("TG SDK not found.");}catch(e){console.error("TG SDK Err:",e);}}catch(e){console.error("CRITICAL INIT ERR:",e);document.body.innerHTML=`<div style='padding:20px;color:red;'><h1>Ошибка!</h1><p>${e.message}</p><pre>${e.stack}</pre></div>`;}}

    // Проверка кнопки "Продолжить"
    function checkContinueButton(){if(!continueGameButton)return;try{const s=loadGameState();continueGameButton.disabled=!s;console.log(`Continue btn state:${!continueGameButton.disabled}`);}catch(e){console.error("Err check cont:",e);continueGameButton.disabled=true;}}

    // --- Запуск ---
    initializeApp();

}); // Конец 'DOMContentLoaded'
