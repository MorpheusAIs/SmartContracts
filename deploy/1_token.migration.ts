import {
  Distribution__factory,
  ERC1967Proxy__factory,
  MOR__factory,
  StETHMock__factory,
  SwapRouterMock__factory,
  Swap__factory,
} from '@/generated-types/ethers';
import { ISwap } from '@/generated-types/ethers/contracts/Swap';
import { Deployer, Reporter } from '@solarity/hardhat-migrate';
import { parseConfig } from './helpers/config-parser';

module.exports = async function (deployer: Deployer) {
  const config = parseConfig();

  let stETH: string;
  let swapRouter: string;
  if (config.swapAddresses) {
    stETH = config.swapAddresses.stEth;
    swapRouter = config.swapAddresses.swapRouter;
  } else {
    // deploy mock
    const stETHMock = await deployer.deploy(StETHMock__factory);
    stETH = await stETHMock.getAddress();

    const swapRouterMock = await deployer.deploy(SwapRouterMock__factory);
    swapRouter = await swapRouterMock.getAddress();
  }

  const distributionImpl = await deployer.deploy(Distribution__factory);
  const ERC1967Proxy = await deployer.deploy(ERC1967Proxy__factory, [distributionImpl, '0x']);
  const distribution = Distribution__factory.connect(ERC1967Proxy.address, await deployer.getSigner());

  const MOR = await deployer.deploy(MOR__factory, [distribution, config.cap]);

  const swapParams: ISwap.SwapParamsStruct = {
    tokenIn: stETH,
    tokenOut: MOR.address,
    fee: config.swapParams.fee,
    sqrtPriceLimitX96: config.swapParams.sqrtPriceLimitX96,
  };
  const swap = await deployer.deploy(Swap__factory, [swapRouter, swapParams]);

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

  Reporter.reportContracts(
    ['MOR', MOR.address],
    ['StETH', stETH],
    ['Distribution', await distribution.getAddress()],
    ['Swap', await swap.getAddress()]
  );
};
