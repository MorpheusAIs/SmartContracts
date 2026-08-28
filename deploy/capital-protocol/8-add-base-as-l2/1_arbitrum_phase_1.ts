import { Deployer, Reporter } from '@solarity/hardhat-migrate';
import { ethers } from 'hardhat';

import { L2MessageReceiverV2__factory, MOROFT__factory } from '@/generated-types/ethers';

// TO BE RUN WITH: --network arbitrum

// MOROFT `owner()` on Arbitrum.
const arbitrumAdminAddress = '0x151c2b49CdEC10B150B2763dF3d1C00D70C90956';

const moroftAddress = '0x092bAaDB7DEf4C3981454dD9c0A0D7FF07bCFc86';

// The OLD (LayerZero V1) receiver. Only read here for a sanity check in `_step2`; it is NOT
// touched -- it keeps minting until `4_arbitrum_phase_2.ts` runs, after `3_mainnet.ts` is live and
// a real end-to-end claim has been verified on this new path.
const oldL2MessageReceiverAddress = '0xd4a8ECcBe696295e68572A98b1aA70Aa9277d427';

// LayerZero V2 `EndpointV2`, same address on (almost) every EVM chain.
// https://docs.layerzero.network/v2/deployments/deployed-contracts -- RE-VERIFY before running for real.
const lzEndpointV2Address = '0x1a44076050125825900e736c501f859c50fE728c';

// Ethereum eid -- the mint message's source chain.
const ethereumEid = 30101;

// `L1SenderV2` proxy on Ethereum. Its address does NOT change when it's upgraded to `L1SenderV3`
// in `3_mainnet.ts` (upgrade = same proxy, new implementation) -- so the peer can safely be wired
// to it here, before that upgrade even happens.
const l1SenderAddress = '0x2Efd4430489e1a05A89c2f51811aC661B7E5FF84';

let l2MessageReceiverAddress = '';

module.exports = async function (deployer: Deployer) {
  // TO BE CALLED BY DEPLOYER
  // Deploy the new `L2MessageReceiverV2` on Arbitrum, wire its peer to `L1Sender`, and hand
  // ownership to `arbitrumAdminAddress` at the end -- it's never left owned by the deployer.
  await _step1(deployer);

  // TO BE CALLED BY the Arbitrum MOROFT admin (`arbitrumAdminAddress`)
  // Add the new receiver as an additional MOROFT minter.
  await _step2(deployer);
};

const _step1 = async (deployer: Deployer) => {
  // Deployed with the actual caller (`msg.sender`) as the initial owner (not `arbitrumAdminAddress`
  // directly) so it can run `setPeer` below itself, without needing the admin's signer. Ownership
  // moves to `arbitrumAdminAddress` as the very last action of this step.
  const deployerAddress = await (await deployer.getSigner()).getAddress();

  const l2MessageReceiver = await deployer.deploy(
    L2MessageReceiverV2__factory,
    [lzEndpointV2Address, deployerAddress, moroftAddress],
    { name: 'L2MessageReceiverV2 (Arbitrum)' },
  );
  l2MessageReceiverAddress = await l2MessageReceiver.getAddress();

  await l2MessageReceiver.setPeer(ethereumEid, ethers.zeroPadValue(l1SenderAddress, 32));

  // Hand off ownership to the real admin -- MUST be the last call in this step.
  await l2MessageReceiver.transferOwnership(arbitrumAdminAddress);

  Reporter.reportContracts(['L2MessageReceiverV2 (Arbitrum)', l2MessageReceiverAddress]);
};

const _step2 = async (deployer: Deployer) => {
  // Fork-only: `arbitrumAdminAddress` may hold no ETH on the forked chain (real execution never
  // hits this -- the real admin signs with their own funded wallet, not an impersonated account).
  if ((await ethers.provider.getNetwork()).chainId === 31337n) {
    await ethers.provider.send('hardhat_setBalance', [arbitrumAdminAddress, ethers.toQuantity(ethers.parseEther('1'))]);
  }

  const admin = await ethers.getImpersonatedSigner(arbitrumAdminAddress);

  const moroft = await deployer.deployed(MOROFT__factory, moroftAddress);

  console.log(`Old receiver is still a minter (expected: true): ${await moroft.isMinter(oldL2MessageReceiverAddress)}`);

  // The old V1 minter is intentionally NOT removed here -- both stay active in parallel until
  // `4_arbitrum_phase_2.ts`, after `3_mainnet.ts` is live and a real claim has been verified.
  await moroft.connect(admin).updateMinter(l2MessageReceiverAddress, true);

  console.log(`New receiver is now a minter (expected: true): ${await moroft.isMinter(l2MessageReceiverAddress)}`);
};

// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol/8-add-base-as-l2 --only 1 --network arbitrum
// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol/8-add-base-as-l2 --only 1 --network arbitrum --verify --continue
