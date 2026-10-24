/** Faces swept from a single curve: extruded, revolved and piped along a path. */

import { features } from "@roonieone/occt-native";

import type { Axis } from "../geometry/axis.ts";
import type { VectorLike } from "../geometry/vector.ts";
import type { Transition } from "../operations/sweep.ts";
import type { Curve } from "./composite.ts";
import type { Edge } from "./edge.ts";
import type { Face } from "./face.ts";

import { castFace } from "../curves/cast.ts";
import { InvalidShapeError } from "../errors.ts";
import { DEG2RAD } from "../geometry/constants.ts";
import { Vector } from "../geometry/vector.ts";
import { Shape } from "./shape.ts";
import { Wire } from "./wire.ts";

/** OCCT BRepBuilderAPI_TransitionMode, in the order the addon expects. */
const TRANSITION_MODES: Record<Transition, 0 | 1 | 2> = {
    TRANSFORMED: 0,
    RIGHT: 1,
    ROUND: 2,
};

/** Options of {@link Face.sweep}. */
export interface FaceSweepOptions {
    /** How the profile turns through a corner in the path; defaults to `Transition.Transformed`. */
    readonly transition?: Transition;
    /** Whether to merge the swept faces afterwards; defaults to true. */
    readonly clean?: boolean;
}

/** The face an edge sweeps out when moved along `direction` (build123d `Face.extrude`). */
export function extrudeEdgeToFace(profile: Edge, direction: VectorLike): Face {
    return castFace("Face.extrude", () =>
        features.extrude(profile.wrapped, Vector.from(direction).toTuple()),
    );
}

/** The face an edge sweeps out turning `angle` degrees about `axis` (build123d `Face.revolve`). */
export function revolveEdgeToFace(profile: Edge, angle: number, axis: Axis): Face {
    return castFace("Face.revolve", () =>
        features.revolve(
            profile.wrapped,
            { origin: axis.position.toTuple(), direction: axis.direction.toTuple() },
            angle * DEG2RAD,
        ),
    );
}

/**
 * The face a single-edge profile sweeps out along a single-edge path (build123d `Face.sweep`).
 *
 * OCCT pipes the profile into a shell; build123d keeps the shell but labels it a `Face`, so the
 * single face inside it is what Caddy returns.
 */
export function sweepEdgeToFace(
    profile: Curve | Edge | Wire,
    path: Curve | Edge | Wire,
    options: FaceSweepOptions = {},
): Face {
    if (profile.edges().length !== 1 || path.edges().length !== 1) {
        throw new InvalidShapeError("Use Shell.sweep for multi Edge objects");
    }
    let swept = Shape.cast(
        features.sweep(
            new Wire([path.edges()[0]!]).wrapped,
            [new Wire([profile.edges()[0]!]).wrapped],
            {
                solid: false,
                frenet: false,
                transition: TRANSITION_MODES[options.transition ?? "TRANSFORMED"],
            },
        ),
    );
    let cleaned = options.clean === false ? swept : swept.clean();
    let faces = cleaned.faces();
    if (faces.length !== 1) {
        throw new InvalidShapeError(`Sweeping produced ${faces.length} faces, not one`);
    }
    return faces.first;
}
