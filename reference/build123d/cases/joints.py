"""Oracle cases for build123d's joints.

Every case builds two parts, binds joints to them and connects the pair, then records where
the moved part and the joints ended up. build123d relocates the connected part in place; Caddy
returns the relocated copy from `connectTo`, so the recorded locations are what both have to
agree on.
"""

from __future__ import annotations

from typing import Any

from build123d import (
    Align,
    Axis,
    Box,
    Cone,
    Cylinder,
    Location,
    Pos,
    Rotation,
    Sphere,
)
from build123d.joints import (
    BallJoint,
    CylindricalJoint,
    LinearJoint,
    RevoluteJoint,
    RigidJoint,
)
from build123d.topology import Shape

from oracle import case, location, vec

MIN = (Align.MIN, Align.MIN, Align.MIN)


def corner_box(length: float, width: float, height: float) -> Box:
    """A box with its minimum corner at the origin, as `Solid.make_box` builds one."""
    return Box(length, width, height, align=MIN)


def placement(shape: Shape) -> dict[str, Any]:
    """Where a part ended up: its location and the box it occupies."""
    bounds = shape.bounding_box()
    return {
        "location": location(shape.location),
        "bounding_box": {"min": vec(bounds.min), "max": vec(bounds.max)},
    }


@case("rigid/stacked-boxes")
def rigid_stacked_boxes() -> dict[str, Any]:
    """A rigid joint on top of one box meets the one on the bottom of another."""
    base = corner_box(1, 1, 1)
    top = corner_box(1, 1, 1)
    bottom_joint = RigidJoint("top", base, Location((0.5, 0.5, 1)))
    top_joint = RigidJoint("bottom", top, Location((0.5, 0.5, 0)))
    bottom_joint.connect_to(top_joint)
    return {
        "moved": placement(top),
        "base": placement(base),
        "moved_joint": location(top_joint.location),
        "base_joint": location(bottom_joint.location),
    }


@case("rigid/order")
def rigid_order() -> dict[str, Any]:
    """Connecting moves the *other* joint's parent, whichever way round the pair is used."""
    forward_base = Box(1, 1, 1)
    forward_moved = Sphere(0.5)
    RigidJoint("one", forward_base, joint_location=Location((1, 2, 3))).connect_to(
        RigidJoint("two", forward_moved)
    )
    reverse_base = Box(1, 1, 1)
    reverse_moved = Sphere(0.5)
    RigidJoint("two", reverse_moved).connect_to(
        RigidJoint("one", reverse_base, joint_location=Location((1, 2, 3)))
    )
    return {
        "forward_base": vec(forward_base.location.position),
        "forward_moved": vec(forward_moved.location.position),
        "reverse_base": vec(reverse_base.location.position),
        "reverse_moved": vec(reverse_moved.location.position),
    }


@case("rigid/follows-relocated-part")
def rigid_follows_relocated_part() -> dict[str, Any]:
    """A joint is stored relative to its part, so relocating the part carries it along."""
    part = Box(2, 2, 2)
    joint = RigidJoint("top", part, joint_location=Location((0, 0, 1)))
    before = location(joint.location)
    part.locate(Location((5, -1, 2), (0, 0, 45)))
    return {
        "before": before,
        "after": location(joint.location),
        "relative": location(joint.relative_location),
    }


@case("rigid/survives-boolean")
def rigid_survives_boolean() -> dict[str, Any]:
    """build123d copies joints onto the result of a boolean that has none of its own."""
    part = Box(2, 2, 2)
    RigidJoint("top", part, joint_location=Location((0, 0, 1)))
    cut = part - Cylinder(0.5, 4)
    return {
        "labels": sorted(cut.joints),
        "joint": location(cut.joints["top"].location),
        "volume": float(cut.volume),
    }


@case("revolute/angle-reference")
def revolute_angle_reference() -> dict[str, Any]:
    """A hinge with an explicit angle reference, turned a quarter turn."""
    base = Cylinder(1, 1)
    arm = corner_box(1, 0.5, 1)
    hinge = RevoluteJoint(
        "top",
        base,
        axis=Axis((0, 0, 1), (0, 0, 1)),
        angle_reference=(1, 0, 0),
        angular_range=(0, 180),
    )
    rigid = RigidJoint("bottom", arm, Location((0.5, 0.25, 0)))
    hinge.connect_to(rigid, angle=90)
    return {
        "moved": placement(arm),
        "moved_joint": location(rigid.location),
        "hinge_joint": location(hinge.location),
        "symbol_edges": len(hinge.symbol.edges()),
    }


@case("revolute/measured-from-reference")
def revolute_measured_from_reference() -> dict[str, Any]:
    """The angle is measured from the reference direction, not from the X axis."""
    base = Box(1, 1, 1)
    arm = Box(0.2, 0.2, 2)
    RevoluteJoint("j1", base, Axis.Z, angle_reference=(1, 1, 0)).connect_to(
        RigidJoint("j2", arm, Location()), angle=22.5
    )
    return {"moved": placement(arm)}


@case("revolute/non-z-axis")
def revolute_non_z_axis() -> dict[str, Any]:
    """A hinge about -Y, with the rotating part's joint turned into place."""
    base = Box(6, 4, 2)
    rotating = Cone(2, 1, 2)
    hinge = RevoluteJoint("j1", base, Axis((3, 0, 1), (0, -1, 0)))
    rigid = RigidJoint("j2", rotating, Location((-2, 0, -1), (90, 0, -90)))
    hinge.connect_to(rigid, angle=30)
    return {
        "base": placement(base),
        "moved": placement(rotating),
        "hinge_joint": location(hinge.location),
        "moved_joint": location(rigid.location),
        "angle": hinge._angle,
    }


@case("revolute/default-angle-reference")
def revolute_default_angle_reference() -> dict[str, Any]:
    """Without a reference the X direction of the plane normal to the axis is used."""
    about_z = RevoluteJoint("z", Cylinder(1, 1), axis=Axis((0, 0, 1), (0, 0, 1)))
    about_x = RevoluteJoint("x", Cylinder(1, 1), axis=Axis((0, 0, 0), (1, 0, 0)))
    return {
        "z_reference": vec(about_z.angle_reference),
        "x_reference": vec(about_x.angle_reference),
    }


@case("revolute/absolute-locations")
def revolute_absolute_locations() -> dict[str, Any]:
    """Connected joints share a location, whichever kind drives the connection."""
    base = Box(10, 10, 1)
    arm = Box(5, 5, 1)
    rigid = RigidJoint("j1", base, Location((-4, -4, 0.5)))
    hinge = RevoluteJoint("j2", arm, Axis((2.5, 2.5, 0), (0, -1, 0)))
    rigid.connect_to(hinge, angle=0)
    return {
        "driving": location(rigid.location),
        "driven": location(hinge.location),
        "moved": placement(arm),
    }


@case("linear/rigid")
def linear_rigid() -> dict[str, Any]:
    """A slider carrying a rigid joint a quarter of the way along its axis."""
    base = corner_box(1, 1, 1)
    top = corner_box(1, 1, 1)
    slider = LinearJoint("top", base, axis=Axis((0, 0.5, 1), (1, 0, 0)), linear_range=(0, 1))
    rigid = RigidJoint("bottom", top, Location((0.5, 0.5, 0)))
    slider.connect_to(rigid, position=0.25)
    return {
        "moved": placement(top),
        "moved_joint": location(rigid.location),
        "slider_joint": location(slider.location),
        "position": slider.position,
        "angle": slider.angle,
        "symbol_edges": len(slider.symbol.edges()),
    }


@case("linear/revolute")
def linear_revolute() -> dict[str, Any]:
    """A slider carrying a hinge: the part slides and turns at once."""
    base = corner_box(1, 1, 1)
    top = corner_box(1, 0.5, 1).locate(Location((-0.5, -0.25, 0)))
    slider = LinearJoint("top", base, axis=Axis((0, 0.5, 1), (1, 0, 0)), linear_range=(0, 1))
    hinge = RevoluteJoint(
        "top",
        top,
        axis=Axis((0, 0, 0), (0, 0, 1)),
        angle_reference=(1, 0, 0),
        angular_range=(0, 180),
    )
    slider.connect_to(hinge, position=0.25, angle=90)
    return {
        "moved": placement(top),
        "moved_joint": location(hinge.location),
        "position": slider.position,
        "angle": slider.angle,
    }


@case("linear/default-position")
def linear_default_position() -> dict[str, Any]:
    """Without a position the slider sits at the middle of its range."""
    base = Box(4, 4, 1)
    top = Box(1, 1, 1)
    slider = LinearJoint("slot", base, axis=Axis((0, 0, 0.5), (1, 0, 0)), linear_range=(1, 3))
    slider.connect_to(RigidJoint("pin", top, Location((0, 0, -0.5))))
    return {"moved": placement(top), "position": slider.position}


@case("cylindrical/screwed-dowel")
def cylindrical_screwed_dowel() -> dict[str, Any]:
    """A dowel driven a quarter of the way in and turned a quarter turn."""
    base = Box(1, 1, 1, align=(Align.CENTER, Align.CENTER, Align.MIN))
    dowel = Cylinder(0.3, 1, align=(Align.CENTER, Align.CENTER, Align.MIN))
    screw = CylindricalJoint(
        "base",
        base,
        Axis((0, 0, 1), (0, 0, -1)),
        angle_reference=(1, 0, 0),
        linear_range=(0, 1),
        angular_range=(0, 90),
    )
    rigid = RigidJoint("bottom", dowel, Location((0, 0, 0), (0, 0, 0)))
    screw.connect_to(rigid, position=0.25, angle=90)
    return {
        "moved": placement(dowel),
        "moved_joint": location(rigid.location),
        "screw_joint": location(screw.location),
        "position": screw.position,
        "angle": screw.angle,
        "symbol_edges": len(screw.symbol.edges()),
    }


@case("cylindrical/default-position-and-angle")
def cylindrical_default_position_and_angle() -> dict[str, Any]:
    """Both defaults are the middle of their range, unlike the revolute joint's minimum."""
    base = Box(2, 2, 2)
    pin = Cylinder(0.2, 1)
    screw = CylindricalJoint(
        "base", base, Axis.Z, linear_range=(0, 2), angular_range=(0, 180)
    )
    screw.connect_to(RigidJoint("pin", pin, Location()))
    return {
        "moved": placement(pin),
        "position": screw.position,
        "angle": screw.angle,
    }


@case("ball/gimbal")
def ball_gimbal() -> dict[str, Any]:
    """A ball joint swung 45 degrees about X and Y."""
    socket = corner_box(1, 1, 1)
    rod = Cylinder(0.15, 2, align=(Align.CENTER, Align.CENTER, Align.MIN))
    ball = BallJoint(
        "socket",
        socket,
        Location((0.5, 0.5, 1)),
        angular_range=((-45, 45), (-45, 45), (0, 360)),
    )
    rigid = RigidJoint("ball", rod, Location((0, 0, 2), (180, 0, 0)))
    ball.connect_to(rigid, angles=(45, 45, 0))
    return {
        "moved": placement(rod),
        "moved_joint": location(rigid.location),
        "ball_joint": location(ball.location),
    }


@case("ball/rotation-argument")
def ball_rotation_argument() -> dict[str, Any]:
    """`angles` as a Rotation, as a tuple and left out: the first two agree, None is the minimum."""
    def relative(angles: Any) -> dict[str, Any]:
        ball = BallJoint("ball", Box(1, 1, 1), Location(), angular_range=((0, 90), (0, 90), (0, 90)))
        rigid = RigidJoint("rigid", Box(1, 1, 1), Location((0, 0, 0.5)))
        return location(ball.relative_to(rigid, angles=angles))

    return {
        "rotation": relative(Rotation(10, 20, 30)),
        "tuple": relative((10, 20, 30)),
        "default": relative(None),
    }


@case("ball/angle-reference-plane")
def ball_angle_reference_plane() -> dict[str, Any]:
    """The reference plane shifts where zero degrees points."""
    socket = Box(1, 1, 1)
    rod = Box(0.2, 0.2, 1)
    ball = BallJoint("socket", socket, Pos(0, 0, 0.5))
    ball.connect_to(RigidJoint("rod", rod, Pos(0, 0, -0.5)), angles=(0, 0, 90))
    return {"moved": placement(rod), "ball_joint": location(ball.location)}
