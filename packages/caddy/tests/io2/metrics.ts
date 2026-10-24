/**
 * Asserts the shapes an importer returned against the records the oracle took from build123d's
 * importers: class, label, colour, bounds, counts, and the geometry of every edge in order.
 */

import { expect } from "vite-plus/test";

import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";
import type { Shape } from "../../src/topology/index.ts";

import {
    expectClose,
    expectNumbersClose,
    expectVectorClose,
    fixtureBoolean,
    fixtureNumber,
    fixtureRecord,
    fixtureString,
    fixtureValue,
} from "../../../../reference/build123d/oracle.ts";
import { LINEAR_TOLERANCE, MASS_TOLERANCE } from "../../../../reference/build123d/tolerances.ts";

/** Colour channels are stored as bytes in a 3MF, so a round trip is only good to ~1/255. */
export const COLOR_TOLERANCE = 0.004;

/** build123d keeps colours in OCCT's `Quantity_ColorRGBA`, whose channels are 32-bit floats. */
const CHANNEL_TOLERANCE = 1e-7;

export interface ImportedOptions {
    /** Slack for lengths, areas and positions; defaults to the linear tolerance. */
    readonly tolerance?: number;
    /** Slack for colour channels; defaults to what a 32-bit float channel costs. */
    readonly colorTolerance?: number;
}

/** Every shape of `expected.shapes`, in order, against `shapes`. */
export function expectImported(
    expected: FixtureCase,
    shapes: readonly Shape[],
    options: ImportedOptions = {},
): void {
    let records = fixtureList(expected, "shapes");
    expect(shapes.length, "imported shape count").toBe(records.length);
    for (let [index, record] of records.entries()) {
        let shape = shapes[index];
        expect(shape, `shape ${index}`).toBeDefined();
        if (shape !== undefined) expectShape(record, shape, index, options);
    }
}

function expectShape(
    record: FixtureCase,
    shape: Shape,
    index: number,
    options: ImportedOptions,
): void {
    let tolerance = options.tolerance ?? LINEAR_TOLERANCE;
    let where = `shape ${index}`;
    expect(shape.constructor.name, `${where} class`).toBe(fixtureString(record, "class_name"));
    expect(shape.label, `${where} label`).toBe(fixtureString(record, "label"));
    expect(shape.isValid, `${where} validity`).toBe(fixtureBoolean(record, "is_valid"));
    expectColor(record, shape, where, options.colorTolerance ?? CHANNEL_TOLERANCE);
    expectClose(record, "area", shape.area, Math.max(tolerance, MASS_TOLERANCE));
    expectClose(record, "volume", shape.volume, Math.max(tolerance, MASS_TOLERANCE));
    let box = shape.boundingBox;
    expectVectorClose(record, "min", box.min.toTuple(), tolerance);
    expectVectorClose(record, "max", box.max.toTuple(), tolerance);
    expectCounts(fixtureRecord(record, "counts"), shape, where);
    expectEdges(record, shape, where, tolerance);
}

function expectColor(record: FixtureCase, shape: Shape, where: string, tolerance: number): void {
    let expected = fixtureValue(record, "color");
    if (expected === null) {
        expect(shape.color, `${where} colour`).toBeUndefined();
        return;
    }
    expect(shape.color, `${where} colour`).toBeDefined();
    if (shape.color === undefined) return;
    expectNumbersClose(record, "color", shape.color.toTuple(), tolerance);
}

function expectCounts(expected: FixtureCase, shape: Shape, where: string): void {
    let actual = {
        faces: shape.faces.length,
        wires: shape.wires.length,
        edges: shape.edges.length,
    };
    for (let [name, count] of Object.entries(actual)) {
        expect(count, `${where} ${name} count`).toBe(fixtureNumber(expected, name));
    }
}

function expectEdges(record: FixtureCase, shape: Shape, where: string, tolerance: number): void {
    let records = fixtureList(record, "edges");
    let edges = shape.edges;
    expect(edges.length, `${where} edge count`).toBe(records.length);
    for (let [index, expected] of records.entries()) {
        let edge = edges.at(index);
        expect(edge, `${where} edge ${index}`).toBeDefined();
        if (edge === undefined) continue;
        expect(edge.geomType, `${where} edge ${index} type`).toBe(
            fixtureString(expected, "geom_type"),
        );
        expectClose(expected, "length", edge.length, Math.max(tolerance, MASS_TOLERANCE));
        expectVectorClose(expected, "start", edge.startPoint.toTuple(), tolerance);
        expectVectorClose(expected, "end", edge.endPoint.toTuple(), tolerance);
    }
}

/** A fixture array read as a list of case views, so the same accessors apply to each element. */
export function fixtureList(source: FixtureCase, key: string): FixtureCase[] {
    let value = fixtureValue(source, key);
    if (!Array.isArray(value)) {
        throw new Error(`${source.suite}:${source.name} ${key}: expected an array`);
    }
    return value.map((entry, index) => ({
        suite: source.suite,
        name: source.name,
        path: `${source.path === "" ? key : `${source.path}.${key}`}[${index}]`,
        data: entry as Record<string, unknown>,
    }));
}
