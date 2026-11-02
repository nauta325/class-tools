#!/usr/bin/env python3
# 선생님 2분 녹음 → 목소리 견본 15초 잘라내기
#
#   python3 목소리견본_자르기.py 녹음.wav
#   python3 목소리견본_자르기.py 녹음.wav --초 15 --몇개 3
#
# 왜 15초인가: 목소리를 복제하는 데 그 정도면 충분합니다. 길면 오히려
# 중간의 더듬은 곳·잡음까지 따라합니다.
#
# 무엇을 고르나: **조용하고 고르게 말한** 구간입니다.
#   · 소리가 너무 큰 곳(책상 치는 소리·웃음) · 너무 조용한 곳(쉬는 구간)을 뺍니다
#   · 말이 끊기지 않고 이어지는 곳을 좋아합니다
#   ※ 기계가 고른 것이니 **꼭 들어보세요.** 몇 개를 뽑아 주므로 그중 마음에 드는 걸 쓰세요.
#
# ★ 파이썬에 딸려 오는 것만 씁니다 — 깔 것이 없습니다 (wav 파일만 됩니다).
#   m4a·mp3 로 녹음하셨으면:  ffmpeg -i 녹음.m4a -ar 24000 -ac 1 녹음.wav

import sys, os, wave, array, math

def 읽기(path):
    with wave.open(path, "rb") as w:
        ch, width, sr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        if width != 2:
            raise SystemExit(
                f"16비트 wav 만 됩니다 (이 파일은 {width * 8}비트).\n"
                f"  ffmpeg -i {os.path.basename(path)} -ar 24000 -ac 1 -sample_fmt s16 녹음.wav"
            )
        raw = w.readframes(n)
    a = array.array("h")
    a.frombytes(raw)
    if ch > 1:                       # 모노로 (왼쪽만 쓰지 않고 평균)
        a = array.array("h", [int(sum(a[i:i + ch]) / ch) for i in range(0, len(a) - ch + 1, ch)])
    return a, sr

# 0.05초 칸마다 소리 크기(RMS) — 말하는 중인지 쉬는 중인지 보려고
def 크기(a, sr, 칸=0.05):
    k = max(1, int(sr * 칸))
    out = []
    for i in range(0, len(a) - k + 1, k):
        s = 0
        for v in a[i:i + k]:
            s += v * v
        out.append(math.sqrt(s / k))
    return out, k / sr

def 고르기(a, sr, 길이초=15.0, 몇개=3):
    rms, 칸초 = 크기(a, sr)
    if not rms:
        raise SystemExit("녹음이 너무 짧습니다.")
    칸수 = max(1, int(길이초 / 칸초))
    if 칸수 >= len(rms):
        raise SystemExit(f"녹음이 {길이초:.0f}초보다 짧습니다 ({len(rms) * 칸초:.0f}초).")

    고른것 = sorted(r for r in rms if r > 0)
    조용 = 고른것[int(len(고른것) * 0.2)] if 고른것 else 0      # 쉬는 구간 기준
    보통 = 고른것[int(len(고른것) * 0.6)] if 고른것 else 1      # 말하는 구간 기준
    너무큼 = 보통 * 3.2                                        # 책상 소리·웃음

    후보 = []
    for s in range(0, len(rms) - 칸수 + 1):
        창 = rms[s:s + 칸수]
        말한칸 = sum(1 for v in 창 if v > 조용)
        말한비율 = 말한칸 / 칸수
        if 말한비율 < 0.75:            # 쉬는 구간이 많으면 견본으로 안 좋습니다
            continue
        if max(창) > 너무큼:           # 튀는 소리가 있으면 뺍니다
            continue
        평균 = sum(창) / 칸수
        들쭉 = math.sqrt(sum((v - 평균) ** 2 for v in 창) / 칸수) / max(1.0, 평균)
        후보.append((들쭉 - 말한비율 * 0.5, s * 칸초))          # 고르게 + 꽉 찬 곳
    if not 후보:
        raise SystemExit("조용하고 고르게 말한 구간을 못 찾았습니다. 조금 더 길게, 조용한 곳에서 다시 녹음해 보세요.")
    후보.sort()
    # 서로 겹치는 구간은 하나만
    뽑기 = []
    for _, t in 후보:
        if all(abs(t - x) > 길이초 * 0.8 for x in 뽑기):
            뽑기.append(t)
        if len(뽑기) >= 몇개:
            break
    return 뽑기

def 쓰기(a, sr, 시작초, 길이초, path):
    i, j = int(시작초 * sr), int((시작초 + 길이초) * sr)
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(a[i:j].tobytes())

def main(argv):
    if len(argv) < 2:
        print(__doc__ or "", end="")
        raise SystemExit("쓰는 법: python3 목소리견본_자르기.py 녹음.wav [--초 15] [--몇개 3]")
    path = argv[1]
    길이 = float(argv[argv.index("--초") + 1]) if "--초" in argv else 15.0
    몇개 = int(argv[argv.index("--몇개") + 1]) if "--몇개" in argv else 3
    a, sr = 읽기(path)
    print(f"녹음 {len(a) / sr:.1f}초 · {sr}Hz")
    뽑기 = 고르기(a, sr, 길이, 몇개)
    바탕 = os.path.splitext(path)[0]
    for k, t in enumerate(뽑기, 1):
        out = f"{바탕}_견본{k}.wav"
        쓰기(a, sr, t, 길이, out)
        분, 초 = divmod(t, 60)
        print(f"  {k}) {int(분)}분 {초:.1f}초 ~ {길이:.0f}초  →  {out}")
    print("\n★ 셋 다 들어보고 **수업 말투가 제일 잘 나온 것**을 쓰세요.")
    print("  그게 그대로 강의 목소리가 됩니다.")

if __name__ == "__main__":
    main(sys.argv)
