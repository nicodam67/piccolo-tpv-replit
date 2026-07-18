---
name: Fichaje consolidation
description: Decisions and constraints from unifying the fichaje module under one dashboard entry with a sidebar layout.
---

## Rule
The fichaje module must have exactly ONE dashboard card ("Fichaje", href=/admin/fichaje). Never add separate dashboard cards for fichaje sub-sections (registros, turnos, importar, etc.).

**Why:** The user explicitly requested that all fichaje sections be grouped inside a single module with a sidebar, not scattered as top-level dashboard buttons.

## How to apply
- All routes under /admin/fichaje/* must be wrapped with `<FichajeLayout>` in App.tsx.
- New fichaje sub-sections → add to the NAV array in FichajeLayout.tsx, create a new page, wrap in layout in App.tsx. Never add to MODULES in admin-dashboard.tsx.
- The public clock-in screen (/fichaje, FichajeReloj.tsx) stays as a public route without auth requirement.

## Mobile clock
- `fichaje_settings` table (id=1, integer PK): `mobile_clock_enabled = true` was set 2026-07-18.
- Default was false; always verify this is true when troubleshooting mobile fichaje.

## Import module
- FichajeImportarAnviz.tsx kept for reference but superseded by FichajeImportar.tsx.
- Route /admin/fichaje/importar now points to FichajeImportar (universal: CSV/TXT/XLS/XLSX/XML/JSON).
- All Anviz-specific text removed from titles, descriptions, and component names.

## Login screen
- Employee cards in login.tsx use `style={{ background: ..., borderColor: ... }}` with rgba values so they are visible in dark mode. CSS class `bg-card border-border` blended with the dark background.
- "Acceso administrador" button added at bottom of left panel; navigates to /admin.

## Placeholder pattern
- New sections without backend yet use `FichajePlaceholder` component.
- When implementing a section, replace the placeholder import in App.tsx with the real component; keep the route path unchanged.

## Audit document
- `docs/FICHAJE-PARITY-AUDIT.md` contains full function-by-function parity table with Original vs Piccolo TPV status.
