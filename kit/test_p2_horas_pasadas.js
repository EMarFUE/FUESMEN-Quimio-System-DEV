const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

function assert(cond, msg) {
  if (!cond) { throw new Error("FALLA: " + msg); }
  console.log("OK: " + msg);
}

const srcMotor = fs.readFileSync(path.join(__dirname, "../repo/js/turnero-motor.js"), "utf8");
const srcCarga = fs.readFileSync(path.join(__dirname, "../repo/js/turnero-carga.js"), "utf8");
function cargarMotor() { const c = { console: { log() {}, warn() {}, error() {} } }; vm.createContext(c); vm.runInContext(srcMotor, c); return c; }
const mi = s => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };

// Fechas lejanas a propósito. 2030-10-07 es lunes; "hoy" se simula con el parámetro ahora (motor) o con un reloj falso (carga).
const LUNES = "2030-10-07", MARTES = "2030-10-08", LUNES_SIG = "2030-10-14";
const DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes"];
const sede = (extra) => ({ id: "s1", nombre: "Emilio Civit", horaApertura: "09:00", horaCierre: "13:00", diasAtencion: DIAS,
  usaAtaduraDia: false, usaCuposPorcentaje: false, sillones: [{ numero: 1, tipo: "regular" }, { numero: 2, tipo: "regular" }], ...(extra || {}) });
const MED = { id: "m1", nombre: "Dr. Gómez", diasPorSede: {} };
const T = (id, sillon, i, f, fecha, extra) => ({ id, sedeId: "s1", fecha: fecha || LUNES, sillon, horarioInicio: i, horarioFin: f,
  medicoId: "m2", paciente: { id: "p" + id, apellido: "Ape" + id, nombre: "Nom" + id }, ...(extra || {}) });
const ahoraDe = (fecha, hhmm) => ({ fechaISO: fecha, minuto: mi(hhmm) });
const inicios = (r, fecha) => (r.huecosEncontrados || []).filter(h => h.fecha === fecha).map(h => mi(h.horaInicio));

function buscar(ctx, { turnos, ahora, excluir, paciente, sedeCfg, med, dur, fecha }) {
  return ctx.buscarHuecos("m1", "", dur || 60, fecha || LUNES, [med || MED], [sedeCfg || sede()], turnos || [], false, "s1", [],
    paciente || "pN", excluir, [], null, ahora);
}

(async () => {
  // ===================== PARTE A: búsqueda automática (motor) =====================
  {
    const r = await buscar(cargarMotor(), {});
    assert(r.exito && Math.min(...inicios(r, LUNES)) === mi("09:00"), "[motor, control] sin ahora: el primer horario del día es 09:00 (como siempre)");
  }
  {
    const r = await buscar(cargarMotor(), { ahora: ahoraDe(LUNES, "10:32") });
    const ini = inicios(r, LUNES);
    assert(r.exito && ini.length > 0 && Math.min(...ini) === mi("10:35"), "[motor] son las 10:32 → el primer horario de hoy es 10:35 (redondeado hacia arriba a la grilla de 5 min)");
    assert(ini.every(x => x >= mi("10:32")), "[motor] ningún horario de hoy es anterior a la hora actual");
    assert(ini.every(x => (x - mi("09:00")) % 5 === 0), "[motor] los horarios siguen en la misma grilla de la sede");
  }
  {
    const r = await buscar(cargarMotor(), { ahora: ahoraDe(LUNES, "10:30") });
    assert(Math.min(...inicios(r, LUNES)) === mi("10:30"), "[motor] una hora igual a la actual se acepta (10:30 a las 10:30)");
  }
  {
    const r = await buscar(cargarMotor(), { ahora: ahoraDe(LUNES, "14:00") });
    assert(r.exito && inicios(r, LUNES).length === 0 && r.huecosEncontrados.every(h => h.fecha === MARTES), "[motor] ya pasó el cierre de hoy → hoy no se ofrece nada y la búsqueda sigue al día siguiente");
  }
  {
    const r = await buscar(cargarMotor(), { ahora: ahoraDe(LUNES, "12:50") });
    assert(r.exito && inicios(r, LUNES).length === 0 && inicios(r, MARTES).length > 0, "[motor] quedan 10 min de hoy y se piden 60 → hoy no entra, sigue al día siguiente");
  }
  {
    const r = await buscar(cargarMotor(), { ahora: ahoraDe("2030-10-06", "11:00") });
    assert(Math.min(...inicios(r, LUNES)) === mi("09:00"), "[motor] ahora de OTRO día (ayer): sin efecto sobre la fecha pedida");
  }
  {
    const r = await buscar(cargarMotor(), { ahora: ahoraDe(LUNES, "08:00") });
    assert(Math.min(...inicios(r, LUNES)) === mi("09:00"), "[motor] hoy, pero la sede todavía no abrió: sin efecto");
  }
  {
    // Un día futuro no se filtra aunque "la hora" sea tarde: ahora solo manda en la fecha de hoy.
    const r = await buscar(cargarMotor(), { ahora: ahoraDe(LUNES, "11:00"), fecha: MARTES });
    assert(Math.min(...inicios(r, MARTES)) === mi("09:00"), "[motor] fecha pedida futura: no se filtra");
  }
  {
    // Reasignar: el turno propio (09:00-10:00, sillón 1) se excluye, pero su hora ya pasó.
    const propio = T("propio", 1, "09:00", "10:00", LUNES, { paciente: { id: "P" } });
    const otro = T("otro", 2, "09:00", "13:00");
    const r0 = await buscar(cargarMotor(), { turnos: [propio, otro], excluir: "propio", paciente: "P" });
    const r = await buscar(cargarMotor(), { turnos: [propio, otro], excluir: "propio", paciente: "P", ahora: ahoraDe(LUNES, "11:00") });
    assert(Math.min(...inicios(r0, LUNES)) === mi("09:00") && Math.min(...inicios(r, LUNES)) === mi("11:00"), "[motor, Reasignar] el lugar propio de las 09:00 ya pasó: se ofrece desde las 11:00");
  }
  {
    // Médico con franja 09:00-12:00 y ya son las 13:00: hoy no hay inicio posible → sigue al día siguiente, sin trabarse.
    const r = await buscar(cargarMotor(), { med: { ...MED, franjaHoraria: { horaInicio: "09:00", horaFin: "12:00" } }, ahora: ahoraDe(LUNES, "13:00") });
    assert(r.exito && inicios(r, LUNES).length === 0 && inicios(r, MARTES).length > 0, "[motor, franja] pasada la franja del médico, hoy se descarta y se ofrece el día siguiente");
  }

  // ===================== PARTE B: reacomodo y alternativa (motor) =====================
  // Layout de la auditoría: ningún sillón tiene 75 min seguidos; intercambiando t0 y t2 entra 10:45-12:00.
  const lunesLleno = [T("t0", 1, "09:00", "11:15"), T("t1", 1, "12:00", "13:00"), T("t2", 2, "09:00", "10:45"), T("t3", 2, "11:30", "13:00")];
  const alt = (ctx, ahora, turnos, sedeCfg) => ctx.buscarHuecosConReacomodo("m1", "", 75, LUNES, [MED], [sedeCfg || sede()], turnos || lunesLleno, false, "s1", [], "pN", undefined, [], null, [], false, true, ahora);
  {
    const r = await alt(cargarMotor(), undefined);
    assert(r.exito && r.huecosEncontrados[0].fecha === MARTES && r.alternativaReacomodo && r.alternativaReacomodo.hueco.fecha === LUNES && r.alternativaReacomodo.hueco.horaInicio === "10:45",
      "[motor, control] sin ahora: da el martes y ofrece reacomodar el lunes a las 10:45");
  }
  {
    const r = await alt(cargarMotor(), ahoraDe(LUNES, "10:00"));
    assert(r.alternativaReacomodo && r.alternativaReacomodo.hueco.horaInicio === "10:45", "[motor, alternativa] son las 10:00: la alternativa de las 10:45 sigue en pie");
  }
  {
    const r = await alt(cargarMotor(), ahoraDe(LUNES, "10:45"));
    assert(r.alternativaReacomodo && r.alternativaReacomodo.hueco.horaInicio === "10:45", "[motor, alternativa] son las 10:45: una hora igual a la actual se acepta");
  }
  {
    const r = await alt(cargarMotor(), ahoraDe(LUNES, "10:46"));
    assert(r.exito && r.huecosEncontrados[0].fecha === MARTES && r.alternativaReacomodo === null, "[motor, alternativa] son las 10:46: la única hora posible (10:45) ya pasó → no se ofrece reacomodar hoy");
  }
  {
    const r = await alt(cargarMotor(), ahoraDe(LUNES, "11:00"));
    assert(r.alternativaReacomodo === null, "[motor, alternativa] son las 11:00 → sin alternativa de hoy");
  }
  {
    // Reacomodo como último recurso: la sede solo atiende los lunes y el lunes siguiente también está lleno.
    const soloLunes = sede({ diasAtencion: ["lunes"] });
    const turnos = [...lunesLleno, T("L1", 1, "09:00", "13:00", LUNES_SIG), T("L2", 2, "09:00", "13:00", LUNES_SIG)];
    const run = (ahora) => cargarMotor().buscarHuecosConReacomodo("m1", "", 75, LUNES, [MED], [soloLunes], turnos, false, "s1", [], "pN", undefined, [], null, [], false, false, ahora);
    const r0 = await run(undefined), r1 = await run(ahoraDe(LUNES, "10:00")), r2 = await run(ahoraDe(LUNES, "11:00"));
    assert(r0.exito && r0.reacomodo && r0.huecosEncontrados[0].horaInicio === "10:45", "[motor, reacomodo, control] sin ahora: reacomoda el lunes a las 10:45");
    assert(r1.exito && r1.reacomodo && r1.huecosEncontrados[0].horaInicio === "10:45", "[motor, reacomodo] son las 10:00: sigue reacomodando a las 10:45");
    assert(r2.exito === false && !r2.reacomodo, "[motor, reacomodo] son las 11:00: la hora de las 10:45 ya pasó → no se reacomoda nada en el pasado");
  }

  // ===================== PARTE C: horario exacto (motor) =====================
  const fijo = (ctx, hora, ahora, turnos, paciente) => ctx.buscarSillonHorarioFijo("m1", "", 60, LUNES, hora, [MED], [sede()], turnos || [], "s1", [], false, undefined, paciente, ahora);
  {
    const ctx = cargarMotor();
    const r = await fijo(ctx, "10:00", ahoraDe(LUNES, "10:32"));
    assert(r.exito === false && r.motivo === "horaPasada", "[motor, horario exacto] 10:00 cuando son las 10:32 → motivo horaPasada");
    const r2 = await fijo(ctx, "10:32", ahoraDe(LUNES, "10:32"));
    assert(r2.exito === true, "[motor, horario exacto] la hora igual a la actual se acepta");
    const r3 = await fijo(ctx, "10:00", undefined);
    assert(r3.exito === true, "[motor, horario exacto, regresión] sin ahora, la hora pasada se acepta como siempre (retrocompatible)");
    const r4 = await fijo(ctx, "10:00", ahoraDe("2030-10-06", "23:00"));
    assert(r4.exito === true, "[motor, horario exacto] ahora de otro día: sin efecto");
    const r5 = await fijo(ctx, "10:00", ahoraDe(LUNES, "10:32"), [T("x", 1, "14:00", "15:00", LUNES, { paciente: { id: "pac1" } })], "pac1");
    assert(r5.exito === false && r5.motivo === "pacienteMismoDia", "[motor, horario exacto] si además el paciente ya tiene turno ese día, gana pacienteMismoDia (el bloqueo más básico)");
  }

  // ===================== PARTE D: arrastre semanal sin cambios =====================
  {
    const rs = await cargarMotor().buscarHuecosSemanaEnSede("s1", "Emilio Civit", [new Date(2030, 9, 7)], 60, "09:00", "13:00", DIAS, [], [1, 2], "m1", MED, false, false, [], new Set(), []);
    assert(rs[LUNES].huecos.some(h => h.horaInicio === "09:00"), "[motor, arrastre] la búsqueda semanal del arrastre no cambia (decisión de Elías: no filtra)");
  }

  // ===================== PARTE E: carga (flujo real, reloj simulado: lunes 7/10/2030 10:32:45) =====================
  const datosBase = { medicoId: "m1", medicoNombre: "Dr. Gómez", esMedicoOtro: false, sedeId: "s1", sedeNombre: "Emilio Civit", sedeAutomatica: false,
    protocolos: [{ protocoloId: "p", nombre: "FEC", duracionMinutos: 60 }], premedicacion: false, duracionTotalMinutos: 60, ciclo: 1, sesion: 1, fecha: LUNES, pacienteId: "pN", pacienteObraSocial: "OSDE" };

  async function correr({ accion, turnos, extraDatos, rol }) {
    const setup = `
      rolActualCarga = ${JSON.stringify(rol || "administrador")}; datosUsuarioActualCarga = { rol: rolActualCarga }; usuarioActualCarga = { uid: "u" };
      sedesCacheCarga = ${JSON.stringify([sede()])}; medicosCacheCarga = ${JSON.stringify([MED])};
      turnosExistentes = ${JSON.stringify(turnos || [])}; cuposCacheCarga = []; bloqueosCacheCarga = [];
      window.__guardados = []; window.__args = {};
      guardarTurnoConHueco = async function(d, h, tipo, cambios) { window.__guardados.push({ hueco: h, tipo: tipo, cambios: cambios || null }); };
      mostrarMensajeReasignarGrilla = function() {};
      const __reac = buscarHuecosConReacomodo; buscarHuecosConReacomodo = function(...a) { window.__args.reac = a; return __reac(...a); };
      const __bh = buscarHuecos; buscarHuecos = function(...a) { window.__args.huecos = a; return __bh(...a); };
      const __fijo = buscarSillonHorarioFijo; buscarSillonHorarioFijo = function(...a) { window.__args.fijo = a; return __fijo(...a); };
      window.__fin = false;
      (async () => { ${accion} })().then(() => { window.__fin = true; }, (e) => { window.__err = String(e); window.__fin = true; });
    `;
    const html = `<!DOCTYPE html><html><body><div id="mensaje-general"></div><div id="mensaje-reasignar-grilla"></div><button id="boton-guardar-turno"></button>
      <script>${srcMotor}</script><script>${srcCarga}</script><script>${setup}</script></body></html>`;
    const dom = new JSDOM(html, {
      runScripts: "dangerously",
      beforeParse(window) {
        const DateReal = window.Date;
        const ahora = new DateReal(2030, 9, 7, 10, 32, 45).getTime();
        window.Date = class extends DateReal { constructor(...a) { if (a.length === 0) super(ahora); else super(...a); } static now() { return ahora; } };
      }
    });
    const w = dom.window;
    for (let i = 0; i < 300 && !w.__fin; i++) { await new Promise(r => setTimeout(r, 0)); }
    return { guardados: w.__guardados, args: w.__args, err: w.__err, msg: w.document.getElementById("mensaje-general").textContent,
      botonHabilitado: w.document.getElementById("boton-guardar-turno").disabled === false, w };
  }
  const nuevo = (extra) => `buscarYMostrarHuecos(${JSON.stringify({ ...datosBase, ...(extra || {}) })}, { id: "pN", obraSocial: "OSDE" });`;
  const exacto = (hora, extra) => `buscarYGuardarConHorarioManual(${JSON.stringify({ ...datosBase, ...(extra || {}) })}, ${JSON.stringify(hora)}, false);`;

  {
    const r = await correr({ accion: "window.__ahora = ahoraParaMotor();" });
    assert(r.w.__ahora && r.w.__ahora.fechaISO === LUNES && r.w.__ahora.minuto === 10 * 60 + 32, "[carga] el helper toma la hora de la PC: fecha de hoy y minuto 10:32 (sin segundos)");
  }
  {
    const r = await correr({ accion: nuevo() });
    assert(r.guardados.length === 1 && r.guardados[0].hueco.fecha === LUNES && r.guardados[0].hueco.horaInicio === "10:35", "[carga, + nuevo turno] hoy a las 10:32 → se guarda a las 10:35, no a las 09:00" + (r.err ? " (" + r.err + ")" : ""));
    assert(r.args.reac && r.args.reac[17] && r.args.reac[17].fechaISO === LUNES && r.args.reac[17].minuto === 632, "[carga, + nuevo turno] la hora actual viaja al motor de reacomodo (último parámetro)");
  }
  {
    const r = await correr({ accion: nuevo({ fecha: MARTES }) });
    assert(r.guardados.length === 1 && r.guardados[0].hueco.fecha === MARTES && r.guardados[0].hueco.horaInicio === "09:00", "[carga, + nuevo turno] fecha futura: sin filtro (09:00)");
  }
  {
    const r = await correr({ accion: nuevo({ modoReasignar: true, turnoIdParaReasignar: "propio" }), turnos: [T("propio", 1, "09:00", "10:00", LUNES, { paciente: { id: "pN" } })] });
    assert(r.guardados.length === 1 && r.guardados[0].hueco.horaInicio !== "09:00" && mi(r.guardados[0].hueco.horaInicio) >= mi("10:35"), "[carga, Reasignar → Buscar] tampoco ofrece horas pasadas de hoy (su propio lugar de las 09:00 ya pasó)");
    assert(r.args.huecos && r.args.huecos[14] && r.args.huecos[14].minuto === 632, "[carga, Reasignar → Buscar] la hora actual viaja a buscarHuecos (parámetro 15)");
  }
  {
    const r = await correr({ accion: exacto("09:00") });
    // Decisión de Elías (al cierre de la 5C): en un ALTA NUEVA la hora exacta se puede cargar "cuando se quiera" (turnos
    // retroactivos). La hora actual NO se le pasa al motor; el rechazo de horas pasadas queda solo para Reasignar (abajo).
    assert(r.guardados.length === 1 && r.guardados[0].hueco.horaInicio === "09:00" && !/Esa hora ya pasó/.test(r.msg), "[carga, horario exacto, alta nueva] 09:00 cuando son las 10:32: SE CARGA (turno retroactivo; antes se rechazaba)");
    assert(r.args.fijo && r.args.fijo[13] === undefined, "[carga, horario exacto, alta nueva] la hora actual NO viaja al motor (sin rechazo de horas pasadas)");
  }
  {
    const r = await correr({ accion: exacto("11:00") });
    assert(r.guardados.length === 1 && r.guardados[0].hueco.horaInicio === "11:00" && r.guardados[0].hueco.horarioManual === true, "[carga, horario exacto] una hora futura de hoy se guarda normalmente");
  }
  {
    const r = await correr({ accion: exacto("09:00", { fecha: MARTES }) });
    assert(r.guardados.length === 1 && r.guardados[0].hueco.fecha === MARTES, "[carga, horario exacto] 09:00 de una fecha futura se guarda (no es 'pasada')");
  }
  {
    const r = await correr({ accion: exacto("09:00", { modoReasignar: true, turnoIdParaReasignar: "propio" }), turnos: [T("propio", 1, "09:00", "10:00", LUNES, { paciente: { id: "pN" } })] });
    assert(r.guardados.length === 0 && /Esa hora ya pasó/.test(r.msg) && /10:32/.test(r.msg), "[carga, Reasignar → hora exacta] una hora pasada de hoy SIGUE rechazándose, con la hora actual en el aviso");
    assert(r.botonHabilitado, "[carga, Reasignar → hora exacta] el botón queda habilitado para reintentar");
    assert(r.args.fijo && r.args.fijo[13] && r.args.fijo[13].minuto === 632, "[carga, Reasignar → hora exacta] la hora actual viaja a buscarSillonHorarioFijo (parámetro 14)");
  }
  {
    // buscarFechaPosteriorConReacomodo (reacomodo en días posteriores) también recibe la hora actual
    const r = await correr({ accion: `pacienteSeleccionadoCarga = { id: "pN", obraSocial: "OSDE" }; await buscarFechaPosteriorConReacomodo(${JSON.stringify(datosBase)});` });
    assert(r.args.reac && r.args.reac[17] && r.args.reac[17].minuto === 632, "[carga, fechas posteriores] la hora actual viaja también a la búsqueda de días posteriores");
  }

  console.log("\nTODAS LAS PRUEBAS DE P2 (NO OFRECER HORAS PASADAS) PASARON\n");
})();
