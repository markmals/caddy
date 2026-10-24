// Importing this module registers every shape class with `Shape.cast`; import shapes from here
// (or the package root) rather than from the individual class modules.
export { Shape } from "./shape.ts";
export type {
    BoundingBoxOptions,
    FuseOptions,
    IntersectOptions,
    MassOptions,
    MoveOptions,
    ShapeOperand,
    ShapeOptions,
    SubShapeOptions,
    TouchOptions,
} from "./shape.ts";
export { Vertex } from "./vertex.ts";
export { Mixin1D } from "./mixin1d.ts";
export type { CommonPlaneOptions, CurvePosition, LocationAtOptions } from "./mixin1d.ts";
export { Edge } from "./edge.ts";
export { Wire } from "./wire.ts";
export type { WireOptions, WireSource } from "./wire.ts";
export { Mixin2D } from "./mixin2d.ts";
export { Face } from "./face.ts";
export { Shell } from "./shell.ts";
export { Mixin3D } from "./mixin3d.ts";
export { Solid } from "./solid.ts";
export { Compound } from "./compound.ts";
export type { CompoundSource, UnwrapOptions } from "./compound.ts";
export { Curve, Part, Sketch } from "./composite.ts";
export { ShapeList } from "./shape-list.ts";
export type { FilterOptions, GroupOptions, SortCriterion, SortOptions } from "./shape-list.ts";
export { GroupBy } from "./group-by.ts";
export type { GroupKey } from "./group-by.ts";
export type { CurveLike, ShapeFilter } from "./selectors.ts";
export {
    CenterOf,
    Convexity,
    FrameMethod,
    GeomType,
    Keep,
    PositionMode,
    Select,
    SortBy,
} from "./enums.ts";
export type { ShapeTypeName } from "./enums.ts";
export { ShapeHistory } from "./shape-history.ts";
export * from "./helpers/index.ts";
