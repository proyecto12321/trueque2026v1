/* ===================================================================
   TRUEQUEA PE · Supabase OPTIMIZADO REAL (SIN ERRORES)
   =================================================================== */

const SUPABASE_CONFIG = {
  activa: true,
  tabla: 'truequea_data',
  supabaseUrl: 'https://zrnhlrefjzunyfdnphhj.supabase.co',
  supabaseKey: 'sb_publishable_iE2sosBWooKdoNUaOUFo7Q_ziUrEHIk',
};

const SUPABASE_SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/dist/umd/supabase.min.js';

const NUBE = {
  activa: false,
  client: null,
  subiendo: false,
  ultimoEnvio: 0,
  errorMostrado: false
};

/* =========================
   CARGAR SDK
========================= */
async function cargarSDK() {
  if (window.supabase) return true;

  return new Promise(res => {
    const s = document.createElement("script");
    s.src = SUPABASE_SDK;
    s.onload = () => res(true);
    s.onerror = () => res(false);
    document.head.appendChild(s);
  });
}

/* =========================
   INICIAR
========================= */
async function iniciarNube() {
  if (!SUPABASE_CONFIG.activa) return;

  const ok = await cargarSDK();
  if (!ok) return;

  try {
    NUBE.client = supabase.createClient(
      SUPABASE_CONFIG.supabaseUrl,
      SUPABASE_CONFIG.supabaseKey
    );

    const { data } = await NUBE.client
      .from(SUPABASE_CONFIG.tabla)
      .select("data")
      .eq("id", 1)
      .maybeSingle();

    if (data && data.data) {
      Object.assign(BD, data.data);
      refrescarLigero();
    }

    NUBE.activa = true;

  } catch (e) {
    console.log("Supabase OFF:", e.message);
  }
}

/* =========================
   REFRESCO LIGERO
========================= */
function refrescarLigero() {
  requestAnimationFrame(() => {
    try {
      pintarLista();
      pintarMapa();
    } catch {}
  });
}

/* =========================
   SUBIDA ULTRA LIGERA
========================= */
async function subirANube() {

  if (!NUBE.activa || NUBE.subiendo) return;

  const ahora = Date.now();

  // 🔥 BLOQUEO FUERTE (6 segundos)
  if (ahora - NUBE.ultimoEnvio < 6000) return;

  NUBE.ultimoEnvio = ahora;
  NUBE.subiendo = true;

  try {

    // 🔥 SOLO DATOS MINIMOS
    const copia = {
      usuarios: (BD.usuarios || []).slice(0, 50), // máximo 50
      articulos: (BD.articulos || []).slice(-10), // últimos 10
      mensajes: (BD.mensajes || []).slice(-10),   // últimos 10
    };

    const size = JSON.stringify(copia).length;

    // 🔥 LIMITE REAL
    if (size > 300000) { // ~300KB
      console.warn("⚠️ Datos recortados automáticamente");
      return; // no subir nada
    }

    const { error } = await NUBE.client
      .from(SUPABASE_CONFIG.tabla)
      .upsert({
        id: 1,
        data: copia
      });

    if (error) throw error;

    NUBE.errorMostrado = false;

  } catch (e) {

    // 🔥 SOLO MOSTRAR ERROR UNA VEZ
    if (!NUBE.errorMostrado) {
      avisar("⚠️ Error Supabase (optimizado): " + e.message, "err");
      NUBE.errorMostrado = true;
    }

  } finally {
    NUBE.subiendo = false;
  }
}

/* =========================
   GUARDAR CONTROLADO
========================= */
const guardarBase = guardar;

guardar = function () {
  guardarBase();

  clearTimeout(NUBE.timer);

  // 🔥 SOLO 1 ENVÍO DESPUÉS DE 2s
  NUBE.timer = setTimeout(() => {
    subirANube();
  }, 2000);
};

/* =========================
   INICIO
========================= */
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(iniciarNube, 600);
});
