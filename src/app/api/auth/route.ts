import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl || "", supabaseKey || "");

function generateToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

// 브라우저에서 /api/auth 접속해서 배포 반영 여부 확인용
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "auth",
    version: "emergency-login-v1",
    hasSupabaseUrl: Boolean(supabaseUrl),
    hasSupabaseKey: Boolean(supabaseKey),
    supabaseUrl,
  });
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

    // ================================
    // 초기 세팅용 긴급 관리자 로그인
    // Supabase 데이터/세션과 무관하게 통과
    // ================================
    if (id === "adadmin" && password === "admin1234!") {
      return NextResponse.json({
        user: {
          id: "adadmin",
          name: "광고사업부 관리자",
          title: "관리자",
          role: "admin",
          sessionToken: generateToken(),
        },
      });
    }

    // 환경변수 체크
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        {
          error:
            "Supabase 환경변수가 없습니다. Vercel Environment Variables를 확인해주세요.",
        },
        { status: 500 }
      );
    }

    // DB에서 사용자 조회
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

    // 1차: bcrypt 해시 검증
    try {
      valid = await bcrypt.compare(password, user.password_hash);
    } catch (bcryptError) {
      console.error("bcrypt compare error:", bcryptError);
    }

    // 2차: 초기 세팅용 평문 비밀번호 허용
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

    // sessions 테이블이 없어도 로그인 자체는 통과시키기
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
      // 여기서 막지 않고 로그인은 허용
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
