const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

function assert(cond, msg) { if (!cond) { throw new Error("FALLA: " + msg); } console.log("OK: " + msg); }

const srcMotor = fs.readFileSync(path.join(__dirname, "../repo/js/turnero-motor.js"), "utf8");
const srcCarga = fs.readFileSync(path.join(__dirname, "../repo/js/turnero-carga.js"), "utf8");

const LUNES = "2030-10-07";
const SEDE = { id: "s1", nombre: "Emilio Civit", horaApertura: "09:00", horaCierre: "13:00", diasAtencion: ["lunes", "martes", "miercoles", "jueves", "viernes"],
  usaAtaduraDia: false, usaCuposPorcentaje: false, sillones: [{ numero: 1, tipo: "regular" }, { numero: 2, tipo: "regular" }] };
const MED = { id: "m1", nombre: "Dr. Gómez", diasPorSede: {} };
const datosBase = { medicoId: "m1", medicoNombre: "Dr. Gómez", esMedicoOtro: false, sedeId: "s1", sedeNombre: "Emilio Civit", sedeAutomatica: false,
  protocolos: [{ protocoloId: "p", nombre: "FEC", duracionMinutos: 60 }], premedicacion: false, duracionTotalMinutos: 60, ciclo: 1, sesion: 1, fecha: LUNES,
  pacienteId: "P", pacienteObraSocial: "OSDE" };
// Un turno real ocupando el sillón 1 de 09 a 10: si la lectura funciona, el motor lo ve.
const TURNO = { id: "t1", sedeId: "s1", fecha: LUNES, sillon: 1, horarioInicio: "09:00", horarioFin: "10:00", estado: "activo", medicoId: "m2", paciente: { id: "x" } };

async function correr({ fallaAlCargar, fallaAlBuscar, accion }) {
  const setup = `
    window.__falla = ${JSON.stringify(fallaAlCargar || {})};
    window.__DATA = { turnos: [${JSON.stringify(TURNO)}], turneroBloqueos: [], turneroCupos: [] };
    const CLAVE = { turnos: "turnos", turneroBloqueos: "bloqueos", turneroCupos: "cupos" };
    const q = (c, f) => ({ where: (a, b, v) => q(c, f.concat([[a, b, v]])), get: async () => {
      if (window.__falla[CLAVE[c]]) throw new Error("lectura simulada fallida: " + c);
      const docs = (window.__DATA[c] || []).map(d => ({ id: d.id, data: () => d })); return { docs }; } });
    db = { collection: (c) => q(c, []) };
    rolActualCarga = "administrador"; datosUsuarioActualCarga = { rol: "administrador" }; usuarioActualCarga = { uid: "u" };
    sedesCacheCarga = ${JSON.stringify([SEDE])}; medicosCacheCarga = ${JSON.stringify([MED])};
    pacienteSeleccionadoCarga = { id: "P", obraSocial: "OSDE" };
    window.__llamadas = { huecos: 0, reac: 0, fijo: 0 }; window.__guardados = []; window.__msgReasignar = "";
    const _h = buscarHuecos; buscarHuecos = function(...a) { window.__llamadas.huecos++; window.__turnosVistos = a[6].length; return _h(...a); };
    const _r = buscarHuecosConReacomodo; buscarHuecosConReacomodo = function(...a) { window.__llamadas.reac++; window.__turnosVistos = a[6].length; return _r(...a); };
    const _f = buscarSillonHorarioFijo; buscarSillonHorarioFijo = function(...a) { window.__llamadas.fijo++; return _f(...a); };
    guardarTurnoConHueco = async function(d, h) { window.__guardados.push(h); };
    mostrarMensajeReasignarGrilla = function(t) { window.__msgReasignar = t; };
    mostrarConfirmarReacomodo = function() {}; mostrarReacomodoSinSolucion = function() {};
    window.__fin = false;
    (async () => {
      await Promise.all([cargarTurnosExistentes(), cargarBloqueosCarga(), cargarCuposCarga()]);
      window.__falla = ${JSON.stringify(fallaAlBuscar === undefined ? (fallaAlCargar || {}) : fallaAlBuscar)};
      ${accion}
    })().then(() => { window.__fin = true; }, (e) => { window.__err = String(e); window.__fin = true; });
  `;
  const html = `<!DOCTYPE html><html><body><div id="mensaje-general"></div><button id="boton-guardar-turno"></button><button id="boton-otro"></button>
    <script>${srcMotor}</script><script>${srcCarga}</script><script>${setup}</script></body></html>`;
  const dom = new JSDOM(html, { runScripts: "dangerously" });
  const w = dom.window;
  for (let i = 0; i < 300 && !w.__fin; i++) { await new Promise(r => setTimeout(r, 0)); }
  return { w, err: w.__err, llamadas: w.__llamadas, guardados: w.__guardados, msg: w.document.getElementById("mensaje-general").textContent,
    msgReasignar: w.__msgReasignar, turnosVistos: w.__turnosVistos,
    boton: w.document.getElementById("boton-guardar-turno").disabled === false, botonOtro: w.document.getElementById("boton-otro").disabled === false };
}
const nuevo = (extra) => `await buscarYMostrarHuecos(${JSON.stringify({ ...datosBase, ...(extra || {}) })}, { id: "P", obraSocial: "OSDE" });`;
const exacto = `await buscarYGuardarConHorarioManual(${JSON.stringify(datosBase)}, "11:00", false, { botonId: "boton-otro" });`;
const posterior = `await buscarFechaPosteriorConReacomodo(${JSON.stringify(datosBase)});`;
const AVISO = /No se pudieron leer los datos que el sistema necesita para calcular la disponibilidad/;

(async () => {
  // ===== control: todo se lee bien → todo sigue como siempre =====
  {
    const r = await correr({ accion: nuevo() });
    assert(!r.err && r.llamadas.reac === 1 && r.guardados.length === 1 && r.turnosVistos === 1 && !AVISO.test(r.msg), "[control] lecturas OK: busca y guarda como siempre (el motor ve el turno existente)" + (r.err ? " " + r.err : ""));
  }
  // ===== cada lectura que falla frena la búsqueda =====
  for (const [clave, nombre] of [["turnos", "turnos ya cargados"], ["bloqueos", "bloqueos"], ["cupos", "cupos"]]) {
    const r = await correr({ fallaAlCargar: { [clave]: true }, accion: nuevo() });
    assert(r.llamadas.reac === 0 && r.llamadas.huecos === 0 && r.guardados.length === 0, `[${clave}] si falla su lectura, el motor NO se ejecuta y no se guarda nada`);
    assert(AVISO.test(r.msg) && r.msg.includes(nombre) && /no se buscó lugar/.test(r.msg), `[${clave}] el cartel lo dice claro y nombra qué no se pudo leer ("${nombre}")`);
    assert(r.boton, `[${clave}] el botón queda habilitado para reintentar`);
  }
  {
    const r = await correr({ fallaAlCargar: { turnos: true, bloqueos: true }, accion: nuevo() });
    assert(r.msg.includes("turnos ya cargados") && r.msg.includes("bloqueos") && !r.msg.includes("cupos"), "[varias] si fallan dos lecturas, nombra las dos (y solo esas)");
  }
  // ===== reintento automático: si al buscar la base ya responde, sigue normal =====
  {
    const r = await correr({ fallaAlCargar: { turnos: true }, fallaAlBuscar: {}, accion: nuevo() });
    assert(r.llamadas.reac === 1 && r.guardados.length === 1 && r.turnosVistos === 1 && !AVISO.test(r.msg),
      "[reintento] falló al abrir, pero al buscar se vuelve a leer sola: el motor corre con los turnos reales (no con la lista vacía)");
  }
  // ===== Reasignar: el aviso aparece también en su propio modal =====
  {
    const r = await correr({ fallaAlCargar: { turnos: true }, accion: nuevo({ modoReasignar: true, turnoIdParaReasignar: "t1" }) });
    assert(r.llamadas.huecos === 0 && AVISO.test(r.msgReasignar), "[Reasignar → Buscar] no busca y el aviso aparece en el modal de Reasignar");
  }
  // ===== horario exacto =====
  {
    const r = await correr({ fallaAlCargar: { turnos: true }, accion: exacto });
    assert(r.llamadas.fijo === 0 && r.guardados.length === 0 && AVISO.test(r.msg) && r.botonOtro, "[horario exacto] no se verifica el horario, avisa y libera SU botón");
    const ok = await correr({ accion: exacto });
    assert(ok.llamadas.fijo === 1 && ok.guardados.length === 1, "[horario exacto, control] con lecturas OK guarda como siempre");
  }
  // ===== búsqueda en fechas posteriores (reacomodo) =====
  {
    const r = await correr({ fallaAlCargar: { bloqueos: true }, accion: posterior });
    assert(r.llamadas.reac === 0 && AVISO.test(r.msg), "[fechas posteriores] tampoco busca si falló una lectura");
    const ok = await correr({ accion: posterior });
    assert(ok.llamadas.reac === 1, "[fechas posteriores, control] con lecturas OK busca como siempre");
  }
  console.log("\nTODAS LAS PRUEBAS DE LECTURAS FALLIDAS PASARON\n");
})();
