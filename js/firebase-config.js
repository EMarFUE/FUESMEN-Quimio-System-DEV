// Configuración del proyecto Firebase (fuesmen---quimio-system)
// Se usa el SDK "compat" para no requerir herramientas de build (npm, webpack, etc.)

const firebaseConfig = {
  apiKey: "AIzaSyCIK_2HuX0BF6o0-xOlhdeX4kQUv0Fudmc",
  authDomain: "fuesmen---quimio-system.firebaseapp.com",
  projectId: "fuesmen---quimio-system",
  storageBucket: "fuesmen---quimio-system.firebasestorage.app",
  messagingSenderId: "76631851393",
  appId: "1:76631851393:web:cc4127a7d31a3bc9d06880"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// Etiquetas legibles para cada rol, usadas en toda la interfaz
const ROLES = {
  administrador: "Administrador",
  enfermeria: "Enfermería",
  medico: "Médico",
  administrativo: "Administrativo"
};

// ============================================================================================
// Medidor de lecturas (B1 · Lecturas)
// Cuenta, en cada PC, cuántos documentos lee el sistema de Firestore, por pantalla y por
// colección (Firestore cobra por documento devuelto; una consulta vacía cuesta 1). Sirve para
// saber qué pantalla gasta más y cuánto bajó cada cambio. NO escribe nada en Firestore, no
// toca reglas y nunca altera lo que devuelve una lectura: envuelve Query.get,
// DocumentReference.get y Transaction.get y cualquier falla propia se traga en silencio.
// Los números viven en el navegador de esa PC (localStorage), últimas 14 jornadas.
// Verlos: abrir cualquier pantalla con ?lecturas=1 al final de la dirección, o Ctrl+Alt+L.
// ============================================================================================
(function iniciarMedidorLecturas() {
  try {
    const fsdk = firebase.firestore;
    if (!fsdk || !fsdk.Query || !fsdk.DocumentReference || fsdk.Query.prototype.__medidorLecturas) return;

    const CLAVE = "medidor_lecturas_v1";
    const MAX_JORNADAS = 14;
    const UMBRAL_PADRON = 500;   // una lectura de "pacientes" de este tamaño es el listado completo
    const DIAS_LEJANOS = 60;     // turnos más allá de hoy + 60 días
    const nombrePagina = (location.pathname.split("/").pop() || "index.html");

    const dosCifras = (n) => String(n).padStart(2, "0");
    const iso = (d) => d.getFullYear() + "-" + dosCifras(d.getMonth() + 1) + "-" + dosCifras(d.getDate());
    const hoy = () => iso(new Date());

    const jornadaVacia = () => ({ total: 0, paginas: {}, aperturas: {}, eventos: { padronCompleto: 0, turnosLeidos: 0, turnosMasAllaDia60: 0 } });
    let pendiente = { dia: hoy(), datos: jornadaVacia() };
    pendiente.datos.aperturas[nombrePagina] = 1;
    let temporizador = null;
    let panel = null;

    function almacenamiento() { try { return window.localStorage || null; } catch (e) { return null; } }

    function leerGuardado() {
      try {
        const st = almacenamiento();
        const crudo = st ? st.getItem(CLAVE) : null;
        const obj = crudo ? JSON.parse(crudo) : null;
        return obj && typeof obj === "object" && obj.dias && typeof obj.dias === "object" ? obj : { dias: {} };
      } catch (e) { return { dias: {} }; }
    }

    function sumar(destino, origen) {
      destino.total = (destino.total || 0) + (origen.total || 0);
      Object.keys(origen.paginas || {}).forEach((p) => {
        const d = destino.paginas[p] || (destino.paginas[p] = { total: 0, colecciones: {} });
        d.total += origen.paginas[p].total || 0;
        Object.keys(origen.paginas[p].colecciones || {}).forEach((c) => { d.colecciones[c] = (d.colecciones[c] || 0) + origen.paginas[p].colecciones[c]; });
      });
      destino.aperturas = destino.aperturas || {};
      Object.keys(origen.aperturas || {}).forEach((p) => { destino.aperturas[p] = (destino.aperturas[p] || 0) + origen.aperturas[p]; });
      destino.eventos = destino.eventos || {};
      Object.keys(origen.eventos || {}).forEach((k) => { destino.eventos[k] = (destino.eventos[k] || 0) + origen.eventos[k]; });
    }

    function flush() {
      try {
        if (temporizador) { clearTimeout(temporizador); temporizador = null; }
        const st = almacenamiento();
        if (!st) return;
        const guardado = leerGuardado();
        const dia = guardado.dias[pendiente.dia] || jornadaVacia();
        sumar(dia, pendiente.datos);
        guardado.dias[pendiente.dia] = dia;
        Object.keys(guardado.dias).sort().slice(0, -MAX_JORNADAS).forEach((viejo) => { delete guardado.dias[viejo]; });
        st.setItem(CLAVE, JSON.stringify(guardado));
        pendiente = { dia: hoy(), datos: jornadaVacia() };
      } catch (e) { /* sin almacenamiento: el contador simplemente no guarda */ }
    }

    function anotar(coleccion, cantidad) {
      if (pendiente.dia !== hoy()) flush(); // cambió el día con la página abierta
      const d = pendiente.datos;
      d.total += cantidad;
      const p = d.paginas[nombrePagina] || (d.paginas[nombrePagina] = { total: 0, colecciones: {} });
      p.total += cantidad;
      p.colecciones[coleccion] = (p.colecciones[coleccion] || 0) + cantidad;
      if (!temporizador) temporizador = setTimeout(flush, 4000);
      if (panel) pintarPanel();
    }

    // "turnos/abc123/notas" -> "turnos/notas" (sin el id del turno)
    function nombreColeccion(ruta) {
      return String(ruta || "").split("/").filter((_, i) => i % 2 === 0).join("/") || "(sin datos)";
    }

    function registrarConsulta(snap) {
      if (!snap) return;
      const n = typeof snap.size === "number" ? snap.size : (snap.docs ? snap.docs.length : 0);
      const docs = snap.docs || [];
      const primero = docs[0];
      const coleccion = primero && primero.ref && primero.ref.parent ? nombreColeccion(primero.ref.parent.path) : "(consulta vacía)";
      anotar(coleccion, Math.max(1, n));
      const ev = pendiente.datos.eventos;
      if (coleccion === "pacientes" && n >= UMBRAL_PADRON) ev.padronCompleto += 1;
      if (coleccion === "turnos") {
        const limite = new Date(); limite.setDate(limite.getDate() + DIAS_LEJANOS);
        const limiteISO = iso(limite);
        docs.forEach((d) => {
          const f = d.data().fecha;
          ev.turnosLeidos += 1;
          if (typeof f === "string" && f > limiteISO) ev.turnosMasAllaDia60 += 1;
        });
      }
    }

    function registrarDocumento(ref) {
      anotar(ref && ref.parent ? nombreColeccion(ref.parent.path) : "(documento)", 1);
    }

    // Envoltorio transparente: devuelve LA MISMA promesa que la lectura real; el conteo corre aparte.
    function envolver(proto, registrar) {
      const original = proto.get;
      proto.get = function () {
        const promesa = original.apply(this, arguments);
        try {
          if (promesa && typeof promesa.then === "function") {
            const ref = this, arg = arguments[0];
            promesa.then(function (resultado) { try { registrar(resultado, ref, arg); } catch (e) {} }, function () {});
          }
        } catch (e) {}
        return promesa;
      };
    }
    envolver(fsdk.Query.prototype, (snap) => registrarConsulta(snap));
    envolver(fsdk.DocumentReference.prototype, (res, ref) => registrarDocumento(ref));
    if (fsdk.Transaction) envolver(fsdk.Transaction.prototype, (res, ref, arg) => registrarDocumento(arg));
    fsdk.Query.prototype.__medidorLecturas = true;

    // ---- Resumen en texto (también es lo que se pega en el chat) ----
    function datosActuales() {
      const guardado = leerGuardado();
      const dia = guardado.dias[pendiente.dia] || jornadaVacia();
      const combinado = { total: 0, paginas: {}, aperturas: {}, eventos: {} };
      sumar(combinado, dia);
      sumar(combinado, pendiente.datos);
      guardado.dias[pendiente.dia] = combinado;
      return guardado;
    }

    function resumen() {
      const g = datosActuales();
      const lineas = ["Lecturas de Firestore que hizo ESTA PC (este navegador), últimas jornadas:"];
      Object.keys(g.dias).sort().reverse().forEach((fecha, i) => {
        const d = g.dias[fecha];
        lineas.push("");
        lineas.push(fecha + " · total " + d.total + " lecturas");
        if (i > 0) return; // el detalle es solo del día de hoy
        const pags = Object.keys(d.paginas).sort((a, b) => d.paginas[b].total - d.paginas[a].total);
        pags.forEach((p) => {
          const cols = Object.keys(d.paginas[p].colecciones).sort((a, b) => d.paginas[p].colecciones[b] - d.paginas[p].colecciones[a])
            .map((c) => c + " " + d.paginas[p].colecciones[c]).join(", ");
          lineas.push("  " + p + ": " + d.paginas[p].total + " (" + cols + ") · abierta " + ((d.aperturas || {})[p] || 0) + " veces");
        });
        const e = d.eventos || {};
        const lejos = e.turnosLeidos ? Math.round(100 * (e.turnosMasAllaDia60 || 0) / e.turnosLeidos) : 0;
        lineas.push("  listado completo de pacientes leído del servidor: " + (e.padronCompleto || 0) + " veces");
        lineas.push("  turnos leídos: " + (e.turnosLeidos || 0) + " (" + (e.turnosMasAllaDia60 || 0) + " más allá de hoy+" + DIAS_LEJANOS + " días = " + lejos + "%)");
      });
      return lineas.join("\n");
    }

    // ---- Panel (solo si se pide) ----
    function pintarPanel() {
      if (panel && panel.pre) panel.pre.textContent = resumen();
    }
    function cerrarPanel() {
      if (panel && panel.caja && panel.caja.parentNode) panel.caja.parentNode.removeChild(panel.caja);
      panel = null;
    }
    function abrirPanel() {
      if (panel || !document.body) return;
      const caja = document.createElement("div");
      caja.id = "panel-medidor-lecturas";
      caja.style.cssText = "position:fixed;right:10px;bottom:10px;z-index:99999;background:#fff;color:#222;border:1px solid #777;border-radius:6px;padding:10px;max-width:460px;max-height:70vh;overflow:auto;font:12px/1.4 system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.3);";
      const pre = document.createElement("pre");
      pre.style.cssText = "white-space:pre-wrap;margin:0 0 8px 0;font:12px/1.4 ui-monospace,Consolas,monospace;";
      const copiar = document.createElement("button");
      copiar.type = "button"; copiar.textContent = "Copiar resumen";
      copiar.onclick = function () { try { navigator.clipboard.writeText(resumen()); copiar.textContent = "Copiado"; } catch (e) { copiar.textContent = "Seleccioná el texto y copialo"; } };
      const cerrar = document.createElement("button");
      cerrar.type = "button"; cerrar.textContent = "Cerrar"; cerrar.style.marginLeft = "6px"; cerrar.onclick = cerrarPanel;
      caja.appendChild(pre); caja.appendChild(copiar); caja.appendChild(cerrar);
      document.body.appendChild(caja);
      panel = { caja: caja, pre: pre };
      pintarPanel();
    }

    window.medidorLecturas = { resumen: resumen, flush: flush, datos: datosActuales };
    document.addEventListener("keydown", function (e) {
      if (e.ctrlKey && e.altKey && e.code === "KeyL") { if (panel) cerrarPanel(); else abrirPanel(); }
    });
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(); });
    if (/[?&]lecturas=1(&|$)/.test(location.search)) {
      if (document.body) abrirPanel(); else document.addEventListener("DOMContentLoaded", abrirPanel);
    }
  } catch (error) {
    console.warn("Medidor de lecturas desactivado:", error);
  }
})();
