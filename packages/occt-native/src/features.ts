import type { Axis, Frame, Shape, Vec3 } from "./types.ts";

import { addon } from "./addon.ts";
import { axisArray, frameArray } from "./types.ts";

/**
 * Result of a draft: `shape` is the drafted solid, or null when OCCT refused. `failedFace` then
 * indexes the offending face (-1 when the build itself failed) and `problematic` is the
 * sub-shape OCCT blamed, when it named one.
 */
export interface DraftOutcome {
    readonly shape: Shape | null;
    readonly problematic: Shape | null;
    readonly failedFace: number;
}

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
    featureDraft(
        solid: Shape,
        faces: readonly Shape[],
        frame: Float64Array,
        angle: number,
    ): DraftOutcome;
    featureProject(profile: Shape, target: Shape, direction: Float64Array): Shape;
    featureHollow(
        shape: Shape,
        thickness: number,
        faces: readonly Shape[],
        kind: number,
        tolerance: number,
    ): Shape;
    featureDPrism(
        base: Shape,
        profile: Shape,
        basis: Shape | null,
        upTo: Shape | null,
        taper: number,
        additive: boolean,
        depth: number,
        thruAll: boolean,
    ): Shape;
    featureSewSolid(faces: readonly Shape[], tolerance: number): Shape;
    featureSew(faces: readonly Shape[], tolerance: number): Shape;
    featureSplitByPerimeter(
        shape: Shape,
        edges: readonly Shape[],
    ): { left: Shape[]; right: Shape[] };
    featureProjectFrom(profile: Shape, target: Shape, center: Float64Array): Shape;
    projectionAxisHits(
        shape: Shape,
        axis: Float64Array,
        tolerance: number,
    ): { points: number[]; faces: Shape[] };
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
): DraftOutcome {
    return native().featureDraft(solid, faces, frameArray(neutralPlane), angleRadians);
}

export function project(profile: Shape, target: Shape, direction: Vec3): Shape {
    return native().featureProject(profile, target, Float64Array.from(direction));
}

export function projectFrom(profile: Shape, target: Shape, center: Vec3): Shape {
    return native().featureProjectFrom(profile, target, Float64Array.from(center));
}

export function hollow(
    shape: Shape,
    thickness: number,
    faces: readonly Shape[] = [],
    kind: 0 | 1 = 0,
    tolerance = 1e-4,
): Shape {
    return native().featureHollow(shape, thickness, faces, kind, tolerance);
}

export function dprism(
    base: Shape,
    profile: Shape,
    options: {
        basis?: Shape;
        upTo?: Shape;
        taperRadians?: number;
        additive?: boolean;
        depth?: number;
        thruAll?: boolean;
    } = {},
): Shape {
    return native().featureDPrism(
        base,
        profile,
        options.basis ?? null,
        options.upTo ?? null,
        options.taperRadians ?? 0,
        options.additive ?? true,
        options.depth ?? 0,
        options.thruAll ?? true,
    );
}

export function sewSolid(faces: readonly Shape[], tolerance = 1e-6): Shape {
    return native().featureSewSolid(faces, tolerance);
}

export function sew(faces: readonly Shape[], tolerance = 1e-6): Shape {
    return native().featureSew(faces, tolerance);
}

export function splitByPerimeter(
    shape: Shape,
    edges: readonly Shape[],
): { left: Shape[]; right: Shape[] } {
    return native().featureSplitByPerimeter(shape, edges);
}

/** Hits of an infinite axis on a shape's surfaces, ordered along the axis direction. */
export function axisHits(
    shape: Shape,
    axis: Axis,
    tolerance = 1e-4,
): { points: number[]; faces: Shape[] } {
    return native().projectionAxisHits(shape, axisArray(axis), tolerance);
}
