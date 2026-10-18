# Security and verification boundaries

Keep provider credentials, Stripe keys, Supabase service keys, database URLs, vault keys, sessions and local bridge state out of Git and client bundles. Use separate sandbox/live payment configuration. Keep account ownership, signed webhook verification, quote/reservation limits and uncertain-outcome protection intact.

The October 17 source package uses @modelcontextprotocol/sdk 1.31.0 or later and source-map-js 1.2.2 or later, with zero advisories reported by npm audit at packaging time. This is a dependency check, not a complete security review or proof of exploitability in this app. Advisory references:

- https://github.com/advisories/GHSA-6qxp-vccf-f47h (OAuth client credential issuer binding; the app's local stdio server does not use that affected client flow).
- https://github.com/advisories/GHSA-68fv-2mgg-jv7q (indexed source-map offsets).

Hosted payment, recovery/retention drills, abuse controls and operational release review remain pre-release gates. Do not post secrets, customer data, private media or exploit details in public issues. Contact the repository owner privately before disclosing a vulnerability.
