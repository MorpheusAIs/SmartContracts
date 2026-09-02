import { Deployer } from '@solarity/hardhat-migrate';
import { ethers } from 'hardhat';

import { L1SenderV3__factory } from '@/generated-types/ethers';

// TO BE RUN WITH: --network ethereum
//
// Only run this AFTER `3_mainnet.ts` -- it configures `L1SenderV3`, which only exists once that
// file's `_step2` has upgraded the `L1Sender` proxy.

const msAddress = '0x1FE04BC15Cf2c5A2d41a0b3a96725596676eBa1E';
const l1SenderAddress = '0x2Efd4430489e1a05A89c2f51811aC661B7E5FF84';

// L1 wstETH, same token as `arbitrumBridgeConfig.wstETH`.
const wstETHAddress = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0';

// Bridged wstETH on Base, and Lido's own L1ERC20TokenBridge (NOT the generic OP Stack
// `L1StandardBridge` -- Base's bridged wstETH is only mintable by Lido's own bridge).
// https://docs.lido.fi/deployed-contracts/ (Base section) -- RE-VERIFY before running for real.
const remoteWstETHAddress = '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452';
const lidoBaseL1BridgeAddress = '0x9de443AdC5A411E83F1878Ef24C3F52C61571e72';

// Filled in from the `Reporter.reportContracts` output of `5_base_token_receiver.ts`.
// TODO: placeholder for fork dry-runs (non-zero so `setBaseBridgeConfig`'s `receiver != address(0)`
// check passes) -- REPLACE with the real deployed address before running for real.
const baseTokenReceiverAddress = '0x0000000000000000000000000000000000000001';

module.exports = async function (deployer: Deployer) {
  // TO BE CALLED BY MS
  await _step1(deployer);
};

const _step1 = async (deployer: Deployer) => {
  if (
    !baseTokenReceiverAddress ||
    baseTokenReceiverAddress.toLowerCase() === '0x0000000000000000000000000000000000000001'
  ) {
    throw new Error('Set `baseTokenReceiverAddress` from `5_base_token_receiver.ts` first.');
  }

  const ms = await ethers.getImpersonatedSigner(msAddress);

  const l1Sender = await deployer.deployed(L1SenderV3__factory, l1SenderAddress);
  await l1Sender.connect(ms).setBaseBridgeConfig({
    wstETH: wstETHAddress,
    remoteWstETH: remoteWstETHAddress,
    bridge: lidoBaseL1BridgeAddress,
    receiver: baseTokenReceiverAddress,
  });
};

// Before relying on this in production: call `sendWstETHToBase(probeWstETHWei, 200_000, "0x")` and
// confirm it lands as the bridged wstETH on `L2TokenReceiverV3` on Base. `amount_` is capped to the
// post-wrap balance -- a value larger than the balance is silently capped to it, not reverted, so a
// real probe amount (not `type(uint256).max`) actually sends only that much. Reverts here are safe
// (no funds move on a revert).

// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol/8-add-base-as-l2 --only 6 --network ethereum
// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol/8-add-base-as-l2 --only 6 --network ethereum --verify --continue
