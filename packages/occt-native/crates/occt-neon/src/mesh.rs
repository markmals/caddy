//! Tessellation, and the STL format that is nothing but tessellation.
//!
//! Port of build123d's `Shape.mesh` / `Shape.tessellate`, `exporters3d.export_stl` and
//! `importers.import_stl`.

use cxx::UniquePtr;
use neon::prelude::*;
use opencascade_sys::{
    b_rep::{BRep_Builder_new, BRep_Tool_Triangulation},
    b_rep_builder_api::BRepBuilderAPI_Copy_new_shape_bool2,
    b_rep_mesh::{
        BRepMesh_IncrementalMesh_new_shape_real_bool_real_bool,
        Handle_BRepMesh_IncrementalMesh_get_mut,
    },
    b_rep_tools::BRepTools,
    gp::gp_Pnt_Transformed,
    occt_stream::{OcctStream_from_bytes, OcctStream_new, OcctStream_to_bytes},
    poly::{
        Handle_Poly_Triangulation_get, Handle_Poly_Triangulation_get_mut, Poly_Triangulation_Node,
        Poly_Triangulation_Normal,
    },
    rw_stl::RWStl_ReadStream,
    stl_api::{StlAPI_Writer_Write_shape_stream_progressrange, StlAPI_Writer_new},
    top_abs::{TopAbs_Orientation, TopAbs_ShapeEnum},
    top_loc::TopLoc_Location_new,
    topo_ds::{
        TopoDS_Face_as_TopoDS_Shape, TopoDS_Face_new, TopoDS_Face_shape, TopoDS_Shape,
        TopoDS_Shape_clone,
    },
};

use crate::{
    builder::progress,
    error::{OcctError, OcctResult, OrThrow, code},
    exchange::{Detached, bytes_promise, promise, shape_promise},
    shape::{ShapeCell, get, owned},
    topology::sub_shapes,
};

/// build123d's `export_stl` defaults; also what `Shape.tessellate` uses.
pub struct MeshOptions {
    pub tolerance: f64,
    pub angular_tolerance: f64,
}

/// Flat triangle soup, ready for a GPU buffer: three floats per vertex, three indices per face.
pub struct Triangles {
    pub positions: Vec<f64>,
    pub normals: Vec<f64>,
    pub indices: Vec<u32>,
}

/// Attaches a triangulation to every face, skipping shapes OCCT already meshed finely enough.
pub fn triangulate(shape: &TopoDS_Shape, options: &MeshOptions) -> OcctResult<()> {
    if BRepTools::Triangulation(shape, options.tolerance, false)? {
        return Ok(());
    }
    let mut mesh = BRepMesh_IncrementalMesh_new_shape_real_bool_real_bool(
        shape,
        options.tolerance,
        true,
        options.angular_tolerance,
        true,
    )?;
    Handle_BRepMesh_IncrementalMesh_get_mut(mesh.pin_mut())?.Perform(&*progress()?)?;
    Ok(())
}

pub fn tessellate(shape: &TopoDS_Shape, options: &MeshOptions) -> OcctResult<Triangles> {
    triangulate(shape, options)?;
    let mut result = Triangles { positions: Vec::new(), normals: Vec::new(), indices: Vec::new() };
    for face in sub_shapes(shape, TopAbs_ShapeEnum::TopAbs_FACE)? {
        append_face(&mut result, &face)?;
    }
    Ok(result)
}

fn append_face(result: &mut Triangles, face: &TopoDS_Shape) -> OcctResult<()> {
    let mut location = TopLoc_Location_new()?;
    let mut handle = BRep_Tool_Triangulation(TopoDS_Face_shape(face)?, location.pin_mut(), 0)?;
    if handle.is_null() {
        return Ok(());
    }
    if !Handle_Poly_Triangulation_get(&handle)?.HasNormals()? {
        Handle_Poly_Triangulation_get_mut(handle.pin_mut())?.ComputeNormals()?;
    }

    let mesh = Handle_Poly_Triangulation_get(&handle)?;
    let transform = location.Transformation()?;
    let rotation = transform.HVectorialPart()?;
    let reversed = face.Orientation()? == TopAbs_Orientation::TopAbs_REVERSED;
    let flip = if reversed { -1.0 } else { 1.0 };
    let offset = u32::try_from(result.positions.len() / 3)
        .map_err(|_| OcctError::failed("mesh has more than 2^32 vertices"))?;

    for index in 1..=mesh.NbNodes()? {
        let placed = gp_Pnt_Transformed(&*Poly_Triangulation_Node(mesh, index)?, transform)?;
        result.positions.extend([placed.X()?, placed.Y()?, placed.Z()?]);
        let normal = Poly_Triangulation_Normal(mesh, index)?;
        let (x, y, z) = (normal.X()?, normal.Y()?, normal.Z()?);
        for row in 1..=3 {
            let rotated = *rotation.Value(row, 1)? * x
                + *rotation.Value(row, 2)? * y
                + *rotation.Value(row, 3)? * z;
            result.normals.push(rotated * flip);
        }
    }
    for index in 1..=mesh.NbTriangles()? {
        let triangle = mesh.Triangle(index)?;
        let (first, second, third) = (triangle.Value(1)?, triangle.Value(2)?, triangle.Value(3)?);
        let corners = if reversed { [first, third, second] } else { [first, second, third] };
        result.indices.extend(corners.map(|corner| offset + corner as u32 - 1));
    }
    Ok(())
}

pub fn write_stl(shape: &TopoDS_Shape, options: &MeshOptions, ascii: bool) -> OcctResult<Vec<u8>> {
    triangulate(shape, options)?;
    let mut writer = StlAPI_Writer_new()?;
    *writer.pin_mut().ASCIIMode()? = ascii;
    let mut stream = OcctStream_new();
    let written = StlAPI_Writer_Write_shape_stream_progressrange(
        writer.pin_mut(),
        shape,
        stream.pin_mut(),
        &*progress()?,
    )?;
    if !written {
        return Err(OcctError::new(
            code::EXPORT_FAILED,
            "STL write failed: the shape has no triangulated faces",
        ));
    }
    Ok(OcctStream_to_bytes(&stream))
}

/// A single face carrying the STL triangulation, matching build123d's `import_stl`.
pub fn read_stl(bytes: &[u8]) -> OcctResult<UniquePtr<TopoDS_Shape>> {
    let mut stream = OcctStream_from_bytes(bytes);
    let mesh = RWStl_ReadStream(stream.pin_mut(), std::f64::consts::FRAC_PI_2, &*progress()?)?;
    if mesh.is_null() || Handle_Poly_Triangulation_get(&mesh)?.NbTriangles()? == 0 {
        return Err(OcctError::new(code::IMPORT_FAILED, "STL data contains no triangles"));
    }
    let mut face = TopoDS_Face_new()?;
    BRep_Builder_new()?.MakeFace_face_htriangulation(face.pin_mut(), &mesh)?;
    Ok(TopoDS_Shape_clone(TopoDS_Face_as_TopoDS_Shape(&face)))
}

#[neon::export(name = "stlWrite")]
fn stl_write<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    tolerance: f64,
    angular_tolerance: f64,
    ascii: bool,
) -> JsResult<'cx, JsPromise> {
    let shape = detach_meshed(shape).or_raise(cx)?;
    let options = MeshOptions { tolerance, angular_tolerance };
    bytes_promise(cx, move || write_stl(shape.get(), &options, ascii))
}

#[neon::export(name = "stlRead")]
fn stl_read<'cx>(cx: &mut Cx<'cx>, bytes: Vec<u8>) -> JsResult<'cx, JsPromise> {
    shape_promise(cx, move || read_stl(&bytes))
}

/// `detach` keeping the triangulation, so a shape `shapeMesh` has meshed is reused rather than
/// re-meshed — build123d's `Shape.mesh` leaves its triangulation on the shape for later calls.
fn detach_meshed(cell: &ShapeCell) -> OcctResult<Detached> {
    let shape = get(cell)?;
    let mut copy = BRepBuilderAPI_Copy_new_shape_bool2(&shape, true, true)?;
    Ok(Detached::adopt(owned(copy.pin_mut().Shape()?)))
}

#[neon::export(name = "shapeMesh")]
fn shape_mesh<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    tolerance: f64,
    angular_tolerance: f64,
) -> JsResult<'cx, JsPromise> {
    let shape = detach_meshed(shape).or_raise(cx)?;
    let options = MeshOptions { tolerance, angular_tolerance };
    shape_promise(cx, move || {
        triangulate(shape.get(), &options)?;
        Ok(shape.into_inner())
    })
}

#[neon::export(name = "shapeTessellate")]
fn shape_tessellate<'cx>(
    cx: &mut Cx<'cx>,
    shape: &ShapeCell,
    tolerance: f64,
    angular_tolerance: f64,
) -> JsResult<'cx, JsPromise> {
    let shape = detach_meshed(shape).or_raise(cx)?;
    let options = MeshOptions { tolerance, angular_tolerance };
    promise(
        cx,
        move || tessellate(shape.get(), &options),
        |cx, triangles| {
            let object = cx.empty_object();
            let positions = JsFloat64Array::from_slice(cx, &triangles.positions)?;
            object.prop(cx, "positions").set(positions)?;
            let normals = JsFloat64Array::from_slice(cx, &triangles.normals)?;
            object.prop(cx, "normals").set(normals)?;
            let indices = JsUint32Array::from_slice(cx, &triangles.indices)?;
            object.prop(cx, "indices").set(indices)?;
            Ok(object)
        },
    )
}
