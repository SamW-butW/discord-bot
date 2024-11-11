(async () => {
    try {
      // 使用动态 import() 导入 .mjs 文件
      const ParticleAA = await import('@particle-network/aa/dist/esm/index.mjs');
      console.log(ParticleAA);  // 打印导入的内容
  
    } catch (error) {
      console.error('Error importing ParticleAA:', error);
    }
})();
  