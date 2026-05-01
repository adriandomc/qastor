# Test Cases — VoltalfaPOS

Casos de prueba manuales del producto, organizados como JSON estructurados.
Pensados para alimentar una **futura app de escritorio** que permita marcar el
estado de ejecución (`pendiente / pasó / falló / bloqueado`), adjuntar
evidencia (screenshots, logs, video) y exportar reportes.

## Estructura

```
test-cases/
├── README.md              ← este archivo
├── schema.json            ← JSON Schema del formato de caso (validable)
├── index.json             ← lista resumida de todos los casos (id, título, módulo, prioridad)
├── auth/                  ← bootstrap, login, lockout, password
├── caja/                  ← apertura, cierre, movimientos
├── ventas/                ← POS, cobro, devoluciones, atajos
├── catalogo/              ← categorías, productos, variantes, importación
├── inventario/            ← ajustes, niveles, stock bajo
├── reportes/              ← ventas, métodos, ganancia, IVA, exportación
├── configuracion/         ← negocio, hardware, impresora
├── respaldos/             ← crear, listar, restaurar, exportar
├── permisos/              ← gates UI + defense in depth
└── errores/               ← ErrorBoundary, 404, integridad, retry
```

## Convención de IDs

`TC-{MODULO}-{NUM}` — por ejemplo `TC-POS-001`. El número es local al módulo;
se asigna en orden de creación, no por prioridad.

## Esquema (resumido)

Cada archivo contiene un único caso con esta forma:

```jsonc
{
  "id": "TC-POS-001",
  "title": "Cobrar venta en efectivo con cambio",
  "module": "ventas.pos",
  "type": "happy_path",          // "happy_path" | "error" | "edge_case"
  "priority": "critical",         // "critical" | "high" | "medium" | "low"
  "preconditions": [
    "Hay caja abierta en el dispositivo",
    "Existe al menos un producto físico con stock"
  ],
  "steps": [
    {
      "step": 1,
      "action": "Navega a /ventas/pos",
      "expected": "Se muestra la vista de POS con lista de productos a la izquierda y carrito vacío a la derecha",
      "evidence_hint": "screenshot"
    }
  ],
  "acceptance_criteria": [
    "La venta queda registrada en historial con estado 'completada'",
    "El stock del producto vendido se decrementa en la cantidad cobrada"
  ],
  "related_files": ["apps/desktop/src/routes/_app/ventas/pos.tsx"],
  "tags": ["pos", "efectivo", "smoke"]
}
```

Ver `schema.json` para la definición completa con todos los campos opcionales.

## Cómo se ejecutan

1. Asegúrate de que el ambiente cumple los `preconditions`.
2. Sigue cada `step.action` en orden.
3. Verifica que `step.expected` se cumple antes de pasar al siguiente paso.
4. Captura la evidencia indicada por `evidence_hint`.
5. Al final, confirma que se cumplen todos los `acceptance_criteria`.

Si un paso falla:
- No saltes pasos.
- Documenta el comportamiento real.
- Marca el caso como `falló` y archiva la evidencia.

## Cómo se mantienen

- **Cuando se agrega un feature**: crear casos nuevos antes de cerrarlo.
- **Cuando cambia el comportamiento**: actualizar el caso existente, no crear duplicado.
- **Cuando se descubre un bug**: agregar un caso `error` que lo capture, dejarlo
  marcado como `falló` hasta que el bug se cierre, después marcarlo como `pasó`.

## Idea de la app de escritorio

La app tendría:
- Lectura de este directorio como fuente de verdad de los casos.
- Tabla con filtros por módulo, prioridad, tipo, estado.
- Por caso: vista detalle con checklist de pasos, slot de evidencia (drag-drop
  imagen/archivo), notas libres, estado.
- Sesiones de prueba: ejecutar un subconjunto (ej. "smoke", "antes de release"),
  ver progreso global.
- Exportar reporte: PDF/HTML con resultados + evidencia adjunta.
- Histórico: cada ejecución queda guardada con fecha, ejecutor, build version.

Como los casos viven en JSON dentro de git, los cambios de comportamiento del
producto y los cambios de los casos quedan ligados por commit.
