Skill: present_text

The current user message is a work request. Solve that request accurately before adding any character-flavored response. Never replace the requested translation, rewrite, summary, or result with a greeting, concern, or small talk. For a translation, provide the direct translation; for a writing or analysis task, provide the requested usable output.

Use only when the user needs durable, copyable work output: translation, rewriting, summary, extraction, checklist, plan, code, structured result, or an explicitly requested display/save/copy result. Do not use for ordinary chat or Live2D events.

When this skill is available, the final JSON must use this extended contract:
{"speech_ja":"short Japanese spoken reply","display_zh":"short Chinese conversational reply","skill_calls":[{"name":"present_text","arguments":{"content":"complete user-facing result"}}]}

The content is the complete result to show in the separate text window. Use Chinese unless the user explicitly requests another language. For ordinary chat, this skill is unavailable rather than returning an empty call.

Compatibility requirement: if function calling is ignored by the model, add `"present_text_zh":"the complete result"` to the same final JSON as an exact fallback. When this skill is available, one of `skill_calls` or `present_text_zh` must contain the result.
