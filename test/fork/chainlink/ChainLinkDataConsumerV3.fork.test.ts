import { formatUnits } from 'ethers';
import { ethers } from 'hardhat';

import { Reverter } from '../../helpers/reverter';

import { ChainLinkDataConsumerV3 } from '@/generated-types/ethers';
import { deployChainLinkDataConsumerV3 } from '@/test/helpers/deployers';

describe('ChainLinkDataConsumerV3', () => {
  const reverter = new Reverter();

  let consumer: ChainLinkDataConsumerV3;

  const data = [
    {
      path: 'USDC/USD',
      addresses: ['0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6'],
    },
    {
      path: 'USDT/USD',
      addresses: ['0x3E7d1eAB13ad0104d2750B8863b489D65364e32D'],
    },
    {
      path: 'cbBTC/USD',
      addresses: ['0x2665701293fCbEB223D11A08D826563EDcCE423A'],
    },
    {
      path: 'wBTC/BTC,BTC/USD',
      addresses: ['0xfdFD9C85aD200c506Cf9e21F1FD8dd01932FBB23', '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c'],
    },
    {
      path: 'wstETH/USD',
      addresses: ['0x164b276057258d81941e97B0a900D4C7B358bCe0'],
    },
  ];
  const paths = data.map((e) => e.path);
  const feeds = data.map((e) => e.addresses);

  before(async () => {
    await ethers.provider.send('hardhat_reset', [
      {
        forking: {
          jsonRpcUrl: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
          blockNumber: 21923000,
        },
      },
    ]);

    consumer = await deployChainLinkDataConsumerV3();

    await consumer.updateDataFeeds(paths, feeds);

    await reverter.snapshot();
  });

  beforeEach(async () => {
    await reverter.revert();
  });

  after(async () => {
    await ethers.provider.send('hardhat_reset', []);
  });

  describe('#getChainLinkDataFeedLatestAnswer', () => {
    it('should return correct prices', async () => {
      const decimals = 8;

      for (let i = 0; i < paths.length; i++) {
        const res = await consumer.getChainLinkDataFeedLatestAnswer(await consumer.getPathId(paths[i]));

        const from = paths[i].split(',')[0].split('/')[0];
        const to = paths[i].split(',')[paths[i].split(',').length - 1].split('/')[1];
        console.log(`       ${from}: ${formatUnits(res, decimals)} ${to}`);
      }
    });
  });
});

// npm run generate-types && npx hardhat test "test/fork/chainlink/ChainLinkDataConsumerV3.fork.test.ts"
