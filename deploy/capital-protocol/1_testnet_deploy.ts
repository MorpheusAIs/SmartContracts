import { Deployer, Reporter } from '@solarity/hardhat-migrate';

import {
  ChainLinkDataConsumer__factory,
  DepositPool,
  DepositPool__factory,
  Distributor__factory,
  ERC1967Proxy__factory,
  L1SenderV2__factory,
  RewardPool__factory,
} from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

// Ethereum Sepolia
const config = {
  rewardPools: [
    {
      payoutStart: 1707393600,
      decreaseInterval: 86400,
      initialReward: wei(3456),
      rewardDecrease: wei(0.59255872824),
      isPublic: true,
    },
    {
      payoutStart: 1707393600,
      decreaseInterval: 86400,
      initialReward: wei(3456),
      rewardDecrease: wei(0.59255872824),
      isPublic: false,
    },
    {
      payoutStart: 1707393600,
      decreaseInterval: 86400,
      initialReward: wei(3456),
      rewardDecrease: wei(0.59255872824),
      isPublic: false,
    },
    {
      payoutStart: 1707393600,
      decreaseInterval: 86400,
      initialReward: wei(3456),
      rewardDecrease: wei(0.59255872824),
      isPublic: false,
    },
    {
      payoutStart: 1707393600,
      decreaseInterval: 86400,
      initialReward: wei(576),
      rewardDecrease: wei(0.09875978804),
      isPublic: false,
    },
  ],
  // https://aave.com/docs/resources/addresses
  aavePool: '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951',
  aavePoolDataProvider: '0x3e9708d80f7B3e43118013075F7e95CE3AB31F31',
  stEthMock: '0xa878Ad6FF38d6fAE81FBb048384cE91979d448DA',
  // https://sepolia.etherscan.io/token/0xf8fb3713d459d7c1018bd0a49d19b4c44290ebe5
  link: '0xf8fb3713d459d7c1018bd0a49d19b4c44290ebe5',
};

module.exports = async function (deployer: Deployer) {
  const chainLinkDataConsumer = await deployer.deployERC1967Proxy(ChainLinkDataConsumer__factory);
  await chainLinkDataConsumer.ChainLinkDataConsumer_init();

  const rewardPool = await deployer.deployERC1967Proxy(RewardPool__factory);
  await rewardPool.RewardPool_init(config.rewardPools);

  const l1SenderV2 = await deployer.deployERC1967Proxy(L1SenderV2__factory);
  await l1SenderV2.L1SenderV2__init();

  const distributor = await deployer.deployERC1967Proxy(Distributor__factory);
  await distributor.Distributor_init(
    await chainLinkDataConsumer.getAddress(),
    config.aavePool,
    config.aavePoolDataProvider,
    await rewardPool.getAddress(),
    await l1SenderV2.getAddress(),
  );

  const impl = await deployer.deploy(DepositPool__factory);
  const depositPoolStEth = await deployDepositPool(deployer, impl, config.stEthMock);
  const depositPoolLink = await deployDepositPool(deployer, impl, config.link);

  await depositPoolStEth.DepositPool_init(config.stEthMock, await distributor.getAddress());
  await depositPoolLink.DepositPool_init(config.link, await distributor.getAddress());

  Reporter.reportContracts(
    ['ChainLinkDataConsumer', await chainLinkDataConsumer.getAddress()],
    ['RewardPool', await rewardPool.getAddress()],
    ['L1SenderV2', await l1SenderV2.getAddress()],
    ['DepositPool StETH', await depositPoolStEth.getAddress()],
    ['DepositPool LINK', await depositPoolLink.getAddress()],
  );
};

const deployDepositPool = async (deployer: Deployer, impl: DepositPool, token: string) => {
  const proxy = await deployer.deploy(ERC1967Proxy__factory, [await impl.getAddress(), '0x'], {
    name: `DepositPool ${token}`,
  });

  return deployer.deployed(DepositPool__factory, await proxy.getAddress());
};

// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol --only 1
// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol --network sepolia --only 1 --verify
// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol --network sepolia --only 1 --verify --continue
