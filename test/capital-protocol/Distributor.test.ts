import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import {
  deployAggregatorV3,
  deployChainLinkDataConsumerV3,
  deployDepositPool,
  deployDistributor,
  deployERC20Token,
} from '../helpers/deployers';

import {
  AggregatorV3,
  BuildersV2Mock,
  ChainLinkDataConsumerV3,
  DepositPool,
  Distributor,
  ERC20Token,
} from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';
import { setTime } from '@/test/helpers/block-helper';
import { oneHour } from '@/test/helpers/distribution-helper';
import { Reverter } from '@/test/helpers/reverter';

describe('Distributor', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let ALAN: SignerWithAddress;
  let BOB: SignerWithAddress;

  let chainLinkDataConsumerV3: ChainLinkDataConsumerV3;
  let distributor: Distributor;
  let commonToken: ERC20Token;

  type DepositPoolTestInfo = {
    chainLinkPath: string;
    chainLinkPrice: bigint;
    aggregatorV3: AggregatorV3;
    token: ERC20Token;
    depositPool: DepositPool;
  };

  let dpCommonTokenInfo: DepositPoolTestInfo;

  before(async () => {
    [OWNER, ALAN, BOB] = await ethers.getSigners();

    chainLinkDataConsumerV3 = await deployChainLinkDataConsumerV3();
    distributor = await deployDistributor(chainLinkDataConsumerV3);

    // Deploy tokens
    commonToken = await deployERC20Token();

    // START form test structs
    dpCommonTokenInfo = {
      chainLinkPath: 'wETH/USD',
      chainLinkPrice: wei(100, 8),
      aggregatorV3: await deployAggregatorV3(),
      token: await deployERC20Token(),
      depositPool: await deployDepositPool(commonToken),
    };
    // END

    // START base ChainLink setup
    const paths = [dpCommonTokenInfo.chainLinkPath];
    const aggregators = [[dpCommonTokenInfo.aggregatorV3]];
    const answers = [[dpCommonTokenInfo.chainLinkPrice]];

    await chainLinkDataConsumerV3.updateDataFeeds(paths, aggregators);
    for (let i = 0; i < answers.length; i++) {
      for (let k = 0; k < answers[i].length; k++) {
        await aggregators[i][k].setAnswerResult(answers[i][k]);
      }
    }
    // END

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe('UUPS proxy functionality', () => {
    describe('#Distribution_init', () => {
      it('should set correct data after creation', async () => {
        expect(await distributor.chainLinkDataConsumerV3()).to.eq(await chainLinkDataConsumerV3.getAddress());
      });
      it('should revert if try to call init function twice', async () => {
        await expect(distributor.Distributor_init(ZERO_ADDR)).to.be.revertedWith(
          'Initializable: contract is already initialized',
        );
      });
    });

    describe('#_authorizeUpgrade', () => {
      it('should correctly upgrade', async () => {
        const factoryV2 = await ethers.getContractFactory('BuildersV2Mock');
        const implV2 = await factoryV2.deploy();

        await distributor.upgradeTo(await implV2.getAddress());

        const v2 = factoryV2.attach(await distributor.getAddress()) as BuildersV2Mock;

        expect(await v2.version()).to.eq(999);
      });
      it('should revert if caller is not the owner', async () => {
        await expect(distributor.connect(BOB).upgradeTo(ZERO_ADDR)).to.be.revertedWith(
          'Ownable: caller is not the owner',
        );
      });
      it('should revert if `isNotUpgradeable == true`', async () => {
        await distributor.removeUpgradeability();

        await expect(distributor.upgradeTo(ZERO_ADDR)).to.be.revertedWith("DR: upgrade isn't available");
      });
    });
  });

  describe('#createPool', () => {
    it('should create pool with correct data', async () => {
      await distributor.addDepositPoolDetails(
        dpCommonTokenInfo.depositPool.getAddress(),
        dpCommonTokenInfo.chainLinkPath,
      );

      console.log(await distributor.depositPoolsDetails(0));

      // const poolData: IDistribution.PoolStruct = await distribution.pools(0);
      // expect(_comparePoolStructs(pool, poolData)).to.be.true;
    });
    // it('should correctly pool with constant reward', async () => {
    //   const pool = getDefaultPool();
    //   pool.rewardDecrease = 0;

    //   await distribution.createPool(pool);

    //   const poolData: IDistribution.PoolStruct = await distribution.pools(0);
    //   expect(_comparePoolStructs(pool, poolData)).to.be.true;
    // });

    // describe('should revert if try to create pool with incorrect data', () => {
    //   it('if `payoutStart == 0`', async () => {
    //     const pool = getDefaultPool();
    //     pool.payoutStart = 0;

    //     await expect(distribution.createPool(pool)).to.be.rejectedWith('DR: invalid payout start value');
    //   });
    //   it('if `decreaseInterval == 0`', async () => {
    //     const pool = getDefaultPool();
    //     pool.decreaseInterval = 0;

    //     await expect(distribution.createPool(pool)).to.be.rejectedWith('DR: invalid decrease interval');
    //   });
    // });

    // it('should revert if caller is not owner', async () => {
    //   await expect(distribution.connect(SECOND).createPool(getDefaultPool())).to.be.revertedWith(
    //     'Ownable: caller is not the owner',
    //   );
    // });
  });
});

// npx hardhat test "test/capital-protocol/Distributor.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/Distribution.test.ts"
