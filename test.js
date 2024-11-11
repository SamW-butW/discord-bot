const { createEOAWallet, createAAWalletWithEOA, aaSendUserOp } = require('./particleservice');  // 引入 particleservice.js 中的函数

async function testParticleservice() {
  // 1. 测试创建 EOA 钱包
  const eoaWallet = createEOAWallet();
  console.log("EOA Wallet Address:", eoaWallet.address);
  console.log("EOA Wallet Private Key:", eoaWallet.privateKey);

  // 2. 使用 EOA 钱包创建 AA 钱包
  const { eoaWallet: createdEOAWallet, aaWallet, wrapProvider } = await createAAWalletWithEOA(eoaWallet);
  console.log("AA Wallet Address:", aaWallet.getAddress());  // 获取 AA 钱包地址
  console.log("AA Wallet Owner Address:", aaWallet.ownerAddress);

  // 3. 测试发送简单转账交易
  const to = '0x0000000000000000000000000000000000000000';  // 转账目标地址（这里是一个空地址，仅作测试）
  const value = 0.01;  // 转账金额（以 ether 为单位）
  const data = '0x';  // 交易数据

  try {
    // 发送交易并获取交易 hash
    const txHash = await aaSendUserOp(aaWallet, wrapProvider, to, value, data);
    console.log("Transaction Hash:", txHash);
  } catch (error) {
    console.error("Error sending simple transfer:", error);
  }
}

// 执行测试
testParticleservice();
