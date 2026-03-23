# Infrastructure & Frontend Claims Verification (2026-03-22)

## 1. "Cloudflare Pages Functions (Workers) can proxy SSE streaming from OpenRouter"
**TRUE (with caveats)**
- Workers natively support SSE streaming via `Response(ReadableStream)`
- Known issue: some frameworks (e.g., Hono's stream helper) may buffer responses, delivering all at once instead of streaming incrementally
- Workaround: use direct `new Response(ReadableStream)` pattern rather than framework stream wrappers
- No effective limit on SSE response duration
- Sources: [Cloudflare Agents SSE docs](https://developers.cloudflare.com/agents/api-reference/http-sse/), [Mastra buffering issue](https://github.com/mastra-ai/mastra/issues/13584)

## 2. "Cloudflare Workers Free plan: 10ms CPU time, but I/O wait doesn't count"
**TRUE**
- Free plan: 10ms CPU time per invocation
- CPU time only measures active code execution; waiting on fetch(), KV, DB queries does NOT count
- Wall time (total elapsed including I/O) is separate from CPU time
- Billing (paid plan) is based on CPU time only — "never pay to wait on I/O again"
- Sources: [Workers Limits](https://developers.cloudflare.com/workers/platform/limits/), [Workers pricing blog](https://blog.cloudflare.com/workers-pricing-scale-to-zero/)

## 3. "Cloudflare Workers Free plan: 100K requests/day"
**TRUE**
- Free plan: 100,000 requests per day
- Approximately 3M requests/month equivalent
- Paid plan: 10M requests/month included
- Sources: [Workers Limits](https://developers.cloudflare.com/workers/platform/limits/), [Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)

## 4. "Cloudflare Workers Paid plan is $5/month"
**TRUE**
- Workers Paid (Standard) plan: $5 USD/month minimum
- Includes Workers, Pages Functions, KV, Hyperdrive, Durable Objects
- Overages: $0.30/million requests, $0.02/million CPU-ms
- No additional charges for egress/bandwidth
- Sources: [Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Plans page](https://www.cloudflare.com/plans/developer-platform/)

## 5. "Hono works natively on Cloudflare Pages Functions via hono/cloudflare-pages adapter"
**TRUE**
- `hono/cloudflare-pages` adapter provides `handle` and `serveStatic`
- `handleMiddleware` allows using Hono middleware as Pages middleware
- Full access to Cloudflare bindings (KV, D1, etc.)
- Officially documented by both Hono and Cloudflare
- Sources: [Hono CF Pages docs](https://hono.dev/docs/getting-started/cloudflare-pages), [Cloudflare Pages Hono guide](https://developers.cloudflare.com/pages/framework-guides/deploy-a-hono-site/)

## 6. "Express cannot run on Cloudflare Workers because it depends on Node.js"
**FALSE / OUTDATED**
- As of 2025-2026, Express.js CAN run on Cloudflare Workers
- Requires `nodejs_compat` compatibility flag and compatibility date >= 2024-09-23
- Uses `httpServerHandler` from `cloudflare:node` to integrate
- Cloudflare blog: "deploy existing Express.js applications globally with zero cold starts"
- Koa also works; Fastify support planned
- Sources: [Deploy Express on Workers](https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/), [Node.js HTTP servers on Workers blog](https://blog.cloudflare.com/bringing-node-js-http-servers-to-cloudflare-workers/)

## 7. "Vercel AI SDK useChat hook works with non-Vercel backends"
**TRUE**
- AI SDK 3.4+ introduced Data Stream Protocol for any backend/language
- `useChat` works with Cloudflare Workers via the protocol spec
- `workers-ai-provider` community provider available for Workers AI models
- Real-world examples exist of useChat + Cloudflare Workers
- Sources: [AI SDK 3.4 blog](https://vercel.com/blog/ai-sdk-3-4), [Cloudflare Workers AI provider](https://ai-sdk.dev/providers/community-providers/cloudflare-workers-ai)

## 8. "vite-plugin-pwa works with Cloudflare Pages deployment"
**TRUE (with configuration)**
- Compatible but requires a `_headers` file for:
  - `manifest.webmanifest`: correct MIME type (`application/manifest+json`)
  - `sw.js`: no caching for updates
  - Workbox files: long-term cache
  - `index.html`: no cache for freshness
- Without `_headers`, PWA installation may fail due to incorrect Content-Type
- Build command: `pnpm run build`, output: `dist`
- Sources: [vite-plugin-pwa CF Pages PR](https://github.com/vite-pwa/vite-plugin-pwa/pull/353)

## 9. "Cloudflare Pages does not explicitly prohibit adult content"
**TRUE (with nuance)**
- Cloudflare does NOT prohibit legal adult content
- Restrictions: no CSAM, no non-consensual content
- Different policies for hosting products vs security/CDN products
- Cloudflare Pages (hosting) has stricter review than CDN-only, but legal adult content is allowed
- Sources: [CF Community thread](https://community.cloudflare.com/t/using-cloudflare-for-adult-website/471480), [CF abuse policies blog](https://blog.cloudflare.com/cloudflares-abuse-policies-and-approach/)

## 10. "Zustand v5 persist middleware works with IndexedDB via Dexie"
**TRUE (with caveats)**
- Zustand persist middleware supports async storage including IndexedDB
- However, known race condition: persist middleware may create empty store and overwrite saved data
- No built-in previous-value access, making Dexie `bulkPut` logic complicated
- Alternative: `zustand-indexeddb` package for better IndexedDB integration
- Custom async storage adapter needed (not plug-and-play with Dexie)
- Sources: [Zustand Discussion #1721](https://github.com/pmndrs/zustand/discussions/1721), [zustand-indexeddb](https://github.com/zustandjs/zustand-indexeddb)

## 11. "shadcn/ui latest version uses base-ui instead of radix"
**PARTIALLY TRUE / NUANCED**
- shadcn/ui now supports BOTH Radix and Base UI (not a full replacement)
- Timeline:
  - June 2025: Radix UI migration support added
  - Jan 2026: Base UI documentation released
  - Feb 2026: Unified `radix-ui` package (single dep instead of multiple @radix-ui/react-*)
  - Feb 2026: Blocks available for both Radix and Base UI
  - March 2026: shadcn/cli v4 with `--base` flag for choosing Radix or Base UI
- Default is still Radix; Base UI is opt-in
- Gradual component-by-component migration recommended (not big bang)
- Sources: [shadcn/ui changelog](https://ui.shadcn.com/docs/changelog), [CLI v4](https://ui.shadcn.com/docs/changelog/2026-03-cli-v4)

## 12. "zod v4 requires import from 'zod/v4' not 'zod'"
**TRUE (during transition period)**
- Zod 4 is published alongside Zod 3 via subpath: `import { z } from "zod/v4"`
- This is a permanent import path (will work forever), not temporary
- Core utilities moved to `zod/v4/core` sub-package
- Approach prevents "version bump avalanche" across ecosystem
- Codemod available: `zod-v3-to-v4`
- Sources: [Zod v4 versioning](https://zod.dev/v4/versioning), [Zod v4 migration guide](https://zod.dev/v4/changelog)

## 13. "Cloudflare Workers response body size limit"
**NO HARD LIMIT on response body**
- Workers do not enforce response body size limits
- CDN cache limits apply if caching: Free/Pro/Business = 512 MB, Enterprise = 5 GB
- For image API responses proxied without caching: effectively unlimited
- Request body limit: 100 MB (free), configurable on paid
- Sources: [Workers Limits](https://developers.cloudflare.com/workers/platform/limits/), [CF Community thread](https://community.cloudflare.com/t/workers-response-body-limit/231783)
