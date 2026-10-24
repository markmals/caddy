import { expect } from "vite-plus/test";

import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";
import type { Face } from "../../src/index.ts";
import type { OracleCases } from "../topology/oracle/support.ts";

import {
    expectClose,
    expectVectorClose,
    fixtureBoolean,
    fixtureNumber,
    fixtureRecord,
    fixtureString,
} from "../../../../reference/build123d/oracle.ts";
import { LINEAR_TOLERANCE, MASS_TOLERANCE } from "../../../../reference/build123d/tolerances.ts";
import { Axis, Box, DraftAngleError, draft, Plane } from "../../src/index.ts";

/** Which faces of the test box a draft is asked for. */
type Selection = "bottom" | "sides";
/** Which neutral plane it pulls against. */
type Neutral = "bottom" | "xz";

interface DraftFailure {
    readonly error: DraftAngleError;
    /** The selection, in the order it was handed to `draft`, to resolve the failed face's index. */
    readonly faces: readonly Face[];
}

function failingDraft(selection: Selection, neutral: Neutral, angle: number): DraftFailure {
    let box = new Box(10, 10, 10).solid();
    let bottom = box.faces().sortBy(Axis.Z)[0]!;
    let faces =
        selection === "sides" ? [...box.faces().filterBy(Axis.Z, { reverse: true })] : [bottom];
    // build123d's `Plane(face)` is the face's centre of mass plus its normal there.
    let neutralPlane =
        neutral === "bottom"
            ? new Plane({ origin: bottom.center(), zDir: bottom.normalAt() })
            : Plane.XZ;
    try {
        draft(faces, neutralPlane, angle);
    } catch (error) {
        if (error instanceof DraftAngleError) return { error, faces };
        throw error;
    }
    throw new Error(`the ${selection}/${neutral} draft at ${angle} degrees was expected to fail`);
}

function expectDraftFailure(
    expected: FixtureCase,
    key: string,
    selection: Selection,
    neutral: Neutral,
    angle: number,
): void {
    let record = fixtureRecord(expected, key);
    let { error, faces } = failingDraft(selection, neutral, angle);
    expect(error.constructor.name, `${key} error class`).toBe(fixtureString(record, "error"));
    // build123d ends the sentence with a full stop; no Caddy error message does.
    expect(`${error.message}.`, `${key} message`).toBe(fixtureString(record, "message"));

    let face = error.face;
    expect(face, `${key} failed face`).toBeDefined();
    if (face === undefined) return;
    expect(
        faces.findIndex(candidate => candidate.isSame(face)),
        `${key} failed face index`,
    ).toBe(fixtureNumber(record, "failed_index"));
    let faceRecord = fixtureRecord(record, "face");
    expectClose(faceRecord, "area", face.area, MASS_TOLERANCE);
    expectVectorClose(faceRecord, "center", face.center().toTuple(), LINEAR_TOLERANCE);

    let problematic = error.problematicShape;
    expect(problematic, `${key} problematic shape`).toBeDefined();
    if (problematic === undefined) return;
    let shapeRecord = fixtureRecord(record, "problematic");
    expect(problematic.constructor.name, `${key} problematic class`).toBe(
        fixtureString(shapeRecord, "class_name"),
    );
    expect(problematic.shapeType.toUpperCase(), `${key} problematic type`).toBe(
        fixtureString(shapeRecord, "shape_type"),
    );
    expect(problematic.faces().length, `${key} problematic face count`).toBe(
        fixtureNumber(shapeRecord, "face_count"),
    );
    expectClose(shapeRecord, "area", problematic.area, MASS_TOLERANCE);
    expectVectorClose(shapeRecord, "center", problematic.center().toTuple(), LINEAR_TOLERANCE);
    expect(problematic.isSame(face), `${key} problematic is the failed face`).toBe(
        fixtureBoolean(shapeRecord, "is_failed_face"),
    );
}

export const errorCases: OracleCases = {
    "errors/draft-angle": expected => {
        expectDraftFailure(expected, "neutral_plane_face", "bottom", "bottom", 5);
        expectDraftFailure(expected, "sides_in_neutral_plane", "sides", "xz", 5);
        expectDraftFailure(expected, "right_angle", "sides", "bottom", 90);
    },
};
