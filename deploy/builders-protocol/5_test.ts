import { Deployer } from '@solarity/hardhat-migrate';
import { ethers } from 'hardhat';

import { Builders__factory } from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

module.exports = async function (deployer: Deployer) {
  const contract = await deployer.deployed(Builders__factory, '0xC0eD68f163d44B6e9985F0041fDf6f67c6BCFF3f');

  const senderAddress1 = '0x6ef685caad228db04a317f2348202057989f5d01';
  const sender1 = await ethers.getImpersonatedSigner(senderAddress1);

  await contract
    .connect(sender1)
    .withdraw('0x6e241e029eb1ba3fa48ae756f9fce646deff59657a67462d4f7873f1dec0f83a', wei(9999));

  const senderAddress2 = '0x86b9d55a729037763c47cecd26a865d887a3c771';
  const sender2 = await ethers.getImpersonatedSigner(senderAddress2);

  await contract
    .connect(sender2)
    .withdraw('0x6e241e029eb1ba3fa48ae756f9fce646deff59657a67462d4f7873f1dec0f83a', wei(9999));
};

// npx hardhat migrate --path-to-migrations ./deploy/builders-protocol --only 5
// npx hardhat migrate --path-to-migrations ./deploy/builders-protocol --network arbitrum_sepolia --only 5 --verify --continue
