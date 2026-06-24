// 멀티플레이 백엔드: Supabase 클라이언트 1개. 키는 Vite 환경변수(.env.local, 빌드 시 GitHub
// 시크릿)에서 읽는다. anon 키는 공개돼도 되는 키 — 실제 보안은 DB의 RLS 정책이 담당한다.
// 키가 없으면(예: 키 미설정 환경) supabase = null 이라 온라인 기능만 조용히 비활성화된다.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const env = import.meta.env as unknown as Record<string, string | undefined>
const url = env.VITE_SUPABASE_URL
const anonKey = env.VITE_SUPABASE_ANON_KEY

export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null
export const mpEnabled: boolean = supabase !== null
