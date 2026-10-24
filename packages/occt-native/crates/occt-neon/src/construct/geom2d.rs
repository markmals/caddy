//! Shared plumbing for the 2D constraint solvers: projection of planar edges onto the XY plane,
//! qualified curves and points for `Geom2dGcc`, and the edges built back from a solution circle.

use std::f64::consts::{PI, TAU};

use cxx::UniquePtr;
use opencascade_sys::{
    b_rep::BRep_Tool_Curve_edge_real2,
    b_rep_adaptor::{
        BRepAdaptor_Curve_Circle, BRepAdaptor_Curve_new_edge, Handle_BRepAdaptor_Curve_get,
    },
    b_rep_builder_api::{
        BRepBuilderAPI_MakeEdge_as_BRepBuilderAPI_MakeShape_mut,
        BRepBuilderAPI_MakeEdge_new_hcurve_hsurface, BRepBuilderAPI_MakeEdge_new_pnt2,
    },
    b_rep_lib::BRepLib,
    gcc_ent::GccEnt_Position,
    geom::{Geom_Plane_new_pln, Handle_Geom_Plane_to_Geom_Surface, Handle_Geom_Surface},
    geom_abs::GeomAbs_CurveType,
    geom_api::GeomAPI_To2d,
    geom2d::{
        Geom2d_CartesianPoint_new_real2, Geom2d_Circle_new_circ2d, Geom2d_Curve_EvalD0,
        Geom2d_TrimmedCurve_new_hcurve_real2_bool2, Handle_Geom2d_CartesianPoint,
        Handle_Geom2d_CartesianPoint_get, Handle_Geom2d_CartesianPoint_to_Geom2d_Point,
        Handle_Geom2d_Circle_to_Geom2d_Curve, Handle_Geom2d_Curve, Handle_Geom2d_Curve_get,
        Handle_Geom2d_Point, Handle_Geom2d_TrimmedCurve_to_Geom2d_Curve,
    },
    geom2d_adaptor::{
        Geom2dAdaptor_Curve_new_hcurve_real2, Handle_Geom2dAdaptor_Curve,
        Handle_Geom2dAdaptor_Curve_get,
    },
    geom2d_gcc::{Geom2dGcc_QualifiedCurve, Geom2dGcc_QualifiedCurve_new_curve_position},
    gp::{gp_Ax3_new_pnt_dir, gp_Circ2d, gp_Pln, gp_Pln_new_ax3},
    topo_ds::TopoDS_Shape,
};

use crate::{
    construct::{TOLERANCE, as_edge, build},
    convert::{dir, pnt},
    error::{OcctError, OcctResult},
    shape::owned,
};

/// The Z-up XY plane every 2D solver works on (build123d's `_pln_xy`).
fn xy_plane() -> OcctResult<UniquePtr<gp_Pln>> {
    let frame = gp_Ax3_new_pnt_dir(&*pnt(&[0.0, 0.0, 0.0])?, &*dir(&[0.0, 0.0, 1.0])?)?;
    Ok(gp_Pln_new_ax3(&frame)?)
}

fn xy_surface() -> OcctResult<UniquePtr<Handle_Geom_Surface>> {
    let plane = Geom_Plane_new_pln(&*xy_plane()?)?;
    Ok(Handle_Geom_Plane_to_Geom_Surface(&plane))
}

/// Where a solution circle or line meets a target: the parameter on the solution and on the target.
#[derive(Default)]
pub struct Contact {
    pub on_circle: f64,
    pub on_target: f64,
}

pub fn distance_to(from: [f64; 2], to: [f64; 2]) -> f64 {
    ((from[0] - to[0]).powi(2) + (from[1] - to[1]).powi(2)).sqrt()
}

/// A planar edge as the solvers see it: its 2D curve, trimmed parameter range and the
/// `Geom2dGcc` qualified curve built from them.
pub struct QualifiedEdge {
    pub qualified: UniquePtr<Geom2dGcc_QualifiedCurve>,
    pub curve: UniquePtr<Handle_Geom2d_Curve>,
    pub adaptor: UniquePtr<Handle_Geom2dAdaptor_Curve>,
    first: f64,
    last: f64,
    edge: UniquePtr<TopoDS_Shape>,
}

impl QualifiedEdge {
    /// Midpoint of the parameter range, the solvers' starting guess.
    pub fn guess(&self) -> f64 {
        (self.last - self.first) / 2.0 + self.first
    }

    /// Does `parameter` lie inside the edge's trimmed range (normalized when periodic)?
    pub fn contains(&self, parameter: f64) -> OcctResult<bool> {
        let curve = Handle_Geom2d_Curve_get(&self.curve)?;
        let parameter = if curve.IsPeriodic()? {
            normalize_period(parameter, self.first, curve.Period()?)
        } else {
            parameter
        };
        Ok(self.first - TOLERANCE <= parameter && parameter <= self.last + TOLERANCE)
    }

    pub fn value_at(&self, parameter: f64) -> OcctResult<[f64; 2]> {
        let point = Geom2d_Curve_EvalD0(Handle_Geom2d_Curve_get(&self.curve)?, parameter)?;
        Ok([point.X()?, point.Y()?])
    }

    /// Centre and radius when the edge is circular, which the enclosed-tangency correction needs.
    fn circle(&self) -> OcctResult<Option<([f64; 2], f64)>> {
        let adaptor = BRepAdaptor_Curve_new_edge(as_edge(&self.edge)?)?;
        let adaptor = Handle_BRepAdaptor_Curve_get(&adaptor)?;
        if adaptor.GetType()? != GeomAbs_CurveType::GeomAbs_Circle {
            return Ok(None);
        }
        let circle = BRepAdaptor_Curve_Circle(adaptor)?;
        let center = circle.Location()?;
        Ok(Some(([center.X()?, center.Y()?], circle.Radius()?)))
    }
}

/// A tangency target: a curve to touch or a point to pass through.
pub enum Tangency {
    Curve(QualifiedEdge),
    Point(UniquePtr<Handle_Geom2d_CartesianPoint>),
}

impl Tangency {
    pub fn curve(&self) -> OcctResult<&QualifiedEdge> {
        match self {
            Tangency::Curve(curve) => Ok(curve),
            Tangency::Point(_) => Err(OcctError::invalid("a point is not a valid curve target")),
        }
    }

    pub fn as_point(&self) -> OcctResult<UniquePtr<Handle_Geom2d_Point>> {
        match self {
            Tangency::Point(point) => Ok(point_handle(point)),
            Tangency::Curve(_) => Err(OcctError::invalid("a curve is not a valid point target")),
        }
    }

    /// Does `parameter` fall inside the target's trimmed range? Points accept any parameter.
    pub fn contains(&self, parameter: f64) -> OcctResult<bool> {
        match self {
            Tangency::Curve(curve) => curve.contains(parameter),
            Tangency::Point(_) => Ok(true),
        }
    }
}

pub fn cartesian_point(x: f64, y: f64) -> OcctResult<UniquePtr<Handle_Geom2d_CartesianPoint>> {
    Ok(Geom2d_CartesianPoint_new_real2(x, y)?)
}

pub fn point_handle(point: &Handle_Geom2d_CartesianPoint) -> UniquePtr<Handle_Geom2d_Point> {
    Handle_Geom2d_CartesianPoint_to_Geom2d_Point(point)
}

pub fn point_coordinates(point: &Handle_Geom2d_CartesianPoint) -> OcctResult<[f64; 2]> {
    let (mut x, mut y) = (0.0, 0.0);
    Handle_Geom2d_CartesianPoint_get(point)?.Coord(&mut x, &mut y)?;
    Ok([x, y])
}

pub fn qualified_edge(
    edge: &TopoDS_Shape,
    qualifier: GccEnt_Position,
) -> OcctResult<QualifiedEdge> {
    let (mut first, mut last) = (0.0, 0.0);
    let curve3d = BRep_Tool_Curve_edge_real2(as_edge(edge)?, &mut first, &mut last)?;
    if curve3d.is_null() {
        return Err(OcctError::invalid("tangency edge has no curve"));
    }
    let curve = GeomAPI_To2d(&curve3d, &*xy_plane()?)?;
    let adaptor = Geom2dAdaptor_Curve_new_hcurve_real2(&curve, first, last)?;
    let qualified = Geom2dGcc_QualifiedCurve_new_curve_position(
        Handle_Geom2dAdaptor_Curve_get(&adaptor)?,
        qualifier,
    )?;
    Ok(QualifiedEdge { qualified, curve, adaptor, first, last, edge: owned(edge) })
}

pub fn qualifier(value: f64) -> OcctResult<GccEnt_Position> {
    match value as i32 {
        0 => Ok(GccEnt_Position::GccEnt_unqualified),
        1 => Ok(GccEnt_Position::GccEnt_enclosing),
        2 => Ok(GccEnt_Position::GccEnt_enclosed),
        3 => Ok(GccEnt_Position::GccEnt_outside),
        _ => Err(OcctError::invalid(format!("unknown tangency qualifier {value}"))),
    }
}

/// Splits the tangency inputs: the edges come first, the flat `[x, y, ...]` points last, which is
/// the order build123d's dispatcher sorts them into.
pub fn tangencies(
    edges: &[UniquePtr<TopoDS_Shape>],
    qualifiers: &[f64],
    points: &[f64],
) -> OcctResult<Vec<Tangency>> {
    if qualifiers.len() != edges.len() {
        return Err(OcctError::invalid("one tangency qualifier is required per edge"));
    }
    if points.len() % 2 != 0 {
        return Err(OcctError::invalid("tangency points must be [x, y] pairs"));
    }
    let mut targets = Vec::with_capacity(edges.len() + points.len() / 2);
    for (edge, value) in edges.iter().zip(qualifiers) {
        targets.push(Tangency::Curve(qualified_edge(edge, qualifier(*value)?)?));
    }
    for point in points.chunks_exact(2) {
        targets.push(Tangency::Point(cartesian_point(point[0], point[1])?));
    }
    Ok(targets)
}

/// Maps `parameter` into `[first, first + period)`.
fn normalize_period(parameter: f64, first: f64, period: f64) -> f64 {
    if (parameter - first).abs() < TOLERANCE {
        return first;
    }
    (parameter - first).rem_euclid(period) + first
}

/// Forward (positive) distance from `from` to `to` on a periodic domain anchored at `first`.
fn forward_delta(from: f64, to: f64, first: f64, period: f64) -> f64 {
    let delta = normalize_period(to, first, period) - normalize_period(from, first, period);
    if delta < 0.0 { delta + period } else { delta }
}

fn arc_edge(circle: &gp_Circ2d, u1: f64, u2: f64) -> OcctResult<UniquePtr<TopoDS_Shape>> {
    let basis = Handle_Geom2d_Circle_to_Geom2d_Curve(&*Geom2d_Circle_new_circ2d(circle)?);
    let trimmed = Geom2d_TrimmedCurve_new_hcurve_real2_bool2(&basis, u1, u2, true, true)?;
    let mut maker = BRepBuilderAPI_MakeEdge_new_hcurve_hsurface(
        &Handle_Geom2d_TrimmedCurve_to_Geom2d_Curve(&trimmed),
        &*xy_surface()?,
    )?;
    let edge = build(
        BRepBuilderAPI_MakeEdge_as_BRepBuilderAPI_MakeShape_mut(maker.pin_mut()),
        "BRepBuilderAPI_MakeEdge",
    )?;
    BRepLib::BuildCurves3d_shape(&edge)?;
    Ok(edge)
}

/// The whole circle as one closed edge.
pub fn circle_edge(circle: &gp_Circ2d) -> OcctResult<UniquePtr<TopoDS_Shape>> {
    arc_edge(circle, 0.0, TAU)
}

/// Both arcs of `circle` between two of its parameters: the forward (minor) one first, then its
/// complement. Empty when the parameters coincide or span the whole circle.
pub fn arc_pair(circle: &gp_Circ2d, u1: f64, u2: f64) -> OcctResult<Vec<UniquePtr<TopoDS_Shape>>> {
    let delta = forward_delta(u1, u2, 0.0, TAU);
    if delta <= TOLERANCE || (TAU - delta).abs() <= TOLERANCE {
        return Ok(Vec::new());
    }
    let start = normalize_period(u1, 0.0, TAU);
    let complement = normalize_period(u2, 0.0, TAU);
    Ok(vec![
        arc_edge(circle, start, start + delta)?,
        arc_edge(circle, complement, complement + (TAU - delta))?,
    ])
}

/// build123d's enclosed-circle correction: a solution circle sitting inside a circular target
/// touches it half a turn away from the parameter the solver reports. `GccAna_Circ2d3Tan` already
/// accounts for this when every target is a circle, so that case is left alone.
pub fn correct_enclosed(
    targets: &[Tangency],
    circle: &gp_Circ2d,
    parameters: &mut [f64],
) -> OcctResult<()> {
    let mut circles = Vec::with_capacity(targets.len());
    for target in targets {
        circles.push(match target {
            Tangency::Curve(curve) => curve.circle()?,
            Tangency::Point(_) => None,
        });
    }
    if circles.iter().all(Option::is_some) {
        return Ok(());
    }
    let location = circle.Location()?;
    let center = [location.X()?, location.Y()?];
    for (parameter, target) in parameters.iter_mut().zip(&circles) {
        let Some((target_center, radius)) = target else { continue };
        if distance_to(center, *target_center) < *radius {
            *parameter += PI;
        }
    }
    Ok(())
}

/// An edge on the XY plane between two 2D points.
pub fn line_edge(from: [f64; 2], to: [f64; 2]) -> OcctResult<UniquePtr<TopoDS_Shape>> {
    let mut maker = BRepBuilderAPI_MakeEdge_new_pnt2(
        &*pnt(&[from[0], from[1], 0.0])?,
        &*pnt(&[to[0], to[1], 0.0])?,
    )?;
    build(
        BRepBuilderAPI_MakeEdge_as_BRepBuilderAPI_MakeShape_mut(maker.pin_mut()),
        "BRepBuilderAPI_MakeEdge",
    )
}
