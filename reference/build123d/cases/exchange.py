"""Oracle cases for the mesh exchange formats and the UV tessellation behind them.

`export_obj` and `export_gltf` both start from `Shape.tessellate_with_uvs`, so the cases here
record the tessellation itself (vertices, triangles, normals, UVs) and then what each writer
makes of it: the parsed OBJ records, and a structural summary of the glTF document plus the
numbers decoded out of its buffer.

Nothing records raw bytes. OCCT's glTF writer puts the buffer in a sibling `.bin` and stamps its
own `generator` string, neither of which Caddy copies, so the comparison is over what the format
actually means: counts, bounds, node and mesh names, materials and buffer layout.
"""

from __future__ import annotations

import base64
import json
import struct
import tempfile
from pathlib import Path
from typing import Any

from build123d import ApproxOption, Box, Color, Cylinder, Pos, export_gltf, export_obj

from oracle import brep, case, vec

LINEAR_DEFLECTION = 1e-3
ANGULAR_DEFLECTION = 0.1

COMPONENT_SIZES = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
COMPONENT_FORMATS = {5123: "H", 5125: "I", 5126: "f"}
TYPE_LENGTHS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def sample_box() -> Box:
    """A box: six planar faces, four nodes each, so every number fits in a fixture."""
    return Box(2, 3, 4)


def sample_cylinder() -> Cylinder:
    """A curved face, whose UV island is sized by arc length rather than parameter extent."""
    return Cylinder(1.5, 4)


def bounds(rows: list[list[float]]) -> dict[str, list[float]]:
    return {
        "min": [min(row[axis] for row in rows) for axis in range(len(rows[0]))],
        "max": [max(row[axis] for row in rows) for axis in range(len(rows[0]))],
    }


# ---- Wavefront OBJ ----


def parse_obj(text: str) -> dict[str, Any]:
    """The records of an OBJ file, with `f` corners split into their `v/vt/vn` triples."""
    vertices: list[list[float]] = []
    uvs: list[list[float]] = []
    normals: list[list[float]] = []
    faces: list[list[list[int]]] = []
    for line in text.splitlines():
        fields = line.split()
        if not fields or fields[0].startswith("#"):
            continue
        tag, values = fields[0], fields[1:]
        if tag == "v":
            vertices.append([float(value) for value in values])
        elif tag == "vt":
            uvs.append([float(value) for value in values])
        elif tag == "vn":
            normals.append([float(value) for value in values])
        elif tag == "f":
            faces.append([[int(part) for part in corner.split("/")] for corner in values])
    return {"vertices": vertices, "uvs": uvs, "normals": normals, "faces": faces}


def write_obj(shape: Any, **options: Any) -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "shape.obj"
        export_obj(
            shape,
            path,
            linear_deflection=LINEAR_DEFLECTION,
            angular_deflection=ANGULAR_DEFLECTION,
            **options,
        )
        return parse_obj(path.read_text(encoding="utf-8"))


@case("obj/box")
def obj_box() -> dict[str, Any]:
    """Every record of a box's OBJ: positions, atlas UVs, normals and `v/vt/vn` faces."""
    shape = sample_box()
    return {"source": brep(shape), **write_obj(shape)}


@case("obj/atlas-gutter")
def obj_atlas_gutter() -> dict[str, Any]:
    """A gutter insets every island, so no UV reaches the edge of its rectangle."""
    shape = sample_box()
    written = write_obj(shape, atlas_gutter=0.05)
    return {"source": brep(shape), "atlas_gutter": 0.05, "uvs": written["uvs"]}


@case("obj/no-atlas")
def obj_no_atlas() -> dict[str, Any]:
    """Without packing, every face spans the whole `[0, 1]` square on its own."""
    shape = sample_box()
    written = write_obj(shape, atlas_packing=False)
    return {"source": brep(shape), "uvs": written["uvs"]}


@case("obj/without-uvs")
def obj_without_uvs() -> dict[str, Any]:
    """`include_uvs=False` writes positions and bare `f a b c` faces, nothing else."""
    shape = sample_box()
    written = write_obj(shape, include_uvs=False)
    return {"source": brep(shape), **written}


@case("obj/cylinder")
def obj_cylinder() -> dict[str, Any]:
    """A curved face: counts and bounds only, since the tessellation is hundreds of nodes."""
    shape = sample_cylinder()
    written = write_obj(shape)
    return {
        "source": brep(shape),
        "counts": {key: len(value) for key, value in written.items()},
        "vertex_bounds": bounds(written["vertices"]),
        "uv_bounds": bounds(written["uvs"]),
        "normal_bounds": bounds(written["normals"]),
    }


# ---- Shape.tessellate_with_uvs ----


def uv_tessellation(shape: Any, **options: Any) -> dict[str, Any]:
    vertices, triangles, normals, uvs = shape.tessellate_with_uvs(
        LINEAR_DEFLECTION, ANGULAR_DEFLECTION, **options
    )
    return {
        "vertices": [vec(vertex) for vertex in vertices],
        "triangles": [list(triangle) for triangle in triangles],
        "normals": [vec(normal) for normal in normals],
        "uvs": [list(uv) for uv in uvs],
    }


@case("tessellate-uvs/box")
def tessellate_uvs_box() -> dict[str, Any]:
    shape = sample_box()
    return {"source": brep(shape), **uv_tessellation(shape)}


@case("tessellate-uvs/no-atlas")
def tessellate_uvs_no_atlas() -> dict[str, Any]:
    shape = sample_box()
    return {"source": brep(shape), **uv_tessellation(shape, atlas_packing=False)}


@case("tessellate-uvs/cylinder")
def tessellate_uvs_cylinder() -> dict[str, Any]:
    """Island sizes come from arc lengths, so the seam face and the caps pack differently."""
    shape = sample_cylinder()
    tessellation = uv_tessellation(shape)
    return {
        "source": brep(shape),
        "counts": {key: len(value) for key, value in tessellation.items()},
        "vertex_bounds": bounds(tessellation["vertices"]),
        "uv_bounds": bounds(tessellation["uvs"]),
        "normal_bounds": bounds(tessellation["normals"]),
    }


@case("tessellate-uvs/moved")
def tessellate_uvs_moved() -> dict[str, Any]:
    """A located shape tessellates in world coordinates; its UVs do not move with it."""
    shape = Pos(5, -2, 1) * sample_box()
    return {"source": brep(shape), **uv_tessellation(shape)}


# ---- glTF ----


def read_accessor(document: dict[str, Any], blob: bytes, index: int) -> list[list[float]]:
    accessor = document["accessors"][index]
    view = document["bufferViews"][accessor["bufferView"]]
    length = TYPE_LENGTHS[accessor["type"]]
    stride = view.get("byteStride", length * COMPONENT_SIZES[accessor["componentType"]])
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    layout = "<" + COMPONENT_FORMATS[accessor["componentType"]] * length
    return [
        list(struct.unpack_from(layout, blob, start + element * stride))
        for element in range(accessor["count"])
    ]


def gltf_summary(document: dict[str, Any], blob: bytes) -> dict[str, Any]:
    """What a glTF document means, independent of how its bytes were laid out."""
    primitives = [
        primitive for mesh in document.get("meshes", []) for primitive in mesh["primitives"]
    ]
    positions: list[list[float]] = []
    normals: list[list[float]] = []
    texcoords: list[list[float]] = []
    triangles = 0
    for primitive in primitives:
        attributes = primitive["attributes"]
        positions += read_accessor(document, blob, attributes["POSITION"])
        normals += read_accessor(document, blob, attributes["NORMAL"])
        texcoords += read_accessor(document, blob, attributes["TEXCOORD_0"])
        triangles += len(read_accessor(document, blob, primitive["indices"])) // 3
    return {
        "asset_version": document["asset"]["version"],
        "scene": document["scene"],
        "scene_nodes": document["scenes"][document["scene"]]["nodes"],
        "node_names": [node.get("name") for node in document["nodes"]],
        "node_rotations": [node.get("rotation") for node in document["nodes"]],
        "node_meshes": [node.get("mesh") for node in document["nodes"]],
        "mesh_names": [mesh.get("name") for mesh in document.get("meshes", [])],
        "primitive_count": len(primitives),
        "primitive_modes": sorted({primitive["mode"] for primitive in primitives}),
        "primitive_materials": [primitive.get("material") for primitive in primitives],
        "materials": document.get("materials"),
        "vertex_count": len(positions),
        "triangle_count": triangles,
        "position_bounds": bounds(positions),
        "normal_bounds": bounds(normals),
        "texcoord_bounds": bounds(texcoords),
        "view_strides": [view.get("byteStride") for view in document["bufferViews"]],
        "view_targets": [view.get("target") for view in document["bufferViews"]],
        "index_component_types": sorted(
            {
                document["accessors"][primitive["indices"]]["componentType"]
                for primitive in primitives
            }
        ),
    }


def read_gltf(path: Path) -> tuple[dict[str, Any], bytes]:
    document = json.loads(path.read_text(encoding="utf-8"))
    uri = document["buffers"][0]["uri"]
    if uri.startswith("data:"):
        return document, base64.b64decode(uri.split(",", 1)[1])
    return document, (path.parent / uri).read_bytes()


def read_glb(path: Path) -> tuple[dict[str, Any], bytes, dict[str, Any]]:
    blob = path.read_bytes()
    magic, version, total = struct.unpack_from("<III", blob, 0)
    chunks: list[tuple[int, bytes]] = []
    offset = 12
    while offset < len(blob):
        length, kind = struct.unpack_from("<II", blob, offset)
        chunks.append((kind, blob[offset + 8 : offset + 8 + length]))
        offset += 8 + length
    document = json.loads(chunks[0][1].decode("utf-8").rstrip())
    header = {
        "magic": magic,
        "version": version,
        "declared_length_matches": total == len(blob),
        "chunk_types": [kind for kind, _ in chunks],
        "chunks_padded": all(len(payload) % 4 == 0 for _, payload in chunks),
    }
    return document, chunks[1][1], header


def write_gltf(shape: Any, binary: bool) -> tuple[dict[str, Any], bytes, dict[str, Any] | None]:
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / ("shape.glb" if binary else "shape.gltf")
        export_gltf(
            shape,
            path,
            binary=binary,
            linear_deflection=LINEAR_DEFLECTION,
            angular_deflection=ANGULAR_DEFLECTION,
        )
        if binary:
            return read_glb(path)
        document, blob = read_gltf(path)
        return document, blob, None


@case("gltf/box")
def gltf_box() -> dict[str, Any]:
    """A labelled, coloured box: node and mesh names, the Y-up rotation, and the material."""
    shape = sample_box()
    shape.label = "bracket"
    shape.color = Color(0.25, 0.5, 0.75, 1.0)
    document, blob, _ = write_gltf(shape, binary=False)
    return {
        "source": brep(shape),
        "label": shape.label,
        "color": [float(channel) for channel in tuple(shape.color)],
        "summary": gltf_summary(document, blob),
    }


@case("gltf/unnamed")
def gltf_unnamed() -> dict[str, Any]:
    """Without a label or a colour there is no name on the node and no material at all."""
    shape = sample_box()
    document, blob, _ = write_gltf(shape, binary=False)
    return {"source": brep(shape), "summary": gltf_summary(document, blob)}


@case("gltf/translucent")
def gltf_translucent() -> dict[str, Any]:
    """An alpha below one reaches the material unchanged; the RGB channels go linear."""
    shape = sample_box()
    shape.color = Color(1.0, 0.0, 0.0, 0.25)
    document, blob, _ = write_gltf(shape, binary=False)
    return {
        "source": brep(shape),
        "color": [float(channel) for channel in tuple(shape.color)],
        "materials": document.get("materials"),
    }


@case("gltf/cylinder")
def gltf_cylinder() -> dict[str, Any]:
    """A curved shape, where the number of primitives is the number of faces."""
    shape = sample_cylinder()
    document, blob, _ = write_gltf(shape, binary=False)
    return {"source": brep(shape), "summary": gltf_summary(document, blob)}


@case("gltf/binary")
def gltf_binary() -> dict[str, Any]:
    """GLB: the same document, wrapped in a header plus a JSON and a binary chunk."""
    shape = sample_box()
    shape.label = "bracket"
    document, blob, header = write_gltf(shape, binary=True)
    return {
        "source": brep(shape),
        "label": shape.label,
        "header": header,
        "summary": gltf_summary(document, blob),
    }


# ---- Enumerations ----


@case("approx-option/members")
def approx_option_members() -> dict[str, Any]:
    """build123d declares `ApproxOption` but no exporter reads it, so its member names — which
    Caddy mirrors as the enum's values — are all there is to port."""
    return {"names": [member.name for member in ApproxOption]}
