import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { ORACLE_PROJECT_DIR } from "../../../../reference/build123d/oracle.ts";
import { Line } from "../../src/curves/index.ts";
import { ExportError } from "../../src/errors.ts";
import { Color } from "../../src/geometry/color.ts";
import { CADFileType, exportCAD, serialize } from "../../src/io/index.ts";
import { Box } from "../../src/parts/index.ts";
import { Part } from "../../src/topology/index.ts";
import { readAccessor, readGlb, readGltf } from "./gltf.ts";
import { parseObj } from "./obj.ts";

let directory = "";

let run = promisify(execFile);

beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "caddy-exchange-"));
});

afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
});

function part(): Part {
    let solid = new Part([new Box(4, 5, 6)]);
    solid.label = "widget";
    solid.color = new Color("#4080c0");
    return solid;
}

describe("OBJ", () => {
    test("writes to a path and parses back with one record per vertex", async () => {
        let name = join(directory, "part.obj");
        await exportCAD(part(), { name, type: CADFileType.Obj });
        let records = parseObj(await readFile(name));
        expect(records.vertices.length).toBe(24);
        expect(records.uvs.length).toBe(24);
        expect(records.normals.length).toBe(24);
        expect(records.faces.length).toBe(12);
    });

    test("every face corner names the same vertex, texture coordinate and normal", async () => {
        let records = parseObj(await serialize(part(), { type: CADFileType.Obj }));
        for (let face of records.faces) {
            for (let corner of face) {
                expect(corner).toEqual([corner[0], corner[0], corner[0]]);
                expect(corner[0]).toBeGreaterThanOrEqual(1);
                expect(corner[0]).toBeLessThanOrEqual(records.vertices.length);
            }
        }
    });

    test("a coarser deflection writes no more vertices than a fine one", async () => {
        let fine = parseObj(await serialize(part(), { type: CADFileType.Obj }));
        let coarse = parseObj(
            await serialize(part(), {
                type: CADFileType.Obj,
                tolerance: 0.5,
                angularTolerance: 1,
            }),
        );
        expect(coarse.vertices.length).toBeLessThanOrEqual(fine.vertices.length);
    });

    test("a shape with no faces writes only the header comment", async () => {
        let bytes = await serialize(new Part([]), { type: CADFileType.Obj });
        expect(new TextDecoder().decode(bytes)).toBe("# Wavefront OBJ exported by caddy\n");
    });
});

describe("glTF", () => {
    test("the JSON form carries its whole buffer in a data URI", async () => {
        let { document, binary } = readGltf(await serialize(part(), { type: CADFileType.Gltf }));
        expect(document.buffers[0]?.uri).toMatch(/^data:application\/octet-stream;base64,/);
        expect(binary.length).toBe(document.buffers[0]?.byteLength);
    });

    test("the binary form declares no buffer uri and pads both chunks", async () => {
        let bytes = await serialize(part(), { type: CADFileType.Gltf, binary: true });
        let { document, header } = readGlb(bytes);
        expect(document.buffers[0]?.uri).toBeUndefined();
        expect(header.declaredLengthMatches).toBe(true);
        expect(header.chunksPadded).toBe(true);
    });

    test("the unit decides the scale, because glTF is always metres", async () => {
        let positionsIn = async (unit: "mm" | "m"): Promise<number[][]> => {
            let { document, binary } = readGltf(
                await serialize(part(), { type: CADFileType.Gltf, unit }),
            );
            return readAccessor(document, binary, 0);
        };
        let millimetres = await positionsIn("mm");
        let metres = await positionsIn("m");
        expect(metres[0]?.[0]).toBeCloseTo((millimetres[0]?.[0] ?? 0) * 1000, 6);
    });

    test("a shape without faces cannot become a glTF", async () => {
        let failure = await serialize(new Line([0, 0, 0], [1, 0, 0]), {
            type: CADFileType.Gltf,
        }).catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(ExportError);
        expect(String((failure as ExportError).cause)).toMatch(/at least one face/);
    });

    test("an empty shape is rejected", async () => {
        await expect(serialize(new Part([]), { type: CADFileType.Gltf })).rejects.toThrow(
            ExportError,
        );
    });
});

describe("interoperability", () => {
    // Starts the build123d oracle, whose OCP import alone takes seconds; more under parallel load.
    test(
        "OCCT's own glTF reader opens both forms and finds the whole surface",
        { timeout: 60_000 },
        async () => {
            let json = join(directory, "widget.gltf");
            let glb = join(directory, "widget.glb");
            await exportCAD(part(), { name: json, type: CADFileType.Gltf });
            await exportCAD(part(), { name: glb, type: CADFileType.Gltf, binary: true });
            let script = [
                "from OCP.BRepGProp import BRepGProp",
                "from OCP.GProp import GProp_GProps",
                "from OCP.Message import Message_ProgressRange",
                "from OCP.RWGltf import RWGltf_CafReader",
                "from OCP.TCollection import TCollection_AsciiString, TCollection_ExtendedString",
                "from OCP.TDocStd import TDocStd_Document",
                "from OCP.TopAbs import TopAbs_FACE",
                "from OCP.TopExp import TopExp_Explorer",
                "from OCP.XCAFApp import XCAFApp_Application",
                "def summary(path):",
                "    app = XCAFApp_Application.GetApplication_s()",
                "    doc = TDocStd_Document(TCollection_ExtendedString('doc'))",
                "    app.NewDocument(TCollection_ExtendedString('BinXCAF'), doc)",
                "    reader = RWGltf_CafReader()",
                "    reader.SetDocument(doc)",
                "    assert reader.Perform(TCollection_AsciiString(path), Message_ProgressRange())",
                "    shape = reader.SingleShape()",
                "    props = GProp_GProps()",
                "    BRepGProp.SurfaceProperties_s(shape, props)",
                "    explorer = TopExp_Explorer(shape, TopAbs_FACE)",
                "    faces = 0",
                "    while explorer.More():",
                "        faces += 1",
                "        explorer.Next()",
                "    return f'{faces} {round(props.Mass() * 1e6, 2)}'",
                `print(summary(${JSON.stringify(json)}), '|', summary(${JSON.stringify(glb)}))`,
            ].join("\n");
            let { stdout } = await run("uv", ["run", "python", "-c", script], {
                cwd: ORACLE_PROJECT_DIR,
            });
            expect(stdout.trimEnd().split("\n").at(-1)).toBe("6 148.0 | 6 148.0");
        },
    );
});
