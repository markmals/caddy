import { expect, test } from "vite-plus/test";

import type { Shape } from "../src/index.ts";

import { ShapeType, features, measure, primitives, topology } from "../src/index.ts";

function faceAt(shape: Shape, axis: 0 | 1 | 2, position: number): Shape {
    let face = topology.subShapes(shape, ShapeType.Face).find(candidate => {
        let box = measure.boundingBox(candidate);
        return (
            box !== undefined &&
            Math.abs(box.min[axis] - position) < 1e-6 &&
            Math.abs(box.max[axis] - position) < 1e-6
        );
    });
    if (face === undefined) throw new Error("expected a box face");
    return face;
}

test("extruding a face produces a valid prism", () => {
    let box = primitives.makeBox(4, 3, 2);
    let face = faceAt(box, 2, 2);
    let prism = features.extrude(face, [0, 0, 5]);
    expect(measure.massProperties(prism, "volume").mass).toBeCloseTo(60, 8);
    expect(measure.isValid(prism)).toBe(true);
});

test("lofting two box face wires makes a solid", () => {
    let box = primitives.makeBox(4, 3, 5);
    let lower = topology.subShapes(faceAt(box, 2, 0), ShapeType.Wire)[0]!;
    let upper = topology.subShapes(faceAt(box, 2, 5), ShapeType.Wire)[0]!;
    let loft = features.loft([lower, upper], true);
    expect(measure.massProperties(loft, "volume").mass).toBeCloseTo(60, 8);
    expect(measure.isValid(loft)).toBe(true);
});

test("a fillet and a chamfer change a box without invalidating it", () => {
    let box = primitives.makeBox(10, 8, 6);
    let edge = topology.subShapes(box, ShapeType.Edge)[0]!;
    let face = topology.ancestors(box, edge, ShapeType.Face)[0]!;
    let rounded = features.fillet(box, [edge], 0.5);
    let beveled = features.chamfer(box, [edge], 0.5, 0.5, [face]);
    expect(measure.isValid(rounded)).toBe(true);
    expect(measure.isValid(beveled)).toBe(true);
    expect(measure.massProperties(rounded, "volume").mass).toBeLessThan(480);
    expect(measure.massProperties(beveled, "volume").mass).toBeLessThan(480);
});

test("shelling a box with one opening creates a valid hollow solid", () => {
    let box = primitives.makeBox(10, 8, 6);
    let lid = faceAt(box, 2, 6);
    let shell = features.offset(box, -1, [lid]);
    expect(measure.isValid(shell)).toBe(true);
    expect(measure.massProperties(shell, "volume").mass).toBeGreaterThan(0);
});

test("thickening a planar face builds a solid", () => {
    let box = primitives.makeBox(4, 3, 2);
    let face = faceAt(box, 2, 2);
    let thick = features.thicken(face, 1);
    expect(measure.isValid(thick)).toBe(true);
    expect(measure.massProperties(thick, "volume").mass).toBeCloseTo(12, 6);
});

test("drafting one box face preserves a valid solid", () => {
    let box = primitives.makeBox(10, 8, 6);
    let wall = faceAt(box, 0, 10);
    let drafted = features.draft(
        box,
        [wall],
        { origin: [0, 0, 0], zDirection: [0, 0, 1], xDirection: [1, 0, 0] },
        Math.PI / 36,
    );
    expect(drafted.shape).not.toBeNull();
    expect(measure.isValid(drafted.shape!)).toBe(true);
});

test("projecting a wire onto a solid returns wires on its surface", () => {
    let cylinder = primitives.makeCylinder(5, 10);
    let square = topology.subShapes(faceAt(primitives.makeBox(4, 4, 1), 2, 1), ShapeType.Wire)[0]!;
    let projected = features.project(square, cylinder, [0, 0, -1]);
    let wires = topology.subShapes(projected, ShapeType.Wire);
    expect(wires.length).toBeGreaterThan(0);
    for (let wire of wires) {
        let bounds = measure.boundingBox(wire);
        expect(bounds).toBeDefined();
        expect(bounds!.max[2]).toBeLessThanOrEqual(10 + 1e-6);
    }
});
