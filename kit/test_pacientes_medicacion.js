// B1 · Las pantallas de medicación (entregas, egresos, historial) usan el caché único de pacientes (vence a los 7 días), y
// pacientes.js lo invalida cuando se edita, crea o activa/desactiva un paciente. Solo se cambiaron las tres funciones de caché de cada
// pantalla: el resto de entregas/egresos/historial no se tocó.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

function assert(cond, msg) { if (!cond) { throw new Error("FALLA: " + msg); } console.log("OK: " + msg); }
const REPO = path.join(__dirname, "../repo");
const leer = (p) => fs.readFileSync(path.join(REPO, p), "utf8");

const P = (doc, ape) => ({ id: "DNI-" + doc, tipoDocumento: "DNI", numeroDocumento: doc, apellido: ape, nombre: "Nom", obraSocial: "OSDE", activo: true });
const SERVIDOR = [P("11111111", "Uno"), P("22222222", "Dos")];

async function cargar(scripts, { hoy = "2030-10-09", dom = "", storageRoto = false } = {}) {
  const d = new JSDOM(`<!DOCTYPE html><html><body>${dom}</body></html>`, { url: "http://localhost/medicacion/entregas.html", runScripts: "outside-only",
    beforeParse(window) {
      window.__hoy = hoy;
      const DateReal = window.Date;
      const ahora = () => { const [a, m, dd] = window.__hoy.split("-").map(Number); return new DateReal(a, m - 1, dd, 10, 0, 0).getTime(); };
      window.Date = class extends DateReal { constructor(...x) { if (x.length === 0) super(ahora()); else super(...x); } static now() { return ahora(); } };
      window.scrollTo = () => {}; window.alert = () => {};
      if (storageRoto) Object.defineProperty(window, "localStorage", { get() { throw new Error("storage bloqueado"); } });
    } });
  const w = d.window;
  w.__listados = 0; w.__ops = [];
  w.eval(`
    window.db = { collection: function(c) { var filtros = [];
      var q = { where: function(f, op, v) { filtros.push([f, v]); return q; }, orderBy: function() { return q; },
        get: async function() { if (c === "pacientes") window.__listados++;
          var docs = (c === "pacientes" ? window.__SERVIDOR : []).filter(function(x) { return filtros.every(function(f) { return x[f[0]] === f[1]; }); })
            .map(function(x) { return { id: x.id, data: function() { var y = Object.assign({}, x); delete y.id; return y; } }; });
          return { docs: docs, empty: docs.length === 0, size: docs.length }; },
        doc: function(id) { return { update: async function(x) { window.__ops.push(["update", c, id, x]); }, set: async function(x) { window.__ops.push(["set", c, id, x]); },
          get: async function() { return { exists: false }; } }; } };
      return q; } };
    window.firebase = { firestore: { FieldValue: { serverTimestamp: function() { return "TS"; } } } };
  `);
  w.__SERVIDOR = JSON.parse(JSON.stringify(SERVIDOR));
  for (const s of scripts) w.eval(leer(s).replace(/^const /gm, "var ").replace(/^let /gm, "var "));
  return w;
}
const ids = (l) => (l || []).map((p) => p.id).join(",");

(async () => {
  const PANTALLAS = [
    { nombre: "entregas", js: "js/entregas.js", cargar: "cargarPacientesEntregas", lista: "pacientesCacheEntregas" },
    { nombre: "egresos", js: "js/egresos.js", cargar: "cargarPacientesEgresos", lista: "pacientesCacheEgresos" }
  ];
  for (const pant of PANTALLAS) {
    const w = await cargar(["js/pacientes-cache.js", pant.js]);
    await w.eval(`${pant.cargar}()`);
    assert(w.__listados === 1 && ids(w.eval(pant.lista)) === "DNI-11111111,DNI-22222222", `[${pant.nombre}] la primera vez lee el listado del servidor (1 lectura)`);
    await w.eval(`${pant.cargar}()`);
    assert(w.__listados === 1, `[${pant.nombre}] al volver a abrir la pantalla, sale del caché`);
    w.__hoy = "2030-10-15";
    await w.eval(`${pant.cargar}()`);
    assert(w.__listados === 1, `[${pant.nombre}] seis días después sigue sin leer (antes se leía todos los días)`);
    w.__hoy = "2030-10-16";
    await w.eval(`${pant.cargar}()`);
    assert(w.__listados === 2, `[${pant.nombre}] a los 7 días vuelve a leer el listado`);
    w.eval(`agregarPacienteACache(${JSON.stringify(P("33333333", "Tres"))})`);
    assert(ids(w.PacientesCache.leer()).endsWith("DNI-33333333") && JSON.parse(w.localStorage.getItem("cache_pacientes_activos")).fecha === "2030-10-16", `[${pant.nombre}] un alta suelta se suma al caché sin renovar su fecha`);
  }
  {
    // historial: el listado se pide recién al usar el filtro por paciente
    const dom = `<input id="campo-buscar-paciente-historial" />`;
    const w = await cargar(["js/pacientes-cache.js", "js/historial.js"], { dom });
    await w.eval("cargarPacientesHistorialSiHaceFalta()");
    assert(w.__listados === 1 && ids(w.eval("pacientesCacheHistorial")) === "DNI-11111111,DNI-22222222", "[historial] la primera vez lee el listado del servidor (1 lectura)");
    w.eval("pacientesCacheHistorial = null;");
    await w.eval("cargarPacientesHistorialSiHaceFalta()");
    assert(w.__listados === 1, "[historial] al volver a abrir el filtro por paciente, sale del caché");
    w.eval(`agregarPacienteACache(${JSON.stringify(P("33333333", "Tres"))})`);
    assert(ids(w.PacientesCache.leer()).endsWith("DNI-33333333"), "[historial] un alta suelta se suma al caché");
    const w2 = await cargar(["js/pacientes-cache.js", "js/historial.js"], { dom });
    w2.PacientesCache.guardar([P("11111111", "Uno")]);
    w2.__hoy = "2030-10-12";
    await w2.eval("cargarPacientesHistorialSiHaceFalta()");
    assert(w2.__listados === 0 && ids(w2.eval("pacientesCacheHistorial")) === "DNI-11111111", "[historial] con un caché de 3 días no lee nada");
  }
  {
    // Compatibilidad: un caché guardado por la versión vieja (formato {fecha, pacientes}) se sigue usando.
    const w = await cargar(["js/pacientes-cache.js", "js/entregas.js"]);
    w.localStorage.setItem("cache_pacientes_activos", JSON.stringify({ fecha: "2030-10-07", pacientes: [P("11111111", "Uno")] }));
    await w.eval("cargarPacientesEntregas()");
    assert(w.__listados === 0, "[compatibilidad] lo que ya estaba guardado en la PC (de hace 2 días) se aprovecha");
  }
  {
    // Si por error no se sube pacientes-cache.js, la pantalla sigue funcionando (sin caché) y no lanza errores.
    const w = await cargar(["js/entregas.js"]);
    await w.eval("cargarPacientesEntregas()");
    assert(w.__listados === 1 && ids(w.eval("pacientesCacheEntregas")) === "DNI-11111111,DNI-22222222", "[sin pacientes-cache.js] entregas sigue funcionando: lee el listado (sin caché)");
    let roto = false; try { w.eval(`agregarPacienteACache(${JSON.stringify(P("33333333", "Tres"))}); guardarCachePacientes([]); leerCachePacientes();`); } catch (e) { roto = true; }
    assert(!roto, "[sin pacientes-cache.js] las funciones de caché no lanzan errores");
  }
  {
    const w = await cargar(["js/pacientes-cache.js", "js/entregas.js"], { storageRoto: true });
    await w.eval("cargarPacientesEntregas()");
    assert(w.__listados === 1, "[storage bloqueado] entregas funciona igual, leyendo el listado");
  }
  // ===== pacientes.js: invalida el caché al cambiar un paciente =====
  const DOM_PAC = `<form id="form-paciente"><select id="campo-tipo-documento"><option value="DNI">DNI</option></select><input id="campo-numero-documento" value="12345678"/><input id="campo-nombre" value="ana"/>
    <input id="campo-apellido" value="gil"/><select id="campo-obra-social"><option value="OSDE">OSDE</option></select><input id="campo-otra-obra-social" value=""/>
    <button id="boton-guardar"></button><button id="boton-cancelar-edicion"></button><h2 id="titulo-formulario"></h2></form><div id="mensaje-form"></div>
    <input id="campo-busqueda" value=""/><table><tbody id="cuerpo-tabla-pacientes"></tbody></table>`;
  {
    const w = await cargar(["js/pacientes-cache.js", "js/pacientes.js"], { dom: DOM_PAC });
    w.eval("rolActual = 'administrador'; renderizarListado = function() {};");
    w.PacientesCache.guardar([P("11111111", "Uno")]);
    await w.eval(`cambiarEstadoPaciente("DNI-11111111", false)`);
    assert(w.__ops.some((o) => o[0] === "update" && o[3].activo === false) && w.PacientesCache.leer() === null, "[pacientes.js] al activar/desactivar un paciente se invalida el caché de esta PC");
    w.PacientesCache.guardar([P("11111111", "Uno")]);
    w.eval(`pacientesCache = [${JSON.stringify(P("12345678", "Gil"))}]; idEnEdicion = "DNI-12345678";`);
    await w.eval("guardarPaciente()");
    assert(w.__ops.some((o) => o[0] === "update" && o[1] === "pacientes") && w.PacientesCache.leer() === null, "[pacientes.js] al editar un paciente se invalida el caché");
    w.PacientesCache.guardar([P("11111111", "Uno")]);
    w.eval(`idEnEdicion = null;`);
    w.document.getElementById("campo-numero-documento").value = "87654321";
    await w.eval("guardarPaciente()");
    assert(w.__ops.some((o) => o[0] === "set" && o[1] === "pacientes") && w.PacientesCache.leer() === null, "[pacientes.js] al crear un paciente se invalida el caché");
    w.PacientesCache.guardar([P("11111111", "Uno")]);
    w.document.getElementById("campo-numero-documento").value = "12";
    await w.eval("guardarPaciente()");
    assert(w.PacientesCache.leer() !== null, "[pacientes.js] si la validación rechaza el guardado (documento inválido), el caché no se toca");
  }
  // ===== Las páginas cargan el archivo nuevo =====
  for (const h of ["medicacion/entregas.html", "medicacion/egresos.html", "medicacion/historial.html", "medicacion/pacientes.html", "turnero/agenda.html", "turnero/carga.html"]) {
    const src = leer(h);
    const iCache = src.indexOf("pacientes-cache.js");
    const iMain = Math.min(...["entregas.js", "egresos.js", "historial.js", "pacientes.js", "turnero-carga.js"].map((n) => src.indexOf("/" + n)).filter((i) => i >= 0));
    assert(iCache > 0 && iCache < iMain, `[páginas] ${h} carga pacientes-cache.js antes que su script principal`);
  }
  console.log("\nTODAS LAS PRUEBAS DE PACIENTES EN MEDICACIÓN PASARON\n");
})().catch((e) => { console.error(e); process.exit(1); });
