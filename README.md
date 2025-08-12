# sssss — Stupidly Simple Short Sample Survey

Sitio estático minimalista (mobile-first) para encuestas breves y respuestas anónimas en Firebase Firestore.

## Estructura

- `index.html`: lista y corre encuestas (una pregunta a la vez).
- `admin.html`: exporta CSV de respuestas por encuesta.
- `surveys/index.json`: índice de encuestas disponibles.
- `surveys/*.json`: definición de cada encuesta.
- `.nojekyll`: asegura assets crudos en GitHub Pages.

## JSON de encuesta (schema)

```json
{
  "id": "wellbeing",
  "title": "Título visible",
  "description": "Descripción opcional",
  "items": [
    { "id": "q1", "type": "likert", "prompt": "Texto", "required": true, "options": ["1","2","3","4","5"] },
    { "id": "q2", "type": "single_choice", "prompt": "Texto", "options": ["A","B"] },
    { "id": "q3", "type": "multi_choice", "prompt": "Texto", "options": ["A","B","C"] },
    { "id": "age", "type": "number", "prompt": "Edad", "min": 0, "max": 120 },
    { "id": "note", "type": "text", "prompt": "Comentario", "long": true, "maxLength": 600 }
  ]
}
```

Agrega nuevas encuestas creando `surveys/nueva.json` y referénciala en `surveys/index.json`.

## Firebase (Firestore)

Usa los SDK web v12 (ya importados en los HTML). Reglas de Firestore (modo demo) para permitir envío y lectura sin auth:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /responses/{surveyId}/entries/{entryId} {
      allow create: if true;           // cualquiera puede responder
      allow read: if true;             // admin sin auth (demo)
      allow update, delete: if false;  // nadie edita/borra
    }
  }
}
```

Colección de respuestas: `responses/{surveyId}/entries/{entryId}` con campos `answers` (objeto), `createdAt` (serverTimestamp), `ua`, `path`.

Para producción: restringe `read` a usuarios autenticados y sirve `admin.html` tras login.

## Despliegue en GitHub Pages

- Habilita Pages desde la rama `main` (carpeta root).
- `.nojekyll` incluido para servir `surveys/*.json` sin transformación.
