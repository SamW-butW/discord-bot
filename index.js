import dotenv from 'dotenv';
dotenv.config();
import { Client, GatewayIntentBits } from 'discord.js';
import { createWallet, checkIn, EIP1193ProviderWrapper } from './particleService.js';
import { ethers } from 'ethers';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import crypto from 'crypto';
import { WebSocketProvider } from 'web3-providers-ws';
import { SmartAccount } from '@particle-network/aa/dist/esm/index.mjs';
import pLimit from 'p-limit';

const WSS = 'wss://rpc.particle.network/evm-chain?chainId=112358&projectUuid=21ef95ca-5046-4a56-b949-a51762622428&projectKey=cK8WOjWQvGmvGs1CcXMpo334eBtAdhRkYTvOkuhV';
const wsProvider = new WebSocketProvider(WSS);
const chainId = 112358;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

const limit = pLimit(10);

function encryptPrivateKey(privateKey, password) {
  const key = crypto.scryptSync(password, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptPrivateKey(encryptedPrivateKey, password) {
  const [ivHex, encrypted] = encryptedPrivateKey.split(':');
  const key = crypto.scryptSync(password, 'salt', 32);
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function saveWalletData(userId, eoaAddress, encryptedPrivateKey, aaAddress, lastCheckIn = null) {
  const data = { userId, eoa: { address: eoaAddress, privateKey: encryptedPrivateKey }, aa: aaAddress, lastCheckIn };
  writeFileSync(`${userId}_wallet.json`, JSON.stringify(data));
}

function loadWalletData(userId) {
  if (existsSync(`${userId}_wallet.json`)) {
    return JSON.parse(readFileSync(`${userId}_wallet.json`));
  }
  return {};
}

function isSameDay(date1, date2) {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const [command, ...args] = message.content.trim().split(/\s+/);
  const userId = message.author.id;

  if (command === '!createwallet') {
    limit(async () => {
      try {
        const existingWalletData = loadWalletData(userId);
        if (existingWalletData.eoa && existingWalletData.aa) {
          await message.reply("您已经创建过钱包，请不要重复创建。");
          return;
        }

        const dmChannel = await message.author.createDM();
        await dmChannel.send("请设置一个密码来加密您的私钥");

        const filter = response => response.author.id === userId;
        const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });
        const password = collected.first().content;

        const result = await createWallet();
        const { eoaWallet, smartAccount } = result;
        const AAaddress = await smartAccount.getAddress();

        const encryptedPrivateKey = encryptPrivateKey(eoaWallet.privateKey, password);
        saveWalletData(userId, eoaWallet.address, encryptedPrivateKey, AAaddress);

        await dmChannel.send(`钱包已成功创建并保存！\nEOA地址：${eoaWallet.address}\nAA地址：${AAaddress}`);
        await message.reply("创建钱包成功！");
      } catch (error) {
        console.error("创建钱包时出错：", error);
        await message.reply("创建钱包失败，请确保私信功能开启后重试。");
      }
    });
  }

  else if (command === '!walletinfo') {
    try {
      const walletData = loadWalletData(userId);
      if (walletData.eoa && walletData.aa) {
        const dmChannel = await message.author.createDM();
        await dmChannel.send(`您的钱包地址信息如下：\nEOA地址：${walletData.eoa.address}\nAA地址：${walletData.aa}`);
        await message.reply("查看钱包地址成功！");
      } else {
        await message.reply("您还没有创建钱包。请使用 !createwallet 命令来创建钱包。");
      }
    } catch (error) {
      console.error("查看钱包地址时出错：", error);
      await message.reply("查看钱包地址失败，请确保您的私信功能开启后再试。");
    }
  }

  else if (command === '!eoakey') {
    const walletData = loadWalletData(userId);
    if (!walletData.eoa || !walletData.eoa.privateKey) {
      await message.reply("您还没有创建钱包。请使用 !createwallet 命令来创建钱包。");
      return;
    }

    try {
      const dmChannel = await message.author.createDM();
      await dmChannel.send("请输入您的钱包密码以获取您的 EOA 私钥。");

      const filter = response => response.author.id === userId;
      const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });
      const password = collected.first().content;

      const decryptedPrivateKey = decryptPrivateKey(walletData.eoa.privateKey, password);
      if (decryptedPrivateKey) {
        await dmChannel.send(`您的 EOA 私钥是：${decryptedPrivateKey}`);
        await message.reply("导出 EOA 私钥成功！");
      } else {
        await dmChannel.send("密码错误，无法解锁私钥。");
        await message.reply("导出 EOA 私钥失败！");
      }
    } catch (error) {
      console.error("解密私钥时出错：", error);
      await message.reply("解密私钥失败，请确保私信功能开启后再试。");
    }
  }

  else if (command === '!checkin') {
    limit(async () => {
      const walletData = loadWalletData(userId);

      // 检查用户是否已签到
      const lastCheckIn = walletData.lastCheckIn ? new Date(walletData.lastCheckIn) : null;
      const today = new Date();
      if (lastCheckIn && isSameDay(lastCheckIn, today)) {
        await message.reply("您今天已经签到过，请明天再试！");
        return;
      }

      try {
        const dmChannel = await message.author.createDM();
        await dmChannel.send("请输入您的密码以进行签到:");

        const filter = response => response.author.id === message.author.id;
        const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 30000 });

        if (collected.size === 0) {
          await dmChannel.send("超时未收到密码。请重新尝试。");
          await message.reply("签到失败！");
          return;
        }

        const password = collected.first().content;

        if (!walletData.eoa || !walletData.eoa.privateKey) {
          await dmChannel.send("未找到钱包信息，请先使用 !createwallet 创建钱包。");
          await message.reply("签到失败！");
          return;
        }

        const decryptedPrivateKey = decryptPrivateKey(walletData.eoa.privateKey, password);
        if (!decryptedPrivateKey) {
          await dmChannel.send("密码错误，无法解锁私钥。");
          await message.reply("签到失败！");
          return;
        }

        const eoaWallet = new ethers.Wallet(decryptedPrivateKey);
        const eip1193Provider = new EIP1193ProviderWrapper(wsProvider, chainId, [eoaWallet.address]);

        const smartAccount = new SmartAccount(eip1193Provider, {
          projectId: '21ef95ca-5046-4a56-b949-a51762622428',
          clientKey: 'cK8WOjWQvGmvGs1CcXMpo334eBtAdhRkYTvOkuhV',
          appId: 'fdc76dee-ba06-4369-8a78-28a06f0a995e',
          chainId,
          aaOptions: { accountContracts: { XTERIO: [{ version: '1.0.0', chainIds: [chainId] }] } },
        });
        smartAccount.setSmartAccountContract({ name: 'XTERIO', version: '1.0.0' });

        const result = await checkIn(smartAccount, eoaWallet);

        saveWalletData(userId, walletData.eoa.address, walletData.eoa.privateKey, walletData.aa, new Date().toISOString());
        await dmChannel.send(`签到成功！交易哈希: https://bnb.xterscan.io/tx/${result}`);
        await message.reply("签到成功！");
      } catch (error) {
        console.error("执行签到时出错：", error);
        await message.reply("签到失败，请稍后再试。");
      }
    });
  }
});

client.once('ready', () => {
  console.log('Discord Bot is online!');
});

client.login(process.env.DISCORD_BOT_TOKEN);
