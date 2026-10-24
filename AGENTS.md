# Caddy — agent guide

Caddy is a TypeScript-first CAD library for Node.js on native Open CASCADE (OCCT 8.0.1), validated against Python build123d 0.13.0. It ports build123d's algebraic API (not its builder/context-manager API) to idiomatic TypeScript. General rules live in `.agents/rules/` (code quality, commit discipline); this file covers what is specific to this repository.

## Layout

| Path | What |
| --- | --- |
| `packages/caddy` | `@roonieone/caddy` — public TypeScript API (Apache-2.0, ports build123d) |
| `packages/occt-native` | `@roonieone/occt-native` — typed TS API over the Neon addon (LGPL-2.1-only) |
| `packages/occt-native/crates/opencascade-sys` | cxx bindings to OCCT, **generated** by occt-bindgen from `bindings.toml` |
| `packages/occt-native/crates/occt-bindgen` | libclang generator for opencascade-sys |
| `packages/occt-native/crates/occt-neon` | Neon addon composing the bindings into JS functions |
| `reference/build123d` | pinned oracle: Python cases → JSON fixtures, TS `oracleSuite` harness |
| `docs/` | architecture, compatibility inventory, licensing, native bindings, test oracle |
| `examples/` | runnable scripts using the public API (`node examples/<name>/index.ts`) |

## Commands

```sh
pnpm install                                         # JS workspace
uv sync                                              # Python oracle (build123d 0.13.0)
node packages/occt-native/scripts/build-occt.ts      # build OCCT 8.0.1 (~10 min, once per platform)
node packages/occt-native/scripts/generate-bindings.ts [--check]   # regenerate opencascade-sys (needs libclang)
node packages/occt-native/scripts/build-native.ts [--release]      # build addon → packages/occt-native/native/<platform>-<arch>/
vp test run [path]                                   # Vitest (native tests need the staged addon)
vp check                                             # oxfmt + oxlint (type-aware) + types
uv run python reference/build123d/scripts/generate_fixtures.py [--suite NAME] [--check]
node reference/build123d/scripts/compatibility-status.ts [--check]  # recompute docs/compatibility.{json,md}
```

## Native workflow

1. Need an OCCT class? Add it to `crates/opencascade-sys/bindings.toml` (`classes`, `enums`, `collections`, `clone`), regenerate, and read the generated `src/<package>.rs` for exact names. `bindings-report.md` lists every skipped member and why.
2. Binding conventions: methods bind directly (`maker.pin_mut().Shape()?`); statics via `#[Self]` (`BRepGProp::LinearProperties`); everything else is a shim `<Class>_<Member>[_<param types>]` (constructors `gp_Pnt_new_real3`, by-value returns `TopoDS_Shape_Reversed`). Transient classes are `UniquePtr<Handle_X>`; use `Handle_X_get(_mut)`, `Handle_X_to_<Base>`, `Handle_X_from_<Base>`. Streams are `OcctStream`. Every OCCT call returns `Result`.
3. In `occt-neon`, one module per domain. Wrap work in `attempt(|| { ... })` and finish with `.or_raise(cx)`; return shapes with `boxed(...)` / `owned(&shape)`; builders with `finish!(maker, "Name")`. Pass `&*x?` (explicit deref) when handing a freshly built `UniquePtr` to a binding. Geometry crosses the boundary as `Float64Array` (see `convert.rs` for frame/axis/matrix formats).
4. Expose each addon function through a typed wrapper in `packages/occt-native/src/<domain>.ts` (declare the raw signatures in a local interface; export typed functions) and re-export it from `src/index.ts`.
5. Errors: the addon throws `Error` with `code` (`INVALID_ARGUMENT`, `OCCT_EXCEPTION` + `kernelException`, `OPERATION_FAILED`, `DISPOSED`, `IMPORT_FAILED`, `EXPORT_FAILED`). Caddy wraps them in its own error classes at operation boundaries, keeping the original as `cause`.

## TypeScript conventions

- Node runs `.ts` directly: relative imports end in `.ts`; erasable syntax only (no `enum`, `namespace`, parameter properties). Enums are `as const` objects plus a union type, with PascalCase members (`Align.Center`) whose values match build123d's.
- Optional settings (alignment, rotation, tolerances, flags, extra modes) go in a trailing options object (`new Box(1, 2, 3, { align })`, `solid.chamfer(1, edges, { length2 })`, `sortBy(Axis.X, { reverse: true })`) rather than Python-style positional defaults; never a positional boolean. Coordinates and a primary value with its mode stay positional (`new Vector(1, 2)`, `tangentAt(0.5, PositionMode.Length)`).
- `let` for every binding; `const` only for module-level UPPER_CASE constants (lint-enforced).
- Strict TS with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Shapes are immutable: operations return new shapes. build123d operators become methods: `+` union, `-` subtract, `&` intersect, `*` (location) transform/moved, `@` positionAt, `%` tangentAt, `^` locationAt.

## Testing

- Behavioural truth is build123d: add cases to `reference/build123d/cases/<suite>.py`, regenerate fixtures, and assert them with `oracleSuite("<suite>", {...})`. A fixture case without an implementation fails; never skip, never loosen tolerances or hand-edit fixtures to pass. Document genuine divergences.
- Tolerances live in `reference/build123d/tolerances.ts` with justifications.

## Status

See `docs/compatibility.md` for what is implemented, tested and oracle-validated. Its statuses are computed, never hand-edited: change a mapping in `docs/compatibility.json` (`caddy` field) and rerun `compatibility-status.ts`.
