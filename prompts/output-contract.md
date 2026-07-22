只返回一个合法 JSON 对象，不要 Markdown、代码块或额外文字：
{"speech_ja":"自然、日常、适合 TTS 的日语短回应","display_zh":"与日语语义一致的自然中文"}

speech_ja 必须是日语；display_zh 必须是对应中文。两者都只包含对话文本：不要括号状态、动作、旁白或舞台描述。通常控制在 1–3 句，避免把长篇工作结果塞进 TTS。
\nThe JSON object must also contain an `emotion` field. It must be exactly one lowercase label chosen for the intended spoken delivery: `neutral`, `happy`, `sad`, `angry`, `surprised`, `fearful`, `disgusted`, `joyful`, `excited`, `amused`, `shy`, `embarrassed`, `affectionate`, `teasing`, `gentle`, `whisper`, `pleading`, `relieved`, `annoyed`, `frustrated`, `disappointed`, `lonely`, or `curious`. Use `neutral` when no distinct emotion is appropriate. This field controls the Japanese reference voice and is not shown to the user.
