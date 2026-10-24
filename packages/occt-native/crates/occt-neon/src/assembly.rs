//! Translating between a Caddy shape tree and the XDE label tree STEP stores.
//!
//! Mirrors build123d's `exporters3d._create_xde` and `importers.import_step`: a preorder walk
//! that names and colours every label on the way down, and the reverse walk that rebuilds the
//! tree from free shapes and their components.

use cxx::UniquePtr;
use opencascade_sys::{
    b_rep_bnd_lib::BRepBndLib,
    bnd::Bnd_Box_new,
    quantity::Quantity_ColorRGBA_new,
    tdf::{TDF_Label, TDF_LabelSequence_length, TDF_LabelSequence_new, TDF_LabelSequence_value},
    top_abs::TopAbs_ShapeEnum,
    topo_ds::{TopoDS_Shape, TopoDS_Shape_Moved},
    xcaf_doc::{
        XCAFDoc_ColorTool, XCAFDoc_ColorType, XCAFDoc_ShapeTool,
        XCAFDoc_ShapeTool_AddComponent_label_shape_bool, XCAFDoc_ShapeTool_AddShape,
        XCAFDoc_ShapeTool_AddSubShape_label_shape, XCAFDoc_ShapeTool_GetLocation,
        XCAFDoc_ShapeTool_GetShape_label,
    },
};

use crate::{
    error::OcctResult,
    exchange::Detached,
    topology::sub_shapes,
    xde::{self, Document, Rgba},
};

/// Which sub-shapes inherit a node's colour, matching build123d's leaf-`Compound` handling:
/// `Part` colours its solids, `Sketch` its faces, `Curve` its edges.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum SubShapeColors {
    None,
    Solids,
    Faces,
    Edges,
}

impl SubShapeColors {
    pub fn parse(name: &str) -> Option<Self> {
        match name {
            "none" => Some(Self::None),
            "solids" => Some(Self::Solids),
            "faces" => Some(Self::Faces),
            "edges" => Some(Self::Edges),
            _ => None,
        }
    }

    fn target(self) -> Option<(TopAbs_ShapeEnum, XCAFDoc_ColorType)> {
        match self {
            Self::None => None,
            Self::Solids => {
                Some((TopAbs_ShapeEnum::TopAbs_SOLID, XCAFDoc_ColorType::XCAFDoc_ColorSurf))
            }
            Self::Faces => {
                Some((TopAbs_ShapeEnum::TopAbs_FACE, XCAFDoc_ColorType::XCAFDoc_ColorSurf))
            }
            Self::Edges => {
                Some((TopAbs_ShapeEnum::TopAbs_EDGE, XCAFDoc_ColorType::XCAFDoc_ColorCurv))
            }
        }
    }
}

/// A node on the way out to STEP.
pub struct Node {
    pub shape: Detached,
    pub label: String,
    pub color: Option<Rgba>,
    pub sub_shape_colors: SubShapeColors,
    pub children: Vec<Node>,
}

/// A node read back from STEP; `shape` already carries its component placement.
pub struct ImportedNode {
    pub shape: Detached,
    pub label: String,
    pub color: Option<Rgba>,
    pub children: Vec<ImportedNode>,
}

pub fn build(document: &mut Document, root: &Node) -> OcctResult<()> {
    add(document, root, None)?;
    document.shape_tool_mut()?.UpdateAssemblies()?;
    Ok(())
}

fn add(document: &mut Document, node: &Node, parent: Option<&TDF_Label>) -> OcctResult<()> {
    let label = match parent {
        None => {
            XCAFDoc_ShapeTool_AddShape(document.shape_tool_mut()?, node.shape.get(), false, true)?
        }
        Some(parent) => XCAFDoc_ShapeTool_AddComponent_label_shape_bool(
            document.shape_tool_mut()?,
            parent,
            node.shape.get(),
            false,
        )?,
    };
    if label.IsNull()? {
        return Ok(());
    }
    let referred = xde::referred(&label)?;
    annotate(document, node, &label, &referred)?;
    for child in &node.children {
        add(document, child, Some(&referred))?;
    }
    Ok(())
}

/// Names and colours one label. A component label only carries the instance metadata, so the
/// referred product label is annotated too — otherwise STEP loses the PRODUCT name.
fn annotate(
    document: &Document,
    node: &Node,
    label: &TDF_Label,
    referred: &TDF_Label,
) -> OcctResult<()> {
    let is_reference = XCAFDoc_ShapeTool::IsReference(label)?;
    if !node.label.is_empty() {
        xde::set_name(label, &node.label)?;
        if is_reference {
            xde::set_name(referred, &node.label)?;
        }
    }
    let Some(color) = node.color else { return Ok(()) };
    let tool = document.color_tool()?;
    xde::set_color(tool, label, color, XCAFDoc_ColorType::XCAFDoc_ColorGen)?;
    if is_reference {
        xde::set_color(tool, referred, color, XCAFDoc_ColorType::XCAFDoc_ColorGen)?;
    }
    if !node.children.is_empty() {
        return Ok(());
    }
    let Some((kind, channel)) = node.sub_shape_colors.target() else { return Ok(()) };
    for sub in sub_shapes(node.shape.get(), kind)? {
        let sub_label =
            XCAFDoc_ShapeTool_AddSubShape_label_shape(document.shape_tool()?, referred, &sub)?;
        if !sub_label.IsNull()? {
            xde::set_color(tool, &sub_label, color, channel)?;
        }
    }
    Ok(())
}

pub fn read(document: &mut Document) -> OcctResult<Vec<ImportedNode>> {
    let mut roots = TDF_LabelSequence_new()?;
    document.shape_tool()?.GetFreeShapes(roots.pin_mut())?;
    let instances: Vec<UniquePtr<TDF_Label>> = (1..=TDF_LabelSequence_length(&roots)?)
        .map(|index| {
            Ok(opencascade_sys::tdf::TDF_Label_clone(TDF_LabelSequence_value(&roots, index)?))
        })
        .collect::<OcctResult<_>>()?;
    instances.iter().map(|instance| node_of(document, instance)).collect()
}

fn node_of(document: &mut Document, instance: &TDF_Label) -> OcctResult<ImportedNode> {
    let referred = xde::referred(instance)?;
    let shape = XCAFDoc_ShapeTool_GetShape_label(&referred)?;
    let placed = TopoDS_Shape_Moved(&shape, &*XCAFDoc_ShapeTool_GetLocation(instance)?, true)?;

    let children = if XCAFDoc_ShapeTool::IsAssembly(&referred)? {
        components(document, &referred)?
    } else {
        Vec::new()
    };
    let color = match xde::color(instance)? {
        Some(color) => Some(color),
        None => match xde::color(&referred)? {
            Some(color) => Some(color),
            None => geometric_color(document, &shape)?,
        },
    };
    Ok(ImportedNode {
        shape: Detached::adopt(placed),
        label: xde::name(&referred)?,
        color,
        children,
    })
}

fn components(document: &mut Document, assembly: &TDF_Label) -> OcctResult<Vec<ImportedNode>> {
    let mut labels = TDF_LabelSequence_new()?;
    XCAFDoc_ShapeTool::GetComponents(assembly, labels.pin_mut(), false)?;
    let instances: Vec<UniquePtr<TDF_Label>> = (1..=TDF_LabelSequence_length(&labels)?)
        .map(|index| {
            Ok(opencascade_sys::tdf::TDF_Label_clone(TDF_LabelSequence_value(&labels, index)?))
        })
        .collect::<OcctResult<_>>()?;
    instances.iter().map(|instance| node_of(document, instance)).collect()
}

/// build123d's fallback when no label carries a colour: the shape's own colour, else the
/// colour of its largest face.
fn geometric_color(document: &mut Document, shape: &TopoDS_Shape) -> OcctResult<Option<Rgba>> {
    if let Some(color) = shape_color(document, shape)? {
        return Ok(Some(color));
    }
    let mut best: Option<(f64, Rgba)> = None;
    for face in sub_shapes(shape, TopAbs_ShapeEnum::TopAbs_FACE)? {
        let Some(color) = shape_color(document, &face)? else { continue };
        let mut bounds = Bnd_Box_new()?;
        BRepBndLib::Add(&face, bounds.pin_mut(), true)?;
        let extent = bounds.SquareExtent()?;
        if best.is_none_or(|(previous, _)| extent > previous) {
            best = Some((extent, color));
        }
    }
    Ok(best.map(|(_, color)| color))
}

fn shape_color(document: &mut Document, shape: &TopoDS_Shape) -> OcctResult<Option<Rgba>> {
    let mut found = Quantity_ColorRGBA_new()?;
    let mut tool = document.color_tool_mut()?;
    for channel in xde::READ_ORDER {
        if XCAFDoc_ColorTool::GetColor_shape_colortype_colorrgba(
            tool.as_mut(),
            shape,
            channel,
            found.pin_mut(),
        )? {
            return Ok(Some(xde::components(&found)?));
        }
    }
    Ok(None)
}
