# Portafolio semanal — Análisis de Datos

App mobile-first para el registro semanal de portafolio (Análisis de Datos,
tercer año de Psicología, UMAG, segundo semestre de 2026). Sin build, sin
framework: HTML/CSS/JS con módulos ES nativos, Firebase SDK v12.1.0 desde CDN.

## Decisiones respecto al encargo original

El prompt en `prompt-app-portafolio.md` asumía un proyecto Firebase nuevo y
Firebase Hosting. Se decidió con el profesor lo siguiente, para reusar lo que
ya funciona en este repo:

- **Mismo proyecto Firebase**, `sssss-e8013` — el mismo que usan `index.html`
  (encuestas) y `cuantieval/`. `firebase-config.js` trae la configuración
  real, no un marcador de posición.
- **GitHub Pages para servir el sitio**, no Firebase Hosting. Igual que el
  resto del repo: no hay `firebase.json` ni `.firebaserc`, y las reglas de
  Firestore se pegan a mano en la consola (así se ha hecho siempre acá, ver
  `cuantieval/SETUP.md`).

Como el proyecto es compartido, `firestore.rules` en esta carpeta trae
**las reglas de las tres apps juntas** (encuestas, cuantieval y portafolio),
transcritas a partir de lo documentado en `README.md` y `cuantieval/SETUP.md`
de la raíz del repo — nadie leyó las reglas reales desde la consola para
escribir esto. Antes de publicar, compáralas con lo que hay hoy en Firestore
→ Rules, por si algo se desvió de lo documentado.

## 1. Verificar el proveedor de Google en Firebase Auth

Ya debería estar habilitado (lo usan `admin.html` de la raíz y
`cuantieval/resultados.html`). Para confirmar:

1. [Consola de Firebase](https://console.firebase.google.com/) → proyecto
   `sssss-e8013` → **Authentication** → **Sign-in method**.
2. Confirma que **Google** esté habilitado.
3. En **Settings → Authorized domains**, confirma que esté `lamp-umag.github.io`
   (si no está, agrégalo — si no, el login con popup falla en producción).

No hace falta restringir dominios autorizados de Firebase Auth a `@umag.cl`:
esa restricción se aplica en la app (`estudiante.js`, cierra sesión si el
correo no termina en `@umag.cl` y no es el correo administrador) y, de forma
real e inevitable, en `firestore.rules`.

## 2. Publicar las reglas de Firestore

1. Abre **Firestore Database → Rules** en la consola.
2. Compara el contenido actual con `portafolio/firestore.rules` de este
   repo. Las secciones marcadas "EXISTENTE" deberían coincidir en espíritu
   con lo que ya hay (encuestas y cuantieval); si hay diferencias, ajusta el
   archivo antes de publicar para no romper esas apps.
3. Pega el contenido completo de `portafolio/firestore.rules` y **Publish**.

Si vas a permitir adjuntos directos en alguna semana más adelante, revisa
también la sección "Activar Cloud Storage" más abajo antes de publicar
`storage.rules`.

## 3. Sembrar las 15 semanas

```bash
cd /ruta/al/repo
npm install          # ya trae firebase-admin (ver package.json de la raíz)
```

1. En la consola: **Configuración del proyecto → Cuentas de servicio →
   Generar nueva clave privada**. Descarga el JSON.
2. Guárdalo como `portafolio/serviceAccountKey.json` (ya está en
   `.gitignore` — nunca se sube al repo).
3. Corre:
   ```bash
   node portafolio/seed.js
   ```
4. Debería imprimir `Sembradas 15 semanas...`. La semana 01 queda activa y
   visible; el resto, cerradas y ocultas — actívalas y hazlas visibles desde
   `admin.html` cuando corresponda cada semana.

Puedes volver a correr `seed.js` cuando quieras (sobrescribe las 15 semanas
con estos datos; no toca `entregas` ni `perfiles`).

## 4. Publicar en GitHub Pages

No hay paso de build. Basta con subir los archivos:

```bash
git add portafolio/ .gitignore
git commit -m "Agregar app de portafolio semanal"
git push
```

GitHub Pages despliega solo en 1–5 minutos. Quedará en:

- Estudiantes: `https://lamp-umag.github.io/sssss/portafolio/`
- Administrador: `https://lamp-umag.github.io/sssss/portafolio/admin.html`

## 5. Activar Cloud Storage más adelante (opcional)

Por ahora todas las semanas nacen con `permitirArchivo: false`: los
estudiantes solo pueden dejar un enlace (Drive u otro) en el campo
`evidencia`. Si más adelante quieres subida directa de archivos:

1. **Requiere plan Blaze** (pago por uso) — Spark (gratis) no habilita
   Cloud Storage. Actívalo en **Configuración del proyecto → Uso y
   facturación**. El plan Blaze tiene una capa gratuita generosa; para el
   volumen de un curso (PDFs/imágenes de unos 40 estudiantes, 5 MB máximo
   por archivo) es muy improbable que genere costo real, pero revisa las
   alertas de presupuesto si te preocupa.
2. En **Storage** de la consola, click en **Comenzar** para crear el bucket
   si no existe.
3. Pega el contenido de `portafolio/storage.rules` en **Storage → Rules** y
   publica.
4. Desde `admin.html`, marca "Permitir adjuntos esta semana" en las semanas
   donde lo quieras habilitar. El botón de subir archivo aparece solo ahí.

## Estructura

```
portafolio/
  index.html            vista estudiante
  admin.html              vista administrador
  firebase-config.js      config del proyecto compartido + ADMIN_EMAIL
  estudiante.js            lógica de la vista estudiante
  admin.js                 lógica de la vista administrador
  estilos.css              hoja de estilos compartida
  seed.js                  siembra las 15 semanas (node, firebase-admin)
  firestore.rules          reglas de todo el proyecto (existentes + nuevas)
  storage.rules             reglas de Storage, solo si activas adjuntos
  README.md                 este archivo
  PRUEBAS-REGLAS.md         checklist manual para probar las reglas
```

## Qué quedó fuera o a medias

- **`entregas.adjuntos` / campo tipo `archivo`**: el prompt original describe
  el flujo de adjuntos de dos formas ligeramente distintas (una bandera única
  "permitir subida de archivos" en la tabla de datos, y luego texto que habla
  de "la bandera de Storage" como si fuera otra cosa). Se implementó con una
  sola bandera por semana (`permitirArchivo`) que habilita a la vez el
  enlace y la subida directa; si en verdad se querían dos banderas
  independientes, hay que separarlas en `semanas` y en el formulario.
- **Retroalimentación "vista al abrirla"**: el prompt dice en la sección de
  reglas que `entregas/{id}/feedback/docente` solo lo escribe el
  administrador, pero en la pantalla de estudiante pide que se marque como
  vista al abrirla (una escritura del estudiante). Se resolvió permitiendo
  al dueño de la entrega escribir *solo* el campo `vistoPorEstudiante`, y
  únicamente de `false` a `true` — todo lo demás del documento sigue siendo
  de solo lectura para el estudiante. Queda documentado en
  `PRUEBAS-REGLAS.md`.
- **Editar nombre**: usa `window.prompt()` en vez de un formulario en línea,
  por simplicidad. Funciona pero no es lo más elegante ni lo más consistente
  con el resto de la interfaz.
- **Reordenar campos** en el editor de semanas es con botones ▲/▼, no
  arrastrar y soltar.
- **Validación de 50.000 caracteres por campo de texto**: no es exigible
  desde `firestore.rules` porque el lenguaje de reglas no puede iterar sobre
  las claves dinámicas de `respuestas` (los ids de campo los define el
  administrador, no son fijos). Se aplica en la interfaz (contador de
  caracteres + `maxCaracteres` de cada campo) y queda como respaldo el
  límite duro de 1 MiB por documento que impone Firestore. Detalle en
  `PRUEBAS-REGLAS.md`.
- **Tope de 3 archivos por entrega**: se valida en la interfaz
  (`estudiante.js`) antes de subir, no en `storage.rules` (Storage Rules no
  tiene forma simple de contar archivos ya subidos en otra ruta).
- No se agregó nada fuera de lo pedido: sin analítica, sin notificaciones,
  sin tema oscuro, sin internacionalización.
