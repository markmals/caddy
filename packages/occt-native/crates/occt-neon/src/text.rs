//! Fonts and text rendered to BREP geometry.
//!
//! OCCT's font registry (`Font_FontMgr`) is a process-wide singleton holding the fonts FreeType
//! can open, so registration here is visible to every later `textShape` call on the same thread.
//! Glyphs are built by `StdPrs_BRepFont` and laid out by `StdPrs_BRepTextBuilder`, which is how
//! build123d's `Compound.make_text` reaches OCCT (`Font_BRepTextBuilder` is the old name of the
//! same class).

use cxx::UniquePtr;
use neon::prelude::*;
use opencascade_sys::{
    font::{
        Font_FontAspect, Font_FontMgr_AddFontAlias, Font_FontMgr_CheckFont,
        Font_FontMgr_FindFont_str_fontaspect, Font_FontMgr_GetAvailableFonts,
        Font_FontMgr_GetInstance, Font_NListOfSystemFont_size, Font_NListOfSystemFont_value,
        Font_StrictLevel, Font_SystemFont_FontName, Font_SystemFont_FontPath,
        Font_SystemFont_SetFontPath, Font_SystemFont_new_str, Handle_Font_FontMgr,
        Handle_Font_FontMgr_get, Handle_Font_FontMgr_get_mut, Handle_Font_SystemFont_get,
        Handle_Font_SystemFont_get_mut, Handle_Font_SystemFont_is_null,
    },
    gp::gp_Ax3_new,
    graphic3d::{Graphic3d_HorizontalTextAlignment, Graphic3d_VerticalTextAlignment},
    std_prs::{
        Handle_StdPrs_BRepFont_get_mut, StdPrs_BRepFont_new_str_fontaspect_real_strictlevel,
        StdPrs_BRepTextBuilder_Perform, StdPrs_BRepTextBuilder_new,
    },
    t_col_std::{
        TColStd_SequenceOfHAsciiString_length, TColStd_SequenceOfHAsciiString_new,
        TColStd_SequenceOfHAsciiString_value,
    },
    t_collection::{Handle_TCollection_HAsciiString_get, TCollection_HAsciiString_ToCString},
};

use crate::{
    error::{OcctError, OcctResult, OrThrow, attempt},
    shape::{ShapeResult, boxed},
};

/// The four aspects OCCT keeps a separate font file for, in `Font_FontAspect` order.
const ASPECTS: [Font_FontAspect; 4] = [
    Font_FontAspect::Font_FontAspect_Regular,
    Font_FontAspect::Font_FontAspect_Bold,
    Font_FontAspect::Font_FontAspect_Italic,
    Font_FontAspect::Font_FontAspect_BoldItalic,
];

/// What a registered font offers, read once so the handles stay on this thread.
struct FontEntry {
    name: String,
    /// Whether a font file is registered for each of `ASPECTS`.
    aspects: [bool; 4],
    single_stroke: bool,
}

/// The process-wide registry (`Font_FontMgr::GetInstance`).
fn manager() -> OcctResult<UniquePtr<Handle_Font_FontMgr>> {
    Ok(Font_FontMgr_GetInstance()?)
}

fn aspect(value: f64) -> OcctResult<Font_FontAspect> {
    ASPECTS
        .get(value as usize)
        .copied()
        .filter(|_| value >= 0.0 && value.fract() == 0.0)
        .ok_or_else(|| OcctError::invalid(format!("unknown font aspect {value}")))
}

fn horizontal(value: f64) -> OcctResult<Graphic3d_HorizontalTextAlignment> {
    match value as i32 {
        0 => Ok(Graphic3d_HorizontalTextAlignment::Graphic3d_HTA_LEFT),
        1 => Ok(Graphic3d_HorizontalTextAlignment::Graphic3d_HTA_CENTER),
        2 => Ok(Graphic3d_HorizontalTextAlignment::Graphic3d_HTA_RIGHT),
        _ => Err(OcctError::invalid(format!("unknown horizontal text alignment {value}"))),
    }
}

fn vertical(value: f64) -> OcctResult<Graphic3d_VerticalTextAlignment> {
    match value as i32 {
        0 => Ok(Graphic3d_VerticalTextAlignment::Graphic3d_VTA_BOTTOM),
        1 => Ok(Graphic3d_VerticalTextAlignment::Graphic3d_VTA_CENTER),
        2 => Ok(Graphic3d_VerticalTextAlignment::Graphic3d_VTA_TOP),
        3 => Ok(Graphic3d_VerticalTextAlignment::Graphic3d_VTA_TOPFIRSTLINE),
        _ => Err(OcctError::invalid(format!("unknown vertical text alignment {value}"))),
    }
}

/// Every font the registry knows, with the aspects it has files for.
#[neon::export(name = "fontRegisteredFonts")]
fn registered_fonts<'cx>(cx: &mut Cx<'cx>) -> JsResult<'cx, JsArray> {
    let fonts = attempt(|| {
        let handle = manager()?;
        let manager = Handle_Font_FontMgr_get(&handle)?;
        let list = Font_FontMgr_GetAvailableFonts(manager)?;
        let mut fonts = Vec::with_capacity(Font_NListOfSystemFont_size(&list)? as usize);
        for index in 0..Font_NListOfSystemFont_size(&list)? {
            let font = Handle_Font_SystemFont_get(Font_NListOfSystemFont_value(&list, index)?)?;
            let mut aspects = [false; 4];
            for (slot, kind) in aspects.iter_mut().zip(ASPECTS) {
                *slot = font.HasFontAspect(kind)?;
            }
            fonts.push(FontEntry {
                name: Font_SystemFont_FontName(font)?,
                aspects,
                single_stroke: font.IsSingleStrokeFont()?,
            });
        }
        Ok(fonts)
    })
    .or_raise(cx)?;

    let array = cx.empty_array();
    for (index, font) in fonts.into_iter().enumerate() {
        let object = cx.empty_object();
        object.prop(cx, "name").set(font.name)?;
        for (present, key) in
            font.aspects.into_iter().zip(["regular", "bold", "italic", "boldItalic"])
        {
            object.prop(cx, key).set(present)?;
        }
        object.prop(cx, "singleStroke").set(font.single_stroke)?;
        array.prop(cx, index as u32).set(object)?;
    }
    Ok(array)
}

/// Font names that have aliases registered (`Font_FontMgr::GetAllAliases`).
#[neon::export(name = "fontAliases")]
fn font_aliases<'cx>(cx: &mut Cx<'cx>) -> JsResult<'cx, JsArray> {
    let names = attempt(|| {
        let handle = manager()?;
        let manager = Handle_Font_FontMgr_get(&handle)?;
        let mut aliases = TColStd_SequenceOfHAsciiString_new()?;
        manager.GetAllAliases(aliases.pin_mut())?;
        let count = TColStd_SequenceOfHAsciiString_length(&aliases)?;
        let mut names = Vec::with_capacity(count as usize);
        for index in 1..=count {
            let alias = TColStd_SequenceOfHAsciiString_value(&aliases, index)?;
            names.push(TCollection_HAsciiString_ToCString(Handle_TCollection_HAsciiString_get(
                alias,
            )?)?);
        }
        Ok(names)
    })
    .or_raise(cx)?;

    let array = cx.empty_array();
    for (index, name) in names.into_iter().enumerate() {
        array.prop(cx, index as u32).set(name)?;
    }
    Ok(array)
}

/// Registers `alias` as another name for `fontName`; false when the alias already existed.
#[neon::export(name = "fontAddAlias")]
fn font_add_alias<'cx>(cx: &mut Cx<'cx>, alias: String, font_name: String) -> NeonResult<bool> {
    attempt(|| {
        let mut handle = manager()?;
        let manager = Handle_Font_FontMgr_get_mut(handle.pin_mut())?;
        Ok(Font_FontMgr_AddFontAlias(manager, &alias, &font_name)?)
    })
    .or_raise(cx)
}

/// Whether FreeType can open `path` as a font file (`Font_FontMgr::CheckFont`).
#[neon::export(name = "fontCheckFile")]
fn font_check_file<'cx>(cx: &mut Cx<'cx>, path: String) -> NeonResult<bool> {
    attempt(|| {
        let handle = manager()?;
        let manager = Handle_Font_FontMgr_get(&handle)?;
        let font = Font_FontMgr_CheckFont(manager, &path)?;
        Ok(!Handle_Font_SystemFont_is_null(&font))
    })
    .or_raise(cx)
}

/// Registers one font face: `name` served from `path` (face `faceId` inside the file) for
/// `aspect`. Returns false when an entry for the same name and aspect kept its own path.
#[neon::export(name = "fontRegister")]
fn font_register<'cx>(
    cx: &mut Cx<'cx>,
    name: String,
    aspect_index: f64,
    path: String,
    face_id: f64,
    single_stroke: bool,
    override_existing: bool,
) -> NeonResult<bool> {
    attempt(|| {
        let kind = aspect(aspect_index)?;
        let mut font = Font_SystemFont_new_str(&name)?;
        {
            let entry = Handle_Font_SystemFont_get_mut(font.pin_mut())?;
            Font_SystemFont_SetFontPath(entry, kind, &path, face_id as i32)?;
        }
        {
            let entry = Handle_Font_SystemFont_get_mut(font.pin_mut())?;
            entry.SetSingleStrokeFont(single_stroke)?;
        }
        let mut handle = manager()?;
        let manager = Handle_Font_FontMgr_get_mut(handle.pin_mut())?;
        Ok(manager.RegisterFont(&font, override_existing)?)
    })
    .or_raise(cx)
}

/// Resolves `name` (a font name or an alias) and `aspect` to a registered font: `{ name, path,
/// faceId, singleStroke }`, or null when the registry has nothing to offer.
#[neon::export(name = "fontFind")]
fn font_find<'cx>(cx: &mut Cx<'cx>, name: String, aspect_index: f64) -> JsResult<'cx, JsValue> {
    let found = attempt(|| {
        let requested = aspect(aspect_index)?;
        // FindFont rewrites the aspect when an alias points at another style, but the file a
        // caller gets told about is the one for the aspect it asked for.
        let mut resolved = requested;
        let handle = manager()?;
        let manager = Handle_Font_FontMgr_get(&handle)?;
        let font = Font_FontMgr_FindFont_str_fontaspect(manager, &name, &mut resolved)?;
        if Handle_Font_SystemFont_is_null(&font) {
            return Ok(None);
        }
        let font = Handle_Font_SystemFont_get(&font)?;
        Ok(Some((
            Font_SystemFont_FontName(font)?,
            Font_SystemFont_FontPath(font, requested)?,
            font.FontFaceId(requested)?,
            font.IsSingleStrokeFont()?,
        )))
    })
    .or_raise(cx)?;

    let Some((name, path, face_id, single_stroke)) = found else { return Ok(cx.null().upcast()) };
    let object = cx.empty_object();
    object.prop(cx, "name").set(name)?;
    object.prop(cx, "path").set(path)?;
    object.prop(cx, "faceId").set(f64::from(face_id))?;
    object.prop(cx, "singleStroke").set(single_stroke)?;
    Ok(object.upcast())
}

/// Renders `text` as a compound of glyph shapes, aligned about the origin.
///
/// The font is found by name through the registry, so `fontName` must be registered (or be an
/// alias); `aspect` selects which file of that font OCCT opens, synthesising an oblique when an
/// italic aspect has no file of its own. `compositeCurveMode` false keeps every glyph segment a
/// separate edge, which is what single-stroke fonts need.
#[neon::export(name = "textShape")]
#[allow(clippy::too_many_arguments)]
fn text_shape<'cx>(
    cx: &mut Cx<'cx>,
    text: String,
    font_name: String,
    aspect_index: f64,
    size: f64,
    horizontal_align: f64,
    vertical_align: f64,
    composite_curve_mode: bool,
) -> ShapeResult {
    attempt(|| {
        if size.is_nan() || size <= 0.0 {
            return Err(OcctError::invalid(format!("font size must be positive, got {size}")));
        }
        let kind = aspect(aspect_index)?;
        let h_align = horizontal(horizontal_align)?;
        let v_align = vertical(vertical_align)?;
        let mut font = StdPrs_BRepFont_new_str_fontaspect_real_strictlevel(
            &font_name,
            kind,
            size,
            Font_StrictLevel::Font_StrictLevel_Any,
        )?;
        {
            let brep_font = Handle_StdPrs_BRepFont_get_mut(font.pin_mut())?;
            if !composite_curve_mode {
                brep_font.SetCompositeCurveMode(false)?;
            }
        }
        let mut builder = StdPrs_BRepTextBuilder_new()?;
        let pen = gp_Ax3_new()?;
        let shape = StdPrs_BRepTextBuilder_Perform(
            builder.pin_mut(),
            Handle_StdPrs_BRepFont_get_mut(font.pin_mut())?,
            &text,
            &pen,
            h_align,
            v_align,
        )?;
        boxed(shape)
    })
    .or_raise(cx)
}
