import { Deployer } from '@solarity/hardhat-migrate';
import { ethers } from 'hardhat';

import { DepositPool__factory, DistributorV2__factory } from '@/generated-types/ethers';

const distributorAddress = '0xDf1AC1AC255d91F5f4B1E3B4Aef57c5350F64C7A';

// const depositPoolAddress = '0x6cCE082851Add4c535352f596662521B4De4750E'; // USDC
const depositPoolAddress = '0xdE283F8309Fd1AA46c95d299f6B8310716277A42'; // wBTC

const msAddress = '0x1FE04BC15Cf2c5A2d41a0b3a96725596676eBa1E';

module.exports = async function (deployer: Deployer) {
  const ms = await ethers.getImpersonatedSigner(msAddress);

  const impl = await deployer.deploy(DistributorV2__factory);
  const distributor = await deployer.deployed(DistributorV2__factory, distributorAddress);
  await distributor.connect(ms).upgradeTo(impl);

  // User steps
  const user = await ethers.getImpersonatedSigner('0x8FC88dDE93184fe5F5878F860B0bFD89115Eb96c');
  const depositPool = await deployer.deployed(DepositPool__factory, depositPoolAddress);

  await depositPool.connect(user).stake(0, '10000', 0, user);
  // await depositPool.connect(user).withdraw(0, '10000');
};

// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol/v7 --only 3
