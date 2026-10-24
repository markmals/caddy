/**
 * Mapping Caddy shapes onto the XCAF nodes the STEP writer and reader exchange.
 *
 * build123d walks an assembly tree (`anytree`) when it builds the XDE document. Caddy models
 * assemblies as nested {@link Compound}s instead, so one shape becomes one node: its label and
 * colour go on the product label, and — exactly as build123d does for a leaf `Part`, `Sketch`
 * or `Curve` — its colour is also stamped on the sub-shapes that carry colour in STEP.
 */

import type { io as nativeIo, Shape as NativeShape } from "@roonieone/occt-native";

import { Color } from "../geometry/color.ts";
import { Curve, Part, Sketch } from "../topology/composite.ts";
import { Shape } from "../topology/index.ts";

type SubShapeColors = nativeIo.SubShapeColors;

/** Which sub-shapes inherit the node colour, following build123d's composite classes. */
function subShapeColors(shape: Shape): SubShapeColors {
    if (shape instanceof Part) return "solids";
    if (shape instanceof Sketch) return "faces";
    if (shape instanceof Curve) return "edges";
    return "none";
}

export function toStepNode(shape: Shape): nativeIo.StepWriteNode {
    return {
        shape: shape.wrapped,
        label: shape.label,
        color: shape.color === undefined ? null : Float64Array.from(shape.color.toTuple()),
        subShapeColors: subShapeColors(shape),
        children: [],
    };
}

/** Rebuilds Caddy shapes from the node tree `readStep` returns, carrying labels and colours. */
export function fromStepNodes(nodes: readonly nativeIo.StepNode<NativeShape>[]): Shape[] {
    return nodes.map(node => {
        let shape = Shape.cast(node.shape);
        shape.label = node.label;
        if (node.color !== null) shape.color = Color.fromTuple([...node.color]);
        return shape;
    });
}
