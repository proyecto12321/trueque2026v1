<?php
declare(strict_types=1);

const ARCHIVO   = __DIR__ . '/truequea-datos.json';
const MAX_BYTES = 5 * 1024 * 1024; // 🔥 bajamos a 5MB

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function responder($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function leer() {
    if (!file_exists(ARCHIVO)) return [];
    $json = file_get_contents(ARCHIVO);
    return json_decode($json, true) ?: [];
}

function guardar($data) {
    return file_put_contents(ARCHIVO, json_encode($data));
}

/* ============================
   CARGAR (OPTIMIZADO)
============================ */
if ($_GET['a'] === 'cargar') {

    $db = leer();

    // 🔥 SOLO ENVÍA PARTE DE LOS DATOS
    $respuesta = [
        'ok' => true,
        'datos' => [
            'usuarios' => $db['usuarios'] ?? [],
            'mensajes' => array_slice($db['mensajes'] ?? [], -20),
            'publicaciones' => array_slice($db['publicaciones'] ?? [], -20),
        ]
    ];

    responder($respuesta);
}

/* ============================
   GUARDAR (OPTIMIZADO)
============================ */
if ($_GET['a'] === 'guardar') {

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        responder(['ok'=>false], 405);
    }

    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input || !isset($input['usuarios'])) {
        responder(['ok'=>false, 'error'=>'datos inválidos'], 400);
    }

    $db = leer();

    // 🔥 SOLO ACTUALIZA PARTES
    if (isset($input['usuarios'])) {
        $db['usuarios'] = $input['usuarios'];
    }

    if (isset($input['mensajes'])) {
        $db['mensajes'] = array_slice(
            array_merge($db['mensajes'] ?? [], $input['mensajes']),
            -50 // 🔥 máximo 50 mensajes
        );
    }

    if (isset($input['publicaciones'])) {
        $db['publicaciones'] = array_slice(
            array_merge($db['publicaciones'] ?? [], $input['publicaciones']),
            -50
        );
    }

    guardar($db);

    responder([
        'ok' => true,
        'total_mensajes' => count($db['mensajes'] ?? [])
    ]);
}

/* ============================
   DEFAULT
============================ */
responder(['ok'=>false, 'error'=>'acción inválida'], 404);
