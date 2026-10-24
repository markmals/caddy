/** Dimension lines: a measurement written between two arrows (build123d `DimensionLine`). */

import type { Face } from "../topology/face.ts";
import type { Shape } from "../topology/shape.ts";
import type { Draft, DimensionTolerance, PathDescriptor } from "./draft.ts";

import { makeLine } from "../curves/edge-makers.ts";
import { GeometryError } from "../errors.ts";
import { Align } from "../geometry/enums.ts";
import { BaseSketchObject } from "../sketch/base-object.ts";
import { Text } from "../text/index.ts";
import { Sketch } from "../topology/composite.ts";
import { Edge } from "../topology/edge.ts";
import { Wire } from "../topology/wire.ts";
import { Arrow } from "./arrows.ts";
import { processPath, sketchLocation } from "./draft.ts";

export interface DimensionLineOptions {
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
}

/**
 * A measurement written along `path` with an arrow at each end (build123d `DimensionLine`),
 * typically used for inside dimensions.
 *
 * The label and arrows are fitted in whichever of three ways suits the length of the path: both
 * inside it, the label inside with the arrows turned outwards, or the label beyond one end.
 */
export class DimensionLine extends BaseSketchObject {
    /**
     * Length of the path that was measured. build123d calls this `dimension`; Caddy's shapes
     * already use that name for their topological dimension.
     */
    readonly measurement: number;

    constructor(path: PathDescriptor, draft: Draft, options: DimensionLineOptions = {}) {
        let built = buildDimensionLine(path, draft, options);
        super(built.faces);
        this.measurement = built.measurement;
    }
}

function buildDimensionLine(
    path: PathDescriptor,
    draft: Draft,
    options: DimensionLineOptions,
): { faces: Face[]; measurement: number } {
    if (!(path instanceof Edge) && !(path instanceof Wire) && path.length > 2) {
        throw new GeometryError("Only two points are allowed for dimension lines");
    }
    let arrows = options.arrows ?? [true, true];
    let arrowCount = arrows.filter(Boolean).length;
    if (arrowCount === 0) {
        throw new GeometryError("No output - no arrows selected");
    }

    let pathObj = processPath(path);
    let pathLength = pathObj.length;
    let labelText = draft.labelFor(pathObj, {
        label: options.label,
        labelAngle: options.labelAngle,
        tolerance: options.tolerance,
    });
    let labelShape = new Text(labelText, draft.fontSize, {
        font: draft.font,
        ...(draft.fontPath === undefined ? {} : { fontPath: draft.fontPath }),
        fontStyle: draft.fontStyle,
        align: Align.Center,
    });
    let labelLength = labelShape.boundingBox().size.x;

    let { shafts, shaftLength } = dimensionShafts(pathObj, draft, labelLength, arrowCount);
    let arrowShapes = shafts.map((shaft, index) => {
        // The trim or the outward line may have reversed the shaft; the head goes on whichever
        // of its ends meets the path.
        let reversed = !shaft.positionAt(index).equals(pathObj.positionAt(index));
        return new Arrow(draft.arrowLength, shaft, draft.lineWidth, {
            headAtStart: reversed === (index === 1),
            headType: draft.headType,
        });
    });
    let drawnArrows = arrowShapes.filter((_arrow, index) => arrows[index] === true);

    // Inside the path, or clear of either end by the width of the arrows and their padding.
    let overage = shaftLength + draft.padAroundText + labelLength / 2;
    let placements = [0.5, -overage / pathLength, 1 + overage / pathLength].map(uValue => {
        let candidate: Shape = new Sketch(drawnArrows);
        // `getAngle` is unsigned, so only a path running along -X reads as turned around.
        let flipLabel = pathObj.tangentAt(uValue).getAngle([1, 0, 0]) >= 180;
        let placedLabel = labelShape.located(sketchLocation(pathObj, uValue, flipLabel));
        let overlap = faceArea(candidate.intersect(placedLabel));
        candidate = candidate.union(placedLabel);
        let covered =
            options.sketch === undefined
                ? overlap
                : overlap + faceArea(candidate.intersect(options.sketch));
        return {
            candidate,
            score: (candidate.area - 10 * covered) / candidate.boundingBox().diagonal,
        };
    });

    // The best score wins; ties go to the last placement tried, as Python's stable sort does.
    let best = placements.reduce((winner, placement) =>
        placement.score >= winner.score ? placement : winner,
    );
    return { faces: [...best.candidate.faces()], measurement: pathLength };
}

/**
 * The two lines the arrows are drawn on: inside the path when the label and arrows fit, else
 * turned outwards from its ends.
 */
function dimensionShafts(
    pathObj: Edge | Wire,
    draft: Draft,
    labelLength: number,
    arrowCount: number,
): { shafts: (Edge | Wire)[]; shaftLength: number } {
    let pathLength = pathObj.length;
    let shaftLength = (pathLength - labelLength) / 2 - draft.padAroundText;
    if (
        labelLength + arrowCount * draft.arrowLength < pathLength &&
        shaftLength > draft.arrowLength / 2
    ) {
        return {
            shafts: [
                pathObj.trim(0, shaftLength / pathLength),
                pathObj.trim(1 - shaftLength / pathLength, 1),
            ],
            shaftLength,
        };
    }
    let reach = 2 * draft.arrowLength;
    let start = pathObj.positionAt(0);
    let end = pathObj.positionAt(1);
    return {
        shafts: [
            makeLine(start, start.sub(pathObj.tangentAt(0).multiply(reach))),
            makeLine(end.add(pathObj.tangentAt(1).multiply(reach)), end),
        ],
        shaftLength: reach,
    };
}

/** Total area of a boolean result, which is empty when the shapes miss each other. */
function faceArea(intersection: Shape | undefined): number {
    return intersection === undefined
        ? 0
        : intersection.faces().reduce((total, face) => total + face.area, 0);
}
