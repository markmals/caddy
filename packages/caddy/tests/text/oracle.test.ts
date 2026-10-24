import { basename } from "node:path";
import { expect } from "vite-plus/test";

import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";
import type { Shape } from "../../src/index.ts";

import {
    expectClose,
    expectNumbersClose,
    fixtureValue,
    oracleSuite,
    TEST_FONT_PATH,
} from "../../../../reference/build123d/oracle.ts";
import {
    APPROXIMATION_TOLERANCE,
    MASS_TOLERANCE,
} from "../../../../reference/build123d/tolerances.ts";
import {
    Align,
    availableFonts,
    Compound,
    Edge,
    FontManager,
    FontStyle,
    Text,
    TextAlign,
} from "../../src/index.ts";
import { expectShapeMetrics } from "../shape-metrics.ts";

/** The alias both libraries register for the single-stroke font they bundle. */
const SINGLE_LINE_FONT = "singleline";

/** Metrics plus the edge lengths the oracle records for rendered text. */
function expectText(expected: FixtureCase, shape: Shape): void {
    expectShapeMetrics(expected, shape);
    expectClose(expected, "area", shape.area, MASS_TOLERANCE);
    expectNumbersClose(
        expected,
        "edge_lengths",
        shape.edges.map(edge => edge.length).sort((left, right) => left - right),
        APPROXIMATION_TOLERANCE,
    );
}

function expectValue(expected: FixtureCase, key: string, actual: unknown): void {
    expect(actual, key).toEqual(fixtureValue(expected, key));
}

/** An arc the path cases bend text along. */
function arcPath(): Edge {
    return Edge.makeCircle(30, { startAngle: 20, endAngle: 160 });
}

oracleSuite("text", {
    // Font resolution
    "font/resolve-path": expected => {
        let font = Compound.resolveFont({ font: "Arial", fontPath: TEST_FONT_PATH });
        expectValue(expected, "name", font.name);
        expectValue(expected, "file", basename(font.path));
        expectValue(expected, "single_stroke", font.singleStroke);
    },
    "font/resolve-alias": expected => {
        let font = Compound.resolveFont({ font: SINGLE_LINE_FONT });
        expectValue(expected, "name", font.name);
        expectValue(expected, "file", basename(font.path));
        expectValue(expected, "single_stroke", font.singleStroke);
    },
    "font/register": expected => {
        let faces = new FontManager().registerFont(TEST_FONT_PATH, { override: true });
        expectValue(expected, "faces", faces);
    },
    "font/available": expected => {
        let registered = new FontManager().registerFont(TEST_FONT_PATH, { override: true });
        let wanted = new Set([...registered, "Relief SingleLine CAD"]);
        let fonts = availableFonts()
            .filter(font => wanted.has(font.name))
            .map(font => ({ name: font.name, styles: [...font.styles] }));
        expectValue(expected, "fonts", fonts);
    },
    "font/check": expected => {
        let manager = new FontManager();
        expectValue(expected, "font", manager.checkFont(TEST_FONT_PATH));
        expectValue(
            expected,
            "not_a_font",
            manager.checkFont(TEST_FONT_PATH.replace(basename(TEST_FONT_PATH), "missing.ttf")),
        );
    },

    // Rendering
    "make-text/default": expected =>
        expectText(expected, Compound.makeText("Caddy", 10, { fontPath: TEST_FONT_PATH })),
    "make-text/size": expected =>
        expectText(expected, Compound.makeText("Caddy", 25, { fontPath: TEST_FONT_PATH })),
    "make-text/multiline": expected =>
        expectText(expected, Compound.makeText("Hi\nthere", 10, { fontPath: TEST_FONT_PATH })),
    "make-text/style-bold": expected =>
        expectText(
            expected,
            Compound.makeText("Caddy", 10, {
                fontPath: TEST_FONT_PATH,
                fontStyle: FontStyle.Bold,
            }),
        ),
    "make-text/style-italic": expected =>
        expectText(
            expected,
            Compound.makeText("Caddy", 10, {
                fontPath: TEST_FONT_PATH,
                fontStyle: FontStyle.Italic,
            }),
        ),
    "make-text/style-bold-italic": expected =>
        expectText(
            expected,
            Compound.makeText("Caddy", 10, {
                fontPath: TEST_FONT_PATH,
                fontStyle: FontStyle.BoldItalic,
            }),
        ),

    // Alignment
    "make-text/text-align-left-bottom": expected =>
        expectText(
            expected,
            Compound.makeText("Caddy", 10, {
                fontPath: TEST_FONT_PATH,
                textAlign: [TextAlign.Left, TextAlign.Bottom],
            }),
        ),
    "make-text/text-align-right-top": expected =>
        expectText(
            expected,
            Compound.makeText("Caddy", 10, {
                fontPath: TEST_FONT_PATH,
                textAlign: [TextAlign.Right, TextAlign.Top],
            }),
        ),
    "make-text/text-align-top-first-line": expected =>
        expectText(
            expected,
            Compound.makeText("Hi\nthere", 10, {
                fontPath: TEST_FONT_PATH,
                textAlign: [TextAlign.Center, TextAlign.TopFirstLine],
            }),
        ),
    "make-text/align-min": expected =>
        expectText(
            expected,
            Compound.makeText("Caddy", 10, {
                fontPath: TEST_FONT_PATH,
                align: [Align.Min, Align.Min],
            }),
        ),
    "make-text/align-max": expected =>
        expectText(
            expected,
            Compound.makeText("Caddy", 10, {
                fontPath: TEST_FONT_PATH,
                align: [Align.Center, Align.Max],
            }),
        ),
    "make-text/align-single": expected =>
        expectText(
            expected,
            Compound.makeText("Caddy", 10, { fontPath: TEST_FONT_PATH, align: Align.Max }),
        ),
    "make-text/align-and-text-align": expected =>
        expectText(
            expected,
            Compound.makeText("Caddy", 10, {
                fontPath: TEST_FONT_PATH,
                textAlign: [TextAlign.Left, TextAlign.Bottom],
                align: [Align.Min, Align.Min],
            }),
        ),

    // Text on a path
    "make-text/on-line": expected =>
        expectText(
            expected,
            Compound.makeText("Caddy", 10, {
                fontPath: TEST_FONT_PATH,
                textPath: Edge.makeLine([-30, 0, 0], [30, 0, 0]),
            }),
        ),
    "make-text/on-arc": expected =>
        expectText(
            expected,
            Compound.makeText("Caddy", 10, { fontPath: TEST_FONT_PATH, textPath: arcPath() }),
        ),
    "make-text/on-arc-shifted": expected =>
        expectText(
            expected,
            Compound.makeText("Caddy", 10, {
                fontPath: TEST_FONT_PATH,
                positionOnPath: 0.25,
                textPath: arcPath(),
            }),
        ),

    // Single-stroke fonts
    "make-text/single-line": expected =>
        expectText(expected, Compound.makeText("Caddy", 10, { font: SINGLE_LINE_FONT })),
    "make-text/single-line-outlined": expected =>
        expectText(
            expected,
            Compound.makeText("Caddy", 10, { font: SINGLE_LINE_FONT, singleLineWidth: 0.6 }),
        ),

    // The Text sketch object
    "text/default": expected => {
        let text = new Text("Caddy", 10, { fontPath: TEST_FONT_PATH });
        expectText(expected, text);
        expectValue(expected, "font", text.font);
        expectValue(expected, "file", basename(text.fontPath));
        expectClose(expected, "single_line_width", text.singleLineWidth, MASS_TOLERANCE);
    },
    "text/rotated": expected =>
        expectText(expected, new Text("Caddy", 10, { fontPath: TEST_FONT_PATH, rotation: 30 })),
    "text/aligned": expected =>
        expectText(
            expected,
            new Text("Caddy", 10, { fontPath: TEST_FONT_PATH, align: [Align.Min, Align.Min] }),
        ),
    "text/on-path": expected =>
        expectText(
            expected,
            new Text("Caddy", 10, {
                fontPath: TEST_FONT_PATH,
                path: arcPath(),
                positionOnPath: 0.1,
            }),
        ),
    "text/single-line": expected => {
        let text = new Text("Caddy", 10, { font: SINGLE_LINE_FONT });
        expectText(expected, text);
        expectClose(expected, "single_line_width", text.singleLineWidth, MASS_TOLERANCE);
    },
    "text/single-line-width": expected =>
        expectText(
            expected,
            new Text("Caddy", 10, { font: SINGLE_LINE_FONT, singleLineWidth: 0.6 }),
        ),
});
