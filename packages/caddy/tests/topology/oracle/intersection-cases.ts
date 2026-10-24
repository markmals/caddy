import type { OracleCases } from "./support.ts";

import { expectClose } from "../../../../../reference/build123d/oracle.ts";
import { MASS_TOLERANCE } from "../../../../../reference/build123d/tolerances.ts";
import { Axis, Plane, Pos } from "../../../src/geometry/index.ts";
import { Edge, Face } from "../../../src/topology/index.ts";
import { box } from "./shapes.ts";
import { expectNames, expectPoint } from "./support.ts";

export const intersectionCases: OracleCases = {
    "intersection/edge-crossing": expected => {
        let horizontal = Edge.makeLine([-5, 0, 0], [5, 0, 0]);
        let vertical = Edge.makeLine([0, -5, 0], [0, 5, 0]);
        let [point] = horizontal.intersectWith(vertical) ?? [];
        if (point === undefined) throw new Error("expected intersecting lines");
        expectNames(expected, "classes", [point.constructor.name]);
        expectPoint(expected, "point", point.center());
    },
    "intersection/edge-overlap": expected => {
        let first = Edge.makeLine([0, 0, 0], [10, 0, 0]);
        let second = Edge.makeLine([5, 0, 0], [15, 0, 0]);
        let [overlap] = first.intersectWith(second) ?? [];
        if (overlap === undefined) throw new Error("expected overlapping lines");
        expectNames(expected, "classes", [overlap.constructor.name]);
        expectClose(expected, "length", overlap.edges().first.length, MASS_TOLERANCE);
    },
    "intersection/face-edge": expected => {
        let face = Face.makeRect(10, 10);
        let piercing = Edge.makeLine([0, 0, -5], [0, 0, 5]);
        let [point] = face.intersectWith(piercing) ?? [];
        if (point === undefined) throw new Error("expected a piercing point");
        expectNames(expected, "classes", [point.constructor.name]);
        expectPoint(expected, "point", point.center());
    },
    "intersection/face-face": expected => {
        let face = Face.makeRect(10, 10);
        let [overlap] = face.intersectWith(Face.makeRect(10, 10).moved(new Pos(5, 0, 0))) ?? [];
        if (overlap === undefined) throw new Error("expected overlapping faces");
        expectNames(expected, "classes", [overlap.constructor.name]);
        expectClose(expected, "area", overlap.area, MASS_TOLERANCE);
    },
    "intersection/face-plane": expected => {
        let intersection = Face.makeRect(10, 10).intersect(Plane.XZ);
        if (intersection === undefined) throw new Error("expected face-plane crossing");
        expectNames(expected, "classes", [intersection.constructor.name]);
        expectClose(expected, "length", intersection.edges().first.length, MASS_TOLERANCE);
    },
    "intersection/solid-axis": expected => {
        let intersection = box().intersect(new Axis([5, 3, 0], [0, 0, 1]));
        if (intersection === undefined) throw new Error("expected solid-axis crossing");
        expectNames(expected, "classes", [intersection.constructor.name]);
        expectClose(expected, "length", intersection.edges().first.length, MASS_TOLERANCE);
    },
    "intersection/solid-plane": expected => {
        let intersection = box().intersect(Plane.XY.withOrigin([0, 0, 2]));
        if (intersection === undefined) throw new Error("expected solid-plane section");
        expectNames(expected, "classes", [intersection.constructor.name]);
        expectClose(expected, "area", intersection.area, MASS_TOLERANCE);
    },
    "intersection/edge-plane": expected => {
        let intersection = Edge.makeLine([0, 0, -5], [0, 0, 5]).intersect(Plane.XY);
        if (intersection === undefined) throw new Error("expected edge-plane crossing");
        expectNames(expected, "classes", [intersection.constructor.name]);
        expectPoint(expected, "point", intersection.center());
    },
};
