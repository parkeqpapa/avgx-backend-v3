# AVGX Protocol Smart Contracts

## Project Overview

This project contains the Solidity smart contracts for the AVGX protocol. AVGX is a decentralized protocol that allows users to mint and redeem a synthetic index token called AVGX. The protocol consists of the following core components:

- **AVGXToken.sol**: An ERC20 token that represents the synthetic index. It includes features for governance, pausing, and a maximum supply.
- **AVGXVault.sol**: A vault contract that holds the base asset used for minting and redeeming AVGX tokens. This provides liquidity to the protocol.
- **AVGXAMM.sol**: An Automated Market Maker (AMM) that allows users to mint and redeem AVGX tokens in exchange for the base asset. The AMM uses a calculator contract to determine the price of AVGX and charges fees for its services.
- **AVGXCalculator.sol**: (Inferred) A contract that calculates the AVGX index value.
- **AVGXOracleRouter.sol**: (Inferred) A contract that provides price feeds for the assets in the index.
- **AVGXAccessController.sol**: (Inferred) A contract that manages access control and permissions for the protocol.

The protocol is built using Hardhat and OpenZeppelin contracts.

## Building and Running

### Dependencies

- Node.js
- Yarn or npm

### Installation

```bash
npm install
```

### Compiling

```bash
npx hardhat compile
```

### Testing

```bash
npx hardhat test
```

### Deployment

The project is configured for deployment to the following networks:

- Sepolia
- Amoy (Polygon)
- Ethereum Mainnet
- Polygon Mainnet

To deploy the contracts, you will need to create a `.env` file with the following variables:

```
SEPOLIA_RPC_URL=<your_sepolia_rpc_url>
AMOY_RPC_URL=<your_amoy_rpc_url>
ETHEREUM_RPC_URL=<your_ethereum_rpc_url>
POLYGON_RPC_URL=<your_polygon_rpc_url>
PRIVATE_KEY=<your_private_key>
ETHERSCAN_API_KEY=<your_etherscan_api_key>
POLYGONSCAN_API_KEY=<your_polygonscan_api_key>
```

Then, you can run the deployment script:

```bash
npx hardhat run scripts/deploy.ts --network <network_name>
```

## Development Conventions

- **Solidity 0.8.24**: The contracts are written in Solidity version 0.8.24.
- **Hardhat**: The project uses the Hardhat development environment.
- **OpenZeppelin**: The contracts use OpenZeppelin for standard and secure contract components.
- **Access Control**: The contracts use a role-based access control system.
- **Testing**: The project has a comprehensive test suite.
