# Cuantieval Setup Guide

## Overview
Cuantieval is a peer-rating app for evaluating student-created materials (tripticos/infografias) about psychological instruments. Students rate 12 items on 5 dimensions using a 4-point scale.

## Public URL
```
https://lamp-umag.github.io/sssss/cuantieval/
```

## Firebase Setup (Required Before Launch)

The app uses the existing Firebase project `sssss-e8013`. You must configure Firestore security rules to allow read/write access to the new `cuantieval_ratings` collection.

### Step 1: Open Firestore Console
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project `sssss-e8013`
3. Click **Firestore Database** in the left sidebar
4. Click the **Rules** tab

### Step 2: Add Cuantieval Rules
Replace or add this rule block **without removing or modifying existing rules** for other collections:

```firestore
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // ════ Existing rules (DO NOT MODIFY) ════
    // (keep your existing survey, responses, etc. rules here)

    // ════ NEW: Cuantieval ratings (PRIVATE — contains RUT) ════
    match /cuantieval_ratings/{rut} {
      // "get" lets a rater fetch their OWN doc directly by RUT (they already
      // know their own document ID), to resume progress.
      allow get: if request.auth == null;
      allow write: if request.auth == null;
      // "list" is explicitly denied so nobody can run a collection query
      // and harvest every RUT + score in one request. Without this line,
      // anyone opening devtools could dump the whole ratings collection.
      allow list: if false;
    }

    // ════ NEW: Cuantieval public results (no RUT field at all) ════
    match /cuantieval_public/{code} {
      // Readable/listable by anyone — this is what resultados.html queries.
      // Docs here are keyed by an anonymous code and never contain a rut field.
      allow read: if request.auth == null;
      allow write: if request.auth == null;
    }
  }
}
```

**Note:** Cuantieval does NOT use Firebase Auth. Access is identified by the RUT (Chilean ID) entered at the gate. This is a two-collection privacy split:
- `cuantieval_ratings` is the admin-facing collection (has `rut`, used to resume progress and cross-reference identity). `allow list: if false` blocks bulk enumeration — a rater can only fetch a document if they already know its exact ID (their own RUT), they cannot list all documents in the collection.
- `cuantieval_public` is the anonymized mirror written automatically alongside every save (see `app.js` → `rutToCode()` / `saveRaterProgress()`). It has the same scores but a `code` instead of a `rut`, and is the only collection the public results page (`resultados.html`) ever reads. Even a technical user poking at Firestore from the browser console cannot recover a RUT from this collection, because the field simply isn't there.

### Step 3: Deploy Rules
Click **Publish** in the Firebase Console.

## Asset Pipeline: Adding Materials

### Prepare Your Files
1. Place PDFs and/or PNGs in the `cuantieval/imgs/` folder
2. Use standard instrument code names where possible:
   - `audit.pdf` → "AUDIT"
   - `16pf.pdf` → "16PF"
   - `htp.pdf` → "HTP"
   - `mbi.pdf` → "MBI (Burnout)"
   - `mini.pdf` → "MINI"
   - `moca.pdf` → "MoCA"
   - `pclr.pdf` → "PCL-R"
   - `pclyv.pdf` → "PCL:YV"
   - `ro.pdf` → "Rorschach"
   - `tat.pdf` → "TAT"

### Convert & Generate Manifest
Run the conversion script from the `cuantieval/` folder:

```bash
cd cuantieval/
bash convert.sh
```

What it does:
- Converts each PDF to PNG(s) at 150 DPI using `pdftoppm`
- Downscales images wider than 1600px to save bandwidth
- Keeps original PDFs for the download button
- Generates/refreshes `items.json` manifest with metadata

**Requirements:**
- `pdftoppm` (from `poppler-utils`)
  - **macOS:** `brew install poppler`
  - **Ubuntu:** `apt install poppler-utils`

### Edit Labels (Optional)
Edit `cuantieval/items.json` to customize labels or reorder items:

```json
[
  { "id": "audit", "label": "AUDIT", "files": ["imgs/audit-1.png"], "pdf": "imgs/audit.pdf", "status": "ok" },
  { "id": "grupo11", "label": "Grupo 11 - Depresión", "files": ["imgs/grupo11-1.png"], "pdf": null, "status": "ok" },
  ...
]
```

Fields:
- `id`: Unique identifier (used in Firestore)
- `label`: Display name shown to rater
- `files`: Array of PNG paths (can be empty for missing materials)
- `pdf`: Path to PDF for download, or `null` if unavailable
- `status`: `"ok"` or `"missing"`

## Public Results Page

```
https://lamp-umag.github.io/sssss/cuantieval/resultados.html
```

No login required — anyone with the link can open it. It reads only from `cuantieval_public` (never `cuantieval_ratings`), so RUTs are never exposed. It shows:
- Summary cards: number of evaluators, how many completed, overall average score.
- A per-material table (n responses + average for P1–P5 + overall average).
- A per-code table (progress / completion status), identified only by the anonymous code.
- A "Descargar CSV" button that exports one row per (code, item) pair — `code,item_id,item_label,p1,p2,p3,p4,p5,missing` — suitable for reliability analysis (e.g. Cronbach's alpha, ICC) in R/SPSS/Excel.

Each rater sees their own code on the completion screen after finishing, so they can verify their own submission landed without revealing it to anyone else.

This page requires the `cuantieval_public` Firestore rule above (`allow read: if request.auth == null`) to work. If it loads but the tables stay empty / "Cargando…" never resolves, check the rules and the browser console for permission errors.

## Monitoring Rater Progress

### View in Firestore Console
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project `sssss-e8013` → **Firestore Database**
3. Click **Collections** → `cuantieval_ratings`

Each document shows:
- **Document ID:** Normalized RUT (e.g., `12.345.678-5`)
- **rut:** Normalized RUT string
- **completedCount:** Number of materials rated (0–12)
- **completed:** `true/false` — whether all 12 are done
- **completedAt:** Timestamp when finished, or `null`
- **order:** Randomized item order (stable per rater)
- **responses:** Map of item ID → {p1, p2, p3, p4, p5, updatedAt} (the ratings)

### Query Examples (Firestore Console)

**Find who hasn't completed:**
```
collection("cuantieval_ratings").where("completed", "==", false)
```

**Find all who finished (sorted by time):**
```
collection("cuantieval_ratings").where("completed", "==", true).orderBy("completedAt", "desc")
```

**Count participants:**
```
collection("cuantieval_ratings") → count all documents
```

## Privacy & Security Notes

- **No passwords.** The RUT (entered openly by the student) is the only identifier.
- **Soft-anonymous (admin side).** Instructor can map RUT → student via the Firestore Console, but the UI never shows one rater another's identity or scores.
- **Anonymous (public side).** `resultados.html` and the CSV export never touch `cuantieval_ratings` — they only read `cuantieval_public`, which has no `rut` field. `allow list: if false` on `cuantieval_ratings` also blocks anyone from bulk-reading the private collection directly from the browser console.
- **Autosave.** Each rating tap is debounced and written to Firestore immediately (to both collections), so no progress is lost.
- **Completion tracking.** Instructor can query who rated and how many items they completed in `cuantieval_ratings` (has RUT). Anyone can see the same completion stats anonymized by code in `resultados.html`.

## Customization

### Change the RUT Gate
Edit the privacy text in `index.html` line ~28 if desired.

### Adjust Image Display Size
In `styles.css`, modify `.image-container` max-width or height.

### Reorder or Hide Instrument Labels
Edit `cuantieval/items.json` and change the `label` field; the item order in the file determines the initial sort (but raters see a shuffled order seeded by their RUT).

### Add a Backend Query Dashboard
The `cuantieval_ratings` collection has a simple schema suitable for queries via Firestore REST API or a serverless function. Example Node.js snippet:

```javascript
const admin = require('firebase-admin');
const db = admin.firestore();

async function getCompletionStats() {
  const snap = await db.collection('cuantieval_ratings')
    .where('completed', '==', true)
    .get();
  return {
    completed: snap.size,
    ruts: snap.docs.map(d => d.data().rut)
  };
}
```

## Troubleshooting

### "Material no disponible" appears for all items
**Cause:** `items.json` has empty `files` arrays or doesn't exist.
**Solution:** Run `convert.sh` to generate the manifest.

### "Missing or insufficient permissions" error in browser console
**Cause:** Firestore security rules not updated.
**Solution:** Follow the Firestore setup steps above and deploy rules.

### RUT validation rejects a valid RUT
**Cause:** Formatting issue (spaces, lowercase k, etc.).
**Solution:** App auto-normalizes most formats. Try entering as `12.345.678-5` or `12345678-5`.

### convert.sh fails: "pdftoppm: command not found"
**Solution:**
- **macOS:** `brew install poppler`
- **Ubuntu/Debian:** `apt install poppler-utils`
- **Windows (WSL):** `apt install poppler-utils`

## File Structure

```
cuantieval/
  index.html          Main app page (RUT gate + rating interface)
  app.js              App logic (Firebase I/O, RUT validation, seeded shuffle, anon code)
  styles.css          Mobile-first styles (shared with resultados.html)
  resultados.html     Public results page (no login)
  resultados.js        Results page logic (reads cuantieval_public, builds CSV)
  resultados.css       Results page layout
  items.json          Manifest of 12 items (auto-generated by convert.sh)
  convert.sh          PDF→PNG converter + manifest generator
  SETUP.md            This file
  imgs/
    *.png             Rasterized material images (PNG, some items have multiple pages)
    *.pdf             Original PDFs ("Ver completo" opens these directly when available)
    placeholder.png   Fallback image for missing materials
```

## Deployment

The app is already deployed to GitHub Pages at the URL above. After editing materials or items.json:

1. Run `convert.sh` to regenerate PNGs and manifest
2. Commit: `git add cuantieval/`
3. Push: `git push`
4. GitHub Pages auto-deploys within 1–5 minutes

No build step or backend needed.

## Questions?

Refer to the code comments in `app.js` for implementation details (RUT validation, seeded shuffle, Firestore I/O patterns, etc.).
