/** Solids and shells of revolution (build123d `Solid.revolve` and `Shell.revolve`). */

import type * as occt from "@roonieone/occt-native";

import { features } from "@roonieone/occt-native";

import type { Axis } from "../../geometry/axis.ts";
import type { Shape } from "../shape.ts";
import type { Shell } from "../shell.ts";
import type { Solid } from "../solid.ts";

import { DEG2RAD } from "../../geometry/constants.ts";
import { Face } from "../face.ts";
import { Wire } from "../wire.ts";
import { castShell, castSolid } from "./cast.ts";

/** Holes in the section; build123d only reads them when the section is a wire. */
export interface RevolveOptions {
    readonly innerWires?: Iterable<Wire>;
}

function nativeAxis(axis: Axis): occt.Axis {
    return { origin: axis.position.toTuple(), direction: axis.direction.toTuple() };
}

/** Turn a 2D section `angle` degrees about `axis`. */
export function revolveSolid(
    section: Face | Wire,
    angle: number,
    axis: Axis,
    options: RevolveOptions = {},
): Solid {
    let profile =
        section instanceof Face ? section : new Face(section, [...(options.innerWires ?? [])]);
    return castSolid("Solid.revolve", () =>
        features.revolve(profile.wrapped, nativeAxis(axis), angle * DEG2RAD),
    );
}

/** Turn a 1D profile `angle` degrees about `axis`. */
export function revolveShell(profile: Shape, angle: number, axis: Axis): Shell {
    let section = new Wire(profile.edges());
    return castShell("Shell.revolve", () =>
        features.revolve(section.wrapped, nativeAxis(axis), angle * DEG2RAD),
    );
}
