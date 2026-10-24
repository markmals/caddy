/**
 * Caddy-side material behaviour the oracle cannot record: how a material reaches a sub-shape,
 * what a copy carries, and the two places Caddy deliberately differs from bd_materials.
 */

import { describe, expect, test } from "vite-plus/test";

import {
    ALL_MATERIALS,
    Box,
    canonicalName,
    catalogMaterial,
    Compound,
    finishes,
    isNotSuitable,
    MATERIAL_FAMILIES,
    materialFactory,
    materialNames,
    NOT_SUITABLE,
    Pos,
    Range,
    resolveMaterial,
    withDensity,
} from "../../src/index.ts";

describe("the catalog", () => {
    test("every material is reachable by its own name, and no family shadows a grade", () => {
        let grades = new Set(ALL_MATERIALS.map(material => material.name.toLowerCase()));
        for (let material of ALL_MATERIALS) {
            expect(canonicalName(resolveMaterial(material.name))).toBe(material.name);
        }
        for (let family of Object.keys(MATERIAL_FAMILIES)) {
            expect(grades.has(family), `${family} shadows a grade name`).toBe(false);
        }
        expect(materialNames().length).toBe(grades.size + Object.keys(MATERIAL_FAMILIES).length);
    });

    test("a property that does not apply is marked, not missing", () => {
        let tpu = catalogMaterial("tpu_shore_95a");
        expect(tpu.yieldStrength).toBeDefined();
        expect(isNotSuitable(tpu.yieldStrength!)).toBe(true);
        expect(isNotSuitable(NOT_SUITABLE)).toBe(true);
        expect(isNotSuitable(new Range(1, 2))).toBe(false);
    });

    test("a density override copies the grade instead of changing it", () => {
        let brass = catalogMaterial("brass");
        let lighter = withDensity(brass, 1234);
        expect(lighter.density).toBe(1234);
        expect(brass.density).not.toBe(1234);
        expect(withDensity(brass, undefined)).toBe(brass);
    });

    test("every lookup builds its own finished material, so per-part tweaks stay put", () => {
        let first = resolveMaterial("brass");
        let second = resolveMaterial("brass");
        expect(first).not.toBe(second);
        first.scale = [2, 2];
        expect(second.scale).toEqual([1, 1]);
        expect(first.material).toBe(second.material);
    });

    test("the plating verbs Caddy cannot colour leave the colour unset", () => {
        // bd_materials defaults both to its "clear" palette entry — the bright natural
        // plating — which is a PBR hint rather than a colour, and the PBR layer is not ported.
        expect(finishes.zincPlate().color).toBeUndefined();
        expect(finishes.pvd().color).toBeUndefined();
        expect(finishes.silkscreen().color?.toTuple()).toEqual([0, 0, 0, 1]);
    });
});

describe("a shape's material", () => {
    test("a sub-shape takes the nearest material along its topoPath", () => {
        let compound = new Compound([new Box(10, 10, 10).solid]);
        compound.material = "brass";
        let solid = compound.solids[0]!;
        expect(canonicalName(solid.material!)).toBe("Brass_C360_HALF_HARD");
        expect(solid.material).toBe(compound.material);

        let face = solid.faces[0]!;
        expect(face.material).toBe(compound.material);
    });

    test("a material of its own wins over the one it would inherit", () => {
        let compound = new Compound([new Box(10, 10, 10).solid]);
        compound.material = "brass";
        let solid = compound.solids[0]!;
        solid.material = "walnut";
        expect(canonicalName(solid.material!)).toBe("Hardwood_WALNUT");
        expect(canonicalName(compound.material!)).toBe("Brass_C360_HALF_HARD");
    });

    test("nothing is inherited when no ancestor has a material", () => {
        let compound = new Compound([new Box(10, 10, 10).solid]);
        expect(compound.solids[0]!.material).toBeUndefined();
    });

    test("a moved copy keeps the material, and only its own", () => {
        let box = new Box(10, 20, 30);
        box.material = materialFactory("brass")({ density: 1234 });
        let moved = box.moved(new Pos(5, 0, 0));
        expect(moved.material?.material.density).toBe(1234);
        expect(moved.mass).toBeCloseTo(box.mass, 9);

        let plain = new Box(1, 1, 1);
        expect(plain.located(new Pos(1, 0, 0)).material).toBeUndefined();
    });
});
