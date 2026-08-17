---
name: OpenAPI and generated Zod compatibility
description: A generator/runtime compatibility constraint for numeric schemas in this workspace.
---

The current Orval + Zod dependency combination generates `zod.int()` for OpenAPI `integer` schemas, but the installed Zod runtime does not expose that method. Use numeric schemas at the contract boundary unless the generator/runtime versions are upgraded together.

**Why:** Code generation can succeed while the workspace typecheck fails inside generated validation code.

**How to apply:** After changing `lib/api-spec/openapi.yaml`, run codegen and the library typecheck before wiring routes or frontend hooks.