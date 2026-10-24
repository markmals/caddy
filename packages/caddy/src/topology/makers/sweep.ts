/**
 * Swept solids and shells (build123d `Solid.sweep`, `Solid.sweep_multi` and `Shell.sweep`): a
 * cross section carried along a path by OCCT's pipe shell.
 */

import type * as occt from "@roonieone/occt-native";

import { features } from "@roonieone/occt-native";

import type { VectorLike } from "../../geometry/vector.ts";
import type { Transition } from "../../operations/sweep.ts";
import type { Edge } from "../edge.ts";
import type { Shape } from "../shape.ts";
import type { Shell } from "../shell.ts";
import type { Solid } from "../solid.ts";

import { Vector } from "../../geometry/vector.ts";
import { booleanCut } from "../boolean.ts";
import { Face } from "../face.ts";
import { Wire } from "../wire.ts";
import { castShell, castSolid } from "./cast.ts";

/** OCCT BRepBuilderAPI_TransitionMode, in the order the addon expects. */
const TRANSITION_MODES: Record<Transition, 0 | 1 | 2> = {
    TRANSFORMED: 0,
    RIGHT: 1,
    ROUND: 2,
};

/** OCCT `Precision::Angular()`, the tolerance `gp_Ax2::SetDirection` compares against. */
const ANGULAR_PRECISION = 1e-12;

/** How the profile is carried along the path, shared by every sweep. */
export interface SweepModeOptions {
    /** Orient the profile by the path's curvature instead of keeping it steady. */
    readonly isFrenet?: boolean;
    /** Fixed binormal: every section stays parallel to the frame it fixes. */
    readonly normal?: VectorLike;
    /** Auxiliary spine the profile follows (build123d's `mode`/`binormal` as a curve). */
    readonly binormal?: Edge | Wire;
}

export interface SolidSweepOptions extends SweepModeOptions {
    /** Holes in the section; build123d only reads them when the section is a wire. */
    readonly innerWires?: Iterable<Wire>;
    /** Close the swept surface into a solid; defaults to true. */
    readonly makeSolid?: boolean;
    /** Profile orientation at corners of the path. */
    readonly transition?: Transition;
}

/** What the addon's pipe shell needs beyond the path and the sections. */
interface PipeShellSettings {
    readonly solid: boolean;
    readonly frenet: boolean;
    readonly transition: 0 | 1 | 2;
    readonly normalFrame?: occt.Frame;
    readonly auxiliary?: occt.Shape;
}

/**
 * The frame build123d hands to the pipe shell for a fixed binormal: it sets the direction on a
 * default `gp_Ax2`, so the world X axis stays the frame's X direction unless it is parallel to
 * `direction` (OCCT gp_Ax2::SetDirection).
 */
function binormalFrame(origin: Vector, direction: VectorLike): occt.Frame {
    let normal = Vector.from(direction).normalized();
    let alongX = normal.x;
    let xDirection =
        Math.abs(Math.abs(alongX) - 1) <= ANGULAR_PRECISION
            ? alongX > 0
                ? new Vector(0, 1, 0)
                : new Vector(0, 0, 1)
            : new Vector(1, 0, 0).sub(normal.multiply(alongX)).normalized();
    return {
        origin: origin.toTuple(),
        zDirection: normal.toTuple(),
        xDirection: xDirection.toTuple(),
    };
}

function sweepSettings(
    path: Edge | Wire,
    options: SweepModeOptions & { readonly transition?: Transition; readonly makeSolid?: boolean },
): PipeShellSettings {
    return {
        solid: options.makeSolid ?? true,
        frenet: options.isFrenet ?? false,
        transition: TRANSITION_MODES[options.transition ?? "TRANSFORMED"],
        ...(options.normal === undefined
            ? {}
            : { normalFrame: binormalFrame(path.positionAt(0), options.normal) }),
        ...(options.binormal === undefined
            ? {}
            : { auxiliary: new Wire(options.binormal).wrapped }),
    };
}

/**
 * Sweep a 2D section along `path`. Holes are swept separately and cut from the result, as
 * build123d does.
 */
export function sweepSolid(
    section: Face | Wire,
    path: Edge | Wire,
    options: SolidSweepOptions = {},
): Solid | Shell {
    let outer = section instanceof Face ? section.outerWire() : section;
    let inner = section instanceof Face ? section.innerWires() : [...(options.innerWires ?? [])];
    let spine = new Wire(path).wrapped;
    let settings = sweepSettings(path, options);
    let swept = (wire: Wire): Solid =>
        castSolid("Solid.sweep", () => features.sweep(spine, [wire.wrapped], settings));
    if (inner.length === 0) {
        return (options.makeSolid ?? true)
            ? swept(outer)
            : castShell("Solid.sweep", () => features.sweep(spine, [outer.wrapped], settings));
    }
    return booleanCut(swept(outer), inner.map(swept)) as Solid;
}

/**
 * Sweep through a sequence of sections along `path` (build123d `Solid.sweep_multi`). Unlike
 * `sweepSolid` there is no open-shell variant: build123d's `make_solid=False` raises inside OCP.
 */
export function sweepMulti(
    profiles: Iterable<Wire | Face>,
    path: Edge | Wire,
    options: SweepModeOptions = {},
): Solid {
    let sections = [...profiles].map(profile =>
        profile instanceof Face ? profile.outerWire().wrapped : profile.wrapped,
    );
    let spine = new Wire(path).wrapped;
    let settings = sweepSettings(path, options);
    return castSolid("Solid.sweepMulti", () => features.sweep(spine, sections, settings));
}

/**
 * Sweep a 1D profile along a 1D path (build123d `Shell.sweep`). The path's edges are reordered
 * end to start first, and the result is cleaned, as build123d does.
 */
export function sweepShell(
    profile: Shape,
    path: Shape,
    options: { readonly transition?: Transition } = {},
): Shell {
    let section = new Wire(profile.edges());
    let spine = new Wire(new Wire(path.edges()).orderEdges());
    let shell = castShell("Shell.sweep", () =>
        features.sweep(spine.wrapped, [section.wrapped], {
            solid: false,
            frenet: false,
            transition: TRANSITION_MODES[options.transition ?? "TRANSFORMED"],
        }),
    );
    return shell.clean();
}
