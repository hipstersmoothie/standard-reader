"""Run the HF / fastText LID candidates over samples.jsonl -> preds_<name>.jsonl"""
import json, sys, time
import fasttext
fasttext.FastText.eprint = lambda *a, **k: None
S = sys.argv[1]
vocab = json.load(open(f"{S}/vocab.json"))
by3 = {d: v["code"] for v in vocab for d in v["detected"]}
by2 = {v["code"]: v["code"] for v in vocab}
# macrolanguage / individual-language aliases the models use
ALIAS = {"zho": "zh", "cmn": "zh", "yue": "zh", "ara": "ar", "arb": "ar", "ary": "ar", "arz": "ar", "apc": "ar", "acm": "ar", "ars": "ar",
         "fas": "fa", "pes": "fa", "prs": "fa", "msa": "ms", "zsm": "ms", "nor": "no", "nob": "no", "nno": "no", "lav": "lv", "lvs": "lv",
         "est": "et", "ekk": "et", "sqi": "sq", "als": "sq", "swa": "sw", "swh": "sw", "nep": "ne", "npi": "ne", "hbs": "sr", "srp": "sr",
         "fil": "tl", "tgl": "tl", "pan": "pa", "pnb": "pa", "uzb": "uz", "uzn": "uz", "mon": "mn", "khk": "mn", "yid": "yi", "ydd": "yi"}
def norm(label):
    lab = label.replace("__label__", "")
    base = lab.split("_")[0].split("-")[0]
    if len(base) == 2: return by2.get(base, "other")
    return ALIAS.get(base) or by3.get(base) or "other"
rows = [json.loads(l) for l in open(f"{S}/samples.jsonl")]
models = {"glotlid": f"{S}/models/cis-lmu__glotlid/model_v3.bin", "openlid2": f"{S}/models/laurievb__OpenLID-v2/model.bin",
          "nllb218": f"{S}/models/facebook__fasttext-language-identification/model.bin", "lid176": f"{S}/models/lid.176.bin"}
for name, path in models.items():
    m = fasttext.load_model(path); out = []; t = time.perf_counter()
    for r in rows:
        labels, probs = m.predict(r["sample"].replace("\n", " "), k=3)
        out.append({"uri": r["uri"], "pred": norm(labels[0]), "raw": labels[0].replace("__label__", ""), "p": float(probs[0]),
                    "top": [[l.replace("__label__", ""), float(p)] for l, p in zip(labels, probs)]})
    ms = (time.perf_counter() - t) * 1000 / len(rows)
    open(f"{S}/preds_{name}.jsonl", "w").write("\n".join(map(json.dumps, out)) + "\n")
    print(name, f"{ms:.2f} ms/doc")
if "xlmr" in sys.argv:
    from transformers import pipeline
    clf = pipeline("text-classification", model="papluca/xlm-roberta-base-language-detection", truncation=True, max_length=512)
    out = []; t = time.perf_counter()
    for i in range(0, len(rows), 32):
        batch = rows[i:i+32]
        for r, res in zip(batch, clf([r["sample"] for r in batch])):
            out.append({"uri": r["uri"], "pred": by2.get(res["label"], "other"), "raw": res["label"], "p": res["score"]})
    print("xlmr", f"{(time.perf_counter()-t)*1000/len(rows):.2f} ms/doc")
    open(f"{S}/preds_xlmr.jsonl", "w").write("\n".join(map(json.dumps, out)) + "\n")
