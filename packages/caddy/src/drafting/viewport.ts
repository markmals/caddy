// Hidden-line projection of a shape onto a viewport (build123d `Shape.project_to_viewport`).

import type * as occt from "@roonieone/occt-native";

import { hlr } from "@roonieone/occt-native";

import type { VectorLike } from "../geometry/vector.ts";
import type { Edge, Shape } from "../topology/index.ts";

import { Vector } from "../geometry/vector.ts";
import { native } from "../topology/kernel.ts";
import { castShape } from "../topology/registry.ts";
import { ShapeList } from "../topology/shape-list.ts";

/** Camera settings for {@link projectToViewport}. */
export interface ViewportOptions {
    /** Direction of the viewport's y axis. Defaults to `[0, 0, 1]`. */
    readonly viewportUp?: VectorLike;
    /** Point the camera looks at. Defaults to the shape's centre. */
    readonly lookAt?: VectorLike;
    /** Focal length of a perspective projection; omitted for an orthographic one. */
    readonly focus?: number;
}

/**
 * Project `shape` onto a viewport placed at `viewportOrigin`, returning the visible and the
 * hidden edges of the projection.
 */
export function projectToViewport(
    shape: Shape,
    viewportOrigin: VectorLike,
    options: ViewportOptions = {},
): [visible: ShapeList<Edge>, hidden: ShapeList<Edge>] {
    let origin = Vector.from(viewportOrigin);
    let lookAt = options.lookAt === undefined ? shape.center : Vector.from(options.lookAt);
    let camera: occt.hlr.Camera = {
        origin: origin.toTuple(),
        direction: origin.sub(lookAt).normalized().toTuple(),
        up: Vector.from(options.viewportUp ?? [0, 0, 1])
            .normalized()
            .toTuple(),
        ...(options.focus === undefined ? {} : { focus: options.focus }),
    };

    let projected = native("Viewport projection", () => hlr.hiddenLineEdges(shape.wrapped, camera));
    return [
        new ShapeList(projected.visible.map(wrapped => castShape(wrapped) as Edge)),
        new ShapeList(projected.hidden.map(wrapped => castShape(wrapped) as Edge)),
    ];
}
