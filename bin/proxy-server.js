#!/usr/bin/env node

/**
 * apistat 代理服务器启动脚本
 */

const ProxyServer = require('../src/proxy/server');

// 解析命令行参数
const args = process.argv.slice(2);
let port = 8080;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' || args[i] === '-p') {
    port = parseInt(args[i + 1]) || 8080;
  }
}

// 创建并启动代理服务器
const proxy = new ProxyServer({ port });
proxy.start();
