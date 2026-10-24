/** Asserts a Caddy SVG export against the parsed document the oracle recorded for build123d. */

import { expect } from "vite-plus/test";

import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";
import type { ParsedSegment, Point, XmlNode } from "./parse.ts";

import { isClose } from "../../../../reference/build123d/oracle.ts";
import { LINEAR_TOLERANCE } from "../../../../reference/build123d/tolerances.ts";
import { parsePathData, parseXml } from "./parse.ts";

/** SVG attributes are text, so numbers are compared after parsing rather than as strings. */
function expectNumbersClose(actual: readonly number[], expected: unknown, label: string): void {
    expect(Array.isArray(expected), `${label}: fixture holds numbers`).toBe(true);
    let want = expected as number[];
    expect(actual.length, `${label} length`).toBe(want.length);
    for (let [index, value] of want.entries()) {
        expect(
            isClose(value, actual[index] as number, LINEAR_TOLERANCE),
            `${label}[${index}]: expected ${value}, got ${actual[index]}`,
        ).toBe(true);
    }
}

function expectPointClose(actual: Point, expected: unknown, label: string): void {
    expectNumbersClose(actual, expected, label);
}

/** `"10.5mm"`: the same unit, and the same length once parsed. */
function expectLength(actual: string | undefined, expected: string, label: string): void {
    let split = (text: string): [number, string] => {
        let match = /^(-?[\d.e+-]+)([a-z]*)$/i.exec(text);
        if (match === null) throw new Error(`${label}: ${JSON.stringify(text)} is not a length`);
        return [Number(match[1]), match[2] as string];
    };
    expect(actual, `${label} present`).toBeDefined();
    let [actualValue, actualUnit] = split(actual as string);
    let [expectedValue, expectedUnit] = split(expected);
    expect(actualUnit, `${label} unit`).toBe(expectedUnit);
    expect(
        isClose(expectedValue, actualValue, LINEAR_TOLERANCE),
        `${label}: expected ${expected}, got ${actual}`,
    ).toBe(true);
}

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

function expectSegment(actual: ParsedSegment, expected: unknown, label: string): void {
    let want = record(expected, label);
    expect(actual.type, `${label} type`).toBe(want["type"]);
    expectPointClose(actual.start, want["start"], `${label} start`);
    expectPointClose(actual.end, want["end"], `${label} end`);
    if (actual.type === "Arc") {
        expectPointClose(actual.radius as Point, want["radius"], `${label} radius`);
        expect(
            isClose(want["rotation"] as number, actual.rotation as number, LINEAR_TOLERANCE),
            `${label} rotation: expected ${String(want["rotation"])}, got ${String(actual.rotation)}`,
        ).toBe(true);
        expect(actual.largeArc, `${label} large arc`).toBe(want["large_arc"]);
        expect(actual.sweep, `${label} sweep`).toBe(want["sweep"]);
    }
    if (want["controls"] !== undefined) {
        let controls = list(want["controls"], `${label} controls`);
        expect(actual.controls?.length, `${label} control count`).toBe(controls.length);
        for (let [index, control] of controls.entries()) {
            expectPointClose(
                (actual.controls as Point[])[index] as Point,
                control,
                `${label} control ${index}`,
            );
        }
    }
}

function expectElement(actual: XmlNode, expected: unknown, label: string): void {
    let want = record(expected, label);
    expect(actual.tag, `${label} tag`).toBe(want["tag"]);
    if (actual.tag === "line") {
        let points = ["x1", "y1", "x2", "y2"].map(name => Number(actual.attributes[name]));
        expectNumbersClose(points, want["points"], `${label} points`);
    } else if (actual.tag === "circle") {
        expectNumbersClose(
            [Number(actual.attributes["cx"]), Number(actual.attributes["cy"])],
            want["center"],
            `${label} center`,
        );
        expectNumbersClose([Number(actual.attributes["r"])], [want["radius"]], `${label} radius`);
    } else {
        let segments = parsePathData(actual.attributes["d"] ?? "");
        let wanted = list(want["segments"], `${label} segments`);
        expect(segments.length, `${label} segment count`).toBe(wanted.length);
        for (let [index, segment] of wanted.entries()) {
            expectSegment(segments[index] as ParsedSegment, segment, `${label}[${index}]`);
        }
    }
    for (let name of ["fill", "fill-opacity", "stroke", "stroke-opacity"]) {
        let key = name.replace("-", "_");
        if (want[key] === undefined) continue;
        expect(actual.attributes[name], `${label} ${name}`).toBe(want[key]);
    }
}

function expectGroup(actual: XmlNode, expected: unknown, label: string): void {
    let want = record(expected, label);
    expect(actual.attributes["id"] ?? "", `${label} id`).toBe(want["id"]);
    for (let name of ["fill", "stroke", "fill-opacity", "stroke-opacity"]) {
        expect(actual.attributes[name] ?? null, `${label} ${name}`).toBe(
            want[name.replace("-", "_")] ?? null,
        );
    }
    expectNumbersClose(
        [Number(actual.attributes["stroke-width"])],
        [want["stroke_width"]],
        `${label} stroke width`,
    );
    let dashes = actual.attributes["stroke-dasharray"];
    if (want["dash_array"] === null) {
        expect(dashes, `${label} dash array`).toBeUndefined();
    } else {
        expectNumbersClose(
            (dashes ?? "").split(" ").map(Number),
            want["dash_array"],
            `${label} dash array`,
        );
    }
    let elements = list(want["elements"], `${label} elements`);
    expect(actual.children.length, `${label} element count`).toBe(elements.length);
    for (let [index, element] of elements.entries()) {
        expectElement(actual.children[index] as XmlNode, element, `${label} element ${index}`);
    }
}

export function expectSvgDocument(expected: FixtureCase, text: string): void {
    let want = record(expected.data["svg"], "svg");
    let root = parseXml(text);
    expect(root.tag, "root tag").toBe("svg");
    expectLength(root.attributes["width"], want["width"] as string, "width");
    expectLength(root.attributes["height"], want["height"] as string, "height");
    expectNumbersClose(
        (root.attributes["viewBox"] ?? "").split(" ").map(Number),
        want["view_box"],
        "view box",
    );
    let container = root.children[0];
    expect(container?.tag, "container group").toBe("g");
    let groups = list(want["groups"], "groups");
    expect(container?.children.length, "group count").toBe(groups.length);
    for (let [index, group] of groups.entries()) {
        expectGroup((container as XmlNode).children[index] as XmlNode, group, `group ${index}`);
    }
}
