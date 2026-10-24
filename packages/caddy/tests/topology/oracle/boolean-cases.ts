import { primitives } from "@roonieone/occt-native";
import { expect } from "vite-plus/test";

import type { OracleCases } from "./support.ts";

import {
    expectClose,
    fixtureBoolean,
    fixtureNumber,
    fixtureString,
    fixtureValue,
} from "../../../../../reference/build123d/oracle.ts";
import { MASS_TOLERANCE } from "../../../../../reference/build123d/tolerances.ts";
import { Pos } from "../../../src/geometry/index.ts";
import { booleanOperation } from "../../../src/topology/boolean.ts";
import { Compound, Face, Solid } from "../../../src/topology/index.ts";
import { box, cylinder } from "./shapes.ts";
import { expectMeasures, expectNames, expectPoint, expectShapeMetrics } from "./support.ts";

export const booleanCases: OracleCases = {
    "boolean/fuse-overlap": expected => {
        let fused = box().union(box().moved(new Pos(5, 0, 0)));
        expect(fused.constructor.name).toBe(fixtureString(expected, "class_name"));
        expectShapeMetrics(expected, "shape", fused);
    },
    "boolean/fuse-disjoint": expected => {
        let fused = box().union(box().moved(new Pos(30, 0, 0)));
        expect(fused.constructor.name).toBe(fixtureString(expected, "class_name"));
        expectShapeMetrics(expected, "shape", fused);
        expect(fused.topLevelShapes).toHaveLength(fixtureNumber(expected, "top_level_count"));
    },
    "boolean/fuse-many": expected => {
        let fused = box().fuse([box().moved(new Pos(5, 0, 0)), box().moved(new Pos(0, 4, 0))]);
        expect(fused.constructor.name).toBe(fixtureString(expected, "class_name"));
        expectShapeMetrics(expected, "shape", fused);
    },
    "boolean/cut-two-pieces": expected => {
        let tool = new Solid(primitives.makeBox(2, 6, 4)).moved(new Pos(4, 0, 0));
        let split = box().subtract(tool);
        expect(split.constructor.name).toBe(fixtureString(expected, "class_name"));
        expectShapeMetrics(expected, "shape", split);
        expectMeasures(
            expected,
            "piece_volumes",
            split.solids.map(piece => piece.volume).sort((first, second) => first - second),
        );
    },
    "boolean/cut-no-tools": expected => {
        let solid = box();
        let result = booleanOperation(solid, [solid], [], { kind: "cut" });
        expect(result.constructor.name).toBe(fixtureString(expected, "class_name"));
        expect(result.isSame(solid)).toBe(fixtureBoolean(expected, "same_as_input"));
        expectClose(expected, "volume", result.volume, MASS_TOLERANCE);
    },
    "boolean/cut-no-tools-many-args": expected => {
        let solid = box();
        let tool = cylinder().moved(new Pos(30, 0, 0));
        let result = booleanOperation(solid, [solid, tool], [], { kind: "cut" });
        expect(result.constructor.name).toBe(fixtureString(expected, "class_name"));
        expect(result.shapeType).toBe(fixtureString(expected, "shape_type"));
        expectClose(expected, "volume", result.volume, MASS_TOLERANCE);
        expect(result.solids).toHaveLength(fixtureNumber(expected, "solid_count"));
    },
    "boolean/fuse-no-args": expected => {
        let solid = box();
        let tool = cylinder().moved(new Pos(30, 0, 0));
        // build123d 0.13.0 crashes at args[0] before reaching its own empty-args fuse shortcut.
        // Caddy has a separate `base` argument, so the shortcut is actually reachable here.
        expect(fixtureString(expected, "raises")).toBe("IndexError");
        let result = booleanOperation(solid, [], [tool], { kind: "fuse" });
        expect(result.constructor.name).toBe("Solid");
        expect(result.isSame(tool)).toBe(true);
        expect(result.volume).toBeCloseTo(tool.volume);
    },
    "boolean/common-empty": expected => {
        let solid = box();
        let result = booleanOperation(solid, [solid], [], { kind: "common" });
        // build123d returns a null Solid, but Caddy has no null shape values and represents this
        // result as an empty Compound, as booleanOperation documents.
        expect(fixtureString(expected, "class_name")).toBe("Solid");
        expect(fixtureBoolean(expected, "is_null")).toBe(true);
        expect(result.constructor.name).toBe("Compound");
        expect(result.topLevelShapes).toHaveLength(0);
    },
    "boolean/fuse-faces": expected => {
        let left = Face.makeRect(10, 6);
        let right = Face.makeRect(10, 6).moved(new Pos(10, 0, 0));
        let fused = left.union(right);
        expect(fused.constructor.name).toBe(fixtureString(expected, "class_name"));
        expect(fused.shapeType).toBe(fixtureString(expected, "shape_type"));
        expectClose(expected, "area", fused.area, MASS_TOLERANCE);
        expect(fused.edges).toHaveLength(fixtureNumber(expected, "edge_count"));
    },
    "boolean/fuse-disjoint-faces": expected => {
        let left = Face.makeRect(10, 6);
        let right = Face.makeRect(10, 6).moved(new Pos(30, 0, 0));
        let fused = left.union(right);
        expect(fused.constructor.name).toBe(fixtureString(expected, "class_name"));
        expect(fused.shapeType).toBe(fixtureString(expected, "shape_type"));
        expectClose(expected, "area", fused.area, MASS_TOLERANCE);
        expect(fused.faces).toHaveLength(fixtureNumber(expected, "face_count"));
    },
    "boolean/intersect-solids": expected => {
        let common = box().intersect(box().moved(new Pos(5, 0, 0)));
        expect(common).toBeDefined();
        if (common === undefined) throw new Error("expected an intersection");
        expect(common.constructor.name).toBe(fixtureString(expected, "class_name"));
        expectShapeMetrics(expected, "shape", common);
    },
    "boolean/intersect-none": expected => {
        expect(fixtureValue(expected, "result")).toBeNull();
        expect(box().intersect(box().moved(new Pos(30, 0, 0)))).toBeUndefined();
    },
    "boolean/intersect-chain": expected => {
        let common = box().intersect(box().moved(new Pos(5, 0, 0)), box().moved(new Pos(0, 3, 0)));
        expect(common).toBeDefined();
        if (common === undefined) throw new Error("expected an intersection");
        expect(fixtureNumber(expected, "count")).toBe(1);
        expectNames(expected, "class_names", [common.constructor.name]);
        expectClose(expected, "volume", common.volume, MASS_TOLERANCE);
        expectPoint(expected, "center", common.center);
    },
    "boolean/intersect-compound": expected => {
        let group = new Compound([box(), box().moved(new Pos(30, 0, 0))]);
        let common = group.intersect(box().moved(new Pos(5, 0, 0)));
        expect(common.constructor.name).toBe(fixtureString(expected, "class_name"));
        expectClose(expected, "volume", common.volume, MASS_TOLERANCE);
        expect(common.solids).toHaveLength(fixtureNumber(expected, "solid_count"));
    },
    "boolean/clean": expected => {
        let fused = box().union(box().moved(new Pos(10, 0, 0)));
        expect(fused.faces).toHaveLength(fixtureNumber(expected, "face_count"));
        expect(fused.edges).toHaveLength(fixtureNumber(expected, "edge_count"));
        expectClose(expected, "volume", fused.volume, MASS_TOLERANCE);
        expect(fused.clean().faces).toHaveLength(fixtureNumber(expected, "cleaned_face_count"));
    },
};
