import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { ethers, expect } from 'hardhat';

import { MOROFT, OptionsGenerator } from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';
import { Reverter } from '@/test/helpers/reverter';

describe('MOROFT', () => {
  const reverter = new Reverter();

  let SECOND: SignerWithAddress;
  let MINTER: SignerWithAddress;
  let DELEGATE: SignerWithAddress;

  let optionsGenerator: OptionsGenerator;

  let l1Mor: MOROFT;
  let l2Mor: MOROFT;

  // *** LZ CONFIG ***
  // https://docs.layerzero.network/contracts/endpoint-addresses
  // Ethereum
  const l1LzEndpointV2Address = '0x1a44076050125825900e736c501f859c50fe728c';
  // const l1ChainId = 30101;
  // Arbitrum
  const l2LzEndpointV2Address = '0x1a44076050125825900e736c501f859c50fe728c';
  const l2ChainId = 30110;
  // ***

  before(async () => {
    await ethers.provider.send('hardhat_reset', [
      {
        forking: {
          jsonRpcUrl: `https://arbitrum-mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
          // blockNumber: 190000000,
        },
      },
    ]);

    [SECOND, MINTER, DELEGATE] = await ethers.getSigners();

    const [MOR, OptionsGenerator] = await Promise.all([
      ethers.getContractFactory('MOROFT'),
      ethers.getContractFactory('OptionsGenerator'),
    ]);

    optionsGenerator = await OptionsGenerator.deploy();
    l1Mor = await MOR.deploy(l1LzEndpointV2Address, DELEGATE.address, MINTER.address);
    l2Mor = await MOR.deploy(l2LzEndpointV2Address, DELEGATE.address, MINTER.address);

    await reverter.snapshot();
  });

  afterEach(async () => {
    await reverter.revert();
  });

  after(async () => {
    await ethers.provider.send('hardhat_reset', []);
  });

  describe('send', () => {
    it('should send token to LZ endpoint and burn tokens', async () => {
      // Mint tokens to `SECOND`
      const amount = wei('10');
      await l1Mor.connect(MINTER).mint(SECOND.address, amount);

      // Add L2 chain ID to available list
      const l2MorBytes32Address = ethers.zeroPadValue(await l2Mor.getAddress(), 32);

      await l1Mor.connect(DELEGATE).setPeer(l2ChainId, l2MorBytes32Address);
      expect(await l1Mor.isPeer(l2ChainId, l2MorBytes32Address)).to.be.true;

      // Detect options for enforce params
      const executorGas = 200000; // Gas limit for the executor
      const executorValue = 0; // msg.value for the lzReceive() function on destination in wei
      // https://docs.layerzero.network/contracts/options#step-2-initializing-options
      const options = await optionsGenerator.createLzReceiveOption(executorGas, executorValue);

      // Set default options
      // https://docs.layerzero.network/contracts/oft#message-execution-options
      // https://docs.layerzero.network/contracts/options
      const enforcedOptionParam = [
        {
          eid: l2ChainId, // uint32. destination endpoint id
          msgType: 1, // uint16. the message type
          options: options, // bytes. the execution option bytes array
        },
      ];
      await l1Mor.connect(DELEGATE).setEnforcedOptions(enforcedOptionParam);

      // Get transfer fees
      const sendParams = {
        dstEid: l2ChainId, // uint32. Destination endpoint ID.
        to: l2MorBytes32Address, // bytes32. Recipient address.
        amountLD: amount, // uint256. Amount to send in local decimals.
        minAmountLD: amount, // uint256. Minimum amount to send in local decimals.
        extraOptions: '0x', // bytes. Additional options supplied by the caller to be used in the LayerZero message.
        composeMsg: '0x', // bytes. The composed message for the send() operation.
        oftCmd: '0x', // bytes. The OFT command to be executed, unused in default OFT implementations.
      };
      const quoteRes = await l1Mor.quoteSend(sendParams, false);
      // [40267, '0x000000000000000000000000901F2d23823730fb7F2356920e0E273EFdCdFe17', 123, 1, '0x', '0x', '0x'];

      // Send token to L2 and check that tokens have burned on L1
      const messagingFee = {
        nativeFee: quoteRes[0].toString(), // uint. gas amount in native gas token
        lzTokenFee: 0, // uint. gas amount in ZRO token
      };

      expect(await l1Mor.balanceOf(SECOND.address)).to.equal(amount);
      await l1Mor.connect(SECOND).send(sendParams, messagingFee, SECOND, { value: quoteRes[0].toString() });
      expect(await l1Mor.balanceOf(SECOND.address)).to.equal(0);
    });
  });
});

// npx hardhat test "test/fork/MOROFT.fork.test.ts"
