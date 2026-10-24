# @roonieone/caddy

TypeScript-first CAD for Node.js. Caddy ports the algebraic API of [build123d](https://github.com/gumyr/build123d) 0.13.0 to idiomatic TypeScript and runs it on a native [Open CASCADE Technology](https://dev.opencascade.org) (OCCT) 8.0.1 kernel. There is no Python and no WebAssembly at run time.

```ts
import * as caddy from "@roonieone/caddy";
import { Box, CADFileType, Cylinder, Pos } from "@roonieone/caddy";

let part = new Box(80, 40, 5).subtract(new Cylinder(5, 10).transform(new Pos(20, 0, 0)));
await caddy.export(part, { name: "plate.step", type: CADFileType.Step });
```

## Install

```sh
npm install @roonieone/caddy
```

Node.js 24 or newer. The native kernel comes from [`@roonieone/occt-native`](../occt-native), which installs a prebuilt package for your platform.

## Coming from build123d

| build123d | Caddy |
| --- | --- |
| `a + b`, `a - b`, `a & b` | `a.union(b)`, `a.subtract(b)`, `a.intersect(b)` |
| `Pos(20, 0, 0) * shape` | `shape.transform(new Pos(20, 0, 0))` |
| `Box(1, 2, 3, align=(Align.MIN,) * 3)` | `new Box(1, 2, 3, { align: [Align.Min, Align.Min, Align.Min] })` |
| `edges().filter_by(Axis.Z).sort_by(Axis.X)` | `edges.filter(Axis.Z).toSorted(Axis.X)` |
| `export_step(part, "a.step")` | `await caddy.export(part, { name: "a.step", type: CADFileType.Step })` |
| `import_step("a.step")` | `await importCAD("a.step")` |

- Names are camelCase; noun-named queries are accessors (`shape.edges`, `shape.center`); optional parameters are options objects; enum members are PascalCase (`GeomType.Line`).
- Shapes are immutable: every operation returns a new shape.
- File import and export are asynchronous and run off the main thread.
- `export` is a reserved word, so it cannot be imported by name. Use the namespace (`caddy.export`), rename it (`import { export as exportShape }`), or use its alias `exportCAD`.
- Only the algebraic API is ported; build123d's builder (context-manager) API is out of scope.

`docs/compatibility.md` in the repository lists every build123d symbol and whether it is implemented, tested and validated against build123d.

## License

Apache-2.0. Caddy is a derivative work of build123d (Apache-2.0) and of bd_materials (Apache-2.0); see `NOTICE` and `THIRD_PARTY_NOTICES.md`.

Caddy makes use of facilities provided by the Open CASCADE Technology software, through `@roonieone/occt-native` (Apache-2.0), whose per-platform packages ship OCCT itself under the GNU LGPL version 2.1 with the Open CASCADE exception.
