# qastor — Referencia para generar casos de prueba con IA

Documento autocontenido para pegar a un modelo (Claude, GPT, etc.) junto con la
descripción de tu plataforma. La IA debe devolver casos de prueba **válidos
contra el JSON Schema de qastor**, listos para guardar como archivos `.json`
dentro del proyecto.

---

## 1. Modelo de datos

qastor opera sobre tres entidades en disco:

| Entidad         | Archivo / ubicación                          | Propósito                                    |
| --------------- | -------------------------------------------- | -------------------------------------------- |
| Proyecto        | `qastor.json` en la raíz                     | Metadatos del proyecto, módulos, suites      |
| Caso de prueba  | `<modulo>/TC-<MOD>-<NUM>.json` (uno por arch.) | Definición declarativa de un caso manual    |
| Índice (opcional) | `index.json` en la raíz                    | Resumen agregado de todos los casos          |

---

## 2. Esquema de un caso de prueba (fuente de verdad)

JSON Schema 2020-12. **Todos los campos `required` deben estar presentes y
ningún campo extra está permitido (`additionalProperties: false`).**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://qastor.local/test-case.schema.json",
  "title": "qastor Test Case",
  "type": "object",
  "required": ["id", "title", "module", "type", "priority", "steps", "acceptance_criteria"],
  "additionalProperties": false,
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^TC-[A-Z]+-[0-9]{3}$",
      "description": "Identificador único, formato TC-{MODULO}-{NUM}."
    },
    "title": {
      "type": "string",
      "minLength": 5
    },
    "module": {
      "type": "string",
      "description": "Módulo o vista del producto (ej. 'ventas.pos', 'auth.login'). Notación con puntos para subcategorías."
    },
    "type": {
      "enum": ["happy_path", "error", "edge_case"]
    },
    "priority": {
      "enum": ["critical", "high", "medium", "low"]
    },
    "preconditions": {
      "type": "array",
      "items": { "type": "string" }
    },
    "steps": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["step", "action", "expected"],
        "additionalProperties": false,
        "properties": {
          "step":     { "type": "integer", "minimum": 1 },
          "action":   { "type": "string" },
          "expected": { "type": "string" },
          "evidence_hint": {
            "type": "string",
            "enum": ["none", "screenshot", "text_excerpt", "db_query", "file_attachment"]
          },
          "data": {
            "type": "object",
            "additionalProperties": true
          }
        }
      }
    },
    "acceptance_criteria": {
      "type": "array",
      "minItems": 1,
      "items": { "type": "string" }
    },
    "related_files": {
      "type": "array",
      "items": { "type": "string" }
    },
    "tags": {
      "type": "array",
      "items": { "type": "string" }
    },
    "estimated_minutes": {
      "type": "integer",
      "minimum": 1
    }
  }
}
```

### Reglas de los enums

- `type`:
  - `happy_path` — flujo exitoso esperado.
  - `error` — el sistema debe rechazar / mostrar error controlado.
  - `edge_case` — frontera (límites, concurrencia, valores raros que sí son válidos).
- `priority`:
  - `critical` — bloqueante de release / pérdida de dinero / corrupción de datos.
  - `high` — funcionalidad principal degradada.
  - `medium` — flujo secundario o de conveniencia.
  - `low` — cosmético, telemetría, mejoras menores.
- `evidence_hint`:
  - `screenshot` — UI visible.
  - `text_excerpt` — copiar texto del UI / consola.
  - `db_query` — verificar registro en base de datos.
  - `file_attachment` — adjuntar PDF, ticket, export, etc.
  - `none` — sin evidencia explícita.

### Convención de IDs

`TC-{MODULO}-{NNN}` con `NNN` de 3 dígitos. Ejemplos: `TC-AUTH-001`,
`TC-POS-014`, `TC-INV-007`. El prefijo `{MODULO}` se usa para enrutar el archivo
a su carpeta (ver §4).

---

## 3. Esquema del proyecto (`qastor.json`)

Se crea automáticamente al inicializar un proyecto desde la app, pero la IA
puede sugerir su contenido si quiere proponer estructura.

```json
{
  "qastor_version": "0.1",
  "project_name": "MiProductoQA",
  "created_at": "2026-05-06T10:00:00Z",
  "module_folders": {
    "AUTH": "auth",
    "POS":  "ventas",
    "CAJA": "caja",
    "INV":  "inventario"
  },
  "suites": {
    "smoke":           ["TC-AUTH-003", "TC-CAJA-001", "TC-POS-001"],
    "release-blocker": ["TC-POS-001", "TC-POS-004", "TC-CAJA-003"]
  },
  "default_session_dir": ".qastor-runs"
}
```

- `module_folders` mapea **prefijo de ID** → carpeta relativa. Si un caso tiene
  `id: TC-POS-001` y `module_folders["POS"] = "ventas"`, el archivo debe ir en
  `ventas/TC-POS-001-...json`.
- `suites` agrupa IDs para correr juntos (ej. `smoke`, `release-blocker`,
  `nightly`). Las suites son arrays de IDs, no de paths.
- Si `module_folders` no contiene el prefijo, qastor cae a una carpeta derivada
  del `module` del caso (la primera parte antes del punto).

---

## 4. Layout en disco esperado

```
proyecto/
├── qastor.json              ← config del proyecto
├── index.json               ← (opcional) resumen agregado
├── auth/
│   ├── TC-AUTH-001-bootstrap-raiz.json
│   └── TC-AUTH-002-...json
├── ventas/
│   ├── TC-POS-001-cobrar-efectivo.json
│   └── ...
└── .qastor-runs/            ← sesiones de ejecución (lo crea la app)
```

Nombre de archivo recomendado: `<id>-<slug-corto>.json` en kebab-case, sin
acentos.

---

## 5. Ejemplo completo y validable

```json
{
  "id": "TC-POS-001",
  "title": "Cobrar venta en efectivo con cambio",
  "module": "ventas.pos",
  "type": "happy_path",
  "priority": "critical",
  "estimated_minutes": 4,
  "preconditions": [
    "Caja abierta en el dispositivo",
    "Existe al menos un producto físico con stock ≥ 2"
  ],
  "steps": [
    {
      "step": 1,
      "action": "Navega a /ventas/pos",
      "expected": "Vista POS con grid de productos a la izquierda y carrito vacío a la derecha",
      "evidence_hint": "screenshot"
    },
    {
      "step": 2,
      "action": "Click en un producto para agregarlo al carrito",
      "expected": "Aparece línea con cantidad 1 y total general actualizado",
      "evidence_hint": "screenshot"
    },
    {
      "step": 3,
      "action": "Pulsa F9 e ingresa monto recibido mayor al total",
      "expected": "El recuadro 'Cambio' muestra la diferencia en verde",
      "evidence_hint": "screenshot",
      "data": { "total": "87.00", "recibido": "100.00", "cambio_esperado": "13.00" }
    },
    {
      "step": 4,
      "action": "Pulsa 'Confirmar cobro'",
      "expected": "Modal cierra, carrito se vacía, toast 'Venta {folio} registrada'",
      "evidence_hint": "file_attachment"
    }
  ],
  "acceptance_criteria": [
    "La venta queda en historial con estado 'completada'",
    "El stock del producto vendido se decrementó en 1",
    "Se imprimió el ticket o apareció modal de retry"
  ],
  "related_files": ["src/routes/ventas/pos.tsx"],
  "tags": ["smoke", "release-blocker"]
}
```

---

## 6. Prompt listo para pegar a una IA

Copia desde aquí hacia abajo, **sustituyendo el bloque `[DESCRIPCIÓN DE TU
PLATAFORMA]`** con la información de tu producto (vistas, flujos, reglas de
negocio, roles).

```
Eres QA Lead. Vas a generar casos de prueba manuales en formato qastor.
Tu salida DEBE ser válida contra el JSON Schema que te paso al final.

REGLAS DURAS:
1. Devuelve únicamente un array JSON de casos. Sin texto fuera del array.
2. Cada caso cumple el schema literalmente: campos requeridos presentes,
   sin propiedades extra, enums respetados, IDs con formato TC-XXX-NNN
   (NNN = 3 dígitos, único por módulo).
3. Por cada vista/flujo importante incluye al menos: 1 happy_path crítico,
   1 error de validación, y 1 edge_case si tiene sentido.
4. `priority`: usa `critical` solo para flujos que bloquean release o
   manejan dinero/datos. No infles prioridades.
5. `steps[].action` es imperativo y verificable ("Pulsa F9", "Ingresa
   email vacío y submit"). `expected` describe el efecto observable, no
   el detalle de implementación.
6. `acceptance_criteria` son condiciones binarias verificables al final
   del caso, no repetición de los `expected` de cada paso.
7. Idioma: español neutro. Sin emojis.
8. No inventes vistas o reglas que no aparezcan en la descripción de la
   plataforma.

ENTREGABLES:
- 1 array JSON con N casos.
- Si te pido un módulo específico, todos los IDs comparten prefijo.
- Si propones suites (smoke / release-blocker), añade al final un objeto
  separado con la forma { "suites": { "<nombre>": ["TC-...", ...] } }.

[DESCRIPCIÓN DE TU PLATAFORMA]
- Producto: …
- Vistas / rutas principales: …
- Roles y permisos: …
- Reglas de negocio relevantes: …
- Integraciones externas: …
- Hardware (si aplica): …

JSON SCHEMA (fuente de verdad — los casos se validan contra esto):

<<PEGA AQUÍ EL JSON SCHEMA DE LA SECCIÓN 2 DE GENERAR-CASOS-IA.md>>

CONVENCIÓN DE IDs Y MÓDULOS:
- TC-AUTH-NNN para login/sesión, TC-POS-NNN para punto de venta, etc.
- `module` usa notación con puntos: "ventas.pos", "auth.login".

EJEMPLO MÍNIMO VÁLIDO:

<<PEGA AQUÍ EL EJEMPLO DE LA SECCIÓN 5>>
```

---

## 7. Cómo verificar la salida de la IA

1. Cada caso es un archivo JSON independiente.
2. Validar contra `schema/test-case.schema.json` (la app usa Ajv 2020 y
   rechazará cualquier propiedad extra).
3. Renombrar archivos al patrón `<id>-<slug>.json`.
4. Colocarlos en la carpeta indicada por `module_folders[<prefijo>]`.
5. Abrir el proyecto en qastor → la app los listará y los ejecutará.

Si la IA inventa propiedades no listadas en el schema (ej. `severity`,
`author`, `notes`), **bórralas antes de guardar** o el archivo no cargará.
