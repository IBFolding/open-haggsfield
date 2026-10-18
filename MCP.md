# Local MCP control

Start the development server and keep the app open in a browser. Add a stdio MCP server to your MCP client using the absolute path to this checkout:

```json
{
  "mcpServers": {
    "open-haggsfield": {
      "command": "node",
      "args": ["/absolute/path/to/open-haggsfield/server/mcp.mjs"]
    }
  }
}
```

Call studio_status first. Tools list/create/read projects, attach references, prepare plans, open projects, and read/edit timelines through the application's authoritative reducer. They do not submit paid generation, return provider credentials, publish projects or provide arbitrary filesystem access. control_demo_production is explicitly a simulation, not a render.

Reference images must be PNG/JPEG/WebP in mcp-assets, at most 1 MB each, with at most three references per draft. Create this directory yourself and keep private assets out of Git. The development bridge uses a local token file with restricted permissions. Never share it or expose the bridge on a public interface. An uncertain edit response requires inspection before retrying.
