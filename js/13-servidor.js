/* =========================
   SERVIDOR OPTIMIZADO
========================= */

const SERVIDOR = {
  activo: false,
  url: 'api.php',
  enviando: false,
  ultimoEnvio: 0
};

const guardarSoloLocal = guardar;

/* 🔥 CONTROL TOTAL */
guardar = function () {
  guardarSoloLocal();
  if (SERVIDOR.activo) enviarControlado();
};

function enviarControlado() {
  const ahora = Date.now();

  // 🔥 evita spam (cada 5s)
  if (ahora - SERVIDOR.ultimoEnvio < 5000) return;

  SERVIDOR.ultimoEnvio = ahora;
  enviarAlServidor();
}

async function enviarAlServidor() {
  if (SERVIDOR.enviando) return;
  SERVIDOR.enviando = true;

  try {
    const data = {
      usuarios: BD.usuarios,
      mensajes: (BD.mensajes || []).slice(-20),
      articulos: (BD.articulos || []).slice(-20)
    };

    await fetch(SERVIDOR.url + '?a=guardar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

  } catch (e) {
    SERVIDOR.activo = false;
  }

  SERVIDOR.enviando = false;
}

/* 🔥 SOLO UNA CARGA */
async function conectarServidor() {
  try {
    const r = await fetch(SERVIDOR.url + '?a=cargar');
    const j = await r.json();

    if (j.ok && j.datos) {
      SERVIDOR.activo = true;

      const sesion = BD.sesion;

      Object.assign(BD, j.datos);

      BD.sesion = sesion;

      aplicarMarca();
      pintarLista();
      pintarMapa();

    }

  } catch {
    SERVIDOR.activo = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(conectarServidor, 500);
});
