# 말풍선 · 만화 번역기

만화·웹툰 페이지 이미지를 올리면 **말풍선을 찾아 원래 글자를 지우고, 한국어 번역을 그 자리에 넣어 주는** 웹앱입니다.
휴대폰에서 "홈 화면에 추가" 하면 앱처럼 쓸 수 있어요 (PWA).

주소: **https://yeonghoon51-max.github.io/manga/** (main 에 push 하면 자동 배포)

> 처음 한 번: 저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 바꿔 주세요.

## 쓰는 법
1. ⚙️ 설정에서 번역 엔진을 고르고 API 키를 넣습니다. 키는 이 브라우저에만 저장돼요.
   - **Gemini (무료)**: [Google AI Studio](https://aistudio.google.com/) → Get API key. 카드 없이 무료 한도 안에서 사용
   - **Claude (유료)**: [Claude 개발자 콘솔](https://platform.claude.com/) → API Keys. 쓴 만큼 요금
2. 페이지 이미지를 올리고(여러 장 가능, 끌어다 놓기·붙여 넣기 가능) **번역하기** / **전체 번역**.
3. 말풍선을 눌러 번역을 고치고, 상자를 끌어 옮기거나 오른쪽 아래 점으로 크기를 바꿉니다.
4. 못 찾은 글자는 **＋ 영역** 을 누르고 네모를 그리면 그 부분만 번역합니다.
5. **💾 저장** 으로 번역된 PNG 를 받습니다. (휴대폰은 공유 시트 → 사진에 저장)

단축키: `←/→` 페이지 이동 · `O` 원본 보기 · `Delete` 선택한 영역 지우기 · `Esc` 선택 해제

## 동작 원리

```
이미지 ──► Gemini 또는 Claude (이미지 1장 → JSON)     ──► 브라우저에서 그리기
           · 글자 영역 위치 (x0,y0,x1,y1)                  · 상자 가운데에서 flood fill 로 말풍선 흰 바탕 찾기
           · 원문 / 번역 / 종류(대사·해설·효과음)          · 그 안에 갇힌 구멍(=원래 글자)까지 바탕색으로 칠하기
           · 앞 페이지 대사·작품 메모로 말투 유지          · 줄마다 말풍선 실제 폭을 재서 타원 모양에 맞게 줄바꿈
```

- AI 가 주는 좌표는 대략적이라서, 실제 말풍선 모양은 `js/bubble.js` 가 픽셀을 보고 찾습니다.
  테두리 없는 글자(그림 위 해설·효과음)는 **상자로 덮기** 로 처리하고, 대사마다 방식을 바꿀 수 있어요.
- 답은 **구조화 출력(JSON 스키마)** 으로 받아서 모양이 항상 일정합니다.
- **Gemini**: SDK 없이 REST 로 부릅니다 (`v1beta/models/{모델}:generateContent`, `responseJsonSchema`).
  위치는 Gemini 가 익숙한 `box_2d = [ymin, xmin, ymax, xmax]` (0~1000) 로 받아 픽셀로 바꿉니다.
  기본 모델은 `gemini-flash-latest`, 설정의 **목록 불러오기** 로 그 키에서 쓸 수 있는 모델을 고를 수 있어요.
- **Claude**: 기본 모델은 Claude Opus 5.5 이고, 안전 분류기가 거절하면 서버에서 다른 모델로 자동 재시도(`fallbacks: "default"`)합니다.

## 파일 구조

```
manga/
├─ .github/workflows/pages.yml   GitHub Pages 자동 배포
├─ index.html              화면 뼈대
├─ css/style.css           디자인 (밝은/어두운 색은 맨 위 변수)
├─ js/
│  ├─ app.js               화면 동작: 페이지, 번역 버튼, 상자 끌기, 저장, 설정
│  ├─ translator.js        공통 프롬프트 + 엔진 고르기 + Claude 호출
│  ├─ gemini.js            Gemini 호출 (REST, 모델 목록, 오류 메시지)
│  ├─ bubble.js            말풍선 찾기(flood fill) · 글자 지우기 · 글자 맞춰 넣기
│  └─ vendor/anthropic-sdk.mjs   Anthropic 공식 SDK 1.0.0 을 브라우저용 파일 하나로 묶은 것
├─ manifest.webmanifest    앱 설치 정보
├─ sw.js                   오프라인용 서비스 워커 (파일 고치면 VERSION 올리기)
└─ icons/                  앱 아이콘
```

빌드 과정은 없습니다. 로컬에서는 이 폴더에서 `python3 -m http.server` 를 실행하고 `http://localhost:8000` 을 여세요
(ES 모듈이라 `index.html` 더블클릭으로는 안 열려요).

## 비용·보안·저작권
- **Gemini**: 무료 요금제 한도(분당·하루 요청 수) 안에서는 0원입니다. 한도는 모델·시기마다 달라서 AI Studio 에서 확인하세요.
  무료 요금제에서는 보낸 데이터가 Google 서비스 개선에 쓰일 수 있어요.
- **Claude**: 페이지 1장에 Opus 5.5 기준 대략 수십 원. 번역 후 화면 아래에 토큰 수와 대략적인 금액이 나옵니다.
- 서버가 없어서 API 키는 브라우저 → Google / Anthropic 으로만 갑니다. 그래도 남과 같이 쓰는 기기에서는 쓰고 나서 키를 지우세요.
- 본인이 가진 만화를 혼자 읽기 위한 도구입니다. 번역본을 허락 없이 올리거나 배포하면 저작권 침해가 될 수 있어요.

## 다음에 해 볼 만한 것
- 작업 저장(IndexedDB)으로 새로고침해도 번역 유지
- 세로쓰기 한국어 옵션, 말풍선별 글꼴
- 효과음을 그림에서 지우는 인페인팅
- 같은 내용을 Java(안드로이드) 앱으로: `bubble.js` 의 flood fill 은 `Bitmap.getPixels()` 배열로 거의 그대로 옮길 수 있어요
