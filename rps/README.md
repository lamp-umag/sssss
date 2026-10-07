# rps — Piedra, papel o tijera (experimento 2×2)

App mínima, en español, pantalla completa, **sin login**, para estudiar si lo que la gente *cree* de su oponente
cambia cómo juega. Vive en el mismo repo y proyecto Firebase (`sssss-e8013`) que el resto de `sssss`.

- Jugar: <https://lamp-umag.github.io/sssss/rps/>
- Resultados / descargas / ANOVA: <https://lamp-umag.github.io/sssss/rps/resultados.html>

## Diseño

| | se le dice: **azar** | se le dice: **IA muy buena** |
|---|---|---|
| **oponente real: azar (semilla)** | celda 1 | celda 2 |
| **oponente real: IA adaptativa** | celda 3 | celda 4 |

1. **Práctica** (10 rondas): oponente sorteado 50/50 entre azar e IA, *sin decirle nada* al participante.
   Se registra → segundo experimento chico, 2 condiciones entre sujetos (VD: victorias en la práctica).
2. **4 ensayos** (20 rondas c/u), uno por celda, en **orden aleatorio por participante** (permutación derivada de la semilla maestra;
   queda guardada). Antes de cada ensayo se muestra el mensaje de la creencia. Después, un ítem 1–7 «¿qué tan inteligente
   te pareció el oponente?» (chequeo de manipulación).
3. **Debriefing**: se le revela qué era verdad y qué no (hay engaño, así que es obligatorio).

**VD**: número de victorias por ensayo (empates y derrotas también se guardan). Total ≈ 90 rondas ≈ 4–5 min.

### ¿Cuántas rondas?
20 por ensayo y 10 de práctica es un compromiso. Contra azar, victorias ~ Binomial(20, 1/3): media 6,7, DE 2,1. Contra una IA que *aprende*,
el efecto se acumula con las rondas: en 20 hay poco tiempo para que explote patrones sutiles, así que la diferencia real vs. azar
será modesta (en simulación, contra humanos simulados con sesgos típicos pasa de ~33 % a ~20–30 % de victorias; contra jugador uniforme
no puede ganar nadie). Si quieres más poder, sube `rondasEnsayo` en `config.js` (30 es razonable) o aumenta N.
**Las diferencias entre la condición «azar» e «IA» dependen de que los participantes tengan patrones: es una hipótesis, no una garantía.**

## Oponentes (`engine.js`)

Todo corre **en el navegador** (JS puro, milisegundos): no hace falta servidor ni API.

| id | qué es |
|---|---|
| `azar` | uniforme, PRNG con semilla (mulberry32). Misma semilla → misma secuencia. |
| `ia` | ensamble de predictores sobre *tu* próxima jugada (frecuencia con olvido, Markov de orden 1 y 2, condicionado a mi jugada, y ganar-quedarse/perder-cambiar con prior humano) mezclados con pesos que premian a los que aciertan; juega la respuesta de mayor valor esperado (+4 % de exploración). Mismo principio que los bots que ganan torneos de RPS (*Iocaine Powder*). No hay un «modelo gratuito» que valga la pena descargar: esto es el estándar y es pequeño. |
| `logico` | heurística conocida: contraataca tu jugada más frecuente de las últimas 6. Explotable (p. ej. por gana-quédate). |
| `malo` | ciclo fijo piedra→papel→tijera. Trivialmente explotable. |
| `humano_grabado` | repite una secuencia fija sin reaccionar. **Las 8 secuencias de `secuencias.js` son sintéticas (placeholder)**: reemplázalas por jugadas reales grabadas antes de usarla. |

Estos tres últimos **no están activos** en el 2×2 por defecto. Para activarlos edita `CONFIG.oponentes` / `CONFIG.creencias` en `config.js`
(el diseño es el factorial completo de ambas listas: 3×2 = 6 ensayos). Los mensajes de creencia están en `CREENCIAS`
(`azar`, `ia`, `humano_grabado`, `humano`); `humano` es «otra persona en vivo» (engaño, úsalo bajo tu responsabilidad ética).
El ANOVA integrado en `resultados.html` cubre 2×2 (entre) y cualquier a×b (entre); el intra-sujetos solo 2×2.

## Datos (Firestore, solo-agregar)

- `rps_sesiones/{sid}`: usuario, semilla maestra, orden de celdas, oponente de práctica, config, user-agent, pantalla, zona horaria.
- `rps_eventos/{sid}_{seq}`: **cada decisión**: `ensayo_inicio`, `ronda` (jugada, jugada del oponente, resultado, `rt` en ms,
  condición real y creencia), `chequeo`, `fin`.

Cada escritura pasa por una bandeja en `localStorage` con reintentos (si no hay red o las reglas no están publicadas no se pierde nada).
Además el JSON completo de la sesión queda en `localStorage` (`rps_json_<sid>`). Si recargan a mitad de sesión, esa sesión queda
**incompleta** (se conserva, pero se excluye por defecto del análisis) y la persona empieza otra.

### Descargas (`resultados.html`)

| archivo | contenido |
|---|---|
| `rps_primer_ensayo` | 1 fila por persona, solo su **primer ensayo** → ANOVA 2×2 entre sujetos |
| `rps_ancho` | 1 fila por persona; columnas `victorias_<real>_<creencia>` + posición de cada celda + orden |
| `rps_ensayos_largo` | 1 fila por persona × ensayo (formato largo, para modelos mixtos) |
| `rps_practica` | 1 fila por persona; oponente de práctica y victorias |
| `rps_rondas` | **todas** las rondas (incluye práctica y sesiones incompletas) |
| JSON crudo | sesiones + eventos tal cual están en Firestore |

Filtros: solo sesiones completas; solo la primera sesión de cada usuario (un mismo apodo puede jugar de nuevo; esto evita contar
dos veces a la misma persona).

## Estadística (`stats.js`)

- **Entre (primer ensayo)**: ANOVA factorial Tipo III por regresión con codificación de efectos (válido con n desiguales). η²p.
- **Intra (4 ensayos, 2×2)**: cada efecto es el contraste correspondiente sobre las 4 puntuaciones de cada persona, F(1, n−1) = t².
  No modela el orden; para eso usa el CSV largo (`posicion`) en un modelo mixto.
- **Práctica**: t de Welch + d de Cohen.
- Las funciones de distribución (F, t) están implementadas a mano y verificadas contra valores críticos conocidos
  (`test/stats.test.mjs`).

## Reglas de Firestore (⚠ hay que publicarlas)

Las reglas nuevas (`rps_sesiones`, `rps_eventos`) están en `portafolio/firestore.rules` (único archivo de reglas del proyecto; lo usa
`firebase.json`). **Hasta publicarlas, las escrituras de rps serán rechazadas** (la app sigue funcionando y guarda todo localmente).
Ese archivo se armó desde la documentación del repo, no desde la consola: compáralo con *Firestore → Rules* antes de publicar
(ver el aviso en su cabecera), luego pega/publica o `npx firebase deploy --only firestore:rules`.

Privacidad: la lectura es pública (igual que las encuestas de la raíz): cualquiera con la URL de `resultados.html` podría leer
los usuarios y jugadas. Si esto sale de piloto, restringe `read` a `esAdmin()` y agrega login de admin a `resultados.html`
(patrón de `admin.html`).

## Pruebas

```bash
node rps/test/engine.test.mjs   # reproducibilidad, uniformidad del azar, fuerza de cada oponente vs. humanos simulados, diseño
node rps/test/stats.test.mjs    # ANOVA vs. cálculo a mano, Welch, reconstrucción y CSV
node rps/test/gen-secuencias.mjs  # regenera las secuencias sintéticas
python3 -m http.server 5175     # desde la raíz del repo; abrir /rps/?seed=1&rapido=1&debug=1
```

Parámetros de URL de prueba: `?seed=N` (semilla maestra fija → mismo orden y mismos oponentes), `?rapido=1` (pausas mínimas),
`?debug=1` (muestra el orden real en una esquina).

## Archivos

`index.html` + `game.js` (juego) · `engine.js` (PRNG, oponentes, diseño) · `config.js` (rondas, niveles, textos) ·
`secuencias.js` · `firebase.js` (datos + bandeja) · `stats.js` (CSV y estadística) · `resultados.html/js` · `estilos.css`
(estética de *dopadoom*: negro, Jersey 10, esquinas pixel).
