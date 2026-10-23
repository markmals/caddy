/**
 * Validated access to one oracle fixture case, plus the comparison helpers.
 *
 * Accessors throw instead of returning `undefined`: a fixture key that moved or
 * changed type must fail the test that depends on it, never silently pass. All
 * failures name the suite, the case, the key path, both values and the tolerance.
 *
 * This module deliberately knows nothing about the test runner, so the planner
 * self-tests can exercise failure paths without turning the suite red.
 */

/** A case view: the whole case at `path === ""`, a nested record below it. */
export interface FixtureCase {
    readonly suite: string;
    readonly name: string;
    readonly path: string;
    readonly data: Readonly<Record<string, unknown>>;
}

export function fixtureValue(source: FixtureCase, key: string): unknown {
    if (!Object.hasOwn(source.data, key)) {
        let known = Object.keys(source.data).sort().join(", ");
        throw new Error(`${label(source, key)}: missing from fixture; available keys: ${known}`);
    }
    return source.data[key];
}

export function fixtureNumber(source: FixtureCase, key: string): number {
    let value = fixtureValue(source, key);
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${label(source, key)}: expected a finite number, got ${display(value)}`);
    }
    return value;
}

export function fixtureString(source: FixtureCase, key: string): string {
    let value = fixtureValue(source, key);
    if (typeof value !== "string") {
        throw new Error(`${label(source, key)}: expected a string, got ${display(value)}`);
    }
    return value;
}

export function fixtureBoolean(source: FixtureCase, key: string): boolean {
    let value = fixtureValue(source, key);
    if (typeof value !== "boolean") {
        throw new Error(`${label(source, key)}: expected a boolean, got ${display(value)}`);
    }
    return value;
}

export function fixtureNumbers(source: FixtureCase, key: string): number[] {
    return numbers(label(source, key), fixtureValue(source, key));
}

export function fixtureVector(source: FixtureCase, key: string): [number, number, number] {
    let values = fixtureNumbers(source, key);
    let [x, y, z] = values;
    if (values.length !== 3 || x === undefined || y === undefined || z === undefined) {
        throw new Error(`${label(source, key)}: expected 3 components, got ${values.length}`);
    }
    return [x, y, z];
}

/**
 * Rows of a matrix. Serializers may emit either nested rows or a flat row-major
 * list (build123d locations use a flat 3x4); `shape` reshapes the flat form.
 */
export function fixtureMatrix(
    source: FixtureCase,
    key: string,
    shape?: { rows: number; columns: number },
): number[][] {
    let value = fixtureValue(source, key);
    if (!Array.isArray(value)) {
        throw new Error(`${label(source, key)}: expected an array, got ${display(value)}`);
    }
    let rows = value.every(row => Array.isArray(row))
        ? value.map((row, index) => numbers(`${label(source, key)}[${index}]`, row))
        : reshape(source, key, numbers(label(source, key), value), shape);
    assertShape(source, key, rows, shape);
    return rows;
}

/** A nested record, as a case view that the same accessors apply to. */
export function fixtureRecord(source: FixtureCase, key: string): FixtureCase {
    let value = fixtureValue(source, key);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`${label(source, key)}: expected an object, got ${display(value)}`);
    }
    return {
        suite: source.suite,
        name: source.name,
        path: source.path === "" ? key : `${source.path}.${key}`,
        data: value as Record<string, unknown>,
    };
}

export function expectClose(
    source: FixtureCase,
    key: string,
    actual: number,
    tolerance: number,
): void {
    compare(label(source, key), fixtureNumber(source, key), actual, tolerance);
}

export function expectNumbersClose(
    source: FixtureCase,
    key: string,
    actual: readonly number[],
    tolerance: number,
): void {
    let expected = fixtureNumbers(source, key);
    if (expected.length !== actual.length) {
        throw new Error(
            `${label(source, key)}: expected ${expected.length} values, got ${actual.length}`,
        );
    }
    expected.forEach((value, index) => {
        compare(`${label(source, key)}[${index}]`, value, actual[index] ?? Number.NaN, tolerance);
    });
}

export function expectVectorClose(
    source: FixtureCase,
    key: string,
    actual: readonly number[],
    tolerance: number,
): void {
    if (actual.length !== 3) {
        throw new Error(`${label(source, key)}: expected a 3-component actual value`);
    }
    expectNumbersClose(source, key, actual, tolerance);
}

export function expectMatrixClose(
    source: FixtureCase,
    key: string,
    actual: readonly (readonly number[])[],
    tolerance: number,
): void {
    let columns = actual[0]?.length ?? 0;
    let expected = fixtureMatrix(source, key, { rows: actual.length, columns });
    expected.forEach((row, rowIndex) => {
        row.forEach((value, columnIndex) => {
            compare(
                `${label(source, key)}[${rowIndex}][${columnIndex}]`,
                value,
                actual[rowIndex]?.[columnIndex] ?? Number.NaN,
                tolerance,
            );
        });
    });
}

/** `|actual - expected| <= tolerance * max(1, |expected|)`; see `tolerances.ts`. */
export function isClose(expected: number, actual: number, tolerance: number): boolean {
    if (actual === expected) return true;
    if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
    return Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected));
}

function compare(where: string, expected: number, actual: number, tolerance: number): void {
    if (isClose(expected, actual, tolerance)) return;
    let allowed = tolerance * Math.max(1, Math.abs(expected));
    throw new Error(
        `${where}: expected ${expected}, got ${actual} ` +
            `(|Δ| = ${Math.abs(actual - expected)} > ${allowed}, tolerance ${tolerance})`,
    );
}

function label(source: FixtureCase, key: string): string {
    let path = source.path === "" ? key : `${source.path}.${key}`;
    return `${source.suite}/${source.name} [${path}]`;
}

function display(value: unknown): string {
    if (typeof value === "object" && value !== null) return JSON.stringify(value);
    return typeof value === "string" ? JSON.stringify(value) : String(value);
}

function numbers(where: string, value: unknown): number[] {
    if (!Array.isArray(value)) {
        throw new Error(`${where}: expected an array, got ${display(value)}`);
    }
    return value.map((entry, index) => {
        if (typeof entry !== "number" || !Number.isFinite(entry)) {
            throw new Error(`${where}[${index}]: expected a finite number, got ${display(entry)}`);
        }
        return entry;
    });
}

function reshape(
    source: FixtureCase,
    key: string,
    values: number[],
    shape?: { rows: number; columns: number },
): number[][] {
    if (shape === undefined) {
        throw new Error(`${label(source, key)}: flat matrix needs an expected shape`);
    }
    if (values.length !== shape.rows * shape.columns) {
        throw new Error(
            `${label(source, key)}: expected ${shape.rows}x${shape.columns} values, ` +
                `got ${values.length}`,
        );
    }
    return Array.from({ length: shape.rows }, (_, row) =>
        values.slice(row * shape.columns, (row + 1) * shape.columns),
    );
}

function assertShape(
    source: FixtureCase,
    key: string,
    rows: number[][],
    shape?: { rows: number; columns: number },
): void {
    let width = rows[0]?.length ?? 0;
    if (rows.some(row => row.length !== width)) {
        throw new Error(`${label(source, key)}: matrix rows have inconsistent lengths`);
    }
    if (shape !== undefined && (rows.length !== shape.rows || width !== shape.columns)) {
        throw new Error(
            `${label(source, key)}: expected a ${shape.rows}x${shape.columns} matrix, ` +
                `got ${rows.length}x${width}`,
        );
    }
}
