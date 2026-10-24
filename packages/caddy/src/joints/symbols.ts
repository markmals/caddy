/**
 * The CAD symbols build123d draws for its joints: a line for an axis of motion, a circle for the
 * radius it sweeps, a marker on the direction angles are measured from, and — for the joints that
 * carry a whole coordinate system — a labelled triad or a labelled gimbal.
 */

import type { Plane } from "../geometry/plane.ts";

import { Align } from "../geometry/enums.ts";
import { Rotation } from "../geometry/location.ts";
import { Compound, Edge } from "../topology/index.ts";

/** The single-stroke CAD font build123d labels its joint symbols with. */
const SYMBOL_FONT = "singleline";

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

/**
 * The gimbal a ball joint turns in: one labelled circle of `radius` per axis, the X circle on
 * `angleReference` and the other two square to it (build123d `BallJoint.symbol`).
 */
export function gimbalSymbol(radius: number, angleReference: Plane): Compound {
    let circles = [
        Edge.makeCircle(radius, { plane: angleReference }),
        Edge.makeCircle(radius, { plane: angleReference.rotated([90, 0, 0]) }),
        Edge.makeCircle(radius, { plane: angleReference.rotated([0, 90, 0]) }),
    ];
    // Each letter stands upright on its own circle, an eighth of a turn from where it starts;
    // the Y circle is read from the far side, so its letter sits five eighths along.
    let letters = (["X", "Y", "Z"] as const).map((letter, index) =>
        Compound.makeText(letter, radius / 5, {
            font: SYMBOL_FONT,
            align: [Align.Center, Align.Center],
        }).located(
            circles[index]!.locationAt(letter === "Y" ? 0.625 : 0.125).multiply(
                new Rotation(90, 0, 0),
            ),
        ),
    );
    return new Compound([...circles, ...letters]);
}
