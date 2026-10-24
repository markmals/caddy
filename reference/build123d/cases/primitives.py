"""Oracle cases for `brep_from_stl.detect_primitives`.

`detect_primitives` reads a triangle-soup mesh and reconstructs the analytic surfaces hiding
in it: planes, cylinders and spheres, each returned as a BREP `Face` alongside the mesh faces
it could not explain and a list of build123d source lines that rebuild the primitives. The
cases here cover the four shapes that exercise the three detectors (a box, a cylinder, a
sphere, a drilled plate), a rotated plate that forces the code generator off its named
`Plane.XY`-style branches onto the `Location(...)` fallback, and a deliberately noisy mesh.

The mesh ships as BREP, not as the STL it came from. `detect_primitives` indexes mesh faces
by position, so every recorded index, primitive order and leftover count is only meaningful
against one exact face ordering. An STL would have to be re-read by a second, differently
written reader to recover that ordering, and any disagreement there would masquerade as a
detection difference. The fixture therefore persists the already-read mesh shape under
`source` so both sides start from byte-identical topology. Each mesh is produced the way the
algorithm expects: `export_stl` writes the solid, and `Mesher().read` reads it back as one
BREP face per triangle. `import_stl` is not usable, because it returns a single `Face`
wrapping the whole triangulation, which `detect_primitives` cannot index.

The noisy case is the robustness probe: the same drilled plate, written to a binary STL and
rewritten with every distinct vertex nudged by a deterministic sub-tolerance offset, so the
mesh stays watertight but no triangle is exactly coplanar or exactly on the bore any more.
Fitting then falls apart — only a few primitives survive, most faces become leftovers, and
the planar code generator reports its `Error in generating planar rectangle` fallback. That
is the recorded expectation; none of these cases is tuned to look tidy.
"""

from __future__ import annotations

import random
import struct
import tempfile
from pathlib import Path
from typing import Any

from build123d import Box, Cylinder, Pos, Rot, Sphere, export_stl
from build123d.brep_from_stl import detect_primitives
from build123d.mesher import Mesher
from build123d.topology import Face, Shape

from oracle import brep, case, vec

# One deterministic offset per distinct STL vertex, small enough to keep the plate's shape
# recognisable (0.004 mm against a 6 mm thickness) yet larger than the fitters' tolerances.
JITTER_SEED = 20260408
JITTER_AMPLITUDE = 0.004
JITTER_VERTEX_DIGITS = 6

STL_HEADER = b"caddy oracle jittered mesh"

Triangle = tuple[tuple[float, float, float], list[tuple[float, float, float]], int]


def mesh_from_stl(shape: Shape, tolerance: float, angular_tolerance: float) -> Shape:
    """Tessellate `shape` through an STL round trip, giving one BREP face per triangle."""
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "mesh.stl"
        export_stl(shape, path, tolerance=tolerance, angular_tolerance=angular_tolerance)
        return Mesher().read(path)[0]


def detected_entry(face: Face) -> dict[str, Any]:
    """Everything that identifies one detected primitive face, beyond its surface type."""
    box = face.bounding_box()
    axis = face.axis_of_rotation
    is_plane = face.geom_type.name == "PLANE"
    return {
        "geom_type": face.geom_type.name,
        "orientation": face.wrapped.Orientation().name.removeprefix("TopAbs_"),
        "area": float(face.area),
        "center": vec(face.center()),
        "bounding_box": {"min": vec(box.min), "max": vec(box.max)},
        "radius": None if face.radius is None else float(face.radius),
        "normal": vec(face.normal_at()) if is_plane else None,
        "axis": None
        if axis is None
        else {"position": vec(axis.position), "direction": vec(axis.direction)},
    }


def detection(mesh: Shape) -> dict[str, Any]:
    """Run `detect_primitives` over `mesh` and record the mesh, both face sets and the code."""
    primitives, leftovers, code = detect_primitives(mesh)
    box = mesh.bounding_box()
    return {
        "source": brep(mesh),
        "mesh": {
            "face_count": len(mesh.faces()),
            "area": float(mesh.area),
            "bounding_box": {"min": vec(box.min), "max": vec(box.max)},
        },
        "detected": [detected_entry(face) for face in primitives],
        "leftover_count": len(leftovers),
        "leftover_area": float(sum(face.area for face in leftovers)),
        "code": list(code),
    }


def drilled_plate() -> Shape:
    """A plate with one central bore: planes, a cylinder, and nothing else."""
    return Box(20, 16, 6) - Cylinder(3, 10)


# ---- Jittered binary STL ----


def read_binary_stl(path: Path) -> list[Triangle]:
    """Parse a binary STL into `(normal, corners, attribute)` triples, in file order."""
    data = path.read_bytes()
    count = struct.unpack_from("<I", data, 80)[0]
    triangles: list[Triangle] = []
    offset = 84
    for _ in range(count):
        normal = struct.unpack_from("<3f", data, offset)
        offset += 12
        corners = []
        for _ in range(3):
            corners.append(struct.unpack_from("<3f", data, offset))
            offset += 12
        attribute = struct.unpack_from("<H", data, offset)[0]
        offset += 2
        triangles.append((normal, corners, attribute))
    return triangles


def write_binary_stl(path: Path, triangles: list[Triangle]) -> None:
    """Write triangles back out in the binary STL layout: header, count, then each facet."""
    buffer = bytearray(STL_HEADER.ljust(80, b"\0")[:80])
    buffer += struct.pack("<I", len(triangles))
    for normal, corners, attribute in triangles:
        buffer += struct.pack("<3f", *normal)
        for corner in corners:
            buffer += struct.pack("<3f", *corner)
        buffer += struct.pack("<H", attribute)
    path.write_bytes(bytes(buffer))


def jitter_triangles(triangles: list[Triangle]) -> list[Triangle]:
    """Displace every distinct vertex once, so shared corners stay shared and the mesh closes.

    Normals are left as the exporter wrote them, which is what a real scanned or converted
    mesh looks like: facet normals that no longer quite agree with the facet they label.
    """
    rng = random.Random(JITTER_SEED)
    offsets: dict[tuple[float, ...], tuple[float, float, float]] = {}
    jittered: list[Triangle] = []
    for normal, corners, attribute in triangles:
        moved = []
        for corner in corners:
            key = tuple(round(value, JITTER_VERTEX_DIGITS) for value in corner)
            offset = offsets.get(key)
            if offset is None:
                offset = (
                    rng.uniform(-JITTER_AMPLITUDE, JITTER_AMPLITUDE),
                    rng.uniform(-JITTER_AMPLITUDE, JITTER_AMPLITUDE),
                    rng.uniform(-JITTER_AMPLITUDE, JITTER_AMPLITUDE),
                )
                offsets[key] = offset
            moved.append(tuple(value + shift for value, shift in zip(corner, offset)))
        jittered.append((normal, moved, attribute))
    return jittered


def noisy_mesh(shape: Shape, tolerance: float, angular_tolerance: float) -> Shape:
    """Export `shape` to a binary STL, jitter every vertex of it, and read the result back."""
    with tempfile.TemporaryDirectory() as directory:
        clean = Path(directory) / "mesh.stl"
        noisy = Path(directory) / "noisy.stl"
        export_stl(shape, clean, tolerance=tolerance, angular_tolerance=angular_tolerance)
        write_binary_stl(noisy, jitter_triangles(read_binary_stl(clean)))
        return Mesher().read(noisy)[0]


# ---- Cases ----


@case("detect/box")
def detect_box() -> dict[str, Any]:
    """Twelve triangles, six planes, nothing left over: the smallest complete detection."""
    return detection(mesh_from_stl(Box(10, 10, 10), 0.1, 0.5))


@case("detect/cylinder")
def detect_cylinder() -> dict[str, Any]:
    """A barrel plus two caps: the cylinder fitter has to span the whole fan of facets."""
    return detection(mesh_from_stl(Cylinder(5, 10), 0.3, 0.8))


@case("detect/sphere")
def detect_sphere() -> dict[str, Any]:
    """One sphere out of a coarse ball, and the leftovers the fit could not claim."""
    return detection(mesh_from_stl(Sphere(6), 0.5, 1.0))


@case("detect/plate-with-holes")
def detect_plate_with_holes() -> dict[str, Any]:
    """Two bores of different radii, so the merge step has to keep them apart."""
    plate = drilled_plate() - Pos(6, 4, 0) * Cylinder(1.5, 10)
    return detection(mesh_from_stl(plate, 0.3, 1.0))


@case("detect/rotated-plate")
def detect_rotated_plate() -> dict[str, Any]:
    """Rotated off the axes, so the generator emits `Location(...)` instead of a named plane."""
    return detection(mesh_from_stl(Rot(0, 0, 30) * drilled_plate(), 0.3, 1.0))


@case("detect/noisy-plate")
def detect_noisy_plate() -> dict[str, Any]:
    """The same plate with every vertex nudged: few primitives, many leftovers, by design."""
    return detection(noisy_mesh(drilled_plate(), 0.2, 0.8))
