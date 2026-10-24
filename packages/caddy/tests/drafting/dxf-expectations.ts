/**
 * Asserts a Caddy DXF export against the entities ezdxf read back from build123d's file.
 *
 * ezdxf adds a `Defpoints` layer of its own and records "no line weight" as -3, so only the
 * layers and weights build123d actually set are compared.
 */

import { expect } from "vite-plus/test";

import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";
import type { DxfRecord } from "./parse.ts";

import { isClose } from "../../../../reference/build123d/oracle.ts";
import { LINEAR_TOLERANCE } from "../../../../reference/build123d/tolerances.ts";
import { dxfNumbers, dxfValue, parseDxfSection } from "./parse.ts";

/** ezdxf's "line weight not set". */
const DEFAULT_LINE_WEIGHT = -3;

function record(value: unknown, label: string): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`${label}: expected an object`);
    }
    return value as Record<string, unknown>;
}

function list(value: unknown, label: string): unknown[] {
    if (!Array.isArray(value)) throw new Error(`${label}: expected an array`);
    return value;
}

function expectClose(actual: number | undefined, expected: unknown, label: string): void {
    expect(actual, `${label} present`).toBeDefined();
    expect(
        isClose(expected as number, actual as number, LINEAR_TOLERANCE),
        `${label}: expected ${String(expected)}, got ${String(actual)}`,
    ).toBe(true);
}

function expectNumbersClose(actual: readonly number[], expected: unknown, label: string): void {
    let want = list(expected, label);
    expect(actual.length, `${label} length`).toBe(want.length);
    for (let [index, value] of want.entries()) {
        expectClose(actual[index], value, `${label}[${index}]`);
    }
}

function point(entity: DxfRecord, code: number): number[] {
    return [dxfNumbers(entity, code)[0] as number, dxfNumbers(entity, code + 10)[0] as number];
}

function expectEntity(actual: DxfRecord, expected: unknown, label: string): void {
    let want = record(expected, label);
    expect(actual.type, `${label} type`).toBe(want["type"]);
    expect(dxfValue(actual, 8), `${label} layer`).toBe(want["layer"] === "0" ? "0" : want["layer"]);
    if (actual.type === "LINE") {
        expectNumbersClose(point(actual, 10), want["start"], `${label} start`);
        expectNumbersClose(point(actual, 11), want["end"], `${label} end`);
        return;
    }
    if (actual.type === "CIRCLE") {
        expectNumbersClose(point(actual, 10), want["center"], `${label} center`);
        expectClose(dxfNumbers(actual, 40)[0], want["radius"], `${label} radius`);
        return;
    }
    if (actual.type === "ARC") {
        expectNumbersClose(point(actual, 10), want["center"], `${label} center`);
        expectClose(dxfNumbers(actual, 40)[0], want["radius"], `${label} radius`);
        expectClose(dxfNumbers(actual, 50)[0], want["start_angle"], `${label} start angle`);
        expectClose(dxfNumbers(actual, 51)[0], want["end_angle"], `${label} end angle`);
        return;
    }
    if (actual.type === "ELLIPSE") {
        expectNumbersClose(point(actual, 10), want["center"], `${label} center`);
        expectNumbersClose(point(actual, 11), want["major_axis"], `${label} major axis`);
        expectClose(dxfNumbers(actual, 40)[0], want["ratio"], `${label} ratio`);
        expectClose(dxfNumbers(actual, 41)[0], want["start_param"], `${label} start param`);
        expectClose(dxfNumbers(actual, 42)[0], want["end_param"], `${label} end param`);
        return;
    }
    expectClose(dxfNumbers(actual, 71)[0], want["degree"], `${label} degree`);
    let poles = dxfNumbers(actual, 10).flatMap((x, index) => [
        x,
        dxfNumbers(actual, 20)[index] as number,
    ]);
    let wantedPoles = list(want["control_points"], `${label} control points`).flat();
    expectNumbersClose(poles, wantedPoles, `${label} control points`);
    expectNumbersClose(dxfNumbers(actual, 40), want["knots"], `${label} knots`);
    if (want["weights"] === null) {
        expect(dxfNumbers(actual, 41).length, `${label} weight count`).toBe(0);
    } else {
        expectNumbersClose(dxfNumbers(actual, 41), want["weights"], `${label} weights`);
    }
}

function expectLayer(actual: DxfRecord, expected: Record<string, unknown>, label: string): void {
    expect(Number(dxfValue(actual, 62)), `${label} color`).toBe(expected["color"]);
    expect(dxfValue(actual, 6)?.toUpperCase(), `${label} line type`).toBe(
        (expected["line_type"] as string).toUpperCase(),
    );
    let weight = expected["line_weight"];
    if (typeof weight === "number" && weight !== DEFAULT_LINE_WEIGHT) {
        expect(Number(dxfValue(actual, 370)), `${label} line weight`).toBe(weight);
    }
}

export function expectDxfDocument(expected: FixtureCase, text: string): void {
    let want = record(expected.data["dxf"], "dxf");
    let tables = parseDxfSection(text, "TABLES");
    let layers = new Map(
        tables
            .filter(entry => entry.type === "LAYER")
            .map(entry => [dxfValue(entry, 2) ?? "", entry]),
    );
    for (let entry of list(want["layers"], "layers")) {
        let layer = record(entry, "layer");
        let name = layer["name"] as string;
        // ezdxf's own bookkeeping layer is not part of the drawing.
        if (name === "Defpoints") continue;
        let actual = layers.get(name);
        expect(actual, `layer ${name} present`).toBeDefined();
        expectLayer(actual as DxfRecord, layer, `layer ${name}`);
    }

    let entities = parseDxfSection(text, "ENTITIES");
    let wanted = list(want["entities"], "entities");
    expect(entities.length, "entity count").toBe(wanted.length);
    for (let [index, entity] of wanted.entries()) {
        expectEntity(entities[index] as DxfRecord, entity, `entity ${index}`);
    }
}
