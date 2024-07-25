import { Deployer, Reporter } from '@solarity/hardhat-migrate';

import { DistributionV2__factory } from '@/generated-types/ethers';

module.exports = async function (deployer: Deployer) {
  const distribution = await deployer.deployed(DistributionV2__factory, '0x47176B2Af9885dC6C4575d4eFd63895f7Aaa4790');

  const distributionV2Impl = await deployer.deploy(DistributionV2__factory);

  // await distribution.upgradeTo(await distributionV2Impl.getAddress());

  // console.log(await distribution.getCurrentUserReward(0, await deployer.getSigner()));

  Reporter.reportContracts(
    ['DistributionV2Impl', await distributionV2Impl.getAddress()],
    ['DistributionV2', await distribution.getAddress()],
  );
};

// npx hardhat migrate --network localhost --only 6
// npx hardhat migrate --network sepolia --only 6 --verify
