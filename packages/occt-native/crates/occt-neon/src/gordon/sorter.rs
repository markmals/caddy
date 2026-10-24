//! Port of ocp_gordon `internal/curve_network_sorter.py` (Apache-2.0,
//! SPDX-FileCopyrightText: 2017 German Aerospace Center (DLR)): orders and orients the profiles
//! and guides of a curve network so that both run from the network's start corner.

use crate::error::{OcctError, OcctResult};
use crate::gordon::curve::{Curve, distance};
use crate::gordon::linalg::Matrix;

/// A curve whose poles all coincide: the degenerate curve a point input becomes.
pub(crate) fn is_zero_length_curve(curve: &Curve) -> OcctResult<bool> {
    let poles = curve.poles()?;
    let Some(reference) = poles.first() else {
        return Ok(true);
    };
    Ok(poles.iter().skip(1).all(|pole| distance(*reference, *pole) <= 1e-9))
}

pub(crate) fn first_non_zero_length_index(curves: &[Curve]) -> OcctResult<Option<usize>> {
    for (index, curve) in curves.iter().enumerate() {
        if !is_zero_length_curve(curve)? {
            return Ok(Some(index));
        }
    }
    Ok(None)
}

pub(crate) struct CurveNetworkSorter {
    pub(crate) profiles: Vec<Curve>,
    pub(crate) guides: Vec<Curve>,
    pub(crate) parms_inters_profiles: Matrix,
    pub(crate) parms_inters_guides: Matrix,
}

impl CurveNetworkSorter {
    pub(crate) fn new(
        profiles: Vec<Curve>,
        guides: Vec<Curve>,
        parms_inters_profiles: Matrix,
        parms_inters_guides: Matrix,
    ) -> OcctResult<Self> {
        let (rows, columns) = (profiles.len(), guides.len());
        let shapes_match = parms_inters_profiles.rows() == rows
            && parms_inters_guides.rows() == rows
            && parms_inters_profiles.cols() == columns
            && parms_inters_guides.cols() == columns;
        if !shapes_match {
            return Err(OcctError::invalid("intersection parameter matrices have the wrong size"));
        }
        Ok(Self { profiles, guides, parms_inters_profiles, parms_inters_guides })
    }

    fn zero_length_guide(&self, column: usize) -> OcctResult<bool> {
        is_zero_length_curve(&self.guides[column])
    }

    fn zero_length_profile(&self, row: usize) -> OcctResult<bool> {
        is_zero_length_curve(&self.profiles[row])
    }

    /// Column of the smallest entry in `row`, ignoring zero-length guides.
    fn min_row_index(&self, matrix: &Matrix, row: usize) -> OcctResult<Option<usize>> {
        let mut best: Option<(usize, f64)> = None;
        for column in 0..matrix.cols() {
            if self.zero_length_guide(column)? {
                continue;
            }
            let value = matrix.at(row, column);
            if best.is_none_or(|(_, smallest)| value < smallest) {
                best = Some((column, value));
            }
        }
        Ok(best.map(|(column, _)| column))
    }

    /// Row of the smallest entry in `column`, ignoring zero-length profiles.
    fn min_col_index(&self, matrix: &Matrix, column: usize) -> OcctResult<Option<usize>> {
        let mut best: Option<(usize, f64)> = None;
        for row in 0..matrix.rows() {
            if self.zero_length_profile(row)? {
                continue;
            }
            let value = matrix.at(row, column);
            if best.is_none_or(|(_, smallest)| value < smallest) {
                best = Some((row, value));
            }
        }
        Ok(best.map(|(row, _)| row))
    }

    /// Row of the largest entry in `column`, ignoring zero-length profiles.
    fn max_col_index(&self, matrix: &Matrix, column: usize) -> OcctResult<Option<usize>> {
        let mut best: Option<(usize, f64)> = None;
        for row in 0..matrix.rows() {
            if self.zero_length_profile(row)? {
                continue;
            }
            let value = matrix.at(row, column);
            if best.is_none_or(|(_, largest)| value > largest) {
                best = Some((row, value));
            }
        }
        Ok(best.map(|(row, _)| row))
    }

    /// The profile and guide that start at the same corner, and whether the guide runs backwards.
    fn start_curve_indices(&self) -> OcctResult<(usize, usize, bool)> {
        for row in 0..self.profiles.len() {
            if self.zero_length_profile(row)? {
                continue;
            }
            let Some(column) = self.min_row_index(&self.parms_inters_profiles, row)? else {
                continue;
            };
            let Some(candidate) = self.min_col_index(&self.parms_inters_guides, column)? else {
                continue;
            };
            if candidate == row {
                return Ok((candidate, column, false));
            }
        }

        for row in 0..self.profiles.len() {
            if self.zero_length_profile(row)? {
                continue;
            }
            let Some(column) = self.min_row_index(&self.parms_inters_profiles, row)? else {
                continue;
            };
            let Some(candidate) = self.max_col_index(&self.parms_inters_guides, column)? else {
                continue;
            };
            if candidate == row {
                return Ok((candidate, column, true));
            }
        }

        Err(OcctError::invalid("cannot find starting curves of curve network"))
    }

    fn swap_profiles(&mut self, first: usize, second: usize) {
        if first == second {
            return;
        }
        self.profiles.swap(first, second);
        self.parms_inters_guides.swap_rows(first, second);
        self.parms_inters_profiles.swap_rows(first, second);
    }

    fn swap_guides(&mut self, first: usize, second: usize) {
        if first == second {
            return;
        }
        self.guides.swap(first, second);
        self.parms_inters_guides.swap_columns(first, second);
        self.parms_inters_profiles.swap_columns(first, second);
    }

    fn reverse_profile(&mut self, index: usize) -> OcctResult<()> {
        let profile = &mut self.profiles[index];
        let total = profile.first_parameter()? + profile.last_parameter()?;
        for column in 0..self.parms_inters_profiles.cols() {
            let value = self.parms_inters_profiles.at(index, column);
            self.parms_inters_profiles.set(index, column, total - value);
        }
        self.profiles[index].reverse()
    }

    fn reverse_guide(&mut self, index: usize) -> OcctResult<()> {
        let guide = &mut self.guides[index];
        let total = guide.first_parameter()? + guide.last_parameter()?;
        for row in 0..self.parms_inters_guides.rows() {
            let value = self.parms_inters_guides.at(row, index);
            self.parms_inters_guides.set(row, index, total - value);
        }
        self.guides[index].reverse()
    }

    pub(crate) fn perform(&mut self) -> OcctResult<()> {
        let (profile_start, guide_start, guide_must_be_reversed) = self.start_curve_indices()?;
        self.swap_profiles(0, profile_start);
        self.swap_guides(0, guide_start);
        if guide_must_be_reversed {
            self.reverse_guide(0)?;
        }

        let n_guides = self.guides.len();
        let n_profiles = self.profiles.len();

        for limit in (2..=n_guides).rev() {
            for column in 0..limit - 1 {
                if self.parms_inters_profiles.at(0, column)
                    > self.parms_inters_profiles.at(0, column + 1)
                {
                    self.swap_guides(column, column + 1);
                }
            }
        }

        let Some(reference_guide) = first_non_zero_length_index(&self.guides)? else {
            return Err(OcctError::invalid("no non-zero-length guide found to sort profiles"));
        };

        for limit in (2..=n_profiles).rev() {
            for row in 0..limit - 1 {
                if self.parms_inters_guides.at(row, reference_guide)
                    > self.parms_inters_guides.at(row + 1, reference_guide)
                {
                    self.swap_profiles(row, row + 1);
                }
            }
        }

        for row in 1..n_profiles {
            if self.parms_inters_profiles.at(row, 0)
                > self.parms_inters_profiles.at(row, n_guides - 1)
            {
                self.reverse_profile(row)?;
            }
        }

        for column in 1..n_guides {
            if self.parms_inters_guides.at(0, column)
                > self.parms_inters_guides.at(n_profiles - 1, column)
            {
                self.reverse_guide(column)?;
            }
        }

        Ok(())
    }
}
