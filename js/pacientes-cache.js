(window.TURNERO_BUILD = window.TURNERO_BUILD || {})["pacientes-cache"] = "B1-2026-10-12-a"; // marca de versión de este archivo (ver verificarVersionesTurnero)
// ============================================================================================
// Caché único del listado de pacientes activos (B1)
// Antes había una copia en entregas.js, egresos.js, historial.js y turnero-carga.js (y cada
// copia renovaba la fecha al agregar un paciente). Ahora hay una sola, usada por todas.
//
// Decisión de Elías (12/10/2026): el listado (~2.700 documentos) se lee del servidor como
// mucho UNA VEZ POR SEMANA en cada PC (vence a los 7 días). Antes se leía una vez por día.
// Lo que protege de datos viejos:
//   · buscar por documento completo consulta al servidor si el paciente no está en el listado;
//   · el enlace "actualizar listado" relee todo a mano;
//   · al ELEGIR un paciente en el turnero se hace UNA lectura puntual (verificar) y, si cambió
//     o fue dado de baja, se corrige o se avisa;
//   · pacientes.js invalida el caché cuando se edita, se crea o se activa/desactiva un paciente.
//
// Se guarda en localStorage con la misma clave y el mismo formato de siempre
// ({ fecha: "AAAA-MM-DD", pacientes: [...] }) para convivir con las páginas que aún no se
// actualizaron. "fecha" es el día en que se LEYÓ el listado completo: agregar o corregir un
// paciente suelto NO la renueva (si no, un alta por día haría que nunca venza).
// ============================================================================================
(function (global) {
  const CLAVE = "cache_pacientes_activos";
  const DIAS_VIGENCIA = 7;

  const dosCifras = (n) => String(n).padStart(2, "0");
  function hoyISO() {
    const d = new Date();
    return d.getFullYear() + "-" + dosCifras(d.getMonth() + 1) + "-" + dosCifras(d.getDate());
  }
  function diasEntre(desdeISO, hastaISO) {
    const a = String(desdeISO).split("-").map(Number), b = String(hastaISO).split("-").map(Number);
    return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
  }

  function leerCrudo() {
    try {
      const crudo = global.localStorage.getItem(CLAVE);
      if (!crudo) return null;
      const datos = JSON.parse(crudo);
      if (!datos || typeof datos.fecha !== "string" || !Array.isArray(datos.pacientes)) return null;
      const edad = diasEntre(datos.fecha, hoyISO());
      if (!(edad >= 0 && edad < DIAS_VIGENCIA)) return null; // vencido, o de "el futuro" (reloj atrasado)
      return datos;
    } catch (error) {
      return null;
    }
  }

  function escribir(fecha, pacientes) {
    try {
      global.localStorage.setItem(CLAVE, JSON.stringify({ fecha: fecha, pacientes: pacientes }));
    } catch (error) {
      // Navegación privada, cuota llena, etc.: se sigue sin caché.
      console.warn("No se pudo guardar el caché de pacientes:", error);
    }
  }

  function leer() {
    const datos = leerCrudo();
    return datos ? datos.pacientes : null;
  }

  function guardar(pacientes) {
    escribir(hoyISO(), pacientes);
  }

  // Suma un paciente suelto SIN renovar la fecha del listado. Sin caché vigente no hace nada
  // (la versión vieja creaba un "caché" de un solo paciente que valía todo el día).
  function agregar(paciente) {
    const datos = leerCrudo();
    if (!datos || !paciente) return;
    if (datos.pacientes.some((p) => p.id === paciente.id)) return;
    datos.pacientes.push(paciente);
    escribir(datos.fecha, datos.pacientes);
  }

  function actualizarUno(paciente) {
    const datos = leerCrudo();
    if (!datos || !paciente) return;
    const i = datos.pacientes.findIndex((p) => p.id === paciente.id);
    if (i < 0) return;
    datos.pacientes[i] = paciente;
    escribir(datos.fecha, datos.pacientes);
  }

  function quitar(id) {
    const datos = leerCrudo();
    if (!datos) return;
    const resto = datos.pacientes.filter((p) => p.id !== id);
    if (resto.length !== datos.pacientes.length) escribir(datos.fecha, resto);
  }

  function invalidar() {
    try { global.localStorage.removeItem(CLAVE); } catch (error) { /* sin storage: nada que borrar */ }
  }

  async function recargarListado() {
    const snapshot = await db.collection("pacientes").where("activo", "==", true).get();
    const pacientes = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    guardar(pacientes);
    return pacientes;
  }

  async function cargarListado() {
    return leer() || recargarListado();
  }

  // Consulta puntual (alta hecha hoy en otra PC): no trae la colección entera.
  async function buscarPorDocumento(digitos) {
    const snapshot = await db.collection("pacientes")
      .where("numeroDocumento", "==", digitos)
      .where("activo", "==", true)
      .get();
    const encontrados = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    encontrados.forEach(agregar);
    return encontrados;
  }

  const CAMPOS_VERIFICADOS = ["apellido", "nombre", "tipoDocumento", "numeroDocumento", "obraSocial"];

  // Al elegir un paciente: 1 lectura de SU documento para no trabajar con datos de hasta 7 días.
  // Devuelve { estado: "igual" | "actualizado" | "baja" | "error", paciente }. Nunca lanza.
  async function verificar(paciente) {
    try {
      const doc = await db.collection("pacientes").doc(paciente.id).get();
      if (!doc.exists) { quitar(paciente.id); return { estado: "baja", paciente: paciente }; }
      const fresco = { id: doc.id, ...doc.data() };
      if (fresco.activo === false) { quitar(paciente.id); return { estado: "baja", paciente: fresco }; }
      const cambio = CAMPOS_VERIFICADOS.some((c) => (fresco[c] || "") !== (paciente[c] || ""));
      if (!cambio) return { estado: "igual", paciente: paciente };
      actualizarUno(fresco);
      return { estado: "actualizado", paciente: fresco };
    } catch (error) {
      return { estado: "error", paciente: paciente };
    }
  }

  global.PacientesCache = {
    DIAS_VIGENCIA: DIAS_VIGENCIA,
    leer: leer, guardar: guardar, agregar: agregar, actualizarUno: actualizarUno, quitar: quitar, invalidar: invalidar,
    cargarListado: cargarListado, recargarListado: recargarListado, buscarPorDocumento: buscarPorDocumento, verificar: verificar
  };
})(window);
