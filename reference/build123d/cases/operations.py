from __future__ import annotations

from build123d import (
    Align,
    Axis,
    Box,
    Cylinder,
    Edge,
    Face,
    Until,
    Keep,
    Plane,
    Pos,
    Rectangle,
    Solid,
    Vertex,
    Wire,
    chamfer,
    draft,
    extrude,
    fillet,
    loft,
    mirror,
    offset,
    project,
    revolve,
    scale,
    section,
    split,
    sweep,
    thicken,
)
from oracle import case, shape_metrics, vec


@case("extrude/face")
def extrude_face():
    return {"shape": shape_metrics(extrude(Rectangle(8, 5), amount=6))}


@case("extrude/both")
def extrude_both():
    return {"shape": shape_metrics(extrude(Rectangle(8, 5), amount=3, both=True))}


@case("extrude/taper")
def extrude_taper():
    return {"shape": shape_metrics(extrude(Rectangle(10, 6), amount=5, taper=10))}


@case("extrude/until-next")
def extrude_until_next():
    profile = (Pos(0, 0, -10) * Rectangle(4, 3)).faces()[0]
    return {"shape": shape_metrics(extrude(profile, until=Until.NEXT, target=Box(10, 8, 10)))}


@case("extrude/until-last")
def extrude_until_last():
    profile = (Pos(0, 0, -10) * Rectangle(4, 3)).faces()[0]
    return {"shape": shape_metrics(extrude(profile, until=Until.LAST, target=Box(10, 8, 10)))}


@case("extrude/until-previous")
def extrude_until_previous():
    profile = (Pos(0, 0, 10) * Rectangle(4, 3)).faces()[0]
    return {"shape": shape_metrics(extrude(profile, until=Until.PREVIOUS, target=Box(10, 8, 10)))}


@case("revolve/face")
def revolve_face():
    profile = Face(Wire.make_polygon([(2, 0, 0), (5, 0, 0), (5, 0, 4), (2, 0, 4)]))
    return {"shape": shape_metrics(revolve(profile, axis=Axis.Z, revolution_arc=180))}


@case("loft/ruled")
def loft_ruled():
    lower = Rectangle(10, 8).faces()[0]
    upper = (Pos(0, 0, 8) * Rectangle(6, 4)).faces()[0]
    return {"shape": shape_metrics(loft([lower, upper], ruled=True))}


@case("loft/smooth")
def loft_smooth():
    bottom = Rectangle(9, 9).faces()[0]
    middle = (Pos(0, 0, 4) * Rectangle(7, 7)).faces()[0]
    top = (Pos(0, 0, 8) * Rectangle(4, 4)).faces()[0]
    return {"shape": shape_metrics(loft([bottom, middle, top]))}


@case("sweep/face")
def sweep_face():
    path = Wire.make_polygon([(0, 0, 0), (0, 0, 5), (0, 0, 10)], close=False)
    return {"shape": shape_metrics(sweep(Rectangle(4, 3), path))}


@case("fillet/solid")
def fillet_solid():
    solid = Box(10, 8, 6)
    return {"shape": shape_metrics(fillet(solid.edges().filter_by(Axis.Z), radius=1))}


@case("chamfer/solid")
def chamfer_solid():
    solid = Box(10, 8, 6)
    return {"shape": shape_metrics(chamfer(solid.edges().filter_by(Axis.Z), length=1))}


@case("offset/solid")
def offset_solid():
    return {"shape": shape_metrics(offset(Box(8, 6, 4), amount=1))}


@case("offset/opening")
def offset_opening():
    solid = Box(8, 6, 4)
    top = solid.faces().sort_by(Axis.Z)[-1]
    return {"shape": shape_metrics(offset(solid, amount=-0.8, openings=[top]))}


@case("mirror/plane")
def mirror_plane():
    return {"shape": shape_metrics(mirror(Pos(3, 2, 1) * Box(4, 2, 3), about=Plane.XZ))}


@case("scale/uniform")
def scale_uniform():
    return {"shape": shape_metrics(scale(Box(4, 3, 2), by=1.5, about=(1, 0, 0)))}


@case("scale/nonuniform")
def scale_nonuniform():
    return {"shape": shape_metrics(scale(Box(4, 3, 2), by=(2, 1.5, 0.5), about=(0, 0, 0)))}


@case("split/top")
def split_top():
    return {"shape": shape_metrics(split(Box(8, 6, 4), bisect_by=Plane.XY, keep=Keep.TOP))}


@case("split/bottom")
def split_bottom():
    return {"shape": shape_metrics(split(Box(8, 6, 4), bisect_by=Plane.XY, keep=Keep.BOTTOM))}


@case("section/plane")
def section_plane():
    return {"shape": shape_metrics(section(Box(8, 6, 4), section_by=Plane.XY))}


@case("thicken/face")
def thicken_face():
    return {"shape": shape_metrics(thicken(Rectangle(8, 6), amount=1))}


@case("draft/solid")
def draft_solid():
    solid = Box(10, 8, 6, align=(Align.CENTER, Align.CENTER, Align.MIN))
    side = solid.faces().sort_by(Axis.X)[-1]
    return {"shape": shape_metrics(draft(side, neutral_plane=Plane.XY, angle=5))}


@case("extrude/face-method")
def extrude_face_method():
    return {"shape": shape_metrics(extrude(Rectangle(8, 5).faces()[0], amount=6))}


@case("extrude/sketch-method")
def extrude_sketch_method():
    return {"shape": shape_metrics(extrude(Rectangle(8, 5), amount=6))}


@case("extrude/solid-method")
def extrude_solid_method():
    return {"shape": shape_metrics(Solid.extrude(Rectangle(8, 5).faces()[0], (0, 0, 6)))}


@case("fillet/method")
def fillet_method():
    solid = Box(10, 8, 6)
    return {"shape": shape_metrics(solid.fillet(1, solid.edges().filter_by(Axis.Z)))}


@case("chamfer/method")
def chamfer_method():
    solid = Box(10, 8, 6)
    return {"shape": shape_metrics(solid.chamfer(1, None, solid.edges().filter_by(Axis.Z)))}


@case("offset/method")
def offset_method():
    return {"shape": shape_metrics(Box(8, 6, 4).solids()[0].offset_3d([], 1))}


@case("project/face-plane")
def project_face_plane():
    face = (Pos(0, 0, 5) * Rectangle(4, 3)).faces()[0]
    return {"shape": shape_metrics(project(face, workplane=Plane.XY))}


@case("project/point-plane")
def project_point_plane():
    return {"point": vec(project(Vertex(1, 2, 5), workplane=Plane.XY)[0])}
