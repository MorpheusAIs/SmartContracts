import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { setTime } from '../helpers/block-helper';
import {
  deployChainLinkAggregatorV3Mock,
  deployChainLinkDataConsumer,
  deployInterfaceMock,
} from '../helpers/deployers';

import { ChainLinkAggregatorV3Mock, ChainLinkDataConsumer } from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';
import { Reverter } from '@/test/helpers/reverter';

describe('ChainLinkDataConsumer', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;

  let dataConsumer: ChainLinkDataConsumer;

  const data = [
    {
      path: 'USDC/USD',
      addresses: [''],
    },
    {
      path: 'wBTC/BTC,BTC/USD',
      addresses: ['', ''],
    },
    {
      path: 'wBTC/BTC,BTC/ETH',
      addresses: ['', ''],
    },
  ];
  let paths: string[];
  let feedContracts: ChainLinkAggregatorV3Mock[][];
  let feeds: string[][];

  before(async () => {
    [OWNER, SECOND] = await ethers.getSigners();

    dataConsumer = await deployChainLinkDataConsumer();

    paths = data.map((e) => e.path);
    feedContracts = [
      [await deployChainLinkAggregatorV3Mock(18)],
      [await deployChainLinkAggregatorV3Mock(8), await deployChainLinkAggregatorV3Mock(12)],
      [await deployChainLinkAggregatorV3Mock(12), await deployChainLinkAggregatorV3Mock(8)],
    ];
    feeds = [
      [await feedContracts[0][0].getAddress()],
      [await feedContracts[1][0].getAddress(), await feedContracts[1][1].getAddress()],
      [await feedContracts[2][0].getAddress(), await feedContracts[2][1].getAddress()],
    ];

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe('UUPS proxy functionality', () => {
    describe('#constructor', () => {
      it('should disable initialize function', async () => {
        const reason = 'Initializable: contract is already initialized';

        await expect(dataConsumer.connect(OWNER).ChainLinkDataConsumer_init()).to.be.revertedWith(reason);
      });
    });

    describe('#_authorizeUpgrade', () => {
      it('should upgrade to the new version', async () => {
        const [factory] = await Promise.all([ethers.getContractFactory('FeeConfigV2')]);
        const contract = await factory.deploy();

        await dataConsumer.upgradeTo(contract);
        expect(await dataConsumer.version()).to.eq(2);
      });

      it('should revert if caller is not the owner', async () => {
        await expect(dataConsumer.connect(SECOND).upgradeTo(ZERO_ADDR)).to.be.revertedWith(
          'Ownable: caller is not the owner',
        );
      });
    });

    describe('#version()', () => {
      it('should return correct version', async () => {
        expect(await dataConsumer.version()).to.eq(1);
      });
    });
  });

  describe('supportsInterface', () => {
    it('should support IChainLinkDataConsumer', async () => {
      const interfaceMock = await deployInterfaceMock();
      expect(await dataConsumer.supportsInterface(await interfaceMock.getIChainLinkDataConsumerInterfaceId())).to.be
        .true;
    });
    it('should support IERC165', async () => {
      const interfaceMock = await deployInterfaceMock();
      expect(await dataConsumer.supportsInterface(await interfaceMock.getIERC165InterfaceId())).to.be.true;
    });
  });

  describe('#setAllowedPriceUpdateDelay', () => {
    it('should set new value', async () => {
      await dataConsumer.setAllowedPriceUpdateDelay(10);
      expect(await dataConsumer.allowedPriceUpdateDelay()).to.eq(10);

      await dataConsumer.setAllowedPriceUpdateDelay(20);
      expect(await dataConsumer.allowedPriceUpdateDelay()).to.eq(20);
    });
    it('should revert if caller is not owner', async () => {
      await expect(dataConsumer.connect(SECOND).setAllowedPriceUpdateDelay(30)).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#updateDataFeeds', () => {
    it('should add new reward pool', async () => {
      await dataConsumer.updateDataFeeds(paths, feeds);

      for (let i = 0; i < paths.length; i++) {
        const pathId = await dataConsumer.getPathId(paths[i]);
        for (let k = 0; k < feeds[i].length; k++) {
          expect(await dataConsumer.dataFeeds(pathId, k)).to.eq(feeds[i][k]);
        }
      }

      expect(await dataConsumer.decimals()).to.eq(18);
    });
    it('should revert when mismatched array lengths', async () => {
      await expect(dataConsumer.updateDataFeeds([''], [])).to.be.revertedWith('CLDC: mismatched array lengths');
    });
    it('should revert when empty feed array', async () => {
      await expect(dataConsumer.updateDataFeeds([''], [[]])).to.be.revertedWith('CLDC: empty feed array');
    });
    it('should revert if caller is not owner', async () => {
      await expect(dataConsumer.connect(SECOND).updateDataFeeds([], [])).to.be.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('#getChainLinkDataFeedLatestAnswer', () => {
    beforeEach(async () => {
      await dataConsumer.setAllowedPriceUpdateDelay(120);
    });
    it('should return correct result, base decimals', async () => {
      await dataConsumer.updateDataFeeds(paths, feeds);

      const pathId = await dataConsumer.getPathId(paths[0]);
      const aggregator = feedContracts[0][0];
      await aggregator.setAnswerResult(wei(1.2345, 18));

      expect(await dataConsumer.getChainLinkDataFeedLatestAnswer(pathId)).to.eq(wei(1.2345, 18));
    });
    it('should return correct result, 8 -> 12 -> 18', async () => {
      await dataConsumer.updateDataFeeds(paths, feeds);

      const pathId = await dataConsumer.getPathId(paths[1]);
      const aggregator1 = feedContracts[1][0];
      await aggregator1.setAnswerResult(wei(6, 8));
      const aggregator2 = feedContracts[1][1];
      await aggregator2.setAnswerResult(wei(0.5, 12));

      expect(await dataConsumer.getChainLinkDataFeedLatestAnswer(pathId)).to.eq(wei(3, 18));
    });
    it('should return correct result, 12 -> 8 -> 18', async () => {
      await dataConsumer.updateDataFeeds(paths, feeds);

      const pathId = await dataConsumer.getPathId(paths[2]);
      const aggregator1 = feedContracts[2][0];
      await aggregator1.setAnswerResult(wei(8, 12));
      const aggregator2 = feedContracts[2][1];
      await aggregator2.setAnswerResult(wei(0.25, 8));

      expect(await dataConsumer.getChainLinkDataFeedLatestAnswer(pathId)).to.eq(wei(2, 18));
    });
    it('should return zero when the update price delay is too big', async () => {
      await dataConsumer.updateDataFeeds(paths, feeds);

      const pathId = await dataConsumer.getPathId(paths[0]);
      const aggregator = feedContracts[0][0];
      await aggregator.setAnswerResult(wei(1.2345, 18));
      await aggregator.setUpdated(600);

      await setTime(720);
      expect(await dataConsumer.getChainLinkDataFeedLatestAnswer(pathId)).to.eq(wei(1.2345, 18));

      await setTime(721);
      expect(await dataConsumer.getChainLinkDataFeedLatestAnswer(pathId)).to.eq(wei(0, 18));
    });
    it('should return zero when result less then 0 or equals', async () => {
      await dataConsumer.updateDataFeeds(paths, feeds);

      const pathId = await dataConsumer.getPathId(paths[0]);
      const aggregator = feedContracts[0][0];

      await aggregator.setAnswerResult(wei(0, 18));
      expect(await dataConsumer.getChainLinkDataFeedLatestAnswer(pathId)).to.eq(wei(0, 18));

      await aggregator.setAnswerResult(wei(-1, 18));
      expect(await dataConsumer.getChainLinkDataFeedLatestAnswer(pathId)).to.eq(wei(0, 18));
    });
    it('should return zero when path is invalid', async () => {
      await dataConsumer.updateDataFeeds(['undefined'], [[dataConsumer]]);
      const pathId = await dataConsumer.getPathId('undefined');
      expect(await dataConsumer.getChainLinkDataFeedLatestAnswer(pathId)).to.eq(wei(0, 18));
    });
  });
});

// npx hardhat test "test/capital-protocol/ChainLinkDataConsumer.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/capital-protocol/ChainLinkDataConsumer.test.ts"
