import { expect, test } from "vite-plus/test";

import { GeometryError } from "../../src/errors.ts";
import { Plane } from "../../src/geometry/index.ts";
import { chamfer, extrude, offset, scale, split } from "../../src/operations/index.ts";
import { Box } from "../../src/parts/index.ts";
import { Kind } from "../../src/sketch/enums.ts";
import { Rectangle } from "../../src/sketch/index.ts";
import { Keep } from "../../src/topology/enums.ts";

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
    expect(() => split(new Box(8, 6, 4), Plane.XY, Keep.Inside)).toThrow(GeometryError);
});

test("scale rejects a singular transform", () => {
    expect(() => scale(new Box(4, 3, 2), [1, 0, 1])).toThrow(GeometryError);
});
