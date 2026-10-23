# Third-party notices

## Open CASCADE Technology (via `@roonieone/occt-native`)

Caddy depends at runtime on `@roonieone/occt-native`, a separate package licensed under the GNU Lesser General Public License version 2.1 (`LGPL-2.1-only`). That package and its per-platform binary packages contain Open CASCADE Technology 8.0.1, which is covered by the GNU LGPL version 2.1 with the Open CASCADE exception (version 1.0):

> The object code (i.e. not a source) form of a "work that uses the Library" can incorporate material from a header file that is part of the Library. As a special exception to the GNU Lesser General Public License version 2.1, you may distribute such object code incorporating material from header files provided with the Open CASCADE Technology libraries (including code of CDL generic classes) under terms of your choice, provided that you give prominent notice in supporting documentation to this code that it makes use of or is based on facilities provided by the Open CASCADE Technology software.

The full LGPL-2.1 text ships in `@roonieone/occt-native/LICENSE`. OCCT is linked dynamically: the shared libraries in the `@roonieone/occt-native-<platform>-<arch>` package can be replaced with a compatible rebuild; that package's `REPLACING_OCCT.md` explains how.

## build123d

Caddy is a derivative work of build123d (Apache-2.0); see `NOTICE`.
