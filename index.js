require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const {
  createEOAWallet,
  createAAWalletWithEOA,
  getAAWalletAddress,
  aaSendUserOp,
} = require('./particleservice');
const { ethers } = require('ethers');
const fs = require('fs');
const crypto = require('crypto');

// 初始化 Discord 客户端
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

// 加密和解密私钥函数
function encryptPrivateKey(privateKey, password) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', crypto.createHash('sha256').update(password).digest(), iv);
  let encrypted = iv.toString('hex') + ':' + cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function decryptPrivateKey(encryptedPrivateKey, password) {
  const [ivHex, encrypted] = encryptedPrivateKey.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', crypto.createHash('sha256').update(password).digest(), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// 保存和加载钱包数据到文件
function saveWalletData(userId, encryptedPrivateKey, aaWallet) {
  const data = { userId, eoa: { privateKey: encryptedPrivateKey }, aa: aaWallet };
  fs.writeFileSync(`${userId}_wallet.json`, JSON.stringify(data));
}

function loadWalletData(userId) {
  if (fs.existsSync(`${userId}_wallet.json`)) {
    const data = JSON.parse(fs.readFileSync(`${userId}_wallet.json`));
    return data;
  }
  return {};
}

// Discord bot commands
client.on('messageCreate', async (message) => {
  // 创建钱包命令
  if (message.content.startsWith('!createWallet')) {
    try {
      console.log('创建钱包命令接收');
      const eoaWallet = createEOAWallet();
      console.log('EOA Wallet Created:', eoaWallet.address);

      const { aaWallet } = await createAAWalletWithEOA(eoaWallet);
      console.log('AA Wallet Created:', aaWallet);

      const dmChannel = await message.author.createDM();
      await dmChannel.send('请提供一个密码来保护您的私钥:');

      const passwordCollection = await dmChannel.awaitMessages({
        filter: response => response.author.id === message.author.id,
        max: 1,
        time: 60000,
      });

      if (!passwordCollection.size) {
        await dmChannel.send('超时未收到密码输入，请重新输入 !createWallet 命令。');
        return;
      }

      const password = passwordCollection.first().content;
      const encryptedPrivateKey = encryptPrivateKey(eoaWallet.privateKey, password);
      console.log('Encrypted Private Key:', encryptedPrivateKey);

      saveWalletData(message.author.id, encryptedPrivateKey, aaWallet);
      await dmChannel.send(`EOA Wallet Address: ${eoaWallet.address}`);
      message.reply("成功创建智能账户。");
    } catch (error) {
      console.error('创建钱包时出错:', error);
      message.reply('创建钱包时出错，请稍后再试。');
    }
  }

  // checkIn 命令
  if (message.content.startsWith('!checkIn')) {
    const args = message.content.split(' ');
    const channel = args[1];

    if (!channel) {
      return message.reply('请提供 channel 参数！用法: !checkIn <channel>');
    }

    try {
      const { eoa, aa } = loadWalletData(message.author.id);
      if (!eoa || !aa) {
        return message.reply('请先使用 !createWallet 创建一个钱包。');
      }

      const dmChannel = await message.author.createDM();
      await dmChannel.send('请提供您的密码以进行 checkIn:');

      const passwordCollection = await dmChannel.awaitMessages({
        filter: response => response.author.id === message.author.id,
        max: 1,
        time: 60000,
      });

      if (!passwordCollection.size) {
        await dmChannel.send('超时未收到密码输入，请重新输入 !checkIn 命令。');
        return;
      }

      const password = passwordCollection.first().content;
      const decryptedPrivateKey = decryptPrivateKey(eoa.privateKey, password);
      const wallet = new ethers.Wallet(decryptedPrivateKey, new ethers.providers.JsonRpcProvider(process.env.RPC_URL));

      // 定义合约地址和 ABI
      const contractAddress = '0x19c10FFf96B80208f454034C046CCc4445Cd20ba';
      const contractABI = [
        {
          "inputs": [{ "internalType": "uint256", "name": "_channel", "type": "uint256" }],
          "name": "checkIn",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
      ];

      const contract = new ethers.Contract(contractAddress, contractABI, wallet);
      const data = contract.interface.encodeFunctionData("checkIn", [parseInt(channel)]);
      console.log('Encoded data for checkIn:', data);

      const txHash = await aaSendUserOp(aa, contractAddress, 0, data);
      console.log('Transaction hash:', txHash);

      message.reply(`交易成功，哈希: ${txHash}`);
    } catch (error) {
      console.error('发送交易时出错:', error);
      message.reply('发送交易时出错，请稍后再试。');
    }
  }
});

client.once('ready', () => {
  console.log('Discord Bot is online!');
});

client.login(process.env.DISCORD_BOT_TOKEN);
