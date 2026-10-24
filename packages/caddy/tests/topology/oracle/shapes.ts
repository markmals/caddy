// The shapes the `topology` fixture cases are built from, matching the builders in
// `reference/build123d/cases/topology.py` call for call.

import { primitives } from "@roonieone/occt-native";

import type { Shape } from "../../../src/topology/index.ts";

import { Plane, Pos } from "../../../src/geometry/index.ts";
import { Face, Solid, Wire } from "../../../src/topology/index.ts";

export function box(): Solid {
    return new Solid(primitives.makeBox(10, 6, 4));
}

export function cylinder(): Solid {
    return new Solid(primitives.makeCylinder(3, 8));
}

export function sphere(): Solid {
    return new Solid(primitives.makeSphere(5));
}

export function cone(): Solid {
    return new Solid(primitives.makeCone(5, 2, 8));
}

/** A box with a cylindrical notch cut out of one vertical corner edge. */
export function notchedBox(): Shape {
    return box().subtract(new Solid(primitives.makeCylinder(2, 4)).moved(new Pos(10, 6, 0)));
}

export function plateWithHole(): Face {
    let outer = Wire.makePolygon([
        [0, 0, 0],
        [20, 0, 0],
        [20, 12, 0],
        [0, 12, 0],
    ]);
    let inner = Wire.makeCircle(3, Plane.XY.withOrigin([10, 6, 0]));
    return new Face(outer, [inner]);
}

export function polygon(): Wire {
    return Wire.makePolygon(
        [
            [0, 0, 0],
            [10, 0, 0],
            [10, 5, 0],
            [0, 5, 0],
        ],
        { close: false },
    );
}
