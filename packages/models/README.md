# GenAI ETK API Models

This package defines the Smithy model for the GenAI ETK service API. It contains the core data structures, operations, and service definitions that form the contract between clients and the service.

## What This Package Does

- Defines API operations and data structures using Smithy IDL
- Generates client and server SDKs from the model definitions
- Provides type-safe API contracts for TypeScript and Python clients
- Maintains API versioning and backward compatibility
- Excludes implementation-specific traits (those are in the SSDK package)

## Package Structure

```
packages/models/
├── src/                    # Smithy model definitions
├── build/                  # Generated artifacts
│   ├── public/            # Client-facing generated code
│   └── smithy/            # Smithy build outputs
├── smithy-build.json      # Smithy build configuration
└── README.md              # This file
```

## Building

To build this package and generate types, run:

```
mise run codegen
```

## Generated Outputs

This package builds the source projection, which can be consumed by other packages like the Client and Server SDK. The generated artifacts include:

- TypeScript client SDK
- Python client SDK
- Server-side SDK (SSDK)
- OpenAPI specifications

This package does not contain the apigateway traits that are only needed for service implementation and not part of the client-server interface. Those are added in the SSDK package.
