import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function generateToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export async function POST(req: Request) {
  try {
    const { id, password } = await req.json();

    if (!id || !password) {
      return NextResponse.json(
        { error: "아이디와 비밀번호를 입력해주세요." },
        { status: 400 }
      );
    }

    const { data: user, error } = await supabase
      .from("crm_users")
      .select("id, password_hash, name, title, role")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("Login user fetch error:", error);
      return NextResponse.json(
        { error: `사용자 조회 실패: ${error.message}` },
        { status: 500 }
      );
    }

    if (!user) {
      return NextResponse.json(
        { error: "아이디 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 }
      );
    }

    let valid = false;

    // 1차: bcrypt 해시 비밀번호 검증
    try {
      valid = await bcrypt.compare(password, user.password_hash);
    } catch (bcryptError) {
      console.error("bcrypt compare error:", bcryptError);
    }

    // 2차: 초기 세팅용 평문 비밀번호 임시 허용
    // Supabase에 password_hash = 'admin1234!' 처럼 넣은 임시 계정용
    if (!valid && user.password_hash === password) {
      valid = true;
    }

    if (!valid) {
      return NextResponse.json(
        { error: "아이디 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 }
      );
    }

    const token = generateToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { error: sessionError } = await supabase.from("sessions").upsert(
      {
        user_id: user.id,
        session_token: token,
        logged_in_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (sessionError) {
      console.error("Session upsert error:", sessionError);
      return NextResponse.json(
        { error: `세션 생성 실패: ${sessionError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        title: user.title,
        role: user.role,
        sessionToken: token,
      },
    });
  } catch (err: any) {
    console.error("Login server error:", err);
    return NextResponse.json(
      { error: `서버 오류가 발생했습니다: ${err?.message || "unknown error"}` },
      { status: 500 }
    );
  }
}
