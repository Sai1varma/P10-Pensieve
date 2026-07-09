// Runtime config for Block Board live collaboration (Supabase).
// This file is served statically and read at runtime, so no secrets are baked
// into the build. The anon key is public-safe (protected by row-level security).
// To enable live collaboration, fill both fields with your Supabase project's
// values (Project Settings -> API):
window.__BB_SUPABASE__ = {
  url: "https://hggiphuzdfiolrxhxpmf.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnZ2lwaHV6ZGZpb2xyeGh4cG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MDkyMTMsImV4cCI6MjA5OTE4NTIxM30.-d5KhcZVSGtNCdbNT9delZ1-IwlPlG4EMX-tMZWyFMo",
};
