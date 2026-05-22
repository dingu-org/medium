// Graph API version pinned for every WhatsApp call. Meta supports a version for
// ~2 years from release; v25.0 shipped 2026-02. Bump deliberately, not silently.
// Plain strings only — this module is imported from both client and server code.
export const GRAPH_VERSION = 'v25.0';
export const GRAPH_BASE = 'https://graph.facebook.com';
