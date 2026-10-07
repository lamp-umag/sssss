// node rps/test/engine.test.mjs  — comprueba reproducibilidad y fuerza de cada oponente.
import assert from "node:assert/strict";
import { crearOponente, crearPRNG, resultado, contra, disenarSesion, derivarSemilla } from "../engine.js";
import { CONFIG } from "../config.js";
import { SECUENCIAS } from "../secuencias.js";

const jugar = (op, humano, n, semH = 7) => { // humano: (hist, rnd) → 0..2 ; devuelve tasa de victorias humanas
  const rnd = crearPRNG(semH); let v = 0, d = 0; const hist = [];
  for (let i = 0; i < n; i++) {
    const b = op.mover(), h = humano(hist, rnd); const r = resultado(h, b);
    if (r === 1) v++; if (r === -1) d++; op.observar(h, b); hist.push({ h, b, r });
  }
  return { v: v / n, d: d / n };
};
const media = (f, reps) => { let s = 0; for (let i = 0; i < reps; i++) s += f(i); return s / reps; };

// 1) reproducibilidad
for (const t of ["azar", "ia", "logico", "malo", "humano_grabado"]) {
  const mk = () => crearOponente(t, 123, { secuencias: SECUENCIAS });
  const run = () => { const o = mk(), out = []; for (let i = 0; i < 40; i++) { out.push(o.mover()); o.observar(i % 3, out.at(-1)); } return out.join(""); };
  assert.equal(run(), run(), t + " no es reproducible");
}
assert.notEqual(
  (() => { const o = crearOponente("azar", 1); return Array.from({ length: 30 }, () => o.mover()).join(""); })(),
  (() => { const o = crearOponente("azar", 2); return Array.from({ length: 30 }, () => o.mover()).join(""); })());

// 2) azar: uniforme (30.000 jugadas) y humano no puede ganarle (≈1/3)
{ const o = crearOponente("azar", 99), c = [0, 0, 0]; for (let i = 0; i < 30000; i++) c[o.mover()]++;
  c.forEach((x) => assert.ok(Math.abs(x / 30000 - 1 / 3) < 0.01, "azar sesgado " + c)); }

// 3) humanos simulados (20 rondas, como en un ensayo real)
const humanos = {
  "uniforme":         (h, r) => Math.floor(r() * 3),
  "siempre piedra":   () => 0,
  "ciclo P→T→R":      (h) => (h.length ? (h.at(-1).h + 1) % 3 : 0),
  "gana-queda/pierde-cambia": (h, r) => { if (!h.length) return Math.floor(r() * 3); const u = h.at(-1); return u.r === 1 ? u.h : (u.h + 1 + Math.floor(r() * 2)) % 3; },
  "juega lo que le ganaría a su último rival": (h, r) => (h.length ? contra(h.at(-1).b) : 0),
  "sesgado 50% piedra": (h, r) => { const u = r(); return u < .5 ? 0 : u < .75 ? 1 : 2; },
};
const reps = 400, N = 20;
const resultados = {};
for (const [tipo, etiqueta] of [["azar", "azar"], ["ia", "IA"], ["logico", "logico"], ["malo", "malo"]]) {
  resultados[etiqueta] = {};
  for (const [nombre, hum] of Object.entries(humanos))
    resultados[etiqueta][nombre] = +media((i) => jugar(crearOponente(tipo, 1000 + i), hum, N, 5000 + i).v, reps).toFixed(3);
}
console.log("Tasa de victorias del HUMANO simulado en 20 rondas (0.333 = empate técnico; <0.333 = el bot gana):");
console.table(resultados);

assert.ok(Math.abs(resultados["azar"]["uniforme"] - 1 / 3) < 0.03);
for (const nombre of Object.keys(humanos)) if (nombre !== "uniforme") assert.ok(Math.abs(resultados["azar"][nombre] - 1 / 3) < 0.03, "azar debe dar 1/3 siempre: " + nombre);
// la IA no puede ganarle a un jugador uniforme…
assert.ok(Math.abs(resultados["IA"]["uniforme"] - 1 / 3) < 0.03, "IA vs uniforme");
// …pero sí a cualquiera con patrón, en solo 20 rondas
for (const nombre of ["siempre piedra", "ciclo P→T→R", "gana-queda/pierde-cambia", "sesgado 50% piedra"])
  assert.ok(resultados["IA"][nombre] < 0.3, "IA debería explotar: " + nombre + " " + resultados["IA"][nombre]);
// el malo es explotable por un jugador con patrón simple
assert.ok(resultados["malo"]["ciclo P→T→R"] > 0.9 || resultados["malo"]["siempre piedra"] > 0.2);

// 4) diseño: permutación reproducible y completa
const d1 = disenarSesion(CONFIG, 42), d2 = disenarSesion(CONFIG, 42);
assert.deepEqual(d1, d2); assert.equal(d1.orden.length, 4);
assert.equal(new Set(d1.orden.map((c) => c.real + c.creencia)).size, 4);
// todas las 24 órdenes aparecen con semillas distintas, aprox. uniformes
const cuentas = {}; for (let s = 0; s < 4800; s++) { const k = disenarSesion(CONFIG, derivarSemilla(1, s)).orden.map((c) => c.real[0] + c.creencia[0]).join(); cuentas[k] = (cuentas[k] || 0) + 1; }
assert.equal(Object.keys(cuentas).length, 24); Object.values(cuentas).forEach((c) => assert.ok(c > 140 && c < 260));
console.log("engine OK");
