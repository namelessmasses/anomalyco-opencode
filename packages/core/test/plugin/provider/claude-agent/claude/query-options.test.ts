import { describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { ClaudeQueryOptions } from "@opencode/core/plugin/provider/claude-agent/claude/query-options"

describe("Claude Agent account directories", () => {
  test("expands a named profile directory into a subprocess environment variable", () => {
    const env = ClaudeQueryOptions.connectionEnv({ settings: { configDir: "~/.claude-work" } })
    expect(env.CLAUDE_CONFIG_DIR).toBe(path.join(os.homedir(), ".claude-work"))
  })

  test("does not override the inherited default when no profile is configured", () => {
    expect(ClaudeQueryOptions.connectionEnv({ settings: {} }).CLAUDE_CONFIG_DIR).toBeUndefined()
  })

  test("keeps API credentials and profile settings independent", () => {
    const env = ClaudeQueryOptions.connectionEnv({
      settings: { configDir: "/accounts/work", baseURL: "https://example.test" },
    })
    expect(env).toEqual({ CLAUDE_CONFIG_DIR: "/accounts/work", ANTHROPIC_BASE_URL: "https://example.test" })
  })
})
