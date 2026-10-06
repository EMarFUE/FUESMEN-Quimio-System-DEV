const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

function assert(cond, msg) {
  if (!cond) { throw new Error("FALLA: " + msg); }
  console.log("OK: " + msg);
}

const srcMotor = fs.readFileSync(path.join(__dirname, "../repo/js/turnero-motor.js"), "utf8");
const srcCarga = fs.readFileSync(path.join(__dirname, "../repo/js/turnero-carga.js"), "utf8");

// Fechas lejanas a propósito. 2030-10-07 es lunes.
const LUNES = "2030-10-07", MARTES = "2030-10-08", LUNES_SIG = "2030-10-14";
const sede = (extra) => ({ id: "s1", nombre: "Emilio Civit", horaApertura: "09:00", horaCierre: "13:00", diasAtencion: ["lunes", "martes", "miercoles", "jueves", "viernes"],
  usaAtaduraDia: false, usaCuposPorcentaje: false,
  sillones: [{ numero: 1, tipo: "regular" }, { numero: 2, tipo: "regular" }, { numero: 3, tipo: "backup" }], ...(extra || {}) });
const MED = { id: "m1", nombre: "Dr. Gómez", diasPorSede: {} };
const T = (id, sillon, i, f, fecha, extra) => ({ id, sedeId: "s1", fecha: fecha || LUNES, sillon, horarioInicio: i, horarioFin: f,
  medicoId: "m2", paciente: { id: "p" + id, apellido: "Ape" + id, nombre: "Nom" + id }, ...(extra || {}) });
const datosBase = { medicoId: "m1", medicoNombre: "Dr. Gómez", esMedicoOtro: false, sedeId: "s1", sedeNombre: "Emilio Civit", sedeAutomatica: false,
  protocolos: [{ protocoloId: "p", nombre: "FEC", duracionMinutos: 60 }], premedicacion: false, duracionTotalMinutos: 60, ciclo: 1, sesion: 1, fecha: LUNES,
  pacienteId: "P", pacienteObraSocial: "OSDE" };
const REASIGNAR = { modoReasignar: true, turnoIdParaReasignar: "propio" };

async function correr({ accion, turnos, sedeCfg, clic }) {
  const setup = `
    rolActualCarga = "administrador"; datosUsuarioActualCarga = { rol: "administrador" }; usuarioActualCarga = { uid: "u" };
    sedesCacheCarga = ${JSON.stringify([sedeCfg || sede()])}; medicosCacheCarga = ${JSON.stringify([MED])};
    turnosExistentes = ${JSON.stringify(turnos)}; cuposCacheCarga = []; bloqueosCacheCarga = [];
    window.__guardados = [];
    guardarTurnoConHueco = async function(d, h, tipo, cambios) { window.__guardados.push({ hueco: h, tipo: tipo }); };
    mostrarMensajeReasignarGrilla = function() {};
    window.__fin = false;
    (async () => { ${accion} })().then(() => { window.__fin = true; }, (e) => { window.__err = String(e); window.__fin = true; });
  `;
  const html = `<!DOCTYPE html><html><body><div id="mensaje-general"></div><div id="mensaje-reasignar-grilla"></div><button id="boton-guardar-turno"></button>
    <script>${srcMotor}</script><script>${srcCarga}</script><script>${setup}</script></body></html>`;
  const dom = new JSDOM(html, { runScripts: "dangerously" });
  const w = dom.window;
  for (let i = 0; i < 300 && !w.__fin; i++) { await new Promise(r => setTimeout(r, 0)); }
  if (clic) {
    const modal = w.document.getElementById("modal-sobreturno");
    const btn = modal && Array.from(modal.querySelectorAll("button")).find(b => clic.test(b.textContent));
    if (btn) { btn.click(); for (let i = 0; i < 300 && w.__guardados.length === 0; i++) { await new Promise(r => setTimeout(r, 0)); } }
  }
  return { guardados: w.__guardados, err: w.__err };
}
const fisico = (extra) => `await guardarComoSobreturnoFisico(${JSON.stringify({ ...datosBase, ...(extra || {}) })});`;
const backup = (extra) => `await guardarComoSobreturnoSoloBackup(${JSON.stringify({ ...datosBase, ...(extra || {}) })});`;
const hora = (r) => r.guardados[0] ? `${r.guardados[0].hueco.horaInicio}-${r.guardados[0].hueco.horaFin}` : "(no guardó" + (r.err ? ": " + r.err : "") + ")";

(async () => {
  // ===================== A: sobreturno físico (sin sillón) =====================
  // Dos turnos de otros pacientes hasta las 11:00; el turno que se reasigna (propio) está a las 12:00-13:00 ese mismo día.
  const base = [T("o1", 1, "09:00", "11:00"), T("o2", 2, "09:00", "11:00")];
  const propio = T("propio", null, "12:00", "13:00", LUNES, { paciente: { id: "P" } });
  {
    const r = await correr({ accion: fisico({ ...REASIGNAR, duracionTotalMinutos: 120 }), turnos: [...base, propio] });
    assert(hora(r) === "11:00-13:00", `[físico, Reasignar] el propio turno no cuenta para calcular el horario: 11:00-13:00 (antes: 13:00-13:01) → ${hora(r)}`);
    assert(r.guardados[0].hueco.sillon === null && r.guardados[0].tipo === "sinDisponibilidadFisica", "[físico, Reasignar] sigue siendo un sobreturno sin sillón del tipo de siempre");
  }
  {
    const r = await correr({ accion: fisico({ duracionTotalMinutos: 120 }), turnos: [...base, propio] });
    assert(hora(r) === "13:00-13:01", `[físico, regresión] alta nueva (sin turnoIdParaReasignar): los turnos del día cuentan todos, igual que antes → ${hora(r)}`);
  }
  {
    const r = await correr({ accion: fisico({ ...REASIGNAR, duracionTotalMinutos: 120 }), turnos: [...base, { ...propio, fecha: MARTES }] });
    assert(hora(r) === "11:00-13:00", `[físico, Reasignar] el propio turno está en OTRO día: sin efecto → ${hora(r)}`);
  }
  {
    // Los demás turnos siguen contando: otro termina 12:30 y el propio 13:00.
    const r = await correr({ accion: fisico({ ...REASIGNAR, duracionTotalMinutos: 120 }),
      turnos: [...base, T("o3", 1, "11:00", "12:30"), T("propio", null, "12:30", "13:00", LUNES, { paciente: { id: "P" } })] });
    assert(hora(r) === "12:30-13:00", `[físico, Reasignar] excluye SOLO al propio: el de otro paciente que termina 12:30 sigue contando (queda lo que sobra, 30 min) → ${hora(r)}`);
  }
  {
    const r = await correr({ accion: fisico({ ...REASIGNAR, turnoIdParaReasignar: "otroId", duracionTotalMinutos: 120 }), turnos: [...base, propio] });
    assert(hora(r) === "13:00-13:01", `[físico, Reasignar] un id que no es el del turno del día no excluye nada → ${hora(r)}`);
  }

  // ===================== B: sobreturno solo en el puesto de inyectables (sillón backup) =====================
  const baseB = [T("b1", 3, "09:00", "10:00")];
  const propioB = T("propio", 3, "11:00", "12:00", LUNES, { paciente: { id: "P" } });
  {
    const r = await correr({ accion: backup({ ...REASIGNAR }), turnos: [...baseB, propioB] });
    assert(hora(r) === "10:00-11:00", `[backup, Reasignar] el propio turno no cuenta: 10:00-11:00 (antes: 12:00-13:00) → ${hora(r)}`);
    assert(r.guardados[0].hueco.sillon === 3, "[backup, Reasignar] sigue forzado al sillón backup");
  }
  {
    const r = await correr({ accion: backup({}), turnos: [...baseB, propioB] });
    assert(hora(r) === "12:00-13:00", `[backup, regresión] alta nueva: todos los turnos del puesto cuentan → ${hora(r)}`);
  }
  {
    const r = await correr({ accion: backup({ ...REASIGNAR }), turnos: [...baseB, { ...propioB, fecha: MARTES }] });
    assert(hora(r) === "10:00-11:00", `[backup, Reasignar] propio en otro día: sin efecto → ${hora(r)}`);
  }

  // ===================== C: flujo completo de Reasignar → cartel → "Cargar como sobreturno" =====================
  // La sede solo atiende los lunes y el lunes siguiente está lleno: no hay lugar en 10 días y salta el cartel de sobreturno.
  {
    const soloLunes = sede({ diasAtencion: ["lunes"] });
    const turnos = [...base, propio, T("L1", 1, "09:00", "13:00", LUNES_SIG), T("L2", 2, "09:00", "13:00", LUNES_SIG)];
    const accion = `buscarYMostrarHuecos(${JSON.stringify({ ...datosBase, ...REASIGNAR, duracionTotalMinutos: 180 })}, { id: "P", obraSocial: "OSDE" });`;
    const r = await correr({ accion, turnos, sedeCfg: soloLunes, clic: /Cargar como sobreturno/ });
    assert(hora(r) === "11:00-13:00" && r.guardados[0].hueco.sillon === null,
      `[Reasignar de punta a punta] sin lugar en 10 días → 'Cargar como sobreturno' calcula 11:00-13:00 sin contar al propio turno → ${hora(r)}`);
  }

  console.log("\nTODAS LAS PRUEBAS DE P3 (SOBRETURNO AL REASIGNAR) PASARON\n");
})();
