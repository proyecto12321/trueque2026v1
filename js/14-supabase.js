/* ===================================================================
   TRUEQUEA PE · Base de datos en la nube (Supabase)
   Archivo: js/14-supabase.js
   =================================================================== */

/* =====================================================================
   TRUEQUEA PE — BASE DE DATOS EN LA NUBE (Supabase)
   ---------------------------------------------------------------------
   Con esto todos los usuarios comparten la MISMA información desde
   cualquier celular o computadora.
   ===================================================================== */

const SUPABASE_CONFIG = {
  activa: true,
  tabla: 'truequea_data',  // nombre de la tabla en Supabase
  segundosRevision: 15,     // cada cuánto revisa la nube
  supabaseUrl: 'https://zrnhlrefjzunyfdnphhj.supabase.co',
  supabaseKey: 'sb_publishable_iE2sosBWooKdoNUaOUFo7Q_ziUrEHIk',
};

// SDK de Supabase (cargado dinámicamente) — preferimos CDN
const SUPABASE_SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/dist/umd/supabase.min.js';

const NUBE = {
  activa: false, modo: 'local', client: null, timer: null,
  subiendo: false, aplicando: false, huella: null, ultima: null,
  error: null, detalle: '', conectado: null,
  leido: false, ultimoConteo: null, pendiente: false,
  ultimaLectura: null, ultimaEscritura: null, canal: null,
};

/* Resumen corto de los datos: evita subir o repintar de gabete */
function huellaBD(datos) {
  const copia = { ...datos };
  delete copia.sesion;
  delete copia.sesionVence;
  delete copia.actualizado;
  return JSON.stringify(copia);
}

/* Deja la base con todas sus listas, aunque la nube devuelva algo incompleto */
function sanear(datos) {
  ['usuarios', 'articulos', 'anuncios', 'intercambios', 'chats', 'mensajes', 'notis',
   'favoritos', 'resenas', 'pagos', 'visitas', 'deseos', 'seguros'].forEach(k => {
    if (!Array.isArray(datos[k])) datos[k] = [];
  });
  if (!datos.config) datos.config = semilla().config;
  return datos;
}

/* Carga el SDK de Supabase (intenta local, si falla cae al CDN) */
function cargarSupabaseSDK() {
  const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/dist/umd/supabase.min.js';
  return new Promise((resolve) => {
    try {
      if (window.supabase) { resolve(true); return; }

      const tryLoad = (src) => new Promise((res) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => res(true);
        script.onerror = () => res(false);
        document.head.appendChild(script);
      });

      // Primero intento la ruta que tengas en SUPABASE_SDK
      tryLoad(SUPABASE_SDK).then(ok => {
        if (ok && window.supabase) return resolve(true);
        // si falla, intento CDN
        tryLoad(CDN).then(ok2 => {
          resolve(ok2 && !!window.supabase);
        });
      });
    } catch (e) {
      console.warn('cargarSupabaseSDK error:', e);
      resolve(false);
    }
  });
}

/* =====================================================================
   ARRANQUE
   ===================================================================== */
async function iniciarNube() {
  if (!SUPABASE_CONFIG.activa || !SUPABASE_CONFIG.supabaseUrl) {
    NUBE.detalle = 'La nube está apagada en la configuración.';
    marcarModo();
    return;
  }

  /* Cargar SDK de Supabase */
  const sdkCargado = await cargarSupabaseSDK();
  if (!sdkCargado || !window.supabase) {
    NUBE.detalle = 'No se pudo cargar el SDK de Supabase.';
    NUBE.error = 'SDK no disponible';
    marcarModo();
    return;
  }

  try {
    /* Inicializar cliente de Supabase */
    NUBE.client = NUBE.client || window.supabase.createClient(
      SUPABASE_CONFIG.supabaseUrl,
      SUPABASE_CONFIG.supabaseKey
    );

    /* Probar conexión leyendo la tabla */
    const { data, error } = await NUBE.client
      .from(SUPABASE_CONFIG.tabla)
      .select('data, actualizado')
      .eq('id', 1)
      .maybeSingle();

    if (error) throw error;

    if (data && data.data) {
      aplicarDesdeNube(data.data);   // fusiona y repinta
    } else {
      /* Primera vez: subir nuestros datos */
      NUBE.leido = true;
      subirANube(true);
    }

    NUBE.ultimaLectura = new Date();
    NUBE.activa = true;
    NUBE.modo = 'supabase';
    NUBE.error = null;
    NUBE.detalle = 'Conectada con Supabase.';
    SERVIDOR.activo = false;

    /* Quitar canal previo si existe */
    if (NUBE.canal) {
      try { await NUBE.client.removeChannel(NUBE.canal); } catch(e){/*ignore*/ }
      NUBE.canal = null;
    }

    /* Configurar suscripción a cambios en tiempo real */
    try {
      // usar nombre de canal con prefijo público (v2)
      NUBE.canal = NUBE.client
        .channel('public:truequea_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: SUPABASE_CONFIG.tabla }, (payload) => {
          try {
            if (payload && payload.new && payload.new.data) {
              console.log('Realtime payload', payload);
              aplicarDesdeNube(payload.new.data);
            }
          } catch (e) { console.warn('error al aplicar payload', e); }
        })
        .subscribe((status) => {
          NUBE.conectado = status === 'SUBSCRIBED';
          marcarModo();
        });
    } catch (e) {
      // Si falla el realtime, seguimos funcionando con polling
      console.warn('Realtime no disponible, usando polling:', e);
      iniciarPolling();
    }

    iniciarPolling(); // respaldo
    marcarModo();
  } catch (e) {
    NUBE.activa = false;
    NUBE.error = e.message;
    NUBE.detalle = 'Error al conectar con Supabase: ' + e.message;
    marcarModo();
  }
}

/* Polling como respaldo si realtime falla */
function iniciarPolling() {
  clearInterval(NUBE.reloj);
  NUBE.reloj = setInterval(bajarDatos, Math.max(8, SUPABASE_CONFIG.segundosRevision) * 1000);
}

async function bajarDatos() {
  if (!NUBE.activa || NUBE.subiendo) return;
  try {
    const { data, error } = await NUBE.client
      .from(SUPABASE_CONFIG.tabla)
      .select('data')
      .eq('id', 1)
      .maybeSingle();

    if (error) throw error;
    NUBE.ultimaLectura = new Date();
    if (data && data.data) {
      aplicarDesdeNube(data.data);
    }
  } catch (e) {
    NUBE.error = e.message;
    marcarModo();
  }
}

/* =====================================================================
   BAJAR Y SUBIR
   ===================================================================== */

/* util: merge arrays by id, prefer newer timestamps when available */
function mergeById(localArr = [], cloudArr = [], idField = 'id') {
  const map = new Map();
  (localArr || []).forEach(item => {
    if (item && item[idField] !== undefined) map.set(item[idField], item);
  });
  (cloudArr || []).forEach(item => {
    if (!item || item[idField] === undefined) return;
    const existing = map.get(item[idField]);
    if (!existing) {
      map.set(item[idField], item);
    } else {
      // compare timestamps if present
      const cloudTs = item.actualizado || item.modificado || item.updated_at || null;
      const localTs = existing.actualizado || existing.modificado || existing.updated_at || null;
      if (cloudTs && localTs) {
        if (new Date(cloudTs) > new Date(localTs)) map.set(item[idField], item);
        // else keep existing (local is newer)
      } else {
        // fallback: merge shallowly preferring cloud fields
        map.set(item[idField], { ...existing, ...item });
      }
    }
  });
  return Array.from(map.values());
}

/* aplicarDesdeNube mejorado: fusiona y repinta */
function aplicarDesdeNube(datosNube) {
  try {
    if (!datosNube) return;
    // saneamiento y estructura requerida
    datosNube = sanear(datosNube);

    // fusionar colecciones relevantes (usuarios, articulos, etc.)
    BD.usuarios = mergeById(BD.usuarios, datosNube.usuarios, 'id');
    BD.articulos = mergeById(BD.articulos, datosNube.articulos, 'id');
    BD.anuncios = mergeById(BD.anuncios, datosNube.anuncios, 'id');
    // añade más colecciones si tu app las maneja
    // ejemplo: BD.chats = mergeById(BD.chats, datosNube.chats, 'id');

    // fusionar config de forma simple (cloud wins para claves nuevas)
    BD.config = { ...BD.config, ...datosNube.config };

    // marcar que leimos nube
    NUBE.leido = true;
    NUBE.ultima = new Date();
    guardarSoloLocal(); // mantén copia local
    refrescarTodo();    // repinta UI con los nuevos datos fusionados
    marcarModo();
  } catch (e) {
    console.error('Error aplicando datos de la nube:', e);
    NUBE.error = e.message || String(e);
    marcarModo();
  }
}

function refrescarTodo() {
  try {
    aplicarPlan(); aplicarMarca();
    pintarCiudades(); pintarCategorias();
    pintarNav(); pintarLista(); pintarMapa(); pintarPremium();
    const u = yo();
    if (u && $('#v-cuenta').classList.contains('on')) pintarCuenta();
    if (u && u.rol === 'admin' && $('#v-admin').classList.contains('on')) pintarAdmin();
    if (App.chat && $('#mChat').classList.contains('on')) pintarChat();
  } catch (e) { console.warn('refresco', e); }
}

function programarNube() {
  NUBE.pendiente = true;
  if (!NUBE.activa || NUBE.aplicando || NUBE.subiendo) return;
  clearTimeout(NUBE.timer);
  NUBE.timer = setTimeout(() => subirANube(), 1200);
}

async function subirANube(primeraVez = false) {
  if (!NUBE.activa || NUBE.subiendo) { NUBE.pendiente = true; return; }

  /* PROHIBIDO subir sin haber leído antes: así nadie pisa a los demás */
  if (!NUBE.leido && !primeraVez) { NUBE.pendiente = true; return; }

  NUBE.subiendo = true;
  NUBE.pendiente = false;
  try {
    estampar();
    estamparConfig();
    const copia = JSON.parse(JSON.stringify({ ...BD, sesion: null, sesionVence: null, actualizado: Date.now() }));

    /* red de seguridad: si de golpe fuera a desaparecer medio sistema, paramos */
    const revision = subidaSegura(copia);
    if (!revision.ok) {
      NUBE.pendiente = true;
      NUBE.error = revision.motivo;
      guardarCopia('subida frenada');
      avisarConBoton('Frenamos una subida rara: ' + revision.motivo +
        ' Conserva esta pestaña y descarga un respaldo.', 'Ver copias', verCopias);
      return;
    }

    const texto = JSON.stringify(copia);
    if (texto.length > 7 * 1024 * 1024) {
      throw new Error('El JSON supera el límite de 7 MB del programa. Exporta un respaldo; falta migrar las imágenes a Storage. No borres publicaciones para ocultar este error.');
    }
    NUBE.huella = huellaBD(copia);

    /* Guardar en Supabase - upsert para insertar o actualizar */
    const { error } = await NUBE.client
      .from(SUPABASE_CONFIG.tabla)
      .upsert({ id: 1, data: copia, actualizado: new Date().toISOString() }, { onConflict: 'id' });

    if (error) throw error;

    NUBE.ultima = new Date();
    NUBE.ultimaEscritura = NUBE.ultima;
    NUBE.error = null;
    if (primeraVez) avisar('Base de datos creada en Supabase ✔', 'ok');
  } catch (e) {
    NUBE.error = e.message;
    NUBE.pendiente = true;
    console.error('Supabase: no se confirmó la escritura', e);
    avisar('No se guardó en Supabase: ' + e.message, 'err');
    if (/permission|denied|401|403/i.test(e.message)) {
      NUBE.detalle = 'Supabase rechazó la escritura: revisa los permisos.';
      NUBE.activa = false;
    }
  } finally {
    NUBE.subiendo = false;
    if (NUBE.pendiente && !NUBE.error) programarNube();
    marcarModo();
  }
}

/* guardar() ahora también manda todo a la nube */
const guardarAntesDeNube = guardar;
guardar = function () {
  try { estampar(); estamparConfig(); } catch (e) { /* nunca romper el guardado */ }
  guardarAntesDeNube();
  programarNube();
};

/* =====================================================================
   CARTELITO DEL PIE
   ===================================================================== */
marcarModo = function () {
  const pie = document.querySelector('.pie-base');
  if (!pie) return;
  let s = document.getElementById('modoDatos');
  if (!s) {
    s = document.createElement('span');
    s.id = 'modoDatos';
    s.style.cssText = 'display:block;margin-top:6px;font-size:12px';
    pie.appendChild(s);
  }

  const escritura = NUBE.ultimaEscritura ? NUBE.ultimaEscritura.toLocaleTimeString() : 'sin confirmar';
  if (NUBE.error) {
    s.textContent = '⚠️ Supabase: ' + NUBE.error + ' · Última escritura: ' + escritura;
  } else if (NUBE.activa) {
    s.textContent = 'Supabase · Lectura disponible · Escritura: ' + escritura +
      ' · Tiempo real: ' + (NUBE.conectado ? 'suscrito' : 'sin confirmar; consultas cada 15 s');
  } else {
    s.textContent = 'Sin conexión remota confirmada. Los cambios locales pueden no estar compartidos.';
  }
  if (typeof pintarEstadoNube === 'function') pintarEstadoNube();
};

function sincronizarAhora() {
  if (!NUBE.activa) { reconectarNube(); return; }
  subirANube();
  avisar('Intentando guardar en Supabase; revisa la última escritura confirmada.');
}

/* Vuelve a intentar la conexión sin recargar la página */
async function reconectarNube() {
  avisar('Probando la conexión con Supabase...');
  NUBE.error = null; NUBE.huella = null;
  clearInterval(NUBE.reloj);
  await iniciarNube();
  if (typeof pintarEstadoNube === 'function') pintarEstadoNube();
}

/* Reintento automático en caso de error */
function reintentarSolo() {
  setTimeout(() => {
    if (!NUBE.activa) iniciarNube();
  }, 30000);
}

/* Diagnóstico para Supabase (evita error de referencia en eventos) */
async function verDiagnostico() {
  if (NUBE.activa) await bajarDatos();
  const c = document.getElementById('diagCuerpo');
  if (!c) return;
  c.innerHTML = `<h2>🔌 Diagnóstico de la nube (Supabase)</h2>
    <p class="sub">URL: <b>${SUPABASE_CONFIG.supabaseUrl || 'No configurada'}</b></p>
    <p>Última escritura confirmada: <b>${esc(NUBE.ultimaEscritura ? NUBE.ultimaEscritura.toLocaleString() : 'Ninguna en esta sesión')}</b></p>
    <div class="diag">
      <div class="diag-fila ${NUBE.activa ? 'si' : 'no'}">
        <span class="diag-emo">${NUBE.activa ? '✅' : '❌'}</span>
        <div><b>Estado de la conexión</b><span>${esc(NUBE.detalle || 'Desconocido')}</span></div>
      </div>
      <div class="diag-fila ${NUBE.conectado ? 'si' : (NUBE.conectado === false ? 'no' : '')}">
        <span class="diag-emo">${NUBE.conectado ? '✅' : (NUBE.conectado === false ? '❌' : '⏳')}</span>
        <div><b>Actualizaciones en vivo</b><span>${NUBE.conectado ? 'Suscrito a cambios' : 'No suscrito (posible error de realtime)'}</span></div>
      </div>
    </div>
    ${NUBE.error ? `<div class="diag-arreglo"><b>Error detectado:</b><p>${esc(NUBE.error)}</p></div>` : ''}
  `;
  if (typeof abrir === 'function') abrir('mDiag');
}

/* Parche de debug: forzar lectura y aplicacion desde la nube (útil para probar) */
async function forzarAplicacionNube() {
  try {
    if (!NUBE.client) { console.warn('NUBE.client no disponible'); return; }
    const resp = await NUBE.client.from(SUPABASE_CONFIG.tabla).select('data').eq('id',1).maybeSingle();
    console.log('forzado read', resp);
    if (resp && resp.data && resp.data.data) {
      aplicarDesdeNube(resp.data.data);
      console.log('aplicado forzado');
    } else {
      console.warn('no hay data en id=1');
    }
  } catch(e) { console.error(e); }
}

document.addEventListener('DOMContentLoaded', () => setTimeout(iniciarNube, 400));