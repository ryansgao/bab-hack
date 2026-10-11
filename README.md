# RoboMarket

An autonomous marketplace where robots buy intelligence on demand.

The agent decomposes a warehouse mission into a variable number of purchasable
subtasks, compares providers under risk, latency, and budget constraints, and
executes dependencies in order. Local navigation and stopping remain independent
of payments.

Start with [architecture](docs/architecture.md), [team ownership](docs/team.md),
and [API contracts](docs/api-contracts.md). Implementation and setup instructions
are being added in small commits. Live AUSD settlement requires external testnet
setup; no successful onchain transaction is claimed by this initial scaffold.
