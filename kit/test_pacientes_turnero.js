// B1 · El turnero (agenda y carga) usa el buscador y el caché únicos de pacientes. El listado puede tener hasta 7 días, así que
// al ELEGIR un paciente se lo confirma con el servidor (1 lectura): si cambió algo se corrige y se avisa; si fue dado de baja, se quita.
const { abrirAgenda, esperar } = require("./test_agenda_e2e.js");

function assert(cond, msg) { if (!cond) { throw new Error("FALLA: " + msg); } console.log("OK: " + msg); }
const OTRO = { id: "PY", activo: true, nombre: "Ana", apellido: "Gil", obraSocial: "PAMI", tipoDocumento: "DNI", numeroDocumento: "40111222" };

async function abrirModal(preparar) {
  const a = await abrirAgenda("administrador");
  a.w.open = () => ({ document: { write() {}, close() {} }, close() {}, focus() {}, print() {} });
  a.w.__STORE.pacientes = JSON.parse(JSON.stringify(a.w.__STORE.pacientes)); // copia propia: ningún test contamina a otro
  a.w.__STORE.pacientes.push({ ...OTRO });
  if (preparar) preparar(a);
  a.w.__lecturasPacienteDoc = 0; a.w.__listados = 0;
  a.w.eval(`
    (function() {
      var orig = db.collection;
      db.collection = function(n) { var q = orig(n); if (n === "pacientes") { var od = q.doc; q.doc = function(id) { window.__lecturasPacienteDoc++; return od(id); }; } return q; };
      var rl = PacientesCache.recargarListado; PacientesCache.recargarListado = function() { window.__listados++; return rl.apply(this, arguments); };
    })();`);
  const $ = (id) => a.d.getElementById(id);
  a.d.querySelector('button[onclick="abrirModalNuevoTurnoGrilla()"]').click();
  await esperar(a.w, () => !$("campo-buscar-paciente").disabled, 600);
  a.$ = $;
  a.buscarYElegir = async (texto) => {
    $("campo-buscar-paciente").value = texto; $("campo-buscar-paciente").dispatchEvent(new a.w.Event("input", { bubbles: true }));
    a.d.querySelector("#resultados-busqueda-paciente .resultado-busqueda button").click();
  };
  a.sel = () => a.w.eval("pacienteSeleccionadoCarga");
  a.lista = () => a.w.eval("pacientesCacheCarga");
  a.cartel = () => ($("mensaje-general").style.display !== "none" ? $("mensaje-general").textContent : "");
  return a;
}

(async () => {
  {
    const a = await abrirModal();
    assert(typeof a.w.PacientesCache === "object" && typeof a.w.PacientesBuscador === "object", "[carga] los dos archivos nuevos están presentes");
    await a.buscarYElegir("Paz");
    await esperar(a.w, () => false, 20);
    assert(a.sel() && a.sel().id === "PX" && /Paz, Luz/.test(a.$("texto-paciente-seleccionado").textContent), "[elegir] elige al paciente y lo muestra");
    assert(a.w.__lecturasPacienteDoc === 1, `[elegir] la verificación cuesta UNA lectura puntual (${a.w.__lecturasPacienteDoc})`);
    assert(a.cartel() === "", "[elegir] sin cambios en el servidor: no aparece ningún aviso");
  }
  {
    const a = await abrirModal();
    a.w.__STORE.pacientes.find((p) => p.id === "PX").obraSocial = "PAMI"; // alguien lo corrigió en otra PC
    await a.buscarYElegir("Paz");
    await esperar(a.w, () => a.cartel() !== "", 300);
    assert(a.sel().obraSocial === "PAMI" && /PAMI/.test(a.$("texto-paciente-seleccionado").textContent), "[cambió la obra social] la selección toma el dato nuevo y la pantalla lo muestra");
    assert(/Se actualizaron los datos de Paz, Luz/.test(a.cartel()) && /PAMI/.test(a.cartel()), "[cambió la obra social] y se avisa: " + a.cartel());
    assert(a.lista().find((p) => p.id === "PX").obraSocial === "PAMI", "[cambió la obra social] el listado de la pantalla también queda al día");
  }
  {
    const a = await abrirModal();
    a.w.__STORE.pacientes.find((p) => p.id === "PX").activo = false; // lo dieron de baja en otra PC
    await a.buscarYElegir("Paz");
    await esperar(a.w, () => a.cartel() !== "", 300);
    assert(a.sel() === null && a.$("paciente-seleccionado").style.display === "none" && a.$("bloque-busqueda-paciente").style.display === "block", "[dado de baja] se quita la selección y vuelve el buscador");
    assert(/dado de baja/.test(a.cartel()) && !a.lista().some((p) => p.id === "PX") && !(a.w.PacientesCache.leer() || []).some((p) => p.id === "PX"), "[dado de baja] se avisa y sale de la lista y del caché: " + a.cartel());
  }
  {
    const a = await abrirModal();
    a.w.__STORE.pacientes.find((p) => p.id === "PX").obraSocial = "PAMI";
    await a.buscarYElegir("Paz");
    a.w.quitarPacienteSeleccionado();
    await a.buscarYElegir("Gil"); // eligió a otra persona antes de que llegue la verificación de la primera
    await esperar(a.w, () => false, 40);
    assert(a.sel().id === "PY" && a.cartel() === "", "[cambió de paciente] la verificación de la primera persona no pisa a la segunda ni muestra avisos");
  }
  {
    const a = await abrirModal();
    a.w.cerrarModalNuevoTurnoGrilla && a.w.cerrarModalNuevoTurnoGrilla();
    a.d.querySelector('button[onclick="abrirModalNuevoTurnoGrilla()"]').click();
    await esperar(a.w, () => !a.$("campo-buscar-paciente").disabled, 300);
    assert(a.w.__listados === 0, "[reabrir] abrir el formulario de nuevo no relee el listado completo (caché de 7 días)");
  }
  {
    // Alta rápida: el paciente nuevo queda elegido, en la lista y en el caché (sin renovar la fecha del listado) y no se lo marca como "dado de baja".
    const a = await abrirModal();
    a.w.eval(`(function() { var orig = db.collection; db.collection = function(n) { var q = orig(n); var od = q.doc; q.doc = function(id) { var r = od(id); var os = r.set; r.set = async function(x) { await os(x); if (n === "pacientes") window.__STORE.pacientes.push(Object.assign({ id: id }, x)); }; return r; }; return q; }; })();`);
    a.w.mostrarAltaRapida();
    a.$("alta-tipo-documento").value = "DNI"; a.$("alta-numero-documento").value = "50123456"; a.$("alta-nombre").value = "Rosa"; a.$("alta-apellido").value = "Nueva"; a.$("alta-obra-social").value = a.$("alta-obra-social").options[1].value;
    const fechaAntes = JSON.parse(a.w.localStorage.getItem("cache_pacientes_activos")).fecha;
    await a.w.altaRapidaPaciente();
    await esperar(a.w, () => false, 40);
    assert(a.sel() && a.sel().id === "DNI-50123456" && a.cartel() === "", "[alta rápida] el paciente nuevo queda elegido y sin avisos de baja");
    assert(a.lista().some((p) => p.id === "DNI-50123456") && a.w.PacientesCache.leer().some((p) => p.id === "DNI-50123456") && JSON.parse(a.w.localStorage.getItem("cache_pacientes_activos")).fecha === fechaAntes,
      "[alta rápida] queda en la lista de la pantalla y en el caché, sin renovar la fecha del listado");
  }
  console.log("\nTODAS LAS PRUEBAS DE PACIENTES EN EL TURNERO PASARON\n");
})().catch((e) => { console.error(e); process.exit(1); });
