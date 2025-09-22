import { Deployer } from '@solarity/hardhat-migrate';
import { ethers } from 'hardhat';

import { DistributorV2__factory } from '@/generated-types/ethers';

const msAddress = '0x1FE04BC15Cf2c5A2d41a0b3a96725596676eBa1E';
const distributorAddress = '0xDf1AC1AC255d91F5f4B1E3B4Aef57c5350F64C7A';

module.exports = async function (deployer: Deployer) {
  const ms = await ethers.getImpersonatedSigner(msAddress);

  const impl = await deployer.deploy(DistributorV2__factory);
  const distributor = await deployer.deployed(DistributorV2__factory, distributorAddress);
  await distributor.connect(ms).upgradeTo(impl);
};

// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol/v7 --only 4
