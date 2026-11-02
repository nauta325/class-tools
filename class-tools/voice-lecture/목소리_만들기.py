#!/usr/bin/env python3
# 대본 → **선생님 목소리** 카드 강의 (mp3 + 판서 타이밍)
#
#   python3 목소리_만들기.py --점검 대본/u01.json                 ← 깔 것 없이 대본만 먼저 봅니다
#   python3 목소리_만들기.py 대본/u01.json 견본.wav               ← 한 단원 전부
#   python3 목소리_만들기.py 대본/u01.json 견본.wav --카드 3,5    ← 그 카드만 다시
#
# 깔 것 (한 번만 — **클로드 코드에게 시키세요**)
#   python3 -m venv venv && venv/bin/pip install chatterbox-tts faster-whisper
#   그리고 ffmpeg (mac: brew install ffmpeg)
#   · Chatterbox Multilingual (Resemble AI, MIT) — 목소리 복제. **무료입니다.**
#   · faster-whisper (small) — 만든 소리를 **다시 받아 적어** 대본과 같은지 검사
#   · 모델을 huggingface.co 에서 처음 한 번 내려받습니다 (몇 분)
#
# 하는 일 (조각 하나마다)
#   만들기 → 받아 적어 대본과 비교 → 안 맞으면 다시 (최대 3번, 그중 제일 나은 것)
#   → 마지막 낱말이 끝나는 곳에서 자름 (뒤에 남는 잡음·영어 되풀이 제거)
#
# ★ 한 조각에 시간이 꽤 걸립니다 (그래픽카드 없는 컴퓨터면 한 카드에 수 분).
#   카드 하나가 끝날 때마다 바로 저장하니 **중간에 멈춰도 이어서** 하면 됩니다.
#
# 나오는 것
#   ../lecture-audio/<단원>/cK.mp3          (64kbps 모노 — 폰에서 가볍게)
#   ../lecture-data/<단원>.json             (카드 제목 · 판서 줄 · 줄마다 나타날 초)
#   ../lecture-data/목록.json               (단원 목록 — lecture.html 이 읽습니다)

import sys, os, re, json, time, difflib, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
앱 = os.path.normpath(os.path.join(HERE, ".."))
소리폴더 = os.path.join(앱, "lecture-audio")
자료폴더 = os.path.join(앱, "lecture-data")

# ── 대본 다루기 (여기까지는 깔 것이 없습니다 — 그래서 점검이 됩니다) ──

# 한 줄을 「한국어 / [[영어]]」 조각으로 나눕니다.
# 영어를 한국어 발음으로 읽으면 못 알아듣고, 한국어를 영어로 읽으면 더 이상합니다.
def 조각나누기(line):
    out = []
    for i, p in enumerate(re.split(r"\[\[(.+?)\]\]", str(line))):
        p = p.strip()
        if p:
            out.append(("en" if i % 2 else "ko", p))
    return out

# 비교용 — 글자만 남깁니다 (띄어쓰기·기호·대소문자 무시)
다듬기 = lambda s: re.sub(r"[^0-9a-z가-힣]", "", str(s).lower())

def 대본읽기(path):
    d = json.load(open(path, encoding="utf-8"))
    단원 = str(d.get("단원") or os.path.splitext(os.path.basename(path))[0]).strip()
    카드 = d.get("카드") or []
    return {"단원": 단원, "제목": str(d.get("제목") or 단원).strip(), "카드": 카드}

# 대본이 멀쩡한가 — **만들기 전에** 봅니다.
# 한 번 돌리면 몇 십 분이 걸리는 일이라, 번호 하나 틀린 것 때문에 다시 돌리면 아깝습니다.
def 대본점검(대본):
    탈 = []
    if not 대본["카드"]:
        탈.append("카드가 없습니다.")
    for i, c in enumerate(대본["카드"], 1):
        say = c.get("say") or []
        screen = c.get("screen") or []
        앞 = f"카드 {i}"
        if not str(c.get("t") or "").strip():
            탈.append(f"{앞}: 제목(t)이 비었습니다.")
        if not say:
            탈.append(f"{앞}: say(대본)가 비었습니다.")
        for j, line in enumerate(say):
            s = str(line)
            if not s.strip():
                탈.append(f"{앞} say {j}: 빈 줄입니다.")
            if s.count("[[") != s.count("]]"):
                탈.append(f"{앞} say {j}: [[ ]] 짝이 안 맞습니다 — {s[:40]}")
            if re.search(r"\{\{", s):
                탈.append(f"{앞} say {j}: {{{{ }}}} 는 **화면(screen)** 에만 씁니다. 말 대본에는 쓰지 않아요 — {s[:40]}")
            if not 조각나누기(s):
                탈.append(f"{앞} say {j}: 읽을 글자가 없습니다.")
        if not screen:
            탈.append(f"{앞}: screen(판서)이 비었습니다.")
        for k, row in enumerate(screen):
            if not isinstance(row, (list, tuple)) or len(row) < 2:
                탈.append(f"{앞} screen {k}: [몇번째say, '글자'] 꼴이어야 합니다.")
                continue
            n, h = row[0], str(row[1])
            if not isinstance(n, int) or isinstance(n, bool):
                탈.append(f"{앞} screen {k}: 첫 칸은 숫자(몇 번째 say 줄)여야 합니다 — {n!r}")
            elif not (0 <= n < len(say)):
                탈.append(f"{앞} screen {k}: say 줄이 {len(say)}개인데 {n} 번을 가리킵니다 (0부터 셉니다).")
            if h.count("{{") != h.count("}}"):
                탈.append(f"{앞} screen {k}: {{{{ }}}} 짝이 안 맞습니다 — {h[:40]}")
            if "[[" in h:
                탈.append(f"{앞} screen {k}: [[ ]] 는 **말 대본(say)** 에만 씁니다 — {h[:40]}")
            if len(row) > 2 and str(row[2]) not in ("", "box"):
                탈.append(f"{앞} screen {k}: 세 번째 칸은 'box' 만 됩니다 — {row[2]!r}")
    return 탈

# 플레이어가 먹는 파일로 — 카드 하나가 끝날 때마다 바로 씁니다 (멈춰도 이어서)
def 산출쓰기(대본, 타이밍, 확장="mp3"):
    os.makedirs(자료폴더, exist_ok=True)
    단원 = 대본["단원"]
    카드 = []
    for i, c in enumerate(대본["카드"], 1):
        t = 타이밍[i - 1]
        줄 = []
        for row in (c.get("screen") or []):
            n, h = int(row[0]), str(row[1])
            꾸밈 = str(row[2]) if len(row) > 2 else ""
            at = (t["at"][n] if t and n < len(t["at"]) else 0.0)
            줄.append({"h": h, "at": at, "c": 꾸밈})
        카드.append({
            "t": str(c.get("t") or ""),
            "audio": f"lecture-audio/{단원}/c{i}.{확장}" if t else "",
            "dur": (t or {}).get("dur", 0),
            "lines": 줄,
            "만듦": bool(t),
        })
    json.dump({"단원": 단원, "제목": 대본["제목"], "카드": 카드},
              open(os.path.join(자료폴더, f"{단원}.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    목록갱신()

def 목록갱신():
    목록 = []
    for f in sorted(os.listdir(자료폴더)):
        if not f.endswith(".json") or f == "목록.json":
            continue
        try:
            d = json.load(open(os.path.join(자료폴더, f), encoding="utf-8"))
        except Exception:
            continue
        된것 = [c for c in d.get("카드", []) if c.get("만듦")]
        if not 된것:
            continue   # 아직 소리가 없는 단원은 학생에게 안 보입니다
        목록.append({"단원": d.get("단원"), "제목": d.get("제목"), "카드수": len(된것)})
    json.dump(목록, open(os.path.join(자료폴더, "목록.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

# ── 여기서부터 목소리 만들기 (무거운 것들은 이 안에서만 불러옵니다) ──

def 만들기(대본, 견본, 할카드=None):
    try:
        import torch, torchaudio
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        from faster_whisper import WhisperModel
    except ImportError as e:
        raise SystemExit(
            f"깔아야 할 것이 있습니다 ({e.name}).\n"
            "  python3 -m venv venv && venv/bin/pip install chatterbox-tts faster-whisper\n"
            "  그다음 venv/bin/python 목소리_만들기.py … 로 돌리세요.\n"
            "  ★ 막히면 클로드 코드에게 이 메시지를 그대로 보여주세요."
        )
    if not subprocess.run(["which", "ffmpeg"], capture_output=True).stdout.strip():
        raise SystemExit("ffmpeg 가 없습니다 (mp3 로 만드는 데 씁니다). mac: brew install ffmpeg")

    단원 = 대본["단원"]
    소리 = os.path.join(소리폴더, 단원)
    os.makedirs(소리, exist_ok=True)
    기록 = os.path.join(자료폴더, f"_{단원}_타이밍.json")
    타이밍 = (json.load(open(기록, encoding="utf-8")) if os.path.exists(기록) else [])
    타이밍 += [None] * (len(대본["카드"]) - len(타이밍))

    torch.set_num_threads(int(os.environ.get("VOICE_THREADS", 0)) or os.cpu_count() or 4)
    print("목소리 모델을 준비합니다 (처음에는 내려받느라 몇 분 걸립니다)…", flush=True)
    tts = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
    SR = tts.sr
    asr = WhisperModel("small", device="cpu", compute_type="int8")
    SEG = f"/tmp/_voice_seg{os.getpid()}.wav"
    CARD = f"/tmp/_voice_card{os.getpid()}.wav"

    # 조각 하나 — 만들고, 받아 적어 검사하고, 끝을 자릅니다
    def 조각하나(lang, txt):
        best = None
        for k in range(3):
            w = None
            for _ in range(4):   # Chatterbox 가 가끔 안에서 멈춥니다 → 다시
                try:
                    w = tts.generate(txt, language_id=lang, audio_prompt_path=견본)
                    break
                except Exception as ex:
                    print(f"    생성 오류: {ex}", flush=True)
            if w is None or w.shape[-1] < SR * 0.2:
                continue
            torchaudio.save(SEG, w, SR)
            words = [x for s in asr.transcribe(SEG, word_timestamps=True, language=lang)[0] for x in s.words]
            if lang == "en" and words:
                # 영어를 되풀이할 때가 있습니다 (Window, Window) → 대본 길이만큼에서 자릅니다
                for j in range(1, len(words) + 1):
                    if len(다듬기("".join(x.word for x in words[:j]))) >= len(다듬기(txt)) - 1:
                        words = words[:j]
                        break
            들린것 = "".join(x.word for x in words)
            닮음 = (difflib.SequenceMatcher(None, 다듬기(들린것), 다듬기(txt)).ratio() if lang == "en"
                    else 1 - abs(len(다듬기(들린것)) - len(다듬기(txt))) / max(1, len(다듬기(txt))))
            if words:
                a = max(0, words[0].start - 0.08)
                b = min(w.shape[-1] / SR, words[-1].end + 0.15)
                w = w[:, int(a * SR):int(b * SR)]
                m = int(0.04 * SR)
                if w.shape[-1] > m:
                    w[:, -m:] *= torch.linspace(1, 0, m)   # 끝을 살짝 줄여 「툭」 소리 없애기
            print(f"    {lang} {k + 1}번째 닮음={닮음:.2f} 들린것={들린것[:40]!r}", flush=True)
            if best is None or 닮음 > best[0]:
                best = (닮음, w)
            if 닮음 >= (0.75 if lang == "en" else 0.7):
                break
        if best is None:
            raise RuntimeError(f"조각을 못 만들었습니다: {txt}")
        return best

    for ci, card in enumerate(대본["카드"], 1):
        if 할카드 and ci not in 할카드:
            continue
        print(f"\n── 카드 {ci}/{len(대본['카드'])} · {card.get('t')}", flush=True)
        parts, t, at = [], 0.0, []
        for line in (card.get("say") or []):
            at.append(round(t, 2))                       # ★ 이 초에 판서 줄이 나타납니다
            for lang, txt in 조각나누기(line):
                t0 = time.time()
                닮음, w = 조각하나(lang, txt)
                print(f"  {txt[:36]!r} {닮음:.2f} ({round(time.time() - t0)}초)", flush=True)
                parts += [w, torch.zeros(1, int(SR * 0.12))]
                t += w.shape[-1] / SR + 0.12
            parts.append(torch.zeros(1, int(SR * 0.25)))  # 문장 사이 쉼
            t += 0.25
        torchaudio.save(CARD, torch.cat(parts, -1), SR)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", CARD,
                        "-ac", "1", "-b:a", "64k", os.path.join(소리, f"c{ci}.mp3")], check=True)
        타이밍[ci - 1] = {"dur": round(t, 2), "at": at}
        os.makedirs(자료폴더, exist_ok=True)
        json.dump(타이밍, open(기록, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        산출쓰기(대본, 타이밍)                            # 카드마다 바로 저장 (멈춰도 이어서)
        print(f"  ✅ 카드 {ci} — {t:.1f}초", flush=True)

    print(f"\n완성. lecture.html 에서 들어보세요 (단원 {단원}).")

def main(argv):
    점검만 = "--점검" in argv
    할카드 = None
    if "--카드" in argv:
        할카드 = [int(x) for x in argv[argv.index("--카드") + 1].split(",")]
    남은 = [a for a in argv[1:] if not a.startswith("--")]
    for k in ("--카드",):
        if k in argv:
            남은 = [a for a in 남은 if a != argv[argv.index(k) + 1]]
    if not 남은:
        raise SystemExit("쓰는 법: python3 목소리_만들기.py [--점검] 대본/u01.json [견본.wav] [--카드 3,5]")

    대본 = 대본읽기(남은[0])
    탈 = 대본점검(대본)
    if 탈:
        print(f"❌ 대본에 고칠 데가 {len(탈)}군데 있습니다:\n")
        for x in 탈:
            print("  ·", x)
        print("\n(만들기 전에 잡는 게 낫습니다 — 한 번 돌리면 오래 걸려서요)")
        raise SystemExit(1)
    카드수 = len(대본["카드"])
    말줄 = sum(len(c.get("say") or []) for c in 대본["카드"])
    조각 = sum(len(조각나누기(l)) for c in 대본["카드"] for l in (c.get("say") or []))
    print(f"✅ 대본 멀쩡합니다 — {대본['제목']} · 카드 {카드수}장 · 말 {말줄}줄 · 조각 {조각}개")
    if 점검만:
        return
    if len(남은) < 2:
        raise SystemExit("목소리 견본(.wav)도 주세요. 없으면 먼저: python3 목소리견본_자르기.py 녹음.wav")
    만들기(대본, 남은[1], 할카드)

if __name__ == "__main__":
    main(sys.argv)
