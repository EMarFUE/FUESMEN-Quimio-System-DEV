// B1 · Buscador de protocolos: palabras sueltas en cualquier orden, con los que EMPIEZAN con lo escrito primero,
// y detección de nombres parecidos al crear un protocolo al vuelo. Funciones puras de js/turnero-carga.js.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

function assert(cond, msg) { if (!cond) { throw new Error("FALLA: " + msg); } console.log("OK: " + msg); }
const srcCarga = fs.readFileSync(path.join(__dirname, "../repo/js/turnero-carga.js"), "utf8");
const w = new JSDOM(`<!DOCTYPE html><html><body><script>${srcCarga}</script></body></html>`, { runScripts: "dangerously" }).window;

const N = (nombre, extra) => ({ id: "p-" + nombre, nombre, duracionMinutos: 60, activo: true, ...(extra || {}) });
const CATALOGO = ["FEC", "FEC 100 x6", "AC-T", "AC-T dosis densa", "Carboplatino + Paclitaxel semanal", "Paclitaxel semanal", "Cisplatino 40 semanal",
  "Gemcitabina + Cisplatino", "Trastuzumab 6 mg/kg", "Pertuzumab + Trastuzumab", "Zoledronico 4 mg", "Efectivo test"].map((n) => N(n));
const buscar = (t, cat) => w.buscarProtocolosPorTexto(t, cat || CATALOGO).map((p) => p.nombre);
const parecidos = (t, cat) => w.protocolosParecidos(t, cat || CATALOGO).map((p) => p.nombre);

(async () => {
  // ===== Búsqueda =====
  assert(typeof w.buscarProtocolosPorTexto === "function" && typeof w.protocolosParecidos === "function", "[funciones] existen buscarProtocolosPorTexto y protocolosParecidos");
  let r = buscar("fec");
  assert(r[0] === "FEC" && r[1] === "FEC 100 x6" && r.indexOf("Efectivo test") > 1, `[prefijo primero] 'fec': FEC, FEC 100 x6 y recién después 'Efectivo test' (que solo contiene 'fec' adentro) → ${r.join(" | ")}`);
  r = buscar("paclitaxel carbo");
  assert(r.length === 1 && r[0] === "Carboplatino + Paclitaxel semanal", `[cualquier orden] 'paclitaxel carbo' encuentra 'Carboplatino + Paclitaxel semanal' → ${r.join(" | ")}`);
  r = buscar("semanal cisplatino");
  assert(r.length === 1 && r[0] === "Cisplatino 40 semanal", `[cualquier orden] 'semanal cisplatino' → ${r.join(" | ")}`);
  r = buscar("trastu");
  assert(r.length === 2 && r[0] === "Trastuzumab 6 mg/kg" && r[1] === "Pertuzumab + Trastuzumab", `[prefijo primero] 'trastu': el que EMPIEZA con Trastuzumab antes que el que lo tiene al final → ${r.join(" | ")}`);
  r = buscar("pacli");
  assert(r.length === 2 && r[0] === "Paclitaxel semanal" && r[1] === "Carboplatino + Paclitaxel semanal", `[prefijo primero] 'pacli': el que empieza con Paclitaxel va primero → ${r.join(" | ")}`);
  r = buscar("ac-t");
  assert(r.length === 2 && r[0] === "AC-T" && r[1] === "AC-T dosis densa", `[guiones] 'ac-t' → AC-T, y el más corto primero → ${r.join(" | ")}`);
  r = buscar("act");
  assert(r.length === 2 && r.includes("AC-T"), `[sin guion] 'act' también encuentra AC-T → ${r.join(" | ")}`);
  r = buscar("ZOLEDRÓNICO");
  assert(r.length === 1 && r[0] === "Zoledronico 4 mg", "[tildes y mayúsculas] 'ZOLEDRÓNICO' encuentra 'Zoledronico 4 mg'");
  r = buscar("6");
  assert(r[0] === "Trastuzumab 6 mg/kg" && r.includes("FEC 100 x6"), `[números] '6': primero el que tiene una palabra que empieza con 6 → ${r.join(" | ")}`);
  r = buscar("dosis densa ac");
  assert(r.length === 1 && r[0] === "AC-T dosis densa", `[varias palabras] 'dosis densa ac' → ${r.join(" | ")}`);
  r = buscar("cisplatino gemcitabina");
  assert(r.length === 1 && r[0] === "Gemcitabina + Cisplatino", "[cualquier orden] 'cisplatino gemcitabina' encuentra 'Gemcitabina + Cisplatino'");
  assert(buscar("").length === 0 && buscar("   ").length === 0, "[vacío] sin texto no devuelve nada");
  assert(buscar("zzzz").length === 0, "[sin coincidencias] devuelve lista vacía");
  r = buscar("+");
  assert(r.length === 3 && r.every((n) => n.includes("+")), `[solo símbolos] '+' cae en la búsqueda simple y encuentra los que lo tienen → ${r.join(" | ")}`);
  const catRepetido = [N("Zeta uno"), N("Alfa uno"), N("Mu uno")];
  assert(buscar("uno", catRepetido).join() === "Alfa uno,Mu uno,Zeta uno", "[empates] a igual puntaje, orden alfabético");
  const inactivo = [N("FEC"), N("FEC viejo", { activo: false })];
  assert(buscar("fec", inactivo).join() === "FEC,FEC viejo", "[inactivos] la búsqueda no filtra por 'activo' (el catálogo ya viene filtrado)");
  const antes = JSON.stringify(CATALOGO); buscar("fec"); assert(JSON.stringify(CATALOGO) === antes, "[sin efectos] no modifica el catálogo recibido");
  const muchos = Array.from({ length: 300 }, (_, i) => N("Protocolo " + i));
  assert(buscar("protocolo", muchos).length === 300, "[todos] devuelve TODAS las coincidencias (la lista tiene scroll)");

  // ===== Nombres parecidos =====
  assert(parecidos("ACT").includes("AC-T"), "[parecidos] 'ACT' ≈ 'AC-T'");
  assert(parecidos("AC T").includes("AC-T"), "[parecidos] 'AC T' ≈ 'AC-T'");
  assert(parecidos("Paclitaxel Carboplatino semanal").includes("Carboplatino + Paclitaxel semanal"), "[parecidos] mismas palabras en otro orden");
  assert(parecidos("Cisplatino semanal").includes("Cisplatino 40 semanal"), "[parecidos] a un detalle de distancia ('40')");
  assert(parecidos("Zoledronico 4mg").includes("Zoledronico 4 mg"), "[parecidos] espacio de más o de menos");
  assert(parecidos("Trastuzumab 6 mg").includes("Trastuzumab 6 mg/kg"), "[parecidos] uno contiene al otro");
  assert(parecidos("Zoledrónico 4 mg").includes("Zoledronico 4 mg"), "[parecidos] tilde distinta");
  assert(parecidos("Trastusumab 6 mg/kg").includes("Trastuzumab 6 mg/kg"), "[parecidos] error de tipeo (una letra)");
  assert(parecidos("Rituximab").length === 0, "[parecidos] un nombre sin relación no avisa nada");
  assert(parecidos("FE").length === 0, "[parecidos] un texto muy corto no dispara avisos por 'estar contenido' en cualquier lado");
  const inact = [N("Rituximab 500", { activo: false }), N("Rituximab 375")];
  assert(parecidos("Rituximab 500", inact).join() === "", "[parecidos] los inactivos no cuentan, y 'Rituximab 375' es otro protocolo");
  const muchosP = Array.from({ length: 20 }, (_, i) => N("Cisplatino semanal " + i));
  assert(parecidos("Cisplatino semanal", muchosP).length <= 6, "[parecidos] como mucho 6, para no tapar la pantalla");
  assert(parecidos("FEC").length === 0 || !parecidos("FEC").includes("FEC"), "[parecidos] el mismo nombre exacto no se informa como 'parecido' (eso lo frena la validación de duplicados)");
  // --- refuerzos (pruebas de mutación) ---
  r = buscar("fec x6", [N("A fec x6"), N("FEC 100 x6")]);
  assert(r.join("|") === "FEC 100 x6|A fec x6", `[varias palabras] el puntaje suma TODAS las palabras: ${r.join("|")}`);
  let q = parecidos("Paclitaxel Carboplatino semanal", [N("Carboplatino + Paclitaxel + Atezolizumab semanal"), N("Carboplatino + Paclitaxel semanal")]);
  assert(q.join("|") === "Carboplatino + Paclitaxel semanal|Carboplatino + Paclitaxel + Atezolizumab semanal", `[parecidos] primero las mismas palabras en otro orden, después los que solo contienen las palabras: ${q.join("|")}`);
  assert(parecidos("FEC", [N("FEC 100 x6")]).length === 0, "[parecidos] un nombre de una sola palabra corta no avisa por estar dentro de otro más largo ('FEC' vs 'FEC 100 x6')");
  assert(parecidos("ACT", [N("AC-T dosis densa")]).length === 0, "[parecidos] 'ACT' (3 letras) no avisa por estar dentro de un nombre largo");
  assert(parecidos("Zoledronico 4mg", [N("Zoledronico 4 mg", { activo: false })]).length === 0, "[parecidos] un protocolo dado de baja no cuenta como parecido");
  assert(parecidos("A B", [N("AB")]).length === 0, "[parecidos] textos de menos de 3 letras no disparan avisos");
  q = parecidos("Cisplatino semanal", [N("Zeta Cisplatino semanal 1"), N("Alfa Cisplatino semanal 2"), N("Cisplatino semanal 3")]);
  assert(q.join("|") === "Alfa Cisplatino semanal 2|Cisplatino semanal 3|Zeta Cisplatino semanal 1", `[parecidos] a igual parecido, orden alfabético: ${q.join("|")}`);
  console.log("\nTODAS LAS PRUEBAS DEL BUSCADOR DE PROTOCOLOS (FUNCIONES) PASARON\n");
})().catch((e) => { console.error(e); process.exit(1); });
