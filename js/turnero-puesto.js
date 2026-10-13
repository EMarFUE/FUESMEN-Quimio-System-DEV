(window.TURNERO_BUILD = window.TURNERO_BUILD || {}).puesto = "B2a-2026-10-12-a"; // marca de versión de este archivo (ver verificarVersionesTurnero)

// B2a — Puesto de la agenda (barra superior, franja de paciente, panel derecho y refresco).
//
// Qué es: lo que rodea a la vista de día para que enfermería (y los demás roles) trabajen en una
// sola pestaña:
//   - BARRA DEL PUESTO: desplegable de vista (Día / Semana / Mes), Medicación, Stock, Historiales,
//     Otras herramientas e Inicio. Lo que ve cada rol sale de UNA sola función:
//     opcionesPuestoPorRol() — B5 (permisos) la reemplaza; no hay otra verificación de rol acá.
//   - FRANJA DE PACIENTE: apellido, nombre, protocolo(s), ciclo, sesión, horario y sillón del
//     turno elegido con el botón ▸ de la fila (el clic en la fila sigue abriendo el detalle).
//   - PANEL DERECHO: Stock, Historial de medicación e Historial de turnos (las páginas actuales,
//     embebidas con ?embed=1; se cargan recién al abrir cada solapa, no al entrar a la agenda).
//     Cargar medicación y Registrar tratamiento todavía abren la pantalla actual en otra pestaña
//     (B2b y B2c las pasan al panel).
//   - REFRESCO: cartel «leído hace X min» (amarillo desde los 15) y, al volver a la pestaña o a
//     la ventana con la lectura de más de 10 min, relee SOLO el día visible. Sin temporizadores
//     que lean: el cartel se actualiza sin tocar la base.
//
// Se carga después de turnero-grilla.js y turnero-dia.js y usa sus globals (modoVistaGrilla,
// rolActualGrilla, leidoEnDiaDia, turnosDelDiaDia, escaparHtmlGrilla y varias funciones). Todos
// sus nombres llevan el sufijo "Puesto" para no chocar con los demás archivos de la agenda.

const UMBRAL_REFRESCO_MIN_PUESTO = 10;        // al volver a la pestaña, relee si la lectura tiene más que esto
const UMBRAL_AVISO_ANTIGUEDAD_MIN_PUESTO = 15; // el cartel se pone amarillo desde acá
const INTERVALO_CARTEL_MS_PUESTO = 30000;      // se recalcula el texto del cartel (no lee nada)

let turnoElegidoPuesto = null; // id del turno de la franja de paciente
let pestanaPanelPuestoActual = null; // "stock" | "historial-medicacion" | "historial-turnos" | null
let refrescandoPuesto = false;

// Solapas del panel derecho: páginas existentes, embebidas (auth.js les agrega la clase "embebido").
const PESTANAS_PANEL_PUESTO = [
  { id: "stock", texto: "Stock", url: "../medicacion/stock.html?embed=1" },
  { id: "historial-medicacion", texto: "Historial de medicación", url: "../medicacion/historial.html?embed=1" },
  { id: "historial-turnos", texto: "Historial de turnos", url: "historial-turnos.html?embed=1" }
];

// ---------------------------------------------------------------------------------------------
// ÚNICA función de roles del Puesto. B5 la reemplaza por el helper de permisos.
// Devuelve qué entradas ve cada rol en la barra. Se mantiene el criterio de hoy:
//  - Cargar medicación y registrar tratamiento: administrador y enfermería (como medicacion/index.html).
//  - Stock e historiales: todos los roles (como hoy: esas páginas no tienen control de rol).
//  - Pacientes y catálogo: todos los roles (como hoy en medicacion/herramientas.html).
//  - Importación de pacientes: administrador y enfermería. Correcciones, ajuste de stock y
//    datos maestros del turnero (sedes, protocolos, médicos, cupos, bloqueos, carga alternativa):
//    solo administrador.
// ---------------------------------------------------------------------------------------------
function opcionesPuestoPorRol(rol) {
  const esAdmin = rol === "administrador";
  const cargaMedicacion = esAdmin || rol === "enfermeria";

  const medicacion = [];
  if (cargaMedicacion) {
    medicacion.push({ texto: "Cargar medicación", url: "../medicacion/entregas.html", nuevaPestana: true });
    medicacion.push({ texto: "Registrar tratamiento", url: "../medicacion/egresos.html", nuevaPestana: true });
  }

  const herramientas = [
    { texto: "Pacientes", url: "../medicacion/pacientes.html", nuevaPestana: true },
    { texto: "Catálogo de medicamentos", url: "../medicacion/catalogo.html", nuevaPestana: true }
  ];
  if (cargaMedicacion) {
    herramientas.push({ texto: "Importación de pacientes", url: "../medicacion/herramienta-importar-pacientes.html", nuevaPestana: true });
  }
  if (esAdmin) {
    herramientas.push({ separador: true });
    herramientas.push({ texto: "Correcciones de stock", url: "../medicacion/correcciones.html", nuevaPestana: true });
    herramientas.push({ texto: "Ajuste de stock", url: "../medicacion/ajustes.html", nuevaPestana: true });
    herramientas.push({ separador: true });
    herramientas.push({ texto: "Sedes y sillones", url: "sedes.html", nuevaPestana: true });
    herramientas.push({ texto: "Protocolos", url: "protocolos.html", nuevaPestana: true });
    herramientas.push({ texto: "Médicos", url: "medicos.html", nuevaPestana: true });
    herramientas.push({ texto: "Cupos por porcentaje", url: "cupos.html", nuevaPestana: true });
    herramientas.push({ texto: "Bloqueos", url: "bloqueos.html", nuevaPestana: true });
    herramientas.push({ texto: "Cargar turno (pantalla alternativa)", url: "carga.html", nuevaPestana: true });
  }

  return {
    medicacion,                 // enlaces que abren la pantalla actual en otra pestaña (hasta B2b/B2c)
    paneles: PESTANAS_PANEL_PUESTO.map((p) => p.id), // solapas del panel que ve este rol
    herramientas                // «Otras herramientas»
  };
}

// ---------------------------------------------------------------------------------------------
// Barra
// ---------------------------------------------------------------------------------------------

function modoVistaActualPuesto() {
  return typeof modoVistaGrilla !== "undefined" && modoVistaGrilla === "dia" ? "dia" : "semana";
}

function etiquetaVistaPuesto(modo) {
  return modo === "dia" ? "Día" : modo === "semana" ? "Semana" : "Mes";
}

function cerrarMenusPuesto() {
  document.querySelectorAll("#barra-puesto .menu-puesto.abierto").forEach((menu) => {
    menu.classList.remove("abierto");
    const boton = menu.querySelector(".boton-menu-puesto");
    if (boton) boton.setAttribute("aria-expanded", "false");
  });
}

// Un menú: botón + lista. items: { texto, url, nuevaPestana } | { texto, alElegir, marcado } | { separador }.
function crearMenuPuesto(id, etiqueta, items) {
  const menu = document.createElement("div");
  menu.className = "menu-puesto";
  menu.id = id;

  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = "boton-menu-puesto";
  boton.setAttribute("aria-haspopup", "true");
  boton.setAttribute("aria-expanded", "false");
  boton.innerHTML = `<span class="etiqueta-menu-puesto"></span> <span class="flecha-menu-puesto" aria-hidden="true">▾</span>`;
  boton.querySelector(".etiqueta-menu-puesto").textContent = etiqueta;
  boton.addEventListener("click", (evento) => {
    evento.stopPropagation();
    const estabaAbierto = menu.classList.contains("abierto");
    cerrarMenusPuesto();
    if (!estabaAbierto) {
      menu.classList.add("abierto");
      boton.setAttribute("aria-expanded", "true");
    }
  });
  menu.appendChild(boton);

  const lista = document.createElement("div");
  lista.className = "lista-menu-puesto";
  lista.setAttribute("role", "menu");
  for (const item of items) {
    if (item.separador) {
      const sep = document.createElement("div");
      sep.className = "separador-menu-puesto";
      lista.appendChild(sep);
      continue;
    }
    const opcion = item.url ? document.createElement("a") : document.createElement("button");
    opcion.className = "opcion-menu-puesto" + (item.marcado ? " marcada" : "");
    opcion.setAttribute("role", "menuitem");
    opcion.textContent = (item.marcado ? "✓ " : "") + item.texto;
    if (item.url) {
      opcion.href = item.url;
      if (item.nuevaPestana) { opcion.target = "_blank"; opcion.rel = "noopener"; }
    } else {
      opcion.type = "button";
      opcion.addEventListener("click", () => { cerrarMenusPuesto(); item.alElegir(); });
    }
    lista.appendChild(opcion);
  }
  menu.appendChild(lista);
  return menu;
}

function irAVistaPuesto(destino) {
  const actual = modoVistaActualPuesto();
  if (destino === actual) return;
  if (destino === "dia") irADiaDesdeSemanaGrilla();          // turnero-grilla.js
  else if (destino === "semana") irASemanaDesdeDiaDia();     // turnero-dia.js
  else if (destino === "mes") (actual === "dia" ? irAMesDesdeDiaDia() : irAMesGrilla());
}

function montarBarraPuesto(rol) {
  const barra = document.getElementById("barra-puesto");
  if (!barra) return;
  const opciones = opcionesPuestoPorRol(rol);
  barra.innerHTML = "";

  const titulo = document.createElement("span");
  titulo.className = "titulo-barra-puesto";
  titulo.textContent = "Agenda";
  barra.appendChild(titulo);

  // Vista: Día ▾ (Día / Semana / Mes). Se vuelve a armar al cambiar de modo (actualizarBarraPuesto).
  const modo = modoVistaActualPuesto();
  barra.appendChild(crearMenuPuesto("menu-vista-puesto", etiquetaVistaPuesto(modo), [
    { texto: "Día", marcado: modo === "dia", alElegir: () => irAVistaPuesto("dia") },
    { texto: "Semana", marcado: modo === "semana", alElegir: () => irAVistaPuesto("semana") },
    { texto: "Mes", alElegir: () => irAVistaPuesto("mes") }
  ]));

  if (opciones.medicacion.length > 0) {
    barra.appendChild(crearMenuPuesto("menu-medicacion-puesto", "Medicación", opciones.medicacion));
  }

  const stock = document.createElement("button");
  stock.type = "button";
  stock.className = "boton-barra-puesto";
  stock.textContent = "Stock";
  stock.addEventListener("click", () => abrirPanelPuesto("stock"));
  if (opciones.paneles.includes("stock")) barra.appendChild(stock);

  const historiales = PESTANAS_PANEL_PUESTO
    .filter((p) => p.id !== "stock" && opciones.paneles.includes(p.id))
    .map((p) => ({ texto: p.texto, alElegir: () => abrirPanelPuesto(p.id) }));
  if (historiales.length > 0) barra.appendChild(crearMenuPuesto("menu-historiales-puesto", "Historiales", historiales));

  barra.appendChild(crearMenuPuesto("menu-herramientas-puesto", "Otras herramientas", opciones.herramientas));

  const espacio = document.createElement("span");
  espacio.className = "espacio-barra-puesto";
  barra.appendChild(espacio);

  const inicio = document.createElement("a");
  inicio.className = "boton-barra-puesto enlace";
  inicio.href = "../index.html";
  inicio.textContent = "Inicio";
  inicio.title = "Volver a la portada de módulos";
  barra.appendChild(inicio);
}

// Se llama cuando cambia el modo (día <-> semana) para que el desplegable muestre la vista vigente.
function actualizarBarraPuesto() {
  if (!document.getElementById("barra-puesto") || typeof rolActualGrilla === "undefined" || !rolActualGrilla) return;
  montarBarraPuesto(rolActualGrilla); // se rearma entera: los menús quedan cerrados
}

// ---------------------------------------------------------------------------------------------
// Franja de paciente
// ---------------------------------------------------------------------------------------------

function textoProtocolosPuesto(turno) {
  return (turno.protocolos || []).map((p) => (p && p.nombre) || p).filter(Boolean).join(", ");
}

function elegirTurnoPuesto(turnoId) {
  turnoElegidoPuesto = turnoElegidoPuesto === turnoId ? null : turnoId; // el mismo ▸ de nuevo la cierra
  if (typeof renderizarPanelDia === "function" && modoVistaActualPuesto() === "dia") renderizarPanelDia();
  actualizarFranjaPuesto();
}

function quitarTurnoElegidoPuesto() {
  turnoElegidoPuesto = null;
  if (typeof renderizarPanelDia === "function" && modoVistaActualPuesto() === "dia") renderizarPanelDia();
  actualizarFranjaPuesto();
}

function actualizarFranjaPuesto() {
  const franja = document.getElementById("franja-paciente-puesto");
  if (!franja) return;
  const turno = turnoElegidoPuesto && typeof turnosDelDiaDia !== "undefined"
    ? turnosDelDiaDia.find((t) => t.id === turnoElegidoPuesto)
    : null;
  if (!turno) {
    // El turno elegido ya no está en lo que se muestra (otro día, o se reasignó): la franja se limpia.
    turnoElegidoPuesto = null;
    franja.hidden = true;
    franja.innerHTML = "";
    return;
  }
  const paciente = turno.paciente || {};
  const nombreCompleto = [paciente.apellido, paciente.nombre].filter(Boolean).join(", ") || "Sin paciente";
  const protocolos = textoProtocolosPuesto(turno);
  const cicloSesion = (turno.ciclo != null || turno.sesion != null)
    ? `Ciclo ${turno.ciclo ?? "-"} · Sesión ${turno.sesion ?? "-"}`
    : "Sin ciclo ni sesión";
  const sillon = turno.internado ? "Internado" : (turno.sillon != null ? `Sillón ${turno.sillon}` : "Sin sillón");
  const esc = (valor) => escaparHtmlGrilla(valor);
  franja.innerHTML = `
    <span class="paciente-franja-puesto">${esc(nombreCompleto)}</span>
    ${paciente.numeroDocumento ? `<span class="dato-franja-puesto">DNI ${esc(paciente.numeroDocumento)}</span>` : ""}
    <span class="dato-franja-puesto">${protocolos ? esc(protocolos) : "Sin protocolo"}</span>
    <span class="dato-franja-puesto">${esc(cicloSesion)}</span>
    <span class="dato-franja-puesto">${esc(turno.horarioInicio)}–${esc(turno.horarioFin)} · ${esc(sillon)}</span>
    <button type="button" class="cerrar-franja-puesto" onclick="quitarTurnoElegidoPuesto()" title="Quitar la selección" aria-label="Quitar la selección">×</button>`;
  franja.hidden = false;
}

// ---------------------------------------------------------------------------------------------
// Panel derecho
// ---------------------------------------------------------------------------------------------

function abrirPanelPuesto(pestanaId) {
  const panel = document.getElementById("panel-puesto");
  if (!panel) return;
  const pestana = PESTANAS_PANEL_PUESTO.find((p) => p.id === pestanaId);
  if (!pestana) return;
  cerrarMenusPuesto();

  pestanaPanelPuestoActual = pestanaId;
  document.body.classList.add("panel-puesto-abierto");
  panel.hidden = false;

  const cuerpo = document.getElementById("cuerpo-panel-puesto");
  // Cada solapa se arma (y por lo tanto lee) recién la primera vez que se abre.
  let marco = cuerpo.querySelector(`iframe[data-pestana="${pestanaId}"]`);
  if (!marco) {
    marco = document.createElement("iframe");
    marco.dataset.pestana = pestanaId;
    marco.title = pestana.texto;
    marco.src = pestana.url;
    cuerpo.appendChild(marco);
  }
  cuerpo.querySelectorAll("iframe").forEach((m) => { m.hidden = m.dataset.pestana !== pestanaId; });

  document.querySelectorAll("#panel-puesto .solapa-panel-puesto").forEach((boton) => {
    const activa = boton.dataset.pestana === pestanaId;
    boton.classList.toggle("activa", activa);
    boton.setAttribute("aria-selected", activa ? "true" : "false");
  });
}

function cerrarPanelPuesto() {
  const panel = document.getElementById("panel-puesto");
  if (!panel) return;
  panel.hidden = true;
  document.body.classList.remove("panel-puesto-abierto");
  pestanaPanelPuestoActual = null;
}

function recargarPestanaPanelPuesto() {
  if (!pestanaPanelPuestoActual) return;
  const marco = document.querySelector(`#cuerpo-panel-puesto iframe[data-pestana="${pestanaPanelPuestoActual}"]`);
  if (marco) marco.src = marco.src; // vuelve a cargar la página embebida (y a leer)
}

function montarPanelPuesto(rol) {
  const panel = document.getElementById("panel-puesto");
  if (!panel) return;
  const permitidas = opcionesPuestoPorRol(rol).paneles;
  const solapas = document.getElementById("solapas-panel-puesto");
  solapas.innerHTML = "";
  for (const pestana of PESTANAS_PANEL_PUESTO.filter((p) => permitidas.includes(p.id))) {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "solapa-panel-puesto";
    boton.dataset.pestana = pestana.id;
    boton.setAttribute("role", "tab");
    boton.textContent = pestana.texto;
    boton.addEventListener("click", () => abrirPanelPuesto(pestana.id));
    solapas.appendChild(boton);
  }
}

// ---------------------------------------------------------------------------------------------
// Refresco: cartel «leído hace X min» y relectura al volver a la pestaña
// ---------------------------------------------------------------------------------------------

function minutosDesdeLecturaPuesto() {
  if (typeof leidoEnDiaDia === "undefined" || !leidoEnDiaDia) return null;
  return Math.floor((Date.now() - leidoEnDiaDia.getTime()) / 60000);
}

function actualizarCartelLecturaPuesto() {
  const cartel = document.getElementById("cartel-lectura-puesto");
  if (!cartel) return;
  const minutos = minutosDesdeLecturaPuesto();
  if (minutos === null) { cartel.textContent = ""; cartel.classList.remove("antiguo"); return; }
  cartel.textContent = minutos < 1 ? "leído recién" : `leído hace ${minutos} min`;
  cartel.classList.toggle("antiguo", minutos >= UMBRAL_AVISO_ANTIGUEDAD_MIN_PUESTO);
  cartel.title = minutos >= UMBRAL_AVISO_ANTIGUEDAD_MIN_PUESTO
    ? "Esta lista puede estar desactualizada: tocá ↻ para volver a leerla"
    : "Hora de la última lectura de este día";
}

function hayModalAbiertoPuesto() {
  return Array.from(document.querySelectorAll(".overlay-modal")).some((m) => m.style.display && m.style.display !== "none");
}

// Al volver a la pestaña (o a la ventana): si el día visible tiene más de 10 min, se relee SOLO ese día
// (cargarYRenderizarDia: una consulta de ese día, sin sedes, médicos ni bloqueos). No se relee si hay un
// formulario o detalle abierto, para no mover nada debajo de quien lo está usando.
async function refrescarSiHaceFaltaPuesto() {
  if (refrescandoPuesto) return false;
  if (document.visibilityState !== "visible") return false;
  if (modoVistaActualPuesto() !== "dia") return false;
  const minutos = minutosDesdeLecturaPuesto();
  if (minutos === null || minutos < UMBRAL_REFRESCO_MIN_PUESTO) return false;
  if (hayModalAbiertoPuesto()) return false;
  refrescandoPuesto = true;
  try {
    await cargarYRenderizarDia();
  } finally {
    refrescandoPuesto = false;
    actualizarCartelLecturaPuesto();
  }
  return true;
}

// Los modos y las filas del día avisan acá cuando terminan de dibujarse (ver turnero-dia.js).
function alRenderizarDiaPuesto() {
  actualizarFranjaPuesto();
  actualizarCartelLecturaPuesto();
}

function alCambiarModoPuesto() {
  actualizarBarraPuesto();
  if (modoVistaActualPuesto() !== "dia") { turnoElegidoPuesto = null; actualizarFranjaPuesto(); }
}

function iniciarPuesto(rol) {
  montarBarraPuesto(rol);
  montarPanelPuesto(rol);
  document.addEventListener("click", cerrarMenusPuesto);
  document.addEventListener("keydown", (evento) => { if (evento.key === "Escape") cerrarMenusPuesto(); });
  document.addEventListener("visibilitychange", refrescarSiHaceFaltaPuesto);
  window.addEventListener("focus", refrescarSiHaceFaltaPuesto);
  setInterval(actualizarCartelLecturaPuesto, INTERVALO_CARTEL_MS_PUESTO);
}
