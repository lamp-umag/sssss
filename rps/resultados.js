// Página de resultados: lee todo de Firestore, reconstruye participantes (stats.js) y muestra
// tablas + descargas. Sin login (las reglas permiten lectura pública, como el resto de sssss).

import { leerTodo } from "./firebase.js";
import { CONFIG } from "./config.js";
import { construirParticipantes, paraAnalisis, anovaEntre, anovaIntra2x2, welch, resumenDesc,
  csvRondas, csvEnsayos, csvAncho, csvPrimerEnsayo, csvPractica } from "./stats.js";

const $ = (id) => document.getElementById(id);
let crudo = null;

const f = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? "–" : x.toFixed(d));
const fp = (p) => (p === undefined ? "–" : `<span class="${p < 0.05 ? "sig" : "ns"}">${p < 0.001 ? "&lt; .001" : f(p, 3).replace(/^0/, "")}</span>`);
const tabla = (cols, filas) => `<table><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr>${filas.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>`;

function descargar(nombre, texto, tipo = "text/csv;charset=utf-8") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([texto], { type: tipo })); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function pintar() {
  const todos = construirParticipantes(crudo.sesiones, crudo.eventos);
  const opts = { soloCompletas: $("soloCompletas").checked, soloPrimeraPorUsuario: $("soloPrimera").checked };
  const ana = paraAnalisis(todos, opts);
  const completas = todos.filter((p) => p.completa);

  $("kpis").innerHTML = [["sesiones", todos.length], ["completas", completas.length], ["usuarios", new Set(todos.map((p) => p.usuarioNorm)).size], ["en el análisis", ana.length],
    ["eventos", crudo.eventos.length]].map(([k, v]) => `<div class="kpi"><b>${v}</b>${k}</div>`).join("");

  // ── Descargas
  const hoy = new Date().toISOString().slice(0, 10);
  const D = [
    ["primer ensayo (2×2)", `rps_primer_ensayo_${hoy}.csv`, () => csvPrimerEnsayo(ana)],
    ["4 ensayos (ancho)", `rps_ancho_${hoy}.csv`, () => csvAncho(ana, CONFIG)],
    ["4 ensayos (largo)", `rps_ensayos_largo_${hoy}.csv`, () => csvEnsayos(ana)],
    ["práctica", `rps_practica_${hoy}.csv`, () => csvPractica(ana)],
    ["rondas (todo)", `rps_rondas_${hoy}.csv`, () => csvRondas(todos)],
  ];
  $("descargas").innerHTML = D.map(([t], i) => `<button class="btn" data-i="${i}">${t}</button>`).join("") + `<button class="btn" id="dlJson">JSON crudo</button>`;
  $("descargas").querySelectorAll("button[data-i]").forEach((b) => b.onclick = () => { const [, n, fn] = D[b.dataset.i]; descargar(n, fn()); });
  $("dlJson").onclick = () => descargar(`rps_crudo_${hoy}.json`, JSON.stringify(crudo, null, 1), "application/json");

  // ── 1) entre: primer ensayo
  const datosEntre = ana.filter((p) => p.ensayos.length).map((p) => ({ a: p.ensayos[0].real, b: p.ensayos[0].creencia, y: p.ensayos[0].victorias }));
  const E = anovaEntre(datosEntre);
  const celdasTxt = (m) => Object.entries(m).map(([k, v]) => [k.replace("|", " / "), v.n, f(v.media), f(v.sd)]);
  $("entre").innerHTML = E.error
    ? `<div class="nota">Aún no hay datos suficientes: ${E.error} (n = ${datosEntre.length}).</div>`
    : tabla(["celda (real / dicho)", "n", "media", "DE"], celdasTxt(E.medias)) +
      tabla(["efecto", "SC", "gl", "F", "p", "η²p"], E.tabla.map((t) => t.F === undefined
        ? [t.efecto, f(t.ss), t.df, "", "", ""] : [t.efecto, f(t.ss), t.df, f(t.F), fp(t.p), f(t.etaP2, 3)]));

  // ── 2) intra: 4 ensayos
  const [A1, A2] = [CONFIG.oponentes[0], CONFIG.oponentes[1]], [B1, B2] = [CONFIG.creencias[0], CONFIG.creencias[1]];
  const y = (p, a, b) => p.ensayos.find((t) => t.real === a && t.creencia === b)?.victorias;
  const filas4 = ana.filter((p) => p.completa).map((p) => ({ y11: y(p, A1, B1), y12: y(p, A1, B2), y21: y(p, A2, B1), y22: y(p, A2, B2), p }))
    .filter((r) => [r.y11, r.y12, r.y21, r.y22].every((v) => v !== undefined));
  if (CONFIG.oponentes.length !== 2 || CONFIG.creencias.length !== 2) {
    $("intra").innerHTML = `<div class="nota">El ANOVA intra-sujetos integrado solo cubre 2×2. Usa el CSV ancho/largo para otros diseños.</div>`;
  } else {
    const I = anovaIntra2x2(filas4);
    const m = (k) => resumenDesc(filas4.map((r) => r[k]));
    const cel = [["y11", `${A1} / ${B1}`], ["y12", `${A1} / ${B2}`], ["y21", `${A2} / ${B1}`], ["y22", `${A2} / ${B2}`]];
    $("intra").innerHTML = tabla(["celda (real / dicho)", "n", "media", "DE"], cel.map(([k, n]) => [n, m(k).n, f(m(k).media), f(m(k).sd)])) +
      (I.error ? `<div class="nota">${I.error} (n = ${filas4.length}).</div>`
        : tabla(["efecto", "F", "gl", "p", "η²p", "contraste (dif. de medias)"], I.tabla.map((t) => [t.efecto, f(t.F), `1, ${t.dfErr}`, fp(t.p), f(t.etaP2, 3), f(t.contraste)])));
    // efecto de posición
    const pos = [1, 2, 3, 4].map((k) => resumenDesc(ana.flatMap((p) => p.ensayos.filter((t) => t.posicion === k).map((t) => t.victorias))));
    $("posicion").innerHTML = `<div class="nota">Victorias según la posición del ensayo (¿aprendizaje o fatiga?):</div>` +
      tabla(["posición", "1", "2", "3", "4"], [["media", ...pos.map((x) => f(x.media))], ["n", ...pos.map((x) => x.n)]]);
  }

  // ── 3) práctica
  const g = (o) => ana.filter((p) => p.practica && p.practicaOponente === o).map((p) => p.practica.victorias);
  const [P1, P2] = CONFIG.oponentesPractica;
  const W = welch(g(P1), g(P2));
  $("practica").innerHTML = W.error
    ? `<div class="nota">Aún no hay datos suficientes (${P1}: ${g(P1).length}, ${P2}: ${g(P2).length}).</div>`
    : tabla(["grupo", "n", "media", "DE"], [[P1, W.a.n, f(W.a.media), f(W.a.sd)], [P2, W.b.n, f(W.b.media), f(W.b.sd)]]) +
      tabla(["t", "gl", "p", "d de Cohen"], [[f(W.t), f(W.df, 1), fp(W.p), f(W.d)]]);

  // ── 4) chequeo
  const celdas = []; for (const a of CONFIG.oponentes) for (const b of CONFIG.creencias) celdas.push([a, b]);
  $("chequeo").innerHTML = tabla(["celda (real / dicho)", "n", "percepción media (1–7)"], celdas.map(([a, b]) => {
    const r = resumenDesc(ana.flatMap((p) => p.ensayos.filter((t) => t.real === a && t.creencia === b && t.percepcion != null).map((t) => t.percepcion)));
    return [`${a} / ${b}`, r.n, f(r.media)];
  }));
}

async function cargar() {
  $("estado").textContent = "Cargando…";
  try {
    crudo = await leerTodo();
    $("estado").textContent = `Actualizado ${new Date().toLocaleTimeString("es-CL")}`;
    $("contenido").hidden = false; pintar();
  } catch (e) {
    console.error(e);
    $("estado").textContent = `No se pudo leer Firestore (${e.code || e.message}). Revisa que las reglas rps_* estén publicadas.`;
  }
}
$("recargar").onclick = cargar;
$("soloCompletas").onchange = $("soloPrimera").onchange = () => crudo && pintar();
cargar();
