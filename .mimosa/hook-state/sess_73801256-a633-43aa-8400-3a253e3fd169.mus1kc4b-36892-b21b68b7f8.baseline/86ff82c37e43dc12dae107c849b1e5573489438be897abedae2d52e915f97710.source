/**
 * 代理服务器核心
 * 拦截 HTTP/HTTPS 请求并记录 API 使用情况
 */

const http = require('http');
const https = require('https');
const url = require('url');
const net = require('net');
const ProxyDatabase = require('./database');
const ResponseParser = require('./parser');

class ProxyServer {
  constructor(options = {}) {
    this.port = options.port || null; // null 表示自动检测
    this.host = options.host || 'localhost';
    this.db = new ProxyDatabase();
    this.parser = new ResponseParser();
    this.server = null;
    this.requestCount = 0;
  }

  /**
   * 检查端口是否可用
   */
  async isPortAvailable(port) {
    return new Promise((resolve) => {
      const server = net.createServer();

      server.once('error', (err) => {
        resolve(false); // 端口不可用
      });

      server.once('listening', () => {
        server.close(() => {
          resolve(true); // 端口可用
        });
      });

      // 使用 0.0.0.0 检测，确保真正检测到端口占用
      server.listen(port, '0.0.0.0');
    });
  }

  /**
   * 查找可用端口
   */
  async findAvailablePort(startPort = 8080) {
    const maxAttempts = 20; // 最多尝试 20 个端口

    for (let i = 0; i < maxAttempts; i++) {
      const port = startPort + i;
      const available = await this.isPortAvailable(port);

      if (available) {
        return port;
      }
    }

    throw new Error(`无法找到可用端口 (尝试范围: ${startPort}-${startPort + maxAttempts - 1})`);
  }

  /**
   * 启动代理服务器
   */
  async start() {
    // 如果没有指定端口，自动查找可用端口
    if (!this.port) {
      console.log('🔍 正在查找可用端口...');
      this.port = await this.findAvailablePort(8080);
      console.log(`✅ 找到可用端口: ${this.port}`);
    } else {
      // 检查指定端口是否可用
      const available = await this.isPortAvailable(this.port);
      if (!available) {
        console.log(`⚠️  端口 ${this.port} 已被占用，正在查找其他可用端口...`);
        this.port = await this.findAvailablePort(this.port + 1);
        console.log(`✅ 找到可用端口: ${this.port}`);
      }
    }

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    this.server.listen(this.port, this.host, () => {
      console.log('');
      console.log('🚀 apistat 代理服务器已启动');
      console.log(`📡 监听地址: http://${this.host}:${this.port}`);
      console.log('');
      console.log('📝 配置你的应用使用代理:');
      console.log('');
      console.log('   # Bash/Linux:');
      console.log(`   export HTTP_PROXY=http://${this.host}:${this.port}`);
      console.log(`   export HTTPS_PROXY=http://${this.host}:${this.port}`);
      console.log('');
      console.log('   # PowerShell:');
      console.log(`   $env:HTTP_PROXY = "http://${this.host}:${this.port}"`);
      console.log(`   $env:HTTPS_PROXY = "http://${this.host}:${this.port}"`);
      console.log('');
      console.log('💡 或在代码中配置:');
      console.log(`   process.env.HTTP_PROXY = "http://localhost:${this.port}"`);
      console.log('');
      console.log('⌨️  按 Ctrl+C 停止代理');
      console.log('────────────────────────────────────────');
      console.log('');
    });

    this.server.on('error', (err) => {
      console.error('❌ 服务器错误:', err.message);
      process.exit(1);
    });

    // 处理进程退出
    process.on('SIGINT', () => {
      this.stop();
    });

    process.on('SIGTERM', () => {
      this.stop();
    });
  }

  /**
   * 停止代理服务器
   */
  stop() {
    console.log('');
    console.log('🛑 正在停止代理服务器...');
    console.log(`📊 本次运行记录了 ${this.requestCount} 个请求`);

    if (this.server) {
      this.server.close(() => {
        this.db.close();
        console.log('✅ 代理服务器已停止');
        process.exit(0);
      });
    }
  }

  /**
   * 处理 HTTP 请求
   */
  handleRequest(clientReq, clientRes) {
    const startTime = Date.now();

    // 解析目标 URL
    const targetUrl = url.parse(clientReq.url);
    const target = this.determineTarget(targetUrl);

    if (!target) {
      clientRes.writeHead(400);
      clientRes.end('Invalid target');
      return;
    }

    // 收集请求体
    let requestBody = '';
    clientReq.on('data', (chunk) => {
      requestBody += chunk.toString('utf8');
    });

    clientReq.on('end', () => {
      // 创建到目标服务器的请求
      const options = {
        hostname: target.hostname,
        port: target.port || 443,
        path: targetUrl.path || '/',
        method: clientReq.method,
        headers: { ...clientReq.headers }
      };

      // 移除代理相关的 headers
      delete options.headers['proxy-connection'];

      const protocol = target.protocol === 'https:' ? https : http;

      const proxyReq = protocol.request(options, (proxyRes) => {
        // 转发响应头
        clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);

        // 收集响应体
        let responseBody = '';

        proxyRes.on('data', (chunk) => {
          responseBody += chunk.toString('utf8');
          clientRes.write(chunk);
        });

        proxyRes.on('end', () => {
          clientRes.end();

          const duration = Date.now() - startTime;

          // 解析并记录
          const record = this.parser.parse({
            requestBody,
            responseBody,
            statusCode: proxyRes.statusCode,
            duration,
            endpoint: `${target.hostname}${targetUrl.path}`
          });

          if (record) {
            this.db.saveRecord(record);
            this.requestCount++;
            console.log(`✅ [${this.requestCount}] ${record.model} - ${record.inputTokens}/${record.outputTokens} tokens - $${record.totalCost.toFixed(6)}`);
          }
        });
      });

      // 转发请求体
      if (requestBody) {
        proxyReq.write(requestBody);
      }

      proxyReq.end();

      proxyReq.on('error', (err) => {
        console.error('❌ 代理请求失败:', err.message);
        clientRes.writeHead(500);
        clientRes.end('Proxy Error');
      });
    });

    clientReq.on('error', (err) => {
      console.error('❌ 客户端请求错误:', err.message);
    });
  }

  /**
   * 确定目标服务器
   */
  determineTarget(targetUrl) {
    const hostname = targetUrl.hostname || targetUrl.host;

    if (!hostname) {
      return null;
    }

    // 已知的 API 服务器
    const targets = {
      'api.openai.com': { protocol: 'https:', hostname: 'api.openai.com', port: 443 },
      'api.anthropic.com': { protocol: 'https:', hostname: 'api.anthropic.com', port: 443 },
      'api.deepseek.com': { protocol: 'https:', hostname: 'api.deepseek.com', port: 443 },
      'generativelanguage.googleapis.com': { protocol: 'https:', hostname: 'generativelanguage.googleapis.com', port: 443 }
    };

    // 查找匹配的目标
    for (const [key, value] of Object.entries(targets)) {
      if (hostname.includes(key)) {
        return value;
      }
    }

    // 如果是完整 URL，尝试解析
    if (targetUrl.protocol) {
      return {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80)
      };
    }

    return null;
  }
}

module.exports = ProxyServer;
