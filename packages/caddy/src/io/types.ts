/**
 * The formats Caddy reads and writes, and the per-format options.
 *
 * Options are a discriminated union keyed by `type`, so the compiler only offers the settings
 * a format actually has: there is no STL tolerance on a STEP export.
 */

/** Model length units, ported from build123d's `Unit`. */
export const Unit = {
    Micrometer: "µm",
    Millimeter: "mm",
    Centimeter: "cm",
    Meter: "m",
    Inch: "in",
    Foot: "ft",
} as const;
export type Unit = (typeof Unit)[keyof typeof Unit];

/**
 * Mass units, ported from build123d's `Unit`, which holds lengths and masses in one enum. They
 * are separate here because every length-unit table of the I/O layer is exhaustive, and a STEP
 * file has no use for grams.
 */
export const MassUnit = {
    Gram: "g",
    Kilogram: "kg",
    Pound: "lb",
} as const;
export type MassUnit = (typeof MassUnit)[keyof typeof MassUnit];

/** Metres per model unit, as OCCT's `XCAFDoc_DocumentTool::SetLengthUnit` wants it. */
export const METERS_PER_UNIT: Readonly<Record<Unit, number>> = {
    [Unit.Micrometer]: 1e-6,
    [Unit.Millimeter]: 1e-3,
    [Unit.Centimeter]: 1e-2,
    [Unit.Meter]: 1,
    [Unit.Inch]: 0.0254,
    [Unit.Foot]: 0.3048,
};

/**
 * How much geometric precision STEP records, ported from build123d's `PrecisionMode`
 * (OCCT's `write.precision.mode`).
 */
export const PrecisionMode = { Session: 2, Greatest: 1, Average: 0, Least: -1 } as const;
export type PrecisionMode = (typeof PrecisionMode)[keyof typeof PrecisionMode];

/** File formats `exportCAD`, `serialize` and `importCAD` understand. */
export const CADFileType = {
    /** STEP AP214 through XCAF: geometry plus names, colours and assembly structure. */
    Step: "step",
    /** Triangle mesh; loses exact geometry. */
    Stl: "stl",
    /** OCCT's native text BREP: exact, but only OCCT reads it. */
    Brep: "brep",
    /** OCCT's native BREP in its compact binary encoding (`BinTools`). */
    BrepBinary: "brep-binary",
    /** IGES 5.3. */
    Iges: "iges",
    /** SVG paths and shapes, read as wires and faces. */
    Svg: "svg",
    /** DXF entities, read as edges and wires. */
    Dxf: "dxf",
    /** 3MF triangle meshes, read as solids. */
    ThreeMf: "3mf",
    /** Wavefront OBJ: a triangle soup with optional normals and texture coordinates. */
    Obj: "obj",
    /** glTF 2.0, as JSON with an embedded buffer or as a binary GLB. */
    Gltf: "gltf",
} as const;
export type CADFileType = (typeof CADFileType)[keyof typeof CADFileType];

export interface StepOptions {
    readonly type: typeof CADFileType.Step;
    /** Model units declared in the file. Defaults to millimetres, as build123d does. */
    readonly unit?: Unit;
    /** Write parametric curves alongside the 3D geometry. Defaults to `true`. */
    readonly writePCurves?: boolean;
    /** Defaults to {@link PrecisionMode.Average}. */
    readonly precisionMode?: PrecisionMode;
    /** STEP header originating system. Defaults to `"caddy"`. */
    readonly originatingSystem?: string;
    /** STEP header timestamp; omitted leaves OCCT's own. */
    readonly timestamp?: string | Date;
}

export interface StlOptions {
    readonly type: typeof CADFileType.Stl;
    /** Maximum distance between a curve and its tessellation. Defaults to `1e-3`. */
    readonly tolerance?: number;
    /** Maximum angle, in radians, between polyline segments. Defaults to `0.1`. */
    readonly angularTolerance?: number;
    /** Write ASCII rather than binary STL. Defaults to `false`. */
    readonly ascii?: boolean;
}

export interface BrepOptions {
    readonly type: typeof CADFileType.Brep | typeof CADFileType.BrepBinary;
}

export interface ObjOptions {
    readonly type: typeof CADFileType.Obj;
    /** Maximum distance between a curve and its tessellation. Defaults to `1e-3`. */
    readonly tolerance?: number;
    /** Maximum angle, in radians, between polyline segments. Defaults to `0.1`. */
    readonly angularTolerance?: number;
    /** Write per-vertex normals and texture coordinates. Defaults to `true`. */
    readonly includeUvs?: boolean;
    /** Pack every face's UVs into one atlas rather than normalising each face. Defaults to `true`. */
    readonly atlasPacking?: boolean;
    /** Empty margin kept around every packed island, in atlas units. Defaults to `0`. */
    readonly atlasGutter?: number;
}

export interface GltfOptions {
    readonly type: typeof CADFileType.Gltf;
    /** Model units the geometry is in; glTF itself is always metres. Defaults to millimetres. */
    readonly unit?: Unit;
    /** Write a binary GLB rather than JSON. Defaults to `false`. */
    readonly binary?: boolean;
    /** Maximum distance between a curve and its tessellation. Defaults to `1e-3`. */
    readonly tolerance?: number;
    /** Maximum angle, in radians, between polyline segments. Defaults to `0.1`. */
    readonly angularTolerance?: number;
}

export interface IgesOptions {
    readonly type: typeof CADFileType.Iges;
    /** IGES unit name written in the global section. Defaults to `"MM"`. */
    readonly unit?: Unit;
    /** Write faces as BREP entities (`true`) rather than trimmed surfaces. Defaults to `false`. */
    readonly brepEntities?: boolean;
}

/** Everything `serialize` accepts; `exportCAD` adds the destination `name`. */
export type FormatOptions =
    | StepOptions
    | StlOptions
    | BrepOptions
    | IgesOptions
    | ObjOptions
    | GltfOptions;

/** `FormatOptions` plus the path to write. */
export type ExportOptions = FormatOptions & { readonly name: string };

export interface ImportOptions {
    /**
     * Format of `source`. Required for bytes; for a path it overrides the extension, which is
     * otherwise the only hint (`.step`/`.stp`, `.stl`, `.brep`/`.brp`, `.iges`/`.igs`).
     */
    readonly type?: CADFileType;
}

/** IGES unit names; OCCT writes these verbatim into the global section. */
export const IGES_UNIT_NAMES: Readonly<Record<Unit, string>> = {
    [Unit.Micrometer]: "UM",
    [Unit.Millimeter]: "MM",
    [Unit.Centimeter]: "CM",
    [Unit.Meter]: "M",
    [Unit.Inch]: "IN",
    [Unit.Foot]: "FT",
};
