// B2a — Puesto de la agenda: entrada por día, barra por rol, desplegable de vista, panel derecho,
// franja de paciente, refresco y marca de versión. Carga el agenda.html REAL con los scripts reales
// (mismo arnés de punta a punta que test_agenda_e2e.js; el reloj simulado es el miércoles 09/10/2030).
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const { abrirAgenda, esperar } = require("./test_agenda_e2e.js");

function assert(cond, msg) { if (!cond) { throw new Error("FALLA: " + msg); } console.log("OK: " + msg); }
const REPO = process.env.REPO_DIR || path.join(__dirname, "../repo");
const leer = (p) => fs.readFileSync(path.join(REPO, p), "utf8");
const URL_SIN_PARAMETROS = "http://localhost/turnero/agenda.html";
const ROLES = ["administrador", "enfermeria", "medico", "administrativo"];

const textosMenu = (d, idMenu) => Array.from(d.querySelectorAll(`#${idMenu} .lista-menu-puesto .opcion-menu-puesto`)).map((e) => e.textContent.replace(/^✓ /, "").trim());
const hayMenu = (d, idMenu) => !!d.getElementById(idMenu);
const visible = (el) => !!el && !el.hidden && el.style.display !== "none";
const modo = (a) => a.w.eval("modoVistaGrilla");
const ids = (a) => Array.from(a.d.querySelectorAll("#panel-dia [data-turno-id]")).map((e) => e.getAttribute("data-turno-id")).sort();

async function principal() {
  // ===================== 1. Entrada: la agenda abre en la vista de DÍA de hoy, para los 4 roles =====================
  for (const rol of ROLES) {
    const a = await abrirAgenda(rol, {}, { url: URL_SIN_PARAMETROS });
    assert(!a.errInit, `[entrada · ${rol}] la agenda inicia sin errores ${a.errInit || ""}`);
    assert(modo(a) === "dia" && a.d.getElementById("vista-dia").style.display === "grid", `[entrada · ${rol}] sin parámetros abre en la vista de DÍA`);
    assert(a.w.eval("fechaSeleccionadaDia") === "2030-10-09", `[entrada · ${rol}] el día mostrado es hoy (09/10/2030) → ${a.w.eval("fechaSeleccionadaDia")}`);
    assert(JSON.stringify(ids(a)) === JSON.stringify(["er2", "er3"]), `[entrada · ${rol}] la lista del día trae los turnos de hoy → ${ids(a)}`);
    assert(!!a.d.getElementById("calendario-dia").querySelector(".celda-calendario-dia"), `[entrada · ${rol}] el calendario mensual de la izquierda sigue estando`);
  }
  {
    const a = await abrirAgenda("enfermeria", {}, { url: URL_SIN_PARAMETROS + "?vista=semana" });
    assert(modo(a) === "semana", "[entrada] ?vista=semana pide la semana a propósito");
  }
  {
    const a = await abrirAgenda("enfermeria", {}, { url: URL_SIN_PARAMETROS + "?fecha=2030-10-09" });
    assert(modo(a) === "semana", "[entrada] ?fecha= sin vista sigue abriendo la semana (enlaces de la vista mensual)");
  }
  {
    const a = await abrirAgenda("enfermeria", {}, { url: URL_SIN_PARAMETROS + "?turno=er2" });
    assert(modo(a) === "dia" && a.w.eval("fechaSeleccionadaDia") === "2030-10-09", "[entrada] ?turno= sin vista ni fecha también abre el día de hoy");
  }
  {
    const a = await abrirAgenda("enfermeria", {}, { url: URL_SIN_PARAMETROS + "?vista=dia&fecha=2030-10-10" });
    assert(modo(a) === "dia" && a.w.eval("fechaSeleccionadaDia") === "2030-10-10", "[entrada] ?vista=dia&fecha= abre ese día");
  }
  {
    const login = leer("login.html");
    assert(/const DESTINO_INICIAL = "turnero\/agenda\.html"/.test(login) && !/location\.href = "index\.html"/.test(login) && (login.match(/= DESTINO_INICIAL/g) || []).length === 2,
      "[entrada] login.html manda a la agenda (con sesión activa y al ingresar), no a la portada");
  }

  // ===================== 2. La barra: lo que ve cada rol sale de opcionesPuestoPorRol =====================
  {
    const a = await abrirAgenda("administrador", {}, { url: URL_SIN_PARAMETROS });
    assert(hayMenu(a.d, "menu-medicacion-puesto") && JSON.stringify(textosMenu(a.d, "menu-medicacion-puesto")) === JSON.stringify(["Cargar medicación", "Registrar tratamiento"]), "[barra · administrador] Medicación: cargar medicación y registrar tratamiento");
    const h = textosMenu(a.d, "menu-herramientas-puesto");
    for (const t of ["Pacientes", "Catálogo de medicamentos", "Importación de pacientes", "Correcciones de stock", "Ajuste de stock", "Sedes y sillones", "Protocolos", "Médicos", "Cupos por porcentaje", "Bloqueos", "Cargar turno (pantalla alternativa)"]) assert(h.includes(t), `[barra · administrador] Otras herramientas incluye «${t}»`);
    assert(Array.from(a.d.querySelectorAll("#menu-herramientas-puesto a")).every((x) => x.target === "_blank"), "[barra · administrador] las herramientas abren en otra pestaña");
    assert(Array.from(a.d.querySelectorAll("#menu-medicacion-puesto a")).every((x) => x.target === "_blank"), "[barra · administrador] cargar medicación y tratamiento abren la pantalla actual en otra pestaña (hasta B2b)");
    const inicio = a.d.querySelector("#barra-puesto a.boton-barra-puesto");
    assert(inicio && inicio.getAttribute("href") === "../index.html" && /Inicio/.test(inicio.textContent), "[barra] «Inicio» lleva a la portada de módulos");
  }
  {
    const a = await abrirAgenda("enfermeria", {}, { url: URL_SIN_PARAMETROS });
    assert(JSON.stringify(textosMenu(a.d, "menu-medicacion-puesto")) === JSON.stringify(["Cargar medicación", "Registrar tratamiento"]), "[barra · enfermería] Medicación: cargar medicación y registrar tratamiento");
    const h = textosMenu(a.d, "menu-herramientas-puesto");
    assert(h.includes("Pacientes") && h.includes("Catálogo de medicamentos") && h.includes("Importación de pacientes"), "[barra · enfermería] herramientas: pacientes, catálogo e importación");
    for (const t of ["Correcciones de stock", "Ajuste de stock", "Sedes y sillones", "Protocolos", "Médicos", "Cupos por porcentaje", "Bloqueos", "Cargar turno (pantalla alternativa)"]) assert(!h.includes(t), `[barra · enfermería] NO ve «${t}» (solo administrador)`);
  }
  for (const rol of ["medico", "administrativo"]) {
    const a = await abrirAgenda(rol, {}, { url: URL_SIN_PARAMETROS });
    assert(!hayMenu(a.d, "menu-medicacion-puesto"), `[barra · ${rol}] sin menú Medicación (no carga ni registra)`);
    const h = textosMenu(a.d, "menu-herramientas-puesto");
    assert(!h.includes("Importación de pacientes") && !h.includes("Ajuste de stock") && !h.includes("Sedes y sillones"), `[barra · ${rol}] sin importación ni herramientas de administración`);
  }
  for (const rol of ROLES) {
    const a = await abrirAgenda(rol, {}, { url: URL_SIN_PARAMETROS });
    assert(!!Array.from(a.d.querySelectorAll("#barra-puesto .boton-barra-puesto")).find((b) => b.textContent.trim() === "Stock"), `[barra · ${rol}] botón Stock`);
    assert(JSON.stringify(textosMenu(a.d, "menu-historiales-puesto")) === JSON.stringify(["Historial de medicación", "Historial de turnos"]), `[barra · ${rol}] Historiales: medicación y turnos`);
    assert(a.d.querySelectorAll(".solapa-panel-puesto").length === 3, `[barra · ${rol}] el panel tiene las 3 solapas`);
  }
  {
    const html = leer("turnero/agenda.html");
    assert(!/selector-vista-grilla/.test(html), "[barra] los botones Día | Semana | Mes de la semana y de la lateral ya no están (los reemplaza el desplegable)");
  }

  // ===================== 3. Desplegable de vista: Día / Semana / Mes =====================
  {
    const a = await abrirAgenda("enfermeria", {}, { url: URL_SIN_PARAMETROS });
    const etiqueta = () => a.d.querySelector("#menu-vista-puesto .etiqueta-menu-puesto").textContent;
    const opcion = (t) => Array.from(a.d.querySelectorAll("#menu-vista-puesto .opcion-menu-puesto")).find((o) => o.textContent.replace(/^✓ /, "").trim() === t);
    assert(etiqueta() === "Día" && /^✓ /.test(opcion("Día").textContent), "[vista] en el día, el desplegable dice «Día» y marca Día");
    a.d.querySelector("#menu-vista-puesto .boton-menu-puesto").click();
    assert(a.d.getElementById("menu-vista-puesto").classList.contains("abierto"), "[vista] el clic abre el desplegable");
    opcion("Semana").click();
    await esperar(a.w, () => modo(a) === "semana", 400);
    await new Promise((r) => setTimeout(r, 30));
    assert(modo(a) === "semana" && a.d.getElementById("vista-dia").style.display === "none" && etiqueta() === "Semana", "[vista] «Semana» pasa a la semana y el desplegable lo refleja");
    assert(!a.d.getElementById("menu-vista-puesto").classList.contains("abierto"), "[vista] el desplegable se cierra al elegir");
    a.d.querySelector("#menu-vista-puesto .boton-menu-puesto").click();
    opcion("Día").click();
    await esperar(a.w, () => modo(a) === "dia", 400);
    await new Promise((r) => setTimeout(r, 30));
    assert(modo(a) === "dia" && etiqueta() === "Día", "[vista] «Día» vuelve a la vista de día");
    // Mes (es una página aparte hasta B3b): se comprueba que llame a la función de siempre.
    a.w.eval("window.__mes = []; irAMesDesdeDiaDia = function() { window.__mes.push('dia'); }; irAMesGrilla = function() { window.__mes.push('semana'); };");
    a.d.querySelector("#menu-vista-puesto .boton-menu-puesto").click();
    opcion("Mes").click();
    assert(JSON.stringify(a.w.__mes) === JSON.stringify(["dia"]), "[vista] «Mes» desde el día usa el mismo salto a la mensual de siempre");
    assert(!a.d.getElementById("menu-vista-puesto").classList.contains("abierto"), "[vista] el desplegable también se cierra al elegir «Mes»");
    // Clic fuera y Escape cierran.
    a.d.querySelector("#menu-herramientas-puesto .boton-menu-puesto").click();
    assert(a.d.getElementById("menu-herramientas-puesto").classList.contains("abierto"), "[vista] otro menú se abre");
    a.d.body.click();
    assert(!a.d.querySelector("#barra-puesto .menu-puesto.abierto"), "[vista] un clic fuera cierra los menús");
    a.d.querySelector("#menu-herramientas-puesto .boton-menu-puesto").click();
    a.d.dispatchEvent(new a.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert(!a.d.querySelector("#barra-puesto .menu-puesto.abierto"), "[vista] Escape cierra los menús");
  }

  // ===================== 4. Panel derecho =====================
  {
    const a = await abrirAgenda("enfermeria", {}, { url: URL_SIN_PARAMETROS });
    const panel = a.d.getElementById("panel-puesto");
    assert(panel.hidden && !a.d.body.classList.contains("panel-puesto-abierto") && a.d.querySelectorAll("#cuerpo-panel-puesto iframe").length === 0, "[panel] al entrar está cerrado y no cargó ninguna página (no lee nada hasta abrirlo)");
    Array.from(a.d.querySelectorAll("#barra-puesto .boton-barra-puesto")).find((b) => b.textContent.trim() === "Stock").click();
    assert(!panel.hidden && a.d.body.classList.contains("panel-puesto-abierto"), "[panel] «Stock» abre el panel");
    let marcos = a.d.querySelectorAll("#cuerpo-panel-puesto iframe");
    assert(marcos.length === 1 && /medicacion\/stock\.html\?embed=1$/.test(marcos[0].getAttribute("src")), "[panel] carga la página de stock embebida (?embed=1)");
    assert(a.d.querySelector('.solapa-panel-puesto[data-pestana="stock"]').classList.contains("activa"), "[panel] la solapa Stock queda activa");
    a.d.querySelector("#menu-historiales-puesto .boton-menu-puesto").click();
    Array.from(a.d.querySelectorAll("#menu-historiales-puesto .opcion-menu-puesto")).find((o) => o.textContent === "Historial de turnos").click();
    marcos = a.d.querySelectorAll("#cuerpo-panel-puesto iframe");
    assert(marcos.length === 2 && Array.from(marcos).find((m) => m.dataset.pestana === "historial-turnos").hidden === false && Array.from(marcos).find((m) => m.dataset.pestana === "stock").hidden === true, "[panel] cada solapa se carga la primera vez que se abre; la anterior queda oculta, no se vuelve a cargar");
    a.d.querySelector('iframe[data-pestana="stock"]').__nodoOriginal = true;
    a.d.querySelector('.solapa-panel-puesto[data-pestana="historial-turnos"]').click();
    a.d.querySelector('.solapa-panel-puesto[data-pestana="stock"]').click();
    assert(a.d.querySelectorAll("#cuerpo-panel-puesto iframe").length === 2 && a.d.querySelector('iframe[data-pestana="stock"]').hidden === false && a.d.querySelector('iframe[data-pestana="stock"]').__nodoOriginal === true, "[panel] volver a una solapa ya abierta no la recarga (es el mismo marco)");
    a.d.querySelector(".cerrar-panel-puesto").click();
    assert(panel.hidden && !a.d.body.classList.contains("panel-puesto-abierto"), "[panel] la × lo cierra");
    assert(ids(a).length === 2, "[panel] con el panel abierto o cerrado, el día sigue visible");
  }
  {
    const css = leer("css/styles.css");
    assert(/@media \(min-width: 1100px\)\s*\{\s*body\.panel-puesto-abierto \.contenedor-ancho\s*\{[^}]*width: calc\(100% - var\(--ancho-panel-puesto\)\)/.test(css), "[panel · CSS] desde 1100 px empuja el contenido");
    assert(/\.panel-puesto\s*\{[^}]*position: fixed;[^}]*width: min\(var\(--ancho-panel-puesto\), 96vw\)/.test(css), "[panel · CSS] por debajo de 1100 px se superpone, nunca más ancho que la pantalla");
    assert(/@container columna-dia \(max-width: 720px\)\s*\{[^}]*grid-template-columns: 36px 92px 44px[^}]*\}\s*\.fila-turno-dia > :nth-child\(5\)\s*\{\s*display: none;/.test(css) && /\.columna-principal-dia\s*\{\s*container-type: inline-size;/.test(css), "[panel · CSS] con la lista angosta se oculta la columna Médico (encabezado y filas) para que entre el ▸");
    assert(/body\.embebido \.encabezado-sesion,\s*body\.embebido \.breadcrumb\s*\{\s*display: none;/.test(css), "[panel · CSS] las páginas embebidas ocultan su encabezado");
  }
  {
    // auth.js: ?embed=1 pone la clase "embebido" al revelar la página; sin el parámetro, no.
    const src = leer("js/auth.js");
    for (const [query, esperado] of [["?embed=1", true], ["?x=1&embed=1", true], ["", false], ["?embed=10", false]]) {
      const dom = new JSDOM(`<!DOCTYPE html><body style="visibility:hidden"></body>`, { runScripts: "outside-only", url: "http://localhost/medicacion/stock.html" + query });
      dom.window.eval(src + "\n_revelarPagina();");
      assert(dom.window.document.body.classList.contains("embebido") === esperado, `[embebido] auth.js con «${query}» → clase embebido ${esperado ? "SÍ" : "NO"}`);
    }
  }

  // ===================== 5. Franja de paciente =====================
  {
    const a = await abrirAgenda("enfermeria", {}, { url: URL_SIN_PARAMETROS });
    const franja = a.d.getElementById("franja-paciente-puesto");
    const fila = (id) => a.d.querySelector(`#panel-dia [data-turno-id="${id}"]`);
    assert(franja.hidden, "[franja] sin turno elegido está oculta");
    assert(!!fila("er2").querySelector(".boton-elegir-puesto"), "[franja] cada fila tiene su botón ▸");
    fila("er2").querySelector(".boton-elegir-puesto").click();
    assert(!visible(a.d.getElementById("overlay-detalle-turno-grilla")), "[franja] el clic en ▸ NO abre el detalle del turno");
    assert(!franja.hidden && /Apeer2, Nomer2/.test(franja.textContent) && /FEC/.test(franja.textContent) && /Ciclo 1 · Sesión 1/.test(franja.textContent) && /10:00–11:00/.test(franja.textContent) && /Sillón 2/.test(franja.textContent),
      "[franja] muestra apellido, nombre, protocolo, ciclo, sesión, horario y sillón → " + franja.textContent.replace(/\s+/g, " ").trim());
    assert(/DNI 1er2/.test(franja.textContent), "[franja] y el DNI");
    assert(fila("er2").classList.contains("elegido-puesto") && !fila("er3").classList.contains("elegido-puesto"), "[franja] la fila elegida se resalta");
    // el clic en la fila sigue abriendo el detalle (no cambió)
    fila("er3").click();
    assert(visible(a.d.getElementById("overlay-detalle-turno-grilla")) && a.d.getElementById("overlay-detalle-turno-grilla").style.display !== "none", "[franja] el clic en la fila sigue abriendo el detalle como antes");
    assert(!franja.hidden && /Apeer2/.test(franja.textContent), "[franja] abrir un detalle no cambia la franja");
    a.d.querySelector("#overlay-detalle-turno-grilla .modal-cerrar").click();
    // ▸ del mismo turno de nuevo la saca
    fila("er2").querySelector(".boton-elegir-puesto").click();
    assert(franja.hidden && !fila("er2").classList.contains("elegido-puesto"), "[franja] ▸ otra vez la quita");
    // elegir otro y cerrar con ×
    fila("er3").querySelector(".boton-elegir-puesto").click();
    assert(!franja.hidden && /Apeer3/.test(franja.textContent) && /Int\.|Sin sillón|Sillón/.test(franja.textContent), "[franja] se puede elegir otro turno");
    franja.querySelector(".cerrar-franja-puesto").click();
    assert(franja.hidden && a.w.eval("turnoElegidoPuesto") === null, "[franja] la × la cierra");
    // al cambiar de día, la franja se limpia (el turno ya no está en la lista)
    fila("er2").querySelector(".boton-elegir-puesto").click();
    a.d.querySelector('.navegacion-dia-cabecera button[onclick="cambiarDiaDia(1)"]').click();
    await esperar(a.w, () => a.w.eval("fechaSeleccionadaDia") === "2030-10-10", 400);
    await new Promise((r) => setTimeout(r, 30));
    assert(franja.hidden && a.w.eval("turnoElegidoPuesto") === null && franja.innerHTML === "", "[franja] al cambiar de día se limpia (también la selección)");
    a.d.querySelector('.navegacion-dia-cabecera button[onclick="cambiarDiaDia(-1)"]').click();
    await esperar(a.w, () => a.w.eval("fechaSeleccionadaDia") === "2030-10-09", 400);
    await new Promise((r) => setTimeout(r, 30));
    assert(franja.hidden, "[franja] al volver al día de antes la franja no reaparece sola");
  }

  // ===================== 6. Refresco: cartel «leído hace X min» y relectura al volver a la pestaña =====================
  {
    const a = await abrirAgenda("enfermeria", {}, { url: URL_SIN_PARAMETROS });
    const cartel = a.d.getElementById("cartel-lectura-puesto");
    const leidoHaceMin = (min) => a.w.eval(`leidoEnDiaDia = new Date(Date.now() - ${min} * 60000); actualizarCartelLecturaPuesto();`);
    assert(/leído recién/.test(cartel.textContent) && !cartel.classList.contains("antiguo"), "[refresco] recién cargado: «leído recién», sin alerta → " + cartel.textContent);
    leidoHaceMin(7);
    assert(cartel.textContent === "leído hace 7 min" && !cartel.classList.contains("antiguo"), "[refresco] 7 min: «leído hace 7 min», sin alerta");
    leidoHaceMin(14);
    assert(!cartel.classList.contains("antiguo"), "[refresco] 14 min: todavía sin alerta");
    leidoHaceMin(15);
    assert(cartel.classList.contains("antiguo"), "[refresco] 15 min: se pone amarillo (desactualizado)");

    const consultas = () => a.w.__consultas.slice();
    a.w.__consultas = [];
    // 5 min: no relee
    leidoHaceMin(5);
    assert((await a.w.refrescarSiHaceFaltaPuesto()) === false && consultas().length === 0, "[refresco] al volver con 5 min de lectura NO relee (0 consultas)");
    // 12 min con un modal abierto: no relee
    leidoHaceMin(12);
    a.d.getElementById("overlay-notas-turno-grilla").style.display = "flex";
    assert((await a.w.refrescarSiHaceFaltaPuesto()) === false && consultas().length === 0, "[refresco] con un detalle o formulario abierto NO relee");
    a.d.getElementById("overlay-notas-turno-grilla").style.display = "none";
    // pestaña oculta: no relee
    Object.defineProperty(a.d, "visibilityState", { configurable: true, get: () => "hidden" });
    assert((await a.w.refrescarSiHaceFaltaPuesto()) === false && consultas().length === 0, "[refresco] con la pestaña oculta NO relee");
    Object.defineProperty(a.d, "visibilityState", { configurable: true, get: () => "visible" });
    // en la semana: no relee (la regla es del día)
    // 12 min, visible, sin modales: relee SOLO el día visible
    const antes = a.w.eval("leidoEnDiaDia.getTime()");
    assert((await a.w.refrescarSiHaceFaltaPuesto()) === true, "[refresco] con 12 min, pestaña visible y sin modales: relee");
    const cs = consultas();
    assert(cs.length === 1 && cs[0].coleccion === "turnos" && cs[0].filtros.some((f) => f[0] === "fecha"), "[refresco] hace UNA consulta de turnos de ese día; no vuelve a leer sedes, médicos, cupos ni bloqueos → " + JSON.stringify(cs.map((c) => c.coleccion)));
    assert(a.w.eval("leidoEnDiaDia.getTime()") > antes && /recién/.test(cartel.textContent), "[refresco] después de releer el cartel vuelve a «leído recién»");
    // evento real: visibilitychange y focus llaman a la misma función
    leidoHaceMin(12);
    a.w.__consultas = [];
    a.d.dispatchEvent(new a.w.Event("visibilitychange"));
    await esperar(a.w, () => a.w.__consultas.length > 0, 400);
    assert(a.w.__consultas.length === 1, "[refresco] el evento visibilitychange dispara la relectura");
    await new Promise((r) => setTimeout(r, 30));
    leidoHaceMin(12);
    a.w.__consultas = [];
    a.w.dispatchEvent(new a.w.Event("focus"));
    await esperar(a.w, () => a.w.__consultas.length > 0, 400);
    assert(a.w.__consultas.length === 1, "[refresco] volver a la ventana (focus) también la dispara");
  }
  {
    const a = await abrirAgenda("enfermeria", {}, { url: URL_SIN_PARAMETROS + "?vista=semana" });
    a.w.__consultas = [];
    a.w.eval(`fechaSeleccionadaDia = "2030-10-09"; leidoEnDiaDia = new Date(Date.now() - 30 * 60000);`); // lectura vieja del día, pero se está mirando la semana
    assert((await a.w.refrescarSiHaceFaltaPuesto()) === false && a.w.__consultas.length === 0, "[refresco] en la semana no relee solo (la regla es del día)");
  }

  // ===================== 7. Marca de versión y aviso de página desactualizada =====================
  {
    const esperada = (leer("js/turnero-formulario.js").match(/const BUILD_ESPERADO_TURNERO = "([^"]+)"/) || [])[1];
    const m = leer("js/turnero-puesto.js").match(/TURNERO_BUILD = window\.TURNERO_BUILD \|\| \{\}\)\.(\w+) = "([^"]+)"/);
    assert(!!m && m[1] === "puesto" && m[2] === esperada, `[versión] turnero-puesto.js lleva la misma marca que los demás (${esperada})`);
    const html = leer("turnero/agenda.html");
    assert(new RegExp(`turnero-puesto\\.js\\?v=${esperada}`).test(html), "[versión] agenda.html carga turnero-puesto.js con ?v=");
    assert(/verificarVersionesTurnero\(\[[^\]]*"puesto"[^\]]*\]\)/.test(html), "[versión] agenda.html verifica también la marca de turnero-puesto");
    const a = await abrirAgenda("enfermeria", {}, { url: URL_SIN_PARAMETROS });
    assert(a.w.TURNERO_BUILD.puesto === esperada && !a.d.getElementById("aviso-versiones-turnero"), "[versión] con todo al día no hay aviso");
    // Un turnero-puesto.js viejo (sin marca) dispara el aviso y lo nombra.
    const dir = fs.mkdtempSync("/tmp/mezcla-puesto-");
    for (const sub of ["js", "turnero", "css"]) fs.mkdirSync(path.join(dir, sub), { recursive: true });
    for (const f of fs.readdirSync(path.join(REPO, "js"))) { if (fs.statSync(path.join(REPO, "js", f)).isDirectory()) continue; fs.copyFileSync(path.join(REPO, "js", f), path.join(dir, "js", f)); }
    fs.copyFileSync(path.join(REPO, "turnero/agenda.html"), path.join(dir, "turnero/agenda.html"));
    fs.writeFileSync(path.join(dir, "js/turnero-puesto.js"), leer("js/turnero-puesto.js").replace(/^.*TURNERO_BUILD.*\n/m, ""));
    const v = await abrirAgenda("enfermeria", {}, { url: URL_SIN_PARAMETROS, repoDir: dir });
    await esperar(v.w, () => !!v.d.getElementById("aviso-versiones-turnero"), 400);
    const aviso = v.d.getElementById("aviso-versiones-turnero");
    assert(!!aviso && /turnero-puesto\.js/.test(aviso.textContent), "[versión] con turnero-puesto.js viejo, el aviso lo nombra");
  }

  console.log("\nTODAS LAS PRUEBAS DE B2a (PUESTO) PASARON");
}

principal().catch((e) => { console.error(e); process.exit(1); });
