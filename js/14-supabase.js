/* ===================================================================
   TRUEQUEA PE · Base de datos en la nube (Supabase) OPTIMIZADO
   Archivo: js/14-supabase.js
   =================================================================== */

const SUPABASE_CONFIG = {
  activa: true,
  tabla: 'truequea_data',
  segundosRevision: 15,
  supabaseUrl: 'https://zrnhlrefjzunyfdnphhj.supabase.co',
  supabaseKey: 'sb_publishable_iE2sosBWooKdoNUaOUFo7Q_ziUrEHIk',
};

const SUPABASE_SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/dist/umd/supabase.min.js';

const NUBE = {
  activa: false,
  client: null,
  subiendo: false,
  ultimaEscritura: null,
  error: null,
  leido: false
};

/* =========================
   CARGAR SDK
========================= */
async function cargarSupabaseSDK() {
  if (window.supabase) return true;

  return new Promise(resolve => {
    const script = document.createElement('script');
    script.src = SUPABASE_SDK;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

/* =========================
   INICIAR
========================= */
async function iniciarNube() {
  if (!SUPABASE_CONFIG.activa) return;

  const ok = await cargarSupabaseSDK();
  if (!ok) return;

  try {
    NUBE.client = supabase.createClient(
      SUPABASE_CONFIG.supabaseUrl,
      SUPABASE_CONFIG.supabaseKey
    );

    const { data, error } = await NUBE.client
      .from(SUPABASE_CONFIG.tabla)
      .select('data')
      .eq('id', 1)
      .maybeSingle();

    if (error) throw error;

    if (data && data.data) {
      aplicarDesdeNube(data.data);
    } else {
      subirANube(true);
    }

    NUBE.activa = true;
    NUBE.leido = true;

    iniciarPolling();

  } catch (e) {
    console.error('Error Supabase:', e);
    NUBE.error = e.message;
  }
}

/* =========================
   POLLING (RESPALDO)
========================= */
function iniciarPolling() {
  setInterval(bajarDatos, SUPABASE_CONFIG.segundosRevision * 1000);
}

async function bajarDatos() {
  if (!NUBE.activa || NUBE.subiendo) return;

  try {
    const { data } = await NUBE.client
      .from(SUPABASE_CONFIG.tabla)
      .select('data')
      .eq('id', 1)
      .maybeSingle();

    if (data && data.data) {
      aplicarDesdeNube(data.data);
    }

  } catch (e) {
    console.warn('Error lectura:', e);
  }
}

/* =========================
   APLICAR DATOS (SIN LAG)
========================= */
function aplicarDesdeNube(datos) {
  if (!datos) return;

  Object.assign(BD, datos);

  guardarSoloLocal();

  // 🔥 evitar congelamiento
  requestAnimationFrame(() => {
    try {
      pintarLista();
      pintarMapa();
    } catch (e) {}
  });
}

/* =========================
   SUBIR DATOS OPTIMIZADO
========================= */
async function subirANube(primeraVez = false) {

  if (!NUBE.activa || NUBE.subiendo) return;

  const ahora = Date.now();

  // 🔥 evita spam (cada 5 segundos)
  if (NUBE.ultimaEscritura && (ahora - NUBE.ultimaEscritura.getTime() < 5000)) {
    return;
  }

  if (!NUBE.leido && !primeraVez) return;

  NUBE.subiendo = true;

  try {

    // 🔥 SOLO DATOS NECESARIOS
    const copia = {
      usuarios: BD.usuarios || [],
      articulos: (BD.articulos || []).slice(-20),
      mensajes: (BD.mensajes || []).slice(-20),
      actualizado: Date.now()
    };

    const texto = JSON.stringify(copia);

    // 🔥 LIMITE DE SEGURIDAD
    if (texto.length > 1 * 1024 * 1024) {
      throw new Error('Datos demasiado grandes');
    }

    const { error } = await NUBE.client
      .from(SUPABASE_CONFIG.tabla)
      .upsert({
        id: 1,
        data: copia,
        actualizado: new Date().toISOString()
      });

    if (error) throw error;

    NUBE.ultimaEscritura = new Date();
    NUBE.error = null;

  } catch (e) {
    console.error('Supabase:', e);
    NUBE.error = e.message;
    avisar('Error Supabase: ' + e.message, 'err');
  }

  NUBE.subiendo = false;
}

/* =========================
   GUARDAR CONTROLADO
========================= */
const guardarAntes = guardar;

guardar = function () {
  guardarAntes();

  // 🔥 evitar múltiples envíos
  clearTimeout(NUBE.timer);
  NUBE.timer = setTimeout(() => {
    subirANube();
  }, 2000);
};

/* =========================
   INICIO
========================= */
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(iniciarNube, 500);
});
