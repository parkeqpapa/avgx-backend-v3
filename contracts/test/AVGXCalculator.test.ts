
import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "ethers";

describe("AVGXCalculator", function () {
  const GOVERNOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GOVERNOR_ROLE"));
  const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));

  async function deployCalculatorFixture() {
    const [owner, governor, pauser, user1] = await hre.ethers.getSigners();

    const MockOracleRouter = await hre.ethers.getContractFactory(
      "MockOracleRouter"
    );
    const oracleRouter = await MockOracleRouter.deploy();

    const AVGXCalculator = await hre.ethers.getContractFactory("AVGXCalculator");
    const calculator = await AVGXCalculator.deploy(
      owner.address,
      await oracleRouter.getAddress()
    );

    await calculator.grantRole(GOVERNOR_ROLE, governor.address);
    await calculator.grantRole(PAUSER_ROLE, pauser.address);

    return { calculator, oracleRouter, owner, governor, pauser, user1 };
  }

  describe("Deployment", function () {
    it("Should set the correct oracle router", async function () {
      const { calculator, oracleRouter } = await loadFixture(
        deployCalculatorFixture
      );
      expect(await calculator.oracleRouter()).to.equal(await oracleRouter.getAddress());
    });

    it("Should grant DEFAULT_ADMIN_ROLE to the owner", async function () {
        const { calculator, owner } = await loadFixture(
            deployCalculatorFixture
        );
        const DEFAULT_ADMIN_ROLE = await calculator.DEFAULT_ADMIN_ROLE();
        expect(await calculator.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
    });
  });

  describe("Component Management", function () {
    it("Should allow governor to add fiat and crypto components", async function () {
        const { calculator, governor } = await loadFixture(deployCalculatorFixture);

        await calculator.connect(governor).addFiatComponent(ethers.encodeBytes32String("USD"), 10000, 8);
        await calculator.connect(governor).addCryptoComponent(ethers.encodeBytes32String("BTC"), 10000, 18);

        const fiatComponents = await calculator.getFiatComponents();
        const cryptoComponents = await calculator.getCryptoComponents();

        expect(fiatComponents.length).to.equal(1);
        expect(cryptoComponents.length).to.equal(1);
    });

    it("Should revert if non-governor tries to add a component", async function () {
        const { calculator, user1 } = await loadFixture(deployCalculatorFixture);

        await expect(calculator.connect(user1).addFiatComponent(ethers.encodeBytes32String("USD"), 10000, 8)).to.be.reverted;
    });

    it("Should revert when adding a duplicate component", async function () {
        const { calculator, governor } = await loadFixture(deployCalculatorFixture);

        await calculator.connect(governor).addFiatComponent(ethers.encodeBytes32String("USD"), 10000, 8);
        await expect(calculator.connect(governor).addFiatComponent(ethers.encodeBytes32String("USD"), 10000, 8)).to.be.revertedWithCustomError(calculator, "DuplicateComponent");
    });

    it("Should allow governor to remove a component", async function () {
        const { calculator, governor } = await loadFixture(deployCalculatorFixture);

        await calculator.connect(governor).addFiatComponent(ethers.encodeBytes32String("USD"), 10000, 8);
        await calculator.connect(governor).removeComponent(ethers.encodeBytes32String("USD"), true);

        const fiatComponents = await calculator.getFiatComponents();
        expect(fiatComponents.length).to.equal(0);
    });

    it("Should revert when trying to remove a non-existent component", async function () {
        const { calculator, governor } = await loadFixture(deployCalculatorFixture);

        await expect(calculator.connect(governor).removeComponent(ethers.encodeBytes32String("USD"), true)).to.be.revertedWithCustomError(calculator, "ComponentNotFound");
    });

    it("Should allow governor to update a component weight", async function () {
        const { calculator, governor } = await loadFixture(deployCalculatorFixture);

        await calculator.connect(governor).addFiatComponent(ethers.encodeBytes32String("USD"), 5000, 8);
        await calculator.connect(governor).addFiatComponent(ethers.encodeBytes32String("EUR"), 5000, 8);
        await calculator.connect(governor).updateComponentWeight(ethers.encodeBytes32String("USD"), 6000, true);

        const fiatComponents = await calculator.getFiatComponents();
        expect(fiatComponents[0].weightBps).to.equal(6000);
    });

    it("Should revert if total weights are not 10000 after update", async function () {
        const { calculator, governor } = await loadFixture(deployCalculatorFixture);

        await calculator.connect(governor).addFiatComponent(ethers.encodeBytes32String("USD"), 10000, 8);
        await calculator.connect(governor).addCryptoComponent(ethers.encodeBytes32String("BTC"), 10000, 18);
        await expect(calculator.connect(governor).updateComponentWeight(ethers.encodeBytes32String("USD"), 6000, true)).to.be.revertedWithCustomError(calculator, "InvalidWeights");
    });
  });

  describe("Pausable", function () {
    it("Should allow pauser to pause and unpause", async function () {
        const { calculator, pauser } = await loadFixture(deployCalculatorFixture);

        await calculator.connect(pauser).pause();
        expect(await calculator.paused()).to.be.true;

        await calculator.connect(pauser).unpause();
        expect(await calculator.paused()).to.be.false;
    });

    it("Should revert if non-pauser tries to pause", async function () {
        const { calculator, user1 } = await loadFixture(deployCalculatorFixture);
        await expect(calculator.connect(user1).pause()).to.be.reverted;
    });

    it("Should prevent calculating index when paused", async function () {
        const { calculator, pauser } = await loadFixture(deployCalculatorFixture);

        await calculator.connect(pauser).pause();
        await expect(calculator.currentIndex()).to.be.revertedWithCustomError(calculator, "EnforcedPause");
    });
  });

  describe("Index Calculation", function () {
    it("Should calculate the correct index value", async function () {
        const { calculator, oracleRouter, governor } = await loadFixture(deployCalculatorFixture);

        // Add components
        await calculator.connect(governor).addFiatComponent(ethers.encodeBytes32String("USD"), 5000, 8);
        await calculator.connect(governor).addFiatComponent(ethers.encodeBytes32String("EUR"), 5000, 8);
        await calculator.connect(governor).addCryptoComponent(ethers.encodeBytes32String("BTC"), 7000, 18);
        await calculator.connect(governor).addCryptoComponent(ethers.encodeBytes32String("ETH"), 3000, 18);

        // Set oracle prices
        await oracleRouter.setPrice(ethers.encodeBytes32String("USD"), ethers.parseUnits("1", 18));
        await oracleRouter.setPrice(ethers.encodeBytes32String("EUR"), ethers.parseUnits("1.2", 18));
        await oracleRouter.setPrice(ethers.encodeBytes32String("BTC"), ethers.parseUnits("50000", 18));
        await oracleRouter.setPrice(ethers.encodeBytes32String("ETH"), ethers.parseUnits("4000", 18));

        // WF = 0.5 * 1 + 0.5 * 1.2 = 1.1
        // WC = 0.7 * 50000 + 0.3 * 4000 = 35000 + 1200 = 36200
        // AVGX = sqrt(1.1 * 36200) = sqrt(39820) = 199.549
        const expectedIndex = ethers.parseUnits("199.54948759"); // Approx value

        const currentIndex = await calculator.currentIndex();
        expect(currentIndex).to.be.closeTo(expectedIndex, ethers.parseUnits("0.001"));
    });
  });
});
