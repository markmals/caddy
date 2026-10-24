import type { Shape as NativeShape } from "@roonieone/occt-native";

import type { Align3DLike, RotationLike } from "../geometry/index.ts";

import { Align, Rotation } from "../geometry/index.ts";
import { Part } from "../topology/composite.ts";
import { rebuilt } from "../topology/rebuild.ts";
import { makePartShape } from "./placement.ts";

/** Placement shared by part primitives: rotation applied after aligning the bounding box. */
export interface PartPlacement {
    /** Degrees about X, Y and Z (or a `Rotation`); defaults to none. */
    readonly rotation?: RotationLike;
    /** Bounding-box alignment per axis; defaults to centred on every axis. */
    readonly align?: Align3DLike;
}

/**
 * The base of every part primitive (build123d `BasePartObject`): a solid built at the origin, then
 * aligned and rotated.
 */
export abstract class BasePartObject extends Part {
    /** The rotation applied after aligning. */
    readonly rotation: Rotation;

    constructor(build: () => NativeShape, placement: PartPlacement = {}) {
        let rotation = placement.rotation ?? [0, 0, 0];
        super(makePartShape(build, placement.align ?? Align.Center, rotation));
        this.rotation = rotation instanceof Rotation ? rotation : new Rotation(rotation);
    }

    /**
     * build123d moves a part by copying the Python object and swapping its `wrapped` shape, so a
     * moved `Box` is still a `Box` that knows its dimensions. Part constructors take dimensions
     * rather than a shape, so the copy is built through `Part` under this object's prototype and
     * the dimensions are carried over.
     */
    protected override withWrapped(wrapped: NativeShape): this {
        return rebuilt(this, Part, wrapped);
    }
}
