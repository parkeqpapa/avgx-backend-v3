import { expect } from "chai";
import { ethers } from "ethers";
import hre from "hardhat";

describe("AVGXToken", function () {
  let avgxToken: any;
  let owner: any;
  let governor: any;
  let addr1: any;
  let pauser: any;

  beforeEach(async function () {
    [owner, addr1, governor, pauser] = await hre.ethers.getSigners();

    const AVGXToken = await hre.ethers.getContractFactory("AVGXToken");
    avgxToken = await AVGXToken.deploy(owner.address);

    const MINTER_ROLE = await avgxToken.MINTER_ROLE();
    await avgxToken.grantRole(MINTER_ROLE, owner.address);

    const GOVERNOR_ROLE = await avgxToken.GOVERNOR_ROLE();
    await avgxToken.grantRole(GOVERNOR_ROLE, governor.address);

    const PAUSER_ROLE = await avgxToken.PAUSER_ROLE();
    await avgxToken.grantRole(PAUSER_ROLE, pauser.address);
  });

  it("Should have the correct name and symbol", async function () {
    expect(await avgxToken.name()).to.equal("AVGX");
    expect(await avgxToken.symbol()).to.equal("AVGX");
  });

  it("Should return the correct number of decimals", async function () {
    expect(await avgxToken.decimals()).to.equal(18);
  });

  it("Should mint tokens to a specified address", async function () {
    const mintAmount = ethers.parseEther("100");
    await avgxToken.mint(addr1.address, mintAmount);
    expect(await avgxToken.balanceOf(addr1.address)).to.equal(mintAmount);
  });

  it("Should not mint tokens if the caller is not the minter", async function () {
    const mintAmount = ethers.parseEther("100");
    await expect(avgxToken.connect(addr1).mint(addr1.address, mintAmount)).to.be
      .reverted;
  });

  it("Should burn tokens from a specified address", async function () {
    const mintAmount = ethers.parseEther("100");
    await avgxToken.mint(owner.address, mintAmount);
    await avgxToken.burn(mintAmount);
    expect(await avgxToken.balanceOf(owner.address)).to.equal(0);
  });

  it("Should not burn tokens if the caller is not the owner or approved", async function () {
    const mintAmount = ethers.parseEther("100");
    await avgxToken.mint(addr1.address, mintAmount);
    await expect(avgxToken.burn(mintAmount)).to.be.reverted;
  });
  it("Should allow a user with allowance to burn tokens from another address", async function () {
    const mintAmount = ethers.parseEther("100");
    await avgxToken.mint(owner.address, mintAmount);

    await avgxToken.connect(owner).approve(addr1.address, mintAmount);

    await avgxToken.connect(addr1).burnFrom(owner.address, mintAmount);

    expect(await avgxToken.balanceOf(owner.address)).to.equal(0);
  });

  it("Should increment maximum supply if the caller is the governor", async function () {
    const incrementAmount = ethers.parseEther("100");
    await avgxToken.connect(governor).setMaxSupply(incrementAmount);
    const maxSupply = await avgxToken.maxSupplyAVGX();
    expect(maxSupply).to.equal(incrementAmount);
  });

  it("Should revert when unauthorized user tries to increment the max supply", async function () {
    const incrementAmount = ethers.parseEther("100");
    await expect(avgxToken.connect(addr1).setMaxSupply(incrementAmount)).to.be
      .reverted;
  });

  it("Should allow pauser to pause and unpause", async function () {
    await avgxToken.connect(pauser).pause();
    expect(await avgxToken.paused()).to.be.true;

    await avgxToken.connect(pauser).unpause();
    expect(await avgxToken.paused()).to.be.false;
  });

  it("Should prevent non-pausers from pausing", async function () {
    await expect(avgxToken.connect(addr1).pause()).to.be.reverted;
  });

  it("Should prevent transfers when paused", async function () {
    const mintAmount = ethers.parseEther("100");
    await avgxToken.mint(owner.address, mintAmount);

    await avgxToken.connect(pauser).pause();

    await expect(
      avgxToken.transfer(addr1.address, mintAmount)
    ).to.be.revertedWithCustomError(avgxToken, "EnforcedPause()");
  });

  describe("ERC20Permit", function () {
    it("Should return the correct nonce for an address", async function () {
      expect(await avgxToken.nonces(owner.address)).to.equal(0);
    });
  });

  describe("ERC165", function () {
    it("Should support the IERC165 interface", async function () {
      expect(await avgxToken.supportsInterface("0x01ffc9a7")).to.be.true;
    });

    it("Should support the IAccessControl interface", async function () {
      expect(await avgxToken.supportsInterface("0x7965db0b")).to.be.true;
    });
  });

  describe("Edge Cases", function () {
    it("Should revert if trying to mint more than max supply", async function () {
      const maxSupply = ethers.parseEther("1000");
      await avgxToken.connect(governor).setMaxSupply(maxSupply);

      const mintAmount = ethers.parseEther("1001");
      await expect(
        avgxToken.mint(owner.address, mintAmount)
      ).to.be.revertedWithCustomError(avgxToken, "MaxSupplyExceeded");
    });

    it("Should revert if trying to set max supply twice", async function () {
      const maxSupply = ethers.parseEther("1000");
      await avgxToken.connect(governor).setMaxSupply(maxSupply);

      await expect(
        avgxToken.connect(governor).setMaxSupply(maxSupply)
      ).to.be.revertedWithCustomError(avgxToken, "MaxSupplyAlreadySet");
    });

    it("Should allow minter to burn tokens from another address", async function () {
      const mintAmount = ethers.parseEther("100");
      await avgxToken.mint(addr1.address, mintAmount);

      await avgxToken.burnFrom(addr1.address, mintAmount);
      expect(await avgxToken.balanceOf(addr1.address)).to.equal(0);
    });
  });
});
