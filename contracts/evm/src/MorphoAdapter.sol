// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC20Asset {
    function balanceOf(address owner) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IMorphoVault {
    function asset() external view returns (address);
    function balanceOf(address owner) external view returns (uint256);
    function previewRedeem(uint256 shares) external view returns (uint256);
    function previewWithdraw(uint256 assets) external view returns (uint256);
    function deposit(uint256 assets, address receiver) external returns (uint256);
    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256);
}

/// @notice Narrow in-process adapter: the escrow remains the vault caller and share owner.
/// @dev Morpho V2 max* views return zero; previews describe value, never guaranteed liquidity.
library MorphoAdapter {
    error TokenCallFailed();
    error AssetDeltaMismatch();
    error ShareLimitExceeded();

    function safeTransfer(IERC20Asset token, address recipient, uint256 amount) internal {
        _call(address(token), abi.encodeCall(token.transfer, (recipient, amount)));
    }

    function safeTransferFrom(IERC20Asset token, address owner, uint256 amount) internal {
        uint256 beforeBalance = token.balanceOf(address(this));
        _call(address(token), abi.encodeCall(token.transferFrom, (owner, address(this), amount)));
        if (token.balanceOf(address(this)) != beforeBalance + amount) revert AssetDeltaMismatch();
    }

    function supply(IERC20Asset token, IMorphoVault vault, uint256 assets, uint256 minShares)
        internal
        returns (uint256 shares)
    {
        uint256 beforeAssets = token.balanceOf(address(this));
        uint256 beforeShares = vault.balanceOf(address(this));
        _call(address(token), abi.encodeCall(token.approve, (address(vault), 0)));
        _call(address(token), abi.encodeCall(token.approve, (address(vault), assets)));
        shares = vault.deposit(assets, address(this));
        _call(address(token), abi.encodeCall(token.approve, (address(vault), 0)));
        if (shares < minShares || shares == 0) revert ShareLimitExceeded();
        if (
            vault.balanceOf(address(this)) != beforeShares + shares
                || token.balanceOf(address(this)) + assets != beforeAssets
        ) revert AssetDeltaMismatch();
    }

    function withdraw(IERC20Asset token, IMorphoVault vault, uint256 assets, uint256 maxShares)
        internal
        returns (uint256 shares)
    {
        uint256 beforeAssets = token.balanceOf(address(this));
        uint256 beforeShares = vault.balanceOf(address(this));
        shares = vault.withdraw(assets, address(this), address(this));
        if (shares > maxShares) revert ShareLimitExceeded();
        if (
            token.balanceOf(address(this)) != beforeAssets + assets
                || vault.balanceOf(address(this)) + shares != beforeShares
        ) revert AssetDeltaMismatch();
    }

    function redeem(IERC20Asset token, IMorphoVault vault, uint256 shares, uint256 minAssets)
        internal
        returns (uint256 assets)
    {
        uint256 beforeAssets = token.balanceOf(address(this));
        uint256 beforeShares = vault.balanceOf(address(this));
        assets = vault.redeem(shares, address(this), address(this));
        if (assets < minAssets) revert ShareLimitExceeded();
        if (
            token.balanceOf(address(this)) != beforeAssets + assets
                || vault.balanceOf(address(this)) + shares != beforeShares
        ) revert AssetDeltaMismatch();
    }

    function _call(address target, bytes memory data) private {
        (bool success, bytes memory result) = target.call(data);
        if (!success || (result.length != 0 && !abi.decode(result, (bool)))) revert TokenCallFailed();
    }
}
