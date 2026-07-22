# 外部资产安装

本项目刻意不分发角色、声音模型或第三方运行时。请只使用你已获授权的本地副本，并在项目根目录按下列结构放置。

```text
nanami-pet/
├─ model/                         # Live2D 模型目录（不提交）
│  └─ nanami.model3.json
├─ vendor/                        # Live2D Cubism Core（不提交）
│  └─ live2dcubismcore.min.js
├─ services/
│  └─ nanami-tts/                 # GPT-SoVITS 最小推理部署与训练模型（不提交）
│     ├─ runtime/
│     ├─ GPT_SoVITS/
│     ├─ models/
│     ├─ config/
│     └─ tts_server.py
├─ assets/
│  └─ voice-references/           # 多情感日语参考音频与转写表（不提交）
└─ icon.png                       # 自行准备的透明 PNG 图标（不提交）
```

## 1. Live2D 模型

本项目使用的在原七海 Live2D 模型不包含在仓库中。请从原发布视频及其说明页获取，并遵守发布者的使用条件：

- [【同人Live2D】超可爱的妹妹！在原七海Live2D化（Bilibili）](https://www.bilibili.com/video/BV1ED4y1o7SB/)

将模型完整目录放入 `model/`，并确认入口文件为 `model/nanami.model3.json`。模型引用的纹理、动作、物理文件和原始音频必须保持相对路径结构不变。

## 2. Cubism Core

从 Live2D 官方 Cubism SDK 获取与模型兼容的 `live2dcubismcore.min.js`，放到：

```text
vendor/live2dcubismcore.min.js
```

运行 `npm run doctor` 应显示模型和 Core 均为 `OK`。

## 3. GPT-SoVITS 日语推理服务

从你已配置的 GPT-SoVITS 本地项目准备**最小推理部署**，放入 `services/nanami-tts/`。这个目录需要包含可执行 Python 运行时、GPT-SoVITS 推理代码、七海训练权重、`config/tts_infer.yaml`、以及本项目使用的 `tts_server.py` 包装器。

同时将对应的日语参考音频放至：

```text
assets/voice-references/
```

启动桌宠时会自动托管该服务并检查 `http://127.0.0.1:9880/health`，不需要单独启动 BAT。

GPT-SoVITS 上游项目与模型、权重、运行时均受各自许可证和使用条件约束，请从官方或你获授权的来源获取，不要把它们提交到此仓库。

## 4. 项目图标

准备一张带透明背景的 PNG，命名为 `icon.png` 并放在仓库根目录。应用会将其用于托盘和窗口图标。该图片不会被 Git 追踪。

## 验证清单

```powershell
npm ci
npm run doctor
npm start
```

进入设置页配置 LLM 后，发送一条日语或中文消息；若角色能显示中文回复并播放日语语音，说明 LLM、TTS 和模型均已正确连接。
\n## 多情感参考音频

桌宠会让 LLM 为每次日语回复返回一个情感标签，并据此选择 GPT-SoVITS 参考音频。请将你已授权的分析结果中 `output/references/` 的**全部内容**复制到 `assets/voice-references/`：

```text
assets/voice-references/
├── gptsovits_reference_prompts.tsv
├── neutral_平静/
│   └── *.ogg
├── happy_开心/
│   └── *.ogg
└── ... 其他情感目录
```

该目录当前支持 23 个标签（包括 `neutral`、`gentle`、`happy`、`shy`、`teasing` 等）。音频、转写表、模型和运行时均为本地外部资产，禁止提交到此仓库。
