//! Wires: polygons, assembly from loose edges and connection of edge sets into wires.

use neon::prelude::*;
use opencascade_sys::{
    b_rep_builder_api::{
        BRepBuilderAPI_MakePolygon_new, BRepBuilderAPI_MakeWire_new, BRepBuilderAPI_WireError,
    },
    shape_analysis::ShapeAnalysis_FreeBounds_ConnectEdgesToWires,
    shape_fix::{
        Handle_ShapeFix_Wireframe_get_mut, ShapeFix_Wireframe_Shape, ShapeFix_Wireframe_new_shape,
    },
    top_tools::{
        Handle_TopTools_HSequenceOfShape_get, Handle_TopTools_HSequenceOfShape_get_mut,
        TopTools_HSequenceOfShape_append, TopTools_HSequenceOfShape_length,
        TopTools_HSequenceOfShape_new, TopTools_HSequenceOfShape_value,
    },
    topo_ds::TopoDS_Wire_to_TopoDS_Shape,
};

use crate::{
    builder::progress,
    construct::{TOLERANCE, as_wire, points},
    convert::xyz,
    error::{OcctError, OcctResult, OrThrow, attempt},
    shape::{ShapeCell, ShapeResult, boxed, get, owned, shape_list, shapes_from_js, shapes_to_js},
};

fn wire_failure(error: BRepBuilderAPI_WireError) -> Option<OcctError> {
    match error {
        BRepBuilderAPI_WireError::BRepBuilderAPI_EmptyWire => {
            Some(OcctError::invalid("wire is empty"))
        }
        BRepBuilderAPI_WireError::BRepBuilderAPI_DisconnectedWire => {
            Some(OcctError::invalid("edges are disconnected"))
        }
        // A non-manifold wire (branching or self-intersecting) is still returned, as build123d
        // does; it only warns.
        _ => None,
    }
}

/// Closed or open polyline through `points`. When `close` is set and the last point is not
/// already the first, the first point is repeated (build123d `Wire.make_polygon`).
#[neon::export(name = "makePolygonWire")]
fn make_polygon_wire<'cx>(cx: &mut Cx<'cx>, points_flat: Vec<f64>, close: bool) -> ShapeResult {
    attempt(|| {
        let corners = points(&points_flat, "polygon points")?;
        let (first, last) = (xyz(&corners[0])?, xyz(&corners[corners.len() - 1])?);
        let gap = (0..3).map(|i| (first[i] - last[i]).powi(2)).sum::<f64>().sqrt();
        let mut maker = BRepBuilderAPI_MakePolygon_new()?;
        for corner in &corners {
            maker.pin_mut().Add_pnt(corner)?;
        }
        if close && gap > TOLERANCE {
            maker.pin_mut().Add_pnt(&corners[0])?;
        }
        maker.pin_mut().Build(&*progress()?)?;
        if !maker.IsDone()? {
            return Err(OcctError::failed("BRepBuilderAPI_MakePolygon failed"));
        }
        boxed(TopoDS_Wire_to_TopoDS_Shape(maker.pin_mut().Wire()?))
    })
    .or_raise(cx)
}

/// A wire from loose edges, in the order given (build123d `Wire._make_wire`).
#[neon::export(name = "makeWire")]
fn make_wire<'cx>(cx: &mut Cx<'cx>, edges: Handle<'cx, JsArray>) -> ShapeResult {
    let edges = shapes_from_js(cx, edges)?;
    attempt(|| {
        let mut maker = BRepBuilderAPI_MakeWire_new()?;
        maker.pin_mut().Add_listofshape(&*shape_list(&edges)?)?;
        maker.pin_mut().Build(&*progress()?)?;
        if !maker.IsDone()? {
            if let Some(failure) = wire_failure(maker.Error()?) {
                return Err(failure);
            }
        }
        boxed(TopoDS_Wire_to_TopoDS_Shape(maker.pin_mut().Wire()?))
    })
    .or_raise(cx)
}

/// Chains edges into as many connected wires as they form (build123d `Wire.combine`).
#[neon::export(name = "connectEdgesToWires")]
fn connect_edges_to_wires<'cx>(
    cx: &mut Cx<'cx>,
    edges: Handle<'cx, JsArray>,
    tolerance: f64,
) -> JsResult<'cx, JsArray> {
    let edges = shapes_from_js(cx, edges)?;
    let wires = attempt(|| {
        let mut input = TopTools_HSequenceOfShape_new()?;
        for edge in &edges {
            let sequence = Handle_TopTools_HSequenceOfShape_get_mut(input.pin_mut())?;
            TopTools_HSequenceOfShape_append(sequence, edge)?;
        }
        let output = ShapeAnalysis_FreeBounds_ConnectEdgesToWires(&input, tolerance, false)?;
        let sequence = Handle_TopTools_HSequenceOfShape_get(&output)?;
        (1..=TopTools_HSequenceOfShape_length(sequence)?)
            .map(|index| Ok(owned(TopTools_HSequenceOfShape_value(sequence, index)?)))
            .collect::<OcctResult<Vec<_>>>()
    })
    .or_raise(cx)?;
    shapes_to_js(cx, wires)
}

/// The wire holding the edges of both wires, added wire by wire so that each edge is checked
/// against the growing wire (build123d `Wire.stitch`).
#[neon::export(name = "stitchWires")]
fn stitch_wires<'cx>(cx: &mut Cx<'cx>, first: &ShapeCell, second: &ShapeCell) -> ShapeResult {
    let first = get(first).or_raise(cx)?;
    let second = get(second).or_raise(cx)?;
    attempt(|| {
        let mut maker = BRepBuilderAPI_MakeWire_new()?;
        maker.pin_mut().Add_wire(as_wire(&first)?)?;
        maker.pin_mut().Add_wire(as_wire(&second)?)?;
        maker.pin_mut().Build(&*progress()?)?;
        if !maker.IsDone()? {
            if let Some(failure) = wire_failure(maker.Error()?) {
                return Err(failure);
            }
        }
        boxed(TopoDS_Wire_to_TopoDS_Shape(maker.pin_mut().Wire()?))
    })
    .or_raise(cx)
}

/// ShapeFix_Wireframe's small-edge and wire-gap fixes, which drop edges shorter than
/// `precision` (build123d `Wire.fix_degenerate_edges`).
#[neon::export(name = "fixWireframe")]
fn fix_wireframe<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    precision: f64,
    max_tolerance: f64,
) -> ShapeResult {
    let shape = get(shape).or_raise(cx)?;
    attempt(|| {
        let mut fixer = ShapeFix_Wireframe_new_shape(&shape)?;
        Handle_ShapeFix_Wireframe_get_mut(fixer.pin_mut())?.SetPrecision(precision)?;
        Handle_ShapeFix_Wireframe_get_mut(fixer.pin_mut())?.SetMaxTolerance(max_tolerance)?;
        Handle_ShapeFix_Wireframe_get_mut(fixer.pin_mut())?.FixSmallEdges()?;
        Handle_ShapeFix_Wireframe_get_mut(fixer.pin_mut())?.FixWireGaps()?;
        boxed(ShapeFix_Wireframe_Shape(Handle_ShapeFix_Wireframe_get_mut(fixer.pin_mut())?)?)
    })
    .or_raise(cx)
}
