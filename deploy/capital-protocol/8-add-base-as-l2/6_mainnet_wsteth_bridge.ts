import { Deployer } from '@solarity/hardhat-migrate';
import { ethers } from 'hardhat';

import { L1SenderV3__factory } from '@/generated-types/ethers';

// TO BE RUN WITH: --network ethereum
//
// Only run this AFTER `3_mainnet.ts` -- it configures `L1SenderV3`, which only exists once that
// file's `_step2` has upgraded the `L1Sender` proxy.

const msAddress = '0x1FE04BC15Cf2c5A2d41a0b3a96725596676eBa1E';
const l1SenderAddress = '0x2Efd4430489e1a05A89c2f51811aC661B7E5FF84';

// L1 wstETH, read from the live `L1SenderV2.arbitrumBridgeConfig().wstETH` on 2026-08-28 -- same
// token address is reused here (Base bridge config is self-contained, doesn't depend on the
// Arbitrum one being set -- see `IL1SenderV3.BaseBridgeConfig` NatSpec).
const wstETHAddress = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0';

// Bridged wstETH on Base + the OP Stack `L1StandardBridge` ("Base Bridge") -- RE-VERIFY both before
// running for real (see `.claude/base-network-support-plan.md` §4.2/§4.3).
const remoteWstETHAddress = '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452';
const baseBridgeAddress = '0x3154Cf16ccdb4C6d922629664174b904d80F2C35';

// Filled in from the `Reporter.reportContracts` output of `5_base_token_receiver.ts`.
// TODO: placeholder for fork dry-runs (non-zero so `setBaseBridgeConfig`'s `receiver != address(0)`
// check passes) -- REPLACE with the real deployed address before running for real.
const baseTokenReceiverAddress = '0x0000000000000000000000000000000000000001';

module.exports = async function (deployer: Deployer) {
  // TO BE CALLED BY MS
  await _step1(deployer);
};

const _step1 = async (deployer: Deployer) => {
  if (!baseTokenReceiverAddress) {
    throw new Error('Set `baseTokenReceiverAddress` from `5_base_token_receiver.ts` first.');
  }

  const ms = await ethers.getImpersonatedSigner(msAddress);

  const l1Sender = await deployer.deployed(L1SenderV3__factory, l1SenderAddress);
  await l1Sender.connect(ms).setBaseBridgeConfig({
    wstETH: wstETHAddress,
    remoteWstETH: remoteWstETHAddress,
    bridge: baseBridgeAddress,
    receiver: baseTokenReceiverAddress,
  });
};

// Before relying on this in production: send a small amount of wstETH through
// `sendWstETHToBase()` and confirm it actually lands on `L2TokenReceiverV3` on Base. Reverts here
// are safe (no funds move on a revert).

// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol/8-add-base-as-l2 --only 6 --network ethereum
// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol/8-add-base-as-l2 --only 6 --network ethereum --verify --continue
