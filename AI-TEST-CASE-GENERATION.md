# Qastor — AI Test Case Generation Reference

This is a self-contained document that you can provide to any AI model (like ChatGPT, Claude, Gemini, etc.) alongside the description of your platform or feature. The AI should use this guide to return test cases that are **valid against the Qastor JSON Schema**, ready to be saved as `.json` files within your Qastor project.

---

## 1. Data Model

Qastor operates on three main entities on disk:

| Entity | File / Location | Purpose |
| --- | --- | --- |
| Project | `qastor.json` in root | Project metadata, modules, and suites |
| Test Case | `<module>/TC-<MOD>-<NUM>.json` (one per file) | Declarative definition of a manual test case |
| Index (Optional) | `index.json` in root | Aggregated summary of all test cases |

---

## 2. Test Case Schema (Source of Truth)

This is the JSON Schema 2020-12 definition. **All `required` fields must be present and no extra fields are allowed (`additionalProperties: false`).**

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
      "description": "Unique identifier, format TC-{MODULE}-{NUM}."
    },
    "title": {
      "type": "string",
      "minLength": 5
    },
    "module": {
      "type": "string",
      "description": "Product module or view (e.g., 'sales.pos', 'auth.login'). Use dot notation for subcategories."
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
          "step": { "type": "integer", "minimum": 1 },
          "action": { "type": "string" },
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

### Enum Rules

- `type`:
  - `happy_path` — Expected successful flow.
  - `error` — The system should reject or show a controlled error.
  - `edge_case` — Boundary conditions (limits, concurrency, rare but valid values).
- `priority`:
  - `critical` — Release blocker / data corruption / critical business impact.
  - `high` — Core functionality degraded.
  - `medium` — Secondary flow or convenience features.
  - `low` — Cosmetic, telemetry, minor improvements.
- `evidence_hint`:
  - `screenshot` — Visible UI element.
  - `text_excerpt` — Copy text from UI or console.
  - `db_query` — Verify database record.
  - `file_attachment` — Attach PDF, receipt, export file, etc.
  - `none` — No explicit evidence required.

### ID Convention

Use `TC-{MODULE}-{NNN}` where `NNN` is a 3-digit number. Examples: `TC-AUTH-001`, `TC-POS-014`, `TC-INV-007`. The `{MODULE}` prefix is used to route the file into its corresponding folder.

---

## 3. Project Schema (`qastor.json`)

Created automatically when initializing a project via the app. However, an AI can suggest its content to propose a structure.

```json
{
  "qastor_version": "0.1",
  "project_name": "MyQAProject",
  "created_at": "2026-05-06T10:00:00Z",
  "module_folders": {
    "AUTH": "auth",
    "POS": "sales",
    "REG": "register",
    "INV": "inventory"
  },
  "suites": {
    "smoke": ["TC-AUTH-003", "TC-REG-001", "TC-POS-001"],
    "release-blocker": ["TC-POS-001", "TC-POS-004", "TC-REG-003"]
  },
  "default_session_dir": ".qastor-runs"
}
```

- `module_folders`: Maps the **ID prefix** to a relative folder. If a case has `id: TC-POS-001` and `module_folders["POS"] = "sales"`, the file goes to `sales/TC-POS-001-...json`.
- `suites`: Groups IDs to run together (e.g., `smoke`, `release-blocker`). These are arrays of IDs, not paths.
- If the prefix is missing from `module_folders`, Qastor falls back to a folder derived from the case's `module` field (the part before the first dot).

---

## 4. Expected Directory Layout

```
project-root/
├── qastor.json              ← Project configuration
├── index.json               ← (Optional) aggregated summary
├── auth/
│   ├── TC-AUTH-001-bootstrap-root.json
│   └── TC-AUTH-002-...json
├── sales/
│   ├── TC-POS-001-cash-payment.json
│   └── ...
└── .qastor-runs/            ← Execution sessions (created by the app)
```

Recommended filename format: `<id>-<short-slug>.json` in kebab-case.

---

## 5. Complete Valid Example

```json
{
  "id": "TC-POS-001",
  "title": "Process cash payment with change",
  "module": "sales.pos",
  "type": "happy_path",
  "priority": "critical",
  "estimated_minutes": 4,
  "preconditions": [
    "Register is open on the device",
    "There is at least one physical product with stock ≥ 2"
  ],
  "steps": [
    {
      "step": 1,
      "action": "Navigate to /sales/pos",
      "expected": "POS view loads with a product grid on the left and an empty cart on the right",
      "evidence_hint": "screenshot"
    },
    {
      "step": 2,
      "action": "Click on a product to add it to the cart",
      "expected": "A line item appears with quantity 1 and the general total is updated",
      "evidence_hint": "screenshot"
    },
    {
      "step": 3,
      "action": "Press F9 and enter a received amount greater than the total",
      "expected": "The 'Change' box displays the difference in green",
      "evidence_hint": "screenshot",
      "data": { "total": "87.00", "received": "100.00", "expected_change": "13.00" }
    },
    {
      "step": 4,
      "action": "Press 'Confirm payment'",
      "expected": "Modal closes, cart empties, and a toast 'Sale {folio} registered' appears",
      "evidence_hint": "file_attachment"
    }
  ],
  "acceptance_criteria": [
    "The sale is recorded in the history with a 'completed' status",
    "The sold product's stock is decreased by 1",
    "A receipt is printed or a retry modal appears"
  ],
  "related_files": ["src/routes/sales/pos.tsx"],
  "tags": ["smoke", "release-blocker"]
}
```
