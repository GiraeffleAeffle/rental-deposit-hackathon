// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20Asset, IMorphoVault} from "../src/MorphoAdapter.sol";

contract MockUSDG is IERC20Asset {
    string public constant symbol = "TEST_USDG";
    uint8 public constant decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function burn(address from, uint256 amount) external {
        balanceOf[from] -= amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @dev Local model only, with 6-decimal assets and 18-decimal shares. Not a Morpho deployment.
contract MockMorphoVault is IMorphoVault {
    address public immutable asset;
    uint8 public constant decimals = 18;
    mapping(address => uint256) public balanceOf;
    uint256 public totalSupply;
    bool public illiquid;
    address public reentryTarget;
    bytes public reentryData;
    bytes public reentryResult;
    bool public reentrySuccess;

    constructor(address token) {
        asset = token;
    }

    function setIlliquid(bool value) external {
        illiquid = value;
    }

    function setReentry(address target, bytes calldata data) external {
        reentryTarget = target;
        reentryData = data;
    }

    function maxDeposit(address) external pure returns (uint256) {
        return 0;
    }

    function maxWithdraw(address) external pure returns (uint256) {
        return 0;
    }

    function previewRedeem(uint256 shares) public view returns (uint256) {
        if (totalSupply == 0) return shares / 1e12;
        return shares * IERC20Asset(asset).balanceOf(address(this)) / totalSupply;
    }

    function previewWithdraw(uint256 assets) public view returns (uint256) {
        if (totalSupply == 0) return assets * 1e12;
        uint256 available = IERC20Asset(asset).balanceOf(address(this));
        return (assets * totalSupply + available - 1) / available;
    }

    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        uint256 available = IERC20Asset(asset).balanceOf(address(this));
        shares = totalSupply == 0 ? assets * 1e12 : assets * totalSupply / available;
        IERC20Asset(asset).transferFrom(msg.sender, address(this), assets);
        totalSupply += shares;
        balanceOf[receiver] += shares;
    }

    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares) {
        require(!illiquid, "ILLQ");
        require(msg.sender == owner, "OWNER");
        _reenter();
        shares = previewWithdraw(assets);
        balanceOf[owner] -= shares;
        totalSupply -= shares;
        IERC20Asset(asset).transfer(receiver, assets);
    }

    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets) {
        require(!illiquid, "ILLQ");
        require(msg.sender == owner, "OWNER");
        _reenter();
        assets = previewRedeem(shares);
        balanceOf[owner] -= shares;
        totalSupply -= shares;
        IERC20Asset(asset).transfer(receiver, assets);
    }

    function _reenter() private {
        if (reentryTarget != address(0)) (reentrySuccess, reentryResult) = reentryTarget.call(reentryData);
    }
}
