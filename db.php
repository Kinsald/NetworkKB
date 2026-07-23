<?php
// db.php — shared SQLite connection + schema bootstrap.
// Uses SQLite so there's zero external database server to stand up —
// the .sqlite file is created automatically on first run, right next
// to this script, inside data/.

declare(strict_types=1);

function nkb_db(): PDO {
    $dbPath = __DIR__ . '/../../data/networkkb.sqlite';
    $isNew = !file_exists($dbPath);

    $pdo = new PDO('sqlite:' . $dbPath);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('PRAGMA foreign_keys = ON;');

    if ($isNew) {
        $pdo->exec(<<<SQL
            CREATE TABLE IF NOT EXISTS designs (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT NOT NULL,
                users       INTEGER NOT NULL,
                floors      INTEGER NOT NULL,
                redundancy  TEXT NOT NULL,
                voice       TEXT NOT NULL,
                wifi        TEXT NOT NULL,
                growth      INTEGER NOT NULL,
                block       TEXT NOT NULL,
                created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );
        SQL);
    }

    return $pdo;
}

// Small helper: read + decode a JSON POST body, or bail with a 400.
function nkb_json_body(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        nkb_json_error('Invalid or missing JSON body', 400);
    }
    return $data;
}

function nkb_json_ok(array $payload = []): void {
    header('Content-Type: application/json');
    echo json_encode(array_merge(['ok' => true], $payload));
    exit;
}

function nkb_json_error(string $message, int $status = 500): void {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'error' => $message]);
    exit;
}
