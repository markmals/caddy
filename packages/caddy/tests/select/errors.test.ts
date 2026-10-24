import { describe, expect, test } from "vite-plus/test";

import {
    Box,
    Cylinder,
    InvalidShapeError,
    Pos,
    Rectangle,
    Select,
    Solid,
} from "../../src/index.ts";

/** A box with a cylinder fused onto it: the one shape in here with a record. */
function fusedPart(): Box {
    return new Box(10, 10, 10).union(new Cylinder(2, 20)) as Box;
}

describe("select", () => {
    test("a shape no operation made cannot answer LAST or NEW", () => {
        let box = new Box(10, 10, 10);
        expect(() => box.getFaces({ select: Select.Last })).toThrow(InvalidShapeError);
        expect(() => box.getFaces({ select: Select.New })).toThrow(InvalidShapeError);
        expect(() => box.getFaces({ select: Select.Last })).toThrow(/no record/);
    });

    test("every accessor reports the same lack of a record", () => {
        let rectangle = new Rectangle(4, 2);
        expect(() => rectangle.getVertices({ select: Select.New })).toThrow(InvalidShapeError);
        expect(() => rectangle.getEdges({ select: Select.New })).toThrow(InvalidShapeError);
        expect(() => rectangle.getWires({ select: Select.New })).toThrow(InvalidShapeError);
        expect(() => rectangle.getFaces({ select: Select.New })).toThrow(InvalidShapeError);
        expect(() => rectangle.getShells({ select: Select.New })).toThrow(InvalidShapeError);
        expect(() => rectangle.getSolids({ select: Select.New })).toThrow(InvalidShapeError);
    });

    test("Select.All and the default need no record", () => {
        let box = new Box(10, 10, 10);
        expect(box.getFaces({ select: Select.All })).toHaveLength(6);
        expect(box.faces).toHaveLength(6);
        expect(box.getVertices({ select: Select.All })).toHaveLength(8);
    });

    test("the error names the selector that needs the record", () => {
        expect(() => new Box(1, 1, 1).getEdges({ select: Select.New })).toThrow(/Select\.NEW/);
        expect(() => new Box(1, 1, 1).getEdges({ select: Select.Last })).toThrow(/Select\.LAST/);
    });

    test("a sub-shape of a result is not itself the result of an operation", () => {
        let part = fusedPart();
        expect(part.getFaces({ select: Select.Last })).not.toHaveLength(0);
        expect(() => part.faces.first.getEdges({ select: Select.Last })).toThrow(InvalidShapeError);
    });

    test("a moved result does not carry the record of what made it", () => {
        let part = fusedPart();
        expect(() => part.moved(new Pos(1, 0, 0)).getFaces({ select: Select.Last })).toThrow(
            InvalidShapeError,
        );
        expect(() => part.translate([0, 0, 1]).getFaces({ select: Select.Last })).toThrow(
            InvalidShapeError,
        );
    });

    test("a clean leaves a record even where there was none", () => {
        let cleaned = Solid.makeBox(2, 2, 2).clean();
        expect(cleaned.getFaces({ select: Select.Last })).toHaveLength(6);
        expect(cleaned.getFaces({ select: Select.New })).toHaveLength(6);
    });
});
