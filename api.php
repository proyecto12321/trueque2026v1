<?php
header('Content-Type: application/json');

const ARCHIVO = 'truequea-datos.json';

function leer() {
    if (!file_exists(ARCHIVO)) return [];
    return json_decode(file_get_contents(ARCHIVO), true) ?: [];
}

function guardar($data) {
    file_put_contents(ARCHIVO, json_encode($data));
}

/* =========================
   CARGAR
========================= */
if ($_GET['a'] === 'cargar') {

    $db = leer();

    echo json_encode([
        'ok' => true,
        'datos' => [
            'usuarios' => $db['usuarios'] ?? [],
            'mensajes' => array_slice($db['mensajes'] ?? [], -20),
            'articulos' => array_slice($db['articulos'] ?? [], -20)
        ]
    ]);
    exit;
}

/* =========================
   GUARDAR
========================= */
if ($_GET['a'] === 'guardar') {

    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input) {
        echo json_encode(['ok'=>false]);
        exit;
    }

    $db = leer();

    $db['usuarios'] = $input['usuarios'] ?? [];

    if (isset($input['mensajes'])) {
        $db['mensajes'] = array_slice(
            array_merge($db['mensajes'] ?? [], $input['mensajes']),
            -50
        );
    }

    if (isset($input['articulos'])) {
        $db['articulos'] = array_slice(
            array_merge($db['articulos'] ?? [], $input['articulos']),
            -50
        );
    }

    guardar($db);

    echo json_encode(['ok'=>true]);
    exit;
}

echo json_encode(['ok'=>false]);
