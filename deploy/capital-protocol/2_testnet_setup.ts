import { Deployer } from '@solarity/hardhat-migrate';
import { ethers } from 'hardhat';

import {
  ChainLinkDataConsumer__factory,
  DepositPool__factory,
  Distributor__factory,
  ERC20Mock__factory,
  L1SenderV2__factory,
} from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';

// Ethereum Sepolia
const config = {
  cldkAddress: '0x87EF8041Af952a44C926e368b7E437f614597B11',
  rewardPoolAddress: '0xbFDbe9c7E6c8bBda228c6314E24E9043faeEfB32',
  l1SenderV2Address: '0x85e398705d7D77F1703b61DD422869A67B3B409d',
  distributorAddress: '0x65b8676392432B1cBac1BE4792a5867A8CA2f375',
  depositPoolStEthAddress: '0xFea33A23F97d785236F22693eDca564782ae98d0',
  depositPoolLinkAddress: '0x7f4f17be21219D7DA4C8E0d0B9be6a778354E5A5',
  layerZeroConfig: {
    gateway: '0xae92d5aD7583AD66E49A0c67BAd18F6ba52dDDc1',
    receiver: '0xd232274927b19b6A30F95377eF65B1Ba5fd6357f',
    receiverChainId: '10231',
    zroPaymentAddress: '0x0000000000000000000000000000000000000000',
    adapterParams: '0x',
  },
};

module.exports = async function (deployer: Deployer) {
  const block = await ethers.provider.getBlock('latest');
  const now = block ? block.timestamp : 1;

  const chainLinkDataConsumer = await deployer.deployed(ChainLinkDataConsumer__factory, config.cldkAddress);
  const l1SenderV2 = await deployer.deployed(L1SenderV2__factory, config.l1SenderV2Address);
  const distributor = await deployer.deployed(Distributor__factory, config.distributorAddress);
  const depositPoolStEth = await deployer.deployed(DepositPool__factory, config.depositPoolStEthAddress);
  const depositPoolLink = await deployer.deployed(DepositPool__factory, config.depositPoolLinkAddress);
  const stETH = await deployer.deployed(ERC20Mock__factory, await depositPoolStEth.depositToken());
  const stETHAddress = await stETH.getAddress();
  const link = await deployer.deployed(ERC20Mock__factory, await depositPoolLink.depositToken());
  const linkAddress = await link.getAddress();

  //// SETUP ChainLink Data Consumer
  await chainLinkDataConsumer.updateDataFeeds(['ETH/USD'], [['0x694AA1769357215DE4FAC081bf1f309aDC325306']]);
  await chainLinkDataConsumer.updateDataFeeds(['LINK/USD'], [['0xc59E3633BAAC79493d908e63626716e204A45EdF']]);

  //// SETUP L1SenderV2
  await l1SenderV2.setDistributor(await distributor.getAddress());
  await l1SenderV2.setStETh(stETHAddress);
  await l1SenderV2.setLayerZeroConfig(config.layerZeroConfig);

  //// SETUP Distributor
  await distributor.setMinRewardsDistributePeriod(60 * 60 * 10); // 10 minutes
  for (let i = 0; i < 5; i++) {
    await distributor.setRewardPoolLastCalculatedTimestamp(i, now - 300);
  }
  // Add deposit pools
  await distributor.addDepositPool(0, config.depositPoolStEthAddress, stETHAddress, 'ETH/USD', 0);
  for (let i = 1; i < 5; i++) {
    await distributor.addDepositPool(i, config.depositPoolStEthAddress, ZERO_ADDR, '', 1);
  }
  await distributor.addDepositPool(0, config.depositPoolLinkAddress, linkAddress, 'LINK/USD', 2);

  //// SETUP Deposit Pools
  await depositPoolStEth.setRewardPoolProtocolDetails(0, 600, 300, 120, wei(0.0001));
  await depositPoolLink.setRewardPoolProtocolDetails(0, 1200, 600, 240, wei(0.0002, 6));

  await depositPoolStEth.migrate(0);
  await depositPoolLink.migrate(0);

  //// CHECK, comment unused lines
  // await stETH.approve(config.depositPoolStEthAddress, wei(9999));
  // await depositPoolStEth.stake(0, wei(0.02), 0, ZERO_ADDR);
  // await stETH.transfer(config.distributorAddress, wei(1));
  // await depositPoolStEth.withdraw(0, wei(0.01));
  // await stETH.transfer(config.distributorAddress, wei(1));
  // await depositPoolStEth.claim(0, (await deployer.getSigner()).getAddress(), { value: wei(0.02) });

  // await link.approve(config.depositPoolLinkAddress, wei(9999));
  // await depositPoolLink.stake(0, wei(0.02), 0, ZERO_ADDR);
  // await depositPoolLink.withdraw(0, wei(0.01));
  await depositPoolLink.claim(0, (await deployer.getSigner()).getAddress(), { value: wei(0.1) });
};

// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol --only 2
// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol --network sepolia --only 2
