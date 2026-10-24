import { booleans, features } from "@roonieone/occt-native";

import type { VectorLike } from "../geometry/index.ts";

import { GeometryError, NativeKernelError } from "../errors.ts";
import { Plane, Vector } from "../geometry/index.ts";
import { Part, Sketch } from "../topology/composite.ts";
import { Edge } from "../topology/edge.ts";
import { Face } from "../topology/face.ts";
import { Shape } from "../topology/shape.ts";
import { Wire } from "../topology/wire.ts";

/** How a sweep carries the profile through a corner in the path (build123d `Transition`). */
export const Transition = {
    Right: "RIGHT",
    Round: "ROUND",
    Transformed: "TRANSFORMED",
} as const;

export type Transition = (typeof Transition)[keyof typeof Transition];

const TRANSITION_MODES: Record<Transition, 0 | 1 | 2> = {
    [Transition.Transformed]: 0,
    [Transition.Right]: 1,
    [Transition.Round]: 2,
};

export interface SweepOptions {
    readonly multisection?: boolean;
    readonly isFrenet?: boolean;
    readonly transition?: Transition;
    readonly normal?: VectorLike;
    readonly binormal?: Wire;
    readonly clean?: boolean;
}

export function sweep(
    sections: Face | Edge | Wire | readonly (Face | Edge | Wire)[],
    path: Edge | Wire,
    options: SweepOptions = {},
): Part | Sketch {
    let profiles = Array.isArray(sections) ? sections : [sections];
    if (profiles.length === 0) throw new GeometryError("Sweep requires one or more profiles");
    let spine = path instanceof Edge ? new Wire([path]) : path;
    let normal = options.normal === undefined ? undefined : Vector.from(options.normal);
    let frame =
        normal === undefined ? undefined : new Plane({ origin: path.positionAt(0), zDir: normal });
    let sweepOptions = {
        solid: true,
        frenet: options.isFrenet ?? false,
        transition: TRANSITION_MODES[options.transition ?? Transition.Transformed],
        ...(frame === undefined
            ? {}
            : {
                  normalFrame: {
                      origin: frame.origin.toTuple(),
                      zDirection: frame.zDir.toTuple(),
                      xDirection: frame.xDir.toTuple(),
                  },
              }),
        ...(options.binormal === undefined ? {} : { auxiliary: options.binormal.wrapped }),
    };
    let faces = profiles.filter((profile): profile is Face => profile instanceof Face);
    if (faces.length > 0 && faces.length !== profiles.length) {
        throw new GeometryError("Sweep profiles must all be faces or all be edges and wires");
    }
    try {
        if (faces.length > 0) {
            let profilesToSweep = options.multisection ? [faces] : faces.map(face => [face]);
            let solids = profilesToSweep.map(group => {
                let outer = features.sweep(
                    spine.wrapped,
                    group.map(face => face.outerWire.wrapped),
                    sweepOptions,
                );
                if (group.length !== 1 || group[0]!.innerWires.length === 0)
                    return Shape.cast(outer);
                let holes = group[0]!.innerWires.map(wire =>
                    features.sweep(spine.wrapped, [wire.wrapped], sweepOptions),
                );
                return Shape.cast(booleans.cut([outer], holes));
            });
            let part = new Part(solids);
            return options.clean === false ? part : new Part(part.clean().wrapped);
        }
        // OCCT's pipe shell only takes a wire section, so a loose edge becomes a one-edge wire,
        // and build123d keeps the faces the shell produced — cleaned one by one — not the shell.
        let swept = profiles.flatMap(profile => [
            ...Shape.cast(
                features.sweep(
                    spine.wrapped,
                    [profile instanceof Edge ? new Wire([profile]).wrapped : profile.wrapped],
                    { ...sweepOptions, solid: false },
                ),
            ).faces,
        ]);
        return new Sketch(options.clean === false ? swept : swept.map(face => face.clean()));
    } catch (cause) {
        throw new NativeKernelError("Sweep failed", { cause });
    }
}
