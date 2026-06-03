# 文件目录浏览与同步服务

基于 Node.js 的轻量级文件服务器，支持目录浏览、文件上传/删除、外链同步。

## 快速开始

```bash
node server.js
```

服务启动在 `http://0.0.0.0:3300`，自动打开当前目录作为文件根目录。

## 功能

### 目录浏览
- 访问 `/` 显示当前目录的文件列表
- 显示文件大小、修改时间
- 目录和文件分栏显示，目录优先排序
- 返回上级目录链接

### 文件操作
- **下载**：直接点击文件链接，或点击 ⬇️ 按钮强制下载
- **上传**：拖拽文件到页面任意位置
- **删除**：点击 🗑️ 按钮删除文件/目录

### 外链同步
点击页面标题旁的 ⚙️ 按钮打开同步设置：

1. **添加绑定**：填写外部 URL 和本地路径
2. **手动同步**：点击单个「同步」按钮，或「同步全部」
3. **自动同步**：设置间隔分钟数（本地存储），到达间隔自动同步所有绑定
4. **编辑/删除**：在绑定列表中修改或移除绑定

同步后的文件在根目录列表中显示来源 URL。

### 兼容性
- 文件路径含 `&`、`#`、`?`、中文等特殊字符均可正确处理
- JavaScript 字符串插值使用 `JSON.stringify`，无注入风险

## 目录结构

```
├── server.js               # 入口文件，核心路由分发
├── plugin/
│   ├── router.js           # 路由注册/分发/插件加载
│   ├── directory.js        # 目录页 HTML 生成
│   ├── file-handler.js     # 文件/目录服务
│   ├── upload.js           # 文件上传（multipart）
│   ├── delete-handler.js   # 文件删除
│   ├── sync.js             # 外链同步引擎
│   ├── sync-config.js      # 同步配置 CRUD（sync-config.json）
│   ├── security.js         # 路径拦截、安全头
│   ├── mime.js             # MIME 类型映射
│   ├── utils.js            # HTML 转义、格式化
│   ├── logger.js           # 日志（15 天滚动保留）
│   └── auth.js             # 保留（已禁用）
├── sync-config.json         # 同步绑定数据（自动生成）
└── README.md
```

## 插件架构

所有业务模块以插件形式位于 `plugin/` 目录：

- 各插件调用 `router.register(method, pathname, handler)` 注册路由
- `server.js` 仅负责核心服务 + `router.dispatch()` 派发
- 修改 `plugin/*.js` 后服务自动重启；修改 `server.js` 需手动重启

### 新增插件

在 `plugin/` 下新建 `.js` 文件，通过 `router.register()` 注册路由即可：

```js
const router = require('./router');

router.register('GET', '/hello', (req, res, ctx) => {
  res.writeHead(200, { ...ctx.sec, 'Content-Type': 'text/plain' });
  res.end('Hello');
});
```

无需修改 `server.js`。

## 配置

### 环境变量
| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3300 | （手动修改 server.js）监听端口 |

### 安全
- `plugin/` 目录禁止直接 URL 访问
- `.git/`、`node_modules/`、`sync-config.json` 等敏感路径禁止访问
- 路径穿越（`../`、编码穿越）拦截
- 空字节、伪造文件类型检测
- 安全 HTTP 头（`X-Content-Type-Options`、`X-Frame-Options` 等）
- 文件预览限制 50MB，超出自动触发下载
