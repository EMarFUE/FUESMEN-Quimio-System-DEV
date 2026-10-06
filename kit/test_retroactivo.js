// Turnos retroactivos (decisión de Elías, al cierre de la 5C): con "Hora exacta" + "Fecha exacta" se puede cargar un turno en cualquier
// fecha y hora, también pasadas — administrador y enfermería, que son quienes tienen Hora exacta. REASIGNAR sigue sin permitir el pasado.
const { abrir } = require("./test_formulario_carga.js");
const { abrirAgenda, esperar, cargarPorFormulario, TURNOS, T } = require("./test_agenda_e2e.js");

function assert(cond, msg) { if (!cond) { throw new Error("FALLA: " + msg); } console.log("OK: " + msg); }

// En la agenda simulada "hoy" es el miércoles 9/10/2030, 10:32. Un jueves pasado, la Dra. Ruiz atendía en Entre Ríos con sus dos sillones ocupados 09-10:
const JUEVES_PASADO = "2030-09-26", HOY = "2030-10-09";
const delDia = [
  T("p1", "entre-rios", JUEVES_PASADO, 1, "09:00", "10:00", { medicoId: "med2", medicoNombre: "Dra. Ruiz" }),
  T("p2", "entre-rios", JUEVES_PASADO, 2, "09:00", "10:00", { medicoId: "med2", medicoNombre: "Dra. Ruiz" })
];
const conDia = { turnos: [...TURNOS, ...delDia] };
const hace = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const PASADA = hace(30); // para el formulario aislado, que usa el reloj real

async function abrirModal(rol, datosExtra) {
  const a = await abrirAgenda(rol, datosExtra || {});
  a.d.querySelector('button[onclick="abrirModalNuevoTurnoGrilla()"]').click();
  await esperar(a.w, () => !a.d.getElementById("campo-buscar-paciente").disabled && a.d.getElementById("campo-medico").options.length > 1, 600);
  return a;
}

async function principal() {
  // ===================== A. Permisos en el formulario (lógica real; búsqueda y guardado espiados) =====================
  const conFechaPasada = async (rol, cambios) => {
    const p = abrir(rol); await p.esperar();
    p.w.eval(`modoFechaTurno = "calendario"; renderizarModoFecha(); document.getElementById("campo-fecha").value = ${JSON.stringify(PASADA)};`);
    if (cambios) await cambios(p);
    return p;
  };
  for (const rol of ["administrador", "enfermeria"]) {
    const p = await conFechaPasada(rol, async (p) => { p.click(p.radio("horario-carga", "exacto")); p.$("campo-horario-manual").value = "10:00"; });
    const r = await p.guardar();
    assert(r.llamadas.length === 1 && r.llamadas[0][0] === "horaExacta" && r.llamadas[0][1] === "10:00" && !r.mensaje, `[${rol}] fecha pasada + Hora exacta: pasa a la verificación de sillón, bloqueos y horario de la sede`);
  }
  {
    const p = await conFechaPasada("administrador", async (p) => { p.click(p.radio("lugar-carga", "backup")); p.click(p.radio("horario-carga", "exacto")); p.$("campo-horario-manual").value = "10:00"; });
    const r = await p.guardar();
    assert(r.llamadas.length === 1 && r.llamadas[0][0] === "horaExacta" && r.llamadas[0][2] === true, "[administrador] fecha pasada + Hora exacta + puesto para inyectables: también");
  }
  {
    const p = await conFechaPasada("administrador", async (p) => { p.click(p.radio("lugar-carga", "internado")); p.$("campo-horario-manual").value = "15:30"; });
    const r = await p.guardar();
    assert(r.llamadas.length === 1 && r.llamadas[0][0] === "internado" && r.llamadas[0][1] === "15:30", "[administrador] fecha pasada + internado con su hora: también se puede cargar");
  }
  {
    const p = await conFechaPasada("administrador");
    const r = await p.guardar();
    assert(r.llamadas.length === 0 && /Esa fecha ya pasó/.test(r.mensaje) && /Hora exacta/.test(r.mensaje), "[administrador] fecha pasada SIN Hora exacta: no busca (la búsqueda automática nunca ofrece días pasados) y explica qué elegir");
  }
  {
    const p = await conFechaPasada("administrador", async (p) => { p.click(p.radio("horario-carga", "exacto")); });
    const r = await p.guardar();
    assert(r.llamadas.length === 0 && /falta cargar la hora/.test(r.mensaje), "[administrador] fecha pasada + 'Hora exacta' sin hora: el aviso es el de la hora que falta (no el de la fecha)");
  }
  {
    const p = await conFechaPasada("administrador", async (p) => { p.click(p.radio("lugar-carga", "internado")); });
    const r = await p.guardar();
    assert(r.llamadas.length === 0 && /horario en que arranca el tratamiento/.test(r.mensaje), "[administrador] fecha pasada + internado sin hora: el aviso de siempre");
  }
  for (const rol of ["medico", "administrativo"]) {
    const p = await conFechaPasada(rol);
    const r = await p.guardar();
    assert(r.llamadas.length === 0 && /No se pueden cargar turnos en fechas pasadas/.test(r.mensaje), `[${rol}] no tiene Hora exacta: una fecha pasada (aunque la escriba a mano) no se carga`);
  }
  {
    const p = abrir("administrador"); await p.esperar();
    p.w.eval(`modoFechaTurno = "dias"; renderizarModoFecha(); document.getElementById("campo-dias-turno").value = "0"; actualizarFechaCalculada();`);
    p.click(p.radio("horario-carga", "exacto")); p.$("campo-horario-manual").value = "00:01";
    const r = await p.guardar();
    assert(r.llamadas.length === 1 && r.llamadas[0][0] === "horaExacta" && r.llamadas[0][1] === "00:01", "[administrador] hoy con una hora que ya pasó (00:01): se carga — la regla de 'no horas pasadas' queda solo para Reasignar");
  }

  {
    // El límite: HOY no es "fecha pasada" — la búsqueda automática de hoy funciona como siempre.
    const p = abrir("administrador"); await p.esperar();
    p.w.eval(`modoFechaTurno = "dias"; renderizarModoFecha(); document.getElementById("campo-dias-turno").value = "0"; actualizarFechaCalculada();`);
    const r = await p.guardar();
    assert(r.llamadas.length === 1 && r.llamadas[0][0] === "automatica" && !r.mensaje, "[administrador] hoy sin Hora exacta: búsqueda automática normal (hoy no cuenta como fecha pasada)");
  }

  // ===================== B. La pantalla =====================
  {
    const adm = await abrirModal("administrador"), enf = await abrirModal("enfermeria"), med = await abrirModal("medico", { medicoId: "med1" });
    assert(adm.d.getElementById("campo-fecha").min === "" && enf.d.getElementById("campo-fecha").min === "", "[pantalla] administrador y enfermería: el calendario deja elegir fechas pasadas");
    assert(med.d.getElementById("campo-fecha").min === HOY, "[pantalla] médico: el calendario sigue desde hoy");
    adm.d.getElementById("boton-modo-calendario").click(); med.d.getElementById("boton-modo-calendario").click();
    assert(adm.d.getElementById("nota-fecha-retroactiva").style.display !== "none" && /retroactivo/i.test(adm.d.getElementById("nota-fecha-retroactiva").textContent) && med.d.getElementById("nota-fecha-retroactiva").style.display === "none",
      "[pantalla] en 'Fecha exacta' el administrador ve la indicación de que puede elegir una fecha pasada (retroactivo); el médico no");
    const ev = (a, el, tipo) => el.dispatchEvent(new a.w.Event(tipo, { bubbles: true }));
    adm.d.getElementById("campo-fecha").value = JUEVES_PASADO; ev(adm, adm.d.getElementById("campo-fecha"), "input");
    await esperar(adm.w, () => false, 5);
    let t = adm.d.getElementById("resumen-carga-texto").textContent;
    assert(/26\/09\/2030 \(retroactivo\)/.test(t) && /falta elegir Hora exacta/.test(t), "[pantalla] el resumen marca la fecha como retroactiva y, sin Hora exacta, avisa que falta elegirla: " + t);
    adm.d.querySelector('input[name="horario-carga"][value="exacto"]').click();
    adm.d.getElementById("campo-horario-manual").value = "11:00"; ev(adm, adm.d.getElementById("campo-horario-manual"), "input");
    await esperar(adm.w, () => false, 5);
    t = adm.d.getElementById("resumen-carga-texto").textContent;
    assert(/\(retroactivo\)/.test(t) && !/falta elegir Hora exacta/.test(t) && /a las 11:00/.test(t), "[pantalla] con Hora exacta cargada ya no hay pendientes: " + t);
  }

  // ===================== C. Flujos reales, de punta a punta (formulario → motor → base) =====================
  const retro = (extra) => cargarPorFormulario("administrador", { medicoValor: "med2", fechaExacta: JUEVES_PASADO, override: conDia, ...extra });
  {
    const a = await retro({ horario: "exacto", hora: "11:00" });
    assert(!!a.doc && a.doc.fecha === JUEVES_PASADO && a.doc.horarioInicio === "11:00" && a.doc.horarioManual === true && a.doc.sillon != null && a.doc.sedeId === "entre-rios" && a.doc.estado === "activo" && a.doc.medicoId === "med2",
      "[retroactivo] un jueves de hace dos semanas, a las 11:00: se guarda (activo, con sillón, en Entre Ríos, con la marca de horario manual)" + (a.doc ? "" : " → " + a.msg.slice(0, 160)));
  }
  {
    const a = await retro({ horario: "exacto", hora: "09:30" });
    const cartel = a.d.getElementById("modal-sobreturno");
    assert(!a.doc && cartel && cartel.style.display === "block", "[retroactivo] a las 09:30 ese día los dos sillones estaban ocupados por turnos que YA ESTÁN CARGADOS: no se superpone, ofrece el sobreturno (el sistema leyó los turnos de ese día pasado)");
  }
  {
    const otroLugar = [T("c1", "emilio-civit", JUEVES_PASADO, 1, "08:00", "09:00", { paciente: { id: "PX", apellido: "Paz", nombre: "Luz" } })];
    const a = await retro({ horario: "exacto", hora: "11:00", override: { turnos: [...TURNOS, ...delDia, ...otroLugar] } });
    assert(!a.doc && /ya tiene un turno cargado/.test(a.msg), "[retroactivo] la regla de un turno por día por paciente sigue valiendo (el otro turno estaba en otra sede)");
  }
  {
    const a = await retro({ horario: "exacto", hora: "11:00", antesDeGuardar: (a) => { a.w.__fallaFecha = JUEVES_PASADO; } });
    assert(!a.doc && /No se pudieron leer los turnos de esa fecha/.test(a.msg), "[retroactivo] si falla la lectura de los turnos de ese día, no carga a ciegas: avisa y no guarda nada");
  }
  {
    const a = await retro({});
    assert(!a.doc && /Esa fecha ya pasó/.test(a.msg), "[retroactivo] sin Hora exacta, una fecha pasada no se busca ni se guarda");
  }
  {
    const a = await retro({ lugar: "internado", hora: "15:30" });
    assert(!!a.doc && a.doc.internado === true && a.doc.sillon === null && a.doc.fecha === JUEVES_PASADO && a.doc.horarioInicio === "15:30", "[retroactivo] un internado en esa fecha pasada, a las 15:30: se guarda sin sillón");
  }
  {
    const a = await cargarPorFormulario("administrador", { medicoValor: "med2", horario: "exacto", hora: "09:00" });
    assert(!!a.doc && a.doc.fecha === HOY && a.doc.horarioInicio === "09:00" && a.doc.horarioManual === true, "[retroactivo] hoy a las 09:00 cuando ya son las 10:32: se guarda (antes de este cambio se rechazaba)" + (a.doc ? "" : " → " + a.msg.slice(0, 160)));
  }
  {
    const a = await cargarPorFormulario("medico", { datosExtra: { medicoId: "med1" }, sedeManual: "entre-rios", fechaExacta: JUEVES_PASADO, override: conDia });
    assert(!a.doc && /No se pueden cargar turnos en fechas pasadas/.test(a.msg), "[médico] aunque fije una fecha pasada, no se carga: sigue sin poder cargar en el pasado");
  }

  // ===================== D. Reasignar SIGUE sin permitir el pasado =====================
  async function reasignar(fecha, hora) {
    const a = await abrirAgenda("administrador");
    a.w.abrirDetalleTurnoGrilla("er2");
    Array.from(a.d.querySelectorAll("#contenido-detalle-turno-grilla button")).find((b) => /Reasignar/.test(b.textContent)).click();
    await esperar(a.w, () => a.d.getElementById("overlay-reasignar-grilla").style.display === "flex", 400);
    a.d.getElementById("campo-fecha-reasignar-grilla").value = fecha;
    if (hora) { a.d.getElementById("campo-horario-manual-reasignar-grilla").value = hora; a.w.buscarReasignarHorarioManualGrilla(); }
    else a.d.getElementById("boton-buscar-reasignar-grilla").click();
    await esperar(a.w, () => a.d.getElementById("overlay-motivo-arrastre-grilla").style.display === "flex" || /pasad|pasó/.test(a.d.getElementById("mensaje-reasignar-grilla").textContent), 600);
    return { motivo: a.d.getElementById("overlay-motivo-arrastre-grilla").style.display === "flex", msg: a.d.getElementById("mensaje-reasignar-grilla").textContent, ops: a.ops };
  }
  {
    const r = await reasignar("2030-10-01");
    assert(!r.motivo && /No se puede reasignar a una fecha pasada/.test(r.msg), "[Reasignar → Buscar disponibilidad] una fecha pasada se rechaza con aviso (no ofrece días pasados)");
  }
  {
    const r = await reasignar("2030-10-01", "11:00");
    assert(!r.motivo && /No se puede reasignar a una fecha pasada/.test(r.msg), "[Reasignar → Hora exacta] una fecha pasada se rechaza con aviso");
  }
  {
    const r = await reasignar(HOY, "09:00");
    assert(!r.motivo && /Esa hora ya pasó/.test(r.msg), "[Reasignar → Hora exacta] hoy a una hora que ya pasó: se rechaza (como se decidió en P2)");
  }
  {
    const r = await reasignar("2030-10-10", "11:30");
    assert(r.motivo, "[Reasignar → Hora exacta] una fecha y hora futuras siguen andando normalmente");
  }

  console.log("\nTODAS LAS PRUEBAS DE TURNOS RETROACTIVOS PASARON\n");
}
if (require.main === module) principal();
