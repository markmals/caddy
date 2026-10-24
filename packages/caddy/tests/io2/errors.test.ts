import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";

import { ExportError, ImportError } from "../../src/errors.ts";
import { importDxfText, importSvgText } from "../../src/io/import2d/index.ts";
import { importCAD } from "../../src/io/index.ts";
import { Mesher } from "../../src/mesh/index.ts";
import { Solid, Wire } from "../../src/topology/index.ts";

const SQUARE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10">
  <rect x="1" y="1" width="8" height="8" fill="none"/>
</svg>`;

test("a document whose root is not <svg> is rejected", () => {
    expect(() => importSvgText("<html><body/></html>")).toThrow(ImportError);
});

test("unterminated markup is rejected", () => {
    expect(() => importSvgText('<svg xmlns="http://www.w3.org/2000/svg"><rect')).toThrow(
        ImportError,
    );
});

test("path data that does not start with a command is rejected", () => {
    let document = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10">
      <path d="10 10 L 20 20"/>
    </svg>`;
    expect(() => importSvgText(document)).toThrow(ImportError);
});

test("an unsupported transform function is rejected", () => {
    let document = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10">
      <rect x="1" y="1" width="2" height="2" transform="perspective(2)"/>
    </svg>`;
    expect(() => importSvgText(document)).toThrow(ImportError);
});

test("binary DXF is rejected with a hint", () => {
    expect(() => importDxfText("AutoCAD Binary DXF\r\n\u001a\u0000")).toThrow(/ASCII DXF/);
});

test("a DXF group code that is not a number is rejected", () => {
    expect(() => importDxfText("0\nSECTION\nnope\nENTITIES\n")).toThrow(ImportError);
});

/**
 * build123d imports a rotated rectangle through `ocpsvg`'s `BRepBuilderAPI_GTransform` path,
 * which drops the y translation and rescales the shape; Caddy applies the transform as written.
 */
test("a rotated rectangle keeps its size and place", () => {
    let document = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <rect x="40" y="40" width="20" height="10" fill="none" transform="rotate(30 50 50)"/>
    </svg>`;
    let [wire] = [...importSvgText(document)];
    expect(wire).toBeInstanceOf(Wire);
    expect((wire as Wire).length).toBeCloseTo(60, 6);
    let box = wire?.boundingBox();
    expect(box?.center().toTuple()[0]).toBeCloseTo(52.5, 6);
    expect(box?.center().toTuple()[1]).toBeCloseTo(54.330127, 6);
});

test("importCAD reads an SVG file through its extension", async () => {
    let directory = await mkdtemp(join(tmpdir(), "caddy-io2-"));
    try {
        let path = join(directory, "square.svg");
        await writeFile(path, SQUARE_SVG);
        let shape = await importCAD(path);
        expect(shape.constructor.name).toBe("Wire");
        expect(shape.edges().length).toBe(4);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("the mesher only writes 3MF", async () => {
    let mesher = new Mesher();
    await mesher.addShape(Solid.makeBox(1, 1, 1));
    await expect(mesher.write("/tmp/caddy-mesher-test.stl")).rejects.toThrow(ExportError);
});

test("the mesher rejects a file that is not a package", async () => {
    let mesher = new Mesher();
    await expect(mesher.read(Buffer.from("not a zip", "utf-8"))).rejects.toThrow(ImportError);
});

test("asking for metadata the model does not carry fails", () => {
    expect(() => new Mesher().metaDataFor("caddy", "missing")).toThrow(ImportError);
});

test("a shape that meshes to nothing is skipped", async () => {
    let mesher = new Mesher();
    await mesher.addShape(Solid.makeBox(1, 1, 1).edges().first);
    expect(mesher.meshCount).toBe(0);
});
