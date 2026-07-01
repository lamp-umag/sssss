import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCq05NElKm-01Xyraj6qdF31IgOLf8gQbA",
  authDomain: "sssss-e8013.firebaseapp.com",
  projectId: "sssss-e8013",
  storageBucket: "sssss-e8013.firebasestorage.app",
  messagingSenderId: "765571239773",
  appId: "1:765571239773:web:39ea76d035d314cdd4a2b4"
};

const ADMIN_EMAIL = "hermanelgueta@gmail.com";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const QUESTION_IDS = ["p1", "p2", "p3", "p4", "p5"];

let itemsManifest = [];
let csvRows = [];

async function loadItems() {
  const res = await fetch("items.json");
  if (!res.ok) throw new Error("No se pudo cargar items.json");
  itemsManifest = await res.json();
}

function fmt(n) {
  return n === null || n === undefined || isNaN(n) ? "—" : n.toFixed(2);
}

async function loadResults() {
  await loadItems();

  const snap = await getDocs(collection(db, "cuantieval_public"));
  const docs = snap.docs.map((d) => d.data());

  const byItem = {};
  itemsManifest.forEach((it) => {
    byItem[it.id] = { n: 0, sums: [0, 0, 0, 0, 0], counts: [0, 0, 0, 0, 0] };
  });

  let totalCompleted = 0;
  let grandSum = 0;
  let grandN = 0;
  const rows = [];

  docs.forEach((d) => {
    if (d.completed) totalCompleted++;
    const responses = d.responses || {};

    itemsManifest.forEach((it) => {
      const r = responses[it.id];
      const row = {
        code: d.code || "",
        item_id: it.id,
        item_label: it.label,
        p1: "",
        p2: "",
        p3: "",
        p4: "",
        p5: "",
        missing: false
      };

      if (r && r.missing) {
        row.missing = true;
      } else if (r) {
        let answered = false;
        QUESTION_IDS.forEach((q, qi) => {
          if (r[q] !== undefined) {
            row[q] = r[q];
            byItem[it.id].sums[qi] += r[q];
            byItem[it.id].counts[qi] += 1;
            grandSum += r[q];
            grandN += 1;
            answered = true;
          }
        });
        if (answered) byItem[it.id].n += 1;
      }

      rows.push(row);
    });
  });

  csvRows = rows;

  renderSummary(docs.length, totalCompleted, grandN ? grandSum / grandN : null);
  renderByItem(byItem);
  renderByCode(docs);
}

function renderSummary(raters, completed, avg) {
  document.getElementById("sumRaters").textContent = raters;
  document.getElementById("sumCompleted").textContent = completed;
  document.getElementById("sumAvg").textContent = fmt(avg);
}

function renderByItem(byItem) {
  const tbody = document.getElementById("byItemBody");
  tbody.innerHTML = "";

  itemsManifest.forEach((it) => {
    const agg = byItem[it.id];
    const avgs = agg.sums.map((s, i) => (agg.counts[i] ? s / agg.counts[i] : null));
    const validAvgs = avgs.filter((a) => a !== null);
    const overall = validAvgs.length ? validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length : null;

    const tr = document.createElement("tr");
    const cells = [it.label, agg.n, fmt(avgs[0]), fmt(avgs[1]), fmt(avgs[2]), fmt(avgs[3]), fmt(avgs[4])];
    cells.forEach((val) => {
      const td = document.createElement("td");
      td.textContent = val;
      tr.appendChild(td);
    });
    const tdOverall = document.createElement("td");
    const strong = document.createElement("strong");
    strong.textContent = fmt(overall);
    tdOverall.appendChild(strong);
    tr.appendChild(tdOverall);

    tbody.appendChild(tr);
  });
}

function renderByCode(docs) {
  const tbody = document.getElementById("byCodeBody");
  tbody.innerHTML = "";

  docs
    .slice()
    .sort((a, b) => (a.code || "").localeCompare(b.code || ""))
    .forEach((d) => {
      const tr = document.createElement("tr");
      const cells = [
        d.code || "—",
        `${d.completedCount || 0} / ${itemsManifest.length}`,
        d.completed ? "Completo" : "En progreso"
      ];
      cells.forEach((val) => {
        const td = document.createElement("td");
        td.textContent = val;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
}

function toCsv(rows) {
  const headers = ["code", "item_id", "item_label", "p1", "p2", "p3", "p4", "p5", "missing"];
  const escape = (v) => {
    if (v === undefined || v === null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  rows.forEach((r) => {
    lines.push(headers.map((h) => escape(r[h])).join(","));
  });
  return lines.join("\n");
}

document.getElementById("btnDownloadCsv").addEventListener("click", () => {
  const csv = toCsv(csvRows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cuantieval_resultados.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

document.getElementById("btnRefresh").addEventListener("click", refresh);

async function refresh() {
  const status = document.getElementById("resultsStatus");
  status.textContent = "Cargando…";
  try {
    await loadResults();
    status.textContent = "Actualizado " + new Date().toLocaleTimeString("es-CL");
  } catch (e) {
    console.error("Error cargando resultados:", e);
    status.textContent = "Error cargando resultados. Verifica las reglas de Firestore.";
  }
}

// ────── Admin: Google Sign-In ──────

const elSignedOut = document.getElementById("adminSignedOut");
const elSignedIn  = document.getElementById("adminSignedIn");
const elAdminEmail = document.getElementById("adminEmail");
const elAdminMsg  = document.getElementById("adminMsg");

onAuthStateChanged(auth, (user) => {
  if (user && user.email === ADMIN_EMAIL) {
    elSignedOut.classList.add("hidden");
    elAdminMsg.classList.add("hidden");
    elSignedIn.classList.remove("hidden");
    elAdminEmail.textContent = user.email;
  } else if (user) {
    elSignedOut.classList.add("hidden");
    elSignedIn.classList.add("hidden");
    elAdminMsg.textContent = "Este correo no tiene acceso de administrador.";
    elAdminMsg.classList.remove("hidden");
    signOut(auth);
  } else {
    elSignedIn.classList.add("hidden");
    elAdminMsg.classList.add("hidden");
    elSignedOut.classList.remove("hidden");
  }
});

document.getElementById("btnAdminLogin").addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    console.error("Login error:", e);
  }
});

document.getElementById("btnAdminLogout").addEventListener("click", () => signOut(auth));

document.getElementById("btnAdminCsv").addEventListener("click", async () => {
  const btn = document.getElementById("btnAdminCsv");
  btn.textContent = "Descargando…";
  btn.disabled = true;
  try {
    const snap = await getDocs(collection(db, "cuantieval_ratings"));
    const headers = ["rut", "code", "materiales_evaluados", "total_materiales", "completo", "fecha_completado"];
    const escape = (v) => {
      if (v === undefined || v === null) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    snap.docs.forEach((d) => {
      const data = d.data();
      const completedAt = data.completedAt ? new Date(data.completedAt.toMillis()).toLocaleString("es-CL") : "";
      lines.push([
        data.rut || d.id,
        data.code || "",
        data.completedCount ?? 0,
        itemsManifest.length,
        data.completed ? "sí" : "no",
        completedAt
      ].map(escape).join(","));
    });
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cuantieval_ruts_admin.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error("Error descargando CSV admin:", e);
    alert("Error al descargar. Verifica que las reglas de Firestore permitan el acceso de administrador.");
  } finally {
    btn.textContent = "Descargar CSV con RUTs";
    btn.disabled = false;
  }
});

refresh();
