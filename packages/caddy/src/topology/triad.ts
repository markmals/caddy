/** The labelled coordinate-system indicator the joints draw themselves with (build123d
 * `Compound.make_triad`). */

import type { Curve } from "./composite.ts";
import type { Edge } from "./edge.ts";

import { makeLine } from "../curves/edge-makers.ts";
import { makeSpline } from "../curves/spline-makers.ts";
import { Axis } from "../geometry/axis.ts";
import { Align } from "../geometry/enums.ts";
import { Pos } from "../geometry/location.ts";
import { Plane } from "../geometry/plane.ts";
import { mirror } from "../operations/transform.ts";
import { makeText } from "../text/make-text.ts";
import { makeComposite } from "./registry.ts";
import { Wire } from "./wire.ts";

/** The single-stroke CAD font build123d bundles, which keeps the labels one line thick. */
const TRIAD_FONT = "singleline";

/**
 * The three axes of a coordinate system, each `axesScale` long, with an arrow head and a letter
 * at its tip (build123d `Compound.make_triad`). Everything is a curve, so the triad draws as
 * lines rather than as a solid.
 */
export function makeTriad(axesScale: number): Curve {
    let axes = [
        makeLine([0, 0, 0], [axesScale, 0, 0]),
        makeLine([0, 0, 0], [0, axesScale, 0]),
        makeLine([0, 0, 0], [0, 0, axesScale]),
    ];
    let tips = axes.map(axis => new Pos(axis.positionAt(1)));

    // Half of the arrow head, swept back from the tip, mirrored to close it.
    let barb = makeSpline(
        [
            [0, 0, 0],
            [-axesScale / 20, axesScale / 30, 0],
        ],
        {
            tangents: [
                [-1, 0, 0],
                [-1, 1.5, 0],
            ],
        },
    );
    let arrow = new Wire([barb, mirror(barb, Plane.XZ).edges()[0]!]);
    let heads = [
        arrow.moved(tips[0]!),
        arrow.rotate(Axis.Z, 90).moved(tips[1]!),
        arrow.rotate(Axis.Y, -90).moved(tips[2]!),
    ];

    let letters: Edge[] = [
        ...makeText("X", axesScale / 4, {
            font: TRIAD_FONT,
            align: [Align.Min, Align.Center],
        })
            .moved(tips[0]!)
            .edges(),
        ...makeText("Y", axesScale / 4, {
            font: TRIAD_FONT,
            align: [Align.Min, Align.Center],
        })
            .rotate(Axis.Z, 90)
            .moved(tips[1]!)
            .edges(),
        ...makeText("Z", axesScale / 4, {
            font: TRIAD_FONT,
            align: [Align.Center, Align.Min],
        })
            .rotate(Axis.Y, 90)
            .rotate(Axis.X, 90)
            .moved(tips[2]!)
            .edges(),
    ];

    return makeComposite([...axes, ...heads, ...letters], 1) as Curve;
}
