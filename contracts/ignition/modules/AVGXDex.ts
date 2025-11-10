
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { ethers } from "ethers";

const AVGXModule = buildModule("AVGXModule", (m) => {
  // Define constants for deployment
  const ADMIN_ADDRESS = m.getAccount(0);
  const USDC_AMOY_ADDRESS = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582"; // USDC on Polygon Amoy

  // Deploy AVGXAccessController
  const accessController = m.contract("AVGXAccessController", [ADMIN_ADDRESS]);

  // Deploy AVGXToken
  const avgxToken = m.contract("AVGXToken", [accessController]);

  // Deploy AVGXOracleRouter

  const oracleRouter = m.contract("AVGXOracleRouter", []);

  // Configure Oracles
  // Using POL/USD as a placeholder for BTC/USD and ETH/USD feeds on Amoy
  // TODO: Replace with actual BTC/USD and ETH/USD price feed addresses when available
  const btcUsdPriceFeed = "0x001382149eBa3441043c1c66972b4772963f5D43"; // POL/USD
  const ethUsdPriceFeed = "0x001382149eBa3441043c1c66972b4772963f5D43"; // POL/USD

  m.call(oracleRouter, "setFeed", [ethers.id("BTC"), btcUsdPriceFeed, false, 8], { id: "SetBtcFeed" });
  m.call(oracleRouter, "setFeed", [ethers.id("ETH"), ethUsdPriceFeed, false, 8], { id: "SetEthFeed" });


  // Deploy AVGXCalculator
  const calculator = m.contract("AVGXCalculator2", [accessController, oracleRouter]);

  // Deploy AVGXVault and AVGXAMM
  const vault = m.contract("AVGXVault", [USDC_AMOY_ADDRESS]);
  const amm = m.contract("AVGXAMM", [avgxToken, calculator, USDC_AMOY_ADDRESS]);

  // Set circular dependencies
  const GOVERNOR_ROLE = ethers.id("GOVERNOR_ROLE");
  m.call(vault, "grantRole", [GOVERNOR_ROLE, ADMIN_ADDRESS], { id: "GrantGovernorRoleToAdminOnVault" });
  m.call(amm, "grantRole", [GOVERNOR_ROLE, ADMIN_ADDRESS], { id: "GrantGovernorRoleToAdminOnAmm" });
  m.call(vault, "setAmm", [amm], { id: "SetAmm" });
  m.call(amm, "setVault", [vault], { id: "SetVault" });

  // Deploy AVGXTimelock
  const minDelay = 3600; // 1 hour
  const proposers = [ADMIN_ADDRESS];
  const executors = [ADMIN_ADDRESS];
  const timelock = m.contract("AVGXTimelock", [minDelay, proposers, executors, ADMIN_ADDRESS]);

  // Grant roles
  const MINTER_ROLE = ethers.id("MINTER_ROLE");
  const PAUSER_ROLE = ethers.id("PAUSER_ROLE");
  const ORACLE_MANAGER_ROLE = ethers.id("ORACLE_MANAGER_ROLE");

  m.call(accessController, "grantRole", [MINTER_ROLE, amm], { id: "GrantMinterRole" });
  m.call(accessController, "grantRole", [GOVERNOR_ROLE, timelock], { id: "GrantGovernorRole" });
  m.call(accessController, "grantRole", [PAUSER_ROLE, ADMIN_ADDRESS], { id: "GrantPauserRole" });
  m.call(oracleRouter, "grantRole", [ORACLE_MANAGER_ROLE, ADMIN_ADDRESS], { id: "GrantOracleManagerRole" });

  return {
    accessController,
    avgxToken,
    oracleRouter,
    calculator,
    vault,
    amm,
    timelock,
  };
});

export default AVGXModule;
