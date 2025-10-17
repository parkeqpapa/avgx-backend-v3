
import { expect } from "chai";
import { ethers } from "ethers";
import hre from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract } from "ethers";

describe("AVGXProtocol Integration Test", function () {
  let avgxToken: Contract;
  let baseAsset: Contract;
  let vault: Contract;
  let oracleRouter: Contract;
  let calculator: Contract;
  let amm: Contract;

  let owner: HardhatEthersSigner;
  let governor: HardhatEthersSigner;
  let pauser: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let feeRecipient: HardhatEthersSigner;
  let treasury: HardhatEthersSigner;

  const ONE_ETHER = ethers.parseEther("1");

  beforeEach(async function () {
    [owner, governor, pauser, user1, feeRecipient, treasury] = await hre.ethers.getSigners();

    // Deploy MockERC20 as base asset
    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    baseAsset = await MockERC20.deploy("Mock USDC", "USDC", 6);

    // Deploy AVGXToken
    const AVGXToken = await hre.ethers.getContractFactory("AVGXToken");
    avgxToken = await AVGXToken.deploy(owner.address);

    // Deploy MockCalculator
    const MockCalculator = await hre.ethers.getContractFactory("MockCalculator");
    calculator = await MockCalculator.deploy();
    await calculator.setPrice(ethers.parseEther("1"));

    // Deploy AVGXVault
    const AVGXVault = await hre.ethers.getContractFactory("AVGXVault");
    vault = await AVGXVault.deploy(owner.address, await baseAsset.getAddress(), owner.address); // Using owner as dummy amm

    // Deploy AVGXAMM
    const AVGXAMM = await hre.ethers.getContractFactory("AVGXAMM");
    amm = await AVGXAMM.deploy(
      owner.address,
      await avgxToken.getAddress(),
      await calculator.getAddress(),
      await baseAsset.getAddress(),
      await vault.getAddress()
    );

    // Grant roles
    const MINTER_ROLE = await avgxToken.MINTER_ROLE();
    await avgxToken.connect(owner).grantRole(MINTER_ROLE, await amm.getAddress());

    const GOVERNOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GOVERNOR_ROLE"));
    await vault.connect(owner).grantRole(GOVERNOR_ROLE, await amm.getAddress());

    // Mint some base asset to user1
    await baseAsset.mint(user1.address, ethers.parseUnits("10000", 6));
  });

  it("should allow a user to mint and redeem AVGX tokens", async function () {
    // MockCalculator is used in this test, so we don't need to set up the oracle.

    // 2. Mint AVGX tokens
    const baseIn = ethers.parseUnits("1000", 6);
    await baseAsset.connect(user1).approve(amm.getAddress(), baseIn);

    const [avgxOut, mintFee] = await amm.getQuoteMint(baseIn);
    await expect(amm.connect(user1).mintWithBase(baseIn, avgxOut, user1.address))
      .to.emit(amm, "MintedWithBase");

    const userAvgxBalance = await avgxToken.balanceOf(user1.address);
    expect(userAvgxBalance).to.be.closeTo(avgxOut, 1);

    const vaultBalance = await vault.getBalance();
    expect(vaultBalance).to.equal(baseIn - mintFee);

    // 3. Redeem AVGX tokens
    await avgxToken.connect(user1).approve(amm.getAddress(), userAvgxBalance);

    const [baseOut, redeemFee] = await amm.getQuoteRedeem(userAvgxBalance);
    await expect(amm.connect(user1).redeemForBase(userAvgxBalance, 0, user1.address))
      .to.emit(amm, "RedeemedForBase");

    const finalUserAvgxBalance = await avgxToken.balanceOf(user1.address);
    expect(finalUserAvgxBalance).to.equal(0);

    const finalUserBaseBalance = await baseAsset.balanceOf(user1.address);
    const expectedBaseBalance = ethers.parseUnits("10000", 6) - baseIn + (baseOut - redeemFee);
    expect(finalUserBaseBalance).to.be.closeTo(expectedBaseBalance, 1);
  });
});
