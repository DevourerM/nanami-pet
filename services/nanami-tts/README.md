# 七海日语 TTS 推理服务

这是 GPT-SoVITS v2Pro 的最小推理部署：只含七海权重、日语参考音频、日语文本处理、推理代码和便携运行时；不含训练脚本、WebUI、数据集或模型切换接口。

## 启动

双击 `start-tts-server.cmd`，等待控制台显示服务启动。模型会在启动期间加载到 GPU。

## LLM / 应用接口

服务仅监听 `127.0.0.1:9880`。

`GET /health` 返回服务状态和固定语音信息。

`POST /tts` 合成 WAV 音频。请求体：

```json
{"text":"こんにちは、今日もお疲れ様。", "speed":1.0, "seed":-1}
```

PowerShell 示例：

```powershell
Invoke-WebRequest -Method Post -Uri http://127.0.0.1:9880/tts -ContentType application/json -Body '{"text":"こんにちは。","speed":1.0}' -OutFile nanami.wav
```

接口固定使用七海日语模型与 `ref_voice` 中的参考音频，不能接收外部模型路径或参考音频路径。
\n## 情感参考音频

`POST /tts` 还接受可选的 `emotion` 字段，例如 `neutral`、`gentle`、`happy`、`shy` 或 `teasing`。服务从项目根目录的 `assets/voice-references/` 读取 `gptsovits_reference_prompts.tsv` 与对应 OGG 参考音频；未知或缺失的标签会安全回退为 `neutral`。

请勿把该目录、模型、运行时或生成音频提交到 Git；详细的本地目录结构见 `docs/ASSET_SETUP.md`。
