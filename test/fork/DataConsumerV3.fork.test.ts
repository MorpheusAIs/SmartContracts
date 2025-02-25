import { ethers } from 'hardhat';

import { Reverter } from '../helpers/reverter';

import { DataConsumerV3 } from '@/generated-types/ethers';

describe('AAA', () => {
  const reverter = new Reverter();
  let contract: DataConsumerV3;

  before(async () => {
    await ethers.provider.send('hardhat_reset', [
      {
        forking: {
          jsonRpcUrl: `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
          blockNumber: 21879510,
        },
      },
    ]);

    const factory = await ethers.getContractFactory('DataConsumerV3');
    contract = await factory.deploy();

    await reverter.snapshot();
  });

  beforeEach(async () => {
    await reverter.revert();
  });

  after(async () => {
    await ethers.provider.send('hardhat_reset', []);
  });

  describe('should not change previous layout', () => {
    it('should have the same fields', async () => {
      const aaa = await contract.getChainlinkDataFeedLatestAnswer();
      console.log(aaa);
    });
  });
});

// npm run generate-types && npx hardhat test "test/fork/DataConsumerV3.fork.test.ts"
