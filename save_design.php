<?php
// POST /api/save_design.php
// Body: { name, users, floors, redundancy, voice, wifi, growth, block }
// Returns: { ok: true, id: <int> }

declare(strict_types=1);
require __DIR__ . '/lib/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    nkb_json_error('Use POST', 405);
}

$in = nkb_json_body();

$name       = trim((string)($in['name'] ?? ''));
$users      = (int)($in['users'] ?? 0);
$floors     = (int)($in['floors'] ?? 0);
$redundancy = trim((string)($in['redundancy'] ?? ''));
$voice      = trim((string)($in['voice'] ?? ''));
$wifi       = trim((string)($in['wifi'] ?? ''));
$growth     = (int)($in['growth'] ?? 0);
$block      = trim((string)($in['block'] ?? ''));

if ($name === '' || $users <= 0 || $floors <= 0) {
    nkb_json_error('name, users, and floors are required', 400);
}

try {
    $pdo = nkb_db();
    $stmt = $pdo->prepare(
        'INSERT INTO designs (name, users, floors, redundancy, voice, wifi, growth, block)
         VALUES (:name, :users, :floors, :redundancy, :voice, :wifi, :growth, :block)'
    );
    $stmt->execute([
        ':name' => $name,
        ':users' => $users,
        ':floors' => $floors,
        ':redundancy' => $redundancy,
        ':voice' => $voice,
        ':wifi' => $wifi,
        ':growth' => $growth,
        ':block' => $block,
    ]);
    nkb_json_ok(['id' => (int)$pdo->lastInsertId()]);
} catch (Throwable $e) {
    nkb_json_error('Database error: ' . $e->getMessage());
}
