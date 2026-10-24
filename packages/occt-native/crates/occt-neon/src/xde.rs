//! XDE documents: the shape / name / colour graph that STEP carries.
//!
//! An `XCAFDoc` document is the only route to STEP names and colours; `STEPControl_Writer`
//! alone writes bare geometry. This module owns the document and the label-level accessors;
//! `assembly` turns a Caddy shape tree into one and back.

use std::pin::Pin;

use cxx::UniquePtr;
use opencascade_sys::{
    occt_stream::{OcctStream_new, OcctStream_to_bytes},
    quantity::{
        Quantity_Color, Quantity_ColorRGBA, Quantity_ColorRGBA_new, Quantity_ColorRGBA_new_float4,
    },
    t_collection::{TCollection_ExtendedString_Print, TCollection_ExtendedString_new_str_bool},
    t_data_std::{
        Handle_TDataStd_Name_from_TDF_Attribute, Handle_TDataStd_Name_get, TDataStd_Name_GetID,
        TDataStd_Name_Set_label_extendedstring,
    },
    t_doc_std::{
        Handle_TDocStd_Document, Handle_TDocStd_Document_get, TDocStd_Document_Main,
        TDocStd_Document_new_extendedstring,
    },
    tdf::{Handle_TDF_Attribute_null, TDF_Label, TDF_Label_clone, TDF_Label_new},
    xcaf_app::{Handle_XCAFApp_Application_get_mut, XCAFApp_Application_GetApplication},
    xcaf_doc::{
        Handle_XCAFDoc_ColorTool, Handle_XCAFDoc_ColorTool_get, Handle_XCAFDoc_ColorTool_get_mut,
        Handle_XCAFDoc_ShapeTool, Handle_XCAFDoc_ShapeTool_get, Handle_XCAFDoc_ShapeTool_get_mut,
        XCAFDoc_ColorTool, XCAFDoc_ColorType, XCAFDoc_DocumentTool, XCAFDoc_DocumentTool_ColorTool,
        XCAFDoc_DocumentTool_ShapeTool, XCAFDoc_ShapeTool,
    },
};

use crate::error::{OcctError, OcctResult};

/// RGBA in 0..1, matching build123d's `Color.to_tuple()`.
pub type Rgba = [f64; 4];

/// The colour channels XCAF stores, in the order build123d's importer reads them.
pub const READ_ORDER: [XCAFDoc_ColorType; 3] = [
    XCAFDoc_ColorType::XCAFDoc_ColorCurv,
    XCAFDoc_ColorType::XCAFDoc_ColorGen,
    XCAFDoc_ColorType::XCAFDoc_ColorSurf,
];

pub struct Document {
    handle: UniquePtr<Handle_TDocStd_Document>,
    shapes: UniquePtr<Handle_XCAFDoc_ShapeTool>,
    colors: UniquePtr<Handle_XCAFDoc_ColorTool>,
}

impl Document {
    /// A fresh XCAF document whose length unit is `length_unit_meters` metres per model unit.
    ///
    /// `auto_naming` lets `XCAFDoc_ShapeTool` invent `COMPOUND`/`SOLID` names for labels we do
    /// not name ourselves; build123d enables it for STEP so every product gets a name.
    pub fn new(auto_naming: bool) -> OcctResult<Self> {
        let storage = TCollection_ExtendedString_new_str_bool("XmlOcaf", true)?;
        let format = TCollection_ExtendedString_new_str_bool("MDTV-XCAF", true)?;
        let mut handle = TDocStd_Document_new_extendedstring(&storage)?;
        let mut application = XCAFApp_Application_GetApplication()?;
        Handle_XCAFApp_Application_get_mut(application.pin_mut())?
            .NewDocument(&format, handle.pin_mut())?;

        let main = TDocStd_Document_Main(Handle_TDocStd_Document_get(&handle)?)?;
        let shapes = XCAFDoc_DocumentTool_ShapeTool(&main)?;
        let colors = XCAFDoc_DocumentTool_ColorTool(&main)?;
        XCAFDoc_ShapeTool::SetAutoNaming(auto_naming)?;
        Ok(Self { handle, shapes, colors })
    }

    pub fn handle(&self) -> &Handle_TDocStd_Document {
        &self.handle
    }

    pub fn set_length_unit(&self, meters_per_unit: f64) -> OcctResult<()> {
        XCAFDoc_DocumentTool::SetLengthUnit(&self.handle, meters_per_unit)?;
        Ok(())
    }

    pub fn shape_tool(&self) -> OcctResult<&XCAFDoc_ShapeTool> {
        Ok(Handle_XCAFDoc_ShapeTool_get(&self.shapes)?)
    }

    pub fn shape_tool_mut(&mut self) -> OcctResult<Pin<&mut XCAFDoc_ShapeTool>> {
        Ok(Handle_XCAFDoc_ShapeTool_get_mut(self.shapes.pin_mut())?)
    }

    pub fn color_tool(&self) -> OcctResult<&XCAFDoc_ColorTool> {
        Ok(Handle_XCAFDoc_ColorTool_get(&self.colors)?)
    }

    pub fn color_tool_mut(&mut self) -> OcctResult<Pin<&mut XCAFDoc_ColorTool>> {
        Ok(Handle_XCAFDoc_ColorTool_get_mut(self.colors.pin_mut())?)
    }
}

/// The label a component refers to, or `label` itself when it is not a reference.
pub fn referred(label: &TDF_Label) -> OcctResult<UniquePtr<TDF_Label>> {
    if label.IsNull()? || !XCAFDoc_ShapeTool::IsReference(label)? {
        return Ok(TDF_Label_clone(label));
    }
    let mut target = TDF_Label_new()?;
    if XCAFDoc_ShapeTool::GetReferredShape(label, target.pin_mut())? && !target.IsNull()? {
        return Ok(target);
    }
    Ok(TDF_Label_clone(label))
}

pub fn set_name(label: &TDF_Label, name: &str) -> OcctResult<()> {
    let text = TCollection_ExtendedString_new_str_bool(name, true)?;
    TDataStd_Name_Set_label_extendedstring(label, &text)?;
    Ok(())
}

/// The `TDataStd_Name` on `label`, cleaned the way build123d's `import_step` cleans it:
/// control characters dropped, then `` .() `` folded to underscores.
pub fn name(label: &TDF_Label) -> OcctResult<String> {
    let guid = TDataStd_Name_GetID()?;
    if !label.IsAttribute(&guid)? {
        return Ok(String::new());
    }
    let mut attribute = Handle_TDF_Attribute_null();
    if !label.FindAttribute_guid_hattribute(&guid, attribute.pin_mut())? {
        return Ok(String::new());
    }
    let named = Handle_TDataStd_Name_from_TDF_Attribute(&attribute);
    if named.is_null() {
        return Ok(String::new());
    }
    let mut stream = OcctStream_new();
    TCollection_ExtendedString_Print(Handle_TDataStd_Name_get(&named)?.Get()?, stream.pin_mut())?;
    let raw = String::from_utf8(OcctStream_to_bytes(&stream))
        .map_err(|error| OcctError::failed(format!("STEP name is not valid UTF-8: {error}")))?;
    Ok(clean_name(&raw))
}

pub fn set_color(
    tool: &XCAFDoc_ColorTool,
    label: &TDF_Label,
    color: Rgba,
    channel: XCAFDoc_ColorType,
) -> OcctResult<()> {
    tool.SetColor_label_colorrgba_colortype(label, &*rgba(color)?, channel)?;
    Ok(())
}

/// The colour on `label`, searching XCAF's channels in build123d's order.
pub fn color(label: &TDF_Label) -> OcctResult<Option<Rgba>> {
    if label.IsNull()? {
        return Ok(None);
    }
    let mut found = Quantity_ColorRGBA_new()?;
    for channel in READ_ORDER {
        if XCAFDoc_ColorTool::GetColor_label_colortype_colorrgba(label, channel, found.pin_mut())? {
            return Ok(Some(components(&found)?));
        }
    }
    Ok(None)
}

/// Caddy and build123d both speak sRGB channels; `Quantity_Color` stores linear RGB.
fn rgba(color: Rgba) -> OcctResult<UniquePtr<Quantity_ColorRGBA>> {
    let [red, green, blue, alpha] = color;
    let linear = |srgb: f64| Quantity_Color::Convert_sRGB_To_LinearRGB_real(srgb);
    Ok(Quantity_ColorRGBA_new_float4(
        linear(red)? as f32,
        linear(green)? as f32,
        linear(blue)? as f32,
        alpha as f32,
    )?)
}

/// `Quantity_ColorRGBA`'s float constructor takes sRGB and stores linear RGB, so reading a
/// colour has to convert back — otherwise a round trip darkens every channel.
pub fn components(color: &Quantity_ColorRGBA) -> OcctResult<Rgba> {
    let rgb = color.GetRGB()?;
    let srgb = |linear: f64| Quantity_Color::Convert_LinearRGB_To_sRGB_real(linear);
    Ok([srgb(rgb.Red()?)?, srgb(rgb.Green()?)?, srgb(rgb.Blue()?)?, f64::from(color.Alpha()?)])
}

fn clean_name(raw: &str) -> String {
    raw.chars()
        .filter(|character| !character.is_control())
        .map(|character| if " .()".contains(character) { '_' } else { character })
        .collect()
}
