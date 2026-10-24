import { describe, expect, test } from "vite-plus/test";

import { Box, Part } from "../../src/index.ts";

describe("meshing", () => {
    test("a shape with no faces meshes to an empty triangle soup", async () => {
        let empty = new Part([]);
        let mesh = await empty.tessellate(1e-3);
        expect(mesh.vertices).toEqual([]);
        expect(mesh.triangles).toEqual([]);
        expect((await empty.mesh(1e-3)).faces.length).toBe(0);
    });

    test("meshing returns a copy and leaves the original alone", async () => {
        let part = new Box(1, 1, 1);
        part.label = "block";
        let meshed = await part.mesh(1e-3);
        expect(meshed).not.toBe(part);
        expect(meshed).toBeInstanceOf(Box);
        expect(meshed.label).toBe("block");
    });

    test("every triangle index points at a vertex", async () => {
        let { vertices, triangles } = await new Box(2, 2, 2).tessellate(1e-3);
        expect(triangles.length).toBeGreaterThan(0);
        for (let corners of triangles) {
            for (let corner of corners) {
                expect(corner).toBeGreaterThanOrEqual(0);
                expect(corner).toBeLessThan(vertices.length);
            }
        }
    });
});
