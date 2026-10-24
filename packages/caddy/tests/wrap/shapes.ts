/**
 * The surfaces and planar inputs the wrap oracle cases share. Perimeters are built from explicit
 * edges in a fixed order: wrapping walks a wire edge by edge and rejoins its first and last edge,
 * so the order the perimeter is given in is part of the result.
 */

import { Location, Plane } from "../../src/geometry/index.ts";
import { Trapezoid } from "../../src/sketch/index.ts";
import { Edge, Face, GeomType, Solid, Wire } from "../../src/topology/index.ts";

/** A closed wire through `points`, one edge per side, in the order given. */
export function polygonWire(points: readonly [number, number][]): Wire {
    return new Wire(
        points.map((corner, index) =>
            Edge.makeLine(corner, points[(index + 1) % points.length] as [number, number]),
        ),
    );
}

/** A rectangle walked anticlockwise from its top left corner. */
export function rectangleWire(width: number, height: number, offsetX = 0): Wire {
    return polygonWire([
        [offsetX - width / 2, height / 2],
        [offsetX - width / 2, -height / 2],
        [offsetX + width / 2, -height / 2],
        [offsetX + width / 2, height / 2],
    ]);
}

/** The lateral surface of a cylinder of radius 10, seam at +X. */
export function cylinderWall(): Face {
    let wall = Solid.makeCylinder(10, 20).faces().filterBy(GeomType.Cylinder)[0];
    if (wall === undefined) throw new Error("the cylinder has no lateral face");
    return wall;
}

/** Half way up the cylinder, a quarter turn away from its seam. */
export function cylinderLocation(): Location {
    return Location.fromPlane(
        new Plane({ origin: [0, 10, 10], xDir: [-1, 0, 0], zDir: [0, 1, 0] }),
    );
}

export function coneWall(): Face {
    let wall = Solid.makeCone(10, 5, 20).faces().filterBy(GeomType.Cone)[0];
    if (wall === undefined) throw new Error("the cone has no lateral face");
    return wall;
}

export function coneLocation(): Location {
    let cone = coneWall();
    let point = cone.positionAt(0.25, 0.5);
    return Location.fromPlane(
        new Plane({ origin: point, xDir: [0, 0, 1], zDir: cone.normalAt(point) }),
    );
}

export function trapezoidFace(): Face {
    return new Trapezoid(0.5, 1, 90 - 8).face();
}
