import { Deployer, Reporter } from '@solarity/hardhat-migrate';

import { ERC1967Proxy__factory, L2TokenReceiverV3__factory } from '@/generated-types/ethers';

// TO BE RUN WITH: --network base

// MOROFT `owner()` on Base -- same admin used throughout `8-add-base-as-l2` for Base-side contracts.
// RE-VERIFY (`moroft.owner()`) immediately before running for real.
const baseAdminAddress = '0xf3ef00168DD40Eae68A7E670d56C7b8724E0c183';

const moroftAddress = '0x7431aDa8a591C955a994a21710752EF9b882b8e3';

// OP Stack `WETH` predeploy -- same address on every OP Stack chain (Base, Optimism, ...).
const wethAddress = '0x4200000000000000000000000000000000000006';

// Bridged wstETH on Base (see `3_mainnet.ts` / `L1SenderV3.baseBridgeConfig.remoteWstETH` -- this
// contract is that config's `receiver`, and receives this exact token).
const wstETHAddress = '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452';

// Uniswap V3 on Base (`SwapRouter02`, not the original `SwapRouter` -- see `L2TokenReceiverV3.sol`).
// https://docs.uniswap.org/contracts/v3/reference/deployments/base-deployments -- RE-VERIFY before running for real.
const swapRouter02Address = '0x2626664c2603336E57B271c5C0b26F421741e481';
const nonfungiblePositionManagerAddress = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';

// Mirrors the live Arbitrum `L2TokenReceiverV2`'s configured fee tiers (read on-chain on
// 2026-08-28: `firstSwapParams` wstETH->WETH @ 100 (0.01%), `secondSwapParams` WETH->MOR @ 3000
// (0.3%)). Confirmed on-chain on 2026-08-29 that both pools exist on Base at these exact tiers and
// have real active liquidity: wstETH/WETH @ 100 -> 0x20E068D76f9E90B90604500B84c7e19dCB923e7e,
// WETH/MOR @ 3000 -> 0x37Ecd41F5A01B23A3d9Bb3B4dDFef4Ed455d6FD3 (via UniswapV3Factory.getPool() +
// each pool's liquidity()). RE-VERIFY again immediately before running for real -- liquidity moves.
const firstSwapFee = 100;
const secondSwapFee = 3000;

let l2TokenReceiverAddress = '';

module.exports = async function (deployer: Deployer) {
  // TO BE CALLED BY DEPLOYER
  // Deploy the new `L2TokenReceiverV3` on Base, configure both swap legs, and hand ownership to
  // `baseAdminAddress` at the end -- it's never left owned by the deployer.
  await _step1(deployer);
};

const _step1 = async (deployer: Deployer) => {
  const impl = await deployer.deploy(L2TokenReceiverV3__factory, { name: 'L2TokenReceiverV3 impl (Base)' });
  const proxy = await deployer.deploy(
    ERC1967Proxy__factory,
    [
      await impl.getAddress(),
      L2TokenReceiverV3__factory.createInterface().encodeFunctionData('L2TokenReceiver__init', [
        swapRouter02Address,
        nonfungiblePositionManagerAddress,
        { tokenIn: wethAddress, tokenOut: moroftAddress, fee: secondSwapFee, sqrtPriceLimitX96: 0 },
      ]),
    ],
    { name: 'L2TokenReceiverV3 Proxy (Base)' },
  );
  const l2TokenReceiver = await deployer.deployed(L2TokenReceiverV3__factory, await proxy.getAddress());
  l2TokenReceiverAddress = await l2TokenReceiver.getAddress();

  // `firstSwapParams` (wstETH -> WETH) isn't set by `L2TokenReceiver__init` (that leg is disabled
  // there, matching the live Arbitrum contract) -- set separately via `editParams`.
  await l2TokenReceiver.editParams(
    { tokenIn: wstETHAddress, tokenOut: wethAddress, fee: firstSwapFee, sqrtPriceLimitX96: 0 },
    true,
  );

  // Hand off ownership to the real admin -- MUST be the last call in this step.
  await l2TokenReceiver.transferOwnership(baseAdminAddress);

  Reporter.reportContracts(['L2TokenReceiverV3 (Base)', l2TokenReceiverAddress]);
};

// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol/8-add-base-as-l2 --only 5 --network base
// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol/8-add-base-as-l2 --only 5 --network base --verify --continue
