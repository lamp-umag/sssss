# Cuantieval Launch Checklist

## ✅ Completed
- [x] Mobile-first HTML interface (RUT gate + card-based rating UI)
- [x] RUT validation (Chilean modulo-11 check)
- [x] Seeded PRNG shuffle (stable per rater, randomized across raters)
- [x] 5 rating questions with 4-level scale (all in Spanish)
- [x] Auto-save to Firestore on each tap (debounced)
- [x] Progress tracking (progress bar, jump buttons, completion counter)
- [x] Navigation (next/prev buttons, jump to any item)
- [x] Missing material handling (placeholder image + auto-complete)
- [x] Item manifest system (items.json)
- [x] PDF→PNG conversion script (convert.sh)
- [x] Firestore schema (cuantieval_ratings collection)
- [x] Setup documentation (SETUP.md)
- [x] All code self-contained in cuantieval/ folder
- [x] No existing files modified
- [x] Reuses existing Firebase project (sssss-e8013)
- [x] Privacy notice shown at RUT gate
- [x] Multi-page materials (HTP, Rorschach) shown as a swipeable horizontal carousel
- [x] "Ver completo" opens the original PDF when one exists, in-app pinch/pan zoom otherwise
- [x] Anonymous per-RUT code + no-login public results page (resultados.html) + CSV export

## ⚠️ Required Before Launch

### 1. **Update Firestore Security Rules** (15 min)
This is the only remaining step. Without it, the app will show "Missing or insufficient permissions" errors.

**Steps:**
1. Go to [Firebase Console](https://console.firebase.google.com/) → sssss-e8013
2. Click **Firestore Database** → **Rules** tab
3. Find the existing rules and add this block:
   ```firestore
   match /cuantieval_ratings/{rut} {
     allow get: if request.auth == null;
     allow write: if request.auth == null;
     allow list: if false;
   }
   match /cuantieval_public/{code} {
     allow read, write: if request.auth == null;
   }
   ```
4. Click **Publish**

`cuantieval_public` is what the new no-login results page reads (codes only, no RUTs). `allow list: if false` on `cuantieval_ratings` stops anyone from bulk-dumping the private collection. See **SETUP.md** for detailed instructions with context.

### 2. **Add Material Files** (depends on your timeline)
When you have PDFs/PNGs from students:
```bash
cd cuantieval/
# Copy your PDFs to imgs/
bash convert.sh
```

## 📋 File Inventory

```
cuantieval/
├── index.html          # App page (RUT gate + rating interface)
├── app.js              # Logic: validation, Firebase, shuffle, anon code, UI
├── styles.css          # Mobile-first styles (shared with resultados.html)
├── resultados.html     # Public, no-login results page
├── resultados.js        # Results logic: aggregates + CSV export
├── resultados.css       # Results page layout
├── items.json          # Manifest of items
├── convert.sh          # PDF→PNG + manifest generator
├── SETUP.md            # Complete setup guide
├── CHECKLIST.md        # This file
└── imgs/
    ├── placeholder.png # Fallback for missing materials
    ├── *.png           # Material PNGs (multi-page items have -0, -1, ... suffixes)
    └── *.pdf           # Original PDFs ("Ver completo" opens these when available)
```

## 🚀 Public URLs
```
https://lamp-umag.github.io/sssss/cuantieval/              (rating app)
https://lamp-umag.github.io/sssss/cuantieval/resultados.html  (public results, no login)
```

Ready to use immediately after Firestore rules are deployed.

## 🔍 Testing the App (now)

Open `https://lamp-umag.github.io/sssss/cuantieval/` in a phone browser (or desktop in mobile view):

1. **RUT Gate**: Enter any valid Chilean RUT (e.g., `12.345.678-5`). If rejected, generate one at [generador-rut.com](https://www.generador-rut.com/)
2. **Card View**: 
   - See all items
   - Click rating buttons (they highlight when selected)
   - Use ← Anterior / Siguiente → to navigate
   - Click numbered buttons to jump to any item
   - Each tap writes to Firestore (if rules are set up)
3. **Completion**: After rating all items, completion screen appears
4. **Privacy**: RUT shown only to owner; no peer data shared

## 📊 Monitoring Completion

Once Firestore rules are live, queries work:

**Firestore Console:**
- Go to Firestore → Collections → `cuantieval_ratings`
- Each document = one rater (ID = their RUT)
- Fields: `completed` (bool), `completedCount` (0–N), `completedAt` (timestamp)

**Quick Query (Firestore Console):**
```
collection("cuantieval_ratings").where("completed", "==", true).orderBy("completedAt", "desc")
```

Lists all students who finished, sorted by finish time.

## 🛠️ Customization Examples

### Change RUT privacy text
Edit `index.html` line ~28

### Adjust rating scale
Edit `app.js` line ~SCALE array (but requires schema change)

### Reorder items
Edit `items.json` and reorder, or re-run `convert.sh`

### Hide instrument labels
Edit `styles.css` to hide `.item-label`

## ⚡ One-Liner to Deploy After Adding Files

```bash
cd cuantieval && bash convert.sh && cd .. && git add cuantieval/ && git commit -m "Update cuantieval materials" && git push
```

## 📝 Questions or Issues?

Refer to **SETUP.md** for:
- Firestore rules (with images)
- convert.sh requirements & usage
- Troubleshooting common issues
- Schema documentation for backend integration
- Customization examples

## Summary
**Status:** ✅ Ready to launch (pending Firestore rules only)
**Timeline:** ~15 min to enable, then live
**Users:** Students (Chile, Spanish language)
**Data:** Secure in existing Firebase project, no external APIs
