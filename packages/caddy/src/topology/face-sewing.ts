/** Grouping loose faces into the sheets they form (build123d `Face.sew_faces`). */

import { features } from "@roonieone/occt-native";

import type { Face } from "./face.ts";

import { InvalidShapeError } from "../errors.ts";
import { native } from "./kernel.ts";
import { ShapeList } from "./shape-list.ts";
import { Shape } from "./shape.ts";

/** Each group of contiguous faces, in the order OCCT sewed them. */
export function sewFaces(faces: Iterable<Face>): ShapeList<Face>[] {
    let sewn = Shape.cast(
        native("Face.sewFaces", () => features.sew([...faces].map(face => face.wrapped))),
    );
    return [...sewn.getTopLevelShapes()].map(sheet => {
        if (sheet.shapeType === "Face") {
            return new ShapeList([sheet as Face]);
        }
        if (sheet.shapeType !== "Shell" && sheet.shapeType !== "Solid") {
            throw new InvalidShapeError(
                `SewedShape returned a ${sheet.shapeType} which was unexpected`,
            );
        }
        return sheet.faces();
    });
}
