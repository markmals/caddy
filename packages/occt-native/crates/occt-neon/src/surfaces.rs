//! Faces built on an explicit surface rather than on wires, and the analytic queries that read
//! the surface a face sits on or the plane a line lies in. Angles cross the boundary in radians.

use cxx::UniquePtr;
use neon::prelude::*;
use opencascade_sys::{
    b_rep::BRep_Tool_Surface_face,
    b_rep_adaptor::{
        BRepAdaptor_Curve2d_as_Geom2dAdaptor_Curve, BRepAdaptor_Curve2d_new_edge_face,
        Handle_BRepAdaptor_Curve2d_get,
    },
    b_rep_builder_api::{
        BRepBuilderAPI_MakeEdge_as_BRepBuilderAPI_MakeShape_mut,
        BRepBuilderAPI_MakeEdge_new_hcurve_hsurface_real2,
        BRepBuilderAPI_MakeFace_as_BRepBuilderAPI_MakeShape_mut, BRepBuilderAPI_MakeFace_new_face,
        BRepBuilderAPI_MakeFace_new_hsurface_real,
    },
    b_rep_fill::{BRepFill_Face, BRepFill_Shell},
    b_rep_lib::{BRepLib_FindSurface_Surface, BRepLib_FindSurface_new_shape_real_bool2},
    b_rep_offset_api::{
        BRepOffsetAPI_MakeFilling, BRepOffsetAPI_MakeFilling_as_BRepBuilderAPI_MakeShape_mut,
        BRepOffsetAPI_MakeFilling_new_int3_bool_real4_int2,
    },
    b_rep_tools::{
        BRepTools_ReShape_Apply, BRepTools_ReShape_new, Handle_BRepTools_ReShape_get_mut,
    },
    geom::{
        Geom_BezierSurface_new_array2ofpnt, Geom_BezierSurface_new_array2ofpnt_array2ofreal,
        Geom_Plane_new_ax3, Geom_RectangularTrimmedSurface_BasisSurface,
        Handle_Geom_BSplineSurface_to_Geom_Surface, Handle_Geom_BezierSurface_to_Geom_Surface,
        Handle_Geom_OffsetSurface_from_Geom_Surface, Handle_Geom_OffsetSurface_get,
        Handle_Geom_OffsetSurface_is_null, Handle_Geom_Plane_from_Geom_Surface,
        Handle_Geom_Plane_get, Handle_Geom_Plane_is_null, Handle_Geom_Plane_to_Geom_Surface,
        Handle_Geom_RectangularTrimmedSurface_from_Geom_Surface,
        Handle_Geom_RectangularTrimmedSurface_get, Handle_Geom_RectangularTrimmedSurface_is_null,
        Handle_Geom_Surface, Handle_Geom_Surface_clone, Handle_Geom_Surface_get,
    },
    geom_abs::{GeomAbs_Shape, GeomAbs_SurfaceType},
    geom_adaptor::{
        GeomAdaptor_Surface_AxeOfRevolution, GeomAdaptor_Surface_Cone,
        GeomAdaptor_Surface_Cylinder, GeomAdaptor_Surface_Sphere, GeomAdaptor_Surface_Torus,
        GeomAdaptor_Surface_new_hsurface, Handle_GeomAdaptor_Surface_get,
    },
    geom_api::GeomAPI_PointsToBSplineSurface_new_array2ofpnt_int2_shape_real,
    geom_api::GeomAPI_PointsToBSplineSurface_new_array2ofpnt_real3_int_shape_real,
    gp::{gp_Ax1, gp_Pnt_new, gp_Vec_new},
    precision::Precision,
    t_col_std::{TColStd_Array2OfReal, TColStd_Array2OfReal_new, TColStd_Array2OfReal_set_value},
    t_colgp::{TColgp_Array2OfPnt, TColgp_Array2OfPnt_new, TColgp_Array2OfPnt_set_value},
    top_abs::TopAbs_Orientation,
    top_abs::TopAbs_ShapeEnum,
    topo_ds::{
        TopoDS_Face_to_TopoDS_Shape, TopoDS_Shape, TopoDS_Shape_Reversed,
        TopoDS_Shell_to_TopoDS_Shape,
    },
};

use crate::{
    construct::{as_edge, as_face, as_wire, build, points},
    convert::{ax3, dir_xyz, vec_xyz, xyz},
    error::{OcctError, OcctResult, OrThrow, attempt},
    shape::{ShapeCell, ShapeResult, boxed, get, shapes_from_js},
};

/// Splits a flat `[x, y, z, ...]` array into the row-major grid OCCT indexes from one.
fn point_grid(values: &[f64], columns: usize) -> OcctResult<UniquePtr<TColgp_Array2OfPnt>> {
    let grid = points(values, "surface points")?;
    let rows = grid_rows(grid.len(), columns, "surface points")?;
    let mut array = TColgp_Array2OfPnt_new(1, rows as i32, 1, columns as i32)?;
    for (index, point) in grid.iter().enumerate() {
        let (row, column) = (index / columns, index % columns);
        TColgp_Array2OfPnt_set_value(array.pin_mut(), row as i32 + 1, column as i32 + 1, point)?;
    }
    Ok(array)
}

fn weight_grid(values: &[f64], columns: usize) -> OcctResult<UniquePtr<TColStd_Array2OfReal>> {
    let rows = grid_rows(values.len(), columns, "surface weights")?;
    let mut array = TColStd_Array2OfReal_new(1, rows as i32, 1, columns as i32)?;
    for (index, value) in values.iter().enumerate() {
        let (row, column) = (index / columns, index % columns);
        TColStd_Array2OfReal_set_value(array.pin_mut(), row as i32 + 1, column as i32 + 1, *value)?;
    }
    Ok(array)
}

fn grid_rows(count: usize, columns: usize, what: &str) -> OcctResult<usize> {
    if columns == 0 || count == 0 || count % columns != 0 {
        return Err(OcctError::invalid(format!(
            "{what} must form a rectangular grid, got {count} values in rows of {columns}"
        )));
    }
    Ok(count / columns)
}

/// The natural face of a surface, bounded by its own parameter range.
fn face_from_surface(surface: &Handle_Geom_Surface) -> OcctResult<UniquePtr<TopoDS_Shape>> {
    let mut maker = BRepBuilderAPI_MakeFace_new_hsurface_real(surface, Precision::Confusion()?)?;
    build(
        BRepBuilderAPI_MakeFace_as_BRepBuilderAPI_MakeShape_mut(maker.pin_mut()),
        "BRepBuilderAPI_MakeFace",
    )
}

/// Bézier surface through a grid of control points, optionally weighted
/// (build123d `Face.make_bezier_surface`).
#[neon::export(name = "makeBezierSurfaceFace")]
fn make_bezier_surface_face<'cx>(
    cx: &mut Cx<'cx>,
    control_points: Vec<f64>,
    columns: f64,
    weights: Vec<f64>,
) -> ShapeResult {
    attempt(|| {
        let columns = columns as usize;
        let poles = point_grid(&control_points, columns)?;
        let surface = if weights.is_empty() {
            Geom_BezierSurface_new_array2ofpnt(&poles)?
        } else {
            Geom_BezierSurface_new_array2ofpnt_array2ofreal(
                &poles,
                &*weight_grid(&weights, columns)?,
            )?
        };
        boxed(face_from_surface(&Handle_Geom_BezierSurface_to_Geom_Surface(&surface))?)
    })
    .or_raise(cx)
}

/// B-spline surface approximating a grid of points (build123d
/// `Face.make_surface_from_array_of_points`). `smoothing` is empty or the three variational
/// weights.
#[neon::export(name = "makeApproxSurfaceFace")]
fn make_approx_surface_face<'cx>(
    cx: &mut Cx<'cx>,
    surface_points: Vec<f64>,
    columns: f64,
    tolerance: f64,
    smoothing: Vec<f64>,
    min_degree: f64,
    max_degree: f64,
) -> ShapeResult {
    attempt(|| {
        let poles = point_grid(&surface_points, columns as usize)?;
        let builder = if smoothing.is_empty() {
            GeomAPI_PointsToBSplineSurface_new_array2ofpnt_int2_shape_real(
                &poles,
                min_degree as i32,
                max_degree as i32,
                GeomAbs_Shape::GeomAbs_C2,
                tolerance,
            )?
        } else {
            let &[first, second, third] = smoothing.as_slice() else {
                return Err(OcctError::invalid("variational smoothing takes three weights"));
            };
            GeomAPI_PointsToBSplineSurface_new_array2ofpnt_real3_int_shape_real(
                &poles,
                first,
                second,
                third,
                max_degree as i32,
                GeomAbs_Shape::GeomAbs_C2,
                tolerance,
            )?
        };
        if !builder.IsDone()? {
            return Err(OcctError::failed("B-spline approximation failed"));
        }
        boxed(face_from_surface(&Handle_Geom_BSplineSurface_to_Geom_Surface(builder.Surface()?))?)
    })
    .or_raise(cx)
}

/// Ruled face between two edges (build123d `Face.make_surface_from_curves`).
#[neon::export(name = "makeRuledFace")]
fn make_ruled_face<'cx>(cx: &mut Cx<'cx>, first: &ShapeCell, second: &ShapeCell) -> ShapeResult {
    let (first, second) = (get(first).or_raise(cx)?, get(second).or_raise(cx)?);
    attempt(|| {
        let face = BRepFill_Face(as_edge(&first)?, as_edge(&second)?)?;
        boxed(TopoDS_Face_to_TopoDS_Shape(&face))
    })
    .or_raise(cx)
}

/// Ruled shell between two wires with matching edge counts (build123d
/// `Face.make_surface_from_curves`).
#[neon::export(name = "makeRuledShell")]
fn make_ruled_shell<'cx>(cx: &mut Cx<'cx>, first: &ShapeCell, second: &ShapeCell) -> ShapeResult {
    let (first, second) = (get(first).or_raise(cx)?, get(second).or_raise(cx)?);
    attempt(|| {
        let shell = BRepFill_Shell(as_wire(&first)?, as_wire(&second)?)?;
        boxed(TopoDS_Shell_to_TopoDS_Shape(&shell))
    })
    .or_raise(cx)
}

/// Continuity of a patch constraint: 0 keeps position, 1 adds tangency, 2 adds curvature.
fn continuity(level: f64) -> OcctResult<GeomAbs_Shape> {
    match level as i32 {
        0 => Ok(GeomAbs_Shape::GeomAbs_C0),
        1 => Ok(GeomAbs_Shape::GeomAbs_G1),
        2 => Ok(GeomAbs_Shape::GeomAbs_G2),
        other => Err(OcctError::invalid(format!("unknown continuity level {other}"))),
    }
}

/// `BRepOffsetAPI_MakeFilling`'s own defaults, which build123d relies on by constructing the
/// algorithm without arguments.
fn default_filling() -> OcctResult<UniquePtr<BRepOffsetAPI_MakeFilling>> {
    Ok(BRepOffsetAPI_MakeFilling_new_int3_bool_real4_int2(
        3, 15, 2, false, 0.00001, 0.0001, 0.01, 0.1, 8, 9,
    )?)
}

/// Face patch filling a set of boundary edges, each optionally continuous with a support face,
/// and passing through extra points (build123d `Face.make_surface_patch`).
#[neon::export(name = "makeFilledPatch")]
fn make_filled_patch<'cx>(
    cx: &mut Cx<'cx>,
    supported_edges: Handle<'cx, JsArray>,
    support_faces: Handle<'cx, JsArray>,
    continuities: Vec<f64>,
    free_edges: Handle<'cx, JsArray>,
    point_constraints: Vec<f64>,
) -> ShapeResult {
    let supported = shapes_from_js(cx, supported_edges)?;
    let supports = shapes_from_js(cx, support_faces)?;
    let free = shapes_from_js(cx, free_edges)?;
    attempt(|| {
        if supported.len() != supports.len() || supported.len() != continuities.len() {
            return Err(OcctError::invalid(
                "every supported patch edge needs a support face and a continuity level",
            ));
        }
        let mut patch: UniquePtr<BRepOffsetAPI_MakeFilling> = default_filling()?;
        for ((edge, support), level) in supported.iter().zip(&supports).zip(&continuities) {
            patch.pin_mut().Add_edge_face_shape_bool(
                as_edge(edge)?,
                as_face(support)?,
                continuity(*level)?,
                true,
            )?;
        }
        for edge in &free {
            patch.pin_mut().Add_edge_shape_bool(as_edge(edge)?, GeomAbs_Shape::GeomAbs_C0, true)?;
        }
        if !point_constraints.is_empty() {
            for point in points(&point_constraints, "point constraints")? {
                patch.pin_mut().Add_pnt(&point)?;
            }
        }
        let patched = build(
            BRepOffsetAPI_MakeFilling_as_BRepBuilderAPI_MakeShape_mut(patch.pin_mut()),
            "BRepOffsetAPI_MakeFilling",
        )?;
        as_face(&patched)?;
        boxed(patched)
    })
    .or_raise(cx)
}

/// `face` with `wires` added as interior boundaries (build123d `Face.make_holes`).
#[neon::export(name = "addFaceHoles")]
fn add_face_holes<'cx>(
    cx: &mut Cx<'cx>,
    face: &ShapeCell,
    hole_wires: Handle<'cx, JsArray>,
) -> ShapeResult {
    let wires = shapes_from_js(cx, hole_wires)?;
    let face = get(face).or_raise(cx)?;
    attempt(|| {
        if wires.is_empty() {
            return Err(OcctError::invalid("a hole needs at least one interior wire"));
        }
        let mut maker = BRepBuilderAPI_MakeFace_new_face(as_face(&face)?)?;
        for wire in &wires {
            maker.pin_mut().Add(as_wire(wire)?)?;
        }
        boxed(build(
            BRepBuilderAPI_MakeFace_as_BRepBuilderAPI_MakeShape_mut(maker.pin_mut()),
            "BRepBuilderAPI_MakeFace",
        )?)
    })
    .or_raise(cx)
}

/// `face` with `wires` dropped from its boundaries (build123d `Face.without_holes`).
#[neon::export(name = "removeFaceHoles")]
fn remove_face_holes<'cx>(
    cx: &mut Cx<'cx>,
    face: &ShapeCell,
    hole_wires: Handle<'cx, JsArray>,
) -> ShapeResult {
    let wires = shapes_from_js(cx, hole_wires)?;
    let face = get(face).or_raise(cx)?;
    attempt(|| {
        let mut reshaper = BRepTools_ReShape_new()?;
        for wire in &wires {
            Handle_BRepTools_ReShape_get_mut(reshaper.pin_mut())?.Remove(wire)?;
        }
        let holeless = BRepTools_ReShape_Apply(
            Handle_BRepTools_ReShape_get_mut(reshaper.pin_mut())?,
            &face,
            TopAbs_ShapeEnum::TopAbs_SHAPE,
        )?;
        as_face(&holeless)?;
        boxed(holeless)
    })
    .or_raise(cx)
}

/// The surface a face sits on, with trimming and offsetting peeled away.
fn basis_surface(face: &TopoDS_Shape) -> OcctResult<UniquePtr<Handle_Geom_Surface>> {
    let mut surface = BRep_Tool_Surface_face(as_face(face)?)?;
    loop {
        let trimmed = Handle_Geom_RectangularTrimmedSurface_from_Geom_Surface(&surface);
        if !Handle_Geom_RectangularTrimmedSurface_is_null(&trimmed) {
            surface = Geom_RectangularTrimmedSurface_BasisSurface(
                Handle_Geom_RectangularTrimmedSurface_get(&trimmed)?,
            )?;
            continue;
        }
        let offset = Handle_Geom_OffsetSurface_from_Geom_Surface(&surface);
        if !Handle_Geom_OffsetSurface_is_null(&offset) {
            surface =
                Handle_Geom_Surface_clone(Handle_Geom_OffsetSurface_get(&offset)?.BasisSurface()?);
            continue;
        }
        return Ok(surface);
    }
}

fn axis_values(axis: &gp_Ax1) -> OcctResult<Vec<f64>> {
    let mut values = xyz(axis.Location()?)?.to_vec();
    values.extend(dir_xyz(axis.Direction()?)?);
    Ok(values)
}

/// `[ox, oy, oz, dx, dy, dz]` for a surface of revolution, or empty for every other surface
/// (build123d `Face.axis_of_rotation`).
#[neon::export(name = "faceAxisOfRotation")]
fn face_axis_of_rotation<'cx>(cx: &mut Cx<'cx>, face: &ShapeCell) -> NeonResult<Vec<f64>> {
    let face = get(face).or_raise(cx)?;
    attempt(|| {
        let surface = basis_surface(&face)?;
        let adaptor = GeomAdaptor_Surface_new_hsurface(&surface)?;
        let adaptor = Handle_GeomAdaptor_Surface_get(&adaptor)?;
        let kind = adaptor.GetType()?.repr;
        if kind == GeomAbs_SurfaceType::GeomAbs_Cone.repr {
            return axis_values(GeomAdaptor_Surface_Cone(adaptor)?.Axis()?);
        }
        if kind == GeomAbs_SurfaceType::GeomAbs_Cylinder.repr {
            return axis_values(GeomAdaptor_Surface_Cylinder(adaptor)?.Axis()?);
        }
        if kind == GeomAbs_SurfaceType::GeomAbs_Sphere.repr {
            let sphere = GeomAdaptor_Surface_Sphere(adaptor)?;
            let position = sphere.Position()?;
            let mut values = xyz(position.Location()?)?.to_vec();
            values.extend(dir_xyz(position.Direction()?)?);
            return Ok(values);
        }
        if kind == GeomAbs_SurfaceType::GeomAbs_Torus.repr {
            return axis_values(GeomAdaptor_Surface_Torus(adaptor)?.Axis()?);
        }
        if kind == GeomAbs_SurfaceType::GeomAbs_SurfaceOfRevolution.repr {
            let axis = GeomAdaptor_Surface_AxeOfRevolution(adaptor)?;
            return axis_values(&axis);
        }
        Ok(Vec::new())
    })
    .or_raise(cx)
}

/// `[semiAngle]` in radians for an untrimmed conical surface, empty otherwise (build123d
/// `Face.semi_angle`).
#[neon::export(name = "faceSemiAngle")]
fn face_semi_angle<'cx>(cx: &mut Cx<'cx>, face: &ShapeCell) -> NeonResult<Vec<f64>> {
    let face = get(face).or_raise(cx)?;
    attempt(|| {
        let surface = BRep_Tool_Surface_face(as_face(&face)?)?;
        let trimmed = Handle_Geom_RectangularTrimmedSurface_from_Geom_Surface(&surface);
        if !Handle_Geom_RectangularTrimmedSurface_is_null(&trimmed) {
            return Ok(Vec::new());
        }
        let adaptor = GeomAdaptor_Surface_new_hsurface(&surface)?;
        let adaptor = Handle_GeomAdaptor_Surface_get(&adaptor)?;
        if adaptor.GetType()?.repr != GeomAbs_SurfaceType::GeomAbs_Cone.repr {
            return Ok(Vec::new());
        }
        Ok(vec![GeomAdaptor_Surface_Cone(adaptor)?.SemiAngle()?])
    })
    .or_raise(cx)
}

/// `[majorRadius, minorRadius]` for a toroidal surface, empty otherwise (build123d `Face.radii`).
#[neon::export(name = "faceRadii")]
fn face_radii<'cx>(cx: &mut Cx<'cx>, face: &ShapeCell) -> NeonResult<Vec<f64>> {
    let face = get(face).or_raise(cx)?;
    attempt(|| {
        let surface = basis_surface(&face)?;
        let adaptor = GeomAdaptor_Surface_new_hsurface(&surface)?;
        let adaptor = Handle_GeomAdaptor_Surface_get(&adaptor)?;
        if adaptor.GetType()?.repr != GeomAbs_SurfaceType::GeomAbs_Torus.repr {
            return Ok(Vec::new());
        }
        let torus = GeomAdaptor_Surface_Torus(adaptor)?;
        Ok(vec![torus.MajorRadius()?, torus.MinorRadius()?])
    })
    .or_raise(cx)
}

/// `[radius]` for an untrimmed cylindrical or spherical surface, empty otherwise (build123d
/// `Face.radius`).
#[neon::export(name = "faceRadius")]
fn face_radius<'cx>(cx: &mut Cx<'cx>, face: &ShapeCell) -> NeonResult<Vec<f64>> {
    let face = get(face).or_raise(cx)?;
    attempt(|| {
        let surface = BRep_Tool_Surface_face(as_face(&face)?)?;
        let trimmed = Handle_Geom_RectangularTrimmedSurface_from_Geom_Surface(&surface);
        if !Handle_Geom_RectangularTrimmedSurface_is_null(&trimmed) {
            return Ok(Vec::new());
        }
        let adaptor = GeomAdaptor_Surface_new_hsurface(&surface)?;
        let adaptor = Handle_GeomAdaptor_Surface_get(&adaptor)?;
        let kind = adaptor.GetType()?.repr;
        if kind == GeomAbs_SurfaceType::GeomAbs_Cylinder.repr {
            return Ok(vec![GeomAdaptor_Surface_Cylinder(adaptor)?.Radius()?]);
        }
        if kind == GeomAbs_SurfaceType::GeomAbs_Sphere.repr {
            return Ok(vec![GeomAdaptor_Surface_Sphere(adaptor)?.Radius()?]);
        }
        Ok(Vec::new())
    })
    .or_raise(cx)
}

/// `[nx, ny, nz]`: the normal of the plane `BRepLib_FindSurface` fits to `shape`, searching for a
/// plane only, or empty when it finds none (build123d `Mixin1D.normal`).
#[neon::export(name = "shapePlaneNormal")]
fn shape_plane_normal<'cx>(cx: &mut Cx<'cx>, shape: &ShapeCell) -> NeonResult<Vec<f64>> {
    let shape = get(shape).or_raise(cx)?;
    attempt(|| {
        let finder = BRepLib_FindSurface_new_shape_real_bool2(&shape, -1.0, true, false)?;
        if !finder.Found()? {
            return Ok(Vec::new());
        }
        let surface = BRepLib_FindSurface_Surface(&finder)?;
        let plane = Handle_Geom_Plane_from_Geom_Surface(&surface);
        if Handle_Geom_Plane_is_null(&plane) {
            return Ok(Vec::new());
        }
        let axis = Handle_Geom_Plane_get(&plane)?.Axis()?;
        Ok(dir_xyz(axis.Direction()?)?.to_vec())
    })
    .or_raise(cx)
}

/// `[px, py, pz, dux, duy, duz, dvx, dvy, dvz]`: the point on the face's surface at `(u, v)` and
/// the two first derivatives there.
#[neon::export(name = "faceDerivatives")]
fn face_derivatives<'cx>(
    cx: &mut Cx<'cx>,
    face: &ShapeCell,
    u: f64,
    v: f64,
) -> NeonResult<Vec<f64>> {
    let face = get(face).or_raise(cx)?;
    attempt(|| {
        let surface = BRep_Tool_Surface_face(as_face(&face)?)?;
        let mut point = gp_Pnt_new()?;
        let (mut du, mut dv) = (gp_Vec_new()?, gp_Vec_new()?);
        Handle_Geom_Surface_get(&surface)?.D1(u, v, point.pin_mut(), du.pin_mut(), dv.pin_mut())?;
        let mut values = xyz(&point)?.to_vec();
        values.extend(vec_xyz(&du)?);
        values.extend(vec_xyz(&dv)?);
        Ok(values)
    })
    .or_raise(cx)
}

/// The edge's 2D curve on `face`, rebuilt as an edge on the XY plane where X is the surface's U
/// parameter and Y its V parameter (build123d `Face.uv_face`).
#[neon::export(name = "makeParameterSpaceEdge")]
fn make_parameter_space_edge<'cx>(
    cx: &mut Cx<'cx>,
    edge: &ShapeCell,
    face: &ShapeCell,
) -> ShapeResult {
    let (edge, face) = (get(edge).or_raise(cx)?, get(face).or_raise(cx)?);
    attempt(|| {
        let adaptor = BRepAdaptor_Curve2d_new_edge_face(as_edge(&edge)?, as_face(&face)?)?;
        let pcurve = Handle_BRepAdaptor_Curve2d_get(&adaptor)?;
        let (first, last) = (pcurve.FirstParameter()?, pcurve.LastParameter()?);
        let curve = BRepAdaptor_Curve2d_as_Geom2dAdaptor_Curve(pcurve).Curve()?;
        let plane = Geom_Plane_new_ax3(&*ax3(&[0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0])?)?;
        let mut maker = BRepBuilderAPI_MakeEdge_new_hcurve_hsurface_real2(
            curve,
            &Handle_Geom_Plane_to_Geom_Surface(&plane),
            first,
            last,
        )?;
        let flat = build(
            BRepBuilderAPI_MakeEdge_as_BRepBuilderAPI_MakeShape_mut(maker.pin_mut()),
            "BRepBuilderAPI_MakeEdge",
        )?;
        if edge.Orientation()?.repr == TopAbs_Orientation::TopAbs_REVERSED.repr {
            return boxed(TopoDS_Shape_Reversed(&flat)?);
        }
        boxed(flat)
    })
    .or_raise(cx)
}
