// B1 · Buscador único de pacientes (js/pacientes-buscador.js): un componente que se "monta" sobre los ids de la pantalla.
// Reemplaza las tres copias de buscarPaciente / seleccionarPaciente / actualizarListadoPacientes / búsqueda por documento.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

function assert(cond, msg) { if (!cond) { throw new Error("FALLA: " + msg); } console.log("OK: " + msg); }
const srcCache = fs.readFileSync(path.join(__dirname, "../repo/js/pacientes-cache.js"), "utf8");
const srcBuscador = fs.readFileSync(path.join(__dirname, "../repo/js/pacientes-buscador.js"), "utf8");

const P = (doc, ape, nom, extra) => ({ id: "DNI" + doc, tipoDocumento: "DNI", numeroDocumento: doc, apellido: ape, nombre: nom, obraSocial: "OSDE", activo: true, ...(extra || {}) });
const BASE = [P("11111111", "Pérez", "Juan"), P("22222222", "Gómez", "María José"), P("33333333", "Núñez", "Ana"), P("44444444", "Perez", "Luis")];

async function pagina({ servidor = BASE, ids = {}, cfg = {}, falla = false, lista } = {}) {
  const idsF = { campo: "campo-buscar-paciente", resultados: "resultados-busqueda-paciente", sinResultados: "sin-resultados", bloqueAlta: "bloque-alta-rapida", botonActualizar: "boton-actualizar-pacientes", ...ids };
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <input id="${idsF.campo}" /><div id="${idsF.resultados}"></div><div id="${idsF.sinResultados}" style="display:none">sin resultados</div>
    <div id="${idsF.bloqueAlta}" style="display:block"></div><button id="${idsF.botonActualizar}">actualizar listado</button></body></html>`,
    { url: "http://localhost/turnero/agenda.html", runScripts: "outside-only" });
  const w = dom.window;
  w.__consultas = []; w.__servidor = servidor; w.__falla = falla; w.__selecciones = []; w.__verificaciones = [];
  w.eval(`
    window.db = { collection: function(c) {
      var filtros = [];
      var q = { where: function(f, op, v) { filtros.push([f, v]); return q; },
        get: async function() { window.__consultas.push({ c: c, filtros: filtros.slice() });
          if (window.__falla) throw new Error("falla simulada");
          if (window.__demora) await new Promise(function(r) { setTimeout(r, window.__demora); });
          var docs = window.__servidor.filter(function(d) { return filtros.every(function(x) { return d[x[0]] === x[1]; }); })
            .map(function(d) { return { id: d.id, data: function() { var c2 = Object.assign({}, d); delete c2.id; return c2; } }; });
          return { docs: docs, empty: docs.length === 0, size: docs.length }; },
        doc: function(id) { return { get: async function() { window.__consultas.push({ c: c, doc: id });
          var d = window.__servidor.find(function(x) { return x.id === id; });
          return { exists: !!d, id: id, data: function() { var c2 = Object.assign({}, d); delete c2.id; return c2; } }; } }; } };
      return q; } };
  `);
  w.eval(srcCache); w.eval(srcBuscador);
  let almacen = lista ? lista.slice() : []; // copia: ningún test contamina a otro
  const b = w.PacientesBuscador.montar({
    ids: idsF, demoraDocumentoMs: 10,
    obtenerLista: () => almacen, fijarLista: (l) => { almacen = l; },
    onSeleccion: (p) => w.__selecciones.push(p), onVerificacion: (r) => w.__verificaciones.push(r), ...cfg });
  return { w, d: w.document, b, ids: idsF, lista: () => almacen };
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const escribir = (p, t) => { p.d.getElementById(p.ids.campo).value = t; p.b.buscar(t); };
const textos = (p) => Array.from(p.d.querySelectorAll(`#${p.ids.resultados} .resultado-busqueda span`)).map((e) => e.textContent);
const visible = (p, id) => p.d.getElementById(id).style.display !== "none";

(async () => {
  // ===== 1. Cargar el listado =====
  {
    const p = await pagina();
    await p.b.cargar();
    assert(p.lista().length === 4 && p.w.__consultas.length === 1, "[cargar] la primera vez lee el listado del servidor (1 consulta) y lo deja en la pantalla");
    const q = await pagina({ servidor: BASE });
    q.w.PacientesCache.guardar([BASE[0]]);
    await q.b.cargar();
    assert(q.lista().length === 1 && q.w.__consultas.length === 0, "[cargar] con caché vigente no consulta el servidor");
  }
  // ===== 2. Búsqueda =====
  {
    const p = await pagina({ lista: BASE });
    escribir(p, "gomez");
    assert(textos(p).length === 1 && /Gómez, María José/.test(textos(p)[0]), "[buscar] por apellido, sin importar tildes ni mayúsculas");
    escribir(p, "maria jose");
    assert(textos(p).length === 1, "[buscar] por nombre");
    escribir(p, "jose gomez");
    assert(textos(p).length === 1 && /Gómez/.test(textos(p)[0]), "[buscar] palabras sueltas en cualquier orden ('jose gomez' encuentra 'Gómez, María José')");
    escribir(p, "juan perez");
    assert(textos(p).length === 1 && /Pérez, Juan/.test(textos(p)[0]), "[buscar] 'juan perez' encuentra a Pérez, Juan (y no a Perez, Luis)");
    escribir(p, "perez");
    assert(textos(p).length === 2, "[buscar] 'perez' encuentra a los dos Pérez/Perez");
    escribir(p, "3333");
    assert(textos(p).length === 1 && /33333333/.test(textos(p)[0]), "[buscar] por parte del documento");
    escribir(p, "zzz");
    assert(textos(p).length === 0 && visible(p, p.ids.sinResultados), "[buscar] sin coincidencias: muestra 'sin resultados'");
    escribir(p, "   ");
    assert(textos(p).length === 0 && !visible(p, p.ids.sinResultados), "[buscar] texto vacío: limpia los resultados y esconde el 'sin resultados' que hubiera");
    assert(!visible(p, p.ids.bloqueAlta), "[buscar] cada búsqueda oculta el bloque de alta rápida (como siempre)");
  }
  {
    const muchos = Array.from({ length: 30 }, (_, i) => P(String(50000000 + i), "Lopez", "Nombre" + i));
    const p = await pagina({ lista: muchos });
    escribir(p, "lopez");
    assert(textos(p).length === 8, `[buscar] muestra como mucho 8 resultados (${textos(p).length})`);
  }
  {
    const p = await pagina({ lista: [P("55555555", "<img src=x onerror=alert(1)>", "Ana")] });
    escribir(p, "img");
    assert(p.d.querySelectorAll(`#${p.ids.resultados} img`).length === 0 && /<img/.test(textos(p)[0]), "[seguridad] el apellido se muestra como texto, no como HTML");
  }
  {
    const p = await pagina({ lista: [{ id: "DNIx", apellido: "Sin", nombre: "Documento", activo: true }] });
    let roto = false; try { escribir(p, "sin"); escribir(p, "123"); } catch (e) { roto = true; }
    assert(!roto, "[buscar] un paciente sin número de documento no rompe la búsqueda");
  }
  // ===== 3. Elegir =====
  {
    const p = await pagina({ lista: BASE });
    escribir(p, "gomez");
    p.d.querySelector(`#${p.ids.resultados} button`).click();
    assert(p.w.__selecciones.length === 1 && p.w.__selecciones[0].id === "DNI22222222", "[elegir] el botón 'usar' avisa a la pantalla qué paciente se eligió");
    assert(p.d.getElementById(p.ids.campo).value === "" && textos(p).length === 0 && !visible(p, p.ids.sinResultados) && !visible(p, p.ids.bloqueAlta), "[elegir] limpia el campo y los resultados");
    p.b.seleccionar("no-existe");
    assert(p.w.__selecciones.length === 1, "[elegir] un id inexistente no hace nada");
  }
  {
    const p = await pagina({ lista: BASE });
    p.w.PacientesCache.guardar(BASE);
    p.b.seleccionar("DNI11111111");
    await esperar(20);
    assert(p.w.__verificaciones.length === 1 && p.w.__verificaciones[0].estado === "igual" && p.w.__consultas.filter((c) => c.doc).length === 1, "[elegir] verifica al paciente elegido con UNA lectura puntual y avisa el resultado");
    p.w.__servidor = BASE.map((x) => (x.id === "DNI22222222" ? { ...x, obraSocial: "PAMI" } : x));
    p.b.seleccionar("DNI22222222");
    await esperar(20);
    const ult = p.w.__verificaciones[p.w.__verificaciones.length - 1];
    assert(ult.estado === "actualizado" && ult.paciente.obraSocial === "PAMI", "[elegir] si en el servidor cambió un dato (obra social), la pantalla se entera");
    p.w.__servidor = BASE.filter((x) => x.id !== "DNI33333333");
    p.b.seleccionar("DNI33333333");
    await esperar(20);
    assert(p.w.__verificaciones[p.w.__verificaciones.length - 1].estado === "baja", "[elegir] si el paciente ya no existe o fue dado de baja, la pantalla se entera");
  }
  {
    let noManejado = false; const h = () => { noManejado = true; }; process.on("unhandledRejection", h);
    const p = await pagina({ lista: BASE, cfg: { onVerificacion: () => { throw new Error("error de la pantalla"); } } });
    const antes = console.error; let avisos = 0; console.error = () => { avisos++; };
    p.b.seleccionar("DNI11111111");
    await esperar(60);
    console.error = antes; process.off("unhandledRejection", h);
    assert(!noManejado && avisos >= 1, "[elegir] si la pantalla falla al aplicar la verificación, queda registrado y no se corta nada");
  }
  {
    const p = await pagina({ lista: BASE, cfg: { verificarAlElegir: false } });
    p.b.seleccionar("DNI11111111");
    await esperar(20);
    assert(p.w.__consultas.length === 0 && p.w.__verificaciones.length === 0, "[elegir] verificarAlElegir:false (para pantallas que todavía no lo manejan) no hace ninguna lectura");
  }
  // ===== 4. Documento completo que no está en el listado (alta hecha hoy en otra PC) =====
  {
    const nuevo = P("66666666", "Recién", "Llegado");
    const p = await pagina({ lista: BASE, servidor: [...BASE, nuevo] });
    p.w.PacientesCache.guardar(BASE);
    escribir(p, "66666666");
    assert(textos(p).length === 0 && visible(p, p.ids.sinResultados), "[documento] al principio no está en el listado");
    await esperar(80);
    const c = p.w.__consultas.filter((x) => x.filtros);
    assert(c.length === 1 && c[0].filtros.some((f) => f[0] === "numeroDocumento" && f[1] === "66666666"), "[documento] consulta puntual al servidor por ese documento (no trae todo el listado)");
    assert(p.lista().some((x) => x.id === nuevo.id) && textos(p).length === 1 && p.w.PacientesCache.leer().some((x) => x.id === nuevo.id), "[documento] lo encuentra, lo suma al listado y al caché, y la pantalla lo muestra");
  }
  {
    const p = await pagina({ lista: BASE });
    escribir(p, "1234567"); escribir(p, "12345678"); escribir(p, "123456789");
    await esperar(80);
    assert(p.w.__consultas.length === 1, `[documento] varias teclas seguidas = UNA sola consulta (${p.w.__consultas.length})`);
    const m = await pagina({ lista: BASE });
    escribir(m, "12345678"); escribir(m, "12345678"); escribir(m, "12345678");
    await esperar(80);
    assert(m.w.__consultas.length === 1, `[documento] el mismo texto buscado varias veces seguidas = UNA sola consulta (${m.w.__consultas.length})`);
    const q1 = await pagina({ lista: BASE });
    escribir(q1, "123456");
    await esperar(80);
    assert(q1.w.__consultas.length === 0, "[documento] 6 dígitos: todavía no es un documento, no consulta");
    const q2 = await pagina({ lista: BASE });
    escribir(q2, "1234567890");
    await esperar(80);
    assert(q2.w.__consultas.length === 0, "[documento] 10 dígitos: no es un documento, no consulta");
    const q3 = await pagina({ lista: BASE });
    escribir(q3, "1234567"); escribir(q3, "1234567");
    await esperar(80);
    assert(q3.w.__consultas.length === 1, "[documento] 7 dígitos ya consulta");
    const r = await pagina({ lista: BASE });
    escribir(r, "12345678"); r.d.getElementById(r.ids.campo).value = "otra cosa"; // el texto cambia sin que se vuelva a buscar
    await esperar(80);
    assert(r.w.__consultas.length === 0, "[documento] si el texto cambió antes de la pausa, la consulta vieja no se hace");
  }
  {
    const p = await pagina({ lista: BASE, falla: true });
    escribir(p, "12345678");
    await esperar(80);
    assert(visible(p, p.ids.sinResultados), "[documento] si la consulta falla, no rompe nada: queda 'sin resultados'");
  }
  // ===== 5. Actualizar listado =====
  {
    const p = await pagina({ lista: [BASE[0]] });
    p.w.__demora = 30;
    const bt = p.d.getElementById(p.ids.botonActualizar);
    const prom = p.b.actualizarListado();
    assert(bt.disabled && /actualizando/.test(bt.textContent), "[actualizar] mientras lee, el botón dice 'actualizando...' y no se puede apretar de nuevo");
    await prom;
    assert(p.lista().length === 4 && !bt.disabled && bt.textContent === "actualizar listado", "[actualizar] relee TODO el listado y deja el botón como estaba");
    assert(p.w.PacientesCache.leer().length === 4, "[actualizar] y renueva el caché");
    const q = await pagina({ lista: [BASE[0]] });
    escribir(q, "gomez");
    assert(textos(q).length === 0, "[actualizar] (el listado viejo no tenía a Gómez)");
    await q.b.actualizarListado();
    assert(textos(q).length === 1, "[actualizar] si había algo escrito, vuelve a buscar con el listado nuevo y ahora aparece");
  }
  {
    const p = await pagina({ lista: [BASE[0]], falla: true });
    const bt = p.d.getElementById(p.ids.botonActualizar);
    await p.b.actualizarListado();
    assert(p.lista().length === 1 && !bt.disabled && bt.textContent === "actualizar listado", "[actualizar · falla] conserva el listado que tenía y devuelve el botón");
  }
  // ===== 6. Agregar un paciente recién creado =====
  {
    const p = await pagina({ lista: BASE });
    p.w.PacientesCache.guardar(BASE);
    const nuevo = P("77777777", "Alta", "Rápida");
    p.b.agregar(nuevo); p.b.agregar(nuevo);
    assert(p.lista().filter((x) => x.id === nuevo.id).length === 1 && p.w.PacientesCache.leer().filter((x) => x.id === nuevo.id).length === 1, "[agregar] suma al paciente nuevo una sola vez, en pantalla y en el caché");
  }
  // ===== 7. Se monta con cualquier juego de ids =====
  {
    const p = await pagina({ lista: BASE, ids: { campo: "x-campo", resultados: "x-res", sinResultados: "x-sin", bloqueAlta: "x-alta", botonActualizar: "x-act" } });
    escribir(p, "gomez");
    assert(textos(p).length === 1, "[montaje] funciona con otros ids (pantallas mixtas con prefijo, sin chocar)");
  }
  console.log("\nTODAS LAS PRUEBAS DEL BUSCADOR DE PACIENTES PASARON\n");
})().catch((e) => { console.error(e); process.exit(1); });
