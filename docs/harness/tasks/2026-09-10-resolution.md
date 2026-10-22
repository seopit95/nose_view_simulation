# 웹캠 전환 후 예시 이미지 잔상 수정

- 상태: completed
- 시작 / 갱신: 2026-09-10, Asia/Seoul
- 승인: 사용자가 제공한 화면의 예시/웹캠 혼합 표시 버그 수정 요청.
- 작업 루트: `/Users/kds_mac/PhpstormProjects/NoseView`, Git 없음. 기존 변경 파일과 해시는 `qa/resolution-2026-09-10/before` 및 `baseline.json`에 보존.

## 목표와 범위

웹캠으로 바꾸면 화면 전체가 현재 웹캠 프레임으로 표시돼야 한다. Viewport의 텍스처 수명, 해상도 전환 회귀 시험, 관련 규칙과 새 Mac 앱만 변경한다. 모델·변형식·권한·새 기능은 이번 범위 밖이다.

완료 조건: 정사각형 예시 → 16:9/4:3/세로 영상 → 예시 복귀와 동적 해상도 변경에서 이전 영상이 남지 않음. 원본/비교/가상 보기, 정지·PNG 미리보기에서 동일한 현재 영상. 새 패키지 검증 및 ZIP 무결성 확인.

## 조사와 설계

- 읽은 문서: [설계](../architecture.md), [품질](../quality.md), [개발 절차](../workflow.md), [배포](../privacy-release.md).
- 조사 대상: App 입력 전환 → Pipeline bitmap → Viewport present/clear/draw/capture, 기존 E2E와 lifecycle.
- 해당 계약: INV-01, INV-05, INV-06, INV-07, INV-09.
- 확인한 원인: CanvasTexture를 처음 업로드한 뒤 input 캔버스 크기만 바꾸어 GPU 저장 크기를 재사용했다. 작은 프레임은 일부만 갱신해 예시가 남았다. 설치된 Three.js의 texStorage2D/texSubImage2D 경로와 [공식 Texture 문서](https://threejs.org/docs/pages/Texture.html)의 크기 변경 시 dispose/새 인스턴스 계약을 확인했다.
- 기존 영상 검사는 모두 960×960 합성 입력으로 해상도 전환의 픽셀을 검증하지 않았다.
- 사용자 실제 사진은 fixture나 로그로 복사하지 않는다. 내장 합성 인물과 색상 표식으로 재현한다.

## 실행 순서

1. 실제 Electron/MediaPipe/셰이더를 거치는 다른 종횡비 입력으로 실패를 확인한다.
2. 해상도 변경과 clear에서 GPU 텍스처 수명을 바로잡는 최소 수정.
3. 회귀 → 전체 verify → 새 앱 시각 확인과 ZIP 검사.
4. 소유 문서에 해상도 전환/픽셀 검증 규칙과 결과를 남긴다.

## 재현과 검증

- 수정 전 `npm run build && node tests/lifecycle.mjs`: 종료 1. 960×960 예시 → 1280×720 합성 웹캠(실제 표시 960×540)에서 첨부 화면과 같은 가로 잘림을 재현했다. 현재 영상과 평균 채널 차이 33.056, 큰 차이가 있는 픽셀 43.21%. 기존 7개 회귀는 통과했다. `qa/resolution-2026-09-10/before-fix.json` 및 `before-fix.png`에 합성 입력 근거를 보존했다.
- 수정 후 해상도/픽셀 회귀 통과. 실제 카메라나 랜드마크 대체 없이 내장 합성 인물 → canvas MediaStream → 실제 MediaPipe → 실제 GPU 렌더를 사용했다. 사용자 촬영 자료는 저장하지 않았다.
- 최종 `npm run verify`: **종료 0**, macOS 15.5 arm64 / Node 22.12.0 / npm 10.9.0. 단위·문서·패키지 검사기 **27**, 기본 E2E **20**, 화면/상태 회귀 **8**, 가상 장치 권한 **3** 통과. 타입/Worker/renderer/패키지 빌드 통과, audit 조회 취약점 0.
- 새 회귀는 원본/가상/비교, 정지, PNG 원본/가상 양쪽, 16:9 → 4:3 → 세로 → 16:9, 같은 크기의 다음 영상, 해제 후 빈 화면, 예시 복귀의 픽셀을 확인한다. PNG의 재축소·색 변환은 평균 채널 차이 3 미만/채널 차이 20 초과 픽셀 1% 미만 기준이며 기존 허용치를 바꾸지 않았다.
- 새 패키지의 가로 화면을 직접 이미지로 확인했다. ZIP CRC, ZIP 속 app.asar와 검증한 앱 해시, 0.1.2 버전/카메라 설명/기존 .icns 일치를 확인했다.
- Vite 500kB chunk 및 선택적 .icon 형식 부재 경고는 그대로 남는다. 기존 .icns 아이콘은 번들에 있고 빌드 실패가 아니다.
- 실제 웹캠 촬영·실물 재연결·Windows·Intel Mac·장시간 시험은 이번 검증에 포함하지 않았다.

## 리뷰와 별도 발견

- 읽기 전용 코드 리뷰: source fix의 GPU 자원 해제/새 크기 할당/uniform 갱신에 Critical/Important 지적 없음. 같은 크기에서 영상 내용만 바뀌는 사례를 추가하라는 Minor 제안은 최종 회귀에 반영했다.
- 처음 수정 후에는 모든 새 영상/PNG 픽셀이 맞았으나 마지막 예시 복귀에서 `정면 얼굴 추적 중` 대기가 실패했다. 화면은 올바른 합성 인물인데 모델이 두 얼굴로 판정했다. 해상도 급변 뒤 VIDEO 추적 이력이 남는지 확인이 필요한 **별도 K-09**로 기록한다. 모델 원인은 아직 확정하지 않았다.
- 해당 복귀 검사는 현재 이미지의 실제 픽셀과 표시 크기를 기다리도록 분리했다. 얼굴 품질이 나쁘더라도 현재 원본 프레임이어야 한다는 렌더 계약을 검사하며, 모델 품질 성공으로 기록하지 않는다. 픽셀 판정은 완화하지 않았다. 모델 reset 프로토콜/의존성 변경은 이번 잔상 수정에 추가하지 않았다.
- 진단을 위해 lifecycle 실패에 stack과 합성 화면을 남기고, 일반 UI 동작 대기 시간을 10초로 제한했다. 모델 준비 대기는 기존 35초다.

## 인수인계

- 소스 변경: [Viewport.tsx](../../../src/components/Viewport.tsx)의 텍스처 수명. [lifecycle.mjs](../../../tests/lifecycle.mjs)의 회귀/진단. package/lock/README 버전 0.1.2 및 architecture/quality/status 갱신. 새 의존성 없음.
- 앱: `out/build-1788972254224/NoseView-darwin-arm64/NoseView.app`.
- [Mac 전달 ZIP](../../../outputs/NoseView-0.1.2-review/NoseView-0.1.2-Mac-AppleSilicon.zip), [검증 메타데이터](../../../outputs/NoseView-0.1.2-review/verification.json), [수정 후 합성 웹캠 화면](../../../outputs/NoseView-0.1.2-review/resolution-webcam.png).
- 소스 SHA-256: `6e2d70422342bdc963a2343528fecd7b5f17711182a618f3ebded3a09bb4751e`.
- app.asar SHA-256: `5111674a8fc2582bf16042b3d16f226e03cc0ca6f17dfb81638d20616675a1b7`.
- ZIP SHA-256: `686058e7cfefe78c1219e652f0e8c9921263d70acbeec198caaa9e559bd8f4d4`.
- 기존 실행 중인 0.1.1 앱/이전 전달본은 보존한다. 사용자는 기존 앱을 종료하고 새 0.1.2 경로의 앱을 실행해야 수정이 적용된다.
- 다음 한 단계: 사용자 웹캠으로 수정본에서 예시 → 웹캠 전환 확인. K-09의 모델 상태 문제는 별도 재현/수정 후보로 유지한다.
- 완료일: 2026-09-10, Asia/Seoul. 보고서 UTC 2026-09-09 16:44대는 한국 시각 2026-09-10 01:44대다.
