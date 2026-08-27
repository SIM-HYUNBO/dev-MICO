/** @type {import('next').NextConfig} */
import { createRequire } from "module";
import { withBrunnerTemplate } from "brunner-template";

const require = createRequire(import.meta.url);
const pkg = require("./package.json");

const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
  reactStrictMode: false,
};

// sharedFileAliases 는 패키지의 공용 파일을 하나씩 alias 로 걸고, 같은 경로에
// 내용이 다른 로컬 파일이 있으면 그 파일만 제외한다. 그래서 바꾸고 싶은 것만
// 저장소에 두면 그것이 쓰이고 나머지는 패키지 구현이 그대로 쓰인다.
// 폴더 단위로 alias 를 걸면 로컬에 파일이 없어도 전부 가로채 빌드가 깨진다.
export default withBrunnerTemplate(nextConfig, { sharedFileAliases: true });
