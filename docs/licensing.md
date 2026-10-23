# Licensing and distribution obligations

This document is engineering analysis, not legal advice. It records what the licenses say, what we verified in the actual source trees, and what the recommended compliance posture is; an owner (and, before the first public release, a lawyer) should sign off on the license choices in [Recommended license assignment](#recommended-license-assignment).

Everything marked **Verified** was read directly from the files or URLs cited. Everything marked **[INFERENCE]** is reasoning from those facts, not a quoted obligation.

## Summary of recommendations

1. Link OCCT **dynamically**: build OCCT as shared libraries, ship them inside the per-platform npm package next to the `.node` addon, and resolve them via `@loader_path` / `$ORIGIN` / the Windows altered DLL search path. This satisfies LGPL-2.1 §6(b) and keeps OCCT user-replaceable. Static linking is permitted but forces us into §6(a) relink-kit distribution, which is substantially more work per platform.
2. License `@roonieone/caddy` (pure TypeScript) **Apache-2.0**, because it is a derivative work of build123d (Apache-2.0) and must carry build123d's `LICENSE`, its `NOTICE` attributions, and a statement of changes.
3. License `@roonieone/occt-native` (Rust addon + prebuilt binaries) **LGPL-2.1-only**, because the practical implementation path compiles LGPL-2.1 Rust source (`opencascade-sys`-derived cxx bridges) into the addon. Our addon source is public, so this costs us nothing and removes every §6(a) relink question for the Rust layer. See [Alternative B](#alternative-b-clean-room-bridge-permissive-addon) for the clean-room variant that would allow a permissive addon license.
4. Never mix the two source trees: no Apache-2.0-only code inside the LGPL-2.1-only crate, no LGPL code inside the TypeScript package. See [Apache-2.0 / LGPL-2.1 compatibility](#apache-20--lgpl-21-only-compatibility).

## What actually ships

| Artifact | Contents | Contains LGPL code? |
| --- | --- | --- |
| `@roonieone/caddy` | TypeScript/JS only, ported from build123d | No |
| `@roonieone/occt-native` | JS loader, TypeScript types, Rust crate source, build scripts; `optionalDependencies` on the platform packages | Yes, as source (the cxx bridge, under the recommendation) |
| `@roonieone/occt-native-<platform>-<arch>` | Prebuilt `caddy.node` + OCCT shared libraries (`libTK*.dylib` / `.so` / `.dll`) + OCCT resource files | Yes, as binaries (OCCT itself, plus bridge object code inside the addon) |

build123d, OCP/`cadquery-ocp-novtk`, and the Python virtualenv are **development-only** oracles used for differential testing. They are never published and never linked; their licenses (Apache-2.0 for both build123d 0.13.0 and `cadquery-ocp-novtk` 8.0.1.1.0, verified from the installed `.dist-info/METADATA` files) impose no obligations on our distributed artifacts. The _algorithms_ we port from build123d do create obligations — see [build123d](#build123d-apache-20-derivative-work).

## Component license table

Linkage column: _dynamic_ = separate file loaded at run time; _static_ = object code inside `caddy.node`; _build-time_ = runs on our machines, no code in the artifact; _source-derived_ = we wrote new code based on it.

| Component | Version | License | How used | Linkage | Core obligations |
| --- | --- | --- | --- | --- | --- |
| OCCT (Open CASCADE Technology) | 8.0.1 (tag `V8_0_1`, commit `b8f597c677811d1f9f4d8a97f5ae2825c0353a42`) | LGPL-2.1-only **with** the Open CASCADE exception | The CAD kernel; all geometry/topology work | dynamic (recommended) | §6 notice + license copy + one of §6(a)–(e); keep replaceable; publish corresponding source location |
| OCCT headers (inline/template code) | 8.0.1 | same, exception applies | Compiled into the addon's object code | static (unavoidable) | Exception requires "prominent notice in supporting documentation" that we use OCCT |
| `delabella` (inside OCCT `TKMesh`) | bundled in OCCT 8.0.1 | MIT | Delaunay triangulation used by `BRepMesh` | static inside `libTKMesh` | Reproduce MIT text + copyright in notices |
| `FlexLexer.h` (inside OCCT `TKernel`) | bundled in OCCT 8.0.1 | BSD-style (UC Regents, 3-clause without advertising clause) | flex lexer base class used by data-exchange parsers | static inside OCCT libs | Reproduce copyright + conditions + disclaimer in binary-distribution notices |
| DejaVu Sans Latin subset (inside OCCT `TKService`) | bundled in OCCT 8.0.1 | Bitstream Vera Fonts License (MIT-style, name restrictions) + public-domain DejaVu changes | Fallback font data | static inside `libTKService` (only if we ship `TKService`) | Reproduce the font copyright/permission notice; do not rename-abuse "Bitstream"/"Vera" |
| `opencascade-sys` | 0.3.0 | LGPL-2.1 (declared in `Cargo.toml`; repo `LICENSE` is the LGPL-2.1 text) | cxx bridge declarations + `include/wrapper.hxx` C++ shims | static (if used/derived) | Whole addon becomes a work based on the Library: ship complete corresponding source (§4) or a §6(a) relink kit |
| `occt-sys` | 7.8.1 | LGPL-2.1 | Static OCCT 7.8.1 builder; **we do not use it** (we build OCCT 8.0.1 ourselves) | not used | None, if we keep it out of the dependency graph |
| `opencascade` (high-level Rust API) | 0.3.0 | LGPL-2.1 | Reference reading only; not a dependency | not used | None |
| `opencascade-kicad-parser` | 0.3.0 | MIT OR Apache-2.0 OR Zlib | Not used | not used | None |
| `cxx` | 1.0.x | MIT OR Apache-2.0 | Rust↔C++ bridge runtime | static | Reproduce chosen license text + copyright |
| `cxx-build`, `cxxbridge-macro`, `cxxbridge-cmd`, `cxxbridge-flags`, `cc`, `scratch`, `syn`, `quote`, `proc-macro2` | 1.0.x / current | MIT OR Apache-2.0 | Code generation and C++ compilation during build | build-time | None for the binary; list anyway for hygiene |
| `codespan-reporting` | 0.13.x | Apache-2.0 **only** | Diagnostics inside `cxx-build` | build-time | Not linked into the artifact; keep it that way (see compatibility note) |
| `link-cplusplus` | 1.0.x | MIT OR Apache-2.0 | Links the C++ standard library | static (link directive) | Reproduce license text |
| `foldhash` | 0.2 | Zlib | Hash map used by `cxx` | static | Reproduce Zlib notice |
| `neon` / `neon-macros` | 1.1.x | MIT OR Apache-2.0 | Node-API binding layer for the addon | static (macros: build-time) | Reproduce chosen license text |
| `libloading` | 0.8.x (neon 1.1.2 requires `^0.8.1`) | ISC | How neon resolves Node-API symbols from the host process at run time | static | Reproduce ISC notice |
| `linkme`, `once_cell`, `semver`, `send_wrapper`, `smallvec`, `either` | current | MIT OR Apache-2.0 | neon's runtime dependencies | static | Reproduce chosen license text |
| Rust `std` / `core` / `alloc` | toolchain | MIT OR Apache-2.0 (`compiler_builtins`: `MIT AND Apache-2.0 WITH LLVM-exception AND (MIT OR Apache-2.0)`) | Rust runtime | static | Reproduce license text + `COPYRIGHT` |
| Node-API / Node.js | host runtime | MIT (Node.js) | ABI we implement; symbols resolved from the running `node` process | neither (no Node code in our binary) | None beyond normal MIT courtesy; we distribute no Node.js code |
| C++ runtime (`libc++`/`libstdc++`/MSVC CRT) | platform | Apache-2.0 WITH LLVM-exception / GPL-3.0 WITH GCC-exception / MS EULA | Required by OCCT and our bridge | dynamic (system) | LGPL §6 explicitly exempts "major components ... of the operating system" from the materials we must distribute |
| build123d | 0.13.0 | Apache-2.0 | Behavioral oracle **and** the design we port to TypeScript | source-derived | Apache §4: carry `LICENSE`, carry `NOTICE` attributions, mark changed/derived files, state changes |
| OCP / `cadquery-ocp-novtk` | 8.0.1.1.0 | Apache-2.0 (pybind11 bindings; wraps LGPL OCCT) | Dev-only test oracle | not distributed | None for our artifacts |
| RapidJSON | n/a | MIT (with a JSON-licensed `bin/jsonchecker` we would exclude) | OCCT optional glTF JSON support | **OFF** | None while off |
| Draco | n/a | Apache-2.0 | OCCT optional mesh compression | **OFF** | None while off |
| FreeType | n/a | FTL **or** GPL-2.0-or-later (your choice) | OCCT optional font rendering | **OFF** | None while off; if enabled, pick FTL and add its advertising-style credit |
| TBB, VTK, FFmpeg, FreeImage, OpenVR, Eigen, Tcl/Tk, OpenGL/GLES, D3D, Xlib | n/a | various (several copyleft or patent-encumbered) | OCCT optional integrations | **OFF** | None while off |

The "OFF" rows are enforced in `packages/occt-native/scripts/build-occt.ts` (`USE_DRACO`, `USE_RAPIDJSON`, `USE_FREETYPE`, `USE_TBB`, `USE_VTK`, `USE_FFMPEG`, `USE_FREEIMAGE`, `USE_OPENVR`, `USE_EIGEN`, `USE_TCL`, `USE_TK`, `USE_OPENGL`, `USE_GLES2`, `USE_D3D`, `USE_XLIB` are all `"OFF"`). **Verified** by reading the script. Flipping any of these to `ON` is a licensing change, not just a build change, and must update this document plus `THIRD_PARTY_NOTICES`.

## OCCT: LGPL-2.1-only plus the Open CASCADE exception

Every OCCT source file carries this header (**verified**, e.g. `src/FoundationClasses/TKernel/Standard/Standard_Real.hxx`):

> This library is free software; you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License version 2.1 as published by the Free Software Foundation, with special exception defined in the file OCCT_LGPL_EXCEPTION.txt.

"version 2.1 as published by" with no "or (at your option) any later version" means **LGPL-2.1-only**, not `-or-later`. SPDX identifier: `LGPL-2.1-only WITH ...` (there is no registered SPDX exception id for the OCCT exception, so the exception text must be shipped verbatim rather than referenced by id). The header also notes OCCT is alternatively available under a commercial license from Open CASCADE SAS; we are not buying that, so the LGPL terms govern.

### The exception, quoted in full

`/tmp/caddy-research/occt/OCCT-8_0_1/OCCT_LGPL_EXCEPTION.txt`, mirrored in-tree at `packages/occt-native/.occt/src-8.0.1/OCCT_LGPL_EXCEPTION.txt` (**verified**):

> Open CASCADE exception (version 1.0) to GNU LGPL version 2.1.
>
> The object code (i.e. not a source) form of a "work that uses the Library" can incorporate material from a header file that is part of the Library. As a special exception to the GNU Lesser General Public License version 2.1, you may distribute such object code incorporating material from header files provided with the Open CASCADE Technology libraries (including code of CDL generic classes) under terms of your choice, provided that you give prominent notice in supporting documentation to this code that it makes use of or is based on facilities provided by the Open CASCADE Technology software.

The operative sentence is the second one: _"you may distribute such object code incorporating material from header files ... under terms of your choice, provided that you give prominent notice in supporting documentation to this code that it makes use of or is based on facilities provided by the Open CASCADE Technology software."_

### What the exception covers

It neutralizes LGPL-2.1 §5, which says (**verified**, `LICENSE_LGPL_21.txt` §5): "When a 'work that uses the Library' uses material from a header file that is part of the Library, the object code for the work may be a derivative work of the Library even though the source code is not," and then grants an unrestricted-use carve-out only for "numerical parameters, data structure layouts and accessors, and small macros and small inline functions (ten lines or less in length)."

That ten-line threshold is nowhere near enough for OCCT. Our bridge instantiates `Handle(...)` smart pointers, `NCollection_*` templates, `gp_*` value classes, and inline accessors far longer than ten lines, so without the exception our addon's **object code** would be a derivative work of OCCT under §5 and would fall under §6 purely by virtue of headers. The exception says: that header-derived object code may be distributed under terms of our choice, as long as we give prominent notice that the code uses OCCT.

Practical consequence: the compiled `caddy.node` is not forced into LGPL merely because it `#include`s OCCT headers. The notice is the only price, and it is cheap — a line in the README and in `THIRD_PARTY_NOTICES`.

### What the exception does not cover

- It does not cover the OCCT **libraries themselves**. Shipping `libTKernel.dylib` is distributing the Library; §§1–4 and §6 apply in full.
- It does not cover **linking**. Combining our work with the Library to produce a running program is still §6 territory; the exception only addresses header material baked into object code.
- It does not cover **copied implementation code**. If we transcribe an algorithm out of a `.cxx` file into our bridge, that is a work based on the Library, not a "work that uses the Library".
- It does not waive the LGPL's notice, license-copy, or source-availability duties for the Library we redistribute.
- It is version 1.0 of the exception and is phrased around "header file" material only; we should not stretch it. **[INFERENCE]**

### Third-party code compiled into our OCCT build

**Verified** by scanning the OCCT 8.0.1 tree for non-OCCT license banners in the toolkits our build configures (`TKOpenGl` is not configured — `USE_OPENGL=OFF` — and `Draw`/`Deprecated` are off):

- `src/ModelingAlgorithms/TKMesh/BRepMesh/delabella.pxx` — "DELABELLA - Delaunay triangulation library, Copyright (C) 2018 GUMIX - Marcin Sokalski", MIT. This lands inside `libTKMesh`, which we definitely ship.
- `src/FoundationClasses/TKernel/FlexLexer/FlexLexer.h` — "Copyright (c) 1993 The Regents of the University of California", BSD-style with a binary-redistribution notice requirement. Lands in OCCT's data-exchange lexers.
- `src/Visualization/TKService/Font/Font_DejavuSans_Latin_woff.pxx` — Bitstream Vera Fonts License plus public-domain DejaVu modifications. Only relevant if we ship `TKService`; the current CMake configuration does build `TKService` and `TKV3d`.

All three impose binary-distribution notice obligations and must appear in the platform package's `THIRD_PARTY_NOTICES`. If we trim the shipped toolkit set (e.g. drop `TKService`/`TKV3d`), the DejaVu entry can be dropped with it.

### Our build configuration is part of the "corresponding source"

LGPL-2.1 §0 (**verified**): "For a library, complete source code means all the source code for all modules it contains, plus any associated interface definition files, plus the scripts used to control compilation and installation of the library."

So the corresponding source for the OCCT binaries we ship is: the upstream tree at tag `V8_0_1` **plus** `packages/occt-native/scripts/build-occt.ts`, which pins the version, the archive URL, the SHA-256, and every CMake flag. Our script already records a `occt-build.json` stamp containing `{version, tag, sha256, target, options}` in the install directory — that stamp is exactly the manifest a recipient needs to reproduce the build, and it should be copied into the published platform package.

Canonical identifiers (**verified** via the GitHub API): annotated tag `V8_0_1` → commit `b8f597c677811d1f9f4d8a97f5ae2825c0353a42`; the lightweight tag `V8.0.1` (used by the occt3d.com download page) points at the same commit, so the two names are interchangeable, but we should cite the commit SHA to be unambiguous. Archive: `https://github.com/Open-Cascade-SAS/OCCT/archive/refs/tags/V8_0_1.tar.gz`, SHA-256 `0d6913eae4bcc09a3653ceced6dda1aec11c35a1513d4c06762c9b002092c68a` (pinned and checked in `build-occt.ts`).

We currently apply **no patches** to OCCT. If that changes, LGPL §2(a)/(b) require that modified files carry prominent notices stating that we changed them and the date of the change, and the patches must be published as part of the corresponding source.

## LGPL-2.1 §6: static versus dynamic linking

§6 opens (**verified**):

> As an exception to the Sections above, you may also combine or link a "work that uses the Library" with the Library to produce a work containing portions of the Library, and distribute that work under terms of your choice, **provided that the terms permit modification of the work for the customer's own use and reverse engineering for debugging such modifications.**

Then, unconditionally:

> You must give prominent notice with each copy of the work that the Library is used in it and that the Library and its use are covered by this License. You must supply a copy of this License. ... Also, you must do one of these things:

and the options are (a) accompany with complete source for the Library _and_ the "work that uses the Library" in relinkable form, (b) use a suitable shared library mechanism, (c) a written offer valid at least three years, (d) equivalent access from the same designated place, (e) verify the user already has the materials.

### Option 1 — static OCCT inside `caddy.node`

A single self-contained `.node` is attractive operationally: no rpath, no dylib loading order, no Windows DLL search path, no `install_name` surgery.

The cost is §6(b) becomes unavailable, so we must fall back to §6(a): ship the complete OCCT source _and_ "the complete machine-readable 'work that uses the Library', as object code and/or source code, so that the user can modify the Library and then relink to produce a modified executable containing the modified Library."

Concretely that means, per platform, publishing the addon's object files or a `staticlib` plus the exact linker invocation so a user can relink against their own OCCT. For a Rust `cdylib` that is awkward: `cargo` does not emit a reusable link kit, so we would have to produce one by hand (`--emit=obj`/`staticlib` plus a recorded link line), keep it in sync across macOS/Linux/Windows, test that it actually relinks, and host tens of megabytes of object archives per release. **[INFERENCE]** It is doable but is a recurring per-release engineering burden with real breakage risk, and a broken relink kit is a compliance failure, not just a bug.

§6(c) (written offer) does not rescue static linking: the offer must cover the _same materials_ as §6(a), including the relinkable form of our work. Promising to produce something we never build is worse than building it.

### Option 2 — dynamic OCCT beside the addon (recommended)

§6(b) (**verified**):

> Use a suitable shared library mechanism for linking with the Library. A suitable mechanism is one that (1) uses at run time a copy of the library already present on the user's computer system, rather than copying library functions into the executable, and (2) will operate properly with a modified version of the library, if the user installs one, as long as the modified version is interface-compatible with the version that the work was made with.

Our build already targets this. From `build-occt.ts` (**verified**): `BUILD_LIBRARY_TYPE: "Shared"`, `CMAKE_MACOSX_RPATH: "ON"`, `CMAKE_INSTALL_NAME_DIR: "@rpath"`, and `CMAKE_INSTALL_RPATH` set to `@loader_path` on darwin and `$ORIGIN` elsewhere. The addon links against `@rpath/libTK*.dylib` and finds them next to itself.

How each platform satisfies clause (2), i.e. "the user can drop in their own build and it works":

- **macOS**: `install_name` is `@rpath/libTKxxx.dylib`; the `.node` carries `LC_RPATH = @loader_path`. Replacing `node_modules/@roonieone/occt-native-darwin-arm64/lib/libTKMesh.dylib` with a user build of the same OCCT version is sufficient. The addon must not be signed with library validation / hardened runtime in a way that rejects a user-rebuilt dylib. **[INFERENCE]** — verify empirically before the first signed release.
- **Linux**: `DT_RUNPATH = $ORIGIN` resolves siblings. Note `$ORIGIN` must survive the npm pack/unpack (it is encoded in the ELF, so it does) and that `RUNPATH` does not propagate to transitive deps — each OCCT library must itself carry `$ORIGIN`, which `CMAKE_INSTALL_RPATH` does provide for the OCCT libs too.
- **Windows**: Node loads addons through libuv's `uv_dlopen`, which calls `LoadLibraryExW(filename, NULL, LOAD_WITH_ALTERED_SEARCH_PATH)` (**verified**: https://github.com/libuv/libuv/blob/v1.x/src/win/dl.c). `LOAD_WITH_ALTERED_SEARCH_PATH` makes the directory of the loaded `.node` the first directory searched for its dependent DLLs, so `TKernel.dll` and friends sitting beside `caddy.node` are found without `PATH` manipulation.

The conservative reading of §6(b)(1) — "a copy of the library already present on the user's computer system" — is sometimes argued to mean a library we did not ship. Our OCCT libraries _are_ present on the user's system as ordinary installed files, in a directory the user can inspect and overwrite, and we copy no library functions into the addon. To remove the argument entirely, we additionally satisfy §6(d) by making the exact corresponding source available from the same place the binary comes from, and we add a §6(c)-style three-year written offer. Belt and braces; the marginal cost is a text file and a tagged source archive. **[INFERENCE]**

### The reverse-engineering clause

§6's lead paragraph requires that whatever terms we pick for the combined work "permit modification of the work for the customer's own use and reverse engineering for debugging such modifications."

Our chosen terms must therefore contain **no** anti-reverse-engineering, anti-modification, or anti-benchmarking clause. Apache-2.0 and LGPL-2.1 both pass trivially; a future proprietary/commercial edition, a EULA, or an npm "terms of use" wrapper would need review. We must also not ship the binaries in a form that defeats this in practice (no obfuscation-only distribution, no stripping that prevents debugging — normal release stripping is fine since full source is available). **[INFERENCE]**

### Notices and the license copy

Required by §6 regardless of which of (a)–(e) we pick:

1. Prominent notice, with each copy, that OCCT is used in the work and that OCCT and its use are covered by the LGPL.
2. A copy of the LGPL-2.1 license text, shipped with the work.
3. If the work displays copyright notices at run time, OCCT's copyright must appear among them with a pointer to the license. Our addon displays nothing at run time, so this is moot today; if we ever add a banner/about API, it must include OCCT. **[INFERENCE]**

Plus the OCCT exception's own condition: "prominent notice in supporting documentation to this code that it makes use of or is based on facilities provided by the Open CASCADE Technology software." One sentence in the README and in `THIRD_PARTY_NOTICES` of every package that carries OCCT-derived object code.

### Written offer versus accompanying source

- **Accompanying source** (§6(a)/§4) is the strongest and simplest: put the corresponding source _in_ the artifact. For the Rust layer this is trivial — the crate source is small. For OCCT's ~500 MB source tree it would bloat every platform tarball, so we do not embed it.
- **Same-place access** (§6(d)) is the pragmatic answer for OCCT: the npm package and the GitHub release both point at a pinned, immutable, publicly downloadable archive (`V8_0_1`, SHA-256 recorded) plus our build script. The script itself is in the published package.
- **Written offer** (§6(c)) is a three-year commitment to hand over the materials "for a charge no more than the cost of performing this distribution". We should include it as a fallback in case the upstream URL ever moves, and we must therefore **archive the exact OCCT tarball ourselves** (checksum-verified) for at least three years after the last release that ships it. An offer we cannot honour is the classic LGPL compliance failure. **[INFERENCE]**

Recommendation: do (d) primarily, state (c) as a named-contact fallback, and keep an internal immutable copy of every OCCT tarball we have ever shipped.

## The Rust layer

### `opencascade-sys` / `occt-sys` are LGPL-2.1

**Verified** from `/tmp/caddy-research/opencascade-rs/crates/*/Cargo.toml`: `occt-sys` 7.8.1 → `license = "LGPL-2.1"`; `opencascade-sys` 0.3.0 → `license = "LGPL-2.1"`; `opencascade` 0.3.0 → `license = "LGPL-2.1"`; `opencascade-kicad-parser` 0.3.0 → `license = "MIT OR Apache-2.0 OR Zlib"`. The repository `LICENSE` file is the verbatim GNU LGPL-2.1 text. The bare `LGPL-2.1` SPDX token is deprecated and ambiguous; since the upstream file is the plain 2.1 text with no "or later" grant in the headers, treat it as **LGPL-2.1-only**. If we vendor any of it, we should ask upstream to clarify, or simply comply with the stricter `-only` reading. **[INFERENCE]**

We do **not** use `occt-sys` at all (it builds OCCT 7.8.1 statically; we build 8.0.1 ourselves). The code we care about is `opencascade-sys`: its `src/lib.rs` cxx bridge declarations and `include/wrapper.hxx` C++ shims.

If our addon contains code copied from or derived from `opencascade-sys` — including a bridge written by transcribing its `cxx::bridge` blocks or its wrapper shims — the addon crate is a **work based on the Library** (LGPL §0: "a work containing the Library or a portion of it, either verbatim or with modifications and/or translated straightforwardly into another language"). Rust statically links that code into `caddy.node`, and §6(b)'s shared-library escape hatch is unavailable for it.

Compliance then runs through §§1–4 rather than §6: we distribute the whole addon under LGPL-2.1, and §4 requires that the object form be accompanied by "the complete corresponding machine-readable source code" (or, if distribution is by access from a designated place, equivalent access to the source from the same place). Since our addon source is public and small, we satisfy this by shipping the full Rust crate source inside `@roonieone/occt-native` and pointing the per-platform binary packages at the same tagged release. No relink kit is needed, because the user can rebuild the whole addon from the source we ship. That is the entire argument for licensing `@roonieone/occt-native` LGPL-2.1-only: it converts an awkward §6(a) obligation into a trivial §4 one.

Also required when distributing under LGPL: keep upstream copyright notices intact in any file derived from `opencascade-sys`, and mark files we changed with a note and date (§2(a)).

### Permissive crates linked into the addon

`cxx`, `neon`, `linkme`, `once_cell`, `semver`, `send_wrapper`, `smallvec`, `either`, `link-cplusplus` are `MIT OR Apache-2.0`; `libloading` is ISC; `foldhash` is Zlib; the Rust standard library is `MIT OR Apache-2.0` (with `compiler_builtins` carrying `MIT AND Apache-2.0 WITH LLVM-exception AND (MIT OR Apache-2.0)`). **Verified** via the crates.io API and `https://github.com/rust-lang/rust/blob/master/COPYRIGHT`.

All of these require reproducing their license text and copyright notice in binary distributions — that is what `THIRD_PARTY_NOTICES` is for. Generate it mechanically (`cargo about` or `cargo deny`-driven) rather than by hand, and regenerate on every dependency bump.

Build-time-only crates (`cxx-build`, `cxxbridge-*`, `cc`, `syn`, `quote`, `proc-macro2`, `codespan-reporting`, `cmake`) contribute no code to the shipped binary and need no notice, though listing them costs nothing. The one that matters is `codespan-reporting`, which is **Apache-2.0 only** — see below.

### Apache-2.0 / LGPL-2.1-only compatibility

The FSF's position is that Apache-2.0 is incompatible with GPLv2 (and therefore LGPL-2.1) because its patent-termination and indemnification terms are restrictions GPLv2 does not permit (https://www.gnu.org/licenses/license-list.html#apache2). Apache-2.0 code can therefore not be combined _into_ a work distributed under LGPL-2.1-only.

Three concrete rules follow:

1. For dual-licensed `MIT OR Apache-2.0` crates linked into the LGPL addon, **elect MIT** and record that election in `THIRD_PARTY_NOTICES`. The choice is ours to make and MIT is unambiguously compatible.
2. Keep Apache-2.0-only crates out of the linked set. Today only `codespan-reporting` (and the optional, default-off `easy-cast` neon feature) is Apache-2.0-only, and it is build-time only. Add a `cargo-deny` rule so this cannot regress silently.
3. `@roonieone/caddy` (Apache-2.0, derived from build123d) must never have its code copied into the LGPL addon crate, and vice versa. The packages communicate across a `require()`/`process.dlopen` boundary, not by source sharing.

Point 3 also resolves the Apache-2.0-consumer question: `@roonieone/caddy` is a "work that uses the Library" relative to the addon, loaded through Node's dynamic loader, which is a suitable shared library mechanism under §6(b). §6 lets us distribute such a work "under terms of your choice, provided that the terms permit modification of the work for the customer's own use and reverse engineering for debugging such modifications" — Apache-2.0 permits both. **[INFERENCE]** `@roonieone/caddy` still owes the §6 notice and license copy, which is why it ships the LGPL text and an OCCT/addon notice even though it contains no native code.

### Node-API

The addon implements the Node-API ABI. neon resolves the `napi_*` symbols at run time out of the host process via `libloading` (**verified**: `crates/neon/src/sys/bindings/mod.rs` defines `unsafe fn load(host: &libloading::Library)`), so **no Node.js source or headers end up in our binary**. Node.js is MIT-licensed (https://github.com/nodejs/node/blob/main/LICENSE) and we redistribute none of it; there is nothing to comply with beyond not claiming otherwise. Node-API's ABI stability also means we do not need per-Node-version builds, which keeps the per-platform artifact count (and therefore the compliance surface) small.

## build123d: Apache-2.0 derivative work

`@roonieone/caddy` is a port of build123d's _algebraic_ API: we re-implement its classes, operator semantics, algorithms, numerical tolerances, and behaviour in TypeScript, using build123d as the behavioral oracle. Even though not a line of Python is copied verbatim, a line-by-line functional port of a copyrighted library's structure and algorithms is a derivative work, and we should treat it as one rather than argue about the threshold. **[INFERENCE]**

build123d 0.13.0 is Apache-2.0 (**verified**: `LICENSE` is the Apache 2.0 text; `pyproject`-derived metadata says `License: Apache-2.0`; per-file headers say "Copyright 2025 Gumyr ... Licensed under the Apache License, Version 2.0"). It ships a `NOTICE` file (**verified**) reading:

> build123d Copyright (c) 2022–2025 The build123d Contributors ... This project was originally derived from portions of the CadQuery codebase (https://github.com/CadQuery/cadquery) but has since been extensively refactored and restructured into an independent system. CadQuery is licensed under the Apache License, Version 2.0.

Apache-2.0 §4 obligations for `@roonieone/caddy`:

- **§4(a)** — give recipients a copy of the Apache-2.0 license: ship `LICENSE` in the npm package.
- **§4(b)** — "cause any modified files to carry prominent notices stating that You changed the files": every ported module should carry a short header naming the build123d module it derives from and noting that it was ported to TypeScript and modified.
- **§4(c)** — retain all copyright, patent, trademark, and attribution notices from the source form of the Work: keep Gumyr's/the contributors' copyright line in the ported files' headers.
- **§4(d)** — because build123d ships a `NOTICE` file, our distribution must include a readable copy of its attribution notices. Ship a `NOTICE` in `@roonieone/caddy` that reproduces build123d's NOTICE content (including the CadQuery lineage) and then adds our own attribution.
- **Statement of changes**: Apache-2.0 does not demand a separate changelog, but §4(b) is cleanest to satisfy with one explicit section. `NOTICE` should say, in substance: _"Caddy contains a TypeScript port of portions of build123d 0.13.0 (Apache-2.0). The code was translated from Python to TypeScript, restructured for the npm package layout, and modified; it is not the original build123d."_

Trademark: Apache-2.0 §6 grants no trademark rights. Do not name the package or market it as "build123d for Node"; describe it as "a TypeScript library whose API is modeled on build123d". **[INFERENCE]**

Note the asymmetry worth stating in `NOTICE`: build123d's OCP dependency is itself Apache-2.0-licensed bindings over LGPL OCCT. Our equivalent layer is LGPL. Nothing about build123d's licensing constrains our addon's license.

## Recommended license assignment

Pending owner approval.

| Package | Recommended license | Rationale |
| --- | --- | --- |
| `@roonieone/caddy` | `Apache-2.0` | Derivative of build123d (Apache-2.0). Same license keeps attribution/patent terms coherent, avoids relicensing questions, and matches the ecosystem it is ported from. |
| `@roonieone/occt-native` | `LGPL-2.1-only` | Contains/derives from `opencascade-sys` (LGPL-2.1) compiled statically into the addon, and ships OCCT. Our source is public, so LGPL costs us nothing and discharges §4 by simply shipping the source. |
| `@roonieone/occt-native-<platform>-<arch>` | `LGPL-2.1-only` | Same work, binary form. Carries the OCCT license, the exception, and the corresponding-source pointers. |

Set `"license"` in each `package.json` to the SPDX expression above, and `license = "LGPL-2.1-only"` in the addon's `Cargo.toml`.

### Why not license the addon permissively?

Because of `opencascade-sys`, not because of OCCT. OCCT alone (dynamically linked, headers covered by the exception) would let us license the addon however we like. The LGPL Rust source is what pulls the addon in.

### Alternative A — buy a commercial OCCT license

Open CASCADE SAS sells a commercial license that replaces the LGPL terms entirely (the per-file headers say so explicitly). That would allow static linking, a single self-contained `.node`, and any license we want on the addon. It costs money and is only worth revisiting if a downstream user needs static linking or cannot accept LGPL. Record as a known escape hatch.

### Alternative B — clean-room bridge, permissive addon

If we write the entire cxx bridge ourselves from OCCT's own headers and documentation, never copying `opencascade-sys` code (using it only as a "how do others shape this" reference is risky; using nothing at all is clean), then the addon contains no LGPL **source**. Its object code still embeds OCCT header material, which the OCCT exception explicitly permits "under terms of your choice". The addon could then be Apache-2.0 or MIT, while the shipped OCCT shared libraries remain LGPL and still require §6(b) + notices + corresponding source.

This is the only route to a permissive addon, and it has to be decided _before_ the bridge is written, not after. If the bridge work is already consulting `opencascade-sys`, pick the LGPL recommendation and move on. The practical difference for users is small: LGPL-2.1 on a dynamically-loadable native addon that anyone may replace does not restrict commercial use of `@roonieone/caddy`.

### Alternative C — single combined package

Publishing one package containing both the TypeScript and the native binaries would force the whole thing to be LGPL-2.1-only (or to carefully document the aggregation). Splitting the packages is better: it keeps the Apache-2.0 TypeScript surface legally independent, makes the `require()` boundary an obvious dynamic-linking boundary, and lets users swap the addon out.

## What each published artifact must contain

### `@roonieone/caddy`

- `LICENSE` — Apache-2.0 full text.
- `NOTICE` — our copyright, build123d's NOTICE content (including CadQuery lineage), and the statement of changes described above.
- `THIRD_PARTY_NOTICES.md` — the runtime dependency on `@roonieone/occt-native` (LGPL-2.1-only), the LGPL-2.1 notice required by §6 ("this work uses OCCT; OCCT and its use are covered by the GNU LGPL-2.1"), a copy of (or an in-package path to) the LGPL-2.1 text, the OCCT exception notice sentence, and instructions for replacing the native library.
- `README.md` — the OCCT exception's "prominent notice in supporting documentation": a visible sentence stating that Caddy makes use of facilities provided by Open CASCADE Technology.
- `package.json` — `"license": "Apache-2.0"`.

### `@roonieone/occt-native`

- `LICENSE` — GNU LGPL-2.1 full text.
- `LICENSE.OCCT_EXCEPTION` — verbatim `OCCT_LGPL_EXCEPTION.txt`.
- `NOTICE`/`README.md` — the OCCT usage notice; attribution to opencascade-rs for any derived bridge code with its copyright line retained.
- Complete Rust crate source (`src/`, `include/`, `build.rs`, `Cargo.toml`) and `scripts/build-occt.ts` — this _is_ the corresponding source that discharges §4 for the addon and names the OCCT build configuration.
- `THIRD_PARTY_NOTICES.md` — generated from the Cargo graph: every linked crate, its elected license, its text, its copyright.
- `SOURCE.md` — OCCT tag `V8_0_1`, commit `b8f597c677811d1f9f4d8a97f5ae2825c0353a42`, archive URL, SHA-256, our build script path, our repo URL and release tag, plus the three-year written offer with a contact address.
- `package.json` — `"license": "LGPL-2.1-only"`.

### `@roonieone/occt-native-<platform>-<arch>`

Everything in the list above (these packages are installed standalone and must be self-sufficient), plus:

- The prebuilt `caddy.node` and the OCCT shared libraries, in a directory the user can write to.
- `occt-build.json` — the stamp emitted by `build-occt.ts` (version, tag, sha256, target, full CMake option set).
- The third-party notices for code compiled **into OCCT itself**: delabella (MIT), FlexLexer (BSD, UC Regents), and the Bitstream Vera/DejaVu font notice if `TKService` ships.
- `REPLACING_OCCT.md` — concrete instructions: rebuild OCCT 8.0.1 with `build-occt.ts`, drop the resulting libraries into this package's `lib/` directory, keep the file names and ABI, restart Node. This is the user-facing proof that §6(b)(2) holds, and it should be tested, not assumed.
- `package.json` — `"license": "LGPL-2.1-only"`, plus `os`/`cpu` fields.

## Release compliance checklist

Run through this for every published release; a failed item blocks the release.

### OCCT build

- [ ] `build-occt.ts` still pins tag `V8_0_1` / commit `b8f597c677811d1f9f4d8a97f5ae2825c0353a42`, and the SHA-256 check passed during the build (no manual override).
- [ ] `BUILD_LIBRARY_TYPE=Shared` — no static OCCT in the artifact.
- [ ] All `USE_*` third-party flags still `OFF`; if any was turned on, this document, the license table, and `THIRD_PARTY_NOTICES` were updated in the same change.
- [ ] No local patches to the OCCT tree; if any exist, they are published, and modified files carry change notices with dates (§2(a)).
- [ ] An immutable copy of the exact OCCT source archive is archived in our own storage, retained ≥3 years after this release's end of life (backs the written offer).

### Binary artifact

- [ ] `otool -L` / `readelf -d` / `dumpbin /dependents` shows the OCCT libraries as external dependencies, resolved via `@rpath`/`$ORIGIN`/sibling directory — not absorbed into the addon.
- [ ] The OCCT shared libraries are present in the package and are plain writable files (not inside an asar/zip, not read-only, not signed in a way that blocks replacement).
- [ ] Replacement test executed on each platform: rebuild one OCCT library locally, overwrite the shipped one, run the test suite, confirm it loads. This is the §6(b)(2) evidence.
- [ ] macOS: addon is not signed with library validation; a user-rebuilt, unsigned dylib still loads.
- [ ] `cargo deny`/`cargo about` run clean: no Apache-2.0-only or unknown-license crate in the linked dependency set; `THIRD_PARTY_NOTICES.md` regenerated from the current lockfile.

### Package contents

- [ ] `@roonieone/caddy`: `LICENSE` (Apache-2.0), `NOTICE` (build123d attribution + CadQuery lineage + statement of changes), `THIRD_PARTY_NOTICES.md`, OCCT notice sentence in `README.md`, `"license": "Apache-2.0"`.
- [ ] `@roonieone/occt-native`: LGPL-2.1 text, OCCT exception text, full Rust + build-script source, `SOURCE.md` with tag/commit/URL/SHA-256 and the three-year written offer, `THIRD_PARTY_NOTICES.md`, `"license": "LGPL-2.1-only"`.
- [ ] Each platform package: all of the above plus `occt-build.json`, delabella/FlexLexer/DejaVu notices as applicable, `REPLACING_OCCT.md`, `os`/`cpu` fields.
- [ ] `npm pack --dry-run` (or the `files` field) confirms every license/notice file is actually included — the most common failure mode is a `files` allowlist silently dropping them.
- [ ] Every ported TypeScript module carries its build123d-derivation header (Apache §4(b)).
- [ ] The GitHub release tag matching this npm version exists and is public — that tag is the "same designated place" that discharges §6(d)/§4.

### Bookkeeping

- [ ] Dependency licenses re-checked after any `Cargo.lock` change.
- [ ] This document updated if the linkage model, package split, OCCT version, or build flags changed.

## Sources

- OCCT LGPL-2.1 text: `/tmp/caddy-research/occt/OCCT-8_0_1/LICENSE_LGPL_21.txt` — https://github.com/Open-Cascade-SAS/OCCT/blob/master/LICENSE_LGPL_21.txt
- OCCT exception: `/tmp/caddy-research/occt/OCCT-8_0_1/OCCT_LGPL_EXCEPTION.txt` — https://github.com/Open-Cascade-SAS/OCCT/blob/master/OCCT_LGPL_EXCEPTION.txt
- OCCT licensing statement ("OCCT is distributed under LGPL 2.1 with an additional exception"): https://occt3d.com/open-cascade-technology/
- OCCT 8.0.1 release: https://github.com/Open-Cascade-SAS/OCCT/releases/tag/V8.0.1 ; archive used by our build: https://github.com/Open-Cascade-SAS/OCCT/archive/refs/tags/V8_0_1.tar.gz
- opencascade-rs crate manifests and LICENSE: https://github.com/bschwind/opencascade-rs (local clone `/tmp/caddy-research/opencascade-rs`, HEAD `32758df2`)
- Crate licenses (crates.io API, read 2026-10-23): https://crates.io/crates/neon , https://crates.io/crates/cxx , https://crates.io/crates/libloading , https://crates.io/crates/foldhash , https://crates.io/crates/codespan-reporting
- Rust project licensing: https://github.com/rust-lang/rust/blob/master/COPYRIGHT
- neon Node-API symbol loading: https://github.com/neon-bindings/neon/blob/main/crates/neon/src/sys/bindings/mod.rs
- libuv Windows `dlopen` flags: https://github.com/libuv/libuv/blob/v1.x/src/win/dl.c
- Node.js license: https://github.com/nodejs/node/blob/main/LICENSE
- build123d 0.13.0 `LICENSE` and `NOTICE`: https://github.com/gumyr/build123d
- Apache License 2.0: https://www.apache.org/licenses/LICENSE-2.0
- FSF on Apache-2.0 vs GPLv2 compatibility: https://www.gnu.org/licenses/license-list.html#apache2
- RapidJSON license: https://github.com/Tencent/rapidjson/blob/master/license.txt
- Draco license: https://github.com/google/draco/blob/main/LICENSE
- FreeType licensing (FTL or GPLv2): https://gitlab.freedesktop.org/freetype/freetype/-/blob/master/LICENSE.TXT
