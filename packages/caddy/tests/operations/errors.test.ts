import { expect, test } from "vite-plus/test";

import { makeLine } from "../../src/curves/edge-makers.ts";
import { FilletPolyline } from "../../src/curves/index.ts";
import { GeometryError, InvalidShapeError } from "../../src/errors.ts";
import { Plane } from "../../src/geometry/index.ts";
import {
    chamfer,
    extrude,
    makeBrakeFormed,
    offset,
    projectWorkplane,
    scale,
    split,
} from "../../src/operations/index.ts";
import { Box } from "../../src/parts/index.ts";
import { Kind } from "../../src/sketch/enums.ts";
import { Rectangle } from "../../src/sketch/index.ts";
import { Keep } from "../../src/topology/enums.ts";
import { Face, Wire } from "../../src/topology/index.ts";

test("extrusion rejects a zero amount", () => {
    expect(() => extrude(new Rectangle(2, 3), 0)).toThrow(GeometryError);
});

test("chamfer rejects conflicting secondary dimensions", () => {
    let box = new Box(8, 6, 4);
    expect(() => chamfer(box.edges()[0]!, 1, { length2: 1, angle: 30 })).toThrow(GeometryError);
});

test("solid offset rejects an unsupported tangent join", () => {
    expect(() => offset(new Box(8, 6, 4), 0.5, { kind: Kind.Tangent })).toThrow(GeometryError);
});

test("split rejects inside/outside semantics", () => {
    expect(() => split(new Box(8, 6, 4), { bisectBy: Plane.XY, keep: Keep.Inside })).toThrow(
        GeometryError,
    );
});

test("scale rejects a singular transform", () => {
    expect(() => scale(new Box(4, 3, 2), [1, 0, 1])).toThrow(GeometryError);
});

test("hollow rejects an unsupported tangent join", () => {
    let solid = new Box(1, 1, 1).solid();
    expect(() => solid.hollow(undefined, 0.1, { kind: Kind.Tangent })).toThrow(GeometryError);
});

test("hollow rejects a zero thickness", () => {
    expect(() => new Box(1, 1, 1).solid().hollow(undefined, 0)).toThrow(GeometryError);
});

test("maxFillet rejects an empty edge selection", () => {
    expect(() => new Box(4, 3, 2).solid().maxFillet([])).toThrow(InvalidShapeError);
});

test("maxFillet gives up when the search window never narrows enough", () => {
    let solid = new Box(10, 8, 2).solid();
    expect(() => solid.maxFillet(solid.edges(), { tolerance: 1e-6, maxIterations: 1 })).toThrow(
        GeometryError,
    );
});

test("the split method rejects inside/outside semantics", () => {
    expect(() => new Box(8, 6, 4).solid().split(Plane.XY, Keep.Outside)).toThrow(GeometryError);
});

test("splitByPerimeter rejects an open perimeter", () => {
    let face = Face.makeRect(10, 10);
    let open = makeLine([-2, -2, 0], [2, 2, 0]);
    expect(() => face.splitByPerimeter(open)).toThrow(GeometryError);
});

test("splitByPerimeter rejects a keep mode it cannot honour", () => {
    let face = Face.makeRect(10, 10);
    let perimeter = Wire.makeCircle(2);
    expect(() => face.splitByPerimeter(perimeter, Keep.Top)).toThrow(GeometryError);
});

test("projectToShape needs exactly one of direction and center", () => {
    let line = makeLine([-4, 0, 12], [4, 0, 12]);
    let target = new Box(10, 10, 10);
    expect(() => line.projectToShape(target, {})).toThrow(GeometryError);
    expect(() => line.projectToShape(target, { direction: [0, 0, -1], center: [0, 0, 0] })).toThrow(
        GeometryError,
    );
});

test("projectWorkplane rejects an x direction along the projection", () => {
    expect(() => projectWorkplane([0, 0, 0], [0, 0, 1], [0, 0, 1], 10)).toThrow(GeometryError);
});

test("makeBrakeFormed rejects a width count that does not match the line", () => {
    let outline = new FilletPolyline(
        [
            [0, 0],
            [5, 6],
            [10, 1],
        ],
        1,
    ).wire();
    expect(() => makeBrakeFormed(0.5, [1, 2], outline)).toThrow(GeometryError);
});

test("dprism rejects bounds that mix faces and wires", () => {
    let solid = new Box(1, 1, 1).solid();
    let profile = Face.makeRect(0.5, 0.5);
    expect(() => solid.dprism([profile, profile.outerWire()])).toThrow(InvalidShapeError);
});
