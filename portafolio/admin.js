import { auth, db, ADMIN_EMAIL } from "./firebase-config.js";
import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, collection, query, where, orderBy,
  onSnapshot, serverTimestamp, getDocs
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const el = {
  cajaUsuario: $("cajaUsuario"), correoAdmin: $("correoAdmin"), btnSalir: $("btnSalir"),
  pantallaLogin: $("pantallaLogin"), btnLogin: $("btnLogin"), errorLogin: $("errorLogin"),
  app: $("app"),
  tabSemanasBtn: $("tabSemanasBtn"), tabRespuestasBtn: $("tabRespuestasBtn"),
  tabSemanas: $("tabSemanas"), tabRespuestas: $("tabRespuestas"),
  listaSemanasAdmin: $("listaSemanasAdmin"),
  subtabPorSemanaBtn: $("subtabPorSemanaBtn"), subtabPorEstudianteBtn: $("subtabPorEstudianteBtn"),
  subtabPorSemana: $("subtabPorSemana"), subtabPorEstudiante: $("subtabPorEstudiante"),
  buscador: $("buscador"), filtroEstado: $("filtroEstado"),
  selectSemana: $("selectSemana"), contadorSemana: $("contadorSemana"),
  btnCsvSemana: $("btnCsvSemana"), btnCsvSemestre: $("btnCsvSemestre"),
  listaPorSemana: $("listaPorSemana"),
  selectEstudiante: $("selectEstudiante"), listaPorEstudiante: $("listaPorEstudiante")
};

const EMOJIS = ["👍", "✅", "🤔", "⚠️", "🔁"];
const TIPOS_CAMPO = [
  { valor: "textoLargo", etiqueta: "Texto largo" },
  { valor: "textoCorto", etiqueta: "Texto corto" },
  { valor: "enlace", etiqueta: "Enlace" },
  { valor: "semaforo", etiqueta: "Semáforo" },
  { valor: "archivo", etiqueta: "Adjunto" }
];

let semanas = [];       // todas, ordenadas por numero
let perfiles = [];      // todos los perfiles de estudiantes
let entregas = [];      // todas las entregas
let vistaActual = "semanas";
let subvistaActual = "por-semana";
const semanasExpandidas = new Set();
const camposEnEdicion = {}; // numero -> arreglo de campos siendo editado (sin guardar)

// ────────── Autenticación ──────────

el.btnLogin.addEventListener("click", async () => {
  el.errorLogin.classList.add("oculto");
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    console.error(e);
    el.errorLogin.textContent = "No se pudo iniciar sesión.";
    el.errorLogin.classList.remove("oculto");
  }
});

el.btnSalir.addEventListener("click", () => signOut(auth));

let desuscribir = [];

onAuthStateChanged(auth, async (user) => {
  desuscribir.forEach((f) => f());
  desuscribir = [];

  if (!user) {
    el.app.classList.add("oculto");
    el.cajaUsuario.classList.add("oculto");
    el.pantallaLogin.classList.remove("oculto");
    return;
  }

  if (user.email !== ADMIN_EMAIL) {
    el.errorLogin.textContent = "Este correo no tiene acceso de administrador.";
    el.errorLogin.classList.remove("oculto");
    await signOut(auth);
    return;
  }

  el.correoAdmin.textContent = user.email;
  el.cajaUsuario.classList.remove("oculto");
  el.pantallaLogin.classList.add("oculto");
  el.app.classList.remove("oculto");
  iniciarEscuchas();
});

function iniciarEscuchas() {
  desuscribir.push(onSnapshot(query(collection(db, "semanas"), orderBy("numero")), (snap) => {
    semanas = snap.docs.map((d) => d.data());
    renderSelectSemana();
    if (vistaActual === "semanas") renderSemanasAdmin();
    if (vistaActual === "respuestas") renderRespuestas();
  }));

  desuscribir.push(onSnapshot(collection(db, "perfiles"), (snap) => {
    perfiles = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    renderSelectEstudiante();
    if (vistaActual === "respuestas") renderRespuestas();
  }));

  desuscribir.push(onSnapshot(collection(db, "entregas"), (snap) => {
    entregas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (vistaActual === "respuestas") renderRespuestas();
  }));
}

// ────────── Pestañas ──────────

el.tabSemanasBtn.addEventListener("click", () => cambiarVista("semanas"));
el.tabRespuestasBtn.addEventListener("click", () => cambiarVista("respuestas"));

function cambiarVista(v) {
  vistaActual = v;
  el.tabSemanas.classList.toggle("oculto", v !== "semanas");
  el.tabRespuestas.classList.toggle("oculto", v !== "respuestas");
  if (v === "semanas") renderSemanasAdmin();
  else renderRespuestas();
}

el.subtabPorSemanaBtn.addEventListener("click", () => cambiarSubvista("por-semana"));
el.subtabPorEstudianteBtn.addEventListener("click", () => cambiarSubvista("por-estudiante"));

function cambiarSubvista(v) {
  subvistaActual = v;
  el.subtabPorSemana.classList.toggle("oculto", v !== "por-semana");
  el.subtabPorEstudiante.classList.toggle("oculto", v !== "por-estudiante");
  renderRespuestas();
}

el.buscador.addEventListener("input", renderRespuestas);
el.filtroEstado.addEventListener("change", renderRespuestas);
el.selectSemana.addEventListener("change", renderRespuestas);
el.selectEstudiante.addEventListener("change", renderRespuestas);

// ════════════════════════════════════════════════════════════
// Editor de semanas
// ════════════════════════════════════════════════════════════

function renderSemanasAdmin() {
  el.listaSemanasAdmin.innerHTML = "";
  semanas.forEach((s) => el.listaSemanasAdmin.appendChild(renderTarjetaSemana(s)));
}

function renderTarjetaSemana(semana) {
  const div = document.createElement("div");
  div.className = "";
  div.innerHTML = `
    <hr class="regla">
    <div class="fila">
      <strong>Semana ${semana.numero}</strong>
      <span class="pequeno">
        <button class="btn-secundario btn-chico" data-accion="estado">${semana.estado === "activa" ? "Cerrar" : "Activar"}</button>
        <button class="btn-secundario btn-chico" data-accion="visible">${semana.visible ? "Ocultar" : "Mostrar"}</button>
      </span>
    </div>
    <p class="pequeno muted">${semana.estado} · ${semana.visible ? "visible" : "oculta"}</p>
    <div class="campo">
      <label>Fecha</label>
      <input type="date" data-campo="fecha" value="${semana.fecha || ""}">
    </div>
    <div class="campo">
      <label>Título</label>
      <input type="text" data-campo="titulo" value="${escaparAtributo(semana.titulo || "")}">
    </div>
    <div class="campo">
      <label>Requisito de la semana</label>
      <textarea data-campo="requisito">${escaparHtml(semana.requisito || "")}</textarea>
    </div>
    <label class="fila" style="font-weight:400;">
      <input type="checkbox" data-campo="permitirArchivo" ${semana.permitirArchivo ? "checked" : ""} style="width:auto;">
      Permitir adjuntos esta semana
    </label>
    <button class="btn-texto" data-accion="toggle-campos">${semanasExpandidas.has(semana.numero) ? "ocultar campos" : "editar campos"}</button>
    <div data-rol="editorCampos" class="${semanasExpandidas.has(semana.numero) ? "" : "oculto"}"></div>
  `;

  div.querySelector('[data-accion="estado"]').addEventListener("click", () =>
    updateDoc(doc(db, "semanas", semana.numero), { estado: semana.estado === "activa" ? "cerrada" : "activa" }));

  div.querySelector('[data-accion="visible"]').addEventListener("click", () =>
    updateDoc(doc(db, "semanas", semana.numero), { visible: !semana.visible }));

  div.querySelector('[data-campo="fecha"]').addEventListener("change", (e) =>
    updateDoc(doc(db, "semanas", semana.numero), { fecha: e.target.value }));
  div.querySelector('[data-campo="titulo"]').addEventListener("blur", (e) =>
    updateDoc(doc(db, "semanas", semana.numero), { titulo: e.target.value }));
  div.querySelector('[data-campo="requisito"]').addEventListener("blur", (e) =>
    updateDoc(doc(db, "semanas", semana.numero), { requisito: e.target.value }));
  div.querySelector('[data-campo="permitirArchivo"]').addEventListener("change", (e) =>
    updateDoc(doc(db, "semanas", semana.numero), { permitirArchivo: e.target.checked }));

  div.querySelector('[data-accion="toggle-campos"]').addEventListener("click", () => {
    if (semanasExpandidas.has(semana.numero)) {
      semanasExpandidas.delete(semana.numero);
      delete camposEnEdicion[semana.numero];
    } else {
      semanasExpandidas.add(semana.numero);
      camposEnEdicion[semana.numero] = JSON.parse(JSON.stringify(semana.campos || []));
    }
    renderSemanasAdmin();
  });

  if (semanasExpandidas.has(semana.numero)) {
    renderEditorCampos(div.querySelector('[data-rol="editorCampos"]'), semana.numero);
  }

  return div;
}

function renderEditorCampos(cont, numero) {
  const campos = camposEnEdicion[numero];
  cont.innerHTML = "";

  campos.forEach((campo, i) => {
    const fila = document.createElement("div");
    fila.className = "campo";
    fila.style.borderTop = "1px solid #eee";
    fila.style.paddingTop = "0.6rem";
    fila.innerHTML = `
      <div class="fila">
        <input type="text" data-k="etiqueta" placeholder="Etiqueta" value="${escaparAtributo(campo.etiqueta || "")}" style="flex:2;">
        <select data-k="tipo" style="flex:1;">
          ${TIPOS_CAMPO.map((t) => `<option value="${t.valor}" ${campo.tipo === t.valor ? "selected" : ""}>${t.etiqueta}</option>`).join("")}
        </select>
      </div>
      <input type="text" data-k="ayuda" placeholder="Texto de ayuda (opcional)" value="${escaparAtributo(campo.ayuda || "")}">
      <div class="fila pequeno">
        <label style="font-weight:400;"><input type="checkbox" data-k="requerido" ${campo.requerido ? "checked" : ""} style="width:auto;"> Requerido</label>
        <label style="font-weight:400;">Máx. caracteres <input type="text" inputmode="numeric" data-k="maxCaracteres" value="${campo.maxCaracteres || ""}" style="width:5rem;display:inline-block;"></label>
      </div>
      <div class="pequeno muted">id: ${escaparHtml(campo.id)}</div>
      <div class="fila pequeno">
        <span>
          <button class="btn-texto" data-accion="subir">▲</button>
          <button class="btn-texto" data-accion="bajar">▼</button>
          <button class="btn-texto" data-accion="duplicar">duplicar</button>
        </span>
        <button class="btn-texto" data-accion="eliminar">eliminar</button>
      </div>
    `;

    fila.querySelector('[data-k="etiqueta"]').addEventListener("input", (e) => campo.etiqueta = e.target.value);
    fila.querySelector('[data-k="tipo"]').addEventListener("change", (e) => campo.tipo = e.target.value);
    fila.querySelector('[data-k="ayuda"]').addEventListener("input", (e) => campo.ayuda = e.target.value);
    fila.querySelector('[data-k="requerido"]').addEventListener("change", (e) => campo.requerido = e.target.checked);
    fila.querySelector('[data-k="maxCaracteres"]').addEventListener("input", (e) => {
      const n = parseInt(e.target.value, 10);
      campo.maxCaracteres = isNaN(n) ? null : n;
    });

    fila.querySelector('[data-accion="subir"]').addEventListener("click", () => {
      if (i === 0) return;
      [campos[i - 1], campos[i]] = [campos[i], campos[i - 1]];
      renderEditorCampos(cont, numero);
    });
    fila.querySelector('[data-accion="bajar"]').addEventListener("click", () => {
      if (i === campos.length - 1) return;
      [campos[i + 1], campos[i]] = [campos[i], campos[i + 1]];
      renderEditorCampos(cont, numero);
    });
    fila.querySelector('[data-accion="duplicar"]').addEventListener("click", () => {
      campos.splice(i + 1, 0, { ...campo, id: campo.id + "_copia" + Date.now() % 10000 });
      renderEditorCampos(cont, numero);
    });
    fila.querySelector('[data-accion="eliminar"]').addEventListener("click", () => {
      campos.splice(i, 1);
      renderEditorCampos(cont, numero);
    });

    cont.appendChild(fila);
  });

  const acciones = document.createElement("div");
  acciones.className = "fila";
  acciones.style.marginTop = "0.75rem";
  acciones.innerHTML = `
    <button class="btn-secundario btn-chico" data-accion="agregar">+ agregar campo</button>
    <span>
      <select data-rol="copiarDe" style="display:inline-block;width:auto;">
        <option value="">copiar campos de…</option>
        ${semanas.filter((s) => s.numero !== numero).map((s) => `<option value="${s.numero}">Semana ${s.numero}</option>`).join("")}
      </select>
      <button class="btn-secundario btn-chico" data-accion="copiar">copiar</button>
    </span>
  `;
  acciones.querySelector('[data-accion="agregar"]').addEventListener("click", () => {
    campos.push({ id: "campo" + Date.now() % 100000, etiqueta: "Nuevo campo", tipo: "textoCorto", ayuda: "", requerido: false, maxCaracteres: null });
    renderEditorCampos(cont, numero);
  });
  acciones.querySelector('[data-accion="copiar"]').addEventListener("click", () => {
    const origen = acciones.querySelector('[data-rol="copiarDe"]').value;
    if (!origen) return;
    const semanaOrigen = semanas.find((s) => s.numero === origen);
    camposEnEdicion[numero] = JSON.parse(JSON.stringify((semanaOrigen && semanaOrigen.campos) || []));
    renderEditorCampos(cont, numero);
  });
  cont.appendChild(acciones);

  const guardar = document.createElement("button");
  guardar.className = "btn btn-chico";
  guardar.style.marginTop = "0.75rem";
  guardar.textContent = "Guardar cambios de campos";
  guardar.addEventListener("click", async () => {
    guardar.disabled = true;
    try {
      await updateDoc(doc(db, "semanas", numero), { campos: camposEnEdicion[numero] });
      semanasExpandidas.delete(numero);
      delete camposEnEdicion[numero];
      renderSemanasAdmin();
    } catch (e) {
      console.error(e);
      alert("No se pudo guardar.");
      guardar.disabled = false;
    }
  });
  cont.appendChild(guardar);
}

// ════════════════════════════════════════════════════════════
// Visor de respuestas
// ════════════════════════════════════════════════════════════

function renderSelectSemana() {
  const actual = el.selectSemana.value;
  el.selectSemana.innerHTML = semanas.map((s) => `<option value="${s.numero}">Semana ${s.numero} — ${escaparHtml(s.titulo || "")}</option>`).join("");
  if (actual && semanas.some((s) => s.numero === actual)) el.selectSemana.value = actual;
}

function renderSelectEstudiante() {
  const actual = el.selectEstudiante.value;
  const ordenados = [...perfiles].sort((a, b) => (a.nombreCompleto || "").localeCompare(b.nombreCompleto || ""));
  el.selectEstudiante.innerHTML = ordenados.map((p) => `<option value="${p.uid}">${escaparHtml(p.nombreCompleto || p.correo)}</option>`).join("");
  if (actual && ordenados.some((p) => p.uid === actual)) el.selectEstudiante.value = actual;
}

function estadoEntregaTexto(numero, uid) {
  const e = entregas.find((x) => x.numeroSemana === numero && x.uid === uid);
  if (!e) return "sin_empezar";
  if (e.estado === "borrador") return "borrador";
  return "entregada";
}

function coincideBusqueda(persona) {
  const texto = el.buscador.value.trim().toLowerCase();
  if (!texto) return true;
  return (persona.nombre || persona.nombreCompleto || "").toLowerCase().includes(texto) ||
    (persona.correo || "").toLowerCase().includes(texto);
}

async function renderRespuestas() {
  if (subvistaActual === "por-semana") await renderPorSemana();
  else await renderPorEstudiante();
}

async function renderPorSemana() {
  const numero = el.selectSemana.value || (semanas[0] && semanas[0].numero);
  if (!numero) { el.listaPorSemana.innerHTML = "<p class='muted'>No hay semanas creadas todavía.</p>"; return; }

  const totalEntregadas = entregas.filter((e) => e.numeroSemana === numero && e.estado === "entregada").length;
  el.contadorSemana.textContent = `${totalEntregadas} entregadas / ${perfiles.length} estudiantes con perfil`;

  const filtroEstado = el.filtroEstado.value;
  const personas = perfiles.filter(coincideBusqueda).sort((a, b) => (a.nombreCompleto || "").localeCompare(b.nombreCompleto || ""));

  el.listaPorSemana.innerHTML = "";
  for (const persona of personas) {
    const entrega = entregas.find((e) => e.numeroSemana === numero && e.uid === persona.uid) || null;
    const estado = entrega ? (entrega.estado === "borrador" ? "borrador" : "entregada") : "sin_empezar";
    const feedback = entrega ? await obtenerFeedback(entrega.id) : null;
    const estadoCompuesto = estado === "entregada" && feedback ? "con_feedback" : estado;
    if (filtroEstado && filtroEstado !== estadoCompuesto) continue;
    el.listaPorSemana.appendChild(await renderBloqueEntrega(persona, entrega, numero, feedback));
  }
}

async function renderPorEstudiante() {
  const uid = el.selectEstudiante.value;
  el.listaPorEstudiante.innerHTML = "";
  if (!uid) return;
  const persona = perfiles.find((p) => p.uid === uid);
  if (!persona) return;

  for (const semana of semanas) {
    const entrega = entregas.find((e) => e.numeroSemana === semana.numero && e.uid === uid) || null;
    const feedback = entrega ? await obtenerFeedback(entrega.id) : null;
    el.listaPorEstudiante.appendChild(await renderBloqueEntrega(persona, entrega, semana.numero, feedback));
  }
}

async function obtenerFeedback(entregaId) {
  const snap = await getDoc(doc(db, "entregas", entregaId, "feedback", "docente"));
  return snap.exists() ? snap.data() : null;
}

async function renderBloqueEntrega(persona, entrega, numero, feedback) {
  const semana = semanas.find((s) => s.numero === numero);
  const div = document.createElement("div");
  div.innerHTML = `<hr class="regla">`;

  const cab = document.createElement("div");
  cab.className = "fila";
  cab.innerHTML = `
    <div>
      <strong>${escaparHtml(persona.nombreCompleto || persona.correo)}</strong>
      <div class="pequeno muted">${escaparHtml(persona.correo || "")} · semana ${numero}${entrega && entrega.esPrueba ? " · prueba" : ""}</div>
    </div>
    <span class="pequeno muted">${entrega ? (entrega.estado === "borrador" ? "Borrador" : "Entregada") : "Sin empezar"}</span>
  `;
  div.appendChild(cab);

  if (entrega) {
    const cuerpo = document.createElement("div");
    cuerpo.className = "pequeno";
    const campos = (semana && semana.campos) || [];
    const respuestas = entrega.respuestas || {};
    const idsActuales = new Set(campos.map((c) => c.id));

    campos.forEach((c) => {
      cuerpo.appendChild(lineaRespuesta(c.etiqueta, respuestas[c.id]));
    });
    Object.keys(respuestas).forEach((id) => {
      if (idsActuales.has(id)) return;
      cuerpo.appendChild(lineaRespuesta(id + " (histórico)", respuestas[id]));
    });
    div.appendChild(cuerpo);
  }

  if (entrega) {
    div.appendChild(renderFeedbackForm(entrega.id, feedback));
  }

  return div;
}

function lineaRespuesta(etiqueta, valor) {
  const p = document.createElement("p");
  let texto = "";
  if (valor == null || valor === "") texto = "—";
  else if (typeof valor === "object") texto = (valor.enlace || "—") + (valor.archivos && valor.archivos.length ? ` (${valor.archivos.length} archivo${valor.archivos.length > 1 ? "s" : ""})` : "");
  else texto = String(valor);
  p.innerHTML = `<strong>${escaparHtml(etiqueta)}:</strong> ${escaparHtml(texto)}`;
  return p;
}

function renderFeedbackForm(entregaId, feedback) {
  const div = document.createElement("div");
  div.className = "retroalimentacion";
  div.innerHTML = `
    <div class="emoji-fila" data-rol="emojis">
      ${EMOJIS.map((e) => `<button type="button" data-emoji="${e}" class="${feedback && feedback.emoji === e ? "activo" : ""}">${e}</button>`).join("")}
    </div>
    <textarea placeholder="Retroalimentación breve" style="margin-top:0.5rem;">${escaparHtml((feedback && feedback.texto) || "")}</textarea>
    <button class="btn btn-chico" style="margin-top:0.5rem;" data-accion="guardarFeedback">Guardar</button>
    <span class="pequeno muted" data-rol="estadoFeedback" style="margin-left:0.5rem;">${feedback ? (feedback.vistoPorEstudiante ? "vista por el estudiante" : "no vista todavía") : ""}</span>
  `;

  let emojiElegido = feedback ? feedback.emoji : null;
  div.querySelectorAll("[data-emoji]").forEach((btn) => {
    btn.addEventListener("click", () => {
      emojiElegido = btn.dataset.emoji;
      div.querySelectorAll("[data-emoji]").forEach((b) => b.classList.toggle("activo", b === btn));
    });
  });

  div.querySelector('[data-accion="guardarFeedback"]').addEventListener("click", async (e) => {
    const boton = e.target;
    boton.disabled = true;
    try {
      await setDoc(doc(db, "entregas", entregaId, "feedback", "docente"), {
        texto: div.querySelector("textarea").value,
        emoji: emojiElegido || "",
        fecha: serverTimestamp(),
        vistoPorEstudiante: false
      });
      div.querySelector('[data-rol="estadoFeedback"]').textContent = "guardado";
    } catch (err) {
      console.error(err);
      alert("No se pudo guardar la retroalimentación.");
    } finally {
      boton.disabled = false;
    }
  });

  return div;
}

// ════════════════════════════════════════════════════════════
// Exportar CSV
// ════════════════════════════════════════════════════════════

function escaparCsv(v) {
  if (v === undefined || v === null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function valorParaCsv(v) {
  if (v == null) return "";
  if (typeof v === "object") return (v.enlace || "") + (v.archivos && v.archivos.length ? ` (${v.archivos.length} archivo(s))` : "");
  return String(v);
}

function fechaParaCsv(t) {
  if (!t) return "";
  const d = t.toDate ? t.toDate() : new Date(t);
  return d.toLocaleString("es-CL");
}

async function construirFilasCsv(listaEntregas) {
  const idsCampos = [];
  listaEntregas.forEach((e) => {
    Object.keys(e.respuestas || {}).forEach((id) => { if (!idsCampos.includes(id)) idsCampos.push(id); });
  });

  const encabezados = ["correo", "nombre", "numeroSemana", "estado", "esPrueba", "fechaEntrega", "fechaUltimaEdicion", ...idsCampos, "retro_emoji", "retro_texto"];
  const filas = [encabezados.map(escaparCsv).join(",")];

  for (const e of listaEntregas) {
    const feedback = await obtenerFeedback(e.id);
    const fila = [
      e.correo, e.nombre, e.numeroSemana, e.estado, e.esPrueba ? "sí" : "no",
      fechaParaCsv(e.fechaEntrega), fechaParaCsv(e.fechaUltimaEdicion),
      ...idsCampos.map((id) => valorParaCsv((e.respuestas || {})[id])),
      feedback ? feedback.emoji || "" : "",
      feedback ? feedback.texto || "" : ""
    ];
    filas.push(fila.map(escaparCsv).join(","));
  }
  return filas.join("\n");
}

function descargarCsv(contenido, nombreArchivo) {
  const blob = new Blob(["﻿" + contenido], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nombreArchivo;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

el.btnCsvSemana.addEventListener("click", async () => {
  const numero = el.selectSemana.value;
  const subset = entregas.filter((e) => e.numeroSemana === numero);
  const csv = await construirFilasCsv(subset);
  descargarCsv(csv, `portafolio_semana_${numero}.csv`);
});

el.btnCsvSemestre.addEventListener("click", async () => {
  const csv = await construirFilasCsv([...entregas].sort((a, b) => a.numeroSemana.localeCompare(b.numeroSemana)));
  descargarCsv(csv, "portafolio_semestre_completo.csv");
});

// ────────── Utilidades ──────────

function escaparHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escaparAtributo(s) { return escaparHtml(s); }
