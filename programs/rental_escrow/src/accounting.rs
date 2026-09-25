//! Integer-only accounting shared by instruction handlers and host tests.
use crate::EscrowError;
use anchor_lang::prelude::*;

mod wide {
    uint::construct_uint! { pub struct U256(4); }
}
use wide::U256;

/// KLend's Fraction has 60 fractional bits. Floor every conversion in favor of security.
pub fn receipt_value(receipts: u64, supply: u64, net_liquidity_sf: u128) -> Result<u64> {
    if receipts == 0 {
        return Ok(0);
    }
    require!(
        supply > 0 && net_liquidity_sf > 0,
        EscrowError::InvalidExchangeRate
    );
    let value = U256::from(receipts) * U256::from(net_liquidity_sf)
        / U256::from(supply)
        / (U256::one() << 60);
    require!(value <= U256::from(u64::MAX), EscrowError::Overflow);
    Ok(value.as_u64())
}

pub fn net_liquidity_sf(
    available: u64,
    borrowed: u128,
    protocol: u128,
    referral: u128,
    pending: u128,
) -> Result<u128> {
    ((available as u128) << 60)
        .checked_add(borrowed)
        .and_then(|x| x.checked_sub(protocol))
        .and_then(|x| x.checked_sub(referral))
        .and_then(|x| x.checked_sub(pending))
        .ok_or_else(|| error!(EscrowError::InvalidExchangeRate))
}

pub fn checked_add(a: u64, b: u64) -> Result<u64> {
    a.checked_add(b)
        .ok_or_else(|| error!(EscrowError::Overflow))
}

pub fn checked_sub(a: u64, b: u64) -> Result<u64> {
    a.checked_sub(b)
        .ok_or_else(|| error!(EscrowError::InsufficientBalance))
}

pub fn release_limit(
    idle: u64,
    receipt_value: u64,
    required: u64,
    permitted: bool,
    active: bool,
) -> Result<u64> {
    require!(permitted && active, EscrowError::ReleaseNotAllowed);
    let total = checked_add(idle, receipt_value)?;
    require!(total >= required, EscrowError::SecurityShortfall);
    Ok((total - required).min(idle))
}

pub fn settlement(
    idle: u64,
    receipts: u64,
    approved: u64,
    claim: u64,
    required: u64,
) -> Result<(u64, u64)> {
    require!(receipts == 0, EscrowError::RedemptionRequired);
    require!(
        approved <= claim && claim <= required,
        EscrowError::ClaimExceedsLimit
    );
    require!(approved <= idle, EscrowError::SecurityShortfall);
    Ok((approved, idle - approved))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn receipt_value_keeps_precision_and_floors() {
        assert_eq!(receipt_value(10, 3, (4u128) << 60).unwrap(), 13);
        assert_eq!(
            receipt_value(
                3_000_000_000,
                120_000_000_000_000,
                (124_000_000_000_000u128) << 60
            )
            .unwrap(),
            3_100_000_000
        );
        assert_eq!(receipt_value(1, 3, 1u128 << 60).unwrap(), 0);
        assert!(receipt_value(1, 0, 1).is_err());
    }
    #[test]
    fn all_fee_buckets_are_subtracted() {
        assert_eq!(
            net_liquidity_sf(100, 10 << 60, 2 << 60, 3 << 60, 1 << 60).unwrap(),
            104 << 60
        );
        assert!(net_liquidity_sf(1, 0, 2 << 60, 0, 0).is_err());
    }
    #[test]
    fn earnings_need_policy_surplus_and_real_cash() {
        assert_eq!(
            release_limit(10_000_000, 3_000_000_000, 3_000_000_000, true, true).unwrap(),
            10_000_000
        );
        assert_eq!(
            release_limit(0, 3_010_000_000, 3_000_000_000, true, true).unwrap(),
            0
        );
        assert!(release_limit(0, 2_999_999_999, 3_000_000_000, true, true).is_err());
        assert!(release_limit(10, 3000, 3000, false, true).is_err());
        assert!(release_limit(10, 3000, 3000, true, false).is_err());
    }
    #[test]
    fn settlement_is_bounded_and_requires_redemption() {
        assert_eq!(
            settlement(3_000_000_000, 0, 120_000_000, 120_000_000, 3_000_000_000).unwrap(),
            (120_000_000, 2_880_000_000)
        );
        assert!(settlement(3000, 1, 120, 120, 3000).is_err());
        assert!(settlement(3000, 0, 121, 120, 3000).is_err());
        assert!(settlement(100, 0, 120, 120, 3000).is_err());
    }
}
