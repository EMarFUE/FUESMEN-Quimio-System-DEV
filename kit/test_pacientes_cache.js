// B1 · Caché único de pacientes (js/pacientes-cache.js). Reemplaza a las copias de entregas, egresos, historial y turnero-carga.
// Decisión de Elías (12/10/2026): el listado vence a los 7 días (antes: por día). Cada PC lo relee completo como mucho una vez por semana.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

function assert(cond, msg) { if (!cond) { throw new Error("FALLA: " + msg); } console.log("OK: " + msg); }
const src = fs.readFileSync(path.join(__dirname, "../repo/js/pacientes-cache.js"), "utf8");

const P = (id, extra) => ({ id, tipoDocumento: "DNI", numeroDocumento: id.replace("DNI", ""), apellido: "Ape" + id, nombre: "Nom" + id, obraSocial: "OSDE", activo: true, ...(extra || {}) });

// Una página con la base simulada. __hoy se puede mover para simular el paso de los días.
async function pagina({ hoy = "2030-10-09", servidor = [], storageRoto = false, falla = false, previo } = {}) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, { url: "http://localhost/medicacion/entregas.html", runScripts: "outside-only",
    beforeParse(window) {
      window.__hoy = hoy;
      const DateReal = window.Date;
      const ahora = () => { const [a, m, d] = window.__hoy.split("-").map(Number); return new DateReal(a, m - 1, d, 10, 0, 0).getTime(); };
      window.Date = class extends DateReal { constructor(...x) { if (x.length === 0) super(ahora()); else super(...x); } static now() { return ahora(); } };
      if (previo) window.localStorage.setItem("cache_pacientes_activos", typeof previo === "string" ? previo : JSON.stringify(previo));
      if (storageRoto) Object.defineProperty(window, "localStorage", { get() { throw new Error("storage bloqueado"); } });
    } });
  const w = dom.window;
  w.__consultas = []; w.__servidor = servidor; w.__falla = falla;
  w.eval(`
    window.db = { collection: function(c) {
      var filtros = [];
      var q = {
        where: function(f, op, v) { filtros.push([f, op, v]); return q; },
        get: async function() {
          window.__consultas.push({ c: c, filtros: filtros.slice() });
          if (window.__falla) throw new Error("falla simulada");
          var docs = window.__servidor.filter(function(d) { return filtros.every(function(x) { return d[x[0]] === x[2]; }); })
            .map(function(d) { return { id: d.id, data: function() { var c2 = Object.assign({}, d); delete c2.id; return c2; } }; });
          return { docs: docs, empty: docs.length === 0, size: docs.length };
        },
        doc: function(id) { return { get: async function() {
          window.__consultas.push({ c: c, doc: id });
          if (window.__falla) throw new Error("falla simulada");
          var d = window.__servidor.find(function(x) { return x.id === id; });
          return { exists: !!d, id: id, data: function() { var c2 = Object.assign({}, d); delete c2.id; return c2; } };
        } }; }
      };
      return q;
    } };
  `);
  w.eval(src);
  return w;
}
const guardado = (w) => JSON.parse(w.localStorage.getItem("cache_pacientes_activos") || "null");
const ids = (l) => (l || []).map((p) => p.id).join(",");

(async () => {
  // ===== 1. Vigencia de 7 días =====
  {
    const w = await pagina();
    assert(w.PacientesCache && w.PacientesCache.DIAS_VIGENCIA === 7, "[constante] el caché vive 7 días");
    assert(w.PacientesCache.leer() === null, "[vacío] sin nada guardado, leer() devuelve null");
    w.PacientesCache.guardar([P("DNI1"), P("DNI2")]);
    assert(ids(w.PacientesCache.leer()) === "DNI1,DNI2", "[mismo día] lo guardado se lee");
    w.__hoy = "2030-10-15"; // día 6
    assert(ids(w.PacientesCache.leer()) === "DNI1,DNI2", "[día 6] sigue vigente");
    w.__hoy = "2030-10-16"; // día 7
    assert(w.PacientesCache.leer() === null, "[día 7] venció");
    w.__hoy = "2030-10-08"; // el reloj de la PC retrocedió
    assert(w.PacientesCache.leer() === null, "[reloj atrasado] un caché 'del futuro' no se usa");
  }
  // ===== 2. Compatibilidad con lo que ya hay guardado en las PCs =====
  {
    const w = await pagina({ previo: { fecha: "2030-10-07", pacientes: [P("DNI1")] } });
    assert(ids(w.PacientesCache.leer()) === "DNI1", "[formato anterior] lo guardado por la versión vieja ({fecha, pacientes}) se sigue leyendo");
    const x = await pagina({ hoy: "2030-10-14", previo: { fecha: "2030-10-07", pacientes: [P("DNI1")] } });
    assert(x.PacientesCache.leer() === null, "[formato anterior] y vence por su fecha (7 días)");
  }
  // ===== 3. Agregar un paciente NO renueva la fecha =====
  {
    const w = await pagina();
    w.PacientesCache.guardar([P("DNI1")]);
    w.__hoy = "2030-10-14"; // día 5
    w.PacientesCache.agregar(P("DNI2"));
    assert(ids(w.PacientesCache.leer()) === "DNI1,DNI2", "[agregar] suma el paciente al caché");
    assert(guardado(w).fecha === "2030-10-09", "[agregar] conserva la fecha original del listado (si no, un alta por día lo haría no vencer nunca)");
    w.__hoy = "2030-10-16";
    assert(w.PacientesCache.leer() === null, "[agregar] el listado igual vence a los 7 días de haberse leído");
  }
  {
    const w = await pagina();
    w.PacientesCache.agregar(P("DNI9"));
    assert(guardado(w) === null && w.PacientesCache.leer() === null, "[agregar sin caché] no inventa un caché de un solo paciente (la versión vieja lo hacía)");
    w.PacientesCache.guardar([P("DNI1")]);
    w.PacientesCache.agregar(P("DNI1"));
    assert(ids(w.PacientesCache.leer()) === "DNI1", "[agregar repetido] no duplica");
  }
  // ===== 4. Quitar, actualizar uno, invalidar =====
  {
    const w = await pagina();
    w.PacientesCache.guardar([P("DNI1"), P("DNI2")]);
    w.__hoy = "2030-10-12";
    w.PacientesCache.actualizarUno(P("DNI2", { obraSocial: "PAMI" }));
    assert(w.PacientesCache.leer().find((p) => p.id === "DNI2").obraSocial === "PAMI" && guardado(w).fecha === "2030-10-09", "[actualizarUno] cambia los datos de ese paciente y conserva la fecha del listado");
    w.PacientesCache.quitar("DNI1");
    assert(ids(w.PacientesCache.leer()) === "DNI2" && guardado(w).fecha === "2030-10-09", "[quitar] saca al paciente dado de baja y conserva la fecha del listado");
    w.PacientesCache.invalidar();
    assert(w.PacientesCache.leer() === null && guardado(w) === null, "[invalidar] borra el caché (para después de editar pacientes)");
  }
  // ===== 5. Robustez =====
  {
    const w = await pagina({ storageRoto: true });
    let roto = false;
    try { w.PacientesCache.guardar([P("DNI1")]); w.PacientesCache.agregar(P("DNI2")); w.PacientesCache.quitar("DNI1"); w.PacientesCache.invalidar(); } catch (e) { roto = true; }
    assert(!roto && w.PacientesCache.leer() === null, "[storage bloqueado] nada lanza error; se sigue sin caché");
  }
  {
    const w = await pagina({ previo: "esto no es json {{{" });
    assert(w.PacientesCache.leer() === null, "[datos corruptos] se descartan");
    const x = await pagina({ previo: { fecha: "2030-10-09", pacientes: "no es una lista" } });
    assert(x.PacientesCache.leer() === null, "[datos raros] si 'pacientes' no es una lista, se descarta");
  }
  // ===== 6. Cargar el listado: del caché o del servidor =====
  {
    const w = await pagina({ servidor: [P("DNI1"), P("DNI2"), P("DNI3", { activo: false })] });
    const a = await w.PacientesCache.cargarListado();
    assert(ids(a) === "DNI1,DNI2" && w.__consultas.length === 1, `[primera vez] lee del servidor solo los ACTIVOS (1 consulta) → ${ids(a)}`);
    assert(w.__consultas[0].filtros.some((f) => f[0] === "activo" && f[2] === true), "[primera vez] la consulta filtra activo == true");
    const b = await w.PacientesCache.cargarListado();
    assert(ids(b) === "DNI1,DNI2" && w.__consultas.length === 1, "[segunda vez] sale del caché: 0 lecturas más");
    w.__hoy = "2030-10-15";
    await w.PacientesCache.cargarListado();
    assert(w.__consultas.length === 1, "[día 6] sigue sin leer");
    w.__hoy = "2030-10-16";
    await w.PacientesCache.cargarListado();
    assert(w.__consultas.length === 2, "[día 7] relee el listado completo (1 vez por semana)");
    assert(guardado(w).fecha === "2030-10-16", "[día 7] y el nuevo listado queda con la fecha de hoy");
  }
  {
    const w = await pagina({ servidor: [P("DNI1")], falla: true });
    let err = null; try { await w.PacientesCache.cargarListado(); } catch (e) { err = e; }
    assert(err && guardado(w) === null, "[servidor falla] el error llega a quien pidió y no queda nada guardado (el próximo intento vuelve a leer)");
  }
  {
    const w = await pagina({ servidor: [P("DNI1"), P("DNI2")] });
    await w.PacientesCache.cargarListado();
    const n = w.__consultas.length;
    const r = await w.PacientesCache.recargarListado();
    assert(w.__consultas.length === n + 1 && ids(r) === "DNI1,DNI2", "[recargarListado] ('actualizar listado') siempre lee del servidor");
  }
  // ===== 7. Buscar por documento en el servidor (alta hecha en otra PC) =====
  {
    const w = await pagina({ servidor: [P("DNI11111111"), P("DNI22222222"), P("DNI33333333", { activo: false })] });
    w.PacientesCache.guardar([P("DNI11111111")]);
    const r = await w.PacientesCache.buscarPorDocumento("22222222");
    const c = w.__consultas[0];
    assert(ids(r) === "DNI22222222" && c.filtros.some((f) => f[0] === "numeroDocumento" && f[2] === "22222222") && c.filtros.some((f) => f[0] === "activo" && f[2] === true), "[por documento] consulta puntual por numeroDocumento y activo");
    assert(ids(w.PacientesCache.leer()) === "DNI11111111,DNI22222222" && guardado(w).fecha === "2030-10-09", "[por documento] lo encontrado se suma al caché sin renovar su fecha");
    const v = await w.PacientesCache.buscarPorDocumento("99999999");
    assert(Array.isArray(v) && v.length === 0, "[por documento] si no existe, devuelve lista vacía");
    const i = await w.PacientesCache.buscarPorDocumento("33333333");
    assert(i.length === 0, "[por documento] un paciente dado de baja no aparece");
  }
  // ===== 8. Verificar al elegir (1 lectura): el caché puede tener hasta 7 días =====
  {
    const w = await pagina({ servidor: [P("DNI1"), P("DNI2", { obraSocial: "PAMI" }), P("DNI3", { activo: false })] });
    w.PacientesCache.guardar([P("DNI1"), P("DNI2"), P("DNI3"), P("DNI4")]);
    let r = await w.PacientesCache.verificar(P("DNI1"));
    assert(r.estado === "igual" && w.__consultas.length === 1 && w.__consultas[0].doc === "DNI1", "[verificar · igual] 1 lectura puntual del paciente elegido; sin cambios");
    r = await w.PacientesCache.verificar(P("DNI2"));
    assert(r.estado === "actualizado" && r.paciente.obraSocial === "PAMI" && w.PacientesCache.leer().find((p) => p.id === "DNI2").obraSocial === "PAMI", "[verificar · actualizado] trae el dato nuevo (obra social) y corrige el caché");
    r = await w.PacientesCache.verificar(P("DNI3"));
    assert(r.estado === "baja" && !w.PacientesCache.leer().some((p) => p.id === "DNI3"), "[verificar · baja] un paciente dado de baja se avisa y sale del caché");
    r = await w.PacientesCache.verificar(P("DNI4"));
    assert(r.estado === "baja" && !w.PacientesCache.leer().some((p) => p.id === "DNI4"), "[verificar · borrado] un paciente que ya no existe también");
    assert(guardado(w).fecha === "2030-10-09", "[verificar] no renueva la fecha del listado");
    w.__falla = true;
    r = await w.PacientesCache.verificar(P("DNI1"));
    assert(r.estado === "error" && w.PacientesCache.leer().some((p) => p.id === "DNI1"), "[verificar · sin conexión] no bloquea: devuelve 'error' y deja todo como estaba");
  }
  console.log("\nTODAS LAS PRUEBAS DEL CACHÉ DE PACIENTES PASARON\n");
})().catch((e) => { console.error(e); process.exit(1); });
