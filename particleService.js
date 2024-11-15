import dotenv from 'dotenv';
dotenv.config();
import { SmartAccount, AAWrapProvider, SendTransactionMode } from '@particle-network/aa/dist/esm/index.mjs';
import { ethers } from 'ethers';
import { WebSocketProvider } from 'web3-providers-ws';
import Axios from 'axios';
import { getBytes } from 'ethers';

// 初始化 ABI 编码器和区块链 ID
const abiCoder = new ethers.AbiCoder();
const chainId = 112358;

// RPC 和 WebSocket 的配置
const RPC = 'https://rpc.particle.network/evm-chain?chainId=112358&projectUuid=21ef95ca-5046-4a56-b949-a51762622428&projectKey=cK8WOjWQvGmvGs1CcXMpo334eBtAdhRkYTvOkuhV';
const WSS = 'wss://rpc.particle.network/evm-chain?chainId=112358&projectUuid=21ef95ca-5046-4a56-b949-a51762622428&projectKey=cK8WOjWQvGmvGs1CcXMpo334eBtAdhRkYTvOkuhV';
const wsProvider = new WebSocketProvider(WSS);

// 合约地址和 ABI
const contractAddress = '0x19c10FFf96B80208f454034C046CCc4445Cd20ba';
const contractABI = [{
    "inputs": [{ "internalType": "uint256", "name": "_channel", "type": "uint256" }],
    "name": "checkIn",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
}];
const contractInterface = new ethers.Interface(contractABI);

// 自定义 EIP1193 Provider Wrapper 类
class EIP1193ProviderWrapper {
    constructor(provider, chainId, accounts) {
        this.provider = provider;
        this.chainId = chainId;
        this.accounts = accounts;
    }

    async request({ method, params }) {
        if (method === 'eth_chainId') {
            return `0x${this.chainId.toString(16)}`;
        } else if (method === 'eth_accounts') {
            return this.accounts;
        } else {
            return this.provider.send(method, params);
        }
    }

    on(event, listener) {
        if (this.provider.on) {
            this.provider.on(event, listener);
        }
    }

    removeListener(event, listener) {
        if (this.provider.removeListener) {
            this.provider.removeListener(event, listener);
        }
    }
}

async function aaGetFeeQuotes(smartAccount, transactions) {
    try {
        console.log("smartAccount:", smartAccount);
        console.log("transactions:", transactions);
        const ownerAddress = await smartAccount.getOwner()
        const simpleSmartAccount = {
            name: "XTERIO",
            version: "1.0.0",
            ownerAddress: ownerAddress, // 获取Owner地址
            projectId: '21ef95ca-5046-4a56-b949-a51762622428',
            clientKey: 'cK8WOjWQvGmvGs1CcXMpo334eBtAdhRkYTvOkuhV',
            appId: 'fdc76dee-ba06-4369-8a78-28a06f0a995e'
        };

        console.log("simpleSmartAccount:", simpleSmartAccount);  // 确认内容正确

        const res = await Axios.post(RPC, {
            jsonrpc: "2.0",
            id: Date.now(),
            method: "particle_aa_getFeeQuotes",
            params: [simpleSmartAccount, transactions, true],
        });

        console.log("Complete Fee Quotes Response:", JSON.stringify(res.data, null, 2));

        if (res.data && res.data.result) {
            return res.data.result;
        } else {
            console.error("Failed to get fee quotes, response data:", JSON.stringify(res.data));
            throw new Error("Failed to get fee quotes: " + JSON.stringify(res.data));
        }
    } catch (error) {
        console.error("Error in aaGetFeeQuotes:", error);
        throw error;
    }
}


// 发送用户操作的函数
async function aaSendUserOp(smartAccount, userOp) {
    try {
        const ownerAddress = await smartAccount.getOwner()
        const simpleSmartAccount = {
            name: "XTERIO",
            version: "1.0.0",
            ownerAddress: ownerAddress,
            projectId: '21ef95ca-5046-4a56-b949-a51762622428',
            clientKey: 'cK8WOjWQvGmvGs1CcXMpo334eBtAdhRkYTvOkuhV',
            appId: 'fdc76dee-ba06-4369-8a78-28a06f0a995e'
        };

        const res = await Axios.post(RPC, {
            jsonrpc: "2.0",
            id: Date.now(),
            method: "particle_aa_sendUserOp",
            params: [simpleSmartAccount, userOp],
        });

        console.log("Send User Operation Response:", JSON.stringify(res.data));
        return res.data.result || new Error("Failed to send user operation: " + JSON.stringify(res.data));
    } catch (error) {
        console.error("Error in aaSendUserOp:", error);
        throw error;
    }
}

// 请求 Paymaster 代付的函数
async function sponsorUserOp(userOp, chainId) {
  const paymasterUrl = 'https://paymaster.particle.network';
  const projectUuid = 'fab00091-f966-437f-8ae9-12aa495f2828';
  const projectKey = 'cif8thrddJ9Iz46tecZ9UiEQmjxRaKy42AuutAZj';
  const entryPoint = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';

  try {
    const response = await Axios.post(
      paymasterUrl,
      {
        method: 'pm_sponsorUserOperation',
        params: [userOp, entryPoint]
      },
      {
        params: {
          chainId,
          projectUuid,
          projectKey
        }
      }
    );

    console.log("Sponsor Response:", JSON.stringify(response.data));
    return response.data.result || new Error("Failed to sponsor user operation: " + JSON.stringify(response.data));
  } catch (error) {
    console.error("Error in sponsorUserOp:", error);
    throw error;
  }
}

// 生成 UserOp 哈希
function getUserOpHash(useOpMinusSignature, chainId) {
  const packedData = abiCoder.encode(
    [
      "address", "uint256", "bytes32", "bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "bytes32"
    ],
    [
      useOpMinusSignature.sender,
      useOpMinusSignature.nonce,
      ethers.keccak256(useOpMinusSignature.initCode),
      ethers.keccak256(useOpMinusSignature.callData),
      useOpMinusSignature.callGasLimit,
      useOpMinusSignature.verificationGasLimit,
      useOpMinusSignature.preVerificationGas,
      useOpMinusSignature.maxFeePerGas,
      useOpMinusSignature.maxPriorityFeePerGas,
      ethers.keccak256(useOpMinusSignature.paymasterAndData)
    ]
  );

  const enc = abiCoder.encode(
    ["bytes32", "address", "uint256"],
    [
      ethers.keccak256(packedData),
      "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789",
      chainId
    ]
  );

  const userOpHash = ethers.keccak256(enc);
  return userOpHash;
}

// 创建 EOA 和 AA 钱包的函数
// 创建 EOA 和 AA 钱包的函数
async function createWallet() {
    const eoaWallet = ethers.Wallet.createRandom();
    await eoaWallet.getAddress(); // 确保地址被正确解析
    const eip1193Provider = new EIP1193ProviderWrapper(wsProvider, chainId, [eoaWallet.address]);
    const smartAccount = new SmartAccount(eip1193Provider, {
        projectId: '21ef95ca-5046-4a56-b949-a51762622428',
        clientKey: 'cK8WOjWQvGmvGs1CcXMpo334eBtAdhRkYTvOkuhV',
        appId: 'fdc76dee-ba06-4369-8a78-28a06f0a995e',
        chainId,
        aaOptions: { accountContracts: { XTERIO: [{ version: '1.0.0', chainIds: [chainId] }] } },
    });
    smartAccount.setSmartAccountContract({ name: 'XTERIO', version: '1.0.0' });

    return { eoaWallet, smartAccount };
}

// 和 CheckIn 合约交互的函数
async function checkIn(smartAccount, eoaWallet) {
    console.log("Running checkIn...");
    console.log("smartAccount:", smartAccount);
    console.log("eoaWallet:", eoaWallet);

    const checkInData = contractInterface.encodeFunctionData("checkIn", [2]);
    const smartAccountAddress = await smartAccount.getAddress();
    console.log("checkInData:", checkInData);
    console.log("smartAccountAddress:", smartAccountAddress);

    const tx = { from: smartAccountAddress, to: contractAddress, data: checkInData, value: '0', chainId };
    console.log("Transaction payload:", tx);

    const feeQuotesResult = await aaGetFeeQuotes(smartAccount, [tx]);
    console.log("Fee Quotes Result:", feeQuotesResult);

    let gaslessUserOp = feeQuotesResult?.verifyingPaymasterGasless?.userOp || feeQuotesResult?.verifyingPaymasterNative?.userOp;
    console.log("Selected gaslessUserOp:", gaslessUserOp);

    const sponsorData = await sponsorUserOp(gaslessUserOp, chainId);
    console.log("Sponsor Data:", sponsorData);

    const userOp = { ...gaslessUserOp, ...sponsorData };
    const newUserOpHash = getUserOpHash(userOp, chainId);
    console.log("New UserOp Hash:", newUserOpHash);

    // 使用传入的 eoaWallet 进行签名
    userOp.signature = await eoaWallet.signMessage(getBytes(newUserOpHash));
    console.log("UserOp Signature:", userOp.signature);

    return await aaSendUserOp(smartAccount, userOp);
}



// 导出模块中的功能
export { createWallet, checkIn, EIP1193ProviderWrapper };
