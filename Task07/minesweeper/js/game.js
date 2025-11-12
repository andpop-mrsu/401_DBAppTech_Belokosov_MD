class Minesweeper {
    constructor(size, minesCount) {
        this.size = size;
        this.minesCount = minesCount;
        this.board = [];
        this.revealed = [];
        this.flagged = [];
        this.gameOver = false;
        this.gameWon = false;
        this.mines = [];
        this.firstClick = true;
        this.moves = [];
        this.currentMove = 0;
        
        this.initBoard();
    }

    initBoard() {
        this.board = Array(this.size).fill().map(() => Array(this.size).fill(0));
        this.revealed = Array(this.size).fill().map(() => Array(this.size).fill(false));
        this.flagged = Array(this.size).fill().map(() => Array(this.size).fill(false));
        this.mines = [];
    }

    placeMines(firstX, firstY) {
        let minesPlaced = 0;
        
        while (minesPlaced < this.minesCount) {
            const x = Math.floor(Math.random() * this.size);
            const y = Math.floor(Math.random() * this.size);
            
            if ((x === firstX && y === firstY) || 
                (Math.abs(x - firstX) <= 1 && Math.abs(y - firstY) <= 1)) {
                continue;
            }
            
            if (!this.board[x][y]) {
                this.board[x][y] = -1;
                this.mines.push({x, y});
                minesPlaced++;
            }
        }
        
        // Заполняем поле числами
        for (let x = 0; x < this.size; x++) {
            for (let y = 0; y < this.size; y++) {
                if (this.board[x][y] !== -1) {
                    this.board[x][y] = this.countAdjacentMines(x, y);
                }
            }
        }
    }

    countAdjacentMines(x, y) {
        let count = 0;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < this.size && ny >= 0 && ny < this.size && this.board[nx][ny] === -1) {
                    count++;
                }
            }
        }
        return count;
    }

    reveal(x, y) {
        if (this.gameOver || this.revealed[x][y] || this.flagged[x][y]) {
            return { revealed: [], result: 'invalid' };
        }
        
        if (this.firstClick) {
            this.placeMines(x, y);
            this.firstClick = false;
        }
        
        const revealedCells = [];
        
        if (this.board[x][y] === -1) {
            this.revealed[x][y] = true;
            revealedCells.push({x, y, value: -1});
            this.gameOver = true;
            
            this.currentMove++;
            this.moves.push({
                moveNumber: this.currentMove,
                x,
                y,
                result: 'exploded'
            });
            
            return { revealed: revealedCells, result: 'exploded' };
        }
        
        // Рекурсивное открытие ячеек
        const toReveal = [{x, y}];
        
        while (toReveal.length > 0) {
            const cell = toReveal.pop();
            const cx = cell.x;
            const cy = cell.y;
            
            if (this.revealed[cx][cy]) continue;
            
            this.revealed[cx][cy] = true;
            revealedCells.push({x: cx, y: cy, value: this.board[cx][cy]});
            
            if (this.board[cx][cy] === 0) {
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        const nx = cx + dx;
                        const ny = cy + dy;
                        if (nx >= 0 && nx < this.size && ny >= 0 && ny < this.size && 
                            !this.revealed[nx][ny] && !this.flagged[nx][ny]) {
                            toReveal.push({x: nx, y: ny});
                        }
                    }
                }
            }
        }
        
        this.currentMove++;
        this.moves.push({
            moveNumber: this.currentMove,
            x,
            y,
            result: 'no_mine'
        });
        
        if (this.checkWin()) {
            this.gameWon = true;
            this.moves[this.moves.length - 1].result = 'won';
            return { revealed: revealedCells, result: 'won' };
        }
        
        return { revealed: revealedCells, result: 'no_mine' };
    }

    toggleFlag(x, y) {
        if (this.gameOver || this.revealed[x][y]) {
            return false;
        }
        
        this.flagged[x][y] = !this.flagged[x][y];
        return true;
    }

    checkWin() {
        for (let x = 0; x < this.size; x++) {
            for (let y = 0; y < this.size; y++) {
                if (!this.revealed[x][y] && this.board[x][y] !== -1) {
                    return false;
                }
            }
        }
        return true;
    }

    getGameData(playerName) {
        return {
            date: new Date().toISOString(),
            player: playerName,
            size: this.size,
            minesCount: this.minesCount,
            mines: this.mines,
            result: this.gameWon ? 'win' : (this.gameOver ? 'lose' : 'in_progress'),
            moves: this.moves
        };
    }
}