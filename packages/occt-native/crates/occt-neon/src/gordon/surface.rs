//! Owning handle to a `Geom_BSplineSurface`, plus the row/column point grid the Gordon
//! construction passes around in place of `TColgp_Array2OfPnt`.

use cxx::UniquePtr;
use opencascade_sys::{
    geom::{
        Geom_BSplineSurface, Geom_BSplineSurface_Copy,
        Geom_BSplineSurface_new_array2ofpnt_array1ofreal2_array1ofinteger2_int2_bool2,
        Handle_Geom_BSplineSurface, Handle_Geom_BSplineSurface_from_Geom_Geometry,
        Handle_Geom_BSplineSurface_get, Handle_Geom_BSplineSurface_get_mut,
        Handle_Geom_BSplineSurface_to_Geom_Surface, Handle_Geom_Surface,
    },
    t_colgp::{TColgp_Array2OfPnt, TColgp_Array2OfPnt_new, TColgp_Array2OfPnt_set_value},
};

use crate::error::OcctResult;
use crate::gordon::curve::{Point, gp_point, integer_array, point_of, real_array};

/// A rectangular grid of points, indexed from zero (OCCT's `TColgp_Array2OfPnt` is indexed from
/// one; the conversion happens only where a grid crosses into OCCT).
#[derive(Clone)]
pub(crate) struct PointGrid {
    rows: usize,
    columns: usize,
    points: Vec<Point>,
}

impl PointGrid {
    pub(crate) fn new(rows: usize, columns: usize) -> Self {
        Self { rows, columns, points: vec![[0.0; 3]; rows * columns] }
    }

    pub(crate) fn rows(&self) -> usize {
        self.rows
    }

    pub(crate) fn columns(&self) -> usize {
        self.columns
    }

    pub(crate) fn at(&self, row: usize, column: usize) -> Point {
        self.points[row * self.columns + column]
    }

    pub(crate) fn set(&mut self, row: usize, column: usize, point: Point) {
        self.points[row * self.columns + column] = point;
    }

    pub(crate) fn row(&self, row: usize) -> Vec<Point> {
        (0..self.columns).map(|column| self.at(row, column)).collect()
    }

    pub(crate) fn column(&self, column: usize) -> Vec<Point> {
        (0..self.rows).map(|row| self.at(row, column)).collect()
    }

    pub(crate) fn to_array(&self) -> OcctResult<UniquePtr<TColgp_Array2OfPnt>> {
        let mut array = TColgp_Array2OfPnt_new(1, self.rows as i32, 1, self.columns as i32)?;
        for row in 0..self.rows {
            for column in 0..self.columns {
                TColgp_Array2OfPnt_set_value(
                    array.pin_mut(),
                    row as i32 + 1,
                    column as i32 + 1,
                    &*gp_point(self.at(row, column))?,
                )?;
            }
        }
        Ok(array)
    }
}

/// The parametric direction a surface operation applies to.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum Direction {
    U,
    V,
}

pub(crate) struct Surface {
    handle: UniquePtr<Handle_Geom_BSplineSurface>,
}

impl Surface {
    pub(crate) fn from_handle(handle: UniquePtr<Handle_Geom_BSplineSurface>) -> Self {
        Self { handle }
    }

    #[allow(clippy::too_many_arguments)]
    pub(crate) fn from_poles(
        poles: &PointGrid,
        u_knots: &[f64],
        v_knots: &[f64],
        u_multiplicities: &[i32],
        v_multiplicities: &[i32],
        u_degree: i32,
        v_degree: i32,
    ) -> OcctResult<Self> {
        Ok(Self::from_handle(
            Geom_BSplineSurface_new_array2ofpnt_array1ofreal2_array1ofinteger2_int2_bool2(
                &*poles.to_array()?,
                &*real_array(u_knots)?,
                &*real_array(v_knots)?,
                &*integer_array(u_multiplicities)?,
                &*integer_array(v_multiplicities)?,
                u_degree,
                v_degree,
                false,
                false,
            )?,
        ))
    }

    pub(crate) fn as_surface(&self) -> UniquePtr<Handle_Geom_Surface> {
        Handle_Geom_BSplineSurface_to_Geom_Surface(&self.handle)
    }

    fn get(&self) -> OcctResult<&Geom_BSplineSurface> {
        Ok(Handle_Geom_BSplineSurface_get(&self.handle)?)
    }

    fn get_mut(&mut self) -> OcctResult<std::pin::Pin<&mut Geom_BSplineSurface>> {
        Ok(Handle_Geom_BSplineSurface_get_mut(self.handle.pin_mut())?)
    }

    pub(crate) fn copied(&self) -> OcctResult<Self> {
        let geometry = Geom_BSplineSurface_Copy(self.get()?)?;
        Ok(Self::from_handle(Handle_Geom_BSplineSurface_from_Geom_Geometry(&geometry)))
    }

    pub(crate) fn degree(&self, direction: Direction) -> OcctResult<i32> {
        Ok(match direction {
            Direction::U => self.get()?.UDegree()?,
            Direction::V => self.get()?.VDegree()?,
        })
    }

    pub(crate) fn nb_knots(&self, direction: Direction) -> OcctResult<i32> {
        Ok(match direction {
            Direction::U => self.get()?.NbUKnots()?,
            Direction::V => self.get()?.NbVKnots()?,
        })
    }

    pub(crate) fn knot(&self, direction: Direction, index: i32) -> OcctResult<f64> {
        Ok(match direction {
            Direction::U => self.get()?.UKnot(index)?,
            Direction::V => self.get()?.VKnot(index)?,
        })
    }

    pub(crate) fn multiplicity(&self, direction: Direction, index: i32) -> OcctResult<i32> {
        Ok(match direction {
            Direction::U => self.get()?.UMultiplicity(index)?,
            Direction::V => self.get()?.VMultiplicity(index)?,
        })
    }

    pub(crate) fn nb_u_poles(&self) -> OcctResult<i32> {
        Ok(self.get()?.NbUPoles()?)
    }

    pub(crate) fn nb_v_poles(&self) -> OcctResult<i32> {
        Ok(self.get()?.NbVPoles()?)
    }

    pub(crate) fn pole(&self, u_index: i32, v_index: i32) -> OcctResult<Point> {
        point_of(self.get()?.Pole(u_index, v_index)?)
    }

    pub(crate) fn set_pole(&mut self, u_index: i32, v_index: i32, point: Point) -> OcctResult<()> {
        let point = gp_point(point)?;
        Ok(self.get_mut()?.SetPole_int2_pnt(u_index, v_index, &point)?)
    }

    pub(crate) fn exchange_uv(&mut self) -> OcctResult<()> {
        Ok(self.get_mut()?.ExchangeUV()?)
    }

    pub(crate) fn increase_degree(&mut self, u_degree: i32, v_degree: i32) -> OcctResult<()> {
        Ok(self.get_mut()?.IncreaseDegree(u_degree, v_degree)?)
    }

    pub(crate) fn insert_knots(
        &mut self,
        direction: Direction,
        knots: &[f64],
        multiplicities: &[i32],
        tolerance: f64,
    ) -> OcctResult<()> {
        let knots = real_array(knots)?;
        let multiplicities = integer_array(multiplicities)?;
        let mut surface = self.get_mut()?;
        match direction {
            Direction::U => {
                surface.as_mut().InsertUKnots(&knots, &multiplicities, tolerance, false)?
            }
            Direction::V => {
                surface.as_mut().InsertVKnots(&knots, &multiplicities, tolerance, false)?
            }
        }
        Ok(())
    }

    pub(crate) fn remove_knot(
        &mut self,
        direction: Direction,
        index: i32,
        multiplicity: i32,
        tolerance: f64,
    ) -> OcctResult<bool> {
        let mut surface = self.get_mut()?;
        Ok(match direction {
            Direction::U => surface.as_mut().RemoveUKnot(index, multiplicity, tolerance)?,
            Direction::V => surface.as_mut().RemoveVKnot(index, multiplicity, tolerance)?,
        })
    }
}
