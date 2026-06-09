-- MCP integration: hashed API key for Claude Desktop and other MCP clients
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS mcp_api_key_hash   text,
  ADD COLUMN IF NOT EXISTS mcp_api_key_prefix text;
