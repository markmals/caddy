/**
 * Faces from the unordered, possibly nested wires of a filled SVG shape.
 *
 * A filled path may describe several rings at once — a washer is two circles, the letter B is
 * three — with nothing but containment to say which is a hole. Rings at even nesting depth become
 * faces, rings at odd depth become holes in the innermost ring that contains them, which is how
 * build123d's SVG importer reads them.
 */

import { query, shapes } from "@roonieone/occt-native";

import { Face, Wire } from "../../topology/index.ts";

/** Raised when the wires cannot bound faces at all; build123d then imports them as wires. */
export class UnfillableWires extends Error {}

export function facesFromWires(wires: readonly Wire[]): Face[] {
    let rings = wires.map(wire => boundaryOf(wire));
    if (rings.length < 2) return rings.map(ring => normalUp(new Face(ring)));

    let faces = rings.map(ring => new Face(ring));
    let containers = faces.map((face, index) =>
        faces.reduce<number[]>((found, other, otherIndex) => {
            if (otherIndex !== index && contains(other, face)) found.push(otherIndex);
            return found;
        }, []),
    );

    let groups = new Map<number, { outers: Wire[]; inners: Wire[] }>();
    let group = (index: number): { outers: Wire[]; inners: Wire[] } => {
        let existing = groups.get(index);
        if (existing !== undefined) return existing;
        let created = { outers: [] as Wire[], inners: [] as Wire[] };
        groups.set(index, created);
        return created;
    };
    for (let [index, ancestors] of containers.entries()) {
        let ring = rings[index];
        if (ring === undefined) continue;
        if (ancestors.length % 2 === 0) group(index).outers.push(ring);
        else group(innermost(ancestors, containers)).inners.push(ring);
    }

    let built: Face[] = [];
    for (let { outers, inners } of groups.values()) {
        let [outer] = outers;
        if (outers.length === 1 && outer !== undefined) {
            built.push(normalUp(new Face(outer, inners)));
            continue;
        }
        for (let ring of [...outers, ...inners]) built.push(normalUp(new Face(ring)));
    }
    return built;
}

/**
 * Rebuilding each wire as a face and taking that face's boundary back repairs wires whose edges
 * are out of order or oriented against each other, which hand-written path data often is.
 */
function boundaryOf(wire: Wire): Wire {
    try {
        return new Face(wire).outerWire();
    } catch (cause) {
        throw new UnfillableWires("a filled shape has a wire that cannot bound a face", { cause });
    }
}

/** Of the rings containing a given one, the one that is itself contained by the most. */
function innermost(
    ancestors: readonly number[],
    containers: readonly (readonly number[])[],
): number {
    let deepest = ancestors[0] ?? 0;
    for (let candidate of ancestors) {
        if ((containers[candidate]?.length ?? 0) > (containers[deepest]?.length ?? 0)) {
            deepest = candidate;
        }
    }
    return deepest;
}

/** Wires from one SVG shape never cross, so a single boundary point settles containment. */
function contains(outer: Face, inner: Face): boolean {
    return outer.isInside(inner.outerWire().startPoint());
}

/** Every face of an imported SVG faces the viewer, whichever way its wire happened to run. */
function normalUp(face: Face): Face {
    let bounds = query.uvBounds(face.wrapped);
    let { normal } = query.faceNormal(
        face.wrapped,
        (bounds.uMin + bounds.uMax) / 2,
        (bounds.vMin + bounds.vMax) / 2,
    );
    return normal[2] !== undefined && normal[2] < 0
        ? new Face(shapes.reversed(face.wrapped))
        : face;
}
