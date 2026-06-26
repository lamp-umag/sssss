import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCq05NElKm-01Xyraj6qdF31IgOLf8gQbA",
  authDomain: "sssss-e8013.firebaseapp.com",
  projectId: "sssss-e8013",
  storageBucket: "sssss-e8013.firebasestorage.app",
  messagingSenderId: "765571239773",
  appId: "1:765571239773:web:39ea76d035d314cdd4a2b4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ────── RUT Validation ──────
function validateRUT(rut) {
  rut = rut.trim().toUpperCase();
  const match = rut.match(/^(\d{1,2})\.?(\d{3})\.?(\d{3})-?([\dK])$/);
  if (!match) return null;

  const [, part1, part2, part3, verifier] = match;
  const numStr = part1 + part2 + part3;
  const num = parseInt(numStr, 10);

  let sum = 0;
  let mult = 2;
  for (let i = numStr.length - 1; i >= 0; i--) {
    sum += parseInt(numStr[i], 10) * mult;
    mult++;
    if (mult > 7) mult = 2;
  }

  const remainder = sum % 11;
  const expected = remainder === 0 ? '0' : remainder === 1 ? 'K' : (11 - remainder).toString();

  if (expected !== verifier) return null;

  return `${parseInt(part1, 10)}.${part2}.${part3}-${verifier}`;
}

function normalizeRUT(rut) {
  const match = rut.match(/^(\d{1,2})\.?(\d{3})\.?(\d{3})-?([\dK])$/i);
  if (!match) return null;
  return `${parseInt(match[1], 10)}.${match[2]}.${match[3]}-${match[4].toUpperCase()}`;
}

// ────── Anonymous code (for public results, never reversible from the UI) ──────
function rutToCode(rut) {
  const salted = "cuantieval-2025::" + rut;
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < salted.length; i++) {
    const c = salted.charCodeAt(i);
    h1 = (h1 * 33) ^ c;
    h2 = (h2 * 31) ^ c;
  }
  h1 = h1 >>> 0;
  h2 = h2 >>> 0;
  const n = (h1 * 65536 + (h2 & 0xffff)) % 2147483647;
  return "R-" + n.toString(36).toUpperCase().padStart(6, "0");
}

// ────── Seeded PRNG ──────
function simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

function seededShuffle(items, seed) {
  const arr = [...items];
  let hash = seed;

  for (let i = arr.length - 1; i > 0; i--) {
    hash = (hash * 16807) % 2147483647;
    const j = Math.floor((hash / 2147483647) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

// ────── State ──────
let currentRUT = null;
let currentCode = null;
let itemsManifest = [];
let raterOrder = [];
let raterResponses = {};
let currentItemIndex = 0;
let isCompleted = false;

// ────── Questions ──────
const QUESTIONS = [
  {
    id: "p1",
    text: "¿Cubre lo esencial del instrumento? (origen, que mide, como esta su evidencia psicometrica, y cuando conviene usarlo o no)"
  },
  {
    id: "p2",
    text: "¿Un companero/a que no sabe nada del instrumento lo entenderia solo con este material, sin la presentacion oral ni el PPT?"
  },
  {
    id: "p3",
    text: "¿Presenta la evidencia de forma honesta, incluyendo limitaciones, en vez de venderlo acriticamente?"
  },
  {
    id: "p4",
    text: "¿Esta visualmente organizado, con jerarquia y secciones claras? (no es un muro de texto ni pura decoracion)"
  },
  {
    id: "p5",
    text: "¿Es una sintesis hecha para este formato, y no diapositivas o parrafos reciclados pegados en un triptico?"
  }
];

const SCALE = [
  { value: 0, label: "No" },
  { value: 1, label: "Si, pero incompleto" },
  { value: 2, label: "Si, claramente" },
  { value: 3, label: "Si, y esta excelente" }
];

// ────── DOM Elements ──────
const gateScreen = document.getElementById("gate");
const appScreen = document.getElementById("app");
const rutInput = document.getElementById("rutInput");
const gateBtnEnter = document.getElementById("gateBtnEnter");
const rutError = document.getElementById("rutError");

const cardView = document.getElementById("cardView");
const completionScreen = document.getElementById("completionScreen");
const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");
const imageContainer = document.getElementById("imageContainer");
const questionsContainer = document.getElementById("questionsContainer");
const btnPrev = document.getElementById("btnPrev");
const btnNext = document.getElementById("btnNext");
const btnZoom = document.getElementById("btnZoom");
const btnDownload = document.getElementById("btnDownload");
const jumpButtons = document.getElementById("jumpButtons");

const zoomModal = document.getElementById("zoomModal");
const zoomContainer = document.getElementById("zoomContainer");
const btnCloseZoom = document.getElementById("btnCloseZoom");
const btnDownloadZoom = document.getElementById("btnDownloadZoom");

const btnReview = document.getElementById("btnReview");
const btnClose = document.getElementById("btnClose");

// ────── Load items.json ──────
async function loadItems() {
  try {
    const res = await fetch("items.json");
    if (!res.ok) throw new Error("Failed to load items.json");
    itemsManifest = await res.json();
  } catch (e) {
    console.error("Error loading items:", e);
    itemsManifest = [];
  }
}

// ────── Firestore I/O ──────
async function loadRaterProgress(rut) {
  try {
    const docRef = doc(db, "cuantieval_ratings", rut);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      const data = snapshot.data();
      raterOrder = data.order || [];
      raterResponses = data.responses || {};
      isCompleted = data.completed || false;
      return true;
    }
  } catch (e) {
    console.error("Error loading rater progress:", e);
  }
  return false;
}

async function saveRaterProgress() {
  if (!currentRUT) return;

  const completedCount = Object.values(raterResponses).filter(r => {
    if (r.missing) return true;
    return r.p1 !== undefined && r.p2 !== undefined && r.p3 !== undefined && r.p4 !== undefined && r.p5 !== undefined;
  }).length;

  const allDone = completedCount === itemsManifest.length;

  try {
    const docRef = doc(db, "cuantieval_ratings", currentRUT);
    await setDoc(docRef, {
      rut: currentRUT,
      code: currentCode,
      startedAt: serverTimestamp(),
      lastUpdatedAt: serverTimestamp(),
      order: raterOrder,
      responses: raterResponses,
      completedCount,
      completed: allDone,
      completedAt: allDone && !isCompleted ? serverTimestamp() : null
    }, { merge: true });

    // Public mirror: same scores, NO rut field, keyed by anonymous code.
    // This is what the public results page (resultados.html) reads from.
    if (currentCode) {
      const publicRef = doc(db, "cuantieval_public", currentCode);
      await setDoc(publicRef, {
        code: currentCode,
        lastUpdatedAt: serverTimestamp(),
        responses: raterResponses,
        completedCount,
        completed: allDone,
        completedAt: allDone && !isCompleted ? serverTimestamp() : null
      }, { merge: true });
    }

    isCompleted = allDone;
  } catch (e) {
    console.error("Error saving progress:", e);
  }
}

async function saveAnswer(itemId, questionId, value) {
  if (!raterResponses[itemId]) {
    raterResponses[itemId] = { updatedAt: new Date().toISOString() };
  }

  if (value === null || value === undefined) {
    delete raterResponses[itemId][questionId];
  } else {
    raterResponses[itemId][questionId] = value;
  }

  raterResponses[itemId].updatedAt = new Date().toISOString();

  await saveRaterProgress();
}

// ────── UI: RUT Gate ──────
gateBtnEnter.addEventListener("click", async () => {
  const rut = rutInput.value.trim();
  const normalized = normalizeRUT(rut);

  if (!normalized || !validateRUT(normalized)) {
    rutError.textContent = "RUT inválido. Verifica el formato y el dígito verificador.";
    return;
  }

  rutError.textContent = "";
  currentRUT = normalized;
  currentCode = rutToCode(normalized);

  await loadItems();

  if (itemsManifest.length === 0) {
    rutError.textContent = "Error cargando materiales.";
    return;
  }

  const seed = simpleHash(currentRUT);
  const ids = itemsManifest.map(item => item.id);
  raterOrder = seededShuffle(ids, seed);

  const found = await loadRaterProgress(currentRUT);
  if (!found) {
    raterResponses = {};
    await saveRaterProgress();
  }

  gateScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");

  renderCard(0);
  updateCompletionCheck();
});

rutInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    gateBtnEnter.click();
  }
});

// ────── UI: Card Rendering ──────
function getItemById(id) {
  return itemsManifest.find(item => item.id === id);
}

function renderCard(index) {
  if (index < 0 || index >= raterOrder.length) return;

  currentItemIndex = index;
  const itemId = raterOrder[index];
  const item = getItemById(itemId);

  if (!item) return;

  // Progress
  progressText.textContent = `Material ${index + 1} de ${raterOrder.length}`;
  progressFill.style.width = `${((index + 1) / raterOrder.length) * 100}%`;

  // Images
  imageContainer.innerHTML = "";

  if (item.files && item.files.length > 0) {
    const label = document.createElement("p");
    label.className = "item-label";
    label.textContent = item.label;
    imageContainer.appendChild(label);

    if (item.files.length > 1) {
      const carousel = document.createElement("div");
      carousel.className = "image-carousel";

      item.files.forEach((file) => {
        const page = document.createElement("div");
        page.className = "carousel-page";
        const img = document.createElement("img");
        img.src = file;
        img.alt = item.label;
        img.loading = "lazy";
        img.addEventListener("click", () => openFullView(item));
        page.appendChild(img);
        carousel.appendChild(page);
      });
      imageContainer.appendChild(carousel);

      const hint = document.createElement("p");
      hint.className = "carousel-hint";
      hint.textContent = `Desliza para ver las ${item.files.length} páginas →`;
      imageContainer.appendChild(hint);
    } else {
      const img = document.createElement("img");
      img.src = item.files[0];
      img.alt = item.label;
      img.addEventListener("click", () => openFullView(item));
      imageContainer.appendChild(img);
    }
  } else {
    const placeholder = document.createElement("div");
    placeholder.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;";
    const img = document.createElement("img");
    img.src = "imgs/placeholder.png";
    img.alt = "Material no disponible";
    img.style.cssText = "width:120px;height:120px;opacity:0.5;";
    const label = document.createElement("p");
    label.textContent = `${item.label} - Material no entregado`;
    label.style.cssText = "margin:0;font-size:14px;color:var(--muted);text-align:center;";
    placeholder.appendChild(img);
    placeholder.appendChild(label);
    imageContainer.appendChild(placeholder);

    if (!raterResponses[itemId]) {
      raterResponses[itemId] = { missing: true };
      saveRaterProgress();
    }
  }

  // Questions
  questionsContainer.innerHTML = "";
  QUESTIONS.forEach((q) => {
    const block = document.createElement("div");
    block.className = "question-block";

    const qText = document.createElement("p");
    qText.className = "question-text";
    qText.textContent = q.text;
    block.appendChild(qText);

    const optionsDiv = document.createElement("div");
    optionsDiv.className = "question-options";

    const currentValue = raterResponses[itemId]?.[q.id];

    SCALE.forEach((s) => {
      const btn = document.createElement("button");
      btn.className = "option-btn";
      if (currentValue === s.value) btn.classList.add("selected");
      btn.textContent = `${s.value === 0 ? "No" : s.value === 1 ? "Si, pero incompleto" : s.value === 2 ? "Si, claramente" : "Si, y esta excelente"}`;
      btn.addEventListener("click", async () => {
        await saveAnswer(itemId, q.id, s.value);
        renderCard(currentItemIndex);
        updateCompletionCheck();
      });
      optionsDiv.appendChild(btn);
    });

    block.appendChild(optionsDiv);
    questionsContainer.appendChild(block);
  });

  // Navigation
  btnPrev.disabled = index === 0;
  btnNext.disabled = index === raterOrder.length - 1;

  // Download button
  if (item.pdf) {
    btnDownload.style.display = "block";
  } else {
    btnDownload.style.display = item.files && item.files.length > 0 ? "block" : "none";
  }

  // Jump buttons
  jumpButtons.innerHTML = "";
  raterOrder.forEach((id, idx) => {
    const btn = document.createElement("button");
    btn.className = "jump-btn";
    btn.textContent = (idx + 1).toString();

    if (idx === index) {
      btn.classList.add("active");
    } else if (raterResponses[id]) {
      const resp = raterResponses[id];
      const isDone = resp.missing || (resp.p1 !== undefined && resp.p2 !== undefined && resp.p3 !== undefined && resp.p4 !== undefined && resp.p5 !== undefined);
      if (isDone) btn.classList.add("done");
    }

    btn.addEventListener("click", () => renderCard(idx));
    jumpButtons.appendChild(btn);
  });
}

function updateCompletionCheck() {
  const completedCount = Object.values(raterResponses).filter(r => {
    if (r.missing) return true;
    return r.p1 !== undefined && r.p2 !== undefined && r.p3 !== undefined && r.p4 !== undefined && r.p5 !== undefined;
  }).length;

  if (completedCount === itemsManifest.length) {
    isCompleted = true;
    cardView.classList.add("hidden");
    completionScreen.classList.remove("hidden");
    const codeEl = document.getElementById("completionCode");
    if (codeEl) codeEl.textContent = currentCode || "—";
  }
}

// ────── Navigation ──────
btnPrev.addEventListener("click", () => {
  renderCard(currentItemIndex - 1);
});

btnNext.addEventListener("click", () => {
  renderCard(currentItemIndex + 1);
});

btnReview.addEventListener("click", () => {
  isCompleted = false;
  completionScreen.classList.add("hidden");
  cardView.classList.remove("hidden");
  renderCard(0);
});

btnClose.addEventListener("click", () => {
  location.reload();
});

// ────── Full View: PDF if available, else in-app zoom ──────
function openFullView(item) {
  if (!item) return;
  if (item.pdf) {
    window.open(item.pdf, "_blank", "noopener");
  } else if (item.files && item.files.length > 0) {
    openZoom(item.files[0], item.label);
  }
}

// ────── Zoom Viewer (pinch-to-zoom + pan + double-tap) ──────
let zoomScale = 1;
let zoomX = 0;
let zoomY = 0;
let zoomStartDist = 0;
let zoomStartScale = 1;
let zoomDragging = false;
let zoomLastX = 0;
let zoomLastY = 0;
let zoomLastTap = 0;

function applyZoomTransform() {
  const img = zoomContainer.querySelector("img");
  if (img) img.style.transform = `translate(${zoomX}px, ${zoomY}px) scale(${zoomScale})`;
}

function resetZoomTransform() {
  zoomScale = 1;
  zoomX = 0;
  zoomY = 0;
  applyZoomTransform();
}

function touchDist(touches) {
  return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
}

zoomContainer.addEventListener("touchstart", (e) => {
  if (e.touches.length === 2) {
    zoomStartDist = touchDist(e.touches);
    zoomStartScale = zoomScale;
  } else if (e.touches.length === 1) {
    zoomDragging = true;
    zoomLastX = e.touches[0].clientX;
    zoomLastY = e.touches[0].clientY;
  }
}, { passive: true });

zoomContainer.addEventListener("touchmove", (e) => {
  if (e.touches.length === 2) {
    e.preventDefault();
    const d = touchDist(e.touches);
    zoomScale = Math.min(Math.max(zoomStartScale * (d / zoomStartDist), 1), 4);
    applyZoomTransform();
  } else if (e.touches.length === 1 && zoomDragging && zoomScale > 1) {
    e.preventDefault();
    zoomX += e.touches[0].clientX - zoomLastX;
    zoomY += e.touches[0].clientY - zoomLastY;
    zoomLastX = e.touches[0].clientX;
    zoomLastY = e.touches[0].clientY;
    applyZoomTransform();
  }
}, { passive: false });

zoomContainer.addEventListener("touchend", () => {
  zoomDragging = false;
  const now = Date.now();
  if (now - zoomLastTap < 300) {
    zoomScale = zoomScale > 1 ? 1 : 2.5;
    zoomX = 0;
    zoomY = 0;
    applyZoomTransform();
  }
  zoomLastTap = now;
});

zoomContainer.addEventListener("wheel", (e) => {
  e.preventDefault();
  zoomScale = Math.min(Math.max(zoomScale - e.deltaY * 0.002, 1), 4);
  applyZoomTransform();
}, { passive: false });

function openZoom(src, alt) {
  zoomContainer.innerHTML = "";

  const zImg = document.createElement("img");
  zImg.src = src;
  zImg.alt = alt;
  zImg.style.cssText = "width:auto;height:auto;max-width:100%;max-height:100%;touch-action:none;transition:transform 0.08s ease-out;";
  zoomContainer.appendChild(zImg);
  resetZoomTransform();

  btnDownloadZoom.style.display = "block";

  zoomModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

btnCloseZoom.addEventListener("click", () => {
  zoomModal.classList.add("hidden");
  document.body.style.overflow = "";
});

btnDownloadZoom.addEventListener("click", () => {
  downloadItem();
});

btnZoom.addEventListener("click", () => {
  const itemId = raterOrder[currentItemIndex];
  const item = getItemById(itemId);
  openFullView(item);
});

btnDownload.addEventListener("click", () => {
  downloadItem();
});

function downloadItem() {
  const itemId = raterOrder[currentItemIndex];
  const item = getItemById(itemId);

  if (!item) return;

  const url = item.pdf || (item.files && item.files[0]);
  if (url) {
    const a = document.createElement("a");
    a.href = url;
    a.download = item.label + (item.pdf ? ".pdf" : ".png");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

// ────── Init ──────
async function init() {
  try {
    await loadItems();
    console.log('Items loaded:', itemsManifest.length);
  } catch (e) {
    console.error('Init error:', e);
  }
}

document.addEventListener('DOMContentLoaded', init);
init();
