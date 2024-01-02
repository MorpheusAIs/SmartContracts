import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { L2MessageReceiver, L2MessageReceiverV2, MOR } from '@/generated-types/ethers';
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

    const [ERC1967ProxyFactory, L2MessageReceiver, Mor] = await Promise.all([
      ethers.getContractFactory('ERC1967Proxy'),
      ethers.getContractFactory('L2MessageReceiver'),
      ethers.getContractFactory('MOR'),
    ]);

    mor = await Mor.deploy(wei(100));

    const l2MessageReceiverImplementation = await L2MessageReceiver.deploy();
    const l2MessageReceiverProxy = await ERC1967ProxyFactory.deploy(l2MessageReceiverImplementation, '0x');
    l2MessageReceiver = L2MessageReceiver.attach(l2MessageReceiverProxy) as L2MessageReceiver;
    await l2MessageReceiver.L2MessageReceiver__init();

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

  describe('UUPS proxy functionality', () => {
    describe('#Distribution_init', () => {
      it('should revert if try to call init function twice', async () => {
        const reason = 'Initializable: contract is already initialized';

        await expect(l2MessageReceiver.L2MessageReceiver__init()).to.be.rejectedWith(reason);
      });
    });

    describe('#_authorizeUpgrade', () => {
      it('should correctly upgrade', async () => {
        const l2MessageReceiverV2Factory = await ethers.getContractFactory('L2MessageReceiverV2');
        const l2MessageReceiverV2Implementation = await l2MessageReceiverV2Factory.deploy();

        await l2MessageReceiver.upgradeTo(l2MessageReceiverV2Implementation);

        const l2MessageReceiverV2 = l2MessageReceiverV2Factory.attach(l2MessageReceiver) as L2MessageReceiverV2;

        expect(await l2MessageReceiverV2.version()).to.eq(2);
      });
      it('should revert if caller is not the owner', async () => {
        await expect(l2MessageReceiver.connect(SECOND).upgradeTo(ZERO_ADDR)).to.be.revertedWith(
          'Ownable: caller is not the owner',
        );
      });
    });
  });

  describe('#setParams', () => {
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

  describe('#lzReceive', () => {
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
      expect(await l2MessageReceiver.isNonceUsed(5)).to.be.equal(true);
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
      expect(await l2MessageReceiver.isNonceUsed(5)).to.be.equal(true);
      payload = ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [await SECOND.getAddress(), wei(2)]);
      tx = await l2MessageReceiver.connect(THIRD).lzReceive(2, address, 6, payload);
      await expect(tx).to.changeTokenBalance(mor, SECOND, wei(1));
      expect(await l2MessageReceiver.isNonceUsed(6)).to.be.equal(true);
      payload = ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [await SECOND.getAddress(), wei(2)]);
      tx = await l2MessageReceiver.connect(THIRD).lzReceive(2, address, 7, payload);
      await expect(tx).to.changeTokenBalance(mor, SECOND, wei(0));
      expect(await l2MessageReceiver.isNonceUsed(7)).to.be.equal(true);
      payload = ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [await SECOND.getAddress(), wei(0)]);
      tx = await l2MessageReceiver.connect(THIRD).lzReceive(2, address, 8, payload);
      await expect(tx).to.changeTokenBalance(mor, SECOND, wei(0));
      expect(await l2MessageReceiver.isNonceUsed(8)).to.be.equal(true);
    });
    it('should revert if provided wrong lzEndpoint', async () => {
      await expect(l2MessageReceiver.lzReceive(0, '0x', 1, '0x')).to.be.revertedWith('L2MR: invalid gateway');
    });
  });

  describe('#nonblockingLzReceive', () => {
    it('should revert if invalid caller', async () => {
      await expect(l2MessageReceiver.nonblockingLzReceive(2, '0x', 999, '0x')).to.be.revertedWith(
        'L2MR: invalid caller',
      );
    });
  });

  describe('#retryMessage', () => {
    let senderAndReceiverAddresses = '';
    let payload = '';
    const chainId = 2;

    beforeEach(async () => {
      senderAndReceiverAddresses = ethers.solidityPacked(
        ['address', 'address'],
        [await SECOND.getAddress(), await l2MessageReceiver.getAddress()],
      );
      payload = ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [await SECOND.getAddress(), wei(99)]);

      // Fail this call
      await l2MessageReceiver.connect(THIRD).lzReceive(chainId, senderAndReceiverAddresses, 999, payload);
    });
    it('should have one blocked message', async () => {
      await expect(await l2MessageReceiver.failedMessages(chainId, senderAndReceiverAddresses, 999)).to.eq(
        ethers.keccak256(payload),
      );
    });
    it('should retry failed message', async () => {
      await l2MessageReceiver.setParams(mor, {
        gateway: THIRD,
        sender: SECOND,
        senderChainId: 2,
      });

      const tx = await l2MessageReceiver.retryMessage(chainId, senderAndReceiverAddresses, 999, payload);
      await expect(tx).to.changeTokenBalance(mor, SECOND, wei(99));
    });
    it('should revert if invalid caller', async () => {
      await expect(l2MessageReceiver.nonblockingLzReceive(chainId, '0x', 999, '0x')).to.be.revertedWith(
        'L2MR: invalid caller',
      );
    });
    it('should revert if provided wrong chainId', async () => {
      await l2MessageReceiver.setParams(mor, {
        gateway: THIRD,
        sender: SECOND,
        senderChainId: 3,
      });

      await expect(
        l2MessageReceiver.retryMessage(chainId, senderAndReceiverAddresses, 999, payload),
      ).to.be.revertedWith('L2MR: invalid sender chain ID');
    });
    it('should revert if provided wrong sender', async () => {
      await expect(
        l2MessageReceiver.retryMessage(chainId, senderAndReceiverAddresses, 999, payload),
      ).to.be.revertedWith('L2MR: invalid sender address');
    });
  });
});

// npx hardhat test "test/L2MessageReceiver.test.ts"
// npx hardhat coverage --solcoverjs ./.solcover.ts --testfiles "test/L2MessageReceiver.test.ts"
