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
import { getDefaultPool, getDefaultRewardsPools, oneHour } from '@/test/helpers/distribution-helper';
import { Reverter } from '@/test/helpers/reverter';

describe('Distributor', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let ALAN: SignerWithAddress;
  let BOB: SignerWithAddress;

  let chainLinkDataConsumerV3: ChainLinkDataConsumerV3;
  let distributor: Distributor;
  let commonToken: ERC20Token;

  type DepositPoolTestOnlyInfo = {
    chainLinkPath: string;
    chainLinkPrice: bigint;
    aggregatorV3: AggregatorV3;
    token: ERC20Token;
    depositPool: DepositPool;
  };

  let dpToken1Info: DepositPoolTestOnlyInfo;
  let dpToken2Info: DepositPoolTestOnlyInfo;

  before(async () => {
    [OWNER, ALAN, BOB] = await ethers.getSigners();

    chainLinkDataConsumerV3 = await deployChainLinkDataConsumerV3();
    distributor = await deployDistributor(chainLinkDataConsumerV3);

    // Deploy tokens
    commonToken = await deployERC20Token();

    // START form test structs
    dpToken1Info = {
      chainLinkPath: 'wETH/USD',
      chainLinkPrice: wei(100, 8),
      aggregatorV3: await deployAggregatorV3(),
      token: await deployERC20Token(),
      depositPool: await deployDepositPool(commonToken),
    };
    dpToken2Info = {
      chainLinkPath: 'cbBTC/USD',
      chainLinkPrice: wei(200, 8),
      aggregatorV3: await deployAggregatorV3(),
      token: await deployERC20Token(),
      depositPool: await deployDepositPool(commonToken),
    };
    // END

    // START base ChainLink setup
    const paths = [dpToken1Info.chainLinkPath, dpToken2Info.chainLinkPath];
    const aggregators = [[dpToken1Info.aggregatorV3], [dpToken2Info.aggregatorV3]];
    const answers = [[dpToken1Info.chainLinkPrice], [dpToken2Info.chainLinkPrice]];

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
    describe('#Distributor_init', () => {
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
    });
  });

  describe('#addDepositPoolDetails', () => {
    it('should', async () => {
      await distributor.addDepositPoolDetails(dpToken1Info.depositPool.getAddress(), dpToken1Info.chainLinkPath);
      await distributor.addDepositPoolDetails(dpToken2Info.depositPool.getAddress(), dpToken2Info.chainLinkPath);

      // console.log(await distributor.depositPoolsDetails(0));
      // console.log(await distributor.depositPoolsDetails(1));
    });
  });
  describe('#createRewardPools', () => {
    it('should create reward pools', async () => {
      const rewardPools = getDefaultRewardsPools();
      await distributor.createRewardPools(rewardPools);

      for (let i = 0; i < rewardPools.length; i++) {
        const createdRewardPool = await distributor.rewardPools(i);
        expect(createdRewardPool.payoutStart).to.eq(rewardPools[i].payoutStart);
        expect(createdRewardPool.decreaseInterval).to.eq(rewardPools[i].decreaseInterval);
        expect(createdRewardPool.initialReward).to.eq(rewardPools[i].initialReward);
        expect(createdRewardPool.rewardDecrease).to.eq(rewardPools[i].rewardDecrease);
      }
    });
  });
  describe('#getRewardsFromRewardPool', () => {
    it('should return 0 if reward pool is not exist', async () => {
      const reward = await distributor.getRewardsFromRewardPool(0, 0, 99999);
      expect(reward).to.eq(0);
    });
  });
});

// npx hardhat test "test/capital-protocol/Distributor.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/Distribution.test.ts"
