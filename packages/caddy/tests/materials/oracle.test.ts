import { expect } from "vite-plus/test";

import type { FixtureCase } from "../../../../reference/build123d/oracle.ts";

import {
    expectClose,
    fixtureBoolean,
    fixtureNumber,
    fixtureRecord,
    fixtureString,
    fixtureValue,
    oracleSuite,
} from "../../../../reference/build123d/oracle.ts";
import { MASS_TOLERANCE } from "../../../../reference/build123d/tolerances.ts";
import {
    ALL_MATERIALS,
    Box,
    canonicalName,
    catalogMaterial,
    Chemical,
    Color,
    Compound,
    finishes,
    FINISHES_BY_KEY,
    materialFactory,
    materialNames,
    Marking,
    MetalPlating,
    processes,
    PROPERTY_UNITS,
    resolveMaterial,
    Sheen,
    Shell,
    Sphere,
    typicalFinishes,
    typicalMaterials,
    Vertex,
} from "../../src/index.ts";
import {
    camelCase,
    expectFinish,
    expectMasses,
    expectProcess,
    expectProperties,
    fixtureStrings,
} from "./metrics.ts";

/** The brass box every mass case starts from. */
function brassBox(): Box {
    let box = new Box(10, 20, 30);
    box.material = "brass";
    return box;
}

function expectNames(expected: FixtureCase, key: string, actual: readonly string[]): void {
    expect(actual, key).toEqual(fixtureStrings(expected, key));
}

oracleSuite("materials", {
    "catalog/materials": expected => {
        let materials = fixtureRecord(expected, "materials");
        let order = fixtureStrings(expected, "order");
        expect(ALL_MATERIALS.length).toBe(fixtureNumber(expected, "count"));
        expect(ALL_MATERIALS.map(material => material.name)).toEqual(order);
        for (let name of order) {
            let record = fixtureRecord(materials, name);
            let material = catalogMaterial(name);
            expect(material.name).toBe(name);
            expect(material.category, `${name} category`).toBe(fixtureString(record, "category"));
            expect(material.family, `${name} family`).toBe(fixtureString(record, "family"));
            expect(material.transparent, `${name} transparent`).toBe(
                fixtureBoolean(record, "transparent"),
            );
            expect(material.density, `${name} density`).toBe(fixtureNumber(record, "density"));
            expectProperties(fixtureRecord(record, "properties"), material);
        }
    },

    "catalog/names": expected => {
        expectNames(expected, "names", materialNames());
    },

    "catalog/families": expected => {
        let families = fixtureRecord(expected, "families");
        for (let family of Object.keys(families.data)) {
            expect(canonicalName(resolveMaterial(family)), family).toBe(
                fixtureString(families, family),
            );
        }
    },

    "catalog/property-units": expected => {
        let units = fixtureRecord(expected, "units");
        // `hardness` is the one entry Caddy leaves out: bd_materials holds a placeholder there
        // for its pretty-printer, while the real unit is the material's own `hardnessScale`.
        let names = Object.keys(units.data).filter(name => name !== "hardness");
        expect(Object.keys(PROPERTY_UNITS).sort()).toEqual(names.map(camelCase).sort());
        for (let name of names) {
            let property = camelCase(name) as keyof typeof PROPERTY_UNITS;
            expect(PROPERTY_UNITS[property], property).toBe(fixtureString(units, name));
        }
    },

    "catalog/name-normalization": expected => {
        let resolved = fixtureRecord(expected, "resolved");
        for (let spelling of Object.keys(resolved.data)) {
            expect(canonicalName(resolveMaterial(spelling)), spelling).toBe(
                fixtureString(resolved, spelling),
            );
        }
        expect(canonicalName(resolveMaterial("walnut"))).toBe(fixtureString(expected, "family"));
        expect(canonicalName(resolveMaterial("alu_g6061_t6"))).toBe(
            fixtureString(expected, "grade"),
        );
    },

    "mass/box-brass": expected => {
        let box = brassBox();
        let material = box.material!;
        expectClose(expected, "volume", box.volume, MASS_TOLERANCE);
        expect(material.material.density).toBe(fixtureNumber(expected, "density"));
        expect(canonicalName(material)).toBe(fixtureString(expected, "name"));
        expectMasses(expected, "masses", options => box.computeMass(options));
    },

    "mass/sphere-walnut": expected => {
        let sphere = new Sphere(10);
        sphere.material = "walnut";
        let material = sphere.material!;
        expectClose(expected, "volume", sphere.volume, MASS_TOLERANCE);
        expect(material.material.density).toBe(fixtureNumber(expected, "density"));
        expect(canonicalName(material)).toBe(fixtureString(expected, "name"));
        expectMasses(expected, "masses", options => sphere.computeMass(options));
    },

    "mass/by-name": expected => {
        let byName = new Box(10, 20, 30);
        byName.material = "brass";
        let byFactory = new Box(10, 20, 30);
        byFactory.material = materialFactory("brass")();
        expectClose(expected, "byName", byName.mass, MASS_TOLERANCE);
        expectClose(expected, "byFactory", byFactory.mass, MASS_TOLERANCE);
        expect(canonicalName(byName.material!)).toBe(fixtureString(expected, "name"));
    },

    "mass/shell": expected => {
        let closed = new Box(10, 20, 30).shell;
        closed.material = "brass";
        let open = new Shell(new Box(10, 20, 30).faces[0]!);
        open.material = "brass";
        expectClose(expected, "closedVolume", closed.volume, MASS_TOLERANCE);
        expectClose(expected, "closedMass", closed.mass, MASS_TOLERANCE);
        expectClose(expected, "openVolume", open.volume, MASS_TOLERANCE);
        expectClose(expected, "openMass", open.mass, MASS_TOLERANCE);
    },

    "mass/zero-volume": expected => {
        let box = brassBox();
        let vertex = new Vertex(1, 2, 3);
        vertex.material = "brass";
        let edge = box.edges[0]!;
        let wire = box.faces[0]!.outerWire;
        let face = box.faces[0]!;
        expectClose(expected, "vertex", vertex.mass, MASS_TOLERANCE);
        expectClose(expected, "edge", edge.mass, MASS_TOLERANCE);
        expectClose(expected, "wire", wire.mass, MASS_TOLERANCE);
        expectClose(expected, "face", face.mass, MASS_TOLERANCE);
        expectClose(
            expected,
            "faceWithoutMaterial",
            new Box(1, 1, 1).faces[0]!.mass,
            MASS_TOLERANCE,
        );
        expectClose(expected, "emptyCompound", new Compound([]).computeMass(), MASS_TOLERANCE);
    },

    "mass/density-override": expected => {
        let material = materialFactory("brass")({ density: 1234 });
        let box = new Box(10, 20, 30);
        box.material = material;
        let weightless = new Box(1, 1, 1);
        weightless.material = materialFactory("brass")({ density: 0 });
        expect(material.material.density).toBe(fixtureNumber(expected, "density"));
        expect(canonicalName(material)).toBe(fixtureString(expected, "name"));
        expectClose(expected, "mass", box.mass, MASS_TOLERANCE);
        expectClose(expected, "zeroDensityMass", weightless.computeMass(), MASS_TOLERANCE);
    },

    "mass/finish-does-not-change-mass": expected => {
        let plain = brassBox();
        let finished = new Box(10, 20, 30);
        finished.material = materialFactory("brass")({ finish: finishes.brushed() });
        expectClose(expected, "plain", plain.mass, MASS_TOLERANCE);
        expectClose(expected, "finished", finished.mass, MASS_TOLERANCE);
    },

    "mass/compound": expected => {
        let compound = new Compound([new Box(10, 10, 10).solid, new Box(10, 10, 10).solid]);
        compound.material = "brass";
        expectClose(expected, "volume", compound.volume, MASS_TOLERANCE);
        expectClose(expected, "mass", compound.mass, MASS_TOLERANCE);
    },

    "mass/inherited": expected => {
        let assembly = new Compound([new Box(10, 10, 10).solid]);
        assembly.material = "brass";
        let inherited = assembly.solids[0]!;
        expectClose(expected, "inherited", inherited.mass, MASS_TOLERANCE);
        expect(canonicalName(inherited.material!)).toBe(fixtureString(expected, "inheritedName"));

        let own = assembly.solids[0]!;
        own.material = "walnut";
        expectClose(expected, "ownWins", own.mass, MASS_TOLERANCE);
        expect(canonicalName(own.material!)).toBe(fixtureString(expected, "ownName"));
    },

    "finishes/catalog": expected => {
        let groups = fixtureRecord(expected, "groups");
        expect(Object.keys(FINISHES_BY_KEY).length).toBe(fixtureNumber(expected, "count"));
        for (let group of Object.keys(groups.data)) {
            let table = fixtureRecord(groups, group);
            for (let key of Object.keys(table.data)) {
                let record = fixtureRecord(table, key);
                let finish = FINISHES_BY_KEY[key as keyof typeof FINISHES_BY_KEY];
                expect(finish, key).toBeDefined();
                expect(finish.name, `${key} name`).toBe(fixtureString(record, "name"));
                expect(finish.notes ?? null, `${key} notes`).toEqual(fixtureValue(record, "notes"));
            }
        }
    },

    "finishes/applied": expected => {
        let blue = new Color(0, 0, 1);
        let red = new Color(1, 0, 0);
        expectFinish(expected, "beadBlast", finishes.beadBlast());
        expectFinish(expected, "beadBlastScaled", finishes.beadBlast({ scale: [2, 3] }));
        expectFinish(expected, "brushed", finishes.brushed({ scale: [2, 2], rotation: 45 }));
        expectFinish(expected, "smoothMachining", finishes.smoothMachining());
        expectFinish(expected, "anodize", finishes.anodize(blue));
        expectFinish(expected, "passivate", finishes.passivate());
        expectFinish(expected, "powderCoat", finishes.powderCoat(red));
        expectFinish(expected, "powderCoatMatte", finishes.powderCoat(red, { sheen: Sheen.Matte }));
        expectFinish(expected, "electrophoresis", finishes.electrophoresis());
        expectFinish(expected, "silkscreen", finishes.silkscreen());
        expectFinish(expected, "zincPlate", finishes.zincPlate(new Color(1, 1, 0)));
        expectFinish(
            expected,
            "vacuumPlating",
            finishes.vacuumPlating(new Color(1, 0.84, 0), { sheen: Sheen.Matte }),
        );
    },

    "processes/applied": expected => {
        expectProcess(expected, "fdm", processes.fdm());
        expectProcess(
            expected,
            "fdmTuned",
            processes.fdm({ layerHeightMm: 0.3, rotation: 90, mmPerUv: 25 }),
        );
        expectProcess(expected, "fdmSkin", processes.fdmSkin());
        expectProcess(
            expected,
            "fdmSkinBottom",
            processes.fdmSkin({ lineWidthMm: 0.6, rotation: -45 }),
        );
        expectProcess(expected, "sls", processes.sls({ scale: [2, 2] }));
        expectProcess(expected, "mjf", processes.mjf());
        expectProcess(expected, "slm", processes.slm());
        expectProcess(expected, "vat", processes.vat());
        expectProcess(expected, "molded", processes.molded());
        expectProcess(expected, "machined", processes.machined());
        expectProcess(expected, "cast", processes.cast());
        expectProcess(expected, "wrought", processes.wrought());

        let authored = fixtureRecord(expected, "authored");
        expect(processes.AUTHORED_LAYER_HEIGHT_MM).toBe(fixtureNumber(authored, "layerHeightMm"));
        expect(processes.AUTHORED_LINE_WIDTH_MM).toBe(fixtureNumber(authored, "lineWidthMm"));
        expect(processes.AUTHORED_SKIN_ROTATION).toBe(fixtureNumber(authored, "skinRotation"));
    },

    "applicability/typical-finishes": expected => {
        let record = fixtureRecord(expected, "finishes");
        for (let name of Object.keys(record.data)) {
            let found = typicalFinishes(catalogMaterial(name)).map(finish => finish.name);
            expectNames(record, name, found);
        }
    },

    "applicability/typical-materials": expected => {
        let record = fixtureRecord(expected, "materials");
        let keys = {
            anodized: Chemical.Anodized,
            zinc_plating: MetalPlating.ZincPlating,
            etching: Marking.Etching,
        };
        for (let [label, key] of Object.entries(keys)) {
            expectNames(
                record,
                label,
                typicalMaterials(key).map(material => material.name),
            );
        }
        expectNames(
            expected,
            "byAppliedFinish",
            typicalMaterials(finishes.anodize(new Color(0, 0, 1))).map(material => material.name),
        );
    },
});
