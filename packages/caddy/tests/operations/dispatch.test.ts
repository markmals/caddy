/**
 * build123d's `fillet`/`chamfer` are single entry points that dispatch on the dimension of the
 * selection: Edges round a solid, Vertices round the corners of a sketch or of a wire.
 */

import { expect, test } from "vite-plus/test";

import { chamfer, fillet } from "../../src/operations/index.ts";
import { Box } from "../../src/parts/index.ts";
import { Rectangle } from "../../src/sketch/index.ts";
import { Part, Sketch } from "../../src/topology/index.ts";

test("selected vertices round the corners of a sketch", () => {
    let square = new Rectangle(10, 10);
    let rounded = fillet(square.vertices(), 2);
    expect(rounded).toBeInstanceOf(Sketch);
    expect(rounded.area).toBeCloseTo(100 - 4 * (4 - Math.PI), 6);
});

test("selected vertices cut the corners of a sketch", () => {
    let square = new Rectangle(10, 10);
    let cut = chamfer(square.vertices(), 2);
    expect(cut).toBeInstanceOf(Sketch);
    expect(cut.area).toBeCloseTo(100 - 4 * 2, 6);
});

test("selected edges still round a solid", () => {
    let box = new Box(10, 8, 6);
    let rounded = fillet(box.edges(), 1);
    expect(rounded).toBeInstanceOf(Part);
    expect(rounded.volume).toBeLessThan(480);
});
