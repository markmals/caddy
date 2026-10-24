"""Oracle cases for the 2D importers and the 3MF mesher.

The SVG and DXF cases carry their source document in the fixture, so the TypeScript side imports
exactly the same bytes rather than a lookalike. Every imported shape is recorded with its label,
colour, bounds and — because orientation is what an importer gets wrong — the geometry of every
edge it produced, in the order the importer produced them.

The mesher cases record counts and properties rather than the 3MF file build123d writes: lib3mf
stamps a fresh UUID into every build item, so those bytes are never the same twice. The one 3MF
read here is assembled by hand (and zipped with a fixed timestamp) for that reason.
"""

from __future__ import annotations

import tempfile
import zipfile
from base64 import b64encode
from io import BytesIO, StringIO
from pathlib import Path
from typing import Any
from uuid import UUID

from build123d import Align, Color, MeshType, Solid, Unit, import_dxf, import_svg
from build123d.mesher import Mesher

from oracle import case, vec

SVG_BASIC = """<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="80mm" viewBox="0 0 100 80">
  <rect x="5" y="5" width="20" height="10"/>
  <rect x="30" y="5" width="20" height="10" rx="3" fill="none" stroke="blue"/>
  <circle cx="60" cy="10" r="5" fill="#ff8800"/>
  <ellipse cx="80" cy="10" rx="8" ry="4" fill="none"/>
  <line x1="5" y1="25" x2="25" y2="35" stroke="green" fill="none"/>
  <polyline points="30,25 40,35 50,25" fill="none"/>
  <polygon points="60,25 70,35 80,25"/>
</svg>"""

SVG_PATHS = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <path d="M 10 10 L 30 10 L 30 30 Z" fill="none"/>
  <path d="M 10 40 C 15 30, 25 30, 30 40 S 45 50, 50 40" fill="none"/>
  <path d="M 10 60 Q 20 50 30 60 T 50 60" fill="none"/>
  <path d="M 60 10 A 10 10 0 0 1 80 10 A 10 5 30 1 0 60 10 Z" fill="none"/>
  <path d="M 60 50 h 20 v 20 h -20 z"/>
  <path d="M 10 80 l 10 10 l 10 -10" fill="none"/>
</svg>"""

SVG_ARCS = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60" width="120" height="60">
  <path d="M 10 30 A 20 10 0 0 1 50 30" fill="none"/>
  <path d="M 10 50 A 20 10 0 0 0 50 50" fill="none"/>
  <path d="M 60 30 A 10 20 0 1 1 80 30" fill="none"/>
  <path d="M 90 30 A 10 20 45 1 0 110 30" fill="none"/>
  <path d="M 60 50 A 5 5 0 1 1 70 50 Z"/>
</svg>"""

SVG_NESTED = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" width="60" height="60">
  <path d="M 5 5 h 50 v 50 h -50 z M 15 15 h 30 v 30 h -30 z M 25 25 h 10 v 10 h -10 z" fill="black"/>
</svg>"""

SVG_GROUPS = """<svg xmlns="http://www.w3.org/2000/svg" \
xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" \
viewBox="10 20 100 100" width="200" height="200">
  <g id="outer" transform="translate(10,5)" inkscape:label="Outer layer" fill="none" stroke="red">
    <rect id="a" x="20" y="30" width="10" height="20"/>
    <g transform="translate(5,5) scale(2)">
      <rect id="b" x="20" y="30" width="10" height="20"/>
    </g>
  </g>
  <rect id="hidden" x="20" y="80" width="10" height="10" visibility="hidden"/>
  <rect id="gone" x="40" y="80" width="10" height="10" style="display:none"/>
</svg>"""

SVG_STYLES = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" width="50mm" height="50mm">
  <style>.hole { fill: none; } rect { stroke: rgb(10, 20, 30); } #one { fill: hsl(120, 50%, 50%); }</style>
  <rect id="one" x="2" y="2" width="10" height="10"/>
  <rect class="hole" x="20" y="2" width="10" height="10"/>
  <rect x="35" y="2" width="10" height="10" fill="transparent"/>
  <use href="#one" x="0" y="20"/>
</svg>"""

SVG_VIEWPORT = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" width="200" height="200" \
preserveAspectRatio="xMaxYMax meet">
  <rect x="10" y="10" width="30" height="20" fill="none"/>
</svg>"""

SVG_UNFILLABLE = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20" width="40" height="20">
  <path d="M 5 5 L 25 5" fill="black"/>
  <circle cx="30" cy="10" r="4" transform="scale(1.5 0.5)" fill="none"/>
</svg>"""

DXF_ENTITIES = "\n".join(
    [
        "0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1024", "0", "ENDSEC",
        "0", "SECTION", "2", "ENTITIES",
        "0", "LINE", "100", "AcDbEntity", "8", "0", "100", "AcDbLine",
        "10", "0.0", "20", "0.0", "30", "0.0", "11", "10.0", "21", "5.0", "31", "0.0",
        "0", "ARC", "100", "AcDbEntity", "8", "0", "100", "AcDbCircle",
        "10", "20.0", "20", "0.0", "30", "0.0", "40", "5.0",
        "100", "AcDbArc", "50", "30.0", "51", "150.0",
        "0", "CIRCLE", "100", "AcDbEntity", "8", "0", "100", "AcDbCircle",
        "10", "40.0", "20", "0.0", "30", "0.0", "40", "4.0",
        "0", "ELLIPSE", "100", "AcDbEntity", "8", "0", "100", "AcDbEllipse",
        "10", "60.0", "20", "0.0", "30", "0.0", "11", "6.0", "21", "2.0", "31", "0.0",
        "210", "0.0", "220", "0.0", "230", "1.0", "40", "0.5", "41", "0.3", "42", "2.2",
        "0", "LWPOLYLINE", "100", "AcDbEntity", "8", "0", "100", "AcDbPolyline",
        "90", "4", "70", "0", "38", "0.0",
        "10", "0.0", "20", "20.0", "42", "0.5",
        "10", "10.0", "20", "20.0",
        "10", "20.0", "20", "25.0",
        "10", "10.0", "20", "30.0",
        "0", "LWPOLYLINE", "100", "AcDbEntity", "8", "0", "100", "AcDbPolyline",
        "90", "3", "70", "1",
        "10", "30.0", "20", "20.0",
        "10", "40.0", "20", "20.0",
        "10", "40.0", "20", "30.0",
        "0", "POLYLINE", "100", "AcDbEntity", "8", "0", "100", "AcDb2dPolyline",
        "66", "1", "70", "0", "10", "0.0", "20", "0.0", "30", "0.0",
        "0", "VERTEX", "100", "AcDbEntity", "8", "0", "100", "AcDbVertex",
        "100", "AcDb2dVertex", "10", "0.0", "20", "40.0", "30", "0.0",
        "0", "VERTEX", "100", "AcDbEntity", "8", "0", "100", "AcDbVertex",
        "100", "AcDb2dVertex", "10", "10.0", "20", "45.0", "30", "0.0", "42", "0.4",
        "0", "VERTEX", "100", "AcDbEntity", "8", "0", "100", "AcDbVertex",
        "100", "AcDb2dVertex", "10", "20.0", "20", "40.0", "30", "0.0",
        "0", "SEQEND", "100", "AcDbEntity", "8", "0",
        "0", "SPLINE", "100", "AcDbEntity", "8", "0", "100", "AcDbSpline",
        "70", "8", "71", "3", "72", "8", "73", "4", "74", "0",
        "40", "0.0", "40", "0.0", "40", "0.0", "40", "0.0",
        "40", "1.0", "40", "1.0", "40", "1.0", "40", "1.0",
        "10", "40.0", "20", "60.0", "30", "0.0",
        "10", "45.0", "20", "70.0", "30", "0.0",
        "10", "55.0", "20", "55.0", "30", "0.0",
        "10", "60.0", "20", "65.0", "30", "0.0",
        "0", "SPLINE", "100", "AcDbEntity", "8", "0", "100", "AcDbSpline",
        "70", "8", "71", "3", "72", "0", "73", "0", "74", "4",
        "11", "0.0", "21", "60.0", "31", "0.0",
        "11", "10.0", "21", "65.0", "31", "0.0",
        "11", "20.0", "21", "60.0", "31", "0.0",
        "11", "30.0", "21", "65.0", "31", "0.0",
        "0", "ENDSEC", "0", "EOF",
    ]
) + "\n"

THREE_MF_CONTENT_TYPES = (
    '<?xml version="1.0" encoding="UTF-8"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="model" '
    'ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'
    '<Default Extension="rels" '
    'ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    "</Types>"
)

THREE_MF_RELS = (
    '<?xml version="1.0" encoding="UTF-8"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" '
    'Target="/3D/3dmodel.model" Id="rel0"/>'
    "</Relationships>"
)


def imported(shape: Any) -> dict[str, Any]:
    """Everything that distinguishes one imported shape from another."""
    box = shape.bounding_box()
    return {
        "class_name": type(shape).__name__,
        "label": shape.label,
        "color": None if shape.color is None else [float(c) for c in tuple(shape.color)],
        "is_valid": bool(shape.is_valid),
        "area": float(shape.area),
        "volume": float(shape.volume),
        "min": vec(box.min),
        "max": vec(box.max),
        "counts": {
            "faces": len(shape.faces()),
            "wires": len(shape.wires()),
            "edges": len(shape.edges()),
        },
        "edges": [
            {
                "geom_type": edge.geom_type.name,
                "length": float(edge.length),
                "start": vec(edge.start_point()),
                "end": vec(edge.end_point()),
            }
            for edge in shape.edges()
        ],
    }


def svg_case(source: str, **kwargs: Any) -> dict[str, Any]:
    return {"source": source, "shapes": [imported(s) for s in import_svg(StringIO(source), **kwargs)]}


@case("svg/basic")
def svg_basic() -> dict[str, Any]:
    """Every shape element: rectangles sharp and rounded, a circle, an ellipse, lines, polygons."""
    return svg_case(SVG_BASIC)


@case("svg/paths")
def svg_paths() -> dict[str, Any]:
    """Every path command, absolute and relative, including the smooth continuations."""
    return svg_case(SVG_PATHS)


@case("svg/arcs")
def svg_arcs() -> dict[str, Any]:
    """Arc flag combinations, a taller-than-wide ellipse and a rotated one."""
    return svg_case(SVG_ARCS)


@case("svg/nested")
def svg_nested() -> dict[str, Any]:
    """Three nested rings in one filled path: a face with a hole, and a face inside that hole."""
    return svg_case(SVG_NESTED)


@case("svg/groups")
def svg_groups() -> dict[str, Any]:
    """Group transforms and inherited paint, with a hidden and a display-none element dropped."""
    return svg_case(SVG_GROUPS)


@case("svg/groups-ignore-visibility")
def svg_groups_ignore_visibility() -> dict[str, Any]:
    """`ignore_visibility` brings the hidden and display-none elements back."""
    return svg_case(SVG_GROUPS, ignore_visibility=True)


@case("svg/groups-inkscape-labels")
def svg_groups_inkscape_labels() -> dict[str, Any]:
    """`label_by="inkscape:label"` reads the namespaced attribute, inherited from the group."""
    return svg_case(SVG_GROUPS, label_by="inkscape:label")


@case("svg/groups-no-flip")
def svg_groups_no_flip() -> dict[str, Any]:
    """Without `flip_y` the document keeps SVG's downward y axis."""
    return svg_case(SVG_GROUPS, flip_y=False)


@case("svg/groups-align-none")
def svg_groups_align_none() -> dict[str, Any]:
    """`align=None` leaves the view box where the flip put it."""
    return svg_case(SVG_GROUPS, align=None)


@case("svg/groups-align-center")
def svg_groups_align_center() -> dict[str, Any]:
    """A per-axis alignment centres the view box on the origin."""
    return svg_case(SVG_GROUPS, align=(Align.CENTER, Align.CENTER))


@case("svg/styles")
def svg_styles() -> dict[str, Any]:
    """A `<style>` block, `rgb()` and `hsl()` colours, a transparent fill and a `use` reference."""
    return svg_case(SVG_STYLES)


@case("svg/viewport")
def svg_viewport() -> dict[str, Any]:
    """A view box fitted into a differently shaped viewport with `preserveAspectRatio`."""
    return svg_case(SVG_VIEWPORT)


@case("svg/unfillable")
def svg_unfillable() -> dict[str, Any]:
    """A filled path that bounds no area stays a wire; a scaled circle stays an exact ellipse."""
    return svg_case(SVG_UNFILLABLE)


@case("dxf/entities")
def dxf_entities() -> dict[str, Any]:
    """One of each supported entity, including bulged polylines and both spline forms."""
    shapes = import_dxf(StringIO(DXF_ENTITIES))
    return {"source": DXF_ENTITIES, "shapes": [imported(s) for s in shapes]}


def mesher_shapes() -> list[Any]:
    """A labelled, coloured box and a coarsely meshed cylinder beside it."""
    box = Solid.make_box(10, 10, 10)
    box.label = "box"
    box.color = Color(1.0, 0.0, 0.0, 0.5)
    cylinder = Solid.make_cylinder(2, 5).translate((20, 0, 0))
    cylinder.label = "cylinder"
    return [box, cylinder]


@case("mesher/round-trip")
def mesher_round_trip() -> dict[str, Any]:
    """`add_shape` then `write` then `read`: counts, properties, metadata and geometry."""
    box, cylinder = mesher_shapes()
    writer = Mesher(unit=Unit.MM)
    writer.add_shape(box, uuid_value=UUID(int=1))
    writer.add_shape(
        cylinder,
        linear_deflection=0.1,
        mesh_type=MeshType.SUPPORT,
        part_number="P-7",
        uuid_value=UUID(int=2),
    )
    writer.add_meta_data("caddy", "note", "hello", "str", True)
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "model.3mf"
        writer.write(path)
        reader = Mesher()
        shapes = reader.read(path)
    return {
        "vertex_counts": writer.vertex_counts,
        "triangle_counts": writer.triangle_counts,
        "mesh_count": writer.mesh_count,
        "properties": [
            {"name": p["name"], "part_number": p["part_number"], "type": p["type"]}
            for p in reader.get_mesh_properties()
        ],
        "meta_data": reader.get_meta_data(),
        "unit": reader.model_unit.name,
        "shapes": [imported(s) for s in shapes],
    }


def three_mf_package(model: str) -> bytes:
    """The model XML as a 3MF package, with timestamps frozen so the bytes are reproducible."""
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, text in [
            ("[Content_Types].xml", THREE_MF_CONTENT_TYPES),
            ("_rels/.rels", THREE_MF_RELS),
            ("3D/3dmodel.model", model),
        ]:
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, text)
    return buffer.getvalue()


def tetrahedron_model() -> str:
    """A coloured tetrahedron and a plain pyramid, in inches, written as a 3MF model part."""
    first = (
        '<object id="1" name="tetra" type="model" pid="3" pindex="0"><mesh>'
        "<vertices>"
        '<vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/>'
        '<vertex x="0" y="10" z="0"/><vertex x="0" y="0" z="10"/>'
        "</vertices><triangles>"
        '<triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="1" v3="3"/>'
        '<triangle v1="1" v2="2" v3="3"/><triangle v1="0" v2="3" v3="2"/>'
        "</triangles></mesh></object>"
    )
    second = (
        '<object id="2" name="pyramid" partnumber="PN-2" type="support"><mesh>'
        "<vertices>"
        '<vertex x="20" y="0" z="0"/><vertex x="26" y="0" z="0"/>'
        '<vertex x="26" y="6" z="0"/><vertex x="20" y="6" z="0"/>'
        '<vertex x="23" y="3" z="8"/>'
        "</vertices><triangles>"
        '<triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="3" v3="2"/>'
        '<triangle v1="0" v2="1" v3="4"/><triangle v1="1" v2="2" v3="4"/>'
        '<triangle v1="2" v2="3" v3="4"/><triangle v1="3" v2="0" v3="4"/>'
        "</triangles></mesh></object>"
    )
    materials = '<basematerials id="3"><base name="red" displaycolor="#3366CCFF"/></basematerials>'
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<model unit="inch" xml:lang="en-US" '
        'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" '
        'xmlns:ns0="caddy">'
        '<metadata name="ns0:note" type="str" preserve="1">read me</metadata>'
        f"<resources>{materials}{first}{second}</resources>"
        '<build><item objectid="1"/><item objectid="2"/></build>'
        "</model>"
    )


@case("mesher/read-package")
def mesher_read_package() -> dict[str, Any]:
    """A hand-written 3MF read back: units, object properties, colours and metadata."""
    package = three_mf_package(tetrahedron_model())
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "model.3mf"
        path.write_bytes(package)
        reader = Mesher()
        shapes = reader.read(path)
    return {
        "package": b64encode(package).decode("ascii"),
        "unit": reader.model_unit.name,
        "vertex_counts": reader.vertex_counts,
        "triangle_counts": reader.triangle_counts,
        "properties": [
            {"name": p["name"], "part_number": p["part_number"], "type": p["type"]}
            for p in reader.get_mesh_properties()
        ],
        "meta_data": reader.get_meta_data(),
        "shapes": [imported(s) for s in shapes],
    }


@case("mesher/units")
def mesher_units() -> dict[str, Any]:
    """Every unit survives a write and read as itself."""
    units = {}
    for unit in [Unit.MC, Unit.MM, Unit.CM, Unit.M, Unit.IN, Unit.FT]:
        writer = Mesher(unit=unit)
        writer.add_shape(Solid.make_box(1, 1, 1), uuid_value=UUID(int=3))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.3mf"
            writer.write(path)
            reader = Mesher()
            reader.read(path)
        units[unit.name] = reader.model_unit.name
    return {"units": units}
