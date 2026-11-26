import { createClient } from '@supabase/supabase-js'
const url=import.meta.env.VITE_SUPABASE_URL||'https://qzvsmsdssknghxjyajic.supabase.co'
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_6yt4QD9esbcvixzFFbRTRw_u07Zcio6'
export const supabase=createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,storageKey:'hd-kanban-auth-v1'}})

