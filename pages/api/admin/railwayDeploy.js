import fs from "fs/promises";
import path from "path";
import { Client } from "pg";
import { SCHEMA } from "@/lib/dbSchema";
import { deploymentSystemCode } from "@/lib/tenantResolver";
import { verifySession } from "@/lib/serverSession";
import * as database from "@/pages/api/biz/database/database";
import * as dynamicSql from "@/pages/api/biz/dynamicSql";
import { scaffoldRepository } from "@/lib/repoScaffold";

const RAILWAY_GRAPHQL_URL = "https://backboard.railway.app/graphql/v2";

const json = (res, status, body) => res.status(status).json(body);

// 설치 마법사는 임의 DB 에 DDL 을 실행하고 임의 URL 로 요청을 보낸다. 신원 확인이
// 없으면 이 엔드포인트 주소만 알면 누구나 그 두 가지를 할 수 있다. dbUsage 의
// 관리자 검사와 같은 기준으로 세션부터 보고 admin_flag 를 확인한다.
const assertAdmin = async (body) => {
  try {
    const systemCode = deploymentSystemCode();
    if (!(await verifySession(SCHEMA, systemCode, body?.userId, body?.sessionToken))) return false;
    const userSql = await dynamicSql.getSQL(systemCode, "select_TB_COR_USER_MST", 1);
    const user = await database.executeSQL(userSql, [systemCode, body.userId]);
    const flag = user.rows[0]?.admin_flag;
    return flag === true || String(flag).toUpperCase() === "Y" || String(flag) === "true";
  } catch {
    // SYSTEM_CODE 미설정이나 DB 장애로 확인이 안 되면 통과시키지 않는다.
    return false;
  }
};

function railwayAuthHeaders(token, authMode = "account") {
  if (!token) {
    throw new Error("Railway API token is required.");
  }
  if (authMode === "project") {
    return { "Project-Access-Token": token };
  }
  return { Authorization: `Bearer ${token}` };
}

async function railwayGraphql(token, query, variables, authMode) {
  const response = await fetch(RAILWAY_GRAPHQL_URL, {
    method: "POST",
    headers: {
      ...railwayAuthHeaders(token, authMode),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errors?.length) {
    const message = payload.errors?.map((error) => error.message).join("\n") || `Railway API failed: ${response.status}`;
    throw new Error(message);
  }
  return payload.data;
}

// Railway 토큰은 종류마다 헤더가 다르다 — 계정/워크스페이스 토큰은 Bearer,
// 프로젝트 토큰만 Project-Access-Token 이다. 토큰 발급 화면이 워크스페이스를
// 고르게 되어 있어 "Project Token" 칸에 워크스페이스 토큰을 넣는 경우가 실제로
// 있으므로, 프로젝트 헤더가 거절당하면 Bearer 로 한 번 더 시도한다.
async function railwayRequest(token, query, variables = {}, authMode = "account") {
  try {
    return await railwayGraphql(token, query, variables, authMode);
  } catch (error) {
    if (authMode !== "project") throw error;
    return railwayGraphql(token, query, variables, "account");
  }
}

async function validateToken(token) {
  const query = `
    query BrunnerRailwayTokenCheck {
      projects {
        edges {
          node { id name }
        }
      }
    }
  `;
  const data = await railwayRequest(token, query);
  return {
    valid: true,
    projectCount: data.projects?.edges?.length || 0,
  };
}

async function validateProjectToken(token) {
  const query = `
    query BrunnerRailwayProjectTokenCheck {
      projectToken {
        projectId
        environmentId
      }
    }
  `;
  const data = await railwayRequest(token, query, {}, "project");
  return {
    valid: true,
    projectId: data.projectToken?.projectId || null,
    environmentId: data.projectToken?.environmentId || null,
  };
}

async function listWorkspaces(token, authMode = "account") {
  const query = `
    query BrunnerRailwayWorkspaces {
      me {
        workspaces { id name }
      }
    }
  `;
  const data = await railwayRequest(token, query, {}, authMode);
  return data.me?.workspaces || [];
}

async function listProjects(token, authMode = "account", workspaceId) {
  if (authMode === "project") {
    const projectTokenInfo = await validateProjectToken(token);
    return projectTokenInfo.projectId
      ? [{
          id: projectTokenInfo.projectId,
          name: "Project token project",
          description: "Resolved from Railway Project Token",
          environmentId: projectTokenInfo.environmentId,
        }]
      : [];
  }

  // Railway 는 프로젝트를 지워도 곧바로 없애지 않는다. 한동안 목록 API 에 그대로
  // 남아 있어서, 지운 이름으로 다시 만들려 하면 createProject 가 그 시체를 찾아
  // "이미 있으니 재사용" 으로 넘어간다. 그다음 단계들은 삭제 중인 프로젝트에 대고
  // 작업하다 멈춘다 — 사용자에게는 아무 설명 없이 진행이 안 되는 것으로 보인다.
  //
  // 그래서 deletedAt 을 함께 받아 걸러낸다. 다만 이 필드가 스키마에서 사라지면
  // 목록 조회가 통째로 죽으므로, 거절당하면 필드 없이 한 번 더 부른다.
  const projectFields = (withDeletedAt) =>
    `id name description createdAt${withDeletedAt ? " deletedAt" : ""}`;
  const buildQuery = (withDeletedAt) => `
    query BrunnerRailwayProjects($workspaceId: String) {
      projects(workspaceId: $workspaceId) {
        edges {
          node { ${projectFields(withDeletedAt)} }
        }
      }
    }
  `;

  // workspaceId 없이 부르면 개인 스코프만 조회돼 워크스페이스 프로젝트가 통째로
  // 빠진다. 목록이 항상 비어 보이던 원인이다.
  const variables = { workspaceId: workspaceId || undefined };
  let data;
  try {
    data = await railwayRequest(token, buildQuery(true), variables, authMode);
  } catch (error) {
    data = await railwayRequest(token, buildQuery(false), variables, authMode);
  }

  return (data.projects?.edges?.map((edge) => edge.node) || []).filter(
    (project) => !project?.deletedAt,
  );
}

async function createProject(token, name, description, authMode = "account", workspaceId) {
  if (authMode === "project") {
    const projectTokenInfo = await validateProjectToken(token);
    if (!projectTokenInfo.projectId) {
      throw new Error("Project token did not return a projectId.");
    }
    return {
      projectCreate: {
        id: projectTokenInfo.projectId,
        name: name || "Project token project",
        description: description || "Resolved from Railway Project Token",
      },
      reused: true,
      environmentId: projectTokenInfo.environmentId,
    };
  }

  const existing = (await listProjects(token, authMode, workspaceId)).find((project) => project.name === name);
  if (existing) {
    // 목록에 있어도 살아 있다는 뜻은 아니다. Railway 는 삭제한 프로젝트를 한동안
    // 남겨두는데, 그걸 재사용하면 이후 단계가 삭제 중인 프로젝트에 대고 작업하다
    // 조용히 멈춘다. 환경을 하나라도 돌려주는지로 생존을 확인한다.
    let alive = false;
    try {
      alive = (await listProjectEnvironments(token, existing.id, authMode)).length > 0;
    } catch {
      alive = false;
    }
    if (!alive) {
      throw new Error(
        `A project named "${name}" still appears in Railway but is not usable — it is most likely pending deletion. ` +
          "Railway keeps deleted projects for a while before removing them. " +
          "Use a different project name, or wait until Railway finishes deleting it.",
      );
    }
    return { projectCreate: existing, reused: true };
  }

  const query = `
    mutation BrunnerProjectCreate($input: ProjectCreateInput!) {
      projectCreate(input: $input) { id name description }
    }
  `;
  // workspaceId 를 빼면 Railway 가 "You must specify a workspaceId" 로 거절한다.
  return railwayRequest(token, query, { input: { name, description, workspaceId: workspaceId || undefined } }, authMode);
}

async function listProjectServices(token, projectId, authMode = "account") {
  try {
    return await listProjectServicesStrict(token, projectId, authMode);
  } catch {
    return [];
  }
}

async function listProjectServicesStrict(token, projectId, authMode = "account") {
  const query = `
    query BrunnerRailwayProjectServices($projectId: String!) {
      project(id: $projectId) {
        services {
          edges {
            node {
              id
              name
              serviceInstances {
                edges {
                  node { source { image } }
                }
              }
            }
          }
        }
      }
    }
  `;
  const data = await railwayRequest(token, query, { projectId }, authMode);
  return data.project?.services?.edges?.map((edge) => edge.node) || [];
}

async function listProjectEnvironments(token, projectId, authMode = "account") {
  if (authMode === "project") {
    const projectTokenInfo = await validateProjectToken(token);
    if (!projectTokenInfo.environmentId) return [];
    return [{
      id: projectTokenInfo.environmentId,
      name: "Project token environment",
    }];
  }

  const query = `
    query BrunnerRailwayProjectEnvironments($projectId: String!) {
      project(id: $projectId) {
        environments {
          edges {
            node { id name }
          }
        }
      }
    }
  `;
  const data = await railwayRequest(token, query, { projectId }, authMode);
  return data.project?.environments?.edges?.map((edge) => edge.node) || [];
}

async function findServiceByName(token, projectId, name, authMode = "account") {
  const services = await listProjectServices(token, projectId, authMode);
  return services.find((service) => service.name === name) || null;
}

async function deleteService(token, serviceId, authMode = "account") {
  const query = `
    mutation BrunnerServiceDelete($id: String!) {
      serviceDelete(id: $id)
    }
  `;
  return railwayRequest(token, query, { id: serviceId }, authMode);
}

async function getServiceById(token, serviceId, authMode = "account") {
  const query = `
    query BrunnerRailwayService($id: String!) {
      service(id: $id) { id name }
    }
  `;
  const data = await railwayRequest(token, query, { id: serviceId }, authMode);
  return data.service || null;
}

async function waitForServiceDeletion(token, projectId, name, authMode = "account", serviceId = "") {
  let lastError = "";
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      const services = await listProjectServicesStrict(token, projectId, authMode);
      const stillListed = services.some((service) => service.id === serviceId || service.name === name);
      const stillReadable = serviceId ? await getServiceById(token, serviceId, authMode).then(Boolean).catch((error) => {
        lastError = error.message;
        return false;
      }) : false;
      if (!stillListed && !stillReadable) return true;
    } catch (error) {
      lastError = error.message;
    }
  }
  if (lastError) throw new Error(`Could not confirm deletion of "${name}": ${lastError}`);
  return false;
}

// Railway 는 plugin 을 걷어내고 데이터베이스도 일반 서비스로 만든다. 예전
// pluginCreate 는 지금 Not Authorized 로 거절되므로 이미지 기반 serviceCreate 로
// 만들고 볼륨을 붙인다. 볼륨이 없으면 배포 자체가 거부된다.
// 기본은 Railway 가 실제로 쓰는 안정 이미지다. 읽기 복제본은 repmgr 이 들어 있는
// 이미지에서만 되는데 그쪽은 alpha 라, 이미지 자체가 "Railway 팀 권고 없이 쓰지
// 말라, 데이터 손실에 책임지지 않는다"고 경고한다. 복제본을 요청했을 때만 쓴다.
const POSTGRES_IMAGE = "ghcr.io/railwayapp-templates/postgres-ssl:16";
const POSTGRES_REPLICATION_IMAGE = "ghcr.io/railwayapp-templates/postgres:pg17.4-alpha";
const POSTGRES_MOUNT_PATH = "/var/lib/postgresql/data";
const REDIS_IMAGE = "redis:8.2.1";

// plugin 이 만들어 주던 비밀번호를 이제 아무도 만들어 주지 않는다. 설치하는 쪽이
// 정하지 않으면 빈 비밀번호로 DB 가 뜬다.
function generatePassword(length = 32) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

async function createServiceWithImage(token, projectId, environmentId, name, image, variables, authMode) {
  const query = `
    mutation BrunnerImageServiceCreate($input: ServiceCreateInput!) {
      serviceCreate(input: $input) { id name }
    }
  `;
  const data = await railwayRequest(token, query, {
    input: {
      projectId,
      environmentId: environmentId || undefined,
      name,
      source: { image },
      variables,
    },
  }, authMode);
  return data.serviceCreate;
}

async function createVolume(token, projectId, environmentId, serviceId, mountPath, authMode) {
  const query = `
    mutation BrunnerVolumeCreate($input: VolumeCreateInput!) {
      volumeCreate(input: $input) { id }
    }
  `;
  try {
    return await railwayRequest(token, query, {
      input: { projectId, environmentId: environmentId || undefined, serviceId, mountPath },
    }, authMode);
  } catch (error) {
    // 볼륨이 이미 있으면 재실행에서 실패한다. 그것 때문에 단계 전체를 되돌리지 않는다.
    return { volumeCreate: null, skipped: error.message };
  }
}

async function setServiceReplicas(token, serviceId, environmentId, numReplicas, authMode = "account") {
  const count = Number(numReplicas);
  if (!Number.isFinite(count) || count < 1) return { skipped: "numReplicas not set" };
  const query = `
    mutation BrunnerServiceInstanceUpdate($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
      serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
    }
  `;
  return railwayRequest(token, query, {
    serviceId,
    environmentId,
    input: { numReplicas: count },
  }, authMode);
}

// 이미지 기반 서비스에는 Railway 가 DATABASE_URL 을 만들어 주지 않는다. plugin
// 시절에는 자동으로 생겼기 때문에 화면이 그것을 읽어 다음 단계로 넘겼는데, 지금은
// 아무도 만들지 않아 4단계가 빈 URL 로 막힌다. 프록시 주소로 직접 조립해 넣는다.
const stripTrailingDot = (value) => String(value || "").replace(/\.$/, "");

async function attachDatabaseUrls(token, projectId, environmentId, serviceId, password, authMode) {
  if (!environmentId) return { databaseUrl: "", databasePublicUrl: "" };
  const variables = await getVariables(token, projectId, environmentId, serviceId, authMode).catch(() => ({}));
  const privateDomain = variables.RAILWAY_PRIVATE_DOMAIN || "";
  const proxy = await ensureTcpProxy(token, environmentId, serviceId, 5432, authMode).catch(() => null);
  const proxyNode = proxy?.tcpProxy || proxy?.tcpProxyCreate || null;
  const proxyDomain = stripTrailingDot(proxyNode?.domain);
  const proxyPort = proxyNode?.proxyPort;
  const secret = password || variables.POSTGRES_PASSWORD || variables.PGPASSWORD || "";
  const user = variables.PGUSER || "postgres";
  const database = variables.PGDATABASE || "railway";

  const databaseUrl = privateDomain
    ? `postgresql://${user}:${secret}@${privateDomain}:5432/${database}`
    : "";
  const databasePublicUrl = proxyDomain && proxyPort
    ? `postgresql://${user}:${secret}@${proxyDomain}:${proxyPort}/${database}`
    : "";

  // 서비스에는 Railway 공식 템플릿과 같은 참조 형태로 넣는다. 리터럴로 박으면
  // 프록시 주소나 비밀번호가 바뀌는 순간 낡은 값이 남는다. 화면에는 지금 접속에
  // 쓸 수 있어야 하므로 위에서 조립한 실제 값을 따로 돌려준다.
  const toWrite = {};
  if (privateDomain) {
    toWrite.DATABASE_URL = "postgresql://${{PGUSER}}:${{POSTGRES_PASSWORD}}@${{RAILWAY_PRIVATE_DOMAIN}}:5432/${{PGDATABASE}}";
  }
  if (proxyDomain && proxyPort) {
    toWrite.DATABASE_PUBLIC_URL = "postgresql://${{PGUSER}}:${{POSTGRES_PASSWORD}}@${{RAILWAY_TCP_PROXY_DOMAIN}}:${{RAILWAY_TCP_PROXY_PORT}}/${{PGDATABASE}}";
    toWrite.PGHOST = "${{RAILWAY_TCP_PROXY_DOMAIN}}";
    toWrite.PGPORT = "${{RAILWAY_TCP_PROXY_PORT}}";
  }
  if (Object.keys(toWrite).length) {
    await upsertVariables(token, projectId, environmentId, serviceId, toWrite, authMode).catch(() => null);
  }
  return { databaseUrl, databasePublicUrl, proxyDomain, proxyPort };
}

async function createPostgresService(token, projectId, environmentId, name, authMode = "account", options = {}) {
  const serviceName = name || "brunner-postgres";
  const existing = await findServiceByName(token, projectId, serviceName, authMode);
  if (existing) {
    await deleteService(token, existing.id, authMode);
    const deleted = await waitForServiceDeletion(token, projectId, serviceName, authMode, existing.id);
    if (!deleted) {
      throw new Error(`Existing PostgreSQL service "${serviceName}" was deleted but still appears in Railway. Retry after Railway finishes deletion.`);
    }
  }

  const password = options.password || generatePassword();
  // 복제본을 쓸 때만 복제 전용 이미지로 간다. 그리고 그 경우 REPMGR_USER_PWD 가
  // 없으면 primary 가 기동 도중 죽는다 — 복제본 쪽에만 넣었다가 실제로 겪었다.
  const withReplication = Number(options.readReplicaCount) > 0;
  const baseVariables = {
    PGDATA: "/var/lib/postgresql/data/pgdata",
    PGDATABASE: "railway",
    PGPASSWORD: password,
    PGPORT: "5432",
    PGUSER: "postgres",
    POSTGRES_DB: "railway",
    POSTGRES_PASSWORD: password,
    POSTGRES_USER: "postgres",
  };
  const service = await createServiceWithImage(
    token,
    projectId,
    environmentId,
    serviceName,
    withReplication ? POSTGRES_REPLICATION_IMAGE : POSTGRES_IMAGE,
    withReplication
      ? { ...baseVariables, RAILWAY_PG_INSTANCE_TYPE: "PRIMARY", REPMGR_USER_PWD: password }
      : baseVariables,
    authMode,
  );

  if (!service?.id) {
    throw new Error("Railway did not return a service id for the PostgreSQL service.");
  }
  const volume = await createVolume(token, projectId, environmentId, service.id, POSTGRES_MOUNT_PATH, authMode);
  const urls = await attachDatabaseUrls(token, projectId, environmentId, service.id, password, authMode);
  // 서비스를 만들기만 하면 컨테이너는 뜨지 않는다. plugin 시절에는 Railway 가
  // 알아서 띄워 줬기 때문에 배포 호출이 없었고, 그대로 두면 프록시만 살아 있고
  // 뒤에 아무것도 없어 접속이 ECONNRESET 으로 끊긴다.
  const deployed = await deployServiceOrThrow(token, service.id, environmentId, authMode, serviceName);
  return { pluginCreate: service, volume, generatedPassword: password, replacedExisting: Boolean(existing), deployed, ...urls };
}

// 읽기 복제본은 인스턴스 수를 늘려서 만들 수 없다 — 같은 볼륨을 여러 인스턴스가
// 잡으면 데이터가 깨진다. Railway 이미지가 제공하는 READREPLICA 서비스를 따로
// 띄우는 것이 정식 방법이다.
async function createPostgresReadReplicas(token, projectId, environmentId, baseName, count, password, authMode = "account") {
  const total = Number(count);
  if (!Number.isFinite(total) || total < 1) return { created: [], requested: 0 };
  const created = [];
  for (let index = 1; index <= total; index += 1) {
    const replicaName = `${baseName || "brunner-postgres"}-replica-${index}`;
    const existing = await findServiceByName(token, projectId, replicaName, authMode);
    if (existing) {
      created.push({ id: existing.id, name: replicaName, reused: true });
      continue;
    }
    const service = await createServiceWithImage(token, projectId, environmentId, replicaName, POSTGRES_REPLICATION_IMAGE, {
      PGDATA: "/var/lib/postgresql/data/pgdata",
      PGDATABASE: "railway",
      PGPASSWORD: password || "",
      PGPORT: "5432",
      PGUSER: "postgres",
      POSTGRES_DB: "railway",
      POSTGRES_PASSWORD: password || "",
      POSTGRES_USER: "postgres",
      RAILWAY_PG_INSTANCE_TYPE: "READREPLICA",
      REPMGR_USER_PWD: password || "",
    }, authMode);
    if (service?.id) {
      await createVolume(token, projectId, environmentId, service.id, POSTGRES_MOUNT_PATH, authMode);
      await deployService(token, service.id, environmentId, authMode).catch(() => null);
      created.push({ id: service.id, name: replicaName });
    }
  }
  return { created, requested: total };
}

// 배포 요청 결과를 삼키지 않는다. 요청이 실패하면 그 단계는 실패다.
async function deployServiceOrThrow(token, serviceId, environmentId, authMode, label) {
  try {
    return await deployService(token, serviceId, environmentId, authMode);
  } catch (error) {
    throw new Error(`${label} 서비스는 만들어졌지만 배포 요청이 실패했습니다: ${error.message}`);
  }
}

// Redis 서비스가 내보내야 하는 변수들.
//
// 왜 REDIS_URL 을 여기서 만드나
//   AP 서비스는 ${{brunner-redis.REDIS_URL}} 로 이 값을 참조한다. 그런데 이미지로 만든
//   서비스에는 Railway 가 접속 URL 을 만들어 주지 않는다. 우리가 넣지 않으면 Redis 가
//   정상으로 떠도 그 참조는 영영 풀리지 않는다. RAILWAY_PRIVATE_DOMAIN 은 Railway 가
//   서비스마다 채워 주는 내부 주소다.
const redisServiceVariables = (password) => ({
  REDIS_PASSWORD: password,
  REDISPASSWORD: password,
  REDISUSER: "default",
  REDISHOST: "${{RAILWAY_PRIVATE_DOMAIN}}",
  REDISPORT: "6379",
  REDIS_URL: "redis://default:" + password + "@${{RAILWAY_PRIVATE_DOMAIN}}:6379",
});

// 이 이미지는 Railway 템플릿이 시작 커맨드를 함께 넣어 주는 것을 전제로 한다.
// 커맨드 없이 띄우면 인증 없이 뜨거나 그대로 죽어 로그도 남지 않는다.
// 이 계정에서 정상 동작 중인 Redis 와 같은 형태로 띄운다. 공식 이미지는
// docker-entrypoint.sh 를 거쳐야 초기화가 제대로 되고, 그것을 건너뛰면
// 컨테이너가 로그를 남기기도 전에 죽는다. 볼륨은 붙이지 않으므로 --dir 는 두지 않는다.
const REDIS_START_COMMAND = '/bin/sh -c "exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD"';

async function setStartCommand(token, serviceId, environmentId, startCommand, authMode = "account") {
  const query = `
    mutation BrunnerServiceInstanceStartCommand($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
      serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
    }
  `;
  return railwayRequest(token, query, {
    serviceId,
    environmentId,
    input: { startCommand },
  }, authMode);
}

async function createRedisService(token, projectId, environmentId, name, authMode = "account") {
  const serviceName = name || "brunner-redis";
  const existing = await findServiceByName(token, projectId, serviceName, authMode);
  if (existing) {
    const deployed = await deployServiceOrThrow(token, existing.id, environmentId, authMode, serviceName);
    return { pluginCreate: existing, reused: true, deployed };
  }

  const password = generatePassword(24);
  const service = await createServiceWithImage(
    token, projectId, environmentId, serviceName, REDIS_IMAGE,
    redisServiceVariables(password),
    authMode,
  );

  if (!service?.id) {
    throw new Error("Railway did not return a service id for the Redis service.");
  }
  // 시작 커맨드를 배포 전에 넣는다. 배포 뒤에 넣으면 첫 배포가 커맨드 없이 떠서
  // 죽고, 그 실패가 화면에 그대로 남는다.
  const startCommand = await setStartCommand(token, service.id, environmentId, REDIS_START_COMMAND, authMode)
    .catch((error) => ({ error: error.message }));
  // 인스턴스 수를 정하지 않으면 numReplicas 가 null 로 남아 스케줄되지 않는다.
  const replicas = await setServiceReplicas(token, service.id, environmentId, 1, authMode)
    .catch((error) => ({ error: error.message }));
  const deployed = await deployServiceOrThrow(token, service.id, environmentId, authMode, serviceName);
  return { pluginCreate: service, generatedPassword: password, startCommand, replicas, deployed };
}

async function createNextService(token, projectId, environmentId, service, authMode = "account") {
  const existing = await findServiceByName(token, projectId, service.name, authMode);
  if (existing) {
    await deleteService(token, existing.id, authMode);
    const deleted = await waitForServiceDeletion(token, projectId, service.name, authMode, existing.id);
    if (!deleted) {
      throw new Error(`Existing NextJS service "${service.name}" was deleted but still appears in Railway. Retry after Railway finishes deletion.`);
    }
  }

  const query = `
    mutation BrunnerServiceCreate($input: ServiceCreateInput!) {
      serviceCreate(input: $input) { id name }
    }
  `;

  // 만들 때 저장소를 붙이지 않는다.
  //
  // 왜
  //   serviceCreate 입력에 source 가 들어가면 Railway 는 그 자리에서 빌드를 건다.
  //   그런데 그 시점에는 환경변수가 하나도 없다. 빌드는 DB 를 안 보므로 통과하지만,
  //   기동에서 railway_start 가 DATABASE_URL 없이 run_sql 을 돌리다 죽는다. 몇 분을
  //   태우고 실패 하나를 남기는 배포다. 6단계가 하필 그것을 붙잡으면 정상 설치인데도
  //   실패로 끊긴다.
  //   그래서 껍데기만 만들고, 변수를 올린 뒤 attachServiceSource 로 저장소를 붙인다.
  //   실제 빌드는 6단계가 한 번만 건다.
  //
  // Railway 는 입력이 조금만 어긋나도 "Problem processing request" 만 돌려준다.
  // source 없는 생성을 거절하는 경우까지 생각해, 넓은 형태부터 좁혀 가며 시도하고
  // 마지막에는 예전처럼 source 를 붙여 만든다. 어떤 형태가 통했는지 응답에 남겨 둔다.
  const candidates = [
    {
      shape: "noSource",
      attachesSource: false,
      input: {
        projectId,
        environmentId: environmentId || undefined,
        name: service.name,
      },
    },
    {
      shape: "noSourceMinimal",
      attachesSource: false,
      input: {
        projectId,
        name: service.name,
      },
    },
    {
      shape: "full",
      attachesSource: true,
      input: {
        projectId,
        environmentId: environmentId || undefined,
        name: service.name,
        source: { repo: service.githubRepo, branch: service.githubBranch },
      },
    },
    {
      shape: "noBranch",
      attachesSource: true,
      input: {
        projectId,
        environmentId: environmentId || undefined,
        name: service.name,
        source: { repo: service.githubRepo },
      },
    },
    {
      shape: "minimal",
      attachesSource: true,
      input: {
        projectId,
        name: service.name,
        source: { repo: service.githubRepo },
      },
    },
  ];

  const attempts = [];
  for (const candidate of candidates) {
    try {
      const data = await railwayRequest(token, query, { input: candidate.input }, authMode);
      const created = data.serviceCreate;
      // 브랜치를 입력에서 못 받았고 저장소는 붙었으면 서비스 인스턴스 쪽에서 지정한다.
      if (created?.id && candidate.attachesSource && candidate.shape !== "full" && service.githubBranch && environmentId) {
        await setServiceBranch(token, created.id, environmentId, service.githubBranch, authMode).catch(() => null);
      }
      return { serviceCreate: created, shape: candidate.shape, sourceAttached: candidate.attachesSource, attempts };
    } catch (error) {
      attempts.push({ shape: candidate.shape, error: error.message });
    }
  }
  throw new Error(`serviceCreate failed. ${attempts.map((a) => `${a.shape}: ${a.error}`).join(" | ")}`);
}

// 변수를 다 올린 뒤에 저장소를 붙인다. 이 시점부터 빌드가 걸려도 환경변수가 있다.
// 재실행이면 이미 붙어 있는데, 같은 값으로 다시 붙이는 것은 문제가 되지 않는다.
async function attachServiceSource(token, serviceId, environmentId, githubRepo, githubBranch, authMode = "account") {
  if (!environmentId) throw new Error("environmentId is required to attach a source.");
  const query = `
    mutation BrunnerServiceSource($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
      serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
    }
  `;
  const candidates = [
    { shape: "sourceWithBranch", input: { source: { repo: githubRepo }, branch: githubBranch || undefined } },
    { shape: "sourceOnly", input: { source: { repo: githubRepo } } },
  ];
  const attempts = [];
  for (const candidate of candidates) {
    try {
      await railwayRequest(token, query, { serviceId, environmentId, input: candidate.input }, authMode);
      // 브랜치를 같이 못 보냈으면 따로 지정한다.
      if (candidate.shape !== "sourceWithBranch" && githubBranch) {
        await setServiceBranch(token, serviceId, environmentId, githubBranch, authMode).catch(() => null);
      }
      return { attached: true, shape: candidate.shape, attempts };
    } catch (error) {
      attempts.push({ shape: candidate.shape, error: error.message });
    }
  }
  throw new Error(`attachServiceSource failed. ${attempts.map((a) => `${a.shape}: ${a.error}`).join(" | ")}`);
}

// 서비스에 붙는 railway.app 도메인. 없으면 만들고 있으면 그대로 돌려준다.
// 8단계 기동 확인에 쓸 주소를 사용자가 직접 찾아 적지 않아도 되게 한다.
async function ensureServiceDomain(token, projectId, environmentId, serviceId, authMode = "account") {
  const listQuery = `
    query BrunnerServiceDomains($projectId: String!, $environmentId: String!, $serviceId: String!) {
      domains(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) {
        serviceDomains { domain }
        customDomains { domain }
      }
    }
  `;
  const existing = await railwayRequest(token, listQuery, { projectId, environmentId, serviceId }, authMode)
    .catch(() => null);
  const found = existing?.domains?.serviceDomains?.[0]?.domain
    || existing?.domains?.customDomains?.[0]?.domain
    || null;
  if (found) return { domain: found, reused: true };

  const createMutation = `
    mutation BrunnerServiceDomainCreate($input: ServiceDomainCreateInput!) {
      serviceDomainCreate(input: $input) { domain }
    }
  `;
  const created = await railwayRequest(token, createMutation, {
    input: { serviceId, environmentId },
  }, authMode);
  return { domain: created?.serviceDomainCreate?.domain || null, reused: false };
}

// 배포를 걸어 놓고 Railway 콘솔을 따로 봐야 결과를 아는 상태였다. 상태를
// 조회해 마법사 안에서 진행을 보여준다.
async function getDeploymentStatus(token, deploymentId, authMode = "account") {
  const query = `
    query BrunnerDeployment($id: String!) {
      deployment(id: $id) {
        id
        status
        createdAt
        canRedeploy
      }
    }
  `;
  const data = await railwayRequest(token, query, { id: deploymentId }, authMode);
  return data.deployment || null;
}

// 저장소에 커밋이 들어가면 Railway 가 스스로 배포를 건다. 그것을 모르고 또
// 걸면 같은 커밋으로 빌드가 두 번 돈다. 진행 중인 것이 있으면 그것을 쓴다.
async function findActiveDeployment(token, projectId, serviceId, environmentId, authMode = "account") {
  const query = `
    query BrunnerActiveDeployments($input: DeploymentListInput!) {
      deployments(first: 5, input: $input) {
        edges { node { id status createdAt } }
      }
    }
  `;
  const data = await railwayRequest(token, query, {
    input: { projectId, serviceId, environmentId },
  }, authMode).catch(() => null);
  const nodes = data?.deployments?.edges?.map((edge) => edge.node) || [];
  const running = new Set(["BUILDING", "DEPLOYING", "INITIALIZING", "QUEUED", "WAITING"]);
  return nodes.find((node) => running.has(node.status)) || null;
}

// 실패 원인을 보려고 Railway 콘솔로 넘어가야 했다. 마법사 안에서 바로 읽는다.
async function getBuildLogs(token, deploymentId, limit = 120, authMode = "account") {
  const query = `
    query BrunnerBuildLogs($deploymentId: String!, $limit: Int) {
      buildLogs(deploymentId: $deploymentId, limit: $limit) {
        message
        severity
        timestamp
      }
    }
  `;
  const data = await railwayRequest(token, query, { deploymentId, limit }, authMode);
  return data.buildLogs || [];
}

// 빌드가 성공해도 기동에서 죽으면 원인은 배포 로그에 있다.
async function getDeploymentLogs(token, deploymentId, limit = 120, authMode = "account") {
  const query = `
    query BrunnerDeploymentLogs($deploymentId: String!, $limit: Int) {
      deploymentLogs(deploymentId: $deploymentId, limit: $limit) {
        message
        severity
        timestamp
      }
    }
  `;
  const data = await railwayRequest(token, query, { deploymentId, limit }, authMode);
  return data.deploymentLogs || [];
}

async function setServiceBranch(token, serviceId, environmentId, branch, authMode = "account") {
  const query = `
    mutation BrunnerServiceBranch($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
      serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
    }
  `;
  return railwayRequest(token, query, { serviceId, environmentId, input: { branch } }, authMode);
}

async function upsertVariables(token, projectId, environmentId, serviceId, variables, authMode = "account") {
  const query = `
    mutation BrunnerVariablesUpsert($input: VariableCollectionUpsertInput!) {
      variableCollectionUpsert(input: $input)
    }
  `;
  return railwayRequest(token, query, {
    input: {
      projectId,
      environmentId: environmentId || undefined,
      serviceId: serviceId || undefined,
      variables,
    },
  }, authMode);
}

async function getVariables(token, projectId, environmentId, serviceId, authMode = "account") {
  const query = `
    query BrunnerVariables($projectId: String!, $environmentId: String!, $serviceId: String) {
      variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
    }
  `;
  const data = await railwayRequest(token, query, {
    projectId,
    environmentId,
    serviceId: serviceId || undefined,
  }, authMode);
  return data.variables || {};
}

async function ensureTcpProxy(token, environmentId, serviceId, applicationPort = 5432, authMode = "account") {
  const listQuery = `
    query BrunnerTcpProxies($environmentId: String!, $serviceId: String!) {
      tcpProxies(environmentId: $environmentId, serviceId: $serviceId) {
        id
        domain
        proxyPort
        applicationPort
      }
    }
  `;
  const existing = await railwayRequest(token, listQuery, { environmentId, serviceId }, authMode);
  const proxies = existing.tcpProxies || [];
  const matched = proxies.find((proxy) => Number(proxy.applicationPort) === Number(applicationPort));
  if (matched) return { tcpProxy: matched, reused: true };

  const mutation = `
    mutation BrunnerTcpProxyCreate($input: TCPProxyCreateInput!) {
      tcpProxyCreate(input: $input) {
        id
        domain
        proxyPort
        applicationPort
      }
    }
  `;
  return railwayRequest(token, mutation, {
    input: {
      serviceId,
      environmentId,
      applicationPort: Number(applicationPort),
    },
  }, authMode);
}

// serviceInstanceDeploy(input:) 는 현재 스키마에 없다. Railway 가 알려준 대로
// serviceInstanceDeployV2 는 인자를 직접 받는다. 예전 형태로 부르던 동안 DB 배포
// 호출도 조용히 실패하고 있었다(호출부가 예외를 삼켰다).
async function deployService(token, serviceId, environmentId, authMode = "account") {
  if (!environmentId) return { skipped: "environmentId is required to deploy." };
  const query = `
    mutation BrunnerServiceDeploy($serviceId: String!, $environmentId: String!) {
      serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
    }
  `;
  return railwayRequest(token, query, { serviceId, environmentId }, authMode);
}

function getSslConfig(connectionString) {
  const url = String(connectionString || "");
  if (url.includes("railway.internal") || url.includes("proxy.rlwy.net") || url.includes("railway.app")) {
    return { rejectUnauthorized: false };
  }
  return false;
}

// 스키마 이름은 소문자로 접어서 만든다.
//
// PostgreSQL 은 따옴표 없는 식별자를 소문자로 접는다. 대소문자를 살리면 참조하는
// 모든 자리(런타임 쿼리·SQL 스크립트·백업 스크립트·psql 수동 조회)에서 따옴표를
// 씌워야 하고, 한 군데만 빠뜨리면 "테이블이 없다"로 나타난다. 살려서 얻는 것이
// 없으므로 입력 단계에서 접는다. 사용자가 MySchema 라고 넣어도 myschema 가 된다.
function normalizeSchemaName(value) {
  // 화면과 같은 규칙으로 접는다. 화면을 거치지 않고 API 를 직접 부르는 경로가
  // 있으므로 여기서도 해야 한다. 하이픈·공백·점은 구분자로 보고 밑줄로 바꾼다.
  const schemaName = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s.\-]+/g, "_");
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schemaName)) {
    throw new Error("DB_SCHEMA must be a PostgreSQL identifier, for example brunner or zicp.");
  }
  return schemaName;
}

// 스키마의 system_code 컬럼이 varchar(2) 인 테이블이 13개다. 3자 이상을 받으면
// DDL 은 통과해도 곧바로 이어지는 seed INSERT 가 22001 로 죽으므로 여기서 막는다.
function normalizeSystemCode(value) {
  const systemCode = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{1,2}$/.test(systemCode)) {
    throw new Error("SYSTEM_CODE must be 1-2 characters: letters, numbers, underscore, or hyphen.");
  }
  return systemCode;
}

function escapeSqlLiteral(value) {
  return String(value).replace(/'/g, "''");
}

// 스키마 이름은 식별자로 SQL 에 그대로 박힌다. 위저드 입력을 그대로 이어 붙이지 않는다.
function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const INSTALL_SOURCE_SCHEMAS = ["brunner_template", "brunner", "zicp"];

function retargetInstallSchemaTokens(sql, schemaName) {
  const schemaIdent = quoteIdent(schemaName);
  return INSTALL_SOURCE_SCHEMAS.reduce((retargeted, sourceSchema) => {
    const source = escapeRegExp(sourceSchema);
    return retargeted
      .replace(
        new RegExp(`\\bCREATE\\s+SCHEMA(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+${sourceSchema}\\s*;`, "gi"),
        `CREATE SCHEMA IF NOT EXISTS ${schemaIdent};`,
      )
      .replace(
        new RegExp(`\\b${source}\\.(?=(?:TB_|tb_|IDX_|idx_|UQ_|uq_|[A-Za-z0-9_]+_pkey|%I))`, "g"),
        `${schemaIdent}.`,
      )
      .replace(new RegExp(`(\\btable_schema\\s*=\\s*)'${source}'`, "gi"), `$1'${escapeSqlLiteral(schemaName)}'`)
      .replace(new RegExp(`'${source}'::regnamespace`, "g"), `'${escapeSqlLiteral(schemaName)}'::regnamespace`);
  }, sql);
}

function copyValueToSql(value) {
  if (value === "\\N") return "NULL";
  const text = String(value)
    .replace(/\\\\/g, "\\")
    .replace(/\\t/g, "\t")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f");
  return `'${escapeSqlLiteral(text)}'`;
}

function convertCopyBlocksToInserts(sql) {
  return sql.replace(
    /COPY\s+([^\s]+)\s+\(([^)]+)\)\s+FROM\s+stdin;\r?\n([\s\S]*?)(?:\r?\n)?\\\./g,
    (_match, tableName, columns, body) => {
      const rows = body.split(/\r?\n/).filter((line) => line.length > 0 && !/^0[12]\t/.test(line));
      if (!rows.length) return "";
      const values = rows
        .map((line) => `(${line.split("\t").map(copyValueToSql).join(", ")})`)
        .join(",\n");
      return `INSERT INTO ${tableName} (${columns}) VALUES\n${values}\nON CONFLICT DO NOTHING;`;
    },
  );
}

function dedupeResourceTextSeedRows(sql) {
  return sql.replace(
    /(INSERT INTO\s+[^\s]+\.(?:TB_COR_RESOURCE_TEXT|tb_cor_resource_text)\s*\(([^)]+)\)\s*)VALUES\s*([\s\S]*?)(\s+ON CONFLICT\s*\(\s*SYSTEM_CODE\s*,\s*RESOURCE_TYPE\s*,\s*RESOURCE_KEY\s*,\s*LANGUAGE_CODE\s*\)[\s\S]*?;)/gi,
    (_match, insertInto, columns, values, onConflict) => {
      const aliases = columns
        .split(",")
        .map((column) => column.trim())
        .join(", ");
      return `${insertInto}SELECT DISTINCT ON (SYSTEM_CODE, RESOURCE_TYPE, RESOURCE_KEY, LANGUAGE_CODE) *\nFROM (VALUES\n${values.trim()}\n) AS seed (${aliases})\nWHERE SYSTEM_CODE = '00'\nORDER BY SYSTEM_CODE, RESOURCE_TYPE, RESOURCE_KEY, LANGUAGE_CODE${onConflict}`;
    },
  );
}

function makeSchemaDdlIdempotent(sql) {
  return sql
    .replace(/\bCREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS\b)/gi, "CREATE TABLE IF NOT EXISTS ")
    .replace(/\bCREATE\s+SEQUENCE\s+(?!IF\s+NOT\s+EXISTS\b)/gi, "CREATE SEQUENCE IF NOT EXISTS ")
    .replace(/\bCREATE\s+UNIQUE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS\b)/gi, "CREATE UNIQUE INDEX IF NOT EXISTS ")
    .replace(/\bCREATE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS\b)/gi, "CREATE INDEX IF NOT EXISTS ")
    .replace(
      /ALTER TABLE ONLY\s+([A-Za-z_][\w]*)\.([A-Za-z_][\w]*)\s+ADD CONSTRAINT\s+([A-Za-z_][\w]*)\s+([\s\S]*?);/g,
      (_match, schema, table, constraint, definition) => (
        `DO $$\nBEGIN\n` +
        `  IF NOT EXISTS (\n` +
        `    SELECT 1\n` +
        `    FROM pg_constraint\n` +
        `    WHERE conname = '${constraint}'\n` +
        `      AND connamespace = '${schema}'::regnamespace\n` +
        `  ) THEN\n` +
        `    ALTER TABLE ONLY ${schema}.${table}\n` +
        `      ADD CONSTRAINT ${constraint} ${definition.trim()};\n` +
        `  END IF;\n` +
        `END $$;`
      ),
    );
}

// 설치본의 스키마·테넌트를 입력값으로 바꾼다.
// 주의: 동적 SQL 본문(TB_COR_SQL_INFO)에는 테넌트 값을 리터럴로 넣지 않는다. 아래 '00' 치환은
// 옛 등록분을 위한 보정일 뿐이고, 지금 등록분은 테넌트를 파라미터로 받는다. 본문에 값을 박으면
// 그 등록분이 다른 테넌트로 복제될 때 그대로 따라가 서비스 경계가 무너진다.
function prepareInstallSql(sql, { schemaName, systemCode }) {
  const safeSystemCode = escapeSqlLiteral(systemCode);
  return retargetInstallSchemaTokens(
    makeSchemaDdlIdempotent(dedupeResourceTextSeedRows(convertCopyBlocksToInserts(sql))),
    schemaName,
  )
    .replace(/\bCREATE\s+FUNCTION\b/gi, "CREATE OR REPLACE FUNCTION")
    .replace(/\('00',/g, `('${safeSystemCode}',`)
    .replace(/\bWHERE\s+SYSTEM_CODE\s*=\s*'00'/gi, `WHERE SYSTEM_CODE = '${safeSystemCode}'`)
    .replace(/^00\t/gm, `${systemCode}\t`)
    .replace(/(\bsystem_code\s*=\s*)'00'/gi, `$1'${safeSystemCode}'`)
    // COPY 블록의 동적 SQL 본문은 INSERT 로 바뀌며 작은따옴표가 두 겹이 된다.
    // 한 겹만 보고 치환하면 본문 안의 system_code = ''00'' 이 그대로 남아,
    // 다른 테넌트로 설치해도 그 쿼리들만 '00' 을 읽고 쓴다.
    .replace(/(\bsystem_code\s*=\s*)''00''/gi, `$1''${safeSystemCode}''`)
    .replace(/(\bSELECT\s*)''00''(\s*,)/gi, `$1''${safeSystemCode}''$2`)
    .replace(/(\bsystem_code\b[^,\n]*\bDEFAULT\s*)'00'/gi, `$1'${safeSystemCode}'`)
    .replace(/(\bSET\s+system_code\s*=\s*)'00'/gi, `$1'${safeSystemCode}'`)
    .replace(/(\bSELECT\s*)'00'(\s*,)/gi, `$1'${safeSystemCode}'$2`);
}

// 신규 설치본의 동적 SQL 은 덤프 파일이 아니라 이 배포의 등록분에서 실시간으로 옮긴다.
//
// 왜
//   시드 스크립트로 심는 것만으로는 관리 화면(/mainPages/dynamicSql)에서 손본 쿼리가
//   새 시스템에 안 따라간다. 지금 돌고 있는 서비스의 등록분이 사실상의 기준이므로
//   그것을 원본으로 삼는다.
//
// 무엇을 바꿔서 넣나
//   본문에 박힌 스키마 이름만 설치 대상 스키마로 바꾼다. 테넌트는 파라미터로 받으므로
//   손댈 것이 없지만, 옛 등록분이 자기 테넌트를 리터럴로 들고 있을 수 있어 그것만 보정한다.
function retargetSqlContent(sqlContent, { sourceSchema, targetSchema, sourceSystemCode, targetSystemCode }) {
  const safeTarget = escapeSqlLiteral(targetSystemCode);
  const safeSource = escapeSqlLiteral(sourceSystemCode);
  const targetSchemaIdent = quoteIdent(targetSchema);
  return INSTALL_SOURCE_SCHEMAS.reduce((retargeted, sourceSchemaName) => {
    if (sourceSchemaName === targetSchema) return retargeted;
    const sourceSchemaPrefix = new RegExp(
      `\\b${escapeRegExp(sourceSchemaName)}\\.(?=(?:TB_|tb_|IDX_|idx_|UQ_|uq_|[A-Za-z0-9_]+_pkey|%I))`,
      "g",
    );
    return retargeted.replace(sourceSchemaPrefix, `${targetSchemaIdent}.`);
  }, String(sqlContent || ""))
    .replace(new RegExp(`(\\bsystem_code\\s*=\\s*)'${safeSource}'`, "gi"), `$1'${safeTarget}'`)
    .replace(new RegExp(`(\\bSET\\s+system_code\\s*=\\s*)'${safeSource}'`, "gi"), `$1'${safeTarget}'`)
    .replace(new RegExp(`(\\bSELECT\\s*)'${safeSource}'(\\s*,)`, "gi"), `$1'${safeTarget}'$2`);
}

async function copyDynamicSqlToTarget(client, { schemaName, systemCode }) {
  const sourceSchema = SCHEMA;
  const sourceSystemCode = deploymentSystemCode();
  const source = await database.executeSQL(
    `SELECT sql_name, sql_seq, sql_content, create_user_id
       FROM ${quoteIdent(sourceSchema)}.TB_COR_SQL_INFO
      WHERE system_code = $1
      ORDER BY sql_name, sql_seq`,
    [sourceSystemCode],
  );
  const rows = (source.rows || []).map((row) => ({
    sql_name: row.sql_name,
    sql_seq: Number(row.sql_seq),
    sql_content: retargetSqlContent(row.sql_content, {
      sourceSchema,
      targetSchema: schemaName,
      sourceSystemCode,
      targetSystemCode: systemCode,
    }),
    create_user_id: row.create_user_id || "installer",
  }));
  if (rows.length === 0) {
    // 원본이 비어 있으면 덤프로 들어간 등록분을 지우지 않는다 — 조용히 반쪽 설치가 되는 쪽이 더 나쁘다.
    throw new Error("이 배포의 동적 SQL 등록분을 찾지 못했습니다. 설치를 중단합니다.");
  }
  await client.query(
    `INSERT INTO ${quoteIdent(schemaName)}.TB_COR_SQL_INFO (
       system_code, sql_name, sql_seq, sql_content, create_user_id, create_time, update_user_id, update_time
     )
     SELECT $1, src.sql_name, src.sql_seq, src.sql_content, src.create_user_id, NOW(), 'installer', NOW()
       FROM jsonb_to_recordset($2::jsonb) AS src(
         sql_name text, sql_seq integer, sql_content text, create_user_id text
       )
     ON CONFLICT (system_code, sql_name, sql_seq)
     DO UPDATE SET sql_content = EXCLUDED.sql_content,
                   update_user_id = 'installer',
                   update_time = NOW()`,
    [systemCode, JSON.stringify(rows)],
  );
  return { copied: rows.length, sourceSchema, sourceSystemCode };
}

async function verifyAppliedSchema(client, schemaName) {
  const schemaInfo = await client.query(
    `
      SELECT
        current_database() AS database_name,
        current_user AS database_user,
        EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1) AS schema_exists,
        to_regclass($2) IS NOT NULL AS sql_info_exists,
        (
          SELECT COUNT(*)
          FROM information_schema.tables
          WHERE table_schema = $1
        )::int AS table_count,
        COALESCE(
          (
            SELECT array_agg(nspname ORDER BY nspname)
            FROM pg_namespace
            WHERE lower(nspname) = lower($1)
          ),
          ARRAY[]::name[]
        ) AS similar_schemas
    `,
    [schemaName, `${quoteIdent(schemaName)}.tb_cor_sql_info`],
  );
  const row = schemaInfo.rows[0] || {};
  if (!row.schema_exists || !row.sql_info_exists) {
    throw new Error(
      [
        `DB_SCHEMA 적용 확인 실패: ${schemaName}`,
        `database=${row.database_name || "(unknown)"}`,
        `schemaExists=${Boolean(row.schema_exists)}`,
        `sqlInfoExists=${Boolean(row.sql_info_exists)}`,
        `similarSchemas=${(row.similar_schemas || []).join(", ") || "(none)"}`,
      ].join(" / "),
    );
  }
  return row;
}

const TRANSIENT_DB_ERROR = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|Connection terminated|timeout expired|starting up|recovery mode/i;

async function testDatabase(connectionString) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const client = new Client({ connectionString, ssl: getSslConfig(connectionString) });
    try {
      await client.connect();
      return { connected: true, checkedAt: new Date().toISOString(), attempts: attempt };
    } catch (error) {
      lastError = error;
      await client.end().catch(() => {});
      if (!TRANSIENT_DB_ERROR.test(error?.message || "")) throw error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    } finally {
      await client.end().catch(() => {});
    }
  }
  throw lastError;
}

// 설치본은 리포의 SQL 스크립트를 그대로 적용한다.
//
// 왜 덤프(scripts/schema_full.sql)를 안 쓰나
//   한 번 뜬 사본이라 리포가 자라면 갈라진다. 실제로 그 덤프는 테이블 28개만 담고 있어
//   게시판·결제이력·보존정책·전자문서 컴포넌트 템플릿 등 11개 테이블이 통째로 빠졌고,
//   동적 SQL 도 61건이 없었다. 그렇게 설치된 시스템은 해당 기능이 곧바로 죽는다.
//   run_sql 과 같은 목록(scripts/install_sql_files.json)을 쓰면 두 벌을 맞출 일이 없다.
async function readInstallSqlFileList() {
  const listPath = path.join(process.cwd(), "scripts", "install_sql_files.json");
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(listPath, "utf8"));
  } catch (error) {
    // 이 목록은 템플릿 배포에만 있다. 파생 서비스에서 위저드를 열면 여기서 멈춘다 —
    // 그 리포의 SQL 목록에는 일회성 이관 스크립트가 섞여 있어 새 DB 에 돌리면 안 된다.
    throw new Error(
      `설치 스크립트 목록(scripts/install_sql_files.json)을 읽지 못했습니다. 신규 설치는 brunner-template 배포에서 진행하세요. (${error.message})`,
    );
  }
  const list = Array.isArray(parsed) ? parsed : parsed.files || [];
  // 항목은 파일명 문자열이거나 { file, why } 다.
  const files = list
    .map((entry) => String(typeof entry === "string" ? entry : entry?.file || "").trim())
    .filter(Boolean);
  if (files.length === 0) throw new Error("install_sql_files.json 이 비어 있습니다.");
  return files;
}

async function applySchema(connectionString, schemaNameInput, systemCodeInput, brandNameInput) {
  const schemaName = normalizeSchemaName(schemaNameInput);
  const systemCode = normalizeSystemCode(systemCodeInput);
  const brandName = String(brandNameInput || "").trim().slice(0, 60);
  const files = await readInstallSqlFileList();
  const client = new Client({ connectionString, ssl: getSslConfig(connectionString) });
  await client.connect();
  try {
    // 스크립트들은 스키마가 이미 있다고 보고 테이블부터 만든다.
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schemaName)}`);

    const applied = [];
    for (const fileName of files) {
      const raw = await fs.readFile(path.join(process.cwd(), "scripts", fileName), "utf8");
      if (!raw.trim()) continue;
      try {
        await client.query(prepareInstallSql(raw, { schemaName, systemCode }));
      } catch (error) {
        // 어느 스크립트에서 멈췄는지 모르면 원인을 찾을 수 없다.
        throw new Error(`${fileName} 적용 실패: ${error.message}`);
      }
      applied.push(fileName);
    }

    // 동적 SQL 은 스크립트로 심은 뒤, 지금 돌고 있는 서비스의 등록분으로 덮어쓴다.
    // 관리 화면에서 고친 쿼리까지 새 시스템에 그대로 따라간다.
    const dynamicSqlCopy = await copyDynamicSqlToTarget(client, { schemaName, systemCode });

    // 화면에 보일 이름. 새로 설치한 시스템은 아직 로고가 없으므로 헤더·로그인
    // 화면이 이 이름을 글자로 보여준다. 환경변수가 아니라 라벨로 두는 이유는
    // 셋이다 — 설치 마법사가 등록하는 환경변수를 늘리지 않고, 다국어 구조를
    // 그대로 쓰며, 나중에 관리자가 재배포 없이 리소스 화면에서 고칠 수 있다.
    let brandSeeded = false;
    if (brandName) {
      await client.query(
        `INSERT INTO ${quoteIdent(schemaName)}.TB_COR_RESOURCE_TEXT
           (SYSTEM_CODE, RESOURCE_TYPE, RESOURCE_KEY, LANGUAGE_CODE, RESOURCE_TEXT, CREATE_USER_ID, UPDATE_USER_ID, UPDATE_TIME)
         SELECT $1, 'label', 'brandName', lang, $2, 'installer', 'installer', NOW()
           FROM UNNEST(ARRAY['ko-KR','en-US','ja-JP']) AS lang
         ON CONFLICT (SYSTEM_CODE, RESOURCE_TYPE, RESOURCE_KEY, LANGUAGE_CODE)
         DO UPDATE SET RESOURCE_TEXT = EXCLUDED.RESOURCE_TEXT,
                       UPDATE_USER_ID = EXCLUDED.UPDATE_USER_ID,
                       UPDATE_TIME = NOW()`,
        [systemCode, brandName],
      );
      brandSeeded = true;
    }

    const verification = await verifyAppliedSchema(client, schemaName);
    return {
      schema: schemaName,
      systemCode,
      source: "scripts/install_sql_files.json + live dynamic SQL",
      sqlFiles: applied.length,
      dynamicSql: dynamicSqlCopy,
      brandName: brandSeeded ? brandName : null,
      verification,
      applied: true,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function checkHealth(url) {
  const startedAt = Date.now();
  const response = await fetch(url, { redirect: "manual" });
  return {
    ok: response.status >= 200 && response.status < 500,
    status: response.status,
    elapsedMs: Date.now() - startedAt,
  };
}

async function verifyInstall(url, expectRedis) {
  let base = String(url || "");
  while (base.endsWith("/")) base = base.slice(0, -1);
  const target = `${base}/api/build-info`;
  const startedAt = Date.now();
  let response;
  try {
    response = await fetch(target, { redirect: "manual" });
  } catch (error) {
    return { ok: false, reachable: false, error: error.message, target, elapsedMs: Date.now() - startedAt };
  }
  if (!response.ok) {
    return { ok: false, reachable: true, status: response.status, target, elapsedMs: Date.now() - startedAt };
  }
  const info = await response.json().catch(() => null);
  if (!info) {
    return { ok: false, reachable: true, status: response.status, error: "build-info is not JSON", target };
  }
  const checks = {
    appRunning: true,
    databaseConfigured: Boolean(info.db?.urlConfigured),
    schemaSet: Boolean(info.db?.schema),
    systemCodeSet: Boolean(info.db?.systemCode),
    redisConfigured: expectRedis ? Boolean(info.redis?.configured) : null,
    redisConnected: expectRedis ? Boolean(info.redis?.connected) : null,
  };
  const failed = Object.entries(checks)
    .filter(([, value]) => value === false)
    .map(([key]) => key);
  return {
    ok: failed.length === 0,
    failed,
    checks,
    status: response.status,
    version: info.version,
    commitSha: info.commitSha,
    startedAt: info.startedAt,
    uptimeSeconds: info.uptimeSeconds,
    target,
    elapsedMs: Date.now() - startedAt,
  };
}

function redact(value) {
  if (!value || typeof value !== "string") return value;
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function requireFields(body, fields) {
  for (const field of fields) {
    if (!body[field]) {
      throw new Error(`${field} is required.`);
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Method not allowed." });
  }

  if (!(await assertAdmin(req.body))) {
    return json(res, 403, { ok: false, error: "Administrator sign-in is required." });
  }

  // 붙여넣기로 들어온 토큰이나 저장소 이름에 공백·줄바꿈이 섞이면 그대로
  // Authorization 헤더에 실려 GitHub/Railway 가 401 로 거절한다. 원인이
  // 권한 문제로 보여 한참 헤매게 되므로 경계에서 한 번 털어낸다.
  for (const key of ["token", "githubToken", "githubRepo", "githubBranch", "projectId", "environmentId", "serviceId", "postgresName", "serviceName"]) {
    if (typeof req.body?.[key] === "string") req.body[key] = req.body[key].trim();
  }

  try {
    const { action, token, tokenType } = req.body || {};
    const authMode = tokenType === "project" ? "project" : "account";
    let data;

    switch (action) {
      case "validateToken":
        data = authMode === "project" ? await validateProjectToken(token) : await validateToken(token);
        break;
      case "validateProjectToken":
        data = await validateProjectToken(token);
        break;
      case "listWorkspaces":
        data = { workspaces: await listWorkspaces(token, authMode) };
        break;
      case "listProjects":
        data = { projects: await listProjects(token, authMode, req.body.workspaceId) };
        break;
      case "listProjectServices":
      case "listServices":
        requireFields(req.body, ["projectId"]);
        data = { services: await listProjectServices(token, req.body.projectId, authMode) };
        break;
      case "listEnvironments":
        requireFields(req.body, ["projectId"]);
        data = { environments: await listProjectEnvironments(token, req.body.projectId, authMode) };
        break;
      case "createProject":
        requireFields(req.body, ["projectName"]);
        data = await createProject(token, req.body.projectName, req.body.projectDescription || "", authMode, req.body.workspaceId);
        break;
      case "createPostgres":
        requireFields(req.body, ["projectId"]);
        data = await createPostgresService(token, req.body.projectId, req.body.environmentId, req.body.postgresName, authMode, {
          password: req.body.postgresPassword,
          readReplicaCount: req.body.readReplicaCount,
        });
        break;
      case "createPostgresReadReplicas":
        requireFields(req.body, ["projectId"]);
        data = await createPostgresReadReplicas(
          token,
          req.body.projectId,
          req.body.environmentId,
          req.body.postgresName,
          req.body.readReplicaCount,
          req.body.postgresPassword,
          authMode,
        );
        break;
      case "setServiceReplicas":
        requireFields(req.body, ["serviceId", "environmentId"]);
        data = await setServiceReplicas(token, req.body.serviceId, req.body.environmentId, req.body.numReplicas, authMode);
        break;
      case "createRedis":
        requireFields(req.body, ["projectId"]);
        data = await createRedisService(token, req.body.projectId, req.body.environmentId, req.body.redisName, authMode);
        break;
      case "upsertVariables":
        requireFields(req.body, ["projectId", "variables"]);
        data = await upsertVariables(token, req.body.projectId, req.body.environmentId, req.body.serviceId, req.body.variables, authMode);
        break;
      case "getVariables":
        requireFields(req.body, ["projectId", "environmentId", "serviceId"]);
        data = { variables: await getVariables(token, req.body.projectId, req.body.environmentId, req.body.serviceId, authMode) };
        break;
      case "ensureTcpProxy":
        requireFields(req.body, ["environmentId", "serviceId"]);
        data = await ensureTcpProxy(token, req.body.environmentId, req.body.serviceId, req.body.applicationPort || 5432, authMode);
        break;
      case "testDatabase":
        requireFields(req.body, ["databaseUrl"]);
        data = await testDatabase(req.body.databaseUrl);
        break;
      case "applySchema":
        requireFields(req.body, ["databaseUrl", "schemaName", "systemCode"]);
        data = await applySchema(req.body.databaseUrl, req.body.schemaName, req.body.systemCode, req.body.brandName);
        break;
      case "scaffoldRepository":
        requireFields(req.body, ["githubToken", "githubRepo"]);
        data = await scaffoldRepository({
          token: req.body.githubToken,
          repoFullName: req.body.githubRepo,
          branch: req.body.githubBranch,
          siteUrl: req.body.siteUrl,
        });
        break;
      case "ensureServiceDomain":
        requireFields(req.body, ["projectId", "environmentId", "serviceId"]);
        data = await ensureServiceDomain(token, req.body.projectId, req.body.environmentId, req.body.serviceId, authMode);
        break;
      case "deploymentStatus":
        requireFields(req.body, ["deploymentId"]);
        data = { deployment: await getDeploymentStatus(token, req.body.deploymentId, authMode) };
        break;
      case "deploymentLogs":
        requireFields(req.body, ["deploymentId"]);
        data = { logs: await getDeploymentLogs(token, req.body.deploymentId, req.body.limit || 120, authMode) };
        break;
      case "buildLogs":
        requireFields(req.body, ["deploymentId"]);
        data = { logs: await getBuildLogs(token, req.body.deploymentId, req.body.limit || 120, authMode) };
        break;
      case "createNextService":
        requireFields(req.body, ["projectId", "service"]);
        data = await createNextService(token, req.body.projectId, req.body.environmentId, req.body.service, authMode);
        break;
      case "attachServiceSource":
        requireFields(req.body, ["serviceId", "environmentId", "githubRepo"]);
        data = await attachServiceSource(token, req.body.serviceId, req.body.environmentId, req.body.githubRepo, req.body.githubBranch, authMode);
        break;
      case "activeDeployment":
        requireFields(req.body, ["projectId", "serviceId", "environmentId"]);
        data = {
          deployment: await findActiveDeployment(token, req.body.projectId, req.body.serviceId, req.body.environmentId, authMode),
        };
        break;
      case "deployService":
        requireFields(req.body, ["serviceId"]);
        data = await deployService(token, req.body.serviceId, req.body.environmentId, authMode);
        break;
      case "verifyInstall":
        requireFields(req.body, ["url"]);
        data = await verifyInstall(req.body.url, Boolean(req.body.expectRedis));
        break;
      case "checkHealth":
        requireFields(req.body, ["url"]);
        data = await checkHealth(req.body.url);
        break;
      default:
        throw new Error("Unsupported action.");
    }

    return json(res, 200, { ok: true, action, data });
  } catch (error) {
    return json(res, 400, {
      ok: false,
      action: req.body?.action,
      error: error.message,
      token: req.body?.token ? redact(req.body.token) : undefined,
    });
  }
}
