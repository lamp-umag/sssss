# Pruebas manuales de `firestore.rules`

Checklist para correr a mano desde la consola de Firebase (Firestore →
pestaña **Reglas** tiene un simulador; para las pruebas "en vivo" desde el
navegador, usa la consola de JavaScript en `index.html` / `admin.html` ya
logueado con la cuenta que corresponda). Todo lo que dice "debe fallar"
tiene que devolver `permission-denied`.

Necesitas al menos: una cuenta `@umag.cl` (estudiante A), una segunda cuenta
`@umag.cl` (estudiante B), una cuenta que no sea `@umag.cl` ni el correo
admin, y la cuenta `hermanelgueta@gmail.com` (admin).

## Perfiles

1. Estudiante A crea/edita `perfiles/{su-uid}` → **debe funcionar**.
2. Estudiante A intenta escribir `perfiles/{uid-de-B}` → **debe fallar**.
3. Admin lee cualquier `perfiles/{uid}` → **debe funcionar**.
4. Cuenta no institucional (y que no es el correo admin) intenta leer o
   escribir cualquier `perfiles/*` → **debe fallar**.

## Semanas

5. Estudiante A lee `semanas/01` cuando `visible: true` → **debe funcionar**.
6. Estudiante A lee una semana con `visible: false` → **debe fallar**
   (aunque conozca el número exacto del documento).
7. Estudiante A intenta escribir cualquier campo de `semanas/01` → **debe
   fallar**.
8. Admin lee y escribe semanas visibles y ocultas → **debe funcionar**.

## Entregas — lectura

9. Estudiante A lee `entregas/{su-uid}_01` → **debe funcionar**.
10. **Estudiante A intenta leer `entregas/{uid-de-B}_01`** (la entrega de
    otro estudiante) → **debe fallar**. Este es el caso explícito que pide
    el encargo original.
11. Admin lee cualquier `entregas/*` → **debe funcionar**.

## Entregas — escritura

12. Estudiante A crea `entregas/{su-uid}_01` con `uid` igual al suyo, en una
    semana `activa` y `visible` → **debe funcionar**.
13. Estudiante A intenta crear un documento con `id` que no calza con
    `{su-uid}_{numeroSemana}` (por ejemplo, usando el uid de otro, o un
    número de semana que no coincide con el campo `numeroSemana` del
    documento) → **debe fallar**.
14. **Estudiante A intenta escribir en `entregas/{uid-de-B}_02`** (aunque
    ponga su propio `uid` dentro del documento, el `id` no calza con su
    propio uid) → **debe fallar**.
15. **Estudiante A intenta crear/editar una entrega en una semana con
    `estado: "cerrada"`** (por ejemplo `entregas/{su-uid}_05`, con la semana
    05 cerrada) → **debe fallar**. Este es el segundo caso explícito que
    pide el encargo original.
16. Estudiante A intenta crear/editar una entrega en una semana visible pero
    aún no marcada `activa` → **debe fallar**.
17. Estudiante A, con una entrega ya `entregada` y `fechaEntrega` fijada,
    edita sus respuestas sin tocar `fechaEntrega` → **debe funcionar** (la
    fecha de última edición sí puede cambiar).
18. Estudiante A intenta modificar el valor de `fechaEntrega` de una entrega
    que ya la tenía fijada (poner una fecha distinta, o `null`) → **debe
    fallar**.
19. Estudiante A intenta escribir una entrega con más de 20 campos en
    `respuestas` → **debe fallar** (`respuestas.size() <= 20`).
20. Admin crea, edita o borra cualquier `entregas/*` → **debe funcionar**.

## Retroalimentación (`entregas/{id}/feedback/docente`)

21. Admin crea/edita el documento de feedback de cualquier entrega → **debe
    funcionar**.
22. Estudiante A lee el feedback de su propia entrega → **debe funcionar**.
23. Estudiante A intenta leer el feedback de la entrega de B → **debe
    fallar**.
24. Estudiante A intenta escribir `texto` o `emoji` en el feedback de su
    propia entrega → **debe fallar** (solo el campo `vistoPorEstudiante`
    puede tocarlo, y solo de `false` a `true` — ver nota abajo).
25. Estudiante A actualiza únicamente `vistoPorEstudiante: true` en el
    feedback de su propia entrega → **debe funcionar**.
26. Estudiante A intenta poner `vistoPorEstudiante: false` (revertirlo) →
    **debe fallar**.

## Modo prueba del administrador

27. El admin, logueado con `hermanelgueta@gmail.com`, usa `index.html` (la
    vista de estudiante) y crea una entrega → **debe funcionar** aunque su
    correo no sea `@umag.cl`, y el documento debe quedar con `esPrueba: true`.

## Límites no exigibles por reglas (quedan como nota, no como prueba pasa/falla)

- El límite de 50.000 caracteres por campo de texto se controla en la
  interfaz (contador + `maxCaracteres`), no en `firestore.rules`: el
  lenguaje de reglas no puede iterar las claves dinámicas de `respuestas`
  para revisar el largo de cada valor. Si quieres confirmar que igual hay un
  techo duro, prueba a escribir un campo de texto absurdamente largo (varios
  cientos de miles de caracteres) directo desde la consola: debería fallar
  igual, pero por el límite de 1 MiB por documento de Firestore, no por esta
  regla específica.
- El tope de 3 archivos por entrega se controla en `estudiante.js` antes de
  subir, no en `storage.rules`.
