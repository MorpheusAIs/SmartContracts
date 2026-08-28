import { Deployer } from '@solarity/hardhat-migrate';
import { ethers } from 'hardhat';

import { MOROFT__factory } from '@/generated-types/ethers';

// TO BE RUN WITH: --network arbitrum

// MOROFT `owner()` on Arbitrum.
const arbitrumAdminAddress = '0x151c2b49CdEC10B150B2763dF3d1C00D70C90956';

const moroftAddress = '0x092bAaDB7DEf4C3981454dD9c0A0D7FF07bCFc86';

// The OLD (LayerZero V1) `L2MessageReceiver`, being retired here.
const oldL2MessageReceiverAddress = '0xd4a8ECcBe696295e68572A98b1aA70Aa9277d427';

module.exports = async function (deployer: Deployer) {
  // TO BE CALLED BY the Arbitrum MOROFT admin (`arbitrumAdminAddress`)
  await _step1(deployer);
};

const _step1 = async (deployer: Deployer) => {
  // Fork-only: `arbitrumAdminAddress` may hold no ETH on the forked chain (real execution never
  // hits this -- the real admin signs with their own funded wallet, not an impersonated account).
  if ((await ethers.provider.getNetwork()).chainId === 31337n) {
    await ethers.provider.send('hardhat_setBalance', [arbitrumAdminAddress, ethers.toQuantity(ethers.parseEther('1'))]);
  }

  const admin = await ethers.getImpersonatedSigner(arbitrumAdminAddress);
  const moroft = await deployer.deployed(MOROFT__factory, moroftAddress);

  const wasMinter = await moroft.isMinter(oldL2MessageReceiverAddress);
  if (!wasMinter) {
    throw new Error('Old `L2MessageReceiver` is already not a minter -- nothing to do, check state before proceeding.');
  }

  await moroft.connect(admin).updateMinter(oldL2MessageReceiverAddress, false);

  console.log(
    `Old receiver is still a minter (expected: false): ${await moroft.isMinter(oldL2MessageReceiverAddress)}`,
  );
};

// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol/8-add-base-as-l2 --only 4 --network arbitrum
