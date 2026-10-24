import { expect } from "vite-plus/test";

import type { OracleCases } from "../oracle/support.ts";

import {
    expectClose,
    expectNumbersClose,
    expectVectorClose,
    fixtureNumber,
    fixtureRecord,
    fixtureString,
    fixtureValue,
} from "../../../../../reference/build123d/oracle.ts";
import { LINEAR_TOLERANCE, MASS_TOLERANCE } from "../../../../../reference/build123d/tolerances.ts";
import { Axis, Plane } from "../../../src/geometry/index.ts";
import { Edge, Face, Wire } from "../../../src/topology/index.ts";
import { expectPoint, expectShapeMetrics } from "../oracle/support.ts";
import { bezierPoints, bezierWeights, fittedPoints } from "./shapes.ts";

export const makerCases: OracleCases = {
    "makers/bezier-surface": expected => {
        let plain = Face.makeBezierSurface(bezierPoints());
        let weighted = Face.makeBezierSurface(bezierPoints(), { weights: bezierWeights() });
        expectShapeMetrics(expected, "plain", plain);
        expectShapeMetrics(expected, "weighted", weighted);
        expectPoint(expected, "plain_center", plain.positionAt(0.5, 0.5));
        expectPoint(expected, "weighted_center", weighted.positionAt(0.5, 0.5));
    },
    "makers/surface-from-array-of-points": expected => {
        let fitted = Face.makeSurfaceFromArrayOfPoints(fittedPoints());
        expectShapeMetrics(expected, "fitted", fitted);
        expectPoint(expected, "corner", fitted.positionAt(0, 0));
        expectPoint(expected, "center", fitted.positionAt(0.5, 0.5));
    },
    "makers/variational-smoothing": expected => {
        let smoothed = Face.makeSurfaceFromArrayOfPoints(fittedPoints(), {
            smoothing: [1, 1, 1],
        });
        expectShapeMetrics(expected, "smoothed", smoothed);
        expectPoint(expected, "center", smoothed.positionAt(0.5, 0.5));
    },
    "makers/surface-from-curves-edges": expected => {
        let bottom = Edge.makeCircle(1, { endAngle: 90 });
        let top = Edge.makeCircle(1, { plane: new Plane({ origin: [0, 0, 1] }), endAngle: 90 });
        let ruled = Face.makeSurfaceFromCurves(bottom, top);
        expectShapeMetrics(expected, "ruled", ruled);
        expectPoint(expected, "normal_at", ruled.normalAt());
    },
    "makers/surface-from-curves-wires": expected => {
        let bottom = Wire.makeCircle(1);
        let top = Wire.makeCircle(1, new Plane({ origin: [0, 0, 1] }));
        expectShapeMetrics(expected, "ruled", Face.makeSurfaceFromCurves(bottom, top));
    },
    "makers/extrude": expected => {
        let extruded = Face.extrude(Edge.makeLine([0, 0, 0], [10, 0, 0]), [0, 0, 4]);
        expectShapeMetrics(expected, "extruded", extruded);
        expectPoint(expected, "normal_at", extruded.normalAt());
    },
    "makers/revolve": expected => {
        let profile = Edge.makeLine([3, 0, 0], [3, 2, 0]);
        expectShapeMetrics(expected, "full", Face.revolve(profile, 360, Axis.Y));
        expectShapeMetrics(expected, "quarter", Face.revolve(profile, 90, Axis.Y));
    },
    "makers/sweep": expected => {
        let swept = Face.sweep(Edge.makeLine([1, 0, 0], [2, 0, 0]), Wire.makeCircle(1));
        // build123d keeps OCCT's one-face pipe shell and labels it a `Face`; Caddy unwraps it.
        expect(fixtureString(expected, "class_name")).toBe("Face");
        expect(fixtureString(expected, "shape_type")).toBe("SHELL");
        expect(swept.shapeType).toBe("Face");
        expect(swept.faces()).toHaveLength(fixtureNumber(expected, "face_count"));
        expectClose(expected, "area", swept.area, MASS_TOLERANCE);
        let bounds = fixtureRecord(expected, "bounding_box");
        expectVectorClose(bounds, "min", swept.boundingBox().min.toTuple(), LINEAR_TOLERANCE);
        expectVectorClose(bounds, "max", swept.boundingBox().max.toTuple(), LINEAR_TOLERANCE);
    },
    "makers/sew-faces": expected => {
        let patches = [0, 1].flatMap(x =>
            [0, 1].flatMap(y =>
                [0, 1, 2].map(z => Face.makeRect(1, 1, new Plane({ origin: [x, y, z] }))),
            ),
        );
        let sheets = Face.sewFaces(patches);
        expect(sheets).toHaveLength(fixtureNumber(expected, "sheet_count"));
        expect(sheets.map(sheet => sheet.length)).toEqual(fixtureValue(expected, "sheet_sizes"));
        expectNumbersClose(
            expected,
            "sheet_areas",
            sheets.map(sheet => sheet.reduce((sum, face) => sum + face.area, 0)),
            MASS_TOLERANCE,
        );
        expect([
            ...new Set(sheets.flatMap(sheet => sheet.map(face => face.constructor.name))),
        ]).toEqual(fixtureValue(expected, "class_names"));
    },
};
