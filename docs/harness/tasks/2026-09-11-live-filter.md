# 설정 고정 실시간 필터 탭

- 상태: completed
- 시작: 2026-09-11, Asia/Seoul
- 요청: 상단 상담 시뮬레이션 옆 탭에서 선택한 코·피부·카메라 보정을 고정한 실시간 모습 확인.
- 기준: 0.3.0, Git 없음. 백업 `qa/live-filter-2026-09-11/before`. 루트 `/Users/kds_mac/PhpstormProjects/NoseView`.

## 설계와 범위

기존 App/Pipeline/Viewport를 재사용하는 한정된 기능 확장이다. 설계·계획·테스트 우선 개발 스킬을 적용해 현재 세션에서 순서대로 구현한다. 사용자 요청에 포함된 가역적 변경에 추가 승인 단계는 만들지 않는다.

- 상단 상담 시뮬레이션/실시간 필터 탭. 필터 진입 때 코3개·보정8개 숫자를 복사해 고정한다. 비교선/조절패널/원본누르기/PNG를 숨기고 큰 영상, 고정값 요약, 연결/정지/거울/보정변경만 제공한다. 탭 이동은 viewport·Worker·stream을 재생성하거나 정지 상태를 바꾸지 않는다.
- 필터에서 첫 웹캠 연결·장치 변경은 고정 숫자를 유지한다. 일반 상담의 입력 전환은 기존 기본값 복원을 유지한다. 연결 해제/새 상담/치명적 오류는 필터 고정값을 비우고 상담 화면으로 복귀한다. 설정 저장 schema는 바꾸지 않는다. 필터 탭 상태는 영속 저장하지 않는다.
- 기존 상담 판정은 yaw/pitch/roll20° 그대로 유지한다. 필터 판정은 현재 프레임에 한하여 yaw35°/pitch30°/roll50°까지, 나머지 얼굴 수·크기·잘림·기하 검증 동일. 각도가 yaw20~35/pitch20~30/roll30~50 구간에서는 smoothstep으로 코 조절량을 줄인다. 범위 밖/얼굴 없음·복수·잘림·잘못된 좌표에는 코 변형0. 톤은 유지하며 마지막 유효 좌표를 현재 영상에 쓰지 않는다. 숫자는 휴리스틱이며 실제 측면 재현/수술 예측이 아니다.
- Pipeline이 같은 bitmap에 대해 상담/필터 Quality를 함께 계산한다. Viewport는 마지막 표시 프레임의 두 Quality만 보관해 정지 중 탭 전환도 즉시 반영한다. 내보내기는 상담 모드와 엄격한 품질에서만 가능하다.
- 신규 의존성/모델/저장 데이터/실제 카메라 자동 촬영 없음. 실물 선호도·다른 OS·장시간은 별도.

## 실행과 인수 조건

- [x] RED: `tests/geometry.test.ts`에서 같은 회전 얼굴의 상담 거부/필터 허용과 각도 감쇠, 잘못된 입력 거부. `tests/live-filter.mjs`에서 탭/고정값/화면 동작 실패 확인.
- [x] `src/core/geometry.ts`: `evaluateFace(..., purpose = 'consultation')`, `liveFilterStrength(quality)` 추가. `src/tracking/pipeline.ts`는 `filterQuality`를 같은 결과에 포함.
- [x] `src/components/Viewport.tsx`: `liveFilter` prop, 현재 표시 결과의 Quality 선택·감쇠, 필터 내보내기 차단. 기존 GLSL 변형/톤 함수와 bitmap 소유권 유지.
- [x] `src/App.tsx`, CSS: 탭/고정 숫자/연결 유지/간소화 큰 화면, 정확한 현재 상태·설명, 키보드 전환. 재접속/취소/새 상담에서 고정값 누수 없음.
- [x] 실제 모델/GPU 합성 영상에서 움직이는 얼굴의 필터, 정지 중 왕복/픽셀, 넓은 회전/없음/복수/복구, 필터에서 연결/장치변경, 입력/정지/오류 정리, 최소 창 검수.
- [x] 버전0.4.0과 소유 문서 갱신. `npm run verify`, 코드 리뷰/발견 수정, ZIP 내용·해시·시각 QA, 전달 안내.

## 근거와 종료

- RED: 이전0.3.0 앱에서 실시간 필터 탭 없음으로 UI 실패, 기존 geometry에서 회전 필터 허용/강도함수2개 실패 확인. 첫 구현에서42단위와4통합그룹 통과.
- 경계 검사를7그룹으로 보강: 장치 변경/실패 재시도/취소와 늦은 stream/mute·unmute/해제/fatal을 추가해 통과. 코드 리뷰2건(보정 변경 후 포커스, 연결 중 탭 진입점)을 확인하고 포커스 실패를 재현한 뒤 수정했다.
- 최종 npm run verify 종료0: 단위42, E2E20, lifecycle8, beauty4, preferences7, live-filter7, 권한3, 타입/빌드/Mac arm64 패키지, audit0. 결과는 [검수 보고서](../../../outputs/NoseView-0.4.0-review/NoseView_0.4.0_검수결과.md)와 메타데이터에 보존.
- 같은 회전 합성 프레임의 필터 변화21663픽셀/좌우 외곽0, 상담 변형0·저장차단. 실제 모델 결과를 바꾸지 않았으며 실제 웹캠은 촬영하지 않았다.
- 최종 앱 out/build-1789055753405/NoseView-darwin-arm64/NoseView.app, source b9ff13302840c4d58253f76b327b9ccaf62fe506591d859afb028d5a6ffc85b1. ZIP CRC/내부 app.asar/버전/아이콘/로컬 모델·WASM 일치, 기본·회전·최소 창 시각 확인.
- architecture/product/quality/decisions/README/AGENTS에 모드별 품질과 입력 전환 예외·정지 전환 검사 규칙을 반영했다. 실제 다양한 얼굴/조명/좌우·상하 회전/빠른 움직임·장시간·다른OS 검증은 기존 후속항목이다.
