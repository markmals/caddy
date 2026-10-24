/**
 * The material catalog: what a part is made of, and what that makes it weigh.
 *
 * The finish and process verbs keep the namespaces bd_materials gives them — `finishes.anodize`,
 * `processes.fdm` — because names like `cast` and `etch` are far too generic to live in the
 * library's root.
 */

export * as finishes from "./finish-functions.ts";
export * as processes from "./processes.ts";

export { typicalFinishes, typicalMaterials, TYPICAL_SUBSTRATES } from "./applicability.ts";
export {
    ALL_MATERIALS,
    GLASSES,
    MATERIAL_FAMILIES,
    METALS,
    PAPERS,
    PLASTICS,
    RESINS,
    TEXTILES,
    WOODS,
} from "./catalog/index.ts";
export { FinishedMaterial } from "./finished.ts";
export type { FinishedMaterialOptions } from "./finished.ts";
export {
    ALL_FINISHES,
    Chemical,
    CHEMICAL_FINISHES,
    Coating,
    COATING_FINISHES,
    FINISHES_BY_KEY,
    Marking,
    MARKING_FINISHES,
    Mechanical,
    MECHANICAL_FINISHES,
    METAL_PLATING_FINISHES,
    MetalPlating,
    Sheen,
} from "./finishes.ts";
export type { AppliedFinish, Finish, FinishKey } from "./finishes.ts";
export { MaterialCategory, withDensity } from "./material.ts";
export type { Material } from "./material.ts";
export { Process } from "./processes.ts";
export type { AppliedProcess } from "./processes.ts";
export {
    MECHANICAL_PROPERTY_UNITS,
    PROPERTY_UNITS,
    THERMAL_PROPERTY_UNITS,
} from "./property-units.ts";
export type { MaterialProperty, MechanicalProperty, ThermalProperty } from "./property-units.ts";
export { isNotSuitable, NOT_SUITABLE, Range } from "./range.ts";
export {
    canonicalName,
    catalogMaterial,
    materialFactory,
    materialNames,
    resolveMaterial,
} from "./registry.ts";
export type { CatalogMaterialOptions, MaterialFactory } from "./registry.ts";
