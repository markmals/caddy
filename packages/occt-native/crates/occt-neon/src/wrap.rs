//! Conforming planar geometry to a curved surface (build123d `Face.wrap`): projecting a curve onto
//! the surface a face sits on, reading the poles of a spline edge so it can be extended, the
//! parameters where two curves come closest, and closing the gaps left between projected edges.

use cxx::UniquePtr;
use neon::prelude::*;
use opencascade_sys::{
    b_rep::{BRep_Tool_Curve_edge_real2, BRep_Tool_Surface_face},
    b_rep_builder_api::BRepBuilderAPI_MakeWire_new,
    geom::{
        Handle_Geom_BSplineCurve_from_Geom_Curve, Handle_Geom_BSplineCurve_get,
        Handle_Geom_BSplineCurve_is_null, Handle_Geom_Curve, Handle_Geom_Curve_is_null,
    },
    geom_api::GeomAPI_ExtremaCurveCurve_new_hcurve2,
    geom_proj_lib::GeomProjLib_Project,
    shape_fix::{
        Handle_ShapeFix_Wire_get, Handle_ShapeFix_Wire_get_mut, ShapeFix_Wire_Wire,
        ShapeFix_Wire_new,
    },
    topo_ds::{TopoDS_Shape, TopoDS_Wire_to_TopoDS_Shape},
};

use crate::{
    builder::progress,
    construct::{as_edge, as_face, edge_from_curve},
    convert::xyz,
    error::{OcctError, OcctResult, OrThrow, attempt},
    shape::{ShapeCell, ShapeResult, boxed, get, shape_list, shapes_from_js},
};

fn edge_curve(edge: &TopoDS_Shape) -> OcctResult<UniquePtr<Handle_Geom_Curve>> {
    let (mut first, mut last) = (0.0, 0.0);
    let curve = BRep_Tool_Curve_edge_real2(as_edge(edge)?, &mut first, &mut last)?;
    if Handle_Geom_Curve_is_null(&curve) {
        return Err(OcctError::invalid("edge has no 3D curve"));
    }
    Ok(curve)
}

/// The edge's curve projected along the normals of the surface `face` sits on, as a new edge
/// spanning the whole projection (OCCT `GeomProjLib::Project`).
#[neon::export(name = "projectEdgeOnFace")]
fn project_edge_on_face<'cx>(cx: &mut Cx<'cx>, edge: &ShapeCell, face: &ShapeCell) -> ShapeResult {
    let edge = get(edge).or_raise(cx)?;
    let face = get(face).or_raise(cx)?;
    attempt(|| {
        let curve = edge_curve(&edge)?;
        let surface = BRep_Tool_Surface_face(as_face(&face)?)?;
        let projected = GeomProjLib_Project(&curve, &surface)?;
        if Handle_Geom_Curve_is_null(&projected) {
            return Err(OcctError::failed("projecting the curve onto the surface failed"));
        }
        boxed(edge_from_curve(&projected)?)
    })
    .or_raise(cx)
}

/// The control points of a spline edge's curve as `[x, y, z, ...]`.
#[neon::export(name = "edgeSplinePoles")]
fn edge_spline_poles<'cx>(cx: &mut Cx<'cx>, edge: &ShapeCell) -> NeonResult<Vec<f64>> {
    let edge = get(edge).or_raise(cx)?;
    attempt(|| {
        let curve = edge_curve(&edge)?;
        let handle = Handle_Geom_BSplineCurve_from_Geom_Curve(&curve);
        if Handle_Geom_BSplineCurve_is_null(&handle) {
            return Err(OcctError::invalid("edge is not a B-spline"));
        }
        let spline = Handle_Geom_BSplineCurve_get(&handle)?;
        let mut poles = Vec::with_capacity(3 * spline.NbPoles()? as usize);
        for index in 1..=spline.NbPoles()? {
            poles.extend(xyz(spline.Pole(index)?)?);
        }
        Ok(poles)
    })
    .or_raise(cx)
}

/// The parameters `[u1, u2]` of the first extremum between the two edges' curves, or an empty
/// array when the curves have none (OCCT `GeomAPI_ExtremaCurveCurve`).
#[neon::export(name = "curveExtremaParameters")]
fn curve_extrema_parameters<'cx>(
    cx: &mut Cx<'cx>,
    first: &ShapeCell,
    second: &ShapeCell,
) -> NeonResult<Vec<f64>> {
    let first = get(first).or_raise(cx)?;
    let second = get(second).or_raise(cx)?;
    attempt(|| {
        let extrema =
            GeomAPI_ExtremaCurveCurve_new_hcurve2(&*edge_curve(&first)?, &*edge_curve(&second)?)?;
        if extrema.NbExtrema()? < 1 {
            return Ok(Vec::new());
        }
        let (mut u1, mut u2) = (0.0, 0.0);
        extrema.Parameters(1, &mut u1, &mut u2)?;
        Ok(vec![u1, u2])
    })
    .or_raise(cx)
}

/// A wire from `edges` whose vertices are shared again after each edge was projected separately:
/// `ShapeFix_Wire` reorders the edges and closes the gaps up to `precision`.
#[neon::export(name = "fixWireConnections")]
fn fix_wire_connections<'cx>(
    cx: &mut Cx<'cx>,
    edges: Handle<'cx, JsArray>,
    precision: f64,
) -> ShapeResult {
    let edges = shapes_from_js(cx, edges)?;
    attempt(|| {
        let mut maker = BRepBuilderAPI_MakeWire_new()?;
        maker.pin_mut().Add_listofshape(&*shape_list(&edges)?)?;
        maker.pin_mut().Build(&*progress()?)?;
        let mut fixer = ShapeFix_Wire_new()?;
        Handle_ShapeFix_Wire_get_mut(fixer.pin_mut())?.SetPrecision(precision)?;
        Handle_ShapeFix_Wire_get_mut(fixer.pin_mut())?.Load(maker.pin_mut().Wire()?)?;
        Handle_ShapeFix_Wire_get_mut(fixer.pin_mut())?.FixReorder(false)?;
        Handle_ShapeFix_Wire_get_mut(fixer.pin_mut())?.FixConnected_real(-1.0)?;
        let wire = ShapeFix_Wire_Wire(Handle_ShapeFix_Wire_get(&fixer)?)?;
        boxed(TopoDS_Wire_to_TopoDS_Shape(&wire))
    })
    .or_raise(cx)
}
