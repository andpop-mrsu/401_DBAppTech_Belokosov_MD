class UI {
    constructor() {
        this.game = null;
        this.database = new Database();
        this.currentGameId = null;
        this.isReplayMode = false;

        this.menuElement = document.getElementById('menu');
        this.gameContainerElement = document.getElementById('game-container');
        this.gameBoardElement = document.getElementById('game-board');
        this.movesListElement = document.getElementById('moves-list');
        this.gamesListElement = document.getElementById('games-list');
        
        this.bindEvents();
        this.initDatabase();
    }

    async initDatabase() {
        try {
            await this.database.init();
            console.log('База данных инициализирована');
        } catch (error) {
            console.error('Ошибка инициализации базы данных:', error);
        }
    }

    bindEvents() {
        // Новая игра
        document.getElementById('new-game-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.startNewGame();
        });
        
        // Показать список игр
        document.getElementById('show-games-btn').addEventListener('click', () => {
            this.showGamesList();
        });
        
        // Повторить игру
        document.getElementById('replay-game-btn').addEventListener('click', () => {
            this.replayGame();
        });
        
        // Вернуться в меню
        document.getElementById('back-to-menu').addEventListener('click', () => {
            this.showMenu();
        });
    }

    startNewGame() {
        const playerName = document.getElementById('player-name').value;
        const size = parseInt(document.getElementById('field-size').value);
        const minesCount = parseInt(document.getElementById('mines-count').value);
        
        if (minesCount >= size * size) {
            alert('Количество мин не может быть больше или равно количеству ячеек!');
            return;
        }
        
        this.game = new Minesweeper(size, minesCount);
        this.currentGameId = null;
        
        document.getElementById('current-player').textContent = playerName;
        document.getElementById('current-size').textContent = `${size}x${size}`;
        document.getElementById('current-mines').textContent = minesCount;
        document.getElementById('game-status').textContent = 'В процессе';
        
        this.renderBoard();
        this.clearMovesLog();
        this.showGame();
    }

    renderBoard() {
        this.gameBoardElement.innerHTML = '';
        this.gameBoardElement.style.gridTemplateColumns = `repeat(${this.game.size}, 30px)`;
        
        for (let x = 0; x < this.game.size; x++) {
            const row = document.createElement('div');
            row.className = 'board-row';
            
            for (let y = 0; y < this.game.size; y++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.x = x;
                cell.dataset.y = y;
                
                if (!this.isReplayMode) {
                    cell.addEventListener('click', () => this.handleCellClick(x, y));
                    cell.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        this.handleRightClick(x, y);
                    });
                } else {
                    cell.style.cursor = 'default';
                    cell.classList.add('replay-mode');
                }
                
                row.appendChild(cell);
            }
            
            this.gameBoardElement.appendChild(row);
        }
    }


    handleCellClick(x, y) {
        if (!this.game || this.game.gameOver) return;
        
        const result = this.game.reveal(x, y);
        
        if (result.revealed.length > 0) {
            this.updateBoard(result.revealed);
            this.addMoveToLog(result.result, x, y);
            
            if (result.result === 'exploded' || result.result === 'won') {
                this.endGame(result.result);
                
                // Сохраняем игру в базу данных
                if (this.currentGameId === null) {
                    this.saveGameToDatabase();
                }
            }
        }
    }

    handleRightClick(x, y) {
        if (!this.game || this.game.gameOver) return;
        
        const flagged = this.game.toggleFlag(x, y);
        const cell = this.getCellElement(x, y);
        
        if (flagged) {
            if (this.game.flagged[x][y]) {
                cell.classList.add('flag');
                cell.textContent = '🚩';
            } else {
                cell.classList.remove('flag');
                cell.textContent = '';
            }
        }
    }

    updateBoard(revealedCells) {
        revealedCells.forEach(cell => {
            const cellElement = this.getCellElement(cell.x, cell.y);
            cellElement.classList.add('revealed');
            cellElement.classList.remove('flag');
            
            if (cell.value === -1) {
                cellElement.classList.add('mine');
                cellElement.textContent = '💣';
            } else if (cell.value > 0) {
                cellElement.textContent = cell.value;
                const colors = ['', 'blue', 'green', 'red', 'purple', 'maroon', 'turquoise', 'black', 'gray'];
                cellElement.style.color = colors[cell.value] || 'black';
            } else {
                cellElement.textContent = '';
            }
        });
    }

    getCellElement(x, y) {
        return document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
    }

    addMoveToLog(result, x, y) {
        const moveItem = document.createElement('div');
        moveItem.className = 'move-item';
        
        let resultText = '';
        switch (result) {
            case 'no_mine':
                resultText = 'мины нет';
                break;
            case 'exploded':
                resultText = 'взорвался';
                break;
            case 'won':
                resultText = 'выиграл';
                break;
        }
        
        moveItem.textContent = `Ход ${this.game.currentMove} | (${x},${y}) | ${resultText}`;
        this.movesListElement.appendChild(moveItem);
        this.movesListElement.scrollTop = this.movesListElement.scrollHeight;
    }

    clearMovesLog() {
        this.movesListElement.innerHTML = '';
    }

    endGame(result) {
        document.getElementById('game-status').textContent = 
            result === 'won' ? 'Победа!' : 'Поражение!';
        
        if (result === 'exploded') {
            this.game.mines.forEach(mine => {
                const cell = this.getCellElement(mine.x, mine.y);
                if (!this.game.revealed[mine.x][mine.y]) {
                    cell.classList.add('mine');
                    cell.textContent = '💣';
                }
            });
        }
    }

    async saveGameToDatabase() {
        try {
            const gameData = this.game.getGameData(document.getElementById('current-player').textContent);
            const gameId = await this.database.saveGame(gameData);
            
            // Сохраняем ходы
            for (const move of this.game.moves) {
                await this.database.saveMove({
                    gameId: gameId,
                    moveNumber: move.moveNumber,
                    x: move.x,
                    y: move.y,
                    result: move.result
                });
            }
            
            this.currentGameId = gameId;
            console.log('Игра сохранена с ID:', gameId);
        } catch (error) {
            console.error('Ошибка сохранения игры:', error);
        }
    }

    async showGamesList() {
        try {
            const games = await this.database.getAllGames();
            this.gamesListElement.innerHTML = '';
            
            if (games.length === 0) {
                this.gamesListElement.innerHTML = '<p>Нет сохраненных игр</p>';
                return;
            }
            
            games.forEach(game => {
                const gameItem = document.createElement('div');
                gameItem.className = 'game-item';
                gameItem.innerHTML = `
                    <strong>Игра #${game.id}</strong><br>
                    Игрок: ${game.player}<br>
                    Дата: ${new Date(game.date).toLocaleString()}<br>
                    Размер: ${game.size}x${game.size}, Мин: ${game.minesCount}<br>
                    Результат: ${game.result === 'win' ? 'Победа' : game.result === 'lose' ? 'Поражение' : 'В процессе'}
                `;
                gameItem.addEventListener('click', () => {
                    document.getElementById('game-id').value = game.id;
                });
                this.gamesListElement.appendChild(gameItem);
            });
        } catch (error) {
            console.error('Ошибка загрузки списка игр:', error);
        }
    }

    async replayGame() {
        const gameId = parseInt(document.getElementById('game-id').value);
        
        if (!gameId) {
            alert('Введите ID игры');
            return;
        }
        
        try {
            const gameData = await this.database.getGameById(gameId);
            const moves = await this.database.getMovesByGameId(gameId);
            
            if (!gameData) {
                alert('Игра с указанным ID не найдена');
                return;
            }
            
            this.game = new Minesweeper(gameData.size, gameData.minesCount);
            this.currentGameId = gameId;
            this.isReplayMode = true; // Включаем режим повтора
            
            // Восстанавливаем поле с минами
            this.game.firstClick = false;
            this.game.mines = gameData.mines;
            
            // Восстанавливаем поле с числами
            for (let x = 0; x < gameData.size; x++) {
                for (let y = 0; y < gameData.size; y++) {
                    this.game.board[x][y] = 0;
                }
            }
            
            gameData.mines.forEach(mine => {
                this.game.board[mine.x][mine.y] = -1;
            });
            
            for (let x = 0; x < gameData.size; x++) {
                for (let y = 0; y < gameData.size; y++) {
                    if (this.game.board[x][y] !== -1) {
                        this.game.board[x][y] = this.game.countAdjacentMines(x, y);
                    }
                }
            }
            
            document.getElementById('current-player').textContent = gameData.player;
            document.getElementById('current-size').textContent = `${gameData.size}x${gameData.size}`;
            document.getElementById('current-mines').textContent = gameData.minesCount;
            document.getElementById('game-status').textContent = 'Повтор игры (режим просмотра)';
            
            this.renderBoard();
            this.clearMovesLog();
            this.showGame();
            
            this.disableBoardInteraction();
            
            this.replayMoves(moves);
            
        } catch (error) {
            console.error('Ошибка загрузки игры:', error);
            alert('Ошибка загрузки игры');
        }
    }

    disableBoardInteraction() {
        const cells = document.querySelectorAll('.cell');
        cells.forEach(cell => {
            cell.style.cursor = 'default';
            cell.classList.add('replay-mode');
            
            // Удаляем обработчики событий
            cell.replaceWith(cell.cloneNode(true));
        });
    }

    replayMoves(moves) {
        let moveIndex = 0;
        
        const playNextMove = () => {
            if (moveIndex >= moves.length) {
                this.endGame(this.game.gameWon ? 'won' : 'exploded');
                return;
            }
            
            const move = moves[moveIndex];
            const result = this.game.reveal(move.x, move.y);
            
            if (result.revealed.length > 0) {
                this.updateBoard(result.revealed);
                this.addMoveToLog(move.result, move.x, move.y);
            }
            
            moveIndex++;
            
            if (result.result === 'exploded' || result.result === 'won') {
                this.endGame(result.result);
            } else {
                setTimeout(playNextMove, 500); // Задержка между ходами
            }
        };
        
        playNextMove();
    }

    showGame() {
        this.menuElement.classList.add('hidden');
        this.gameContainerElement.classList.remove('hidden');
        
        const replayNotice = document.getElementById('replay-notice');
        if (this.isReplayMode) {
            replayNotice.classList.remove('hidden');
        } else {
            replayNotice.classList.add('hidden');
        }
    }

    showMenu() {
        this.gameContainerElement.classList.add('hidden');
        this.menuElement.classList.remove('hidden');
        this.isReplayMode = false;
        
        document.getElementById('replay-notice').classList.add('hidden');
    }
}