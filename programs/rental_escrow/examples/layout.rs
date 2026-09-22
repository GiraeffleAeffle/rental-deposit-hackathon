use klend_interface::state::{
    LendingMarket, Reserve, ReserveCollateral, ReserveConfig, ReserveLiquidity,
};
fn main() {
    macro_rules! field {
        ($ty:ty,$field:ident) => {
            println!(
                "{}.{}={}",
                stringify!($ty),
                stringify!($field),
                std::mem::offset_of!($ty, $field)
            );
        };
    }
    field!(Reserve, last_update);
    field!(Reserve, lending_market);
    field!(Reserve, liquidity);
    field!(Reserve, collateral);
    field!(Reserve, config);
    field!(ReserveLiquidity, total_available_amount);
    field!(ReserveLiquidity, borrowed_amount_sf);
    field!(ReserveLiquidity, mint_decimals);
    field!(ReserveLiquidity, accumulated_protocol_fees_sf);
    field!(ReserveLiquidity, accumulated_referrer_fees_sf);
    field!(ReserveLiquidity, pending_referrer_fees_sf);
    field!(ReserveLiquidity, token_program);
    field!(ReserveCollateral, mint_total_supply);
    field!(ReserveConfig, status);
    field!(ReserveConfig, emergency_mode);
    field!(ReserveConfig, permissioned_ops);
    field!(ReserveConfig, token_info);
    field!(LendingMarket, emergency_mode);
    field!(LendingMarket, permissioned_ops);
}
