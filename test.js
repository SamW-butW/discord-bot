// 导入需要的库
import { expect } from 'chai';
import { createWallet, checkIn, EIP1193ProviderWrapper } from './particleService.js'; // 确保路径正确
import { SmartAccount, AAWrapProvider, SendTransactionMode } from '@particle-network/aa/dist/esm/index.mjs';
import { WebSocketProvider } from 'web3-providers-ws';
import { ethers } from 'ethers';


const WSS = 'wss://rpc.particle.network/evm-chain?chainId=112358&projectUuid=21ef95ca-5046-4a56-b949-a51762622428&projectKey=cK8WOjWQvGmvGs1CcXMpo334eBtAdhRkYTvOkuhV';
const wsProvider = new WebSocketProvider(WSS);
const chainId = 112358;
describe('Particle Service Tests', function() {
    this.timeout(50000); // 延长超时时间以适应网络请求

    let walletInfo, smartAccount;

    // 测试创建钱包
    it('should create a new EOA and SmartAccount', async function() {
        const result = await createWallet();
        expect(result).to.have.property('eoaWallet');
        expect(result).to.have.property('smartAccount');
        expect(result.eoaWallet).to.have.property('address');
        expect(result.smartAccount).to.respondTo('getAddress');

        // 保存钱包信息以用于后续测试
        walletInfo = result.eoaWallet; 
        smartAccount = result.smartAccount;

        // 打印结果，便于调试
        console.log("EOA Address:", walletInfo.address);
        console.log("EOA Private Key:", walletInfo.privateKey);
        const smartAccountAddress = await smartAccount.getAddress();
        const onwer = await smartAccount.getOwner();
        console.log("SmartAccount Address:", smartAccountAddress);
        console.log("SmartAccount Address:", onwer);
    });

    // 检查 walletInfo 是否为 ethers.HDNodeWallet 类型
    it('should confirm that walletInfo is an instance of ethers.HDNodeWallet', function() { 
        expect(walletInfo).to.be.instanceOf(ethers.HDNodeWallet, 'walletInfo is not an instance of ethers.HDNodeWallet');
    });

    

// 测试首次签到
    it('should perform check-in operation successfully the first time', async function() {
        console.log("Starting check-in test...");

        // 打印 walletInfo 类型和内容
        console.log("walletInfo type:", walletInfo.constructor.name);
        console.log("walletInfo:", walletInfo);

        // 检查 walletInfo 是否为 HDNodeWallet 实例
        if (!(walletInfo instanceof ethers.HDNodeWallet)) {
            console.error("walletInfo is not an instance of HDNodeWallet. Current type:", walletInfo.constructor.name);
            throw new Error("walletInfo should be an instance of HDNodeWallet.");
        }

        // 打印 walletInfo 的地址和私钥（仅限调试，生产环境中不要打印私钥）
        console.log("walletInfo.address:", walletInfo.address);
        console.log("walletInfo.privateKey:", walletInfo.privateKey);

        // 创建 eip1193Provider 和 smartAccount，并打印相关信息
        const eip1193Provider = new EIP1193ProviderWrapper(wsProvider, chainId, [walletInfo.address]);
        const smartAccount = new SmartAccount(eip1193Provider, {
            projectId: '21ef95ca-5046-4a56-b949-a51762622428',
            clientKey: 'cK8WOjWQvGmvGs1CcXMpo334eBtAdhRkYTvOkuhV',
            appId: 'fdc76dee-ba06-4369-8a78-28a06f0a995e',
            chainId,
            aaOptions: { accountContracts: { XTERIO: [{ version: '1.0.0', chainIds: [chainId] }] } },
        });
        smartAccount.setSmartAccountContract({ name: 'XTERIO', version: '1.0.0' });

        // 打印 smartAccount 地址和拥有者
        const smartAccountAddress = await smartAccount.getAddress();
        const owner = await smartAccount.getOwner();
        console.log("smartAccount Address:", smartAccountAddress);
        console.log("smartAccount Owner:", owner);

        try {
            // 执行 checkIn 并记录中间状态
            console.log("Executing checkIn...");
            const result = await checkIn(smartAccount, walletInfo);
            expect(result).to.exist;
            console.log("First check-in transaction hash:", result);
        } catch (error) {
            // 捕获并打印 checkIn 函数中的错误
            console.error("Error during check-in:", error);
            throw error;
        }
    });
    
    

    // 测试再次签到
    it('should perform check-in operation successfully the first time', async function() {
        const eip1193Provider = new EIP1193ProviderWrapper(wsProvider, chainId, [walletInfo.address]);
        const smartAccount = new SmartAccount(eip1193Provider, {
            projectId: '21ef95ca-5046-4a56-b949-a51762622428',
            clientKey: 'cK8WOjWQvGmvGs1CcXMpo334eBtAdhRkYTvOkuhV',
            appId: 'fdc76dee-ba06-4369-8a78-28a06f0a995e',
            chainId,
            aaOptions: { accountContracts: { XTERIO: [{ version: '1.0.0', chainIds: [chainId] }] } },
        });
        smartAccount.setSmartAccountContract({ name: 'XTERIO', version: '1.0.0' });
        
        // 传入 eoaWallet
        const result = await checkIn(smartAccount, walletInfo);
        expect(result).to.exist;
        console.log("First check-in transaction hash:", result);
    });

});

