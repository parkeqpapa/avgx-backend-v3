
import { expect } from "chai";
import { ethers } from "ethers";
import hre from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract } from "ethers";

describe("Slippage Integration Test", function () {
  let avgxToken: Contract;
  let amm: Contract;
  let baseAsset: Contract;

  let owner: HardhatEthersSigner;
  let user1: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, user1] = await hre.ethers.getSigners();

    // Deploy MockERC20 as base asset
    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    baseAsset = await MockERC20.deploy("Mock USDC", "USDC", 6);

    // Deploy AVGXToken
    const AVGXToken = await hre.ethers.getContractFactory("AVGXToken");
    avgxToken = await AVGXToken.deploy(owner.address);

    // Deploy MockCalculator
    const MockCalculator = await hre.ethers.getContractFactory("MockCalculator");
    const calculator = await MockCalculator.deploy();
    await calculator.setPrice(ethers.parseEther("1"));

    // Deploy AVGXVault
    const AVGXVault = await hre.ethers.getContractFactory("AVGXVault");
    const vault = await AVGXVault.deploy(await baseAsset.getAddress());

    // Deploy AVGXAMM
    const AVGXAMM = await hre.ethers.getContractFactory("AVGXAMM");
    amm = await AVGXAMM.deploy(
      await avgxToken.getAddress(),
      await calculator.getAddress(),
      await baseAsset.getAddress()
    );

    // Grant roles and set circular dependencies
    const GOVERNOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GOVERNOR_ROLE"));
    await vault.connect(owner).grantRole(GOVERNOR_ROLE, owner.address);
    await amm.connect(owner).grantRole(GOVERNOR_ROLE, owner.address);
    await vault.connect(owner).setAmm(await amm.getAddress());
    await amm.connect(owner).setVault(await vault.getAddress());

    // Grant MINTER_ROLE to AMM in AVGXToken
    const MINTER_ROLE = await avgxToken.MINTER_ROLE();
    await avgxToken.connect(owner).grantRole(MINTER_ROLE, await amm.getAddress());

    // Mint some base asset to user1
    await baseAsset.mint(user1.address, ethers.parseUnits("10000", 6));
  });

  it("should revert minting if slippage is exceeded", async function () {
    const baseIn = ethers.parseUnits("1000", 6);
    await baseAsset.connect(user1).approve(amm.getAddress(), baseIn);

    const [avgxOut] = await amm.getQuoteMint(baseIn);
    const minAvgxOut = avgxOut + 1n; // Set minAvgxOut higher than the quote

    await expect(amm.connect(user1).mintWithBase(baseIn, minAvgxOut, user1.address))
      .to.be.revertedWithCustomError(amm, "SlippageExceeded");
  });

  it("should revert redeeming if slippage is exceeded", async function () {
    // Mint some tokens first
    const baseIn = ethers.parseUnits("1000", 6);
    await baseAsset.connect(user1).approve(amm.getAddress(), baseIn);
    const [avgxOut] = await amm.getQuoteMint(baseIn);
    await amm.connect(user1).mintWithBase(baseIn, avgxOut, user1.address);

    const userAvgxBalance = await avgxToken.balanceOf(user1.address);
    await avgxToken.connect(user1).approve(amm.getAddress(), userAvgxBalance);

    const [baseOut] = await amm.getQuoteRedeem(userAvgxBalance);
    const minBaseOut = baseOut + 1n; // Set minBaseOut higher than the quote

    await expect(amm.connect(user1).redeemForBase(userAvgxBalance, minBaseOut, user1.address))
      .to.be.revertedWithCustomError(amm, "SlippageExceeded");
  
  });
});
