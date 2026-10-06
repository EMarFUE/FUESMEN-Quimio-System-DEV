// carga.html como página propia (acceso alternativo, solo administrador): se carga entera con sus scripts reales y su
// arranque real (iniciarCargaTurno), sobre una base simulada, y se carga un turno con clics reales.
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

function assert(cond, msg) { if (!cond) { throw new Error("FALLA: " + msg); } console.log("OK: " + msg); }
const REPO = process.env.REPO_DIR || path.join(__dirname, "../repo");
const leer = (p) => fs.readFileSync(path.join(REPO, p), "utf8");
const SCRIPTS = ["js/turnero-motor.js", "js/turnero-formulario.js", "js/turnero-carga.js"].map(leer);

const SEDES = [{ id: "entre-rios", nombre: "Entre Ríos", horaApertura: "09:00", horaCierre: "13:00", diasAtencion: ["lunes", "martes", "miercoles", "jueves", "viernes"],
  usaAtaduraDia: false, usaCuposPorcentaje: false, sillones: [{ numero: 1, tipo: "regular" }, { numero: 2, tipo: "regular" }] }];
const MEDICOS = [{ id: "med2", nombre: "Dra. Ruiz", diasPorSede: { "Entre Ríos": ["martes", "miercoles", "jueves"] } }];
const STORE = { turneroSedes: SEDES, turneroMedicos: MEDICOS, turneroCupos: [], turneroBloqueos: [], turnos: [],
  pacientes: [{ id: "PX", activo: true, nombre: "Luz", apellido: "Paz", obraSocial: "OSDE", tipoDocumento: "DNI", numeroDocumento: "30111222" }],
  turneroProtocolos: [{ id: "p1", nombre: "FEC", duracionMinutos: 60 }] };

async function abrir(rol, repoDir) {
  const errores = [];
  const vc = new VirtualConsole(); vc.on("jsdomError", (e) => errores.push(String(e.message || e)));
  const stubs = `
    window.ROLES = { administrador: "Administrador", enfermeria: "Enfermería", medico: "Médico", administrativo: "Administrativo" };
    window.escaparHtml = function(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); };
    window.cerrarSesion = function() {};
    window.__ops = []; var STORE = window.__STORE;
    function cmp(a, op, b) { if (op === "==") return a === b; if (op === ">=") return a >= b; if (op === "<=") return a <= b; return true; }
    function consulta(nombre, filtros) { return { where: function(f, op, v) { return consulta(nombre, filtros.concat([[f, op, v]])); }, orderBy: function() { return this; },
      get: async function() { var docs = (STORE[nombre] || []).filter(function(d) { return filtros.every(function(x) { return cmp(d[x[0]], x[1], x[2]); }); })
        .map(function(d) { return { id: d.id, data: function() { var c = Object.assign({}, d); delete c.id; return c; } }; }); return { docs: docs, empty: docs.length === 0, size: docs.length }; } }; }
    function docRef(nombre, id) { var ref = { __path: nombre + "/" + id, id: id, get: async function() { return { exists: false, id: id, data: function() { return {}; } }; },
      update: async function(x) { window.__ops.push({ op: "update", path: ref.__path, data: x }); }, set: async function(x) { window.__ops.push({ op: "set", path: ref.__path, data: x }); } }; return ref; }
    window.db = { collection: function(nombre) { var q = consulta(nombre, []); q.doc = function(id) { return docRef(nombre, id || "auto"); }; return q; },
      batch: function() { return { set: function(r, d) { window.__ops.push({ op: "set", path: r.__path, data: d }); }, update: function(r, d) { window.__ops.push({ op: "update", path: r.__path, data: d }); },
        delete: function() {}, commit: async function() {} }; } };
    window.firebase = { firestore: { FieldValue: { serverTimestamp: function() { return "TS"; }, increment: function(n) { return { inc: n }; } } } };
    window.requireAuth = function() {};
  `;
  const leerDe = (rel) => (repoDir ? fs.readFileSync(path.join(repoDir, rel), "utf8") : leer(rel));
  const scriptsDe = repoDir ? ["js/turnero-motor.js", "js/turnero-formulario.js", "js/turnero-carga.js"].map(leerDe) : SCRIPTS;
  let html = leerDe("turnero/carga.html").replace(/<script src="[^"]*"><\/script>/g, "");
  html = html.replace(/<script>\s*montarFormularioCarga[\s\S]*?<\/script>/, "");
  html = html.replace("</body>", `<script>${stubs}</script>` + scriptsDe.map((s) => `<script>${s}</script>`).join("") +
    `<script>window.__listo = false; (async () => { try { montarFormularioCarga("formulario-carga"); document.getElementById("contenido-carga").style.display = "block";
      await iniciarCargaTurno({ uid: "u" }, ${JSON.stringify({ rol, nombre: "Yo" })}); } catch (e) { window.__errInit = String(e && e.stack || e); } window.__listo = true; })();</script></body>`);
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/turnero/carga.html",
    beforeParse(window) {
      window.__STORE = STORE;
      const DateReal = window.Date; const ahora = new DateReal(2030, 9, 9, 10, 32, 0).getTime();
      window.Date = class extends DateReal { constructor(...a) { if (a.length === 0) super(ahora); else super(...a); } static now() { return ahora; } };
      window.scrollTo = () => {};
    } });
  const w = dom.window;
  for (let i = 0; i < 400 && !w.__listo; i++) { await new Promise((r) => setTimeout(r, 0)); }
  await new Promise((r) => setTimeout(r, 30));
  return { w, d: w.document, errores, errInit: w.__errInit, ops: w.__ops };
}
const esperar = async (cond, n = 300) => { for (let i = 0; i < n && !cond(); i++) { await new Promise((r) => setTimeout(r, 0)); } };

async function principal() {
  const a = await abrir("administrador");
  const $ = (id) => a.d.getElementById(id);
  assert(!a.errInit && a.errores.length === 0, "[carga.html] la página arranca (montaje + iniciarCargaTurno) sin excepciones ni errores" + (a.errInit ? " → " + a.errInit.split("\n")[0] : (a.errores[0] ? " → " + a.errores[0].slice(0, 140) : "")));
  assert(a.d.querySelectorAll(".seccion-carga").length === 4 && $("contenido-carga").style.display === "block", "[carga.html] muestra el formulario en sus 4 secciones");
  await esperar(() => !$("campo-buscar-paciente").disabled, 400); // el listado de pacientes se lee en segundo plano
  assert([...$("campo-medico").options].map((o) => o.value).join(",") === ",med2,otro" && a.d.querySelectorAll("#lista-protocolos .fila-medicamento").length === 1 && !$("campo-buscar-paciente").disabled,
    "[carga.html] el arranque llenó los médicos, dejó una fila de protocolo y habilitó el buscador de pacientes");
  assert($("bloque-horario-manual").style.display === "block" && $("bloque-internado").style.display === "block", "[carga.html] el administrador ve Horario e Internado");
  const ev = (el, tipo) => el.dispatchEvent(new a.w.Event(tipo, { bubbles: true }));
  $("campo-buscar-paciente").value = "Paz"; ev($("campo-buscar-paciente"), "input");
  a.d.querySelector("#resultados-busqueda-paciente .resultado-busqueda button").click();
  $("campo-medico").value = "med2"; ev($("campo-medico"), "change");
  const inp = a.d.querySelector("#lista-protocolos .inp-buscar-protocolo"); inp.value = "FEC"; ev(inp, "input");
  a.d.querySelector("#lista-protocolos .resultado-busqueda button").click();
  $("campo-ciclo").value = "1"; ev($("campo-ciclo"), "input"); $("campo-sesion").value = "1"; ev($("campo-sesion"), "input");
  a.d.querySelector('#bloque-dias-turno button[onclick="usarTurnoHoy()"]').click();
  a.d.querySelector('input[name="horario-carga"][value="exacto"]').click();
  $("campo-horario-manual").value = "12:00"; ev($("campo-horario-manual"), "input");
  await esperar(() => false, 5);
  assert(/Paz, Luz/.test($("resumen-carga-texto").textContent) && /a las 12:00/.test($("resumen-carga-texto").textContent), "[carga.html] el resumen del pie refleja lo completado: " + $("resumen-carga-texto").textContent);
  $("boton-guardar-turno").click();
  await esperar(() => a.ops.some((o) => o.op === "set" && /^turnos\//.test(o.path)), 600);
  const doc = (a.ops.find((o) => o.op === "set" && /^turnos\//.test(o.path)) || {}).data;
  assert(!!doc && doc.horarioInicio === "12:00" && doc.horarioManual === true && doc.sedeId === "entre-rios" && doc.fecha === "2030-10-09" && doc.paciente.id === "PX" && doc.estado === "activo",
    "[carga.html] guarda el turno con hora exacta 12:00 en Entre Ríos, con la marca de horario manual" + (doc ? "" : " → " + $("mensaje-general").textContent.slice(0, 140)));
  await esperar(() => $("campo-ciclo").value === "", 400);
  assert($("campo-ciclo").value === "" && a.d.querySelector('input[name="horario-carga"]:checked').value === "automatico", "[carga.html] después de guardar, el formulario vuelve a su estado inicial (listo para el próximo turno)");

  const noAdmin = await abrir("enfermeria");
  assert(noAdmin.d.getElementById("bloque-horario-manual").style.display === "block" && noAdmin.d.getElementById("bloque-prioridad-turno").style.display === "none", "[carga.html] con rol enfermería: ve Horario, no ve Prioridad (reglas por rol intactas)");
  console.log("\nTODAS LAS PRUEBAS DE CARGA.HTML PASARON\n");
}

module.exports = { abrir, esperar };
if (require.main === module) principal();
