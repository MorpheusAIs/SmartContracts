import { Deployer } from '@solarity/hardhat-migrate';
import { ethers } from 'hardhat';

import {
  AavePoolMock__factory,
  DepositPool__factory,
  DistributorV2__factory,
  StETHMock__factory,
} from '@/generated-types/ethers';

const distributorAddress = '0xDf1AC1AC255d91F5f4B1E3B4Aef57c5350F64C7A';

const depositPoolAddress = '0x47176B2Af9885dC6C4575d4eFd63895f7Aaa4790'; // stETH
// const depositPoolAddress = '0x6cCE082851Add4c535352f596662521B4De4750E'; // USDC
// const depositPoolAddress = '0xdE283F8309Fd1AA46c95d299f6B8310716277A42'; // wBTC

const msAddress = '0x1FE04BC15Cf2c5A2d41a0b3a96725596676eBa1E';

const awBTCAddress = '0x5Ee5bf7ae06D1Be5997A1A72006FE6C607eC6DE8';
const wBTCAddress = '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599';

module.exports = async function (deployer: Deployer) {
  // const ms = await ethers.getImpersonatedSigner(msAddress);

  // const impl = await deployer.deploy(DistributorV2__factory);
  // const distributor = await deployer.deployed(DistributorV2__factory, distributorAddress);
  // await distributor.connect(ms).upgradeTo(impl);

  // // User steps
  // const user = await ethers.getImpersonatedSigner('0x8FC88dDE93184fe5F5878F860B0bFD89115Eb96c');
  // await ethers.provider.send('hardhat_setBalance', [user.address, `0x${ethers.parseEther('1').toString(16)}`]);
  // const depositPool = await deployer.deployed(DepositPool__factory, depositPoolAddress);

  // // console.log(await awBTC.balanceOf(distributorAddress));

  // // await depositPool.connect(user).stake(0, '10000', 0, user);
  // // await depositPool.connect(user).withdraw(0, '9999');

  // // const wBTC = await deployer.deployed(StETHMock__factory, wBTCAddress);
  // // const awBTC = await deployer.deployed(StETHMock__factory, awBTCAddress);

  // const user2 = await ethers.getImpersonatedSigner('0x495c2754a77070ebfe3d400f16cda29580a6236e')
  // const pool = await deployer.deployed(AavePoolMock__factory, '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2');

  const depositPool = await deployer.deployed(DepositPool__factory, depositPoolAddress);
  console.log(`Total deposited: ${await depositPool.totalDepositedInPublicPools()}`);
  // 11415373772137322881492
};

// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol/v7 --only 3
// 726461137
// 726461136
