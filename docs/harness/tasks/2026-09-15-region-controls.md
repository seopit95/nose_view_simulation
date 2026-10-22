# 부위별 코 조절 구현 계획

> 실행: 테스트 우선 개발과 소유 파일을 분리한 병렬 작업으로 단계별 구현한다. 빌드/Electron 검사는 주 작업자가 순차 실행한다.

상태: completed. 완료일: 2026-09-16. 시작일: 2026-09-15. 사용자 승인: 사진을 설명한 설계대로 수정하고 확실히 검수. 작업 루트: `/Users/kds_mac/PhpstormProjects/NoseView`, Git 없음. 백업: `qa/region-controls-2026-09-15/before`.

## 승인된 설계와 계약

사진6영역을 독립적인 외형 조절로 제공하고 기존 코끝 위치와 측면 콧대 라인을 유지/분리한다. 비공 내리기는 앞서 제시한 콧구멍 윗테두리를 내려 노출을 줄이는 의미로 진행한다. 실제 절골/수술 결과/3D 표면 복원이나 mm 계측으로 설명하지 않는다. 예시 기능은 재도입하지 않는다.

Electron/React/TypeScript/MediaPipe/Three.js와 오프라인·명시적 카메라 연결·동일 프레임·촬영 보정·상담 PNG 동의 계약(INV-01~10)을 유지한다. 물리 웹캠은 자동 검사에 사용하지 않는다. 합성 인물의 실제 모델 경계 관찰과 알려진 좌표 GPU 검사를 구분한다.

`Adjustments`는 `width, bridge, projection, tip, tipSize, alarLift, nostrilExposure, columella`의8개 숫자(-100~100)다. 이름은 콧볼 폭/콧대 폭/측면 콧대 라인/코끝 위치/코끝 크기/콧날개 높이/콧구멍 노출/비주 위치. projection 양수는 바깥, tip/alarLift/columella 양수는 위, tipSize 양수는 크게, nostrilExposure 양수는 윗테두리를 올려 노출 많게다. 새 세부값0은 무변형. 기존3개 저장값은 유지하며 기존 측면 콧대 효과를 `projection = -bridge`로 이전한다.

사진의 비공/콧날개는 경계 일부를 공유한다. 영역을 국소 기준점으로 구분하고 겹친 변위 총량/기울기를 제한한다. 모델 좌표의 유효성·순서·영역 크기·가시성을 검사하며 숨은 영역의 가짜 좌표나 이전 프레임을 적용하지 않는다. 정밀 경계가 충분하지 않다면 실패를 숨기지 않고 지원 범위와 추가 추적 필요를 기록한다.

## 1. 공통 조절 계약과 부위 기하

소유 파일: 주 작업자 `src/core/adjustments.ts`(신규), `src/core/geometry.ts`, `tests/geometry.test.ts`, `tests/profile-filter.test.ts`, `tests/region-controls.test.ts`(신규).

- [x] 실제 MediaPipe의 합성 얼굴 좌표를 관찰하고 콧날개/비공/비주 기준점을 이미지와 대조한다.
- [x] 변경 전 실패: 새 항목이 clamp/보존되지 않음, 세부 위치에 효과 없음. `expect(sanitizeAdjustments({ ...ZERO, columella: 200 }).columella).toBe(100)` 및 방향/영역별 변위 검사.
- [x] 공통 `NOSE_CONTROLS`에 key/label/hint/low/high/group를 정의하고 `ZERO`, `sanitizeAdjustments(Partial<Adjustments>)`를 제공한다. geometry는 호환 import/export를 제공한다.
- [x] 현재 랜드마크에서 부위 기준점/가시성을 구하고 국소 변위를 계산한다. 각 효과가0/밖에서 항등, 다른 영역 보호, 좌우 방향/거울/측면 유지, 비정상 좌표 차단을 검사한다.
- [x] `npm test -- tests/geometry.test.ts tests/profile-filter.test.ts tests/region-controls.test.ts`.

## 2. 화면·저장 계약 확장

소유 파일: UI/설정 담당 `src/App.tsx`, `src/components/SettingsDialog.tsx`, `src/core/preferences.ts`, `src/styles.css`, `tests/preferences.test.ts`, `tests/nose-presets.test.ts`와 기존 Electron 시험의 라벨/데이터 이전. 주 작업자의 Viewport/geometry/새 시험/패키지/문서는 수정하지 않는다.

- [x] v1/v2 명시적 입력의 숫자·ID·이름·기본 대상·자동 여부를 보존하고 새 항목0/측면값 이전 검사를 RED로 확인한다. 새 v3 전체8필드를 검증하며 누락/타입/비유한 숫자·미지 버전은 복구 안내한다. 저장 키는 유지, 명시적 저장 전 디스크를 바꾸지 않는다.
- [x] UI는 NOSE_CONTROLS를 공통 사용하고4그룹, 선택 부위 가이드, 개별0 초기화를 제공한다. Viewport로 `selectedControl?: keyof Adjustments` 전달. 초기화/새 상담/저장 복원/필터 잠금/A·B·C는8개 모두 처리한다.
- [x] 기존 테스트는 변경된 표시명과 v3 저장 계약으로 이전하되 픽셀/동의/실제 모델/재실행 검증은 보존한다. 자동 테스트 fixture의 v1/v2 입력은 새 기본값을 섞지 않는다.
- [x] 단위/타입검사. Electron은 주 작업자의 새 빌드 후 순차 검증한다.

## 3. 실제 GPU와 가이드/PNG

소유 파일: 주 작업자 `src/components/Viewport.tsx`, `tests/region-controls.mjs`(신규), `tests/profile-filter.mjs`.

- [x] 실제 모델/합성 입력에서 새6영역과 기존 효과의 슬라이더별 픽셀 차이를 먼저 확인하고 효과0인 RED를 남긴다.
- [x] CPU/GPU에 같은 지역 변형과8개 수치를 사용한다. 현재 프레임/거울/코 축·가시성/부위 무효화를 반영하고 피부 좌표를 분리한다.
- [x] 선택 부위만 가이드, PNG의8개 설정은 줄바꿈해 잘리지 않게 표시. PNG 캡처의0변형/양쪽 보정 동등성과 동의 유지.
- [x] 각 조절 양방향, 복합 끝값, 영역 밖/입술 보호,0값, 저장/재시작/타입 선택/필터 잠금/측면/추적 이탈·복귀를 검사한다. 회전된2D 이미지를 실제 yaw 시험으로 기록하지 않는다.

## 4. 전달 검수

- [x] 요청 사항과 실제 diff 리뷰, 발견한 결함은 회귀 RED→수정→재검토.
- [x] 버전0.8.0/문서/공식 wrapper 갱신 후 `npm run verify`. 테스트 종료 전 병렬 소스 편집 금지.
- [x] 새 앱/ZIP CRC·ASAR·버전·아이콘·자원/예시 제외 확인. 기본/최소 창/선택 가이드/PNG 시각 검수.
- [x] outputs 검수 보고서·메타데이터에 실제 모델/합성 좌표 시험의 범위, 실물 미검증을 명시한다. 상태 문서와 부위 조절/저장 재발 방지 규칙 갱신.

예상 후속: 사용자 웹캠에서 노출/비주 위치의 미관과 인식 경계를 확인한다. 승인 범위 내 기능을 자동 검수한 새 앱까지 완성하고 실물 검증을 대신했다고 말하지 않는다.


## 실행 결과와 리뷰 수정

- 실제 모델의 시험용 합성 인물 좌표를 관찰해 기준점을 선정했다. 부위7개 단위 초기 RED(5실패), UI/저장 RED(9실패), 구버전 앱에서 새 슬라이더 부재 GPU RED를 확인했다.
- 구현 후 기본 자동 검수는 통과했으나 읽기 전용 리뷰에서 세 결함을 추가 발견했다. 새 회귀3개를 먼저 실패시켜 중간각도 부위 소실, 붕괴한 앵커, 짧은 입술 간격의 접힘을 재현했다.
- visible-side 최소간격 검사와 hidden-side 연속 감쇠를 추가했다. 입술 감쇠 전이폭.12→.32 수정만으로 혼합 부호의 여유가 부족해 회귀 조합을 보강한 후.40으로 확정했다. 최종 CPU/GPU 식 일치,7,201각도 표본 누락0,256혼합/짧은 간격 정밀 표본 최소Jacobian .11006>.05를 재검토했다.
- 최종 `npm run verify` 종료0: 단위71, 통합75. 실제 모델/합성 정면 부위 GPU와 알려진 측면 좌표 GPU 검사는 별개로 기록했다. 타입/빌드/Mac arm64 앱/ZIP/audit0 통과.
- ZIP CRC/내부ASAR/버전/.icns/로컬 모델/WASM/시험용 자산 제외, 최소 창/설정 포커스/선택 가이드/PNG8값 시각 검수 완료.
- 현재 앱: `out/build-1789484637132/NoseView-darwin-arm64/NoseView.app`. 소스SHA: `f0e5a9500cd7bfdc17f2ecdf5db504389de18626359492c3546240a94fddd0da`.
- [검수 보고서](../../../outputs/NoseView-0.8.0-review/NoseView_0.8.0_검수결과.md), [기계 판독 근거](../../../outputs/NoseView-0.8.0-review/verification.json). 규칙은 architecture/quality/privacy-release, 상태와 사용법은 status/product/README에 갱신했다.
- 물리 웹캠의 개인별 경계 위치/자연스러움/완전 측면 추적, 장시간/다른OS는 미검증이다. 사용자 저장소나 이전 실행 앱을 강제 초기화하지 않았다.
