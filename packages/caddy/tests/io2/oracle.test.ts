import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vite-plus/test";

import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";
import type { ImportSvgOptions } from "../../src/io/import2d/index.ts";

import {
    fixtureNumber,
    fixtureRecord,
    fixtureString,
    fixtureValue,
    oracleSuite,
} from "../../../../reference/build123d/oracle.ts";
import { APPROXIMATION_TOLERANCE } from "../../../../reference/build123d/tolerances.ts";
import { Align, Color } from "../../src/geometry/index.ts";
import { importDxfText, importSvgText } from "../../src/io/import2d/index.ts";
import { Unit } from "../../src/io/index.ts";
import { Mesher, MeshType } from "../../src/mesh/index.ts";
import { Solid } from "../../src/topology/index.ts";
import { COLOR_TOLERANCE, expectImported, fixtureList } from "./metrics.ts";

/**
 * A mesh is rebuilt from vertices the mesher has already rounded to six decimals and that
 * build123d's file stores as 32-bit floats on top of that, so the short edges of a facet inherit
 * a few microns of slack.
 */
const MESH_TOLERANCE = 1e-5;

function expectSvg(expected: FixtureCase, options: ImportSvgOptions = {}): void {
    expectImported(expected, [...importSvgText(fixtureString(expected, "source"), options)]);
}

async function inTempDirectory<T>(body: (directory: string) => Promise<T>): Promise<T> {
    let directory = await mkdtemp(join(tmpdir(), "caddy-3mf-"));
    try {
        return await body(directory);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

/** The shapes the mesher cases mesh: a labelled, coloured box and a coarse cylinder beside it. */
function mesherShapes(): [Solid, Solid] {
    let box = Solid.makeBox(10, 10, 10);
    box.label = "box";
    box.color = new Color(1, 0, 0, 0.5);
    let cylinder = Solid.makeCylinder(2, 5).translate([20, 0, 0]);
    cylinder.label = "cylinder";
    return [box, cylinder];
}

function expectMeshCounts(expected: FixtureCase, mesher: Mesher): void {
    expect(mesher.vertexCounts, "vertex counts").toEqual(fixtureValue(expected, "vertex_counts"));
    expect(mesher.triangleCounts, "triangle counts").toEqual(
        fixtureValue(expected, "triangle_counts"),
    );
}

function expectProperties(expected: FixtureCase, mesher: Mesher): void {
    let records = fixtureList(expected, "properties");
    let properties = mesher.meshProperties;
    expect(properties.length, "mesh count").toBe(records.length);
    for (let [index, record] of records.entries()) {
        let property = properties[index];
        expect(property?.name, `mesh ${index} name`).toBe(fixtureString(record, "name"));
        expect(property?.partNumber, `mesh ${index} part number`).toBe(
            fixtureString(record, "part_number"),
        );
        expect(property?.type, `mesh ${index} type`).toBe(fixtureString(record, "type"));
    }
}

function expectMetaData(expected: FixtureCase, mesher: Mesher): void {
    let records = fixtureList(expected, "meta_data");
    let entries = mesher.metaData;
    expect(entries.length, "metadata count").toBe(records.length);
    for (let [index, record] of records.entries()) {
        let entry = entries[index];
        expect(entry?.nameSpace, `metadata ${index} namespace`).toBe(
            fixtureString(record, "name_space"),
        );
        expect(entry?.name, `metadata ${index} name`).toBe(fixtureString(record, "name"));
        expect(entry?.type, `metadata ${index} type`).toBe(fixtureString(record, "type"));
        expect(entry?.value, `metadata ${index} value`).toBe(fixtureString(record, "value"));
    }
}

oracleSuite("imports", {
    "svg/basic": expected => expectSvg(expected),
    "svg/paths": expected => expectSvg(expected),
    "svg/arcs": expected => expectSvg(expected),
    "svg/nested": expected => expectSvg(expected),
    "svg/groups": expected => expectSvg(expected),
    "svg/groups-ignore-visibility": expected => expectSvg(expected, { ignoreVisibility: true }),
    "svg/groups-inkscape-labels": expected => expectSvg(expected, { labelBy: "inkscape:label" }),
    "svg/groups-no-flip": expected => expectSvg(expected, { flipY: false }),
    "svg/groups-align-none": expected => expectSvg(expected, { align: null }),
    "svg/groups-align-center": expected =>
        expectSvg(expected, { align: [Align.Center, Align.Center] }),
    "svg/styles": expected => expectSvg(expected),
    "svg/viewport": expected => expectSvg(expected),
    "svg/unfillable": expected => expectSvg(expected),

    "dxf/entities": expected => {
        expectImported(expected, [...importDxfText(fixtureString(expected, "source"))], {
            tolerance: APPROXIMATION_TOLERANCE,
        });
    },

    "mesher/round-trip": async expected => {
        let [box, cylinder] = mesherShapes();
        let writer = new Mesher({ unit: Unit.Millimeter });
        await writer.addShape(box);
        await writer.addShape(cylinder, {
            linearDeflection: 0.1,
            meshType: MeshType.Support,
            partNumber: "P-7",
        });
        writer.addMetaData("caddy", "note", "hello", "str", { mustPreserve: true });
        expectMeshCounts(expected, writer);
        expect(writer.meshCount, "mesh count").toBe(fixtureNumber(expected, "mesh_count"));

        let shapes = await inTempDirectory(async directory => {
            let path = join(directory, "model.3mf");
            await writer.write(path);
            let reader = new Mesher();
            let read = await reader.read(path);
            expectProperties(expected, reader);
            expectMetaData(expected, reader);
            expect(reader.modelUnit, "unit").toBe(Unit.Millimeter);
            return read;
        });
        expectImported(expected, shapes, {
            tolerance: MESH_TOLERANCE,
            colorTolerance: COLOR_TOLERANCE,
        });
    },

    "mesher/read-package": async expected => {
        let bytes = Buffer.from(fixtureString(expected, "package"), "base64");
        let mesher = new Mesher();
        let shapes = await mesher.read(bytes);
        expect(mesher.modelUnit, "unit").toBe(Unit.Inch);
        expectMeshCounts(expected, mesher);
        expectProperties(expected, mesher);
        expectMetaData(expected, mesher);
        expectImported(expected, shapes, { colorTolerance: COLOR_TOLERANCE });
    },

    "mesher/units": async expected => {
        let units = fixtureRecord(expected, "units");
        let names: Readonly<Record<string, Unit>> = {
            MC: Unit.Micrometer,
            MM: Unit.Millimeter,
            CM: Unit.Centimeter,
            M: Unit.Meter,
            IN: Unit.Inch,
            FT: Unit.Foot,
        };
        await inTempDirectory(async directory => {
            for (let [name, unit] of Object.entries(names)) {
                let writer = new Mesher({ unit });
                await writer.addShape(Solid.makeBox(1, 1, 1));
                let path = join(directory, `${name}.3mf`);
                await writer.write(path);
                let reader = new Mesher();
                await reader.read(path);
                expect(names[fixtureString(units, name)], `${name} unit`).toBe(reader.modelUnit);
            }
        });
    },
});
