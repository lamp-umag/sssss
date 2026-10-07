// genera secuencias "humanas" sintéticas con sesgos típicos
import { crearPRNG, resultado } from "../engine.js";
const rnd = crearPRNG(20261007);
const out = [];
for (let k = 0; k < 8; k++) {
  const n = 30; const mv = []; let h = Math.floor(rnd()*3); let bot = Math.floor(rnd()*3); mv.push(h);
  for (let i = 1; i < n; i++) {
    const r = resultado(mv[i-1], Math.floor(rnd()*3));
    const p = r===1 ? [.45,.30,.25] : r===0 ? [.22,.40,.38] : [.20,.35,.45];
    const u = rnd(); const d = u<p[0]?0:u<p[0]+p[1]?1:2; mv.push((mv[i-1]+d)%3);
  }
  out.push({ id: "s"+(k+1), movs: mv.map(m=>"RPT"[m]).join("") });
}
console.log(JSON.stringify(out,null,1));
