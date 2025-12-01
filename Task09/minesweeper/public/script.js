class MinesweeperApp {
    constructor() {
        this.currentGameId = null;
        this.boardSize = 0;
        this.minesCount = 0;
        this.minePositions = []; 
        this.moveNumber = 0;
        this.cells = []; 
        this.gameOver = false;
        this.isReplay = false;
        this.replayInterval = null;
    }

    // --- Навигация ---
    showMenu() { this.toggleScreen('menu'); }
    showNewGameForm() { this.toggleScreen('new-game-form'); }
    
    toggleScreen(id) {
        document.querySelectorAll('.screen, #menu').forEach(el => el.classList.add('hidden'));
        const target = document.getElementById(id);
        if(target) target.classList.remove('hidden');
        this.stopReplay();
    }

    stopReplay() {
        if (this.replayInterval) {
            clearInterval(this.replayInterval);
            this.replayInterval = null;
        }
    }

    // --- Старт игры ---
    async startGame() {
        const name = document.getElementById('player-name').value || "Anon";
        this.boardSize = parseInt(document.getElementById('board-size').value);
        this.minesCount = parseInt(document.getElementById('mines-count').value);

        if (this.minesCount >= this.boardSize * this.boardSize) {
            alert("Слишком много мин!");
            return;
        }

        this.generateMines();

        const gameData = {
            player_name: name,
            width: this.boardSize,
            height: this.boardSize,
            mines_count: this.minesCount,
            mine_positions: this.minePositions
        };

        try {
            const res = await fetch('/games', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(gameData)
            });
            const data = await res.json();
            this.currentGameId = data.id;
            this.initBoard(false);
        } catch (e) {
            console.error("Error:", e);
            alert("Ошибка сервера");
        }
    }

    // --- Отправка хода и ОБНОВЛЕНИЕ СЧЕТЧИКА ---
    async sendMove(x, y, result) {
        if (this.isReplay || !this.currentGameId) return;
        
        // 1. Увеличиваем счетчик в памяти
        this.moveNumber++;
        
        // 2. !!! ВАЖНО !!! Обновляем HTML сразу же
        const counterEl = document.getElementById('move-counter');
        if (counterEl) {
            counterEl.innerText = "Ход: " + this.moveNumber;
        }

        // 3. Отправляем на сервер (фоном)
        await fetch(`/step/${this.currentGameId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                move_number: this.moveNumber, 
                x, y, result 
            })
        });
    }

    // --- Список игр ---
    async loadGamesList() {
        this.toggleScreen('games-list-screen');
        const tbody = document.getElementById('games-table-body');
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">Загрузка...</td></tr>';

        try {
            const res = await fetch('/games');
            const games = await res.json();
            
            tbody.innerHTML = '';
            if(games.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">Нет записей</td></tr>';
                return;
            }

            games.forEach(game => {
                const tr = document.createElement('tr');
                const date = new Date(game.date).toLocaleDateString();
                let status = '...';
                if (game.outcome === 'win') status = '<b style="color:green">WIN</b>';
                else if (game.outcome !== 'playing') status = '<b style="color:red">LOSS</b>';

                tr.innerHTML = `
                    <td>${date}</td>
                    <td>${game.player_name}</td>
                    <td>${game.width}x${game.height}</td>
                    <td>${status}</td>
                    <td><button style="padding:5px 10px; font-size:10px; margin:0;" onclick="app.replayGame(${game.id})">▶</button></td>
                `;
                tbody.appendChild(tr);
            });
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="5">Ошибка сети</td></tr>';
        }
    }

    // --- Повтор игры ---
    async replayGame(id) {
        try {
            const res = await fetch(`/games/${id}`);
            const data = await res.json();
            
            this.boardSize = data.width;
            this.minesCount = data.mines_count;
            this.minePositions = JSON.parse(data.mine_positions);
            this.isReplay = true;
            
            this.initBoard(true);

            if (data.moves && data.moves.length > 0) {
                let i = 0;
                this.replayInterval = setInterval(() => {
                    if (i >= data.moves.length) {
                        this.stopReplay();
                        return;
                    }
                    const move = data.moves[i];
                    this.openCell(move.x, move.y, true); 
                    
                    // !!! ВАЖНО !!! Обновляем счетчик при повторе
                    const counterEl = document.getElementById('move-counter');
                    if (counterEl) {
                        counterEl.innerText = `Ход: ${move.move_number}`;
                    }
                    
                    i++;
                }, 500);
            } else {
                alert("Нет ходов в записи");
            }
        } catch (e) {
            console.error(e);
        }
    }

    // --- Логика ---
    generateMines() {
        this.minePositions = [];
        const total = this.boardSize * this.boardSize;
        while(this.minePositions.length < this.minesCount) {
            let rnd = Math.floor(Math.random() * total);
            if(!this.minePositions.includes(rnd)) this.minePositions.push(rnd);
        }
    }

    initBoard(isReplayMode) {
        this.toggleScreen('game-screen');
        const board = document.getElementById('board');
        board.innerHTML = '';
        board.style.gridTemplateColumns = `repeat(${this.boardSize}, 32px)`;
        
        this.cells = [];
        this.gameOver = false;
        this.moveNumber = 0;
        this.isReplay = isReplayMode;
        
        const statusEl = document.getElementById('game-status');
        statusEl.innerText = isReplayMode ? "REPLAY" : "PLAYING";
        statusEl.style.color = "#333";
        
        // !!! ВАЖНО !!! Сброс счетчика при старте
        const counterEl = document.getElementById('move-counter');
        if(counterEl) counterEl.innerText = "Ход: 0";

        for (let y = 0; y < this.boardSize; y++) {
            for (let x = 0; x < this.boardSize; x++) {
                const cell = document.createElement('div');
                cell.classList.add('cell');
                
                if (!isReplayMode) {
                    cell.addEventListener('click', () => this.handleCellClick(x, y));
                    cell.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        this.toggleFlag(cell);
                    });
                }
                
                board.appendChild(cell);
                this.cells.push(cell);
            }
        }
    }

    toggleFlag(cell) {
        if (this.gameOver || cell.classList.contains('opened')) return;
        cell.classList.toggle('flag');
        cell.innerText = cell.classList.contains('flag') ? '⚑' : ''; 
    }

    handleCellClick(x, y) {
        if (this.gameOver || this.isReplay) return;
        const cell = this.getCell(x, y);
        if (cell.classList.contains('opened') || cell.classList.contains('flag')) return;

        const index = y * this.boardSize + x;
        let result = 'ok';

        if (this.minePositions.includes(index)) {
            result = 'explode';
            this.gameOver = true;
            this.showAllMines();
            cell.style.backgroundColor = '#333'; 
            const s = document.getElementById('game-status');
            s.innerText = "GAME OVER";
            s.style.color = "red";
        } else {
            const openedCount = document.querySelectorAll('.cell.opened').length;
            if (openedCount + 1 === (this.boardSize * this.boardSize) - this.minesCount) {
                result = 'win';
                this.gameOver = true;
                this.showAllMines(true);
                const s = document.getElementById('game-status');
                s.innerText = "WINNER";
                s.style.color = "green";
            }
        }

        this.openCell(x, y, false);
        this.sendMove(x, y, result);
    }

    getCell(x, y) {
        if (x < 0 || x >= this.boardSize || y < 0 || y >= this.boardSize) return null;
        return this.cells[y * this.boardSize + x];
    }

    openCell(x, y, isReplayAction) {
        const cell = this.getCell(x, y);
        if (!cell || cell.classList.contains('opened')) return;

        cell.classList.remove('flag');
        cell.innerText = '';
        cell.classList.add('opened');
        
        const index = y * this.boardSize + x;

        if (this.minePositions.includes(index)) {
            cell.classList.add('mine');
            cell.innerText = '✕';
        } else {
            const minesAround = this.countMinesAround(x, y);
            if (minesAround > 0) {
                cell.innerText = minesAround;
                cell.classList.add(`val-${minesAround}`);
            } else {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        this.openCell(x + dx, y + dy, true);
                    }
                }
            }
        }
    }

    countMinesAround(x, y) {
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && nx < this.boardSize && ny >= 0 && ny < this.boardSize) {
                    if (this.minePositions.includes(ny * this.boardSize + nx)) count++;
                }
            }
        }
        return count;
    }

    showAllMines(isWin = false) {
        this.minePositions.forEach(index => {
            const cell = this.cells[index];
            if (!cell.classList.contains('opened')) {
                cell.classList.add(isWin ? 'flag' : 'mine');
                cell.innerText = isWin ? '⚑' : '✕';
            }
        });
    }
}

const app = new MinesweeperApp();