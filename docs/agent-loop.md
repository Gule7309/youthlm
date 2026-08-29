# YouthLM Agent MVP

## Runtime flow

1. `YouthLMAgent` sends the user prompt and allow-listed tool declarations to the
   explicitly selected `ModelProvider`.
2. The provider returns either final text or normalized `ModelToolCall` objects.
3. `ToolRegistry` resolves only registered tool names and records success or error.
4. The agent appends normalized `tool_call` and `tool_result` message blocks.
5. The provider maps those blocks to Gemini `functionCall/functionResponse` or
   Bedrock `toolUse/toolResult` and asks the model for the final answer.

There is no automatic provider fallback. A run starts with Gemini or Bedrock and
stays on that provider.

## Provider continuation state

Gemini 3 requires the exact function-call ID and thought signature to be returned
with the function result. `ModelTurn.provider_state` carries this opaque data across
the agent loop. The core never interprets it, and Bedrock does not need it.

## Current tool

`calculate_change` accepts `old_value` and `new_value` and returns:

- absolute change;
- percentage change, or `null` when the old value is zero;
- increase, decrease, or unchanged direction.

The tool is deterministic and contains no external data. A real youth dataset
query tool is the next domain checkpoint.

## Safety boundaries

- Only registered tools can execute.
- Tool exceptions become structured results so the model can recover.
- Tool output must be JSON serializable.
- Empty prompts and inconsistent provider turns fail explicitly.
- `max_steps` prevents an unbounded model/tool loop.
