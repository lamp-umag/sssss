// Configuración del experimento. Todo lo "ajustable" vive aquí.
// Se importa tanto desde el juego (game.js) como desde la página de resultados.

export const CONFIG = {
  version: "rps-1.0",

  // Rondas por bloque. Práctica corta; cada ensayo lo bastante largo para tener
  // varianza útil en "victorias" pero sin cansar (4 ensayos x 20 + 10 = 90 rondas ≈ 4-5 min).
  rondasPractica: 10,
  rondasEnsayo: 20,

  // Factor A: quién es el oponente REAL. Factor B: qué se le DICE al participante.
  // El diseño es el factorial completo de ambos (2x2 por defecto = 4 ensayos).
  // Para otros diseños agrega niveles (ver OPONENTES / CREENCIAS abajo), p. ej.
  // oponentes: ["azar","ia","humano_grabado"]  → 3x2 = 6 ensayos.
  oponentes: ["azar", "ia"],
  creencias: ["azar", "ia"],

  // Oponente de la práctica (sin que se le diga nada). Se sortea 50/50 entre
  // estos niveles → es un segundo experimento between-subjects de 2 condiciones.
  oponentesPractica: ["azar", "ia"],

  // Pausas de la interfaz (ms)
  msRevelar: 900,
};

// Qué es cada oponente REAL (la implementación está en engine.js).
export const OPONENTES = {
  azar:           { nombre: "Azar (semilla)" },
  ia:             { nombre: "IA adaptativa (ensamble de predictores)" },
  logico:         { nombre: "Heurístico: contraataca tu jugada más frecuente" },
  malo:           { nombre: "Malo: ciclo fijo piedra→papel→tijera" },
  humano_grabado: { nombre: "Secuencia humana pregrabada (ver secuencias.js)" },
};

// Qué se LE DICE al participante (texto en pantalla y etiqueta del oponente).
export const CREENCIAS = {
  azar:           { etiqueta: "AZAR",    texto: "Tu oponente juega <b>completamente al azar</b>.\nNo hay patrón que descubrir." },
  ia:             { etiqueta: "IA",      texto: "Tu oponente es una <b>inteligencia artificial</b> muy buena en piedra, papel o tijera.\nAprende de tus jugadas." },
  humano_grabado: { etiqueta: "PERSONA", texto: "Tu oponente es una <b>persona</b>.\nSus jugadas fueron grabadas antes." },
  humano:         { etiqueta: "PERSONA", texto: "Tu oponente es <b>otra persona</b> que juega ahora contigo." },
};

export const MOVIDAS = ["piedra", "papel", "tijera"]; // 0,1,2 — papel(1) gana a piedra(0), etc.
