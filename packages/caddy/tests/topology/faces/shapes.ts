/** The shapes `reference/build123d/cases/faces.py` builds, rebuilt through Caddy's own makers. */

import type { VectorLike } from "../../../src/geometry/index.ts";

import { Plane } from "../../../src/geometry/index.ts";
import { Edge, Face, GeomType, Solid, SortBy, Wire } from "../../../src/topology/index.ts";

export function bezierPoints(): VectorLike[][] {
    return [-1, 0, 1].map(y =>
        [-1, 0, 1].map(x => [x, y, x === 0 && y === 0 ? 2 : x === 0 || y === 0 ? 1 : 0]),
    );
}

export function bezierWeights(): number[][] {
    return [-1, 0, 1].map(y => [-1, 0, 1].map(x => (x === 0 || y === 0 ? 2 : 1)));
}

export function fittedPoints(): VectorLike[][] {
    let range = [...Array(11).keys()];
    return range.map(y =>
        range.map(x => [x, y, Math.cos((Math.PI * x) / 10) + Math.sin((Math.PI * y) / 10)]),
    );
}

/** Three splines meeting end to end, the boundary of the reference patch. */
export function patchEdges(): [Edge, Edge, Edge] {
    let first = Edge.makeSpline([
        [0, 0, 0],
        [10, 0, -10],
        [1, 0, 0],
    ]);
    let second = Edge.makeSpline([
        [0, 0, 0],
        [0, 10, -10],
        [0, 1, 0],
    ]);
    let third = Edge.makeSpline([first.positionAt(1), [7, 7, -10], second.positionAt(1)]);
    return [first, second, third];
}

/** A square plate with a square hole. */
export function frame(): Face {
    return Face.makeRect(1, 1).subtract(Face.makeRect(0.5, 0.5)).faces.first;
}

export function plateWithHole(): Face {
    let outer = Wire.makePolygon([
        [0, 0, 0],
        [20, 0, 0],
        [20, 12, 0],
        [0, 12, 0],
    ]);
    let inner = Wire.makeCircle(3, new Plane({ origin: [10, 6, 0] }));
    return new Face(outer, [inner]);
}

export function cylinderWall(): Face {
    return Solid.makeCylinder(3, 8).faces.filter(GeomType.Plane, { reverse: true }).first;
}

/** The wall of a cylinder with a smaller cylinder drilled across it, so it has two holes. */
export function drilledWall(): Face {
    let drilled = Solid.makeCylinder(1, 3).subtract(
        Solid.makeCylinder(0.5, 3, {
            plane: new Plane({ origin: [0, -1.5, 1.5], zDir: [0, 1, 0] }),
        }),
    );
    return drilled.faces.toSorted(SortBy.Area).last;
}

export function coneWall(): Face {
    return Solid.makeCone(0, 3, 5).faces.filter(GeomType.Cone).first;
}

export function notchedDisc(): Face {
    return new Face(Wire.makeCircle(2)).subtract(Face.makeRect(0.5, 0.5).translate([0.1, 0, 0]))
        .faces.first;
}
