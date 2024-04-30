import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { ethers, expect } from 'hardhat';

import { LayerZeroEndpointV2Mock, MOROFT, MORWormhole } from '@/generated-types/ethers';
import { Reverter } from '@/test/helpers/reverter';

describe('MORWormhole', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let FIRST: SignerWithAddress;
  let SECOND: SignerWithAddress;
  let DELEGATE: SignerWithAddress;

  let mor: MOROFT;
  let morWormhole: MORWormhole;
  let lZEndpointMock: LayerZeroEndpointV2Mock;

  const chainId = 10003;

  before(async () => {
    await ethers.provider.send('hardhat_reset', [
      {
        // forking: {
        //   jsonRpcUrl: `https://arbitrum-sepolia.infura.io/v3/${process.env.INFURA_KEY}`,
        //   blockNumber: 38807268,
        // },
        forking: {
          jsonRpcUrl: `https://sepolia.infura.io/v3/${process.env.INFURA_KEY}`,
          blockNumber: 5804434,
        },
      },
    ]);

    [OWNER, FIRST, SECOND, DELEGATE] = await ethers.getSigners();

    const wormholeRelayer = '0x7B1bD7a6b4E61c2a123AC6BC2cbfC614437D0470';
    const tokenBridge = '0xC7A204bDBFe983FCD8d8E61D02b475D4073fF97e';
    const wormhole = '0x6b9C8671cdDC8dEab9c719bB87cBd3e782bA6a35';

    const [LZEndpointMock, MOR] = await Promise.all([
      ethers.getContractFactory('LayerZeroEndpointV2Mock'),
      ethers.getContractFactory('MOROFT'),
    ]);

    lZEndpointMock = await LZEndpointMock.deploy(chainId, OWNER.address);
    mor = await MOR.deploy(lZEndpointMock, DELEGATE.address, OWNER.address);

    const MORWormhole = await ethers.getContractFactory('MORWormhole');
    morWormhole = await MORWormhole.deploy(wormholeRelayer, tokenBridge, wormhole);

    await reverter.snapshot();
  });

  afterEach(async () => {
    await reverter.revert();
  });

  describe('sendCrossChainDeposit', () => {
    it('should burn tokens correctly when sending cross-chain deposit', async () => {
      await mor.connect(OWNER).mint(FIRST, 100);
      await mor.connect(FIRST).approve(morWormhole, 100);

      const cost = await morWormhole.quoteCrossChainDeposit(2);
      await morWormhole
        .connect(FIRST)
        .sendCrossChainDeposit(2, await mor.getAddress(), SECOND, 40, await mor.getAddress(), { value: cost });

      expect(await mor.balanceOf(FIRST)).to.be.equal(60);
    });

    it('should not allow to send cross-chain deposit with incorrect tx fee', async () => {
      await mor.connect(OWNER).mint(FIRST, 100);
      await mor.connect(FIRST).approve(morWormhole, 100);

      const incorrectCost = await morWormhole.quoteCrossChainDeposit(14);
      await expect(
        morWormhole
          .connect(FIRST)
          .sendCrossChainDeposit(2, await mor.getAddress(), SECOND, 40, await mor.getAddress(), {
            value: incorrectCost,
          }),
      ).to.be.revertedWith('MORWormhole: msg.value must be quoteCrossChainDeposit(targetChain)');

      expect(await mor.balanceOf(FIRST)).to.be.equal(100);
    });
  });
});

// npx hardhat test "test/fork/MORWormhole.fork.test.ts"
