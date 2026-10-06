// (1) Detector de archivos desactualizados — pasó tres veces que el navegador sirviera un archivo viejo junto a otros nuevos y las
//     pruebas "fallaran" sin que el código fuera el problema. Ahora el sistema lo avisa solo.
// (2) Punto 2.3: botón "+ Nuevo turno" en la vista mensual, que abre la agenda con el formulario.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const { abrirAgenda, esperar } = require("./test_agenda_e2e.js");
const { abrir: abrirCargaHtml } = require("./test_carga_html.js");

function assert(cond, msg) { if (!cond) { throw new Error("FALLA: " + msg); } console.log("OK: " + msg); }
const REPO = process.env.REPO_DIR || path.join(__dirname, "../repo");
const leer = (p) => fs.readFileSync(path.join(REPO, p), "utf8");

// Un repo "mezclado": todo lo nuevo, menos turnero-carga.js, que es el de la entrega anterior (sin marca de versión).
function repoConCargaVieja() {
  const dir = fs.mkdtempSync("/tmp/mezcla-");
  for (const sub of ["js", "turnero", "css"]) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  for (const f of fs.readdirSync(path.join(REPO, "js"))) fs.copyFileSync(path.join(REPO, "js", f), path.join(dir, "js", f));
  for (const f of fs.readdirSync(path.join(REPO, "turnero"))) fs.copyFileSync(path.join(REPO, "turnero", f), path.join(dir, "turnero", f));
  fs.copyFileSync(path.join(REPO, "css/styles.css"), path.join(dir, "css/styles.css"));
  const sinMarca = fs.readFileSync(path.join(dir, "js/turnero-carga.js"), "utf8").replace(/^.*TURNERO_BUILD.*\n/m, "");
  fs.writeFileSync(path.join(dir, "js/turnero-carga.js"), sinMarca);
  return dir;
}

async function principal() {
  // ===================== 1. Marcas de versión coherentes =====================
  const marcas = {};
  for (const [nombre, archivo] of [["formulario", "js/turnero-formulario.js"], ["carga", "js/turnero-carga.js"], ["grilla", "js/turnero-grilla.js"], ["mensual", "js/turnero-mensual.js"]]) {
    const m = leer(archivo).match(/TURNERO_BUILD = window\.TURNERO_BUILD \|\| \{\}\)\.(\w+) = "([^"]+)"/);
    marcas[nombre] = m && m[1] === nombre ? m[2] : null;
  }
  const esperada = (leer("js/turnero-formulario.js").match(/const BUILD_ESPERADO_TURNERO = "([^"]+)"/) || [])[1];
  assert(!!esperada && Object.values(marcas).every((v) => v === esperada), `[versión] los cuatro archivos llevan la MISMA marca de versión (${esperada}): ` + JSON.stringify(marcas));
  for (const html of ["turnero/agenda.html", "turnero/carga.html"]) {
    const src = leer(html);
    const todos = [...src.matchAll(/<script src="\.\.\/js\/(turnero-[a-z]+\.js)(\?v=[^"]*)?"/g)];
    assert(todos.length >= 3 && todos.every((m) => m[2] === `?v=${esperada}`) && /styles\.css\?v=/.test(src), `[versión] ${html}: TODOS los scripts de turnero (${todos.length}) y la hoja de estilos llevan ?v=${esperada} (el navegador no puede servir una copia vieja)`);
  }

  // ===================== 2. El aviso =====================
  {
    const a = await abrirAgenda("administrador");
    assert(!a.d.getElementById("aviso-versiones-turnero"), "[versión] con todos los archivos al día, la agenda no muestra ningún aviso");
    assert(a.w.TURNERO_BUILD && a.w.TURNERO_BUILD.carga === esperada && a.w.TURNERO_BUILD.grilla === esperada && a.w.TURNERO_BUILD.formulario === esperada, "[versión] se puede consultar desde la consola: TURNERO_BUILD");
  }
  {
    const dir = repoConCargaVieja();
    const a = await abrirAgenda("administrador", {}, { repoDir: dir });
    const aviso = a.d.getElementById("aviso-versiones-turnero");
    assert(!!aviso && /turnero-carga\.js/.test(aviso.textContent) && /Ctrl\+F5/.test(aviso.textContent) && !/turnero-grilla\.js|turnero-formulario\.js/.test(aviso.textContent),
      "[versión] con un turnero-carga.js viejo mezclado con archivos nuevos, la agenda avisa CUÁL es y qué hacer (Ctrl+F5)");
  }
  {
    const p = await abrirCargaHtml("administrador");
    assert(!p.d.getElementById("aviso-versiones-turnero"), "[versión] carga.html con todo al día: sin aviso");
    const dir = repoConCargaVieja();
    const v = await abrirCargaHtml("administrador", dir);
    const aviso = v.d.getElementById("aviso-versiones-turnero");
    assert(!!aviso && /turnero-carga\.js/.test(aviso.textContent), "[versión] carga.html con un turnero-carga.js viejo: también avisa cuál es");
  }

  // ===================== 3. Punto 2.3: el botón en la vista mensual =====================
  function paginaMensual(rol, { anio, mes, hoy }) {
    const html = `<!DOCTYPE html><html><body><div id="barra-mensual"><button id="boton-actualizar-mensual">Actualizar</button></div>
      <div id="grilla-mensual-contenedor"></div>
      <script>${leer("js/turnero-motor.js")}</script>
      <script>${leer("js/turnero-mensual.js")}</script>
      <script>
        rolActualMensual = ${JSON.stringify(rol)}; sedeSeleccionadaMensual = "entre-rios"; medicoFiltroMensual = "med2";
        anioVisibleMensual = ${anio}; mesVisibleMensual = ${mes};
        window.__nav = []; irAUrlMensual = function(u) { window.__nav.push(u); };
        crearBotonNuevoTurnoMensual();
      </script></body></html>`;
    const dom = new JSDOM(html, {
      runScripts: "dangerously", url: "http://localhost/turnero/agenda-mensual.html",
      beforeParse(window) {
        const DateReal = window.Date; const ahora = new DateReal(...hoy).getTime();
        window.Date = class extends DateReal { constructor(...a) { if (a.length === 0) super(ahora); else super(...a); } static now() { return ahora; } };
      }
    });
    return dom.window;
  }
  {
    const w = paginaMensual("administrador", { anio: 2030, mes: 9, hoy: [2030, 9, 9, 10, 32, 0] }); // octubre 2030 = el mes actual; hoy 9/10
    const b = w.document.getElementById("boton-nuevo-turno-mensual");
    assert(!!b && /\+ Nuevo turno/.test(b.textContent) && b.parentElement.id === "barra-mensual" && b.nextElementSibling.id === "boton-actualizar-mensual", "[mensual] el botón '+ Nuevo turno' aparece en el encabezado, junto a 'Actualizar'");
    w.crearBotonNuevoTurnoMensual();
    assert(w.document.querySelectorAll("#boton-nuevo-turno-mensual").length === 1, "[mensual] llamar de nuevo no lo duplica");
    b.click();
    const u = new URL(w.__nav[0], "http://localhost/turnero/");
    assert(w.__nav.length === 1 && u.pathname.endsWith("agenda.html") && u.searchParams.get("nuevo") === "1" && u.searchParams.get("sede") === "entre-rios" && u.searchParams.get("medico") === "med2" && u.searchParams.get("fecha") === "2030-10-09",
      "[mensual] al tocarlo va a la agenda con el formulario pedido, la misma sede y médico, y hoy (mes actual): " + w.__nav[0]);
  }
  {
    const w = paginaMensual("enfermeria", { anio: 2030, mes: 11, hoy: [2030, 9, 9, 10, 32, 0] }); // diciembre 2030, no es el mes actual
    w.document.getElementById("boton-nuevo-turno-mensual").click();
    assert(new URL(w.__nav[0], "http://localhost/turnero/").searchParams.get("fecha") === "2030-12-01", "[mensual] si el mes visible no es el actual, abre la agenda en el día 1 de ese mes (igual que 'Ver semana')");
  }
  {
    const html = `<!DOCTYPE html><html><body><div id="barra-mensual"><button id="boton-actualizar-mensual">Actualizar</button></div><div id="grilla-mensual-contenedor"></div>
      <script>${leer("js/turnero-motor.js")}</script><script>${leer("js/turnero-mensual.js")}</script>
      <script>cargarSedesMensual = async function() {}; cargarBloqueosMensual = async function() {}; sedesCacheMensual = [];
        window.__fin = false; iniciarAgendaMensual({ uid: "u" }, { rol: "enfermeria" }).then(() => { window.__fin = true; });</script></body></html>`;
    const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/turnero/agenda-mensual.html" });
    for (let i = 0; i < 50 && !dom.window.__fin; i++) { await new Promise((r) => setTimeout(r, 0)); }
    assert(!!dom.window.document.getElementById("boton-nuevo-turno-mensual"), "[mensual] el arranque real de la pantalla (iniciarAgendaMensual) crea el botón");
  }
  for (const rol of ["medico", "enfermeria"]) {
    const w = paginaMensual(rol, { anio: 2030, mes: 9, hoy: [2030, 9, 9, 10, 32, 0] });
    assert(!!w.document.getElementById("boton-nuevo-turno-mensual"), `[mensual] el rol ${rol} ve el botón`);
  }
  {
    const w = paginaMensual("administrativo", { anio: 2030, mes: 9, hoy: [2030, 9, 9, 10, 32, 0] });
    assert(!w.document.getElementById("boton-nuevo-turno-mensual"), "[mensual] administrativo NO ve el botón (igual que en la agenda: solo lectura)");
  }

  // ===================== 4. La agenda abre el formulario con ?nuevo=1 =====================
  const modalAbierto = (a) => a.d.getElementById("overlay-nuevo-turno-grilla").style.display === "flex";
  {
    const a = await abrirAgenda("administrador", {}, { url: "http://localhost/turnero/agenda.html?sede=entre-rios&fecha=2030-10-09&nuevo=1" });
    await esperar(a.w, () => !a.d.getElementById("campo-buscar-paciente").disabled && a.d.getElementById("campo-medico").options.length > 1, 600);
    assert(modalAbierto(a) && a.d.querySelectorAll(".seccion-carga").length === 4, "[agenda] con ?nuevo=1 se abre solo el formulario de nuevo turno");
    assert(!a.w.location.search, "[agenda] y la URL queda limpia (recargar la página no lo vuelve a abrir)");
    assert(a.d.querySelector("#selector-sede-grilla .activo").textContent.includes("Entre Ríos"), "[agenda] la grilla de fondo queda en la sede pedida");
  }
  {
    // integración: la URL que arma la mensual es la que abre la agenda
    const w = paginaMensual("enfermeria", { anio: 2030, mes: 9, hoy: [2030, 9, 9, 10, 32, 0] });
    w.document.getElementById("boton-nuevo-turno-mensual").click();
    const a = await abrirAgenda("enfermeria", {}, { url: new URL(w.__nav[0], "http://localhost/turnero/").href });
    await esperar(a.w, () => modalAbierto(a), 600);
    assert(modalAbierto(a), "[integración] la URL generada por el botón de la mensual abre el formulario en la agenda");
  }
  {
    const a = await abrirAgenda("administrativo", {}, { url: "http://localhost/turnero/agenda.html?nuevo=1" });
    await esperar(a.w, () => false, 30);
    assert(!modalAbierto(a), "[agenda] administrativo no tiene formulario de carga: con ?nuevo=1 no se abre nada");
  }
  for (const url of ["http://localhost/turnero/agenda.html", "http://localhost/turnero/agenda.html?sede=entre-rios&fecha=2030-10-09", "http://localhost/turnero/agenda.html?nuevo=2", "http://localhost/turnero/agenda.html?nuevo="]) {
    const a = await abrirAgenda("administrador", {}, { url });
    await esperar(a.w, () => false, 30);
    assert(!modalAbierto(a), `[agenda] sin ?nuevo=1 el formulario NO se abre (${url.split("agenda.html")[1] || "sin parámetros"})`);
  }

  console.log("\nTODAS LAS PRUEBAS DE VERSIONES Y DEL BOTÓN EN LA MENSUAL PASARON\n");
}
if (require.main === module) principal();
