//! Owning handle to a `Geom_BSplineCurve` with the accessors and mutators the Gordon port needs.
//!
//! ocp_gordon mutates curve handles in place (`Segment`, `SetKnots`, `IncreaseDegree`, ...), so
//! this type keeps the OCCT handle rather than a Rust-side copy of the poles: every evaluation and
//! every knot operation is the same OCCT call the Python reference makes.

use std::pin::Pin;

use cxx::UniquePtr;
use opencascade_sys::{
    convert::Convert_ParameterisationType,
    geom::{
        Geom_BSplineCurve, Geom_BSplineCurve_Copy, Geom_BSplineCurve_DN, Geom_BSplineCurve_EvalD0,
        Geom_BSplineCurve_new_array1ofpnt_array1ofreal_array1ofinteger_int_bool,
        Geom_TrimmedCurve_new_hcurve_real2_bool2, Handle_Geom_BSplineCurve,
        Handle_Geom_BSplineCurve_from_Geom_Geometry, Handle_Geom_BSplineCurve_get,
        Handle_Geom_BSplineCurve_get_mut, Handle_Geom_BSplineCurve_to_Geom_Curve,
        Handle_Geom_Curve, Handle_Geom_TrimmedCurve_to_Geom_Curve,
    },
    geom_convert::GeomConvert_CurveToBSplineCurve,
    gp::{gp_Pnt, gp_Pnt_new_real3, gp_Vec, gp_Vec_new_real3},
    precision::Precision,
    t_col_std::{
        TColStd_Array1OfInteger, TColStd_Array1OfInteger_new, TColStd_Array1OfInteger_set_value,
        TColStd_Array1OfReal, TColStd_Array1OfReal_new, TColStd_Array1OfReal_set_value,
    },
    t_colgp::{TColgp_Array1OfPnt, TColgp_Array1OfPnt_new, TColgp_Array1OfPnt_set_value},
};

use crate::error::OcctResult;

/// A point as the Gordon port passes it around: OCCT's `gp_Pnt` without the allocation.
pub(crate) type Point = [f64; 3];

pub(crate) fn point_of(point: &gp_Pnt) -> OcctResult<Point> {
    Ok([point.X()?, point.Y()?, point.Z()?])
}

pub(crate) fn vector_of(vector: &gp_Vec) -> OcctResult<Point> {
    Ok([vector.X()?, vector.Y()?, vector.Z()?])
}

pub(crate) fn gp_point(point: Point) -> OcctResult<UniquePtr<gp_Pnt>> {
    Ok(gp_Pnt_new_real3(point[0], point[1], point[2])?)
}

pub(crate) fn dot(first: Point, second: Point) -> f64 {
    first[0] * second[0] + first[1] * second[1] + first[2] * second[2]
}

pub(crate) fn difference(first: Point, second: Point) -> Point {
    [first[0] - second[0], first[1] - second[1], first[2] - second[2]]
}

pub(crate) fn distance(first: Point, second: Point) -> f64 {
    square_distance(first, second).sqrt()
}

pub(crate) fn square_distance(first: Point, second: Point) -> f64 {
    let difference = difference(first, second);
    dot(difference, difference)
}

pub(crate) fn real_array(values: &[f64]) -> OcctResult<UniquePtr<TColStd_Array1OfReal>> {
    let mut array = TColStd_Array1OfReal_new(1, values.len() as i32)?;
    for (index, value) in values.iter().enumerate() {
        TColStd_Array1OfReal_set_value(array.pin_mut(), index as i32 + 1, *value)?;
    }
    Ok(array)
}

pub(crate) fn integer_array(values: &[i32]) -> OcctResult<UniquePtr<TColStd_Array1OfInteger>> {
    let mut array = TColStd_Array1OfInteger_new(1, values.len() as i32)?;
    for (index, value) in values.iter().enumerate() {
        TColStd_Array1OfInteger_set_value(array.pin_mut(), index as i32 + 1, *value)?;
    }
    Ok(array)
}

pub(crate) fn point_array(points: &[Point]) -> OcctResult<UniquePtr<TColgp_Array1OfPnt>> {
    let mut array = TColgp_Array1OfPnt_new(1, points.len() as i32)?;
    for (index, point) in points.iter().enumerate() {
        TColgp_Array1OfPnt_set_value(array.pin_mut(), index as i32 + 1, &*gp_point(*point)?)?;
    }
    Ok(array)
}

pub(crate) struct Curve {
    handle: UniquePtr<Handle_Geom_BSplineCurve>,
}

impl Curve {
    pub(crate) fn from_handle(handle: UniquePtr<Handle_Geom_BSplineCurve>) -> Self {
        Self { handle }
    }

    /// `GeomConvert::CurveToBSplineCurve` with OCCT's default parameterisation, as ocp_gordon uses.
    pub(crate) fn from_curve(curve: &Handle_Geom_Curve) -> OcctResult<Self> {
        Ok(Self::from_handle(GeomConvert_CurveToBSplineCurve(
            curve,
            Convert_ParameterisationType::Convert_TgtThetaOver2,
        )?))
    }

    pub(crate) fn as_curve(&self) -> UniquePtr<Handle_Geom_Curve> {
        Handle_Geom_BSplineCurve_to_Geom_Curve(&self.handle)
    }

    fn get(&self) -> OcctResult<&Geom_BSplineCurve> {
        Ok(Handle_Geom_BSplineCurve_get(&self.handle)?)
    }

    fn get_mut(&mut self) -> OcctResult<Pin<&mut Geom_BSplineCurve>> {
        Ok(Handle_Geom_BSplineCurve_get_mut(self.handle.pin_mut())?)
    }

    pub(crate) fn copied(&self) -> OcctResult<Self> {
        let geometry = Geom_BSplineCurve_Copy(self.get()?)?;
        Ok(Self::from_handle(Handle_Geom_BSplineCurve_from_Geom_Geometry(&geometry)))
    }

    pub(crate) fn from_poles(
        poles: &[Point],
        knots: &[f64],
        multiplicities: &[i32],
        degree: i32,
        periodic: bool,
    ) -> OcctResult<Self> {
        Ok(Self::from_handle(
            Geom_BSplineCurve_new_array1ofpnt_array1ofreal_array1ofinteger_int_bool(
                &*point_array(poles)?,
                &*real_array(knots)?,
                &*integer_array(multiplicities)?,
                degree,
                periodic,
            )?,
        ))
    }

    pub(crate) fn degree(&self) -> OcctResult<i32> {
        Ok(self.get()?.Degree()?)
    }

    pub(crate) fn nb_poles(&self) -> OcctResult<i32> {
        Ok(self.get()?.NbPoles()?)
    }

    pub(crate) fn pole(&self, index: i32) -> OcctResult<Point> {
        point_of(self.get()?.Pole(index)?)
    }

    pub(crate) fn poles(&self) -> OcctResult<Vec<Point>> {
        (1..=self.nb_poles()?).map(|index| self.pole(index)).collect()
    }

    pub(crate) fn nb_knots(&self) -> OcctResult<i32> {
        Ok(self.get()?.NbKnots()?)
    }

    pub(crate) fn knot(&self, index: i32) -> OcctResult<f64> {
        Ok(self.get()?.Knot(index)?)
    }

    pub(crate) fn knots(&self) -> OcctResult<Vec<f64>> {
        (1..=self.nb_knots()?).map(|index| self.knot(index)).collect()
    }

    pub(crate) fn multiplicity(&self, index: i32) -> OcctResult<i32> {
        Ok(self.get()?.Multiplicity(index)?)
    }

    pub(crate) fn multiplicities(&self) -> OcctResult<Vec<i32>> {
        (1..=self.nb_knots()?).map(|index| self.multiplicity(index)).collect()
    }

    pub(crate) fn first_parameter(&self) -> OcctResult<f64> {
        Ok(self.get()?.FirstParameter()?)
    }

    pub(crate) fn last_parameter(&self) -> OcctResult<f64> {
        Ok(self.get()?.LastParameter()?)
    }

    pub(crate) fn is_closed(&self) -> OcctResult<bool> {
        Ok(self.get()?.IsClosed()?)
    }

    pub(crate) fn is_periodic(&self) -> OcctResult<bool> {
        Ok(self.get()?.IsPeriodic()?)
    }

    pub(crate) fn is_rational(&self) -> OcctResult<bool> {
        Ok(self.get()?.IsRational()?)
    }

    pub(crate) fn is_cn(&self, order: i32) -> OcctResult<bool> {
        Ok(self.get()?.IsCN(order)?)
    }

    pub(crate) fn is_equal(&self, other: &Curve, precision: f64) -> OcctResult<bool> {
        Ok(self.get()?.IsEqual(&other.handle, precision)?)
    }

    pub(crate) fn value(&self, parameter: f64) -> OcctResult<Point> {
        point_of(&*Geom_BSplineCurve_EvalD0(self.get()?, parameter)?)
    }

    /// Position and first derivative, OCCT's `D1`.
    pub(crate) fn d1(&self, parameter: f64) -> OcctResult<(Point, Point)> {
        let mut point = gp_Pnt_new_real3(0.0, 0.0, 0.0)?;
        let mut derivative = gp_Vec_new_real3(0.0, 0.0, 0.0)?;
        self.get()?.D1(parameter, point.pin_mut(), derivative.pin_mut())?;
        Ok((point_of(&point)?, vector_of(&derivative)?))
    }

    /// Position, first and second derivative, OCCT's `D2`.
    pub(crate) fn d2(&self, parameter: f64) -> OcctResult<(Point, Point, Point)> {
        let mut point = gp_Pnt_new_real3(0.0, 0.0, 0.0)?;
        let mut first = gp_Vec_new_real3(0.0, 0.0, 0.0)?;
        let mut second = gp_Vec_new_real3(0.0, 0.0, 0.0)?;
        self.get()?.D2(parameter, point.pin_mut(), first.pin_mut(), second.pin_mut())?;
        Ok((point_of(&point)?, vector_of(&first)?, vector_of(&second)?))
    }

    /// Angle between the `order`-th derivatives at two parameters, OCCT's `DN(..).Angle(DN(..))`.
    pub(crate) fn derivative_angle(
        &self,
        first_parameter: f64,
        second_parameter: f64,
        order: i32,
    ) -> OcctResult<f64> {
        let curve = self.get()?;
        let first = Geom_BSplineCurve_DN(curve, first_parameter, order)?;
        let second = Geom_BSplineCurve_DN(curve, second_parameter, order)?;
        Ok(first.Angle(&second)?)
    }

    pub(crate) fn segment(&mut self, first: f64, last: f64) -> OcctResult<()> {
        let tolerance = Precision::PConfusion()?;
        Ok(self.get_mut()?.Segment(first, last, tolerance)?)
    }

    pub(crate) fn set_knots(&mut self, knots: &[f64]) -> OcctResult<()> {
        let array = real_array(knots)?;
        Ok(self.get_mut()?.SetKnots(&array)?)
    }

    pub(crate) fn set_not_periodic(&mut self) -> OcctResult<()> {
        Ok(self.get_mut()?.SetNotPeriodic()?)
    }

    pub(crate) fn increase_degree(&mut self, degree: i32) -> OcctResult<()> {
        Ok(self.get_mut()?.IncreaseDegree(degree)?)
    }

    pub(crate) fn increase_multiplicity(
        &mut self,
        index: i32,
        multiplicity: i32,
    ) -> OcctResult<()> {
        Ok(self.get_mut()?.IncreaseMultiplicity_int2(index, multiplicity)?)
    }

    pub(crate) fn insert_knot(
        &mut self,
        knot: f64,
        multiplicity: i32,
        tolerance: f64,
    ) -> OcctResult<()> {
        Ok(self.get_mut()?.InsertKnot(knot, multiplicity, tolerance, false)?)
    }

    pub(crate) fn reverse(&mut self) -> OcctResult<()> {
        Ok(self.get_mut()?.Reverse()?)
    }

    /// `Geom_TrimmedCurve(curve, first, last)` converted straight back to a B-spline, the
    /// "clamp" step ocp_gordon applies to interpolation results on closed point sets.
    pub(crate) fn clamped(&self, first: f64, last: f64) -> OcctResult<Self> {
        let curve = self.as_curve();
        let trimmed = Geom_TrimmedCurve_new_hcurve_real2_bool2(&curve, first, last, true, true)?;
        Self::from_curve(&Handle_Geom_TrimmedCurve_to_Geom_Curve(&trimmed))
    }
}
