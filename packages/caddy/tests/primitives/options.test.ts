import { beforeAll, expect, test } from "vite-plus/test";

import type { Shape } from "../../src/index.ts";

import { detectPrimitives, GeomType } from "../../src/index.ts";
import { meshFromAsset } from "./support.ts";

/** The `detect/plate-with-holes` mesh: 124 triangles over two cylindrical holes. */
const PLATE = "reference/build123d/fixtures/primitives/detect-plate-with-holes-1.brep";

let plate: Shape;

beforeAll(async () => {
    plate = await meshFromAsset(PLATE);
});

test("the sampling caps default to build123d's, which find both holes", () => {
    let defaults = detectPrimitives(plate).faces.filter(GeomType.Cylinder);
    let explicit = detectPrimitives(plate, {
        maxPairFaces: 64,
        maxIntersectionFaces: 64,
    }).faces.filter(GeomType.Cylinder);
    expect(defaults.length).toBe(2);
    expect(explicit.map(face => face.area)).toEqual(defaults.map(face => face.area));
});

test("sampling a region too thinly costs a cylinder, and leaves its faces over", () => {
    let thin = detectPrimitives(plate, { maxPairFaces: 8 });
    expect(thin.faces.filter(GeomType.Cylinder).length).toBe(1);
    expect(thin.leftovers.length).toBeGreaterThan(0);
    expect(detectPrimitives(plate).leftovers.length).toBe(0);
});
