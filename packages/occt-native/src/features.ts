import type { Axis, Frame, Shape, Vec3 } from "./types.ts";

import { addon } from "./addon.ts";
import { axisArray, frameArray } from "./types.ts";

interface FeatureAddon {
    featureExtrude(profile: Shape, direction: Float64Array): Shape;
    featureExtrudeTaper(profile: Shape, height: number, angle: number): Shape;
    featureRevolve(profile: Shape, axis: Float64Array, angle: number): Shape;
    featureLoft(sections: readonly Shape[], ruled: boolean, solid: boolean): Shape;
    featureSweep(
        path: Shape,
        sections: readonly Shape[],
        solid: boolean,
        frenet: boolean,
        transition: number,
        frame: Float64Array,
        auxiliary: Shape | null,
    ): Shape;
    featureFillet(solid: Shape, edges: readonly Shape[], radius: number): Shape;
    featureChamfer(
        solid: Shape,
        edges: readonly Shape[],
        distance: number,
        second: number,
        angle: boolean,
        references: readonly Shape[],
    ): Shape;
    featureOffset(
        shape: Shape,
        amount: number,
        openings: readonly Shape[],
        kind: number,
        tolerance: number,
    ): Shape;
    featureThicken(surface: Shape, amount: number): Shape;
    featureDraft(solid: Shape, faces: readonly Shape[], frame: Float64Array, angle: number): Shape;
    featureProject(profile: Shape, target: Shape, direction: Float64Array): Shape;
}

function native(): FeatureAddon {
    return addon<FeatureAddon>();
}

export function extrude(profile: Shape, direction: Vec3): Shape {
    return native().featureExtrude(profile, Float64Array.from(direction));
}

export function extrudeTaper(profile: Shape, height: number, angleRadians: number): Shape {
    return native().featureExtrudeTaper(profile, height, angleRadians);
}

export function revolve(profile: Shape, axis: Axis, angleRadians: number): Shape {
    return native().featureRevolve(profile, axisArray(axis), angleRadians);
}

export function loft(sections: readonly Shape[], ruled = false, solid = true): Shape {
    return native().featureLoft(sections, ruled, solid);
}

export function sweep(
    path: Shape,
    sections: readonly Shape[],
    options: {
        solid?: boolean;
        frenet?: boolean;
        transition?: 0 | 1 | 2;
        normalFrame?: Frame;
        auxiliary?: Shape;
    } = {},
): Shape {
    return native().featureSweep(
        path,
        sections,
        options.solid ?? true,
        options.frenet ?? false,
        options.transition ?? 0,
        options.normalFrame ? frameArray(options.normalFrame) : new Float64Array(),
        options.auxiliary ?? null,
    );
}

export function fillet(solid: Shape, edges: readonly Shape[], radius: number): Shape {
    return native().featureFillet(solid, edges, radius);
}

export function chamfer(
    solid: Shape,
    edges: readonly Shape[],
    distance: number,
    second: number,
    references: readonly Shape[],
    angle = false,
): Shape {
    return native().featureChamfer(solid, edges, distance, second, angle, references);
}

export function offset(
    shape: Shape,
    amount: number,
    openings: readonly Shape[] = [],
    kind: 0 | 1 = 0,
    tolerance = 1e-4,
): Shape {
    return native().featureOffset(shape, amount, openings, kind, tolerance);
}

export function thicken(surface: Shape, amount: number): Shape {
    return native().featureThicken(surface, amount);
}

export function draft(
    solid: Shape,
    faces: readonly Shape[],
    neutralPlane: Frame,
    angleRadians: number,
): Shape {
    return native().featureDraft(solid, faces, frameArray(neutralPlane), angleRadians);
}

export function project(profile: Shape, target: Shape, direction: Vec3): Shape {
    return native().featureProject(profile, target, Float64Array.from(direction));
}
