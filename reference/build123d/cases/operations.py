from __future__ import annotations

from build123d import (
    Align,
    Axis,
    Box,
    Cylinder,
    Edge,
    Face,
    FilletPolyline,
    Keep,
    Kind,
    Location,
    Plane,
    Pos,
    Rectangle,
    Solid,
    Sphere,
    Transition,
    Until,
    Vertex,
    Wire,
    chamfer,
    draft,
    extrude,
    fillet,
    loft,
    make_brake_formed,
    mirror,
    offset,
    project,
    project_workplane,
    revolve,
    scale,
    section,
    split,
    sweep,
    thicken,
)
from oracle import case, plane, shape_metrics, vec


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


@case("sweep/multisection")
def sweep_multisection():
    path = Edge.make_line((0, 0, 0), (0, 0, 10))
    lower = Rectangle(6, 4).faces()[0]
    upper = (Pos(0, 0, 10) * Rectangle(3, 2)).faces()[0]
    return {"shape": shape_metrics(sweep([lower, upper], path, multisection=True))}


@case("sweep/transition-right")
def sweep_transition_right():
    path = Wire.make_polygon([(0, 0, 0), (0, 0, 8), (6, 0, 8)], close=False)
    swept = sweep(Rectangle(2, 2), path, transition=Transition.RIGHT)
    return {"shape": shape_metrics(swept)}


@case("extrude/until-target-face")
def extrude_until_target_face():
    profile = (Pos(0, 0, -10) * Rectangle(3, 3)).faces()[0]
    target = Box(12, 12, 6)
    return {"shape": shape_metrics(extrude(profile, until=Until.NEXT, target=target))}


@case("offset/face")
def offset_face():
    return {"shape": shape_metrics(offset(Rectangle(8, 6).faces()[0], amount=0.75))}


@case("offset/method-face-normal")
def offset_method_face_normal():
    face = Rectangle(8, 6).faces()[0]
    return {"shape": shape_metrics(face.offset(2.5))}


@case("hollow/watertight")
def hollow_watertight():
    return {"shape": shape_metrics(Box(1, 1, 1).solid().hollow([], thickness=-0.1))}


@case("hollow/openings")
def hollow_openings():
    box = Box(1, 1, 1).solid()
    return {
        "shape": shape_metrics(
            box.hollow(box.faces().filter_by(Axis.Z), thickness=0.1, kind=Kind.INTERSECTION)
        )
    }


@case("maxfillet/box")
def maxfillet_box():
    solid = Box(10, 8, 2).solid()
    return {"radius": solid.max_fillet(solid.edges())}


@case("dprism/thru-all")
def dprism_thru_all():
    profile = Face.make_rect(0.5, 0.5)
    solid = Box(1, 1, 1, align=(Align.CENTER, Align.CENTER, Align.MIN)).solid()
    return {"shape": shape_metrics(solid.dprism(None, [profile], additive=False))}


@case("dprism/depth")
def dprism_depth():
    profile = Face.make_rect(0.5, 0.5)
    solid = Box(1, 1, 1, align=(Align.CENTER, Align.CENTER, Align.MIN)).solid()
    return {
        "shape": shape_metrics(
            solid.dprism(None, [profile], depth=0.5, thru_all=False, additive=False)
        )
    }


@case("dprism/wire-bounds")
def dprism_wire_bounds():
    outline = Face.make_rect(0.5, 0.5).outer_wire()
    solid = Box(1, 1, 1, align=(Align.CENTER, Align.CENTER, Align.MIN)).solid()
    return {"shape": shape_metrics(solid.dprism(None, [outline], additive=False))}


@case("split/method-top")
def split_method_top():
    pieces = Box(8, 6, 4).solid().split(Plane.XY, keep=Keep.TOP)
    return {"shape": shape_metrics(pieces)}


@case("split/method-both")
def split_method_both():
    top, bottom = Box(8, 6, 4).solid().split(Plane.XY, keep=Keep.BOTH)
    return {"top": {"shape": shape_metrics(top)}, "bottom": {"shape": shape_metrics(bottom)}}


@case("split/by-perimeter-inside")
def split_by_perimeter_inside():
    sphere = Sphere(10).solid()
    surface = sphere.faces()[0]
    perimeter = Wire.make_circle(3, Plane((0, 0, 10)))
    projected = perimeter.project_to_shape(sphere, (0, 0, -1))[0]
    inside = surface.split_by_perimeter(projected, Keep.INSIDE)
    return {"shape": shape_metrics(inside)}


@case("project/wire-to-shape")
def project_wire_to_shape():
    target = Cylinder(5, 10, align=(Align.CENTER, Align.CENTER, Align.MIN)).solid()
    square = Rectangle(4, 4).faces()[0].outer_wire().moved(Location((0, 0, 12)))
    return {"shape": shape_metrics(square.project_to_shape(target, (0, 0, -1))[0])}


@case("project/edge-to-shape")
def project_edge_to_shape():
    target = Cylinder(5, 10, align=(Align.CENTER, Align.CENTER, Align.MIN)).solid()
    line = Edge.make_line((-4, 0, 12), (4, 0, 12))
    return {"shape": shape_metrics(line.project_to_shape(target, (0, 0, -1))[0])}


@case("project/line-onto-face")
def project_line_onto_face():
    face = Face.make_rect(20, 20, Plane.XY)
    line = Edge.make_line((-4, -2, 5), (4, 3, 5))
    return {"shape": shape_metrics(line.project(face, (0, 0, -1)))}


@case("project/workplane")
def project_workplane_case():
    return {"plane": plane(project_workplane((1, 2, 3), (1, 0, 0), (0, 0, 1), 10))}


@case("brakeformed/constant-width")
def brakeformed_constant_width():
    outline = FilletPolyline((0, 0), (5, 6), (10, 1), radius=1)
    return {"shape": shape_metrics(make_brake_formed(0.5, 1, line=outline))}


@case("brakeformed/station-widths")
def brakeformed_station_widths():
    outline = FilletPolyline((0, 0), (5, 6), (10, 1), radius=1)
    return {"shape": shape_metrics(make_brake_formed(0.5, [1, 2, 3, 4], line=outline))}


@case("project/faces-along-path")
def project_faces_along_path():
    target = Cylinder(10, 20).solid()
    path = Wire.make_circle(10, Plane((0, 0, 0)))
    squares = [(Pos(x, 0, 0) * Rectangle(2, 2)).faces()[0] for x in (0, 3, 6)]
    projected = target.project_faces(squares, path)
    return {f"face{i}": {"shape": shape_metrics(face)} for i, face in enumerate(projected)}


@case("project/face-to-shape")
def project_face_to_shape():
    target = Cylinder(10, 20).solid()
    patch = (Pos(0, 0, 14) * Rectangle(6, 4)).faces()[0]
    projected = patch.project_to_shape(target, (0, 0, -1))
    return {f"face{i}": {"shape": shape_metrics(face)} for i, face in enumerate(projected)}
