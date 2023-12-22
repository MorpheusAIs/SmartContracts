import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { L2MessageReceiver, MOR } from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';
import { wei } from '@/scripts/utils/utils';
import { Reverter } from '@/test/helpers/reverter';

describe('L2MessageReceiver', () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;
  let THIRD: SignerWithAddress;

  let l2MessageReceiver: L2MessageReceiver;
  let mor: MOR;
  before(async () => {
    [OWNER, SECOND, THIRD] = await ethers.getSigners();

    const [L2MessageReceiver, Mor] = await Promise.all([
      ethers.getContractFactory('L2MessageReceiver'),
      ethers.getContractFactory('MOR'),
      ethers.getContractFactory('LZEndpointMock'),
    ]);

    [mor, l2MessageReceiver] = await Promise.all([Mor.deploy(wei(100)), L2MessageReceiver.deploy()]);

    await l2MessageReceiver.setParams(mor, {
      gateway: THIRD,
      sender: OWNER,
      senderChainId: 2,
    });

    await mor.transferOwnership(l2MessageReceiver);

    reverter.snapshot();
  });

  beforeEach(async () => {
    await reverter.revert();
  });

  describe('setParams', () => {
    it('should set params', async () => {
      await l2MessageReceiver.setParams(mor, {
        gateway: ZERO_ADDR,
        sender: SECOND,
        senderChainId: 1,
      });

      expect(await l2MessageReceiver.rewardToken()).to.be.equal(await mor.getAddress());
      expect(await l2MessageReceiver.config()).to.be.deep.equal([ZERO_ADDR, await SECOND.getAddress(), 1n]);
    });

    it('should revert if not owner', async () => {
      await expect(
        l2MessageReceiver.connect(SECOND).setParams(ZERO_ADDR, {
          gateway: ZERO_ADDR,
          sender: OWNER,
          senderChainId: 0,
        }),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('lzReceive', () => {
    it('should update nonce and mint tokens', async () => {
      const address = ethers.solidityPacked(
        ['address', 'address'],
        [await OWNER.getAddress(), await l2MessageReceiver.getAddress()],
      );
      const payload = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256'],
        [await SECOND.getAddress(), wei(1)],
      );

      const tx = await l2MessageReceiver.connect(THIRD).lzReceive(2, address, 5, payload);
      await expect(tx).to.changeTokenBalance(mor, SECOND, wei(1));
      expect(await l2MessageReceiver.nonce()).to.be.equal(5);
    });
    it('should update nonce and mint tokens', async () => {
      const address = ethers.solidityPacked(
        ['address', 'address'],
        [await OWNER.getAddress(), await l2MessageReceiver.getAddress()],
      );
      let payload = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256'],
        [await SECOND.getAddress(), wei(99)],
      );

      let tx = await l2MessageReceiver.connect(THIRD).lzReceive(2, address, 5, payload);
      await expect(tx).to.changeTokenBalance(mor, SECOND, wei(99));
      expect(await l2MessageReceiver.nonce()).to.be.equal(5);

      payload = ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [await SECOND.getAddress(), wei(2)]);

      tx = await l2MessageReceiver.connect(THIRD).lzReceive(2, address, 6, payload);
      await expect(tx).to.changeTokenBalance(mor, SECOND, wei(1));
      expect(await l2MessageReceiver.nonce()).to.be.equal(6);

      payload = ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [await SECOND.getAddress(), wei(2)]);

      tx = await l2MessageReceiver.connect(THIRD).lzReceive(2, address, 7, payload);
      await expect(tx).to.changeTokenBalance(mor, SECOND, wei(0));
      expect(await l2MessageReceiver.nonce()).to.be.equal(7);

      payload = ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [await SECOND.getAddress(), wei(0)]);

      tx = await l2MessageReceiver.connect(THIRD).lzReceive(2, address, 8, payload);
      await expect(tx).to.changeTokenBalance(mor, SECOND, wei(0));
      expect(await l2MessageReceiver.nonce()).to.be.equal(8);
    });
    it('should revert if provided wrong nonce', async () => {
      await expect(l2MessageReceiver.lzReceive(1, '0x', 0, '0x')).to.be.revertedWith('L2MR: invalid nonce');
    });
    it('should revert if provided wrong lzEndpoint', async () => {
      await expect(l2MessageReceiver.lzReceive(0, '0x', 1, '0x')).to.be.revertedWith('L2MR: invalid gateway');
    });
    it('should revert if provided wrong chainId', async () => {
      await expect(l2MessageReceiver.connect(THIRD).lzReceive(0, '0x', 1, '0x')).to.be.revertedWith(
        'L2MR: invalid sender chain ID',
      );
    });
    it('should revert if provided wrong sender', async () => {
      await expect(l2MessageReceiver.connect(THIRD).lzReceive(2, '0x', 1, '0x')).to.be.revertedWith(
        'L2MR: invalid sender address',
      );
    });
  });
});

// npx hardhat test "test/L2MessageReceiver.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/L2MessageReceiver.test.ts"
