
import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "ethers";

describe("AVGXAccessController", function () {
  const GOVERNOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GOVERNOR_ROLE"));
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));

  async function deployAccessControllerFixture() {
    const [owner, addr1, addr2] = await hre.ethers.getSigners();

    const AVGXAccessController = await hre.ethers.getContractFactory(
      "AVGXAccessController"
    );
    const accessController = await AVGXAccessController.deploy(owner.address);

    return { accessController, owner, addr1, addr2 };
  }

  describe("Deployment", function () {
    it("Should set the deployer as DEFAULT_ADMIN_ROLE and GOVERNOR_ROLE", async function () {
      const { accessController, owner } = await loadFixture(
        deployAccessControllerFixture
      );

      const DEFAULT_ADMIN_ROLE =
        "0x0000000000000000000000000000000000000000000000000000000000000000";

      expect(await accessController.hasRole(DEFAULT_ADMIN_ROLE, owner.address))
        .to.be.true;
      expect(await accessController.hasRole(GOVERNOR_ROLE, owner.address)).to.be
        .true;
    });
  });

  describe("Role Management", function () {
    it("Should grant a role to multiple accounts in a batch", async function () {
      const { accessController, addr1, addr2 } = await loadFixture(
        deployAccessControllerFixture
      );

      await accessController.grantRoleBatch(MINTER_ROLE, [
        addr1.address,
        addr2.address,
      ]);

      expect(await accessController.hasRole(MINTER_ROLE, addr1.address)).to.be
        .true;
      expect(await accessController.hasRole(MINTER_ROLE, addr2.address)).to.be
        .true;
    });

    it("Should revoke a role from multiple accounts in a batch", async function () {
      const { accessController, addr1, addr2 } = await loadFixture(
        deployAccessControllerFixture
      );

      await accessController.grantRoleBatch(MINTER_ROLE, [
        addr1.address,
        addr2.address,
      ]);
      await accessController.revokeRoleBatch(MINTER_ROLE, [
        addr1.address,
        addr2.address,
      ]);

      expect(await accessController.hasRole(MINTER_ROLE, addr1.address)).to.be
        .false;
      expect(await accessController.hasRole(MINTER_ROLE, addr2.address)).to.be
        .false;
    });

    it("Should emit RoleGrantedBatch event", async function () {
      const { accessController, addr1, addr2 } = await loadFixture(
        deployAccessControllerFixture
      );

      await expect(
        accessController.grantRoleBatch(MINTER_ROLE, [
          addr1.address,
          addr2.address,
        ])
      )
        .to.emit(accessController, "RoleGrantedBatch")
        .withArgs(MINTER_ROLE, [addr1.address, addr2.address]);
    });

    it("Should emit RoleRevokedBatch event", async function () {
      const { accessController, addr1, addr2 } = await loadFixture(
        deployAccessControllerFixture
      );

      await accessController.grantRoleBatch(MINTER_ROLE, [
        addr1.address,
        addr2.address,
      ]);

      await expect(
        accessController.revokeRoleBatch(MINTER_ROLE, [
          addr1.address,
          addr2.address,
        ])
      )
        .to.emit(accessController, "RoleRevokedBatch")
        .withArgs(MINTER_ROLE, [addr1.address, addr2.address]);
    });

    it("Should fail to grant roles if caller is not an admin", async function () {
      const { accessController, addr1, addr2 } = await loadFixture(
        deployAccessControllerFixture
      );

      await expect(
        accessController
          .connect(addr1)
          .grantRoleBatch(MINTER_ROLE, [addr1.address, addr2.address])
      ).to.be.reverted;
    });
  });

  describe("hasAnyRole", function () {
    it("Should return true if the account has at least one of the roles", async function () {
      const { accessController, addr1 } = await loadFixture(
        deployAccessControllerFixture
      );

      await accessController.grantRole(MINTER_ROLE, addr1.address);

      expect(
        await accessController.hasAnyRole(addr1.address, [
          GOVERNOR_ROLE,
          MINTER_ROLE,
        ])
      ).to.be.true;
    });

    it("Should return false if the account has none of the roles", async function () {
      const { accessController, addr1 } = await loadFixture(
        deployAccessControllerFixture
      );

      expect(
        await accessController.hasAnyRole(addr1.address, [
          GOVERNOR_ROLE,
          MINTER_ROLE,
        ])
      ).to.be.false;
    });
  });
});
