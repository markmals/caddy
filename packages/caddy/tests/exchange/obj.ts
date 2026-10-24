/** Reading back a Wavefront OBJ, record for record, the way the oracle case parses it. */

/** The records of an OBJ file; a face corner keeps all of its `v/vt/vn` indices. */
export interface ObjRecords {
    readonly vertices: number[][];
    readonly uvs: number[][];
    readonly normals: number[][];
    readonly faces: number[][][];
}

export function parseObj(bytes: Uint8Array): ObjRecords {
    let records: ObjRecords = { vertices: [], uvs: [], normals: [], faces: [] };
    for (let line of new TextDecoder().decode(bytes).split("\n")) {
        let fields = line.split(/\s+/).filter(field => field !== "");
        let [tag, ...values] = fields;
        if (tag === undefined || tag.startsWith("#")) continue;
        if (tag === "v") records.vertices.push(values.map(Number));
        else if (tag === "vt") records.uvs.push(values.map(Number));
        else if (tag === "vn") records.normals.push(values.map(Number));
        else if (tag === "f")
            records.faces.push(values.map(corner => corner.split("/").map(Number)));
    }
    return records;
}
