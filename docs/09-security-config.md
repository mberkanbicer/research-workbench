# 09 - Security and Configuration

## Security principle

This is a local-first research system, but it still handles API keys, source content, model outputs, and user research data. Treat all project data as private by default.

## API key handling

MVP rule:

```text
API keys are stored in server environment variables.
ModelConfig stores only apiKeyRef, not raw API key.
Frontend never receives API key values.
```

Example:

```text
OPENROUTER_API_KEY=...
OPENAI_COMPATIBLE_API_KEY=...
```

ModelConfig:

```json
{
  "provider": "openrouter",
  "apiKeyRef": "OPENROUTER_API_KEY"
}
```

Backend resolves:

```ts
const key = process.env[modelConfig.apiKeyRef]
```

## Do not store secrets here

Never store secrets in:

```text
frontend localStorage
frontend Zustand store
API responses
model call logs
RawEvent payloads
export files
browser URL params
```

## Export safety

Exports must exclude:

```text
API keys
API key refs if user chooses safe export
provider auth headers
internal error stack traces containing secrets
```

Exports may include:

```text
project text
idea versions
claims
evidence metadata
critiques
decisions
model names
model providers
```

## Source content

Evidence may contain copyrighted or sensitive text. MVP should store excerpts and summaries. If raw source content is stored, store a reference in `rawContentRef` and do not render huge raw content by default.

## RawEvent immutability

RawEvent must not be updated or deleted in MVP.

If correction is needed:

```text
Create a new RawEvent with type correction or supersession.
```

## Password storage

User passwords are hashed with **bcrypt** (cost factor 12). Stored format:

```text
bcrypt:$2b$12$...
```

Legacy SHA-256 hashes (`salt:hex`) are still accepted at login and transparently upgraded to bcrypt on successful authentication. New registrations and seed users always use bcrypt.

## Model output validation security

Model outputs are untrusted.

Rules:

```text
Do not execute model output.
Do not parse model output as code.
Validate JSON with Zod.
Reject unknown IDs.
Sanitize HTML display.
Render text safely.
```

## SSR and frontend rendering

When rendering model text:

- Do not use dangerouslySetInnerHTML.
- Use markdown rendering only if sanitized.
- MVP can render plain text.

## CORS

For local MVP:

```text
Allow frontend origin http://localhost:3000 only.
```

## Environment variables

Required:

```text
DATABASE_URL=
REDIS_URL=
PORT=4000
WEB_ORIGIN=http://localhost:3000
```

Optional:

```text
OPENROUTER_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434
OPENAI_COMPATIBLE_BASE_URL=http://localhost:1234/v1
OPENAI_COMPATIBLE_API_KEY=
SEARCH_API_KEY=
```

## Logging

Do log:

```text
run started
job completed
model call status
model provider name
token usage
validation error code
```

Do not log:

```text
API keys
Authorization headers
full raw prompt by default in production mode
secret environment variables
```

For MVP local mode, raw prompts may be stored in ModelCall for traceability, but never include secrets.

## Future hardening

After MVP:

```text
Encrypted API key storage
User authentication
Project-level access control
Audit log UI
Data retention settings
Redaction for sensitive user input
Encrypted exports
```
