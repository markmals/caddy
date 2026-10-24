# Third-party notices

## Open CASCADE Technology (via `@roonieone/occt-native`)

Caddy depends at runtime on `@roonieone/occt-native`, a separate package licensed under the Apache License, Version 2.0. Its per-platform binary packages carry Open CASCADE Technology 8.0.1, which is covered by the GNU LGPL version 2.1 with the Open CASCADE exception (version 1.0):

> The object code (i.e. not a source) form of a "work that uses the Library" can incorporate material from a header file that is part of the Library. As a special exception to the GNU Lesser General Public License version 2.1, you may distribute such object code incorporating material from header files provided with the Open CASCADE Technology libraries (including code of CDL generic classes) under terms of your choice, provided that you give prominent notice in supporting documentation to this code that it makes use of or is based on facilities provided by the Open CASCADE Technology software.

OCCT and its use are covered by that license; the full LGPL-2.1 text ships as `@roonieone/occt-native/LICENSE.LGPL-2.1` and the exception as `@roonieone/occt-native/LICENSE.OCCT_EXCEPTION`. OCCT is linked dynamically: the shared libraries in the `@roonieone/occt-native-<platform>-<arch>` package can be replaced with a compatible rebuild, and that package's `REPLACING_OCCT.md` explains how.

Those platform packages also ship FreeType under the FreeType License; their `LICENSE.FREETYPE` and `THIRD_PARTY_NOTICES.md` list every bundled component.

## build123d

Caddy is a derivative work of build123d 0.13.0 (Apache-2.0); see `NOTICE` for the attribution and the statement of changes.

## bd_materials

`src/materials` is a TypeScript port of bd_materials 0.2.5 (Apache-2.0), Copyright 2026 Bernhard Walter, https://github.com/bernhard-42/bd_materials. Each ported module names the Python file it derives from; `NOTICE` carries the attribution and the statement of changes.
