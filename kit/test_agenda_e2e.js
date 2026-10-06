// Prueba de PUNTA A PUNTA: carga el agenda.html REAL con los scripts reales (motor, carga, grilla, día) sobre una base
// de datos simulada, y recorre la pantalla como lo haría una persona (clics reales). Reloj fijo: miércoles 9/10/2030 10:32.
// REPO_DIR permite apuntarla a otra copia del código (p. ej. los archivos originales) para comparar.
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

function assert(cond, msg) { if (!cond) { throw new Error("FALLA: " + msg); } console.log("OK: " + msg); }
const REPO = process.env.REPO_DIR || path.join(__dirname, "../repo");
const leer = (p) => fs.readFileSync(path.join(REPO, p), "utf8");
const srcHtml = leer("turnero/agenda.html");
const SCRIPTS = ["js/turnero-motor.js", "js/turnero-formulario.js", "js/turnero-carga.js", "js/turnero-grilla.js", "js/turnero-dia.js"].map(leer);

const SEDES = [
  { id: "emilio-civit", nombre: "Emilio Civit", horaApertura: "08:00", horaCierre: "14:00", diasAtencion: ["lunes", "martes", "miercoles", "jueves", "viernes"],
    usaAtaduraDia: false, usaCuposPorcentaje: false, sillones: [{ numero: 1, tipo: "regular" }, { numero: 2, tipo: "regular" }, { numero: 3, tipo: "regular" }, { numero: 4, tipo: "backup" }] },
  { id: "entre-rios", nombre: "Entre Ríos", horaApertura: "09:00", horaCierre: "13:00", diasAtencion: ["lunes", "martes", "miercoles", "jueves", "viernes"],
    usaAtaduraDia: false, usaCuposPorcentaje: false, sillones: [{ numero: 1, tipo: "regular" }, { numero: 2, tipo: "regular" }] }
];
const MEDICOS = [{ id: "med1", nombre: "Dr. Gómez", diasPorSede: { "Entre Ríos": ["martes", "miercoles", "jueves"], "Emilio Civit": ["lunes", "viernes"] } },
                 { id: "med2", nombre: "Dra. Ruiz", diasPorSede: { "Entre Ríos": ["martes", "miercoles", "jueves"] } },
                 { id: "med3", nombre: "Dr. Soto", diasPorSede: { "Emilio Civit": ["lunes", "martes", "miercoles", "jueves", "viernes"] } }];
const pac = (id, ape) => ({ id, nombre: "Nom" + id, apellido: ape, obraSocial: "OSDE", numeroDocumento: "1" + id });
const T = (id, sede, fecha, sillon, ini, fin, extra) => ({ id, sedeId: sede, fecha, sillon, horarioInicio: ini, horarioFin: fin, estado: "activo",
  medicoId: "med1", medicoNombre: "Dr. Gómez", paciente: pac(id, "Ape" + id), sedeNombre: sede === "entre-rios" ? "Entre Ríos" : "Emilio Civit",
  protocolos: [{ protocoloId: "p1", nombre: "FEC", duracionMinutos: 60 }], duracionTotalMinutos: 60, ciclo: 1, sesion: 1, ...(extra || {}) });
const TURNOS = [
  T("er1", "entre-rios", "2030-10-08", 1, "09:00", "10:00"),
  T("er2", "entre-rios", "2030-10-09", 2, "10:00", "11:00", { medicoId: "med2", medicoNombre: "Dra. Ruiz", cantidadNotas: 2 }),
  T("er3", "entre-rios", "2030-10-09", null, "11:00", "12:00", { tipoSobreturno: "sinDisponibilidadFisica" }),
  T("er4", "entre-rios", "2030-10-10", null, "09:30", "10:30", { internado: true }),
  T("er5", "entre-rios", "2030-10-10", 1, "11:00", "12:00", { horarioManual: true, presente: true, prioridad: "rojo" }),
  T("er6", "entre-rios", "2030-10-10", null, "12:00", "12:30", { tipoSobreturno: "ataduraDia", internado: true, medicoId: "med2", medicoNombre: "Dra. Ruiz" }),
  { ...T("er7", "entre-rios", "2030-10-10", 2, null, null), horarioInicio: undefined, horarioFin: undefined }, // turno viejo (T1/T2) sin horario: no se dibuja
  T("ci1", "emilio-civit", "2030-10-08", 1, "08:00", "09:00"),
  T("ci2", "emilio-civit", "2030-10-09", 4, "10:00", "11:00"),
  T("ci3", "emilio-civit", "2030-10-09", null, "12:00", "13:00", { internado: true })
];
const PACIENTES_FIX = [{ id: "PX", activo: true, nombre: "Luz", apellido: "Paz", obraSocial: "OSDE", tipoDocumento: "DNI", numeroDocumento: "30111222" }];
const PROTOCOLOS_FIX = [{ id: "p1", nombre: "FEC", duracionMinutos: 60 }];
const NOTAS = { er4: [{ id: "nA", texto: "nota de enfermería", autorUid: "u-enf", autorNombre: "Enf", autorRol: "enfermeria" }] };
const COLOCABLES = { "entre-rios": ["er1", "er2", "er3", "er4", "er5", "er6"], "emilio-civit": ["ci1", "ci2", "ci3"] };

async function abrirAgenda(rol, datosExtra, override) {
  const errores = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errores.push(String(e.message || e)));
  vc.on("error", (...a) => errores.push(a.map(String).join(" ")));
  const stubs = `
    window.ROLES = { administrador: "Administrador", enfermeria: "Enfermería", medico: "Médico", administrativo: "Administrativo" };
    window.escaparHtml = function(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); };
    window.cerrarSesion = function() {};
    window.__ops = [];
    var STORE = window.__STORE;
    function cmp(a, op, b) { if (op === "==") return a === b; if (op === ">=") return a >= b; if (op === "<=") return a <= b; return true; }
    function consulta(nombre, filtros) {
      return {
        where: function(f, op, v) { return consulta(nombre, filtros.concat([[f, op, v]])); },
        orderBy: function() { return this; },
        get: async function() { if (window.__fallaFecha && nombre === "turnos" && filtros.some(function(f) { return f[0] === "fecha" && f[1] === "==" && f[2] === window.__fallaFecha; })) throw new Error("lectura simulada fallida (turnos de la fecha)"); if (window.__fallaTurnosMotor && nombre === "turnos" && !filtros.some(function(f) { return f[0] === "sedeId"; })) throw new Error("lectura simulada fallida (turnos del motor)"); var docs = (STORE[nombre] || []).filter(function(d) { return filtros.every(function(x) { return cmp(d[x[0]], x[1], x[2]); }); })
          .map(function(d) { return { id: d.id, data: function() { var c = Object.assign({}, d); delete c.id; return c; } }; }); return { docs: docs, empty: docs.length === 0, size: docs.length }; }
      };
    }
    function docRef(nombre, id) {
      var ref = { __path: nombre + "/" + id, id: id,
        get: async function() { var d = (STORE[nombre] || []).find(function(x) { return x.id === id; }); return { exists: !!d, id: id, data: function() { return Object.assign({}, d); } }; },
        update: async function(x) { window.__ops.push({ op: "update", path: ref.__path, data: x }); },
        set: async function(x) { window.__ops.push({ op: "set", path: ref.__path, data: x }); },
        collection: function(sub) {
          if (sub !== "notas") return consulta(nombre + "/" + id + "/" + sub, []);
          return { orderBy: function() { return { get: async function() { var l = (window.__NOTAS[id] || []); return { docs: l.map(function(n) { return { id: n.id, data: function() { var c = Object.assign({}, n); delete c.id; return c; } }; }) }; } }; },
                   doc: function(nid) { return docRef(nombre + "/" + id + "/notas", nid || ("notaNueva" + (window.__ops.length))); } };
        } };
      return ref;
    }
    var db0 = Object.assign(consulta, {});
    window.db = { collection: function(nombre) { var q = consulta(nombre, []); q.doc = function(id) { return docRef(nombre, id || "auto"); }; return q; },
      batch: function() { return { set: function(r, d) { window.__ops.push({ op: "set", path: r.__path, data: d }); }, update: function(r, d) { window.__ops.push({ op: "update", path: r.__path, data: d }); },
                                   delete: function(r) { window.__ops.push({ op: "delete", path: r.__path }); }, commit: async function() {} }; } };
    window.firebase = { firestore: { FieldValue: { serverTimestamp: function() { return "TS"; }, increment: function(n) { return { inc: n }; }, delete: function() { return "DEL"; } } } };
  `;
  // override.repoDir: abrir la agenda con los archivos de OTRA carpeta (p. ej. una mezcla con un archivo viejo)
  const rutaRepo = (override && override.repoDir) || null;
  const htmlFuente = rutaRepo ? fs.readFileSync(path.join(rutaRepo, "turnero/agenda.html"), "utf8") : srcHtml;
  const scriptsFuente = rutaRepo ? ["js/turnero-motor.js", "js/turnero-formulario.js", "js/turnero-carga.js", "js/turnero-grilla.js", "js/turnero-dia.js"].map((f) => fs.readFileSync(path.join(rutaRepo, f), "utf8")) : SCRIPTS;
  let html = htmlFuente.replace(/<script src="[^"]*"><\/script>/g, "");
  html = html.replace(/<script>\s*requireAuth[\s\S]*?<\/script>/, "");
  html = html.replace(/<script>\s*montarFormularioCarga[\s\S]*?<\/script>/, ""); // el montaje inline se rehace abajo, ya con los scripts cargados
  html = html.replace("</body>", `<script>${stubs}</script>` + scriptsFuente.map(s => `<script>${s}</script>`).join("") +
    `<script>window.__listo = false; (async () => { try { montarFormularioCarga("formulario-carga"); await iniciarAgenda({ uid: "u-yo", email: "yo@x.com" }, ${JSON.stringify({ rol, nombre: "Yo", medicoId: "med1", ...(datosExtra || {}) })}); } catch (e) { window.__errInit = String(e && e.stack || e); } window.__listo = true; })();</script></body>`);
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: (override && override.url) || "http://localhost/turnero/agenda.html",
    beforeParse(window) {
      window.__STORE = { turneroSedes: (override && override.sedes) || SEDES, turneroMedicos: MEDICOS, turneroCupos: [], turneroBloqueos: [], pacientes: PACIENTES_FIX, turneroProtocolos: PROTOCOLOS_FIX, turnos: (override && override.turnos) || TURNOS };
      window.__NOTAS = NOTAS;
      const DateReal = window.Date; const ahora = new DateReal(2030, 9, 9, 10, 32, 0).getTime();
      window.Date = class extends DateReal { constructor(...a) { if (a.length === 0) super(ahora); else super(...a); } static now() { return ahora; } };
      window.scrollTo = () => {}; window.alert = () => {};
    } });
  const w = dom.window;
  for (let i = 0; i < 400 && !w.__listo; i++) { await new Promise(r => setTimeout(r, 0)); }
  await new Promise(r => setTimeout(r, 30));
  return { w, d: w.document, errores, errInit: w.__errInit, ops: w.__ops };
}
const idsDibujados = (d) => Array.from(d.querySelectorAll("#grilla-contenedor [data-turno-id]")).map(e => e.getAttribute("data-turno-id")).sort();
const esperar = async (w, cond, n = 200) => { for (let i = 0; i < n && !cond(); i++) { await new Promise(r => setTimeout(r, 0)); } };

async function cargarPorFormulario(rol, { medicoValor, lugar, horario, hora, usarHoy = true, datosExtra, sedeManual, fechaExacta, override, antesDeGuardar }) {
  const a = await abrirAgenda(rol, datosExtra || {}, override);
  a.w.open = () => ({ document: { write() {}, close() {}, }, close() {}, focus() {}, print() {} });
  const $ = (id) => a.d.getElementById(id);
  a.d.querySelector('button[onclick="abrirModalNuevoTurnoGrilla()"]').click();
  await esperar(a.w, () => !$("campo-buscar-paciente").disabled && $("campo-medico").options.length > 1, 600);
  const ev = (el, tipo) => el.dispatchEvent(new a.w.Event(tipo, { bubbles: true }));
  // paciente
  $("campo-buscar-paciente").value = "Paz"; ev($("campo-buscar-paciente"), "input");
  a.d.querySelector("#resultados-busqueda-paciente .resultado-busqueda button").click();
  // médico (el rol médico ya viene fijado a sí mismo)
  if (medicoValor) { $("campo-medico").value = medicoValor; ev($("campo-medico"), "change"); }
  // Un médico que atiende en dos sedes no tiene sede automática: se elige a mano, como siempre.
  if (sedeManual) { $("campo-sede-manual").value = sedeManual; ev($("campo-sede-manual"), "change"); }
  // protocolo
  const inp = a.d.querySelector("#lista-protocolos .inp-buscar-protocolo"); inp.value = "FEC"; ev(inp, "input");
  a.d.querySelector("#lista-protocolos .resultado-busqueda button").click();
  $("campo-ciclo").value = "2"; ev($("campo-ciclo"), "input"); $("campo-sesion").value = "3"; ev($("campo-sesion"), "input");
  // fecha: "Hoy"
  if (fechaExacta) { a.d.getElementById("boton-modo-calendario").click(); $("campo-fecha").value = fechaExacta; ev($("campo-fecha"), "input"); }
  else if (usarHoy) a.d.querySelector('#bloque-dias-turno button[onclick="usarTurnoHoy()"]').click();
  // lugar y horario con los controles nuevos
  if (lugar) a.d.querySelector(`input[name="lugar-carga"][value="${lugar}"]`).click();
  if (horario) a.d.querySelector(`input[name="horario-carga"][value="${horario}"]`).click();
  if (hora) { $("campo-horario-manual").value = hora; ev($("campo-horario-manual"), "input"); }
  await esperar(a.w, () => false, 5);
  a.antes = { resumen: $("resumen-carga-texto").textContent, boton: $("boton-guardar-turno").textContent };
  if (antesDeGuardar) await antesDeGuardar(a);
  $("boton-guardar-turno").click();
  await esperar(a.w, () => a.ops.some((o) => o.op === "set" && /^turnos\//.test(o.path)), 800);
  a.doc = (a.ops.find((o) => o.op === "set" && /^turnos\//.test(o.path)) || {}).data;
  a.msg = $("mensaje-general").textContent;
  return a;
}

async function principal() {
  console.log("Código bajo prueba:", REPO);
  // ===== 1. La semanal de Entre Ríos (sede por defecto) y de Emilio Civit, para cada rol =====
  for (const rol of ["administrador", "enfermeria", "administrativo"]) {
    const a = await abrirAgenda(rol);
    assert(!a.errInit, `[${rol}] la agenda arranca sin excepción` + (a.errInit ? " → " + a.errInit.split("\n")[0] : ""));
    const selec = a.d.querySelector("#selector-sede-grilla .activo");
    assert(selec && /Entre Ríos/.test(selec.textContent), `[${rol}] abre en la sede Entre Ríos (como siempre)`);
    assert(JSON.stringify(idsDibujados(a.d)) === JSON.stringify(COLOCABLES["entre-rios"].slice().sort()),
      `[${rol}] la semanal de ENTRE RÍOS dibuja TODOS sus turnos (${COLOCABLES["entre-rios"].length}) → dibujados: ${idsDibujados(a.d).join(",") || "ninguno"}`);
    assert(a.errores.length === 0, `[${rol}] sin errores en consola` + (a.errores.length ? " → " + a.errores[0].slice(0, 160) : ""));
    const botonCivit = Array.from(a.d.querySelectorAll("#selector-sede-grilla button")).find(b => /Civit/.test(b.textContent));
    botonCivit.click(); await esperar(a.w, () => idsDibujados(a.d).some(x => x.startsWith("ci")));
    assert(JSON.stringify(idsDibujados(a.d)) === JSON.stringify(COLOCABLES["emilio-civit"].slice().sort()), `[${rol}] al cambiar a EMILIO CIVIT dibuja sus ${COLOCABLES["emilio-civit"].length} turnos`);
  }
  if (process.env.SOLO_SEMANAL) { console.log("SEMANAL OK"); return; }
  // ===== 2. El médico: ve la semanal y comenta en un internado SUYO (cargado por enfermería/administración) =====
  {
    const a = await abrirAgenda("medico");
    assert(!a.errInit, "[médico] la agenda arranca sin excepción" + (a.errInit ? " → " + a.errInit.split("\n")[0] : ""));
    const ids = idsDibujados(a.d);
    console.log("   (el médico ve en Entre Ríos: " + (ids.join(",") || "ninguno") + ")");
    assert(ids.includes("er4"), "[médico] ve en la semanal su internado (er4, cargado a su nombre)");
    const tarjeta = a.d.querySelector('[data-turno-id="er4"]');
    const boton = tarjeta.querySelector(".badge-notas-grilla");
    assert(!!boton, "[médico] la tarjeta del internado tiene el botón de comentarios");
    boton.click(); await esperar(a.w, () => a.d.querySelector("#lista-notas-turno-grilla").textContent.includes("nota de enfermería"));
    assert(a.d.getElementById("overlay-notas-turno-grilla").style.display === "flex", "[médico] se abre la ventana de comentarios del internado");
    assert(a.d.querySelector("#lista-notas-turno-grilla").textContent.includes("nota de enfermería"), "[médico] ve el comentario que dejó enfermería");
    const agregar = a.d.getElementById("boton-abrir-nueva-nota-grilla");
    assert(agregar.style.display !== "none", "[médico] el botón para AGREGAR un comentario está visible (internado propio)");
    assert(!/Editar|Borrar/.test(a.d.querySelector("#lista-notas-turno-grilla").textContent), "[médico] no puede editar ni borrar el comentario ajeno");
    agregar.click();
    a.d.getElementById("campo-nueva-nota-grilla").value = "control del médico";
    const guardar = Array.from(a.d.querySelectorAll("#contenedor-nueva-nota-grilla button")).find(b => /Guardar/i.test(b.textContent));
    assert(!!guardar, "[médico] aparece el botón Guardar del comentario");
    guardar.click(); await esperar(a.w, () => a.ops.some(o => o.op === "set"));
    const nota = a.ops.find(o => o.op === "set"), cont = a.ops.find(o => o.op === "update" && o.path === "turnos/er4");
    assert(nota && nota.path.startsWith("turnos/er4/notas/") && nota.data.texto === "control del médico" && nota.data.autorRol === "medico", "[médico] el comentario se guarda en el turno internado, con su autor y rol");
    assert(cont && cont.data.cantidadNotas && cont.data.cantidadNotas.inc === 1, "[médico] suma 1 al contador de comentarios");
    assert(a.errores.length === 0, "[médico] sin errores en consola" + (a.errores.length ? " → " + a.errores[0].slice(0, 160) : ""));
  }
  // ===== 3. Lo que GUARDAN los flujos nuevos (P1 atadura con día lleno, P2 hoy) en Entre Ríos tiene que dibujarse en la semanal =====
  async function flujo(rol, sedes, turnos, datos, accion, clic) {
    const a = await abrirAgenda("administrador", {}, { sedes, turnos });
    a.w.eval(`
      rolActualCarga = "administrador"; datosUsuarioActualCarga = { rol: "administrador", nombre: "Yo" }; usuarioActualCarga = { uid: "u-yo" };
      sedesCacheCarga = sedesCacheGrilla; medicosCacheCarga = medicosCacheGrilla; cuposCacheCarga = []; bloqueosCacheCarga = [];
      turnosExistentes = turnosCacheGrilla.slice();
      pacienteSeleccionadoCarga = { id: "PX", nombre: "NomPX", apellido: "Nuevo", obraSocial: "OSDE", tipoDocumento: "DNI", numeroDocumento: "1" };
      mostrarComprobanteTurno = function() {}; resetearFormularioCarga = function() {}; cargarTurnosExistentes = async function() {};
    `);
    await a.w.eval(accion(datos));
    if (clic) {
      const modal = a.d.getElementById(clic.modal);
      const btn = modal && Array.from(modal.querySelectorAll("button")).find(b => clic.texto.test(b.textContent));
      if (btn) { btn.click(); }
    }
    await esperar(a.w, () => a.ops.some(o => o.op === "set" && /^turnos\//.test(o.path)), 300);
    const set = a.ops.find(o => o.op === "set" && /^turnos\//.test(o.path));
    return { a, doc: set && set.data };
  }
  async function dibujaElNuevo(a, doc) {
    a.w.eval(`turnosCacheGrilla = turnosCacheGrilla.concat([${JSON.stringify({ ...doc, id: "NUEVO" })}]); renderizarGrilla();`);
    return idsDibujados(a.d).includes("NUEVO");
  }
  const datosBase = { medicoId: "med1", medicoNombre: "Dr. Gómez", esMedicoOtro: false, sedeId: "entre-rios", sedeNombre: "Entre Ríos", sedeAutomatica: false,
    protocolos: [{ protocoloId: "p", nombre: "FEC", duracionMinutos: 60 }], premedicacion: false, duracionTotalMinutos: 60, ciclo: 1, sesion: 1,
    pacienteId: "PX", pacienteObraSocial: "OSDE", paciente: pac("PX", "Nuevo") };
  const buscar = (d) => `buscarYMostrarHuecos(${JSON.stringify(d)}, { id: "PX", obraSocial: "OSDE", nombre: "NomPX", apellido: "Nuevo", tipoDocumento: "DNI", numeroDocumento: "1" });`;
  {
    // P1: Entre Ríos con atadura de día; el médico atiende martes-jueves; se pide un lunes (10/14) y está lleno.
    const sedesAt = SEDES.map(x => x.id === "entre-rios" ? { ...x, usaAtaduraDia: true } : x);
    const lleno = [T("L1", "entre-rios", "2030-10-14", 1, "09:00", "13:00"), T("L2", "entre-rios", "2030-10-14", 2, "09:00", "13:00")];
    const f = await flujo("administrador", sedesAt, [...TURNOS, ...lleno], { ...datosBase, fecha: "2030-10-14" }, buscar, { modal: "modal-bloqueo-atadura", texto: /Cargar igual como sobreturno/ });
    assert(!!f.doc, "[P1 en Entre Ríos] el flujo 'atadura + día lleno → Cargar igual' guarda un turno");
    assert(typeof f.doc.horarioInicio === "string" && typeof f.doc.horarioFin === "string" && f.doc.sedeId === "entre-rios" && f.doc.fecha === "2030-10-14" && f.doc.estado === "activo" && f.doc.sillon === null,
      `[P1 en Entre Ríos] el documento guardado tiene horario de texto, sede, fecha, estado y sillón null (${f.doc && f.doc.horarioInicio}-${f.doc && f.doc.horarioFin})`);
    f.a.w.eval(`semanaOffsetGrilla = 1;`); // el turno es del lunes 14/10: semana siguiente
    assert(await dibujaElNuevo(f.a, f.doc), "[P1 en Entre Ríos] el sobreturno por atadura recién cargado se dibuja en la semanal de Entre Ríos");
  }
  {
    // P2: hoy (mié 10/9, 10:32) en Entre Ríos: el turno queda desde 10:35 y se dibuja en la semana actual.
    const f = await flujo("administrador", SEDES, TURNOS, { ...datosBase, fecha: "2030-10-09", medicoId: "med2", medicoNombre: "Dra. Ruiz" }, buscar);
    assert(!!f.doc && typeof f.doc.horarioInicio === "string" && f.doc.horarioInicio >= "10:35" && f.doc.sedeId === "entre-rios", `[P2 en Entre Ríos] hoy a las 10:32 se guarda en Entre Ríos desde las 10:35 (${f.doc && f.doc.horarioInicio})`);
    assert(await dibujaElNuevo(f.a, f.doc), "[P2 en Entre Ríos] el turno recién cargado se dibuja en la semanal de Entre Ríos");
  }
  // ===== 4. Reasignar recorrido con clics reales (administrador): detalle → Reasignar → buscar → motivo → confirmar =====
  {
    const a = await abrirAgenda("administrador");
    a.w.open = () => ({ document: { write() {}, close() {} }, close() {}, focus() {}, print() {} });
    a.w.abrirDetalleTurnoGrilla("er2");
    const btnReas = Array.from(a.d.querySelectorAll("#contenido-detalle-turno-grilla button")).find(b => /Reasignar/.test(b.textContent));
    assert(!!btnReas, "[Reasignar] el detalle del turno (admin) tiene el botón Reasignar");
    btnReas.click(); await esperar(a.w, () => a.d.getElementById("overlay-reasignar-grilla").style.display === "flex", 400);
    assert(a.d.getElementById("overlay-reasignar-grilla").style.display === "flex", "[Reasignar] se abre el formulario de Reasignar");
    a.d.getElementById("campo-fecha-reasignar-grilla").value = "2030-10-10";
    a.d.getElementById("boton-buscar-reasignar-grilla").click();
    await esperar(a.w, () => a.d.getElementById("overlay-motivo-arrastre-grilla").style.display === "flex", 600);
    assert(a.d.getElementById("overlay-motivo-arrastre-grilla").style.display === "flex", "[Reasignar] 'Buscar disponibilidad' encuentra lugar y pide el motivo" +
      (a.errores.length ? " (errores: " + a.errores[0].slice(0, 120) + ")" : " (mensaje: " + (a.d.getElementById("mensaje-reasignar-grilla").textContent || "").slice(0, 120) + ")"));
    a.d.getElementById("campo-motivo-arrastre-grilla").value = "prueba";
    a.d.getElementById("boton-confirmar-motivo-arrastre-grilla").click();
    await esperar(a.w, () => a.ops.some(o => o.op === "set" && /^turnos\//.test(o.path)), 600);
    const nuevo = a.ops.find(o => o.op === "set" && /^turnos\//.test(o.path)), anul = a.ops.find(o => o.op === "update" && o.path === "turnos/er2");
    assert(nuevo && nuevo.data.fecha === "2030-10-10" && nuevo.data.sedeId === "entre-rios" && typeof nuevo.data.horarioInicio === "string" && nuevo.data.estado === "activo" && nuevo.data.turnoOriginalId === "er2",
      "[Reasignar] se crea el turno nuevo (activo, misma sede, nueva fecha, con horario y enlazado al original)" + (nuevo ? ` → ${nuevo.data.fecha} ${nuevo.data.horarioInicio}` : ""));
    assert(anul && anul.data.estado === "reasignado" && anul.data.turnoNuevoId, "[Reasignar] el turno original queda anulado como 'reasignado' y apuntando al nuevo");
    assert(a.errores.length === 0, "[Reasignar] sin errores en consola" + (a.errores.length ? " → " + a.errores[0].slice(0, 160) : ""));
  }
  // ===== 5. Lecturas fallidas en grilla: Modificar y Consultar disponibilidad no deciden a ciegas =====
  {
    const a = await abrirAgenda("administrador");
    a.w.__fallaTurnosMotor = true; // falla la lectura de turnos que usa el motor (la semanal sigue andando)
    await a.w.abrirModificarGrilla("er2");
    const msgMod = () => a.d.getElementById("mensaje-modificar-grilla").textContent;
    const motivo = () => a.d.getElementById("overlay-motivo-arrastre-grilla").style.display === "flex";
    a.d.getElementById("boton-guardar-modificar-grilla").click();
    await esperar(a.w, () => /No se pudieron leer/.test(msgMod()) || motivo(), 400);
    assert(/No se pudieron leer/.test(msgMod()) && !motivo(), "[Modificar] si falló la lectura de turnos, no valida a ciegas: avisa y no avanza al motivo");
    assert(a.d.getElementById("boton-guardar-modificar-grilla").disabled === false, "[Modificar] el botón queda habilitado para reintentar");
    a.w.__fallaTurnosMotor = false;
    a.d.getElementById("boton-guardar-modificar-grilla").click();
    await esperar(a.w, () => motivo(), 400);
    assert(motivo(), "[Modificar] cuando la base vuelve a responder, relee sola y sigue normal (pide el motivo)" + (motivo() ? "" : " → " + msgMod().slice(0, 120)));
  }
  {
    const a = await abrirAgenda("administrador");
    a.w.__fallaTurnosMotor = true;
    await a.w.abrirConsultaDisponibilidadGrilla();
    a.d.getElementById("select-sede-consulta-grilla").value = "entre-rios";
    a.w.eval(`protocolosSeleccionadosConsultaGrilla = { f1: { protocoloId: "p1", nombre: "FEC", duracionMinutos: 60 } };
      const __b = buscarHuecosEnSede; buscarHuecosEnSede = function(...x) { window.__turnosConsulta = x[7].length; return __b(...x); };`);
    const msgCon = () => a.d.getElementById("mensaje-consulta-disponibilidad-grilla").textContent;
    const resultado = () => a.d.getElementById("resultado-disponibilidad-grilla").textContent.trim();
    a.d.getElementById("boton-buscar-disponibilidad-grilla").click();
    await esperar(a.w, () => /No se pudieron leer/.test(msgCon()) || resultado().length > 0, 400);
    assert(/No se pudieron leer/.test(msgCon()) && resultado() === "", "[Consultar disponibilidad] si falló la lectura de turnos, no informa lugares que podrían no existir");
    a.w.__fallaTurnosMotor = false;
    a.d.getElementById("boton-buscar-disponibilidad-grilla").click();
    await esperar(a.w, () => resultado().length > 0, 400);
    assert(resultado().length > 0, "[Consultar disponibilidad] cuando la base vuelve a responder, muestra la disponibilidad normal" + (resultado() ? "" : " → " + msgCon().slice(0, 120)));
    assert(a.w.__turnosConsulta === 7, `[Consultar disponibilidad] y la calcula con los turnos RECIÉN releídos de Entre Ríos (7), no con la lista vacía → ${a.w.__turnosConsulta}`);
  }
  // ===== 6. EL FORMULARIO NUEVO, de punta a punta: abrir "+ Nuevo turno", completarlo con clics reales y guardar =====
  {
    const ids = [...(await abrirAgenda("administrador")).d.querySelectorAll("[id]")].map((e) => e.id);
    const rep = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert(rep.length === 0, "[formulario en la agenda] ningún id repetido en toda la página (modal incluido)" + (rep.length ? ": " + rep.join(", ") : ""));
  }
  {
    // Administrador · primer horario disponible · sillón (el camino más común)
    const a = await cargarPorFormulario("administrador", { medicoValor: "med2" });
    assert(!!a.doc, "[admin · automático] el formulario nuevo guarda un turno" + (a.doc ? "" : " → mensaje: " + a.msg.slice(0, 140)));
    assert(a.doc.sedeId === "entre-rios" && a.doc.fecha === "2030-10-09" && a.doc.medicoId === "med2" && a.doc.paciente.id === "PX" && a.doc.ciclo === 2 && a.doc.sesion === 3 && a.doc.estado === "activo",
      `[admin · automático] guarda sede, fecha, médico, paciente, ciclo 2 y sesión 3 (${a.doc.sedeId} ${a.doc.fecha} ${a.doc.horarioInicio})`);
    assert(a.doc.protocolos[0].nombre === "FEC" && a.doc.duracionTotalMinutos === 60 && a.doc.horarioInicio >= "10:35" && a.doc.sillon != null && !("horarioManual" in a.doc) && !a.doc.internado,
      "[admin · automático] protocolo FEC (60 min), hoy desde las 10:35 (ya no ofrece horas pasadas), con sillón y sin marcas de horario manual ni internado");
    assert(/Paz, Luz/.test(a.antes.resumen) && /Dra\. Ruiz/.test(a.antes.resumen) && /FEC \(1 h\)/.test(a.antes.resumen) && !/falta/.test(a.antes.resumen), "[admin · automático] el resumen del pie, justo antes de guardar, lo decía todo: " + a.antes.resumen);
  }
  {
    const a = await cargarPorFormulario("administrador", { medicoValor: "med2", horario: "exacto", hora: "11:30" });
    assert(!!a.doc && a.doc.horarioInicio === "11:30" && a.doc.horarioManual === true && a.doc.sillon != null && a.doc.fecha === "2030-10-09", "[admin · hora exacta 11:30] guarda a las 11:30 con la marca de horario manual y con sillón" + (a.doc ? "" : " → " + a.msg.slice(0, 140)));
    assert(/a las 11:30/.test(a.antes.resumen), "[admin · hora exacta] el resumen decía 'a las 11:30'");
  }
  {
    const a = await cargarPorFormulario("administrador", { medicoValor: "med2", horario: "exacto" }); // sin hora
    assert(!a.doc && /falta cargar la hora/.test(a.msg), "[admin · hora exacta sin hora] no guarda nada y avisa (queda a la vista junto al botón)");
  }
  {
    const a = await cargarPorFormulario("administrador", { medicoValor: "med2", lugar: "internado", hora: "15:30" });
    assert(!!a.doc && a.doc.internado === true && a.doc.sillon === null && a.doc.horarioInicio === "15:30" && a.doc.sedeId === "emilio-civit", "[admin · internado 15:30] guarda un internado: sin sillón, a las 15:30, SIEMPRE en Emilio Civit (aunque la Dra. Ruiz atienda en Entre Ríos)" + (a.doc ? "" : " → " + a.msg.slice(0, 140)));
    assert(/Guardar internado/.test(a.antes.boton) && /internado, sin sillón, desde las 15:30/.test(a.antes.resumen), "[admin · internado] el botón y el resumen lo decían antes de guardar");
  }
  {
    const a = await cargarPorFormulario("administrador", { medicoValor: "med3", lugar: "backup" });
    assert(!!a.doc && a.doc.sedeId === "emilio-civit" && a.doc.sillon === 4, "[admin · puesto para inyectables] queda en el sillón backup (el 4) de Emilio Civit" + (a.doc ? ` → sede ${a.doc.sedeId}, sillón ${a.doc.sillon}` : " → " + a.msg.slice(0, 140)));
    assert(/puesto para inyectables/.test(a.antes.resumen), "[admin · puesto para inyectables] el resumen decía 'puesto para inyectables'");
  }
  {
    const a = await cargarPorFormulario("medico", { datosExtra: { medicoId: "med1" }, sedeManual: "entre-rios" });
    assert(!a.d.querySelector('input[name="horario-carga"]') || a.d.getElementById("bloque-horario-manual").style.display === "none", "[médico] no ve el selector de Horario (no puede forzar hora)");
    assert(a.d.getElementById("bloque-internado").style.display === "none", "[médico] no ve la opción Internado");
    assert(!!a.doc && a.doc.medicoId === "med1" && a.doc.sedeId === "entre-rios" && a.doc.fecha === "2030-10-09" && a.doc.sillon != null && !("horarioManual" in a.doc) && !a.doc.internado,
      "[médico] guarda su turno por el formulario nuevo: su médico, Entre Ríos, hoy, con sillón, sin horario manual" + (a.doc ? "" : " → " + a.msg.slice(0, 140)));
  }
  console.log("\nTODAS LAS PRUEBAS DE PUNTA A PUNTA PASARON\n");
}

module.exports = { abrirAgenda, esperar, idsDibujados, cargarPorFormulario, TURNOS, SEDES, MEDICOS, PACIENTES_FIX, PROTOCOLOS_FIX, T };
if (require.main === module) principal();
