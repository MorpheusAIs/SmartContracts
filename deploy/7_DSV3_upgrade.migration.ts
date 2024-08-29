import { Deployer, Reporter } from '@solarity/hardhat-migrate';

import { DistributionV2__factory, DistributionV3__factory } from '@/generated-types/ethers';

module.exports = async function (deployer: Deployer) {
  const distribution = await deployer.deployed(DistributionV2__factory, '0x47176B2Af9885dC6C4575d4eFd63895f7Aaa4790');

  const distributionV3Impl = await deployer.deploy(DistributionV3__factory);

  // await distribution.upgradeTo(await distributionV2Impl.getAddress());

  // console.log(await distribution.getCurrentUserReward(0, await deployer.getSigner()));

  Reporter.reportContracts(
    ['DistributionV3Impl', await distributionV3Impl.getAddress()],
    ['DistributionV3', await distribution.getAddress()],
  );
};

// npx hardhat migrate --network localhost --only 7
// npx hardhat migrate --network sepolia --only 7 --verify
