// node rps/test/stats.test.mjs — ANOVA contra cálculos a mano y reconstrucción de datos.
import assert from "node:assert/strict";
import { anovaEntre, anovaIntra2x2, welch, pF, construirParticipantes, csvEnsayos, csvAncho, csvPrimerEnsayo, csvRondas, csvPractica, paraAnalisis } from "../stats.js";
import { CONFIG } from "../config.js";
const cerca = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} ≉ ${b}`);

// 2x2 balanceado calculado a mano: celdas [1,3] [5,7] [2,4] [8,10] → SS_A=8, SS_B=50, SS_AB=2, SSE=8 (df 4) → F = 4, 25, 1
const d = [];
[[["a1","b1"],[1,3]],[["a1","b2"],[5,7]],[["a2","b1"],[2,4]],[["a2","b2"],[8,10]]].forEach(([[a,b],ys]) => ys.forEach((y) => d.push({ a, b, y })));
const r = anovaEntre(d);
cerca(r.tabla[0].ss, 8); cerca(r.tabla[1].ss, 50); cerca(r.tabla[2].ss, 2); cerca(r.tabla[3].ss, 8);
cerca(r.tabla[0].F, 4); cerca(r.tabla[1].F, 25); cerca(r.tabla[2].F, 1);
cerca(r.tabla[1].p, pF(25, 1, 4)); assert.ok(r.tabla[1].p < 0.01 && r.tabla[0].p > 0.1);
// n desigual: no debe reventar y los efectos deben dar números finitos
const du = d.concat([{ a: "a1", b: "b1", y: 2 }, { a: "a2", b: "b2", y: 9 }, { a: "a2", b: "b2", y: 7 }]);
assert.ok(anovaEntre(du).tabla.every((t) => Number.isFinite(t.ss)));
assert.ok(anovaEntre(d.filter((x) => !(x.a === "a1" && x.b === "b1"))).error, "celda vacía debe avisar");

// intra: A efecto puro (+2 en a1) sin ruido de contraste → F enorme en A, 0 en B y AB cuando hay varianza
const filas = [[3,1,1,3],[4,2,1,2],[5,2,2,3],[6,3,2,4],[4,3,1,3]].map(([y11,y12,y21,y22]) => ({ y11, y12, y21, y22 }));
const ri = anovaIntra2x2(filas); assert.equal(ri.n, 5); assert.ok(ri.tabla[0].p < 0.05);
// comprobación independiente de F_A: t² del contraste
{ const c = filas.map((x) => x.y11 + x.y12 - x.y21 - x.y22), m = c.reduce((a, b) => a + b) / 5, v = c.reduce((a, b) => a + (b - m) ** 2, 0) / 4; cerca(ri.tabla[0].F, 5 * m * m / v); }

// Welch: [1,2,3,4,5] vs [3,4,5,6,7] → t = −2, df = 8, p ≈ .0805
const w = welch([1,2,3,4,5], [3,4,5,6,7]); cerca(w.t, -2); cerca(w.df, 8); cerca(w.p, 0.0805, 1e-3);

// reconstrucción + CSV
const ses = (sid, usuario, creadoMs) => ({ sid, usuario, usuarioNorm: usuario.toLowerCase(), creadoMs, seedMaestra: 1, practicaOponente: "azar",
  orden: [{ real: "azar", creencia: "azar" }, { real: "ia", creencia: "ia" }], config: { rondasPractica: 2, rondasEnsayo: 2, nEnsayos: 2 } });
const ev = []; let q = 0;
const E = (sid, o) => ev.push({ sid, seq: q++, ...o });
for (const sid of ["s1", "s2"]) {
  E(sid, { tipo: "ensayo_inicio", ensayo: 0, real: "azar", semilla: 5 });
  for (let i = 1; i <= 2; i++) E(sid, { tipo: "ronda", ensayo: 0, ronda: i, real: "azar", jugada: 0, oponente: 2, res: 1, rt: 500, t: 1 });
  [["azar", "azar"], ["ia", "ia"]].forEach(([real, creencia], k) => {
    E(sid, { tipo: "ensayo_inicio", ensayo: k + 1, real, creencia, semilla: 9 });
    for (let i = 1; i <= 2; i++) E(sid, { tipo: "ronda", ensayo: k + 1, ronda: i, real, creencia, jugada: 1, oponente: i === 1 ? 0 : 2, res: i === 1 ? 1 : -1, rt: 600, t: 2 });
    E(sid, { tipo: "chequeo", ensayo: k + 1, item: "inteligencia", valor: 5 });
  });
}
const partes = construirParticipantes([ses("s1", "Ana", 1), ses("s2", "ana", 2)], ev);
assert.ok(partes.every((p) => p.completa)); assert.deepEqual(partes.map((p) => p.sesionN), [1, 2]);
assert.equal(paraAnalisis(partes).length, 1);
assert.equal(partes[0].ensayos[0].victorias, 1); assert.equal(partes[0].practica.victorias, 2);
const lineas = (c) => c.replace("﻿", "").split("\r\n");
assert.equal(lineas(csvEnsayos(partes)).length, 1 + 4); assert.equal(lineas(csvRondas(partes)).length, 1 + 2 * 6);
assert.equal(lineas(csvPrimerEnsayo(partes)).length, 3); assert.equal(lineas(csvPractica(partes)).length, 3);
assert.match(lineas(csvAncho(partes, CONFIG))[1], /Ana/);
// incompleta
const inc = construirParticipantes([ses("s3", "Beto", 3)], ev.filter((e) => e.sid === "s1").slice(0, 5).map((e) => ({ ...e, sid: "s3" })));
assert.equal(inc[0].completa, false);
console.log("stats OK");
