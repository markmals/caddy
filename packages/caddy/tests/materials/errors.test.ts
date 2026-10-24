import { describe, expect, test } from "vite-plus/test";

import type { Material } from "../../src/index.ts";

import {
    Box,
    canonicalName,
    catalogMaterial,
    Compound,
    finishes,
    FinishedMaterial,
    materialFactory,
    MaterialError,
    processes,
    Range,
    resolveMaterial,
} from "../../src/index.ts";

describe("material lookup", () => {
    test("an unknown name is rejected wherever it is given", () => {
        expect(() => resolveMaterial("unobtainium")).toThrow(MaterialError);
        expect(() => catalogMaterial("unobtainium")).toThrow(MaterialError);
        expect(() => materialFactory("unobtainium")).toThrow(MaterialError);
        expect(() => resolveMaterial("unobtainium")).toThrow(/materialNames\(\)/);
    });

    test("anything that is not a material is rejected", () => {
        let box = new Box(1, 1, 1);
        expect(() => {
            box.material = 42 as unknown as string;
        }).toThrow(MaterialError);
        expect(() => {
            box.material = { density: 1 } as unknown as Material;
        }).toThrow(MaterialError);
        expect(() => resolveMaterial(null as unknown as Material)).toThrow(MaterialError);
    });

    test("a material outside the catalog has no name to round trip through", () => {
        let custom: Material = {
            name: "myalloy",
            category: "metal",
            family: "metal",
            transparent: false,
            density: 1234,
        };
        expect(() => canonicalName(custom)).toThrow(MaterialError);
        expect(() => canonicalName(new FinishedMaterial(custom))).toThrow(MaterialError);
        expect(canonicalName(resolveMaterial("brass"))).toBe("Brass_C360_HALF_HARD");
    });
});

describe("mass without a density", () => {
    test("a solid with no material cannot be weighed", () => {
        let box = new Box(10, 20, 30);
        expect(() => box.mass).toThrow(MaterialError);
        expect(() => box.computeMass()).toThrow(/density is missing/);
    });

    test("clearing a material takes the density away again", () => {
        let box = new Box(10, 20, 30);
        box.material = "brass";
        expect(box.mass).toBeCloseTo(51, 9);
        box.material = undefined;
        expect(() => box.mass).toThrow(MaterialError);
    });

    test("a compound of solids with no material cannot be weighed either", () => {
        let compound = new Compound([new Box(1, 1, 1).solid]);
        expect(() => compound.mass).toThrow(MaterialError);
    });
});

describe("material values", () => {
    test("an inverted range is rejected", () => {
        expect(() => new Range(10, 5)).toThrow(MaterialError);
        expect(new Range(5, 5).valueAt(0.5)).toBe(5);
    });

    test("a finish and a process cannot both describe one surface", () => {
        expect(
            () =>
                new FinishedMaterial(catalogMaterial("brass"), {
                    finish: finishes.brushed(),
                    process: processes.machined(),
                }),
        ).toThrow(MaterialError);
    });
});
