export * as ClaudeIntegration from "./integration.js"

import type { Context } from "@opencode/plugin/effect/plugin"
import { Effect, Stream, SubscriptionRef } from "effect"
import type { IntegrationConnection } from "../../../integration/connection.js"
import { ProviderRefresh } from "../refresh.js"
import { ClaudeProbe } from "./claude/probe.js"
import type { ClaudeStatus } from "./claude/status.js"
import { ClaudeProvider } from "./provider.js"
import { credentialSettings, metadataSettings } from "../credential-settings.js"

export const METHOD_ID = "claude-login"

// The login method only records that the user chose Claude Code. The login itself belongs to `claude`, and the plugin
// never sees a token (specs/v2/claude-agent-provider.md, "Login").
export const register = Effect.fn("ClaudeIntegration.register")(function* (
  ctx: Context,
  status: ClaudeStatus.Interface,
) {
  yield* ctx.integration.transform((editor) => {
    editor.update(ClaudeProvider.ID, (integration) => {
      integration.name = "Claude Agent"
    })
    editor.method.update({
      integrationID: ClaudeProvider.ID,
      method: { id: METHOD_ID, type: "external", label: "Claude Code login (claude auth login)" },
    })
    editor.method.update({
      integrationID: ClaudeProvider.ID,
      method: {
        id: "claude-profile",
        type: "external",
        label: "Claude Code profile (config directory)",
        form: [{
          key: "configDir",
          type: "string",
          title: "Claude configuration directory",
          description: "Authenticate separately with CLAUDE_CONFIG_DIR=<path> claude auth login.",
          required: true,
          minLength: 1,
          pattern: "\\S",
          placeholder: "Absolute path to Claude profile",
          custom: true,
        }],
      },
    })
  })

  const login = yield* credentialSettings(ctx, ClaudeProvider.ID, (value) =>
    value.type === "external" && value.methodID === "claude-profile"
      ? metadataSettings(value.metadata, ["configDir"])
      : {},
  )
  yield* ctx.provider.transform((editor) => {
    for (const item of editor.list()) {
      if (item.provider.id !== ClaudeProvider.ID) continue
      editor.update(item.provider.id, (provider) => {
        provider.settings = { ...provider.settings, ...login.settings }
      })
    }
  })

  yield* SubscriptionRef.changes(status.state).pipe(
    Stream.runForEach((state) =>
      Effect.gen(function* () {
        if (state.type === "checking") return
        const connection = yield* ctx.integration.connection.active(ClaudeProvider.ID)
        if (!connection) return
        yield* ctx.integration.connection.status({
          integrationID: ClaudeProvider.ID,
          connection,
          status: problem(state),
        })
      }),
    ),
    Effect.forkScoped,
  )

  // Check again when the user connects. opencode keeps a problem per connection, so a new connection starts with
  // none, and the user may have just run `claude auth login`.
  yield* ProviderRefresh.onSwitch(ClaudeProvider.ID, status.refresh())
})

function problem(state: ClaudeStatus.State): IntegrationConnection.Status | undefined {
  if (state.type === "missing")
    return {
      status: "needs_auth",
      message: "Claude Code is not installed. Install it, then run `claude auth login`.",
      url: "https://code.claude.com/docs/en/setup",
    }
  // The message already says what went wrong with Claude Code.
  if (state.type === "failed") return { status: "needs_auth", message: state.message }
  if (state.type === "ready" && !ClaudeProbe.isLoggedIn(state.probe.account))
    return { status: "needs_auth", message: "Claude Code is not logged in. Run `claude auth login` in a terminal." }
  return undefined
}
