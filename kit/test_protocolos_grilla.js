// B1 · Los buscadores de protocolo de "Modificar turno" y de "Consultar disponibilidad" también encuentran por palabras sueltas
// en cualquier orden y con los que empiezan igual primero (antes: el texto tenía que estar tal cual dentro del nombre).
const { abrirAgenda, esperar } = require("./test_agenda_e2e.js");
function assert(cond, msg) { if (!cond) { throw new Error("FALLA: " + msg); } console.log("OK: " + msg); }
const PROTOS = [{ id: "p1", nombre: "FEC", duracionMinutos: 60 }, { id: "p3", nombre: "Carboplatino + Paclitaxel semanal", duracionMinutos: 120 },
  { id: "p4", nombre: "Pertuzumab + Trastuzumab", duracionMinutos: 45 }, { id: "p5", nombre: "Trastuzumab 6 mg/kg", duracionMinutos: 45 }, { id: "p2", nombre: "AC-T", duracionMinutos: 90 }];
const resultados = (a, lista) => Array.from(a.d.querySelectorAll(`#${lista} .lista-resultados-protocolo .resultado-busqueda span`)).map((s) => s.textContent.replace(/ \(\d+ min\)$/, ""));
async function probar(nombre, abrir, lista, agregarFila, sel) {
  const a = await abrirAgenda("administrador", {}, { protocolos: JSON.parse(JSON.stringify(PROTOS)) });
  await abrir(a);
  if (agregarFila) a.w.eval(agregarFila);
  const fila = a.d.querySelector(`#${lista} .fila-medicamento:last-child`);
  const inp = fila.querySelector(".inp-buscar-protocolo");
  const escribir = (t) => { inp.value = t; inp.dispatchEvent(new a.w.Event("input", { bubbles: true })); };
  escribir("paclitaxel carbo");
  assert(resultados(a, lista).join("|") === "Carboplatino + Paclitaxel semanal", `[${nombre}] 'paclitaxel carbo' (al revés) encuentra 'Carboplatino + Paclitaxel semanal'`);
  escribir("trastu");
  assert(resultados(a, lista).join("|") === "Trastuzumab 6 mg/kg|Pertuzumab + Trastuzumab", `[${nombre}] el que EMPIEZA con Trastuzumab sale antes: ${resultados(a, lista)}`);
  escribir("act");
  assert(resultados(a, lista).join("|") === "AC-T", `[${nombre}] 'act' encuentra 'AC-T'`);
  fila.querySelector(".lista-resultados-protocolo button").click();
  assert(a.w.eval(sel).filter(Boolean).some((p) => p.protocoloId === "p2" && p.duracionMinutos === 90), `[${nombre}] elegir el resultado lo deja seleccionado`);
  escribir("zzzz");
  assert(/No hay ningún protocolo/.test(fila.querySelector(".sin-resultados-protocolo").textContent), `[${nombre}] sin coincidencias se avisa`);
}
(async () => {
  await probar("Consultar disponibilidad", (a) => a.w.abrirConsultaDisponibilidadGrilla(), "lista-protocolos-consulta-grilla", "agregarFilaProtocoloConsultaGrilla()", "Object.values(protocolosSeleccionadosConsultaGrilla)");
  await probar("Modificar turno", (a) => a.w.abrirModificarGrilla("er1"), "lista-protocolos-modificar", "agregarFilaProtocoloModificar()", "Object.values(protocolosSeleccionadosModificar)");
  console.log("\nTODAS LAS PRUEBAS DE LOS BUSCADORES DE PROTOCOLO DE LA GRILLA PASARON\n");
})().catch((e) => { console.error(e); process.exit(1); });
