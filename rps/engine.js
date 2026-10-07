// Motor del juego: PRNG con semilla, oponentes y puntuación. Sin DOM ni Firebase,
// así que corre igual en el navegador y en Node (ver test/).
//
// Convención: 0 = piedra, 1 = papel, 2 = tijera. (m+1)%3 le gana a m.
//   gana(1,0) papel > piedra · gana(2,1) tijera > papel · gana(0,2) piedra > tijera

export const gana = (a, b) => a === (b + 1) % 3;           // ¿a le gana a b?
export const contra = (m) => (m + 1) % 3;                  // jugada que le gana a m
export const resultado = (humano, bot) =>                  // desde el punto de vista del humano
  humano === bot ? 0 : gana(humano, bot) ? 1 : -1;

// ── PRNG ────────────────────────────────────────────────────────────────
// mulberry32: pequeño, rápido y suficientemente bueno para esto. Misma semilla → misma secuencia.
export function crearPRNG(semilla) {
  let a = semilla >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Mezcla de hash de enteros (para derivar semillas hijas: maestra + índice de ensayo).
export function derivarSemilla(semilla, i) {
  let h = (semilla ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export function permutacion(arr, rnd) {          // Fisher–Yates con PRNG
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Oponentes ───────────────────────────────────────────────────────────
// Interfaz: op.mover() → 0|1|2 (se llama ANTES de ver la jugada humana)
//           op.observar(humano, bot) → actualiza el estado tras cada ronda.

class Azar {
  constructor(semilla) { this.rnd = crearPRNG(semilla); }
  mover() { return Math.floor(this.rnd() * 3); }
  observar() {}
}

// Ciclo fijo: trivial de explotar. Fase inicial según semilla.
class Malo {
  constructor(semilla) { this.i = Math.floor(crearPRNG(semilla)() * 3); }
  mover() { return this.i++ % 3; }
  observar() {}
}

// Heurística clásica y conocida: juega lo que le gana a tu jugada más frecuente
// en las últimas 6 rondas (desempata al azar con la semilla).
class Logico {
  constructor(semilla) { this.rnd = crearPRNG(semilla); this.h = []; }
  mover() {
    const v = this.h.slice(-6);
    if (!v.length) return Math.floor(this.rnd() * 3);
    const c = [0, 0, 0]; v.forEach((m) => c[m]++);
    const max = Math.max(...c);
    const cand = [0, 1, 2].filter((m) => c[m] === max);
    return contra(cand[Math.floor(this.rnd() * cand.length)]);
  }
  observar(h) { this.h.push(h); }
}

// Secuencia pregrabada: juega una secuencia fija sin importar lo que hagas.
class Grabado {
  constructor(semilla, secuencias) {
    const s = secuencias[Math.floor(crearPRNG(semilla)() * secuencias.length)];
    this.seq = [...s.movs].map((c) => "RPT".indexOf(c));
    this.id = s.id; this.i = 0;
  }
  mover() { return this.seq[this.i++ % this.seq.length]; }
  observar() {}
}

// ── IA adaptativa ───────────────────────────────────────────────────────
// Ensamble de predictores sobre TU próxima jugada. Cada predictor da una
// distribución de probabilidad; se mezclan con pesos que premian a los que
// vienen acertando (mezcla bayesiana con olvido) y se juega la respuesta de
// mayor valor esperado. Es el mismo principio de los bots que ganan torneos de
// piedra-papel-tijera (p. ej. "Iocaine Powder"), en versión mínima:
//
//   freq    frecuencia global con olvido
//   m1, m2  cadena de Markov sobre tus 1 / 2 últimas jugadas
//   joint   condicionado a (tu última jugada, la mía)
//   wsls    condicionado a cómo te fue (ganar-quedarse / perder-cambiar), medido
//           como cambio relativo a tu jugada previa → el sesgo humano más robusto
//
// Los contadores de wsls parten con una creencia previa sobre el comportamiento
// humano típico, para que no empiece "en blanco" (con 20 rondas no hay tiempo de
// aprender desde cero). Todo corre en milisegundos en el navegador: no hace falta servidor.

// Creencia previa (leve, se corrige sola con los datos) sobre cómo cambia la jugada humana
// según cómo le fue: [repetir, subir (+1), bajar (+2)] relativo a su jugada previa.
const PRIOR_RESULTADO = {
  1:    [0.40, 0.30, 0.30], // ganaste: algo más de tendencia a repetir
  0:    [0.30, 0.35, 0.35], // empate: tiende a cambiar
  "-1": [0.25, 0.30, 0.45], // perdiste: tiende a cambiar
};

class IA {
  constructor(semilla, { olvido = 0.92, exploracion = 0.04 } = {}) {
    this.rnd = crearPRNG(semilla);
    this.olvido = olvido; this.exploracion = exploracion;
    this.h = []; this.b = []; this.r = [];            // historiales: humano, bot, resultado (humano)
    this.freq = [1.2, 1, 1];                            // piedra ligeramente más frecuente en humanos
    this.tablas = { m1: {}, m2: {}, joint: {}, wsls: {} };
    this.w = { freq: 1, m1: 1, m2: 1, joint: 1, wsls: 1 };
    this.ultimo = null; // distribuciones de la última predicción (para actualizar pesos)
  }

  _dist(tabla, clave, prior) {
    const c = tabla[clave] || prior || [0, 0, 0];
    const s = c[0] + c[1] + c[2] + 3 * 0.5;
    return c.map((x) => (x + 0.5) / s);
  }

  _predicciones() {
    const n = this.h.length, h = this.h, b = this.b, r = this.r;
    const t = this.tablas;
    const f = this.freq; const sf = f[0] + f[1] + f[2];
    const P = { freq: f.map((x) => x / sf) };
    P.m1 = n >= 1 ? this._dist(t.m1, h[n - 1]) : P.freq;
    P.m2 = n >= 2 ? this._dist(t.m2, h[n - 2] + "," + h[n - 1]) : P.freq;
    P.joint = n >= 1 ? this._dist(t.joint, h[n - 1] + "," + b[n - 1]) : P.freq;
    if (n >= 1) { // wsls: distribución sobre [repetir, +1, +2(-1)] → mapeada a jugadas absolutas
      const rel = this._dist(t.wsls, String(r[n - 1]), PRIOR_RESULTADO[r[n - 1]].map((x) => x * 3));
      const p = [0, 0, 0];
      for (let d = 0; d < 3; d++) p[(h[n - 1] + d) % 3] = rel[d];
      P.wsls = p;
    } else P.wsls = P.freq;
    return P;
  }

  mover() {
    const P = this._predicciones();
    this.ultimo = P;
    const W = Object.values(this.w).reduce((a, x) => a + x, 0);
    const mezcla = [0, 0, 0];
    for (const k in P) for (let m = 0; m < 3; m++) mezcla[m] += (this.w[k] / W) * P[k][m];
    this.mezcla = mezcla;
    if (this.rnd() < this.exploracion) return Math.floor(this.rnd() * 3);
    // Valor esperado de jugar x: P(humano juega lo que x vence) − P(humano juega lo que vence a x)
    const ev = [0, 1, 2].map((x) => mezcla[(x + 2) % 3] - mezcla[(x + 1) % 3]);
    const max = Math.max(...ev);
    const cand = [0, 1, 2].filter((x) => ev[x] >= max - 1e-9);
    return cand[Math.floor(this.rnd() * cand.length)];
  }

  observar(humano, bot) {
    const n = this.h.length;
    // 1) pesos: premiar a quien asignó más probabilidad a lo que realmente pasó
    if (this.ultimo) {
      let tot = 0;
      for (const k in this.w) { this.w[k] = Math.pow(this.w[k], 0.8) * (this.ultimo[k][humano] + 0.02); tot += this.w[k]; }
      for (const k in this.w) this.w[k] = Math.max(this.w[k] / tot * 5, 0.02);
    }
    // 2) contadores (con olvido)
    const sube = (tabla, clave, m) => {
      const c = (tabla[clave] = (tabla[clave] || [0, 0, 0]).map((x) => x * this.olvido));
      c[m] += 1;
    };
    this.freq = this.freq.map((x) => x * this.olvido); this.freq[humano] += 1;
    if (n >= 1) {
      sube(this.tablas.m1, this.h[n - 1], humano);
      sube(this.tablas.joint, this.h[n - 1] + "," + this.b[n - 1], humano);
      const clave = String(this.r[n - 1]);
      const t = this.tablas.wsls;
      if (!t[clave]) t[clave] = PRIOR_RESULTADO[clave].map((x) => x * 3);
      t[clave] = t[clave].map((x) => x * this.olvido); t[clave][(humano - this.h[n - 1] + 3) % 3] += 1;
    }
    if (n >= 2) sube(this.tablas.m2, this.h[n - 2] + "," + this.h[n - 1], humano);
    this.h.push(humano); this.b.push(bot); this.r.push(resultado(humano, bot));
  }
}

export function crearOponente(tipo, semilla, { secuencias } = {}) {
  switch (tipo) {
    case "azar": return new Azar(semilla);
    case "ia": return new IA(semilla);
    case "logico": return new Logico(semilla);
    case "malo": return new Malo(semilla);
    case "humano_grabado":
      if (!secuencias) throw new Error("humano_grabado requiere secuencias");
      return new Grabado(semilla, secuencias);
    default: throw new Error("oponente desconocido: " + tipo);
  }
}

// ── Diseño ──────────────────────────────────────────────────────────────
// Celdas = factorial completo oponente_real × creencia. Orden = permutación aleatoria
// (con la semilla maestra, así queda reproducible y se guarda en la sesión).
export function disenarSesion(cfg, semilla) {
  const rnd = crearPRNG(semilla);
  const celdas = [];
  for (const real of cfg.oponentes) for (const creencia of cfg.creencias) celdas.push({ real, creencia });
  const orden = permutacion(celdas, rnd);
  const practica = cfg.oponentesPractica[Math.floor(rnd() * cfg.oponentesPractica.length)];
  return { orden, practica };
}
