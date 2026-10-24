import { mesh } from "@roonieone/occt-native";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vite-plus/test";

import {
    expectClose,
    expectNumbersClose,
    expectVectorClose,
    fixtureNumber,
    fixtureRecord,
    fixtureString,
    fixtureValue,
} from "../../../../reference/build123d/oracle.ts";
import { oracleSuite } from "../../../../reference/build123d/oracle.ts";
import { LINEAR_TOLERANCE, MASS_TOLERANCE } from "../../../../reference/build123d/tolerances.ts";
import { Color } from "../../src/geometry/color.ts";
import { CADFileType, exportCAD, importCAD, serialize } from "../../src/io/index.ts";
import { expectShapeMetrics } from "../shape-metrics.ts";
import { fixtureShape } from "./metrics.ts";

/** STEP stores colour channels as 8-bit sRGB, so a round trip is only good to ~1/255. */
const COLOR_TOLERANCE = 0.004;

async function inTempDirectory<T>(body: (directory: string) => Promise<T>): Promise<T> {
    let directory = await mkdtemp(join(tmpdir(), "caddy-io-"));
    try {
        return await body(directory);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

oracleSuite("io", {
    "step/round-trip": async expected => {
        let shape = await fixtureShape(expected);
        shape.label = fixtureString(expected, "label");
        shape.color = Color.fromTuple(fixtureValue(expected, "color") as number[]);

        let imported = await inTempDirectory(async directory => {
            let name = join(directory, "part.step");
            await exportCAD(shape, { name, type: CADFileType.Step });
            return importCAD(name);
        });

        expect(imported.label).toBe(fixtureString(expected, "imported_label"));
        expect(imported.color).toBeDefined();
        expectNumbersClose(
            expected,
            "imported_color",
            imported.color?.toTuple() ?? [],
            COLOR_TOLERANCE,
        );
        expectShapeMetrics(expected, imported);
    },

    "step/unnamed-solid": async expected => {
        let shape = await fixtureShape(expected);
        let bytes = await serialize(shape, { type: CADFileType.Step });
        let imported = await importCAD(bytes, { type: CADFileType.Step });
        expectShapeMetrics(expected, imported);
    },

    "brep/round-trip": async expected => {
        let shape = await fixtureShape(expected);
        let imported = await inTempDirectory(async directory => {
            let name = join(directory, "part.brep");
            await exportCAD(shape, { name, type: CADFileType.Brep });
            return importCAD(name);
        });
        expectShapeMetrics(expected, imported);
    },

    "stl/round-trip": async expected => {
        let shape = await fixtureShape(expected);
        let bytes = await serialize(shape, {
            type: CADFileType.Stl,
            tolerance: fixtureNumber(expected, "tolerance"),
            angularTolerance: fixtureNumber(expected, "angular_tolerance"),
        });
        let imported = await importCAD(bytes, { type: CADFileType.Stl });

        expect(imported.constructor.name).toBe(fixtureString(expected, "class_name"));
        expectClose(expected, "area", imported.area, MASS_TOLERANCE);
        let bounds = imported.boundingBox();
        let expectedBounds = fixtureRecord(expected, "bounding_box");
        expectVectorClose(expectedBounds, "min", bounds.min.toTuple(), LINEAR_TOLERANCE);
        expectVectorClose(expectedBounds, "max", bounds.max.toTuple(), LINEAR_TOLERANCE);
    },

    "tessellate/box": async expected => {
        let shape = await fixtureShape(expected);
        let triangles = await mesh.tessellate(shape.wrapped, {
            tolerance: fixtureNumber(expected, "tolerance"),
            angularTolerance: fixtureNumber(expected, "angular_tolerance"),
        });

        expect(triangles.positions.length / 3).toBe(fixtureNumber(expected, "vertex_count"));
        expect(triangles.indices.length / 3).toBe(fixtureNumber(expected, "triangle_count"));
        let axis = (offset: number): number[] =>
            [...triangles.positions].filter((_, index) => index % 3 === offset);
        let expectedBounds = fixtureRecord(expected, "bounding_box");
        expectVectorClose(
            expectedBounds,
            "min",
            [0, 1, 2].map(offset => Math.min(...axis(offset))),
            LINEAR_TOLERANCE,
        );
        expectVectorClose(
            expectedBounds,
            "max",
            [0, 1, 2].map(offset => Math.max(...axis(offset))),
            LINEAR_TOLERANCE,
        );
    },
});
