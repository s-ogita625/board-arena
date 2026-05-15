"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  initial: {
    id: string;
    username: string;
    bio: string;
    avatar_url: string | null;
  };
}

export function ProfileEditor({ initial }: Props) {
  const router = useRouter();
  const [username, setUsername] = useState(initial.username);
  const [bio, setBio] = useState(initial.bio);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSave() {
    setLoading(true);
    setStatus(null);
    const supabase = createSupabaseBrowser();
    let avatar_url = initial.avatar_url;

    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setStatus("画像は 2MB 以下にしてください");
        setLoading(false);
        return;
      }
      const ext = file.name.split(".").pop() || "png";
      const path = `${initial.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (upErr) {
        setStatus(`画像アップロード失敗: ${upErr.message}`);
        setLoading(false);
        return;
      }
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      avatar_url = pub.publicUrl;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ username, bio, avatar_url })
      .eq("id", initial.id);

    setLoading(false);
    if (error) {
      setStatus(`保存失敗: ${error.message}`);
      return;
    }
    setStatus("保存しました");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>プロフィール編集</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="u">ユーザー名</Label>
          <Input id="u" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={24} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="b">一言 (80文字まで)</Label>
          <Input id="b" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={80} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="a">アイコン画像 (2MB以下)</Label>
          <Input
            id="a"
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        {status && <p className="text-sm text-slate-600 dark:text-slate-300">{status}</p>}
        <Button onClick={onSave} disabled={loading}>
          {loading ? "保存中..." : "保存"}
        </Button>
      </CardContent>
    </Card>
  );
}
