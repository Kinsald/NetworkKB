<?php
// POST /api/delete_design.php
// Body: { id: <int> }
// Returns: { ok: true }

declare(strict_types=1);
require __DIR__ . '/lib/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    nkb_json_error('Use POST', 405);
}

$in = nkb_json_body();
$id = (int)($in['id'] ?? 0);

if ($id <= 0) {
    nkb_json_error('Valid id is required', 400);
}

try {
    $pdo = nkb_db();
    $stmt = $pdo->prepare('DELETE FROM designs WHERE id = :id');
    $stmt->execute([':id' => $id]);
    nkb_json_ok(['deleted' => $stmt->rowCount() > 0]);
} catch (Throwable $e) {
    nkb_json_error('Database error: ' . $e->getMessage());
}
