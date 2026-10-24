// Importing this module registers every shape class with `Shape.cast`; import shapes from here
// (or the package root) rather than from the individual class modules.
export { Shape } from "./shape.ts";
export type { FuseOptions, ShapeOperand, ShapeOptions } from "./shape.ts";
export { Vertex } from "./vertex.ts";
export { Mixin1D } from "./mixin1d.ts";
export type { CurvePosition } from "./mixin1d.ts";
export { Edge } from "./edge.ts";
export { Wire } from "./wire.ts";
export type { WireOptions, WireSource } from "./wire.ts";
export { Mixin2D } from "./mixin2d.ts";
export { Face } from "./face.ts";
export { Shell } from "./shell.ts";
export { Mixin3D } from "./mixin3d.ts";
export { Solid } from "./solid.ts";
export { Compound } from "./compound.ts";
export type { CompoundSource } from "./compound.ts";
export { Curve, Part, Sketch } from "./composite.ts";
export { ShapeList } from "./shape-list.ts";
export type { FilterOptions, GroupOptions, SortCriterion } from "./shape-list.ts";
export { GroupBy } from "./group-by.ts";
export type { GroupKey } from "./group-by.ts";
export type { CurveLike, ShapeFilter } from "./selectors.ts";
export { CenterOf, FrameMethod, GeomType, Keep, PositionMode, SortBy } from "./enums.ts";
export type { ShapeTypeName } from "./enums.ts";
