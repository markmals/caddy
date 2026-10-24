import { expect } from "vite-plus/test";

import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";
import type { DraftOptions } from "../../src/drafting/index.ts";
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
    TEST_FONT_NAME,
    TEST_FONT_PATH,
} from "../../../../reference/build123d/oracle.ts";
import {
    EXACT_TOLERANCE,
    LINEAR_TOLERANCE,
    MASS_TOLERANCE,
} from "../../../../reference/build123d/tolerances.ts";
import {
    Arrow,
    ArrowHead,
    DimensionLine,
    Draft,
    ExtensionLine,
    HeadType,
    NumberDisplay,
    processPath,
    sketchLocation,
    TechnicalDrawing,
} from "../../src/drafting/index.ts";
import { Color, Location, Plane } from "../../src/geometry/index.ts";
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
import { BallJoint, RigidJoint } from "../../src/joints/index.ts";
import { Box } from "../../src/parts/index.ts";
import { Rectangle } from "../../src/sketch/index.ts";
import { Compound, Edge as EdgeClass, Wire } from "../../src/topology/index.ts";
import { expectLocation } from "../geometry/oracle/support.ts";
import { fixtureShape } from "../io/metrics.ts";
import { expectShapeMetrics } from "../topology/oracle/support.ts";
import { expectDxfDocument } from "./dxf-expectations.ts";
import { expectSvgDocument } from "./svg-expectations.ts";

/** Labels render from the repository's font file, so a fixture holds no system-font geometry. */
function testDraft(options: DraftOptions = {}): Draft {
    return new Draft({ font: TEST_FONT_NAME, fontPath: TEST_FONT_PATH, ...options });
}

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
        expectVectorClose(entry, "start", edge.startPoint.toTuple(), LINEAR_TOLERANCE);
        expectVectorClose(entry, "end", edge.endPoint.toTuple(), LINEAR_TOLERANCE);
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
    expectSvgDocument(expected, exporter.text);
}

async function expectDxf(
    expected: FixtureCase,
    exporter: ExportDXF,
    options: DXFAddShapeOptions = {},
): Promise<void> {
    exporter.addShape(await fixtureShape(expected), options);
    expectDxfDocument(expected, exporter.text);
}

/** A dimension line between two points, with the length it reports. */
function expectDimension(
    expected: FixtureCase,
    start: [number, number, number],
    end: [number, number, number],
): void {
    let line = new DimensionLine([start, end], testDraft());
    expectShapeMetrics(expected, "shape", line);
    expectClose(expected, "dimension", line.measurement, LINEAR_TOLERANCE);
}

/** An extension line from the origin to `end`, offset by a distance or a displacement. */
function expectExtension(
    expected: FixtureCase,
    end: [number, number, number],
    offset: number | [number, number, number],
): void {
    let line = new ExtensionLine([[0, 0, 0], end], offset, testDraft());
    expectShapeMetrics(expected, "shape", line);
    expectClose(expected, "dimension", line.measurement, LINEAR_TOLERANCE);
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

    "arrowhead/curved": expected => expectShapeMetrics(expected, "shape", new ArrowHead(6)),
    "arrowhead/straight": expected =>
        expectShapeMetrics(expected, "shape", new ArrowHead(6, { headType: HeadType.Straight })),
    "arrowhead/filleted": expected =>
        expectShapeMetrics(expected, "shape", new ArrowHead(6, { headType: HeadType.Filleted })),
    "arrowhead/rotated": expected =>
        expectShapeMetrics(expected, "shape", new ArrowHead(4, { rotation: 30 })),

    "arrow/head-at-start": expected =>
        expectShapeMetrics(
            expected,
            "shape",
            new Arrow(4, EdgeClass.makeLine([0, 0, 0], [30, 0, 0]), 0.6),
        ),
    "arrow/head-at-end": expected =>
        expectShapeMetrics(
            expected,
            "shape",
            new Arrow(4, EdgeClass.makeLine([0, 0, 0], [30, 0, 0]), 0.6, {
                headAtStart: false,
                headType: HeadType.Straight,
            }),
        ),
    "arrow/curved-shaft": expected =>
        expectShapeMetrics(
            expected,
            "shape",
            new Arrow(4, EdgeClass.makeCircle(20, { startAngle: 0, endAngle: 60 }), 0.5),
        ),

    "draft/numbers": expected => {
        let metric = new Draft();
        let imperial = new Draft({ unit: Unit.Inch });
        let fractional = new Draft({
            unit: Unit.Inch,
            numberDisplay: NumberDisplay.Fraction,
        });
        let coarse = new Draft({
            unit: Unit.Inch,
            numberDisplay: NumberDisplay.Fraction,
            fractionalPrecision: 8,
        });
        let whole = new Draft({ decimalPrecision: 0 });

        let metrics = fixtureRecord(expected, "metric");
        expect(metric.numberWithUnits(25.4)).toBe(fixtureString(metrics, "plain"));
        expect(metric.numberWithUnits(25.4, { displayUnits: false })).toBe(
            fixtureString(metrics, "hidden_units"),
        );
        expect(metric.numberWithUnits(25.4, { tolerance: 0.1 })).toBe(
            fixtureString(metrics, "symmetric_tolerance"),
        );
        expect(metric.numberWithUnits(25.4, { tolerance: [0.1, 0.25] })).toBe(
            fixtureString(metrics, "asymmetric_tolerance"),
        );
        expect(metric.numberWithUnits(25.4, { tolerance: 0.1, displayUnits: true })).toBe(
            fixtureString(metrics, "forced_units"),
        );
        expect(new Draft({ unit: Unit.Centimeter }).numberWithUnits(25.4)).toBe(
            fixtureString(metrics, "centimeters"),
        );

        let inches = fixtureRecord(expected, "imperial");
        expect(imperial.numberWithUnits(25.4)).toBe(fixtureString(inches, "plain"));
        expect(fractional.numberWithUnits(1.5 * 25.4)).toBe(fixtureString(inches, "fraction_half"));
        expect(fractional.numberWithUnits(0.25 * 25.4)).toBe(
            fixtureString(inches, "fraction_only"),
        );
        expect(fractional.numberWithUnits((1 / 64) * 25.4)).toBe(
            fixtureString(inches, "fraction_sixty_fourth"),
        );
        expect(coarse.numberWithUnits(0.3 * 25.4)).toBe(fixtureString(inches, "fraction_coarse"));
        expect(fractional.numberWithUnits(1.5 * 25.4, { tolerance: 0.01 })).toBe(
            fixtureString(inches, "fraction_tolerance"),
        );

        let rounding = fixtureRecord(expected, "rounding");
        expect(whole.roundToText(2.5)).toBe(fixtureString(rounding, "tie_down"));
        expect(whole.roundToText(3.5)).toBe(fixtureString(rounding, "tie_up"));
        expect(whole.roundToText(-0.4)).toBe(fixtureString(rounding, "negative_zero"));
        expect(metric.roundToText(-0.001)).toBe(fixtureString(rounding, "signed_zero_decimals"));
        expect(metric.roundToText(0.125)).toBe(fixtureString(rounding, "binary_tie"));
        expect(metric.roundToText(0.375)).toBe(fixtureString(rounding, "binary_tie_up"));

        let metricFlags = fixtureRecord(expected, "is_metric");
        let units: Record<string, Unit> = {
            MC: Unit.Micrometer,
            MM: Unit.Millimeter,
            CM: Unit.Centimeter,
            M: Unit.Meter,
            IN: Unit.Inch,
            FT: Unit.Foot,
        };
        for (let [name, unit] of Object.entries(units)) {
            expect(new Draft({ unit }).isMetric, name).toBe(fixtureValue(metricFlags, name));
        }
    },

    "draft/labels": expected => {
        let settings = new Draft();
        let line = new Wire([EdgeClass.makeLine([0, 0, 0], [42.5, 0, 0])]);
        let arc = new Wire([EdgeClass.makeCircle(20, { startAngle: 0, endAngle: 72 })]);
        expect(settings.labelFor(line)).toBe(fixtureString(expected, "length"));
        expect(settings.labelFor(line, { label: "WIDTH" })).toBe(fixtureString(expected, "given"));
        expect(settings.labelFor(arc, { labelAngle: true })).toBe(fixtureString(expected, "angle"));
        expect(settings.labelFor(line, { tolerance: [0.1, 0.25] })).toBe(
            fixtureString(expected, "tolerance"),
        );
    },

    "draft/paths": expected => {
        let twoPoints = processPath([
            [0, 0, 0],
            [10, 5, 0],
        ]);
        let threePoints = processPath([
            [0, 0, 0],
            [10, 0, 0],
            [10, 8, 0],
        ]);
        let edge = EdgeClass.makeLine([0, 0, 0], [3, 4, 0]);
        expectShapeMetrics(expected, "two_points", twoPoints);
        expectShapeMetrics(expected, "three_points", threePoints);
        expect(processPath(edge) === edge, "passthrough").toBe(
            fixtureValue(expected, "passthrough"),
        );
        expectLocation(expected, "start", sketchLocation(twoPoints, 0));
        expectLocation(expected, "middle", sketchLocation(twoPoints, 0.5));
        expectLocation(expected, "flipped_end", sketchLocation(twoPoints, 1, true));
    },

    "dimension/inside": expected => expectDimension(expected, [0, 0, 0], [100, 0, 0]),
    "dimension/outside": expected => expectDimension(expected, [0, 0, 0], [6, 0, 0]),
    "dimension/one-arrow": expected => {
        let line = new DimensionLine(
            [
                [0, 0, 0],
                [80, 0, 0],
            ],
            testDraft(),
            { arrows: [true, false] },
        );
        expectShapeMetrics(expected, "shape", line);
        expectClose(expected, "dimension", line.measurement, LINEAR_TOLERANCE);
    },
    "dimension/label-and-tolerance": expected => {
        let path: [number, number, number][] = [
            [0, 0, 0],
            [90, 0, 0],
        ];
        expectShapeMetrics(
            expected,
            "labelled",
            new DimensionLine(path, testDraft(), { label: "WIDTH" }),
        );
        expectShapeMetrics(
            expected,
            "toleranced",
            new DimensionLine(path, testDraft(), { tolerance: [0.1, 0.25] }),
        );
    },
    "dimension/angle": expected => {
        let line = new DimensionLine(
            EdgeClass.makeCircle(40, { startAngle: 0, endAngle: 72 }),
            testDraft(),
            { labelAngle: true },
        );
        expectShapeMetrics(expected, "shape", line);
        expectClose(expected, "dimension", line.measurement, LINEAR_TOLERANCE);
    },
    "dimension/avoids-sketch": expected => {
        let line = new DimensionLine(
            [
                [-40, 0, 0],
                [40, 0, 0],
            ],
            testDraft(),
            { sketch: new Rectangle(30, 30) },
        );
        expectShapeMetrics(expected, "shape", line);
        expectClose(expected, "dimension", line.measurement, LINEAR_TOLERANCE);
    },

    "extension/scalar-offset": expected => expectExtension(expected, [60, 0, 0], 20),
    "extension/negative-offset": expected => expectExtension(expected, [60, 0, 0], -20),
    "extension/vector-offset": expected => expectExtension(expected, [40, 30, 0], [0, -25, 0]),
    "extension/measurement-direction": expected => {
        let line = new ExtensionLine(
            [
                [0, 0, 0],
                [40, 30, 0],
            ],
            15,
            testDraft(),
            { measurementDirection: [1, 0, 0] },
        );
        expectShapeMetrics(expected, "shape", line);
        expectClose(expected, "dimension", line.measurement, LINEAR_TOLERANCE);
    },

    "technical/a4": expected =>
        expectShapeMetrics(
            expected,
            "shape",
            new TechnicalDrawing({
                designDate: "2024-05-17",
                sheetNumber: 3,
                drawingScale: 2.5,
                fontPath: TEST_FONT_PATH,
            }),
        ),

    "triad/axes": expected => expectShapeMetrics(expected, "shape", Compound.makeTriad(12)),

    "symbol/rigid-joint": expected => {
        let joint = new RigidJoint("corner", new Box(30, 20, 10), {
            jointLocation: Location.fromOrientation([5, 4, 3], [0, 0, 30]),
        });
        expectShapeMetrics(expected, "shape", joint.symbol);
        expectLocation(expected, "location", joint.location);
    },
    "symbol/ball-joint": expected => {
        let joint = new BallJoint("socket", new Box(30, 20, 10), {
            jointLocation: Location.fromPosition([2, 1, 0]),
            angleReference: Plane.XZ,
        });
        expectShapeMetrics(expected, "shape", joint.symbol);
        expectLocation(expected, "location", joint.location);
    },
});
