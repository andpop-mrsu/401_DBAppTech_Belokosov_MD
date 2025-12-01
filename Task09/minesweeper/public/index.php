<?php

require __DIR__ . '/../vendor/autoload.php';

use Slim\Factory\AppFactory;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Exception\HttpNotFoundException;

// Создаем приложение Slim
$app = AppFactory::create();
$app->addErrorMiddleware(true, true, true);

// Настройка контента в JSON по умолчанию
$app->addRoutingMiddleware();

function getDb(): PDO
{
    $dbDir = __DIR__ . '/../db';
    if (!is_dir($dbDir)) {
        mkdir($dbDir, 0777, true);
    }
    $pdo = new PDO('sqlite:' . $dbDir . '/minesweeper.db');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Создание таблиц при первом запуске
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

    return $pdo;
}

// Middleware для JSON-ответов
$app->add(function (Request $request, $handler) {
    $response = $handler->handle($request);
    return $response
        ->withHeader('Content-Type', 'application/json');
});

// ➤ GET / → редирект на /index.html (статика)
$app->get('/', function (Request $request, Response $response) {
    return $response
        ->withStatus(302)
        ->withHeader('Location', '/index.html');
});

// ➤ GET /games — получить список всех игр
$app->get('/games', function (Request $request, Response $response) {
    $pdo = getDb();
    $stmt = $pdo->query("SELECT * FROM games ORDER BY id DESC");
    $games = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $response->getBody()->write(json_encode($games));
    return $response;
});

// ➤ GET /games/{id} — получить игру и её ходы
$app->get('/games/{id}', function (Request $request, Response $response, array $args) {
    $pdo = getDb();
    $gameId = (int)$args['id'];

    $stmt = $pdo->prepare("SELECT * FROM games WHERE id = ?");
    $stmt->execute([$gameId]);
    $game = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$game) {
        $response->getBody()->write(json_encode(['error' => 'Game not found']));
        return $response->withStatus(404);
    }

    $stmtMoves = $pdo->prepare("SELECT * FROM moves WHERE game_id = ? ORDER BY move_number ASC");
    $stmtMoves->execute([$gameId]);
    $game['moves'] = $stmtMoves->fetchAll(PDO::FETCH_ASSOC);

    $response->getBody()->write(json_encode($game));
    return $response;
});

// ➤ POST /games — создать новую игру
$app->post('/games', function (Request $request, Response $response) {
    $pdo = getDb();
    $data = (array) $request->getParsedBody();

    $sql = "INSERT INTO games (date, player_name, width, height, mines_count, mine_positions, outcome) 
            VALUES (?, ?, ?, ?, ?, ?, 'playing')";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        date('Y-m-d H:i:s'),
        $data['player_name'] ?? '',
        (int)($data['width'] ?? 10),
        (int)($data['height'] ?? 10),
        (int)($data['mines_count'] ?? 10),
        json_encode($data['mine_positions'] ?? [])
    ]);

    $result = ['id' => $pdo->lastInsertId()];
    $response->getBody()->write(json_encode($result));
    return $response;
});

// ➤ POST /step/{id} — записать ход
$app->post('/step/{id}', function (Request $request, Response $response, array $args) {
    $pdo = getDb();
    $gameId = (int)$args['id'];
    $data = (array) $request->getParsedBody();

    // Проверим, существует ли игра (не обязательно, но хорошо для защиты)
    $checkStmt = $pdo->prepare("SELECT id FROM games WHERE id = ?");
    $checkStmt->execute([$gameId]);
    if (!$checkStmt->fetch()) {
        $response->getBody()->write(json_encode(['error' => 'Game not found']));
        return $response->withStatus(404);
    }

    // Записываем ход
    $sql = "INSERT INTO moves (game_id, move_number, x, y, result) VALUES (?, ?, ?, ?, ?)";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        $gameId,
        (int)($data['move_number'] ?? 0),
        (int)($data['x'] ?? -1),
        (int)($data['y'] ?? -1),
        $data['result'] ?? 'unknown'
    ]);

    // Обновляем outcome игры при завершении
    $result = $data['result'];
    if ($result === 'explode' || $result === 'win') {
        $outcome = ($result === 'win') ? 'win' : 'loss';
        $pdo->prepare("UPDATE games SET outcome = ? WHERE id = ?")
            ->execute([$outcome, $gameId]);
    }

    $response->getBody()->write(json_encode(['status' => 'ok']));
    return $response;
});

// ➤ Все остальные маршруты — 404
$app->map(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], '/{routes:.+}', function (Request $request, Response $response) {
    $response->getBody()->write(json_encode(['error' => 'Not Found']));
    return $response->withStatus(404);
});

// Запуск приложения
$app->run();