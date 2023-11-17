import {
  Distribution__factory,
  ERC1967Proxy__factory,
  MOR__factory,
  StETHMock__factory,
  Swap__factory,
  UniswapV2RouterMock__factory,
} from '@/generated-types/ethers';
import { Deployer, Reporter } from '@solarity/hardhat-migrate';
import { parseConfig } from './helpers/config-parser';

module.exports = async function (deployer: Deployer) {
  const config = parseConfig();

  let stETH: string;
  let uniswapV2Router: string;
  if (config.swap) {
    stETH = config.swap.stEth;
    uniswapV2Router = config.swap.uniswapV2Router;
  } else {
    // deploy mock
    const stETHMock = await deployer.deploy(StETHMock__factory);
    stETH = await stETHMock.getAddress();

    const uniswapV2RouterMock = await deployer.deploy(UniswapV2RouterMock__factory);
    uniswapV2Router = await uniswapV2RouterMock.getAddress();
  }

  const distributionImpl = await deployer.deploy(Distribution__factory);
  const ERC1967Proxy = await deployer.deploy(ERC1967Proxy__factory, [distributionImpl, '0x']);
  const distribution = Distribution__factory.connect(ERC1967Proxy.address, await deployer.getSigner());

  const MOR = await deployer.deploy(MOR__factory, [distribution, config.cap]);

  const swap = await deployer.deploy(Swap__factory, [uniswapV2Router, stETH, MOR]);

  await distribution.Distribution_init(MOR, stETH, swap, config.pools || []);

  if (config.pools) {
    for (let i = 0; i < config.pools.length; i++) {
      const pool = config.pools[i];

      if (pool.whitelistedUsers && pool.whitelistedUsers.length > 0) {
        const amounts = pool.amounts!;
        await distribution.manageUsersInPrivatePool(i, pool.whitelistedUsers, amounts);
      }
    }
  }

  Reporter.reportContracts(['MOR', MOR.address], ['StETH', stETH], ['Distribution', await distribution.getAddress()]);
};
