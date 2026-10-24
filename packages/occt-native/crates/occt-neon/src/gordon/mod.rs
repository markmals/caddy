//! Gordon surface interpolation of a curve network (build123d `Face.make_gordon_surface`).
//!
//! Derived from ocp_gordon (Apache-2.0, SPDX-FileCopyrightText: 2018 German Aerospace Center
//! (DLR)), itself a port of TiGL's Gordon surface code. The submodules follow the Python ones so
//! the two can be diffed side by side.

mod approx_interp;
mod bspline_algorithms;
mod builder;
mod curve;
mod curves_to_surface;
mod intersect;
mod linalg;
mod network;
mod optimize;
mod points_to_bspline;
mod reparametrize;
mod sorter;
mod surface;

use cxx::UniquePtr;
use neon::prelude::*;
use opencascade_sys::{
    b_rep::BRep_Tool_Curve_edge_real2,
    b_rep_adaptor::{BRepAdaptor_Curve_new_edge, Handle_BRepAdaptor_Curve_get},
    b_rep_builder_api::{
        BRepBuilderAPI_MakeFace_as_BRepBuilderAPI_MakeShape_mut,
        BRepBuilderAPI_MakeFace_new_hsurface_real,
    },
    geom::{
        Geom_TrimmedCurve_new_hcurve_real2_bool2, Handle_Geom_Curve,
        Handle_Geom_TrimmedCurve_to_Geom_Curve,
    },
    geom_abs::GeomAbs_CurveType,
    precision::Precision,
    topo_ds::TopoDS_Shape,
};

use crate::construct::{as_edge, build};
use crate::error::{OcctError, OcctResult, OrThrow, attempt};
use crate::shape::{ShapeBox, ShapeResult, boxed, get};

use curve::Curve;
use network::{interpolate_curve_network, to_bspline};

/// Default tolerance of build123d's `Face.make_gordon_surface`.
const DEFAULT_TOLERANCE: f64 = 3e-4;

/// One entry of a profile or guide list: an edge, or a point that the network degenerates to.
enum NetworkCurve {
    Edge(UniquePtr<TopoDS_Shape>),
    Point([f64; 3]),
}

fn network_curves<'cx>(
    cx: &mut Cx<'cx>,
    values: Handle<'cx, JsArray>,
) -> NeonResult<Vec<NetworkCurve>> {
    let entries = values.to_vec(cx)?;
    let mut curves = Vec::with_capacity(entries.len());
    for entry in entries {
        if let Ok(cell) = entry.downcast::<ShapeBox, _>(cx) {
            let shape = get(&cell).or_raise(cx)?;
            curves.push(NetworkCurve::Edge(crate::shape::owned(&shape)));
            continue;
        }
        let coordinates = entry.downcast_or_throw::<JsArray, _>(cx)?.to_vec(cx)?;
        if coordinates.len() != 3 {
            return cx.throw_error("a Gordon network point needs three coordinates");
        }
        let mut point = [0.0; 3];
        for (axis, value) in coordinates.iter().enumerate() {
            point[axis] = value.downcast_or_throw::<JsNumber, _>(cx)?.value(cx);
        }
        curves.push(NetworkCurve::Point(point));
    }
    Ok(curves)
}

/// build123d's `to_geom_curve`: the edge's own curve, trimmed unless it is already bounded by its
/// parameter range (B-splines, Béziers and closed periodic curves are not trimmed).
fn geom_curve_of_edge(shape: &TopoDS_Shape) -> OcctResult<UniquePtr<Handle_Geom_Curve>> {
    let edge = as_edge(shape)?;
    let adaptor = BRepAdaptor_Curve_new_edge(edge)?;
    let adaptor = Handle_BRepAdaptor_Curve_get(&adaptor)?;

    let (mut first, mut last) = (0.0, 1.0);
    let curve = BRep_Tool_Curve_edge_real2(edge, &mut first, &mut last)?;
    if curve.is_null() {
        return Err(OcctError::invalid("a Gordon network edge has no 3D curve"));
    }

    let curve_type = adaptor.GetType()?;
    let already_bounded = (adaptor.IsPeriodic()? && adaptor.IsClosed()?)
        || curve_type == GeomAbs_CurveType::GeomAbs_BSplineCurve
        || curve_type == GeomAbs_CurveType::GeomAbs_BezierCurve;
    if already_bounded {
        return Ok(curve);
    }

    let trimmed = Geom_TrimmedCurve_new_hcurve_real2_bool2(
        &curve,
        adaptor.FirstParameter()?,
        adaptor.LastParameter()?,
        true,
        true,
    )?;
    Ok(Handle_Geom_TrimmedCurve_to_Geom_Curve(&trimmed))
}

/// A point becomes a zero-length degree-one B-spline, as build123d does.
fn point_curve(point: [f64; 3]) -> OcctResult<Curve> {
    Curve::from_poles(&[point, point], &[0.0, 1.0], &[2, 2], 1, false)
}

fn network_bsplines(curves: &[NetworkCurve]) -> OcctResult<Vec<Curve>> {
    let mut result = Vec::with_capacity(curves.len());
    for entry in curves {
        match entry {
            NetworkCurve::Edge(shape) => result.push(to_bspline(&*geom_curve_of_edge(shape)?)?),
            NetworkCurve::Point(point) => result.push(point_curve(*point)?),
        }
    }
    Ok(result)
}

/// Gordon surface through a network of profiles and guides (build123d
/// `Face.make_gordon_surface`). Each entry is an edge or a three-number point.
#[neon::export(name = "makeGordonSurfaceFace")]
fn make_gordon_surface_face<'cx>(
    cx: &mut Cx<'cx>,
    profiles: Handle<'cx, JsArray>,
    guides: Handle<'cx, JsArray>,
    tolerance: f64,
) -> ShapeResult {
    let profiles = network_curves(cx, profiles)?;
    let guides = network_curves(cx, guides)?;
    attempt(|| {
        let tolerance = if tolerance > 0.0 { tolerance } else { DEFAULT_TOLERANCE };
        let surface = interpolate_curve_network(
            network_bsplines(&profiles)?,
            network_bsplines(&guides)?,
            tolerance,
        )?;
        let mut maker = BRepBuilderAPI_MakeFace_new_hsurface_real(
            &surface.as_surface(),
            Precision::Confusion()?,
        )?;
        boxed(build(
            BRepBuilderAPI_MakeFace_as_BRepBuilderAPI_MakeShape_mut(maker.pin_mut()),
            "BRepBuilderAPI_MakeFace",
        )?)
    })
    .or_raise(cx)
}
