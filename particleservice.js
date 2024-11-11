// 模拟 localStorage
if (typeof global.localStorage === "undefined" || global.localStorage === null) {
  const { LocalStorage } = require('node-localstorage');
  global.localStorage = new LocalStorage('./scratch'); // 设定存储位置
}

require('dotenv').config();  // 加载环境变量

const { ParticleNetwork } = require('@particle-network/auth');
const { ParticleProvider } = require('@particle-network/provider');
const { ethers } = require('ethers');
const Web3 = require('web3'); // 使用 Web3
const { LocalStorage } = require('node-localstorage'); // 模拟 localStorage

// 初始化 localStorage
const localStorage = new LocalStorage('./scratch');

// 初始化 ParticleNetwork 配置
const particleNetwork = new ParticleNetwork({
  projectId: process.env.PARTICLE_PROJECT_ID,
  clientKey: process.env.PARTICLE_CLIENT_KEY,
  appId: process.env.PARTICLE_APP_ID,
  chainName: 'Xterio',
  chainId: 1637450,
  wallet: { displayWalletEntry: false },
});

// 使用 ParticleNetwork 创建 ParticleProvider
const provider = new ParticleProvider(particleNetwork.auth, {
  rpcUrl: process.env.RPC_URL || "https://rpc.particle.network/evm-chain?chainId=1637450&projectUuid=0f3dede3-acac-4129-af0a-0a5764c0a026&projectKey=cGiohUTW4w3nvpbO6ambZRcLWISk2GtkipNTR0a2",
  chainId: 1637450,
});

// 创建 EOA 钱包的函数
function createEOAWallet() {
  return ethers.Wallet.createRandom(); // 返回一个新的随机私钥钱包
}

// 使用 EOA 创建 AA 钱包的函数
async function createAAWalletWithEOA(eoaWallet) {
  console.log("Creating AA Wallet with provider:", provider);

  // 动态导入 ParticleAA 模块
  const ParticleAA = await import('@particle-network/aa/dist/esm/index.mjs');
  console.log(ParticleAA);

  const { SmartAccount, AAWrapProvider, SendTransactionMode } = ParticleAA;

  // SmartAccount 配置
  const config = {
    projectId: process.env.PARTICLE_PROJECT_ID,
    clientKey: process.env.PARTICLE_CLIENT_KEY,
    appId: process.env.PARTICLE_APP_ID,
    aaOptions: {
      accountContracts: {
        XTERIO: [
          {
            version: '1.0.0',
            chainIds: [1637450],
          },
        ],
      },
    },
  };

  const smartAccount = new SmartAccount(provider, config);
  smartAccount.ownerAddress = eoaWallet.address;

  console.log("SmartAccount instance created:", smartAccount);

  // 使用 AAWrapProvider 自动将普通交易转换为 UserOperation 并发送
  const wrapProvider = new AAWrapProvider(smartAccount, SendTransactionMode.UserPaidNative); // 设置交易费用模式

  return { eoaWallet, aaWallet: smartAccount, wrapProvider };
}

// 构建并发送用户操作
async function aaSendUserOp(smartAccount, wrapProvider, to, value, data = '0x') {
  try {
    console.log("Building user operation with:", { to, value, data });

    // 确保 value 格式化为不超过 18 位小数
    const formattedValue = value.toFixed ? value.toFixed(18) : value; // 保证有 18 位小数
    console.log("Formatted value:", formattedValue);

    // 使用 parseUnits 转换为 wei
    const weiValue = ethers.utils.parseUnits(formattedValue, 'ether');
    console.log("Wei value:", weiValue.toString());

    const tx = {
      to: to,
      value: weiValue,
      data: data,
    };

    // 使用 wrapProvider 处理交易并通过 Web3 发送
    const web3 = new Web3(wrapProvider); // 使用 Web3 来发送交易

    const txHash = await web3.eth.sendTransaction(tx);
    console.log("Transaction sent successfully. Hash:", txHash);
    return txHash;
  } catch (error) {
    console.error("Error executing user operation:", error);
    throw error;
  }
}

module.exports = {
  createEOAWallet,
  createAAWalletWithEOA,
  aaSendUserOp,
};
