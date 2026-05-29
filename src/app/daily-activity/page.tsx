"use client";

import EmptyState from "@/components/EmptyState";
import { getCurrentUser, type CRMUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardCopy,
  Eye,
  Flag,
  RefreshCw,
  Save,
  Target,
  TrendingUp,
  UserCheck,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ElementType,
  type ReactNode,
} from "react";

const ACTIVITY_FIELDS = [
  { key: "new_tm", label: "신규TM", unit: "건" },
  { key: "manage_tm", label: "관리TM", unit: "건" },
  { key: "coldtalk", label: "콜드톡발송", unit: "건" },
  { key: "daily_sales", label: "당일매출", unit: "건" },
] as const;

type ActivityKey = (typeof ACTIVITY_FIELDS)[number]["key"];
type FormValues = Record<ActivityKey, number>;

type CRMMember = {
  id: string;
  name: string;
  title: string | null;
  role: string | null;
};

type DailyActivityRow = {
  id: number;
  work_date: string;
  owner_name: string;
  owner_title: string | null;
  owner_role: string | null;
  is_outside_meeting: boolean;
  goal_consultant_db?: number;
  goal_second_touch?: number;
  goal_new_tm: number;
  goal_manage_tm: number;
  goal_coldtalk: number;
  goal_meeting_confirmed?: number;
  goal_daily_sales?: number;
  result_consultant_db?: number;
  result_second_touch?: number;
  result_new_tm: number;
  result_manage_tm: number;
  result_coldtalk: number;
  result_meeting_confirmed?: number;
  result_daily_sales?: number;
  created_at: string;
  updated_at: string;
};

const EMPTY_VALUES: FormValues = {
  new_tm: 0,
  manage_tm: 0,
  coldtalk: 0,
  daily_sales: 0,
};

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function toDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfWeek(dateText: string) {
  const date = new Date(`${dateText}T00:00:00`);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return toDateInput(date);
}

function endOfWeek(dateText: string) {
  const date = new Date(`${startOfWeek(dateText)}T00:00:00`);
  date.setDate(date.getDate() + 6);
  return toDateInput(date);
}

function startOfMonth(dateText: string) {
  const date = new Date(`${dateText}T00:00:00`);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function endOfMonth(dateText: string) {
  const date = new Date(`${dateText}T00:00:00`);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;
}

function formatKoreanDate(dateText: string) {
  const date = new Date(`${dateText}T00:00:00`);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${days[date.getDay()]})`;
}

function n(value: number | null | undefined) {
  return Number(value || 0);
}

function percent(result: number, goal: number) {
  if (!goal) return result > 0 ? 100 : 0;
  return Math.round((result / goal) * 100);
}

function goalValue(row: DailyActivityRow | undefined, key: ActivityKey) {
  if (!row) return 0;
  if (key === "daily_sales") return n(row.goal_daily_sales);
  return n(row[`goal_${key}` as keyof DailyActivityRow] as number);
}

function resultValue(row: DailyActivityRow | undefined, key: ActivityKey) {
  if (!row) return 0;
  if (key === "daily_sales") return n(row.result_daily_sales);
  return n(row[`result_${key}` as keyof DailyActivityRow] as number);
}

function totalGoal(row: DailyActivityRow | undefined) {
  if (!row || row.is_outside_meeting) return 0;
  return ACTIVITY_FIELDS.reduce((sum, field) => sum + goalValue(row, field.key), 0);
}

function totalResult(row: DailyActivityRow | undefined) {
  if (!row || row.is_outside_meeting) return 0;
  return ACTIVITY_FIELDS.reduce((sum, field) => sum + resultValue(row, field.key), 0);
}

function isGoalEntered(row: DailyActivityRow | undefined) {
  if (!row) return false;
  if (row.is_outside_meeting) return true;
  return ACTIVITY_FIELDS.some((field) => goalValue(row, field.key) > 0);
}

function isResultEntered(row: DailyActivityRow | undefined) {
  if (!row) return false;
  if (row.is_outside_meeting) return true;
  return ACTIVITY_FIELDS.some((field) => resultValue(row, field.key) > 0);
}

function canViewAll(user: CRMUser | null) {
  return user?.role === "admin" || user?.role === "ops";
}

function rowForOwner(rows: DailyActivityRow[], name: string) {
  return rows.find((row) => row.owner_name === name);
}

function copyToClipboard(text: string) {
  return navigator.clipboard.writeText(text);
}

function buildGoalReport(dateText: string, rows: DailyActivityRow[]) {
  const lines = [`■ ${formatKoreanDate(dateText)}`, "광고사업부 당일 활동목표", "", "@all", "──────────────"];

  rows
    .filter((row) => !row.is_outside_meeting)
    .forEach((row) => {
      lines.push(`@${row.owner_name}`);
      ACTIVITY_FIELDS.forEach((field, index) => {
        lines.push(`${index + 1}. ${field.label} : ${goalValue(row, field.key)}${field.unit}`);
      });
      lines.push("");
    });

  lines.push("──────────");
  lines.push(`▶ 총 목표 : ${rows.reduce((sum, row) => sum + totalGoal(row), 0).toLocaleString()}건`);
  return lines.join("\n");
}

function buildResultReport(dateText: string, rows: DailyActivityRow[]) {
  const lines = [`■ ${formatKoreanDate(dateText)}`, "광고사업부 당일 활동결과", "", "@all", "──────────────"];

  rows
    .filter((row) => !row.is_outside_meeting)
    .forEach((row) => {
      lines.push(`@${row.owner_name}`);
      ACTIVITY_FIELDS.forEach((field, index) => {
        lines.push(
          `${index + 1}. ${field.label} : ${resultValue(row, field.key)}${field.unit} / 달성율 ${percent(resultValue(row, field.key), goalValue(row, field.key))}%`,
        );
      });
      lines.push("──────────");
      lines.push(`▶ 합계 : ${totalResult(row)}건 / 달성율 ${percent(totalResult(row), totalGoal(row))}%`);
      lines.push("");
    });

  return lines.join("\n");
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "info",
}: {
  icon: ElementType;
  label: string;
  value: string | number;
  sub?: string;
  tone?: "info" | "success" | "warning" | "purple" | "danger";
}) {
  const styleMap = {
    info: { bg: "var(--info-bg)", border: "var(--info-border)", color: "var(--info-text)" },
    success: { bg: "var(--success-bg)", border: "var(--success-border)", color: "var(--success-text)" },
    warning: { bg: "var(--warning-bg)", border: "var(--warning-border)", color: "var(--warning-text)" },
    purple: { bg: "var(--purple-bg)", border: "var(--purple-border)", color: "var(--purple-text)" },
    danger: { bg: "var(--danger-bg)", border: "var(--danger-border)", color: "var(--danger-text)" },
  }[tone];

  return (
    <div className="premium-card flex min-h-[104px] items-center justify-between p-4">
      <div>
        <p className="crm-tiny">{label}</p>
        <p className="mt-2 text-[25px] font-[820] tracking-[-0.06em]" style={{ color: "var(--text-strong)" }}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
        {sub && <p className="crm-row-sub mt-1">{sub}</p>}
      </div>
      <div
        className="flex h-11 w-11 items-center justify-center rounded-[14px] border"
        style={{ background: styleMap.bg, borderColor: styleMap.border, color: styleMap.color }}
      >
        <Icon size={20} />
      </div>
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  disabled,
  unit = "건",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  unit?: string;
}) {
  return (
    <label className="block">
      <span className="crm-meta mb-2 block">{label}</span>
      <div className="relative">
        <input
          type="number"
          min={0}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Math.max(0, Number(event.target.value || 0)))}
          className="h-[42px] w-full rounded-[13px] border px-3 pr-10 text-[14px] font-[760] outline-none disabled:opacity-50"
          style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-bold" style={{ color: "var(--text-faint)" }}>
          {unit}
        </span>
      </div>
    </label>
  );
}

function ProgressBar({ result, goal }: { result: number; goal: number }) {
  const rate = percent(result, goal);
  const width = goal === 0 && result === 0 ? 0 : Math.min(100, Math.max(3, rate));
  const color = rate >= 100 ? "var(--success)" : rate >= 70 ? "var(--info)" : rate >= 40 ? "var(--warning)" : "var(--danger)";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] font-bold">
        <span style={{ color: "var(--text-subtle)" }}>
          {result.toLocaleString()} / {goal.toLocaleString()}
        </span>
        <span style={{ color }}>{rate}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--surface-3)" }}>
        <div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} />
      </div>
    </div>
  );
}

function OwnerDayCard({ member, row }: { member: CRMMember; row?: DailyActivityRow }) {
  const excluded = row?.is_outside_meeting;

  return (
    <article className="premium-card overflow-hidden p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="crm-avatar" style={{ background: "linear-gradient(135deg,#8b7cf6,#60a5fa)" }}>
            {member.name.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <p className="crm-row-main">
              {member.name} <span className="crm-row-sub">{member.title || ""}</span>
            </p>
            <p className="crm-tiny mt-1">{excluded ? "외근활동 기록대상 제외" : row ? "일별 활동기록 입력됨" : "미입력"}</p>
          </div>
        </div>
        <span className={`badge-premium ${excluded ? "badge-warning" : isResultEntered(row) ? "badge-success" : isGoalEntered(row) ? "badge-info" : "badge-muted"}`}>
          {excluded ? "외근" : isResultEntered(row) ? "결과입력" : isGoalEntered(row) ? "목표입력" : "대기"}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {ACTIVITY_FIELDS.map((field) => (
          <div key={field.key} className="rounded-[13px] border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="crm-tiny">{field.label}</p>
              <p className="text-[12px] font-[780]" style={{ color: "var(--text)" }}>
                {resultValue(row, field.key)} / {goalValue(row, field.key)}{field.unit}
              </p>
            </div>
            <ProgressBar result={resultValue(row, field.key)} goal={goalValue(row, field.key)} />
          </div>
        ))}
      </div>
    </article>
  );
}

function PeriodSummary({ title, rows }: { title: string; rows: DailyActivityRow[] }) {
  const included = rows.filter((row) => !row.is_outside_meeting);
  const goals = included.reduce((sum, row) => sum + totalGoal(row), 0);
  const results = included.reduce((sum, row) => sum + totalResult(row), 0);
  const excluded = rows.length - included.length;

  return (
    <div className="premium-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="crm-card-title">{title}</p>
          <p className="crm-tiny mt-1">외근 제외 {included.length}건 기준</p>
        </div>
        {excluded > 0 && <span className="badge-premium badge-warning">외근 제외 {excluded}</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <p className="crm-tiny">목표합계</p>
          <p className="crm-row-main mt-1">{goals.toLocaleString()}건</p>
        </div>
        <div>
          <p className="crm-tiny">결과합계</p>
          <p className="crm-row-main mt-1">{results.toLocaleString()}건</p>
        </div>
        <div>
          <p className="crm-tiny">달성율</p>
          <p className="crm-row-main mt-1">{percent(results, goals)}%</p>
        </div>
      </div>
      <div className="mt-3">
        <ProgressBar result={results} goal={goals} />
      </div>
    </div>
  );
}

function GuideBox({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-[16px] border px-4 py-3 text-[13px] font-[650] leading-relaxed"
      style={{ background: "var(--accent-subtle)", borderColor: "var(--accent-border)", color: "var(--accent-text)" }}
    >
      {children}
    </div>
  );
}

export default function DailyActivityPage() {
  const [user, setUser] = useState<CRMUser | null>(null);
  const [members, setMembers] = useState<CRMMember[]>([]);
  const [date, setDate] = useState(todayString());
  const [dailyRows, setDailyRows] = useState<DailyActivityRow[]>([]);
  const [periodRows, setPeriodRows] = useState<DailyActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [isOutsideMeeting, setIsOutsideMeeting] = useState(false);
  const [goal, setGoal] = useState<FormValues>({ ...EMPTY_VALUES });
  const [result, setResult] = useState<FormValues>({ ...EMPTY_VALUES });
  const [selectedOwner, setSelectedOwner] = useState("");

  const viewAll = useMemo(() => canViewAll(user), [user]);
  const currentMember = useMemo<CRMMember | null>(() => {
    if (!user) return null;
    return members.find((member) => member.name === user.name) || { id: user.id, name: user.name, title: user.title, role: user.role };
  }, [members, user]);

  const dailyMemberRows = useMemo(() => members.map((member) => ({ member, row: rowForOwner(dailyRows, member.name) })), [dailyRows, members]);
  const myRow = useMemo(() => (user?.name ? rowForOwner(dailyRows, user.name) : undefined), [dailyRows, user?.name]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const loginUser = getCurrentUser();
    setUser(loginUser);

    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);

    const [usersRes, dailyRes, periodRes] = await Promise.all([
      supabase.from("crm_users").select("id,name,title,role").order("created_at", { ascending: true }),
      supabase.from("daily_activity_goals").select("*").eq("work_date", date),
      supabase
        .from("daily_activity_goals")
        .select("*")
        .gte("work_date", monthStart)
        .lte("work_date", monthEnd)
        .order("work_date", { ascending: false }),
    ]);

    const loadedMembers = usersRes.error ? [] : ((usersRes.data || []) as CRMMember[]);
    const fallbackMember = loginUser ? [{ id: loginUser.id, name: loginUser.name, title: loginUser.title, role: loginUser.role }] : [];
    const nextMembers = loadedMembers.length ? loadedMembers : fallbackMember;
    setMembers(nextMembers);

    if (dailyRes.error) {
      alert(`일별 활동기록을 불러오지 못했습니다.\n${dailyRes.error.message}`);
      setDailyRows([]);
    } else {
      setDailyRows((dailyRes.data || []) as DailyActivityRow[]);
    }

    if (periodRes.error) {
      setPeriodRows([]);
    } else {
      setPeriodRows((periodRes.data || []) as DailyActivityRow[]);
    }

    const row = loginUser?.name
      ? ((dailyRes.data || []).find((item) => item.owner_name === loginUser.name) as DailyActivityRow | undefined)
      : undefined;

    if (row) {
      setIsOutsideMeeting(row.is_outside_meeting);
      setGoal({
        new_tm: row.goal_new_tm || 0,
        manage_tm: row.goal_manage_tm || 0,
        coldtalk: row.goal_coldtalk || 0,
        daily_sales: row.goal_daily_sales || 0,
      });
      setResult({
        new_tm: row.result_new_tm || 0,
        manage_tm: row.result_manage_tm || 0,
        coldtalk: row.result_coldtalk || 0,
        daily_sales: row.result_daily_sales || 0,
      });
    } else {
      setIsOutsideMeeting(false);
      setGoal({ ...EMPTY_VALUES });
      setResult({ ...EMPTY_VALUES });
    }

    setSelectedOwner((prev) => prev || loginUser?.name || nextMembers[0]?.name || "");
    setLoading(false);
  }, [date]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  const handleSave = async () => {
    if (!user || !currentMember) {
      alert("로그인 사용자 정보를 확인할 수 없습니다.");
      return;
    }

    setSaving(true);
    const payload = {
      work_date: date,
      owner_name: currentMember.name,
      owner_title: currentMember.title || "",
      owner_role: currentMember.role || user.role || "ad",
      is_outside_meeting: isOutsideMeeting,
      goal_consultant_db: 0,
      goal_second_touch: 0,
      goal_new_tm: isOutsideMeeting ? 0 : goal.new_tm,
      goal_manage_tm: isOutsideMeeting ? 0 : goal.manage_tm,
      goal_coldtalk: isOutsideMeeting ? 0 : goal.coldtalk,
      goal_meeting_confirmed: 0,
      goal_daily_sales: isOutsideMeeting ? 0 : goal.daily_sales,
      result_consultant_db: 0,
      result_second_touch: 0,
      result_new_tm: isOutsideMeeting ? 0 : result.new_tm,
      result_manage_tm: isOutsideMeeting ? 0 : result.manage_tm,
      result_coldtalk: isOutsideMeeting ? 0 : result.coldtalk,
      result_meeting_confirmed: 0,
      result_daily_sales: isOutsideMeeting ? 0 : result.daily_sales,
    };

    const { error } = await supabase.from("daily_activity_goals").upsert(payload, { onConflict: "work_date,owner_name" });
    setSaving(false);

    if (error) {
      alert(`저장 실패\n${error.message}`);
      return;
    }

    showToast("일별 활동기록이 저장되었습니다");
    fetchRows();
  };

  const copyGoalReport = async () => {
    await copyToClipboard(buildGoalReport(date, dailyRows));
    showToast("활동목표 양식이 복사되었습니다");
  };

  const copyResultReport = async () => {
    await copyToClipboard(buildResultReport(date, dailyRows));
    showToast("활동결과 양식이 복사되었습니다");
  };

  const personalRows = useMemo(() => (user?.name ? periodRows.filter((row) => row.owner_name === user.name) : []), [periodRows, user?.name]);
  const selectedMember = useMemo(() => members.find((member) => member.name === selectedOwner) || currentMember || members[0], [currentMember, members, selectedOwner]);
  const selectedDailyRow = useMemo(() => (selectedMember ? rowForOwner(dailyRows, selectedMember.name) : undefined), [dailyRows, selectedMember]);
  const selectedPeriodRows = useMemo(() => (selectedMember ? periodRows.filter((row) => row.owner_name === selectedMember.name) : []), [periodRows, selectedMember]);

  const selectedWeekRows = useMemo(() => {
    const s = startOfWeek(date);
    const e = endOfWeek(date);
    return selectedPeriodRows.filter((row) => row.work_date >= s && row.work_date <= e);
  }, [date, selectedPeriodRows]);

  const personalWeekRows = useMemo(() => {
    const s = startOfWeek(date);
    const e = endOfWeek(date);
    return personalRows.filter((row) => row.work_date >= s && row.work_date <= e);
  }, [date, personalRows]);

  const visibleDetailRows = viewAll ? selectedPeriodRows : personalRows;
  const visibleWeekRows = viewAll ? selectedWeekRows : personalWeekRows;
  const visibleMonthRows = viewAll ? selectedPeriodRows : personalRows;

  const enteredGoals = dailyRows.filter((row) => isGoalEntered(row)).length;
  const enteredResults = dailyRows.filter((row) => isResultEntered(row)).length;
  const totalGoalCount = dailyRows.reduce((sum, row) => sum + totalGoal(row), 0);
  const totalResultCount = dailyRows.reduce((sum, row) => sum + totalResult(row), 0);

  return (
    <div className="premium-page h-full overflow-y-auto">
      <div className="premium-shell px-5 py-5 md:px-7 md:py-6">
        <header className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="badge-premium badge-purple">
                <Target size={13} /> 일별활동기록
              </span>
              <span className="badge-premium badge-muted">{formatKoreanDate(date)} 기준</span>
              {viewAll ? (
                <span className="badge-premium badge-info">
                  <Eye size={13} /> 전체 보기
                </span>
              ) : (
                <span className="badge-premium badge-success">
                  <UserCheck size={13} /> 개인 입력
                </span>
              )}
            </div>
            <h1 className="crm-title">일별활동기록</h1>
            <p className="crm-subtitle mt-2">광고사업부 개인별 활동목표와 결과를 일·주·월 단위로 관리합니다.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="h-[38px] rounded-full border px-3 text-[13px] font-[740] outline-none"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
            />
            <button type="button" onClick={fetchRows} className="btn-premium btn-secondary">
              <RefreshCw size={14} /> 최신화
            </button>
            {viewAll && (
              <>
                <button type="button" onClick={copyGoalReport} className="btn-premium btn-primary">
                  <ClipboardCopy size={14} /> 목표복사
                </button>
                <button type="button" onClick={copyResultReport} className="btn-premium btn-primary">
                  <CheckCircle2 size={14} /> 결과복사
                </button>
              </>
            )}
          </div>
        </header>

        <section className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard icon={Flag} label="목표 입력" value={`${enteredGoals}명`} sub="외근 체크 포함" tone="info" />
          <StatCard icon={CheckCircle2} label="결과 입력" value={`${enteredResults}명`} sub="당일 결과 입력 기준" tone="success" />
          <StatCard icon={TrendingUp} label="총 목표" value={`${totalGoalCount.toLocaleString()}건`} sub="외근 제외 합계" tone="warning" />
          <StatCard icon={CalendarDays} label="총 결과" value={`${totalResultCount.toLocaleString()}건`} sub={`달성율 ${percent(totalResultCount, totalGoalCount)}%`} tone="purple" />
        </section>

        <div className="mb-5 grid gap-3 xl:grid-cols-2">
          <GuideBox>외근활동을 체크하면 해당 일자는 기록대상에서 제외되며, 목표/결과값은 0으로 저장됩니다.</GuideBox>
          <GuideBox>입력 항목은 신규TM, 관리TM, 콜드톡발송, 당일매출 4개만 사용합니다.</GuideBox>
        </div>

        {loading ? (
          <div className="flex min-h-[420px] items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
          </div>
        ) : !user ? (
          <section className="premium-card p-8">
            <EmptyState icon="🔒" title="로그인이 필요합니다" description="로그인 후 일별활동기록을 입력할 수 있습니다." />
          </section>
        ) : (
          <div className="space-y-5">
            <section className="premium-card overflow-hidden">
              <div className="flex flex-col gap-3 border-b px-5 py-4 xl:flex-row xl:items-center xl:justify-between" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-3">
                  <div className="crm-avatar" style={{ background: "linear-gradient(135deg,#8b7cf6,#60a5fa)" }}>
                    {user.name.slice(0, 1)}
                  </div>
                  <div>
                    <p className="crm-section-title">{user.name} {user.title} 당일 활동 입력</p>
                    <p className="crm-tiny mt-1">광고사업부 개인 기준으로 본인 활동기록을 입력합니다.</p>
                  </div>
                </div>
                <label
                  className="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-[12px] font-[780]"
                  style={{
                    borderColor: isOutsideMeeting ? "var(--warning-border)" : "var(--border)",
                    background: isOutsideMeeting ? "var(--warning-bg)" : "var(--surface-2)",
                    color: isOutsideMeeting ? "var(--warning-text)" : "var(--text-muted)",
                  }}
                >
                  <input type="checkbox" checked={isOutsideMeeting} onChange={(event) => setIsOutsideMeeting(event.target.checked)} />
                  외근활동 시 체크 · 당일 기록대상 제외
                </label>
              </div>

              <div className="grid gap-5 p-5 xl:grid-cols-2">
                <div>
                  <div className="mb-4 flex items-center gap-2">
                    <Flag size={17} style={{ color: "var(--info-text)" }} />
                    <p className="crm-section-title">당일 활동목표</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {ACTIVITY_FIELDS.map((field) => (
                      <NumberInput
                        key={field.key}
                        label={field.label}
                        value={goal[field.key]}
                        unit={field.unit}
                        disabled={isOutsideMeeting}
                        onChange={(value) => setGoal((prev) => ({ ...prev, [field.key]: value }))}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-4 flex items-center gap-2">
                    <TrendingUp size={17} style={{ color: "var(--success-text)" }} />
                    <p className="crm-section-title">당일 활동결과</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {ACTIVITY_FIELDS.map((field) => (
                      <NumberInput
                        key={field.key}
                        label={field.label}
                        value={result[field.key]}
                        unit={field.unit}
                        disabled={isOutsideMeeting}
                        onChange={(value) => setResult((prev) => ({ ...prev, [field.key]: value }))}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t px-5 py-4" style={{ borderColor: "var(--border)" }}>
                <button type="button" onClick={handleSave} disabled={saving} className="btn-premium btn-primary">
                  <Save size={14} /> {saving ? "저장 중..." : "활동기록 저장"}
                </button>
              </div>
            </section>

            {viewAll && selectedMember && (
              <section className="premium-card overflow-hidden">
                <div className="flex flex-col gap-3 border-b px-5 py-4 xl:flex-row xl:items-center xl:justify-between" style={{ borderColor: "var(--border)" }}>
                  <div>
                    <p className="crm-section-title">광고사업부 개인별 일별 활동 현황</p>
                    <p className="crm-tiny mt-1">계정이 생성된 CRM 사용자 기준으로 활동기록을 확인합니다.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={selectedOwner}
                      onChange={(event) => setSelectedOwner(event.target.value)}
                      className="h-[38px] min-w-[150px] rounded-full border px-3 text-[13px] font-[760] outline-none"
                      style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text)" }}
                    >
                      {members.map((member) => (
                        <option key={member.id || member.name} value={member.name}>
                          {member.name} {member.title || ""}
                        </option>
                      ))}
                    </select>
                    <span className="badge-premium badge-muted">{formatKoreanDate(date)}</span>
                  </div>
                </div>
                <div className="p-4">
                  <OwnerDayCard member={selectedMember} row={selectedDailyRow} />
                </div>
              </section>
            )}

            <section className="grid gap-4 xl:grid-cols-2">
              <PeriodSummary title={viewAll && selectedMember ? `${selectedMember.name} 주간 통계` : "나의 주간 통계"} rows={visibleWeekRows} />
              <PeriodSummary title={viewAll && selectedMember ? `${selectedMember.name} 월간 통계` : "나의 월간 통계"} rows={visibleMonthRows} />
            </section>

            <section className="premium-card overflow-hidden">
              <div className="flex items-center gap-3 border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
                <BarChart3 size={18} style={{ color: "var(--accent-text)" }} />
                <div>
                  <p className="crm-section-title">{viewAll && selectedMember ? `${selectedMember.name} 월간 상세 기록` : "나의 월간 상세 기록"}</p>
                  <p className="crm-tiny mt-1">선택한 날짜가 포함된 월 기준 기록입니다.</p>
                </div>
              </div>
              <div className="max-h-[620px] overflow-auto">
                <table className="crm-table min-w-[980px]">
                  <thead>
                    <tr>
                      <th>일자</th>
                      <th>담당자</th>
                      <th>상태</th>
                      <th>목표합계</th>
                      <th>결과합계</th>
                      <th>달성율</th>
                      <th>당일매출</th>
                      <th>수정일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDetailRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center">기록이 없습니다.</td>
                      </tr>
                    ) : (
                      visibleDetailRows.map((row) => (
                        <tr key={row.id}>
                          <td>{formatKoreanDate(row.work_date)}</td>
                          <td>
                            <span className="crm-row-main">{row.owner_name}</span> <span className="crm-row-sub">{row.owner_title || ""}</span>
                          </td>
                          <td>
                            <span className={`badge-premium ${row.is_outside_meeting ? "badge-warning" : "badge-success"}`}>
                              {row.is_outside_meeting ? "외근 제외" : "기록대상"}
                            </span>
                          </td>
                          <td>{totalGoal(row).toLocaleString()}건</td>
                          <td>{totalResult(row).toLocaleString()}건</td>
                          <td>{percent(totalResult(row), totalGoal(row))}%</td>
                          <td>{resultValue(row, "daily_sales").toLocaleString()}건</td>
                          <td>
                            {new Date(row.updated_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[14px] px-5 py-3 text-[13px] font-[780] text-white shadow-lg" style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
