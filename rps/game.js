// Interfaz y flujo del experimento. La lógica (oponentes, diseño) está en engine.js.
//
// Flujo: inicio (usuario) → práctica (oponente sorteado, sin informar) → N ensayos en orden
// aleatorio (cada uno: mensaje sobre el oponente → rondas → chequeo de percepción) → cierre con debriefing.
// Parámetros de URL (solo para pruebas):  ?seed=123 fija la semilla maestra · ?rapido=1 acelera las pausas
//                                         ?debug=1 muestra el oponente REAL en una esquina.

import { CONFIG, CREENCIAS, MOVIDAS } from "./config.js";
import { SECUENCIAS } from "./secuencias.js";
import { crearOponente, derivarSemilla, disenarSesion, resultado } from "./engine.js";
import { enviar, alCambiar, pendientes, vaciarBandeja, COL_SESIONES, COL_EVENTOS } from "./firebase.js";

const $app = document.getElementById("app");
const $sync = document.getElementById("sync");
const $debug = document.getElementById("debug");
const params = new URLSearchParams(location.search);
const RAPIDO = params.has("rapido");
const DEBUG = params.has("debug");
const esperar = (ms) => new Promise((r) => setTimeout(r, RAPIDO ? Math.min(ms, 60) : ms));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ── Indicador de guardado ───────────────────────────────────────────────
const pintarSync = (n) => { $sync.textContent = n ? `● guardando (${n})` : "✓ guardado"; $sync.className = n > 4 ? "mal" : ""; };
alCambiar(pintarSync); pintarSync(pendientes());

// ── Íconos pixel (12x12) ────────────────────────────────────────────────
const PIXELES = [
  ["............", "....####....", "..########..", ".##########.", ".##########.", "############", "############", "############", ".##########.", ".##########.", "..########..", "....####...."],
  ["..########..", "..#......#..", "..#.####.#..", "..#......#..", "..#.####.#..", "..#......#..", "..#.####.#..", "..#......#..", "..#.####.#..", "..#......#..", "..########..", "............"],
  ["##........##", ".##......##.", "..##....##..", "...##..##...", "....####....", ".....##.....", "....####....", "...##..##...", ".####..####.", "##..#..#..##", "##..#..#..##", ".####..####."],
];
const icono = (m) => `<svg viewBox="0 0 12 12" aria-label="${MOVIDAS[m]}">${PIXELES[m].map((fila, y) =>
  [...fila].map((c, x) => (c === "#" ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : "")).join("")).join("")}</svg>`;

// ── Sesión ──────────────────────────────────────────────────────────────
const sesion = { sid: null, usuario: null, seq: 0, eventos: [], diseno: null, seedMaestra: null, trials: [] };
const aleatorio32 = () => crypto.getRandomValues(new Uint32Array(1))[0];
const nuevoSid = () => Date.now().toString(36) + "-" + aleatorio32().toString(36).padStart(7, "0");

function registrar(tipo, datos) {
  const ev = { sid: sesion.sid, seq: sesion.seq++, tipo, t: Date.now(), ...datos };
  sesion.eventos.push(ev);
  try { localStorage.setItem("rps_json_" + sesion.sid, JSON.stringify({ sesion: sesion.meta, eventos: sesion.eventos })); } catch { /* ok */ }
  enviar(COL_EVENTOS, `${sesion.sid}_${ev.seq}`, ev);
}

function crearSesion(usuario) {
  const seedMaestra = params.has("seed") ? Number(params.get("seed")) >>> 0 : aleatorio32();
  const diseno = disenarSesion(CONFIG, seedMaestra);
  sesion.sid = nuevoSid(); sesion.usuario = usuario; sesion.seedMaestra = seedMaestra; sesion.diseno = diseno;
  sesion.trials = [{ ensayo: 0, real: diseno.practica, creencia: null }, ...diseno.orden.map((c, i) => ({ ensayo: i + 1, ...c }))];
  sesion.meta = {
    sid: sesion.sid, usuario, usuarioNorm: usuario.toLowerCase(), seedMaestra,
    orden: diseno.orden, practicaOponente: diseno.practica,
    config: { version: CONFIG.version, rondasPractica: CONFIG.rondasPractica, rondasEnsayo: CONFIG.rondasEnsayo, nEnsayos: diseno.orden.length,
      oponentes: CONFIG.oponentes, creencias: CONFIG.creencias },
    creadoMs: Date.now(), ua: navigator.userAgent, pantalla: `${screen.width}x${screen.height}@${devicePixelRatio}`,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone, idioma: navigator.language, url: location.pathname + location.search,
  };
  enviar(COL_SESIONES, sesion.sid, sesion.meta);
  if (DEBUG) $debug.textContent = "orden: " + diseno.orden.map((c) => c.real[0] + "/" + c.creencia[0]).join(" ") + " · práctica: " + diseno.practica;
}

// ── Pantallas ───────────────────────────────────────────────────────────
const pantalla = (html) => { $app.innerHTML = html; };
const tocar = (selector) => new Promise((res) => { $app.querySelector(selector).addEventListener("click", res, { once: true }); });

async function pantallaInicio() {
  const previo = (() => { try { return localStorage.getItem("rps_usuario") || ""; } catch { return ""; } })();
  pantalla(`
    <div class="centro">
      <h1 class="titulo">PIEDRA<br>PAPEL<br><span>O TIJERA</span></h1>
      <div class="sub">Un estudio breve (unos 5 minutos).\nElige un apodo corto. No necesitas cuenta.</div>
      <input id="u" class="entrada" maxlength="16" placeholder="TU USUARIO" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(previo)}">
      <div class="error" id="err"></div>
      <button class="btn" id="ok">JUGAR</button>
      <div class="sub">Al jugar aceptas que se registren tus jugadas<br>y tu usuario con fines de investigación.<br>No uses tu nombre real.</div>
    </div>`);
  const $u = document.getElementById("u");
  return new Promise((res) => {
    const enviarUsuario = () => {
      const u = $u.value.replace(/\s+/g, " ").trim();
      if (u.length < 2) { document.getElementById("err").textContent = "Escribe al menos 2 caracteres."; return; }
      try { localStorage.setItem("rps_usuario", u); } catch { /* ok */ }
      res(u);
    };
    document.getElementById("ok").addEventListener("click", enviarUsuario);
    $u.addEventListener("keydown", (e) => { if (e.key === "Enter") enviarUsuario(); });
  });
}

async function pantallaReglas() {
  pantalla(`
    <div class="centro">
      <div class="texto">Piedra <b>gana a</b> tijera.\nTijera <b>gana a</b> papel.\nPapel <b>gana a</b> piedra.</div>
      <div class="texto">Jugarás varias partidas seguidas.\nTu objetivo: <b>ganar tantas rondas como puedas.</b></div>
      <div class="sub">Toca tu jugada en cada ronda.\nNo hay límite de tiempo, pero no lo pienses demasiado.</div>
      <button class="btn" id="ok">ENTENDIDO</button>
    </div>`);
  await tocar("#ok");
}

async function pantallaIntroPractica() {
  pantalla(`
    <div class="centro">
      <h1 class="titulo">PRÁCTICA</h1>
      <div class="texto">${CONFIG.rondasPractica} rondas para entrar en calor.</div>
      <button class="btn" id="ok">EMPEZAR</button>
    </div>`);
  await tocar("#ok");
}

async function pantallaIntroEnsayo(t, total) {
  const c = CREENCIAS[t.creencia];
  pantalla(`
    <div class="centro">
      <div class="sub">ENSAYO ${t.ensayo} DE ${total} · ${CONFIG.rondasEnsayo} RONDAS</div>
      <div class="texto">${c.texto.replace(/\n/g, "<br>")}</div>
      <button class="btn" id="ok">EMPEZAR</button>
    </div>`);
  await tocar("#ok");
}

// Una ronda: espera la jugada humana, devuelve {jugada, rt}.
function esperarJugada() {
  return new Promise((res) => {
    const t0 = performance.now();
    const botones = [...$app.querySelectorAll(".jugada")];
    const teclas = { r: 0, "1": 0, p: 1, "2": 1, t: 2, "3": 2 };
    const fin = (m) => { document.removeEventListener("keydown", onKey); res({ jugada: m, rt: Math.round(performance.now() - t0) }); };
    const onKey = (e) => { if (e.key.toLowerCase() in teclas) fin(teclas[e.key.toLowerCase()]); };
    botones.forEach((b, m) => b.addEventListener("click", () => fin(m), { once: true }));
    document.addEventListener("keydown", onKey);
  });
}

async function jugarRondas(t, op, n, etiqueta) {
  const tot = { g: 0, e: 0, p: 0 };
  const faseTxt = t.ensayo === 0 ? "PRÁCTICA" : `ENSAYO ${t.ensayo}/${sesion.diseno.orden.length}`;
  pantalla(`
    <div class="barra"><span class="fase">${faseTxt}</span><span id="rn"></span></div>
    <div class="marcador"><span class="g">GANAS <b id="g">0</b></span><span>EMPATES <b id="e">0</b></span><span class="p">PIERDES <b id="p">0</b></span></div>
    <div class="arena">
      <div class="lado bot"><div class="quien">${etiqueta ? esc(etiqueta) : "OPONENTE"}</div><div class="icono" id="ib"></div></div>
      <div class="veredicto" id="v"></div>
      <div class="lado yo"><div class="icono" id="iy"></div><div class="quien">TÚ</div></div>
    </div>
    <div class="jugadas" id="js">${MOVIDAS.map((m, i) => `<button class="jugada">${icono(i)}<span>${m.toUpperCase()}</span></button>`).join("")}</div>`);
  const $ = (id) => document.getElementById(id);

  for (let r = 1; r <= n; r++) {
    $("rn").textContent = `RONDA ${r}/${n}`;
    $("ib").innerHTML = `<span class="oculta">?</span>`; $("iy").innerHTML = ""; $("v").className = "veredicto pide"; $("v").textContent = "ELIGE";
    $("js").classList.remove("bloq");
    const botMov = op.mover();                     // el oponente decide ANTES de ver tu jugada
    const { jugada, rt } = await esperarJugada();
    $("js").classList.add("bloq");
    const res = resultado(jugada, botMov);
    $("ib").innerHTML = icono(botMov); $("iy").innerHTML = icono(jugada);
    $("v").className = "veredicto " + (res === 1 ? "gana" : res === -1 ? "pierde" : "empate");
    $("v").textContent = res === 1 ? "¡GANAS!" : res === -1 ? "PIERDES" : "EMPATE";
    if (res === 1) tot.g++; else if (res === -1) tot.p++; else tot.e++;
    $("g").textContent = tot.g; $("e").textContent = tot.e; $("p").textContent = tot.p;
    registrar("ronda", { ensayo: t.ensayo, ronda: r, real: t.real, creencia: t.creencia, jugada, oponente: botMov, res, rt });
    op.observar(jugada, botMov);
    await esperar(CONFIG.msRevelar);
  }
  return tot;
}

async function chequeoPercepcion(t) {
  pantalla(`
    <div class="centro">
      <div class="texto">¿Qué tan <b>inteligente</b> te pareció tu oponente?</div>
      <div class="escala">${[1, 2, 3, 4, 5, 6, 7].map((v) => `<button data-v="${v}">${v}</button>`).join("")}</div>
      <div class="polos"><span>1 · NADA</span><span>7 · MUCHÍSIMO</span></div>
    </div>`);
  const v = await new Promise((res) => $app.querySelectorAll(".escala button").forEach((b) => b.addEventListener("click", () => res(Number(b.dataset.v)), { once: true })));
  registrar("chequeo", { ensayo: t.ensayo, item: "inteligencia", valor: v });
}

async function pantallaResumenEnsayo(t, tot, esUltimo) {
  pantalla(`
    <div class="centro">
      <div class="sub">${t.ensayo === 0 ? "PRÁCTICA" : "ENSAYO " + t.ensayo} TERMINADO</div>
      <div class="titulo"><span>${tot.g}</span> VICTORIAS</div>
      <div class="sub">${tot.g} ganadas · ${tot.e} empates · ${tot.p} perdidas</div>
      <button class="btn" id="ok">${esUltimo ? "TERMINAR" : "SEGUIR"}</button>
    </div>`);
  await tocar("#ok");
}

async function pantallaFinal(resumen) {
  registrar("fin", { totalVictorias: resumen.reduce((a, r) => a + r.tot.g, 0) });
  const ej = resumen.filter((r) => r.t.ensayo > 0);
  const nom = { azar: "AZAR puro (secuencia aleatoria)", ia: "una IA adaptativa", logico: "una regla fija simple", malo: "un patrón fijo", humano_grabado: "jugadas pregrabadas" };
  pantalla(`
    <div class="centro">
      <h1 class="titulo">GRACIAS</h1>
      <div class="sub" style="max-width:26rem">Estudiamos si lo que crees sobre tu oponente cambia cómo juegas.\nPara eso, <b>a veces lo que te dijimos no era verdad</b>. Nunca jugaste contra una persona en vivo:</div>
      <div class="lista">
        <div>PRÁCTICA — sin información · jugabas contra ${nom[sesion.diseno.practica]}</div>
        ${ej.map((r) => `<div>ENSAYO ${r.t.ensayo} — te dijimos: <b>${CREENCIAS[r.t.creencia].etiqueta}</b> · en realidad: <b>${nom[r.t.real].toUpperCase()}</b> · ${r.tot.g}/${CONFIG.rondasEnsayo} victorias</div>`).join("")}
      </div>
      <div class="sub" id="guardado">Guardando tus datos…</div>
      <button class="btn" id="ok">JUGAR OTRA VEZ</button>
    </div>`);
  document.getElementById("ok").addEventListener("click", () => location.reload());
  // espera a que se vacíe la bandeja (máx. ~6 s) y avisa si quedó algo sin enviar
  for (let i = 0; i < 12 && pendientes(); i++) { await vaciarBandeja(); if (pendientes()) await new Promise((r) => setTimeout(r, 500)); }
  const $g = document.getElementById("guardado");
  if ($g) $g.textContent = pendientes() ? "Sin conexión: tus datos están guardados en este dispositivo y se enviarán solos al reconectarse. No borres los datos del navegador." : "✓ Tus datos fueron guardados.";
}

// ── Programa principal ──────────────────────────────────────────────────
async function main() {
  const usuario = await pantallaInicio();
  crearSesion(usuario);
  await pantallaReglas();
  const resumen = [];
  const nEns = sesion.diseno.orden.length;
  for (const t of sesion.trials) {
    const semilla = derivarSemilla(sesion.seedMaestra, t.ensayo);
    const op = crearOponente(t.real, semilla, { secuencias: SECUENCIAS });
    if (t.ensayo === 0) await pantallaIntroPractica(); else await pantallaIntroEnsayo(t, nEns);
    registrar("ensayo_inicio", { ensayo: t.ensayo, real: t.real, creencia: t.creencia, semilla, secuenciaId: op.id ?? null });
    const n = t.ensayo === 0 ? CONFIG.rondasPractica : CONFIG.rondasEnsayo;
    const tot = await jugarRondas(t, op, n, t.creencia ? CREENCIAS[t.creencia].etiqueta : null);
    resumen.push({ t, tot });
    if (t.ensayo > 0) await chequeoPercepcion(t);
    await pantallaResumenEnsayo(t, tot, t.ensayo === nEns);
  }
  await pantallaFinal(resumen);
}

main().catch((e) => { console.error(e); pantalla(`<div class="centro"><div class="texto">Algo falló.<br>Recarga la página.</div><div class="sub">${esc(e.message)}</div></div>`); });
