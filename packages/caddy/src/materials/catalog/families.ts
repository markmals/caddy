/**
 * Family and species names, and the grade each one selects by default, generated from
 * bd_materials 0.2.5.
 *
 * A family name (`aluminum`, `walnut`) is bd_materials' ergonomic entry point: its function
 * returns one representative grade, recorded here so {@link resolveMaterial} accepts both
 * spellings.
 *
 * Ported from bd_materials (`registry.py`), Copyright 2026 Bernhard Walter, licensed under the
 * Apache License 2.0.
 */

/** Family/species name to the catalog name of the grade it resolves to. */
export const MATERIAL_FAMILIES: Readonly<Record<string, string>> = {
    abs: "ABS_GENERIC",
    alloy_steel: "AlloySteel_G4140_QUENCHED_TEMPERED",
    aluminum: "Alu_G6061_T6",
    american_cherry: "Hardwood_AMERICAN_CHERRY",
    asa: "Asa_GENERIC",
    ash: "Hardwood_ASH",
    beech: "Hardwood_BEECH",
    birch: "Hardwood_BIRCH",
    borosilicate: "Borosilicate_GENERIC",
    brass: "Brass_C360_HALF_HARD",
    bronze: "Bronze_C51000_PHOSPHOR",
    cardboard: "Cardboard_CORRUGATED",
    castable: "Castable_GENERIC",
    ceramic: "Ceramic_GENERIC",
    cfrp: "CFRP_PLATE",
    copper: "Copper_C110_ANNEALED",
    engineered_wood: "EngineeredWood_MDF",
    esd: "Esd_GENERIC",
    felt: "Felt_GENERIC",
    flexible: "Flexible_GENERIC",
    foamboard: "Foamboard_GENERIC",
    fr4: "FR4_GENERIC",
    gold: "Gold_PURE",
    hardwood: "Hardwood_GENERIC",
    high_temp: "HighTemp_GENERIC",
    leather: "Leather_GENERIC",
    magnesium: "Magnesium_GENERIC_STRUCTURAL",
    maple: "Hardwood_MAPLE",
    mdf: "EngineeredWood_MDF",
    mild_steel: "MildSteel_PLAIN_CARBON_GENERIC",
    nylon: "Nylon_PA12",
    oak: "Hardwood_OAK",
    osb: "EngineeredWood_OSB",
    paper: "Paper_OFFICE",
    pc: "PC_GENERIC",
    pe: "PE_HDPE",
    peek: "Peek_MOLDED",
    petg: "PETG_GENERIC",
    phenolic: "Phenolic_BAKELITE",
    pine: "Softwood_PINE",
    pla: "PLA_GENERIC",
    pmma: "PMMA_GENERIC",
    pom: "POM_GENERIC",
    pp: "PP_GENERIC",
    pps: "PPS_CF",
    ptfe: "PTFE_GENERIC",
    rubber: "Rubber_GENERIC",
    silver: "Silver_PURE",
    soda_lime: "SodaLime_GENERIC",
    softwood: "Softwood_GENERIC",
    spring_steel: "SpringSteel_GENERIC_QUENCHED_TEMPERED",
    spruce: "Softwood_SPRUCE",
    stainless: "Stainless_G304_ANNEALED",
    standard: "Standard_GENERIC",
    titanium: "Titanium_GR5_ANNEALED",
    tool_steel: "ToolSteel_D2_HARDENED",
    tough: "Tough_GENERIC",
    tpu: "TPU_SHORE_95A",
    transparent: "Transparent_GENERIC",
    walnut: "Hardwood_WALNUT",
    woven: "Woven_GENERIC",
};
