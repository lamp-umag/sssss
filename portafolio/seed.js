// Script de siembra de las 15 semanas del semestre. Se corre una sola vez
// (o cada vez que quieras reiniciar la configuración de semanas desde cero).
//
// Uso:
//   npm install firebase-admin   (ya está en el package.json de la raíz)
//   node portafolio/seed.js
//
// Requiere serviceAccountKey.json en portafolio/ (ver README.md → paso de
// siembra). Ese archivo NO se sube al repo (está en .gitignore).

const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "serviceAccountKey.json"));

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CAMPOS_DEFECTO = [
  {
    id: "requisito", etiqueta: "Registro de la semana", tipo: "textoLargo",
    ayuda: "Responde el requisito indicado arriba.", requerido: true, maxCaracteres: null
  },
  {
    id: "bitacora", etiqueta: "Bitácora", tipo: "textoLargo",
    ayuda: "Qué hiciste esta mañana, en qué orden y qué decidiste. Tres a cinco líneas.",
    requerido: true, maxCaracteres: null
  },
  {
    id: "evidencia", etiqueta: "Evidencia", tipo: "enlace",
    ayuda: "Enlace a la captura o al archivo de análisis, con una línea que indique qué muestra.",
    requerido: false, maxCaracteres: null
  },
  {
    id: "duda", etiqueta: "Duda abierta", tipo: "textoCorto",
    ayuda: "Una pregunta que quedó sin responder.", requerido: true, maxCaracteres: 280
  },
  {
    id: "semaforo", etiqueta: "Dominio de los objetivos de hoy", tipo: "semaforo",
    ayuda: "Con una línea de justificación en el campo siguiente.", requerido: true,
    opciones: ["lo manejo", "a medias", "no lo entiendo"]
  },
  {
    id: "justificacion", etiqueta: "Por qué elegiste ese nivel", tipo: "textoCorto",
    ayuda: "", requerido: false, maxCaracteres: 280
  }
];

const SEMANAS = [
  ["01", "12/08", "Presentación y puesta en marcha",
    "Autodiagnóstico de partida: qué sé de antemano, qué creo que debería saber y no sé, qué me ha costado, qué me gusta y qué no me gusta del análisis de datos."],
  ["02", "19/08", "Medición y levantamiento de datos",
    "Ficha de dos ítems propios: constructo que apuntan, nivel de medición, redacción final y una razón concreta por la que podrían fallar."],
  ["03", "26/08", "Gestión de datos y análisis univariante",
    "Bitácora de limpieza: tres decisiones tomadas sobre la base cruda, con captura del antes y del después de cada una."],
  ["04", "02/09", "Calidad de la medición y supuestos",
    "Reporte de una escala: indicador de consistencia obtenido, ítem más débil, y qué se hizo con él y por qué."],
  ["05", "09/09", "Cierre de la unidad 1",
    "Cierre de unidad: tres cosas que sé hacer hoy y no sabía hace un mes, y una que sigo sin entender."],
  ["06", "23/09", "Lógica inferencial y análisis cuali con cuali",
    "Una tabla de contingencia propia interpretada en cinco líneas, sin usar la palabra significativo."],
  ["07", "30/09", "Comparación de dos grupos",
    "Comparación de dos grupos con su tamaño del efecto e intervalo, más una frase sobre qué cambiaría con una muestra mayor."],
  ["08", "07/10", "Más de dos grupos y relación entre cuantitativas",
    "Un gráfico de dispersión con su recta ajustada, la ecuación, y la interpretación del intercepto y de la pendiente en las unidades del problema."],
  ["09", "14/10", "Cómo se reporta un resultado",
    "Borrador de la tabla o figura principal del informe individual, con pie completo y en formato APA."],
  ["10", "21/10", "Feria de pósters",
    "Autocrítica del póster: qué pregunta me hicieron que no supe responder, y cuál es la respuesta que hoy daría."],
  ["11", "28/10", "El modelo general lineal",
    "Un modelo de regresión múltiple propio: qué aporta cada predictor, qué no aporta, y qué no se puede concluir del modelo."],
  ["12", "04/11", "Interacción y moderación",
    "Registro de una disertación ajena: idea central, supuesto crítico del método, y una aplicación posible a la base del curso."],
  ["13", "11/11", "Del alfa al modelo factorial",
    "Registro de una disertación ajena, mismo formato, sobre un tema distinto al de la semana anterior."],
  ["14", "18/11", "Respuesta al ítem y ecuaciones estructurales",
    "Registro de una disertación ajena, mismo formato, más una pregunta abierta dirigida al docente."],
  ["15", "25/11", "Mapa de decisiones y cierre",
    "Mapa personal de decisiones analíticas, en una plana, y balance del semestre."]
];

function fechaIso(ddmm) {
  const [dia, mes] = ddmm.split("/");
  return `2026-${mes}-${dia}`;
}

async function sembrar() {
  const batch = db.batch();

  SEMANAS.forEach(([numero, ddmm, titulo, requisito]) => {
    const ref = db.collection("semanas").doc(numero);
    batch.set(ref, {
      numero,
      fecha: fechaIso(ddmm),
      titulo,
      requisito,
      estado: numero === "01" ? "activa" : "cerrada",
      visible: numero === "01",
      permitirArchivo: false,
      campos: CAMPOS_DEFECTO
    });
  });

  await batch.commit();
  console.log(`Sembradas ${SEMANAS.length} semanas. Semana 01 activa y visible; el resto cerradas y ocultas.`);
}

sembrar().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
