import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { Reverter } from '../../helpers/reverter';

import { DepositPool, Distributor, DistributorV2, StETHMock } from '@/generated-types/ethers';
import { wei } from '@/scripts/utils/utils';

describe('DistributorV2 Fork', () => {
  const reverter = new Reverter();

  let SIGNER: SignerWithAddress;
  let MS: SignerWithAddress;

  let distributor: Distributor;

  let stETH: StETHMock;
  let wETH: StETHMock;
  let USDC: StETHMock;
  let USDT: StETHMock;
  // let wBTC: StETHMock;

  const msAddress = '0x1FE04BC15Cf2c5A2d41a0b3a96725596676eBa1E';

  const distributorProxyAddress = '0xDf1AC1AC255d91F5f4B1E3B4Aef57c5350F64C7A';

  const depositPoolProxyAddressStETH = '0x47176b2af9885dc6c4575d4efd63895f7aaa4790';
  const depositPoolProxyAddressWBTC = '0xdE283F8309Fd1AA46c95d299f6B8310716277A42';
  const depositPoolProxyAddressWETH = '0x9380d72aBbD6e0Cc45095A2Ef8c2CA87d77Cb384';
  const depositPoolProxyAddressUSDC = '0x6cCE082851Add4c535352f596662521B4De4750E';
  const depositPoolProxyAddressUSDT = '0x3B51989212BEdaB926794D6bf8e9E991218cf116';

  const stETHAddress = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84';
  // const wBTCAddress = '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599';
  const wETHAddress = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
  const usdcAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
  const usdtAddress = '0xdac17f958d2ee523a2206206994597c13d831ec7';

  before(async () => {
    await createFork();

    [SIGNER] = await ethers.getSigners();
    MS = await ethers.getImpersonatedSigner(msAddress);

    distributor = (await ethers.getContractFactory('Distributor')).attach(distributorProxyAddress) as Distributor;

    stETH = (await ethers.getContractFactory('StETHMock')).attach(stETHAddress) as StETHMock;
    wETH = (await ethers.getContractFactory('StETHMock')).attach(wETHAddress) as StETHMock;
    USDC = (await ethers.getContractFactory('StETHMock')).attach(usdcAddress) as StETHMock;
    USDT = (await ethers.getContractFactory('StETHMock')).attach(usdtAddress) as StETHMock;
    // wBTC = (await ethers.getContractFactory('StETHMock')).attach(wBTCAddress) as StETHMock;

    await reverter.snapshot();
  });

  beforeEach(async () => {
    await reverter.revert();
  });

  after(async () => {
    await ethers.provider.send('hardhat_reset', []);
  });

  describe('#upgradeTo', () => {
    let distributorV2: DistributorV2;
    beforeEach(async () => {
      distributorV2 = await upgradeToV2();
    });

    it('should correctly upgrade to the new version', async () => {
      expect(await distributorV2.version()).to.eq(2);
    });
    it('should activate stake and withdraw for the wBTC poll', async () => {
      const user = await ethers.getImpersonatedSigner('0x8FC88dDE93184fe5F5878F860B0bFD89115Eb96c');
      await SIGNER.sendTransaction({ to: user, value: wei(1) });

      const depositPoolWBTC = await getDepositPool(depositPoolProxyAddressWBTC);

      // Stake works
      await depositPoolWBTC.connect(user).stake(0, '10000', 0, user);
      const depositPoolsData = await distributorV2.depositPools(0, depositPoolProxyAddressWBTC);
      expect(depositPoolsData.deposited).to.eq('20000');
      expect(depositPoolsData.lastUnderlyingBalance).to.closeTo('20000', 2);

      // Withdraw reverted after the call to DistributorV2
      await expect(depositPoolWBTC.connect(user).withdraw(0, '19999')).to.be.revertedWith(
        'DS: pool withdraw is locked',
      );
    });
    it('should remain functional after the upgrade', async () => {
      const userWBTC = await ethers.getImpersonatedSigner('0x8FC88dDE93184fe5F5878F860B0bFD89115Eb96c');
      await SIGNER.sendTransaction({ to: userWBTC, value: wei(1) });
      const userWETH = await ethers.getImpersonatedSigner('0x62af7c48cf412162465a8cafde44dfb17ba96038');
      await SIGNER.sendTransaction({ to: userWETH, value: wei(1) });
      const userUSDC = await ethers.getImpersonatedSigner('0x62af7c48cf412162465a8cafde44dfb17ba96038');
      await SIGNER.sendTransaction({ to: userUSDC, value: wei(1) });
      const userUSDT = await ethers.getImpersonatedSigner('0x4033cF3FC79c1356f62F16899810BDb5a756EDB0');
      await SIGNER.sendTransaction({ to: userUSDC, value: wei(1) });
      const userStETH = await ethers.getImpersonatedSigner('0xd49591f0e9e8FC90856EA791B5f5CDf5eDc78883');
      await SIGNER.sendTransaction({ to: userStETH, value: wei(1) });

      const depositPoolStETH = await getDepositPool(depositPoolProxyAddressStETH);
      const depositPoolWBTC = await getDepositPool(depositPoolProxyAddressWBTC);
      const depositPoolWETH = await getDepositPool(depositPoolProxyAddressWETH);
      const depositPoolUSDC = await getDepositPool(depositPoolProxyAddressUSDC);
      const depositPoolUSDT = await getDepositPool(depositPoolProxyAddressUSDT);

      // wBTC
      await depositPoolWBTC.connect(userWBTC).stake(0, '10000', 0, userWBTC);
      await expect(depositPoolWBTC.connect(userWBTC).withdraw(0, '19999')).to.be.revertedWith(
        'DS: pool withdraw is locked',
      );

      // wETH
      await wETH.connect(userWETH).approve(distributorProxyAddress, wei(1000));
      await depositPoolWETH.connect(userWETH).stake(0, wei(0.1), 0, userWETH);
      await expect(depositPoolWETH.connect(userWETH).withdraw(0, wei(999))).to.be.revertedWith(
        'DS: pool withdraw is locked',
      );

      // USDC
      await USDC.connect(userWETH).approve(distributorProxyAddress, wei(1000, 6));
      await depositPoolUSDC.connect(userWETH).stake(0, wei(0.1, 6), 0, userWETH);
      await expect(depositPoolUSDC.connect(userWETH).withdraw(0, wei(999))).to.be.revertedWith(
        'DS: pool withdraw is locked',
      );

      // USDT
      await USDT.connect(userUSDT).approve(distributorProxyAddress, wei(1000, 6));
      await depositPoolUSDT.connect(userUSDT).stake(0, wei(10, 6), 0, userUSDT);
      await expect(depositPoolUSDT.connect(userUSDT).withdraw(0, wei(999))).to.be.revertedWith(
        'DS: pool withdraw is locked',
      );

      // stETH
      await stETH.connect(userStETH).approve(distributorProxyAddress, wei(1000, 6));
      await depositPoolStETH.connect(userStETH).withdraw(0, wei(0.0001, 6));
      await depositPoolStETH.connect(userStETH).stake(0, wei(0.0001, 6), 0, userStETH);
    });
  });

  const createFork = async () => {
    await ethers.provider.send('hardhat_reset', [
      {
        forking: {
          jsonRpcUrl: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
          blockNumber: 23431100,
        },
      },
    ]);
  };

  const upgradeToV2 = async (): Promise<DistributorV2> => {
    const distributorV2Impl = await (await ethers.getContractFactory('DistributorV2')).deploy();
    await distributor.connect(MS).upgradeTo(distributorV2Impl);
    return distributorV2Impl.attach(distributor) as DistributorV2;
  };

  const getDepositPool = async (address: string): Promise<DepositPool> => {
    const factory = await ethers.getContractFactory('DepositPool', {
      libraries: {
        ReferrerLib: '0x9a397c638bd9611539e7992b32e206102e6d2965',
        LockMultiplierMath: '0x345b8b23c38f70f1d77560c60493bb583f012cb0',
      },
    });

    return factory.attach(address) as DepositPool;
  };
});

// npm run generate-types && npx hardhat test "test/fork/capital-protocol/DistributorV2.fork.test.ts"
