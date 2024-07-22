import { Deployer, Reporter } from '@solarity/hardhat-migrate';

import { DistributionExt__factory, ERC1967Proxy__factory } from '@/generated-types/ethers';

const distributionAddress = '0x47176B2Af9885dC6C4575d4eFd63895f7Aaa4790';
const poolIds = [0, 1, 2, 3, 4];

module.exports = async function (deployer: Deployer) {
  const distributionExtImpl = await deployer.deploy(DistributionExt__factory);
  const distributionExtProxy = await deployer.deploy(ERC1967Proxy__factory, [
    await distributionExtImpl.getAddress(),
    '0x',
  ]);

  const distributionExt = await deployer.deployed(DistributionExt__factory, await distributionExtProxy.getAddress());

  await distributionExt.DistributionExt_init(distributionAddress, poolIds);

  Reporter.reportContracts(['DistributionExt', await distributionExt.getAddress()]);
};

// npx hardhat migrate --only 5
// npx hardhat migrate --network ethereum --only 5 --verify
