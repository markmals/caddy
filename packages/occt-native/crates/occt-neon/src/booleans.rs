//! Boolean operations (BRepAlgoAPI) and result cleanup (ShapeUpgrade_UnifySameDomain).
//!
//! These return OCCT's raw result shape, with the record of what the operation did to its
//! inputs' sub-shapes; callers decide how to unwrap compounds and whether to keep the record.

use std::pin::Pin;

use cxx::UniquePtr;
use neon::prelude::*;
use opencascade_sys::{
    b_rep_algo_api::{
        BRepAlgoAPI_BooleanOperation, BRepAlgoAPI_BooleanOperation_DumpErrors,
        BRepAlgoAPI_BooleanOperation_HasErrors, BRepAlgoAPI_BooleanOperation_History,
        BRepAlgoAPI_BooleanOperation_SetFuzzyValue, BRepAlgoAPI_BooleanOperation_SetRunParallel,
        BRepAlgoAPI_Common_as_BRepAlgoAPI_BooleanOperation_mut, BRepAlgoAPI_Common_new,
        BRepAlgoAPI_Cut_as_BRepAlgoAPI_BooleanOperation_mut, BRepAlgoAPI_Cut_new,
        BRepAlgoAPI_Fuse_as_BRepAlgoAPI_BooleanOperation_mut, BRepAlgoAPI_Fuse_new,
        BRepAlgoAPI_Section_as_BRepAlgoAPI_BooleanOperation_mut, BRepAlgoAPI_Section_new,
        BRepAlgoAPI_Splitter_DumpErrors, BRepAlgoAPI_Splitter_HasErrors,
        BRepAlgoAPI_Splitter_SetFuzzyValue, BRepAlgoAPI_Splitter_SetRunParallel,
        BRepAlgoAPI_Splitter_new,
    },
    b_rep_tools::{Handle_BRepTools_History, Handle_BRepTools_History_clone},
    bop_algo::BOPAlgo_GlueEnum,
    occt_stream::{OcctStream, OcctStream_new, OcctStream_to_bytes},
    shape_upgrade::{
        Handle_ShapeUpgrade_UnifySameDomain_get_mut, ShapeUpgrade_UnifySameDomain_new_shape_bool3,
    },
    topo_ds::TopoDS_Shape,
};

use crate::{
    builder::progress,
    error::attempt,
    error::{OcctError, OcctResult, OrThrow},
    history::recorded,
    shape::{ShapeCell, ShapeResult, boxed, get, owned, shape_list, shapes_from_js},
};

pub struct BooleanOptions {
    pub fuzzy: f64,
    pub glue: BOPAlgo_GlueEnum,
    pub parallel: bool,
}

fn options(fuzzy: f64, glue: &str, parallel: bool) -> OcctResult<BooleanOptions> {
    if !(fuzzy >= 0.0 && fuzzy.is_finite()) {
        return Err(OcctError::invalid("fuzzy value must be a non-negative number"));
    }
    let glue = match glue {
        "off" => BOPAlgo_GlueEnum::BOPAlgo_GlueOff,
        "shift" => BOPAlgo_GlueEnum::BOPAlgo_GlueShift,
        "full" => BOPAlgo_GlueEnum::BOPAlgo_GlueFull,
        other => {
            return Err(OcctError::invalid(format!(
                "unknown glue mode `{other}` (off, shift, full)"
            )));
        }
    };
    Ok(BooleanOptions { fuzzy, glue, parallel })
}

fn report_failure(
    name: &str,
    dump: impl FnOnce(Pin<&mut OcctStream>) -> OcctResult<()>,
) -> OcctError {
    let mut report = OcctStream_new();
    let text = match dump(report.pin_mut()) {
        Ok(()) => String::from_utf8_lossy(&OcctStream_to_bytes(&report)).trim().to_owned(),
        Err(error) => error.message,
    };
    OcctError::failed(format!("{name} failed: {text}"))
}

fn run_boolean(
    mut operation: Pin<&mut BRepAlgoAPI_BooleanOperation>,
    name: &str,
    arguments: &[UniquePtr<TopoDS_Shape>],
    tools: &[UniquePtr<TopoDS_Shape>],
    options: &BooleanOptions,
) -> OcctResult<UniquePtr<TopoDS_Shape>> {
    operation.as_mut().SetArguments(&*shape_list(arguments)?)?;
    operation.as_mut().SetTools(&*shape_list(tools)?)?;
    operation.as_mut().SetGlue(options.glue)?;
    BRepAlgoAPI_BooleanOperation_SetFuzzyValue(operation.as_mut(), options.fuzzy)?;
    BRepAlgoAPI_BooleanOperation_SetRunParallel(operation.as_mut(), options.parallel)?;
    operation.as_mut().Build(&*progress()?)?;
    if BRepAlgoAPI_BooleanOperation_HasErrors(&operation)? {
        return Err(report_failure(name, |stream| {
            Ok(BRepAlgoAPI_BooleanOperation_DumpErrors(&operation, stream)?)
        }));
    }
    Ok(owned(operation.as_mut().Shape()?))
}

/// Runs one of the boolean algorithms and takes the record it built along with its result.
fn run_kind(
    kind: &str,
    arguments: &[UniquePtr<TopoDS_Shape>],
    tools: &[UniquePtr<TopoDS_Shape>],
    options: &BooleanOptions,
) -> OcctResult<(UniquePtr<TopoDS_Shape>, UniquePtr<Handle_BRepTools_History>)> {
    macro_rules! run {
        ($new:ident, $upcast:ident, $algorithm:literal) => {{
            let mut algorithm = $new()?;
            let shape =
                run_boolean($upcast(algorithm.pin_mut()), $algorithm, arguments, tools, options)?;
            let history = BRepAlgoAPI_BooleanOperation_History(&*$upcast(algorithm.pin_mut()))?;
            (shape, history)
        }};
    }
    Ok(match kind {
        "fuse" => run!(
            BRepAlgoAPI_Fuse_new,
            BRepAlgoAPI_Fuse_as_BRepAlgoAPI_BooleanOperation_mut,
            "BRepAlgoAPI_Fuse"
        ),
        "cut" => run!(
            BRepAlgoAPI_Cut_new,
            BRepAlgoAPI_Cut_as_BRepAlgoAPI_BooleanOperation_mut,
            "BRepAlgoAPI_Cut"
        ),
        "common" => run!(
            BRepAlgoAPI_Common_new,
            BRepAlgoAPI_Common_as_BRepAlgoAPI_BooleanOperation_mut,
            "BRepAlgoAPI_Common"
        ),
        "section" => run!(
            BRepAlgoAPI_Section_new,
            BRepAlgoAPI_Section_as_BRepAlgoAPI_BooleanOperation_mut,
            "BRepAlgoAPI_Section"
        ),
        other => {
            return Err(OcctError::invalid(format!(
                "unknown boolean operation `{other}` (fuse, cut, common, section)"
            )));
        }
    })
}

/// `{ shape, history }`: `arguments` combined with `tools` by `kind` (fuse, cut, common or
/// section), and what the operation did to their sub-shapes.
#[neon::export(name = "booleanOperation")]
fn boolean_operation<'cx>(
    cx: &mut Cx<'cx>,
    kind: String,
    arguments: Handle<'cx, JsArray>,
    tools: Handle<'cx, JsArray>,
    fuzzy: f64,
    glue: String,
    parallel: bool,
) -> JsResult<'cx, JsObject> {
    let arguments = shapes_from_js(cx, arguments)?;
    let tools = shapes_from_js(cx, tools)?;
    let (shape, history) = attempt(|| {
        let options = options(fuzzy, &glue, parallel)?;
        run_kind(&kind, &arguments, &tools, &options)
    })
    .or_raise(cx)?;
    recorded(cx, shape, history)
}

/// Splits `arguments` by `tools` (BRepAlgoAPI_Splitter), keeping every piece.
#[neon::export(name = "booleanSplit")]
fn boolean_split<'cx>(
    cx: &mut Cx<'cx>,
    arguments: Handle<'cx, JsArray>,
    tools: Handle<'cx, JsArray>,
    fuzzy: f64,
    parallel: bool,
) -> ShapeResult {
    let arguments = shapes_from_js(cx, arguments)?;
    let tools = shapes_from_js(cx, tools)?;
    let result = attempt(|| {
        let options = options(fuzzy, "off", parallel)?;
        let mut splitter = BRepAlgoAPI_Splitter_new()?;
        splitter.pin_mut().SetArguments(&*shape_list(&arguments)?)?;
        splitter.pin_mut().SetTools(&*shape_list(&tools)?)?;
        BRepAlgoAPI_Splitter_SetFuzzyValue(splitter.pin_mut(), options.fuzzy)?;
        BRepAlgoAPI_Splitter_SetRunParallel(splitter.pin_mut(), options.parallel)?;
        splitter.pin_mut().Build(&*progress()?)?;
        if BRepAlgoAPI_Splitter_HasErrors(&splitter)? {
            return Err(report_failure("BRepAlgoAPI_Splitter", |stream| {
                Ok(BRepAlgoAPI_Splitter_DumpErrors(&splitter, stream)?)
            }));
        }
        boxed(owned(splitter.pin_mut().Shape()?))
    });
    result.or_raise(cx)
}

/// `{ shape, history }`: coplanar faces and collinear edges merged (ShapeUpgrade_UnifySameDomain),
/// as build123d's `clean()` does after every boolean, and what the merge did to the sub-shapes.
#[neon::export(name = "unifySameDomain")]
fn unify_same_domain<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    unify_edges: bool,
    unify_faces: bool,
    concat_bsplines: bool,
    allow_internal_edges: bool,
) -> JsResult<'cx, JsObject> {
    let shape = get(shape).or_raise(cx)?;
    let (unified, history) = attempt(|| {
        let mut handle = ShapeUpgrade_UnifySameDomain_new_shape_bool3(
            &shape,
            unify_edges,
            unify_faces,
            concat_bsplines,
        )?;
        let mut upgrader = Handle_ShapeUpgrade_UnifySameDomain_get_mut(handle.pin_mut())?;
        upgrader.as_mut().AllowInternalEdges(allow_internal_edges)?;
        upgrader.as_mut().Build()?;
        let unified = owned(upgrader.as_ref().get_ref().Shape()?);
        let history = Handle_BRepTools_History_clone(upgrader.as_ref().get_ref().History()?);
        Ok((unified, history))
    })
    .or_raise(cx)?;
    recorded(cx, unified, history)
}
