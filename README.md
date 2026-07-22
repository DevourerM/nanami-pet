# nanami-pet

基于 Electron、Live2D、OpenAI 兼容 API 与 GPT-SoVITS 的本地桌面宠物。角色为《RIDDLE JOKER》的在原七海；回复由兼容 OpenAI Chat Completions 的 API 生成，显示中文、TTS 朗读日语。

## 本仓库包含与不包含的内容

仓库只保存应用源码、提示词、依赖清单和安装指引。

不会提交 Live2D 模型、Cubism Core、GPT-SoVITS 推理环境、训练权重、参考音频、生成音频、`node_modules` 或本地图标。它们需要由使用者根据 [外部资产安装](docs/ASSET_SETUP.md) 在本地放置；请确认拥有相应资源的使用权。

## 本地启动

1. 完成 [外部资产安装](docs/ASSET_SETUP.md)。
2. 安装 Node.js LTS，然后在项目根目录运行 `npm ci`。
3. 运行 `npm start`，或双击 `启动七海宠物.cmd`。
4. 在设置中填写 OpenAI 兼容的 API 地址、模型名称与 API Key。密钥仅保存到本机 Electron 用户数据目录，不能提交到 Git。

可运行 `npm run doctor` 检查 Live2D 模型和 Cubism Core 是否已放置。

## 分支约定

- `main`：发布分支，只接收经过验证的版本。
- `develop`：日常集成分支，默认开发入口。
- `feature/<topic>`：从 `develop` 切出；完成后通过 Pull Request 合并回 `develop`。
- 发布时提交 `develop -> main` 的 Pull Request，并在合并后打版本标签，例如 `v0.1.0`。

建议在 GitHub 仓库设置中将 `main` 设为默认分支，并为 `main` 启用 Pull Request 审核与禁止直接推送的分支保护规则。

## 许可与致谢

应用代码以本仓库后续声明的许可为准。角色与第三方资源不随代码授权；其来源、归属与本地准备方式见 [外部资产安装](docs/ASSET_SETUP.md)。
