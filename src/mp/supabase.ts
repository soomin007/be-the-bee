// 멀티플레이 백엔드: Supabase 클라이언트 1개.
// 아래 URL/anon 키는 공개돼도 되는 값(브라우저에 원래 실리는 키)이라 코드에 직접 둔다 — 그래야
// 배포된 사이트가 별도 설정(레포 시크릿 등) 없이 바로 온라인 대전이 켜진다. 실제 보안은 DB의 RLS
// 정책이 담당한다(service_role 같은 비밀 키는 절대 여기 두지 않는다).
// 환경변수(.env.local 등)가 있으면 그쪽을 우선 사용한다.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const env = import.meta.env as unknown as Record<string, string | undefined>
const url = env.VITE_SUPABASE_URL || 'https://nvadbcrlgfzoppnvhoru.supabase.co'
const anonKey =
  env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52YWRiY3JsZ2Z6b3BwbnZob3J1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMzkzOTksImV4cCI6MjA5NzgxNTM5OX0.h0nVnP8Hg6qO0GjQoY0YlpQzZBxVQHrE1BluRf6GwFA'

export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null
export const mpEnabled: boolean = supabase !== null
