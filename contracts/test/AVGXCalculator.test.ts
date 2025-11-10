import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "ethers";

// Changed describe block to target the new contract
describe("AVGXCalculator2", function () { 
  const GOVERNOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GOVERNOR_ROLE"));
  const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));

  async function deployCalculatorFixture() {
    const [owner, governor, pauser, user1] = await hre.ethers.getSigners();

    const MockOracleRouter = await hre.ethers.getContractFactory(
      "MockOracleRouter"
    );
    const oracleRouter = await MockOracleRouter.deploy();

    // Deploy the new contract
    const AVGXCalculator = await hre.ethers.getContractFactory("AVGXCalculator2"); 
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
    // This test is modified to show the piece-by-piece addition that now works
    it("Should allow governor to add components piece-by-piece", async function () {
        const { calculator, governor } = await loadFixture(deployCalculatorFixture);

        // Add one fiat component (fiat total = 50%, crypto total = 0%) -> This would have failed before
        await expect(calculator.connect(governor).addFiatComponent(ethers.encodeBytes32String("USD"), 5000, 8)).to.not.be.reverted;
        
        // Add one crypto component (fiat total = 50%, crypto total = 70%) -> This would have failed before
        await expect(calculator.connect(governor).addCryptoComponent(ethers.encodeBytes32String("BTC"), 7000, 18)).to.not.be.reverted;

        const fiatComponents = await calculator.getFiatComponents();
        const cryptoComponents = await calculator.getCryptoComponents();

        expect(fiatComponents.length).to.equal(1);
        expect(fiatComponents[0].weightBps).to.equal(5000);
        expect(cryptoComponents.length).to.equal(1);
        expect(cryptoComponents[0].weightBps).to.equal(7000);
    });

    it("Should revert if non-governor tries to add a component", async function () {
        const { calculator, user1 } = await loadFixture(deployCalculatorFixture);
        await expect(calculator.connect(user1).addFiatComponent(ethers.encodeBytes32String("USD"), 10000, 8)).to.be.reverted;
    });

    it("Should revert when adding a duplicate component", async function () {
        const { calculator, governor } = await loadFixture(deployCalculatorFixture);
        await calculator.connect(governor).addFiatComponent(ethers.encodeBytes32String("USD"), 5000, 8);
        await expect(calculator.connect(governor).addFiatComponent(ethers.encodeBytes32String("USD"), 5000, 8)).to.be.revertedWithCustomError(calculator, "DuplicateComponent");
    });

    // Test for removing a component remains similar
    it("Should allow governor to remove a component", async function () {
        const { calculator, governor } = await loadFixture(deployCalculatorFixture);
        await calculator.connect(governor).addFiatComponent(ethers.encodeBytes32String("USD"), 10000, 8);
        await calculator.connect(governor).addCryptoComponent(ethers.encodeBytes32String("BTC"), 10000, 18);
        await calculator.connect(governor).removeComponent(ethers.encodeBytes32String("USD"), true);
        const fiatComponents = await calculator.getFiatComponents();
        expect(fiatComponents.length).to.equal(0);
    });

    // Test for updating a component weight is modified
    it("Should allow governor to update a component weight without immediate revert", async function () {
        const { calculator, governor } = await loadFixture(deployCalculatorFixture);

        // Setup with valid weights initially
        await calculator.connect(governor).addFiatComponent(ethers.encodeBytes32String("USD"), 10000, 8);
        await calculator.connect(governor).addCryptoComponent(ethers.encodeBytes32String("BTC"), 10000, 18);

        // Update weight, which makes the total invalid. Should NOT revert here.
        await expect(calculator.connect(governor).updateComponentWeight(ethers.encodeBytes32String("USD"), 6000, true)).to.not.be.reverted;

        const fiatComponents = await calculator.getFiatComponents();
        expect(fiatComponents[0].weightBps).to.equal(6000);
    });

    // New test: Verifies that currentIndex reverts if weights are invalid
    it("Should revert currentIndex if total weights are not 10000", async function () {
        const { calculator, governor, oracleRouter } = await loadFixture(deployCalculatorFixture);

        // Setup with invalid weights and set prices
        await calculator.connect(governor).addFiatComponent(ethers.encodeBytes32String("USD"), 5000, 8); // Not 10000
        await calculator.connect(governor).addCryptoComponent(ethers.encodeBytes32String("BTC"), 10000, 18);
        await oracleRouter.pushPrice(ethers.encodeBytes32String("USD"), ethers.parseUnits("1", 18));
        await oracleRouter.pushPrice(ethers.encodeBytes32String("BTC"), ethers.parseUnits("50000", 18));


        // Expect currentIndex to revert because fiat weights are not 100%
        await expect(calculator.currentIndex()).to.be.revertedWithCustomError(calculator, "InvalidWeights");

        // Correct the fiat weight and set the price for the new component
        await calculator.connect(governor).addFiatComponent(ethers.encodeBytes32String("EUR"), 5000, 8);
        await oracleRouter.pushPrice(ethers.encodeBytes32String("EUR"), ethers.parseUnits("1.2", 18));

        // Expect currentIndex to NOT revert now
        await expect(calculator.currentIndex()).to.not.be.reverted;
    });
  });

  describe("Pausable", function () {
    // Pausable tests remain the same
    it("Should allow pauser to pause and unpause", async function () {
        const { calculator, pauser } = await loadFixture(deployCalculatorFixture);
        await calculator.connect(pauser).pause();
        expect(await calculator.paused()).to.be.true;
        await calculator.connect(pauser).unpause();
        expect(await calculator.paused()).to.be.false;
    });

    it("Should prevent calculating index when paused", async function () {
        const { calculator, governor, pauser, oracleRouter } = await loadFixture(deployCalculatorFixture);
        // Add valid components first so it doesn't fail on InvalidWeights
        await calculator.connect(governor).addFiatComponent(ethers.encodeBytes32String("USD"), 10000, 8);
        await calculator.connect(governor).addCryptoComponent(ethers.encodeBytes32String("BTC"), 10000, 18);
        await oracleRouter.pushPrice(ethers.encodeBytes32String("USD"), ethers.parseUnits("1", 18));
        await oracleRouter.pushPrice(ethers.encodeBytes32String("BTC"), ethers.parseUnits("50000", 18));
        
        await calculator.connect(pauser).pause();
        await expect(calculator.currentIndex()).to.be.revertedWithCustomError(calculator, "EnforcedPause");
    });
  });

  describe("Index Calculation", function () {
    // This test should now pass without issues during setup
    it("Should calculate the correct index value with valid weights", async function () {
        const { calculator, oracleRouter, governor } = await loadFixture(deployCalculatorFixture);

        // Add components piece-by-piece
        await calculator.connect(governor).addFiatComponent(ethers.encodeBytes32String("USD"), 5000, 8);
        await calculator.connect(governor).addFiatComponent(ethers.encodeBytes32String("EUR"), 5000, 8);
        await calculator.connect(governor).addCryptoComponent(ethers.encodeBytes32String("BTC"), 7000, 18);
        await calculator.connect(governor).addCryptoComponent(ethers.encodeBytes32String("ETH"), 3000, 18);

        // Set oracle prices using pushPrice
        await oracleRouter.pushPrice(ethers.encodeBytes32String("USD"), ethers.parseUnits("1", 18));
        await oracleRouter.pushPrice(ethers.encodeBytes32String("EUR"), ethers.parseUnits("1.2", 18));
        await oracleRouter.pushPrice(ethers.encodeBytes32String("BTC"), ethers.parseUnits("50000", 18));
        await oracleRouter.pushPrice(ethers.encodeBytes32String("ETH"), ethers.parseUnits("4000", 18));

        // WF = 0.5 * 1 + 0.5 * 1.2 = 1.1
        // WC = 0.7 * 50000 + 0.3 * 4000 = 35000 + 1200 = 36200
        // AVGX = sqrt(1.1 * 36200) = sqrt(39820) = 199.549
        const expectedIndex = ethers.parseUnits("199.54948759"); // Approx value

        const currentIndex = await calculator.currentIndex();
        expect(currentIndex).to.be.closeTo(expectedIndex, ethers.parseUnits("0.001"));
    });
  });
});
