import json, collections, sys, os
vocab = {v["code"] for v in json.load(open("vocab.json"))}
R = {r["uri"]: r for r in json.load(open("merged.json"))}
gold = {}
for i in range(5):
    for l in open(f"labels_{i}.jsonl"):
        g = json.loads(l); gold[g["id"]] = g["lang"]
def gnorm(g):
    g = {"yue": "zh"}.get(g, g)
    if g in ("none", "mixed"): return None
    return g if g in vocab else "OOV"
core = ["franc", "glotlid", "openlid2", "nllb218", "lid176"]
# sampling weights: disagreement docs were all taken (w=1); agreement docs were capped per language
agree_total = collections.Counter(r["franc"] for r in R.values() if len({r[c] for c in core}) == 1)
agree_in_gold = collections.Counter(R[u]["franc"] for u in gold if len({R[u][c] for c in core}) == 1)
def weight(u):
    r = R[u]
    if len({r[c] for c in core}) > 1: return 1.0
    return agree_total[r["franc"]] / agree_in_gold[r["franc"]]
preds = {m: {u: R[u][m] for u in gold} for m in core + ["xlmr"]}
probs = {}
for m in ["glotlid", "openlid2", "nllb218", "lid176", "xlmr"]:
    probs[m] = {json.loads(l)["uri"]: json.loads(l)["p"] for l in open(f"preds_{m}.jsonl")}
if os.path.exists("preds_jev.jsonl"):
    j = {json.loads(l)["uri"]: json.loads(l) for l in open("preds_jev.jsonl")}
    preds["jev"] = {u: j[u]["pred"] for u in gold if u in j}
    probs["jev"] = {u: j[u]["p"] for u in j}
TH = float(sys.argv[1]) if len(sys.argv) > 1 else 0.5
def outcome(m, u):
    g = gnorm(gold[u]); p = preds[m].get(u, "MISSING")
    if m != "franc":
        if R[u]["prose"] < 120: p = None                       # same eligibility gate as prod
        elif p not in (None, "other") and probs[m].get(u, 1) < TH: p = None
    if p == "other": p = None
    if g == "OOV": return "oov_ok" if p is None else "oov_tagged"
    if p is None: return "declined"
    return "correct" if p == g else "wrong"
rows = []
for m in preds:
    us = [u for u in gold if gnorm(gold[u]) is not None and u in preds[m]]
    for weighted in (False, True):
        c = collections.Counter()
        for u in us: c[outcome(m, u)] += weight(u) if weighted else 1
        inv = c["correct"] + c["wrong"] + c["declined"]; oov = c["oov_ok"] + c["oov_tagged"]
        rows.append((m, "corpus" if weighted else "gold", len(us), 100*c["correct"]/inv, 100*c["wrong"]/inv, 100*c["declined"]/inv,
                     100*c["oov_tagged"]/oov if oov else 0, 100*(c["wrong"]+c["oov_tagged"])/(inv+oov)))
print(f"threshold p>={TH}\n{'model':9} {'set':6} {'n':>5} {'acc%':>6} {'wrong%':>7} {'decl%':>6} {'oov-tagged%':>11} {'bad-tag%':>8}")
for r in rows: print(f"{r[0]:9} {r[1]:6} {r[2]:5} {r[3]:6.1f} {r[4]:7.1f} {r[5]:6.1f} {r[6]:11.1f} {r[7]:8.1f}")
if "--conf" in sys.argv:
    for m in preds:
        conf = collections.Counter()
        for u in gold:
            g = gnorm(gold[u]); o = outcome(m, u)
            if o in ("wrong", "oov_tagged"): conf[(gold[u], preds[m][u])] += 1
        print(m, conf.most_common(12))
