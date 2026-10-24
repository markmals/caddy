/**
 * Writing shapes out.
 *
 * Two entry points, one encoder: {@link serialize} returns the bytes, {@link exportCAD} writes
 * them to `options.name`. Everything heavy happens on Node's worker pool inside the addon, so
 * both are asynchronous; the shape itself is deep-copied before the work starts and stays
 * usable (see `docs/native-bindings.md`).
 */

import { io, mesh } from "@roonieone/occt-native";
import { writeFile } from "node:fs/promises";

import type { ExportOptions, FormatOptions } from "./types.ts";

import { ExportError } from "../errors.ts";
import { Shape } from "../topology/index.ts";
import { toStepNode } from "./assembly.ts";
import { CADFileType, IGES_UNIT_NAMES, METERS_PER_UNIT, PrecisionMode, Unit } from "./types.ts";

/** Encodes `shape` in memory. The returned bytes are exactly what {@link exportCAD} writes. */
export async function serialize(shape: Shape, options: FormatOptions): Promise<Uint8Array> {
    if (shape.isNull) {
        throw new ExportError(`cannot export an empty ${shape.constructor.name}`);
    }
    try {
        return await encode(shape, options);
    } catch (cause) {
        throw new ExportError(`cannot export ${shape.toString()} as ${options.type}`, { cause });
    }
}

/**
 * Writes `shape` to the path in `options.name`.
 *
 * Also exported as `export` from the package root — `export` cannot be a binding name, so the
 * implementation is called `exportCAD` and re-exported under both names.
 */
export async function exportCAD(shape: Shape, options: ExportOptions): Promise<void> {
    let bytes = await serialize(shape, options);
    try {
        await writeFile(options.name, bytes);
    } catch (cause) {
        throw new ExportError(`cannot write ${options.name}`, { cause });
    }
}

function encode(shape: Shape, options: FormatOptions): Promise<Uint8Array> {
    switch (options.type) {
        case CADFileType.Brep:
            return io.writeBrep(shape.wrapped, false);
        case CADFileType.BrepBinary:
            return io.writeBrep(shape.wrapped, true);
        case CADFileType.Stl:
            return mesh.writeStl(
                shape.wrapped,
                {
                    tolerance: options.tolerance ?? mesh.DEFAULT_MESH_OPTIONS.tolerance,
                    angularTolerance:
                        options.angularTolerance ?? mesh.DEFAULT_MESH_OPTIONS.angularTolerance,
                },
                options.ascii ?? false,
            );
        case CADFileType.Iges:
            return io.writeIges(
                shape.wrapped,
                IGES_UNIT_NAMES[options.unit ?? Unit.Millimeter],
                options.brepEntities === true ? 1 : 0,
            );
        case CADFileType.Step:
            return io.writeStep(toStepNode(shape), {
                lengthUnitMeters: METERS_PER_UNIT[options.unit ?? Unit.Millimeter],
                writePCurves: options.writePCurves ?? true,
                precisionMode: options.precisionMode ?? PrecisionMode.Average,
                originatingSystem: options.originatingSystem ?? "caddy",
                name: shape.label,
                timestamp: timestamp(options.timestamp),
            });
    }
}

function timestamp(value: string | Date | undefined): string {
    if (value === undefined) return "";
    return value instanceof Date ? value.toISOString() : value;
}
