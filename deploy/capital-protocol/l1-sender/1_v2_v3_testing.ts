/* eslint-disable @typescript-eslint/no-explicit-any */
import { Deployer } from '@solarity/hardhat-migrate';

import {
  ERC1967Proxy__factory,
  L1SenderV2,
  L1SenderV2__factory,
  L1SenderV3,
  L1SenderV3__factory,
  L2MessageReceiver,
  L2MessageReceiver__factory,
  MOR,
  MOR__factory,
} from '@/generated-types/ethers';
import { ZERO_ADDR } from '@/scripts/utils/constants';

const distributorAddress = '0xDf1AC1AC255d91F5f4B1E3B4Aef57c5350F64C7A'; // Ethereum
const l1SenderAddress = '0x6Fd2674E13a42E588f83Ae74e5F22a4EE24eD75A'; // Ethereum
const morAddress = '0x98e3CFBdB9707dF6107Cb1A7BD03036052EAa20e'; // Base
const l2MessageReceiverAddress = '0xB69DbF7C9aB4597D3b3BC284Cc8771D580299baD'; // Base
const stEThAddress = '0xae7ab96520de3a18e5e111b5eaab095312d7fe84'; // Ethereum
const wstETHAddress = '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0'; // Ethereum

const layerZeroEthereumToArbitrumConfig = {
  gateway: '0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675',
  receiver: '0xd4a8ECcBe696295e68572A98b1aA70Aa9277d427',
  receiverChainId: 110,
  zroPaymentAddress: ZERO_ADDR,
  adapterParams: '0x',
};

const layerZeroEthereumToBaseConfig = {
  gateway: '0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675',
  receiver: l2MessageReceiverAddress,
  receiverChainId: 184,
  zroPaymentAddress: ZERO_ADDR,
  adapterParams: '0x',
};

const layerZeroBaseToEthereumConfig = {
  gateway: '0xb6319cC6c8c27A8F5dAF0dD3DF91EA35C4720dd7',
  sender: l1SenderAddress,
  senderChainId: 101,
};

const tokenArbitrumConfig = {
  wstETH: wstETHAddress,
  gateway: '0x72Ce9c846789fdB6fC1f34aC4AD25Dd9ef7031ef',
  receiver: '0x47176B2Af9885dC6C4575d4eFd63895f7Aaa4790',
};

const tokenBaseConfig = {
  wstETH: wstETHAddress,
  gateway: '0x9de443AdC5A411E83F1878Ef24C3F52C61571e72', // https://docs.lido.fi/deployed-contracts/#base
  receiver: '0x040ef6fb6592a70291954e2a6a1a8f320ff10626', // Personal wallet
};

module.exports = async function (deployer: Deployer) {
  await _ethereumSetup(deployer);
  await _baseSetup(deployer);
};

const _ethereumSetup = async (deployer: Deployer) => {
  const l1SenderV2 = await _deployL1SenderV2(deployer);
  // const l1SenderV2 = await deployer.deployed(L1SenderV3__factory, l1SenderAddress);
  await l1SenderV2.setDistributor(distributorAddress);
  await l1SenderV2.setStETh(stEThAddress);
  await l1SenderV2.setLayerZeroConfig(layerZeroEthereumToArbitrumConfig);
  await l1SenderV2.setArbitrumBridgeConfig(tokenArbitrumConfig);

  const l1SenderV3 = await _upgradeL1SenderV2toV3(deployer, l1SenderV2);
  await l1SenderV3.setMessageBridgeConfig(layerZeroEthereumToBaseConfig);
  await l1SenderV3.setTokenBridgeConfig(tokenBaseConfig);
};

const _baseSetup = async (deployer: Deployer) => {
  const mor = await _deployMOR(deployer);
  const l2MessageReceiver = await _deployL2MessageReceiver(deployer);

  // const mor = await deployer.deployed(MOR__factory, morAddress);
  // const l2MessageReceiver = await deployer.deployed(L2MessageReceiver__factory, l2MessageReceiverAddress);

  await l2MessageReceiver.setParams(mor, layerZeroBaseToEthereumConfig);
};

const _deployL2MessageReceiver = async (deployer: Deployer): Promise<L2MessageReceiver> => {
  const impl = await deployer.deploy(L2MessageReceiver__factory);
  const proxy = await deployer.deploy(
    ERC1967Proxy__factory,
    [
      await impl.getAddress(),
      L2MessageReceiver__factory.createInterface().encodeFunctionData('L2MessageReceiver__init'),
    ],
    {
      name: `L2MessageReceiver Proxy`,
    },
  );

  return await deployer.deployed(L2MessageReceiver__factory, await proxy.getAddress());
};

const _deployMOR = async (deployer: Deployer): Promise<MOR> => {
  return await deployer.deploy(MOR__factory, ['42000000000000000000000000']);
};

const _deployL1SenderV2 = async (deployer: Deployer): Promise<L1SenderV2> => {
  const impl = await deployer.deploy(L1SenderV2__factory);
  const proxy = await deployer.deploy(
    ERC1967Proxy__factory,
    [await impl.getAddress(), L1SenderV2__factory.createInterface().encodeFunctionData('L1SenderV2__init')],
    {
      name: `L1SenderV2 Proxy`,
    },
  );

  return await deployer.deployed(L1SenderV2__factory, await proxy.getAddress());
};

const _upgradeL1SenderV2toV3 = async (deployer: Deployer, l1SenderV2: L1SenderV2): Promise<L1SenderV3> => {
  const impl = await deployer.deploy(L1SenderV3__factory);
  await l1SenderV2.upgradeTo(await impl.getAddress());

  return await deployer.deployed(L1SenderV3__factory, await l1SenderV2.getAddress());
};

// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol/l1-sender --only 1
// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol/l1-sender --only 1 --network base --verify
// npx hardhat migrate --path-to-migrations ./deploy/capital-protocol/l1-sender --only 1 --network mainnet --verify
