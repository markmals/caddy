"""Oracle cases for materials: the bd_materials catalog build123d resolves, and the mass a
material gives a shape.

build123d delegates every material concern to `bd_materials` (pinned 0.2.5 here), so these cases
read the catalog straight out of that package — the property ranges, the names `resolve` accepts,
the finish and process verbs, the material/finish applicability table — and record build123d's
`Shape.mass` / `Shape.compute_mass` results on top.

Two things are deliberately not recorded. Colours are a per-part choice whose *input* spelling
differs (bd_materials takes palette names, Caddy takes a `Color`), so a case records only whether
a verb bound one. The PBR/three.js look is visual and not ported at all.

Caddy has no `anytree` assembly tree: it models an assembly as nested compounds, and a sub-shape
reaches its ancestors through its `topoPath`. The inheritance cases therefore record what a child
with no material of its own weighs, which is the observable both sides share, rather than the
tree shape that produces it.
"""

from __future__ import annotations

import math
from typing import Any

from bd_materials import applicability, finishes, processes, registry
from bd_materials.core import PROPERTY_UNITS, Range
from bd_materials.materials import ALL_MATERIALS, metals, wood
from build123d import Box, Compound, Shell, Sphere, Unit, Vertex
from build123d.topology import Shape
from oracle import case

# The three unit pairs build123d's own material tests pin, as (mass, length).
UNIT_PAIRS = {
    "g-mm": (Unit.G, Unit.MM),
    "kg-m": (Unit.KG, Unit.M),
    "lb-in": (Unit.LB, Unit.IN),
}


def range_value(value: Range | float | None) -> Any:
    """A property value as the fixture carries it: a pair, `"n/a"`, or omitted by the caller."""
    if isinstance(value, Range):
        return "n/a" if math.isnan(value.min) else [value.min, value.max]
    return value


def property_table(material: Any) -> dict[str, Any]:
    """Every property the material carries, keyed by bd_materials' own property names."""
    table: dict[str, Any] = {}
    for name in PROPERTY_UNITS:
        if name in {"density", "hardness"} or not hasattr(material, name):
            continue
        value = getattr(material, name)
        if value is not None:
            table[name] = range_value(value)
    if (hardness := getattr(material, "hardness", None)) is not None:
        table["hardness"] = range_value(hardness)
        table["hardness_scale"] = material.hardness_scale
    return table


def identity(material: Any) -> dict[str, Any]:
    """The identity fields every material carries, plus its single density."""
    return {
        "category": material.category,
        "family": material.family,
        "transparent": material.transparent,
        "density": material.density,
    }


def masses(shape: Shape) -> dict[str, float]:
    """The shape's mass in each of the unit pairs build123d's material tests use."""
    return {
        label: shape.mass(mass_unit, length_unit)
        for label, (mass_unit, length_unit) in UNIT_PAIRS.items()
    }


def finish_record(applied: finishes.AppliedFinish) -> dict[str, Any]:
    """An applied finish without its colour, whose input spelling differs between the two."""
    return {
        "name": applied.finish.name,
        "colored": applied.color is not None,
        "sheen": None if applied.sheen is None else applied.sheen.name.lower(),
        "scale": list(applied.scale),
        "rotation": applied.rotation,
    }


def process_record(applied: processes.AppliedProcess) -> dict[str, Any]:
    """An applied process with the per-part geometry its verb bound."""
    return {
        "process": applied.process.value,
        "scale": list(applied.scale),
        "rotation": applied.rotation,
        "pitchMm": applied.pitch_mm,
        "skin": applied.skin,
        "mmPerUv": applied.mm_per_uv,
    }


# --- the catalog -----------------------------------------------------------


@case("catalog/materials")
def catalog_materials() -> dict[str, Any]:
    """Every catalog material: its identity, its density and its full property table."""
    return {
        "count": len(ALL_MATERIALS),
        "materials": {
            material.name: identity(material) | {"properties": property_table(material)}
            for material in ALL_MATERIALS
        },
        "order": [material.name for material in ALL_MATERIALS],
    }


@case("catalog/names")
def catalog_names() -> dict[str, Any]:
    """Every name `resolve` accepts — the family names and the grade names — sorted."""
    return {"names": list(registry.material_names())}


@case("catalog/families")
def catalog_families() -> dict[str, Any]:
    """Each family name and the grade it resolves to, which is what a round trip returns."""
    names = registry.material_names()
    grades = {material.name.lower() for material in ALL_MATERIALS}
    return {
        "families": {
            name: registry.canonical_name(registry.resolve(name))
            for name in names
            if name not in grades
        }
    }


@case("catalog/property-units")
def catalog_property_units() -> dict[str, Any]:
    """The one unit per property, the table a property table is read against."""
    return {"units": dict(PROPERTY_UNITS)}


@case("catalog/name-normalization")
def catalog_name_normalization() -> dict[str, Any]:
    """Case, spaces and hyphens all fold to the same registry key."""
    spellings = [
        "brass",
        "Brass",
        "BRASS",
        "brass_c360_half_hard",
        "Brass-C360-half hard",
    ]
    return {
        "resolved": {
            spelling: registry.canonical_name(registry.resolve(spelling))
            for spelling in spellings
        },
        "family": registry.canonical_name(registry.resolve("walnut")),
        "grade": registry.canonical_name(registry.resolve("alu_g6061_t6")),
    }


# --- mass ------------------------------------------------------------------


@case("mass/box-brass")
def mass_box_brass() -> dict[str, Any]:
    """A brass box, in each unit pair; OCCT volume is unit-agnostic, the units are read in."""
    box = Box(10, 20, 30)
    box.material = metals.brass()
    return {
        "volume": box.volume,
        "density": box.material.material.density,
        "name": registry.canonical_name(box.material),
        "masses": masses(box),
    }


@case("mass/sphere-walnut")
def mass_sphere_walnut() -> dict[str, Any]:
    """A walnut sphere, in each unit pair."""
    sphere = Sphere(10)
    sphere.material = wood.walnut()
    return {
        "volume": sphere.volume,
        "density": sphere.material.material.density,
        "name": registry.canonical_name(sphere.material),
        "masses": masses(sphere),
    }


@case("mass/by-name")
def mass_by_name() -> dict[str, Any]:
    """A material assigned by name weighs exactly what the same material by factory weighs."""
    by_name = Box(10, 20, 30)
    by_name.material = "brass"
    by_factory = Box(10, 20, 30)
    by_factory.material = metals.brass()
    return {
        "byName": by_name.mass(),
        "byFactory": by_factory.mass(),
        "name": registry.canonical_name(by_name.material),
    }


@case("mass/shell")
def mass_shell() -> dict[str, Any]:
    """A manifold shell encloses a volume, so it masses as the solid it bounds."""
    box = Box(10, 20, 30)
    shell = box.shell()
    shell.material = metals.brass()
    open_shell = Shell(Box(10, 20, 30).faces()[0])
    open_shell.material = metals.brass()
    return {
        "closedVolume": shell.volume,
        "closedMass": shell.mass(),
        "openVolume": open_shell.volume,
        "openMass": open_shell.mass(),
    }


@case("mass/zero-volume")
def mass_zero_volume() -> dict[str, Any]:
    """Nothing that encloses no volume has a mass, material or not."""
    box = Box(10, 20, 30)
    box.material = metals.brass()
    vertex = Vertex(1, 2, 3)
    vertex.material = metals.brass()
    edge = box.edges()[0]
    edge.material = metals.brass()
    wire = box.faces()[0].outer_wire()
    wire.material = metals.brass()
    face = box.faces()[0]
    face.material = metals.brass()
    bare_face = Box(1, 1, 1).faces()[0]
    return {
        "vertex": vertex.mass(),
        "edge": edge.mass(),
        "wire": wire.mass(),
        "face": face.mass(),
        "faceWithoutMaterial": bare_face.mass(),
        "emptyCompound": Compound([]).compute_mass(),
    }


@case("mass/density-override")
def mass_density_override() -> dict[str, Any]:
    """A per-part density replaces the grade's representative one, and zero weighs nothing."""
    custom = Box(10, 20, 30)
    custom.material = metals.brass(density=1234.0)
    weightless = Box(1, 1, 1)
    weightless.material = metals.brass(density=0.0)
    return {
        "density": custom.material.material.density,
        "mass": custom.mass(),
        "name": registry.canonical_name(custom.material),
        "zeroDensityMass": weightless.compute_mass(),
    }


@case("mass/finish-does-not-change-mass")
def mass_finish_does_not_change_mass() -> dict[str, Any]:
    """A finish is a surface, not a density: it leaves the mass alone."""
    plain = Box(10, 20, 30)
    plain.material = metals.brass()
    brushed = Box(10, 20, 30)
    brushed.material = metals.brass(finish=finishes.brushed())
    return {"plain": plain.mass(), "finished": brushed.mass()}


@case("mass/compound")
def mass_compound() -> dict[str, Any]:
    """A compound of two solids weighs its contents, each taking the compound's material."""
    compound = Compound([Box(10, 10, 10).solid(), Box(10, 10, 10).solid()])
    compound.material = metals.brass()
    return {"volume": compound.volume, "mass": compound.mass()}


@case("mass/inherited")
def mass_inherited() -> dict[str, Any]:
    """A child with no material of its own weighs by the nearest ancestor that has one.

    build123d walks the assembly tree, Caddy a sub-shape's `topoPath`; what both record is what
    the child ends up weighing. The mixed-material *sum* of an assembly is deliberately not
    recorded: Caddy's compound children are rebuilt from the topology and cannot carry a
    material of their own, so only a child reached from the compound can.
    """
    plain = Box(10, 10, 10).solid()
    assembly = Compound(label="assembly", children=[plain])
    assembly.material = metals.brass()

    own = Box(10, 10, 10).solid()
    own.material = wood.walnut()
    mixed = Compound(label="mixed", children=[own])
    mixed.material = metals.brass()
    return {
        "inherited": plain.mass(),
        "inheritedName": registry.canonical_name(plain.material),
        "ownWins": own.mass(),
        "ownName": registry.canonical_name(own.material),
    }


# --- finishes, processes, applicability ------------------------------------


@case("finishes/catalog")
def finishes_catalog() -> dict[str, Any]:
    """Every finish of the catalog, keyed the way the applicability table keys them."""
    groups = {
        "mechanical": finishes.MECHANICAL_FINISHES,
        "chemical": finishes.CHEMICAL_FINISHES,
        "metal_plating": finishes.METAL_PLATING_FINISHES,
        "coating": finishes.COATING_FINISHES,
        "marking": finishes.MARKING_FINISHES,
    }
    return {
        "count": len(finishes.ALL_FINISHES),
        "groups": {
            group: {
                key.name.lower(): {"name": finish.name, "notes": finish.notes}
                for key, finish in table.items()
            }
            for group, table in groups.items()
        },
    }


@case("finishes/applied")
def finishes_applied() -> dict[str, Any]:
    """What each verb binds: the finish, whether it took a colour, its sheen and transform.

    `zinc_plate` and `pvd` default their colour to bd_materials' `"clear"` — a PBR palette
    entry meaning "the bright natural plating, substrate showing through", which is not a
    colour Caddy can hold. They are recorded with an explicit colour instead; Caddy's own
    tests cover its default of leaving the colour unset.
    """
    return {
        "beadBlast": finish_record(finishes.bead_blast()),
        "beadBlastScaled": finish_record(finishes.bead_blast(scale=(2.0, 3.0))),
        "brushed": finish_record(finishes.brushed(scale=(2.0, 2.0), rotation=45.0)),
        "smoothMachining": finish_record(finishes.smooth_machining()),
        "anodize": finish_record(finishes.anodize("blue")),
        "passivate": finish_record(finishes.passivate()),
        "powderCoat": finish_record(finishes.powder_coat("red")),
        "powderCoatMatte": finish_record(
            finishes.powder_coat("red", finishes.Sheen.MATTE)
        ),
        "electrophoresis": finish_record(finishes.electrophoresis()),
        "silkscreen": finish_record(finishes.silkscreen()),
        "zincPlate": finish_record(finishes.zinc_plate("yellow")),
        "vacuumPlating": finish_record(
            finishes.vacuum_plating("gold", finishes.Sheen.MATTE)
        ),
    }


@case("processes/applied")
def processes_applied() -> dict[str, Any]:
    """What each process verb binds, including the FDM pitches the maps are authored at."""
    return {
        "fdm": process_record(processes.fdm()),
        "fdmTuned": process_record(
            processes.fdm(layer_height_mm=0.3, rotation=90, mm_per_uv=25)
        ),
        "fdmSkin": process_record(processes.fdm_skin()),
        "fdmSkinBottom": process_record(
            processes.fdm_skin(line_width_mm=0.6, rotation=-45)
        ),
        "sls": process_record(processes.sls(scale=(2.0, 2.0))),
        "mjf": process_record(processes.mjf()),
        "slm": process_record(processes.slm()),
        "vat": process_record(processes.vat()),
        "molded": process_record(processes.molded()),
        "machined": process_record(processes.machined()),
        "cast": process_record(processes.cast()),
        "wrought": process_record(processes.wrought()),
        "authored": {
            "layerHeightMm": processes.AUTHORED_LAYER_HEIGHT_MM,
            "lineWidthMm": processes.AUTHORED_LINE_WIDTH_MM,
            "skinRotation": processes.AUTHORED_SKIN_ROTATION,
        },
    }


@case("applicability/typical-finishes")
def applicability_typical_finishes() -> dict[str, Any]:
    """The finishes typically used on a material, matched by its category and family."""
    samples = [
        "Brass_C360_HALF_HARD",
        "Stainless_G304_ANNEALED",
        "PLA_GENERIC",
        "Hardwood_OAK",
    ]
    by_name = {material.name: material for material in ALL_MATERIALS}
    return {
        "finishes": {
            name: [
                finish.name for finish in applicability.typical_finishes(by_name[name])
            ]
            for name in samples
        }
    }


@case("applicability/typical-materials")
def applicability_typical_materials() -> dict[str, Any]:
    """The catalog materials a finish is typically used on."""
    keys = {
        "anodized": finishes.Chemical.ANODIZED,
        "zinc_plating": finishes.MetalPlating.ZINC_PLATING,
        "etching": finishes.Marking.ETCHING,
    }
    return {
        "materials": {
            label: [material.name for material in applicability.typical_materials(key)]
            for label, key in keys.items()
        },
        "byAppliedFinish": [
            material.name
            for material in applicability.typical_materials(finishes.anodize("blue"))
        ],
    }
