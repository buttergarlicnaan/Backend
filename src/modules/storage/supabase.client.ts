import { createClient } from "@supabase/supabase-js"
import { env } from "../../config/env"

// Create a single supabase client instance using the service role key.
// This allows backend-only operations that bypass RLS where necessary,
// while ensuring it's not exposed to the frontend.
export const supabase = createClient(env.supabase.url, env.supabase.serviceRoleKey)
