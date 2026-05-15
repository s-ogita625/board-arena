"use client";

import { createBrowserClient } from "@supabase/ssr";

export const BOARDARENA_SCHEMA = "boardarena";

export function createSupabaseBrowser() {
  // 新しい @supabase/supabase-js の型システムが db.schema を "public" 限定で
  // 推論するため、ここでは Database ジェネリクスを付けずに作成し、
  // 利用側で必要に応じて型を明示する。
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: BOARDARENA_SCHEMA as "public" },
    },
  );
}
