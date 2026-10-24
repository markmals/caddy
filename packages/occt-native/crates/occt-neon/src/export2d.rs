//! Per-edge geometry the 2D vector exporters need: conic placement, and the Bézier/B-spline
//! decomposition every other curve is approximated by.

use cxx::UniquePtr;
use neon::prelude::*;
use opencascade_sys::{
    adaptor3d::{
        Adaptor3d_Curve, Adaptor3d_Curve_BSpline, Adaptor3d_Curve_Circle, Adaptor3d_Curve_Ellipse,
    },
    b_rep_adaptor::{
        BRepAdaptor_Curve_as_Adaptor3d_Curve, BRepAdaptor_Curve_new_edge, Handle_BRepAdaptor_Curve,
        Handle_BRepAdaptor_Curve_get,
    },
    geom::{
        Geom_BSplineCurve, Handle_Geom_BSplineCurve, Handle_Geom_BSplineCurve_get,
        Handle_Geom_BezierCurve_get,
    },
    geom_abs::{GeomAbs_CurveType, GeomAbs_Shape},
    geom_convert::{
        GeomConvert_BSplineCurveToBezierCurve_Arc,
        GeomConvert_BSplineCurveToBezierCurve_new_hbsplinecurve_real3,
        GeomConvert_SplitBSplineCurve_hbsplinecurve_real3_bool,
    },
    gp::{gp_Circ_XAxis, gp_Elips_XAxis, gp_Pnt, gp_Pnt_Transformed, gp_Trsf, gp_Trsf_clone},
    shape_custom::{ShapeCustom_BSplineRestriction, ShapeCustom_RestrictionParameters_new},
    t_col_std::{TColStd_Array1OfReal_length, TColStd_Array1OfReal_value},
    top_abs::TopAbs_ShapeEnum,
    top_exp::TopExp_Explorer_new_shape_shapeenum2,
    topo_ds::{TopoDS_Edge_shape, TopoDS_Shape},
};

use crate::{
    convert::{dir_xyz, xyz},
    error::{OcctError, OcctResult, OrThrow, attempt},
    shape::{ShapeCell, get, owned, shapes_to_js},
    topology::shape_enum,
};

/// build123d's `Export2D.PARAMETRIC_TOLERANCE`: OCCT rejects spline intervals closer than this.
const PARAMETRIC_TOLERANCE: f64 = 1e-9;

struct EdgeCurve {
    adaptor: UniquePtr<Handle_BRepAdaptor_Curve>,
    /// The edge's placement, which the adaptor's geometry does not carry.
    placement: UniquePtr<gp_Trsf>,
}

impl EdgeCurve {
    fn new(edge: &TopoDS_Shape) -> OcctResult<Self> {
        if edge.ShapeType()? != TopAbs_ShapeEnum::TopAbs_EDGE {
            return Err(OcctError::invalid("2D export geometry needs an edge"));
        }
        let location = edge.Location()?;
        Ok(Self {
            adaptor: BRepAdaptor_Curve_new_edge(TopoDS_Edge_shape(edge)?)?,
            placement: gp_Trsf_clone(location.Transformation()?),
        })
    }

    fn curve(&self) -> OcctResult<&Adaptor3d_Curve> {
        Ok(BRepAdaptor_Curve_as_Adaptor3d_Curve(Handle_BRepAdaptor_Curve_get(&self.adaptor)?))
    }

    fn placed(&self, point: &gp_Pnt) -> OcctResult<[f64; 3]> {
        let placed = gp_Pnt_Transformed(point, &self.placement)?;
        xyz(&placed)
    }
}

/// Reduces any edge to a degree-3 B-spline (build123d `Shape.to_splines`) and returns it with the
/// parameter range to extract, both in the converted edge's own coordinates.
fn as_bspline(
    edge: &TopoDS_Shape,
    degree: i32,
    tolerance: f64,
) -> OcctResult<(EdgeCurve, UniquePtr<Handle_Geom_BSplineCurve>, f64, f64)> {
    let parameters = ShapeCustom_RestrictionParameters_new()?;
    let converted = ShapeCustom_BSplineRestriction(
        edge,
        tolerance,
        tolerance,
        degree,
        1,
        GeomAbs_Shape::GeomAbs_C0,
        GeomAbs_Shape::GeomAbs_C0,
        true,
        true,
        &parameters,
    )?;
    let spline_edge = match converted.ShapeType()? {
        TopAbs_ShapeEnum::TopAbs_EDGE => converted,
        _ => {
            let explorer = TopExp_Explorer_new_shape_shapeenum2(
                &converted,
                TopAbs_ShapeEnum::TopAbs_EDGE,
                TopAbs_ShapeEnum::TopAbs_SHAPE,
            )?;
            if !explorer.More()? {
                return Err(OcctError::failed("B-spline conversion produced no edge"));
            }
            owned(explorer.Current()?)
        }
    };
    let curve = EdgeCurve::new(&spline_edge)?;
    let (first, last) = {
        let adaptor = curve.curve()?;
        (adaptor.FirstParameter()?, adaptor.LastParameter()?)
    };
    let spline = Adaptor3d_Curve_BSpline(curve.curve()?)?;
    Ok((curve, spline, first, last))
}

/// `[kind, centre, Z direction, X direction, major radius, minor radius]` with kind 1 for a
/// circle and 2 for an ellipse; empty for every other curve.
#[neon::export(name = "edgeConic")]
fn edge_conic<'cx>(cx: &mut Cx<'cx>, edge: &ShapeCell) -> NeonResult<Vec<f64>> {
    let edge = get(edge).or_raise(cx)?;
    attempt(|| {
        let curve = EdgeCurve::new(&edge)?;
        let adaptor = curve.curve()?;
        let kind = adaptor.GetType()?;
        let mut values = Vec::with_capacity(12);
        if kind == GeomAbs_CurveType::GeomAbs_Circle {
            let circle = Adaptor3d_Curve_Circle(adaptor)?;
            values.push(1.0);
            values.extend(xyz(circle.Location()?)?);
            values.extend(dir_xyz(circle.Axis()?.Direction()?)?);
            values.extend(dir_xyz(gp_Circ_XAxis(&circle)?.Direction()?)?);
            values.push(circle.Radius()?);
            values.push(circle.Radius()?);
        } else if kind == GeomAbs_CurveType::GeomAbs_Ellipse {
            let ellipse = Adaptor3d_Curve_Ellipse(adaptor)?;
            values.push(2.0);
            values.extend(xyz(ellipse.Location()?)?);
            values.extend(dir_xyz(ellipse.Axis()?.Direction()?)?);
            values.extend(dir_xyz(gp_Elips_XAxis(&ellipse)?.Direction()?)?);
            values.push(ellipse.MajorRadius()?);
            values.push(ellipse.MinorRadius()?);
        }
        Ok(values)
    })
    .or_raise(cx)
}

/// Whether the edge's curve closes on itself geometrically (`Adaptor3d_Curve::IsClosed`), which
/// a full circle does even when its edge has two distinct vertices.
#[neon::export(name = "edgeCurveIsClosed")]
fn edge_curve_is_closed<'cx>(cx: &mut Cx<'cx>, edge: &ShapeCell) -> NeonResult<bool> {
    let edge = get(edge).or_raise(cx)?;
    attempt(|| Ok(EdgeCurve::new(&edge)?.curve()?.IsClosed()?)).or_raise(cx)
}

/// The edge as a chain of Bézier arcs: one `Float64Array` of 2, 3 or 4 poles (`[x, y, z, ...]`)
/// per arc, in parameter order.
#[neon::export(name = "edgeBezierArcs")]
fn edge_bezier_arcs<'cx>(
    cx: &mut Cx<'cx>,
    edge: &ShapeCell,
    degree: f64,
    tolerance: f64,
) -> JsResult<'cx, JsArray> {
    let arcs = {
        let edge = get(edge).or_raise(cx)?;
        attempt(|| {
            let (curve, spline, first, last) = as_bspline(&edge, degree as i32, tolerance)?;
            let mut converter = GeomConvert_BSplineCurveToBezierCurve_new_hbsplinecurve_real3(
                &spline,
                first,
                last,
                PARAMETRIC_TOLERANCE,
            )?;
            let mut arcs: Vec<Vec<f64>> = Vec::new();
            for index in 1..=converter.NbArcs()? {
                let arc = GeomConvert_BSplineCurveToBezierCurve_Arc(converter.pin_mut(), index)?;
                let bezier = Handle_Geom_BezierCurve_get(&arc)?;
                let mut poles: Vec<f64> = Vec::new();
                for pole in 1..=bezier.NbPoles()? {
                    poles.extend(curve.placed(bezier.Pole(pole)?)?);
                }
                arcs.push(poles);
            }
            Ok(arcs)
        })
        .or_raise(cx)?
    };

    let array = cx.empty_array();
    for (index, poles) in arcs.into_iter().enumerate() {
        let value = JsFloat64Array::from_slice(cx, &poles)?;
        array.prop(cx, index as u32).set(value)?;
    }
    Ok(array)
}

/// The edge as one B-spline: `degree`, `poles` (`[x, y, z, ...]`), `weights` (null when the
/// spline is not rational), the full `knots` sequence, and how many poles a periodic spline has
/// to repeat to close (build123d's DXF spline export).
#[neon::export(name = "edgeBSpline")]
fn edge_bspline<'cx>(
    cx: &mut Cx<'cx>,
    edge: &ShapeCell,
    degree: f64,
    tolerance: f64,
) -> JsResult<'cx, JsObject> {
    let spline = {
        let edge = get(edge).or_raise(cx)?;
        attempt(|| {
            let (curve, basis, first, last) = as_bspline(&edge, degree as i32, tolerance)?;
            let segment = GeomConvert_SplitBSplineCurve_hbsplinecurve_real3_bool(
                &basis,
                first,
                last,
                PARAMETRIC_TOLERANCE,
                true,
            )?;
            bspline_data(&curve, Handle_Geom_BSplineCurve_get(&segment)?)
        })
        .or_raise(cx)?
    };

    let object = cx.empty_object();
    object.prop(cx, "degree").set(f64::from(spline.degree))?;
    let poles = JsFloat64Array::from_slice(cx, &spline.poles)?;
    object.prop(cx, "poles").set(poles)?;
    let weights = match spline.weights {
        Some(weights) => JsFloat64Array::from_slice(cx, &weights)?.upcast::<JsValue>(),
        None => cx.null().upcast(),
    };
    object.prop(cx, "weights").set(weights)?;
    let knots = JsFloat64Array::from_slice(cx, &spline.knots)?;
    object.prop(cx, "knots").set(knots)?;
    object.prop(cx, "periodicPoleCount").set(f64::from(spline.periodic_pole_count))?;
    Ok(object)
}

struct BSplineData {
    degree: i32,
    poles: Vec<f64>,
    weights: Option<Vec<f64>>,
    knots: Vec<f64>,
    /// Poles a periodic spline repeats at its end; 0 for a clamped spline.
    periodic_pole_count: i32,
}

fn bspline_data(curve: &EdgeCurve, spline: &Geom_BSplineCurve) -> OcctResult<BSplineData> {
    let pole_count = spline.NbPoles()?;
    let mut poles: Vec<f64> = Vec::with_capacity(pole_count as usize * 3);
    for index in 1..=pole_count {
        poles.extend(curve.placed(spline.Pole(index)?)?);
    }
    let weights = if spline.IsRational()? {
        let mut weights = Vec::with_capacity(pole_count as usize);
        for index in 1..=pole_count {
            weights.push(spline.Weight(index)?);
        }
        Some(weights)
    } else {
        None
    };
    let sequence = spline.KnotSequence()?;
    let mut knots = Vec::new();
    for index in 1..=TColStd_Array1OfReal_length(sequence)? {
        knots.push(TColStd_Array1OfReal_value(sequence, index)?);
    }
    let periodic_pole_count =
        if spline.IsPeriodic()? { spline.NbKnots()? - spline.LastUKnotIndex()? } else { 0 };
    Ok(BSplineData { degree: spline.Degree()?, poles, weights, knots, periodic_pole_count })
}

/// Sub-shapes of `kind` that are not contained in a shape of type `avoid`, in explorer order:
/// the wires outside faces and the edges outside wires that the SVG exporter draws separately.
#[neon::export(name = "subShapesAvoiding")]
fn sub_shapes_avoiding<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    kind: f64,
    avoid: f64,
) -> JsResult<'cx, JsArray> {
    let found = {
        let shape = get(shape).or_raise(cx)?;
        attempt(|| {
            let mut explorer = TopExp_Explorer_new_shape_shapeenum2(
                &shape,
                shape_enum(kind)?,
                shape_enum(avoid)?,
            )?;
            let mut found: Vec<UniquePtr<TopoDS_Shape>> = Vec::new();
            while explorer.More()? {
                found.push(owned(explorer.Current()?));
                explorer.pin_mut().Next()?;
            }
            Ok(found)
        })
        .or_raise(cx)?
    };
    shapes_to_js(cx, found)
}
