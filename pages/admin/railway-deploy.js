import { useEffect, useMemo, useRef, useState } from "react";
import Layout from "@/components/core/client/frames/layout";
import * as userInfo from "@/components/core/client/frames/userInfo";
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

const i18n = {
  adminDeployment: { "en-US": "System setup", "ko-KR": "시스템 설치", "ja-JP": "システムセットアップ" },
  title: { "en-US": "New system installation wizard", "ko-KR": "신규 시스템 설치 마법사", "ja-JP": "新規システムインストールウィザード" },
  desc: {
    "en-US": "Create or select a Railway project, provision PostgreSQL, apply the Brunner schema, create a NextJS service, deploy a Git branch, optionally add Redis for replicas, and verify startup.",
    "ko-KR": "Railway 프로젝트를 생성 또는 선택하고 PostgreSQL 구성, Brunner 스키마 적용, NextJS 서비스 생성, Git 브랜치 배포, Redis 선택 구성, 기동 확인까지 단계별로 진행합니다.",
    "ja-JP": "Railway プロジェクトの作成または選択、PostgreSQL 構成、Brunner スキーマ適用、NextJS サービス作成、Git ブランチのデプロイ、Redis 任意構成、起動確認まで段階的に進めます。",
  },
  runCurrentStep: { "en-US": "Run current step", "ko-KR": "현재 단계 실행", "ja-JP": "現在のステップを実行" },
  running: { "en-US": "Running", "ko-KR": "실행 중", "ja-JP": "実行中" },
  run: { "en-US": "Run", "ko-KR": "실행", "ja-JP": "実行" },
  testConnection: { "en-US": "Test connection", "ko-KR": "접속 테스트", "ja-JP": "接続テスト" },
  prev: { "en-US": "Prev", "ko-KR": "이전", "ja-JP": "前へ" },
  next: { "en-US": "Next", "ko-KR": "다음", "ja-JP": "次へ" },
  refreshServices: { "en-US": "Refresh services", "ko-KR": "서비스 목록 새로고침", "ja-JP": "サービス一覧を更新" },
  add: { "en-US": "Add", "ko-KR": "추가", "ja-JP": "追加" },
  del: { "en-US": "Del", "ko-KR": "삭제", "ja-JP": "削除" },
  done: { "en-US": "Done", "ko-KR": "완료", "ja-JP": "完了" },
  check: { "en-US": "Check", "ko-KR": "확인 필요", "ja-JP": "確認" },
  ready: { "en-US": "Ready", "ko-KR": "대기", "ja-JP": "待機" },
  step: { "en-US": "Step", "ko-KR": "단계", "ja-JP": "ステップ" },
  stepAccount: { "en-US": "Credentials", "ko-KR": "사전 입력값", "ja-JP": "事前入力" },
  stepProject: { "en-US": "Project", "ko-KR": "프로젝트", "ja-JP": "プロジェクト" },
  stepDatabase: { "en-US": "PostgreSQL service", "ko-KR": "PostgreSQL 서비스", "ja-JP": "PostgreSQL サービス" },
  stepSchema: { "en-US": "DB schema and seed", "ko-KR": "DB 스키마 및 초기데이터", "ja-JP": "DB スキーマと初期データ" },
  stepService: { "en-US": "NextJS service", "ko-KR": "NextJS 서비스", "ja-JP": "NextJS サービス" },
  stepDeploy: { "en-US": "Deploy source", "ko-KR": "소스 배포", "ja-JP": "ソースデプロイ" },
  stepRedis: { "en-US": "Redis service", "ko-KR": "Redis 서비스", "ja-JP": "Redis サービス" },
  stepHealth: { "en-US": "Health check", "ko-KR": "기동 확인", "ja-JP": "起動確認" },
  railwayToken: { "en-US": "Railway API Token", "ko-KR": "Railway API 토큰", "ja-JP": "Railway API トークン" },
  prerequisites: { "en-US": "Before you start", "ko-KR": "시작하기 전에 준비할 것", "ja-JP": "始める前の準備" },
  prereq1: {
    "en-US": "Railway account token — railway.com → Account Settings → Tokens, created without selecting a workspace.",
    "ko-KR": "Railway 계정 토큰 — railway.com → Account Settings → Tokens 에서 Workspace 를 고르지 않고 발급합니다.",
    "ja-JP": "Railway アカウントトークン — railway.com → Account Settings → Tokens で Workspace を選ばずに発行します。",
  },
  prereq2: {
    "en-US": "Railway workspace token — same screen, created with the workspace selected. Used from the PostgreSQL step onward.",
    "ko-KR": "Railway 워크스페이스 토큰 — 같은 화면에서 Workspace 를 지정해 발급합니다. PostgreSQL 단계부터 사용합니다.",
    "ja-JP": "Railway ワークスペーストークン — 同じ画面で Workspace を指定して発行します。PostgreSQL ステップ以降で使用します。",
  },
  prereq3: {
    "en-US": "An empty GitHub repository for the new service, plus a classic token with the repo scope.",
    "ko-KR": "새 서비스를 담을 빈 GitHub 저장소, 그리고 repo 권한을 가진 classic 토큰.",
    "ja-JP": "新しいサービス用の空の GitHub リポジトリと、repo 権限を持つ classic トークン。",
  },
  prereq4: {
    "en-US": "Railway must be allowed to read that repository. Add it in the Railway GitHub App settings — only the account owner can do this, so the wizard cannot.",
    "ko-KR": "Railway 가 그 저장소를 읽을 수 있어야 합니다. Railway GitHub App 설정에서 추가하세요 — 계정 주인만 할 수 있어 마법사가 대신 못 합니다.",
    "ja-JP": "Railway がそのリポジトリを読める必要があります。Railway GitHub App の設定で追加してください — アカウント所有者のみ可能で、ウィザードは代行できません。",
  },
  railwayAccountToken: { "en-US": "Railway Account Token", "ko-KR": "Railway Account Token", "ja-JP": "Railway Account Token" },
  railwayProjectToken: { "en-US": "Railway Project Token", "ko-KR": "Railway Project Token", "ja-JP": "Railway Project Token" },
  railwayTokenHint: {
    "en-US": "Use an account or project token with permissions to create projects, services, and variables. It is sent only to the server API for this request.",
    "ko-KR": "프로젝트, 서비스, 환경변수를 생성할 수 있는 계정 또는 프로젝트 토큰을 입력하세요. 이 요청을 위해 서버 API로만 전송됩니다.",
    "ja-JP": "プロジェクト、サービス、変数を作成できるアカウントまたはプロジェクトトークンを使用します。このリクエストのためにサーバー API のみに送信されます。",
  },
  railwayAccountTokenHint: {
    "en-US": "Used for project list, project creation, and environment lookup.",
    "ko-KR": "프로젝트 목록, 프로젝트 생성, 환경 조회에 사용합니다.",
    "ja-JP": "Project list, project creation, environment lookup に使用します。",
  },
  railwayProjectTokenHint: {
    "en-US": "Used from the PostgreSQL step onward with the Project-Access-Token header.",
    "ko-KR": "PostgreSQL 단계부터 Project-Access-Token 헤더로 사용합니다.",
    "ja-JP": "PostgreSQL step 以降で Project-Access-Token header として使用します。",
  },
  createNew: { "en-US": "Create new", "ko-KR": "신규 생성", "ja-JP": "新規作成" },
  useExisting: { "en-US": "Use existing", "ko-KR": "기존 사용", "ja-JP": "既存を使用" },
  projectName: { "en-US": "Project name", "ko-KR": "프로젝트명", "ja-JP": "プロジェクト名" },
  description: { "en-US": "Description", "ko-KR": "설명", "ja-JP": "説明" },
  defaultProjectDescription: {
    "en-US": "Provisioned by Brunner system installation wizard",
    "ko-KR": "Brunner 시스템 설치 마법사로 생성",
    "ja-JP": "Brunner システムインストールウィザードで作成",
  },
  workspace: { "en-US": "Workspace", "ko-KR": "워크스페이스", "ja-JP": "ワークスペース" },
  selectWorkspace: { "en-US": "Select workspace", "ko-KR": "워크스페이스 선택", "ja-JP": "ワークスペース選択" },
  workspaceHint: {
    "en-US": "Railway requires a workspace to list and create projects. Loaded after the account token is verified.",
    "ko-KR": "Railway는 프로젝트 조회와 생성에 워크스페이스가 필요합니다. 계정 토큰 확인 후 자동으로 불러옵니다.",
    "ja-JP": "Railway はプロジェクトの一覧と作成にワークスペースが必要です。アカウントトークン確認後に自動取得します。",
  },
  existingProject: { "en-US": "Existing project", "ko-KR": "기존 프로젝트", "ja-JP": "既存プロジェクト" },
  selectProject: { "en-US": "Select project", "ko-KR": "프로젝트 선택", "ja-JP": "プロジェクト選択" },
  projectId: { "en-US": "Project ID", "ko-KR": "프로젝트 ID", "ja-JP": "プロジェクト ID" },
  autoManual: { "en-US": "Auto-created or manual input", "ko-KR": "자동 생성 또는 직접 입력", "ja-JP": "自動作成または手入力" },
  projectIdAuto: { "en-US": "Created automatically after running this step", "ko-KR": "이 단계 실행 후 자동으로 표시됩니다", "ja-JP": "このステップ実行後に自動表示されます" },
  projectIdExisting: { "en-US": "Select an existing project or enter its ID", "ko-KR": "기존 프로젝트를 선택하거나 ID를 직접 입력", "ja-JP": "既存プロジェクトを選択するか ID を手入力" },
  generatedAfterRun: { "en-US": "Shown automatically after running this step", "ko-KR": "이 단계 실행 후 자동으로 표시됩니다", "ja-JP": "このステップ実行後に自動表示されます" },
  databaseUrlNextStep: { "en-US": "Enter this in the next DB schema step", "ko-KR": "다음 DB 스키마 단계에서 입력합니다", "ja-JP": "次の DB スキーマステップで入力します" },
  selectOrEnterService: { "en-US": "Select an existing service or enter a service ID. Leave blank to create a new service.", "ko-KR": "기존 서비스를 선택하거나 아니면 직접 입력하세요. 비워두면 신규 생성됨", "ja-JP": "既存サービスを選択するか、サービス ID を直接入力してください。空欄なら新規作成されます。" },
  selectOrEnterDbService: { "en-US": "Select an existing DB service or enter a service ID. Leave blank to create a new DB service.", "ko-KR": "기존 DB 서비스를 선택하거나 아니면 직접 입력하세요. 비워두면 신규 DB 서비스 생성됨", "ja-JP": "既存 DB サービスを選択するか、サービス ID を直接入力してください。空欄なら新規 DB サービスが作成されます。" },
  selectOrEnterEnvironment: { "en-US": "Select a Railway environment or enter its ID.", "ko-KR": "Railway 환경을 선택하거나 환경 ID를 직접 입력하세요.", "ja-JP": "Railway 環境を選択するか、環境 ID を直接入力してください。" },
  blankCreatesNew: { "en-US": "Leave blank to create a new service", "ko-KR": "비워두면 신규 생성됨", "ja-JP": "空欄なら新規作成" },
  postgresName: { "en-US": "PostgreSQL service name", "ko-KR": "PostgreSQL 서비스명", "ja-JP": "PostgreSQL サービス名" },
  postgresId: { "en-US": "PostgreSQL service ID", "ko-KR": "PostgreSQL 서비스 ID", "ja-JP": "PostgreSQL サービス ID" },
  dbReadReplicas: { "en-US": "PostgreSQL read replicas", "ko-KR": "PostgreSQL 읽기 복제본 수", "ja-JP": "PostgreSQL リードレプリカ数" },
  dbReadReplicaHint: {
    "en-US": "Read replicas run as separate services. 0 keeps a single primary on the stable image. Any value above 0 switches to the replication-capable alpha image, whose publisher warns about data loss, so it is not recommended for production.",
    "ko-KR": "읽기 복제본은 별도 서비스로 생성됩니다. 0이면 안정 버전 이미지로 단일 primary만 사용합니다. 1 이상을 넣으면 복제를 지원하는 alpha 이미지로 바뀌는데, 이미지 제공자가 데이터 손실 위험을 경고하고 있으니 운영에는 권하지 않습니다.",
    "ja-JP": "リードレプリカは別サービスとして作成されます。0 なら安定版イメージの primary のみです。1 以上にすると複製対応の alpha イメージに切り替わりますが、提供元がデータ損失の危険を警告しているため本番には推奨しません。",
  },
  appReplicas: { "en-US": "NextJS service instances", "ko-KR": "NextJS 인스턴스 수", "ja-JP": "NextJS インスタンス数" },
  appReplicaHint: {
    "en-US": "Applied to the Railway service instance. Two or more instances require Redis so realtime events stay shared.",
    "ko-KR": "Railway 서비스 인스턴스 수로 반영됩니다. 2개 이상이면 실시간 이벤트 공유를 위해 Redis가 필요합니다.",
    "ja-JP": "Railway サービスインスタンス数として反映されます。2 つ以上ならリアルタイムイベント共有のため Redis が必要です。",
  },
  redisRequiredForReplicas: {
    "en-US": "Redis is required because two or more NextJS instances are configured.",
    "ko-KR": "NextJS 인스턴스가 2개 이상이라 Redis가 필요합니다.",
    "ja-JP": "NextJS インスタンスが 2 つ以上のため Redis が必要です。",
  },
  generatedDbPassword: {
    "en-US": "The wizard generated the database password. Copy it before leaving this page.",
    "ko-KR": "마법사가 DB 비밀번호를 생성했습니다. 이 화면을 벗어나기 전에 복사해두세요.",
    "ja-JP": "ウィザードが DB パスワードを生成しました。この画面を離れる前にコピーしてください。",
  },
  environmentId: { "en-US": "Environment ID", "ko-KR": "환경 ID", "ja-JP": "環境 ID" },
  defaultEnvironment: { "en-US": "Default environment if empty", "ko-KR": "비우면 기본 환경 사용", "ja-JP": "空の場合はデフォルト環境" },
  dbServiceEnv: { "en-US": "DB service environment", "ko-KR": "DB 서비스 환경변수", "ja-JP": "DB サービス環境変数" },
  serviceVariables: { "en-US": "service variables", "ko-KR": "서비스 환경변수", "ja-JP": "サービス変数" },
  schemaDesc: {
    "en-US": "Creates the requested DB_SCHEMA if needed, then loads tables, dynamic SQL, resource texts, and seed data with the requested SYSTEM_CODE.",
    "ko-KR": "입력한 DB_SCHEMA를 없으면 생성하고, 필수 테이블, 동적 SQL, 리소스 텍스트, 초기 데이터를 입력한 SYSTEM_CODE로 적재합니다.",
    "ja-JP": "入力した DB_SCHEMA を必要に応じて作成し、テーブル、動的 SQL、リソース、初期データを入力した SYSTEM_CODE で登録します。",
  },
  schemaName: { "en-US": "DB_SCHEMA", "ko-KR": "DB_SCHEMA", "ja-JP": "DB_SCHEMA" },
  systemCode: { "en-US": "SYSTEM_CODE", "ko-KR": "SYSTEM_CODE", "ja-JP": "SYSTEM_CODE" },
  schemaNameHint: {
    "en-US": "PostgreSQL schema to create or reuse. Lowercase letters, digits and underscore only — a hyphen cannot appear in an unquoted identifier, so a hyphen, space or dot you type becomes an underscore (my-schema becomes my_schema) and anything else is dropped. Keep the default when this system has its own database. Avoid another service's schema name when the database is shared. The same value is registered in AP service variables.",
    "ko-KR": "생성하거나 재사용할 PostgreSQL 스키마입니다. 소문자·숫자·밑줄만 쓸 수 있습니다 — 하이픈은 식별자에 넣을 수 없어, 하이픈·공백·점을 치면 밑줄로 바뀝니다(my-schema → my_schema). 그 외 글자는 입력하는 대로 걸러집니다. 이 시스템 전용 DB라면 기본값 그대로 두어도 됩니다. 다른 서비스와 DB를 공유한다면 그 서비스가 쓰는 이름은 피하세요. 같은 값이 AP 서비스 환경변수에도 등록됩니다.",
    "ja-JP": "作成または再利用する PostgreSQL スキーマです。小文字・数字・アンダースコアのみ使えます — ハイフンは識別子に使えないため、ハイフン・空白・ドットはアンダースコアに変換されます（my-schema → my_schema）。それ以外の文字は入力時に取り除かれます。このシステム専用の DB なら既定値のままで構いません。DB を共有する場合は他サービスの名前を避けてください。同じ値を AP サービス環境変数にも登録します。",
  },
  systemCodeHint: {
    "en-US": "Tenant code for initial dynamic SQL and resource seed rows, 1-2 characters. The same value is registered as SYSTEM_CODE.",
    "ko-KR": "초기 동적 SQL과 리소스 seed에 사용할 테넌트 코드입니다. 1~2자로 입력하세요. 같은 값이 SYSTEM_CODE로 등록됩니다.",
    "ja-JP": "初期動的 SQL とリソース seed に使うテナントコードです。1~2 文字で入力します。同じ値を SYSTEM_CODE として登録します。",
  },
  targetDatabaseUrl: { "en-US": "Target DATABASE_URL", "ko-KR": "대상 DATABASE_URL", "ja-JP": "対象 DATABASE_URL" },
  nextServiceName: { "en-US": "NextJS service name", "ko-KR": "NextJS 서비스명", "ja-JP": "NextJS サービス名" },
  serviceId: { "en-US": "Service ID", "ko-KR": "서비스 ID", "ja-JP": "サービス ID" },
  gitRepository: { "en-US": "Git Repository", "ko-KR": "Git 저장소", "ja-JP": "Git リポジトリ" },
  branch: { "en-US": "Branch", "ko-KR": "브랜치", "ja-JP": "ブランチ" },
  performancePreset: { "en-US": "Performance preset", "ko-KR": "성능 프리셋", "ja-JP": "性能プリセット" },
  githubToken: { "en-US": "GitHub token", "ko-KR": "GitHub 토큰", "ja-JP": "GitHub トークン" },
  serviceDomain: { "en-US": "Railway domain", "ko-KR": "Railway 도메인", "ja-JP": "Railway ドメイン" },
  serviceDomainHint: {
    "en-US": "Created with the service and reused in the health check step.",
    "ko-KR": "서비스 생성과 함께 발급되며 기동 확인 단계에 그대로 사용됩니다.",
    "ja-JP": "サービス作成時に発行され、起動確認ステップでそのまま使用します。",
  },
  githubTokenHint: {
    "en-US": "A classic token with the repo scope is recommended. Granting Railway access to the repository requires a classic token; a fine-grained token can only create the initial source.",
    "ko-KR": "classic 토큰(scope: repo)을 권장합니다. Railway 앱에 저장소 접근 권한을 부여하려면 classic 토큰이 필요하고, fine-grained 토큰은 초기 소스 생성까지만 됩니다.",
    "ja-JP": "classic トークン(scope: repo)を推奨します。Railway にリポジトリアクセス権限を付与するには classic トークンが必要で、fine-grained トークンは初期ソース作成までしかできません。",
  },
  scaffoldRepo: { "en-US": "Create initial source", "ko-KR": "초기 소스 생성", "ja-JP": "初期ソース作成" },
  grantRepoAccess: { "en-US": "Open Railway repository access settings", "ko-KR": "Railway 저장소 접근 설정 열기", "ja-JP": "Railway のリポジトリアクセス設定を開く" },
  grantRepoAccessHint: {
    "en-US": "Railway reads the repository through its GitHub App. Add the target repository there, otherwise the build fails with \"GitHub Repo not found\". Only the account owner can change this on GitHub, so the wizard cannot do it for you.",
    "ko-KR": "Railway는 GitHub App으로 저장소를 봅니다. 그 화면에서 대상 저장소를 추가하지 않으면 빌드가 \"GitHub Repo not found\"로 실패합니다. 이 설정은 GitHub에서 계정 주인만 바꿀 수 있어 마법사가 대신 처리할 수 없습니다.",
    "ja-JP": "Railway は GitHub App でリポジトリを参照します。その画面で対象リポジトリを追加しないと、ビルドが \"GitHub Repo not found\" で失敗します。この設定は GitHub 上でアカウント所有者のみ変更できるため、ウィザードが代行できません。",
  },
  githubTokenIssue: { "en-US": "Create a classic token (repo scope)", "ko-KR": "classic 토큰 발급하기 (repo 권한)", "ja-JP": "classic トークンを発行 (repo 権限)" },
  githubTokenSteps: {
    "en-US": "On the page: set Expiration, tick the repo scope, then Generate token and paste the ghp_ value here.",
    "ko-KR": "열린 화면에서 만료일을 정하고 repo 항목을 체크한 뒤 Generate token 을 눌러 ghp_ 로 시작하는 값을 여기에 붙여넣으세요.",
    "ja-JP": "開いた画面で有効期限を設定し repo にチェックを入れ、Generate token を押して ghp_ で始まる値をここに貼り付けてください。",
  },
  scaffoldRunning: { "en-US": "Creating… takes 1-2 minutes", "ko-KR": "생성 중… 1~2분 걸립니다", "ja-JP": "作成中… 1〜2分かかります" },
  scaffoldHint: {
    "en-US": "Copies pages, scripts, styles and public assets into the target repository, adds the template package as a vendored tarball, and writes package.json and next.config.js. Clone it and start developing.",
    "ko-KR": "대상 저장소에 화면·스크립트·스타일·공용자산을 넣고, 템플릿 패키지를 vendor tarball 로 추가한 뒤 package.json 과 next.config.js 를 만듭니다. clone 해서 바로 개발할 수 있습니다.",
    "ja-JP": "対象リポジトリに画面・スクリプト・スタイル・公開資産を入れ、テンプレートを vendor tarball として追加し、package.json と next.config.js を作成します。clone してすぐ開発できます。",
  },
  dbPoolHint: { "en-US": "DB_POOL_MAX controls general PostgreSQL API concurrency per replica.", "ko-KR": "DB_POOL_MAX는 복제 인스턴스별 일반 PostgreSQL API 동시 실행 수를 제어합니다.", "ja-JP": "DB_POOL_MAX は replica ごとの一般 PostgreSQL API 同時実行数を制御します。" },
  chatPoolHint: { "en-US": "CHAT_DB_POOL_MAX controls chat/socket DB pressure per replica.", "ko-KR": "CHAT_DB_POOL_MAX는 복제 인스턴스별 채팅/소켓 DB 부하를 제어합니다.", "ja-JP": "CHAT_DB_POOL_MAX は replica ごとのチャット/ソケット DB 負荷を制御します。" },
  pushHint: { "en-US": "PUSH_* limits outbound push fan-out so API requests do not starve.", "ko-KR": "PUSH_*는 외부 푸시 fan-out을 제한해 API 요청 자원 고갈을 방지합니다.", "ja-JP": "PUSH_* は外部 push fan-out を制限し、API リクエストの枯渇を防ぎます。" },
  replicaHint: { "en-US": "For 2+ Railway replicas, enable Redis before health check.", "ko-KR": "Railway 복제 인스턴스를 2개 이상 쓰면 기동 확인 전에 Redis를 활성화하세요.", "ja-JP": "Railway replica が 2 つ以上の場合は、起動確認前に Redis を有効化してください。" },
  appServiceEnv: { "en-US": "AP service environment", "ko-KR": "AP 서비스 환경변수", "ja-JP": "AP サービス環境変数" },
  performanceParams: { "en-US": "Performance parameters", "ko-KR": "성능 파라미터", "ja-JP": "性能パラメータ" },
  libraryPackageName: { "en-US": "Library package name", "ko-KR": "라이브러리 패키지명", "ja-JP": "ライブラリパッケージ名" },
  libraryPackageHint: {
    "en-US": "Registered as BRUNNER_TEMPLATE_PACKAGE for deployments that consume brunner-template as a packaged library.",
    "ko-KR": "brunner-template 패키지 라이브러리를 사용하는 배포에서 BRUNNER_TEMPLATE_PACKAGE로 등록됩니다.",
    "ja-JP": "brunner-template をパッケージライブラリとして使用するデプロイで BRUNNER_TEMPLATE_PACKAGE として登録されます。",
  },
  deployNeedsService: {
    "en-US": "Run the NextJS service step first. This step deploys the service created there, so it fails without a service ID.",
    "ko-KR": "먼저 NextJS 서비스 단계를 실행하세요. 이 단계는 거기서 만든 서비스를 배포하므로 서비스 ID가 없으면 실패합니다.",
    "ja-JP": "先に NextJS サービスのステップを実行してください。このステップはそこで作成したサービスをデプロイするため、サービス ID がないと失敗します。",
  },
  deployTargetService: { "en-US": "Service to deploy", "ko-KR": "배포할 서비스", "ja-JP": "デプロイ対象サービス" },
  buildStatus: { "en-US": "Build status", "ko-KR": "빌드 상태", "ja-JP": "ビルド状態" },
  buildWatching: { "en-US": "Watching the build. It usually takes 3-5 minutes.", "ko-KR": "빌드를 지켜보는 중입니다. 보통 3~5분 걸립니다.", "ja-JP": "ビルドを監視しています。通常 3〜5 分かかります。" },
  buildSucceeded: { "en-US": "Build succeeded. Continue to the health check step.", "ko-KR": "빌드에 성공했습니다. 기동 확인 단계로 넘어가세요.", "ja-JP": "ビルドに成功しました。起動確認ステップへ進んでください。" },
  buildLogTitle: { "en-US": "Build log", "ko-KR": "빌드 로그", "ja-JP": "ビルドログ" },
  buildFailed: { "en-US": "Build failed. Open the service in Railway and read the build log.", "ko-KR": "빌드에 실패했습니다. Railway에서 해당 서비스의 빌드 로그를 확인하세요.", "ja-JP": "ビルドに失敗しました。Railway でサービスのビルドログを確認してください。" },
  deployDesc: {
    "en-US": "Railway deploys the selected repository branch. The npm packaging workflow should live in the repository pipeline.",
    "ko-KR": "Railway는 선택한 저장소 브랜치를 배포합니다. npm 패키징 흐름은 저장소 파이프라인에 포함되어야 합니다.",
    "ja-JP": "Railway は選択したリポジトリブランチをデプロイします。npm パッケージング手順はリポジトリパイプラインに含めます。",
  },
  createRedis: { "en-US": "Create Redis service for replica synchronization", "ko-KR": "Replica 동기화용 Redis 서비스 생성", "ja-JP": "Replica 同期用 Redis サービスを作成" },
  redisName: { "en-US": "Redis service name", "ko-KR": "Redis 서비스명", "ja-JP": "Redis サービス名" },
  redisId: { "en-US": "Redis service ID", "ko-KR": "Redis 서비스 ID", "ja-JP": "Redis サービス ID" },
  apRedisUrl: { "en-US": "AP REDIS_URL", "ko-KR": "AP REDIS_URL", "ja-JP": "AP REDIS_URL" },
  redisUrlHint: {
    "en-US": "Used by Socket.IO Redis adapter and replica synchronization when Railway replicas are enabled.",
    "ko-KR": "Railway replica 사용 시 Socket.IO Redis adapter와 서버 동기화에 사용됩니다.",
    "ja-JP": "Railway replica 使用時に Socket.IO Redis adapter とサーバー同期で使用されます。",
  },
  redisDesc: {
    "en-US": "This step is optional. Single-instance deployments can skip Redis; replicated deployments should enable it so server instances share realtime events.",
    "ko-KR": "이 단계는 선택사항입니다. 단일 인스턴스 배포는 건너뛰어도 되지만, replica 배포는 서버 간 실시간 이벤트 공유를 위해 활성화하세요.",
    "ja-JP": "このステップは任意です。単一インスタンスでは省略できますが、replica デプロイではサーバー間でリアルタイムイベントを共有するため有効化してください。",
  },
  serviceUrl: { "en-US": "Service URL", "ko-KR": "서비스 URL", "ja-JP": "サービス URL" },
  healthDesc: {
    "en-US": "A response with an HTTP status below 500 is treated as a successful startup signal.",
    "ko-KR": "HTTP 상태가 500 미만이면 기동 성공 신호로 판단합니다.",
    "ja-JP": "HTTP ステータスが 500 未満なら起動成功として扱います。",
  },
  variablePreview: { "en-US": "Variable preview", "ko-KR": "환경변수 미리보기", "ja-JP": "変数プレビュー" },
  dbService: { "en-US": "DB service", "ko-KR": "DB 서비스", "ja-JP": "DB サービス" },
  apService: { "en-US": "AP service", "ko-KR": "AP 서비스", "ja-JP": "AP サービス" },
  required: { "en-US": "required", "ko-KR": "필수", "ja-JP": "必須" },
  runLog: { "en-US": "Run log", "ko-KR": "실행 로그", "ja-JP": "実行ログ" },
  noLogs: { "en-US": "No run logs yet.", "ko-KR": "아직 실행 로그가 없습니다.", "ja-JP": "実行ログはまだありません。" },
  executionResult: { "en-US": "Execution result", "ko-KR": "실행 결과", "ja-JP": "実行結果" },
  close: { "en-US": "Close", "ko-KR": "닫기", "ja-JP": "閉じる" },
  presetScope: {
    "en-US": "Shared setting. It fills the PostgreSQL read replica count, NextJS instance count, Redis usage, and performance variables in the later steps. Each value can still be changed there.",
    "ko-KR": "공용 설정입니다. 이후 단계의 PostgreSQL 읽기 복제본 수, NextJS 인스턴스 수, Redis 사용 여부, 성능 환경변수를 함께 채웁니다. 각 단계에서 값을 바꿀 수 있습니다.",
    "ja-JP": "共通設定です。以降のステップの PostgreSQL リードレプリカ数、NextJS インスタンス数、Redis 使用有無、性能変数をまとめて設定します。各ステップで変更できます。",
  },
  devPreset: { "en-US": "Development", "ko-KR": "개발/검증", "ja-JP": "開発・検証" },
  devHint: {
    "en-US": "1 instance, no read replica, no Redis. SQL logging on, cleanup batches off.",
    "ko-KR": "인스턴스 1개, 읽기 복제본 없음, Redis 없음. SQL 로그를 켜고 정리 배치는 끕니다.",
    "ja-JP": "インスタンス 1、リードレプリカなし、Redis なし。SQL ログを有効化し、整理バッチは無効化します。",
  },
  smallPreset: { "en-US": "Small", "ko-KR": "소형", "ja-JP": "小規模" },
  standardPreset: { "en-US": "Standard", "ko-KR": "표준", "ja-JP": "標準" },
  replicasPreset: { "en-US": "Replicas", "ko-KR": "복제 운영", "ja-JP": "レプリカ運用" },
  smallHint: { "en-US": "1 replica, light traffic, lowest DB connection pressure.", "ko-KR": "복제 1개, 낮은 트래픽, DB 연결 부담 최소화.", "ja-JP": "1 replica、軽いトラフィック、DB 接続負荷を最小化。" },
  standardHint: { "en-US": "2 NextJS instances, 1 PostgreSQL read replica, normal chat/API usage.", "ko-KR": "NextJS 인스턴스 2개, PostgreSQL 읽기 복제본 1개, 일반적인 채팅/API 사용.", "ja-JP": "NextJS インスタンス 2、PostgreSQL リードレプリカ 1、通常のチャット/API 利用。" },
  replicasHint: { "en-US": "2+ replicas with Redis synchronization enabled.", "ko-KR": "Redis 동기화를 사용하는 복제 2개 이상 운영.", "ja-JP": "Redis 同期を有効化した 2+ replicas。" },
  missingTitle: {
    "en-US": "Not ready yet",
    "ko-KR": "아직 준비되지 않았습니다",
    "ja-JP": "まだ準備できていません",
  },
  needAccountToken: {
    "en-US": "Enter the Railway Account Token in step 1.",
    "ko-KR": "1단계 Railway Account Token 을 입력하세요.",
    "ja-JP": "ステップ1の Railway Account Token を入力してください。",
  },
  needWorkspace: {
    "en-US": "Select a workspace in step 2.",
    "ko-KR": "2단계에서 워크스페이스를 선택하세요.",
    "ja-JP": "ステップ2でワークスペースを選択してください。",
  },
  needProjectName: {
    "en-US": "Enter a project name.",
    "ko-KR": "프로젝트명을 입력하세요.",
    "ja-JP": "プロジェクト名を入力してください。",
  },
  nameTakenReuse: {
    "en-US": "A project with this name already exists, so it would be reused instead of created. Use a different name, or switch to Use existing.",
    "ko-KR": "같은 이름의 프로젝트가 이미 있어 새로 만들지 않고 재사용하게 됩니다. 다른 이름을 쓰거나 기존 사용 으로 바꾸세요.",
    "ja-JP": "同名のプロジェクトが既にあるため再利用になります。別の名前を使うか、既存を使用 に切り替えてください。",
  },
  reusedProject: {
    "en-US": "An existing project was reused instead of creating a new one.",
    "ko-KR": "새로 만들지 않고 기존 프로젝트를 재사용했습니다.",
    "ja-JP": "新規作成せず既存プロジェクトを再利用しました。",
  },
  needProjectId: {
    "en-US": "Run step 2 first so the project ID is filled in.",
    "ko-KR": "2단계를 먼저 실행해 프로젝트 ID 를 채우세요.",
    "ja-JP": "先にステップ2を実行してプロジェクト ID を埋めてください。",
  },
  envMismatch: {
    "en-US": "The environment ID did not belong to this project, so it was replaced with this project default.",
    "ko-KR": "환경 ID 가 이 프로젝트의 것이 아니어서 이 프로젝트의 기본 환경으로 바꿨습니다.",
    "ja-JP": "環境 ID がこのプロジェクトのものではないため、既定の環境に置き換えました。",
  },
  needDatabaseUrl: {
    "en-US": "Run step 3 first so DATABASE_URL is filled in.",
    "ko-KR": "3단계를 먼저 실행해 DATABASE_URL 을 채우세요.",
    "ja-JP": "先にステップ3を実行して DATABASE_URL を埋めてください。",
  },
  needSchemaFields: {
    "en-US": "DB_SCHEMA and SYSTEM_CODE are required.",
    "ko-KR": "DB_SCHEMA 와 SYSTEM_CODE 는 반드시 입력해야 합니다.",
    "ja-JP": "DB_SCHEMA と SYSTEM_CODE は必須です。",
  },
  needRepo: {
    "en-US": "Enter the target repository as owner/repo.",
    "ko-KR": "대상 저장소를 owner/repo 형식으로 입력하세요.",
    "ja-JP": "対象リポジトリを owner/repo 形式で入力してください。",
  },
  repoIsTemplate: {
    "en-US": "This is the template repository itself. Create an empty repository for the new service and enter that name instead.",
    "ko-KR": "이건 템플릿 저장소 자신입니다. 새 서비스용 빈 저장소를 만들어 그 이름을 넣으세요.",
    "ja-JP": "これはテンプレートリポジトリ自体です。新サービス用の空リポジトリ名を入力してください。",
  },
  needGithubToken: {
    "en-US": "Enter a GitHub token.",
    "ko-KR": "GitHub 토큰을 입력하세요.",
    "ja-JP": "GitHub トークンを入力してください。",
  },
  needServiceId: {
    "en-US": "Run step 5 first so the service ID is filled in.",
    "ko-KR": "5단계를 먼저 실행해 서비스 ID 를 채우세요.",
    "ja-JP": "先にステップ5を実行してサービス ID を埋めてください。",
  },
  needScaffoldFirst: {
    "en-US": "Run Create initial source in step 5 first. A repository with no commits has no branch, so the deploy cannot find it.",
    "ko-KR": "5단계의 초기 소스 생성 을 먼저 실행하세요. 커밋이 없는 저장소는 브랜치가 없어 배포가 브랜치를 찾지 못합니다.",
    "ja-JP": "先にステップ5の「初期ソース作成」を実行してください。コミットのないリポジトリにはブランチがありません。",
  },
  scaffoldDone: {
    "en-US": "Initial source has been created in this session.",
    "ko-KR": "이번 세션에서 초기 소스 생성을 완료했습니다.",
    "ja-JP": "このセッションで初期ソース作成が完了しました。",
  },
  scaffoldRequired: {
    "en-US": "Required. The deploy step needs a branch, and an empty repository has none until this runs.",
    "ko-KR": "필수입니다. 배포 단계는 브랜치가 있어야 하는데, 빈 저장소는 이것을 실행해야 브랜치가 생깁니다.",
    "ja-JP": "必須です。デプロイにはブランチが必要で、空のリポジトリはこれを実行して初めて作成されます。",
  },
  scaffoldDisabledWhy: {
    "en-US": "Enter the repository and the GitHub token to enable this button.",
    "ko-KR": "대상 저장소와 GitHub 토큰을 입력하면 이 버튼이 눌러집니다.",
    "ja-JP": "リポジトリと GitHub トークンを入力するとこのボタンが有効になります。",
  },
  projectPendingDeletion: {
    "en-US": "Railway keeps a deleted project around for a while before removing it, and it still shows up in the project list. The wizard found a project with this name but it is not usable. Enter a different project name, or wait until Railway finishes deleting the old one.",
    "ko-KR": "Railway 는 삭제한 프로젝트를 바로 없애지 않고 한동안 남겨 둡니다. 목록에는 보이지만 쓸 수 없는 상태라, 같은 이름으로 만들면 그 프로젝트를 재사용하려다 멈춥니다. 다른 프로젝트 이름을 넣거나, Railway 에서 완전히 삭제될 때까지 기다렸다 다시 시도하세요.",
    "ja-JP": "Railway は削除したプロジェクトをすぐには消さず、しばらく残します。一覧には出ますが使用できない状態のため、同じ名前で作成すると再利用しようとして止まります。別のプロジェクト名を入力するか、Railway が完全に削除するまで待ってから再試行してください。",
  },
  projectTokenNotAuthorized: {
    "en-US": "Railway rejected the project token. A project token only works for the project it was issued for. Clear the Railway Project Token field to use the account token instead.",
    "ko-KR": "Railway 가 프로젝트 토큰을 거절했습니다. 프로젝트 토큰은 발급받은 그 프로젝트에서만 유효합니다. Railway Project Token 칸을 비우면 Account 토큰으로 진행합니다.",
    "ja-JP": "Railway がプロジェクトトークンを拒否しました。プロジェクトトークンは発行元プロジェクトでのみ有効です。空欄にすると Account トークンを使用します。",
  },
  optional: { "en-US": "optional", "ko-KR": "선택", "ja-JP": "任意" },
  deploymentGone: {
    "en-US": "Railway no longer reports this deployment. It most likely failed and was removed. Open the service in Railway and read the deploy log.",
    "ko-KR": "Railway 가 이 배포를 더 이상 보고하지 않습니다. 실패해서 제거된 경우가 대부분입니다. Railway 에서 해당 서비스의 배포 로그를 확인하세요.",
    "ja-JP": "Railway がこのデプロイを報告しなくなりました。失敗して削除された可能性が高いです。デプロイログを確認してください。",
  },
  noAutoDeployAfterPush: {
    "en-US": "The repository was pushed but Railway did not start a deployment within a minute. Check that the repository is added in the Railway GitHub App settings. A deployment will be started manually now.",
    "ko-KR": "저장소에 커밋을 올렸지만 Railway 가 1분 안에 배포를 시작하지 않았습니다. Railway GitHub App 설정에 이 저장소가 추가되어 있는지 확인하세요. 지금은 수동으로 배포를 겁니다.",
    "ja-JP": "リポジトリに push しましたが、Railway が 1 分以内にデプロイを開始しませんでした。GitHub App 設定にこのリポジトリが追加されているか確認してください。今回は手動でデプロイします。",
  },
  supersededNotFound: {
    "en-US": "This deployment was replaced but the new one could not be found. Open the service in Railway and check its Deployments tab.",
    "ko-KR": "이 배포가 대체되었는데 새 배포를 찾지 못했습니다. Railway 에서 해당 서비스의 Deployments 탭을 확인하세요.",
    "ja-JP": "このデプロイは置き換えられましたが、新しいデプロイが見つかりません。Deployments タブを確認してください。",
  },
  scaffoldAlreadyDone: {
    "en-US": "Initial source has already been created in this session. Running it again would push another commit and start another build.",
    "ko-KR": "이번 세션에서 초기 소스를 이미 만들었습니다. 다시 실행하면 커밋이 한 번 더 올라가 빌드가 또 돕니다.",
    "ja-JP": "このセッションで初期ソースは作成済みです。再実行するともう一度コミットが push され、ビルドが再度走ります。",
  },
  redisSkipped: {
    "en-US": "Redis was not created because the option is off. Turn it on and run this step again if you need Redis.",
    "ko-KR": "Redis 생성 옵션이 꺼져 있어 만들지 않았습니다. 필요하면 옵션을 켜고 이 단계를 다시 실행하세요.",
    "ja-JP": "Redis 作成オプションがオフのため作成していません。必要ならオンにして再実行してください。",
  },
  staleServiceCleared: {
    "en-US": "The stored service no longer exists in this project, so it will be created again.",
    "ko-KR": "저장된 서비스가 이 프로젝트에 더 이상 없어 새로 만듭니다.",
    "ja-JP": "保存されたサービスがこのプロジェクトに存在しないため、作成し直します。",
  },
  deploymentSuperseded: {
    "en-US": "This deployment was replaced by a newer one; following that instead",
    "ko-KR": "이 배포는 새 배포로 대체되었습니다 — 그쪽을 지켜봅니다",
    "ja-JP": "このデプロイは新しいものに置き換えられました — そちらを追跡します",
  },
  noDeployLogs: {
    "en-US": "Railway returned no build or deploy log for this deployment. Open the service in Railway and read its Deployments tab.",
    "ko-KR": "Railway 가 이 배포의 빌드·배포 로그를 주지 않았습니다. Railway 에서 해당 서비스의 Deployments 탭을 직접 확인하세요.",
    "ja-JP": "Railway がこのデプロイのログを返しませんでした。Railway のサービスの Deployments タブを確認してください。",
  },
  lookingForActiveDeploy: {
    "en-US": "Checking whether Railway already started a deployment",
    "ko-KR": "Railway 가 이미 배포를 시작했는지 확인하는 중",
    "ja-JP": "Railway が既にデプロイを開始したか確認中",
  },
  dbProvisioning: {
    "en-US": "The database is starting. Waiting until it accepts connections",
    "ko-KR": "데이터베이스가 기동 중입니다. 접속을 받을 때까지 기다립니다",
    "ja-JP": "データベースを起動中です。接続を受け付けるまで待機します",
  },
  dbReadyAfter: {
    "en-US": "The database accepted a connection on attempt",
    "ko-KR": "데이터베이스가 접속을 받았습니다 — 시도",
    "ja-JP": "データベースが接続を受け付けました — 試行",
  },
  dbReady: {
    "en-US": "The PostgreSQL service is up and accepting connections.",
    "ko-KR": "PostgreSQL 서비스가 기동되어 접속을 받고 있습니다.",
    "ja-JP": "PostgreSQL サービスが起動し接続を受け付けています。",
  },
  dbNeverReady: {
    "en-US": "The database did not accept a connection within about a minute. Open the service in Railway and check whether the deployment is online.",
    "ko-KR": "1분 가까이 기다렸지만 데이터베이스가 접속을 받지 않았습니다. Railway 에서 해당 서비스의 배포가 online 인지 확인하세요.",
    "ja-JP": "1 分ほど待っても接続を受け付けませんでした。Railway でデプロイが online か確認してください。",
  },
  healthHttpFailed: {
    "en-US": "The service URL did not answer with a healthy status.",
    "ko-KR": "서비스 URL 이 정상 상태로 응답하지 않았습니다.",
    "ja-JP": "サービス URL が正常な状態で応答しませんでした。",
  },
  verifyPassed: {
    "en-US": "Installation verified",
    "ko-KR": "설치 검증 통과",
    "ja-JP": "インストール検証に合格",
  },
  verifyFailed: {
    "en-US": "Installation is not complete",
    "ko-KR": "설치가 아직 완료되지 않았습니다",
    "ja-JP": "インストールがまだ完了していません",
  },
  verifyVersion: { "en-US": "Version", "ko-KR": "버전", "ja-JP": "バージョン" },
  verifyStartedAt: { "en-US": "Process started", "ko-KR": "프로세스 기동", "ja-JP": "プロセス起動" },
  buildWatchTimeout: {
    "en-US": "Stopped watching after 10 minutes without a final build status. Open the service in Railway and check the deployment.",
    "ko-KR": "10분 동안 빌드 최종 상태가 오지 않아 감시를 멈췄습니다. Railway 에서 해당 서비스의 배포 상태를 직접 확인하세요.",
    "ja-JP": "10 分間ビルドの最終状態が得られず監視を停止しました。Railway でデプロイ状態を確認してください。",
  },
  projectTokenOptionalHint: {
    "en-US": "Optional. Leave it blank to use the account token for every step. A project token exists only after the project does, so when creating a new project leave this blank, run the step, then come back and paste a token issued for the project that was just created.",
    "ko-KR": "선택 입력입니다. 비워두면 모든 단계에서 Account 토큰을 씁니다. 프로젝트 토큰은 프로젝트가 만들어진 뒤에야 발급할 수 있으므로, 신규 생성이라면 비워둔 채로 이 단계를 실행하고 만들어진 프로젝트에서 토큰을 발급해 그때 넣으세요.",
    "ja-JP": "任意です。空欄なら全ステップで Account トークンを使用します。プロジェクトトークンはプロジェクト作成後にのみ発行できるため、新規作成の場合は空欄のままこのステップを実行し、作成されたプロジェクトで発行したトークンを後から入力してください。",
  },
  prereqAllHere: {
    "en-US": "The three values below are used all the way to the last step. Enter them once here and the later steps read them from here instead of asking again.",
    "ko-KR": "아래 세 개 값은 마지막 단계까지 계속 쓰입니다. 여기서 한 번만 입력해 두면 뒤 단계에서는 다시 묻지 않고 읽기 전용으로 가져다 씁니다.",
    "ja-JP": "以下の 3 つの値は最後のステップまで使います。ここで一度入力しておけば、後のステップでは再度尋ねずに読み取り専用で参照します。",
  },
  bulkPasteTitle: {
    "en-US": "Paste all three values at once",
    "ko-KR": "세 개 값 한 번에 붙여넣기",
    "ja-JP": "3 つの値をまとめて貼り付け",
  },
  bulkPasteHint: {
    "en-US": "Paste each value after its label below. You can also delete the labels and paste three bare values — order does not matter, they are sorted by shape. The fields below fill in as you type, and each one can still be edited afterwards. A full repository URL is trimmed to owner/repo.",
    "ko-KR": "아래 각 라벨 뒤에 값을 붙여넣으세요. 라벨 줄을 지우고 값만 세 줄 넣어도 되고, 순서가 달라도 값 모양으로 알아서 나눠 담습니다. 넣는 대로 아래 칸이 채워지고, 채운 뒤에도 각 칸은 그대로 고칠 수 있습니다. 저장소는 주소를 통째로 붙여넣어도 owner/repo 로 정리합니다.",
    "ja-JP": "下の各ラベルの後ろに値を貼り付けてください。ラベル行を消して値だけ 3 行入れても構いません。順序が違っても値の形で振り分けます。入力すると下の欄が埋まり、後から各欄を編集できます。リポジトリは URL をそのまま貼っても owner/repo に整形します。",
  },
  bulkPasteFilled: { "en-US": "Filled", "ko-KR": "채운 항목", "ja-JP": "入力済み" },
  bulkPasteNothing: {
    "en-US": "Nothing recognised yet. Put one value per line.",
    "ko-KR": "아직 알아본 값이 없습니다. 한 줄에 한 값씩 넣어 주세요.",
    "ja-JP": "まだ認識できた値がありません。1 行に 1 つずつ入れてください。",
  },
  bulkPasteReset: { "en-US": "Reset the form", "ko-KR": "양식 초기화", "ja-JP": "様式を初期化" },
  appRedeployTitle: {
    "en-US": "The app is redeploying to pick up Redis",
    "ko-KR": "Redis 를 붙이려고 앱을 다시 배포하는 중입니다",
    "ja-JP": "Redis を反映するためアプリを再デプロイしています",
  },
  appRedeployWhy: {
    "en-US": "The app reads REDIS_URL once at startup, so it has to start again now that the Redis service exists. Railway rebuilds a service when its variables change. The health check step would read the old instance, so this step waits here until the redeploy finishes.",
    "ko-KR": "앱은 REDIS_URL 을 기동할 때 한 번만 읽습니다. Redis 서비스가 생긴 지금 다시 떠야 붙습니다. Railway 는 변수가 바뀌면 그 서비스를 다시 빌드합니다. 기다리지 않으면 기동 확인 단계가 옛 인스턴스를 읽어 실패하므로, 재배포가 끝날 때까지 이 단계에서 기다립니다.",
    "ja-JP": "アプリは REDIS_URL を起動時に一度だけ読みます。Redis サービスができた今、もう一度起動して初めて接続されます。Railway は変数が変わるとそのサービスを再ビルドします。待たないと起動確認ステップが古いインスタンスを読んで失敗するため、再デプロイが終わるまでこのステップで待ちます。",
  },
  appRedeployDetecting: {
    "en-US": "Waiting for Railway to start the redeploy",
    "ko-KR": "Railway 가 재배포를 시작하기를 기다리는 중",
    "ja-JP": "Railway が再デプロイを開始するのを待っています",
  },
  appRedeployBuilding: {
    "en-US": "Redeploy running. Watching until the build and start finish",
    "ko-KR": "재배포 진행 중. 빌드와 기동이 끝날 때까지 지켜보는 중",
    "ja-JP": "再デプロイ中。ビルドと起動が終わるまで見守っています",
  },
  appRedeployNotSeen: {
    "en-US": "Railway did not start a redeploy for the app service. It may already carry the Redis reference. The health check step confirms it either way.",
    "ko-KR": "Railway 가 앱 서비스 재배포를 시작하지 않았습니다. 이미 Redis 참조를 들고 있을 수 있습니다. 어느 쪽이든 기동 확인 단계에서 확인합니다.",
    "ja-JP": "Railway はアプリサービスの再デプロイを開始しませんでした。すでに Redis 参照を持っている可能性があります。いずれにせよ起動確認ステップで確認します。",
  },
  verifyWaiting: {
    "en-US": "Reading the app's own status report. Retrying while it finishes starting",
    "ko-KR": "앱이 보고하는 상태를 읽는 중. 기동이 끝날 때까지 다시 확인합니다",
    "ja-JP": "アプリの状態レポートを読んでいます。起動が終わるまで再確認します",
  },
  enteredInStep1: {
    "en-US": "Entered in step 1. Change it there if it is wrong.",
    "ko-KR": "1단계에서 입력한 값입니다. 고치려면 1단계에서 바꾸세요.",
    "ja-JP": "ステップ 1 で入力した値です。修正はステップ 1 で行ってください。",
  },
  goToStep1: { "en-US": "Edit in step 1", "ko-KR": "1단계에서 고치기", "ja-JP": "ステップ 1 で修正" },
  notEnteredYet: {
    "en-US": "Not entered in step 1 yet",
    "ko-KR": "1단계에서 아직 입력하지 않았습니다",
    "ja-JP": "ステップ 1 でまだ入力していません",
  },
};

const textFor = (key, languageCode = "en-US") => i18n[key]?.[languageCode] || i18n[key]?.["en-US"] || key;

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
  ["DB_SCHEMA", "brunner"],
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
  // 데이터베이스가 접속을 받기까지 기다리는 중임을 화면에 보여준다.
  const [dbWaiting, setDbWaiting] = useState(null);
  // state 갱신을 기다리는 사이 두 번째 호출이 들어가는 것을 막는다.
  const scaffoldInFlight = useRef(false);
  // 한 단계는 API 호출 여러 개로 이루어진다. callApi 가 호출마다 running 을
  // 비우기 때문에 그 틈에 버튼이 다시 눌렸다. 단계 전체가 끝날 때까지 잠근다.
  const [stepBusy, setStepBusy] = useState(false);
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
    projectName: "brunner-production",
    projectDescription: textFor("defaultProjectDescription", initialLanguageCode),
    environmentId: "",
    postgresServiceId: "",
    postgresName: "brunner-postgres",
    dbReadReplicas: "0",
    appReplicas: "1",
    databaseUrl: "",
    schemaName: "brunner",
    systemCode: "00",
    serviceId: "",
    serviceName: "brunner-nextjs",
    githubRepo: "",
    githubBranch: "main",
    githubToken: "",
    serviceDomain: "",
    redisEnabled: true,
    redisServiceId: "",
    redisName: "brunner-redis",
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
  const watchDeployment = async (deploymentId, stepId = "deploy", { silent = false, label = "", serviceId = "" } = {}) => {
    appendLog("success", "watchDeployment", `${label || stepId}: ${deploymentId}`);
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
    "deployService",
    "createRedis",
  ]);

  const callApi = async (action, body = {}, stepId = steps[active].id, options = {}) => {
    setRunning(action);
    setStepState((prev) => ({ ...prev, [stepId]: "running" }));
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
      setStepState((prev) => ({ ...prev, [stepId]: "done" }));
      const detail = JSON.stringify(payload.data, null, 2);
      appendLog("success", action, detail);
      if (!options.silent) showResult("success", action, detail);
      return payload.data;
    } catch (error) {
      setStepState((prev) => ({ ...prev, [stepId]: "error" }));
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
          setActive(2);
        }
      } else if (form.projectId) {
        setStepState((prev) => ({ ...prev, project: "done" }));
        appendLog("success", "selectProject", form.projectId);
        await loadProjectContext(form.projectId);
        setActive(2);
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
      let serviceId = form.serviceId;
      // 서비스를 붙이기 전에 저장소를 채운다. 사용자가 버튼을 따로 누르지
      // 않아도 되고, 빌드도 한 번만 돈다.
      if (!scaffoldDone) {
        const scaffolded = await runScaffold();
        if (!scaffolded) return;
      }
      if (!serviceId) {
        const data = await callApi("createNextService", {
          projectId: form.projectId,
          environmentId: form.environmentId,
          service: {
            name: form.serviceName,
            githubRepo: form.githubRepo,
            githubBranch: form.githubBranch,
          },
        });
        const service = data?.serviceCreate;
        serviceId = service?.id || "";
        if (!serviceId) return; // 생성에 실패했는데 다음 단계로 넘어가면 실패를 못 알아챈다.
        update("serviceId", serviceId);
        await loadProjectServices(form.projectId);
      }
      if (serviceId) {
        await callApi("upsertVariables", {
          projectId: form.projectId,
          environmentId: form.environmentId,
          serviceId,
          variables: appEnvVars,
        }, "service");
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
      const waitRounds = scaffoldDone ? 12 : 4;
      let active = null;
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
      if (!active?.deployment?.id && scaffoldDone) {
        // 스캐폴드를 했는데 1분이 지나도 배포가 없다. 저장소 접근 설정이
        // 빠졌을 때가 대부분이라, 새로 걸기 전에 그 사실을 알린다.
        showResult("error", t("missingTitle"), t("noAutoDeployAfterPush"));
      }
      if (active?.deployment?.id) {
        setDeployment({ id: active.deployment.id, status: active.deployment.status });
        appendLog("success", "activeDeployment", `이미 진행 중인 배포를 지켜봅니다: ${active.deployment.status}`);
        watchDeployment(active.deployment.id);
        return;
      }
      const data = await callApi("deployService", {
        serviceId: form.serviceId,
        environmentId: form.environmentId,
      });
      const deploymentId = data?.serviceInstanceDeployV2;
      if (typeof deploymentId === "string") {
        setDeployment({ id: deploymentId, status: "PENDING" });
        // 빌드가 도는 동안은 이 단계에 머문다. 바로 다음 단계로 넘기면 정작
        // 지켜보라고 만든 상태 표시를 볼 수 없다.
        watchDeployment(deploymentId);
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
      const attempts = 12;
      let health = null;
      let verified = null;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        setVerifyWaiting({ attempt, attempts });
        health = await callApi("checkHealth", { url: healthUrl }, "health", { silent: true });
        if (health?.ok) {
          // 앱이 자기 상태를 보고하게 해서 DB·Redis 까지 확인한다.
          verified = await callApi("verifyInstall", {
            url: healthUrl,
            expectRedis: Boolean(form.redisEnabled),
          }, "health", { silent: true });
          if (verified?.ok) break;
        }
        if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 10000));
      }
      setVerifyWaiting(null);
      if (!health?.ok) {
        setStepState((prev) => ({ ...prev, health: "error" }));
        showResult("error", t("missingTitle"), t("healthHttpFailed") + LINE_BREAK + JSON.stringify(health, null, 2));
        return;
      }
      if (!verified) return;
      const lines = Object.entries(verified.checks || {})
        .filter(([, value]) => value !== null)
        .map(([key, value]) => `${value ? "OK" : "FAIL"}  ${key}`);
      const detail = [
        `${t("verifyVersion")}: ${verified.version || "-"}`,
        `${t("verifyStartedAt")}: ${verified.startedAt || "-"}`,
        "",
        ...lines,
      ].join(LINE_BREAK);
      if (!verified.ok) {
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
            <Button onClick={runCurrentStep} disabled={stepBusy || Boolean(running)}>{stepBusy || running ? t("running") : t("runCurrentStep")}</Button>
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
                      <Field label={t("projectName")}><Input value={form.projectName} onChange={(event) => update("projectName", event.target.value)} inputClassName={requiredBox(form.projectName)} /></Field>
                      <Field label={t("description")}><Input value={form.projectDescription} onChange={(event) => update("projectDescription", event.target.value)} /></Field>
                    </div>
                  ) : (
                    <Field label={t("existingProject")}>
                      <select
                        className={`h-11 w-full rounded-[var(--radius-md)] border bg-[var(--surface)] px-3 text-sm ${requiredBox(form.projectId)}`}
                        value={form.projectId}
                        onChange={(event) => update("projectId", event.target.value)}
                      >
                        <option value="">{t("selectProject")}</option>
                        {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                      </select>
                    </Field>
                  )}
                  <Field label={t("projectId")}>
                    <Input
                      value={form.projectId}
                      onChange={(event) => update("projectId", event.target.value)}
                      placeholder={form.projectMode === "new" ? t("projectIdAuto") : t("projectIdExisting")}
                      inputClassName={form.projectMode === "existing" ? requiredBox(form.projectId) : ""}
                    />
                  </Field>
                  {/* 프로젝트 토큰은 프로젝트가 있어야 발급된다. 그래서 계정 토큰과 함께
                      1단계에서 묻지 않고, 프로젝트가 정해지는 이 단계에 둔다. */}
                  <Field label={`${t("railwayProjectToken")} (${t("optional")})`} hint={t("projectTokenOptionalHint")}>
                    <Input type="password" value={form.projectToken} onChange={(event) => update("projectToken", event.target.value)} placeholder="project token" />
                  </Field>
                </div>
              )}

              {active === 2 && (
                <div className="grid gap-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label={t("projectId")}><Input value={form.projectId} readOnly inputClassName="cursor-not-allowed opacity-80" placeholder={t("generatedAfterRun")} /></Field>
                    <Field label={t("postgresName")}><Input value={form.postgresName} onChange={(event) => update("postgresName", event.target.value)} inputClassName={requiredBox(form.postgresName)} /></Field>
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
                    <Field label={t("schemaName")} hint={t("schemaNameHint")}><Input value={form.schemaName} onChange={(event) => update("schemaName", normalizeSchemaInput(event.target.value))} inputClassName={requiredBox(form.schemaName)} /></Field>
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
                    <Field label={t("schemaName")} hint={t("schemaNameHint")}><Input value={form.schemaName} onChange={(event) => update("schemaName", normalizeSchemaInput(event.target.value))} inputClassName={requiredBox(form.schemaName)} /></Field>
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
                </div>
              )}

              {active === 4 && (
                <div className="grid gap-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label={t("nextServiceName")}><Input value={form.serviceName} onChange={(event) => update("serviceName", event.target.value)} inputClassName={requiredBox(form.serviceName)} /></Field>
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
                  <Button variant="ghost" disabled={active === steps.length - 1} onClick={() => goToStep(Math.min(steps.length - 1, active + 1))}>{t("next")}</Button>
                  <Button onClick={runCurrentStep} disabled={stepBusy || Boolean(running)}>{stepBusy || running ? t("running") : t("run")}</Button>
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
    </div>
  );
}

RailwayDeployWizard.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
