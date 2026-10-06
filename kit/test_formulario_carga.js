const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

function assert(cond, msg) { if (!cond) { throw new Error("FALLA: " + msg); } console.log("OK: " + msg); }

const REPO = process.env.REPO_DIR || path.join(__dirname, "../repo");
const leer = (p) => fs.readFileSync(path.join(REPO, p), "utf8");
const srcMotor = leer("js/turnero-motor.js"), srcFormulario = leer("js/turnero-formulario.js"), srcCarga = leer("js/turnero-carga.js");
const srcCargaHtml = leer("turnero/carga.html"), srcAgendaHtml = leer("turnero/agenda.html");

// CONTRATO: los 45 ids del formulario original (carga.html antes del rediseño). turnero-carga.js los lee por
// nombre: si falta alguno, la carga se rompe. El rediseño puede cambiar el aspecto, nunca estos ids.
const IDS_ORIGINALES = ["alta-apellido", "alta-nombre", "alta-numero-documento", "alta-obra-social", "alta-tipo-documento", "aviso-sede-indefinida",
  "badge-fecha-calculada", "badge-sede-automatica", "bloque-alta-rapida", "bloque-busqueda-paciente", "bloque-dias-turno", "bloque-fecha-manual",
  "bloque-horario-manual", "bloque-internado", "bloque-medico-otro", "bloque-nota-inicial-turno", "bloque-prioridad-turno", "bloque-sillon-backup",
  "boton-abrir-nota-inicial-turno", "boton-actualizar-pacientes", "boton-guardar-turno", "campo-buscar-paciente", "campo-ciclo", "campo-dias-turno",
  "campo-fecha", "campo-horario-manual", "campo-internado", "campo-medico", "campo-medico-otro-nombre", "campo-nota-inicial-turno", "campo-premedicacion",
  "campo-prioridad-turno", "campo-sede-manual", "campo-sesion", "campo-sillon-backup", "contenedor-nota-inicial-turno", "fecha-calculada-info",
  "lista-protocolos", "mensaje-alta-rapida", "paciente-seleccionado", "resultados-busqueda-paciente", "resumen-duracion", "sede-automatica-info",
  "sin-resultados", "texto-paciente-seleccionado"];
// Ids que carga.js busca pero NO son del formulario: avisos que crea el propio código y el mensaje de cada pantalla.
const IDS_FUERA_DEL_FORMULARIO = ["modal-sobreturno", "modal-bloqueo-franja", "modal-bloqueo-cupo", "modal-bloqueo-atadura", "mensaje-general"];

const SEDES = [{ id: "s1", nombre: "Emilio Civit", horaApertura: "09:00", horaCierre: "13:00", diasAtencion: ["lunes", "martes", "miercoles", "jueves", "viernes"],
  usaAtaduraDia: false, usaCuposPorcentaje: false, sillones: [{ numero: 1, tipo: "regular" }, { numero: 2, tipo: "regular" }, { numero: 3, tipo: "backup" }] }];
const MEDICOS = [{ id: "med1", nombre: "Dr. Gómez", diasPorSede: { "Emilio Civit": ["lunes", "martes", "miercoles", "jueves", "viernes"] } }];
// Una fecha válida para la validación real (hasta 190 días hacia adelante): una semana desde hoy.
const _h = new Date(); _h.setDate(_h.getDate() + 7);
const FECHA_ISO = `${_h.getFullYear()}-${String(_h.getMonth() + 1).padStart(2, "0")}-${String(_h.getDate()).padStart(2, "0")}`;
const FECHA_VISTA = FECHA_ISO.split("-").reverse().join("/");
const PACIENTE = { id: "P", nombre: "Ana", apellido: "Pérez", obraSocial: "OSDE", tipoDocumento: "DNI", numeroDocumento: "30123456" };

// ---- Página mínima con el formulario REAL montado (mismos scripts que las pantallas) ----
function abrir(rol, { lleno = true } = {}) {
  const html = `<!DOCTYPE html><html><body><div id="mensaje-general" class="mensaje-info" style="display:none;"></div>
    <div id="contenido-carga"><div id="formulario-carga"></div></div>
    <script>${srcMotor}</script><script>${srcFormulario}</script><script>${srcCarga}</script>
    <script>
      window.__llamadas = []; window.__datos = null;
      buscarYMostrarHuecos = async function(d) { window.__llamadas.push(["automatica", JSON.parse(JSON.stringify(d))]); };
      buscarYGuardarConHorarioManual = async function(d, h, soloBackup) { window.__llamadas.push(["horaExacta", h, !!soloBackup]); };
      guardarTurnoInternado = async function(d, h) { window.__llamadas.push(["internado", h]); };
      montarFormularioCarga("formulario-carga");
      rolActualCarga = ${JSON.stringify(rol)}; datosUsuarioActualCarga = { rol: ${JSON.stringify(rol)}, medicoId: "med1" }; usuarioActualCarga = { uid: "u" };
      sedesCacheCarga = ${JSON.stringify(SEDES)}; medicosCacheCarga = ${JSON.stringify(MEDICOS)};
      ${lleno ? `
      pacienteSeleccionadoCarga = ${JSON.stringify(PACIENTE)}; renderizarPacienteSeleccionado();
      poblarSelectMedico(); document.getElementById("campo-medico").value = "med1"; actualizarBloqueMedico();
      protocolosSeleccionados = { f1: { protocoloId: "p1", nombre: "FEC", duracionMinutos: 60 } };
      document.getElementById("campo-ciclo").value = "1"; document.getElementById("campo-sesion").value = "1";
      modoFechaTurno = "calendario"; renderizarModoFecha(); document.getElementById("campo-fecha").value = ${JSON.stringify(FECHA_ISO)};
      ` : ``}
      actualizarVisibilidadCamposEspeciales();
    </script></body></html>`;
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "http://localhost/turnero/carga.html" });
  const w = dom.window, d = w.document;
  const $ = (id) => d.getElementById(id);
  return {
    w, d, $,
    visible: (id) => $(id) && $(id).style.display !== "none",
    radio: (nombre, valor) => d.querySelector(`input[name="${nombre}"][value="${valor}"]`),
    marcado: (nombre) => (d.querySelector(`input[name="${nombre}"]:checked`) || {}).value,
    click: (el) => el.click(),
    async guardar() { w.__llamadas.length = 0; $("mensaje-general").style.display = "none"; $("mensaje-general").textContent = ""; await w.intentarGuardarTurno(); return { llamadas: w.__llamadas.slice(), mensaje: $("mensaje-general").textContent }; },
    async esperar() { await new Promise((r) => setTimeout(r, 5)); },
    resumen: () => $("resumen-carga-texto").textContent
  };
}

async function principal() {
  // ===================== A. CONTRATO DE IDS =====================
  {
    const p = abrir("administrador");
    const faltan = IDS_ORIGINALES.filter((id) => !p.$(id));
    assert(faltan.length === 0, `[contrato] los ${IDS_ORIGINALES.length} ids del formulario original existen en el nuevo` + (faltan.length ? " — FALTAN: " + faltan.join(", ") : ""));
    const usados = [...new Set([...srcCarga.matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]))];
    const sinCubrir = usados.filter((id) => !p.$(id) && !IDS_FUERA_DEL_FORMULARIO.includes(id));
    assert(sinCubrir.length === 0, `[contrato] cada id que lee turnero-carga.js (${usados.length}) existe en el formulario o es un aviso que crea el propio código` + (sinCubrir.length ? " — SIN CUBRIR: " + sinCubrir.join(", ") : ""));
    const todos = [...p.d.querySelectorAll("[id]")].map((e) => e.id);
    const repetidos = todos.filter((id, i) => todos.indexOf(id) !== i);
    assert(repetidos.length === 0, "[contrato] ningún id repetido en el formulario" + (repetidos.length ? ": " + repetidos.join(", ") : ""));
    assert(p.d.querySelectorAll("#boton-guardar-turno").length === 1 && p.d.querySelectorAll("button#boton-guardar-turno").length === 1, "[contrato] un único botón de guardar");
    // Las dos pantallas montan el MISMO formulario (una sola plantilla, ya no hay copia).
    for (const [nombre, html] of [["carga.html", srcCargaHtml], ["agenda.html", srcAgendaHtml]]) {
      assert(/montarFormularioCarga\("formulario-carga"\)/.test(html) && /turnero-formulario\.js/.test(html) && /id="formulario-carga"/.test(html), `[una sola plantilla] ${nombre} monta el formulario desde turnero-formulario.js`);
      assert(!/id="campo-medico"|id="boton-guardar-turno"|A quién pertenece/.test(html), `[una sola plantilla] ${nombre} ya no trae su propia copia del formulario`);
    }
  }

  // ===================== B. ESTRUCTURA: 4 secciones en orden =====================
  {
    const p = abrir("administrador");
    const titulos = [...p.d.querySelectorAll(".seccion-carga-encabezado h2")].map((e) => e.textContent);
    assert(JSON.stringify(titulos) === JSON.stringify(["Paciente", "Tratamiento", "Cuándo y dónde", "Para el equipo"]), "[estructura] 4 secciones, en el orden de uso: " + titulos.join(" · "));
    const orden = (id) => [...p.d.querySelectorAll("[id]")].findIndex((e) => e.id === id);
    const seccionDe = (id) => { const e = p.$(id); const s = e && e.closest("section"); return s ? s.querySelector("h2").textContent : (e && e.closest(".resumen-carga") ? "pie" : null); };
    const donde = { "campo-buscar-paciente": "Paciente", "campo-medico": "Tratamiento", "lista-protocolos": "Tratamiento", "campo-premedicacion": "Tratamiento", "campo-ciclo": "Tratamiento", "campo-sesion": "Tratamiento",
      "campo-dias-turno": "Cuándo y dónde", "campo-fecha": "Cuándo y dónde", "campo-horario-manual": "Cuándo y dónde", "campo-internado": "Cuándo y dónde", "campo-sillon-backup": "Cuándo y dónde",
      "campo-prioridad-turno": "Para el equipo", "campo-nota-inicial-turno": "Para el equipo", "boton-guardar-turno": "pie", "resumen-carga-texto": "pie" };
    const mal = Object.keys(donde).filter((id) => seccionDe(id) !== donde[id]);
    assert(mal.length === 0, "[estructura] cada bloque está en su sección" + (mal.length ? " — MAL UBICADOS: " + mal.map((id) => `${id}→${seccionDe(id)}`).join(", ") : ""));
    assert(orden("campo-sillon-backup") > orden("campo-horario-manual") && orden("campo-internado") > orden("campo-sillon-backup") && orden("resumen-carga-texto") > orden("campo-nota-inicial-turno"),
      "[estructura] Horario antes que Lugar, y el resumen al final (después de todo lo que se completa)");
    assert(p.$("campo-sillon-backup").hidden && p.$("campo-internado").hidden, "[estructura] los dos checkboxes que lee la lógica quedan ocultos (los maneja la cáscara visual)");
    assert(/Premedicación/.test(p.$("campo-premedicacion").parentElement.textContent) && /\+30 min/.test(p.$("campo-premedicacion").parentElement.textContent), "[estructura] la premedicación sigue indicando que suma 30 min");
    const ayuda = p.d.querySelector(".ayuda-desplegable").textContent;
    assert(/mejor hueco encontrado/.test(ayuda) && /sobreturno/.test(ayuda) && /atadura de día, el cupo por/.test(ayuda) && /bloqueos/.test(ayuda), "[estructura] los dos textos de ayuda siguen, plegados en '¿Cómo elige el sistema el lugar?' (no se perdió contenido)");
  }

  // ===================== C. VISIBILIDAD POR ROL =====================
  for (const [rol, horario, internado, prioridad, notaAuto] of [["administrador", true, true, true, false], ["enfermeria", true, true, false, false], ["medico", false, false, true, true], ["administrativo", false, false, false, true]]) {
    const p = abrir(rol);
    assert(p.visible("bloque-horario-manual") === horario && p.visible("bloque-internado") === internado && p.visible("bloque-prioridad-turno") === prioridad,
      `[rol ${rol}] Horario=${horario ? "sí" : "no"} · Internado=${internado ? "sí" : "no"} · Prioridad=${prioridad ? "sí" : "no"}`);
    assert(p.visible("nota-horario-automatico") === notaAuto, `[rol ${rol}] ${notaAuto ? "ve la nota 'se asigna el primer horario disponible'" : "no ve la nota (tiene el selector de Horario)"}`);
    assert(p.visible("bloque-sillon-backup") === true, `[rol ${rol}] con médico y protocolo elegidos aparece 'Puesto para inyectables'`);
  }
  {
    const p = abrir("administrador", { lleno: false });
    assert(p.visible("bloque-sillon-backup") === false, "[rol administrador] sin médico ni protocolo, 'Puesto para inyectables' no aparece (como antes)");
  }

  // ===================== D. CABLEADO: lo que se elige llega a la lógica de siempre =====================
  {
    const p = abrir("administrador"); await p.esperar();
    assert(p.marcado("horario-carga") === "automatico" && p.marcado("lugar-carga") === "sillon" && !p.$("campo-internado").checked && !p.$("campo-sillon-backup").checked, "[por defecto] Primer horario disponible + Sillón, sin nada tildado por debajo");
    let r = await p.guardar();
    assert(r.llamadas.length === 1 && r.llamadas[0][0] === "automatica" && !r.llamadas[0][1].soloSillonTipo, "[automático + sillón] va a la búsqueda automática de siempre, sin restricción de sillón");

    p.click(p.radio("horario-carga", "exacto")); await p.esperar();
    assert(p.visible("contenedor-hora-exacta") && p.marcado("horario-carga") === "exacto", "[hora exacta] al elegirla aparece el campo de hora");
    r = await p.guardar();
    assert(r.llamadas.length === 0 && /falta cargar la hora/.test(r.mensaje), "[hora exacta sin hora] no guarda ni busca: avisa que falta la hora (antes caía en silencio a la búsqueda automática)");
    p.$("campo-horario-manual").value = "11:00";
    r = await p.guardar();
    assert(r.llamadas.length === 1 && r.llamadas[0][0] === "horaExacta" && r.llamadas[0][1] === "11:00" && r.llamadas[0][2] === false, "[hora exacta 11:00] llega a buscarYGuardarConHorarioManual con '11:00' y sin restricción de puesto");

    p.click(p.radio("horario-carga", "automatico")); await p.esperar();
    assert(p.$("campo-horario-manual").value === "" && !p.visible("contenedor-hora-exacta"), "[volver a primer horario] se vacía y se oculta la hora (no queda un horario forzado escondido)");
    r = await p.guardar();
    assert(r.llamadas.length === 1 && r.llamadas[0][0] === "automatica", "[volver a primer horario] vuelve a la búsqueda automática");

    p.click(p.radio("lugar-carga", "backup")); await p.esperar();
    assert(p.$("campo-sillon-backup").checked && !p.$("campo-internado").checked && p.marcado("lugar-carga") === "backup", "[puesto para inyectables] tilda el campo de siempre (y solo ese)");
    r = await p.guardar();
    assert(r.llamadas[0][0] === "automatica" && r.llamadas[0][1].soloSillonTipo === "backup", "[puesto + automático] la búsqueda queda restringida al sillón backup");
    p.click(p.radio("horario-carga", "exacto")); p.$("campo-horario-manual").value = "10:30";
    r = await p.guardar();
    assert(r.llamadas[0][0] === "horaExacta" && r.llamadas[0][1] === "10:30" && r.llamadas[0][2] === true, "[puesto + hora exacta] llega con '10:30' y soloBackup = true");

    // Si "Puesto para inyectables" deja de estar disponible (se quitó el protocolo), la selección cae sola a "Sillón".
    p.click(p.radio("lugar-carga", "backup")); await p.esperar();
    p.w.eval(`protocolosSeleccionados = {}; actualizarResumenDuracion();`); await p.esperar();
    assert(!p.visible("bloque-sillon-backup") && !p.$("campo-sillon-backup").checked && p.marcado("lugar-carga") === "sillon", "[puesto deja de estar disponible] sin protocolo, el puesto se oculta, se destilda y la selección vuelve a Sillón");
    p.w.eval(`protocolosSeleccionados = { f1: { protocoloId: "p1", nombre: "FEC", duracionMinutos: 60 } }; actualizarResumenDuracion();`); await p.esperar();

    p.click(p.radio("lugar-carga", "internado")); await p.esperar();
    assert(p.$("campo-internado").checked && !p.$("campo-sillon-backup").checked && p.marcado("lugar-carga") === "internado", "[internado] tilda el campo de siempre y destilda el del puesto (excluyentes)");
    assert(p.marcado("horario-carga") === "exacto" && p.radio("horario-carga", "automatico").disabled, "[internado] fuerza 'Hora exacta' y deshabilita 'Primer horario disponible'");
    assert(/Guardar internado/.test(p.$("boton-guardar-turno").textContent), "[internado] el botón dice 'Guardar internado'");
    p.$("campo-horario-manual").value = "15:30";
    r = await p.guardar();
    assert(r.llamadas.length === 1 && r.llamadas[0][0] === "internado" && r.llamadas[0][1] === "15:30", "[internado + 15:30] llega a guardarTurnoInternado con '15:30' (sin buscar sillón)");
    p.$("campo-horario-manual").value = "";
    r = await p.guardar();
    assert(r.llamadas.length === 0 && /horario en que arranca el tratamiento/.test(r.mensaje), "[internado sin hora] el aviso de siempre, sin cambios");

    p.click(p.radio("lugar-carga", "sillon")); await p.esperar();
    assert(!p.$("campo-internado").checked && p.radio("horario-carga", "automatico").disabled === false && /Buscar disponibilidad/.test(p.$("boton-guardar-turno").textContent), "[volver a sillón] se destilda internado, se habilita 'Primer horario' y el botón recupera su texto");
  }
  {
    const p = abrir("enfermeria"); await p.esperar();
    p.click(p.radio("lugar-carga", "internado")); p.$("campo-horario-manual").value = "09:15";
    const r = await p.guardar();
    assert(r.llamadas[0][0] === "internado" && r.llamadas[0][1] === "09:15", "[enfermería] también puede cargar un internado con su hora");
  }
  {
    // El médico y el administrativo no ven ni pueden forzar hora: aunque el estado interno quedara en "exacto", se carga automático.
    const p = abrir("medico"); await p.esperar();
    p.w.eval(`modoHorarioCarga = "exacto"; document.getElementById("campo-horario-manual").value = "11:00";`);
    const r = await p.guardar();
    assert(r.llamadas.length === 1 && r.llamadas[0][0] === "automatica", "[médico] aunque quedara una hora cargada por debajo, se ignora: búsqueda automática (como siempre)");
  }

  // ===================== D1. Reglas aisladas (página nueva, sin hora cargada de pasos anteriores) =====================
  {
    const p = abrir("administrador"); await p.esperar();
    assert(p.$("campo-horario-manual").value === "" && p.marcado("horario-carga") === "automatico", "[internado aislado] arranca sin hora y en 'Primer horario'");
    p.click(p.radio("lugar-carga", "internado")); await p.esperar();
    assert(p.marcado("horario-carga") === "exacto" && p.visible("contenedor-hora-exacta") && p.radio("horario-carga", "automatico").disabled,
      "[internado aislado] al elegir Internado SIN hora cargada, igual pasa a 'Hora exacta', muestra el campo y bloquea 'Primer horario'");
  }
  {
    const p = abrir("administrador"); await p.esperar();
    p.w.eval(`document.getElementById("campo-horario-manual").value = "10:00"; sincronizarFormularioCarga();`);
    assert(p.marcado("horario-carga") === "exacto" && p.visible("contenedor-hora-exacta"), "[hora cargada por código] si el campo de hora llega con valor, la pantalla lo muestra como 'Hora exacta' (nunca queda un horario forzado escondido)");
  }

  // ===================== D2. El aviso se trae a la vista (dentro del modal se desplaza el modal, no la ventana) =====
  {
    const p = abrir("administrador", { lleno: false }); await p.esperar();
    p.w.eval(`window.__aVista = []; Element.prototype.scrollIntoView = function(o) { window.__aVista.push([this.id, o && o.block]); };`);
    await p.guardar();
    assert(/Falta seleccionar el paciente/.test(p.$("mensaje-general").textContent) && p.w.__aVista.some((x) => x[0] === "mensaje-general" && x[1] === "nearest"), "[aviso] un error de validación se trae a la vista (scrollIntoView) para que no quede escondido arriba del modal");
  }

  // ===================== E. FECHA: el botón activo sigue al estado =====================
  {
    const p = abrir("administrador", { lleno: false }); await p.esperar();
    const activo = () => p.d.querySelector(".segmentado-opcion.activo").id;
    assert(activo() === "boton-modo-dias" && p.visible("bloque-dias-turno") && !p.visible("bloque-fecha-manual"), "[fecha] arranca 'En días'");
    p.click(p.$("boton-modo-calendario")); await p.esperar();
    assert(activo() === "boton-modo-calendario" && p.w.eval("modoFechaTurno") === "calendario" && p.visible("bloque-fecha-manual") && !p.visible("bloque-dias-turno"), "[fecha] 'Fecha exacta' cambia el modo y muestra el calendario");
    p.click(p.$("boton-modo-dias")); await p.esperar();
    assert(activo() === "boton-modo-dias" && p.w.eval("modoFechaTurno") === "dias", "[fecha] 'En días' vuelve al modo por días");
    // Consultar disponibilidad cambia el modo por su cuenta (cargarEsteTurnoDesdeConsultaGrilla): la pantalla tiene que acompañar.
    p.w.eval(`modoFechaTurno = "calendario"; renderizarModoFecha();`);
    assert(activo() === "boton-modo-calendario", "[fecha] si el código cambia el modo (precarga desde Consultar disponibilidad), el botón activo lo acompaña");
    p.click(p.$("boton-modo-calendario"));
    assert(p.w.eval("modoFechaTurno") === "calendario", "[fecha] tocar el modo que ya está activo no hace nada raro");
  }

  // ===================== F. REINICIO tras guardar =====================
  {
    const p = abrir("administrador"); await p.esperar();
    p.click(p.radio("lugar-carga", "internado")); p.$("campo-horario-manual").value = "15:30"; await p.esperar();
    p.w.eval(`resetearFormularioCarga();`); await p.esperar();
    assert(p.marcado("lugar-carga") === "sillon" && p.marcado("horario-carga") === "automatico" && !p.$("campo-internado").checked && p.$("campo-horario-manual").value === "" && !p.visible("contenedor-hora-exacta"),
      "[reinicio] después de guardar, vuelve a Sillón + Primer horario, sin nada tildado ni hora cargada");
    assert(/Buscar disponibilidad/.test(p.$("boton-guardar-turno").textContent) && p.d.querySelector(".segmentado-opcion.activo").id === "boton-modo-dias", "[reinicio] el botón y la fecha también vuelven a su estado inicial");
    p.click(p.radio("horario-carga", "exacto")); await p.esperar();
    p.w.eval(`resetearFormularioCarga();`); await p.esperar();
    assert(p.marcado("horario-carga") === "automatico" && p.w.eval("modoHorarioCarga") === "automatico", "[reinicio] una 'Hora exacta' elegida sin hora tampoco sobrevive al reinicio");
  }

  // ===================== G. RESUMEN al pie =====================
  {
    const p = abrir("administrador", { lleno: false }); await p.esperar();
    const faltantes = () => [...p.d.querySelectorAll(".resumen-carga-faltante")].map((e) => e.textContent);
    assert(/falta elegir el paciente/.test(p.resumen()) && /falta elegir el médico/.test(p.resumen()) && /falta elegir al menos un protocolo/.test(p.resumen()) && /falta la fecha/.test(p.resumen()),
      "[resumen] formulario vacío: marca qué falta completar (" + faltantes().length + " pendientes, resaltados)");
    assert(/primer horario disponible/.test(p.resumen()) && /sillón/.test(p.resumen()), "[resumen] el horario y el lugar por defecto ya figuran");
  }
  {
    const p = abrir("administrador"); await p.esperar();
    p.w.eval(`document.getElementById("campo-premedicacion").checked = true; actualizarResumenDuracion();`); await p.esperar();
    const t = p.resumen();
    assert(t.startsWith("Pérez, Ana · Dr. Gómez") && !t.includes("Obra social") && !t.includes("DNI") && t.includes("Dr. Gómez") && t.includes("FEC + premedicación (1 h 30 min)") && t.includes(FECHA_VISTA) && p.d.querySelectorAll(".resumen-carga-faltante").length === 0,
      "[resumen] formulario completo: paciente · médico · protocolo + premedicación (1 h 30 min) · fecha · horario · lugar, sin pendientes → " + t);
    p.click(p.radio("lugar-carga", "internado")); p.$("campo-horario-manual").value = "15:30"; p.click(p.$("campo-horario-manual")); await p.esperar();
    assert(/internado, sin sillón, desde las 15:30/.test(p.resumen()), "[resumen] con internado: 'internado, sin sillón, desde las 15:30'");
    p.click(p.radio("lugar-carga", "backup")); await p.esperar();
    p.click(p.radio("horario-carga", "exacto")); p.$("campo-horario-manual").value = "10:30"; p.click(p.$("campo-horario-manual")); await p.esperar();
    assert(/a las 10:30/.test(p.resumen()) && /puesto para inyectables/.test(p.resumen()), "[resumen] con hora exacta y puesto: 'a las 10:30 · puesto para inyectables'");
    p.click(p.radio("horario-carga", "exacto")); p.$("campo-horario-manual").value = ""; p.click(p.$("campo-horario-manual")); await p.esperar();
    assert(/falta la hora exacta/.test(p.resumen()), "[resumen] 'Hora exacta' sin hora: lo marca como pendiente");
  }

  console.log("\nTODAS LAS PRUEBAS DEL FORMULARIO DE CARGA PASARON\n");
}

module.exports = { abrir };
if (require.main === module) principal();
