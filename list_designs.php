<?php
// GET /api/list_designs.php            -> { ok: true, designs: [ {id,name,users,floors,redundancy,created_at}, ... ] }
// GET /api/list_designs.php?id=<int>   -> { ok: true, design: { ...full row... } }

declare(strict_types=1);
require __DIR__ . '/lib/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    nkb_json_error('Use GET', 405);
}

try {
    $pdo = nkb_db();

    if (isset($_GET['id'])) {
        $id = (int)$_GET['id'];
        $stmt = $pdo->prepare('SELECT * FROM designs WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            nkb_json_error('Design not found', 404);
        }
        nkb_json_ok(['design' => $row]);
    }

    $stmt = $pdo->query(
        'SELECT id, name, users, floors, redundancy, created_at
         FROM designs ORDER BY created_at DESC, id DESC'
    );
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    nkb_json_ok(['designs' => $rows]);
} catch (Throwable $e) {
    nkb_json_error('Database error: ' . $e->getMessage());
}
