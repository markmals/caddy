//! Geometric queries on existing shapes: curve and surface evaluation, projections, distances
//! and point classification. Nothing here builds new geometry.
//!
//! Curve queries accept an edge (`BRepAdaptor_Curve`) or a wire (`BRepAdaptor_CompCurve`), the
//! two adaptors build123d's `geom_adaptor()` returns; parameters are the adaptor's own.

use cxx::UniquePtr;
use neon::prelude::*;
use opencascade_sys::{
    adaptor3d::{
        Adaptor3d_Curve, Adaptor3d_Curve_Circle, Adaptor3d_Curve_DN, Adaptor3d_Curve_Ellipse,
        Adaptor3d_Curve_Value, Handle_Adaptor3d_Curve,
    },
    b_rep::{
        BRep_Tool, BRep_Tool_Curve_edge_real2, BRep_Tool_CurveOnPlane, BRep_Tool_Parameters,
        BRep_Tool_Surface_face,
    },
    b_rep_adaptor::{
        BRepAdaptor_CompCurve_as_Adaptor3d_Curve, BRepAdaptor_CompCurve_new_wire_bool,
        BRepAdaptor_Curve_as_Adaptor3d_Curve, BRepAdaptor_Curve_new_edge,
        BRepAdaptor_Curve2d_new_edge_face, BRepAdaptor_Surface_new_face_bool,
        Handle_BRepAdaptor_CompCurve, Handle_BRepAdaptor_CompCurve_get,
        Handle_BRepAdaptor_CompCurve_to_Adaptor3d_Curve, Handle_BRepAdaptor_Curve,
        Handle_BRepAdaptor_Curve_get, Handle_BRepAdaptor_Curve_to_Adaptor3d_Curve,
        Handle_BRepAdaptor_Curve2d_get, Handle_BRepAdaptor_Surface_get,
    },
    b_rep_builder_api::{BRepBuilderAPI_MakeFace_new_pln, BRepBuilderAPI_MakeVertex_new_pnt},
    b_rep_class3d::BRepClass3d_SolidClassifier_new_shape,
    b_rep_extrema::{
        BRepExtrema_DistShapeShape_SupportOnShape2, BRepExtrema_DistShapeShape_new,
        BRepExtrema_SupportType,
    },
    b_rep_g_prop::BRepGProp_Face_new_face_bool,
    b_rep_int_curve_surface::BRepIntCurveSurface_Inter_new,
    b_rep_l_prop::BRepLProp,
    b_rep_tools::{BRepTools, BRepTools_OuterWire, BRepTools_WireExplorer_new_wire},
    extrema::Extrema_ExtAlgo,
    gc_pnts::{GCPnts_AbscissaPoint, GCPnts_AbscissaPoint_new_curve_real2},
    geom::{Handle_Geom_Curve_is_null, Handle_Geom_Surface},
    geom_abs::GeomAbs_CurveType,
    geom_api::{
        GeomAPI_ProjectPointOnCurve_new_pnt_hcurve,
        GeomAPI_ProjectPointOnSurf_new_pnt_hsurface_extalgo,
    },
    geom_fill::{
        GeomFill_CorrectedFrenet_new, GeomFill_Frenet_new,
        Handle_GeomFill_CorrectedFrenet_to_GeomFill_TrihedronLaw,
        Handle_GeomFill_Frenet_to_GeomFill_TrihedronLaw, Handle_GeomFill_TrihedronLaw_get_mut,
    },
    geom_lib::GeomLib_IsPlanarSurface_new_hsurface_real,
    geom2d::{Handle_Geom2d_Curve, Handle_Geom2d_Curve_is_null},
    geom2d_api::{
        Geom2dAPI_InterCurveCurve_Point, Geom2dAPI_InterCurveCurve_new_hcurve_real,
        Geom2dAPI_InterCurveCurve_new_hcurve2_real,
    },
    gp::{
        gp_Ax3_Ax2, gp_Ax3_new, gp_Ax3_new_ax2, gp_Ax3_new_pnt_dir2, gp_Dir_new_vec,
        gp_Lin_new_ax1, gp_Pln_new_ax3, gp_Pnt_new, gp_Pnt2d_new, gp_Pnt2d_new_real2, gp_Trsf_new,
        gp_Vec_new, gp_Vec2d_new, gp_XYZ_new_real3,
    },
    int_tools::IntTools_FClass2d_new_face_real,
    shape_analysis::{ShapeAnalysis_Curve, ShapeAnalysis_Edge_new},
    shape_fix::{
        Handle_ShapeFix_Shape_get, Handle_ShapeFix_Shape_get_mut, ShapeFix_Shape_Shape,
        ShapeFix_Shape_new_shape,
    },
    top_abs::{TopAbs_Orientation, TopAbs_ShapeEnum},
    top_exp::{TopExp, TopExp_Explorer_new_shape_shapeenum2},
    top_loc::TopLoc_Location_new,
    top_tools::{
        TopTools_IndexedDataMapOfShapeListOfShape_find_from_index,
        TopTools_IndexedDataMapOfShapeListOfShape_find_index,
        TopTools_IndexedDataMapOfShapeListOfShape_new, TopTools_ListOfShape_value,
    },
    topo_ds::{
        TopoDS_Edge_shape, TopoDS_Edge_to_TopoDS_Shape, TopoDS_Face_shape,
        TopoDS_Face_to_TopoDS_Shape, TopoDS_Shape, TopoDS_Vertex_shape,
        TopoDS_Vertex_to_TopoDS_Shape, TopoDS_Wire_shape, TopoDS_Wire_to_TopoDS_Shape,
    },
};

use crate::{
    builder::progress,
    convert::{ax1, ax3, dir, dir_xyz, pnt, trsf_to_vec, vec_xyz, vector, xyz},
    error::{OcctError, OcctResult, OrThrow, attempt},
    shape::{ShapeCell, ShapeResult, boxed, get, owned, shapes_to_js},
};

/// build123d's `TOLERANCE`, used by `Face.is_planar`.
const PLANAR_TOLERANCE: f64 = 1e-6;

enum CurveAdaptor {
    Edge(UniquePtr<Handle_BRepAdaptor_Curve>),
    Wire(UniquePtr<Handle_BRepAdaptor_CompCurve>),
}

impl CurveAdaptor {
    fn new(shape: &TopoDS_Shape) -> OcctResult<Self> {
        let kind = shape.ShapeType()?;
        if kind == TopAbs_ShapeEnum::TopAbs_EDGE {
            Ok(Self::Edge(BRepAdaptor_Curve_new_edge(TopoDS_Edge_shape(shape)?)?))
        } else if kind == TopAbs_ShapeEnum::TopAbs_WIRE {
            Ok(Self::Wire(BRepAdaptor_CompCurve_new_wire_bool(TopoDS_Wire_shape(shape)?, false)?))
        } else {
            Err(OcctError::invalid("curve queries need an edge or a wire"))
        }
    }

    fn curve(&self) -> OcctResult<&Adaptor3d_Curve> {
        Ok(match self {
            Self::Edge(handle) => {
                BRepAdaptor_Curve_as_Adaptor3d_Curve(Handle_BRepAdaptor_Curve_get(handle)?)
            }
            Self::Wire(handle) => {
                BRepAdaptor_CompCurve_as_Adaptor3d_Curve(Handle_BRepAdaptor_CompCurve_get(handle)?)
            }
        })
    }

    fn handle(&self) -> UniquePtr<Handle_Adaptor3d_Curve> {
        match self {
            Self::Edge(handle) => Handle_BRepAdaptor_Curve_to_Adaptor3d_Curve(handle),
            Self::Wire(handle) => Handle_BRepAdaptor_CompCurve_to_Adaptor3d_Curve(handle),
        }
    }
}

/// Runs `body` with the curve adaptor of an edge or wire.
fn with_curve<'cx, T>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    body: impl FnOnce(&Adaptor3d_Curve) -> OcctResult<T>,
) -> NeonResult<T> {
    let shape = get(shape).or_raise(cx)?;
    attempt(|| {
        let adaptor = CurveAdaptor::new(&shape)?;
        body(adaptor.curve()?)
    })
    .or_raise(cx)
}

/// `GeomAbs_CurveType` of an edge or wire.
#[neon::export(name = "curveType")]
fn curve_type<'cx>(cx: &mut Cx<'cx>, shape: &ShapeCell) -> NeonResult<f64> {
    with_curve(cx, shape, |curve| Ok(f64::from(curve.GetType()?.repr)))
}

/// `[first, last, period, length]`: the adaptor's parameter range, its period (NaN when not
/// periodic) and its arc length (GCPnts_AbscissaPoint::Length).
#[neon::export(name = "curveInfo")]
fn curve_info<'cx>(cx: &mut Cx<'cx>, shape: &ShapeCell) -> NeonResult<Vec<f64>> {
    with_curve(cx, shape, |curve| {
        let period = if curve.IsPeriodic()? { curve.Period()? } else { f64::NAN };
        Ok(vec![
            curve.FirstParameter()?,
            curve.LastParameter()?,
            period,
            GCPnts_AbscissaPoint::Length_curve(curve)?,
        ])
    })
}

#[neon::export(name = "curveValue")]
fn curve_value<'cx>(cx: &mut Cx<'cx>, shape: &ShapeCell, parameter: f64) -> NeonResult<Vec<f64>> {
    with_curve(cx, shape, |curve| Ok(xyz(&*Adaptor3d_Curve_Value(curve, parameter)?)?.to_vec()))
}

/// Moving frame at an adaptor parameter. The optional X direction must be normal to the tangent.
#[neon::export(name = "curveFrame")]
fn curve_frame<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    parameter: f64,
    corrected: bool,
    x_direction: Vec<f64>,
) -> NeonResult<Vec<f64>> {
    let shape = get(shape).or_raise(cx)?;
    attempt(|| {
        let adaptor = CurveAdaptor::new(&shape)?;
        let curve = adaptor.handle();
        let mut law = if corrected {
            Handle_GeomFill_CorrectedFrenet_to_GeomFill_TrihedronLaw(
                &*GeomFill_CorrectedFrenet_new()?,
            )
        } else {
            Handle_GeomFill_Frenet_to_GeomFill_TrihedronLaw(&*GeomFill_Frenet_new()?)
        };
        let mut tangent = gp_Vec_new()?;
        let mut normal = gp_Vec_new()?;
        let mut binormal = gp_Vec_new()?;
        let mut trihedron = Handle_GeomFill_TrihedronLaw_get_mut(law.pin_mut())?;
        if !trihedron.as_mut().SetCurve(&curve)? {
            return Err(OcctError::failed("unable to initialize the curve frame"));
        }
        if !trihedron.as_mut().D0(
            parameter,
            tangent.pin_mut(),
            normal.pin_mut(),
            binormal.pin_mut(),
        )? {
            return Err(OcctError::failed("unable to evaluate the curve frame"));
        }
        let point = Adaptor3d_Curve_Value(adaptor.curve()?, parameter)?;
        let tangent_direction = gp_Dir_new_vec(&tangent)?;
        let normal_direction =
            if x_direction.is_empty() { gp_Dir_new_vec(&normal)? } else { dir(&x_direction)? };
        let frame = gp_Ax3_new_pnt_dir2(&point, &tangent_direction, &normal_direction)?;
        let world = gp_Ax3_new()?;
        let mut transform = gp_Trsf_new()?;
        transform.pin_mut().SetTransformation_ax32(&frame, &world)?;
        trsf_to_vec(&transform)
    })
    .or_raise(cx)
}

/// The `order`-th derivative of the curve at `parameter`.
#[neon::export(name = "curveDerivative")]
fn curve_derivative<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    parameter: f64,
    order: f64,
) -> NeonResult<Vec<f64>> {
    with_curve(cx, shape, |curve| {
        if order < 1.0 || order.fract() != 0.0 {
            return Err(OcctError::invalid("derivative order must be a positive integer"));
        }
        Ok(vec_xyz(&*Adaptor3d_Curve_DN(curve, parameter, order as i32)?)?.to_vec())
    })
}

/// The parameter `abscissa` arc length away from `start` (GCPnts_AbscissaPoint).
#[neon::export(name = "curveParameterAtLength")]
fn curve_parameter_at_length<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    abscissa: f64,
    start: f64,
) -> NeonResult<f64> {
    with_curve(cx, shape, |curve| {
        let point = GCPnts_AbscissaPoint_new_curve_real2(curve, abscissa, start)?;
        if !point.IsDone()? {
            return Err(OcctError::failed("GCPnts_AbscissaPoint failed"));
        }
        Ok(point.Parameter()?)
    })
}

/// Arc length between two parameters.
#[neon::export(name = "curveLengthBetween")]
fn curve_length_between<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    first: f64,
    last: f64,
) -> NeonResult<f64> {
    with_curve(cx, shape, |curve| Ok(GCPnts_AbscissaPoint::Length_curve_real2(curve, first, last)?))
}

/// `[kind, cx, cy, cz, radius]` for a circle (kind 1) or ellipse (kind 2, major radius);
/// empty for any other curve.
#[neon::export(name = "curveConic")]
fn curve_conic<'cx>(cx: &mut Cx<'cx>, shape: &ShapeCell) -> NeonResult<Vec<f64>> {
    with_curve(cx, shape, |curve| {
        let kind = curve.GetType()?;
        if kind == GeomAbs_CurveType::GeomAbs_Circle {
            let circle = Adaptor3d_Curve_Circle(curve)?;
            let mut values = vec![1.0];
            values.extend(xyz(circle.Location()?)?);
            values.push(circle.Radius()?);
            values.push(circle.Radius()?);
            values.extend(dir_xyz(circle.Axis()?.Direction()?)?);
            Ok(values)
        } else if kind == GeomAbs_CurveType::GeomAbs_Ellipse {
            let ellipse = Adaptor3d_Curve_Ellipse(curve)?;
            let mut values = vec![2.0];
            values.extend(xyz(ellipse.Location()?)?);
            values.push(ellipse.MajorRadius()?);
            values.push(ellipse.MinorRadius()?);
            values.extend(dir_xyz(ellipse.Axis()?.Direction()?)?);
            Ok(values)
        } else {
            Ok(Vec::new())
        }
    })
}

/// `[first, last]` from BRep_Tool::Range.
#[neon::export(name = "edgeRange")]
fn edge_range<'cx>(cx: &mut Cx<'cx>, edge: &ShapeCell) -> NeonResult<Vec<f64>> {
    let edge = get(edge).or_raise(cx)?;
    attempt(|| {
        let (mut first, mut last) = (0.0, 0.0);
        BRep_Tool::Range_edge_real2(TopoDS_Edge_shape(&edge)?, &mut first, &mut last)?;
        Ok(vec![first, last])
    })
    .or_raise(cx)
}

/// Parameter of `vertex` on `edge` (BRep_Tool::Parameter).
#[neon::export(name = "vertexParameterOnEdge")]
fn vertex_parameter_on_edge<'cx>(
    cx: &mut Cx<'cx>,
    vertex: &ShapeCell,
    edge: &ShapeCell,
) -> NeonResult<f64> {
    let (vertex, edge) = (get(vertex).or_raise(cx)?, get(edge).or_raise(cx)?);
    attempt(|| {
        Ok(BRep_Tool::Parameter_vertex_edge(
            TopoDS_Vertex_shape(&vertex)?,
            TopoDS_Edge_shape(&edge)?,
        )?)
    })
    .or_raise(cx)
}

/// Curve parameter of the projection of `point` on the edge's located 3D curve
/// (GeomAPI_ProjectPointOnCurve, lower distance solution).
#[neon::export(name = "projectPointOnEdge")]
fn project_point_on_edge<'cx>(
    cx: &mut Cx<'cx>,
    edge: &ShapeCell,
    point: Vec<f64>,
) -> NeonResult<f64> {
    let edge = get(edge).or_raise(cx)?;
    attempt(|| {
        let (mut first, mut last) = (0.0, 0.0);
        let curve = BRep_Tool_Curve_edge_real2(TopoDS_Edge_shape(&edge)?, &mut first, &mut last)?;
        let projector = GeomAPI_ProjectPointOnCurve_new_pnt_hcurve(&*pnt(&point)?, &curve)?;
        if projector.NbPoints()? == 0 {
            return Err(OcctError::failed("point could not be projected on the edge"));
        }
        Ok(projector.LowerDistanceParameter()?)
    })
    .or_raise(cx)
}

/// Whether the edge's located 3D curve lies in a plane with `normal` within `tolerance`
/// (ShapeAnalysis_Curve::IsPlanar); false for an edge without a 3D curve.
#[neon::export(name = "edgeIsPlanar")]
fn edge_is_planar<'cx>(
    cx: &mut Cx<'cx>,
    edge: &ShapeCell,
    normal: Vec<f64>,
    tolerance: f64,
) -> NeonResult<bool> {
    let edge = get(edge).or_raise(cx)?;
    attempt(|| {
        let (mut first, mut last) = (0.0, 0.0);
        let curve = BRep_Tool_Curve_edge_real2(TopoDS_Edge_shape(&edge)?, &mut first, &mut last)?;
        if Handle_Geom_Curve_is_null(&curve) {
            return Ok(false);
        }
        let direction = vector(&normal)?;
        let mut xyz = gp_XYZ_new_real3(direction.X()?, direction.Y()?, direction.Z()?)?;
        Ok(ShapeAnalysis_Curve::IsPlanar_hcurve_xyz_real(&curve, xyz.pin_mut(), tolerance)?)
    })
    .or_raise(cx)
}

/// BRep_Tool::IsClosed: an edge or wire whose ends meet, or a shell/solid without free edges.
#[neon::export(name = "isClosed")]
fn is_closed<'cx>(cx: &mut Cx<'cx>, shape: &ShapeCell) -> NeonResult<bool> {
    let shape = get(shape).or_raise(cx)?;
    attempt(|| Ok(BRep_Tool::IsClosed_shape(&shape)?)).or_raise(cx)
}

/// Edges of a wire in connection order (BRepTools_WireExplorer), duplicates included.
#[neon::export(name = "wireEdges")]
fn wire_edges<'cx>(cx: &mut Cx<'cx>, wire: &ShapeCell) -> JsResult<'cx, JsArray> {
    let edges = {
        let wire = get(wire).or_raise(cx)?;
        attempt(|| {
            let mut explorer = BRepTools_WireExplorer_new_wire(TopoDS_Wire_shape(&wire)?)?;
            let mut edges = Vec::new();
            while explorer.More()? {
                edges.push(TopoDS_Edge_to_TopoDS_Shape(explorer.Current()?));
                explorer.pin_mut().Next()?;
            }
            Ok(edges)
        })
        .or_raise(cx)?
    };
    shapes_to_js(cx, edges)
}

/// `GeomAbs_SurfaceType` of a face.
#[neon::export(name = "surfaceType")]
fn surface_type<'cx>(cx: &mut Cx<'cx>, face: &ShapeCell) -> NeonResult<f64> {
    let face = get(face).or_raise(cx)?;
    attempt(|| {
        let adaptor = BRepAdaptor_Surface_new_face_bool(TopoDS_Face_shape(&face)?, true)?;
        Ok(f64::from(Handle_BRepAdaptor_Surface_get(&adaptor)?.GetType()?.repr))
    })
    .or_raise(cx)
}

/// `[uMin, uMax, vMin, vMax]` from BRepTools::UVBounds.
#[neon::export(name = "uvBounds")]
fn uv_bounds<'cx>(cx: &mut Cx<'cx>, face: &ShapeCell) -> NeonResult<Vec<f64>> {
    let face = get(face).or_raise(cx)?;
    attempt(|| {
        let (mut u_min, mut u_max, mut v_min, mut v_max) = (0.0, 0.0, 0.0, 0.0);
        BRepTools::UVBounds_face_real4(
            TopoDS_Face_shape(&face)?,
            &mut u_min,
            &mut u_max,
            &mut v_min,
            &mut v_max,
        )?;
        Ok(vec![u_min, u_max, v_min, v_max])
    })
    .or_raise(cx)
}

/// `[px, py, pz, nx, ny, nz]`: point and (unnormalized, orientation-aware) normal at `(u, v)`
/// from BRepGProp_Face::Normal.
#[neon::export(name = "faceNormal")]
fn face_normal<'cx>(cx: &mut Cx<'cx>, face: &ShapeCell, u: f64, v: f64) -> NeonResult<Vec<f64>> {
    let face = get(face).or_raise(cx)?;
    attempt(|| {
        let properties = BRepGProp_Face_new_face_bool(TopoDS_Face_shape(&face)?, false)?;
        let mut point = gp_Pnt_new()?;
        let mut normal = gp_Vec_new()?;
        properties.Normal(u, v, point.pin_mut(), normal.pin_mut())?;
        let mut values = xyz(&point)?.to_vec();
        values.extend(vec_xyz(&normal)?);
        Ok(values)
    })
    .or_raise(cx)
}

/// `[u, v]` of the projection of `point` on the face's located surface
/// (GeomAPI_ProjectPointOnSurf, lower distance solution).
#[neon::export(name = "projectPointOnFace")]
fn project_point_on_face<'cx>(
    cx: &mut Cx<'cx>,
    face: &ShapeCell,
    point: Vec<f64>,
) -> NeonResult<Vec<f64>> {
    let face = get(face).or_raise(cx)?;
    attempt(|| {
        let surface = BRep_Tool_Surface_face(TopoDS_Face_shape(&face)?)?;
        let projector = GeomAPI_ProjectPointOnSurf_new_pnt_hsurface_extalgo(
            &*pnt(&point)?,
            &surface,
            Extrema_ExtAlgo::Extrema_ExtAlgo_Grad,
        )?;
        if projector.NbPoints()? == 0 {
            return Err(OcctError::failed("point could not be projected on the face"));
        }
        let (mut u, mut v) = (0.0, 0.0);
        projector.LowerDistanceParameters(&mut u, &mut v)?;
        Ok(vec![u, v])
    })
    .or_raise(cx)
}

/// The plane of a planar face as a frame `[origin, zDir, xDir]` (GeomLib_IsPlanarSurface with
/// build123d's tolerance, left-handed results made direct); empty when the face is not planar.
#[neon::export(name = "facePlane")]
fn face_plane<'cx>(cx: &mut Cx<'cx>, face: &ShapeCell) -> NeonResult<Vec<f64>> {
    let face = get(face).or_raise(cx)?;
    attempt(|| {
        let surface = BRep_Tool_Surface_face(TopoDS_Face_shape(&face)?)?;
        let searcher = GeomLib_IsPlanarSurface_new_hsurface_real(&surface, PLANAR_TOLERANCE)?;
        if !searcher.IsPlanar()? {
            return Ok(Vec::new());
        }
        let position = searcher.Plan()?.Position()?;
        let ax2 = gp_Ax3_Ax2(position)?;
        let direct = gp_Ax3_new_ax2(&ax2)?;
        let frame = if position.Direct()? { position } else { &*direct };
        let mut values = xyz(frame.Location()?)?.to_vec();
        values.extend(dir_xyz(frame.Direction()?)?);
        values.extend(dir_xyz(frame.XDirection()?)?);
        Ok(values)
    })
    .or_raise(cx)
}

#[neon::export(name = "outerWire")]
fn outer_wire<'cx>(cx: &mut Cx<'cx>, face: &ShapeCell) -> ShapeResult {
    let face = get(face).or_raise(cx)?;
    attempt(|| {
        boxed(TopoDS_Wire_to_TopoDS_Shape(&*BRepTools_OuterWire(TopoDS_Face_shape(&face)?)?))
    })
    .or_raise(cx)
}

/// `[distance, x1, y1, z1, x2, y2, z2]`: the minimal distance and the first pair of closest
/// points (BRepExtrema_DistShapeShape).
fn closest(first: &TopoDS_Shape, second: &TopoDS_Shape) -> OcctResult<Vec<f64>> {
    let mut extrema = BRepExtrema_DistShapeShape_new()?;
    extrema.pin_mut().LoadS1(first)?;
    extrema.pin_mut().LoadS2(second)?;
    extrema.pin_mut().Perform(&*progress()?)?;
    if !extrema.IsDone()? || extrema.NbSolution()? == 0 {
        return Err(OcctError::failed("BRepExtrema_DistShapeShape failed"));
    }
    let mut values = vec![extrema.Value()?];
    values.extend(xyz(extrema.PointOnShape1(1)?)?);
    values.extend(xyz(extrema.PointOnShape2(1)?)?);
    Ok(values)
}

#[neon::export(name = "distance")]
fn distance<'cx>(cx: &mut Cx<'cx>, first: &ShapeCell, second: &ShapeCell) -> NeonResult<Vec<f64>> {
    let (first, second) = (get(first).or_raise(cx)?, get(second).or_raise(cx)?);
    attempt(|| closest(&first, &second)).or_raise(cx)
}

/// Like `distance`, with the second shape a vertex at `point`.
#[neon::export(name = "distanceToPoint")]
fn distance_to_point<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    point: Vec<f64>,
) -> NeonResult<Vec<f64>> {
    let shape = get(shape).or_raise(cx)?;
    attempt(|| {
        let mut maker = BRepBuilderAPI_MakeVertex_new_pnt(&*pnt(&point)?)?;
        let vertex = TopoDS_Vertex_to_TopoDS_Shape(maker.pin_mut().Vertex()?);
        closest(&shape, &vertex)
    })
    .or_raise(cx)
}

/// `[state, onFace]`: the TopAbs_State of `point` relative to `shape` (BRepClass3d_SolidClassifier)
/// and whether it lies on one of its faces (1) or not (0).
#[neon::export(name = "classifyPoint")]
fn classify_point<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    point: Vec<f64>,
    tolerance: f64,
) -> NeonResult<Vec<f64>> {
    let shape = get(shape).or_raise(cx)?;
    attempt(|| {
        let mut classifier = BRepClass3d_SolidClassifier_new_shape(&shape)?;
        classifier.pin_mut().Perform(&*pnt(&point)?, tolerance)?;
        let on_face = if classifier.IsOnAFace()? { 1.0 } else { 0.0 };
        Ok(vec![f64::from(classifier.State()?.repr), on_face])
    })
    .or_raise(cx)
}

/// The edge of `wire` closest to `point` and the edge parameter there, as build123d's
/// `Wire.param_at_point` finds them: the BRepExtrema support on the wire, or for a vertex
/// support the first wire edge containing that vertex.
#[neon::export(name = "wireClosestEdge")]
fn wire_closest_edge<'cx>(
    cx: &mut Cx<'cx>,
    wire: &ShapeCell,
    point: Vec<f64>,
) -> JsResult<'cx, JsArray> {
    let (edge, parameter) = {
        let wire = get(wire).or_raise(cx)?;
        attempt(|| closest_edge_of_wire(&wire, &point)).or_raise(cx)?
    };
    let array = shapes_to_js(cx, vec![edge])?;
    let parameter = cx.number(parameter);
    array.prop(cx, 1).set(parameter)?;
    Ok(array)
}

fn closest_edge_of_wire(
    wire: &TopoDS_Shape,
    point: &[f64],
) -> OcctResult<(UniquePtr<TopoDS_Shape>, f64)> {
    let mut maker = BRepBuilderAPI_MakeVertex_new_pnt(&*pnt(point)?)?;
    let vertex = TopoDS_Vertex_to_TopoDS_Shape(maker.pin_mut().Vertex()?);
    let mut extrema = BRepExtrema_DistShapeShape_new()?;
    extrema.pin_mut().LoadS1(&vertex)?;
    extrema.pin_mut().LoadS2(wire)?;
    extrema.pin_mut().Perform(&*progress()?)?;
    if !extrema.IsDone()? || extrema.NbSolution()? == 0 {
        return Err(OcctError::failed("point is not on the wire"));
    }
    let support = BRepExtrema_DistShapeShape_SupportOnShape2(&extrema, 1)?;
    let kind = extrema.SupportTypeShape2(1)?;
    if kind == BRepExtrema_SupportType::BRepExtrema_IsOnEdge {
        let mut parameter = 0.0;
        extrema.ParOnEdgeS2(1, &mut parameter)?;
        return Ok((support, parameter));
    }
    if kind != BRepExtrema_SupportType::BRepExtrema_IsVertex {
        return Err(OcctError::failed("closest point on a wire must be on an edge or vertex"));
    }
    let mut map = TopTools_IndexedDataMapOfShapeListOfShape_new()?;
    TopExp::MapShapesAndAncestors(
        wire,
        TopAbs_ShapeEnum::TopAbs_VERTEX,
        TopAbs_ShapeEnum::TopAbs_EDGE,
        map.pin_mut(),
    )?;
    let index = TopTools_IndexedDataMapOfShapeListOfShape_find_index(&map, &support)?;
    if index == 0 {
        return Err(OcctError::failed("vertex support is not part of the wire"));
    }
    let list = TopTools_IndexedDataMapOfShapeListOfShape_find_from_index(&map, index)?;
    let edge = owned(TopTools_ListOfShape_value(list, 0)?);
    let parameter = BRep_Tool::Parameter_vertex_edge(
        TopoDS_Vertex_shape(&support)?,
        TopoDS_Edge_shape(&edge)?,
    )?;
    Ok((edge, parameter))
}

#[neon::export(name = "fixShape")]
fn fix_shape<'cx>(cx: &mut Cx<'cx>, shape: &ShapeCell) -> ShapeResult {
    let shape = get(shape).or_raise(cx)?;
    attempt(|| {
        let mut fixer = ShapeFix_Shape_new_shape(&shape)?;
        Handle_ShapeFix_Shape_get_mut(fixer.pin_mut())?.Perform(&*progress()?)?;
        boxed(ShapeFix_Shape_Shape(Handle_ShapeFix_Shape_get(&fixer)?)?)
    })
    .or_raise(cx)
}

/// Faces hit by an infinite axis, ordered by squared distance from its origin.
#[neon::export(name = "facesIntersectedByAxis")]
fn faces_intersected_by_axis<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    axis: Vec<f64>,
    tolerance: f64,
) -> JsResult<'cx, JsArray> {
    let faces = {
        let shape = get(shape).or_raise(cx)?;
        attempt(|| {
            let line = gp_Lin_new_ax1(&*ax1(&axis)?)?;
            let mut intersection = BRepIntCurveSurface_Inter_new()?;
            intersection.pin_mut().Init_shape_lin_real(&shape, &line, tolerance)?;
            let mut hits = Vec::new();
            while intersection.More()? {
                let [x, y, z] = xyz(intersection.Pnt()?)?;
                let distance =
                    (x - axis[0]).powi(2) + (y - axis[1]).powi(2) + (z - axis[2]).powi(2);
                hits.push((distance, TopoDS_Face_to_TopoDS_Shape(intersection.Face()?)));
                intersection.pin_mut().Next()?;
            }
            hits.sort_by(|first, second| first.0.total_cmp(&second.0));
            Ok(hits.into_iter().map(|(_, face)| face).collect::<Vec<_>>())
        })
        .or_raise(cx)?
    };
    shapes_to_js(cx, faces)
}

/// `[defined, min, max, nx, ny, nz]`: the principal curvatures of the face's surface at
/// `(u, v)` against its own normal (`D1U ^ D1V`, as GeomLProp's surface properties take it),
/// and that normal. `defined` is 0 where the surface is degenerate and the rest is unusable.
#[neon::export(name = "surfaceCurvature")]
fn surface_curvature<'cx>(
    cx: &mut Cx<'cx>,
    face: &ShapeCell,
    u: f64,
    v: f64,
) -> NeonResult<Vec<f64>> {
    let face = get(face).or_raise(cx)?;
    attempt(|| {
        let surface = BRepAdaptor_Surface_new_face_bool(TopoDS_Face_shape(&face)?, true)?;
        let mut point = gp_Pnt_new()?;
        let (mut du, mut dv) = (gp_Vec_new()?, gp_Vec_new()?);
        let (mut duu, mut dvv, mut duv) = (gp_Vec_new()?, gp_Vec_new()?, gp_Vec_new()?);
        Handle_BRepAdaptor_Surface_get(&surface)?.D2(
            u,
            v,
            point.pin_mut(),
            du.pin_mut(),
            dv.pin_mut(),
            duu.pin_mut(),
            dvv.pin_mut(),
            duv.pin_mut(),
        )?;
        Ok(principal_curvatures(
            vec_xyz(&du)?,
            vec_xyz(&dv)?,
            vec_xyz(&duu)?,
            vec_xyz(&dvv)?,
            vec_xyz(&duv)?,
        ))
    })
    .or_raise(cx)
}

/// Principal curvatures from the two fundamental forms, with the normal `du ^ dv` normalized.
fn principal_curvatures(
    du: [f64; 3],
    dv: [f64; 3],
    duu: [f64; 3],
    dvv: [f64; 3],
    duv: [f64; 3],
) -> Vec<f64> {
    let dot = |a: [f64; 3], b: [f64; 3]| a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    let normal = [
        du[1] * dv[2] - du[2] * dv[1],
        du[2] * dv[0] - du[0] * dv[2],
        du[0] * dv[1] - du[1] * dv[0],
    ];
    let length = dot(normal, normal).sqrt();
    let (first_e, first_f, first_g) = (dot(du, du), dot(du, dv), dot(dv, dv));
    let discriminant = first_e * first_g - first_f * first_f;
    if length < 1e-12 || discriminant < 1e-24 {
        return vec![0.0; 6];
    }
    let normal = normal.map(|value| value / length);
    let (second_l, second_m, second_n) = (dot(duu, normal), dot(duv, normal), dot(dvv, normal));
    let mean =
        (first_e * second_n - 2.0 * first_f * second_m + first_g * second_l) / (2.0 * discriminant);
    let gaussian = (second_l * second_n - second_m * second_m) / discriminant;
    let spread = (mean * mean - gaussian).max(0.0).sqrt();
    vec![1.0, mean - spread, mean + spread, normal[0], normal[1], normal[2]]
}

/// Every solution of BRepExtrema_DistShapeShape as `[x1, y1, z1, x2, y2, z2]` per pair, with
/// `deflection` set on the algorithm so near-coincident solutions stay distinct. Empty when the
/// extrema could not be computed.
#[neon::export(name = "extremaSolutions")]
fn extrema_solutions<'cx>(
    cx: &mut Cx<'cx>,
    first: &ShapeCell,
    second: &ShapeCell,
    deflection: f64,
) -> NeonResult<Vec<f64>> {
    let (first, second) = (get(first).or_raise(cx)?, get(second).or_raise(cx)?);
    attempt(|| {
        let mut extrema = BRepExtrema_DistShapeShape_new()?;
        extrema.pin_mut().SetDeflection(deflection)?;
        extrema.pin_mut().LoadS1(&first)?;
        extrema.pin_mut().LoadS2(&second)?;
        extrema.pin_mut().Perform(&*progress()?)?;
        if !extrema.IsDone()? {
            return Ok(Vec::new());
        }
        let mut values = Vec::new();
        for solution in 1..=extrema.NbSolution()? {
            values.extend(xyz(extrema.PointOnShape1(solution)?)?);
            values.extend(xyz(extrema.PointOnShape2(solution)?)?);
        }
        Ok(values)
    })
    .or_raise(cx)
}

/// Runs `body` with the edge's 2D curve in the face's parameter space (BRepAdaptor_Curve2d).
fn with_pcurve<T>(
    edge: &TopoDS_Shape,
    face: &TopoDS_Shape,
    body: impl FnOnce(&opencascade_sys::b_rep_adaptor::BRepAdaptor_Curve2d) -> OcctResult<T>,
) -> OcctResult<T> {
    let pcurve =
        BRepAdaptor_Curve2d_new_edge_face(TopoDS_Edge_shape(edge)?, TopoDS_Face_shape(face)?)?;
    body(Handle_BRepAdaptor_Curve2d_get(&pcurve)?)
}

/// `[first, last]`: the parameter range of the edge's 2D curve on the face.
#[neon::export(name = "pcurveRange")]
fn pcurve_range<'cx>(cx: &mut Cx<'cx>, edge: &ShapeCell, face: &ShapeCell) -> NeonResult<Vec<f64>> {
    let (edge, face) = (get(edge).or_raise(cx)?, get(face).or_raise(cx)?);
    attempt(|| {
        with_pcurve(&edge, &face, |pcurve| {
            Ok(vec![pcurve.FirstParameter()?, pcurve.LastParameter()?])
        })
    })
    .or_raise(cx)
}

/// `[u, v, du, dv]`: the point and first derivative of the edge's 2D curve on the face.
#[neon::export(name = "pcurveDerivative")]
fn pcurve_derivative<'cx>(
    cx: &mut Cx<'cx>,
    edge: &ShapeCell,
    face: &ShapeCell,
    parameter: f64,
) -> NeonResult<Vec<f64>> {
    let (edge, face) = (get(edge).or_raise(cx)?, get(face).or_raise(cx)?);
    attempt(|| {
        with_pcurve(&edge, &face, |pcurve| {
            let mut point = gp_Pnt2d_new()?;
            let mut tangent = gp_Vec2d_new()?;
            pcurve.D1(parameter, point.pin_mut(), tangent.pin_mut())?;
            Ok(vec![point.X()?, point.Y()?, tangent.X()?, tangent.Y()?])
        })
    })
    .or_raise(cx)
}

/// `[u, v]`: the vertex's parameters on the face (BRep_Tool::Parameters).
#[neon::export(name = "vertexParametersOnFace")]
fn vertex_parameters_on_face<'cx>(
    cx: &mut Cx<'cx>,
    vertex: &ShapeCell,
    face: &ShapeCell,
) -> NeonResult<Vec<f64>> {
    let (vertex, face) = (get(vertex).or_raise(cx)?, get(face).or_raise(cx)?);
    attempt(|| {
        let point = BRep_Tool_Parameters(TopoDS_Vertex_shape(&vertex)?, TopoDS_Face_shape(&face)?)?;
        Ok(vec![point.X()?, point.Y()?])
    })
    .or_raise(cx)
}

/// The TopAbs_State of the parameter-space point `(u, v)` against the face's boundary
/// (IntTools_FClass2d).
#[neon::export(name = "classifyUV")]
fn classify_uv<'cx>(
    cx: &mut Cx<'cx>,
    face: &ShapeCell,
    u: f64,
    v: f64,
    tolerance: f64,
) -> NeonResult<f64> {
    let face = get(face).or_raise(cx)?;
    attempt(|| {
        let classifier = IntTools_FClass2d_new_face_real(TopoDS_Face_shape(&face)?, tolerance)?;
        let state = classifier.Perform(&*gp_Pnt2d_new_real2(u, v)?, true)?;
        Ok(f64::from(state.repr))
    })
    .or_raise(cx)
}

/// Whether the face's boundary runs along `edge` in the reverse direction; an error when the
/// edge is not on the face.
#[neon::export(name = "edgeIsReversedInFace")]
fn edge_is_reversed_in_face<'cx>(
    cx: &mut Cx<'cx>,
    face: &ShapeCell,
    edge: &ShapeCell,
) -> NeonResult<bool> {
    let (face, edge) = (get(face).or_raise(cx)?, get(edge).or_raise(cx)?);
    attempt(|| {
        let mut explorer = TopExp_Explorer_new_shape_shapeenum2(
            &face,
            TopAbs_ShapeEnum::TopAbs_EDGE,
            TopAbs_ShapeEnum::TopAbs_SHAPE,
        )?;
        while explorer.More()? {
            let current = explorer.Current()?;
            if current.IsSame(&edge)? {
                return Ok(current.Orientation()? == TopAbs_Orientation::TopAbs_REVERSED);
            }
            explorer.pin_mut().Next()?;
        }
        Err(OcctError::invalid("the edge is not on the face"))
    })
    .or_raise(cx)
}

/// Whether the face meets itself along `edge`, as a cylinder does at its seam
/// (ShapeAnalysis_Edge::IsSeam).
#[neon::export(name = "isSeamEdge")]
fn is_seam_edge<'cx>(cx: &mut Cx<'cx>, edge: &ShapeCell, face: &ShapeCell) -> NeonResult<bool> {
    let (edge, face) = (get(edge).or_raise(cx)?, get(face).or_raise(cx)?);
    attempt(|| {
        let analyzer = ShapeAnalysis_Edge_new()?;
        Ok(analyzer.IsSeam_edge_face(TopoDS_Edge_shape(&edge)?, TopoDS_Face_shape(&face)?)?)
    })
    .or_raise(cx)
}

/// The `GeomAbs_Shape` continuity two edges meet with at the parameters `firstParameter` and
/// `secondParameter` (BRepLProp::Continuity).
#[neon::export(name = "curveContinuity")]
fn curve_continuity<'cx>(
    cx: &mut Cx<'cx>,
    first: &ShapeCell,
    second: &ShapeCell,
    first_parameter: f64,
    second_parameter: f64,
    tolerance: f64,
    angular_tolerance: f64,
) -> NeonResult<f64> {
    let (first, second) = (get(first).or_raise(cx)?, get(second).or_raise(cx)?);
    attempt(|| {
        let first = BRepAdaptor_Curve_new_edge(TopoDS_Edge_shape(&first)?)?;
        let second = BRepAdaptor_Curve_new_edge(TopoDS_Edge_shape(&second)?)?;
        let continuity = BRepLProp::Continuity_curve2_real4(
            Handle_BRepAdaptor_Curve_get(&first)?,
            Handle_BRepAdaptor_Curve_get(&second)?,
            first_parameter,
            second_parameter,
            tolerance,
            angular_tolerance,
        )?;
        Ok(f64::from(continuity.repr))
    })
    .or_raise(cx)
}

/// The 2D curve an edge projects to on `plane`, as a Geom2d handle (BRep_Tool::CurveOnPlane).
fn curve_on_plane(
    edge: &TopoDS_Shape,
    surface: &Handle_Geom_Surface,
) -> OcctResult<UniquePtr<Handle_Geom2d_Curve>> {
    let (mut first, mut last) = (0.0, 0.0);
    let curve = BRep_Tool_CurveOnPlane(
        TopoDS_Edge_shape(edge)?,
        surface,
        &*TopLoc_Location_new()?,
        &mut first,
        &mut last,
    )?;
    if Handle_Geom2d_Curve_is_null(&curve) {
        return Err(OcctError::invalid("the edge has no curve on the plane"));
    }
    Ok(curve)
}

/// The `(u, v)` pairs, in `plane`'s parameter space, where an edge crosses `other` - or itself
/// when `other` is absent (Geom2dAPI_InterCurveCurve).
#[neon::export(name = "curveCrossings")]
fn curve_crossings<'cx>(
    cx: &mut Cx<'cx>,
    edge: &ShapeCell,
    other: Option<&ShapeCell>,
    plane: Vec<f64>,
    tolerance: f64,
) -> NeonResult<Vec<f64>> {
    let edge = get(edge).or_raise(cx)?;
    let other = other.map(get).transpose().or_raise(cx)?;
    attempt(|| {
        let face = BRepBuilderAPI_MakeFace_new_pln(&*gp_Pln_new_ax3(&*ax3(&plane)?)?)?;
        let surface = BRep_Tool_Surface_face(face.Face()?)?;
        let curve = curve_on_plane(&edge, &surface)?;
        let intersector = match &other {
            Some(other) => Geom2dAPI_InterCurveCurve_new_hcurve2_real(
                &curve,
                &*curve_on_plane(other, &surface)?,
                tolerance,
            )?,
            None => Geom2dAPI_InterCurveCurve_new_hcurve_real(&curve, tolerance)?,
        };
        let mut crossings = Vec::new();
        for index in 1..=intersector.NbPoints()? {
            let point = Geom2dAPI_InterCurveCurve_Point(&intersector, index)?;
            crossings.push(point.X()?);
            crossings.push(point.Y()?);
        }
        Ok(crossings)
    })
    .or_raise(cx)
}
