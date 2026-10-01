// Etapa 5C, P4 (punto 2.2) — Formulario de carga de turnos: UNA sola plantilla.
//
// Antes, el formulario estaba escrito dos veces (carga.html y el modal "+ Nuevo turno" de
// agenda.html, copia exacta una de la otra) y crecía "por parches": cada función nueva se
// agregaba al final. Ahora las dos pantallas lo montan desde acá: montarFormularioCarga().
//
// Reglas de diseño (decididas con Elías):
//  - 4 secciones en orden de uso: Paciente · Tratamiento · Cuándo y dónde · Para el equipo.
//  - Las opciones que decidían juntas "cuándo y dónde" y estaban en tres lugares distintos
//    (internado, solo inyectables, hora exacta) ahora viven en dos grupos: Horario y Lugar.
//  - Un resumen fijo al pie, antes del botón de guardar.
//
// Regla de seguridad (para no arriesgar la carga diaria): ESTE ARCHIVO ES SOLO LA CAPA
// VISUAL. turnero-carga.js sigue leyendo exactamente los mismos ids de siempre. Los radios
// de Horario y Lugar no guardan nada por su cuenta: manejan los campos de siempre
// (campo-sillon-backup, campo-internado, campo-horario-manual), que quedan ocultos. La
// lógica de búsqueda, validación y guardado no cambió.

// Estado puramente visual: qué opción de "Horario" está elegida. "exacto" sin hora cargada
// se valida al guardar (horarioExactoSinHoraCarga, usada por intentarGuardarTurno).
let modoHorarioCarga = "automatico";

function armarHtmlFormularioCarga() {
  return `
<div class="formulario-carga">

  <section class="seccion-carga" aria-labelledby="titulo-seccion-paciente">
    <div class="seccion-carga-encabezado"><span class="seccion-carga-numero">1</span><h2 id="titulo-seccion-paciente">Paciente</h2></div>
    <div id="paciente-seleccionado" class="paciente-seleccionado" style="display:none;">
      <span id="texto-paciente-seleccionado"></span>
      <button type="button" class="enlace-accion peligro" onclick="quitarPacienteSeleccionado()">quitar</button>
    </div>
    <div id="bloque-busqueda-paciente">
      <div class="campo">
        <input type="text" id="campo-buscar-paciente" placeholder="Buscar por apellido, nombre o documento" aria-label="Buscar paciente" />
      </div>
      <div id="resultados-busqueda-paciente"></div>
      <div id="sin-resultados" class="ayuda-carga" style="display:none;">
        No se encontró ningún paciente. Podés darlo de alta:
        <button type="button" class="enlace-accion" onclick="mostrarAltaRapida()">dar de alta</button>
        <button type="button" id="boton-actualizar-pacientes" class="enlace-accion" onclick="actualizarListadoPacientes()">actualizar listado</button>
      </div>
      <div id="bloque-alta-rapida" class="bloque-alta-rapida" style="display:none;">
        <div class="fila-3">
          <div class="campo" style="margin-bottom:0;">
            <label for="alta-tipo-documento">Tipo de documento</label>
            <select id="alta-tipo-documento">
              <option value="DNI">DNI</option>
              <option value="LC">Libreta cívica</option>
              <option value="LE">Libreta de enrolamiento</option>
            </select>
          </div>
          <div class="campo" style="margin-bottom:0;">
            <label for="alta-numero-documento">Número de documento</label>
            <input type="text" id="alta-numero-documento" inputmode="numeric" placeholder="Sin puntos ni espacios" />
          </div>
          <div class="campo" style="margin-bottom:0;">
            <label>&nbsp;</label>
            <button type="button" class="boton-principal" onclick="altaRapidaPaciente()">Guardar paciente</button>
          </div>
        </div>
        <div class="fila-2">
          <div class="campo" style="margin-bottom:0;">
            <label for="alta-nombre">Nombre</label>
            <input type="text" id="alta-nombre" />
          </div>
          <div class="campo" style="margin-bottom:0;">
            <label for="alta-apellido">Apellido</label>
            <input type="text" id="alta-apellido" />
          </div>
        </div>
        <div class="campo">
          <label for="alta-obra-social">Obra social</label>
          <select id="alta-obra-social">
            <option value="">Elegir obra social</option>
          </select>
        </div>
        <div id="mensaje-alta-rapida" class="mensaje-info error" style="display:none;margin-top:10px;"></div>
      </div>
    </div>
  </section>

  <section class="seccion-carga" aria-labelledby="titulo-seccion-tratamiento">
    <div class="seccion-carga-encabezado"><span class="seccion-carga-numero">2</span><h2 id="titulo-seccion-tratamiento">Tratamiento</h2></div>
    <div class="fila-2">
      <div class="campo" style="margin-bottom:0;">
        <label for="campo-medico">Médico</label>
        <select id="campo-medico"></select>
      </div>
      <div class="campo" style="margin-bottom:0;">
        <label>Sede</label>
        <div id="sede-automatica-info" style="display:none;padding-top:8px;">
          <span class="badge" id="badge-sede-automatica"></span>
        </div>
        <div id="aviso-sede-indefinida" class="ayuda-carga" style="display:none;">
          Este médico no tiene días cargados en ninguna sede. Elegí la sede a mano.
        </div>
        <select id="campo-sede-manual" aria-label="Sede" style="display:none;"></select>
      </div>
    </div>
    <div class="campo" id="bloque-medico-otro" style="display:none;">
      <label for="campo-medico-otro-nombre">Nombre del profesional</label>
      <input type="text" id="campo-medico-otro-nombre" placeholder="Nombre y apellido" />
    </div>

    <div class="grupo-carga">
      <span class="grupo-carga-titulo">Protocolos</span>
      <div id="lista-protocolos"></div>
      <button type="button" class="enlace-accion enlace-sin-margen" onclick="agregarFilaProtocolo()">+ agregar otro protocolo</button>
    </div>

    <label class="opcion-check">
      <input type="checkbox" id="campo-premedicacion" />
      <span>Premedicación / control de signos vitales <small>(+30 min fijos)</small></span>
    </label>

    <div class="fila-2">
      <div class="campo" style="margin-bottom:0;">
        <label for="campo-ciclo">Ciclo</label>
        <input type="number" id="campo-ciclo" min="1" step="1" placeholder="1" />
      </div>
      <div class="campo" style="margin-bottom:0;">
        <label for="campo-sesion">Sesión</label>
        <input type="number" id="campo-sesion" min="1" step="1" placeholder="1" />
      </div>
    </div>
    <div id="resumen-duracion" class="resumen-suma ok resumen-duracion-carga"></div>
  </section>

  <section class="seccion-carga" aria-labelledby="titulo-seccion-cuando">
    <div class="seccion-carga-encabezado"><span class="seccion-carga-numero">3</span><h2 id="titulo-seccion-cuando">Cuándo y dónde</h2></div>

    <div class="grupo-carga">
      <span class="grupo-carga-titulo">Fecha</span>
      <div class="segmentado" role="group" aria-label="Cómo elegir la fecha">
        <button type="button" id="boton-modo-dias" class="segmentado-opcion activo" aria-pressed="true" onclick="elegirModoFechaCarga('dias')">En días</button>
        <button type="button" id="boton-modo-calendario" class="segmentado-opcion" aria-pressed="false" onclick="elegirModoFechaCarga('calendario')">Fecha exacta</button>
      </div>
      <div id="bloque-dias-turno">
        <div class="fila-fecha-carga">
          <label for="campo-dias-turno">¿En cuántos días es el turno? (0 a 60)</label>
          <input type="number" id="campo-dias-turno" min="0" step="1" placeholder="Ej: 12" style="max-width:110px;" />
          <button type="button" class="boton-chico" onclick="usarTurnoHoy()">Hoy</button>
        </div>
        <div id="fecha-calculada-info" style="margin-top:8px;display:none;">
          <span class="badge" id="badge-fecha-calculada"></span>
        </div>
      </div>
      <div id="bloque-fecha-manual" style="display:none;">
        <div class="fila-fecha-carga">
          <label for="campo-fecha">Fecha exacta</label>
          <input type="date" id="campo-fecha" style="max-width:200px;" />
        </div>
      </div>
    </div>

    <div class="grupo-carga" id="bloque-horario-manual" style="display:none;">
      <span class="grupo-carga-titulo">Horario</span>
      <label class="opcion-carga seleccionada" id="opcion-horario-automatico">
        <input type="radio" name="horario-carga" value="automatico" checked onchange="elegirHorarioCarga('automatico')" />
        <span class="opcion-carga-texto"><strong>Primer horario disponible</strong>
          <small>El sistema elige el lugar que menos tiempo desperdicia</small></span>
      </label>
      <label class="opcion-carga" id="opcion-horario-exacto">
        <input type="radio" name="horario-carga" value="exacto" onchange="elegirHorarioCarga('exacto')" />
        <span class="opcion-carga-texto"><strong>Hora exacta</strong>
          <small>Se fuerza por encima de la atadura de día, el cupo y la franja del médico</small></span>
      </label>
      <div id="contenedor-hora-exacta" class="contenedor-hora-exacta" style="display:none;">
        <label for="campo-horario-manual">Hora</label>
        <input type="time" id="campo-horario-manual" style="max-width:150px;" />
      </div>
    </div>
    <div id="nota-horario-automatico" class="ayuda-carga" style="display:none;">
      Se asigna el primer horario disponible desde la fecha elegida.
    </div>

    <div class="grupo-carga">
      <span class="grupo-carga-titulo">Lugar</span>
      <label class="opcion-carga seleccionada" id="opcion-lugar-sillon">
        <input type="radio" name="lugar-carga" value="sillon" checked onchange="elegirLugarCarga('sillon')" />
        <span class="opcion-carga-texto"><strong>Sillón</strong></span>
      </label>
      <div id="bloque-sillon-backup" style="display:none;">
        <label class="opcion-carga" id="opcion-lugar-backup">
          <input type="radio" name="lugar-carga" value="backup" onchange="elegirLugarCarga('backup')" />
          <span class="opcion-carga-texto"><strong>Puesto para inyectables</strong>
            <small>Busca únicamente en ese puesto</small></span>
        </label>
        <input type="checkbox" id="campo-sillon-backup" hidden />
      </div>
      <div id="bloque-internado" style="display:none;">
        <label class="opcion-carga opcion-secundaria" id="opcion-lugar-internado">
          <input type="radio" name="lugar-carga" value="internado" onchange="elegirLugarCarga('internado')" />
          <span class="opcion-carga-texto"><strong>Paciente internado</strong>
            <small>No ocupa sillón ni imprime comprobante · pide hora exacta</small></span>
        </label>
        <input type="checkbox" id="campo-internado" hidden />
      </div>
    </div>

    <details class="ayuda-desplegable">
      <summary>¿Cómo elige el sistema el lugar?</summary>
      <p>Para la fecha, el sistema va a intentar ubicar el turno el día que elijas. Si hay lugar disponible,
      se guardará automáticamente en el mejor hueco encontrado (el que menos tiempo desperdicia).
      Si no hay lugar en los próximos 10 días, se te ofrecerá la opción de cargar como sobreturno.</p>
      <p>El horario se asignará automáticamente según la disponibilidad encontrada, salvo que elijas "Hora exacta"
      (administrador o enfermería). En ese caso se fuerza ese horario por encima de la atadura de día, el cupo por
      porcentaje y la franja horaria del médico. Siempre se respeta que haya sillón libre a esa hora, los bloqueos
      vigentes y el horario de apertura y cierre de la sede.</p>
    </details>
  </section>

  <section class="seccion-carga" aria-labelledby="titulo-seccion-equipo">
    <div class="seccion-carga-encabezado"><span class="seccion-carga-numero">4</span><h2 id="titulo-seccion-equipo">Para el equipo</h2><span class="seccion-carga-opcional">opcional</span></div>
    <div class="campo" id="bloque-prioridad-turno" style="display:none;">
      <label for="campo-prioridad-turno">Prioridad del paciente</label>
      <select id="campo-prioridad-turno" style="max-width:320px;">
        <option value="">Sin definir</option>
        <option value="rojo">🔴 Rojo — hay que verlo obligatoriamente</option>
        <option value="amarillo">🟡 Amarillo — trae análisis/consulta corta</option>
        <option value="verde">🟢 Verde — pasa directo a hospital de día</option>
      </select>
    </div>
    <div class="campo" id="bloque-nota-inicial-turno" style="margin-bottom:0;">
      <button type="button" id="boton-abrir-nota-inicial-turno" class="enlace-accion enlace-sin-margen" onclick="mostrarNotaInicialCarga()">+ Agregar un comentario</button>
      <div id="contenedor-nota-inicial-turno" style="display:none;margin-top:6px;">
        <textarea id="campo-nota-inicial-turno" maxlength="200" rows="2" aria-label="Comentario para el equipo"
          style="width:100%;box-sizing:border-box;font-size:13px;"
          placeholder="Observación para el equipo (la va a poder ver y editar cualquier rol; solo vos podés editarla o borrarla después)"></textarea>
      </div>
    </div>
  </section>

  <div class="resumen-carga">
    <div class="resumen-carga-contenido">
      <span class="resumen-carga-titulo">Resumen antes de guardar</span>
      <span id="resumen-carga-texto" class="resumen-carga-texto"></span>
    </div>
    <button type="button" id="boton-guardar-turno" class="boton-principal" onclick="intentarGuardarTurno()">Buscar disponibilidad y guardar turno</button>
  </div>

</div>`;
}

// Monta el formulario en el contenedor y deja listo el resumen. Se llama una vez por
// pantalla, ANTES de iniciarCargaTurno() (que engancha los eventos de los campos).
function montarFormularioCarga(idContenedor) {
  const contenedor = document.getElementById(idContenedor);
  if (!contenedor) return;
  contenedor.innerHTML = armarHtmlFormularioCarga();

  // El resumen se refresca ante cualquier cambio dentro del formulario. El setTimeout deja
  // que corran primero los manejadores propios de cada campo (p. ej. elegir un paciente de
  // la lista) y recién después se lee el estado ya actualizado.
  ["input", "change", "click"].forEach((evento) => {
    contenedor.addEventListener(evento, programarActualizacionResumenCarga);
  });
  sincronizarFormularioCarga();
}

let temporizadorResumenCarga = null;
function programarActualizacionResumenCarga() {
  if (temporizadorResumenCarga) clearTimeout(temporizadorResumenCarga);
  temporizadorResumenCarga = setTimeout(sincronizarFormularioCarga, 0);
}

// ---------- Comportamiento de los grupos "Fecha", "Horario" y "Lugar" ----------

function elegirModoFechaCarga(modo) {
  if (typeof modoFechaTurno === "undefined" || modoFechaTurno === modo) return;
  modoFechaTurno = modo;
  renderizarModoFecha(); // también sincroniza la cáscara
}

function elegirLugarCarga(valor) {
  const backup = document.getElementById("campo-sillon-backup");
  const internado = document.getElementById("campo-internado");
  if (backup) backup.checked = valor === "backup";
  if (internado) internado.checked = valor === "internado";
  sincronizarFormularioCarga(); // un internado siempre pide hora: la sincronización fuerza "Hora exacta"
  if (valor === "internado") enfocarHoraExactaCarga();
}

function elegirHorarioCarga(modo) {
  modoHorarioCarga = modo;
  if (modo === "automatico") {
    const hora = document.getElementById("campo-horario-manual");
    if (hora) hora.value = "";
  }
  sincronizarFormularioCarga();
  if (modo === "exacto") enfocarHoraExactaCarga();
}

function enfocarHoraExactaCarga() {
  const hora = document.getElementById("campo-horario-manual");
  if (hora && typeof hora.focus === "function") hora.focus();
}

function formularioPermiteHoraExacta() {
  return typeof rolActualCarga !== "undefined" && (rolActualCarga === "administrador" || rolActualCarga === "enfermeria");
}

function esInternadoTildadoCarga() {
  const campo = document.getElementById("campo-internado");
  return !!(campo && campo.checked);
}

// "Hora exacta" elegida pero sin hora cargada: intentarGuardarTurno lo corta con un mensaje
// (sin esto, un guardado así caería en silencio a la búsqueda automática).
function horarioExactoSinHoraCarga() {
  if (!formularioPermiteHoraExacta() || esInternadoTildadoCarga()) return false;
  const hora = document.getElementById("campo-horario-manual");
  return modoHorarioCarga === "exacto" && !!hora && !hora.value;
}

// Tras guardar un turno (resetearFormularioCarga) el formulario vuelve a su estado inicial.
function reiniciarFormularioCargaUi() {
  modoHorarioCarga = "automatico";
}

// ---------- Sincronización: la pantalla se deriva SIEMPRE del estado de los campos ----------
// Nunca escribe en los campos que lee carga.js (salvo vaciar la hora al pasar a "primer
// horario"), y nunca dispara eventos: no puede entrar en un ciclo.
function sincronizarFormularioCarga() {
  if (!document.getElementById("resumen-carga-texto")) return; // formulario todavía no montado

  const permiteHora = formularioPermiteHoraExacta();
  const internado = esInternadoTildadoCarga();
  const backup = !!(document.getElementById("campo-sillon-backup") || {}).checked;
  const campoHora = document.getElementById("campo-horario-manual");

  // Fecha: el botón activo sigue a modoFechaTurno (que también cambian Consultar disponibilidad y el reinicio).
  const modoFecha = typeof modoFechaTurno !== "undefined" ? modoFechaTurno : "dias";
  marcarActivo("boton-modo-dias", modoFecha === "dias");
  marcarActivo("boton-modo-calendario", modoFecha !== "dias");

  // Lugar
  const lugar = internado ? "internado" : (backup ? "backup" : "sillon");
  marcarRadio("lugar-carga", lugar, { sillon: "opcion-lugar-sillon", backup: "opcion-lugar-backup", internado: "opcion-lugar-internado" });

  // Horario
  if (!permiteHora) modoHorarioCarga = "automatico";
  else if (internado || (campoHora && campoHora.value)) modoHorarioCarga = "exacto";
  marcarRadio("horario-carga", modoHorarioCarga, { automatico: "opcion-horario-automatico", exacto: "opcion-horario-exacto" });
  const radioAutomatico = document.querySelector('input[name="horario-carga"][value="automatico"]');
  if (radioAutomatico) radioAutomatico.disabled = internado; // un internado no tiene "primer horario"
  const contHora = document.getElementById("contenedor-hora-exacta");
  if (contHora) contHora.style.display = (permiteHora && modoHorarioCarga === "exacto") ? "block" : "none";
  const notaAuto = document.getElementById("nota-horario-automatico");
  if (notaAuto) notaAuto.style.display = permiteHora ? "none" : "block";

  // Botón de guardar: dice lo que va a hacer
  const boton = document.getElementById("boton-guardar-turno");
  if (boton && !boton.disabled) {
    boton.textContent = internado ? "Guardar internado" : "Buscar disponibilidad y guardar turno";
  }

  renderizarResumenCarga({ internado, backup, permiteHora });
}

function marcarActivo(id, activo) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("activo", activo);
  el.setAttribute("aria-pressed", activo ? "true" : "false");
}

function marcarRadio(nombre, valor, idsOpciones) {
  document.querySelectorAll(`input[name="${nombre}"]`).forEach((r) => { r.checked = r.value === valor; });
  Object.keys(idsOpciones).forEach((clave) => {
    const op = document.getElementById(idsOpciones[clave]);
    if (op) op.classList.toggle("seleccionada", clave === valor);
  });
}

// ---------- Resumen fijo al pie ----------

function formatearMinutosCarga(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function valorCampoCarga(id) {
  const el = document.getElementById(id);
  return el ? el.value : "";
}

function visibleCarga(id) {
  const el = document.getElementById(id);
  return !!el && el.style.display !== "none";
}

// Devuelve las partes del resumen: { texto, falta } — "falta" se resalta para que se vea
// qué falta completar antes de guardar.
function partesResumenCarga(estado) {
  const partes = [];

  // Solo "Apellido, Nombre": el documento y la obra social ya se ven arriba, en la sección Paciente.
  let textoPaciente = "";
  if (visibleCarga("paciente-seleccionado")) {
    const pac = typeof pacienteSeleccionadoCarga !== "undefined" ? pacienteSeleccionadoCarga : null;
    textoPaciente = pac && (pac.apellido || pac.nombre)
      ? `${pac.apellido || ""}, ${pac.nombre || ""}`.replace(/^,\s*|,\s*$/g, "").trim()
      : (document.getElementById("texto-paciente-seleccionado").textContent || "").trim();
  }
  partes.push(textoPaciente ? { texto: textoPaciente } : { texto: "falta elegir el paciente", falta: true });

  const selMedico = document.getElementById("campo-medico");
  if (selMedico && selMedico.value === "otro") {
    const nombre = valorCampoCarga("campo-medico-otro-nombre").trim();
    partes.push(nombre ? { texto: nombre } : { texto: "falta el nombre del profesional", falta: true });
  } else if (selMedico && selMedico.value && selMedico.selectedIndex >= 0) {
    partes.push({ texto: selMedico.options[selMedico.selectedIndex].textContent.trim() });
  } else {
    partes.push({ texto: "falta elegir el médico", falta: true });
  }

  const protocolos = typeof protocolosSeleccionados !== "undefined"
    ? Object.values(protocolosSeleccionados).filter((p) => p !== null) : [];
  if (protocolos.length === 0) {
    partes.push({ texto: "falta elegir al menos un protocolo", falta: true });
  } else {
    const premed = !!(document.getElementById("campo-premedicacion") || {}).checked;
    const suma = protocolos.reduce((t, p) => t + (Number(p.duracionMinutos) || 0), 0);
    const extra = premed && typeof PREMEDICACION_MINUTOS !== "undefined" ? PREMEDICACION_MINUTOS : 0;
    const nombres = protocolos.map((p) => p.nombre).join(" + ") + (premed ? " + premedicación" : "");
    partes.push({ texto: `${nombres} (${formatearMinutosCarga(suma + extra)})` });
  }

  if (visibleCarga("sede-automatica-info")) {
    const t = (document.getElementById("badge-sede-automatica").textContent || "").trim();
    if (t) partes.push({ texto: t });
  } else if (visibleCarga("campo-sede-manual")) {
    const s = document.getElementById("campo-sede-manual");
    partes.push(s.value && s.selectedIndex >= 0 ? { texto: s.options[s.selectedIndex].textContent.trim() } : { texto: "falta elegir la sede", falta: true });
  }

  const modoFecha = typeof modoFechaTurno !== "undefined" ? modoFechaTurno : "dias";
  if (modoFecha === "dias") {
    if (visibleCarga("fecha-calculada-info")) {
      partes.push({ texto: (document.getElementById("badge-fecha-calculada").textContent || "").replace(/^Fecha calculada:\s*/i, "").trim() });
    } else {
      partes.push({ texto: "falta la fecha", falta: true });
    }
  } else {
    const f = valorCampoCarga("campo-fecha");
    partes.push(f ? { texto: f.split("-").reverse().join("/") } : { texto: "falta la fecha", falta: true });
  }

  const hora = valorCampoCarga("campo-horario-manual");
  if (estado.internado) {
    partes.push(hora ? { texto: `internado, sin sillón, desde las ${hora}` } : { texto: "internado: falta la hora en que arranca", falta: true });
  } else {
    if (estado.permiteHora && modoHorarioCarga === "exacto") {
      partes.push(hora ? { texto: `a las ${hora}` } : { texto: "falta la hora exacta", falta: true });
    } else {
      partes.push({ texto: "primer horario disponible" });
    }
    partes.push({ texto: estado.backup ? "puesto para inyectables" : "sillón" });
  }
  return partes;
}

function renderizarResumenCarga(estado) {
  const cont = document.getElementById("resumen-carga-texto");
  if (!cont) return;
  const partes = partesResumenCarga(estado);
  cont.textContent = "";
  partes.forEach((p, i) => {
    if (i > 0) cont.appendChild(document.createTextNode(" · "));
    const span = document.createElement("span");
    span.textContent = p.texto;
    if (p.falta) span.className = "resumen-carga-faltante";
    cont.appendChild(span);
  });
}
