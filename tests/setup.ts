// Deterministic, fake configuration so modules that read env() work in tests.
// `??=` lets the opt-in DB integration test point SUPABASE_* at a real (local) instance.
process.env.APP_URL ??= "http://127.0.0.1:3000";
process.env.SPOTIFY_CLIENT_ID ??= "test-client-id";
process.env.SPOTIFY_CLIENT_SECRET ??= "test-client-secret";
process.env.SPOTIFY_REDIRECT_URI ??= "http://127.0.0.1:3000/api/auth/callback";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.SESSION_SECRET ??= "x".repeat(32);
process.env.TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
