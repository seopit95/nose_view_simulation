# 상담 부위 명칭·동작 검토와 간편 UI

- 상태: completed
- 시작일 / 마지막 갱신일: 2026-10-17, Asia/Seoul
- 요청·승인: 실제 상담 기준의 이름·동작 검토 및 필요한 수정, 간편한 UX. 신규 서비스/환자 DB는 제외.
- 루트: `/Users/kds_mac/PhpstormProjects/NoseView`, Git 없음. 변경 전 `qa/backup-2026-10-17-consultation`에 소스·시험·소유 문서 보존.

## 목표와 범위

부위 이름과 방향이 실제 2D 변형을 설명하도록 맞추고, 기본 상담에서 선택할 항목을 줄인다.
Electron/React/MediaPipe/Three.js, 저장 schema3/기존8개 key/숫자, 카메라 연결/프레임 정합성/동의/오프라인 계약 유지.
수술법·mm·진단·수술 결과 예측·새3D 모델은 추가하지 않는다. 실제 얼굴 촬영 없이 합성 입력으로 검사.

## 확인한 맥락과 근거

- AGENTS, workflow/product/architecture/quality 및 App/SettingsDialog/adjustments/geometry/Viewport, 기존 회귀 확인.
- 기존 단위71개 통과. 기존 UI는 코8개/보정8개와 긴 설명을 동시 표시.
- 코끝 크기의 설명에 콧망울을 혼용. tip은 y뿐 아니라 측면x 돌출도 변경. nostrilExposure는 국소 영역 전체 상하 이동이며 노출량 계측 아님.
- projection은 상담 정면에서 항상0효과지만 이를 알려주는 전환 안내가 없음.
- [NIH 코 해부학 용어](https://elementsofmorphology.nih.gov/anatomy-nose.shtml): 코끝/콧날개/비주 구분. [MediaPipe 기준 mesh](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj)와 기존 실제 모델 합성 좌표를 참고. 임상 검증 근거가 아님.
- INV-01~10 보존. 특히 CPU/GPU 의미 일치,0효과·영역 밖·입술 보호, 동일 촬영 보정, 유효현재프레임만 사용.

## 설계와 실행 순서

1. `tests/region-controls.test.ts`: 좌우 측면 tip 상하 이동 시 x불변, 콧구멍 윗선 이동 시 아래 경계 고정의 실패를 먼저 확인.
2. `adjustments.ts`: 콧대 폭/콧볼 폭/코끝 크기/코끝 상하를 기본4개로, 콧날개 상하/콧구멍 윗선/비주 상하를 세부로, 옆모습 콧대를 별도 안내로 구분. 단위와 수술법을 혼동하지 않는 문구.
3. `geometry.ts`/`Viewport.tsx`: tip의 측면x 결합 제거. nostril 아래쪽 가중치를 연속 감쇠. 기준점·저장값은 유지. Jacobian/양방향/가림/측면/입술/GPU 대조 회귀.
4. `App.tsx`/CSS: 기본4개, native details로 세부4개와 촬영6개를 접음. 피부 강도·밝기는 바로 표시. 긴 도움말/진단 수치/고정 필터 수치는 접어서 필요할 때 표시. 비교/저장/연결은 즉시 접근. settings는 기존 그룹을 유지해 관리 화면과 상담 화면 책임 분리.
5. UI 회귀는 접힘 상태, 키보드 펼침, 편집 후 접기/재펼침의 값·픽셀 보존, 숨은 세부값 표시, 초기화/A·B·C/타입/필터/PNG 일치를 검증. 구체적인 기존 시험도 새 명칭과 펼침 조작으로 갱신.
6. 관련 실패→수정 확인 후 전체 `npm run verify`, ZIP/ASAR/버전 및 기본/최소 창 캡처 확인. 문서와 재발 방지 기준 갱신.

## 인수 조건

- [x] 8개 조절이 이름·방향·선택 영역·설정/PNG에 일관되게 표시된다.
- [x] 기본 코4개/보정2개, 세부는 키보드로 펼칠 수 있고 닫아도 값/효과가 유지된다.
- [x] 코끝 상하가 측면 돌출을 추가하지 않고 콧구멍 윗선은 아래쪽 경계를 보존한다.
- [x] 기존 저장 설정과 명시적 동의/추적 제한/실시간 필터 고정 계약이 유지된다.
- [x] 관련 회귀·타입/빌드·새 패키지 통합 검사 통과, 최소 창에서 직접 시각 확인.

## 재현과 검증

- 시작: `npm test` 71/71, 종료0. Node22.12.0/npm10.9.0, macOS arm64.
- 실패 확인: 기존 앱 기본8개 노출, tip 측면x 결합, 콧구멍 아래 경계 이동을 신규 회귀로 검출했다. 수정 후 단위73개와 관련 실제 모델/GPU 회귀 통과.
- 추가 검출/수정: 최소 창의 실제 내용 높이는782px인데 앱 최소높이가790px여서 넘쳤다. 고정 최소높이를 제거하고 숨긴 설명의 기준 위치를 부위 필드에 한정했다.
- 전체 검수1차: 새 패키지의 타입 편집기에서 역방향 키보드 이동 시 콧구멍 윗선 슬라이더 윗부분이 잘림(표시 비율.986). 설정창 상단 scroll-padding28px 추가 후 해당 회귀6그룹 통과. 허용 오차를 낮추지 않았다.
- 추가 UX 회귀: 최소 창에서 고정 필터값 목록을 펼치자 다시 재생 버튼이 미리보기 바깥으로 잘림(표시 비율.437). 필터 영상 영역이 가용 높이에 맞게 줄도록 수정. 새 상담UX3그룹/UI4그룹 통과.
- 256가지 혼합 끝값의 기존 간격.035 표본과 짧은 입술 간격 검사 통과. CPU/GPU 식·상수·축 일치 수동 리뷰 완료.
- 전체 검수2차: 단위73개/통합82항목 통과 후 npm audit에서 개발 도구의 brace-expansion5.0.9와 source-map-js1.2.1 취약점2건 검출. 영향 경로는 packager→asar→minimatch 및 Vite→PostCSS이며 두 라이브러리 모두 배포 앱에 직접 포함하지 않는다.
- [brace-expansion 공식 권고](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr)와 [source-map-js 공식 권고](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)의 수정 버전을 확인했다. `npm update brace-expansion source-map-js --ignore-scripts --no-audit --no-fund`로 각각5.0.12/1.2.2만 갱신. balanced-match4.0.4는 버전 변경 없이 hoist. 직접 의존성·모델 버전은 그대로이며 수정 후 audit0.
- 패키지 수동 검사에서 처음 WASM 경로를 vendor 바로 아래로 잘못 지정했다. 실제 prepare-assets와 ASAR의 vendor/wasm 경로를 확인하고 모델/WASM/고지/라이선스 바이트 일치 검사를 통과했다. 제품 파일 누락은 아니다.
- 최종 `npm run verify` 종료0: 단위73/통합82, 타입/빌드/Mac arm64 앱/ZIP, audit0. 최종13개 통합 보고서의 실행 경로·소스 해시·빌드 이후 실행 시각 일치. ZIP CRC·내부 ASAR·모델/WASM/고지/라이선스·버전/아이콘·시험용 자산 제외 통과.
- 최종 앱: `/Users/kds_mac/PhpstormProjects/NoseView/out/build-1792178791421/NoseView-darwin-arm64/NoseView.app`. 소스 SHA `6e11e656a81e23ab86d94b17d8c43ed78a3a5382ab4932daeaa280656066f4a6`.
- 기본/최소 창·세부 조절·설정 포커스·필터 설정 펼침·PNG8개 값 표시를 캡처로 확인. [검수 보고서](../../../outputs/NoseView-0.9.0-review/consultation-review.md), [검증 메타데이터](../../../outputs/NoseView-0.9.0-review/verification.json).
- 본인 수동 리뷰로 요구사항/상태/동의/기존 숫자·타입 보존/CPU와GPU/회귀/범위 일치를 확인했다. 별도 에이전트나 의료진의 독립 리뷰를 수행한 것은 아니다.
- 다음: 새 앱에서 사용자가 실물 웹캠으로 기본4개와 세부4개 부위/강도를 확인. 코드·자동 검수는 완료.
- 실제 환자/실물 웹캠/다른 OS/임상 적합성은 이번 자동 검수 범위 밖. 이전 USB 수신 장애는 별도 미해결 상태 유지.
