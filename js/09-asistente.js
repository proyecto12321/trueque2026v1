/* ===================================================================
   TRUEQUEA PE · Asistente, copias de seguridad y cuentas
   Archivo: js/09-asistente.js
   =================================================================== */

/* 🔥 CONTROL DE GUARDADO (ANTI LAG) */
let BLOQUEO_GUARDAR = false;

function guardarSeguro() {
  if (BLOQUEO_GUARDAR) return;

  BLOQUEO_GUARDAR = true;

  guardar();

  setTimeout(() => {
    BLOQUEO_GUARDAR = false;
  }, 3000);
}
async function crearCuentaAdmin() {
  const yoSoy = yo();
  if (!yoSoy || yoSoy.rol !== 'admin') return;
  const err = m => { const c = $('#errNuevo'); c.textContent = m; c.hidden = false; };
  $('#errNuevo').hidden = true;

  const nombre = $('#nuNombre').value.trim();
  const tel = $('#nuTel').value.replace(/\D/g, '');
  const clave = $('#nuClave').value.trim();
  let email = $('#nuEmail').value.trim().toLowerCase();

  if (nombre.length < 2) return err('Escribe el nombre.');
  if (!email && !tel)    return err('Pon el correo o el celular, al menos uno.');
  if (clave.length < 4)  return err('La clave debe tener 4 caracteres o más.');

  if (!email) {
    const base = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '') || 'usuario';
    email = `${base}${tel.slice(-4)}@truequea.pe`;
  }
  if (BD.usuarios.some(u => u.email.toLowerCase() === email))
    return err('Ese correo ya tiene cuenta.');
  if (tel && BD.usuarios.some(u => (u.telefono || '').replace(/\D/g, '') === tel))
    return err('Ese celular ya tiene cuenta.');

  const ciudad = $('#nuCiudad').value;
  const c = CIUDADES[ciudad] || CIUDADES['Chincha Alta'];
  if ($('#nuRol').value === 'admin' && !puedeOtroAdmin())
    return err(`Ya hay ${SEG.maxAdmins} administradores. Quítale el cargo a uno antes.`);

  const u = {
    id: nuevoId(), nombre, email,
    rol: $('#nuRol').value, ciudad, avatar: null, telefono: tel || null,
    bio: '', ref: '', lat: c[0], lon: c[1],
    premium: $('#nuPlan').value === 'premium', premiumHasta: null,
    puntos: 0, nivel: 1, estado: 'activo', creado: new Date().toISOString(),
    verificado: true, codigo: nuevoCodigo(), avisos: true,
    impulsosGratis: 0, proMes: null, creadaPor: yoSoy.id,
  };
  if (u.premium) {
    const h = new Date(); h.setMonth(h.getMonth() + 1);
    u.premiumHasta = h.toISOString();
  }
  await ponerClave(u, clave);      // se guarda con huella, nunca escrita
  BD.usuarios.push(u);
  anotarEvento('alta', `${yoSoy.nombre} creó la cuenta de ${u.nombre}`, yoSoy.id);
  notificar(u.id, '¡Bienvenido a ' + BD.config.nombre + '!',
            'El administrador te creó la cuenta. Tu código de respaldo es ' + u.codigo + '.');
guardarSeguro();
  $('#formNuevoUsuario').reset();
  $('#resultadoNuevo').innerHTML = `
    <div class="ficha-nueva">
      <b>✅ Cuenta creada</b>
      <p>Pásale estos datos a <b>${esc(u.nombre)}</b>:</p>
      <div class="datos-nuevos">
        <span>👤 ${esc(u.nombre)}${u.rol === 'admin' ? ' · ADMINISTRADOR' : ''}${u.premium ? ' · 👑 PREMIUM' : ''}</span>
        <span>✉️ Entra con: <b>${esc(u.email)}</b>${u.telefono ? ' o con el celular <b>' + esc(u.telefono) + '</b>' : ''}</span>
        <span>🔑 Clave: <b>${esc(clave)}</b></span>
        <span>🛟 Código de respaldo: <b>${esc(u.codigo)}</b></span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <button class="btn suave sm" type="button" id="btnCopiarCuenta">📋 Copiar los datos</button>
        ${u.telefono ? `<a class="wa" target="_blank" rel="noopener"
          href="${esc(linkWA(u.telefono, `Hola ${u.nombre}, te creé tu cuenta en Truequea PE.\nEntra con: ${u.email} (o con tu celular)\nClave: ${clave}\nCódigo de respaldo: ${u.codigo}`))}">
          💬 Enviarle por WhatsApp</a>` : ''}
      </div>
    </div>`;
  const b = $('#btnCopiarCuenta');
  if (b) b.addEventListener('click', () => {
    navigator.clipboard?.writeText(
      `Truequea PE\nUsuario: ${u.nombre}\nEntra con: ${u.email}\nClave: ${clave}\nCódigo: ${u.codigo}`)
      .then(() => avisar('Datos copiados ✔', 'ok')).catch(() => avisar('Cópialos a mano'));
  });
  avisar('Cuenta creada ✔', 'ok');
  pintarAdmin();
}

/* ---------------------------------------------------------------------
   2) COPIAS DE SEGURIDAD A LA VISTA
   --------------------------------------------------------------------- */
function verCopias() {
  const copias = listaCopias();
  $('#copiasCuerpo').innerHTML = `
    <h2>🛟 Copias de seguridad</h2>
    <p class="sub">El sistema guarda solo las últimas 5 versiones buenas en este equipo.
      Si alguna vez desaparece algo, aquí lo recuperas.</p>
    <div class="tarjeta" style="margin-bottom:14px">
      <b>Ahora mismo:</b> ${BD.usuarios.length} usuarios · ${BD.articulos.length} publicaciones ·
      ${BD.intercambios.length} trueques
      <div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:10px">
        <button class="btn pri sm" type="button" id="btnCopiaYa">💾 Guardar copia ahora</button>
        <button class="btn suave sm" type="button" id="btnBajarTodo">⬇️ Descargar archivo</button>
        <label class="btn suave sm" for="subirRespaldo">⬆️ Restaurar desde archivo</label>
        <input type="file" id="subirRespaldo" accept="application/json" hidden>
      </div>
    </div>
    ${copias.length ? copias.map((c, i) => `
      <div class="fila">
        <div class="fila-info">
          <b>${new Date(c.cuando).toLocaleString()}</b>
          <span>${esc(c.motivo)}</span>
          <span>${c.usuarios} usuarios · ${c.articulos} publicaciones</span>
        </div>
        <div class="fila-acc">
          <button class="btn-t" data-restaurar="${i}">↩ Restaurar esta</button>
        </div></div>`).join('')
      : '<p class="nota">Todavía no hay copias guardadas.</p>'}`;
  abrir('mCopias');

  $('#btnCopiaYa').addEventListener('click', () => {
    guardarCopia('guardada a mano'); avisar('Copia guardada ✔', 'ok'); verCopias();
  });
  $('#btnBajarTodo').addEventListener('click', () => {
    descargar(`truequea-respaldo-${new Date().toISOString().slice(0,10)}.json`,
      JSON.stringify({ ...BD, sesion: null }, null, 2), 'application/json');
  });
  $('#subirRespaldo').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const datos = JSON.parse(fr.result);
        if (!Array.isArray(datos.usuarios)) throw new Error('El archivo no es un respaldo válido');
        confirmar('Restaurar desde archivo',
          `El archivo trae ${datos.usuarios.length} usuarios y ${(datos.articulos || []).length} publicaciones. ` +
          `Se juntará con lo que ya tienes: no se borra nada.`,
          () => {
            guardarCopia('antes de restaurar archivo');
            fusionar(sanear(datos));
            guardar(); refrescarTodo(); cerrar('mCopias');
            avisar('Respaldo unido ✔', 'ok');
          }, 'Sí, unir');
      } catch (err) { avisar('No se pudo leer el archivo: ' + err.message, 'err'); }
    };
    fr.readAsText(f);
  });
}

/* ---------------------------------------------------------------------
   3) ASISTENTE — explica el sistema en criollo
   --------------------------------------------------------------------- */
const BOT_TEMAS = [
  { clave: 'inicio', chip: '¿Qué es Truequea PE?',
    palabras: ['que es', 'para que', 'sirve', 'de que trata', 'hola', 'ayuda', 'como funciona'],
    dice: () => `<b>Truequea PE es para cambiar cosas, no para venderlas.</b>
      Publicas lo que ya no usas, dices qué buscas a cambio, y cuando alguien tiene lo que
      quieres se ponen de acuerdo por el chat y se encuentran en una zona segura.
      Por eso aquí <b>no verás precios en ninguna publicación</b>.` },

  { clave: 'publicar', chip: '¿Cómo publico algo?',
    palabras: ['publicar', 'subir', 'poner', 'vender', 'anunciar mi cosa'],
    dice: () => `<b>Publicar toma un minuto:</b><br>
      1. Toca <b>“+ Publicar”</b> arriba.<br>
      2. Sube hasta 6 fotos (el sistema las achica solo).<br>
      3. Ponle título, categoría, estado y tu ciudad.<br>
      4. Escribe <b>qué buscas a cambio</b> — eso es lo más importante.<br>
      Listo. Sale en el listado y como un pin en el mapa.` },

  { clave: 'cuenta', chip: 'Crear mi cuenta',
    palabras: ['cuenta', 'registrar', 'registro', 'entrar', 'contraseña', 'olvide', 'pin'],
    dice: () => `<b>La forma más rápida:</b> toca “Entrar” y luego
      <b>“⚡ Crear mi cuenta en 10 segundos”</b>: solo tu nombre, tu celular y 4 números (tu PIN).<br><br>
      Después entras con tu celular o tu correo y ese PIN. Te damos un
      <b>código de respaldo</b> (tipo TRUEQUEA-1234): guárdalo, porque con él recuperas la cuenta
      si olvidas la clave, desde “Olvidé mi contraseña”.` },

  { clave: 'seguridad', chip: '¿Es seguro?',
    palabras: ['seguro', 'estafa', 'confianza', 'robar', 'peligro', 'zona segura'],
    dice: () => `Cada persona tiene un <b>nivel de confianza de 0 a 100</b> que mira sus estrellas,
      sus trueques cerrados, si tiene teléfono y desde cuándo está.
      El sistema también avisa si alguien usa una <b>foto que ya está en otra cuenta</b>.<br><br>
      Consejo: encuéntrense siempre en una <b>zona segura</b> (las verdes del mapa: comisarías,
      plazas) y revisen la cosa antes de entregar. Con <b>🛡️ Trueque Seguro</b> el administrador
      acompaña el intercambio y da el visto bueno.` },

  { clave: 'gratis', chip: '¿Qué tengo gratis?',
    palabras: ['gratis', 'free', 'cuesta', 'pagar', 'sin pagar'],
    dice: () => `<b>Con la cuenta gratis puedes:</b><br>
      • Publicar hasta ${LIMITE_GRATIS} cosas a la vez<br>
      • Buscar, filtrar y ver el mapa<br>
      • Proponer trueques y chatear<br>
      • Ver cuántas personas están interesadas en lo tuyo<br>
      • Calificar y que te califiquen<br>
      • Mirar la vitrina 💎 VIP (sin participar)<br><br>
      Todo lo importante es gratis. Premium es para quien quiere ir más rápido.` },

  { clave: 'premium', chip: '👑 ¿Qué da el Premium?',
    palabras: ['premium', 'pro', 'vip', 'beneficio', 'vale la pena', 'oro'],
    dice: () => `<b>Premium cuesta S/ ${precioPro()} al mes</b> y te da:<br>
      • ❤️ <b>“Quiero esto”</b>: dices qué buscas y el sistema te avisa solo cuando alguien lo publica<br>
      • 👀 <b>Ver quién está interesado</b> en tus cosas, con nombre y qué te ofrecen<br>
      • 🔒 <b>Apartar</b> una publicación 1 hora: nadie más puede proponer mientras negocias<br>
      • 💎 Entrar a la <b>vitrina VIP</b> (laptops, celulares, consolas)<br>
      • 📈 <b>Análisis completo</b> del trueque: si te conviene o no<br>
      • 🗺️ Mapa avanzado con la <b>ubicación real</b> y distancia en km<br>
      • 💬 Chat con fotos, frases rápidas y buscador<br>
      • 🚀 <b>3 impulsos gratis</b> cada mes<br>
      • 👑 Corona, perfil destacado y la web entera en negro y oro` },

  { clave: 'pagar', chip: '¿Cómo pago el Premium?',
    palabras: ['yape', 'pago', 'como pago', 'activar premium', 'comprobante'],
    dice: () => `<b>Es con Yape y se activa solo:</b><br>
      1. Entra a <b>👑 Premium</b> y toca “Activar con Yape”.<br>
      2. Yapea <b>S/ ${precioPro()}</b> a <b>${esc(BD.config.yapeNombre || 'Angel Levano')}</b>.<br>
      3. Sube la captura del pago.<br>
      4. El sistema <b>lee la imagen</b>, revisa el monto, el nombre y el número de operación,
         y si todo cuadra te activa Premium al instante.<br><br>
      Si algo no cuadra, el administrador lo revisa a mano.` },

  { clave: 'trueque', chip: 'Cerrar un trueque',
    palabras: ['trueque', 'intercambio', 'propuesta', 'aceptar', 'cerrar', 'entregar'],
    dice: () => `<b>Así se cierra un trueque:</b><br>
      1. Entras a la publicación y tocas <b>“🔁 Proponer trueque”</b>.<br>
      2. Eliges qué cosa tuya ofreces. Ahí sale un <b>semáforo</b> que te dice si el cambio
         se ve parejo (🟢 🟡 🔴).<br>
      3. La otra persona acepta y se abre el chat.<br>
      4. Acuerdan <b>lugar y hora</b> en una zona segura.<br>
      5. Cuando los dos confirman que entregaron, el trueque queda cerrado y se califican.` },

  { clave: 'mapa', chip: '¿Cómo uso el mapa?',
    palabras: ['mapa', 'ubicacion', 'cerca', 'donde', 'km', 'distancia'],
    dice: () => `El mapa muestra cada publicación como un pin en su calle real.
      Tocas un pin y ves la foto, qué busca y a cuántos km está de ti.<br><br>
      Para que te encuentren cerca, marca tu ubicación en
      <b>Mi cuenta → Perfil → “Usar mi ubicación actual”</b>.
      Los pines verdes 🛡️ son las <b>zonas seguras</b> para encontrarse.` },

  { clave: 'mis_cosas', chip: '👑 ¿Cómo van mis cosas?',
    palabras: ['mis cosas', 'mis publicaciones', 'como voy', 'mi nivel', 'interesados', 'mis stats'],
    dice: () => {
      const u = yo();
      if (!u) return 'Primero entra a tu cuenta y te cuento cómo vas.';
      if (!u.premium) return `Ese resumen es para cuentas Premium 👑.
        Con Premium te digo cuántas personas están interesadas, quiénes son y cómo va tu nivel.
        <button class="btn mora sm" type="button" data-accion="premium">Ver Premium</button>`;
      const mios = BD.articulos.filter(a => a.usuario === u.id);
      const inter = mios.reduce((s, a) => s + interesadosDe(a).length, 0);
      const vistas = mios.reduce((s, a) => s + (a.vistas || 0), 0);
      const n = nivelPro(u);
      const puesto = ranking(50).findIndex(x => x.u.id === u.id) + 1;
      return `<b>Así vas, ${esc(u.nombre.split(' ')[0])}:</b><br>
        • ${n.emo} Nivel <b>${esc(n.nombre)}</b>${n.siguiente ? ` (te faltan ${n.faltan} trueques para ${n.siguiente.nombre})` : ''}<br>
        • 📦 ${mios.length} publicación(es) · 👁 ${vistas} vistas<br>
        • 🔥 <b>${inter}</b> persona(s) interesada(s) en tus cosas<br>
        • 🏆 Puesto <b>#${puesto || '—'}</b> en el ranking<br>
        • 🚀 Te quedan <b>${impulsosDisponibles(u)}</b> impulsos gratis este mes<br>
        <button class="btn suave sm" type="button" data-ir="cuenta">📦 Ver mis publicaciones</button>`;
    } },

  { clave: 'musica', chip: '🎵 Poner música',
    palabras: ['musica', 'cancion', 'reproduc', 'sonar', 'tema', 'playlist', 'escuchar'],
    dice: () => `<b>Puedes pedirme música hablando o escribiendo.</b><br>
      Prueba con:<br>
      • “<b>reproduce</b> ${MUSICA.lista.length ? esc(MUSICA.lista[0].titulo) : 'el nombre de tu canción'}”<br>
      • “<b>siguiente</b>” · “<b>para la música</b>” · “<b>sube el volumen</b>”<br>
      • “<b>pon el ambiente</b>” (música del propio sistema, libre de derechos)<br><br>
      ${MUSICA.lista.length
        ? `Tienes <b>${MUSICA.lista.length}</b> canción(es) cargada(s).`
        : `Todavía no cargaste ninguna. Ábrelo y agrega tus mp3 una sola vez.`}<br>
      <button class="btn suave sm" type="button" data-accion="musica">🎵 Abrir el reproductor</button>
      <button class="btn suave sm" type="button" data-accion="voz">🎤 Pedir por voz</button><br>
      <span style="font-size:12px;opacity:.8">Solo puedo reproducir la música que tú cargues:
      las canciones de los artistas tienen dueño y no puedo bajarlas.</span>` },

  { clave: 'perdido', chip: 'Se me perdió algo',
    palabras: ['perdio', 'borro', 'desaparecio', 'no aparece', 'recuperar', 'copia'],
    dice: () => `Tranquilo. El sistema guarda <b>copias de seguridad automáticas</b> en tu equipo.<br><br>
      Si eres el administrador: <b>Admin → 🎨 Marca → 🛟 Copias de seguridad</b> y restauras la
      versión que quieras. Ahora, además, cuando varios equipos se sincronizan
      <b>se juntan los datos en vez de pisarse</b>, así que ya no debería perderse nada.` },
];

const BOT = { abierto: false, historial: [] };

function botDecir(quien, html) {
  const c = $('#botCuerpo');
  const d = document.createElement('div');
  d.className = 'bot-msg de-' + quien;   // 'de-bot' o 'de-yo'
  d.innerHTML = html;
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
}

/* atajos de música para el asistente */
function chipsMusica() {
  return [
    { clave:'m_play',  chip:'▶ Poner música' },
    { clave:'m_sig',   chip:'⏭ Siguiente' },
    { clave:'m_para',  chip:'⏸ Parar' },
    { clave:'m_amb',   chip:'🌙 Ambiente' },
    { clave:'musica',  chip:'🎵 Mis canciones' },
  ];
}

function botChips(lista) {
  $('#botChips').innerHTML = lista.map(t =>
    `<button type="button" data-bottema="${esc(t.clave)}">${esc(t.chip)}</button>`).join('');
}

function botResponder(texto) {
  /* primero: ¿es una orden para la música? */
  const orden = ordenMusical(texto);
  if (orden) { botDecir('bot', orden); botChips(chipsMusica()); return; }

  const t = String(texto || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  let mejor = null, puntos = 0;
  BOT_TEMAS.forEach(tema => {
    let p = 0;
    tema.palabras.forEach(w => { if (t.includes(w)) p += w.length; });
    if (tema.chip.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(t) && t.length > 4) p += 5;
    if (p > puntos) { puntos = p; mejor = tema; }
  });
  if (!mejor) {
    botDecir('bot', `No te entendí bien 😅 Pero de esto sí te puedo hablar:`);
    botChips(BOT_TEMAS);
    return;
  }
  botDecir('bot', mejor.dice());
  const otros = BOT_TEMAS.filter(x => x.clave !== mejor.clave).slice(0, 4);
  botChips(otros);
}

function abrirBot() {
  const bot = $('#bot');
  BOT.abierto = !BOT.abierto;
  bot.hidden = !BOT.abierto;
  $('#btnBot').classList.toggle('activo', BOT.abierto);
  if (BOT.abierto && !$('#botCuerpo').children.length) {
    const u = yo();
    const pro = !!(u && u.premium);
    $('#bot').classList.toggle('pro', pro);
    botDecir('bot', pro
      ? `👑 ¡Hola ${esc(u.nombre.split(' ')[0])}! Soy tu asistente <b>Premium</b>.
         Además de explicarte el sistema, te pongo música: dime
         “<b>reproduce</b> y el nombre” o toca el micrófono 🎤.
         También te digo quién está interesado en tus cosas y cómo va tu nivel.`
      : `¡Hola${u ? ' ' + esc(u.nombre.split(' ')[0]) : ''}! 👋 Soy el asistente de
         <b>${esc(BD.config.nombre)}</b>. Te explico cómo usar el sistema, qué es gratis y qué trae
         el Premium. Toca una pregunta, escríbeme o usa el micrófono 🎤.`);
    /* las 5 preguntas que más le sirven a alguien que recién entra */
    const u2 = yo();
    const claves = (u2 && u2.premium)
      ? ['musica', 'mis_cosas', 'inicio', 'publicar', 'seguridad']
      : ['inicio', 'publicar', 'cuenta', 'premium', 'musica'];
    botChips(claves.map(k => BOT_TEMAS.find(x => x.clave === k)).filter(Boolean));
  }
  if (BOT.abierto) setTimeout(() => $('#botTexto').focus(), 150);
}
