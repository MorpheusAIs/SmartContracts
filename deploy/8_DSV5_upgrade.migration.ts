import { Deployer, Reporter } from '@solarity/hardhat-migrate';

// import { ethers } from 'hardhat';
import { DistributionV4__factory, DistributionV5__factory } from '@/generated-types/ethers';

module.exports = async function (deployer: Deployer) {
  const distribution = await deployer.deployed(DistributionV4__factory, '0x47176B2Af9885dC6C4575d4eFd63895f7Aaa4790');
  const distributionV5Impl = await deployer.deploy(DistributionV5__factory);

  // const owner = await ethers.getImpersonatedSigner(await distribution.owner());
  // await distribution.connect(owner).upgradeTo(await distributionV5Impl.getAddress());
  // console.log(await distribution.version());

  Reporter.reportContracts(
    ['DistributionV5Impl', await distributionV5Impl.getAddress()],
    ['DistributionV5', await distribution.getAddress()],
  );
};

// npx hardhat migrate --only 8
// npx hardhat migrate --network ethereum --only 8 --verify
// npx hardhat migrate --network sepolia --only 8 --verify
