// Análisis y exportación, sin DOM ni Firebase (se prueba en Node: test/stats.test.mjs).
//   1) reconstruir participantes/ensayos a partir de las sesiones y los eventos crudos
//   2) CSV (rondas, ensayos en formato largo, ancho, primer ensayo, práctica)
//   3) ANOVA factorial entre-sujetos (primer ensayo), 2x2 intra-sujetos (4 ensayos) y t de Welch (práctica)

import { MOVIDAS } from "./config.js";

// ── Reconstrucción ──────────────────────────────────────────────────────
const celda = (real, creencia) => `${real}|${creencia}`;

// sesiones: [{sid, ...}], eventos: [{sid, seq, tipo, ...}]
// Devuelve un participante por sesión, con sus ensayos ya resumidos.
export function construirParticipantes(sesiones, eventos) {
  const porSid = new Map();
  for (const e of eventos) { if (!porSid.has(e.sid)) porSid.set(e.sid, []); porSid.get(e.sid).push(e); }
  const parts = sesiones.map((s) => {
    const ev = (porSid.get(s.sid) || []).sort((a, b) => a.seq - b.seq);
    const ensayos = new Map(); // ensayo(0..n) → resumen
    const obt = (n) => {
      if (!ensayos.has(n)) ensayos.set(n, { ensayo: n, real: null, creencia: null, semilla: null, rondas: [], percepcion: null, inicio: null });
      return ensayos.get(n);
    };
    for (const e of ev) {
      if (e.tipo === "ensayo_inicio") Object.assign(obt(e.ensayo), { real: e.real, creencia: e.creencia ?? null, semilla: e.semilla, inicio: e.t });
      else if (e.tipo === "ronda") { const t = obt(e.ensayo); t.real ??= e.real; t.creencia ??= e.creencia ?? null; t.rondas.push(e); }
      else if (e.tipo === "chequeo") obt(e.ensayo).percepcion = e.valor;
    }
    const resumen = (t) => {
      const r = t.rondas;
      const v = r.filter((x) => x.res === 1).length, d = r.filter((x) => x.res === -1).length, em = r.filter((x) => x.res === 0).length;
      const rts = r.map((x) => x.rt).filter((x) => Number.isFinite(x));
      return { ...t, victorias: v, derrotas: d, empates: em, n: r.length,
        tasa: r.length ? v / r.length : null, rtMedio: rts.length ? rts.reduce((a, b) => a + b, 0) / rts.length : null };
    };
    const lista = [...ensayos.values()].sort((a, b) => a.ensayo - b.ensayo).map(resumen);
    const cfg = s.config || {};
    const practica = lista.find((t) => t.ensayo === 0) || null;
    const exp = lista.filter((t) => t.ensayo > 0);
    const completa = !!practica && practica.n >= (cfg.rondasPractica ?? 0) &&
      exp.length >= (cfg.nEnsayos ?? 4) && exp.every((t) => t.n >= (cfg.rondasEnsayo ?? 0));
    return { ...s, ensayos: exp.map((t, i) => ({ ...t, posicion: i + 1 })), practica, completa, nEventos: ev.length };
  });
  // nº de sesión por usuario (por orden de creación) → permite quedarse con la 1ª
  const cuenta = {};
  parts.sort((a, b) => (a.creadoMs ?? 0) - (b.creadoMs ?? 0));
  for (const p of parts) { cuenta[p.usuarioNorm] = (cuenta[p.usuarioNorm] || 0) + 1; p.sesionN = cuenta[p.usuarioNorm]; }
  return parts;
}

// Filtro de análisis: solo completas y (opcional) solo la 1ª sesión de cada usuario.
export function paraAnalisis(parts, { soloPrimeraPorUsuario = true, soloCompletas = true } = {}) {
  return parts.filter((p) => (!soloCompletas || p.completa) && (!soloPrimeraPorUsuario || p.sesionN === 1));
}

// ── CSV ─────────────────────────────────────────────────────────────────
const esc = (v) => {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? (Number.isInteger(v) ? String(v) : String(+v.toFixed(6))) : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const aCSV = (cols, filas) =>
  "﻿" + [cols.join(","), ...filas.map((f) => cols.map((c) => esc(f[c])).join(","))].join("\r\n");

const ordenTxt = (p) => (p.orden || []).map((c) => `${c.real}/${c.creencia}`).join(" > ");
const base = (p) => ({ usuario: p.usuario, sid: p.sid, sesion_n: p.sesionN, completa: p.completa ? 1 : 0,
  semilla_maestra: p.seedMaestra, orden: ordenTxt(p), practica_oponente: p.practicaOponente });

// Una fila por ronda: TODO lo jugado (incluye práctica = ensayo 0).
export function csvRondas(parts) {
  const cols = ["usuario","sid","sesion_n","ensayo","posicion","oponente_real","creencia","ronda","jugada","jugada_oponente","resultado","rt_ms","t_ms"];
  const filas = [];
  for (const p of parts) {
    const todos = [p.practica, ...p.ensayos].filter(Boolean);
    for (const t of todos) for (const r of t.rondas) filas.push({
      usuario: p.usuario, sid: p.sid, sesion_n: p.sesionN, ensayo: t.ensayo, posicion: t.ensayo,
      oponente_real: t.real, creencia: t.creencia ?? "(sin informar)", ronda: r.ronda,
      jugada: MOVIDAS[r.jugada], jugada_oponente: MOVIDAS[r.oponente],
      resultado: r.res === 1 ? "gana" : r.res === -1 ? "pierde" : "empate", rt_ms: r.rt, t_ms: r.t });
  }
  return aCSV(cols, filas);
}

// Largo: una fila por participante × ensayo experimental (4 filas por participante completo).
export function csvEnsayos(parts) {
  const cols = ["usuario","sid","sesion_n","completa","semilla_maestra","orden","practica_oponente","posicion","oponente_real","creencia","celda",
    "victorias","derrotas","empates","rondas","tasa_victoria","rt_medio_ms","percepcion_inteligencia","semilla_ensayo"];
  const filas = [];
  for (const p of parts) for (const t of p.ensayos) filas.push({ ...base(p), posicion: t.posicion, oponente_real: t.real, creencia: t.creencia,
    celda: celda(t.real, t.creencia), victorias: t.victorias, derrotas: t.derrotas, empates: t.empates, rondas: t.n,
    tasa_victoria: t.tasa, rt_medio_ms: t.rtMedio, percepcion_inteligencia: t.percepcion, semilla_ensayo: t.semilla });
  return aCSV(cols, filas);
}

// Solo el PRIMER ensayo de cada participante: diseño entre-sujetos 2x2 (cada persona = una celda).
export function csvPrimerEnsayo(parts) {
  const cols = ["usuario","sid","sesion_n","completa","oponente_real","creencia","celda","victorias","derrotas","empates","rondas",
    "tasa_victoria","rt_medio_ms","percepcion_inteligencia","practica_oponente","practica_victorias","orden","semilla_maestra"];
  const filas = parts.filter((p) => p.ensayos.length).map((p) => { const t = p.ensayos[0]; return {
    usuario: p.usuario, sid: p.sid, sesion_n: p.sesionN, completa: p.completa ? 1 : 0, oponente_real: t.real, creencia: t.creencia,
    celda: celda(t.real, t.creencia), victorias: t.victorias, derrotas: t.derrotas, empates: t.empates, rondas: t.n,
    tasa_victoria: t.tasa, rt_medio_ms: t.rtMedio, percepcion_inteligencia: t.percepcion,
    practica_oponente: p.practicaOponente, practica_victorias: p.practica?.victorias, orden: ordenTxt(p), semilla_maestra: p.seedMaestra }; });
  return aCSV(cols, filas);
}

// Ancho: una fila por participante, una columna de victorias por celda (para ANOVA intra / mixto).
export function csvAncho(parts, cfg) {
  const celdas = [];
  for (const r of cfg.oponentes) for (const c of cfg.creencias) celdas.push(celda(r, c));
  const col = (c) => "victorias_" + c.replace("|", "_");
  const cols = ["usuario","sid","sesion_n","completa","orden","practica_oponente","practica_victorias", ...celdas.map(col),
    ...celdas.map((c) => "pos_" + c.replace("|", "_"))];
  const filas = parts.map((p) => {
    const f = { ...base(p), practica_victorias: p.practica?.victorias };
    for (const c of celdas) {
      const t = p.ensayos.find((x) => celda(x.real, x.creencia) === c);
      f[col(c)] = t?.victorias; f["pos_" + c.replace("|", "_")] = t?.posicion;
    }
    return f;
  });
  return aCSV(cols, filas);
}

// Práctica: experimento chico de 2 condiciones (oponente de práctica sorteado, sin informar).
export function csvPractica(parts) {
  const cols = ["usuario","sid","sesion_n","completa","practica_oponente","victorias","derrotas","empates","rondas","tasa_victoria","rt_medio_ms","semilla_practica"];
  const filas = parts.filter((p) => p.practica).map((p) => ({ usuario: p.usuario, sid: p.sid, sesion_n: p.sesionN, completa: p.completa ? 1 : 0,
    practica_oponente: p.practicaOponente, victorias: p.practica.victorias, derrotas: p.practica.derrotas, empates: p.practica.empates,
    rondas: p.practica.n, tasa_victoria: p.practica.tasa, rt_medio_ms: p.practica.rtMedio, semilla_practica: p.practica.semilla }));
  return aCSV(cols, filas);
}

// ── Distribuciones ──────────────────────────────────────────────────────
function lnGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t);
  let s = 1.000000000190015; for (const k of c) s += k / ++y;
  return -t + Math.log((2.5066282746310005 * s) / x);
}
function betacf(a, b, x) {
  const FPMIN = 1e-30; let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m; let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d;
    const del = d * c; h *= del; if (Math.abs(del - 1) < 3e-12) break;
  }
  return h;
}
export function betaInc(x, a, b) { // I_x(a,b) regularizada
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}
export const pF = (F, d1, d2) => (F <= 0 ? 1 : betaInc(d2 / (d2 + d1 * F), d2 / 2, d1 / 2));   // P(F' ≥ F)
export const pT2 = (t, df) => betaInc(df / (df + t * t), df / 2, 0.5);                           // dos colas

// ── Álgebra mínima (OLS) ────────────────────────────────────────────────
function rss(X, y) {
  const n = X.length, k = X[0]?.length ?? 0;
  if (!k) return y.reduce((a, v) => a + v * v, 0);
  const A = Array.from({ length: k }, () => new Array(k + 1).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) { A[j][k] += X[i][j] * y[i]; for (let l = 0; l < k; l++) A[j][l] += X[i][j] * X[i][l]; }
  for (let c = 0; c < k; c++) { // eliminación gaussiana con pivoteo
    let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-10) throw new Error("diseño singular (¿falta alguna celda?)");
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < k; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let l = c; l <= k; l++) A[r][l] -= f * A[c][l]; }
  }
  const beta = A.map((row, i) => row[k] / row[i]);
  let s = 0; for (let i = 0; i < n; i++) { let e = y[i]; for (let j = 0; j < k; j++) e -= X[i][j] * beta[j]; s += e * e; }
  return s;
}

// ── ANOVA factorial entre-sujetos (Tipo III, codificación de efectos; sirve con n desiguales) ──
// datos: [{a:'azar', b:'ia', y: 7}, ...]
export function anovaEntre(datos) {
  const A = [...new Set(datos.map((d) => d.a))].sort(), B = [...new Set(datos.map((d) => d.b))].sort();
  const N = datos.length;
  const cod = (niv, v) => niv.slice(0, -1).map((x) => (v === x ? 1 : v === niv[niv.length - 1] ? -1 : 0));
  const filas = datos.map((d) => { const ca = cod(A, d.a), cb = cod(B, d.b); return { ca, cb, ab: ca.flatMap((x) => cb.map((z) => x * z)), y: d.y }; });
  const y = filas.map((f) => f.y);
  const celdasVacias = A.length * B.length - new Set(datos.map((d) => d.a + "\u0000" + d.b)).size;
  if (A.length < 2 || B.length < 2 || celdasVacias) return { error: "faltan datos en alguna celda" };
  const arma = (usar) => filas.map((f) => [1, ...(usar.a ? f.ca : []), ...(usar.b ? f.cb : []), ...(usar.ab ? f.ab : [])]);
  const full = rss(arma({ a: 1, b: 1, ab: 1 }), y);
  const dfErr = N - A.length * B.length;
  if (dfErr <= 0) return { error: "no hay grados de libertad de error (n insuficiente)" };
  const mse = full / dfErr;
  const efecto = (nombre, sin, df) => {
    const ss = rss(arma(sin), y) - full; const F = ss / df / mse;
    return { efecto: nombre, ss, df, ms: ss / df, F, p: pF(F, df, dfErr), etaP2: ss / (ss + full) };
  };
  const tabla = [
    efecto("oponente_real (A)", { b: 1, ab: 1 }, A.length - 1),
    efecto("creencia (B)", { a: 1, ab: 1 }, B.length - 1),
    efecto("A × B", { a: 1, b: 1 }, (A.length - 1) * (B.length - 1)),
    { efecto: "error", ss: full, df: dfErr, ms: mse },
  ];
  const medias = {};
  for (const a of A) for (const b of B) { const v = datos.filter((d) => d.a === a && d.b === b).map((d) => d.y); medias[`${a}|${b}`] = resumenDesc(v); }
  return { A, B, N, tabla, medias };
}

// ── 2x2 intra-sujetos: cada efecto = t² de una puntuación de contraste (F(1, n−1)) ──
// filas: [{y11,y12,y21,y22}] con A (nivel1/2) y B (nivel1/2); y_ab.
export function anovaIntra2x2(filas) {
  const n = filas.length; if (n < 3) return { error: "se necesitan ≥ 3 participantes con los 4 ensayos" };
  const efecto = (nombre, f) => {
    const c = filas.map(f); const m = c.reduce((a, b) => a + b, 0) / n;
    const v = c.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1);
    const F = v === 0 ? (m === 0 ? 0 : Infinity) : (n * m * m) / v;
    return { efecto: nombre, df: 1, dfErr: n - 1, F, p: pF(F, 1, n - 1), etaP2: F / (F + n - 1), contraste: m / 2 };
  };
  return { n, tabla: [
    efecto("oponente_real (A)", (r) => (r.y11 + r.y12 - r.y21 - r.y22)),
    efecto("creencia (B)", (r) => (r.y11 - r.y12 + r.y21 - r.y22)),
    efecto("A × B", (r) => (r.y11 - r.y12 - r.y21 + r.y22)),
  ] };
}

export function resumenDesc(v) {
  const n = v.length; if (!n) return { n: 0, media: null, sd: null };
  const m = v.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) : null;
  return { n, media: m, sd };
}

// t de Welch para dos grupos (práctica).
export function welch(g1, g2) {
  const a = resumenDesc(g1), b = resumenDesc(g2);
  if (a.n < 2 || b.n < 2) return { error: "se necesitan ≥ 2 por grupo", a, b };
  const va = a.sd ** 2 / a.n, vb = b.sd ** 2 / b.n;
  if (va + vb === 0) return { a, b, t: 0, df: a.n + b.n - 2, p: 1, d: 0 };
  const t = (a.media - b.media) / Math.sqrt(va + vb);
  const df = (va + vb) ** 2 / (va ** 2 / (a.n - 1) + vb ** 2 / (b.n - 1));
  const sp = Math.sqrt(((a.n - 1) * a.sd ** 2 + (b.n - 1) * b.sd ** 2) / (a.n + b.n - 2));
  return { a, b, t, df, p: pT2(t, df), d: sp ? (a.media - b.media) / sp : 0 };
}
