(window.TURNERO_BUILD = window.TURNERO_BUILD || {})["pacientes-buscador"] = "B1-2026-10-12-a"; // marca de versión de este archivo (ver verificarVersionesTurnero)
// ============================================================================================
// Buscador único de pacientes (B1) — un componente que se "monta" sobre los ids de la pantalla.
// Reemplaza las copias de buscarPaciente / seleccionarPaciente / actualizarListadoPacientes /
// búsqueda por documento que había en entregas.js, egresos.js y turnero-carga.js.
// Usa el caché único (pacientes-cache.js). No declara nada global salvo PacientesBuscador.
//
// Uso:
//   const buscador = PacientesBuscador.montar({
//     ids: { campo, resultados, sinResultados, bloqueAlta, botonActualizar },   // opcional (valores de siempre)
//     obtenerLista: () => miArray, fijarLista: (l) => { miArray = l; },       // opcional (si la pantalla ya guarda su lista)
//     onSeleccion: (paciente) => { ... },                                     // se eligió un paciente
//     onVerificacion: ({ estado, paciente }) => { ... },                      // "igual" | "actualizado" | "baja" | "error"
//   });
//   await buscador.cargar();  buscador.buscar(texto);  buscador.seleccionar(id);
//   buscador.actualizarListado();  buscador.agregar(pacienteNuevo);
// ============================================================================================
(function (global) {
  const IDS_POR_DEFECTO = {
    campo: "campo-buscar-paciente",
    resultados: "resultados-busqueda-paciente",
    sinResultados: "sin-resultados",
    bloqueAlta: "bloque-alta-rapida",
    botonActualizar: "boton-actualizar-pacientes"
  };

  function normalizarPorDefecto(texto) {
    return (texto || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }
  const soloDigitos = (texto) => (texto || "").toString().replace(/\D/g, "");

  function montar(config) {
    const cfg = config || {};
    const ids = Object.assign({}, IDS_POR_DEFECTO, cfg.ids || {});
    const normalizar = cfg.normalizar || normalizarPorDefecto;
    const limite = cfg.limite || 8;
    const demoraDocumentoMs = cfg.demoraDocumentoMs == null ? 500 : cfg.demoraDocumentoMs;
    const verificarAlElegir = cfg.verificarAlElegir !== false;

    let listaInterna = [];
    const obtenerLista = cfg.obtenerLista || (() => listaInterna);
    const fijarLista = cfg.fijarLista || ((l) => { listaInterna = l; });
    let temporizador = null;

    const el = (clave) => document.getElementById(ids[clave]);
    const ocultar = (clave) => { const e = el(clave); if (e) e.style.display = "none"; };

    async function cargar() {
      fijarLista(await global.PacientesCache.cargarListado());
    }

    function coincide(paciente, tokens, digitos) {
      const texto = normalizar(`${paciente.apellido || ""} ${paciente.nombre || ""}`);
      const porNombre = tokens.length > 0 && tokens.every((t) => texto.includes(t));
      const porDocumento = digitos !== "" && String(paciente.numeroDocumento || "").includes(digitos);
      return porNombre || porDocumento;
    }

    function buscar(texto) {
      const cont = el("resultados");
      const sinResultados = el("sinResultados");
      ocultar("bloqueAlta");
      cont.innerHTML = "";

      if (!(texto || "").trim()) {
        if (sinResultados) sinResultados.style.display = "none";
        return;
      }

      const tokens = normalizar(texto).split(/\s+/).filter(Boolean);
      const digitos = soloDigitos(texto);
      const encontrados = obtenerLista().filter((p) => coincide(p, tokens, digitos));

      if (encontrados.length === 0) {
        if (sinResultados) sinResultados.style.display = "block";
        // Si lo tipeado es un documento completo, puede ser un alta de hoy en otra PC: consulta puntual.
        buscarPorDocumentoEnSegundoPlano(digitos);
        return;
      }
      if (sinResultados) sinResultados.style.display = "none";

      encontrados.slice(0, limite).forEach((p) => {
        const fila = document.createElement("div");
        fila.className = "resultado-busqueda";
        const detalle = document.createElement("span");
        detalle.textContent = `${p.apellido}, ${p.nombre} · ${p.tipoDocumento} ${p.numeroDocumento}`;
        const boton = document.createElement("button");
        boton.type = "button";
        boton.className = "enlace-accion";
        boton.setAttribute("data-id", p.id);
        boton.textContent = "usar";
        boton.addEventListener("click", () => seleccionar(p.id));
        fila.appendChild(detalle);
        fila.appendChild(boton);
        cont.appendChild(fila);
      });
    }

    // Espera una pausa sin tecleo antes de consultar, para no lanzar una consulta por cada dígito.
    function buscarPorDocumentoEnSegundoPlano(digitos) {
      clearTimeout(temporizador);
      if (digitos.length < 7 || digitos.length > 9) return; // no es un documento completo

      temporizador = setTimeout(async () => {
        const campo = el("campo");
        if (!campo || soloDigitos(campo.value) !== digitos) return; // el texto ya cambió: esta consulta quedó vieja
        try {
          const encontrados = await global.PacientesCache.buscarPorDocumento(digitos);
          if (encontrados.length === 0) return;
          const lista = obtenerLista();
          encontrados.forEach((p) => { if (!lista.some((x) => x.id === p.id)) lista.push(p); });
          buscar(campo.value);
        } catch (error) {
          console.error("Error al buscar paciente por documento:", error);
        }
      }, demoraDocumentoMs);
    }

    function seleccionar(id) {
      const paciente = obtenerLista().find((p) => p.id === id);
      if (!paciente) return;
      const campo = el("campo");
      if (campo) campo.value = "";
      const cont = el("resultados");
      if (cont) cont.innerHTML = "";
      ocultar("sinResultados");
      ocultar("bloqueAlta");
      if (cfg.onSeleccion) cfg.onSeleccion(paciente);

      // El listado puede tener hasta 7 días: se confirma al paciente elegido con UNA lectura puntual.
      if (verificarAlElegir && global.PacientesCache) {
        global.PacientesCache.verificar(paciente).then((resultado) => {
          try { if (cfg.onVerificacion) cfg.onVerificacion(resultado); } catch (error) { console.error("Error al aplicar la verificación del paciente:", error); }
        });
      }
    }

    // Enlace manual "actualizar listado": relee TODO (para altas por nombre hechas en otra PC).
    async function actualizarListado() {
      const boton = el("botonActualizar");
      if (boton) { boton.disabled = true; boton.textContent = "actualizando..."; }
      try {
        fijarLista(await global.PacientesCache.recargarListado());
        const campo = el("campo");
        buscar(campo ? campo.value : "");
      } catch (error) {
        console.error("Error al actualizar el listado de pacientes:", error);
      } finally {
        if (boton) { boton.disabled = false; boton.textContent = "actualizar listado"; }
      }
    }

    // Un paciente recién dado de alta en esta PC.
    function agregar(paciente) {
      const lista = obtenerLista();
      if (!lista.some((p) => p.id === paciente.id)) lista.push(paciente);
      global.PacientesCache.agregar(paciente);
    }

    return { cargar: cargar, buscar: buscar, seleccionar: seleccionar, actualizarListado: actualizarListado, agregar: agregar, lista: obtenerLista };
  }

  global.PacientesBuscador = { montar: montar };
})(window);
