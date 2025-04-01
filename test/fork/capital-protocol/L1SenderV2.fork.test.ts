import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { Reverter } from '../../helpers/reverter';

import { ERC20, L1Sender, L1SenderV2, StETHMock, WStETHMock } from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';
import { getCurrentBlockTime } from '@/test/helpers/block-helper';
import { deployDistributorMock, deployERC20Token, deployRewardPoolMock } from '@/test/helpers/deployers';

describe('L1SenderV2 Fork', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let BOB: SignerWithAddress;
  let STETH_HOLDER: SignerWithAddress;
  let USDC_HOLDER: SignerWithAddress;

  let l1Sender: L1Sender;
  let l1SenderV2Impl: L1SenderV2;

  // https://etherscan.io/address/0x2Efd4430489e1a05A89c2f51811aC661B7E5FF84
  const l1SenderAddress = '0x2Efd4430489e1a05A89c2f51811aC661B7E5FF84';
  // https://etherscan.io/address/0xE53FFF67f9f384d20Ebea36F43b93DC49Ed22753
  const stETHHolder = '0xE53FFF67f9f384d20Ebea36F43b93DC49Ed22753';
  // https://etherscan.io/address/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
  const usdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
  // https://etherscan.io/address/0xA38EE4A24886FEE6F696C65A7b26cE5F42f73f68
  const usdcHolder = '0xA38EE4A24886FEE6F696C65A7b26cE5F42f73f68';
  // https://etherscan.io/address/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2
  const wethAddress = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

  before(async () => {
    await createFork();

    [OWNER, BOB] = await ethers.getSigners();
    STETH_HOLDER = await ethers.getImpersonatedSigner(stETHHolder);
    USDC_HOLDER = await ethers.getImpersonatedSigner(usdcHolder);

    l1Sender = (await ethers.getContractFactory('L1Sender')).attach(l1SenderAddress) as L1Sender;

    await transferOwnership(l1Sender);

    await reverter.snapshot();
  });

  beforeEach(async () => {
    await reverter.revert();
  });

  after(async () => {
    await ethers.provider.send('hardhat_reset', []);
  });

  describe('#upgradeTo', () => {
    it('should correctly upgrade to the new version', async () => {
      const l1SenderV2 = await upgrade();

      expect(await l1SenderV2.version()).to.eq(2);
    });
    it('should to not change storage', async () => {
      const unwrappedDepositToken = await l1Sender.unwrappedDepositToken();
      const distribution = await l1Sender.distribution();
      const depositTokenConfig = await l1Sender.depositTokenConfig();
      const rewardTokenConfig = await l1Sender.rewardTokenConfig();

      const l1SenderV2 = await upgrade();

      expect(await l1SenderV2.stETH()).to.eq(unwrappedDepositToken);
      expect(await l1SenderV2.distributor()).to.eq(distribution);
      expect(await l1SenderV2.arbitrumBridgeConfig()).to.deep.eq(depositTokenConfig);
      expect(await l1SenderV2.layerZeroConfig()).to.deep.eq(rewardTokenConfig);
      expect(await l1SenderV2.uniswapSwapRouter()).to.eq(ZERO_ADDR);
    });
  });

  describe('#sendWstETH', () => {
    it('should correctly send tokens', async () => {
      const l1SenderV2 = await upgrade();

      const steth = (await ethers.getContractFactory('StETHMock')).attach(await l1SenderV2.stETH()) as StETHMock;
      const wstETHAddress = (await l1SenderV2.arbitrumBridgeConfig()).wstETH;
      const wstETH = (await ethers.getContractFactory('WStETHMock')).attach(wstETHAddress) as WStETHMock;

      await steth.connect(STETH_HOLDER).transfer(l1SenderV2, wei(10));
      expect(await wstETH.balanceOf(l1SenderV2)).to.eq(wei(0));
      expect(await steth.balanceOf(l1SenderV2)).to.eq(wei(10));

      const gasLimit = 1_000_000;
      const maxFeePerGas = 1_000_000_000;
      const maxSubmissionCost = 1_000_000_000_000_000;

      await l1SenderV2.sendWstETH(gasLimit, maxFeePerGas, maxSubmissionCost, {
        value: maxSubmissionCost + gasLimit * maxFeePerGas,
      });

      expect(await wstETH.balanceOf(l1SenderV2)).to.eq(wei(0));
      expect(await steth.balanceOf(l1SenderV2)).to.closeTo(wei(0), wei(0.00001));
    });
  });

  describe('#sendMintMessage', () => {
    it('should correctly send mint message', async () => {
      const distributor = await deployDistributorMock(await deployRewardPoolMock(), await deployERC20Token());

      const l1SenderV2 = await upgrade();
      await l1SenderV2.setDistributor(distributor);

      await distributor.sendMintMessage(await l1SenderV2.getAddress(), BOB, wei(1), OWNER, { value: wei(1) });
    });
  });

  describe('#swapExactInputMultihop', () => {
    it('should correctly swap tokens', async () => {
      const l1SenderV2 = await upgrade();

      await OWNER.sendTransaction({ to: USDC_HOLDER, value: wei(1) });

      const usdc = (await ethers.getContractFactory('ERC20')).attach(usdcAddress) as ERC20;
      await usdc.connect(USDC_HOLDER).transfer(l1SenderV2, wei(1000, 6));
      expect(await usdc.balanceOf(l1SenderV2)).to.eq(wei(1000, 6));

      const wstETHAddress = (await l1SenderV2.arbitrumBridgeConfig()).wstETH;
      const wstETH = (await ethers.getContractFactory('WStETHMock')).attach(wstETHAddress) as WStETHMock;
      expect(await wstETH.balanceOf(l1SenderV2)).to.eq(wei(0));

      const weth = (await ethers.getContractFactory('ERC20')).attach(wethAddress) as ERC20;

      await l1SenderV2.setUniswapSwapRouter('0xE592427A0AEce92De3Edee1F18E0157C05861564');
      await l1SenderV2.swapExactInputMultihop(
        [usdc, weth, wstETH],
        [500, 100],
        wei(1000, 6),
        wei(0.1),
        (await getCurrentBlockTime()) + 60,
      );

      expect(await usdc.balanceOf(l1SenderV2)).to.eq(wei(0, 6));
      expect(await wstETH.balanceOf(l1SenderV2)).to.greaterThan(wei(0.4));
    });
  });

  const createFork = async () => {
    await ethers.provider.send('hardhat_reset', [
      {
        forking: {
          jsonRpcUrl: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
          blockNumber: 22165500,
        },
      },
    ]);
  };

  const transferOwnership = async (contract: L1Sender | L1SenderV2) => {
    const owner = await ethers.getImpersonatedSigner(await contract.owner());
    await BOB.sendTransaction({ to: owner, value: wei(100) });
    await contract.connect(owner).transferOwnership(OWNER);
  };

  const upgrade = async (): Promise<L1SenderV2> => {
    l1SenderV2Impl = await (await ethers.getContractFactory('L1SenderV2')).deploy();
    await l1Sender.upgradeTo(l1SenderV2Impl);
    const contract = l1SenderV2Impl.attach(l1Sender) as L1SenderV2;

    return contract;
  };
});

// npm run generate-types && npx hardhat test "test/fork/capital-protocol/L1SenderV2.fork.test.ts"
