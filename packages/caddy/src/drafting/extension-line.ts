/** Extension lines: a dimension carried clear of the part it measures (build123d
 * `ExtensionLine`). */

import type { VectorLike } from "../geometry/vector.ts";
import type { Sketch } from "../topology/composite.ts";
import type { Face } from "../topology/face.ts";
import type { Draft, DimensionTolerance, PathDescriptor } from "./draft.ts";

import { makeLine } from "../curves/edge-makers.ts";
import { offset2D } from "../curves/offset-2d.ts";
import { GeometryError } from "../errors.ts";
import { TOLERANCE } from "../geometry/constants.ts";
import { Pos } from "../geometry/location.ts";
import { Vector } from "../geometry/vector.ts";
import { sweep } from "../operations/sweep.ts";
import { BaseSketchObject } from "../sketch/base-object.ts";
import { Side } from "../sketch/enums.ts";
import { Edge } from "../topology/edge.ts";
import { Wire } from "../topology/wire.ts";
import { DimensionLine } from "./dimension-line.ts";
import { processPath } from "./draft.ts";

/**
 * How close to perpendicular an `offset` vector must be to the dimension line, as the equivalent
 * dot product of unit vectors. Only a rough direction is needed, so build123d allows a whole
 * degree here rather than the geometry-wide tolerance.
 */
const OFFSET_ANGULAR_DOT_TOL = Math.sin((1 * Math.PI) / 180);

export interface ExtensionLineOptions {
    /** The drawing so far, which the label is placed to overlap as little as possible. */
    readonly sketch?: Sketch | undefined;
    /** Text replacing the measured length. */
    readonly label?: string | undefined;
    /** Which of the two arrows to draw. Defaults to both. */
    readonly arrows?: readonly [boolean, boolean] | undefined;
    /** A tolerance written after the measurement. */
    readonly tolerance?: DimensionTolerance | undefined;
    /** Write the angle a circular path subtends rather than its length. */
    readonly labelAngle?: boolean | undefined;
    /** Direction the measurement is taken along, starting from the border's first point. */
    readonly measurementDirection?: VectorLike | undefined;
}

/**
 * A dimension drawn beside the part, with a line extending from each end of `border` out to it
 * (build123d `ExtensionLine`), typically used for outside dimensions.
 *
 * `offset` is either a signed perpendicular distance — its sign picks the side — or a
 * displacement vector in the drawing plane, whose direction picks the side and whose length is
 * the distance.
 */
export class ExtensionLine extends BaseSketchObject {
    /**
     * Length of the dimension that was measured. build123d calls this `dimension`; Caddy's
     * shapes already use that name for their topological dimension.
     */
    readonly measurement: number;

    constructor(
        border: PathDescriptor,
        offset: number | VectorLike,
        draft: Draft,
        options: ExtensionLineOptions = {},
    ) {
        let built = buildExtensionLine(border, offset, draft, options);
        super(built.faces);
        this.measurement = built.measurement;
    }
}

function buildExtensionLine(
    border: PathDescriptor,
    offset: number | VectorLike,
    draft: Draft,
    options: ExtensionLineOptions,
): { faces: Face[]; measurement: number } {
    let offsetVector = planarOffset(offset);
    let objectToMeasure = processPath(border);
    if (objectToMeasure.positionAt(0).equals(objectToMeasure.positionAt(1))) {
        throw new GeometryError("Start and end points of border must be different.");
    }

    let measurementDirection = measuredAlong(options.measurementDirection, offsetVector);
    let objectToDimension = projectedBorder(objectToMeasure, measurementDirection);
    let signedOffset =
        offsetVector === undefined
            ? (offset as number)
            : signedDistance(objectToDimension, offsetVector);

    let dimensionPath = offset2D(objectToDimension, signedOffset, {
        side: signedOffset > 0 ? Side.Right : Side.Left,
        closed: false,
    });
    let label =
        options.label ??
        draft.labelFor(objectToDimension, {
            labelAngle: options.labelAngle,
            tolerance: options.tolerance,
        });

    let extensionLines = extensionEdges(objectToMeasure, dimensionPath, signedOffset).map(line =>
        // Move the line off the object so it does not touch what it measures.
        line.moved(new Pos(line.tangentAt(0).multiply(draft.extensionGap))),
    );
    let drawnLines = extensionLines.flatMap(line => [
        ...sweep(line.perpendicularLine(draft.lineWidth, 0), line).faces(),
    ]);

    let dimensionLine = new DimensionLine(dimensionPath, draft, {
        sketch: options.sketch,
        label,
        arrows: options.arrows,
        tolerance: options.tolerance,
        labelAngle: options.labelAngle,
    });
    return {
        faces: [...drawnLines, ...dimensionLine.faces()],
        measurement: dimensionLine.measurement,
    };
}

/** The offset as a vector in the drawing plane, or undefined when it is a signed distance. */
function planarOffset(offset: number | VectorLike): Vector | undefined {
    if (typeof offset === "number") {
        if (offset === 0) {
            throw new GeometryError("A dimension line should be used if offset is 0");
        }
        return undefined;
    }
    let vector = Vector.from(offset);
    if (vector.length < TOLERANCE) {
        throw new GeometryError("offset vector must be non-zero");
    }
    if (Math.abs(vector.z) > TOLERANCE) {
        throw new GeometryError("offset vector must lie in the drawing (XY) plane");
    }
    return new Vector(vector.x, vector.y);
}

/**
 * The direction the measurement runs along: the one asked for, else square to the offset vector,
 * else none at all — in which case the border is measured as it lies.
 */
function measuredAlong(
    requested: VectorLike | undefined,
    offsetVector: Vector | undefined,
): Vector | undefined {
    if (requested === undefined) {
        // The 90° turn in the drawing plane that takes the offset to the dimension line.
        return offsetVector?.cross(new Vector(0, 0, 1));
    }
    let direction = Vector.from(requested);
    if (direction.length < TOLERANCE) {
        throw new GeometryError("measurementDirection must be non-zero");
    }
    if (Math.abs(direction.z) > TOLERANCE) {
        throw new GeometryError("measurementDirection must lie in the drawing (XY) plane");
    }
    return new Vector(direction.x, direction.y);
}

/** The span of the border along the measurement direction, as the line that gets dimensioned. */
function projectedBorder(
    objectToMeasure: Edge | Wire,
    measurementDirection: Vector | undefined,
): Edge | Wire {
    if (measurementDirection === undefined) {
        return objectToMeasure;
    }
    let start = objectToMeasure.positionAt(0);
    let span = objectToMeasure.positionAt(1).sub(start).projectToLine(measurementDirection);
    if (span.length < TOLERANCE) {
        throw new GeometryError(
            "border has no extent along the measurement direction; the dimension would be degenerate",
        );
    }
    return makeLine(start, start.add(span));
}

/**
 * The offset vector reduced to build123d's signed distance: its length, signed by which side of
 * the dimension line it points to.
 */
function signedDistance(objectToDimension: Edge | Wire, offsetVector: Vector): number {
    let direction = objectToDimension
        .positionAt(1)
        .sub(objectToDimension.positionAt(0))
        .normalized();
    if (Math.abs(offsetVector.normalized().dot(direction)) > OFFSET_ANGULAR_DOT_TOL) {
        throw new GeometryError(
            "offset vector must be perpendicular to the dimension line " +
                "(when measurementDirection is given, perpendicular to it)",
        );
    }
    let side = offsetVector.dot(direction.cross(new Vector(0, 0, 1)));
    return side < 0 || Object.is(side, -0) ? -offsetVector.length : offsetVector.length;
}

/** The two lines running from the measured object out to the dimension line. */
function extensionEdges(
    objectToMeasure: Edge | Wire,
    dimensionPath: Edge | Wire,
    signedOffset: number,
): Edge[] {
    let between = (end: 0 | 1, other: 0 | 1): Edge =>
        makeLine(objectToMeasure.positionAt(end), dimensionPath.positionAt(other));
    let straight = [between(0, 0), between(1, 1)];
    // A dimension path built back to front crosses its extension lines over; untangle it.
    return Math.abs(straight[0]!.length - Math.abs(signedOffset)) > 1e-4
        ? [between(0, 1), between(1, 0)]
        : straight;
}
