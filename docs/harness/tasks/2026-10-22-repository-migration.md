# Git 저장소 이전과 기능별 최초 등록

- 상태: blocked — GitHub 쓰기 인증 대기, 파일 이전과 로컬 커밋은 완료
- 시작일 / 마지막 갱신일: 2026-10-22, Asia/Seoul
- 승인: 사용자가 기존 NoseView 작업물의 이전, 기능별 커밋, GitHub 푸시와 새 폴더에서의 후속 작업을 명시적으로 요청했다.
- 원본: `/Users/kds_mac/PhpstormProjects/NoseView`, Git 이력 없음.
- 작업 루트: `/Users/kds_mac/PhpstormProjects/nose_view_simulation`, 빈 `main` 저장소.
- 원격: `https://github.com/seopit95/nose_view_simulation.git`.

## 목표와 범위

기존 0.9.0 구현·문서·테스트·로컬 산출물을 보존하며 새 저장소로 옮긴다. Git에는 재현에 필요한 소스·설정·모델·라이선스·합성 시험 자료만 등록한다. 제품 기능, 의존성 버전, 앱 설정 데이터는 변경하지 않는다. 실물 웹캠을 켜거나 환자 자료를 업로드하지 않는다.

완료 조건은 파일 보존 확인, 새 작업 경로의 명시, 새 경로에서 전체 검증, 기능별 커밋, `origin/main`과 로컬 HEAD 일치 및 깨끗한 작업 트리다.

## 확인한 맥락과 선택

AGENTS, workflow, quality, privacy-release, status, task-template와 빌드·패키지·문서 연결 검사기를 확인했다. 대상 저장소의 원격 refs는 비어 있었다. 원본은 약 14GB이며 대부분 과거 패키지·검수·설치 파일이다.

같은 파일시스템에서 최상위 항목25개를 rename으로 이동해 내용 복제나 삭제를 피했다. 이동 전후 35,778개 항목의 상대 경로·inode·크기·mode·mtime·심볼릭 링크 대상을 대조했다. 이전 경로에는 새 루트로 연결하는 심볼릭 링크를 남겨 과거 링크를 보존한다. 원본과 대상 소스 fingerprint는 모두 `6e11e656a81e23ab86d94b17d8c43ed78a3a5382ab4932daeaa280656066f4a6`다.

과거 보고서의 절대 경로와 날짜는 바꾸지 않는다. 현재 루트 안내와 Git 상태만 갱신하고 새 경로에서 앱을 다시 생성한다. 초기 커밋은 기존 완성본을 모듈별로 등록하는 이관 단위이며, 실제 과거 개발 순서를 의미하지 않는다. 독립 모듈의 단위 검증과 마지막 통합 상태의 전체 검증을 구분한다.

## 실행 순서

- [x] 원본·대상·원격과 기존 규칙 확인.
- [x] 전체 항목 이동, 이동 전후 목록과 소스 해시 대조, 이전 경로 연결 보존.
- [x] `.gitignore`에 outputs·IDE·환경 파일 제외를 보완하고 AGENTS·README·현재 상태·결정 문서의 활성 루트 갱신.
- [x] 추적 후보 파일·크기·민감정보 제외·상대 경로 참조 검토: 105파일/약30MB, 제외 디렉터리·심볼릭 링크·100MB 초과 파일·주요 인증정보 패턴 없음.
- [x] 새 루트에서 `npm run verify`를 순차 실행하고 현재 패키지/ZIP의 무결성 확인. 아래 audit 실패를 포함해 결과를 기록했으며 전체 통과를 뜻하지 않는다.
- [x] 아래 기능별 파일 경계로8개 커밋하고 staged diff와 포함 파일 확인. 서드파티 라이선스 원문을 제외한 staged diff whitespace 검사 통과.
- [ ] `git push -u origin main` 후 로컬/원격 HEAD 및 작업 트리 확인.

## 최초 커밋 경계

1. 빌드 기반: package/lock·TS/Vite/Vitest 설정, 오프라인 모델·아이콘·라이선스, 자산/패키지/무결성 스크립트와 해당 시험, 제외 규칙.
2. 코 윤곽: adjustments·geometry와 부위/측면/기하 단위 시험 및 합성 좌표 fixture.
3. 얼굴 추적: frame-gate·Worker·pipeline과 프레임 정합성/자원 수명 시험.
4. 촬영 보정: beauty·GPU Viewport와 피부/톤 시험.
5. 설정: preferences·SettingsDialog와 기본값/여러 코 타입 시험.
6. 데스크톱/내보내기: main/preload·타입·Icon·ExportDialog와 권한 검사.
7. 상담 UI: App·스타일·진입점과 비교/필터/연결/내보내기/최소 창 통합 시험 및 합성 카메라 도구.
8. 문서: README·AGENTS·분리 하네스·기획/과거 작업 기록·역사적 보조 스크립트와 문서 연결 시험.

## 재현과 검증

환경: macOS arm64, Node 22.12.0 / npm 10.9.0. Electron 검사는 독립 프로필과 합성 카메라를 사용한다. 기능 수정이 없는 이전 작업이므로 새 동작을 위한 실패 시험은 추가하지 않고 기존 회귀와 전체 패키지 검증을 재실행한다.

- 파일 이동 검증: 종료0, 전후 목록 일치와 소스 SHA 동일.
- 로컬 근거: `outputs/repository-migration-2026-10-22/migration-manifest.json`.
- 새 경로 `npm run verify`: 종료1. 단위73개/11파일·타입·빌드·새Mac arm64 패키지·통합82항목/13스크립트는 통과. 마지막 npm audit에서 moderate3/high1, 총4개 패키지가 보고되어 전체 검증은 실패다. `npm audit --json`도 종료1이며 원문은 로컬 audit.json에 보존했다.
- 패키지/ZIP 추가 검사: 종료0. 소스·ASAR·보고서13개의 경로/해시/시각 일치, ZIP CRC·ASAR 사본·모델 SHA·WASM·고지/라이선스·버전·시험용 자산 제외·아이콘 원본 일치 확인.
- 검수용 일회성 ZIP 검사에서 아이콘 이름을 app.icns로 가정해 최초 종료1. 실제 주 앱 Info.plist의 CFBundleIconFile은 electron.icns였다. 그 경로의 바이트와 원본 app-icon.icns 일치를 확인해 종료0. 제품 소스나 판정 기준은 바꾸지 않았다.
- 근거: [verification.json](../../../outputs/repository-migration-2026-10-22/verification.json), [verify.log](../../../outputs/repository-migration-2026-10-22/verify.log), [audit.json](../../../outputs/repository-migration-2026-10-22/audit.json). 이 파일들은 로컬 전용이다.
- `git push -u origin main`: 종료128, `could not read Username for 'https://github.com': Device not configured`. HTTPS credential helper는 osxkeychain이지만 사용 가능한 GitHub 자격 증명을 받지 못했다. gh 명령은 설치되어 있지 않다.
- SSH 대체 경로의 읽기 전용 인증 확인: `Permission denied (publickey)`, 종료255. 원격 URL이나 전역 인증 설정은 변경하지 않았다. PhpStorm UI에서도 이번 세션에 사용 가능한 인증을 확인하지 못했다.
- GitHub 푸시와 원격 SHA 일치는 미완료다. 사용자가 이 Mac에서 GitHub 쓰기 인증을 완료하면 동일 커밋을 일반 push한다. 강제 push, 새 계정·토큰·키 생성, 인증정보 추출은 수행하지 않았다.

## 리뷰와 인수인계

제품 동작·프레임 정합성·오프라인/개인정보·패키지 무결성 계약을 유지한다. `node_modules/dist/out/outputs/qa/public/vendor/.idea`는 로컬에 보존하고 Git에서 제외한다. 시험용 합성 사진·좌표는 tests에만 두며 앱/ZIP에 포함하지 않는다. 과거 project-scripts는 실행하지 않는다.

판정: 이번 요청의 파일·Git 이전과 제품의 보안 검증은 별개다. 최신 audit 결과를 숨기거나 제외해 verify를 통과시키지 않는다. 기존 작업물을 그대로 이관하기 위해 의존성을 바꾸지 않고 K-10에 후속 보완을 남긴다. 전체 품질 검증 또는 상용 배포 완료로 주장하지 않는다.

로컬 커밋: `6b7e8be` 빌드, `b603921` 코 윤곽, `7636aeb` 추적, `ecccd89` 촬영 보정, `84e9c93` 설정, `90c4745` 권한/PNG, `fb9b4cb` 상담 UI와 문서 이관 커밋. 전체 목록은 `git log --oneline --reverse`로 확인한다.

다음 한 단계: 인증이 준비되면 새 루트에서 `git push -u origin main` → `git ls-remote origin refs/heads/main`과 `git rev-parse HEAD` 일치 확인 → 상태를 완료로 갱신하고 문서 커밋도 푸시한다. 사용자 입력 대기: GitHub 쓰기 인증 완료. 실제 USB 첫 프레임 수신, 실물 측면/미관, Windows/Intel Mac, 장시간·상용 배포 검증은 이번 이전 범위 밖이며 기존 미확인 상태를 유지한다.
