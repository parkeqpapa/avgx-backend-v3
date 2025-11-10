
import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "ethers";

describe("AVGXOracleRouter", function () {
  const ORACLE_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ORACLE_MANAGER_ROLE"));

  async function deployOracleRouterFixture() {
    const [owner, oracleManager, user1] = await hre.ethers.getSigners();

    const AVGXOracleRouter = await hre.ethers.getContractFactory("AVGXOracleRouter");
    const oracleRouter = await AVGXOracleRouter.deploy();

    await oracleRouter.grantRole(ORACLE_MANAGER_ROLE, oracleManager.address);

    const MockAggregatorV3 = await hre.ethers.getContractFactory("MockAggregatorV3");
    const aggregator = await MockAggregatorV3.deploy();

    return { oracleRouter, owner, oracleManager, user1, aggregator };
  }

  describe("Deployment", function () {
    it("Should grant DEFAULT_ADMIN_ROLE to the owner", async function () {
      const { oracleRouter, owner } = await loadFixture(deployOracleRouterFixture);
      const DEFAULT_ADMIN_ROLE = await oracleRouter.DEFAULT_ADMIN_ROLE();
      expect(await oracleRouter.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
    });
  });

  describe("Feed Management", function () {
    it("Should allow oracle manager to set a feed", async function () {
        const { oracleRouter, oracleManager, aggregator } = await loadFixture(deployOracleRouterFixture);
        const assetId = ethers.encodeBytes32String("BTC");

        await oracleRouter.connect(oracleManager).setFeed(assetId, await aggregator.getAddress(), false, 8);

        const feedConfig = await oracleRouter.getFeedConfig(assetId);
        expect(feedConfig.aggregator).to.equal(await aggregator.getAddress());
    });

    it("Should revert if non-manager tries to set a feed", async function () {
        const { oracleRouter, user1, aggregator } = await loadFixture(deployOracleRouterFixture);
        const assetId = ethers.encodeBytes32String("BTC");

        await expect(oracleRouter.connect(user1).setFeed(assetId, await aggregator.getAddress(), false, 8)).to.be.reverted;
    });
  });

  describe("Price Feeds", function () {
    it("Should return the latest price", async function () {
        const { oracleRouter, oracleManager, aggregator } = await loadFixture(deployOracleRouterFixture);
        const assetId = ethers.encodeBytes32String("BTC");
        await oracleRouter.connect(oracleManager).setFeed(assetId, await aggregator.getAddress(), false, 8);

        const price = ethers.parseUnits("50000", 8);
        await aggregator.setLatestAnswer(price);

        const [latestPrice, ] = await oracleRouter.latestPriceE18(assetId);
        expect(latestPrice).to.equal(ethers.parseUnits("50000", 18));
    });

    it("Should revert for a stale price", async function () {
        const { oracleRouter, oracleManager, aggregator } = await loadFixture(deployOracleRouterFixture);
        const assetId = ethers.encodeBytes32String("BTC");
        await oracleRouter.connect(oracleManager).setMaxAge(10); // 10 seconds
        await oracleRouter.connect(oracleManager).setFeed(assetId, await aggregator.getAddress(), false, 8);

        const price = ethers.parseUnits("50000", 8);
        await aggregator.setLatestAnswer(price);

        // Wait for 11 seconds
        await hre.ethers.provider.send("evm_increaseTime", [11]);
        await hre.ethers.provider.send("evm_mine", []);

        await expect(oracleRouter.latestPriceE18(assetId)).to.be.revertedWithCustomError(oracleRouter, "StalePrice");
    });

    it("Should revert for an invalid price (zero or negative)", async function () {
        const { oracleRouter, oracleManager, aggregator } = await loadFixture(deployOracleRouterFixture);
        const assetId = ethers.encodeBytes32String("BTC");
        await oracleRouter.connect(oracleManager).setFeed(assetId, await aggregator.getAddress(), false, 8);

        await aggregator.setLatestAnswer(0);
        await expect(oracleRouter.latestPriceE18(assetId)).to.be.revertedWithCustomError(oracleRouter, "InvalidPrice");
    });

    it("Should return the inverted price", async function () {
        const { oracleRouter, oracleManager, aggregator } = await loadFixture(deployOracleRouterFixture);
        const assetId = ethers.encodeBytes32String("EUR/USD");
        await oracleRouter.connect(oracleManager).setFeed(assetId, await aggregator.getAddress(), true, 8);

        // Price of 1 EUR in USD is 1.2
        const price = ethers.parseUnits("1.2", 8);
        await aggregator.setLatestAnswer(price);

        // We want the price of 1 USD in EUR, which is 1 / 1.2 = 0.8333...
        const [latestPrice, ] = await oracleRouter.latestPriceE18(assetId);
        const expectedPrice = ethers.parseUnits("0.833333333333333333", 18);

        expect(latestPrice).to.be.closeTo(expectedPrice, 1);
    });

    it("Should revert if feed is not found", async function () {
        const { oracleRouter } = await loadFixture(deployOracleRouterFixture);
        const assetId = ethers.encodeBytes32String("UNKNOWN");

        await expect(oracleRouter.latestPriceE18(assetId)).to.be.revertedWithCustomError(oracleRouter, "FeedNotFound");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow oracle manager to set max age", async function () {
        const { oracleRouter, oracleManager } = await loadFixture(deployOracleRouterFixture);
        const newMaxAge = 3600; // 1 hour

        await oracleRouter.connect(oracleManager).setMaxAge(newMaxAge);
        expect(await oracleRouter.getGlobalMaxAge()).to.equal(newMaxAge);
    });

    it("Should revert if non-manager tries to set max age", async function () {
        const { oracleRouter, user1 } = await loadFixture(deployOracleRouterFixture);
        await expect(oracleRouter.connect(user1).setMaxAge(3600)).to.be.reverted;
    });
  });
});
