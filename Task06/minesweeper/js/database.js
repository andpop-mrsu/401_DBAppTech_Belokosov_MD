class Database {
    constructor() {
        this.db = null;
        this.dbName = 'MinesweeperDB';
        this.dbVersion = 1;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Создаем хранилище для игр
                if (!db.objectStoreNames.contains('games')) {
                    const gamesStore = db.createObjectStore('games', { keyPath: 'id', autoIncrement: true });
                    gamesStore.createIndex('date', 'date', { unique: false });
                    gamesStore.createIndex('player', 'player', { unique: false });
                }
                
                // Создаем хранилище для ходов
                if (!db.objectStoreNames.contains('moves')) {
                    const movesStore = db.createObjectStore('moves', { keyPath: 'id', autoIncrement: true });
                    movesStore.createIndex('gameId', 'gameId', { unique: false });
                }
            };
        });
    }

    async saveGame(gameData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['games'], 'readwrite');
            const store = transaction.objectStore('games');
            const request = store.add(gameData);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    async saveMove(moveData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['moves'], 'readwrite');
            const store = transaction.objectStore('moves');
            const request = store.add(moveData);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    async getAllGames() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['games'], 'readonly');
            const store = transaction.objectStore('games');
            const request = store.getAll();
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    async getGameById(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['games'], 'readonly');
            const store = transaction.objectStore('games');
            const request = store.get(id);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    async getMovesByGameId(gameId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['moves'], 'readonly');
            const store = transaction.objectStore('moves');
            const index = store.index('gameId');
            const request = index.getAll(gameId);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }
}