<?php
// Task08/public/index.php

// 1. Обработка статических файлов (для встроенного сервера PHP)
if (preg_match('/\.(?:png|jpg|jpeg|gif|css|js|html)$/', $_SERVER["REQUEST_URI"])) {
    return false; // Сервер вернет статический файл как есть
}

// 2. Настройка БД SQLite
$dbDir = __DIR__ . '/../db';
if (!is_dir($dbDir)) {
    mkdir($dbDir, 0777, true);
}
$pdo = new PDO('sqlite:' . $dbDir . '/minesweeper.db');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

// Создание таблиц, если их нет
$pdo->exec("CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    player_name TEXT,
    width INTEGER,
    height INTEGER,
    mines_count INTEGER,
    mine_positions TEXT,
    outcome TEXT DEFAULT 'playing'
)");

$pdo->exec("CREATE TABLE IF NOT EXISTS moves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER,
    move_number INTEGER,
    x INTEGER,
    y INTEGER,
    result TEXT,
    FOREIGN KEY(game_id) REFERENCES games(id)
)");

// 3. Маршрутизация (Front Controller)
$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

header('Content-Type: application/json');

// Вспомогательная функция для получения JSON из тела запроса
function getJsonInput() {
    return json_decode(file_get_contents('php://input'), true);
}

try {
    // GET /games - Получить список всех игр
    if ($method === 'GET' && $path === '/games') {
        $stmt = $pdo->query("SELECT * FROM games ORDER BY id DESC");
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    }
    // GET /games/{id} - Получить данные об игре и ходах
    elseif ($method === 'GET' && preg_match('#^/games/(\d+)$#', $path, $matches)) {
        $gameId = $matches[1];
        
        // Данные игры
        $stmt = $pdo->prepare("SELECT * FROM games WHERE id = ?");
        $stmt->execute([$gameId]);
        $game = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($game) {
            // Ходы игры
            $stmtMoves = $pdo->prepare("SELECT * FROM moves WHERE game_id = ? ORDER BY move_number ASC");
            $stmtMoves->execute([$gameId]);
            $game['moves'] = $stmtMoves->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode($game);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Game not found']);
        }
    }
    // POST /games - Создать новую игру
    elseif ($method === 'POST' && $path === '/games') {
        $data = getJsonInput();
        $sql = "INSERT INTO games (date, player_name, width, height, mines_count, mine_positions, outcome) 
                VALUES (?, ?, ?, ?, ?, ?, 'playing')";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            date('Y-m-d H:i:s'),
            $data['player_name'],
            $data['width'],
            $data['height'],
            $data['mines_count'],
            json_encode($data['mine_positions']) // Храним карту мин как JSON строку
        ]);
        
        echo json_encode(['id' => $pdo->lastInsertId()]);
    }
    // POST /step/{id} - Записать ход
    elseif ($method === 'POST' && preg_match('#^/step/(\d+)$#', $path, $matches)) {
        $gameId = $matches[1];
        $data = getJsonInput();
        
        // Записываем ход
        $sql = "INSERT INTO moves (game_id, move_number, x, y, result) VALUES (?, ?, ?, ?, ?)";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            $gameId,
            $data['move_number'],
            $data['x'],
            $data['y'],
            $data['result']
        ]);

        // Если игра закончилась (победа или взрыв), обновляем статус игры
        if ($data['result'] === 'explode' || $data['result'] === 'win') {
            $outcome = ($data['result'] === 'win') ? 'win' : 'loss';
            $stmtUpdate = $pdo->prepare("UPDATE games SET outcome = ? WHERE id = ?");
            $stmtUpdate->execute([$outcome, $gameId]);
        }

        echo json_encode(['status' => 'ok']);
    }
    // Переадресация корня на index.html (если не API запрос)
    elseif ($path === '/' || $path === '/index.php') {
        header('Location: /index.html');
    } 
    else {
        http_response_code(404);
        echo json_encode(['error' => 'Not Found']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}