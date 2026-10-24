/** Adding and removing the interior boundaries (holes) of a face. */

import { surfaces } from "@roonieone/occt-native";

import type { Face } from "./face.ts";
import type { Wire } from "./wire.ts";

import { castFace } from "../curves/cast.ts";

/**
 * `face` pierced by `interiorWires`, which must lie entirely inside it (build123d
 * `Face.make_holes`). OCCT needs the wires wound against the face, so a wire that fails may
 * need reversing.
 */
export function makeHoles(face: Face, interiorWires: Iterable<Wire>): Face {
    let holes = [...interiorWires].map(wire => wire.wrapped);
    return castFace("Face.makeHoles", () => surfaces.addFaceHoles(face.wrapped, holes)).fix();
}

/** `face` with every hole filled in (build123d `Face.without_holes`). */
export function withoutHoles(face: Face): Face {
    let holes = face.innerWires();
    if (holes.length === 0) {
        return face;
    }
    return castFace("Face.withoutHoles", () =>
        surfaces.removeFaceHoles(
            face.wrapped,
            holes.map(wire => wire.wrapped),
        ),
    );
}
