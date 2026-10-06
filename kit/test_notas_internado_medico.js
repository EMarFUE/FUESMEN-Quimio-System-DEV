const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

function assert(cond, msg) {
  if (!cond) { throw new Error("FALLA: " + msg); }
  console.log("OK: " + msg);
}

const srcMotor = fs.readFileSync(path.join(__dirname, "../repo/js/turnero-motor.js"), "utf8");
const srcCarga = fs.readFileSync(path.join(__dirname, "../repo/js/turnero-carga.js"), "utf8");
const srcGrilla = fs.readFileSync(path.join(__dirname, "../repo/js/turnero-grilla.js"), "utf8");

const SEDE = { id: "s1", nombre: "Emilio Civit", horaApertura: "08:00", horaCierre: "18:00", diasAtencion: ["lunes", "martes", "miercoles", "jueves", "viernes"],
  usaAtaduraDia: false, usaCuposPorcentaje: false, sillones: [{ numero: 1, tipo: "regular" }, { numero: 2, tipo: "regular" }] };
const F = "2030-10-07";
const base = { sedeId: "s1", sedeNombre: "Emilio Civit", medicoId: "med1", medicoNombre: "Dr. Gómez", fecha: F, estado: "activo",
  paciente: { id: "P", nombre: "Ana", apellido: "Pérez", obraSocial: "OSDE", numeroDocumento: "1" } };
const INTERNADO = { ...base, id: "tInt", internado: true, sillon: null, horarioInicio: "10:00", horarioFin: "11:00" };
const COMUN = { ...base, id: "tCom", sillon: 1, horarioInicio: "12:00", horarioFin: "13:00" };
// Una nota propia (uid u1) y una ajena (uid u9).
const NOTAS = [
  { id: "n1", data: () => ({ texto: "nota propia", autorUid: "u1", autorNombre: "Yo", autorRol: "medico" }) },
  { id: "n2", data: () => ({ texto: "nota ajena", autorUid: "u9", autorNombre: "Enf", autorRol: "enfermeria" }) }
];

async function correr(rol, turnoId, accion) {
  const setup = `
    sedesCacheGrilla = ${JSON.stringify([SEDE])}; sedeSeleccionadaGrilla = "s1";
    turnosCacheGrilla = ${JSON.stringify([INTERNADO, COMUN])};
    rolActualGrilla = ${JSON.stringify(rol)}; datosUsuarioActualGrilla = { rol: ${JSON.stringify(rol)}, nombre: "Yo", medicoId: "med1" };
    usuarioActualGrilla = { uid: "u1", email: "yo@x.com" }; medicosCacheGrilla = [];
    window.__ops = [];
    const mkDoc = (p) => ({ __path: p,
      collection: (c) => ({ doc: (id) => mkDoc(p + "/" + c + "/" + (id || "notaNueva")), orderBy: () => ({ get: async () => ({ docs: window.__NOTAS }) }) }),
      update: async (d) => { window.__ops.push({ op: "update", path: p, data: d }); } });
    db = { collection: (c) => ({ doc: (id) => mkDoc(c + "/" + id) }),
           batch: () => ({ set: (r, d) => window.__ops.push({ op: "set", path: r.__path, data: d }),
                           update: (r, d) => window.__ops.push({ op: "update", path: r.__path, data: d }),
                           delete: (r) => window.__ops.push({ op: "delete", path: r.__path }), commit: async () => {} }) };
    firebase = { firestore: { FieldValue: { serverTimestamp: () => "TS", increment: (n) => ({ inc: n }) } } };
    cargarYRenderizarGrilla = async function() {}; mostrarMensajeAgenda = function() {};
    window.__fin = false;
    (async () => { await abrirNotasTurnoGrilla(${JSON.stringify(turnoId)}); ${accion || ""} })().then(() => { window.__fin = true; }, (e) => { window.__err = String(e); window.__fin = true; });
  `;
  const html = `<!DOCTYPE html><html><body>
    <div id="overlay-notas-turno-grilla" style="display:none;"></div><div id="lista-notas-turno-grilla"></div>
    <button id="boton-abrir-nueva-nota-grilla" style="display:inline-block;"></button>
    <div id="contenedor-nueva-nota-grilla" style="display:none;"><textarea id="campo-nueva-nota-grilla"></textarea></div>
    <script>window.ROLES = { administrador: "Administrador", enfermeria: "Enfermería", medico: "Médico" };</script>
    <script>${srcMotor}</script><script>${srcCarga}</script><script>${srcGrilla}</script>
    <script>${setup}</script></body></html>`;
  // Las notas del mock se inyectan ANTES de ejecutar los scripts: abrirNotasTurnoGrilla las lee sincrónicamente.
  const dom = new JSDOM(html, { runScripts: "dangerously", beforeParse(window) { window.__NOTAS = NOTAS; } });
  for (let i = 0; i < 200 && !dom.window.__fin; i++) { await new Promise(r => setTimeout(r, 0)); }
  const d = dom.window.document;
  const fila = (id) => { const f = d.getElementById("fila-nota-" + id); return f ? f.textContent : null; };
  return { w: dom.window, d, ops: dom.window.__ops, err: dom.window.__err,
    botonAgregar: d.getElementById("boton-abrir-nueva-nota-grilla").style.display, fila };
}

(async () => {
  // ===================== médico + internado: puede comentar =====================
  {
    const r = await correr("medico", "tInt");
    assert(!r.err, "[médico, internado] abrir los comentarios no da error" + (r.err ? " (" + r.err + ")" : ""));
    assert(r.botonAgregar !== "none", "[médico, internado] el botón para agregar un comentario está visible");
    assert(r.fila("n1") && r.fila("n1").includes("nota propia") && r.fila("n2") && r.fila("n2").includes("nota ajena"), "[médico, internado] ve todos los comentarios, propios y ajenos");
    assert(/Editar/.test(r.fila("n1")) && /Borrar/.test(r.fila("n1")), "[médico, internado] puede editar y borrar SU comentario");
    assert(!/Editar|Borrar/.test(r.fila("n2")), "[médico, internado] NO puede editar ni borrar el comentario de otro");
  }
  {
    const r = await correr("medico", "tInt", `document.getElementById("campo-nueva-nota-grilla").value = "  seguimiento del médico  "; await guardarNuevaNotaTurnoGrilla();`);
    const nota = r.ops.find(o => o.op === "set"), cont = r.ops.find(o => o.op === "update");
    assert(nota && nota.path.startsWith("turnos/tInt/notas/") && nota.data.texto === "seguimiento del médico" && nota.data.autorRol === "medico" && nota.data.autorUid === "u1",
      "[médico, internado] agregar un comentario lo guarda (texto sin espacios sobrantes, con su autor y rol)");
    assert(cont && cont.path === "turnos/tInt" && cont.data.cantidadNotas && cont.data.cantidadNotas.inc === 1, "[médico, internado] suma 1 al contador de comentarios del turno");
  }
  {
    const r = await correr("medico", "tInt", `iniciarEdicionNotaGrilla("n1"); document.getElementById("campo-editar-nota-n1").value = "nota corregida"; await guardarEdicionNotaGrilla("n1");`);
    const up = r.ops.find(o => o.op === "update");
    assert(up && up.path === "turnos/tInt/notas/n1" && up.data.texto === "nota corregida", "[médico, internado] editar su propio comentario lo guarda");
  }
  {
    const r = await correr("medico", "tInt", `await borrarNotaTurnoGrilla("n1");`);
    const del = r.ops.find(o => o.op === "delete"), cont = r.ops.find(o => o.op === "update");
    assert(del && del.path === "turnos/tInt/notas/n1" && cont && cont.data.cantidadNotas.inc === -1, "[médico, internado] borrar su propio comentario lo elimina y resta 1 al contador");
  }

  // ===================== regresión: nada más cambió =====================
  for (const [rol, turno] of [["medico", "tCom"], ["administrador", "tInt"], ["enfermeria", "tInt"], ["administrador", "tCom"]]) {
    const r = await correr(rol, turno);
    assert(r.botonAgregar !== "none" && /Editar/.test(r.fila("n1")) && !/Editar|Borrar/.test(r.fila("n2")),
      `[regresión] ${rol} en ${turno === "tInt" ? "internado" : "turno común"}: agrega, edita/borra lo propio y no lo ajeno, como siempre`);
  }

  // ===================== ya no queda ninguna traba de solo lectura =====================
  assert(!/notasSoloLecturaGrilla/.test(srcGrilla), "[código] no quedan restos de la restricción de solo lectura (función ni guardas)");

  console.log("\nTODAS LAS PRUEBAS DE COMENTARIOS EN INTERNADOS (MÉDICO) PASARON\n");
})();
