# Caddy

TypeScript-first CAD for Node.js: the algebraic API of [build123d](https://github.com/gumyr/build123d) 0.13.0, ported to TypeScript and running on a native [Open CASCADE Technology](https://dev.opencascade.org) 8.0.1 kernel. No Python or WebAssembly at run time; build123d is used only in development, as the oracle every behaviour is tested against.

```ts
import * as caddy from "@roonieone/caddy";
import { Box, CADFileType, Cylinder, Pos } from "@roonieone/caddy";

let part = new Box(80, 40, 5).subtract(new Cylinder(5, 10).transform(new Pos(20, 0, 0)));
await caddy.export(part, { name: "plate.step", type: CADFileType.Step });
```

| Package | What | License |
| --- | --- | --- |
| [`@roonieone/caddy`](packages/caddy) | The TypeScript API | Apache-2.0 |
| [`@roonieone/occt-native`](packages/occt-native) | Neon addon over generated OCCT bindings, plus prebuilt per-platform packages | LGPL-2.1-only |

Runnable examples live in [`examples/`](examples) (`node examples/step-export/index.ts`).

## Documentation

- [Compatibility with build123d](docs/compatibility.md)
- [Architecture](docs/architecture.md)
- [Native bindings](docs/native-bindings.md)
- [Test oracle](docs/test-oracle.md)
- [Licensing](docs/licensing.md)

Contributors start with [AGENTS.md](AGENTS.md): layout, commands, and the native and testing workflows.

Caddy makes use of facilities provided by the Open CASCADE Technology software.
