
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {IAVGXOracleRouter} from "./interfaces/IAVGXOracleRouter.sol";
import {Roles} from "./libraries/Roles.sol";
import {FixedPointMath} from "./libraries/FixedPointMath.sol";

/**
 * @title AVGXOracleRouter
 * @dev Routes price feed requests to appropriate Chainlink oracles
 * @notice Provides normalized price data for the AVGX index calculation
 */
contract AVGXOracleRouter is AccessControl, IAVGXOracleRouter {
    using Roles for address;
    using FixedPointMath for uint256;

    mapping(bytes32 => FeedConfig) private _feeds;
    uint256 private _globalMaxAge = Roles.DEFAULT_MAX_AGE;

    /**
     * @dev Constructor initializes the oracle router
     */
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @dev Sets price feed configuration for an asset
     * @param assetId Unique identifier for the asset
     * @param aggregator Chainlink aggregator address
     * @param invert Whether to invert the price (1/price)
     * @param decimals Number of decimals in the price feed
     */
    function setFeed(
        bytes32 assetId, 
        address aggregator, 
        bool invert, 
        uint8 decimals
    ) external onlyRole(Roles.ORACLE_MANAGER_ROLE) {
        aggregator.validateAddress();
        
        _feeds[assetId] = FeedConfig({
            aggregator: aggregator,
            invert: invert,
            decimals: decimals,
            maxAge: _globalMaxAge
        });
        
        emit FeedSet(assetId, aggregator, invert, decimals);
    }

    /**
     * @dev Gets latest price for an asset in 1e18 format
     * @param assetId Asset identifier
     * @return price Latest price in 1e18 format
     * @return updatedAt Timestamp of last update
     */
    function latestPriceE18(bytes32 assetId) external view returns (uint256 price, uint256 updatedAt) {
        FeedConfig memory config = _feeds[assetId];
        if (config.aggregator == address(0)) revert FeedNotFound(assetId);

        AggregatorV3Interface feed = AggregatorV3Interface(config.aggregator);
        
        (, int256 answer, , uint256 timestamp, ) = feed.latestRoundData();
        
        if (answer <= 0) revert InvalidPrice(assetId);
        if (block.timestamp - timestamp > config.maxAge) revert StalePrice(assetId);
        
        uint256 rawPrice = uint256(answer);
        
        // Normalize to 1e18
        price = FixedPointMath.normalize(rawPrice, config.decimals);
        
        // Invert if needed (for currencies like USD/EUR -> EUR/USD)
        if (config.invert) {
            price = FixedPointMath.div(FixedPointMath.ONE, price);
        }
        
        updatedAt = timestamp;
    }

    /**
     * @dev Sets global maximum age for price feeds
     * @param maxAge Maximum age in seconds
     */
    function setMaxAge(uint256 maxAge) external onlyRole(Roles.ORACLE_MANAGER_ROLE) {
        require(maxAge > 0, "AVGXOracleRouter: Invalid max age");
        _globalMaxAge = maxAge;
        emit MaxAgeUpdated(maxAge);
    }

    /**
     * @dev Gets feed configuration for an asset
     * @param assetId Asset identifier
     * @return config Feed configuration
     */
    function getFeedConfig(bytes32 assetId) external view returns (FeedConfig memory config) {
        return _feeds[assetId];
    }

    /**
     * @dev Gets global maximum age
     * @return maxAge Global maximum age in seconds
     */
    function getGlobalMaxAge() external view returns (uint256 maxAge) {
        return _globalMaxAge;
    }

    /**
     * @dev Checks if a feed exists for an asset
     * @param assetId Asset identifier
     * @return exists Whether the feed exists
     */
    function feedExists(bytes32 assetId) external view returns (bool exists) {
        return _feeds[assetId].aggregator != address(0);
    }
}
