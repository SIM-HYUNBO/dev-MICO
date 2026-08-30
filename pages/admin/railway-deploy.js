import { useEffect, useMemo, useRef, useState } from "react";
import Layout from "@/components/core/client/frames/layout";
import * as userInfo from "@/components/core/client/frames/userInfo";
import * as constants from "@/lib/constants";
import * as commonFunctions from "@/lib/commonFunctions";
import { useModal } from "@/components/core/client/brunnerMessageBox";
import Button from "@/components/core/client/ui/Button";
import Card from "@/components/core/client/ui/Card";
import Chip from "@/components/core/client/ui/Chip";
import Input from "@/components/core/client/ui/Input";
import {
  CheckCircle2,
  Circle,
  Copy,
  Database,
  GitBranch,
  KeyRound,
  Package,
  Play,
  RadioTower,
  Rocket,
  Server,
  ShieldCheck,
} from "lucide-react";

const steps = [
  { id: "account", labelKey: "stepAccount", icon: KeyRound },
  { id: "project", labelKey: "stepProject", icon: Rocket },
  { id: "database", labelKey: "stepDatabase", icon: Database },
  { id: "schema", labelKey: "stepSchema", icon: ShieldCheck },
  { id: "service", labelKey: "stepService", icon: Server },
  { id: "deploy", labelKey: "stepDeploy", icon: Package },
  { id: "redis", labelKey: "stepRedis", icon: RadioTower },
  { id: "health", labelKey: "stepHealth", icon: Play },
];


// 이 화면의 문구도 다른 화면과 같이 TB_COR_RESOURCE_TEXT 에서 읽는다.
// 키는 'adminRailwayDeploy' + 원래 키(첫 글자 대문자) 규칙으로 붙인다.
const resourceKeyOf = (key) => `adminRailwayDeploy${key.charAt(0).toUpperCase()}${key.slice(1)}`;

const textFor = (key, languageCode = "en-US") =>
  commonFunctions.getResourceByLanguage(resourceKeyOf(key), constants.resourceType.label, languageCode);

const dbEnvTemplate = [
  ["DATABASE_PUBLIC_URL", ""],
  ["DATABASE_URL", ""],
  ["PGDATA", "/var/lib/postgresql/data/pgdata"],
  ["PGDATABASE", "railway"],
  ["PGHOST", ""],
  ["PGPASSWORD", ""],
  ["PGPORT", "5432"],
  ["PGUSER", "postgres"],
  ["POSTGRES_DB", "railway"],
  ["POSTGRES_PASSWORD", ""],
  ["POSTGRES_USER", "postgres"],
  ["RAILWAY_DEPLOYMENT_DRAINING_SECONDS", "60"],
  ["SSL_CERT_DAYS", "820"],
];

const appEnvTemplate = [
  ["APP_ENCRYPTION_KEY", ""],
  ["CHAT_DB_POOL_MAX", "3"],
  ["DATABASE_URL", "${{Postgres.DATABASE_URL}}"],
  ["DB_CAPACITY_BYTES", ""],
  ["DB_POOL_MAX", "10"],
  ["DB_SCHEMA", ""],
  ["DB_SCHEMA_OWNED", "true"],
  ["HOST", "0.0.0.0"],
  ["KAKAO_CLIENT_SECRET", ""],
  ["KAKAO_REST_API_KEY", ""],
  ["MAIL_USER", ""],
  ["NEXT_PUBLIC_KAKAO_API_KEY", ""],
  ["NEXT_PUBLIC_TOSS_CLIENT_KEY", ""],
  ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", ""],
  ["NODE_ENV", "production"],
  ["PUSH_JOB_CONCURRENCY", "1"],
  ["PUSH_SEND_CONCURRENCY", "3"],
  ["R2_ACCESS_KEY_ID", ""],
  ["R2_ACCOUNT_ID", ""],
  ["R2_BUCKET_NAME", ""],
  ["R2_SECRET_ACCESS_KEY", ""],
  ["REDIS_URL", "${{Redis.REDIS_URL}}"],
  ["RESEND_API_KEY", ""],
  ["RESEND_FROM", ""],
  ["SSL_MODE", "require"],
  ["SYSTEM_CODE", "your_system_code"],
  ["TOSS_SECRET_KEY", ""],
  ["TXN_HISTORY_EXCLUDED_USERS", "admin,your_admin_id"],
  ["VAPID_PRIVATE_KEY", ""],
  ["VAPID_PUBLIC_KEY", ""],
];

const requiredAppEnvKeys = new Set(appEnvTemplate.map(([key]) => key));
// 설치 대상은 새로 만든 빈 저장소여야 한다. 템플릿 저장소 자신을 넣으면
// 초기 소스 생성이 템플릿을 덮어쓴다.
const LINE_BREAK = String.fromCharCode(10);
const TEMPLATE_REPO = "SIM-HYUNBO/brunner-template";
const requiredInputClassName = "border-[var(--brand-blue)]";
// 비어 있으면 붉고 굵게, 채워지면 평범하게. 눈으로 훑어 바로 찾게 한다.
const requiredBox = (value) => (
  String(value ?? "").trim() ? "border-[var(--brand-blue)]" : "border-2 border-[var(--danger)]"
);
// 사전 입력값 4개를 한 번에 붙여넣게 한다. 라벨이 붙은 줄은 라벨로,
// 라벨이 없는 줄은 값 모양으로 어느 칸인지 가려낸다.
const bulkFieldOrder = ["accountToken", "projectToken", "githubRepo", "githubToken"];
const bulkFieldLabelKeys = {
  accountToken: "railwayAccountToken",
  projectToken: "railwayProjectToken",
  githubRepo: "gitRepository",
  githubToken: "githubToken",
};
// 라벨을 placeholder 로만 보여주면 칸을 누르는 순간 사라져서, 어느 줄에 무엇을
// 넣는지 보면서 채울 수가 없다. 라벨만 실제 값으로 넣어 두고 값 자리는 비워 둔다.
// 값이 빈 줄은 파서가 그냥 건너뛰므로 아래 입력칸이 엉뚱하게 채워지지 않는다.
const bulkPasteTemplateLines = [
  "Railway Account Token:",
  "GitHub Repository:",
  "GitHub Token:",
];
const bulkPasteTemplate = bulkPasteTemplateLines.join(LINE_BREAK);
const githubTokenShape = /^(ghp_|gho_|ghu_|ghs_|ghr_|github_pat_)/;
const repoShape = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

// 스키마 이름은 따옴표 없이 SQL 에 박히는 식별자다. PostgreSQL 이 받아주는 글자만
// 남긴다 — 소문자·숫자·밑줄이고, 첫 글자는 숫자일 수 없다.
//
// 특히 하이픈을 조심해야 한다. my-schema 는 식별자가 아니라 "my 빼기 schema" 로
// 파싱된다. 쓰려면 따옴표로 감싸야 하는데, 그러면 참조하는 모든 자리에서 감싸야
// 하고 한 군데만 빠뜨리면 "테이블이 없다"로 나타난다. 아예 못 넣게 막는다.
const normalizeSchemaInput = (value) =>
  String(value || "")
    .toLowerCase()
    // 하이픈·공백·점을 친 사람은 구분자를 원한 것이다. 글자를 없애 myschema 로
    // 만들면 의도와 다른 이름이 조용히 만들어지므로 밑줄로 바꾼다.
    .replace(/[\s.\-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    // 식별자는 숫자로 시작할 수 없다. 밑줄로 시작하는 것은 허용된다.
    .replace(/^[0-9]+/, "")
    .slice(0, 63);

// 프로젝트명 하나만 정하면 나머지 이름이 따라오게 한다.
//
// 왜
//   DB 서비스·AP 서비스·스키마 이름을 따로 받으면 설치본마다 제각각이 되고,
//   Railway 목록에서 어느 프로젝트 것인지 이름만 보고는 알 수 없다. 프로젝트명을
//   접두어로 고정하면 목록이 그대로 정렬되고, 나중에 보고도 짝을 맞출 수 있다.
//   직접 고친 칸은 다시 덮지 않으므로, 예전 방식으로 따로 정하는 것도 그대로 된다.
const derivedNames = (projectName) => {
  const base = String(projectName || "").trim();
  return {
    postgresName: base ? `${base}_DB` : "",
    serviceName: base ? `${base}_AP` : "",
    redisName: base ? `${base}_REDIS` : "",
    schemaName: normalizeSchemaInput(base),
  };
};

const DEFAULT_PROJECT_NAME = "brunner-production";

// 저장소는 owner/repo 로 넣지만 브라우저 주소창을 통째로 복사해 오는 일이 잦다.
const normalizeRepo = (value) => {
  const trimmed = String(value || "").trim().replace(/\.git$/i, "").replace(/\/+$/, "");
  const fromUrl = trimmed.match(/github\.com[/:]([^/]+\/[^/]+)/i);
  return fromUrl ? fromUrl[1] : trimmed;
};

// "Github 저장소 (Class) 토큰" 처럼 저장소와 토큰이 한 라벨에 같이 나오는 일이
// 있어, 토큰인지 먼저 보고 그 다음에 어느 토큰인지 가른다.
const bulkFieldFromLabel = (label) => {
  const text = String(label || "").toLowerCase();
  const isGithub = /github|깃허브|깃헙/.test(text);
  const isRepo = /repo|repository|저장소|리포|リポジトリ/.test(text);
  const isToken = /token|토큰|トークン/.test(text);
  const isRailway = /railway|레일웨이/.test(text);
  const isAccount = /account|계정|アカウント/.test(text);
  const isProject = /project|프로젝트|プロジェクト/.test(text);
  if (isToken) {
    if (isGithub || isRepo || /classic|클래식/.test(text)) return "githubToken";
    if (isProject) return "projectToken";
    if (isAccount || isRailway) return "accountToken";
    return "";
  }
  if (isRepo || isGithub) return "githubRepo";
  if (isAccount) return "accountToken";
  if (isProject) return "projectToken";
  return "";
};

const parseBulkCredentials = (text) => {
  const parsed = {};
  const loose = [];
  String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const separator = line.search(/[:=\t]/);
      const label = separator > 0 ? line.slice(0, separator) : "";
      const value = (separator > 0 ? line.slice(separator + 1) : line).trim();
      if (!value) return;
      const field = label ? bulkFieldFromLabel(label) : "";
      if (field) {
        if (!parsed[field]) parsed[field] = field === "githubRepo" ? normalizeRepo(value) : value;
        return;
      }
      loose.push(value);
    });
  // 라벨 없이 값만 붙여넣은 경우. 모양이 분명한 것을 먼저 집어내고, 남은 것은
  // Railway 토큰으로 보고 적힌 순서대로 account, project 에 채운다.
  const remaining = [];
  loose.forEach((value) => {
    if (!parsed.githubToken && githubTokenShape.test(value)) {
      parsed.githubToken = value;
      return;
    }
    const repo = normalizeRepo(value);
    if (!parsed.githubRepo && repoShape.test(repo)) {
      parsed.githubRepo = repo;
      return;
    }
    remaining.push(value);
  });
  remaining.forEach((value) => {
    // 토큰에는 공백이 없다. 설명 문장 같은 줄이 토큰 칸에 들어가지 않게 거른다.
    if (/\s/.test(value)) return;
    if (!parsed.accountToken) parsed.accountToken = value;
    else if (!parsed.projectToken) parsed.projectToken = value;
  });
  return parsed;
};

// 뒤 단계에서는 토큰을 고칠 수 없으니, 제대로 들어왔는지 눈으로만 확인할 수
// 있게 앞뒤 몇 글자만 남기고 가린다.
const maskSecret = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= 12) return text.slice(0, 2) + "*".repeat(Math.max(text.length - 2, 0));
  return text.slice(0, 6) + "*".repeat(8) + text.slice(-4);
};

const generatedDbEnvKeys = new Set([
  "DATABASE_PUBLIC_URL",
  "DATABASE_URL",
  "PGHOST",
  "PGPASSWORD",
  "PGPORT",
  "POSTGRES_PASSWORD",
]);
const requiredDbEnvKeys = new Set(dbEnvTemplate.map(([key]) => key).filter((key) => !generatedDbEnvKeys.has(key)));

const toEnvObject = (rows) =>
  rows.reduce((acc, row) => {
    const key = row.key.trim();
    if (key) acc[key] = row.value;
    return acc;
  }, {});

const fromTemplate = (template) => template.map(([key, value]) => ({ key, value }));

const toJdbcDatabaseUrl = (url) => {
  if (!url) return "";
  try {
    const normalized = url.startsWith("jdbc:postgresql://")
      ? url.slice("jdbc:".length)
      : url.replace(/^postgres:\/\//, "postgresql://");
    const parsed = new URL(normalized);
    const port = parsed.port ? `:${parsed.port}` : "";
    return `jdbc:postgresql://${parsed.hostname}${port}${parsed.pathname}${parsed.search}`;
  } catch {
    if (url.startsWith("jdbc:postgresql://")) return url;
    if (url.startsWith("postgresql://")) return `jdbc:${url}`;
    if (url.startsWith("postgres://")) return `jdbc:postgresql://${url.slice("postgres://".length)}`;
    return url;
  }
};

const databaseCredentialsFromUrl = (url) => {
  try {
    const normalized = url?.replace(/^jdbc:postgresql:\/\//, "postgresql://").replace(/^postgres:\/\//, "postgresql://");
    const parsed = new URL(normalized);
    return {
      user: decodeURIComponent(parsed.username || ""),
      password: decodeURIComponent(parsed.password || ""),
    };
  } catch {
    return { user: "", password: "" };
  }
};

const performancePresets = {
  // 개발 환경은 규모 축의 맨 아래가 아니라 용도가 다르다. 인스턴스를 늘리면
  // 로그가 갈려 디버깅만 어려워지고, 정리 배치는 확인 중인 데이터를 지운다.
  development: {
    recommendedDbReplicas: "0",
    recommendedAppReplicas: "1",
    labelKey: "devPreset",
    hintKey: "devHint",
    values: {
      DB_POOL_MAX: "4",
      CHAT_DB_POOL_MAX: "2",
      PUSH_JOB_CONCURRENCY: "1",
      PUSH_SEND_CONCURRENCY: "2",
      LOG_SQL: "true",
      VERIFY_DYNAMIC_SQL_ON_START: "true",
      SYNC_REPO_DOCS_ON_START: "false",
      DB_RETENTION_RUN_ON_START: "false",
    },
  },
  small: {
    recommendedDbReplicas: "0",
    recommendedAppReplicas: "1",
    labelKey: "smallPreset",
    hintKey: "smallHint",
    values: {
      DB_POOL_MAX: "6",
      CHAT_DB_POOL_MAX: "2",
      PUSH_JOB_CONCURRENCY: "1",
      PUSH_SEND_CONCURRENCY: "3",
      LOG_SQL: "false",
      VERIFY_DYNAMIC_SQL_ON_START: "true",
      SYNC_REPO_DOCS_ON_START: "false",
    },
  },
  standard: {
    recommendedDbReplicas: "1",
    recommendedAppReplicas: "2",
    labelKey: "standardPreset",
    hintKey: "standardHint",
    values: {
      DB_POOL_MAX: "10",
      CHAT_DB_POOL_MAX: "3",
      PUSH_JOB_CONCURRENCY: "2",
      PUSH_SEND_CONCURRENCY: "5",
      LOG_SQL: "false",
      VERIFY_DYNAMIC_SQL_ON_START: "true",
      SYNC_REPO_DOCS_ON_START: "false",
    },
  },
  replicas: {
    recommendedDbReplicas: "1",
    recommendedAppReplicas: "3",
    labelKey: "replicasPreset",
    hintKey: "replicasHint",
    values: {
      DB_POOL_MAX: "8",
      CHAT_DB_POOL_MAX: "3",
      PUSH_JOB_CONCURRENCY: "2",
      PUSH_SEND_CONCURRENCY: "4",
      LOG_SQL: "false",
      VERIFY_DYNAMIC_SQL_ON_START: "true",
      SYNC_REPO_DOCS_ON_START: "false",
      DB_RETENTION_RUN_ON_START: "false",
    },
  },
};

// 필수 여부는 배지가 아니라 입력칸 테두리로 알린다. 배지는 채웠는지와 무관하게
// 늘 같은 모습이라 "무엇이 아직 비었는지" 를 알려주지 못했다.
function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="flex items-center gap-2 text-xs font-bold text-[var(--text-muted)]">
        {label}
      </span>
      <div className="mt-1">{children}</div>
      {hint ? <span className="mt-1 block text-xs leading-5 text-[var(--text-subtle)]">{hint}</span> : null}
    </label>
  );
}

function StepState({ state, t }) {
  if (state === "done") return <Chip tone="success">{t("done")}</Chip>;
  if (state === "running") return <Chip tone="brand">{t("running")}</Chip>;
  if (state === "error") return <Chip tone="danger">{t("check")}</Chip>;
  return <Chip tone="neutral">{t("ready")}</Chip>;
}

// 2단계부터는 1단계에서 받은 값을 다시 묻지 않는다. 무엇이 쓰이고 있는지만
// 읽기 전용으로 보여주고, 고칠 일이 있으면 1단계로 돌려보낸다.
function CredentialsSummary({ form, t, onEdit }) {
  const items = [
    { key: "accountToken", label: t("railwayAccountToken"), value: maskSecret(form.accountToken) },
    { key: "projectToken", label: `${t("railwayProjectToken")} (${t("optional")})`, value: maskSecret(form.projectToken) },
    { key: "githubRepo", label: t("gitRepository"), value: form.githubRepo },
    { key: "githubToken", label: t("githubToken"), value: maskSecret(form.githubToken) },
  ];
  return (
    <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-alt)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-extrabold text-[var(--text-muted)]">{t("stepAccount")}</span>
        <Button size="sm" variant="ghost" onClick={onEdit}>{t("goToStep1")}</Button>
      </div>
      <div className="mt-2 grid gap-1 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.key} className="flex items-center gap-2 text-xs leading-6">
            <span className="w-44 shrink-0 font-bold text-[var(--text-subtle)]">{item.label}</span>
            <span className={`truncate font-mono ${item.value ? "text-[var(--text)]" : "text-[var(--text-subtle)]"}`}>
              {item.value || t("notEnteredYet")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ServiceIdInput({ id, value, onChange, services, placeholder, disabled }) {
  return (
    <>
      <Input list={id} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} />
      <datalist id={id}>
        {services.map((service) => (
          <option key={service.id} value={service.id}>{service.name}</option>
        ))}
      </datalist>
    </>
  );
}

function ComboInput({ id, value, onChange, options, placeholder, disabled }) {
  return (
    <>
      <Input list={id} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} />
      <datalist id={id}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>{option.name}</option>
        ))}
      </datalist>
    </>
  );
}

function EnvEditor({ title, count, rows, onChange, serviceName, t, requiredKeys = new Set(), readOnlyKeys = new Set() }) {
  const updateRow = (index, field, value) => {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)));
  };

  // 행 수가 아니라 값이 들어있는 행을 센다 — 빈 값도 채워진 것처럼 보이던 문제.
  const filledCount = rows.filter((row) => row.key.trim() && String(row.value || "").trim()).length;

  const addRow = () => onChange([...rows, { key: "", value: "" }]);
  const removeRow = (index) => onChange(rows.filter((_, rowIndex) => rowIndex !== index));

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <div>
          <div className="text-sm font-extrabold">{title}</div>
          <div className="text-xs text-[var(--text-subtle)]">{serviceName} {t("serviceVariables")}</div>
        </div>
        <div className="flex items-center gap-2">
          <Chip tone={filledCount === count ? "success" : "warn"}>{filledCount}/{count}</Chip>
          <Button size="sm" variant="ghost" onClick={addRow}>{t("add")}</Button>
        </div>
      </div>
      <div className="max-h-[440px] overflow-auto">
        {rows.map((row, index) => (
          <div key={`${row.key}-${index}`} className="grid gap-2 border-b border-[var(--border)] p-3 last:border-b-0 md:grid-cols-[220px_minmax(0,1fr)_64px]">
            <Input
              value={row.key}
              onChange={(event) => updateRow(index, "key", event.target.value)}
              placeholder="KEY"
              readOnly={readOnlyKeys.has(row.key)}
              inputClassName={readOnlyKeys.has(row.key) ? "cursor-not-allowed opacity-80" : requiredKeys.has(row.key) ? requiredBox(row.value) : ""}
            />
            <Input
              type={/TOKEN|SECRET|PASSWORD|KEY/i.test(row.key) ? "password" : "text"}
              value={row.value}
              onChange={(event) => updateRow(index, "value", event.target.value)}
              placeholder={readOnlyKeys.has(row.key) ? t("generatedAfterRun") : "VALUE"}
              readOnly={readOnlyKeys.has(row.key)}
              inputClassName={readOnlyKeys.has(row.key) ? "cursor-not-allowed opacity-80" : requiredKeys.has(row.key) ? requiredBox(row.value) : ""}
            />
            <Button size="sm" variant="ghost" onClick={() => removeRow(index)}>{t("del")}</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function upsertEnvRows(rows, values) {
  const next = [...rows];
  Object.entries(values).forEach(([key, value]) => {
    const index = next.findIndex((row) => row.key === key);
    if (index >= 0) next[index] = { ...next[index], value };
    else next.push({ key, value });
  });
  return next;
}

const missingRequiredEnvKeys = (rows, requiredKeys) =>
  Array.from(requiredKeys).filter((key) => {
    const value = rows.find((row) => row.key === key)?.value;
    return !String(value || "").trim();
  });

const writableDbEnvVarsFromRows = (rows) => toEnvObject(rows.filter((row) => !generatedDbEnvKeys.has(row.key)));

const serviceText = (service) => {
  const instanceText = service.serviceInstances?.edges
    ?.map((edge) => edge.node?.source?.image)
    .filter(Boolean)
    .join(" ");
  return `${service.name || ""} ${instanceText || ""}`;
};

export default function RailwayDeployWizard() {
  const { BrunnerMessageBox, openOkCancelModal } = useModal();
  const initialLanguageCode = userInfo.getCurrentLanguageCode?.() || "en-US";
  const [languageCode, setLanguageCode] = useState(initialLanguageCode);
  const [active, setActive] = useState(0);
  const [running, setRunning] = useState("");
  const [stepState, setStepState] = useState({});
  const [logs, setLogs] = useState([]);
  const [resultDialog, setResultDialog] = useState(null);
  const [deployment, setDeployment] = useState(null);
  // 6단계는 저장소에 브랜치가 있어야 한다. 초기 소스 생성을 눌렀는지 기억해
  // 안 눌렀으면 배포 전에 막고 알려준다.
  const [scaffoldDone, setScaffoldDone] = useState(false);
  // 이번 실행에서 저장소를 붙였는지. 붙이기 전에는 빌드가 걸리지 않으므로
  // 6단계가 "진행 중인 배포"를 오래 기다릴 이유가 없다.
  const [sourceAttached, setSourceAttached] = useState(false);
  // 데이터베이스가 접속을 받기까지 기다리는 중임을 화면에 보여준다.
  const [dbWaiting, setDbWaiting] = useState(null);
  // state 갱신을 기다리는 사이 두 번째 호출이 들어가는 것을 막는다.
  const scaffoldInFlight = useRef(false);
  // 한 단계는 API 호출 여러 개로 이루어진다. callApi 가 호출마다 running 을
  // 비우기 때문에 그 틈에 버튼이 다시 눌렸다. 단계 전체가 끝날 때까지 잠근다.
  const [stepBusy, setStepBusy] = useState(false);
  // 배포가 끝나기를 기다리는 중인지. 그동안 안에서 도는 조회 호출(상태 폴링,
  // 로그 조회)이 단계 상태를 건드리면 안 된다. 조회가 성공한 것과 빌드가 끝난
  // 것은 다른 얘기인데, 폴링마다 done 을 찍어 빌드 중에 화면이 성공으로 보였다.
  const watchingRef = useRef(0);
  const [watching, setWatching] = useState(false);
  const beginWatch = () => {
    watchingRef.current += 1;
    setWatching(true);
  };
  const endWatch = () => {
    watchingRef.current = Math.max(0, watchingRef.current - 1);
    setWatching(watchingRef.current > 0);
  };
  const [buildLogLines, setBuildLogLines] = useState([]);
  const [projects, setProjects] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [projectServices, setProjectServices] = useState([]);
  const [projectEnvironments, setProjectEnvironments] = useState([]);
  const [dbEnvRows, setDbEnvRows] = useState(fromTemplate(dbEnvTemplate));
  const [appEnvRows, setAppEnvRows] = useState(fromTemplate(appEnvTemplate));
  const [performancePreset, setPerformancePreset] = useState("standard");
  // 사전 입력값 4개를 한 번에 받는 칸. 여기에 붙여넣으면 아래 입력칸이 바로 찬다.
  const [bulkPaste, setBulkPaste] = useState(bulkPasteTemplate);
  // Redis 를 만든 뒤 앱이 다시 뜨는 동안 무슨 일이 벌어지는지 화면에 보여준다.
  const [appRedeploy, setAppRedeploy] = useState(null);
  // 기동 확인이 한 번 보고 실패로 끊지 않고 몇 번 다시 보는 중임을 알린다.
  const [verifyWaiting, setVerifyWaiting] = useState(null);
  const [form, setForm] = useState({
    accountToken: "",
    projectToken: "",
    workspaceId: "",
    projectMode: "new",
    projectId: "",
    projectName: DEFAULT_PROJECT_NAME,
    projectDescription: textFor("defaultProjectDescription", initialLanguageCode),
    environmentId: "",
    postgresServiceId: "",
    postgresName: derivedNames(DEFAULT_PROJECT_NAME).postgresName,
    dbReadReplicas: "0",
    appReplicas: "1",
    databaseUrl: "",
    schemaName: derivedNames(DEFAULT_PROJECT_NAME).schemaName,
    systemCode: "00",
    // 설치된 사이트가 로고 대신 보여줄 이름. 비워두면 프로젝트명을 쓴다.
    brandName: "",
    serviceId: "",
    serviceName: derivedNames(DEFAULT_PROJECT_NAME).serviceName,
    githubRepo: "",
    githubBranch: "main",
    githubToken: "",
    serviceDomain: "",
    redisEnabled: true,
    redisServiceId: "",
    redisName: derivedNames(DEFAULT_PROJECT_NAME).redisName,
    redisUrl: "${{Redis.REDIS_URL}}",
    packageName: "brunner-template",
    healthUrl: "",
  });

  const dbEnvVars = useMemo(() => {
    return writableDbEnvVarsFromRows(dbEnvRows);
  }, [dbEnvRows]);

  const appEnvVars = useMemo(() => {
    const vars = toEnvObject(appEnvRows);
    if (form.databaseUrl) vars.DATABASE_URL = form.databaseUrl;
    if (form.schemaName) vars.DB_SCHEMA = form.schemaName;
    if (form.systemCode) {
      vars.SYSTEM_CODE = form.systemCode;
    }
    // 마법사로 만든 시스템은 자기 스키마의 주인이다. 이 값이 없으면 배포 때
    // DDL 적용이 통째로 건너뛰어져 DB 가 갱신되지 않는다.
    vars.DB_SCHEMA_OWNED = "true";
    if (form.redisEnabled && form.redisUrl) vars.REDIS_URL = form.redisUrl;
    // ${{Postgres.*}} 처럼 고정된 서비스명으로 두면 실제 만든 서비스명과 어긋나
    // 참조가 풀리지 않는다. 입력한 서비스명으로 바꿔 준다.
    if (/^[$][{][{][^.]+[.]DATABASE_URL[}][}]$/.test(String(vars.DATABASE_URL || "")) && form.postgresName) {
      vars.DATABASE_URL = `\${{${form.postgresName}.DATABASE_URL}}`;
    }
    if (/^[$][{][{][^.]+[.]REDIS_URL[}][}]$/.test(String(vars.REDIS_URL || "")) && form.redisName) {
      vars.REDIS_URL = `\${{${form.redisName}.REDIS_URL}}`;
    }
    return vars;
  }, [appEnvRows, form.databaseUrl, form.postgresName, form.redisEnabled, form.redisName, form.redisUrl, form.schemaName, form.systemCode]);
  const filledDbEnvCount = useMemo(
    () => Array.from(requiredDbEnvKeys).filter((key) => String(dbEnvVars[key] || "").trim()).length,
    [dbEnvVars],
  );
  const jdbcDatabaseUrl = useMemo(() => toJdbcDatabaseUrl(form.databaseUrl), [form.databaseUrl]);
  const databaseCredentials = useMemo(() => {
    const vars = toEnvObject(dbEnvRows);
    const parsed = databaseCredentialsFromUrl(form.databaseUrl);
    return {
      user: vars.PGUSER || vars.POSTGRES_USER || parsed.user || "postgres",
      password: vars.PGPASSWORD || vars.POSTGRES_PASSWORD || parsed.password,
    };
  }, [dbEnvRows, form.databaseUrl]);

  // 키 존재만 세면 APP_ENCRYPTION_KEY 처럼 값이 빈 항목까지 "채워짐"으로 보인다.
  // 값이 실제로 들어있는 것만 센다.
  const requiredAppEnvCount = useMemo(
    () => Object.keys(appEnvVars).filter((key) => requiredAppEnvKeys.has(key) && String(appEnvVars[key] || "").trim()).length,
    [appEnvVars],
  );
  const postgresServices = useMemo(
    () => projectServices.filter((service) => /postgres|postgresql|database|\bdb\b/i.test(serviceText(service))),
    [projectServices],
  );
  const redisServices = useMemo(
    () => projectServices.filter((service) => /redis/i.test(serviceText(service))),
    [projectServices],
  );
  const appServices = useMemo(
    () => projectServices.filter((service) => !/postgres|postgresql|database|\bdb\b|redis/i.test(serviceText(service))),
    [projectServices],
  );

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  // 사용자가 직접 고친 이름 칸. 프로젝트명이 바뀌어도 이 칸은 덮지 않는다.
  const manualNamesRef = useRef(new Set());
  const derivedNameKeys = ["postgresName", "serviceName", "redisName", "schemaName"];

  const updateProjectName = (value, options = {}) => {
    const forceDerived = Boolean(options.forceDerived);
    setForm((prev) => {
      const next = { ...prev, projectName: value };
      const derived = derivedNames(value);
      for (const key of derivedNameKeys) {
        if (forceDerived || !manualNamesRef.current.has(key)) next[key] = derived[key];
      }
      return next;
    });
  };

  const updateDerivedName = (key, value) => {
    manualNamesRef.current.add(key);
    update(key, value);
  };
  const t = (key) => textFor(key, languageCode);

  const bulkParsed = useMemo(() => parseBulkCredentials(bulkPaste), [bulkPaste]);
  const bulkFilledLabels = bulkFieldOrder.filter((key) => bulkParsed[key]).map((key) => t(bulkFieldLabelKeys[key]));

  // 붙여넣기 칸이 바뀔 때마다 알아본 값만 골라 아래 입력칸에 반영한다. 알아보지
  // 못한 항목은 건드리지 않아, 직접 고쳐 둔 값이 지워지지 않는다.
  const applyBulkPaste = (text) => {
    setBulkPaste(text);
    const parsed = parseBulkCredentials(text);
    const keys = Object.keys(parsed);
    if (!keys.length) return;
    setForm((prev) => {
      const next = { ...prev };
      keys.forEach((key) => {
        next[key] = parsed[key];
      });
      return next;
    });
  };

  const updateDbEnvRows = (rows) => {
    setDbEnvRows(rows);
    const databaseUrl = rows.find((row) => row.key === "DATABASE_PUBLIC_URL")?.value || "";
    if (databaseUrl !== form.databaseUrl) update("databaseUrl", databaseUrl);
  };

  useEffect(() => {
    setLanguageCode(userInfo.getCurrentLanguageCode() || "en-US");
  }, []);

  const applyPerformancePreset = (presetKey) => {
    const preset = performancePresets[presetKey];
    if (!preset) return;
    setPerformancePreset(presetKey);
    // 다른 프리셋에만 있는 키는 지운다. 안 지우면 복제 운영 → 소형으로 바꿔도
    // DB_RETENTION_RUN_ON_START 가 남아 선택한 프리셋과 다른 설정이 배포된다.
    const otherPresetOnlyKeys = Object.entries(performancePresets)
      .filter(([key]) => key !== presetKey)
      .flatMap(([, other]) => Object.keys(other.values))
      .filter((key) => !(key in preset.values));
    setAppEnvRows((rows) => upsertEnvRows(rows.filter((row) => !otherPresetOnlyKeys.includes(row.key)), preset.values));
    if (preset.recommendedAppReplicas) update("appReplicas", preset.recommendedAppReplicas);
    if (preset.recommendedDbReplicas) update("dbReadReplicas", preset.recommendedDbReplicas);
    if (presetKey === "development") update("redisEnabled", false);
    if (presetKey === "replicas") {
      update("redisEnabled", true);
      if (!form.redisUrl) update("redisUrl", "${{Redis.REDIS_URL}}");
    }
    appendLog("success", "applyPerformancePreset", `${t(preset.labelKey)}: ${t(preset.hintKey)}`);
  };

  // 배포는 몇 분 걸린다. 끝날 때까지 상태를 주기적으로 확인해 화면에 보여준다.
  const watchDeployment = async (deploymentId, stepId = "deploy", options = {}) => {
    beginWatch();
    try {
      return await watchDeploymentInner(deploymentId, stepId, options);
    } finally {
      endWatch();
    }
  };

  const watchDeploymentInner = async (deploymentId, stepId, { silent = false, label = "", serviceId = "" } = {}) => {
    appendLog("success", "watchDeployment", `${label || stepId}: ${deploymentId}`);
    // 앞선 호출이 done 을 찍어 놨을 수 있다. 빌드가 도는 동안은 실행 중이어야 한다.
    setStepState((prev) => ({ ...prev, [stepId]: "running" }));
    // REMOVED / SKIPPED 는 실패가 아니라 "이 배포는 다른 배포로 대체됐다" 는
    // 뜻이다. 서비스를 만들고 곧바로 볼륨을 붙이면 Railway 가 첫 배포를 버리고
    // 새로 건다. 그것을 실패로 보면 정상 생성이 계속 빨간 상태가 된다.
    const superseded = new Set(["REMOVED", "SKIPPED"]);
    const finished = new Set(["SUCCESS", "FAILED", "CRASHED"]);
    let retargets = 0;
    let supersededRounds = 0;
    let lastSeenStatus = "";
    let missingStatusCount = 0;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      const data = await callApi("deploymentStatus", { deploymentId }, stepId, { silent: true });
      const status = data?.deployment?.status;
      if (!status) {
        missingStatusCount += 1;
        if (missingStatusCount >= 6) {
          appendLog("error", "deploymentStatus", t("deploymentGone"));
          showResult("error", t("missingTitle"), t("deploymentGone"));
          setStepState((prev) => ({ ...prev, [stepId]: "error" }));
          setDeployment({ id: deploymentId, status: "UNKNOWN" });
          return false;
        }
        continue;
      }
      missingStatusCount = 0;
      setDeployment({ id: deploymentId, status });
      lastSeenStatus = status;
      if (superseded.has(status)) {
        // 이 서비스에서 지금 실제로 도는 배포로 갈아탄다.
        if (serviceId && retargets < 3) {
          retargets += 1;
          const current = await callApi("activeDeployment", {
            projectId: form.projectId,
            serviceId,
            environmentId: form.environmentId,
          }, stepId, { silent: true });
          const nextId = current?.deployment?.id;
          if (nextId && nextId !== deploymentId) {
            appendLog("success", "watchDeployment", `${label || stepId}: ${t("deploymentSuperseded")} -> ${nextId}`);
            deploymentId = nextId;
            missingStatusCount = 0;
            continue;
          }
        }
        supersededRounds += 1;
        if (supersededRounds >= 6) {
          appendLog("error", "deploymentStatus", t("supersededNotFound"));
          showResult("error", t("missingTitle"), t("supersededNotFound"));
          setStepState((prev) => ({ ...prev, [stepId]: "error" }));
          return false;
        }
        continue;
      }
      if (finished.has(status)) {
        appendLog(status === "SUCCESS" ? "success" : "error", "deploymentStatus", status);
        setStepState((prev) => ({ ...prev, [stepId]: status === "SUCCESS" ? "done" : "error" }));
        if (status !== "SUCCESS") {
          // 실패하면 원인을 찾으러 Railway 로 넘어가지 않아도 되게 로그를 가져온다.
          // 빌드에서 죽었는지 기동에서 죽었는지에 따라 봐야 할 로그가 다르다. 둘 다 가져온다.
          const buildData = await callApi("buildLogs", { deploymentId }, "deploy", { silent: true });
          const runData = await callApi("deploymentLogs", { deploymentId }, "deploy", { silent: true });
          const buildLines = (buildData?.logs || []).map((line) => line.message);
          const runLines = (runData?.logs || []).map((line) => line.message);
          if (!runLines.length && !buildLines.length) {
            showResult("error", t("verifyFailed"), `${label || stepId} ${status}` + LINE_BREAK + deploymentId + LINE_BREAK + LINE_BREAK + t("noDeployLogs"));
          }
          setBuildLogLines([
            ...(runLines.length ? ["=== 배포 로그 ===", ...runLines.slice(-60)] : []),
            ...(buildLines.length ? ["", "=== 빌드 로그 ===", ...buildLines.slice(-40)] : []),
          ]);
        }
        return status === "SUCCESS";
      }
    }
    // 예전에는 루프가 조용히 끝나 화면이 BUILDING 인 채로 영원히 남았다.
    // 결론이 안 났으면 안 났다고 말해준다.
    appendLog("error", "deploymentStatus", t("buildWatchTimeout"));
    showResult("error", t("missingTitle"), t("buildWatchTimeout") + LINE_BREAK + (lastSeenStatus || "unknown"));
    setStepState((prev) => ({ ...prev, [stepId]: "error" }));
    return false;
  };

  const appendLog = (type, title, detail) => {
    setLogs((prev) => [
      { id: `${Date.now()}-${Math.random()}`, type, title, detail, at: new Date().toLocaleTimeString() },
      ...prev,
    ]);
  };

  const showResult = (type, title, detail) => {
    setResultDialog({ type, title, detail, at: new Date().toLocaleTimeString() });
  };

  const projectTokenActions = new Set([
    "listServices",
    "listProjectServices",
    "createPostgres",
    "getVariables",
    "upsertVariables",
    "ensureTcpProxy",
    "createNextService",
    "attachServiceSource",
    "deployService",
    "createRedis",
  ]);

  const callApi = async (action, body = {}, stepId = steps[active].id, options = {}) => {
    setRunning(action);
    setStepState((prev) => ({ ...prev, [stepId]: "running" }));
    // 지켜보는 중이면 결론은 watchDeployment 가 낸다. 여기서 done/error 를 찍지 않는다.
    const holdState = Boolean(options.keepRunning) || watchingRef.current > 0;
    // 실패했을 때 어떤 토큰을 썼는지 알아야 안내를 붙일 수 있어 try 밖에 둔다.
    const useProjectToken = options.tokenType
      ? options.tokenType === "project"
      : projectTokenActions.has(action) && Boolean(form.projectToken);
    const token = String((useProjectToken ? form.projectToken : form.accountToken) || "").trim();
    try {
      const response = await fetch("/api/admin/railwayDeploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          token,
          tokenType: useProjectToken ? "project" : "account",
          userId: userInfo.getLoginUserId?.() || "",
          sessionToken: userInfo.getLoginSessionToken?.() || "",
          ...body,
        }),
      });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.error || "Task failed.");
      // 배포는 API 가 배포 ID 만 돌려주고 실제 빌드는 그 뒤로 몇 분을 더 돈다.
      // 그때 done 을 찍으면 빌드 중인데 화면은 성공으로 보인다. 지켜볼 일이
      // 남은 호출은 watchDeployment 가 끝에서 결과를 찍게 두고 여기서는 건너뛴다.
      if (!holdState) {
        setStepState((prev) => ({ ...prev, [stepId]: "done" }));
      }
      const detail = JSON.stringify(payload.data, null, 2);
      appendLog("success", action, detail);
      if (!options.silent) showResult("success", action, detail);
      return payload.data;
    } catch (error) {
      if (!holdState) setStepState((prev) => ({ ...prev, [stepId]: "error" }));
      // Railway 가 돌려주는 문장만으로는 무엇을 고쳐야 할지 알 수 없다.
      // 삭제 대기 중인 프로젝트, 그리고 프로젝트 토큰의 Not Authorized 는
      // 원인이 정해져 있으므로 무엇을 하면 되는지 붙여 준다.
      const message = error.message || "";
      const hint = /pending deletion/i.test(message)
        ? LINE_BREAK + LINE_BREAK + t("projectPendingDeletion")
        : useProjectToken && /not authorized/i.test(message)
          ? LINE_BREAK + LINE_BREAK + t("projectTokenNotAuthorized")
          : "";
      appendLog("error", action, error.message + hint);
      if (!options.silent) showResult("error", action, error.message + hint);
      return null;
    } finally {
      setRunning("");
    }
  };

  // 스캐폴드는 저장소에 커밋을 민다 = 빌드를 만든다. 한 번만 돌게 한다.
  const runScaffold = async () => {
    if (scaffoldDone || scaffoldInFlight.current) {
      showResult("error", t("missingTitle"), t("scaffoldAlreadyDone"));
      return false;
    }
    scaffoldInFlight.current = true;
    try {
      const done = await callApi("scaffoldRepository", {
        githubToken: form.githubToken.trim(),
        githubRepo: form.githubRepo.trim(),
        githubBranch: form.githubBranch.trim(),
        siteUrl: form.serviceDomain ? `https://${form.serviceDomain}` : "",
      }, "service", { tokenType: "account" });
      if (done) setScaffoldDone(true);
      return Boolean(done);
    } finally {
      scaffoldInFlight.current = false;
    }
  };

  const waitForDatabase = async (databaseUrl, stepId = "database") => {
    const attempts = 12;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const data = await callApi("testDatabase", { databaseUrl }, stepId, { silent: true });
      if (data?.connected) {
        appendLog("success", "waitForDatabase", `${t("dbReadyAfter")} ${attempt}`);
        return true;
      }
      setDbWaiting({ attempt, attempts });
      appendLog("success", "waitForDatabase", `${t("dbProvisioning")} (${attempt}/${attempts})`);
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    setDbWaiting(null);
    setStepState((prev) => ({ ...prev, [stepId]: "error" }));
    showResult("error", t("missingTitle"), t("dbNeverReady"));
    return false;
  };

  const loadProjectServices = async (projectId) => {
    if (!projectId) {
      setProjectServices([]);
      return [];
    }
    const data = await callApi("listServices", { projectId }, "project", { silent: true });
    const services = data?.services || [];
    setProjectServices(services);
    return services;
  };

  const refreshProjectServices = async () => {
    const services = await loadProjectServices(form.projectId);
    if (form.postgresServiceId) {
      await selectPostgresService(form.postgresServiceId);
    } else {
      const databaseServices = services.filter((service) => /postgres|postgresql|database|\bdb\b/i.test(serviceText(service)));
      if (databaseServices.length === 1) await selectPostgresService(databaseServices[0].id);
    }
  };

  const loadProjectEnvironments = async (projectId) => {
    if (!projectId) {
      setProjectEnvironments([]);
      return [];
    }
    const data = await callApi("listEnvironments", { projectId }, "project", { silent: true });
    const environments = data?.environments || [];
    setProjectEnvironments(environments);
    const preferred = environments.find((environment) => /production/i.test(environment.name || "")) || environments[0];
    // 예전에는 값이 있으면 건드리지 않았다. 그래서 프로젝트를 바꿔도 이전
    // 프로젝트의 환경 ID 가 남아 serviceCreate 가 Not Authorized 로 죽었다.
    // 지금 프로젝트에 속한 환경인지 확인해서 아니면 기본 환경으로 바꾼다.
    const belongsToProject = environments.some((environment) => environment.id === form.environmentId);
    if (!belongsToProject) {
      const nextId = preferred?.id || "";
      if (form.environmentId && nextId) showResult("success", "environment", t("envMismatch"));
      update("environmentId", nextId);
    }
    return environments;
  };

  const loadProjectContext = async (projectId) => {
    await loadProjectEnvironments(projectId);
    await loadProjectServices(projectId);
  };

  const applyDatabaseVariables = (variables = {}) => {
    const nextRows = dbEnvRows.map((row) => (
      Object.prototype.hasOwnProperty.call(variables, row.key) ? { ...row, value: variables[row.key] || "" } : row
    ));
    setDbEnvRows(nextRows);
    update("databaseUrl", variables.DATABASE_PUBLIC_URL || "");
    return nextRows;
  };

  const selectPostgresService = async (serviceId) => {
    update("postgresServiceId", serviceId);
    if (!serviceId || !form.projectId || !form.environmentId) return;
    const data = await callApi("getVariables", {
      projectId: form.projectId,
      environmentId: form.environmentId,
      serviceId,
    }, "database", { silent: true });
    const nextRows = applyDatabaseVariables(data?.variables || {});
    await callApi("upsertVariables", {
      projectId: form.projectId,
      environmentId: form.environmentId,
      serviceId,
      variables: writableDbEnvVarsFromRows(nextRows),
    }, "database", { silent: true });
    await callApi("ensureTcpProxy", {
      environmentId: form.environmentId,
      serviceId,
      applicationPort: 5432,
    }, "database", { silent: true });
    const refreshed = await callApi("getVariables", {
      projectId: form.projectId,
      environmentId: form.environmentId,
      serviceId,
    }, "database", { silent: true });
    applyDatabaseVariables(refreshed?.variables || data?.variables || {});
  };

  const testDatabaseConnection = async () => {
    if (!form.databaseUrl) {
      const detail = "DATABASE_PUBLIC_URL is required for connection testing.";
      appendLog("error", "testDatabase", detail);
      showResult("error", "testDatabase", detail);
      return;
    }
    setDbWaiting({ attempt: 1, attempts: 12 });
    const ready = await waitForDatabase(form.databaseUrl, "database");
    setDbWaiting(null);
    if (ready) showResult("success", t("dbReady"), form.databaseUrl.replace(/:[^@/]+@/, ":***@"));
  };

  // Railway 가 변수 변경으로 새 배포를 거는 데 몇 초 걸린다. 활성 배포 ID 가 옛것과
  // 달라질 때까지 지켜본다. 끝내 안 바뀌면 재배포가 없었던 것으로 보고 넘어간다 —
  // 여기서 막으면 이미 Redis 참조를 들고 있는 서비스까지 못 지나간다.
  const waitForNewDeployment = async (serviceId, beforeDeploymentId, attempts = 12) => {
    beginWatch();
    try {
      return await waitForNewDeploymentInner(serviceId, beforeDeploymentId, attempts);
    } finally {
      endWatch();
    }
  };

  const waitForNewDeploymentInner = async (serviceId, beforeDeploymentId, attempts) => {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      setAppRedeploy({ phase: "detecting", attempt, attempts });
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const data = await callApi("activeDeployment", {
        projectId: form.projectId,
        serviceId,
        environmentId: form.environmentId,
      }, "redis", { silent: true });
      const id = data?.deployment?.id || "";
      if (id && id !== beforeDeploymentId) return id;
    }
    return "";
  };

  const copyDatabaseUrl = async (value = form.databaseUrl, label = "DATABASE_URL") => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    appendLog("success", "copyDatabaseUrl", `${label} copied to clipboard.`);
  };

  // 실행 전에 빠진 것을 미리 잡는다. blockers 는 실행을 막고, warnings 는
  // 막지 않지만 반드시 알린다 — 모르고 다음 단계로 넘어가면 훨씬 뒤에서
  // 엉뚱한 오류로 나타나기 때문이다.
  const stepIssues = (stepId) => {
    const blockers = [];
    const warnings = [];
    const repo = String(form.githubRepo || "").trim();
    if (stepId === "account") {
      if (!String(form.accountToken || "").trim()) blockers.push(t("needAccountToken"));
      // 저장소와 GitHub 토큰은 5단계에서 읽기 전용으로 쓰인다. 여기서 비워 두면
      // 한참 뒤에 가서야 알게 되므로, 막지는 않고 지금 알려 준다.
      if (!repo) warnings.push(t("needRepo"));
      if (!String(form.githubToken || "").trim()) warnings.push(t("needGithubToken"));
    }
    if (stepId === "project") {
      if (!form.workspaceId) blockers.push(t("needWorkspace"));
      if (form.projectMode === "new") {
        const name = String(form.projectName || "").trim();
        if (!name) blockers.push(t("needProjectName"));
        else if (projects.some((project) => project.name === name)) blockers.push(t("nameTakenReuse"));
      } else if (!form.projectId) {
        blockers.push(t("needProjectId"));
      }
    }
    if (stepId === "database" && !form.projectId) blockers.push(t("needProjectId"));
    if (stepId === "schema") {
      if (!String(form.databaseUrl || "").trim()) blockers.push(t("needDatabaseUrl"));
      if (!String(form.schemaName || "").trim() || !String(form.systemCode || "").trim()) blockers.push(t("needSchemaFields"));
    }
    if (stepId === "service") {
      const repoParts = repo.split("/");
      const repoShaped = repoParts.length === 2 && repoParts.every((part) => /^[A-Za-z0-9_.-]+$/.test(part));
      if (!repoShaped) blockers.push(t("needRepo"));
      else if (repo.toLowerCase() === TEMPLATE_REPO.toLowerCase()) blockers.push(t("repoIsTemplate"));
      // 실행이 초기 소스 생성까지 하므로 토큰이 없으면 시작할 수 없다.
      if (!String(form.githubToken || "").trim()) blockers.push(t("needGithubToken"));
    }
    if (stepId === "deploy") {
      if (!form.serviceId) blockers.push(t("needServiceId"));
      if (!scaffoldDone) blockers.push(t("needScaffoldFirst"));
    }
    // 서비스 URL 은 비어 있어도 막지 않는다. 실행할 때 Railway 에서 조회해 채운다.
    if (stepId === "health" && !String(form.healthUrl || "").trim() && !form.serviceId) blockers.push(t("needServiceId"));
    return { blockers, warnings };
  };

  // 다음 으로 그냥 넘어가더라도 빠진 것은 알려준다.
  const goToStep = (nextIndex) => {
    const currentStep = steps[active].id;
    const { blockers, warnings } = stepIssues(currentStep);
    const movingForward = nextIndex > active;
    const navBlockers = [...blockers];
    if (currentStep === "service" && !scaffoldDone) navBlockers.push(t("needScaffoldFirst"));
    // 프로젝트 토큰은 3단계(PostgreSQL)부터 쓰인다. 없이 넘어가면 다음 단계가
    // 계정 토큰으로 시도하다 권한에서 막히는데, 그때는 무엇이 빠졌는지 알기 어렵다.
    //
    // 다만 stepIssues 에 넣으면 안 된다. 그러면 2단계 "실행"까지 막혀 프로젝트를
    // 만들 수 없고, 토큰은 프로젝트가 있어야 발급되므로 교착이 된다. 프로젝트를
    // 만든 뒤 앞으로 나가려 할 때만 막는다.
    if (
      currentStep === "project" &&
      movingForward &&
      form.projectId &&
      !String(form.projectToken || "").trim()
    ) {
      navBlockers.push(t("needProjectToken"));
    }
    if (movingForward && navBlockers.length) {
      showResult("error", t("missingTitle"), navBlockers.join(LINE_BREAK));
      return;
    }
    const messages = [...navBlockers, ...warnings];
    if (messages.length) showResult("error", t("missingTitle"), messages.join(LINE_BREAK));
    setActive(nextIndex);
  };

  const runCurrentStep = async () => {
    if (stepBusy) return;
    const stepId = steps[active].id;
    setStepBusy(true);
    try {
      await runCurrentStepInner();
    } catch (error) {
      // 예외로 빠져나가면 상태가 실행 중인 채로 남는다. 실패로 표시하고 알린다.
      appendLog("error", stepId, error?.message || String(error));
      showResult("error", t("missingTitle"), error?.message || String(error));
      setStepState((prev) => ({ ...prev, [stepId]: "error" }));
    } finally {
      setStepBusy(false);
      // 어떤 경로로 끝났든 실행 중 상태로 묶여 있지 않게 한다.
      setStepState((prev) => (prev[stepId] === "running" ? { ...prev, [stepId]: "error" } : prev));
    }
  };

  // 프로젝트가 만들어졌어도 토큰이 없으면 다음 단계로 넘기지 않는다.
  // 3단계(PostgreSQL)부터 그 토큰을 쓰므로, 넘어간 뒤에 막히면 무엇이 빠졌는지
  // 알기 어렵다. 토큰을 발급할 프로젝트가 방금 생긴 이 자리에서 붙잡는다.
  // 빌드가 도는 중인지. 배포 단계가 실행 중이고 지켜보는 배포가 잡혀 있으면
  // 그 사이에 실행·다음 버튼이 눌리지 않게 하고, 무엇을 기다리는지 밝힌다.
  const buildInProgress =
    watching ||
    (Boolean(deployment?.id) &&
      !["SUCCESS", "FAILED", "CRASHED", "UNKNOWN"].includes(deployment?.status || "") &&
      stepState.deploy === "running");

  const advanceFromProject = () => {
    if (!String(form.projectToken || "").trim()) {
      showResult("error", t("missingTitle"), t("needProjectToken"));
      return;
    }
    setActive(2);
  };

  const runCurrentStepInner = async () => {
    const step = steps[active].id;
    const { blockers, warnings } = stepIssues(step);
    if (blockers.length) {
      setStepState((prev) => ({ ...prev, [step]: "error" }));
      showResult("error", t("missingTitle"), blockers.join(LINE_BREAK));
      return;
    }
    if (warnings.length) showResult("error", t("missingTitle"), warnings.join(LINE_BREAK));

    if (step === "account") {
      const data = await callApi("validateToken", {}, "account", { tokenType: "account" });
      if (data) {
        // 워크스페이스를 먼저 정해야 프로젝트 목록이 나온다.
        const workspaceData = await callApi("listWorkspaces", {}, "account", { silent: true });
        const loadedWorkspaces = workspaceData?.workspaces || [];
        setWorkspaces(loadedWorkspaces);
        const workspaceId = form.workspaceId || loadedWorkspaces[0]?.id || "";
        if (workspaceId && workspaceId !== form.workspaceId) update("workspaceId", workspaceId);
        const list = await callApi("listProjects", { workspaceId }, "account");
        setProjects(list?.projects || []);
        setActive(1);
      }
    }

    if (step === "project") {
      if (form.projectMode === "new") {
        const confirmed = await openOkCancelModal(
          t("createProjectConfirm"),
          constants.messageCategory.Confirm,
        ).catch(() => false);
        if (!confirmed) return;

        const data = await callApi("createProject", {
          projectName: form.projectName,
          projectDescription: form.projectDescription,
          workspaceId: form.workspaceId,
        });
        const project = data?.projectCreate;
        // 서버가 이름이 같은 기존 프로젝트를 돌려줬을 수 있다. 새로 만든 줄
        // 알고 진행하면 뒤 단계가 남의 프로젝트를 건드린다.
        if (data?.reused) showResult("error", t("missingTitle"), t("reusedProject"));
        if (project?.id) update("projectId", project.id);
        if (project?.id) {
          await loadProjectContext(project.id);
          advanceFromProject();
        }
      } else if (form.projectId) {
        setStepState((prev) => ({ ...prev, project: "done" }));
        appendLog("success", "selectProject", form.projectId);
        await loadProjectContext(form.projectId);
        advanceFromProject();
      }
    }

    if (step === "database") {
      let postgresServiceId = form.postgresServiceId;
      if (!form.projectId) {
        setStepState((prev) => ({ ...prev, database: "error" }));
        const detail = "Project ID is required before creating a PostgreSQL service.";
        appendLog("error", "database", detail);
        showResult("error", "database", detail);
        return;
      }
      if (!form.environmentId) {
        setStepState((prev) => ({ ...prev, database: "error" }));
        const detail = "Railway environment ID is required before creating a PostgreSQL service.";
        appendLog("error", "database", detail);
        showResult("error", "database", detail);
        return;
      }
      if (form.projectId && !postgresServiceId) {
        const data = await callApi("createPostgres", {
          projectId: form.projectId,
          environmentId: form.environmentId,
          postgresName: form.postgresName,
          readReplicaCount: Number(form.dbReadReplicas) || 0,
        });
        const createdService = data?.pluginCreate;
        postgresServiceId = createdService?.id || "";
        if (!postgresServiceId) return;
        if (postgresServiceId) update("postgresServiceId", postgresServiceId);
        // plugin 이 만들어 주던 비밀번호를 이제 서버가 만든다. 화면에도 실어 둬야
        // 사용자가 접속 정보를 알 수 있다.
        if (data?.databasePublicUrl) {
          update("databaseUrl", data.databasePublicUrl);
          setDbEnvRows((rows) => upsertEnvRows(rows, {
            DATABASE_PUBLIC_URL: data.databasePublicUrl,
            DATABASE_URL: data.databaseUrl || "",
            PGHOST: data.proxyDomain || "",
            PGPORT: String(data.proxyPort || 5432),
          }));
        }
        if (data?.generatedPassword) {
          setDbEnvRows((rows) => upsertEnvRows(rows, {
            PGPASSWORD: data.generatedPassword,
            POSTGRES_PASSWORD: data.generatedPassword,
          }));
          appendLog("success", "postgresPassword", t("generatedDbPassword"));
        }
        if (Number(form.dbReadReplicas) > 0) {
          await callApi("createPostgresReadReplicas", {
            projectId: form.projectId,
            environmentId: form.environmentId,
            postgresName: form.postgresName,
            readReplicaCount: Number(form.dbReadReplicas),
            postgresPassword: data?.generatedPassword || "",
          }, "database", { silent: true });
        }
        if (createdService?.id) {
          setProjectServices((services) => (
            services.some((service) => service.id === createdService.id) ? services : [createdService, ...services]
          ));
        }
        const dbDeploymentId = data?.deployed?.serviceInstanceDeployV2;
        if (typeof dbDeploymentId === "string") {
          setStepState((prev) => ({ ...prev, database: "running" }));
          const ok = await watchDeployment(dbDeploymentId, "database", { label: form.postgresName || "postgres", serviceId: postgresServiceId });
          if (!ok) return;
        }
        await loadProjectServices(form.projectId);
      }
      if (postgresServiceId && form.databaseUrl) {
        const missingKeys = missingRequiredEnvKeys(dbEnvRows, requiredDbEnvKeys);
        if (missingKeys.length) {
          setStepState((prev) => ({ ...prev, database: "error" }));
          const detail = `Missing required DB service variables: ${missingKeys.join(", ")}`;
          appendLog("error", "databaseVariables", detail);
          showResult("error", "databaseVariables", detail);
          return;
        }
        const savedVariables = await callApi("upsertVariables", {
          projectId: form.projectId,
          environmentId: form.environmentId,
          serviceId: postgresServiceId,
          variables: dbEnvVars,
        }, "database");
        if (!savedVariables) return;
      }
      if (form.databaseUrl) {
        setStepState((prev) => ({ ...prev, database: "running" }));
        const ready = await waitForDatabase(form.databaseUrl, "database");
        setDbWaiting(null);
        if (!ready) return;
      }
      setStepState((prev) => ({ ...prev, database: "done" }));
      showResult("success", "database", t("dbReady"));
      setActive(3);
    }

    if (step === "schema") {
      const data = await callApi("applySchema", {
        databaseUrl: form.databaseUrl,
        schemaName: form.schemaName,
        systemCode: form.systemCode,
        // 새 시스템은 아직 로고가 없다. 화면에 보일 이름을 심어 설치 직후부터
        // 자기 이름이 뜨게 한다. 따로 넣지 않았으면 프로젝트명을 쓴다.
        brandName: String(form.brandName || form.projectName || "").trim(),
      });
      if (data) {
        if (form.projectId && form.environmentId && form.serviceId) {
          await callApi("upsertVariables", {
            projectId: form.projectId,
            environmentId: form.environmentId,
            serviceId: form.serviceId,
            variables: appEnvVars,
          }, "schema", { silent: true });
        }
        setActive(4);
      }
    }

    if (step === "service") {
      let serviceId = "";
      // 서비스를 붙이기 전에 저장소를 채운다. 사용자가 버튼을 따로 누르지
      // 않아도 되고, 빌드도 한 번만 돈다.
      if (!scaffoldDone) {
        const scaffolded = await runScaffold();
        if (!scaffolded) return;
      }
      const data = await callApi("createNextService", {
        projectId: form.projectId,
        environmentId: form.environmentId,
        service: {
          name: form.serviceName,
          githubRepo: form.githubRepo,
          githubBranch: form.githubBranch,
        },
      }, "service", { silent: true });
      const service = data?.serviceCreate;
      serviceId = service?.id || "";
      if (!serviceId) return; // 생성에 실패했는데 다음 단계로 넘어가면 실패를 못 알아챈다.
      update("serviceId", serviceId);
      await loadProjectServices(form.projectId);
      if (serviceId) {
        await callApi("upsertVariables", {
          projectId: form.projectId,
          environmentId: form.environmentId,
          serviceId,
          variables: appEnvVars,
        }, "service");
        // 변수를 올린 뒤에 저장소를 붙인다. 순서가 반대면 Railway 가 저장소를 붙이는
        // 순간 빌드를 거는데, 그때는 DATABASE_URL 이 없어 기동에서 죽는다. 몇 분을
        // 태우고 실패 하나를 남기며, 6단계가 그것을 붙잡으면 정상 설치가 실패로 끊긴다.
        const attached = await callApi("attachServiceSource", {
          serviceId,
          environmentId: form.environmentId,
          githubRepo: form.githubRepo,
          githubBranch: form.githubBranch,
        }, "service", { silent: true });
        if (!attached) return; // 저장소가 안 붙으면 6단계에서 배포할 것이 없다.
        setSourceAttached(true);
        // 도메인이 있어야 8단계에서 확인할 주소가 생긴다.
        const domainData = await callApi("ensureServiceDomain", {
          projectId: form.projectId,
          environmentId: form.environmentId,
          serviceId,
        }, "service", { silent: true });
        if (domainData?.domain) {
          update("serviceDomain", domainData.domain);
          update("healthUrl", `https://${domainData.domain}`);
        }
        if (Number(form.appReplicas) > 0) {
          await callApi("setServiceReplicas", {
            serviceId,
            environmentId: form.environmentId,
            numReplicas: Number(form.appReplicas),
          }, "service", { silent: true });
        }
      }
      if (!scaffoldDone) {
        showResult("error", t("missingTitle"), t("needScaffoldFirst"));
        return;
      }
      setActive(5);
    }

    if (step === "deploy") {
      // 초기 소스를 넣으면 Railway 가 이미 배포를 걸어 둔다. 그 경우 새로 걸지 않고
      // 진행 중인 것을 지켜본다. 같은 커밋으로 빌드가 두 번 도는 것을 막는다.
      // 스캐폴드가 push 를 했다면 Railway 가 이미 배포를 걸고 있다. 등록될
      // 때까지 넉넉히 기다린다 — 짧게 끊으면 그 틈에 또 걸어 두 번 돈다.
      // 저장소를 이번 실행에서 붙였으면 그 전까지 빌드가 걸린 적이 없다. Railway 가
      // 연결 직후 스스로 배포를 걸었을 수 있으니 잠깐만 보고, 없으면 여기서 건다.
      const waitRounds = sourceAttached ? 4 : scaffoldDone ? 12 : 4;
      let active = null;
      // 여기서도 조회가 성공했다고 단계를 완료로 찍으면 안 된다. 아직 아무것도 안 끝났다.
      beginWatch();
      try {
        for (let attempt = 1; attempt <= waitRounds; attempt += 1) {
          active = await callApi("activeDeployment", {
            projectId: form.projectId,
            serviceId: form.serviceId,
            environmentId: form.environmentId,
          }, "deploy", { silent: true });
          if (active?.deployment?.id) break;
          if (attempt < waitRounds) {
            appendLog("success", "activeDeployment", `${t("lookingForActiveDeploy")} (${attempt}/${waitRounds})`);
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }
        }
      } finally {
        endWatch();
      }
      if (!active?.deployment?.id && scaffoldDone && !sourceAttached) {
        // 스캐폴드를 했는데 1분이 지나도 배포가 없다. 저장소 접근 설정이
        // 빠졌을 때가 대부분이라, 새로 걸기 전에 그 사실을 알린다.
        // 이번 실행에서 저장소를 붙였다면 배포가 없는 것이 정상이므로 알리지 않는다.
        showResult("error", t("missingTitle"), t("noAutoDeployAfterPush"));
      }
      if (active?.deployment?.id) {
        setDeployment({ id: active.deployment.id, status: active.deployment.status });
        appendLog("success", "activeDeployment", `이미 진행 중인 배포를 지켜봅니다: ${active.deployment.status}`);
        // await 해야 빌드가 끝날 때까지 stepBusy 가 유지되고 실행 버튼이 잠긴다.
        // 기다리지 않으면 곧바로 버튼이 풀려, 빌드가 도는 중에 한 번 더 눌러
        // 같은 커밋으로 배포가 두 번 돈다.
        const ok = await watchDeployment(active.deployment.id);
        if (ok) setActive(6);
        return;
      }
      const data = await callApi("deployService", {
        serviceId: form.serviceId,
        environmentId: form.environmentId,
      }, "deploy", { keepRunning: true, silent: true });
      const deploymentId = data?.serviceInstanceDeployV2;
      if (typeof deploymentId === "string") {
        setDeployment({ id: deploymentId, status: "PENDING" });
        // 빌드가 도는 동안은 이 단계에 머물고, 성공하면 Redis 단계로 넘긴다.
        // await 해야 그동안 실행 버튼이 잠긴다(위 activeDeployment 쪽과 같은 이유).
        const ok = await watchDeployment(deploymentId);
        if (ok) setActive(6);
        return;
      }
      if (data) setActive(6);
    }

    if (step === "redis") {
      if (!form.redisEnabled && Number(form.appReplicas) > 1) {
        setStepState((prev) => ({ ...prev, redis: "error" }));
        appendLog("error", "redis", t("redisRequiredForReplicas"));
        showResult("error", "redis", t("redisRequiredForReplicas"));
        return;
      }
      if (!form.redisEnabled) {
        // 만들지 않은 것을 초록 완료로 두면 만들었다고 오해한다.
        setStepState((prev) => ({ ...prev, redis: "ready" }));
        appendLog("success", "skipRedis", t("redisSkipped"));
        showResult("error", t("missingTitle"), t("redisSkipped"));
        setActive(7);
        return;
      }

      let redisServiceId = form.redisServiceId;
      if (redisServiceId) {
        const services = await loadProjectServices(form.projectId);
        const stillThere = services.some((service) => service.id === redisServiceId);
        if (!stillThere) {
          appendLog("success", "redis", t("staleServiceCleared"));
          redisServiceId = "";
          update("redisServiceId", "");
        }
      }
      if (form.projectId && !redisServiceId) {
        const data = await callApi("createRedis", {
          projectId: form.projectId,
          environmentId: form.environmentId,
          redisName: form.redisName,
        }, "redis");
        if (!data) return;
        redisServiceId = data?.pluginCreate?.id || "";
        if (redisServiceId) update("redisServiceId", redisServiceId);
        await loadProjectServices(form.projectId);
        // 서비스 생성과 인스턴스 기동은 다른 일이다. 배포 ID 만 받고 완료로
        // 표시하면 Railway 에는 offline 인데 화면은 성공으로 보인다.
        const redisDeploymentId = data?.deployed?.serviceInstanceDeployV2;
        if (typeof redisDeploymentId === "string") {
          setStepState((prev) => ({ ...prev, redis: "running" }));
          const ok = await watchDeployment(redisDeploymentId, "redis", { label: form.redisName || "redis", serviceId: redisServiceId });
          if (!ok) return;
        }
      }

      if (form.serviceId) {
        // 변수를 다시 올리면 ${{redis.REDIS_URL}} 참조가 그제야 풀린다. Railway 는
        // 변수가 바뀐 서비스를 다시 배포하고, 앱은 REDIS_URL 을 기동할 때 한 번만
        // 읽으므로 그 재배포가 끝나야 Redis 에 실제로 붙는다. 여기서 기다리지 않으면
        // 8단계가 옛 인스턴스를 보고 "설치가 아직 완료되지 않았습니다" 로 떨어진다.
        const before = await callApi("activeDeployment", {
          projectId: form.projectId,
          serviceId: form.serviceId,
          environmentId: form.environmentId,
        }, "redis", { silent: true });
        const beforeDeploymentId = before?.deployment?.id || "";

        await callApi("upsertVariables", {
          projectId: form.projectId,
          environmentId: form.environmentId,
          serviceId: form.serviceId,
          variables: appEnvVars,
        }, "redis");

        const nextDeploymentId = await waitForNewDeployment(form.serviceId, beforeDeploymentId);
        if (nextDeploymentId) {
          setStepState((prev) => ({ ...prev, redis: "running" }));
          setAppRedeploy({ phase: "building" });
          const ok = await watchDeployment(nextDeploymentId, "redis", {
            label: form.serviceName || "app",
            serviceId: form.serviceId,
          });
          setAppRedeploy(null);
          if (!ok) return;
        } else {
          setAppRedeploy(null);
          appendLog("success", "redis", t("appRedeployNotSeen"));
        }
      }
      setActive(7);
    }

    if (step === "health") {
      let healthUrl = String(form.healthUrl || "").trim();
      if (!healthUrl && form.serviceId) {
        const domainData = await callApi("ensureServiceDomain", {
          projectId: form.projectId,
          environmentId: form.environmentId,
          serviceId: form.serviceId,
        }, "health", { silent: true });
        if (domainData?.domain) {
          healthUrl = `https://${domainData.domain}`;
          update("serviceDomain", domainData.domain);
          update("healthUrl", healthUrl);
          appendLog("success", "serviceDomain", healthUrl);
        }
      }
      if (!healthUrl) {
        setStepState((prev) => ({ ...prev, health: "error" }));
        showResult("error", t("missingTitle"), t("serviceUrl"));
        return;
      }
      // 앞 단계에서 앱이 막 다시 떴을 수 있다. 그때는 URL 이 잠깐 502 를 주거나,
      // 응답은 해도 Redis 연결이 아직 안 붙어 있다. 한 번 보고 실패로 끊으면
      // 멀쩡한 설치가 "완료되지 않았습니다" 로 보인다. 잠깐 지켜본다.
      // Redis 를 언제 검사할 것인가.
      //
      //   전에는 체크박스(redisEnabled) 하나만 보고 검사했다. 그 값은 기본이 켬이고,
      //   7단계를 실행하지 않고 지나가도 켜진 채로 남는다. 그래서 Redis 를 만들지
      //   않은 사람에게 REDIS_URL 설정과 Redis 연결이 둘 다 실패로 찍혔고, 멀쩡히
      //   도는 설치가 "설치가 완료되지 않았습니다" 로 끝났다. Redis 는 선택 사항인데
      //   안 골랐다고 실패로 판정한 셈이다.
      //
      //   실제로 반드시 있어야 하는 경우는 복제본이 둘 이상일 때뿐이다(7단계가 이미
      //   같은 기준으로 막는다). 그 밖에는 Redis 를 만들었을 때만 상태를 확인하고,
      //   결과가 나빠도 설치 실패로 보지 않고 경고로 알린다.
      const redisRequired = Boolean(form.redisEnabled) && Number(form.appReplicas) > 1;
      const redisExpected = redisRequired || Boolean(form.redisServiceId);

      const attempts = 12;
      let health = null;
      let verified = null;
      // 되풀이해 보는 동안에는 조회 하나하나가 단계 상태를 확정하면 안 된다.
      // 결론은 이 루프가 끝난 뒤에 낸다.
      beginWatch();
      try {
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
          setVerifyWaiting({ attempt, attempts });
          health = await callApi("checkHealth", { url: healthUrl }, "health", { silent: true });
          if (health?.ok) {
            // 앱이 자기 상태를 보고하게 해서 DB·Redis 까지 확인한다.
            verified = await callApi("verifyInstall", {
              url: healthUrl,
              expectRedis: redisExpected,
            }, "health", { silent: true });
            if (verified?.ok) break;
          }
          if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 10000));
        }
      } finally {
        endWatch();
      }
      setVerifyWaiting(null);
      if (!health?.ok) {
        setStepState((prev) => ({ ...prev, health: "error" }));
        showResult("error", t("missingTitle"), t("healthHttpFailed") + LINE_BREAK + JSON.stringify(health, null, 2));
        return;
      }
      // 전에는 여기서 그냥 return 했다. callApi 가 이미 단계를 빨갛게 칠해 둔
      // 뒤라 사용자에게는 이유 없는 에러만 남았다.
      if (!verified) {
        setStepState((prev) => ({ ...prev, health: "error" }));
        showResult("error", t("verifyFailed"), t("verifyCallFailed"));
        return;
      }
      // 항목 이름을 원문 키(appRunning, redisConfigured …)로 내보내면 무엇이
      // 걸렸는지 읽히지 않는다. 브라우저 번역기가 켜져 있으면 더 나빠서,
      // redisConfigured 가 "재구성", redisConnected 가 "연결 끊김" 으로 뭉개진다.
      const checkLabelKeys = {
        appRunning: "checkAppRunning",
        databaseConfigured: "checkDatabaseConfigured",
        schemaSet: "checkSchemaSet",
        systemCodeSet: "checkSystemCodeSet",
        redisConfigured: "checkRedisConfigured",
        redisConnected: "checkRedisConnected",
      };
      const checks = verified.checks || {};
      const lines = Object.entries(checks)
        .filter(([, value]) => value !== null)
        .map(([key, value]) => `${value ? "OK" : "--"}  ${checkLabelKeys[key] ? t(checkLabelKeys[key]) : key}`);

      // 설치가 안 된 것과, 설치는 됐는데 Redis 만 덜 붙은 것은 다르다.
      const coreFailed = ["databaseConfigured", "schemaSet", "systemCodeSet"].filter((key) => checks[key] === false);
      const redisFailed = checks.redisConfigured === false || checks.redisConnected === false;
      const note = !redisExpected
        ? t("verifyRedisSkipped")
        : redisFailed && redisRequired
          ? t("verifyRedisRequired")
          : redisFailed
            ? t("verifyRedisWarn")
            : "";
      const detail = [
        `${t("verifyVersion")}: ${verified.version || "-"}`,
        `${t("verifyStartedAt")}: ${verified.startedAt || "-"}`,
        "",
        ...lines,
        ...(note ? ["", note] : []),
      ].join(LINE_BREAK);

      if (coreFailed.length || (redisFailed && redisRequired)) {
        setStepState((prev) => ({ ...prev, health: "error" }));
        showResult("error", t("verifyFailed"), detail);
        return;
      }
      setStepState((prev) => ({ ...prev, health: "done" }));
      showResult("success", t("verifyPassed"), detail);
    }
  };

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[var(--bg)] px-4 py-5 text-[var(--text)]">
      <div className="mx-auto max-w-7xl">
        <Chip tone="danger">{t("adminDeployment")}</Chip>
        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold">{t("title")}</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {t("desc")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {running ? (
              <span className="flex items-center gap-2 text-sm font-bold text-[var(--brand-blue)]">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--brand-blue)] border-t-transparent" />
                {running}
              </span>
            ) : null}
            <Button onClick={runCurrentStep} disabled={stepBusy || Boolean(running) || buildInProgress}>{buildInProgress ? t("buildingWait") : stepBusy || running ? t("running") : t("runCurrentStep")}</Button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <Card className="p-3">
            <div className="grid gap-1">
              {steps.map((step, index) => {
                const Icon = step.icon;
                const selected = active === index;
                const state = stepState[step.id];
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => goToStep(index)}
                    className={`flex min-h-14 w-full items-center justify-between rounded-[var(--radius-md)] px-3 text-left transition ${
                      selected ? "bg-[var(--surface-alt)]" : "hover:bg-[var(--surface-alt)]"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
                        <Icon size={18} />
                      </span>
                      <span>
                        <span className="block text-sm font-extrabold">{t(step.labelKey)}</span>
                        <span className="text-xs text-[var(--text-subtle)]">{t("step")} {index + 1}</span>
                      </span>
                    </span>
                    {state === "done" ? <CheckCircle2 size={18} className="text-[var(--brand-emerald)]" /> : <Circle size={16} className="text-[var(--text-subtle)]" />}
                  </button>
                );
              })}
            </div>
          </Card>

          <div className="grid gap-4">
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
                <h2 className="text-lg font-extrabold">{`${t("step")} ${active + 1}. ${t(steps[active].labelKey)}`}</h2>
                <StepState state={stepState[steps[active].id]} t={t} />
              </div>

              {active > 0 ? <CredentialsSummary form={form} t={t} onEdit={() => setActive(0)} /> : null}

              {active === 0 && (
                <div className="grid gap-4">
                  <div className="rounded-[var(--radius-md)] border border-[var(--brand-blue)] bg-[var(--surface-alt)] p-4">
                    <div className="text-sm font-extrabold">{t("prerequisites")}</div>
                    <ol className="mt-2 grid list-decimal gap-1 pl-5 text-xs leading-6 text-[var(--text-muted)]">
                      <li>{t("prereq1")}</li>
                      <li>{t("prereq2")}</li>
                      <li>{t("prereq3")}</li>
                      <li>{t("prereq4")}</li>
                    </ol>
                    <div className="mt-2 text-xs font-bold leading-5 text-[var(--text-muted)]">{t("prereqAllHere")}</div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs font-bold">
                      <a className="text-[var(--brand-blue)] underline underline-offset-2" href="https://railway.com/account/tokens" target="_blank" rel="noreferrer">Railway Tokens</a>
                      <a className="text-[var(--brand-blue)] underline underline-offset-2" href="https://github.com/new" target="_blank" rel="noreferrer">GitHub 저장소 만들기</a>
                      <a className="text-[var(--brand-blue)] underline underline-offset-2" href="https://github.com/settings/tokens/new?scopes=repo&description=brunner-installer" target="_blank" rel="noreferrer">GitHub 토큰 발급</a>
                      <a className="text-[var(--brand-blue)] underline underline-offset-2" href="https://github.com/settings/installations" target="_blank" rel="noreferrer">Railway 저장소 접근 설정</a>
                    </div>
                  </div>
                  <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-alt)] p-4">
                    <div className="text-sm font-extrabold">{t("bulkPasteTitle")}</div>
                    <div className="mt-1 text-xs leading-5 text-[var(--text-subtle)]">{t("bulkPasteHint")}</div>
                    <textarea
                      className="mt-2 h-32 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 font-mono text-xs leading-5 text-[var(--text)] outline-none transition placeholder:text-[var(--text-subtle)] focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[var(--brand-blue)]"
                      value={bulkPaste}
                      onChange={(event) => applyBulkPaste(event.target.value)}
                      placeholder={bulkPasteTemplate}
                      spellCheck={false}
                    />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold leading-5 text-[var(--text-muted)]">
                        {bulkFilledLabels.length
                          ? `${t("bulkPasteFilled")}: ${bulkFilledLabels.join(", ")}`
                          : bulkPaste.trim() && bulkPaste !== bulkPasteTemplate
                            ? t("bulkPasteNothing")
                            : ""}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => setBulkPaste(bulkPasteTemplate)} disabled={bulkPaste === bulkPasteTemplate}>{t("bulkPasteReset")}</Button>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label={t("railwayAccountToken")} hint={t("railwayAccountTokenHint")}>
                      <Input type="password" value={form.accountToken} onChange={(event) => update("accountToken", event.target.value)} placeholder="account or workspace token" inputClassName={requiredBox(form.accountToken)} />
                    </Field>
                    <Field label={t("gitRepository")} hint={t("prereq3")}>
                      {/* 타이핑 중에 정리하면 owner/ 의 슬래시가 지워져 더 못 친다. 칸을 떠날 때만 정리한다. */}
                      <Input icon={<GitBranch size={16} />} value={form.githubRepo} onChange={(event) => update("githubRepo", event.target.value)} onBlur={(event) => update("githubRepo", normalizeRepo(event.target.value))} placeholder="owner/repo" inputClassName={requiredBox(form.githubRepo)} />
                    </Field>
                    <Field label={t("githubToken")} hint={t("githubTokenHint")}>
                      <div className="grid gap-2">
                        <Input type="password" value={form.githubToken} onChange={(event) => update("githubToken", event.target.value)} placeholder="ghp_..." inputClassName={requiredBox(form.githubToken)} />
                        <a
                          href="https://github.com/settings/tokens/new?scopes=repo&description=brunner-installer"
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-bold text-[var(--brand-blue)] underline underline-offset-2"
                        >
                          {t("githubTokenIssue")}
                        </a>
                        <span className="text-xs leading-5 text-[var(--text-subtle)]">{t("githubTokenSteps")}</span>
                      </div>
                    </Field>
                  </div>
                  <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-alt)] p-3">
                    <div className="mb-2 text-sm font-extrabold">{t("performancePreset")}</div>
                    <div className="mb-2 text-xs leading-5 text-[var(--text-subtle)]">{t("presetScope")}</div>
                    <div className="grid gap-2">
                      {Object.entries(performancePresets).map(([key, preset]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => applyPerformancePreset(key)}
                          className={`rounded-[var(--radius-md)] border px-3 py-2 text-left transition ${
                            performancePreset === key
                              ? "border-[var(--brand-blue)] bg-[var(--surface)] text-[var(--brand-blue)]"
                              : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--brand-blue)]"
                          }`}
                        >
                          <span className="block text-sm font-extrabold">{t(preset.labelKey)}</span>
                          <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">{t(preset.hintKey)}</span>
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 grid gap-2 text-xs leading-5 text-[var(--text-muted)] md:grid-cols-2">
                      <div>{t("dbPoolHint")}</div>
                      <div>{t("chatPoolHint")}</div>
                      <div>{t("pushHint")}</div>
                      <div>{t("replicaHint")}</div>
                    </div>
                  </div>

                </div>
              )}

              {active === 1 && (
                <div className="grid gap-4">
                  <Field label={t("workspace")} hint={t("workspaceHint")}>
                    <select
                      className={`h-11 w-full rounded-[var(--radius-md)] border bg-[var(--surface)] px-3 text-sm ${requiredBox(form.workspaceId)}`}
                      value={form.workspaceId}
                      onChange={async (event) => {
                        const workspaceId = event.target.value;
                        update("workspaceId", workspaceId);
                        const list = await callApi("listProjects", { workspaceId }, "project", { silent: true, tokenType: "account" });
                        setProjects(list?.projects || []);
                      }}
                    >
                      <option value="">{t("selectWorkspace")}</option>
                      {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
                    </select>
                  </Field>
                  <div className="inline-flex w-fit rounded-[var(--radius-md)] border border-[var(--border)] p-1">
                    {[
                      ["new", t("createNew")],
                      ["existing", t("useExisting")],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => update("projectMode", value)}
                        className={`h-9 rounded-[var(--radius-md)] px-3 text-sm font-bold ${form.projectMode === value ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--text-muted)]"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {form.projectMode === "new" ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label={t("projectName")} hint={t("projectNameDerivesHint")}><Input value={form.projectName} onChange={(event) => updateProjectName(event.target.value)} inputClassName={requiredBox(form.projectName)} /></Field>
                      <Field label={t("description")}><Input value={form.projectDescription} onChange={(event) => update("projectDescription", event.target.value)} /></Field>
                    </div>
                  ) : (
                    <Field label={t("existingProject")}>
                      <select
                        className={`h-11 w-full rounded-[var(--radius-md)] border bg-[var(--surface)] px-3 text-sm ${requiredBox(form.projectId)}`}
                        value={form.projectId}
                        onChange={(event) => {
                          const projectId = event.target.value;
                          update("projectId", projectId);
                          // 고른 프로젝트의 이름을 같이 채운다. 그러지 않으면 신규 생성용
                          // 초기값이 남아, 설치된 사이트에 엉뚱한 이름이 뜬다.
                          const picked = projects.find((project) => project.id === projectId);
                          if (picked?.name) updateProjectName(picked.name, { forceDerived: true });
                        }}
                      >
                        <option value="">{t("selectProject")}</option>
                        {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                      </select>
                    </Field>
                  )}
                  <Field label={t("projectId")}>
                    <Input
                      value={form.projectId}
                      onChange={(event) => {
                        const projectId = event.target.value;
                        update("projectId", projectId);
                        const picked = projects.find((project) => project.id === projectId);
                        if (picked?.name) updateProjectName(picked.name, { forceDerived: true });
                      }}
                      placeholder={form.projectMode === "new" ? t("projectIdAuto") : t("projectIdExisting")}
                      inputClassName={form.projectMode === "existing" ? requiredBox(form.projectId) : ""}
                    />
                  </Field>
                  {/* 프로젝트 토큰은 프로젝트가 있어야 발급된다. 그래서 계정 토큰과 함께
                      1단계에서 묻지 않고, 프로젝트가 정해지는 이 단계에 둔다. */}
                  <Field label={t("railwayProjectToken")} hint={t("projectTokenOptionalHint")}>
                    <Input type="password" value={form.projectToken} onChange={(event) => update("projectToken", event.target.value)} placeholder="project token" inputClassName={requiredBox(form.projectToken)} />
                  </Field>
                </div>
              )}

              {active === 2 && (
                <div className="grid gap-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label={t("projectId")}><Input value={form.projectId} readOnly inputClassName="cursor-not-allowed opacity-80" placeholder={t("generatedAfterRun")} /></Field>
                    <Field label={t("postgresName")} hint={t("derivedFromProjectName")}><Input value={form.postgresName} onChange={(event) => updateDerivedName("postgresName", event.target.value)} inputClassName={requiredBox(form.postgresName)} /></Field>
                    <Field label={t("postgresId")} hint={t("selectOrEnterDbService")}>
                      <div className="grid gap-2">
                        <ServiceIdInput id="postgres-service-id-options" value={form.postgresServiceId} onChange={(event) => selectPostgresService(event.target.value)} services={postgresServices} placeholder={t("blankCreatesNew")} />
                        <Button size="sm" variant="ghost" onClick={refreshProjectServices} disabled={!form.projectId || Boolean(running)}>{t("refreshServices")}</Button>
                      </div>
                    </Field>
                    <Field label={t("dbReadReplicas")} hint={t("dbReadReplicaHint")}>
                      <Input type="number" min="0" value={form.dbReadReplicas} onChange={(event) => update("dbReadReplicas", event.target.value)} />
                    </Field>
                    <Field label={t("environmentId")} hint={t("selectOrEnterEnvironment")}><ComboInput id="environment-id-options" value={form.environmentId} onChange={(event) => update("environmentId", event.target.value)} options={projectEnvironments} placeholder={t("defaultEnvironment")} /></Field>
                    <Field label="DATABASE_URL">
                      <div className="flex gap-2">
                        <Input value={form.databaseUrl} readOnly inputClassName="cursor-text font-mono text-xs opacity-90" placeholder={t("databaseUrlNextStep")} />
                        <Button size="sm" variant="ghost" onClick={() => copyDatabaseUrl()} disabled={!form.databaseUrl}>
                          <Copy size={16} />
                        </Button>
                      </div>
                    </Field>
                    <Field label="JDBC URL">
                      <div className="flex gap-2">
                        <Input value={jdbcDatabaseUrl} readOnly inputClassName="cursor-text font-mono text-xs opacity-90" placeholder="jdbc:postgresql://..." />
                        <Button size="sm" variant="ghost" onClick={() => copyDatabaseUrl(jdbcDatabaseUrl, "JDBC URL")} disabled={!jdbcDatabaseUrl}>
                          <Copy size={16} />
                        </Button>
                      </div>
                    </Field>
                    <Field label="DB user">
                      <Input value={databaseCredentials.user} readOnly inputClassName="cursor-text font-mono text-xs opacity-90" />
                    </Field>
                    <Field label="DB password">
                      <div className="flex gap-2">
                        <Input value={databaseCredentials.password} readOnly inputClassName="cursor-text font-mono text-xs opacity-90" placeholder="PGPASSWORD" />
                        <Button size="sm" variant="ghost" onClick={() => copyDatabaseUrl(databaseCredentials.password, "DB password")} disabled={!databaseCredentials.password}>
                          <Copy size={16} />
                        </Button>
                      </div>
                    </Field>
                    <Field label={t("schemaName")} hint={t("schemaNameHint")}><Input value={form.schemaName} onChange={(event) => updateDerivedName("schemaName", normalizeSchemaInput(event.target.value))} inputClassName={requiredBox(form.schemaName)} /></Field>
                    <Field label={t("systemCode")} hint={t("systemCodeHint")}><Input value={form.systemCode} onChange={(event) => update("systemCode", event.target.value.slice(0, 2))} inputClassName={requiredBox(form.systemCode)} /></Field>
                  </div>
                  <div className="flex justify-end">
                    {dbWaiting ? (
                      <p className="mt-2 text-xs font-bold leading-5 text-[var(--brand-blue)]">
                        {t("dbProvisioning")} ({dbWaiting.attempt}/{dbWaiting.attempts})
                      </p>
                    ) : null}
                    <Button variant="ghost" onClick={testDatabaseConnection} disabled={stepBusy || !form.databaseUrl || Boolean(running)}>{t("testConnection")}</Button>
                  </div>
                  <EnvEditor title={t("dbServiceEnv")} serviceName="PostgreSQL" count={dbEnvTemplate.length} rows={dbEnvRows} onChange={updateDbEnvRows} t={t} requiredKeys={requiredDbEnvKeys} readOnlyKeys={generatedDbEnvKeys} />
                </div>
              )}

              {active === 3 && (
                <div className="grid gap-4">
                  <div className="rounded-[var(--radius-md)] bg-[var(--surface-alt)] p-4 text-sm leading-6 text-[var(--text-muted)]">
                    {t("schemaDesc")}
                  </div>
                  <Field label={t("targetDatabaseUrl")}>
                    <div className="flex gap-2">
                      <Input value={form.databaseUrl} onChange={(event) => update("databaseUrl", event.target.value)} inputClassName={`${requiredBox(form.databaseUrl)} font-mono text-xs`} />
                      <Button size="sm" variant="ghost" onClick={() => copyDatabaseUrl()} disabled={!form.databaseUrl}>
                        <Copy size={16} />
                      </Button>
                    </div>
                  </Field>
                  <Field label="JDBC URL">
                    <div className="flex gap-2">
                      <Input value={jdbcDatabaseUrl} readOnly inputClassName="cursor-text font-mono text-xs opacity-90" placeholder="jdbc:postgresql://..." />
                      <Button size="sm" variant="ghost" onClick={() => copyDatabaseUrl(jdbcDatabaseUrl, "JDBC URL")} disabled={!jdbcDatabaseUrl}>
                        <Copy size={16} />
                      </Button>
                    </div>
                  </Field>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="DB user">
                      <Input value={databaseCredentials.user} readOnly inputClassName="cursor-text font-mono text-xs opacity-90" />
                    </Field>
                    <Field label="DB password">
                      <div className="flex gap-2">
                        <Input value={databaseCredentials.password} readOnly inputClassName="cursor-text font-mono text-xs opacity-90" placeholder="PGPASSWORD" />
                        <Button size="sm" variant="ghost" onClick={() => copyDatabaseUrl(databaseCredentials.password, "DB password")} disabled={!databaseCredentials.password}>
                          <Copy size={16} />
                        </Button>
                      </div>
                    </Field>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label={t("schemaName")} hint={t("schemaNameHint")}><Input value={form.schemaName} onChange={(event) => updateDerivedName("schemaName", normalizeSchemaInput(event.target.value))} inputClassName={requiredBox(form.schemaName)} /></Field>
                    <Field label={t("systemCode")} hint={t("systemCodeHint")}><Input value={form.systemCode} onChange={(event) => update("systemCode", event.target.value.slice(0, 2))} inputClassName={requiredBox(form.systemCode)} /></Field>
                  </div>
                  <Field label={t("siteName")} hint={t("siteNameHint")}>
                    <Input value={form.brandName} onChange={(event) => update("brandName", event.target.value.slice(0, 60))} placeholder={form.projectName} />
                  </Field>
                  <div className="flex justify-end">
                    {dbWaiting ? (
                      <p className="mt-2 text-xs font-bold leading-5 text-[var(--brand-blue)]">
                        {t("dbProvisioning")} ({dbWaiting.attempt}/{dbWaiting.attempts})
                      </p>
                    ) : null}
                    <Button variant="ghost" onClick={testDatabaseConnection} disabled={stepBusy || !form.databaseUrl || Boolean(running)}>{t("testConnection")}</Button>
                  </div>
                </div>
              )}

              {active === 4 && (
                <div className="grid gap-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label={t("nextServiceName")} hint={t("derivedFromProjectName")}><Input value={form.serviceName} onChange={(event) => updateDerivedName("serviceName", event.target.value)} inputClassName={requiredBox(form.serviceName)} /></Field>
                    <Field label={t("serviceId")} hint={t("selectOrEnterService")}><ServiceIdInput id="next-service-id-options" value={form.serviceId} onChange={(event) => update("serviceId", event.target.value)} services={appServices} placeholder={t("blankCreatesNew")} /></Field>
                    <Field label={t("gitRepository")} hint={t("enteredInStep1")}>
                      <div className="flex gap-2">
                        <Input icon={<GitBranch size={16} />} value={form.githubRepo} readOnly inputClassName={`cursor-text font-mono text-xs opacity-90 ${requiredBox(form.githubRepo)}`} placeholder={t("notEnteredYet")} />
                        <Button size="sm" variant="ghost" onClick={() => setActive(0)}>{t("goToStep1")}</Button>
                      </div>
                    </Field>
                    <Field label={t("branch")}><Input value={form.githubBranch} onChange={(event) => update("githubBranch", event.target.value)} inputClassName={requiredBox(form.githubBranch)} /></Field>
                    <Field label={t("githubToken")} hint={t("enteredInStep1")}>
                      <div className="grid gap-2">
                        <div className="flex gap-2">
                          <Input value={maskSecret(form.githubToken)} readOnly inputClassName={`cursor-text font-mono text-xs opacity-90 ${requiredBox(form.githubToken)}`} placeholder={t("notEnteredYet")} />
                          <Button size="sm" variant="ghost" onClick={() => setActive(0)}>{t("goToStep1")}</Button>
                        </div>
                        <a
                          href="https://github.com/apps/railway-app/installations/new"
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-bold text-[var(--brand-blue)] underline underline-offset-2"
                        >
                          {t("grantRepoAccess")}
                        </a>
                        <span className="text-xs leading-5 text-[var(--text-subtle)]">{t("grantRepoAccessHint")}</span>
                        <Button
                          size="sm"
                          variant={scaffoldDone ? "ghost" : "danger"}
                          className={scaffoldDone ? "" : "border-2 border-[var(--danger)]"}
                          disabled={scaffoldDone || scaffoldInFlight.current || stepBusy || !form.githubToken || !form.githubRepo || Boolean(running)}
                          onClick={runScaffold}
                        >
                          {running === "scaffoldRepository" ? t("scaffoldRunning") : t("scaffoldRepo")}
                        </Button>
                        {scaffoldDone ? (
                          <span className="text-xs font-bold leading-5 text-[var(--brand-blue)]">{t("scaffoldDone")}</span>
                        ) : (
                          <span className="text-xs font-bold leading-5 text-[var(--danger)]">{t("scaffoldRequired")}</span>
                        )}
                        {!form.githubToken || !form.githubRepo ? (
                          <span className="text-xs leading-5 text-[var(--danger)]">{t("scaffoldDisabledWhy")}</span>
                        ) : null}
                      </div>
                    </Field>
                    <Field label={t("serviceDomain")} hint={t("serviceDomainHint")}>
                      <div className="flex gap-2">
                        <Input value={form.serviceDomain} readOnly inputClassName="cursor-text font-mono text-xs opacity-90" placeholder={t("generatedAfterRun")} />
                        <Button size="sm" variant="ghost" onClick={() => copyDatabaseUrl(form.serviceDomain ? `https://${form.serviceDomain}` : "", "Service URL")} disabled={!form.serviceDomain}>
                          <Copy size={16} />
                        </Button>
                      </div>
                    </Field>
                    <Field label={t("appReplicas")} hint={t("appReplicaHint")}>
                      <Input type="number" min="1" value={form.appReplicas} onChange={(event) => update("appReplicas", event.target.value)} />
                    </Field>
                  </div>
                  <div className="rounded-[var(--radius-md)] bg-[var(--surface-alt)] p-4 text-sm leading-6 text-[var(--text-muted)]">
                    {t("scaffoldHint")}
                  </div>
                  <EnvEditor title={t("appServiceEnv")} serviceName="NextJS" count={requiredAppEnvKeys.size} rows={appEnvRows.filter((row) => requiredAppEnvKeys.has(row.key))} onChange={(rows) => {
                    const extras = appEnvRows.filter((row) => !requiredAppEnvKeys.has(row.key));
                    setAppEnvRows([...rows, ...extras]);
                  }} t={t} />
                  <EnvEditor title={t("performanceParams")} serviceName="NextJS" count={Object.keys(performancePresets[performancePreset]?.values || {}).length} rows={appEnvRows.filter((row) => !requiredAppEnvKeys.has(row.key))} onChange={(rows) => {
                    const required = appEnvRows.filter((row) => requiredAppEnvKeys.has(row.key));
                    setAppEnvRows([...required, ...rows]);
                  }} t={t} />
                </div>
              )}

              {active === 5 && (
                <div className="grid gap-4">
                  <Field label={t("deployTargetService")}>
                    <Input value={form.serviceId} readOnly inputClassName="cursor-text font-mono text-xs opacity-90" placeholder={t("generatedAfterRun")} />
                  </Field>
                  {!form.serviceId ? (
                    <div className="rounded-[var(--radius-md)] border border-[var(--brand-blue)] bg-[var(--surface-alt)] p-4 text-sm leading-6 text-[var(--text)]">
                      {t("deployNeedsService")}
                    </div>
                  ) : null}
                  <Field label={t("libraryPackageName")} hint={t("libraryPackageHint")}>
                    <Input value={form.packageName} onChange={(event) => update("packageName", event.target.value)} />
                  </Field>
                  {deployment ? (
                    <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-extrabold">{t("buildStatus")}</span>
                        <Chip tone={deployment.status === "SUCCESS" ? "success" : ["FAILED", "CRASHED"].includes(deployment.status) ? "danger" : "brand"}>
                          {deployment.status}
                        </Chip>
                      </div>
                      <div className="mt-2 text-xs leading-5 text-[var(--text-muted)]">
                        {deployment.status === "SUCCESS"
                          ? t("buildSucceeded")
                          : ["FAILED", "CRASHED"].includes(deployment.status)
                            ? t("buildFailed")
                            : t("buildWatching")}
                      </div>
                      {buildLogLines.length ? (
                        <div className="mt-3">
                          <div className="mb-1 text-xs font-bold text-[var(--text-muted)]">{t("buildLogTitle")}</div>
                          <pre className="max-h-72 overflow-auto rounded-[var(--radius-md)] bg-[var(--surface-alt)] p-3 text-xs leading-5 text-[var(--text-muted)]">
                            {buildLogLines.join("\n")}
                          </pre>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="rounded-[var(--radius-md)] bg-[var(--surface-alt)] p-4 text-sm leading-6 text-[var(--text-muted)]">
                    {t("deployDesc")}
                  </div>
                </div>
              )}

              {active === 6 && (
                <div className="grid gap-4">
                  <label className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2 text-sm font-bold">
                    <input
                      type="checkbox"
                      checked={form.redisEnabled}
                      onChange={(event) => update("redisEnabled", event.target.checked)}
                      className="h-4 w-4 accent-[var(--brand-blue)]"
                    />
                    {t("createRedis")}
                  </label>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label={t("redisName")}><Input value={form.redisName} onChange={(event) => update("redisName", event.target.value)} disabled={!form.redisEnabled} inputClassName={form.redisEnabled ? requiredBox(form.redisName) : ""} /></Field>
                    <Field label={t("redisId")} hint={t("selectOrEnterService")}><ServiceIdInput id="redis-service-id-options" value={form.redisServiceId} onChange={(event) => update("redisServiceId", event.target.value)} services={redisServices} placeholder={t("blankCreatesNew")} disabled={!form.redisEnabled} /></Field>
                    <div className="md:col-span-2">
                      <Field label={t("apRedisUrl")} hint={t("redisUrlHint")} required={form.redisEnabled} requiredLabel={t("required")}>
                        <Input value={form.redisUrl} onChange={(event) => update("redisUrl", event.target.value)} disabled={!form.redisEnabled} placeholder="${{Redis.REDIS_URL}}" inputClassName={form.redisEnabled ? requiredBox(form.redisUrl) : ""} />
                      </Field>
                    </div>
                  </div>
                  {appRedeploy ? (
                    <div className="rounded-[var(--radius-md)] border-2 border-[var(--brand-blue)] bg-[var(--surface-alt)] p-4">
                      <div className="flex items-center gap-2 text-sm font-extrabold text-[var(--brand-blue)]">
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--brand-blue)] border-t-transparent" />
                        {t("appRedeployTitle")}
                      </div>
                      <div className="mt-2 text-xs font-bold leading-5 text-[var(--brand-blue)]">
                        {appRedeploy.phase === "detecting"
                          ? `${t("appRedeployDetecting")} (${appRedeploy.attempt}/${appRedeploy.attempts})`
                          : t("appRedeployBuilding")}
                        {deployment?.status ? ` — ${deployment.status}` : ""}
                      </div>
                      <div className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{t("appRedeployWhy")}</div>
                    </div>
                  ) : null}
                  <div className="rounded-[var(--radius-md)] bg-[var(--surface-alt)] p-4 text-sm leading-6 text-[var(--text-muted)]">
                    {t("redisDesc")}
                  </div>
                </div>
              )}

              {active === 7 && (
                <div className="grid gap-4">
                  <Field label={t("serviceUrl")}><Input value={form.healthUrl} onChange={(event) => update("healthUrl", event.target.value)} placeholder="https://..." inputClassName={requiredBox(form.healthUrl)} /></Field>
                  {verifyWaiting ? (
                    <p className="flex items-center gap-2 text-xs font-bold leading-5 text-[var(--brand-blue)]">
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--brand-blue)] border-t-transparent" />
                      {t("verifyWaiting")} ({verifyWaiting.attempt}/{verifyWaiting.attempts})
                    </p>
                  ) : null}
                  <div className="rounded-[var(--radius-md)] bg-[var(--surface-alt)] p-4 text-sm leading-6 text-[var(--text-muted)]">
                    {t("healthDesc")}
                  </div>
                </div>
              )}

              <div className="mt-5 flex flex-wrap justify-between gap-2 border-t border-[var(--border)] pt-4">
                <Button variant="ghost" disabled={active === 0} onClick={() => setActive((value) => Math.max(0, value - 1))}>{t("prev")}</Button>
                <div className="flex gap-2">
                  <Button variant="ghost" disabled={active === steps.length - 1 || buildInProgress} onClick={() => goToStep(Math.min(steps.length - 1, active + 1))}>{t("next")}</Button>
                  <Button onClick={runCurrentStep} disabled={stepBusy || Boolean(running) || buildInProgress}>{buildInProgress ? t("buildingWait") : stepBusy || running ? t("running") : t("run")}</Button>
                </div>
              </div>
            </Card>

            <div className="grid gap-4">
              <Card className="p-4">
                <h3 className="font-extrabold">{t("variablePreview")}</h3>
                <div className="mt-3 grid gap-3">
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-bold text-[var(--text-muted)]">{t("dbService")}</span>
                      <Chip tone={filledDbEnvCount === requiredDbEnvKeys.size ? "success" : "warn"}>{filledDbEnvCount}/{requiredDbEnvKeys.size} {t("required")}</Chip>
                    </div>
                    <pre className="max-h-44 overflow-auto rounded-[var(--radius-md)] bg-[var(--surface-alt)] p-3 text-xs leading-5 text-[var(--text-muted)]">{JSON.stringify(dbEnvVars, null, 2)}</pre>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-bold text-[var(--text-muted)]">{t("apService")}</span>
                      <Chip tone={requiredAppEnvCount === requiredAppEnvKeys.size ? "success" : "warn"}>{requiredAppEnvCount}/{requiredAppEnvKeys.size} {t("required")}</Chip>
                    </div>
                    <pre className="max-h-44 overflow-auto rounded-[var(--radius-md)] bg-[var(--surface-alt)] p-3 text-xs leading-5 text-[var(--text-muted)]">{JSON.stringify(appEnvVars, null, 2)}</pre>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <h3 className="font-extrabold">{t("runLog")}</h3>
                <div className="mt-3 grid max-h-96 gap-2 overflow-auto">
                  {logs.length === 0 ? <div className="text-sm text-[var(--text-subtle)]">{t("noLogs")}</div> : null}
                  {logs.map((log) => (
                    <div key={log.id} className="rounded-[var(--radius-md)] border border-[var(--border)] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Chip tone={log.type === "error" ? "danger" : "success"}>{log.type}</Chip>
                        <span className="text-xs text-[var(--text-subtle)]">{log.at}</span>
                      </div>
                      <div className="mt-2 text-sm font-bold">{log.title}</div>
                      <pre className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-[var(--text-muted)]">{log.detail}</pre>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
      {resultDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-extrabold">{t("executionResult")}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Chip tone={resultDialog.type === "error" ? "danger" : "success"}>{resultDialog.type}</Chip>
                  <span className="text-sm font-bold text-[var(--text)]">{resultDialog.title}</span>
                  <span className="text-xs text-[var(--text-subtle)]">{resultDialog.at}</span>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setResultDialog(null)}>{t("close")}</Button>
            </div>
            <pre className="mt-4 max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-md)] bg-[var(--surface-alt)] p-3 text-xs leading-5 text-[var(--text-muted)]">
              {resultDialog.detail}
            </pre>
          </div>
        </div>
      ) : null}
      <BrunnerMessageBox />
    </div>
  );
}

RailwayDeployWizard.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
