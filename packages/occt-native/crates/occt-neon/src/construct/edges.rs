//! Vertices and edges built from analytic geometry (lines, circular and elliptical arcs).

use std::f64::consts::{FRAC_PI_2, TAU};

use cxx::UniquePtr;
use neon::prelude::*;
use opencascade_sys::{
    b_rep::BRep_Tool_Curve_edge_real2,
    b_rep_builder_api::{
        BRepBuilderAPI_MakeEdge_as_BRepBuilderAPI_MakeShape_mut, BRepBuilderAPI_MakeEdge_new_circ,
        BRepBuilderAPI_MakeEdge_new_elips, BRepBuilderAPI_MakeEdge_new_hcurve_real2,
        BRepBuilderAPI_MakeEdge_new_hypr, BRepBuilderAPI_MakeEdge_new_lin,
        BRepBuilderAPI_MakeEdge_new_pnt2,
        BRepBuilderAPI_MakeVertex_as_BRepBuilderAPI_MakeShape_mut,
        BRepBuilderAPI_MakeVertex_new_pnt,
    },
    gc::{
        GC_MakeArcOfCircle_new_circ_real2_bool, GC_MakeArcOfCircle_new_pnt_vec_pnt,
        GC_MakeArcOfCircle_new_pnt3, GC_MakeArcOfEllipse_new_elips_real2_bool,
        GC_MakeArcOfHyperbola_new_hypr_real2_bool, GC_MakeArcOfParabola_new_parab_real2_bool,
    },
    geom::{Geom_Curve_Reversed, Handle_Geom_Curve_get},
    gp::{
        gp_Circ, gp_Circ_new_ax2_real, gp_Elips, gp_Elips_Rotated, gp_Elips_new_ax2_real2,
        gp_Hypr_Rotated, gp_Hypr_new_ax2_real2, gp_Lin_new_ax1, gp_Parab_new_ax2_real,
    },
    topo_ds::TopoDS_Shape,
};

use crate::{
    construct::{as_edge, build, edge_from_trimmed, positive},
    convert::{ax1, ax2, pnt, vector},
    error::{OcctError, OcctResult, OrThrow, attempt},
    shape::{ShapeCell, ShapeResult, boxed, get},
};

#[neon::export(name = "makeVertex")]
fn make_vertex<'cx>(cx: &mut Cx<'cx>, point: Vec<f64>) -> ShapeResult {
    attempt(|| {
        let mut maker = BRepBuilderAPI_MakeVertex_new_pnt(&*pnt(&point)?)?;
        boxed(build(
            BRepBuilderAPI_MakeVertex_as_BRepBuilderAPI_MakeShape_mut(maker.pin_mut()),
            "BRepBuilderAPI_MakeVertex",
        )?)
    })
    .or_raise(cx)
}

#[neon::export(name = "makeLineEdge")]
fn make_line_edge<'cx>(cx: &mut Cx<'cx>, start: Vec<f64>, end: Vec<f64>) -> ShapeResult {
    attempt(|| {
        let mut maker = BRepBuilderAPI_MakeEdge_new_pnt2(&*pnt(&start)?, &*pnt(&end)?)?;
        boxed(build(
            BRepBuilderAPI_MakeEdge_as_BRepBuilderAPI_MakeShape_mut(maker.pin_mut()),
            "BRepBuilderAPI_MakeEdge",
        )?)
    })
    .or_raise(cx)
}

/// The unbounded line along `axis` as an edge, which the 2D constraint solvers accept as a
/// tangency target (build123d `Edge(Axis)`).
#[neon::export(name = "makeAxisEdge")]
fn make_axis_edge<'cx>(cx: &mut Cx<'cx>, axis: Vec<f64>) -> ShapeResult {
    attempt(|| {
        let line = gp_Lin_new_ax1(&*ax1(&axis)?)?;
        let mut maker = BRepBuilderAPI_MakeEdge_new_lin(&line)?;
        boxed(build(
            BRepBuilderAPI_MakeEdge_as_BRepBuilderAPI_MakeShape_mut(maker.pin_mut()),
            "BRepBuilderAPI_MakeEdge",
        )?)
    })
    .or_raise(cx)
}

fn full_circle_edge(circle: &gp_Circ) -> OcctResult<UniquePtr<TopoDS_Shape>> {
    let mut maker = BRepBuilderAPI_MakeEdge_new_circ(circle)?;
    build(
        BRepBuilderAPI_MakeEdge_as_BRepBuilderAPI_MakeShape_mut(maker.pin_mut()),
        "BRepBuilderAPI_MakeEdge",
    )
}

/// Circle or circular arc centred on `frame`'s origin. Equal start and end angles give the full
/// circle; otherwise the arc runs from `startAngle` to `endAngle`, reversed when not
/// counter-clockwise (build123d `Edge.make_circle`).
#[neon::export(name = "makeCircleEdge")]
fn make_circle_edge<'cx>(
    cx: &mut Cx<'cx>,
    frame: Vec<f64>,
    radius: f64,
    start_angle: f64,
    end_angle: f64,
    counter_clockwise: bool,
) -> ShapeResult {
    attempt(|| {
        positive(radius, "circle radius")?;
        let circle = gp_Circ_new_ax2_real(&*ax2(&frame)?, radius)?;
        if start_angle == end_angle {
            return boxed(full_circle_edge(&circle)?);
        }
        let (first, last) =
            if counter_clockwise { (start_angle, end_angle) } else { (end_angle, start_angle) };
        let maker =
            GC_MakeArcOfCircle_new_circ_real2_bool(&circle, first, last, counter_clockwise)?;
        if !maker.IsDone()? {
            return Err(OcctError::failed("GC_MakeArcOfCircle failed"));
        }
        boxed(edge_from_trimmed(maker.Value()?)?)
    })
    .or_raise(cx)
}

fn full_ellipse_edge(ellipse: &gp_Elips) -> OcctResult<UniquePtr<TopoDS_Shape>> {
    let mut maker = BRepBuilderAPI_MakeEdge_new_elips(ellipse)?;
    build(
        BRepBuilderAPI_MakeEdge_as_BRepBuilderAPI_MakeShape_mut(maker.pin_mut()),
        "BRepBuilderAPI_MakeEdge",
    )
}

/// Ellipse or elliptical arc. OCCT requires the major radius first, so a taller-than-wide
/// ellipse is built swapped and rotated a quarter turn, with the arc angles corrected to match
/// (build123d `Edge.make_ellipse`).
#[neon::export(name = "makeEllipseEdge")]
fn make_ellipse_edge<'cx>(
    cx: &mut Cx<'cx>,
    frame: Vec<f64>,
    x_radius: f64,
    y_radius: f64,
    start_angle: f64,
    end_angle: f64,
    counter_clockwise: bool,
) -> ShapeResult {
    attempt(|| {
        positive(x_radius, "ellipse x radius")?;
        positive(y_radius, "ellipse y radius")?;
        let axis = ax1(frame.get(..6).unwrap_or(&frame))?;
        let (ellipse, correction) = if y_radius > x_radius {
            let swapped = gp_Elips_new_ax2_real2(&*ax2(&frame)?, y_radius, x_radius)?;
            (gp_Elips_Rotated(&swapped, &axis, FRAC_PI_2)?, FRAC_PI_2)
        } else {
            (gp_Elips_new_ax2_real2(&*ax2(&frame)?, x_radius, y_radius)?, 0.0)
        };
        if start_angle == end_angle {
            return boxed(full_ellipse_edge(&ellipse)?);
        }
        let first = start_angle - correction;
        let mut last = end_angle - correction;
        let (alpha1, alpha2) = if counter_clockwise {
            if last <= first {
                last += TAU;
            }
            (first, last)
        } else {
            if last >= first {
                last -= TAU;
            }
            (last, first)
        };
        let maker =
            GC_MakeArcOfEllipse_new_elips_real2_bool(&ellipse, alpha1, alpha2, counter_clockwise)?;
        if !maker.IsDone()? {
            return Err(OcctError::failed("GC_MakeArcOfEllipse failed"));
        }
        boxed(edge_from_trimmed(maker.Value()?)?)
    })
    .or_raise(cx)
}

/// Parabola arc with its vertex at `frame`'s origin, opening along the frame's X axis
/// (build123d `Edge.make_parabola`).
#[neon::export(name = "makeParabolaEdge")]
fn make_parabola_edge<'cx>(
    cx: &mut Cx<'cx>,
    frame: Vec<f64>,
    focal_length: f64,
    start_angle: f64,
    end_angle: f64,
    counter_clockwise: bool,
) -> ShapeResult {
    attempt(|| {
        positive(focal_length, "parabola focal length")?;
        let parabola = gp_Parab_new_ax2_real(&*ax2(&frame)?, focal_length)?;
        let maker = GC_MakeArcOfParabola_new_parab_real2_bool(
            &parabola,
            start_angle,
            end_angle,
            counter_clockwise,
        )?;
        if !maker.IsDone()? {
            return Err(OcctError::failed("GC_MakeArcOfParabola failed"));
        }
        boxed(edge_from_trimmed(maker.Value()?)?)
    })
    .or_raise(cx)
}

/// Hyperbola branch centred on `frame`'s origin. As with ellipses OCCT wants the major radius
/// first, so a taller-than-wide hyperbola is built swapped and rotated a quarter turn, with the
/// arc angles corrected to match (build123d `Edge.make_hyperbola`).
#[neon::export(name = "makeHyperbolaEdge")]
fn make_hyperbola_edge<'cx>(
    cx: &mut Cx<'cx>,
    frame: Vec<f64>,
    x_radius: f64,
    y_radius: f64,
    start_angle: f64,
    end_angle: f64,
    counter_clockwise: bool,
) -> ShapeResult {
    attempt(|| {
        positive(x_radius, "hyperbola x radius")?;
        positive(y_radius, "hyperbola y radius")?;
        let axis = ax1(frame.get(..6).unwrap_or(&frame))?;
        let (hyperbola, correction) = if y_radius > x_radius {
            let swapped = gp_Hypr_new_ax2_real2(&*ax2(&frame)?, y_radius, x_radius)?;
            (gp_Hypr_Rotated(&swapped, &axis, FRAC_PI_2)?, FRAC_PI_2)
        } else {
            (gp_Hypr_new_ax2_real2(&*ax2(&frame)?, x_radius, y_radius)?, 0.0)
        };
        if start_angle == end_angle {
            let mut maker = BRepBuilderAPI_MakeEdge_new_hypr(&hyperbola)?;
            return boxed(build(
                BRepBuilderAPI_MakeEdge_as_BRepBuilderAPI_MakeShape_mut(maker.pin_mut()),
                "BRepBuilderAPI_MakeEdge",
            )?);
        }
        let maker = GC_MakeArcOfHyperbola_new_hypr_real2_bool(
            &hyperbola,
            start_angle - correction,
            end_angle - correction,
            counter_clockwise,
        )?;
        if !maker.IsDone()? {
            return Err(OcctError::failed("GC_MakeArcOfHyperbola failed"));
        }
        boxed(edge_from_trimmed(maker.Value()?)?)
    })
    .or_raise(cx)
}

#[neon::export(name = "makeThreePointArc")]
fn make_three_point_arc<'cx>(
    cx: &mut Cx<'cx>,
    start: Vec<f64>,
    middle: Vec<f64>,
    end: Vec<f64>,
) -> ShapeResult {
    attempt(|| {
        let maker = GC_MakeArcOfCircle_new_pnt3(&*pnt(&start)?, &*pnt(&middle)?, &*pnt(&end)?)?;
        if !maker.IsDone()? {
            return Err(OcctError::failed("GC_MakeArcOfCircle failed"));
        }
        boxed(edge_from_trimmed(maker.Value()?)?)
    })
    .or_raise(cx)
}

#[neon::export(name = "makeTangentArc")]
fn make_tangent_arc<'cx>(
    cx: &mut Cx<'cx>,
    start: Vec<f64>,
    tangent: Vec<f64>,
    end: Vec<f64>,
) -> ShapeResult {
    attempt(|| {
        let maker =
            GC_MakeArcOfCircle_new_pnt_vec_pnt(&*pnt(&start)?, &*vector(&tangent)?, &*pnt(&end)?)?;
        if !maker.IsDone()? {
            return Err(OcctError::failed("GC_MakeArcOfCircle failed"));
        }
        boxed(edge_from_trimmed(maker.Value()?)?)
    })
    .or_raise(cx)
}

/// The section of `edge`'s curve between two curve parameters, as a new edge. The caller
/// resolves normalized positions to parameters (see the `query` module).
#[neon::export(name = "trimEdgeByParam")]
fn trim_edge_by_param<'cx>(
    cx: &mut Cx<'cx>,
    edge: &ShapeCell,
    first: f64,
    last: f64,
) -> ShapeResult {
    let edge = get(edge).or_raise(cx)?;
    attempt(|| {
        let (low, high) = if first <= last { (first, last) } else { (last, first) };
        if !(low.is_finite() && high.is_finite()) || high - low <= 0.0 {
            return Err(OcctError::invalid("trim parameters must be finite and differ"));
        }
        let (mut start, mut end) = (0.0, 0.0);
        let curve = BRep_Tool_Curve_edge_real2(as_edge(&edge)?, &mut start, &mut end)?;
        if curve.is_null() {
            return Err(OcctError::invalid("edge has no 3D curve to trim"));
        }
        let mut maker = BRepBuilderAPI_MakeEdge_new_hcurve_real2(&curve, low, high)?;
        boxed(build(
            BRepBuilderAPI_MakeEdge_as_BRepBuilderAPI_MakeShape_mut(maker.pin_mut()),
            "BRepBuilderAPI_MakeEdge",
        )?)
    })
    .or_raise(cx)
}

/// A new edge over the same geometry running the other way, rebuilt rather than only flagged
/// reversed (build123d `Edge.reversed(reconstruct=True)`).
#[neon::export(name = "reverseEdgeCurve")]
fn reverse_edge_curve<'cx>(
    cx: &mut Cx<'cx>,
    edge: &ShapeCell,
    first: f64,
    last: f64,
) -> ShapeResult {
    let edge = get(edge).or_raise(cx)?;
    attempt(|| {
        let (mut start, mut end) = (0.0, 0.0);
        let curve = BRep_Tool_Curve_edge_real2(as_edge(&edge)?, &mut start, &mut end)?;
        if curve.is_null() {
            return Err(OcctError::invalid("edge has no 3D curve to reverse"));
        }
        let geometry = Handle_Geom_Curve_get(&curve)?;
        let reversed_first = geometry.ReversedParameter(first)?;
        let reversed_last = geometry.ReversedParameter(last)?;
        let reversed = Geom_Curve_Reversed(geometry)?;
        let mut maker =
            BRepBuilderAPI_MakeEdge_new_hcurve_real2(&reversed, reversed_last, reversed_first)?;
        boxed(build(
            BRepBuilderAPI_MakeEdge_as_BRepBuilderAPI_MakeShape_mut(maker.pin_mut()),
            "BRepBuilderAPI_MakeEdge",
        )?)
    })
    .or_raise(cx)
}
