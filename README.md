# dev-MICO

brunner-template 1.18.5 기반 서비스입니다. 설치 마법사가 초기 구조를 만들었습니다.

## 시작하기

1. 저장소를 clone 한 뒤 `npm install`
2. `.env.example` 을 `.env` 로 복사하고 `DATABASE_URL`, `DB_SCHEMA`, `SYSTEM_CODE` 를 채웁니다
3. `npm run dev`

## 구조

- `pages/` — 화면과 API. Next 는 앱 루트의 pages 만 라우팅하므로 저장소가 직접 갖습니다
- `public/`, `styles/` — 정적 자산과 스타일
- `vendor/` — brunner-template 패키지 tarball

서버, 공용 모듈(`lib`), DB 스크립트(`scripts`)는 저장소에 없습니다. 패키지 안의 것을
그대로 실행하므로, 템플릿을 올리면 그 변경이 바로 반영됩니다.

## 공용 모듈이나 화면을 바꾸려면

패키지 안의 파일을 고치지 말고, 같은 경로로 로컬에 파일을 만드세요.
`next.config.js` 가 로컬을 먼저 보므로 그 파일이 대신 쓰입니다.

## 템플릿 갱신

새 버전 tarball 을 `vendor/` 에 넣고 `package.json` 의 `brunner-template` 경로를 바꾼 뒤 `npm install` 합니다.
