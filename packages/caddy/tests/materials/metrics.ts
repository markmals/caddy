/**
 * Helpers shared by the materials oracle suite.
 *
 * bd_materials names its properties in snake_case and Caddy in camelCase, so every fixture key
 * that names a property is translated here rather than in each case.
 */

import { expect } from "vite-plus/test";

import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";
import type { AppliedFinish, AppliedProcess, Material, Range } from "../../src/index.ts";
import type { MassOptions } from "../../src/topology/index.ts";

import {
    expectClose,
    fixtureBoolean,
    fixtureNumber,
    fixtureNumbers,
    fixtureRecord,
    fixtureString,
    fixtureValue,
} from "../../../../reference/build123d/oracle.ts";
import { MASS_TOLERANCE } from "../../../../reference/build123d/tolerances.ts";
import { isNotSuitable, MassUnit, PROPERTY_UNITS, Unit } from "../../src/index.ts";

/** The unit pairs the mass cases record, keyed the way the fixture labels them. */
export const MASS_UNITS: Readonly<Record<string, MassOptions>> = {
    "g-mm": { massUnit: MassUnit.Gram, lengthUnit: Unit.Millimeter },
    "kg-m": { massUnit: MassUnit.Kilogram, lengthUnit: Unit.Meter },
    "lb-in": { massUnit: MassUnit.Pound, lengthUnit: Unit.Inch },
};

/** `tensile_strength` the way bd_materials spells it to `tensileStrength` the way Caddy does. */
export function camelCase(name: string): string {
    return name.replaceAll(/_(.)/g, (_, letter: string) => letter.toUpperCase());
}

export function fixtureStrings(source: FixtureCase, key: string): string[] {
    let value = fixtureValue(source, key);
    if (!Array.isArray(value) || value.some(entry => typeof entry !== "string")) {
        throw new Error(`${source.name}/${key}: expected an array of strings`);
    }
    return value as string[];
}

/**
 * The property names a material carries, in the spelling the fixture uses. `density` is left
 * out: it is single-valued and the fixture records it with the identity fields.
 */
function propertyNames(material: Material): string[] {
    let names = Object.keys(PROPERTY_UNITS).filter(
        name => name !== "density" && material[name as keyof Material] !== undefined,
    );
    if (material.hardness !== undefined) names.push("hardness", "hardnessScale");
    return names.sort();
}

function expectRange(label: string, expected: unknown, actual: Range | undefined): void {
    if (expected === "n/a") {
        expect(actual, label).toBeDefined();
        expect(isNotSuitable(actual as Range), `${label} is not suitable`).toBe(true);
        return;
    }
    if (!Array.isArray(expected) || expected.length !== 2) {
        throw new Error(`${label}: expected a [min, max] pair, got ${JSON.stringify(expected)}`);
    }
    expect(actual, label).toBeDefined();
    expect([(actual as Range).min, (actual as Range).max], label).toEqual(expected);
}

/** Every property the oracle recorded for a material, and no property it did not. */
export function expectProperties(expected: FixtureCase, material: Material): void {
    let recorded = Object.keys(expected.data).map(camelCase);
    expect(propertyNames(material), `${material.name} properties`).toEqual(recorded.sort());
    for (let name of Object.keys(expected.data)) {
        let label = `${material.name}.${camelCase(name)}`;
        if (name === "hardness_scale") {
            expect(material.hardnessScale, label).toBe(fixtureString(expected, name));
            continue;
        }
        expectRange(
            label,
            fixtureValue(expected, name),
            material[camelCase(name) as keyof Material] as Range | undefined,
        );
    }
}

/** An applied finish against the record the oracle made of it, colour excluded. */
export function expectFinish(expected: FixtureCase, key: string, applied: AppliedFinish): void {
    let record = fixtureRecord(expected, key);
    expect(applied.finish.name, `${key} finish`).toBe(fixtureString(record, "name"));
    expect(applied.color !== undefined, `${key} colored`).toBe(fixtureBoolean(record, "colored"));
    expect(applied.sheen ?? null, `${key} sheen`).toEqual(fixtureValue(record, "sheen"));
    expect([...applied.scale], `${key} scale`).toEqual(fixtureNumbers(record, "scale"));
    expect(applied.rotation, `${key} rotation`).toBe(fixtureNumber(record, "rotation"));
}

/** An applied process against the record the oracle made of it. */
export function expectProcess(expected: FixtureCase, key: string, applied: AppliedProcess): void {
    let record = fixtureRecord(expected, key);
    expect(applied.process, `${key} process`).toBe(fixtureString(record, "process"));
    expect([...applied.scale], `${key} scale`).toEqual(fixtureNumbers(record, "scale"));
    expect(applied.rotation, `${key} rotation`).toBe(fixtureNumber(record, "rotation"));
    expect(applied.pitchMm ?? null, `${key} pitchMm`).toEqual(fixtureValue(record, "pitchMm"));
    expect(applied.skin, `${key} skin`).toBe(fixtureBoolean(record, "skin"));
    expect(applied.mmPerUv, `${key} mmPerUv`).toBe(fixtureNumber(record, "mmPerUv"));
}

/** A shape's mass in each recorded unit pair. */
export function expectMasses(
    expected: FixtureCase,
    key: string,
    mass: (options: MassOptions) => number,
): void {
    let record = fixtureRecord(expected, key);
    for (let [label, options] of Object.entries(MASS_UNITS)) {
        expectClose(record, label, mass(options), MASS_TOLERANCE);
    }
}
