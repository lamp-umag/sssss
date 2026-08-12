import { auth, db, ADMIN_EMAIL, DOMINIO_INSTITUCIONAL } from "./firebase-config.js";
import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, collection, query, where, orderBy,
  onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";

const $ = (id) => document.getElementById(id);

const el = {
  cajaUsuario: $("cajaUsuario"), nombreUsuario: $("nombreUsuario"),
  btnEditarNombre: $("btnEditarNombre"), btnSalir: $("btnSalir"),
  pantallaLogin: $("pantallaLogin"), btnLogin: $("btnLogin"), errorLogin: $("errorLogin"),
  pantallaNombre: $("pantallaNombre"), inputNombreInicial: $("inputNombreInicial"),
  btnGuardarNombreInicial: $("btnGuardarNombreInicial"),
  avisoPrueba: $("avisoPrueba"),
  pantallaIndice: $("pantallaIndice"), listaSemanas: $("listaSemanas"), sinSemanas: $("sinSemanas"),
  pantallaSemana: $("pantallaSemana"), btnVolverIndice: $("btnVolverIndice"),
  tituloSemana: $("tituloSemana"), fechaSemana: $("fechaSemana"), requisitoSemana: $("requisitoSemana"),
  retroalimentacionSemana: $("retroalimentacionSemana"), avisoCerrada: $("avisoCerrada"),
  formularioSemana: $("formularioSemana"), indicadorGuardado: $("indicadorGuardado"),
  btnEntregar: $("btnEntregar"), estadoEntrega: $("estadoEntrega"), avisoFaltantes: $("avisoFaltantes")
};

const OPCIONES_SEMAFORO_DEFECTO = ["lo manejo", "a medias", "no lo entiendo"];

let usuario = null;
let esPrueba = false;
let semanas = [];               // semanas visibles, ordenadas
let entregasPorSemana = {};     // numeroSemana -> datos de la entrega propia
let feedbackPorSemana = {};     // numeroSemana -> datos de feedback/docente
let semanaAbierta = null;       // numero de la semana que se está viendo
let temporizadorGuardado = null;
let desuscribirSemanas = null;
let desuscribirEntregas = null;
const desuscribirFeedback = {};

// ────────── Autenticación ──────────

el.btnLogin.addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ hd: DOMINIO_INSTITUCIONAL });
  el.errorLogin.classList.add("oculto");
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error(e);
    el.errorLogin.textContent = "No se pudo iniciar sesión. Intenta de nuevo.";
    el.errorLogin.classList.remove("oculto");
  }
});

el.btnSalir.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  limpiarSuscripciones();

  if (!user) {
    mostrarSoloPantalla("pantallaLogin");
    el.cajaUsuario.classList.add("oculto");
    return;
  }

  const email = user.email || "";
  const esInstitucional = email.toLowerCase().endsWith("@" + DOMINIO_INSTITUCIONAL);
  const esAdmin = email === ADMIN_EMAIL;

  if (!esInstitucional && !esAdmin) {
    el.errorLogin.textContent = `Debes entrar con tu cuenta institucional (@${DOMINIO_INSTITUCIONAL}). Cerrando sesión…`;
    el.errorLogin.classList.remove("oculto");
    mostrarSoloPantalla("pantallaLogin");
    await signOut(auth);
    return;
  }

  usuario = user;
  esPrueba = esAdmin;
  el.avisoPrueba.classList.toggle("oculto", !esPrueba);
  el.cajaUsuario.classList.remove("oculto");

  await asegurarPerfil(user);
});

async function asegurarPerfil(user) {
  const ref = doc(db, "perfiles", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    mostrarSoloPantalla("pantallaNombre");
    el.inputNombreInicial.value = user.displayName || "";
    return;
  }

  el.nombreUsuario.textContent = snap.data().nombreCompleto || user.email;
  updateDoc(ref, { ultimaVisita: serverTimestamp() }).catch(() => {});
  iniciarEscuchas();
}

el.btnGuardarNombreInicial.addEventListener("click", async () => {
  const nombre = el.inputNombreInicial.value.trim();
  if (!nombre) { el.inputNombreInicial.focus(); return; }
  el.btnGuardarNombreInicial.disabled = true;
  await setDoc(doc(db, "perfiles", usuario.uid), {
    correo: usuario.email,
    nombreCompleto: nombre,
    fechaCreacion: serverTimestamp(),
    ultimaVisita: serverTimestamp()
  });
  el.nombreUsuario.textContent = nombre;
  el.btnGuardarNombreInicial.disabled = false;
  iniciarEscuchas();
});

el.btnEditarNombre.addEventListener("click", () => {
  const actual = el.nombreUsuario.textContent;
  const nuevo = window.prompt("Nombre completo:", actual);
  if (nuevo === null) return;
  const nombre = nuevo.trim();
  if (!nombre || nombre === actual) return;
  el.nombreUsuario.textContent = nombre;
  updateDoc(doc(db, "perfiles", usuario.uid), { nombreCompleto: nombre }).catch(console.error);
});

// ────────── Semanas y entregas propias (tiempo real) ──────────

function iniciarEscuchas() {
  const qSemanas = query(collection(db, "semanas"), where("visible", "==", true), orderBy("numero"));
  desuscribirSemanas = onSnapshot(qSemanas, (snap) => {
    semanas = snap.docs.map((d) => d.data());
    if (semanaAbierta) {
      const actualizada = semanas.find((s) => s.numero === semanaAbierta);
      if (actualizada) renderSemanaAbierta(actualizada);
    }
    renderIndice();
  });

  const qEntregas = query(collection(db, "entregas"), where("uid", "==", usuario.uid));
  desuscribirEntregas = onSnapshot(qEntregas, (snap) => {
    entregasPorSemana = {};
    snap.forEach((d) => {
      const datos = d.data();
      entregasPorSemana[datos.numeroSemana] = datos;
      if (datos.estado === "entregada" && !desuscribirFeedback[datos.numeroSemana]) {
        escucharFeedback(datos.numeroSemana);
      }
    });
    renderIndice();
    if (semanaAbierta) {
      const s = semanas.find((s) => s.numero === semanaAbierta);
      if (s) renderSemanaAbierta(s);
    }
  });

  mostrarSoloPantalla("pantallaIndice");
}

function escucharFeedback(numeroSemana) {
  const id = usuario.uid + "_" + numeroSemana;
  desuscribirFeedback[numeroSemana] = onSnapshot(
    doc(db, "entregas", id, "feedback", "docente"),
    (snap) => {
      feedbackPorSemana[numeroSemana] = snap.exists() ? snap.data() : null;
      renderIndice();
      if (semanaAbierta === numeroSemana) renderRetroalimentacion(numeroSemana);
    }
  );
}

function limpiarSuscripciones() {
  if (desuscribirSemanas) desuscribirSemanas();
  if (desuscribirEntregas) desuscribirEntregas();
  Object.values(desuscribirFeedback).forEach((f) => f && f());
  Object.keys(desuscribirFeedback).forEach((k) => delete desuscribirFeedback[k]);
  desuscribirSemanas = desuscribirEntregas = null;
  semanas = []; entregasPorSemana = {}; feedbackPorSemana = {}; semanaAbierta = null;
}

// ────────── Índice de semanas ──────────

function estadoDeSemana(numero) {
  const entrega = entregasPorSemana[numero];
  if (!entrega) return "Sin empezar";
  if (entrega.estado === "borrador") return "Borrador";
  if (feedbackPorSemana[numero]) return "Entregada · con retroalimentación";
  return "Entregada";
}

function renderIndice() {
  el.listaSemanas.innerHTML = "";
  el.sinSemanas.classList.toggle("oculto", semanas.length > 0);

  semanas.forEach((s) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "item";
    btn.innerHTML = `
      <div class="fila">
        <strong>Semana ${s.numero} — ${escaparHtml(s.titulo)}</strong>
        <span class="estado">${estadoDeSemana(s.numero)}</span>
      </div>
      <div class="muted pequeno">${formatearFecha(s.fecha)}${s.estado === "cerrada" ? " · cerrada" : ""}</div>
    `;
    btn.addEventListener("click", () => abrirSemana(s.numero));
    el.listaSemanas.appendChild(btn);
  });
}

el.btnVolverIndice.addEventListener("click", () => {
  semanaAbierta = null;
  mostrarSoloPantalla("pantallaIndice");
});

// ────────── Detalle de semana ──────────

function abrirSemana(numero) {
  semanaAbierta = numero;
  const s = semanas.find((s) => s.numero === numero);
  if (!s) return;
  mostrarSoloPantalla("pantallaSemana");
  renderSemanaAbierta(s);
}

function renderSemanaAbierta(semana) {
  el.tituloSemana.textContent = `Semana ${semana.numero} — ${semana.titulo}`;
  el.fechaSemana.textContent = formatearFecha(semana.fecha);
  el.requisitoSemana.textContent = semana.requisito || "";

  const cerrada = semana.estado !== "activa";
  el.avisoCerrada.classList.toggle("oculto", !cerrada);
  el.btnEntregar.classList.toggle("oculto", cerrada);

  const entrega = entregasPorSemana[semana.numero] || null;
  el.estadoEntrega.textContent = entrega
    ? (entrega.estado === "entregada" ? "Entregada" : "Guardado como borrador")
    : "Sin empezar";

  construirFormulario(semana, entrega, cerrada);
  renderRetroalimentacion(semana.numero);
  el.indicadorGuardado.textContent = "";
  el.avisoFaltantes.classList.add("oculto");
}

function renderRetroalimentacion(numeroSemana) {
  const fb = feedbackPorSemana[numeroSemana];
  if (!fb) { el.retroalimentacionSemana.innerHTML = ""; return; }

  el.retroalimentacionSemana.innerHTML = `
    <div class="retroalimentacion">
      <div style="font-size:1.4rem;">${fb.emoji || ""}</div>
      <p>${escaparHtml(fb.texto || "")}</p>
    </div>
  `;

  if (!fb.vistoPorEstudiante) {
    const id = usuario.uid + "_" + numeroSemana;
    updateDoc(doc(db, "entregas", id, "feedback", "docente"), { vistoPorEstudiante: true }).catch(console.error);
  }
}

// ────────── Formulario dinámico ──────────

function construirFormulario(semana, entrega, soloLectura) {
  el.formularioSemana.innerHTML = "";
  const respuestas = (entrega && entrega.respuestas) || {};
  const campos = semana.campos || [];
  const idsActuales = new Set(campos.map((c) => c.id));

  campos.forEach((campo) => {
    el.formularioSemana.appendChild(renderCampo(campo, respuestas[campo.id], soloLectura, semana));
  });

  // Campos históricos: quedaron respondidos pero ya no están en la
  // configuración actual de la semana. Se muestran, no se editan.
  Object.keys(respuestas).forEach((idGuardado) => {
    if (idsActuales.has(idGuardado)) return;
    const div = document.createElement("div");
    div.className = "campo campo-historico";
    div.innerHTML = `<label>${escaparHtml(idGuardado)} <span class="muted pequeno">(campo eliminado de la configuración)</span></label>
      <p>${escaparHtml(valorComoTexto(respuestas[idGuardado]))}</p>`;
    el.formularioSemana.appendChild(div);
  });
}

function renderCampo(campo, valorGuardado, soloLectura, semana) {
  const wrap = document.createElement("div");
  wrap.className = "campo";
  wrap.dataset.campoId = campo.id;
  wrap.dataset.campoTipo = campo.tipo;
  wrap.dataset.requerido = campo.requerido ? "1" : "0";

  const label = document.createElement("label");
  label.textContent = campo.etiqueta + (campo.requerido ? " *" : "");
  wrap.appendChild(label);

  if (campo.ayuda) {
    const ayuda = document.createElement("p");
    ayuda.className = "ayuda";
    ayuda.textContent = campo.ayuda;
    wrap.appendChild(ayuda);
  }

  if (campo.tipo === "textoLargo" || campo.tipo === "textoCorto") {
    const input = document.createElement(campo.tipo === "textoLargo" ? "textarea" : "input");
    if (campo.tipo === "textoCorto") input.type = "text";
    input.value = valorGuardado || "";
    input.disabled = soloLectura;
    input.addEventListener("input", () => {
      actualizarContador(wrap, campo);
      guardarConDebounce();
    });
    wrap.appendChild(input);

    if (campo.maxCaracteres) {
      const contador = document.createElement("div");
      contador.className = "contador";
      wrap.appendChild(contador);
      actualizarContador(wrap, campo);
    }
  }

  if (campo.tipo === "enlace") {
    const input = document.createElement("input");
    input.type = "url";
    input.placeholder = "https://…";
    input.value = valorGuardado || "";
    input.disabled = soloLectura;
    input.addEventListener("input", guardarConDebounce);
    wrap.appendChild(input);
  }

  if (campo.tipo === "semaforo") {
    const opciones = (campo.opciones && campo.opciones.length === 3) ? campo.opciones : OPCIONES_SEMAFORO_DEFECTO;
    const fila = document.createElement("div");
    fila.className = "semaforo";
    opciones.forEach((op) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = op;
      btn.disabled = soloLectura;
      if (valorGuardado === op) btn.classList.add("activo");
      btn.addEventListener("click", () => {
        fila.querySelectorAll("button").forEach((b) => b.classList.remove("activo"));
        btn.classList.add("activo");
        guardarConDebounce();
      });
      fila.appendChild(btn);
    });
    wrap.appendChild(fila);
  }

  if (campo.tipo === "archivo") {
    if (!semana.permitirArchivo) {
      const p = document.createElement("p");
      p.className = "muted pequeno";
      p.textContent = "Los adjuntos no están habilitados esta semana.";
      wrap.appendChild(p);
    } else {
      const valor = valorGuardado || { enlace: "", archivos: [] };

      const inputEnlace = document.createElement("input");
      inputEnlace.type = "url";
      inputEnlace.placeholder = "Enlace a Drive con tu evidencia";
      inputEnlace.value = valor.enlace || "";
      inputEnlace.disabled = soloLectura;
      inputEnlace.addEventListener("input", guardarConDebounce);
      wrap.appendChild(inputEnlace);

      const listaArchivos = document.createElement("div");
      listaArchivos.className = "pequeno muted";
      listaArchivos.dataset.rol = "listaArchivos";
      (valor.archivos || []).forEach((a) => {
        const linea = document.createElement("div");
        linea.innerHTML = `<a href="${escaparAtributo(a.url)}" target="_blank" rel="noopener">${escaparHtml(a.nombre)}</a>`;
        listaArchivos.appendChild(linea);
      });
      wrap.appendChild(listaArchivos);

      if (!soloLectura) {
        const inputArchivo = document.createElement("input");
        inputArchivo.type = "file";
        inputArchivo.accept = "image/*,application/pdf";
        inputArchivo.addEventListener("change", (ev) => subirArchivo(ev, wrap, campo));
        wrap.appendChild(inputArchivo);
      }
    }
  }

  return wrap;
}

function actualizarContador(wrap, campo) {
  const input = wrap.querySelector("textarea, input[type=text]");
  const contador = wrap.querySelector(".contador");
  if (!input || !contador) return;
  const largo = input.value.length;
  contador.textContent = `${largo} / ${campo.maxCaracteres}`;
  contador.classList.toggle("sobre-limite", largo > campo.maxCaracteres);
}

async function subirArchivo(ev, wrap, campo) {
  const archivo = ev.target.files[0];
  if (!archivo) return;

  const semana = semanas.find((s) => s.numero === semanaAbierta);
  const entregaActual = entregasPorSemana[semanaAbierta];
  const totalActual = ((entregaActual && entregaActual.adjuntos) || []).length;
  if (totalActual >= 3) {
    alert("Ya hay tres archivos adjuntos en esta entrega, es el máximo.");
    ev.target.value = "";
    return;
  }
  if (archivo.size > 5 * 1024 * 1024) {
    alert("El archivo supera los 5 MB.");
    ev.target.value = "";
    return;
  }

  try {
    const storage = getStorage();
    const ruta = `entregas/${usuario.uid}/${semanaAbierta}/${Date.now()}_${archivo.name}`;
    const ref = storageRef(storage, ruta);
    await uploadBytes(ref, archivo);
    const url = await getDownloadURL(ref);

    const entrada = { nombre: archivo.name, url, tipo: archivo.type, tamano: archivo.size };
    const lista = wrap.querySelector('[data-rol="listaArchivos"]');
    const linea = document.createElement("div");
    linea.innerHTML = `<a href="${escaparAtributo(url)}" target="_blank" rel="noopener">${escaparHtml(archivo.name)}</a>`;
    lista.appendChild(linea);

    guardarAhora({ archivoSubido: { campoId: campo.id, entrada } });
  } catch (e) {
    console.error(e);
    alert("No se pudo subir el archivo. Si Cloud Storage no está activado en el proyecto, esto es esperable.");
  } finally {
    ev.target.value = "";
  }
}

// ────────── Guardado (borrador automático + entregar) ──────────

function leerFormulario() {
  const respuestas = {};
  el.formularioSemana.querySelectorAll(".campo[data-campo-id]").forEach((wrap) => {
    const tipo = wrap.dataset.campoTipo;
    const id = wrap.dataset.campoId;
    if (tipo === "textoLargo" || tipo === "textoCorto") {
      respuestas[id] = wrap.querySelector("textarea, input").value;
    } else if (tipo === "enlace") {
      respuestas[id] = wrap.querySelector("input").value;
    } else if (tipo === "semaforo") {
      const activo = wrap.querySelector("button.activo");
      if (activo) respuestas[id] = activo.textContent;
    } else if (tipo === "archivo") {
      const inputEnlace = wrap.querySelector("input[type=url]");
      const previo = (entregasPorSemana[semanaAbierta] && entregasPorSemana[semanaAbierta].respuestas[id]) || {};
      respuestas[id] = { enlace: inputEnlace ? inputEnlace.value : (previo.enlace || ""), archivos: previo.archivos || [] };
    }
  });
  return respuestas;
}

function camposFaltantes(semana, respuestas) {
  return (semana.campos || []).filter((c) => {
    if (!c.requerido) return false;
    const v = respuestas[c.id];
    if (c.tipo === "archivo") return !v || (!v.enlace && (!v.archivos || v.archivos.length === 0));
    return !v || !String(v).trim();
  });
}

function guardarConDebounce() {
  el.indicadorGuardado.textContent = "Escribiendo…";
  clearTimeout(temporizadorGuardado);
  temporizadorGuardado = setTimeout(() => guardarAhora({}), 2000);
}

async function guardarAhora(extra) {
  if (!semanaAbierta || !usuario) return;
  const semana = semanas.find((s) => s.numero === semanaAbierta);
  if (!semana || semana.estado !== "activa") return;

  const respuestas = leerFormulario();

  if (extra.archivoSubido) {
    const { campoId, entrada } = extra.archivoSubido;
    if (!respuestas[campoId]) respuestas[campoId] = { enlace: "", archivos: [] };
    respuestas[campoId].archivos = [...(respuestas[campoId].archivos || []), entrada];
  }

  const adjuntos = Object.values(respuestas)
    .filter((v) => v && typeof v === "object" && Array.isArray(v.archivos))
    .flatMap((v) => v.archivos);

  const id = usuario.uid + "_" + semanaAbierta;
  const perfilSnap = await getDoc(doc(db, "perfiles", usuario.uid));
  const nombre = perfilSnap.exists() ? perfilSnap.data().nombreCompleto : "";

  const datos = {
    uid: usuario.uid,
    correo: usuario.email,
    nombre,
    numeroSemana: semanaAbierta,
    respuestas,
    adjuntos,
    esPrueba,
    fechaUltimaEdicion: serverTimestamp()
  };
  if (!entregasPorSemana[semanaAbierta]) {
    datos.estado = "borrador";
    datos.fechaCreacion = serverTimestamp();
  }

  try {
    await setDoc(doc(db, "entregas", id), datos, { merge: true });
    el.indicadorGuardado.textContent = "Guardado " + new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    console.error(e);
    el.indicadorGuardado.textContent = "No se pudo guardar. Revisa tu conexión.";
  }
}

el.btnEntregar.addEventListener("click", async () => {
  const semana = semanas.find((s) => s.numero === semanaAbierta);
  if (!semana) return;
  const respuestas = leerFormulario();
  const faltan = camposFaltantes(semana, respuestas);
  if (faltan.length) {
    el.avisoFaltantes.textContent = "Falta completar: " + faltan.map((c) => c.etiqueta).join(", ");
    el.avisoFaltantes.classList.remove("oculto");
    return;
  }
  el.avisoFaltantes.classList.add("oculto");
  clearTimeout(temporizadorGuardado);

  const id = usuario.uid + "_" + semanaAbierta;
  const yaEntregada = entregasPorSemana[semanaAbierta] && entregasPorSemana[semanaAbierta].estado === "entregada";

  const adjuntos = Object.values(respuestas)
    .filter((v) => v && typeof v === "object" && Array.isArray(v.archivos))
    .flatMap((v) => v.archivos);

  const perfilSnap = await getDoc(doc(db, "perfiles", usuario.uid));
  const nombre = perfilSnap.exists() ? perfilSnap.data().nombreCompleto : "";

  const datos = {
    uid: usuario.uid, correo: usuario.email, nombre,
    numeroSemana: semanaAbierta, respuestas, adjuntos, esPrueba,
    estado: "entregada",
    fechaUltimaEdicion: serverTimestamp()
  };
  if (!entregasPorSemana[semanaAbierta]) datos.fechaCreacion = serverTimestamp();
  if (!yaEntregada) datos.fechaEntrega = serverTimestamp();

  el.btnEntregar.disabled = true;
  try {
    await setDoc(doc(db, "entregas", id), datos, { merge: true });
    el.indicadorGuardado.textContent = "Entregado " + new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    console.error(e);
    alert("No se pudo entregar. Intenta de nuevo.");
  } finally {
    el.btnEntregar.disabled = false;
  }
});

// ────────── Utilidades ──────────

function mostrarSoloPantalla(id) {
  ["pantallaLogin", "pantallaNombre", "pantallaIndice", "pantallaSemana"].forEach((otro) => {
    $(otro).classList.toggle("oculto", otro !== id);
  });
}

function formatearFecha(iso) {
  if (!iso) return "";
  const f = new Date(iso + "T12:00:00");
  return f.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
}

function valorComoTexto(v) {
  if (v == null) return "";
  if (typeof v === "object") return v.enlace || JSON.stringify(v);
  return String(v);
}

function escaparHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escaparAtributo(s) { return escaparHtml(s); }
