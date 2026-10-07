// Secuencias "humanas" pregrabadas para el oponente `humano_grabado`.
// Formato: R = piedra, P = papel, T = tijera. El oponente repite la secuencia en orden,
// sin reaccionar a lo que juegues. Se elige una según la semilla del ensayo.
//
// ⚠ PLACEHOLDER: estas 8 secuencias son SINTÉTICAS (generadas con sesgos humanos típicos:
// repetir tras ganar, cambiar tras perder; ver test/gen-secuencias.mjs, semilla 20261007).
// Para un estudio real reemplázalas por jugadas grabadas de personas reales y deja de
// presentarlas como tales si no lo son. `humano_grabado` NO está activo en el diseño 2x2
// por defecto (ver config.js).
export const SECUENCIAS = [
  { id: "s1", movs: "TPPRPPRPRTRPPTRPRPRPPRRTTTPPTT" },
  { id: "s2", movs: "TPPRPTRRRPRPRRTPRTRTRTRRTRPTRR" },
  { id: "s3", movs: "TTPTPRRTRPRTRPTPRPRTRPPPRTTRTP" },
  { id: "s4", movs: "TPPTRPPPRTPRPRRRTRTRRRPTRTRTRT" },
  { id: "s5", movs: "PTTRRPRPRTRPRPTRRTRTRRPPTTTRPR" },
  { id: "s6", movs: "PRRPRTRPRPTPRRPRPPRPRPRTRRRPPT" },
  { id: "s7", movs: "RPTRPRPPRTPRPPRRRPPPPRTRRRPRRT" },
  { id: "s8", movs: "RPPTRRTTPTRRTTTRRTTRRRTPTRTPTT" },
];
