//! JavaScript object <-> assembly node conversions for the STEP exports.
//!
//! Shapes have to be copied on the JavaScript thread (see `exchange`), so the whole tree is
//! read eagerly here before any worker starts.

use neon::{prelude::*, types::buffer::TypedArray};

use crate::{
    assembly::{ImportedNode, Node, SubShapeColors},
    error::OrThrow,
    exchange::detach,
    shape::{ShapeCell, into_js},
    step::WriteOptions,
    xde::Rgba,
};

pub fn node<'cx>(cx: &mut Cx<'cx>, source: Handle<'cx, JsObject>) -> NeonResult<Node> {
    let cell = source.prop(cx, "shape").get::<&ShapeCell>()?;
    let shape = detach(cell).or_raise(cx)?;
    let label = source.prop(cx, "label").get::<String>()?;
    let color = color(cx, source)?;
    let kind = source.prop(cx, "subShapeColors").get::<String>()?;
    let Some(sub_shape_colors) = SubShapeColors::parse(&kind) else {
        return cx.throw_error(format!("unknown subShapeColors {kind:?}"));
    };
    let listed = source.prop(cx, "children").get::<Handle<'cx, JsArray>>()?.to_vec(cx)?;
    let mut children = Vec::with_capacity(listed.len());
    for child in listed {
        let child = child.downcast_or_throw::<JsObject, _>(cx)?;
        children.push(node(cx, child)?);
    }
    Ok(Node { shape, label, color, sub_shape_colors, children })
}

pub fn write_options<'cx>(
    cx: &mut Cx<'cx>,
    source: Handle<'cx, JsObject>,
) -> NeonResult<WriteOptions> {
    Ok(WriteOptions {
        length_unit_meters: source.prop(cx, "lengthUnitMeters").get::<f64>()?,
        write_pcurves: source.prop(cx, "writePCurves").get::<bool>()?,
        precision_mode: source.prop(cx, "precisionMode").get::<f64>()? as i32,
        originating_system: source.prop(cx, "originatingSystem").get::<String>()?,
        name: source.prop(cx, "name").get::<String>()?,
        timestamp: source.prop(cx, "timestamp").get::<String>()?,
    })
}

pub fn nodes_to_js<'cx>(cx: &mut Cx<'cx>, nodes: Vec<ImportedNode>) -> JsResult<'cx, JsArray> {
    let array = cx.empty_array();
    for (index, node) in nodes.into_iter().enumerate() {
        let value = node_to_js(cx, node)?;
        array.prop(cx, index as u32).set(value)?;
    }
    Ok(array)
}

fn node_to_js<'cx>(cx: &mut Cx<'cx>, node: ImportedNode) -> JsResult<'cx, JsObject> {
    let object = cx.empty_object();
    let shape = into_js(cx, node.shape.into_inner()).or_raise(cx)?;
    object.prop(cx, "shape").set(shape)?;
    object.prop(cx, "label").set(node.label)?;
    let color = match node.color {
        Some(color) => JsFloat64Array::from_slice(cx, &color)?.upcast::<JsValue>(),
        None => cx.null().upcast(),
    };
    object.prop(cx, "color").set(color)?;
    let children = nodes_to_js(cx, node.children)?;
    object.prop(cx, "children").set(children)?;
    Ok(object)
}

/// `color` is `[r, g, b, a]` in 0..1, or null when the shape has no colour.
fn color<'cx>(cx: &mut Cx<'cx>, source: Handle<'cx, JsObject>) -> NeonResult<Option<Rgba>> {
    let Some(value) = source.prop(cx, "color").get::<Option<Handle<'cx, JsFloat64Array>>>()? else {
        return Ok(None);
    };
    let Ok(color) = Rgba::try_from(value.as_slice(cx)) else {
        return cx.throw_error("color expects 4 components [r, g, b, a]");
    };
    Ok(Some(color))
}
