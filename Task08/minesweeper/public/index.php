<?php
// Поднимаемся на уровень выше, чтобы найти vendor и db
$rootDir = dirname(__DIR__); // → Task08/ (родитель public/)
require $rootDir . '/vendor/autoload.php';

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Factory\AppFactory;

$app = AppFactory::create();
$app->addBodyParsingMiddleware();
$app->addRoutingMiddleware();
$errorMiddleware = $app->addErrorMiddleware(true, true, true);

// Путь к БД — в корне проекта
$dbPath = $rootDir . '/db/minesweeper.db';

function getDb($dbPath) {
    $dbDir = dirname($dbPath);
    if (!is_dir($dbDir)) {
        mkdir($dbDir, 0777, true);
    }
    if (!file_exists($dbPath)) {
        touch($dbPath);
        chmod($dbPath, 0666);
    }

    $pdo = new PDO("sqlite:$dbPath");
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // 👇 Создаём таблицы при КАЖДОМ подключении (если их нет)
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_name TEXT NOT NULL,
            board_size INTEGER NOT NULL,
            mine_count INTEGER NOT NULL,
            mine_layout TEXT NOT NULL,
            start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            outcome TEXT CHECK(outcome IN ('win', 'lose', 'abandoned')) DEFAULT 'abandoned'
        );
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS steps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id INTEGER NOT NULL,
            step_number INTEGER NOT NULL,
            x INTEGER NOT NULL,
            y INTEGER NOT NULL,
            result TEXT CHECK(result IN ('safe', 'mine', 'win')) NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE
        );
    ");

    return $pdo;
}

// Роуты
$app->get('/', function (Request $request, Response $response) {
    return $response->withHeader('Location', '/index.html')->withStatus(302);
});

$app->get('/games', function (Request $request, Response $response) use ($dbPath) {
    $pdo = getDb($dbPath);
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_name TEXT NOT NULL,
            board_size INTEGER NOT NULL,
            mine_count INTEGER NOT NULL,
            mine_layout TEXT NOT NULL,
            start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            outcome TEXT CHECK(outcome IN ('win', 'lose', 'abandoned')) DEFAULT 'abandoned'
        );
    ");
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS steps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id INTEGER NOT NULL,
            step_number INTEGER NOT NULL,
            x INTEGER NOT NULL,
            y INTEGER NOT NULL,
            result TEXT CHECK(result IN ('safe', 'mine', 'win')) NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE
        );
    ");

    $stmt = $pdo->query("
        SELECT id, player_name, board_size, mine_count, start_time, outcome
        FROM games
        ORDER BY start_time DESC
    ");
    $games = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $payload = json_encode($games, JSON_UNESCAPED_UNICODE);
    $response->getBody()->write($payload);
    return $response->withHeader('Content-Type', 'application/json');
});

$app->get('/games/{id}', function (Request $request, Response $response, $args) use ($dbPath) {
    $id = (int)$args['id'];
    $pdo = getDb($dbPath);

    $stmt = $pdo->prepare("SELECT * FROM games WHERE id = ?");
    $stmt->execute([$id]);
    $game = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$game) {
        $response->getBody()->write(json_encode(['error' => 'Game not found']));
        return $response->withStatus(404)->withHeader('Content-Type', 'application/json');
    }

    $stmt = $pdo->prepare("SELECT step_number, x, y, result FROM steps WHERE game_id = ? ORDER BY step_number");
    $stmt->execute([$id]);
    $steps = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $game['mine_layout'] = json_decode($game['mine_layout'], true);
    $game['steps'] = $steps;

    $payload = json_encode($game, JSON_UNESCAPED_UNICODE);
    $response->getBody()->write($payload);
    return $response->withHeader('Content-Type', 'application/json');
});

$app->post('/games', function (Request $request, Response $response) use ($dbPath) {
    $data = $request->getParsedBody();
    if (!isset($data['player_name'], $data['board_size'], $data['mine_count'], $data['mine_layout'])) {
        $response->getBody()->write(json_encode(['error' => 'Missing fields']));
        return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
    }

    $pdo = getDb($dbPath);
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare("
            INSERT INTO games (player_name, board_size, mine_count, mine_layout)
            VALUES (?, ?, ?, ?)
        ");
        $mineLayoutJson = json_encode($data['mine_layout']);
        $stmt->execute([
            $data['player_name'],
            $data['board_size'],
            $data['mine_count'],
            $mineLayoutJson
        ]);
        $gameId = (int)$pdo->lastInsertId();
        $pdo->commit();

        $response->getBody()->write(json_encode(['id' => $gameId]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(201);
    } catch (Exception $e) {
        $pdo->rollback();
        $response->getBody()->write(json_encode(['error' => $e->getMessage()]));
        return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
    }
});

$app->post('/step/{id}', function (Request $request, Response $response, $args) use ($dbPath) {
    $gameId = (int)$args['id'];
    $data = $request->getParsedBody();
    if (!isset($data['step_number'], $data['x'], $data['y'], $data['result'])) {
        $response->getBody()->write(json_encode(['error' => 'Missing step fields']));
        return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
    }

    $allowed = ['safe', 'mine', 'win'];
    if (!in_array($data['result'], $allowed)) {
        $response->getBody()->write(json_encode(['error' => 'Invalid result']));
        return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
    }

    $pdo = getDb($dbPath);
    try {
        $stmt = $pdo->prepare("
            INSERT INTO steps (game_id, step_number, x, y, result)
            VALUES (?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $gameId,
            $data['step_number'],
            $data['x'],
            $data['y'],
            $data['result']
        ]);

        if ($data['result'] === 'mine') {
            $pdo->exec("UPDATE games SET outcome = 'lose' WHERE id = $gameId");
        } elseif ($data['result'] === 'win') {
            $pdo->exec("UPDATE games SET outcome = 'win' WHERE id = $gameId");
        }

        $response->getBody()->write(json_encode(['ok' => true]));
        return $response->withHeader('Content-Type', 'application/json');
    } catch (Exception $e) {
        $response->getBody()->write(json_encode(['error' => $e->getMessage()]));
        return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
    }
});

$app->run();