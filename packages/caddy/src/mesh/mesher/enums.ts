/** 3MF mesh classification and the unit names the format uses. */

import type { Unit } from "../../io/types.ts";

import { ImportError } from "../../errors.ts";
import { Unit as Units } from "../../io/types.ts";

/** What a mesh is for when the model is printed (build123d `MeshType`). */
export const MeshType = {
    Other: "OTHER",
    Model: "MODEL",
    Support: "SUPPORT",
    SolidSupport: "SOLIDSUPPORT",
} as const;
export type MeshType = (typeof MeshType)[keyof typeof MeshType];

/** The `type` attribute of a 3MF object. */
export const MESH_TYPE_NAMES: Readonly<Record<MeshType, string>> = {
    [MeshType.Other]: "other",
    [MeshType.Model]: "model",
    [MeshType.Support]: "support",
    [MeshType.SolidSupport]: "solidsupport",
};

/** The `unit` attribute of a 3MF model. */
export const THREE_MF_UNITS: Readonly<Record<Unit, string>> = {
    [Units.Micrometer]: "micron",
    [Units.Millimeter]: "millimeter",
    [Units.Centimeter]: "centimeter",
    [Units.Meter]: "meter",
    [Units.Inch]: "inch",
    [Units.Foot]: "foot",
};

export function unitFromThreeMf(name: string): Unit {
    for (let unit of Object.values(Units)) {
        if (THREE_MF_UNITS[unit] === name) return unit;
    }
    throw new ImportError(`unknown 3MF unit ${name}`);
}
