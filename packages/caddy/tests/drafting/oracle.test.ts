import { expect } from "vite-plus/test";

import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";
import type { ViewportOptions } from "../../src/drafting/viewport.ts";
import type { DXFAddShapeOptions, PageSize } from "../../src/io/index.ts";
import type { Edge } from "../../src/topology/index.ts";

import {
    expectClose,
    expectNumbersClose,
    expectVectorClose,
    fixtureRecord,
    fixtureString,
    fixtureValue,
    fixtureVector,
    oracleSuite,
} from "../../../../reference/build123d/oracle.ts";
import {
    EXACT_TOLERANCE,
    LINEAR_TOLERANCE,
    MASS_TOLERANCE,
} from "../../../../reference/build123d/tolerances.ts";
import { Color } from "../../src/geometry/index.ts";
import {
    ColorIndex,
    DotLength,
    ExportDXF,
    ExportSVG,
    LINETYPE_DEFS,
    LineType,
    Unit,
    PAGE_SIZES,
} from "../../src/io/index.ts";
import { fixtureShape } from "../io/metrics.ts";
import { expectDxfDocument } from "./dxf-expectations.ts";
import { expectSvgDocument } from "./svg-expectations.ts";

/** A fixture array of records, as case views the fixture accessors apply to. */
function fixtureList(source: FixtureCase, key: string): FixtureCase[] {
    let value = fixtureValue(source, key);
    if (!Array.isArray(value)) {
        throw new Error(`${source.name}/${key}: expected an array`);
    }
    return value.map((entry, index) => ({
        suite: source.suite,
        name: source.name,
        path: `${key}[${index}]`,
        data: entry as Record<string, unknown>,
    }));
}

function expectEdgesMatch(source: FixtureCase, key: string, edges: readonly Edge[]): void {
    let expected = fixtureList(source, key);
    expect(edges.length, `${key} count`).toBe(expected.length);
    for (let [index, entry] of expected.entries()) {
        let edge = edges[index];
        if (edge === undefined) throw new Error(`${key}[${index}] missing`);
        expect(edge.geomType, `${key}[${index}] geom type`).toBe(fixtureString(entry, "geom_type"));
        expectClose(entry, "length", edge.length, MASS_TOLERANCE);
        expectVectorClose(entry, "start", edge.startPoint().toTuple(), LINEAR_TOLERANCE);
        expectVectorClose(entry, "end", edge.endPoint().toTuple(), LINEAR_TOLERANCE);
    }
}

async function expectProjection(
    expected: FixtureCase,
    options: ViewportOptions = {},
): Promise<void> {
    let shape = await fixtureShape(expected);
    let [visible, hidden] = shape.projectToViewport(
        fixtureVector(expected, "viewport_origin"),
        options,
    );
    expectEdgesMatch(expected, "visible", visible);
    expectEdgesMatch(expected, "hidden", hidden);
}

async function expectSvg(expected: FixtureCase, exporter: ExportSVG): Promise<void> {
    exporter.addShape(await fixtureShape(expected));
    expectSvgDocument(expected, exporter.text());
}

async function expectDxf(
    expected: FixtureCase,
    exporter: ExportDXF,
    options: DXFAddShapeOptions = {},
): Promise<void> {
    exporter.addShape(await fixtureShape(expected), options);
    expectDxfDocument(expected, exporter.text());
}

oracleSuite("drafting", {
    "viewport/box": expected => expectProjection(expected),
    "viewport/cylinder": expected => expectProjection(expected),
    "viewport/box-with-hole": expected => expectProjection(expected),
    "viewport/sphere": expected => expectProjection(expected),
    "viewport/look-at": expected =>
        expectProjection(expected, { lookAt: [0, 0, 0], viewportUp: [0, 1, 0] }),
    "viewport/perspective": expected => expectProjection(expected, { focus: 50 }),

    "svg/plate": expected => expectSvg(expected, new ExportSVG({ lineWeight: 0.5 })),
    "svg/loose-edges": expected => expectSvg(expected, new ExportSVG()),
    "svg/circle": expected => expectSvg(expected, new ExportSVG()),
    "svg/dashed-layer": expected =>
        expectSvg(
            expected,
            new ExportSVG({
                unit: Unit.Inch,
                scale: 2,
                margin: 1,
                fillColor: new Color(0.5, 0.25, 0.125, 0.5),
                lineColor: new Color(0, 0, 1),
                lineWeight: 0.6,
                lineType: LineType.DashDot,
                dotLength: DotLength.QcadImperial,
            }),
        ),

    "dxf/plate": expected => expectDxf(expected, new ExportDXF({ lineWeight: 0.5 })),
    "dxf/loose-edges": expected => expectDxf(expected, new ExportDXF()),
    "dxf/layers": expected => {
        let exporter = new ExportDXF({ unit: Unit.Inch });
        exporter.addLayer("outline", {
            color: ColorIndex.Red,
            lineWeight: 0.7,
            lineType: LineType.Dashed,
        });
        return expectDxf(expected, exporter, { layer: "outline" });
    },

    "tables/line-types": expected => {
        let wanted = fixtureRecord(expected, "line_types");
        expect(Object.keys(LINETYPE_DEFS).sort()).toEqual(Object.keys(wanted.data).sort());
        for (let name of Object.keys(wanted.data)) {
            let entry = fixtureRecord(wanted, name);
            let definition = LINETYPE_DEFS[name as LineType];
            expect(definition?.description, `${name} description`).toBe(
                fixtureString(entry, "description"),
            );
            expectNumbersClose(entry, "pattern", [...(definition?.pattern ?? [])], EXACT_TOLERANCE);
        }
    },

    "tables/page-sizes": expected => {
        let wanted = fixtureRecord(expected, "page_sizes");
        expect(Object.keys(PAGE_SIZES).sort()).toEqual(Object.keys(wanted.data).sort());
        for (let name of Object.keys(wanted.data)) {
            expectNumbersClose(
                wanted,
                name,
                [...(PAGE_SIZES[name as PageSize] ?? [])],
                EXACT_TOLERANCE,
            );
        }
    },
});
