/**
 * The CAD symbols build123d draws for the joints that move along or about an axis: a line for
 * the axis, a circle for the radius it sweeps and, when the joint turns, a marker on the
 * direction angles are measured from.
 *
 * `RigidJoint.symbol` and `BallJoint.symbol` are not ported: they label their axes with
 * `Compound.make_triad` / `Compound.make_text`, which need the FreeType support this build of
 * OCCT is compiled without.
 */

import { Compound, Edge } from "../topology/index.ts";

export interface AxisSymbolOptions {
    /** Where the axis line starts and ends, along Z. */
    readonly from: number;
    readonly to: number;
    readonly radius: number;
    /** Draw the radius along X, showing where zero degrees points. */
    readonly angleMarker?: boolean;
}

export function axisSymbol(options: AxisSymbolOptions): Compound {
    let edges = [
        Edge.makeLine([0, 0, options.from], [0, 0, options.to]),
        Edge.makeCircle(options.radius),
    ];
    if (options.angleMarker === true) {
        edges.push(Edge.makeLine([0, 0, 0], [options.radius, 0, 0]));
    }
    return new Compound(edges);
}
