// B1 · Buscador de protocolos en la pantalla de carga de turnos (agenda.html real, clics reales):
//  · escribir palabras sueltas en cualquier orden encuentra el protocolo y los que EMPIEZAN igual salen primero;
//  · al elegir paciente aparecen los protocolos que ya tuvo ("Ya tuvo"); al elegir médico, los que más usa;
//  · al crear un protocolo nuevo al vuelo, si hay nombres parecidos se avisa y hace falta confirmar ("Crear igual").
const { abrirAgenda, esperar, T } = require("./test_agenda_e2e.js");

function assert(cond, msg) { if (!cond) { throw new Error("FALLA: " + msg); } console.log("OK: " + msg); }

const PROTOS = [
  { id: "p1", nombre: "FEC", duracionMinutos: 60 },
  { id: "p2", nombre: "AC-T", duracionMinutos: 90 },
  { id: "p3", nombre: "Carboplatino + Paclitaxel semanal", duracionMinutos: 120 },
  { id: "p4", nombre: "Trastuzumab 6 mg/kg", duracionMinutos: 45 },
  { id: "p5", nombre: "Zoledronico 4 mg", duracionMinutos: 30 },
  { id: "p6", nombre: "Cisplatino 40 semanal", duracionMinutos: 120 },
  { id: "p7", nombre: "Viejo protocolo", duracionMinutos: 20, activo: false }
];
const pr = (id) => { const p = PROTOS.find((x) => x.id === id); return { protocoloId: p.id, nombre: p.nombre, duracionMinutos: p.duracionMinutos }; };
const PX = { id: "PX", nombre: "Luz", apellido: "Paz", obraSocial: "OSDE", tipoDocumento: "DNI", numeroDocumento: "30111222" };
const OTRO = { id: "PY", activo: true, nombre: "Ana", apellido: "Gil", obraSocial: "PAMI", tipoDocumento: "DNI", numeroDocumento: "40111222" };
const LIBRE = { id: "PZ", activo: true, nombre: "Eva", apellido: "Sin", obraSocial: "OSDE", tipoDocumento: "DNI", numeroDocumento: "40999888" };
const TURNOS = [
  // Dr. Gómez (med1): FEC x3, AC-T x2
  T("c1", "entre-rios", "2030-10-08", 1, "09:00", "10:00", { protocolos: [pr("p1")] }),
  T("c2", "entre-rios", "2030-10-08", 2, "09:00", "10:00", { protocolos: [pr("p1")] }),
  T("c3", "entre-rios", "2030-10-09", 1, "09:00", "10:00", { protocolos: [pr("p1")] }),
  T("c4", "entre-rios", "2030-10-09", 2, "10:00", "11:00", { protocolos: [pr("p2")] }),
  T("c5", "entre-rios", "2030-10-10", 1, "09:00", "10:00", { protocolos: [pr("p2")] }),
  // Dra. Ruiz (med2) con la paciente PX: Trastuzumab x2, Zoledronico x1 (y uno anulado que no cuenta)
  T("x1", "entre-rios", "2030-10-08", 1, "11:00", "12:00", { medicoId: "med2", medicoNombre: "Dra. Ruiz", paciente: PX, protocolos: [pr("p4")] }),
  T("x2", "entre-rios", "2030-10-09", 1, "11:00", "12:00", { medicoId: "med2", medicoNombre: "Dra. Ruiz", paciente: PX, protocolos: [pr("p4")] }),
  T("x3", "entre-rios", "2030-10-10", 1, "11:00", "12:00", { medicoId: "med2", medicoNombre: "Dra. Ruiz", paciente: PX, protocolos: [pr("p5")] }),
  T("x4", "entre-rios", "2030-10-10", 2, "11:00", "12:00", { medicoId: "med2", medicoNombre: "Dra. Ruiz", paciente: PX, protocolos: [pr("p3")], estado: "anulado" })
];

async function abrir(rolOOpciones, opciones) {
  const rol = typeof rolOOpciones === "string" ? rolOOpciones : "administrador";
  const { turnos = TURNOS, protocolos = PROTOS, preparar } = (typeof rolOOpciones === "object" ? rolOOpciones : opciones) || {};
  const a = await abrirAgenda(rol, {}, { turnos: JSON.parse(JSON.stringify(turnos)), protocolos: JSON.parse(JSON.stringify(protocolos)) });
  a.w.open = () => ({ document: { write() {}, close() {} }, close() {}, focus() {}, print() {} });
  a.w.__STORE.pacientes = JSON.parse(JSON.stringify(a.w.__STORE.pacientes));
  a.w.__STORE.pacientes.push({ ...OTRO }, { ...LIBRE });
  if (preparar) preparar(a);
  a.w.__consultas = [];
  const $ = (id) => a.d.getElementById(id);
  a.$ = $;
  a.d.querySelector('button[onclick="abrirModalNuevoTurnoGrilla()"]').click();
  await esperar(a.w, () => !$("campo-buscar-paciente").disabled && $("campo-medico").options.length > 1, 600);
  await esperar(a.w, () => false, 20);
  a.ev = (el, tipo) => el.dispatchEvent(new a.w.Event(tipo, { bubbles: true }));
  a.elegirPaciente = async (texto) => {
    $("campo-buscar-paciente").value = texto; a.ev($("campo-buscar-paciente"), "input");
    a.d.querySelector("#resultados-busqueda-paciente .resultado-busqueda button").click();
    await esperar(a.w, () => false, 30);
  };
  a.elegirMedico = async (valor) => { $("campo-medico").value = valor; a.ev($("campo-medico"), "change"); await esperar(a.w, () => false, 10); };
  a.fila = (i) => a.d.querySelectorAll("#lista-protocolos .fila-medicamento")[i || 0];
  a.escribir = (texto, i) => { const inp = a.fila(i).querySelector(".inp-buscar-protocolo"); inp.value = texto; a.ev(inp, "input"); };
  a.resultados = (i) => Array.from(a.fila(i).querySelectorAll(".lista-resultados-protocolo .resultado-busqueda span")).map((s) => s.textContent.replace(/ \(\d+ min\)$/, ""));
  a.grupos = (i) => Array.from(a.fila(i).querySelectorAll(".sugerencias-protocolo .grupo-sugerencias")).map((g) => ({
    titulo: g.querySelector(".sugerencias-titulo").textContent,
    chips: Array.from(g.querySelectorAll("button.chip-protocolo")).map((b) => b.textContent.trim())
  }));
  a.chip = (nombre, i) => Array.from(a.fila(i).querySelectorAll("button.chip-protocolo")).find((b) => b.textContent.trim() === nombre);
  a.consultasPaciente = () => a.w.__consultas.filter((c) => c.coleccion === "turnos" && c.filtros.some((f) => f[0] === "paciente.id"));
  a.sel = (i) => a.w.eval("Object.values(protocolosSeleccionados)")[i || 0];
  return a;
}

(async () => {
  // ===== Búsqueda por palabras =====
  {
    const a = await abrir();
    a.escribir("paclitaxel carbo");
    assert(a.resultados().join("|") === "Carboplatino + Paclitaxel semanal", "[escribir] 'paclitaxel carbo' (al revés) encuentra 'Carboplatino + Paclitaxel semanal': " + a.resultados());
    a.escribir("semanal");
    assert(a.resultados().join("|") === "Cisplatino 40 semanal|Carboplatino + Paclitaxel semanal".split("|").sort((x, y) => x.localeCompare(y)).join("|") || a.resultados().length === 2, "[escribir] 'semanal' encuentra los dos que lo tienen: " + a.resultados());
    a.escribir("act");
    assert(a.resultados().join("|") === "AC-T", "[escribir] 'act' encuentra 'AC-T'");
    a.escribir("zzzz");
    assert(/No hay ningún protocolo/.test(a.fila().querySelector(".sin-resultados-protocolo").textContent), "[escribir] sin coincidencias: se avisa y queda la opción de agregar uno nuevo");
    assert(!!a.fila().querySelector(".boton-agregar-protocolo-nuevo"), "[escribir] el administrador sigue viendo '+ Agregar … como protocolo nuevo'");
    a.escribir("trastu");
    a.fila().querySelector(".lista-resultados-protocolo button").click();
    assert(a.sel().protocoloId === "p4" && a.sel().duracionMinutos === 45 && a.fila().querySelector(".inp-buscar-protocolo").value === "Trastuzumab 6 mg/kg", "[elegir] elegir un resultado lo deja seleccionado con su duración");
    assert(/45 min de protocolo/.test(a.$("resumen-duracion").textContent), "[elegir] y el resumen de duración se actualiza");
    assert(a.d.querySelectorAll(".inp-buscar-protocolo").length === 1 && !a.resultados().length, "[elegir] la lista de resultados se cierra");
  }
  // ===== Sugerencias: médico =====
  {
    const a = await abrir();
    assert(a.grupos().length === 0, "[inicio] sin paciente ni médico elegidos no hay sugerencias");
    await a.elegirMedico("med1");
    let g = a.grupos();
    assert(g.length === 1 && /Dr\. Gómez/.test(g[0].titulo) && g[0].chips.join("|") === "FEC|AC-T", `[médico] al elegir médico se ofrecen sus protocolos más usados, el más usado primero: ${JSON.stringify(g)}`);
    a.chip("AC-T").click();
    assert(a.sel().protocoloId === "p2" && a.sel().duracionMinutos === 90 && a.fila().querySelector(".inp-buscar-protocolo").value === "AC-T", "[médico] un clic en la sugerencia elige el protocolo con la duración del catálogo");
    assert(a.grupos().length === 0, "[médico] con el protocolo elegido esa fila ya no muestra sugerencias");
    a.d.querySelector('#formulario-carga button[onclick="agregarFilaProtocolo()"]') ? a.d.querySelector('#formulario-carga button[onclick="agregarFilaProtocolo()"]').click() : a.w.agregarFilaProtocolo();
    await esperar(a.w, () => false, 5);
    g = a.grupos(1);
    assert(g.length === 1 && g[0].chips.join("|") === "FEC", `[médico] en una segunda fila no se vuelve a ofrecer lo que ya está elegido: ${JSON.stringify(g)}`);
    await a.elegirMedico("otro");
    assert(a.grupos(1).length === 0, "[médico] 'Otro' médico no tiene sugerencias");
    await a.elegirMedico("");
    assert(a.grupos(1).length === 0, "[médico] sin médico no hay sugerencias");
  }
  // ===== Sugerencias: paciente =====
  {
    const a = await abrir();
    await a.elegirPaciente("Paz");
    let g = a.grupos();
    assert(g.length === 1 && /Ya tuvo/.test(g[0].titulo) && g[0].chips.join("|") === "Trastuzumab 6 mg/kg|Zoledronico 4 mg", `[paciente] al elegir paciente se ofrecen los protocolos que ya tuvo (más repetido primero, sin contar turnos anulados): ${JSON.stringify(g)}`);
    const cs = a.consultasPaciente();
    assert(cs.length === 1 && cs[0].filtros.some((f) => f[0] === "paciente.id" && f[2] === "PX") && cs[0].filtros.some((f) => f[0] === "estado" && f[2] === "activo"), "[paciente] se hizo UNA consulta, solo de turnos activos de ese paciente: " + JSON.stringify(cs));
    assert(cs[0].filtros.some((f) => f[0] === "__limit" && f[2] === 80), "[paciente] la consulta tiene tope (80 turnos) para no leer de más");
    await a.elegirMedico("med1");
    g = a.grupos();
    assert(g.length === 2 && /Ya tuvo/.test(g[0].titulo) && /Gómez/.test(g[1].titulo) && g[1].chips.join("|") === "FEC|AC-T", `[paciente + médico] se muestran los dos grupos: ${JSON.stringify(g)}`);
    await a.elegirMedico("med2");
    g = a.grupos();
    assert(g.length === 1 && /Ya tuvo/.test(g[0].titulo), `[sin repetir] lo que ya salió en 'Ya tuvo' no se repite en el grupo del médico: ${JSON.stringify(g)}`);
    a.w.quitarPacienteSeleccionado();
    await esperar(a.w, () => false, 10);
    g = a.grupos();
    assert(g.length === 1 && /Ruiz/.test(g[0].titulo) && !g.some((x) => /Ya tuvo/.test(x.titulo)), `[paciente] al quitar al paciente desaparece 'Ya tuvo' (queda lo del médico): ${JSON.stringify(g)}`);
    await a.elegirPaciente("Paz");
    assert(a.consultasPaciente().length === 1, "[paciente] volver a elegir al mismo paciente no repite la consulta (queda en memoria)");
    assert(a.grupos().length === 1 && /Ya tuvo/.test(a.grupos()[0].titulo), "[paciente] y vuelve a mostrar 'Ya tuvo'");
    a.chip("Zoledronico 4 mg").click();
    assert(a.sel().protocoloId === "p5", "[paciente] un clic elige el protocolo");
  }
  {
    // Sin médico elegido: al quitar al paciente (o si resulta dado de baja) desaparece "Ya tuvo".
    const a = await abrir();
    await a.elegirPaciente("Paz");
    assert(a.grupos().length === 1, "[quitar paciente] con el paciente elegido aparece 'Ya tuvo'");
    a.w.quitarPacienteSeleccionado();
    assert(a.grupos().length === 0, "[quitar paciente] al quitarlo, desaparece 'Ya tuvo'");
    const b = await abrir({ preparar: (x) => { x.w.__STORE.pacientes.find((p) => p.id === "PX").activo = false; } });
    b.w.eval("pacientesCacheCarga.push(" + JSON.stringify({ ...PX, activo: true }) + ")");
    await b.elegirPaciente("Paz");
    await esperar(b.w, () => false, 40);
    assert(b.w.eval("pacienteSeleccionadoCarga") === null && b.grupos().length === 0, "[dado de baja] si al elegirlo resulta dado de baja, no quedan sugerencias suyas: " + JSON.stringify(b.grupos()));
  }
  {
    // Quitar una fila devuelve a las otras lo que esa fila tenía elegido.
    const a = await abrir();
    await a.elegirMedico("med1");
    a.chip("FEC").click();
    a.w.agregarFilaProtocolo();
    await esperar(a.w, () => false, 5);
    assert(a.grupos(1)[0].chips.join("|") === "AC-T", "[quitar fila] la segunda fila ofrece solo lo que falta (AC-T)");
    a.fila(0).querySelector("[data-quitar]").click();
    await esperar(a.w, () => false, 5);
    assert(a.d.querySelectorAll("#lista-protocolos .fila-medicamento").length === 1 && a.grupos(0)[0].chips.join("|") === "FEC|AC-T", `[quitar fila] al quitar la fila 1, FEC vuelve a estar disponible en la que queda: ${JSON.stringify(a.grupos(0))}`);
  }
  {
    // Funciones de apoyo: cuentan solo turnos activos; juntan las dos fuentes de turnos en memoria sin repetir.
    const a = await abrir();
    const cuenta = a.w.eval(`contarProtocolosEnTurnos([
      { estado: "activo", fecha: "2030-10-01", protocolos: [{ protocoloId: "p1", nombre: "FEC" }] },
      { estado: "anulado", fecha: "2030-10-02", protocolos: [{ protocoloId: "p1", nombre: "FEC" }, { protocoloId: "p2", nombre: "AC-T" }] },
      { fecha: "2030-10-03", protocolos: [{ protocoloId: "p2", nombre: "AC-T" }] },
      { estado: "activo", fecha: "2030-10-04", protocolos: [{ protocoloId: "p3", nombre: "X" }, null, {}] }])`);
    assert(JSON.stringify(cuenta.map((c) => [c.protocoloId, c.veces, c.ultima])) === JSON.stringify([["p3", 1, "2030-10-04"], ["p2", 1, "2030-10-03"], ["p1", 1, "2030-10-01"]]),
      "[contar] no cuenta turnos anulados; a igual cantidad va primero el más reciente: " + JSON.stringify(cuenta));
    const ids = a.w.eval(`turnosExistentes = [{ id: "a", medicoId: "med1" }, { id: "b", medicoId: "med1" }, { id: "z", medicoId: "med2" }];
      turnosCacheGrilla = [{ id: "b", medicoId: "med1" }, { id: "c", medicoId: "med1" }, { id: "y", medicoId: "med2" }];
      turnosEnMemoriaDelMedico("med1").map(function(t) { return t.id; }).join(",")`);
    assert(ids === "a,b,c", "[médico] junta los turnos de la ventana y de la grilla, sin repetir y solo del médico: " + ids);
  }
  {
    // Máximo 6 sugerencias por grupo.
    const muchos = Array.from({ length: 8 }, (_, i) => ({ id: "m" + i, nombre: "Proto " + i, duracionMinutos: 30 }));
    const turnosMuchos = muchos.map((p, i) => T("mm" + i, "entre-rios", "2030-10-08", 1 + (i % 2), String(8 + i).padStart(2, "0") + ":00", String(9 + i).padStart(2, "0") + ":00", { protocolos: [{ protocoloId: p.id, nombre: p.nombre, duracionMinutos: 30 }] }));
    const a = await abrir({ turnos: turnosMuchos, protocolos: PROTOS.concat(muchos) });
    await a.elegirMedico("med1");
    assert(a.grupos()[0].chips.length === 6, "[tope] como mucho 6 sugerencias por grupo: " + a.grupos()[0].chips.length);
  }
  {
    const a = await abrir();
    await a.elegirPaciente("Sin");
    assert(a.grupos().length === 0, "[paciente sin historia] no aparece ningún grupo vacío");
    await a.elegirPaciente.call(null, "x").catch(() => {}); // (sin efecto)
  }
  {
    // Protocolos que ya no están activos en el catálogo no se ofrecen.
    const a = await abrir({ turnos: TURNOS.concat([T("v1", "entre-rios", "2030-10-10", 2, "09:00", "10:00", { medicoId: "med2", medicoNombre: "Dra. Ruiz", paciente: PX, protocolos: [pr("p7")] })]) });
    await a.elegirPaciente("Paz");
    assert(a.grupos()[0].chips.indexOf("Viejo protocolo") < 0, "[inactivos] un protocolo dado de baja del catálogo no se sugiere");
  }
  {
    // Si la consulta del historial falla, la pantalla sigue funcionando sin sugerencias.
    const a = await abrir({ preparar: (x) => { x.w.__fallaPaciente = true; } });
    await a.elegirPaciente("Paz");
    assert(a.w.eval("pacienteSeleccionadoCarga").id === "PX" && a.grupos().length === 0, "[falla] si la consulta falla, el paciente igual queda elegido y no hay sugerencias ni errores");
    a.escribir("fec");
    assert(a.resultados().join("|") === "FEC", "[falla] y la búsqueda de protocolos sigue andando");
    const inesperados = a.errores.filter((e) => !/No se pudo leer el historial de protocolos del paciente/.test(e));
    assert(inesperados.length === 0 && a.errores.length === 1, "[falla] solo queda el registro del error esperado en consola, sin errores sin atrapar: " + a.errores.join(" || "));
  }
  {
    // Cambió de paciente antes de que llegue la respuesta del primero: no se mezclan.
    let liberar; const espera = new Promise((r) => { liberar = r; });
    const a = await abrir({ preparar: (x) => { x.w.__demoraPaciente = { PX: espera }; } });
    await a.elegirPaciente("Paz");
    a.w.quitarPacienteSeleccionado();
    await a.elegirPaciente("Gil");
    liberar();
    await esperar(a.w, () => false, 40);
    assert(a.w.eval("pacienteSeleccionadoCarga").id === "PY" && a.grupos().length === 0, "[carrera] la respuesta tardía del paciente anterior no se muestra: " + JSON.stringify(a.grupos()));
  }
  {
    // Mientras se escribe, las sugerencias se esconden; al borrar el texto vuelven.
    const a = await abrir();
    await a.elegirPaciente("Paz");
    a.escribir("tras");
    assert(a.grupos().length === 0 && a.resultados().length === 1, "[escribiendo] al escribir, en lugar de las sugerencias se ven los resultados");
    a.escribir("");
    assert(a.grupos().length === 1 && a.resultados().length === 0, "[escribiendo] al borrar el texto vuelven las sugerencias");
  }
  // ===== Médico (rol): ve sus sugerencias de entrada y no puede crear protocolos =====
  {
    const a = await abrir("medico");
    const g = a.grupos();
    assert(g.length === 1 && /Gómez/.test(g[0].titulo) && g[0].chips[0] === "FEC", `[rol médico] su médico ya viene elegido: ve sus más usados: ${JSON.stringify(g)}`);
    a.escribir("zzzz");
    assert(!a.fila().querySelector(".boton-agregar-protocolo-nuevo"), "[rol médico] no se ofrece crear protocolos");
  }
  // ===== Crear al vuelo: aviso de nombres parecidos =====
  async function crear(a, nombre, duracion) {
    a.escribir(nombre);
    a.fila().querySelector(".boton-agregar-protocolo-nuevo").click();
    const bloque = a.fila().querySelector(".bloque-protocolo-nuevo");
    bloque.querySelector("input[type=number]").value = String(duracion);
    const boton = Array.from(bloque.querySelectorAll("button")).find((b) => /Agregar protocolo nuevo|Crear igual/.test(b.textContent));
    return { bloque, boton, clic: async () => { boton.click(); await esperar(a.w, () => false, 40); } };
  }
  const altasProtocolo = (a) => a.ops.filter((o) => o.op === "add" && o.path === "turneroProtocolos");
  {
    const a = await abrir();
    // "AC T" no coincide con el compacto de ninguno al buscar ("ac t" → palabras "ac" y "t": coincide con AC-T), así que se usa un nombre que no se encuentra pero se parece.
    const c = await crear(a, "Trastuzumab 6mg", 45);
    await c.clic();
    const aviso = c.bloque.querySelector(".aviso-protocolo-parecido");
    assert(!!aviso && /Trastuzumab 6 mg\/kg/.test(aviso.textContent), "[parecidos] antes de crear, avisa que ya existe 'Trastuzumab 6 mg/kg': " + (aviso && aviso.textContent));
    assert(altasProtocolo(a).length === 0, "[parecidos] y todavía no creó nada");
    const textoBoton = Array.from(c.bloque.querySelectorAll("button")).map((b) => b.textContent).join("|");
    assert(/Crear igual/.test(textoBoton), "[parecidos] el botón pasa a 'Crear igual': " + textoBoton);
    // usar el existente
    const usar = aviso.querySelector("button");
    usar.click();
    assert(a.sel().protocoloId === "p4" && altasProtocolo(a).length === 0, "[parecidos] 'usar' elige el protocolo existente sin crear nada");
  }
  {
    const a = await abrir();
    const c = await crear(a, "Trastuzumab 6mg", 45);
    await c.clic();
    const crearIgual = Array.from(c.bloque.querySelectorAll("button")).find((b) => /Crear igual/.test(b.textContent));
    crearIgual.click(); await esperar(a.w, () => false, 40);
    const altas = altasProtocolo(a);
    assert(altas.length === 1 && altas[0].data.nombre === "Trastuzumab 6mg" && altas[0].data.duracionMinutos === 45, "[parecidos] con 'Crear igual' lo crea");
    assert(a.sel() && a.sel().nombre === "Trastuzumab 6mg", "[parecidos] y queda elegido en la fila");
  }
  {
    const a = await abrir();
    const c = await crear(a, "Rituximab 375", 120);
    await c.clic();
    const altas = altasProtocolo(a);
    assert(altas.length === 1 && altas[0].data.nombre === "Rituximab 375" && !c.bloque.querySelector(".aviso-protocolo-parecido"), "[sin parecidos] un nombre nuevo se crea de una, sin pedir confirmación");
    assert(a.sel() && a.sel().nombre === "Rituximab 375" && a.w.eval("protocolosCacheCarga").some((p) => p.nombre === "Rituximab 375"), "[sin parecidos] queda elegido y en el catálogo de la pantalla");
  }
  {
    // Otra PC creó "Rituximab 500" hace un rato: esta PC no lo tiene en memoria. Al crear se relee el catálogo y se avisa.
    const a = await abrir();
    a.w.__STORE.turneroProtocolos.push({ id: "pOtraPC", nombre: "Rituximab 500", duracionMinutos: 120, activo: true });
    const c = await crear(a, "Rituximab 500 ", 120);
    a.w.__consultas = [];
    await c.clic();
    const aviso = c.bloque.querySelector(".aviso-protocolo-parecido");
    assert(a.w.__consultas.some((q) => q.coleccion === "turneroProtocolos") && altasProtocolo(a).length === 0, "[otra PC] antes de crear se relee el catálogo y no se crea un duplicado exacto");
    assert(/ya está en el catálogo|Rituximab 500/.test(c.bloque.textContent) && a.w.eval("protocolosCacheCarga").some((p) => p.id === "pOtraPC"), "[otra PC] se informa que ya existe y el catálogo de la pantalla queda al día");
    void aviso;
  }
  {
    // Si no se puede releer el catálogo (red), igual se puede crear (con el catálogo que ya tiene la pantalla).
    const a = await abrir();
    const c = await crear(a, "Rituximab 375", 120);
    a.w.__fallaProtocolos = true;
    await c.clic();
    assert(altasProtocolo(a).length === 1 && a.sel() && a.sel().nombre === "Rituximab 375", "[sin red para releer] igual crea el protocolo con el catálogo que ya tenía");
  }
  {
    // Si el aviso ya se mostró y se cambia la duración, sigue pidiendo confirmación solo una vez.
    const a = await abrir();
    const c = await crear(a, "Cisplatino semanal", 120);
    await c.clic();
    assert(!!c.bloque.querySelector(".aviso-protocolo-parecido") && altasProtocolo(a).length === 0, "[confirmación] primer clic: aviso, nada creado");
    const crearIgual = Array.from(c.bloque.querySelectorAll("button")).find((b) => /Crear igual/.test(b.textContent));
    crearIgual.click(); crearIgual.click(); await esperar(a.w, () => false, 40);
    assert(altasProtocolo(a).length === 1, "[confirmación] un doble clic rápido en 'Crear igual' crea UN solo protocolo (" + altasProtocolo(a).length + ")");
  }
  console.log("\nTODAS LAS PRUEBAS DEL BUSCADOR DE PROTOCOLOS EN LA CARGA PASARON\n");
})().catch((e) => { console.error(e); process.exit(1); });
