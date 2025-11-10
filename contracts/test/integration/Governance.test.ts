
import { expect } from "chai";
import { ethers } from "ethers";
import hre from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract } from "ethers";

describe("Governance Integration Test", function () {
  let avgxToken: Contract;
  let amm: Contract;

  let owner: HardhatEthersSigner;
  let governor: HardhatEthersSigner;
  let pauser: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let feeRecipient: HardhatEthersSigner;
  let treasury: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, governor, pauser, user1, feeRecipient, treasury] = await hre.ethers.getSigners();

    // Deploy AVGXToken
    const AVGXToken = await hre.ethers.getContractFactory("AVGXToken");
    avgxToken = await AVGXToken.deploy(owner.address);

    // Deploy MockCalculator
    const MockCalculator = await hre.ethers.getContractFactory("MockCalculator");
    const calculator = await MockCalculator.deploy();
    await calculator.setPrice(ethers.parseEther("1"));

    // Deploy MockERC20 as base asset
    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    const baseAsset = await MockERC20.deploy("Mock USDC", "USDC", 6);

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

    // Set circular dependencies
    const GOVERNOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GOVERNOR_ROLE"));
    await vault.connect(owner).grantRole(GOVERNOR_ROLE, owner.address);
    await amm.connect(owner).grantRole(GOVERNOR_ROLE, owner.address);
    await vault.connect(owner).setAmm(await amm.getAddress());
    await amm.connect(owner).setVault(await vault.getAddress());
    // Grant roles
    const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));

    await amm.connect(owner).grantRole(GOVERNOR_ROLE, governor.address);
    await amm.connect(owner).grantRole(PAUSER_ROLE, pauser.address);
    await avgxToken.connect(owner).grantRole(GOVERNOR_ROLE, governor.address);
    await avgxToken.connect(owner).grantRole(PAUSER_ROLE, pauser.address);
  });

  it("should allow governor to update AMM params", async function () {
    const newParams = {
      feeBps: 100, // 1%
      spreadBps: 20, // 0.2%
      feeRecipient: feeRecipient.address,
      treasury: treasury.address
    };

    await expect(amm.connect(governor).updateParams(newParams))
      .to.emit(amm, "ParamsUpdated");

    const params = await amm.getParams();
    expect(params.feeBps).to.equal(newParams.feeBps);
    expect(params.spreadBps).to.equal(newParams.spreadBps);
    expect(params.feeRecipient).to.equal(newParams.feeRecipient);
    expect(params.treasury).to.equal(newParams.treasury);

    // Test that a non-governor cannot update params
    await expect(amm.connect(user1).updateParams(newParams))
      .to.be.reverted;
  });

  it("should allow pauser to pause and unpause AMM", async function () {
    await expect(amm.connect(pauser).pause()).to.emit(amm, "Paused");
    expect(await amm.paused()).to.be.true;

    await expect(amm.connect(pauser).unpause()).to.emit(amm, "Unpaused");
    expect(await amm.paused()).to.be.false;

    // Test that a non-pauser cannot pause or unpause
    await expect(amm.connect(user1).pause()).to.be.reverted;
    await expect(amm.connect(user1).unpause()).to.be.reverted;
  });

  it("should allow pauser to pause and unpause token", async function () {
    await expect(avgxToken.connect(pauser).pause()).to.emit(avgxToken, "Paused");
    expect(await avgxToken.paused()).to.be.true;

    await expect(avgxToken.connect(pauser).unpause()).to.emit(avgxToken, "Unpaused");
    expect(await avgxToken.paused()).to.be.false;

    // Test that a non-pauser cannot pause or unpause
    await expect(avgxToken.connect(user1).pause()).to.be.reverted;
    await expect(avgxToken.connect(user1).unpause()).to.be.reverted;
  });

  it("should allow governor to set max supply", async function () {
    const maxSupply = ethers.parseEther("1000000");

    await expect(avgxToken.connect(governor).setMaxSupply(maxSupply))
      .to.emit(avgxToken, "MaxSupplySet").withArgs(maxSupply);

    expect(await avgxToken.maxSupplyAVGX()).to.equal(maxSupply);

    // Test that it can only be set once
    await expect(avgxToken.connect(governor).setMaxSupply(maxSupply))
      .to.be.revertedWithCustomError(avgxToken, "MaxSupplyAlreadySet");

    // Test that a non-governor cannot set max supply
    await expect(avgxToken.connect(user1).setMaxSupply(maxSupply))
      .to.be.reverted;
  });
});
