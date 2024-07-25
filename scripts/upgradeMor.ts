import { ethers } from 'hardhat';

import { IL2MessageReceiver, L2MessageReceiver, L2TokenReceiver } from '@/generated-types/ethers';

async function main() {
  const weth = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';

  const signer = await ethers.getImpersonatedSigner('0x151c2b49CdEC10B150B2763dF3d1C00D70C90956');

  const l2MessageReceiverFactory = await ethers.getContractFactory('L2MessageReceiver', signer);

  const l2MessageReceiver = l2MessageReceiverFactory.attach(
    '0xd4a8ECcBe696295e68572A98b1aA70Aa9277d427',
  ) as L2MessageReceiver;

  const config: IL2MessageReceiver.ConfigStruct = {
    gateway: '0x3c2269811836af69497E5F486A85D7316753cf62',
    sender: '0x2Efd4430489e1a05A89c2f51811aC661B7E5FF84',
    senderChainId: 101n,
  };

  console.log('config', config);

  await l2MessageReceiver.setParams('0x092baadb7def4c3981454dd9c0a0d7ff07bcfc86', config);

  console.log(')');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// npx hardhat run scripts/upgradeMor.ts --network localhost
