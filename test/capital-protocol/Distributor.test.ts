import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { setNextTime } from '../helpers/block-helper';
import {
  deployAavePoolDataProviderMock,
  deployAavePoolMock,
  deployDepositPoolMock,
  deployDistributor,
  deployERC20Token,
  deployInterfaceMock,
  deployL1SenderMock,
  deployL1SenderV2,
  deployRewardPoolMock,
} from '../helpers/deployers';
import { deployChainLinkDataConsumerMock } from '../helpers/deployers/mock/capital-protocol/chain-link-data-consumer-mock';
import { oneDay } from '../helpers/distribution-helper';

import {
  AavePoolDataProviderMock,
  AavePoolMock,
  ChainLinkDataConsumerMock,
  DepositPoolMock,
  Distributor,
  ERC20Token,
  L1SenderMock,
  RewardPoolMock,
} from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';
import { Reverter } from '@/test/helpers/reverter';

describe('Distributor', () => {
  enum Strategy {
    NONE,
    NO_YIELD,
    AAVE,
  }

  type DepositPoolTestOnlyInfo = {
    rewardPoolId: number;
    chainLinkPath: string;
    chainLinkPrice: bigint;
    depositToken: ERC20Token;
    depositPool: DepositPoolMock;
    aToken: ERC20Token;
    strategy: Strategy;
  };

  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let BOB: SignerWithAddress;

  let chainLinkDataConsumerMock: ChainLinkDataConsumerMock;
  let aavePoolDataProviderMock: AavePoolDataProviderMock;
  let aavePoolMock: AavePoolMock;
  let rewardPoolMock: RewardPoolMock;
  let distributor: Distributor;
  let l1SenderMock: L1SenderMock;

  let dp0Info: DepositPoolTestOnlyInfo;
  let dp1Info: DepositPoolTestOnlyInfo;
  let dp2Info: DepositPoolTestOnlyInfo;
  let depositPools: DepositPoolTestOnlyInfo[];

  const publicRewardPoolId = 0;
  const privateRewardPoolId = 1;

  before(async () => {
    [OWNER, BOB] = await ethers.getSigners();

    // START deploy contracts
    chainLinkDataConsumerMock = await deployChainLinkDataConsumerMock();
    aavePoolDataProviderMock = await deployAavePoolDataProviderMock();
    aavePoolMock = await deployAavePoolMock(aavePoolDataProviderMock);
    rewardPoolMock = await deployRewardPoolMock();
    l1SenderMock = await deployL1SenderMock();
    distributor = await deployDistributor(
      chainLinkDataConsumerMock,
      aavePoolMock,
      aavePoolDataProviderMock,
      rewardPoolMock,
      l1SenderMock,
    );

    // END

    // START form test structs
    const depositToken1 = await deployERC20Token();
    const depositToken2 = await deployERC20Token();

    const depositPool1 = await deployDepositPoolMock(depositToken1, distributor);
    const depositPool2 = await deployDepositPoolMock(depositToken2, distributor);

    dp0Info = {
      rewardPoolId: publicRewardPoolId,
      chainLinkPath: 'wETH/USD',
      chainLinkPrice: wei(0),
      depositToken: depositToken1,
      depositPool: depositPool1,
      aToken: await deployERC20Token(),
      strategy: Strategy.NONE,
    };
    dp1Info = {
      rewardPoolId: publicRewardPoolId,
      chainLinkPath: 'cbBTC/USD',
      chainLinkPrice: wei(0),
      depositToken: depositToken2,
      depositPool: depositPool2,
      aToken: await deployERC20Token(),
      strategy: Strategy.AAVE,
    };
    dp2Info = {
      rewardPoolId: privateRewardPoolId,
      chainLinkPath: '---',
      chainLinkPrice: wei(0),
      depositToken: depositToken1,
      depositPool: depositPool1,
      aToken: await deployERC20Token(),
      strategy: Strategy.NO_YIELD,
    };
    depositPools = [dp0Info, dp1Info, dp2Info];

    await aavePoolDataProviderMock.setATokenAddress(dp1Info.depositToken, dp1Info.aToken);
    await rewardPoolMock.setIsRewardPoolExist(publicRewardPoolId, true);
    await rewardPoolMock.setIsRewardPoolExist(privateRewardPoolId, true);
    await rewardPoolMock.setIsRewardPoolPublic(publicRewardPoolId, true);
    await dp0Info.depositToken.setDecimals(6);
    // END

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe('UUPS proxy functionality', () => {
    describe('#constructor', () => {
      it('should disable initialize function', async () => {
        const reason = 'Initializable: contract is already initialized';

        await expect(
          distributor.connect(OWNER).Distributor_init(ZERO_ADDR, ZERO_ADDR, ZERO_ADDR, ZERO_ADDR, ZERO_ADDR),
        ).to.be.revertedWith(reason);
      });
    });

    describe('#Distributor_init', () => {
      it('should set correct data after creation', async () => {
        expect(await distributor.chainLinkDataConsumer()).to.eq(await chainLinkDataConsumerMock.getAddress());
        expect(await distributor.aavePool()).to.eq(await aavePoolMock.getAddress());
        expect(await distributor.aavePoolDataProvider()).to.eq(await aavePoolDataProviderMock.getAddress());
        expect(await distributor.rewardPool()).to.eq(await rewardPoolMock.getAddress());
      });
    });

    describe('#_authorizeUpgrade', () => {
      it('should upgrade to the new version', async () => {
        const [factory] = await Promise.all([ethers.getContractFactory('FeeConfigV2')]);
        const contract = await factory.deploy();

        await distributor.upgradeTo(contract);
        expect(await distributor.version()).to.eq(2);
      });

      it('should revert if caller is not the owner', async () => {
        await expect(distributor.connect(BOB).upgradeTo(ZERO_ADDR)).to.be.revertedWith(
          'Ownable: caller is not the owner',
        );
      });
    });

    describe('#version()', () => {
      it('should return correct version', async () => {
        expect(await distributor.version()).to.eq(1);
      });
    });
  });

  describe('supportsInterface', () => {
    it('should support IDistributor', async () => {
      const interfaceMock = await deployInterfaceMock();
      expect(await distributor.supportsInterface(await interfaceMock.getIDistributorInterfaceId())).to.be.true;
    });
    it('should support IERC165', async () => {
      const interfaceMock = await deployInterfaceMock();
      expect(await distributor.supportsInterface(await interfaceMock.getIERC165InterfaceId())).to.be.true;
    });
  });

  describe('#setChainLinkDataConsumer', () => {
    it('should set new value', async () => {
      expect(await distributor.chainLinkDataConsumer()).to.eq(chainLinkDataConsumerMock);

      const newValue = await deployChainLinkDataConsumerMock();
      await distributor.setChainLinkDataConsumer(newValue);

      expect(await distributor.chainLinkDataConsumer()).to.eq(newValue);
    });
    it('should revert when invalid data consumer', async () => {
      await expect(distributor.setChainLinkDataConsumer(rewardPoolMock)).to.be.revertedWith(
        'DR: invalid data consumer',
      );
    });
    it('should revert if caller is not owner', async () => {
      await expect(distributor.connect(BOB).setChainLinkDataConsumer(OWNER)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#setL1Sender', () => {
    it('should set new value', async () => {
      expect(await distributor.l1Sender()).to.eq(await l1SenderMock.getAddress());

      const newValue = await deployL1SenderV2();
      await distributor.setL1Sender(newValue);

      expect(await distributor.l1Sender()).to.eq(await newValue.getAddress());
    });
    it('should revert when invalid data consumer', async () => {
      await expect(distributor.setL1Sender(rewardPoolMock)).to.be.revertedWith('DR: invalid L1Sender address');
    });
    it('should revert if caller is not owner', async () => {
      await expect(distributor.connect(BOB).setL1Sender(OWNER)).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('#setAavePool', () => {
    it('should set new value', async () => {
      expect(await distributor.aavePool()).to.eq(aavePoolMock);

      const newValue = await deployAavePoolMock(aavePoolDataProviderMock);
      await distributor.setAavePool(newValue);

      expect(await distributor.aavePool()).to.eq(newValue);
    });
    it('should revert when invalid Aave pool address', async () => {
      await expect(distributor.setAavePool(ZERO_ADDR)).to.be.revertedWith('DR: invalid Aave pool address');
    });
    it('should revert if caller is not owner', async () => {
      await expect(distributor.connect(BOB).setAavePool(OWNER)).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('#setAavePoolDataProvider', () => {
    it('should set new value', async () => {
      expect(await distributor.aavePoolDataProvider()).to.eq(aavePoolDataProviderMock);

      const newValue = await deployAavePoolDataProviderMock();
      await distributor.setAavePoolDataProvider(newValue);

      expect(await distributor.aavePoolDataProvider()).to.eq(newValue);
    });
    it('should revert when invalid Aave pool data provider address', async () => {
      await expect(distributor.setAavePoolDataProvider(ZERO_ADDR)).to.be.revertedWith(
        'DR: invalid Aave pool data provider address',
      );
    });
    it('should revert if caller is not owner', async () => {
      await expect(distributor.connect(BOB).setAavePoolDataProvider(OWNER)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#setRewardPool', () => {
    it('should set new value', async () => {
      expect(await distributor.rewardPool()).to.eq(rewardPoolMock);

      const newValue = await deployRewardPoolMock();
      await distributor.setRewardPool(newValue);

      expect(await distributor.rewardPool()).to.eq(newValue);
    });
    it('should revert when invalid reward pool address', async () => {
      await expect(distributor.setRewardPool(chainLinkDataConsumerMock)).to.be.revertedWith(
        'DR: invalid reward pool address',
      );
    });
    it('should revert if caller is not owner', async () => {
      await expect(distributor.connect(BOB).setRewardPool(OWNER)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#setMinRewardsDistributePeriod', () => {
    it('should set new value', async () => {
      await distributor.setMinRewardsDistributePeriod(10);

      expect(await distributor.minRewardsDistributePeriod()).to.eq(10);
    });
    it('should revert if caller is not owner', async () => {
      await expect(distributor.connect(BOB).setMinRewardsDistributePeriod(1)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#setRewardPoolLastCalculatedTimestamp', () => {
    it('should set new value', async () => {
      await setNextTime(oneDay);
      await distributor.setRewardPoolLastCalculatedTimestamp(1, oneDay - 1);

      expect(await distributor.rewardPoolLastCalculatedTimestamp(1)).to.eq(oneDay - 1);
    });
    it('should revert when invalid last calculated timestamp', async () => {
      await setNextTime(oneDay);
      await expect(distributor.setRewardPoolLastCalculatedTimestamp(1, oneDay * 2)).to.be.revertedWith(
        'DR: invalid last calculated timestamp',
      );
    });
    it('should revert if caller is not owner', async () => {
      await expect(distributor.connect(BOB).setRewardPoolLastCalculatedTimestamp(0, 0)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#addDepositPool', () => {
    beforeEach(async () => {
      for (let i = 0; i < depositPools.length; i++) {
        await chainLinkDataConsumerMock.setAnswer(depositPools[i].chainLinkPath, wei(i + 1));
      }
    });

    it('should create new deposit pool details', async () => {
      for (let i = 0; i < depositPools.length; i++) {
        const depositPool = depositPools[i];
        await distributor.addDepositPool(
          depositPool.rewardPoolId,
          depositPool.depositPool,
          depositPool.depositToken,
          depositPool.chainLinkPath,
          depositPool.strategy,
        );

        const res = await distributor.depositPools(depositPool.rewardPoolId, depositPool.depositPool);
        expect(res.isExist).to.eq(true);
        expect(res.token).to.eq(depositPool.strategy === Strategy.NO_YIELD ? ZERO_ADDR : depositPool.depositToken);
        expect(res.chainLinkPath).to.eq(depositPool.strategy === Strategy.NO_YIELD ? '' : depositPool.chainLinkPath);
        expect(res.tokenPrice).to.eq(depositPool.strategy === Strategy.NO_YIELD ? 0 : wei(i + 1));
        expect(res.deposited).to.eq(0);
        expect(res.lastUnderlyingBalance).to.eq(0);
        expect(res.strategy).to.eq(depositPool.strategy);
        expect(res.aToken).to.eq(depositPool.strategy === Strategy.AAVE ? depositPool.aToken : ZERO_ADDR);
      }

      expect(await distributor.depositPoolAddresses(dp0Info.rewardPoolId, 0)).to.eq(dp0Info.depositPool);
      expect(await distributor.depositPoolAddresses(dp0Info.rewardPoolId, 1)).to.eq(dp1Info.depositPool);
      expect(await distributor.depositPoolAddresses(dp0Info.rewardPoolId, 0)).to.eq(depositPools[2].depositPool);
    });
    it('should revert when invalid deposit pool address', async () => {
      await expect(
        distributor.addDepositPool(
          dp0Info.rewardPoolId,
          rewardPoolMock,
          dp0Info.depositToken,
          dp0Info.chainLinkPath,
          dp0Info.strategy,
        ),
      ).to.be.revertedWith('DR: the deposit pool address is invalid');
    });
    it('should revert when the deposit pool for this index already added', async () => {
      await distributor.addDepositPool(
        depositPools[2].rewardPoolId,
        depositPools[2].depositPool,
        depositPools[2].depositToken,
        depositPools[2].chainLinkPath,
        depositPools[2].strategy,
      );

      await expect(
        distributor.addDepositPool(
          depositPools[2].rewardPoolId,
          dp0Info.depositPool,
          dp0Info.depositToken,
          dp0Info.chainLinkPath,
          Strategy.NO_YIELD,
        ),
      ).to.be.revertedWith('DR: the deposit pool for this index already added');
    });
    it('should revert when deposit token already added', async () => {
      await distributor.addDepositPool(
        dp0Info.rewardPoolId,
        dp0Info.depositPool,
        dp0Info.depositToken,
        dp0Info.chainLinkPath,
        dp0Info.strategy,
      );

      await expect(
        distributor.addDepositPool(
          dp1Info.rewardPoolId,
          dp1Info.depositPool,
          dp0Info.depositToken,
          dp1Info.chainLinkPath,
          dp1Info.strategy,
        ),
      ).to.be.revertedWith('DR: the deposit token already added');
    });
    it('should revert if caller is not owner', async () => {
      await expect(
        distributor
          .connect(BOB)
          .addDepositPool(
            dp0Info.rewardPoolId,
            dp0Info.depositPool,
            dp0Info.depositToken,
            dp0Info.chainLinkPath,
            dp0Info.strategy,
          ),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('#updateDepositTokensPrices', () => {
    beforeEach(async () => {
      await createDepositPools();
    });

    it('should correctly change token price', async () => {
      await chainLinkDataConsumerMock.setAnswer(dp0Info.chainLinkPath, wei(10));
      await chainLinkDataConsumerMock.setAnswer(dp1Info.chainLinkPath, wei(20));
      await distributor.updateDepositTokensPrices(publicRewardPoolId);
      expect((await distributor.depositPools(dp0Info.rewardPoolId, dp0Info.depositPool)).tokenPrice).to.eq(wei(10));
      expect((await distributor.depositPools(dp1Info.rewardPoolId, dp1Info.depositPool)).tokenPrice).to.eq(wei(20));

      await chainLinkDataConsumerMock.setAnswer(dp0Info.chainLinkPath, wei(10));
      await chainLinkDataConsumerMock.setAnswer(dp1Info.chainLinkPath, wei(30));
      await distributor.updateDepositTokensPrices(publicRewardPoolId);
      expect((await distributor.depositPools(dp0Info.rewardPoolId, dp0Info.depositPool)).tokenPrice).to.eq(wei(10));
      expect((await distributor.depositPools(dp1Info.rewardPoolId, dp1Info.depositPool)).tokenPrice).to.eq(wei(30));

      await chainLinkDataConsumerMock.setAnswer(dp0Info.chainLinkPath, wei(40));
      await chainLinkDataConsumerMock.setAnswer(dp1Info.chainLinkPath, wei(30));
      await distributor.updateDepositTokensPrices(publicRewardPoolId);
      expect((await distributor.depositPools(dp0Info.rewardPoolId, dp0Info.depositPool)).tokenPrice).to.eq(wei(40));
      expect((await distributor.depositPools(dp1Info.rewardPoolId, dp1Info.depositPool)).tokenPrice).to.eq(wei(30));
    });
    it('should revert when price for pair is zero', async () => {
      await chainLinkDataConsumerMock.setAnswer(dp0Info.chainLinkPath, wei(10));
      await chainLinkDataConsumerMock.setAnswer(dp1Info.chainLinkPath, wei(0));
      await expect(distributor.updateDepositTokensPrices(publicRewardPoolId)).to.be.revertedWith(
        'DR: price for pair is zero',
      );
    });
  });

  describe('#distributeRewards', () => {
    beforeEach(async () => {
      await createDepositPools();
      await distributor.setRewardPoolLastCalculatedTimestamp(publicRewardPoolId, 1);
    });

    it('should correctly distribute rewards', async () => {
      // 2*1=1, 4*2=8
      await imitateYield([wei(2), wei(4)], wei(100), [wei(1, 6), wei(2)]);
      await distributor.distributeRewards(publicRewardPoolId);
      expect(await distributor.distributedRewards(dp0Info.rewardPoolId, dp0Info.depositPool)).to.eq(wei(20));
      expect(await distributor.distributedRewards(dp1Info.rewardPoolId, dp1Info.depositPool)).to.eq(wei(80));

      // 2*45=90, 1*10=10
      await imitateYield([wei(2), wei(1)], wei(50), [wei(45, 6), wei(10)]);
      await distributor.distributeRewards(publicRewardPoolId);
      expect(await distributor.distributedRewards(dp0Info.rewardPoolId, dp0Info.depositPool)).to.eq(wei(20 + 45));
      expect(await distributor.distributedRewards(dp1Info.rewardPoolId, dp1Info.depositPool)).to.eq(wei(80 + 5));

      // 999*0=0, 1*10=10
      await imitateYield([wei(999), wei(1)], wei(3.33), [wei(0, 6), wei(10)]);
      await distributor.distributeRewards(publicRewardPoolId);
      expect(await distributor.distributedRewards(dp0Info.rewardPoolId, dp0Info.depositPool)).to.eq(wei(20 + 45));
      expect(await distributor.distributedRewards(dp1Info.rewardPoolId, dp1Info.depositPool)).to.eq(wei(80 + 5 + 3.33));

      // 1*0=0, 1*0=0
      await imitateYield([wei(1), wei(1)], wei(6.66), [wei(0, 6), wei(0)]);
      await distributor.distributeRewards(publicRewardPoolId);
      expect(await distributor.distributedRewards(dp0Info.rewardPoolId, dp0Info.depositPool)).to.eq(wei(20 + 45));
      expect(await distributor.distributedRewards(dp1Info.rewardPoolId, dp1Info.depositPool)).to.eq(wei(80 + 5 + 3.33));
      expect(await distributor.undistributedRewards()).to.eq(wei(6.66));

      // 1*0=0, 1*0=0
      await imitateYield([wei(1), wei(1)], wei(1.22), [wei(0, 6), wei(0)]);
      await distributor.distributeRewards(publicRewardPoolId);
      expect(await distributor.distributedRewards(dp0Info.rewardPoolId, dp0Info.depositPool)).to.eq(wei(20 + 45));
      expect(await distributor.distributedRewards(dp1Info.rewardPoolId, dp1Info.depositPool)).to.eq(wei(80 + 5 + 3.33));
      expect(await distributor.undistributedRewards()).to.eq(wei(6.66 + 1.22));

      // 4*10=40, 1*10=10
      await imitateYield([wei(4), wei(1)], wei(20), [wei(10, 6), wei(10)]);
      await distributor.distributeRewards(publicRewardPoolId);
      expect(await distributor.distributedRewards(dp0Info.rewardPoolId, dp0Info.depositPool)).to.eq(wei(20 + 45 + 16));
      expect(await distributor.distributedRewards(dp1Info.rewardPoolId, dp1Info.depositPool)).to.eq(
        wei(80 + 5 + 3.33 + 4),
      );
      expect(await distributor.undistributedRewards()).to.eq(wei(6.66 + 1.22));
    });
    it('should not distribute rewards when rewards are zero', async () => {
      // 2*1=1, 4*2=8
      await imitateYield([wei(2), wei(4)], wei(100), [wei(1, 6), wei(2)]);
      await distributor.distributeRewards(publicRewardPoolId);
      expect(await distributor.distributedRewards(dp0Info.rewardPoolId, dp0Info.depositPool)).to.eq(wei(20));
      expect(await distributor.distributedRewards(dp1Info.rewardPoolId, dp1Info.depositPool)).to.eq(wei(80));

      await imitateYield([wei(2), wei(1)], wei(0), [wei(1, 6), wei(1)]);
      await distributor.distributeRewards(publicRewardPoolId);
      expect(await distributor.distributedRewards(dp0Info.rewardPoolId, dp0Info.depositPool)).to.eq(wei(20));
      expect(await distributor.distributedRewards(dp1Info.rewardPoolId, dp1Info.depositPool)).to.eq(wei(80));
    });
    it('should not distribute rewards twice in the same block', async () => {
      // 2*1=2, 4*2=8
      await imitateYield([wei(2), wei(4)], wei(100), [wei(1, 6), wei(2)]);

      await ethers.provider.send('evm_setAutomine', [false]);
      const tx1 = await distributor.distributeRewards(publicRewardPoolId);
      const tx2 = await distributor.distributeRewards(publicRewardPoolId);
      await ethers.provider.send('evm_setAutomine', [true]);
      await ethers.provider.send('evm_mine', []);

      await expect(tx1).to.not.be.reverted;
      await expect(tx2).to.not.be.reverted;

      expect(await distributor.distributedRewards(dp0Info.rewardPoolId, dp0Info.depositPool)).to.eq(wei(20));
      expect(await distributor.distributedRewards(dp1Info.rewardPoolId, dp1Info.depositPool)).to.eq(wei(80));
    });
    it("should revert when `rewardPoolLastCalculatedTimestamp` isn't set", async () => {
      await expect(distributor.distributeRewards(privateRewardPoolId)).to.be.revertedWith(
        "DR: `rewardPoolLastCalculatedTimestamp` isn't set",
      );
    });
    it('should distribute rewards when the reward pool is not public', async () => {
      await distributor.setRewardPoolLastCalculatedTimestamp(privateRewardPoolId, 1);

      await rewardPoolMock.setPeriodRewardAnswer(wei(100));
      await distributor.distributeRewards(privateRewardPoolId);
      expect(await distributor.getDistributedRewards(privateRewardPoolId, dp2Info.depositPool)).to.eq(wei(100));

      await rewardPoolMock.setPeriodRewardAnswer(wei(1.123));
      await distributor.distributeRewards(privateRewardPoolId);
      expect(await distributor.getDistributedRewards(privateRewardPoolId, dp2Info.depositPool)).to.eq(wei(100 + 1.123));
    });
    it('should distribute rewards when the reward pool is public, validate `minRewardsDistributePeriod`', async () => {
      await distributor.setMinRewardsDistributePeriod(60);

      await imitateYield([wei(2), wei(4)], wei(100), [wei(1, 6), wei(2)]);
      await setNextTime(1000);
      await distributor.distributeRewards(publicRewardPoolId);
      expect(await distributor.distributedRewards(dp0Info.rewardPoolId, dp0Info.depositPool)).to.eq(wei(20));
      expect(await distributor.distributedRewards(dp1Info.rewardPoolId, dp1Info.depositPool)).to.eq(wei(80));

      await setNextTime(1000 + 31);
      await distributor.distributeRewards(publicRewardPoolId);

      await imitateYield([wei(2), wei(1)], wei(50), [wei(45, 6), wei(10)]);
      await setNextTime(1000 + 61);
      await distributor.distributeRewards(publicRewardPoolId);
      expect(await distributor.distributedRewards(dp0Info.rewardPoolId, dp0Info.depositPool)).to.eq(wei(20 + 45));
      expect(await distributor.distributedRewards(dp1Info.rewardPoolId, dp1Info.depositPool)).to.eq(wei(80 + 5));
    });
  });

  describe('#supply', () => {
    beforeEach(async () => {
      await createDepositPools();
      await distributor.setRewardPoolLastCalculatedTimestamp(publicRewardPoolId, 1);

      await dp0Info.depositToken.mint(BOB, wei(1000, 6));
      await dp0Info.depositToken.connect(BOB).approve(dp0Info.depositPool, wei(1000, 6));
      await dp1Info.depositToken.mint(BOB, wei(1000));
      await dp1Info.depositToken.connect(BOB).approve(dp1Info.depositPool, wei(1000));
    });

    it('should correctly supply, one deposit pool', async () => {
      await dp0Info.depositPool.connect(BOB).supply(publicRewardPoolId, wei(20, 6));

      let dp0 = await distributor.depositPools(publicRewardPoolId, dp0Info.depositPool);
      expect(dp0.deposited).to.eq(wei(20, 6));
      expect(dp0.lastUnderlyingBalance).to.eq(wei(20, 6));
      expect(await dp0Info.depositToken.balanceOf(distributor)).to.eq(wei(20, 6));

      await imitateYield([wei(1), wei(1)], wei(100), [wei(10, 6), wei(0)]);
      await dp0Info.depositPool.connect(BOB).supply(publicRewardPoolId, wei(20, 6));

      dp0 = await distributor.depositPools(publicRewardPoolId, dp0Info.depositPool);
      expect(dp0.deposited).to.eq(wei(40, 6));
      expect(dp0.lastUnderlyingBalance).to.eq(wei(40, 6));
      expect(await dp0Info.depositToken.balanceOf(distributor)).to.eq(wei(40, 6));
      expect(await dp0Info.depositToken.balanceOf(l1SenderMock)).to.eq(wei(10, 6));

      await imitateYield([wei(1), wei(1)], wei(100), [wei(5, 6), wei(0)]);
      await dp0Info.depositPool.connect(BOB).supply(publicRewardPoolId, wei(8, 6));

      dp0 = await distributor.depositPools(publicRewardPoolId, dp0Info.depositPool);
      expect(dp0.deposited).to.eq(wei(48, 6));
      expect(dp0.lastUnderlyingBalance).to.eq(wei(48, 6));
      expect(await dp0Info.depositToken.balanceOf(distributor)).to.eq(wei(48, 6));
      expect(await dp0Info.depositToken.balanceOf(l1SenderMock)).to.eq(wei(15, 6));
    });
    it('should correctly supply, two deposit pools', async () => {
      await dp0Info.depositPool.connect(BOB).supply(publicRewardPoolId, wei(20, 6));
      await dp1Info.depositPool.connect(BOB).supply(publicRewardPoolId, wei(30));

      let dp0 = await distributor.depositPools(publicRewardPoolId, dp0Info.depositPool);
      expect(dp0.deposited).to.eq(wei(20, 6));
      expect(dp0.lastUnderlyingBalance).to.eq(wei(20, 6));
      expect(await dp0Info.depositToken.balanceOf(distributor)).to.eq(wei(20, 6));

      let dp1 = await distributor.depositPools(publicRewardPoolId, dp1Info.depositPool);
      expect(dp1.deposited).to.eq(wei(30));
      expect(dp1.lastUnderlyingBalance).to.eq(wei(30));
      expect(await dp1Info.depositToken.balanceOf(aavePoolMock)).to.eq(wei(30));

      //////////

      await imitateYield([wei(1), wei(1)], wei(100), [wei(3, 6), wei(6)]);
      await dp0Info.depositPool.connect(BOB).supply(publicRewardPoolId, wei(1, 6));

      dp0 = await distributor.depositPools(publicRewardPoolId, dp0Info.depositPool);
      expect(dp0.deposited).to.eq(wei(20 + 1, 6));
      expect(dp0.lastUnderlyingBalance).to.eq(wei(20 + 1, 6));
      expect(await dp0Info.depositToken.balanceOf(distributor)).to.eq(wei(20 + 1, 6));
      expect(await dp0Info.depositToken.balanceOf(l1SenderMock)).to.eq(wei(3, 6));

      dp1 = await distributor.depositPools(publicRewardPoolId, dp1Info.depositPool);
      expect(dp1.deposited).to.eq(wei(30));
      expect(dp1.lastUnderlyingBalance).to.eq(wei(36));
      expect(await dp1Info.aToken.balanceOf(distributor)).to.eq(wei(36));
      expect(await dp1Info.depositToken.balanceOf(l1SenderMock)).to.eq(wei(0));

      /////////

      await imitateYield([wei(1), wei(1)], wei(100), [wei(4, 6), wei(7)]);
      await dp1Info.depositPool.connect(BOB).supply(publicRewardPoolId, wei(2));

      dp0 = await distributor.depositPools(publicRewardPoolId, dp0Info.depositPool);
      expect(dp0.deposited).to.eq(wei(20 + 1, 6));
      expect(dp0.lastUnderlyingBalance).to.eq(wei(20 + 1 + 4, 6));
      expect(await dp0Info.depositToken.balanceOf(distributor)).to.eq(wei(20 + 1 + 4, 6));
      expect(await dp0Info.depositToken.balanceOf(l1SenderMock)).to.eq(wei(3, 6));

      dp1 = await distributor.depositPools(publicRewardPoolId, dp1Info.depositPool);
      expect(dp1.deposited).to.eq(wei(30 + 2));
      expect(dp1.lastUnderlyingBalance).to.eq(wei(30 + 2));
      expect(await dp1Info.aToken.balanceOf(distributor)).to.eq(wei(30 + 2));
      expect(await dp1Info.depositToken.balanceOf(l1SenderMock)).to.eq(wei(6 + 7));
    });
    it('should revert when invalid strategy for the deposit pool', async () => {
      await expect(dp2Info.depositPool.connect(BOB).supply(privateRewardPoolId, wei(1, 6))).to.be.revertedWith(
        'DR: invalid strategy for the deposit pool',
      );
    });
    it('should revert when deposit pool doesn`t exist', async () => {
      await expect(dp1Info.depositPool.connect(BOB).supply(666, wei(1, 6))).to.be.revertedWith(
        "DR: deposit pool doesn't exist",
      );
    });
  });

  describe('#withdraw', () => {
    beforeEach(async () => {
      await createDepositPools();
      await distributor.setRewardPoolLastCalculatedTimestamp(publicRewardPoolId, 1);

      await dp0Info.depositToken.mint(BOB, wei(1000, 6));
      await dp0Info.depositToken.connect(BOB).approve(dp0Info.depositPool, wei(1000, 6));
      await dp1Info.depositToken.mint(BOB, wei(1000));
      await dp1Info.depositToken.connect(BOB).approve(dp1Info.depositPool, wei(1000));
    });

    it('should correctly withdraw, without yield', async () => {
      await dp0Info.depositPool.connect(BOB).supply(publicRewardPoolId, wei(20, 6));
      await dp0Info.depositPool.connect(BOB).withdraw(publicRewardPoolId, wei(999, 6));

      const dp0 = await distributor.depositPools(publicRewardPoolId, dp0Info.depositPool);
      expect(dp0.deposited).to.eq(wei(0, 6));
      expect(dp0.lastUnderlyingBalance).to.eq(wei(0, 6));
      expect(await dp0Info.depositToken.balanceOf(distributor)).to.eq(wei(0, 6));
      expect(await dp0Info.depositToken.balanceOf(BOB)).to.eq(wei(1000, 6));
    });
    it('should correctly withdraw, partially, with yield, Strategy.NONE', async () => {
      await dp0Info.depositPool.connect(BOB).supply(publicRewardPoolId, wei(20, 6));
      await imitateYield([wei(1), wei(1)], wei(100), [wei(3, 6), wei(0)]);
      await dp0Info.depositPool.connect(BOB).withdraw(publicRewardPoolId, wei(15, 6));

      let dp0 = await distributor.depositPools(publicRewardPoolId, dp0Info.depositPool);
      expect(dp0.deposited).to.eq(wei(5, 6));
      expect(dp0.lastUnderlyingBalance).to.eq(wei(5, 6));
      expect(await dp0Info.depositToken.balanceOf(distributor)).to.eq(wei(5, 6));
      expect(await dp0Info.depositToken.balanceOf(BOB)).to.eq(wei(995, 6));
      expect(await dp0Info.depositToken.balanceOf(l1SenderMock)).to.eq(wei(3, 6));

      //////////

      await imitateYield([wei(1), wei(1)], wei(100), [wei(0, 6), wei(0)]);
      await dp0Info.depositPool.connect(BOB).withdraw(publicRewardPoolId, wei(999, 6));

      dp0 = await distributor.depositPools(publicRewardPoolId, dp0Info.depositPool);
      expect(dp0.deposited).to.eq(wei(0, 6));
      expect(dp0.lastUnderlyingBalance).to.eq(wei(0, 6));
      expect(await dp0Info.depositToken.balanceOf(distributor)).to.eq(wei(0, 6));
      expect(await dp0Info.depositToken.balanceOf(BOB)).to.eq(wei(1000, 6));
      expect(await dp0Info.depositToken.balanceOf(l1SenderMock)).to.eq(wei(3, 6));
    });
    it('should correctly withdraw, partially, with yield, Strategy.AAVE', async () => {
      await dp1Info.depositPool.connect(BOB).supply(publicRewardPoolId, wei(20));
      await imitateYield([wei(1), wei(1)], wei(100), [wei(0, 6), wei(3)]);
      await dp1Info.depositPool.connect(BOB).withdraw(publicRewardPoolId, wei(15));

      let dp1 = await distributor.depositPools(publicRewardPoolId, dp1Info.depositPool);
      expect(dp1.deposited).to.eq(wei(5));
      expect(dp1.lastUnderlyingBalance).to.eq(wei(5));
      expect(await dp1Info.aToken.balanceOf(distributor)).to.eq(wei(5));
      expect(await dp1Info.depositToken.balanceOf(BOB)).to.eq(wei(995));
      expect(await dp1Info.depositToken.balanceOf(l1SenderMock)).to.eq(wei(3));

      //////////

      await imitateYield([wei(1), wei(1)], wei(100), [wei(0, 6), wei(0)]);
      await dp1Info.depositPool.connect(BOB).withdraw(publicRewardPoolId, wei(999));

      dp1 = await distributor.depositPools(publicRewardPoolId, dp1Info.depositPool);
      expect(dp1.deposited).to.eq(wei(0));
      expect(dp1.lastUnderlyingBalance).to.eq(wei(0));
      expect(await dp1Info.aToken.balanceOf(distributor)).to.eq(wei(0));
      expect(await dp1Info.depositToken.balanceOf(BOB)).to.eq(wei(1000));
      expect(await dp1Info.depositToken.balanceOf(l1SenderMock)).to.eq(wei(3));
    });
    it('should revert when invalid strategy for the deposit pool', async () => {
      await expect(dp2Info.depositPool.connect(BOB).withdraw(privateRewardPoolId, wei(1, 6))).to.be.revertedWith(
        'DR: invalid strategy for the deposit pool',
      );
    });
    it('should revert when invalid strategy for the deposit pool', async () => {
      await expect(dp1Info.depositPool.connect(BOB).withdraw(publicRewardPoolId, wei(1, 6))).to.be.revertedWith(
        'DR: nothing to withdraw',
      );
    });
    it('should revert when deposit pool doesn`t exist', async () => {
      await expect(dp1Info.depositPool.connect(BOB).withdraw(666, wei(1, 6))).to.be.revertedWith(
        "DR: deposit pool doesn't exist",
      );
    });
  });

  describe('#withdrawYield', () => {
    beforeEach(async () => {
      await createDepositPools();
      await distributor.setRewardPoolLastCalculatedTimestamp(publicRewardPoolId, 1);

      await dp0Info.depositToken.mint(BOB, wei(1000, 6));
      await dp0Info.depositToken.connect(BOB).approve(dp0Info.depositPool, wei(1000, 6));
      await dp1Info.depositToken.mint(BOB, wei(1000));
      await dp1Info.depositToken.connect(BOB).approve(dp1Info.depositPool, wei(1000));
    });

    it('should correctly withdraw, add yield, withdraw', async () => {
      await imitateYield([wei(1), wei(1)], wei(100), [wei(2, 6), wei(3)]);

      await distributor.connect(BOB).withdrawYield(publicRewardPoolId, dp0Info.depositPool);
      await distributor.connect(BOB).withdrawYield(publicRewardPoolId, dp1Info.depositPool);

      const dp0 = await distributor.depositPools(publicRewardPoolId, dp0Info.depositPool);
      expect(dp0.deposited).to.eq(wei(0, 6));
      expect(dp0.lastUnderlyingBalance).to.eq(wei(0, 6));
      expect(await dp0Info.depositToken.balanceOf(distributor)).to.eq(wei(0, 6));
      expect(await dp0Info.depositToken.balanceOf(l1SenderMock)).to.eq(wei(2, 6));

      const dp1 = await distributor.depositPools(publicRewardPoolId, dp1Info.depositPool);
      expect(dp1.deposited).to.eq(wei(0));
      expect(dp1.lastUnderlyingBalance).to.eq(wei(0));
      expect(await dp1Info.depositToken.balanceOf(distributor)).to.eq(wei(0));
      expect(await dp1Info.depositToken.balanceOf(l1SenderMock)).to.eq(wei(3));
    });
    it('should revert when invalid strategy for the deposit pool', async () => {
      await expect(distributor.connect(BOB).withdrawYield(privateRewardPoolId, dp2Info.depositPool)).to.be.revertedWith(
        'DR: invalid strategy for the deposit pool',
      );
    });
    it('should revert when deposit pool doesn`t exist', async () => {
      await expect(distributor.connect(BOB).withdrawYield(666, dp2Info.depositPool)).to.be.revertedWith(
        "DR: deposit pool doesn't exist",
      );
    });
  });

  describe('#sendMintMessage', () => {
    beforeEach(async () => {
      await createDepositPools();
    });

    it('should correctly send mint message', async () => {
      await dp0Info.depositPool.connect(BOB).sendMintMessage(publicRewardPoolId, BOB, wei(1), ZERO_ADDR);
      expect(await l1SenderMock.minted(BOB)).to.eq(wei(1));

      await dp0Info.depositPool.connect(BOB).sendMintMessage(privateRewardPoolId, BOB, wei(1), ZERO_ADDR);
      expect(await l1SenderMock.minted(BOB)).to.eq(wei(2));
    });
    it('should revert when deposit pool doesn`t exist', async () => {
      await expect(
        dp1Info.depositPool.connect(BOB).sendMintMessage(privateRewardPoolId, BOB, wei(1), ZERO_ADDR),
      ).to.be.revertedWith("DR: deposit pool doesn't exist");
    });
  });

  describe('#withdrawUndistributedRewards', () => {
    beforeEach(async () => {
      await createDepositPools();
      await distributor.setRewardPoolLastCalculatedTimestamp(publicRewardPoolId, 1);
    });

    it('should correctly withdraw', async () => {
      await imitateYield([wei(1), wei(1)], wei(33), [wei(0, 6), wei(0)]);
      await distributor.distributeRewards(publicRewardPoolId);
      expect(await distributor.undistributedRewards()).to.eq(wei(33));

      await distributor.withdrawUndistributedRewards(BOB, ZERO_ADDR);
      expect(await l1SenderMock.minted(BOB)).to.eq(wei(33));

      expect(await distributor.undistributedRewards()).to.eq(wei(0));
    });
    it('should revert when nothing to withdraw', async () => {
      await expect(distributor.withdrawUndistributedRewards(BOB, ZERO_ADDR)).to.be.revertedWith(
        'DR: nothing to withdraw',
      );
    });
    it('should revert when caller is not the owner', async () => {
      await expect(distributor.connect(BOB).withdrawUndistributedRewards(BOB, ZERO_ADDR)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  const createDepositPools = async () => {
    for (let i = 0; i < depositPools.length; i++) {
      await chainLinkDataConsumerMock.setAnswer(depositPools[i].chainLinkPath, wei(i + 1));

      const depositPool = depositPools[i];
      await distributor.addDepositPool(
        depositPool.rewardPoolId,
        depositPool.depositPool,
        depositPool.depositToken,
        depositPool.chainLinkPath,
        depositPool.strategy,
      );
    }
  };

  const imitateYield = async (prices: bigint[], rewards: bigint, yields: bigint[]) => {
    for (let i = 0; i < depositPools.length; i++) {
      if (depositPools[i].strategy === Strategy.NO_YIELD) {
        continue;
      }

      await chainLinkDataConsumerMock.setAnswer(depositPools[i].chainLinkPath, prices[i]);
    }

    await rewardPoolMock.setPeriodRewardAnswer(rewards);

    for (let i = 0; i < depositPools.length; i++) {
      if (depositPools[i].strategy === Strategy.NONE) {
        await depositPools[i].depositToken.mint(distributor, yields[i]);
      } else if (depositPools[i].strategy === Strategy.AAVE) {
        await depositPools[i].aToken.mint(distributor, yields[i]);
        await depositPools[i].depositToken.mint(aavePoolMock, yields[i]);
      }
    }
  };
});

// npx hardhat test "test/capital-protocol/Distributor.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/capital-protocol/Distributor.test.ts"
