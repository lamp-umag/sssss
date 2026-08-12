# Prompt para el agente de código

Copiar y pegar tal cual. Si el agente pide decisiones que aquí no están, debe elegir la opción más simple y dejarla anotada en el README.

---

## Contexto y encargo

Trabajarás dentro del repositorio `https://github.com/lamp-umag/sssss`, que es un repositorio misceláneo. Todo el código nuevo va en la subcarpeta `portafolio/`, sin tocar nada de lo que ya exista fuera de esa carpeta.

Necesito una aplicación web mobile first para el registro semanal de portafolio de la asignatura Análisis de Datos (tercer año de Psicología, Universidad de Magallanes, segundo semestre de 2026). Los estudiantes la usan en el celular o en el computador del laboratorio durante el tercer bloque de la clase, cada miércoles, y escriben ahí su registro de la semana. Yo la uso para configurar qué se les pide cada semana, ver todas las respuestas juntas y devolverles retroalimentación.

No necesita ser perfecta. Necesita funcionar, ser rápida de cargar en una conexión mala, y no perder datos escritos. Prioriza eso sobre cualquier refinamiento.

## Restricciones técnicas

1. Firebase como única infraestructura: Authentication con Google, Firestore para datos, Hosting para servir el sitio, y Cloud Storage solo si activo la opción de subida de archivos.
2. Sin bundler, sin framework, sin paso de build. HTML, CSS y JavaScript con módulos ES nativos, importando el SDK modular de Firebase versión 10 o superior desde CDN. Debo poder abrir un archivo, editar y desplegar sin instalar nada más allá de la CLI de Firebase.
3. Sin dependencias de npm en tiempo de ejecución. Se permite un script de Node de un solo archivo para sembrar datos iniciales, usando firebase-admin.
4. Todo el texto de la interfaz en español de Chile.
5. La configuración pública de Firebase va en un archivo `firebase-config.js` separado y documentado en el README, para que yo la reemplace por la del proyecto real.

## Autenticación y autorización

1. Login exclusivamente con Google, mediante popup, y con `hd` sugiriendo `umag.cl` en la pantalla de estudiantes.
2. Acceso de estudiante: solo correos que terminen en `@umag.cl`. Si alguien entra con otro dominio, mensaje claro de que debe usar su cuenta institucional y cierre de sesión inmediato.
3. Acceso de administrador: un único correo, `hermanelgueta@gmail.com`, que dejarás en una constante `ADMIN_EMAIL` en `firebase-config.js` y también codificado en las reglas de Firestore. Ese correo entra a `/admin` y no necesita ser del dominio institucional. Debe poder además usar la vista de estudiante para probar, y en ese caso su entrega queda marcada con `esPrueba: true`.
4. La restricción se aplica en las reglas de seguridad de Firestore, no solo en la interfaz. Asume que alguien intentará escribir directo contra la base y que puede tener perfil técnico. Las reglas son la defensa real.
5. En el primer ingreso, el estudiante completa su nombre completo, que queda en su documento de perfil y se puede editar después.

## Estructura de datos en Firestore

| Colección | Documento | Contenido |
|---|---|---|
| `perfiles` | `{uid}` | correo, nombre completo, fecha de creación, última visita |
| `semanas` | `{numero}` con formato `01` a `15` | número, fecha de la sesión, título, requisito de la semana, estado (`activa` o `cerrada`), visible, permitir subida de archivos, arreglo de campos |
| `entregas` | `{uid}_{numeroSemana}` | uid, correo, nombre, número de semana, objeto de respuestas indexado por id de campo, arreglo de adjuntos, estado (`borrador` o `entregada`), fecha de creación, fecha de última edición, fecha de entrega |
| `entregas/{id}/feedback` | `docente` | texto de retroalimentación, emoji, fecha, visto por el estudiante |

Cada campo dentro de `semanas.campos` es un objeto con: `id` estable, `etiqueta`, `tipo` (`textoLargo`, `textoCorto`, `enlace`, `semaforo`, `archivo`), `ayuda` opcional, `requerido` booleano, `maxCaracteres` opcional. El tipo `semaforo` se renderiza como tres opciones excluyentes con etiquetas configurables, por defecto "lo manejo", "a medias", "no lo entiendo".

Ese modelo debe permitir que yo agregue, elimine, reordene y renombre campos por semana desde el administrador, sin tocar código y sin romper las entregas ya existentes: si un campo desaparece de la configuración, la respuesta guardada se conserva y se muestra en el visor como campo histórico.

## Pantalla de estudiante

1. Índice con las semanas visibles, cada una mostrando número, fecha, título y el estado de su propia entrega (sin empezar, borrador, entregada, con retroalimentación). Las semanas cerradas se ven pero no se editan. Las no visibles no aparecen.
2. Al elegir una semana, formulario de una columna con los campos configurados, el requisito de la semana como texto de encabezado, y contador de caracteres cuando haya límite.
3. Guardado automático de borrador con debounce de aproximadamente dos segundos, más indicador discreto de "guardado" con la hora. Activa la persistencia local de Firestore para que un corte de red no bote lo escrito.
4. Botón para entregar, que fija la fecha de entrega. Después de entregar, el estudiante puede seguir editando mientras la semana esté activa, y la fecha de última edición queda registrada.
5. Si la semana permite adjuntos: campo de enlace a Drive siempre disponible, y subida directa de archivo solo si la bandera de Storage está activada en la configuración de la semana. Acepta imágenes y PDF, máximo cinco megabytes por archivo y tres archivos por entrega.
6. La retroalimentación del docente aparece dentro de la semana correspondiente, con el emoji y el texto, y marca como vista al abrirla.

## Pantalla de administrador

1. Ruta `/admin`, accesible solo al correo administrador.
2. Editor de semanas: lista de las quince semanas, con activar y desactivar, mostrar y ocultar, y edición de fecha, título y requisito. Editor de campos por semana con agregar, eliminar, reordenar y duplicar, y un botón para copiar la configuración de campos de otra semana.
3. Visor de respuestas con dos vistas: por semana, con todas las entregas de todos los estudiantes en una sola pantalla desplazable y comparable; y por estudiante, con sus quince semanas en secuencia. Contador de entregas recibidas sobre el total de estudiantes con perfil creado.
4. Retroalimentación desde el visor, sin cambiar de pantalla: un campo de texto breve y una fila de emojis fijos para reaccionar en un toque. Usa este conjunto: 👍 ✅ 🤔 ⚠️ 🔁. Guardar debe ser una sola acción y quedar visible de inmediato.
5. Exportación a CSV de una semana o de todo el semestre, con una fila por entrega y una columna por campo, incluyendo correo, nombre, fechas y la retroalimentación.
6. Búsqueda por nombre o correo, y filtro por estado de entrega.

## Datos iniciales

Incluye un script de siembra, `seed.js`, que crea las quince semanas con esta información. Fechas de 2026, sesiones los miércoles. Todas las semanas nacen con `visible: false` y `estado: cerrada`, salvo la semana 01, que nace activa y visible.

| Semana | Fecha | Título | Requisito de la semana |
|---|---|---|---|
| 01 | 12/08 | Presentación y puesta en marcha | Autodiagnóstico de partida: qué sé de antemano, qué creo que debería saber y no sé, qué me ha costado, qué me gusta y qué no me gusta del análisis de datos. |
| 02 | 19/08 | Medición y levantamiento de datos | Ficha de dos ítems propios: constructo que apuntan, nivel de medición, redacción final y una razón concreta por la que podrían fallar. |
| 03 | 26/08 | Gestión de datos y análisis univariante | Bitácora de limpieza: tres decisiones tomadas sobre la base cruda, con captura del antes y del después de cada una. |
| 04 | 02/09 | Calidad de la medición y supuestos | Reporte de una escala: indicador de consistencia obtenido, ítem más débil, y qué se hizo con él y por qué. |
| 05 | 09/09 | Cierre de la unidad 1 | Cierre de unidad: tres cosas que sé hacer hoy y no sabía hace un mes, y una que sigo sin entender. |
| 06 | 23/09 | Lógica inferencial y análisis cuali con cuali | Una tabla de contingencia propia interpretada en cinco líneas, sin usar la palabra significativo. |
| 07 | 30/09 | Comparación de dos grupos | Comparación de dos grupos con su tamaño del efecto e intervalo, más una frase sobre qué cambiaría con una muestra mayor. |
| 08 | 07/10 | Más de dos grupos y relación entre cuantitativas | Un gráfico de dispersión con su recta ajustada, la ecuación, y la interpretación del intercepto y de la pendiente en las unidades del problema. |
| 09 | 14/10 | Cómo se reporta un resultado | Borrador de la tabla o figura principal del informe individual, con pie completo y en formato APA. |
| 10 | 21/10 | Feria de pósters | Autocrítica del póster: qué pregunta me hicieron que no supe responder, y cuál es la respuesta que hoy daría. |
| 11 | 28/10 | El modelo general lineal | Un modelo de regresión múltiple propio: qué aporta cada predictor, qué no aporta, y qué no se puede concluir del modelo. |
| 12 | 04/11 | Interacción y moderación | Registro de una disertación ajena: idea central, supuesto crítico del método, y una aplicación posible a la base del curso. |
| 13 | 11/11 | Del alfa al modelo factorial | Registro de una disertación ajena, mismo formato, sobre un tema distinto al de la semana anterior. |
| 14 | 18/11 | Respuesta al ítem y ecuaciones estructurales | Registro de una disertación ajena, mismo formato, más una pregunta abierta dirigida al docente. |
| 15 | 25/11 | Mapa de decisiones y cierre | Mapa personal de decisiones analíticas, en una plana, y balance del semestre. |

Los campos por defecto de cada semana, iguales para las quince y editables después, son cinco:

| id | Etiqueta | Tipo | Requerido | Ayuda |
|---|---|---|---|---|
| `requisito` | Registro de la semana | textoLargo | sí | Responde el requisito indicado arriba. |
| `bitacora` | Bitácora | textoLargo | sí | Qué hiciste esta mañana, en qué orden y qué decidiste. Tres a cinco líneas. |
| `evidencia` | Evidencia | enlace | no | Enlace a la captura o al archivo de análisis, con una línea que indique qué muestra. |
| `duda` | Duda abierta | textoCorto | sí | Una pregunta que quedó sin responder. |
| `semaforo` | Dominio de los objetivos de hoy | semaforo | sí | Con una línea de justificación en el campo siguiente. |

Agrega un sexto campo `justificacion`, textoCorto, no requerido, con etiqueta "Por qué elegiste ese nivel".

## Reglas de seguridad

Entrega un archivo `firestore.rules` y, si corresponde, `storage.rules`, que cumplan:

1. `perfiles/{uid}`: lectura y escritura solo del propio uid, con correo del dominio institucional. El administrador lee todo.
2. `semanas`: lectura para cualquier usuario autenticado del dominio institucional, pero solo de las visibles. Escritura solo del administrador.
3. `entregas/{id}`: crear y editar solo si el `id` corresponde a `{uid}_{semana}` del usuario autenticado, si la semana está activa y visible, y si el uid del documento coincide con el del solicitante. Lectura solo del propio documento. El administrador lee y escribe todo. Nadie puede editar la fecha de entrega de otro ni escribir en `entregas` de otro uid.
4. `entregas/{id}/feedback/docente`: escritura solo del administrador, lectura del dueño de la entrega y del administrador.
5. Validación de tamaño: rechaza campos de texto que superen los cincuenta mil caracteres, y documentos con más de veinte campos de respuesta.

Escribe también un archivo `PRUEBAS-REGLAS.md` con la lista de intentos que debo poder hacer a mano desde la consola para verificar que las reglas bloquean lo que dicen bloquear, incluyendo el caso de un estudiante intentando leer la entrega de otro y el caso de un estudiante intentando escribir en una semana cerrada.

## Apariencia

Sobrio, neutro, blanco y negro, sin color de acento, sin sombras, sin esquinas redondeadas llamativas, sin iconografía decorativa. Tipografía del sistema. Contraste alto y tamaño de texto cómodo para leer en teléfono a la luz de una sala de clases. Una sola columna en móvil, ancho máximo de contenido alrededor de setecientos veinte píxeles en escritorio. Reglas finas grises para separar secciones en lugar de tarjetas con borde. Los emojis de reacción son el único elemento con color en toda la aplicación.

Que no parezca una plantilla genérica ni una demo. Debe parecer una herramienta interna de un curso.

## Entregables

1. `portafolio/index.html`, `portafolio/admin.html`, y los módulos JavaScript y la hoja de estilos que necesites, con nombres explícitos.
2. `portafolio/firebase-config.js` con marcadores de posición y comentarios.
3. `portafolio/seed.js` con los datos de las quince semanas.
4. `firestore.rules`, `storage.rules` si aplica, `firebase.json` y `.firebaserc` de ejemplo.
5. `portafolio/README.md` con los pasos exactos, en orden, para: crear el proyecto en Firebase, habilitar el proveedor de Google, restringir dominios autorizados, crear la base de datos, publicar las reglas, correr la siembra, desplegar con Hosting, y qué hacer si decido activar Cloud Storage más adelante, incluyendo que eso puede requerir plan Blaze.
6. `portafolio/PRUEBAS-REGLAS.md`.

## Criterios de aceptación

1. Un estudiante con cuenta institucional entra, ve la semana activa, escribe, cierra el navegador a mitad de camino, vuelve y encuentra su texto.
2. Un estudiante con cuenta que no es del dominio institucional no logra pasar del login.
3. Un estudiante no puede ver ni modificar la entrega de otro, ni por interfaz ni por consola.
4. Yo entro con el correo administrador, activo la semana 02, le agrego un campo, y el cambio aparece para los estudiantes sin necesidad de recargar la aplicación completa.
5. En el visor puedo recorrer todas las respuestas de una semana y dejar un emoji y dos líneas de comentario a cada una sin cambiar de pantalla.
6. Puedo exportar el semestre completo a CSV y abrirlo en una planilla con las tildes correctas.
7. Todo funciona en un teléfono de gama media con conexión lenta.

## Cómo trabajar

Antes de escribir código, muéstrame el árbol de archivos propuesto y el modelo de datos en una línea por colección, y espera confirmación. Después implementa completo, en un solo lote, y termina con una lista de lo que quedó fuera o a medias. No agregues funcionalidades que no estén aquí. No agregues analítica, ni notificaciones, ni tema oscuro, ni internacionalización. Deja comentarios solo donde la razón de una decisión no sea evidente.
