import { Deployer, Reporter } from '@solarity/hardhat-migrate';
import { ethers } from 'hardhat';

import { L2MessageReceiverV2__factory, MOROFT__factory } from '@/generated-types/ethers';

// TO BE RUN WITH: --network base

// MOROFT `owner()` on Base. Also used as the
// `delegate_`/owner of the new `L2MessageReceiverV2` below, for the same reason as on Arbitrum.
// RE-VERIFY (`moroft.owner()`) immediately before running for real.
const baseAdminAddress = '0xf3ef00168DD40Eae68A7E670d56C7b8724E0c183';

const moroftAddress = '0x7431aDa8a591C955a994a21710752EF9b882b8e3';

// LayerZero V2 `EndpointV2`, same address on (almost) every EVM chain.
// https://docs.layerzero.network/v2/deployments/deployed-contracts -- RE-VERIFY before running for real.
const lzEndpointV2Address = '0x1a44076050125825900e736c501f859c50fE728c';

// Ethereum eid -- the mint message's source chain.
const ethereumEid = 30101;

// `L1SenderV2` proxy on Ethereum. Its address does NOT change when it's upgraded to `L1SenderV3` in
// `3_mainnet.ts` (upgrade = same proxy, new implementation) -- unlike this file's original plan
// note suggested, the address IS already known, so the peer is wired here rather than "later".
const l1SenderAddress = '0x2Efd4430489e1a05A89c2f51811aC661B7E5FF84';

let l2MessageReceiverAddress = '';

module.exports = async function (deployer: Deployer) {
  // TO BE CALLED BY DEPLOYER
  // Deploy the new `L2MessageReceiverV2` on Base, wire its peer to `L1Sender`, and hand ownership
  // to `baseAdminAddress` at the end -- it's never left owned by the deployer.
  await _step1(deployer);

  // TO BE CALLED BY the Base MOROFT admin (`baseAdminAddress`)
  // Add the new receiver as a MOROFT minter.
  // Unlike Arbitrum there is no old minter here to leave alone -- MOR was never minted on Base
  // before this feature, so there's nothing to phase out (no "phase 2" file for Base).
  await _step2(deployer);
};

const _step1 = async (deployer: Deployer) => {
  // Deployed with the actual caller (`msg.sender`) as the initial owner (not `baseAdminAddress`
  // directly) so it can run `setPeer` below itself, without needing the admin's signer. Ownership
  // moves to `baseAdminAddress` as the very last action of this step.
  const deployerAddress = await (await deployer.getSigner()).getAddress();

  const l2MessageReceiver = await deployer.deploy(
    L2MessageReceiverV2__factory,
    [lzEndpointV2Address, deployerAddress, moroftAddress],
    { name: 'L2MessageReceiverV2 (Base)' },
  );
  l2MessageReceiverAddress = await l2MessageReceiver.getAddress();

  await l2MessageReceiver.setPeer(ethereumEid, ethers.zeroPadValue(l1SenderAddress, 32));

  // Hand off ownership to the real admin -- MUST be the last call in this step.
  await l2MessageReceiver.transferOwnership(baseAdminAddress);

  Reporter.reportContracts(['L2MessageReceiverV2 (Base)', l2MessageReceiverAddress]);
};

const _step2 = async (deployer: Deployer) => {
  // Fork-only: `baseAdminAddress` may hold no ETH on the forked chain (real execution never hits
  // this -- the real admin signs with their own funded wallet, not an impersonated account).
  if ((await ethers.provider.getNetwork()).chainId === 31337n) {
    await ethers.provider.send('hardhat_setBalance', [baseAdminAddress, ethers.toQuantity(ethers.parseEther('1'))]);
  }

  const admin = await ethers.getImpersonatedSigner(baseAdminAddress);

  const moroft = await deployer.deployed(MOROFT__factory, moroftAddress);
  await moroft.connect(admin).updateMinter(l2MessageReceiverAddress, true);

  console.log(`New receiver is now a minter (expected: true): ${await moroft.isMinter(l2MessageReceiverAddress)}`);
};

// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol/8-add-base-as-l2 --only 2 --network base
// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol/8-add-base-as-l2 --only 2 --network base --verify --continue
