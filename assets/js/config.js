// /assets/js/config.js
// Purpose: Let your static site (Cloudflare Pages) talk directly to Supabase’s PostgREST.
// Why Supabase here? You get Postgres + Auth + Row Level Security (RLS),
// so the public can only see what policies allow, and the admin (after login) can write.

export const SUPABASE_URL = "https://tllerskgopgsshaxybbw.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsbGVyc2tnb3Bnc3NoYXh5YmJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNjkzMjgsImV4cCI6MjA3MDg0NTMyOH0.S-5krmCQ-wHSxkxLLnNfoIRrQN0XalTqb7wZKLXF_Cg"; // from Supabase Settings → API