/* =================================================================== 
   TRUEQUEA PE · Puente optimizado con api.php 
   Archivo: js/13-servidor.js 
   =================================================================== */

const SERVIDOR = { 
  activo: false, 
  url: 'api.php', 
  timer: null, 
  enviando: false, 
  ultimo: null,
  ultimoEnvio: 0
};

/* Guardar local + envío controlado */
const guardarSoloLocal = guardar;

guardar = function () {
  guardarSoloLocal();
  if (SERVIDOR.activo) programarEnvio();
};

/* 🔥 CONTROL DE FRECUENCIA (ANTI LAG) */
function programarEnvio() {
  const ahora = Date.now();

  // mínimo 5 segundos entre envíos
  if (ahora - SERVIDOR.ultimoEnvio < 5000) return;

  clearTimeout(SERVIDOR.timer);
  SERVIDOR.timer = setTimeout(() => {
    SERVIDOR.ultimoEnvio = Date.now();
    enviarAlServidor();
  }, 1000);
}

/* 🔥 ENVÍO OPTIMIZADO (NO TODA LA BD) */
async function enviarAlServidor() {
  if (!SERVIDOR.activo || SERVIDOR.enviando) return;

  SERVIDOR.enviando = true;

  try {
    // SOLO ENVÍA LO NECESARIO (puedes ajustar esto)
    const copia = {
      usuarios: BD.usuarios || [],
      mensajes: (BD.mensajes || []).slice(-20), // solo últimos 20
      publicaciones: (BD.publicaciones || []).slice(-20)
    };

    const r = await fetch(SERVIDOR.url + '?a=guardar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(copia),
    });

    const j = await r.json();

    if (j.ok) {
      SERVIDOR.ultimo = new Date();
      marcarModo();
    } else {
      avisar('Error al guardar: ' + (j.error || ''), 'err');
    }

  } catch (e) {
    SERVIDOR.activo = false;
    marcarModo();
  } finally {
    SERVIDOR.enviando = false;
  }
}

/* 🔥 CONEXIÓN OPTIMIZADA */
async function conectarServidor() {

  // Si usas Supabase, no usar PHP
  if (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.activa) {
    marcarModo();
    return;
  }

  if (!/^https?:$/.test(location.protocol)) {
    marcarModo();
    return;
  }

  try {
    // SOLO UNA PETICIÓN (quitamos ?a=estado)
    const res = await fetch(SERVIDOR.url + '?a=cargar');
    const data = await res.json();

    if (data.ok && data.datos) {
      SERVIDOR.activo = true;

      const miSesion = BD.sesion;

      // 🔥 NO REEMPLAZA TODO, SOLO ACTUALIZA
      Object.assign(BD, data.datos);

      BD.sesion = miSesion;

      if (!BD.visitas) BD.visitas = [];
      if (!BD.deseos) BD.deseos = [];
      if (!BD.seguros) BD.seguros = [];

      guardarSoloLocal();

      // 🔥 SOLO REDIBUJA UNA VEZ
      aplicarMarca();
      pintarCiudades();
      pintarCategorias();
      pintarNav();
      pintarLista();
      pintarMapa();
      pintarPremium();

      if (yo() && yo().rol === 'admin') pintarAdmin();

      avisar('🟢 Conectado al servidor (optimizado)', 'ok');

    } else {
      await enviarAlServidor(); // primera vez
      avisar('Servidor inicializado', 'ok');
    }

  } catch (e) {
    SERVIDOR.activo = false;
  }

  marcarModo();
}

/* Estado visual */
function marcarModo() {
  const pie = document.querySelector('.pie-base');
  if (!pie) return;

  let s = document.getElementById('modoDatos');

  if (!s) {
    s = document.createElement('span');
    s.id = 'modoDatos';
    s.style.cssText = 'display:block;margin-top:6px;font-size:12px';
    pie.appendChild(s);
  }

  s.innerHTML = SERVIDOR.activo
    ? `🟢 Servidor activo${SERVIDOR.ultimo ? ' · ' + SERVIDOR.ultimo.toLocaleTimeString() : ''}`
    : '🔵 Modo local';
}

/* Inicio */
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(conectarServidor, 500);
});
