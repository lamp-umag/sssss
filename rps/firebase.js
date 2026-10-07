// Capa de datos. Mismo proyecto Firebase que el resto de sssss (sssss-e8013).
// Es una clave de cliente, no un secreto: la protección real vive en firestore.rules.
//
// Modelo (solo-agregar; nada se edita ni se borra):
//   rps_sesiones/{sid}           una por participante: usuario, semilla maestra, orden de condiciones, config, dispositivo
//   rps_eventos/{sid}_{seq}      cada decisión/evento: ensayo_inicio · ronda · chequeo · fin
//
// Robustez: cada escritura pasa por una "bandeja de salida" en localStorage. Si no hay red (o las
// reglas aún no están publicadas) los datos NO se pierden: quedan en la bandeja, se reintentan solos y
// además el juego guarda el JSON completo de la sesión en localStorage (clave rps_json_<sid>).

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, getDocs, collection, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const app = initializeApp({
  apiKey: "AIzaSyCq05NElKm-01Xyraj6qdF31IgOLf8gQbA",
  authDomain: "sssss-e8013.firebaseapp.com",
  projectId: "sssss-e8013",
  storageBucket: "sssss-e8013.firebasestorage.app",
  messagingSenderId: "765571239773",
  appId: "1:765571239773:web:39ea76d035d314cdd4a2b4",
});
export const db = getFirestore(app);

export const COL_SESIONES = "rps_sesiones";
export const COL_EVENTOS = "rps_eventos";

const KEY = "rps_outbox";
const leer = () => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
const guardar = (x) => { try { localStorage.setItem(KEY, JSON.stringify(x)); } catch { /* modo privado: seguimos en memoria */ } };

let bandeja = leer();            // [{col, id, data, intentos}]
let volando = false;
const oyentes = new Set();
export const pendientes = () => bandeja.length;
export const alCambiar = (fn) => { oyentes.add(fn); return () => oyentes.delete(fn); };
const avisar = () => oyentes.forEach((fn) => fn(bandeja.length));

async function escribir(item) {
  const ref = doc(db, item.col, item.id);
  if (item.intentos > 0) { // reintento: quizá la escritura anterior sí llegó → evita chocar con "solo crear"
    try { if ((await getDoc(ref)).exists()) return true; } catch { /* seguimos e intentamos escribir */ }
  }
  item.intentos++;
  await setDoc(ref, { ...item.data, ts: serverTimestamp() });
  return true;
}

export async function vaciarBandeja() {
  if (volando) return; volando = true;
  try {
    while (bandeja.length) {
      const item = bandeja[0];
      try { await escribir(item); bandeja.shift(); guardar(bandeja); avisar(); }
      catch (e) { console.warn("rps: escritura pendiente", item.col, item.id, e?.code || e); break; }
    }
  } finally { volando = false; }
}

export function enviar(col, id, data) {
  bandeja.push({ col, id, data, intentos: 0 });
  guardar(bandeja); avisar();
  vaciarBandeja();
}

window.addEventListener("online", vaciarBandeja);
setInterval(() => { if (bandeja.length) vaciarBandeja(); }, 8000);
vaciarBandeja();

// Lectura completa (para resultados.html)
export async function leerTodo() {
  const [s, e] = await Promise.all([getDocs(collection(db, COL_SESIONES)), getDocs(collection(db, COL_EVENTOS))]);
  const plano = (d) => { const x = d.data(); const { ts, ...r } = x; r.tsMs = ts?.toMillis?.() ?? null; return r; };
  return { sesiones: s.docs.map(plano), eventos: e.docs.map(plano) };
}
