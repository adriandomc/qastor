# Proyecto qastor

Esta carpeta es un proyecto de **qastor** — una colección de casos de prueba manuales en JSON, con
schema validable y soporte para sesiones de ejecución con captura de evidencia.

## Estructura

- `qastor.json` — configuración del proyecto: nombre, suites, mapping de prefijos de ID a carpetas
  (`module_folders`).
- `schema.json` — JSON Schema (draft 2020-12) que valida cada caso.
- `index.json` — (opcional) índice generado con resumen + suites. Lo regenera qastor al guardar
  casos.
- `<modulo>/TC-<MODULO>-<NNN>-<slug>.json` — un caso por archivo.
- `.qastor-runs/` — sesiones de ejecución y evidencia. Auto-creado; ignorar en git.

## Cómo se usa

1. Abre este proyecto desde qastor (`Welcome → Abrir proyecto`) y selecciona esta carpeta.
2. Ve la lista de casos en la pestaña **Casos**.
3. Selecciona uno o varios casos y presiona **Iniciar sesión**.
4. Sigue los pasos. Captura evidencia con el hotkey global (`Cmd/Ctrl+Shift+E`).
5. Marca cada paso como pass / fail / blocked.
6. Al terminar, exporta el reporte HTML con todas las screenshots embebidas.

## Editar a mano

Los archivos JSON pueden editarse fuera de qastor — la app detecta los cambios en disco y refresca
la lista automáticamente.
