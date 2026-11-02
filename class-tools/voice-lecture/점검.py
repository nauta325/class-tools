#!/usr/bin/env python3
# 목소리 카드 강의 — 자체 점검 (깔 것 없이 돕니다)
#
#   python3 점검.py
#
# 무엇을 보나
#   ① 영어/한국어 조각 나누기
#   ② 대본 점검이 **일부러 망가뜨린 대본**을 잡아내나  ← 이게 제일 중요합니다
#   ③ 판서 줄이 「말하는 초」에 붙나 (플레이어가 먹는 파일 만들기)
#   ④ 목소리 견본 자르기 — 조용하고 고른 구간을 고르나
import sys, os, json, math, wave, array, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib
만들기 = importlib.import_module("목소리_만들기")
견본 = importlib.import_module("목소리견본_자르기")

틀림 = 0
def 본다(이름, 실제, 기대):
    global 틀림
    if 실제 == 기대:
        print(f"  ok  {이름}")
    else:
        틀림 += 1
        print(f"  ✗   {이름}\n       나온 것: {실제!r}\n       나와야: {기대!r}")

def 잡나(이름, 대본, 들어야할말):
    global 틀림
    탈 = 만들기.대본점검(대본)
    if any(들어야할말 in x for x in 탈):
        print(f"  ok  {이름}")
    else:
        틀림 += 1
        print(f"  ✗   {이름} — 「{들어야할말}」 이 안 나왔습니다. 나온 것: {탈}")

print("① 조각 나누기")
본다("한국어만", 만들기.조각나누기("자, 오늘은 현재완료예요."), [("ko", "자, 오늘은 현재완료예요.")])
본다("영어 섞임", 만들기.조각나누기("[[I have lost my key.]] 이건 달라요."),
     [("en", "I have lost my key."), ("ko", "이건 달라요.")])
본다("영어가 가운데", 만들기.조각나누기("앞말 [[yes]] 뒷말"),
     [("ko", "앞말"), ("en", "yes"), ("ko", "뒷말")])
본다("빈 조각은 버림", 만들기.조각나누기("  [[ok]]  "), [("en", "ok")])
본다("다듬기", 만들기.다듬기("I HAVE, lost!"), "ihavelost")

print("\n② 대본 점검 — 일부러 망가뜨려 봅니다")
좋은대본 = 만들기.대본읽기(os.path.join(HERE, "대본", "u01.json"))
본다("멀쩡한 대본은 통과", 만들기.대본점검(좋은대본), [])

def 흉내(바꾸기):
    d = json.loads(json.dumps(좋은대본))
    바꾸기(d)
    return d

# ★ 제일 흔한 실수 — say 줄을 지웠는데 screen 번호는 그대로
def 지우기(d):
    d["카드"][0]["say"] = d["카드"][0]["say"][:3]
잡나("screen 이 없는 say 줄을 가리킴", 흉내(지우기), "4 번을 가리킵니다")

잡나("[[ ]] 짝이 안 맞음",
     흉내(lambda d: d["카드"][0]["say"].__setitem__(2, "[[I have finished. 처럼요.")), "[[ ]] 짝")
잡나("말 대본에 {{ }} 를 씀",
     흉내(lambda d: d["카드"][0]["say"].__setitem__(0, "오늘은 {{현재완료}}예요.")), "화면(screen)** 에만")
잡나("판서에 [[ ]] 를 씀",
     흉내(lambda d: d["카드"][0]["screen"].__setitem__(0, [0, "[[have]] ＋ p.p."])), "말 대본(say)** 에만")
잡나("{{ }} 짝이 안 맞음",
     흉내(lambda d: d["카드"][0]["screen"].__setitem__(0, [0, "{{현재완료"])), "{{ }} 짝")
잡나("screen 첫 칸이 글자",
     흉내(lambda d: d["카드"][0]["screen"].__setitem__(0, ["0", "현재완료"])), "첫 칸은 숫자")
잡나("screen 모양이 아님",
     흉내(lambda d: d["카드"][0]["screen"].__setitem__(0, ["현재완료"])), "꼴이어야 합니다")
잡나("세 번째 칸이 box 가 아님",
     흉내(lambda d: d["카드"][0]["screen"].__setitem__(0, [0, "현재완료", "빨강"])), "'box' 만 됩니다")
잡나("빈 말줄", 흉내(lambda d: d["카드"][0]["say"].__setitem__(1, "   ")), "빈 줄")
잡나("제목 없음", 흉내(lambda d: d["카드"][0].update({"t": ""})), "제목(t)이 비었습니다")
잡나("판서 없음", 흉내(lambda d: d["카드"][0].update({"screen": []})), "screen(판서)이 비었습니다")
잡나("말 없음", 흉내(lambda d: d["카드"][0].update({"say": []})), "say(대본)가 비었습니다")
잡나("카드 없음", 흉내(lambda d: d.update({"카드": []})), "카드가 없습니다")

print("\n③ 판서 줄이 말하는 초에 붙나")
tmp = tempfile.mkdtemp()
만들기.자료폴더 = tmp
작은대본 = {"단원": "t01", "제목": "시험", "카드": [
    {"t": "첫 장", "say": ["가", "나", "다"],
     "screen": [[0, "처음"], [2, "{{끝}}", "box"]]},
    {"t": "둘째 장", "say": ["라"], "screen": [[0, "하나"]]},
]}
만들기.산출쓰기(작은대본, [{"dur": 9.0, "at": [0.0, 3.0, 6.5]}, None])
난것 = json.load(open(os.path.join(tmp, "t01.json"), encoding="utf-8"))
본다("첫 줄은 0초", 난것["카드"][0]["lines"][0]["at"], 0.0)
본다("세 번째 say 줄에 붙인 판서 → 6.5초", 난것["카드"][0]["lines"][1]["at"], 6.5)
본다("box 꾸밈 유지", 난것["카드"][0]["lines"][1]["c"], "box")
본다("소리 경로", 난것["카드"][0]["audio"], "lecture-audio/t01/c1.mp3")
본다("아직 안 만든 카드", (난것["카드"][1]["만듦"], 난것["카드"][1]["audio"]), (False, ""))
본다("안 만든 카드의 판서도 0초로 (안 깨지게)", 난것["카드"][1]["lines"][0]["at"], 0.0)
목록 = json.load(open(os.path.join(tmp, "목록.json"), encoding="utf-8"))
본다("목록엔 **만든 카드만** 셉니다", 목록, [{"단원": "t01", "제목": "시험", "카드수": 1}])

print("\n④ 목소리 견본 자르기")
# 가짜 녹음: 2초 조용 → 6초 고르게 말함 → 1초 「퍽」 → 6초 고르게 말함 … 가운데 들쭉날쭉
sr = 8000
a = array.array("h")
def 넣기(초, 크기, 흔들림=0.0):
    for i in range(int(sr * 초)):
        v = math.sin(i * 0.08) * 크기 * (1 + 흔들림 * math.sin(i * 0.0007))
        a.append(int(max(-32000, min(32000, v))))
넣기(2.0, 20)            # 쉬는 구간
넣기(16.0, 4000)         # ★ 여기가 제일 고릅니다 (2.0초 ~ 18.0초)
넣기(0.4, 30000)         # 책상 치는 소리
넣기(16.0, 4000, 0.9)    # 말은 하지만 들쭉날쭉
wav = os.path.join(tmp, "녹음.wav")
with wave.open(wav, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(a.tobytes())
읽은것, 읽은sr = 견본.읽기(wav)
본다("읽기", (len(읽은것) == len(a), 읽은sr), (True, sr))
뽑기 = 견본.고르기(읽은것, sr, 길이초=15.0, 몇개=3)
본다("제일 고른 구간을 첫 번째로", 2.0 <= 뽑기[0] <= 3.0, True)
본다("「퍽」 소리가 든 구간은 안 고름", all(not (17.6 <= t <= 18.4) for t in 뽑기), True)
견본.쓰기(읽은것, sr, 뽑기[0], 15.0, os.path.join(tmp, "견본.wav"))
with wave.open(os.path.join(tmp, "견본.wav")) as w:
    본다("잘라낸 길이 15초", round(w.getnframes() / w.getframerate(), 1), 15.0)
    본다("모노 16비트", (w.getnchannels(), w.getsampwidth()), (1, 2))

print()
if 틀림:
    print(f"❌ {틀림}군데 틀렸습니다.")
    sys.exit(1)
print("✅ 전부 통과")
