# @roonieone/occt-native

Native Node.js bindings to [Open CASCADE Technology](https://dev.opencascade.org) (OCCT) 8.0.1, used by [`@roonieone/caddy`](../caddy). It is a Rust Neon addon over cxx bindings generated from the OCCT headers. Most users want `@roonieone/caddy`; this package is its kernel layer.

## Install

```sh
npm install @roonieone/occt-native
```

npm installs exactly one prebuilt platform package as an optional dependency:

| Platform package                         | Target                     |
| ---------------------------------------- | -------------------------- |
| `@roonieone/occt-native-darwin-arm64`    | macOS 13.5+, Apple silicon |
| `@roonieone/occt-native-darwin-x64`      | macOS 13.5+, Intel         |
| `@roonieone/occt-native-linux-x64-gnu`   | Linux x64, glibc           |
| `@roonieone/occt-native-linux-arm64-gnu` | Linux arm64, glibc         |
| `@roonieone/occt-native-win32-x64`       | Windows x64                |

Each contains `occt-native.node` and the OCCT shared libraries it loads from its own directory.

## API

Shapes are opaque native handles; call `shapes.dispose(shape)` to free one early or let the garbage collector do it. Kernel failures throw errors with a stable `code` (`INVALID_ARGUMENT`, `OCCT_EXCEPTION`, `OPERATION_FAILED`, `DISPOSED`, `IMPORT_FAILED`, `EXPORT_FAILED`) that `isOcctError` recognises. Data exchange (`io.writeStep`, `io.readStep`, ...) returns promises and runs on the libuv worker pool.

```ts
import { booleans, io, measure, primitives } from "@roonieone/occt-native";

let plate = booleans.cut([primitives.makeBox(80, 40, 5)], [primitives.makeCylinder(5, 10)]);
console.log(measure.massProperties(plate, "volume").mass);
```

## Building from source

Without a matching platform package, build OCCT and the addon locally (Rust stable, CMake, Ninja, a C++17 compiler):

```sh
node scripts/build-occt.ts
node scripts/build-native.ts --release
```

`SOURCE.md` lists the exact OCCT source and build options.

## License

LGPL-2.1-only; see `LICENSE`. This package makes use of facilities provided by the Open CASCADE Technology software, which is licensed under LGPL-2.1 with the Open CASCADE exception (`LICENSE.OCCT_EXCEPTION`).

The OCCT libraries are shared libraries in the platform package directory, so you can replace them with your own build of the same OCCT version: build OCCT with `scripts/build-occt.ts` (or your own CMake configuration using the options in `occt-build.json`) and copy the libraries over the shipped ones, keeping their file names. `THIRD_PARTY_NOTICES.md` in each platform package lists every bundled component and its license.
