# nanami-pet

一个基于 Electron、Live2D、OpenAI 兼容 API 与 GPT-SoVITS 的本地桌面宠物。七海以日语语音回应，并同步显示中文；触碰、待机与输入框都走同一条 Agent → 情感参考 TTS 流程。

## 功能

- Live2D 角色互动、触碰事件与随机待机事件
- OpenAI Chat Completions 兼容接口，可配置任意兼容服务的地址、模型和 Key
- 自动选择日语情感参考音频，输出中文显示与日语语音
- 可复制的持久文本窗口，用于翻译、总结、清单和其他办公型结果
- 鼠标穿透、置顶、视线跟随、音量与历史记录控制
- **专注模式**：仍保留文字回应和角色动作，但暂停当前音频、跳过后续 TTS 合成与播放

## 本地启动

1. 按照 [外部资产安装说明](docs/ASSET_SETUP.md) 放置已获授权的 Live2D、GPT-SoVITS 运行时、模型和参考音频。
2. 安装 Node.js LTS，在项目根目录运行 `npm ci`。
3. 运行 `npm run build:launcher`，生成根目录的 `Nanami Pet.exe`；之后双击它即可启动桌宠。开发调试可使用 `npm start`。
4. 在设置中填写 OpenAI 兼容 API 的地址、模型和 API Key。密钥只保存在本机 Electron 用户数据目录。

可使用 `npm run doctor` 检查 Live2D 模型和 Cubism Core 是否已就位。

## 资源与隐私

仓库仅包含应用源代码、提示词和安装说明；不会提交 Live2D 模型、Cubism Core、GPT-SoVITS 运行时、训练权重、参考音频、生成音频、`node_modules` 或本地图标。请仅使用你有权使用的资源，详情见 [外部资产安装说明](docs/ASSET_SETUP.md)。

## 分支与发布

- `main`：稳定发布分支。
- `develop`：日常集成分支。
- `feature/<topic>`：从 `develop` 创建，完成后通过 PR 合并回 `develop`。

发布流程为 `develop → main` 的 Pull Request；合并后创建语义化版本标签。

## 许可与致谢

应用代码以仓库内许可证为准。角色及第三方资源不随代码授予使用权；请遵循其各自的来源与许可条件。
